import cors from "cors";
import express, { Response } from "express";
import { randomBytes } from "node:crypto";
import { rateLimit } from "express-rate-limit";
import { pinoHttp } from "pino-http";
import type { Logger } from "pino";
import { z } from "zod";
import { StrKey, Horizon } from "@stellar/stellar-sdk";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { prisma } from "./db.js";
import { Prisma } from "@prisma/client";
import { logger } from "./logger.js";
import {
  generateChallenge,
  verifySignature,
  signJWT,
  requireAuth,
  isValidStellarAddress,
  type AuthContext,
} from "./auth.js";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { sendSupportReceivedEmail } from "./services/email.js";
import { sendVerificationEmail } from "./emails/verify-email.js";
import {
  getCachedLeaderboard,
  invalidateProfileLeaderboardCache,
  setCachedLeaderboard,
  type LeaderboardSort,
} from "./services/profile-leaderboard-cache.js";
import { createHmac } from "crypto";
import { sanitizeBody, sanitizeQuery } from "./middleware/sanitize.js";
import { CircuitBreaker } from "./services/circuit-breaker.js";

// Extend Express Request to include auth context
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 2_097_152;

const horizonUrl =
  process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";
const stellarServer = new Horizon.Server(horizonUrl);
const horizonCircuitBreaker = new CircuitBreaker(5, 30000); // 5 failures, 30s reset

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname));
    }
  },
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseClient =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

if (!supabaseClient) {
  logger.warn(
    "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set — avatar upload endpoint will return 503",
  );
}

function createRateLimiters() {
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many requests, please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
    },
  });

  const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: "Too many requests, please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
    },
  });

  // Stricter limiter for profile creation: 3 per hour per IP (#276)
  const profileCreationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 3,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip ?? "unknown",
    message: { error: "Too many profiles created from this IP address. Please try again in an hour.", code: "RATE_LIMIT_EXCEEDED" },
  });

  return { globalLimiter, writeLimiter, profileCreationLimiter };
}

function sendError(
  res: Response,
  status: number,
  message: string,
  code?: string,
) {
  return res.status(status).json({ error: message, ...(code ? { code } : {}) });
}

export function createApp(customLogger?: Logger) {
  const app = express();
  const { globalLimiter, writeLimiter, profileCreationLimiter } = createRateLimiters();

  const swaggerSpec = swaggerJsdoc({
    definition: {
      openapi: "3.0.0",
      info: {
        title: "NovaSupport API",
        version: "1.0.0",
        description:
          "Backend API for NovaSupport — Stellar-native creator support platform",
      },
      servers: [{ url: "http://localhost:4000" }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
        headers: {
          "RateLimit-Limit": {
            description: "Request limit for the current window.",
            schema: { type: "integer" },
          },
          "RateLimit-Remaining": {
            description: "Requests remaining in the current window.",
            schema: { type: "integer" },
          },
          "RateLimit-Reset": {
            description:
              "Unix timestamp (seconds) when the current rate limit window resets.",
            schema: { type: "integer" },
          },
        },
      },
    },
    apis: ["./src/app.ts"],
  });

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/docs.json", (req, res) => res.json(swaggerSpec));

  // In-memory challenge store (stateless with signed timestamp)
  const challenges = new Map<
    string,
    { challenge: string; timestamp: number }
  >();
  const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

  function cleanupExpiredChallenges() {
    const now = Date.now();
    for (const [key, value] of challenges.entries()) {
      if (now - value.timestamp > CHALLENGE_EXPIRY_MS) {
        challenges.delete(key);
      }
    }
  }

  // Cleanup expired challenges every minute
  setInterval(cleanupExpiredChallenges, 60000);

  const allowedOrigins = (
    process.env.ALLOWED_ORIGINS ?? "http://localhost:3000"
  )
    .split(",")
    .map((o) => o.trim());

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (curl, Postman, server-to-server)
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
    }),
  );
  app.use(express.json());
  app.use(sanitizeBody);
  app.use(sanitizeQuery);
  app.use(pinoHttp({ logger: customLogger ?? logger }));
  app.use(globalLimiter);

  /**
   * @openapi
   * /health:
   *   get:
   *     summary: Health check with database connectivity
   *     responses:
   *       200:
   *         description: Service is healthy
   *       503:
   *         description: Service is unhealthy or database is unreachable
   */
  // ── Health check with database connectivity ────────────────────────────

  app.get("/health", async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        ok: true,
        service: "NovaSupport backend",
        network: "Stellar Testnet",
        database: "connected",
      });
    } catch (e: unknown) {
      req.log.error({ err: e }, "health check database error");
      res.status(503).json({
        ok: false,
        service: "NovaSupport backend",
        database: "unreachable",
      });
    }
  });

  // ── Authentication ─────────────────────────────────────────────────────

  /**
   * @openapi
   * /auth/challenge:
   *   post:
   *     summary: Request a challenge nonce for wallet signature
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               walletAddress:
   *                 type: string
   *                 description: User's Stellar wallet address
   *                 example: GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI
   *             required:
   *               - walletAddress
   *           examples:
   *             validRequest:
   *               summary: Valid challenge request
   *               value:
   *                 walletAddress: GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI
   *     responses:
   *       200:
   *         description: Challenge generated
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 challenge:
   *                   type: string
   *                   example: "NovaSupport authentication challenge: 1234567890"
   *                 walletAddress:
   *                   type: string
   *                   example: GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI
   *       400:
   *         description: Invalid wallet address
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 error:
   *                   type: string
   *                   example: Invalid wallet address
   */
  // Request a challenge nonce for wallet signature
  app.post("/auth/challenge", (req, res) => {
    const { walletAddress } = req.body;

    if (!walletAddress || !isValidStellarAddress(walletAddress)) {
      return sendError(res, 400, "Invalid wallet address");
    }

    const challenge = generateChallenge(walletAddress);
    challenges.set(walletAddress, { challenge, timestamp: Date.now() });

    res.json({ challenge, walletAddress });
  });

  // Verify signature and return JWT
  const verifySchema = z.object({
    walletAddress: z.string(),
    signature: z.string(),
  });

  /**
   * @openapi
   * /auth/verify:
   *   post:
   *     summary: Verify signature and return JWT
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               walletAddress:
   *                 type: string
   *                 description: User's Stellar wallet address
   *               signature:
   *                 type: string
   *                 description: Signature of the challenge message
   *             required:
   *               - walletAddress
   *               - signature
   *     responses:
   *       200:
   *         description: Signature verified and JWT returned
   *       400:
   *         description: Invalid request or challenge expired
   *       401:
   *         description: Invalid signature
   */
  app.post("/auth/verify", async (req, res) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "Invalid request body");
    }

    const { walletAddress, signature } = parsed.data;

    if (!isValidStellarAddress(walletAddress)) {
      return sendError(res, 400, "Invalid wallet address");
    }

    const challengeData = challenges.get(walletAddress);
    if (!challengeData) {
      return sendError(res, 400, "No challenge found for this wallet");
    }

    // Check if challenge expired
    if (Date.now() - challengeData.timestamp > CHALLENGE_EXPIRY_MS) {
      challenges.delete(walletAddress);
      return sendError(res, 400, "Challenge expired");
    }

    // Verify the signature
    const isValid = verifySignature(
      walletAddress,
      challengeData.challenge,
      signature,
    );
    if (!isValid) {
      return sendError(res, 401, "Invalid signature");
    }

    // Clear the used challenge
    challenges.delete(walletAddress);

    // Create or get user
    let user = await prisma.user.findFirst({
      where: { email: walletAddress },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { email: walletAddress },
      });
    }

    // Sign JWT
    const token = signJWT(walletAddress, user.id);

    res.json({ token, walletAddress, userId: user.id });
  });

  // ── List profiles with pagination ──────────────────────────────────────

  /**
   * @openapi
   * /profiles:
   *   get:
   *     summary: List profiles with pagination
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *           example: 20
   *         description: Number of profiles to return
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *           example: 0
   *         description: Number of profiles to skip
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *           maxLength: 100
   *           example: john
   *         description: Optional search term for username or displayName (case-insensitive)
   *       - in: query
   *         name: sort
   *         schema:
   *           type: string
   *           enum: [newest, most_supported, most_transactions]
   *           default: newest
   *           example: newest
   *         description: Sort order for profiles
   *       - in: query
   *         name: asset
   *         schema:
   *           type: string
   *           example: XLM
   *         description: Filter by accepted asset code (e.g., XLM, USDC)
   *     responses:
   *       200:
   *         description: List of profiles
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 profiles:
   *                   type: array
   *                   items:
   *                     type: object
   *                 total:
   *                   type: integer
   *                   example: 42
   *                 limit:
   *                   type: integer
   *                   example: 20
   *                 offset:
   *                   type: integer
   *                   example: 0
   *       500:
   *         description: Internal server error
   */
  app.get("/profiles", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const offset = parseInt(req.query.offset as string) || 0;
      const rawSearch =
        typeof req.query.search === "string" ? req.query.search : "";
      const search = rawSearch.trim().slice(0, 100);
      const sort = (req.query.sort as string) || "newest";
      const asset = typeof req.query.asset === "string" ? req.query.asset : "";
      // #287: optional issuer filter so callers can distinguish e.g.
      // circle.com USDC from a different USDC issuer. Empty value means
      // "any issuer" and falls back to the existing behaviour.
      const assetIssuer =
        typeof req.query.assetIssuer === "string"
          ? req.query.assetIssuer.trim()
          : "";

      const where = search
        ? {
            OR: [
              { username: { contains: search, mode: "insensitive" as const } },
              {
                displayName: { contains: search, mode: "insensitive" as const },
              },
            ],
          }
        : {};

      let orderBy: object = { createdAt: "desc" };

      if (sort === "most_supported" || sort === "most_transactions") {
        // For sorting by support metrics, we'll fetch all and sort in memory
        // This is a simplified approach; for production, consider aggregation
        const profiles = await prisma.profile.findMany({
          where,
          include: {
            acceptedAssets: true,
            supportTransactions: {
              where: { status: "SUCCESS" },
              select: { amount: true, supporterAddress: true },
            },
          },
        });

        let sorted = profiles;
        if (sort === "most_supported") {
          sorted = profiles.sort((a: any, b: any) => {
            const aTotal = a.supportTransactions.reduce(
              (sum: number, tx: any) => sum + Number(tx.amount),
              0,
            );
            const bTotal = b.supportTransactions.reduce(
              (sum: number, tx: any) => sum + Number(tx.amount),
              0,
            );
            return bTotal - aTotal;
          });
        } else if (sort === "most_transactions") {
          sorted = profiles.sort(
            (a: any, b: any) =>
              b.supportTransactions.length - a.supportTransactions.length,
          );
        }

        const filtered = asset
          ? sorted.filter((p: any) =>
              p.acceptedAssets.some(
                (a: any) =>
                  a.code === asset &&
                  (assetIssuer === "" || a.issuer === assetIssuer),
              ),
            )
          : sorted;

        const paginated = filtered.slice(offset, offset + limit);
        const result = paginated.map((p: any) => {
          const { supportTransactions: _supportTransactions, ...profile } = p;
          return profile;
        });

        return res.json({
          profiles: result,
          total: filtered.length,
          limit,
          offset,
        });
      }

      // Default sorting by newest
      const [profiles, total] = await Promise.all([
        prisma.profile.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy,
          include: { acceptedAssets: true },
        }),
        prisma.profile.count({ where }),
      ]);

      const filtered = asset
        ? profiles.filter((p: any) =>
            p.acceptedAssets.some(
              (a: any) =>
                a.code === asset &&
                (assetIssuer === "" || a.issuer === assetIssuer),
            ),
          )
        : profiles;

      res.json({
        profiles: filtered,
        total: asset ? filtered.length : total,
        limit,
        offset,
      });
    } catch (e: unknown) {
      req.log.error({ err: e }, "database error listing profiles");
      return sendError(res, 500, "Internal server error");
    }
  });

  // ── Search profiles ────────────────────────────────────────────────────

  /**
   * @openapi
   * /profiles/search:
   *   get:
   *     summary: Search profiles by username or display name
   *     parameters:
   *       - in: query
   *         name: q
   *         required: true
   *         schema:
   *           type: string
   *         description: Search query (case-insensitive)
   *     responses:
   *       200:
   *         description: Search results (up to 10 profiles)
   *       400:
   *         description: Missing or empty query parameter
   *       500:
   *         description: Internal server error
   */
  app.get("/profiles/search", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    if (!q) {
      return sendError(
        res,
        400,
        "Query parameter 'q' is required and cannot be empty",
      );
    }

    try {
      const profiles = await prisma.profile.findMany({
        where: {
          OR: [
            { username: { contains: q, mode: "insensitive" } },
            { displayName: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 10,
        select: {
          username: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
        },
      });

      res.json(profiles);
    } catch (e: unknown) {
      req.log.error({ err: e }, "database error searching profiles");
      return sendError(res, 500, "Internal server error");
    }
  });

  // ── Get profile by username ────────────────────────────────────────────

  /**
   * @openapi
   * /profiles/{username}:
   *   get:
   *     summary: Get a profile by username
   *     parameters:
   *       - in: path
   *         name: username
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Profile found
   *       404:
   *         description: Profile not found
   *       500:
   *         description: Internal server error
   */
  app.get("/profiles/:username", async (req, res) => {
    try {
      const profile = await prisma.profile.findUnique({
        where: { username: req.params.username },
        include: {
          acceptedAssets: true,
        },
      });

      if (!profile) {
        return sendError(res, 404, "Profile not found");
      }

      res.json(profile);
    } catch (e: unknown) {
      req.log.error({ err: e }, "database error fetching profile");
      return sendError(res, 500, "Internal server error");
    }
  });

  app.get("/profiles/:username/stats", async (req, res) => {
    try {
      const profile = await prisma.profile.findUnique({
        where: { username: req.params.username },
        select: { id: true },
      });

      if (!profile) {
        return sendError(res, 404, "Profile not found");
      }

      const profileId = profile.id;
      const where = { profileId, status: { not: "failed" } };

      const [uniqueSupportersList, assetGroups, aggregates] = await Promise.all([
        prisma.supportTransaction.findMany({
          where: { ...where, supporterAddress: { not: null } },
          distinct: ["supporterAddress"],
          select: { supporterAddress: true },
        }),
        prisma.supportTransaction.groupBy({
          by: ["assetCode", "assetIssuer"],
          where,
          _sum: { amount: true },
          _count: true,
        }),
        prisma.supportTransaction.aggregate({
          where,
          _min: { createdAt: true },
          _max: { createdAt: true },
        }),
      ]);

      const totalTransactions = assetGroups.reduce((acc: number, g: any) => acc + g._count, 0);

      const totalByAsset = assetGroups.map((g: any) => ({
        assetCode: g.assetCode,
        assetIssuer: g.assetIssuer,
        total: g._sum.amount ? g._sum.amount.toFixed(7) : "0.0000000",
      }));

      res.json({
        totalTransactions,
        uniqueSupporters: uniqueSupportersList.length,
        totalByAsset,
        firstSupportedAt: aggregates._min.createdAt ? aggregates._min.createdAt.toISOString() : null,
        lastSupportedAt: aggregates._max.createdAt ? aggregates._max.createdAt.toISOString() : null,
      });
    } catch (e: unknown) {
      req.log.error({ err: e }, "database error fetching profile stats");
      return sendError(res, 500, "Internal server error");
    }
  });

  const stellarAddress = z
    .string()
    .refine((val) => StrKey.isValidEd25519PublicKey(val), {
      message: "Must be a valid Stellar public key",
    });

  const createProfileSchema = z.object({
    username: z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-z0-9-]+$/),
    displayName: z.string().min(1).max(64),
    bio: z.string().max(280).optional().default(""),
    walletAddress: stellarAddress,
    email: z.string().email().optional().nullable(),
    websiteUrl: z.string().url().startsWith("https://").optional().nullable(),
    twitterHandle: z
      .string()
      .max(15)
      .regex(/^[a-zA-Z0-9_]+$/)
      .optional()
      .nullable(),
    githubHandle: z
      .string()
      .max(39)
      .regex(/^[a-zA-Z0-9-]+$/)
      .optional()
      .nullable(),
    // ownerId removed - now derived from JWT
    acceptedAssets: z
      .array(
        z.object({
          code: z.string().min(1).max(12),
          issuer: z.string().optional(),
        }),
      )
      .min(1),
  });

  /**
   * @openapi
   * /profiles:
   *   post:
   *     summary: Create a new profile
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               username:
   *                 type: string
   *               displayName:
   *                 type: string
   *               bio:
   *                 type: string
   *               walletAddress:
   *                 type: string
   *               email:
   *                 type: string
   *                 format: email
   *               websiteUrl:
   *                 type: string
   *                 format: uri
   *               twitterHandle:
   *                 type: string
   *               githubHandle:
   *                 type: string
   *               acceptedAssets:
   *                 type: array
   *                 items:
   *                   type: object
   *                   properties:
   *                     code:
   *                       type: string
   *                     issuer:
   *                       type: string
   *                   required:
   *                     - code
   *             required:
   *               - username
   *               - displayName
   *               - walletAddress
   *               - acceptedAssets
   *     responses:
   *       201:
   *         description: Profile created
   *       400:
   *         description: Invalid request body or validation failed
   *       403:
   *         description: Wallet address does not match authenticated user
   *       409:
   *         description: Email or username already taken
   *       500:
   *         description: Internal server error
   */
  app.post("/profiles", requireAuth, profileCreationLimiter, writeLimiter, async (req, res) => {
    const parsed = createProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      req.log.warn({ issues: parsed.error.flatten() }, "validation failed");
      return sendError(res, 400, "Invalid request body");
    }

    const {
      username,
      displayName,
      bio,
      walletAddress,
      email,
      websiteUrl,
      twitterHandle,
      githubHandle,
      acceptedAssets,
    } = parsed.data;

    // Verify authenticated wallet matches the profile wallet address
    if (!req.auth || req.auth.walletAddress !== walletAddress) {
      return sendError(
        res,
        403,
        "Forbidden: Wallet address does not match authenticated user",
      );
    }

    try {
      const emailVerificationToken = email ? randomBytes(32).toString("hex") : undefined;
      const emailVerificationExpiry = email ? new Date(Date.now() + 24 * 60 * 60 * 1000) : undefined;

      const profile = await prisma.profile.create({
        data: {
          username,
          displayName,
          bio,
          walletAddress,
          email,
          emailVerified: false,
          emailVerificationToken,
          emailVerificationExpiry,
          websiteUrl,
          twitterHandle,
          githubHandle,
          ownerId: req.auth.userId || req.auth.walletAddress,
          acceptedAssets: { create: acceptedAssets },
        },
        include: { acceptedAssets: true },
      });

      if (email && emailVerificationToken) {
        sendVerificationEmail(email, username, emailVerificationToken).catch((err) =>
          req.log.warn({ err }, "Failed to send verification email"),
        );
      }

      req.log.info({ username: profile.username }, "profile created");
      return res.status(201).json(profile);
    } catch (e: unknown) {
      if (
        e &&
        typeof e === "object" &&
        "code" in e &&
        (e as { code: string }).code === "P2002"
      ) {
        const meta = (e as { meta?: { target?: string[] } }).meta;
        const field = meta?.target?.includes("email") ? "Email" : "Username";
        return sendError(
          res,
          409,
          `${field} already taken`,
          `${field.toUpperCase()}_TAKEN`,
        );
      }
      req.log.error({ err: e }, "database error creating profile");
      return sendError(res, 500, "Internal server error");
    }
  });

  // ── Update profile ────────────────────────────────────────────────────

  const updateProfileSchema = z.object({
    displayName: z.string().min(1).max(64).optional(),
    bio: z.string().max(280).optional(),
    avatarUrl: z.string().url().optional().nullable(),
    email: z.string().email().optional().nullable(),
    notifyOnSupport: z.boolean().optional(),
    websiteUrl: z.string().url().startsWith("https://").optional().nullable(),
    twitterHandle: z
      .string()
      .max(15)
      .regex(/^[a-zA-Z0-9_]+$/)
      .optional()
      .nullable(),
    githubHandle: z
      .string()
      .max(39)
      .regex(/^[a-zA-Z0-9-]+$/)
      .optional()
      .nullable(),
  });

  /**
   * @openapi
   * /profiles/{username}:
   *   patch:
   *     summary: Update profile
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: username
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               displayName:
   *                 type: string
   *               bio:
   *                 type: string
   *               avatarUrl:
   *                 type: string
   *                 format: uri
   *               email:
   *                 type: string
   *                 format: email
   *               websiteUrl:
   *                 type: string
   *                 format: uri
   *               twitterHandle:
   *                 type: string
   *               githubHandle:
   *                 type: string
   *     responses:
   *       200:
   *         description: Profile updated
   *       400:
   *         description: Invalid request body
   *       403:
   *         description: Authenticated user does not own this profile
   *       404:
   *         description: Profile not found
   *       409:
   *         description: Email already in use
   *       500:
   *         description: Internal server error
   */
  app.patch(
    "/profiles/:username",
    requireAuth,
    writeLimiter,
    async (req, res) => {
      const parsed = updateProfileSchema.safeParse(req.body);

      if (!parsed.success) {
        req.log.warn({ issues: parsed.error.flatten() }, "validation failed");
        return sendError(res, 400, "Invalid request body");
      }

      const username = req.params.username as string;
      const profile = await prisma.profile.findUnique({
        where: { username },
      });

      if (!profile) {
        return sendError(res, 404, "Profile not found");
      }

      // Verify authenticated wallet owns the profile
      if (!req.auth || req.auth.walletAddress !== profile.walletAddress) {
        return sendError(res, 403, "Forbidden: You do not own this profile");
      }

      try {
        const emailChanged =
          parsed.data.email !== undefined && parsed.data.email !== profile.email;
        const newEmail = parsed.data.email;
        const emailVerificationToken =
          emailChanged && newEmail ? randomBytes(32).toString("hex") : undefined;
        const emailVerificationExpiry =
          emailChanged && newEmail
            ? new Date(Date.now() + 24 * 60 * 60 * 1000)
            : undefined;

        const updated = await prisma.profile.update({
          where: { username },
          data: {
            ...parsed.data,
            ...(emailChanged
              ? {
                  emailVerified: false,
                  emailVerificationToken,
                  emailVerificationExpiry,
                }
              : {}),
          },
          include: { acceptedAssets: true },
        });

        if (emailChanged && newEmail && emailVerificationToken) {
          sendVerificationEmail(newEmail, username, emailVerificationToken).catch((err) =>
            req.log.warn({ err }, "Failed to send verification email on update"),
          );
        }

        return res.json(updated);
      } catch (e: unknown) {
        if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
          return sendError(res, 409, "Email already in use", "EMAIL_TAKEN");
        }
        req.log.error({ err: e }, "database error updating profile");
        return sendError(res, 500, "Internal server error");
      }
    },
  );

  // ── Email verification (#275) ─────────────────────────────────────────

  app.post("/profiles/:username/verify-email", async (req, res) => {
    const { token } = req.body as { token?: unknown };

    if (!token || typeof token !== "string") {
      return sendError(res, 400, "Verification token is required");
    }

    try {
      const profile = await prisma.profile.findFirst({
        where: { username: req.params.username, emailVerificationToken: token },
      });

      if (!profile) {
        return sendError(res, 404, "Invalid or expired verification token", "TOKEN_INVALID");
      }

      if (profile.emailVerificationExpiry && profile.emailVerificationExpiry < new Date()) {
        return sendError(res, 410, "Verification token has expired", "TOKEN_EXPIRED");
      }

      await prisma.profile.update({
        where: { id: profile.id },
        data: {
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpiry: null,
        },
      });

      return res.json({ ok: true, message: "Email verified successfully" });
    } catch (e: unknown) {
      req.log.error({ err: e }, "error during email verification");
      return sendError(res, 500, "Internal server error");
    }
  });

  // ── Update accepted assets ────────────────────────────────────────────

  const updateAssetsSchema = z.object({
    assets: z
      .array(
        z.object({
          code: z.string().regex(/^[A-Z]{1,12}$/),
          issuer: z.string().optional(),
        }),
      )
      .min(1),
  });

  /**
   * @openapi
   * /profiles/{username}/assets:
   *   patch:
   *     summary: Replace accepted assets for a profile
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: username
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               assets:
   *                 type: array
   *                 minItems: 1
   *                 items:
   *                   type: object
   *                   properties:
   *                     code:
   *                       type: string
   *                     issuer:
   *                       type: string
   *                   required:
   *                     - code
   *             required:
   *               - assets
   *     responses:
   *       200:
   *         description: Assets replaced, updated profile returned
   *       403:
   *         description: Authenticated user does not own this profile
   *       404:
   *         description: Profile not found
   *       422:
   *         description: Empty array or invalid asset code
   *       500:
   *         description: Internal server error
   */
  app.patch(
    "/profiles/:username/assets",
    requireAuth,
    writeLimiter,
    async (req, res) => {
      const parsed = updateAssetsSchema.safeParse(req.body);

      if (!parsed.success) {
        req.log.warn({ issues: parsed.error.flatten() }, "validation failed");
        return sendError(res, 422, "Invalid assets");
      }

      const username = req.params.username as string;
      const profile = await prisma.profile.findUnique({ where: { username } });

      if (!profile) {
        return sendError(res, 404, "Profile not found");
      }

      if (!req.auth || req.auth.walletAddress !== profile.walletAddress) {
        return sendError(res, 403, "Forbidden: You do not own this profile");
      }

      try {
        await prisma.$transaction([
          prisma.acceptedAsset.deleteMany({ where: { profileId: profile.id } }),
          prisma.acceptedAsset.createMany({
            data: parsed.data.assets.map((a) => ({
              ...a,
              profileId: profile.id,
            })),
          }),
        ]);

        const updated = await prisma.profile.findUnique({
          where: { username },
          include: { acceptedAssets: true },
        });

        return res.json(updated);
      } catch (e: unknown) {
        req.log.error({ err: e }, "database error updating assets");
        return sendError(res, 500, "Internal server error");
      }
    },
  );

  // ── Support transactions ───────────────────────────────────────────────

  const supportPayloadSchema = z.object({
    txHash: z.string().min(3),
    amount: z.string().min(1),
    assetCode: z.string().min(1),
    assetIssuer: z.string().optional().nullable(),
    status: z.string().default("pending"),
    message: z.string().max(280).optional().nullable(),
    stellarNetwork: z.string().default("TESTNET"),
    supporterAddress: z.string().optional().nullable(),
    recipientAddress: z.string().min(1),
    profileId: z.string().min(1),
    supporterId: z.string().optional().nullable(),
  });

  const verificationCache = new Map<string, { result: boolean; timestamp: number }>();
  const VERIFICATION_CACHE_TTL = 60 * 60 * 1000;

  async function verifyTransaction(
    txHash: string,
    retries = 3,
    backoffMs = 1000,
    req?: express.Request
  ): Promise<boolean | "error"> {
    const cached = verificationCache.get(txHash);
    if (cached && Date.now() - cached.timestamp < VERIFICATION_CACHE_TTL) {
      return cached.result;
    }

    const verify = async () => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const tx = await stellarServer.transactions().transaction(txHash).call();
          const result = tx.successful === true;
          
          if (result) {
            verificationCache.set(txHash, { result, timestamp: Date.now() });
          }
          
          return result;
        } catch (e: unknown) {
          if (
            e &&
            typeof e === "object" &&
            "response" in e &&
            e.response &&
            typeof e.response === "object" &&
            "status" in e.response &&
            e.response.status === 404
          ) {
            return false;
          }

          if (attempt < retries) {
            const delay = backoffMs * Math.pow(2, attempt - 1);
            const log = req?.log ?? logger;
            log.warn(
              { txHash, attempt, delay, err: e },
              "Horizon verification failed, retrying"
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          } else {
            throw e;
          }
        }
      }
      return "error" as const;
    };

    try {
      return await horizonCircuitBreaker.execute(verify);
    } catch (e: any) {
      const log = req?.log ?? logger;
      if (e.message === "Circuit breaker is OPEN") {
        log.warn({ txHash }, "Horizon circuit breaker is OPEN, skipping call");
      } else {
        log.error({ txHash, err: e }, "Horizon error verifying transaction after retries");
      }
      return "error";
    }
  }

  /**
   * @openapi
   * /profiles/{username}/transactions:
   *   get:
   *     summary: Get profile support transactions
   *     parameters:
   *       - in: path
   *         name: username
   *         required: true
   *         schema:
   *           type: string
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *       - in: query
   *         name: offset
   *         schema:
   *           type: integer
   *           default: 0
   *       - in: query
   *         name: network
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: List of transactions
   *       404:
   *         description: Profile not found
   *       500:
   *         description: Internal server error
   */
  app.get("/profiles/:username/transactions", async (req, res) => {
    const { username } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 1000);
    const offset = parseInt(req.query.offset as string) || 0;
    const network = req.query.network as string | undefined;
    const status = req.query.status as string | undefined;
    const assetCode = req.query.assetCode as string | undefined;

    const profile = await prisma.profile.findUnique({
      where: { username },
    });

    if (!profile) {
      return sendError(res, 404, "Profile not found");
    }

    const where = {
      recipientAddress: profile.walletAddress,
      ...(network ? { stellarNetwork: network } : {}),
      ...(status ? { status } : {}),
      ...(assetCode ? { assetCode } : {}),
    };

    const [transactions, total] = await Promise.all([
      prisma.supportTransaction.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
      }),
      prisma.supportTransaction.count({ where }),
    ]);

    res.json({ transactions, total, limit, offset });
  });

  // Issue #229 — 409 DUPLICATE_TX handled below in the full support-transactions handler

  // Issue #204 — GET /profiles (explore page, paginated + sortable + asset filter)
  app.get("/profiles", async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const sort = (req.query.sort as string) || "newest";
    const asset = req.query.asset as string | undefined;

    const assetFilter = asset
      ? { acceptedAssets: { some: { code: asset } } }
      : {};

    let orderBy: any;
    if (sort === "most_supported") {
      orderBy = { supportTransactions: { _count: "desc" } };
    } else if (sort === "most_transactions") {
      orderBy = { supportTransactions: { _count: "desc" } };
    } else {
      orderBy = { createdAt: "desc" };
    }

    const [profiles, total] = await Promise.all([
      prisma.profile.findMany({
        where: assetFilter,
        take: limit,
        skip: offset,
        orderBy,
        select: {
          username: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          createdAt: true,
          acceptedAssets: { select: { code: true, issuer: true } },
        },
      }),
      prisma.profile.count({ where: assetFilter }),
    ]);

    res.json({ profiles, total, limit, offset });
  });

  // Issue #220 — Webhook CRUD endpoints
  const webhookCreateSchema = z.object({
    url: z.string().url().startsWith("https://"),
  });

  // Helper: resolve profile and verify owner
  async function resolveProfileOwner(
    username: string,
    ownerId: string,
    res: Response,
  ) {
    const profile = await prisma.profile.findUnique({ where: { username } });
    if (!profile) {
      sendError(res, 404, "Profile not found");
      return null;
    }
    if (profile.ownerId !== ownerId) {
      sendError(res, 403, "Forbidden");
      return null;
    }
    return profile;
  }

  app.post("/profiles/:username/webhooks", requireAuth, async (req, res) => {
    const parsed = webhookCreateSchema.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, "Invalid URL — must be a valid HTTPS URL");

    const profile = await resolveProfileOwner(req.params.username as string, (req.auth!.userId || req.auth!.walletAddress) as string, res);
    if (!profile) return;

    const secret = randomBytes(32).toString("hex");
    const webhook = await prisma.webhook.create({
      data: { url: parsed.data.url, secret, profileId: profile.id },
    });

    return res.status(201).json({ id: webhook.id, url: webhook.url, secret });
  });

  app.get("/profiles/:username/webhooks", requireAuth, async (req, res) => {
    const profile = await resolveProfileOwner(req.params.username as string, (req.auth!.userId || req.auth!.walletAddress) as string, res);
    if (!profile) return;

    const webhooks = await prisma.webhook.findMany({
      where: { profileId: profile.id },
      select: { id: true, url: true, active: true, createdAt: true },
    });

    return res.json(webhooks);
  });

  app.delete("/profiles/:username/webhooks/:id", requireAuth, async (req, res) => {
    const profile = await resolveProfileOwner(req.params.username as string, (req.auth!.userId || req.auth!.walletAddress) as string, res);
    if (!profile) return;

    const webhook = await prisma.webhook.findFirst({
      where: { id: req.params.id as string, profileId: profile.id },
    });
    if (!webhook) return sendError(res, 404, "Webhook not found");

    await prisma.webhook.delete({ where: { id: webhook.id } });
    return res.status(204).send();
  });

  app.get("/profiles/:username/webhooks/:id/deliveries", requireAuth, async (req, res) => {
    const profile = await resolveProfileOwner(req.params.username as string, (req.auth!.userId || req.auth!.walletAddress) as string, res);
    if (!profile) return;

    const webhook = await prisma.webhook.findFirst({
      where: { id: req.params.id as string, profileId: profile.id },
    });
    if (!webhook) return sendError(res, 404, "Webhook not found");

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const [deliveries, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where: { webhookId: webhook.id },
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
      }),
      prisma.webhookDelivery.count({ where: { webhookId: webhook.id } }),
    ]);

    return res.json({ deliveries, total, limit, offset });
  });

  app.get("/profiles/:username/leaderboard", async (req, res) => {
    const { username } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const sort =
      req.query.sort === "transaction_count"
        ? "transaction_count"
        : ("total_amount" as LeaderboardSort);

    const profile = await prisma.profile.findUnique({
      where: { username },
      select: { id: true },
    });

    if (!profile) {
      return sendError(res, 404, "Profile not found");
    }

    const cached = getCachedLeaderboard(profile.id, limit, offset, sort);
    if (cached) {
      return res.json(cached);
    }

    const orderBy =
      sort === "transaction_count"
        ? [{ _count: { _all: "desc" as const } }, { _sum: { amount: "desc" as const } }]
        : [{ _sum: { amount: "desc" as const } }, { _count: { _all: "desc" as const } }];

    const [grouped, total] = await Promise.all([
      prisma.supportTransaction.groupBy({
        by: ["supporterAddress", "assetCode"],
        where: {
          profileId: profile.id,
          status: { not: "failed" },
          supporterAddress: { not: null },
        },
        _sum: { amount: true },
        _count: { _all: true },
        orderBy,
        take: limit,
        skip: offset,
      }),
      prisma.supportTransaction.groupBy({
        by: ["supporterAddress", "assetCode"],
        where: {
          profileId: profile.id,
          status: { not: "failed" },
          supporterAddress: { not: null },
        },
        _count: { _all: true },
      }),
    ]);

    const leaderboard = grouped.map((entry: any, index: number) => ({
      rank: offset + index + 1,
      supporterAddress: entry.supporterAddress as string,
      assetCode: entry.assetCode,
      totalAmount: entry._sum.amount?.toString() ?? "0",
      transactionCount: entry._count._all ?? 0,
    }));

    const payload = {
      leaderboard,
      total: total.length,
      limit,
      offset,
      sort,
    };

    setCachedLeaderboard(profile.id, limit, offset, sort, payload);
    return res.json(payload);
  });

  app.get("/indexer/status", async (_req, res) => {
    const contractId =
      process.env.SOROBAN_CONTRACT_ID ??
      process.env.CONTRACT_ID ??
      process.env.NEXT_PUBLIC_CONTRACT_ID ??
      "";
    const network = process.env.INDEXER_NETWORK ?? "TESTNET";

    if (!contractId) {
      return res.json({
        configured: false,
        network,
        contractId: null,
        cursor: null,
        lastLedger: null,
      });
    }

    const cursor = await prisma.indexerCursor.findUnique({
      where: {
        network_contractId: {
          network,
          contractId,
        },
      },
      select: {
        lastPagingToken: true,
        lastLedger: true,
      },
    });

    return res.json({
      configured: true,
      network,
      contractId,
      cursor: cursor?.lastPagingToken ?? null,
      lastLedger: cursor?.lastLedger ?? null,
    });
  });

  /**
   * @openapi
   * /support-transactions:
   *   post:
   *     summary: Record a support transaction
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               txHash:
   *                 type: string
   *               amount:
   *                 type: string
   *               assetCode:
   *                 type: string
   *               assetIssuer:
   *                 type: string
   *               status:
   *                 type: string
   *                 default: pending
   *               message:
   *                 type: string
   *                 maxLength: 280
   *                 description: Sanitized support message
   *               stellarNetwork:
   *                 type: string
   *                 default: TESTNET
   *               supporterAddress:
   *                 type: string
   *               recipientAddress:
   *                 type: string
   *               profileId:
   *                 type: string
   *               supporterId:
   *                 type: string
   *             required:
   *               - txHash
   *               - amount
   *               - assetCode
   *               - recipientAddress
   *               - profileId
   *     responses:
   *       201:
   *         description: Support transaction recorded
   *       400:
   *         description: Invalid request body
   *       422:
   *         description: Transaction rejected by Horizon
   *       503:
   *         description: Horizon is unavailable
   *       500:
   *         description: Internal server error
   */
  app.post(
    "/support-transactions",
    requireAuth,
    writeLimiter,
    async (req, res) => {
      const parsed = supportPayloadSchema.safeParse(req.body);

      if (!parsed.success) {
        const flat = parsed.error.flatten();
        req.log.warn({ issues: flat }, "validation failed");
        return res.status(400).json({ error: flat });
      }

      const verification = await verifyTransaction(parsed.data.txHash, 3, 1000, req);

      if (verification === false) {
        return res
          .status(422)
          .json({
            error: "Transaction hash not found or not successful on Horizon.",
          });
      }

      if (verification === "error") {
        return res
          .status(503)
          .json({
            error:
              "Service unavailable: unable to verify transaction with Horizon.",
          });
      }

      let supportRecord;
      try {
        supportRecord = await prisma.$transaction(async (tx: any) => {
          const record = await tx.supportTransaction.create({
            data: parsed.data,
          });

          const milestones = await tx.milestone.findMany({
            where: {
              profileId: parsed.data.profileId,
              assetCode: parsed.data.assetCode,
              status: "active",
            },
          });

          for (const milestone of milestones) {
            const updated = await tx.milestone.update({
              where: { id: milestone.id },
              data: {
                currentAmount: { increment: parsed.data.amount },
              },
            });

            if (Number(updated.currentAmount) >= Number(updated.targetAmount)) {
              await tx.milestone.update({
                where: { id: milestone.id },
                data: { status: "reached" },
              });
            }
          }

          return record;
        });
        invalidateProfileLeaderboardCache(supportRecord.profileId);
      } catch (error: any) {
        if (error?.code === "P2002") {
          const existing = await prisma.supportTransaction.findUnique({
            where: { txHash: parsed.data.txHash },
            select: { txHash: true },
          });

          return res.status(409).json({
            error: "Transaction already recorded",
            code: "DUPLICATE_TX",
            existingTxHash: existing?.txHash ?? parsed.data.txHash,
          });
        }
        throw error;
      }

      // Notify creator (async, best-effort)
      (async () => {
        try {
          const recipientProfile = await prisma.profile.findUnique({
            where: { id: supportRecord.profileId },
            include: { owner: true },
          });

          if (recipientProfile?.owner?.email) {
            sendSupportReceivedEmail({
              to: recipientProfile.owner.email,
              fromAddress: supportRecord.supporterAddress ?? "Anonymous",
              amount: supportRecord.amount.toString(),
              assetCode: supportRecord.assetCode,
              message: supportRecord.message,
              txHash: supportRecord.txHash,
            }).catch((err) => {
              logger.error(
                { err, profileId: supportRecord.profileId },
                "Failed to send contribution received email",
              );
            });
          }
        } catch (err) {
          logger.error(
            { err, txHash: supportRecord.txHash },
            "Error in background email notification task",
          );
        }
      })();

      // Deliver webhooks (async, fire-and-forget)
      (async () => {
        try {
          const webhooks = await prisma.webhook.findMany({
            where: { profileId: supportRecord.profileId, active: true },
            include: { profile: { select: { username: true } } },
          });

          for (const webhook of webhooks) {
            const payload = JSON.stringify({
              event: "support.received",
              txHash: supportRecord.txHash,
              amount: supportRecord.amount.toString(),
              assetCode: supportRecord.assetCode,
              message: supportRecord.message ?? null,
              profileUsername: webhook.profile.username,
              createdAt: supportRecord.createdAt.toISOString(),
            });

            const signature = createHmac("sha256", webhook.secret)
              .update(payload)
              .digest("hex");

            // Persist for background delivery with exponential backoff (#webhook-persistence)
            await prisma.webhookDelivery.create({
              data: {
                webhookId: webhook.id,
                eventType: "support.received",
                payload: JSON.parse(payload),
                status: "pending",
              },
            });
          }
        } catch (err) {
          logger.error(
            { err, txHash: supportRecord.txHash },
            "Error fetching webhooks for delivery",
          );
        }
      })();

      req.log.info(
        { txHash: supportRecord.txHash },
        "support transaction recorded",
      );
      res.status(201).json(supportRecord);
    },
  );

  // ── Analytics ──────────────────────────────────────────────────────────

  /**
   * @openapi
   * /analytics/{campaignId}:
   *   get:
   *     summary: Get profile analytics
   *     parameters:
   *       - in: path
   *         name: campaignId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Analytics data
   *       404:
   *         description: Analytics not found
   */
  app.get("/analytics/:campaignId", async (req, res) => {
    // Analytics endpoint — returns summary + recent transactions with pagination
    const { campaignId } = req.params;

    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    // Attempt to find a profile by username (campaignId maps to username)
    const profile = await prisma.profile.findUnique({
      where: { username: campaignId },
      include: { acceptedAssets: true },
    });

    if (!profile) {
      return sendError(res, 404, "Profile not found");
    }

    const transactions = await prisma.supportTransaction.findMany({
      where: { profileId: profile.id, status: "SUCCESS" },
      orderBy: { createdAt: "desc" },
    });

    const totalAmount = transactions.reduce(
      (sum: number, tx: (typeof transactions)[number]) =>
        sum + Number(tx.amount),
      0,
    );
    const uniqueSupporters = new Set(
      transactions.map(
        (tx: (typeof transactions)[number]) => tx.supporterAddress,
      ),
    ).size;

    // Calculate daily contributions for last 7 days
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split("T")[0];
    });

    const dailyMap = new Map<string, number>();
    last7Days.forEach((date) => dailyMap.set(date, 0));

    transactions.forEach((tx: (typeof transactions)[number]) => {
      const date = tx.createdAt.toISOString().split("T")[0];
      if (dailyMap.has(date)) {
        dailyMap.set(date, (dailyMap.get(date) || 0) + Number(tx.amount));
      }
    });

    const dailyContributions = Array.from(dailyMap.entries()).map(
      ([date, amount]) => ({
        date,
        amount: Number(amount.toFixed(7)),
      }),
    );

    // Calculate asset breakdown
    const assetMap = new Map<string, number>();
    transactions.forEach((tx: (typeof transactions)[number]) => {
      assetMap.set(
        tx.assetCode,
        (assetMap.get(tx.assetCode) || 0) + Number(tx.amount),
      );
    });

    const assetBreakdown = Array.from(assetMap.entries()).map(
      ([name, value]) => ({
        name,
        value: Number(value.toFixed(7)),
      }),
    );

    const avgContribution =
      transactions.length > 0 ? totalAmount / transactions.length : 0;

    res.json({
      profile: { username: profile.username, displayName: profile.displayName },
      summary: {
        totalRaised: Number(totalAmount.toFixed(7)),
        totalContributors: uniqueSupporters,
        avgContribution: Number(avgContribution.toFixed(7)),
        activeDrips: 0, // Not yet implemented in schema
      },
      dailyContributions,
      assetBreakdown,
      recentTransactions: transactions.slice(offset, offset + limit),
      transactionTotal: transactions.length,
    });
  });

  // ── Avatar upload ──────────────────────────────────────────────────────

  /**
   * @openapi
   * /profiles/{username}/avatar:
   *   post:
   *     summary: Update profile avatar
   *     parameters:
   *       - in: path
   *         name: username
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       content:
   *         multipart/form-data:
   *           schema:
   *             type: object
   *             properties:
   *               avatar:
   *                 type: string
   *                 format: binary
   *     responses:
   *       200:
   *         description: Avatar updated
   *       404:
   *         description: Profile not found
   *       413:
   *         description: File too large
   *       422:
   *         description: Invalid file
   *       502:
   *         description: Avatar storage upload failed
   *       503:
   *         description: Avatar upload service unavailable
   */
  app.post(
    "/profiles/:username/avatar",
    writeLimiter,
    upload.single("avatar"),
    async (req, res) => {
      if (!supabaseClient) {
        return sendError(res, 503, "Avatar upload service unavailable");
      }

      const bucket = process.env.SUPABASE_AVATAR_BUCKET;
      if (!bucket) {
        return sendError(res, 503, "Avatar upload service unavailable");
      }

      const username = req.params.username as string;

      const profile = await prisma.profile.findUnique({
        where: { username },
      });

      if (!profile) {
        return sendError(res, 404, "Profile not found");
      }

      const path = `avatars/${username}`;
      const { error: uploadError } = await supabaseClient.storage
        .from(bucket)
        .upload(path, req.file!.buffer, { upsert: true });

      if (uploadError) {
        req.log.error({ err: uploadError }, "supabase storage upload failed");
        return sendError(res, 502, "Avatar storage upload failed");
      }

      const {
        data: { publicUrl },
      } = supabaseClient.storage.from(bucket).getPublicUrl(path);

      try {
        const updated = await prisma.profile.update({
          where: { username },
          data: { avatarUrl: publicUrl },
          include: { acceptedAssets: true },
        });
        return res.json(updated);
      } catch (e: unknown) {
        req.log.error({ err: e }, "database error updating avatarUrl");
        return sendError(res, 500, "Internal server error");
      }
    },
  );

  // ── Multer error handler ───────────────────────────────────────────────

  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE")
          return sendError(res, 413, "File too large");
        return sendError(res, 422, "Invalid file");
      }
      next(err);
    },
  );


  // ── Milestones ─────────────────────────────────────────────────────────

  const createMilestoneSchema = z.object({
    title: z.string().min(1).max(100),
    description: z.string().max(500).optional().nullable(),
    targetAmount: z.string().min(1),
    assetCode: z.string().default("XLM"),
  });

  app.post("/profiles/:username/milestones", async (req, res) => {
    try {
      const profile = await prisma.profile.findUnique({
        where: { username: req.params.username },
      });

      if (!profile) {
        return sendError(res, 404, "Profile not found");
      }

      const parsed = createMilestoneSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, 400, "Invalid request body");
      }

      const milestone = await prisma.milestone.create({
        data: {
          title: parsed.data.title,
          description: parsed.data.description,
          targetAmount: parsed.data.targetAmount,
          assetCode: parsed.data.assetCode,
          profileId: profile.id,
        },
      });

      res.status(201).json(milestone);
    } catch {
      return sendError(res, 500, "Internal server error");
    }
  });

  app.get("/profiles/:username/milestones", async (req, res) => {
    try {
      const profile = await prisma.profile.findUnique({
        where: { username: req.params.username },
      });

      if (!profile) {
        return sendError(res, 404, "Profile not found");
      }

      const milestones = await prisma.milestone.findMany({
        where: { profileId: profile.id },
        orderBy: { createdAt: "desc" },
      });

      res.json({ milestones });
    } catch {
      return sendError(res, 500, "Internal server error");
    }
  });

  app.patch("/profiles/:username/milestones/:milestoneId", async (req, res) => {
    try {
      const profile = await prisma.profile.findUnique({
        where: { username: req.params.username },
      });

      if (!profile) {
        return sendError(res, 404, "Profile not found");
      }

      const milestone = await prisma.milestone.findUnique({
        where: { id: req.params.milestoneId },
      });

      if (!milestone || milestone.profileId !== profile.id) {
        return sendError(res, 404, "Milestone not found");
      }

      const parsed = createMilestoneSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, 400, "Invalid request body");
      }

      const updated = await prisma.milestone.update({
        where: { id: req.params.milestoneId },
        data: parsed.data,
      });

      res.json(updated);
    } catch {
      return sendError(res, 500, "Internal server error");
    }
  });

  app.delete("/profiles/:username/milestones/:milestoneId", async (req, res) => {
    try {
      const profile = await prisma.profile.findUnique({
        where: { username: req.params.username },
      });

      if (!profile) {
        return sendError(res, 404, "Profile not found");
      }

      const milestone = await prisma.milestone.findUnique({
        where: { id: req.params.milestoneId },
      });

      if (!milestone || milestone.profileId !== profile.id) {
        return sendError(res, 404, "Milestone not found");
      }

      await prisma.milestone.delete({
        where: { id: req.params.milestoneId },
      });

      res.status(204).send();
    } catch {
      return sendError(res, 500, "Internal server error");
    }
  });

  // ── Supporters ─────────────────────────────────────────────────────────

  app.get("/supporters/:address", async (req, res) => {
    try {
      const { address } = req.params;

      if (!StrKey.isValidEd25519PublicKey(address)) {
        return sendError(res, 400, "Invalid Stellar address");
      }

      const transactions = await prisma.supportTransaction.findMany({
        where: { supporterAddress: address },
        include: { profile: { select: { username: true, displayName: true } } },
        orderBy: { createdAt: "desc" },
      });

      const profilesSupported = new Set(transactions.map((tx: any) => tx.profileId)).size;
      const assetMap = new Map<string, number>();
      for (const tx of transactions) {
        const key = tx.assetCode as string;
        assetMap.set(key, (assetMap.get(key) ?? 0) + parseFloat(tx.amount.toString()));
      }
      const totalByAsset = Array.from(assetMap.entries()).map(([assetCode, total]) => ({
        assetCode,
        total: total.toFixed(7),
      }));

      const recentTransactions = transactions.slice(0, 10).map((tx: any) => ({
        profileUsername: tx.profile.username,
        profileDisplayName: tx.profile.displayName,
        amount: tx.amount.toString(),
        assetCode: tx.assetCode,
        createdAt: tx.createdAt,
        txHash: tx.txHash,
      }));

      return res.json({
        address,
        totalTransactions: transactions.length,
        profilesSupported,
        totalByAsset,
        recentTransactions,
      });
    } catch {
      return sendError(res, 500, "Internal server error");
    }
  });

  // ── Recurring Support ───────────────────────────────────────────────────

  app.post("/recurring-support", requireAuth, writeLimiter, async (req, res) => {
    const { profileId, amount, assetCode, frequency } = req.body;

    if (!profileId || !amount || !frequency) {
      return sendError(res, 400, "profileId, amount, and frequency are required");
    }
    if (frequency !== "weekly" && frequency !== "monthly") {
      return sendError(res, 400, "frequency must be 'weekly' or 'monthly'");
    }

    const profile = await prisma.profile.findUnique({ where: { id: profileId } });
    if (!profile) return sendError(res, 404, "Profile not found");

    const user = await prisma.user.findFirst({ where: { email: req.auth!.walletAddress } });
    if (!user) return sendError(res, 401, "User not found");

    const nextRunAt = new Date();
    if (frequency === "weekly") {
      nextRunAt.setDate(nextRunAt.getDate() + 7);
    } else {
      nextRunAt.setDate(nextRunAt.getDate() + 30);
    }

    await prisma.recurringSupport.create({
      data: {
        supporterId: user.id,
        profileId,
        amount,
        assetCode: assetCode ?? "XLM",
        frequency,
        nextRunAt,
      },
    });

    return res.status(201).json({ message: "Recurring support created" });
  });

  app.get("/recurring-support", requireAuth, async (req, res) => {
    const user = await prisma.user.findFirst({ where: { email: req.auth!.walletAddress } });
    if (!user) return sendError(res, 401, "User not found");

    const subscriptions = await prisma.recurringSupport.findMany({
      where: { supporterId: user.id, status: { not: "cancelled" } },
      include: { profile: { select: { username: true, displayName: true } } },
      orderBy: { createdAt: "desc" },
    });

    return res.json(subscriptions);
  });

  app.patch("/recurring-support/:id", requireAuth, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || (status !== "paused" && status !== "cancelled")) {
      return sendError(res, 400, "status must be 'paused' or 'cancelled'");
    }

    const user = await prisma.user.findFirst({ where: { email: req.auth!.walletAddress } });
    if (!user) return sendError(res, 401, "User not found");

    const subscription = await prisma.recurringSupport.findUnique({ where: { id: id as string } });
    if (!subscription) return sendError(res, 404, "Recurring support not found");
    if (subscription.supporterId !== user.id) return sendError(res, 403, "Forbidden");

    const updated = await prisma.recurringSupport.update({ where: { id: id as string }, data: { status } });

    return res.json(updated);
  });

  app.get("/profiles/:username/analytics/timeseries", async (req, res) => {
    const { username } = req.params;
    const period = (req.query.period as string) || "daily";
    const assetCode = req.query.assetCode as string | undefined;

    const to = new Date(req.query.to as string || new Date().toISOString());
    const from = new Date(
      req.query.from as string ||
        new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    );

    if (isNaN(to.getTime()) || isNaN(from.getTime())) {
      return res.status(400).json({ error: "Invalid from or to date" });
    }

    const profile = await prisma.profile.findUnique({
      where: { username },
    });

    if (!profile) {
      return sendError(res, 404, "Profile not found");
    }

    let results;
    try {
      if (period === "monthly") {
        results = await prisma.$queryRaw`
          SELECT
            DATE_TRUNC('month', "createdAt") as date,
            SUM(amount) as total,
            COUNT(*) as "txCount"
          FROM "SupportTransaction"
          WHERE "profileId" = ${profile.id}
            AND "status" != 'failed'
            AND "createdAt" >= ${from}
            AND "createdAt" <= ${to}
            ${assetCode ? (Prisma as any).sql`AND "assetCode" = ${assetCode}` : (Prisma as any).empty}
          GROUP BY DATE_TRUNC('month', "createdAt")
          ORDER BY date ASC
        `;
      } else if (period === "weekly") {
        results = await prisma.$queryRaw`
          SELECT
            DATE_TRUNC('week', "createdAt") as date,
            SUM(amount) as total,
            COUNT(*) as "txCount"
          FROM "SupportTransaction"
          WHERE "profileId" = ${profile.id}
            AND "status" != 'failed'
            AND "createdAt" >= ${from}
            AND "createdAt" <= ${to}
            ${assetCode ? (Prisma as any).sql`AND "assetCode" = ${assetCode}` : (Prisma as any).empty}
          GROUP BY DATE_TRUNC('week', "createdAt")
          ORDER BY date ASC
        `;
      } else {
        results = await prisma.$queryRaw`
          SELECT
            DATE_TRUNC('day', "createdAt") as date,
            SUM(amount) as total,
            COUNT(*) as "txCount"
          FROM "SupportTransaction"
          WHERE "profileId" = ${profile.id}
            AND "status" != 'failed'
            AND "createdAt" >= ${from}
            AND "createdAt" <= ${to}
            ${assetCode ? (Prisma as any).sql`AND "assetCode" = ${assetCode}` : (Prisma as any).empty}
          GROUP BY DATE_TRUNC('day', "createdAt")
          ORDER BY date ASC
        `;
      }
    } catch (err) {
      req.log.error({ err }, "Failed to fetch analytics");
      return res.status(500).json({ error: "Internal server error" });
    }

    const { fillGaps } = await import("./analytics.js");
    const formatted = fillGaps(results as any[], period, from, to);

    return res.json(formatted);
  });

  app.get("/profiles/:username/analytics/assets", async (req, res) => {
    const { username } = req.params;

    const profile = await prisma.profile.findUnique({ where: { username } });
    if (!profile) return sendError(res, 404, "Profile not found");

    const transactions = await prisma.supportTransaction.findMany({
      where: { profileId: profile.id, status: "SUCCESS" },
      select: { assetCode: true, amount: true },
    });

    const assetMap = new Map<string, number>();
    for (const tx of transactions) {
      assetMap.set(tx.assetCode, (assetMap.get(tx.assetCode) ?? 0) + Number(tx.amount));
    }

    const total = Array.from(assetMap.values()).reduce((sum, v) => sum + v, 0);

    const breakdown = Array.from(assetMap.entries()).map(([assetCode, amount]) => ({
      assetCode,
      amount: Number(amount.toFixed(7)),
      percentage: total > 0 ? Number(((amount / total) * 100).toFixed(2)) : 0,
    }));

    return res.json({ breakdown, total: Number(total.toFixed(7)) });
  });

  return app;
}

export const app = createApp();
