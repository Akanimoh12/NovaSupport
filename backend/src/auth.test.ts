import assert from "node:assert/strict";
import { Keypair } from "@stellar/stellar-sdk";
import {
  generateChallenge,
  verifySignature,
  signJWT,
  verifyJWT,
  isValidStellarAddress,
  requireAuth,
  optionalAuth,
} from "./auth.js";
import type { Request, Response, NextFunction } from "express";

// ── Test runner ────────────────────────────────────────────────────────────

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Creates a mock Express request object */
function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    ...overrides,
  } as Request;
}

/** Creates a mock Express response object */
function mockResponse(): Response & { statusCode?: number; jsonData?: unknown } {
  const res: Partial<Response> & { statusCode?: number; jsonData?: unknown } = {
    statusCode: undefined,
    jsonData: undefined,
  };
  res.status = function (code: number) {
    res.statusCode = code;
    return res as Response;
  };
  res.json = function (data: unknown) {
    res.jsonData = data;
    return res as Response;
  };
  return res as Response & { statusCode?: number; jsonData?: unknown };
}

/** Creates a mock next function */
function mockNext(): NextFunction & { called: boolean } {
  const next = (() => {
    next.called = true;
  }) as NextFunction & { called: boolean };
  next.called = false;
  return next;
}

// ── Tests ──────────────────────────────────────────────────────────────────

async function main() {
  // ── Challenge Generation Tests ──────────────────────────────────────────

  await runTest("generateChallenge returns a string with correct format", async () => {
    const walletAddress = "GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM";
    const challenge = generateChallenge(walletAddress);

    assert.ok(typeof challenge === "string", "Challenge should be a string");
    assert.ok(challenge.startsWith("novasupport:"), "Challenge should start with 'novasupport:'");
    assert.ok(challenge.includes(walletAddress), "Challenge should include wallet address");
  });

  await runTest("generateChallenge produces unique challenges", async () => {
    const walletAddress = "GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM";
    const challenge1 = generateChallenge(walletAddress);
    // Small delay to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));
    const challenge2 = generateChallenge(walletAddress);

    assert.notEqual(challenge1, challenge2, "Challenges should be unique");
  });

  await runTest("generateChallenge includes timestamp", async () => {
    const walletAddress = "GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM";
    const beforeTime = Date.now();
    const challenge = generateChallenge(walletAddress);
    const afterTime = Date.now();

    const parts = challenge.split(":");
    assert.equal(parts.length, 4, "Challenge should have 4 parts separated by colons");
    
    const timestamp = parseInt(parts[2], 10);
    assert.ok(timestamp >= beforeTime, "Timestamp should be >= beforeTime");
    assert.ok(timestamp <= afterTime, "Timestamp should be <= afterTime");
  });

  // ── Signature Verification Tests ────────────────────────────────────────

  await runTest("verifySignature accepts valid signature", async () => {
    const keypair = Keypair.random();
    const walletAddress = keypair.publicKey();
    const challenge = generateChallenge(walletAddress);
    
    const messageBuffer = Buffer.from(challenge, "utf8");
    const signature = keypair.sign(messageBuffer).toString("base64");

    const isValid = verifySignature(walletAddress, challenge, signature);
    assert.ok(isValid, "Valid signature should be accepted");
  });

  await runTest("verifySignature rejects invalid signature", async () => {
    const keypair = Keypair.random();
    const walletAddress = keypair.publicKey();
    const challenge = generateChallenge(walletAddress);
    
    const invalidSignature = "invalid-signature-base64";

    const isValid = verifySignature(walletAddress, challenge, invalidSignature);
    assert.equal(isValid, false, "Invalid signature should be rejected");
  });

  await runTest("verifySignature rejects signature from different keypair", async () => {
    const keypair1 = Keypair.random();
    const keypair2 = Keypair.random();
    const walletAddress1 = keypair1.publicKey();
    const challenge = generateChallenge(walletAddress1);
    
    // Sign with keypair2 but verify with keypair1's address
    const messageBuffer = Buffer.from(challenge, "utf8");
    const signature = keypair2.sign(messageBuffer).toString("base64");

    const isValid = verifySignature(walletAddress1, challenge, signature);
    assert.equal(isValid, false, "Signature from different keypair should be rejected");
  });

  await runTest("verifySignature rejects signature for different message", async () => {
    const keypair = Keypair.random();
    const walletAddress = keypair.publicKey();
    const challenge1 = generateChallenge(walletAddress);
    const challenge2 = generateChallenge(walletAddress);
    
    // Sign challenge1 but verify with challenge2
    const messageBuffer = Buffer.from(challenge1, "utf8");
    const signature = keypair.sign(messageBuffer).toString("base64");

    const isValid = verifySignature(walletAddress, challenge2, signature);
    assert.equal(isValid, false, "Signature for different message should be rejected");
  });

  await runTest("verifySignature handles invalid public key gracefully", async () => {
    const invalidAddress = "INVALID_ADDRESS";
    const challenge = generateChallenge(invalidAddress);
    const signature = "some-signature";

    const isValid = verifySignature(invalidAddress, challenge, signature);
    assert.equal(isValid, false, "Invalid public key should return false");
  });

  // ── JWT Signing Tests ────────────────────────────────────────────────────

  await runTest("signJWT creates a valid JWT token", async () => {
    const walletAddress = "GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM";
    const token = signJWT(walletAddress);

    assert.ok(typeof token === "string", "Token should be a string");
    assert.ok(token.split(".").length === 3, "JWT should have 3 parts");
  });

  await runTest("signJWT includes wallet address in payload", async () => {
    const walletAddress = "GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM";
    const token = signJWT(walletAddress);

    const decoded = verifyJWT(token);
    assert.ok(decoded !== null, "Token should be verifiable");
    assert.equal(decoded.walletAddress, walletAddress, "Token should contain wallet address");
  });

  await runTest("signJWT includes optional userId in payload", async () => {
    const walletAddress = "GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM";
    const userId = "user-123";
    const token = signJWT(walletAddress, userId);

    const decoded = verifyJWT(token);
    assert.ok(decoded !== null, "Token should be verifiable");
    assert.equal(decoded.walletAddress, walletAddress, "Token should contain wallet address");
    assert.equal(decoded.userId, userId, "Token should contain userId");
  });

  await runTest("signJWT without userId omits userId from payload", async () => {
    const walletAddress = "GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM";
    const token = signJWT(walletAddress);

    const decoded = verifyJWT(token);
    assert.ok(decoded !== null, "Token should be verifiable");
    assert.equal(decoded.walletAddress, walletAddress, "Token should contain wallet address");
    assert.equal(decoded.userId, undefined, "Token should not contain userId");
  });

  // ── JWT Verification Tests ───────────────────────────────────────────────

  await runTest("verifyJWT accepts valid token", async () => {
    const walletAddress = "GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM";
    const token = signJWT(walletAddress);

    const decoded = verifyJWT(token);
    assert.ok(decoded !== null, "Valid token should be accepted");
    assert.equal(decoded.walletAddress, walletAddress, "Decoded wallet address should match");
  });

  await runTest("verifyJWT rejects invalid token", async () => {
    const invalidToken = "invalid.token.here";

    const decoded = verifyJWT(invalidToken);
    assert.equal(decoded, null, "Invalid token should return null");
  });

  await runTest("verifyJWT rejects malformed token", async () => {
    const malformedToken = "not-a-jwt";

    const decoded = verifyJWT(malformedToken);
    assert.equal(decoded, null, "Malformed token should return null");
  });

  await runTest("verifyJWT rejects token with wrong signature", async () => {
    const walletAddress = "GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM";
    const token = signJWT(walletAddress);
    
    // Tamper with the token by changing the last character
    const tamperedToken = token.slice(0, -1) + (token.slice(-1) === "a" ? "b" : "a");

    const decoded = verifyJWT(tamperedToken);
    assert.equal(decoded, null, "Tampered token should be rejected");
  });

  await runTest("verifyJWT rejects empty token", async () => {
    const decoded = verifyJWT("");
    assert.equal(decoded, null, "Empty token should return null");
  });

  // ── Stellar Address Validation Tests ─────────────────────────────────────

  await runTest("isValidStellarAddress accepts valid Ed25519 public key", async () => {
    const validAddress = "GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM";
    const isValid = isValidStellarAddress(validAddress);
    assert.ok(isValid, "Valid Stellar address should be accepted");
  });

  await runTest("isValidStellarAddress accepts randomly generated keypair", async () => {
    const keypair = Keypair.random();
    const address = keypair.publicKey();
    const isValid = isValidStellarAddress(address);
    assert.ok(isValid, "Randomly generated address should be valid");
  });

  await runTest("isValidStellarAddress rejects invalid address", async () => {
    const invalidAddress = "INVALID_ADDRESS";
    const isValid = isValidStellarAddress(invalidAddress);
    assert.equal(isValid, false, "Invalid address should be rejected");
  });

  await runTest("isValidStellarAddress rejects empty string", async () => {
    const isValid = isValidStellarAddress("");
    assert.equal(isValid, false, "Empty string should be rejected");
  });

  await runTest("isValidStellarAddress rejects address with wrong prefix", async () => {
    // Stellar addresses start with 'G', not 'S' (which is for secret keys)
    const wrongPrefix = "SCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM";
    const isValid = isValidStellarAddress(wrongPrefix);
    assert.equal(isValid, false, "Address with wrong prefix should be rejected");
  });

  // ── requireAuth Middleware Tests ─────────────────────────────────────────

  await runTest("requireAuth allows request with valid token", async () => {
    const walletAddress = "GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM";
    const token = signJWT(walletAddress);

    const req = mockRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = mockResponse();
    const next = mockNext();

    requireAuth(req, res, next);

    assert.ok(next.called, "next() should be called for valid token");
    assert.ok(req.auth !== undefined, "req.auth should be set");
    assert.equal(req.auth?.walletAddress, walletAddress, "req.auth should contain wallet address");
  });

  await runTest("requireAuth rejects request without authorization header", async () => {
    const req = mockRequest({ headers: {} });
    const res = mockResponse();
    const next = mockNext();

    requireAuth(req, res, next);

    assert.equal(next.called, false, "next() should not be called");
    assert.equal(res.statusCode, 401, "Should return 401 status");
    assert.ok(
      (res.jsonData as { error?: string })?.error?.includes("Missing or invalid token"),
      "Should return appropriate error message"
    );
  });

  await runTest("requireAuth rejects request with malformed authorization header", async () => {
    const req = mockRequest({
      headers: { authorization: "InvalidFormat token" },
    });
    const res = mockResponse();
    const next = mockNext();

    requireAuth(req, res, next);

    assert.equal(next.called, false, "next() should not be called");
    assert.equal(res.statusCode, 401, "Should return 401 status");
  });

  await runTest("requireAuth rejects request with invalid token", async () => {
    const req = mockRequest({
      headers: { authorization: "Bearer invalid.token.here" },
    });
    const res = mockResponse();
    const next = mockNext();

    requireAuth(req, res, next);

    assert.equal(next.called, false, "next() should not be called");
    assert.equal(res.statusCode, 401, "Should return 401 status");
    assert.ok(
      (res.jsonData as { error?: string })?.error?.includes("Invalid or expired token"),
      "Should return appropriate error message"
    );
  });

  await runTest("requireAuth rejects request with Bearer prefix but no token", async () => {
    const req = mockRequest({
      headers: { authorization: "Bearer " },
    });
    const res = mockResponse();
    const next = mockNext();

    requireAuth(req, res, next);

    assert.equal(next.called, false, "next() should not be called");
    assert.equal(res.statusCode, 401, "Should return 401 status");
  });

  // ── optionalAuth Middleware Tests ────────────────────────────────────────

  await runTest("optionalAuth attaches auth context with valid token", async () => {
    const walletAddress = "GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM";
    const token = signJWT(walletAddress);

    const req = mockRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res = mockResponse();
    const next = mockNext();

    optionalAuth(req, res, next);

    assert.ok(next.called, "next() should be called");
    assert.ok(req.auth !== undefined, "req.auth should be set");
    assert.equal(req.auth?.walletAddress, walletAddress, "req.auth should contain wallet address");
  });

  await runTest("optionalAuth continues without auth context when no token", async () => {
    const req = mockRequest({ headers: {} });
    const res = mockResponse();
    const next = mockNext();

    optionalAuth(req, res, next);

    assert.ok(next.called, "next() should be called");
    assert.equal(req.auth, undefined, "req.auth should be undefined");
  });

  await runTest("optionalAuth continues without auth context for invalid token", async () => {
    const req = mockRequest({
      headers: { authorization: "Bearer invalid.token.here" },
    });
    const res = mockResponse();
    const next = mockNext();

    optionalAuth(req, res, next);

    assert.ok(next.called, "next() should be called");
    assert.equal(req.auth, undefined, "req.auth should be undefined for invalid token");
  });

  await runTest("optionalAuth continues without auth context for malformed header", async () => {
    const req = mockRequest({
      headers: { authorization: "InvalidFormat token" },
    });
    const res = mockResponse();
    const next = mockNext();

    optionalAuth(req, res, next);

    assert.ok(next.called, "next() should be called");
    assert.equal(req.auth, undefined, "req.auth should be undefined");
  });

  // ── Integration Tests ────────────────────────────────────────────────────

  await runTest("full auth flow: challenge -> sign -> verify -> JWT", async () => {
    // 1. Generate a keypair (simulating a user's wallet)
    const keypair = Keypair.random();
    const walletAddress = keypair.publicKey();

    // 2. Generate a challenge
    const challenge = generateChallenge(walletAddress);
    assert.ok(challenge.includes(walletAddress), "Challenge should include wallet address");

    // 3. Sign the challenge
    const messageBuffer = Buffer.from(challenge, "utf8");
    const signature = keypair.sign(messageBuffer).toString("base64");

    // 4. Verify the signature
    const isValidSignature = verifySignature(walletAddress, challenge, signature);
    assert.ok(isValidSignature, "Signature should be valid");

    // 5. Issue a JWT
    const token = signJWT(walletAddress);
    assert.ok(typeof token === "string", "Token should be issued");

    // 6. Verify the JWT
    const decoded = verifyJWT(token);
    assert.ok(decoded !== null, "Token should be verifiable");
    assert.equal(decoded.walletAddress, walletAddress, "Token should contain correct wallet address");
  });

  await runTest("full auth flow with userId", async () => {
    const keypair = Keypair.random();
    const walletAddress = keypair.publicKey();
    const userId = "user-456";

    const challenge = generateChallenge(walletAddress);
    const messageBuffer = Buffer.from(challenge, "utf8");
    const signature = keypair.sign(messageBuffer).toString("base64");

    const isValidSignature = verifySignature(walletAddress, challenge, signature);
    assert.ok(isValidSignature, "Signature should be valid");

    const token = signJWT(walletAddress, userId);
    const decoded = verifyJWT(token);
    
    assert.ok(decoded !== null, "Token should be verifiable");
    assert.equal(decoded.walletAddress, walletAddress, "Token should contain wallet address");
    assert.equal(decoded.userId, userId, "Token should contain userId");
  });

  await runTest("auth flow fails with wrong signature", async () => {
    const keypair1 = Keypair.random();
    const keypair2 = Keypair.random();
    const walletAddress1 = keypair1.publicKey();

    const challenge = generateChallenge(walletAddress1);
    
    // Sign with wrong keypair
    const messageBuffer = Buffer.from(challenge, "utf8");
    const wrongSignature = keypair2.sign(messageBuffer).toString("base64");

    const isValidSignature = verifySignature(walletAddress1, challenge, wrongSignature);
    assert.equal(isValidSignature, false, "Wrong signature should fail verification");
  });

  await runTest("middleware integration: requireAuth -> optionalAuth consistency", async () => {
    const walletAddress = "GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM";
    const token = signJWT(walletAddress);

    // Test requireAuth
    const req1 = mockRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res1 = mockResponse();
    const next1 = mockNext();
    requireAuth(req1, res1, next1);

    // Test optionalAuth with same token
    const req2 = mockRequest({
      headers: { authorization: `Bearer ${token}` },
    });
    const res2 = mockResponse();
    const next2 = mockNext();
    optionalAuth(req2, res2, next2);

    // Both should set the same auth context
    assert.ok(req1.auth !== undefined, "requireAuth should set auth");
    assert.ok(req2.auth !== undefined, "optionalAuth should set auth");
    assert.equal(req1.auth?.walletAddress, req2.auth?.walletAddress, "Both should have same wallet address");
  });
}

main().catch((err) => {
  console.error("Auth unit tests failed.");
  console.error(err);
  process.exit(1);
});
