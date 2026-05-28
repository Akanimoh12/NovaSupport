import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { logger } from "./logger.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = "1h";

if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is required but not set. Application cannot start.");
}

// Type assertion after validation - we know JWT_SECRET is a string now
const JWT_SECRET_VALIDATED: string = JWT_SECRET;

export type AuthContext = {
  walletAddress: string;
  userId?: string;
};

declare module "express" {
  interface Request {
    auth?: AuthContext;
  }
}

// Generate a challenge nonce for wallet signature
export function generateChallenge(walletAddress: string): string {
  const timestamp = Date.now();
  const randomBytes = Buffer.from(
    Array.from({ length: 16 }, () => Math.floor(Math.random() * 256))
  ).toString("hex");
  return `novasupport:${walletAddress}:${timestamp}:${randomBytes}`;
}

// Verify Stellar wallet signature
export function verifySignature(
  walletAddress: string,
  challenge: string,
  signature: string
): boolean {
  try {
    // The walletAddress is already the public key string (G...)
    // Create a Keypair from the public key for verification
    const keypair = Keypair.fromPublicKey(walletAddress);
    
    // Verify the signature - stellar-sdk verify expects (message: Buffer, signature: Buffer)
    const messageBuffer = Buffer.from(challenge, 'utf8');
    const sigBuffer = Buffer.from(signature, 'base64');
    return keypair.verify(messageBuffer, sigBuffer);
  } catch (error) {
    logger.error({ error }, "Signature verification error");
    return false;
  }
}

// Sign a JWT for an authenticated wallet
export function signJWT(walletAddress: string, userId?: string): string {
  return jwt.sign(
    { walletAddress, userId },
    JWT_SECRET_VALIDATED,
    { expiresIn: JWT_EXPIRY }
  );
}

// Verify and decode JWT
export function verifyJWT(token: string): AuthContext | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET_VALIDATED) as AuthContext;
    return decoded;
  } catch {
    return null;
  }
}

// Middleware to require authentication
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
    return;
  }
  
  const token = authHeader.substring(7);
  const auth = verifyJWT(token);
  
  if (!auth) {
    res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
    return;
  }
  
  req.auth = auth;
  next();
}

// Middleware to optionally attach auth context (doesn't require auth)
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const auth = verifyJWT(token);
    if (auth) {
      req.auth = auth;
    }
  }
  
  next();
}

// Validate Stellar address format
export function isValidStellarAddress(address: string): boolean {
  return StrKey.isValidEd25519PublicKey(address);
}
