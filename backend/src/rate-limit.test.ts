import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import fc from "fast-check";
import { createApp } from "./app.js";

// ── Helpers ────────────────────────────────────────────────────────────────

type TestServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

async function startFreshServer(): Promise<TestServer> {
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const close = () =>
    new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  return { baseUrl, close };
}

// All routes exposed by the app (read + write)
const ALL_ROUTES = [
  { method: "GET", path: "/health" },
  { method: "GET", path: "/profiles" },
  { method: "GET", path: "/profiles/some-user" },
  { method: "GET", path: "/analytics/some-campaign" },
];

// Write routes that carry the write limiter.
// Bodies are intentionally invalid so Zod rejects them (400) before Prisma is
// called — this means the tests work without a database connection while still
// exercising the write limiter middleware (which runs before the handler).
const WRITE_ROUTES = [
  {
    method: "POST",
    path: "/profiles",
    // Missing required fields → Zod 400, no DB call
    body: { username: "x" },
  },
  {
    method: "PATCH",
    path: "/profiles/nonexistent-user",
    // Invalid email → Zod 400, no DB call
    body: { email: "not-an-email" },
  },
  {
    method: "POST",
    path: "/support-transactions",
    // Missing required fields → Zod 400, no DB call
    body: { txHash: "x" },
  },
];

async function sendRequest(
  baseUrl: string,
  method: string,
  path: string,
  body?: object
): Promise<Response> {
  const opts: RequestInit = { method };
  if (body) {
    opts.headers = { "content-type": "application/json" };
    opts.body = JSON.stringify(body);
  }
  return fetch(`${baseUrl}${path}`, opts);
}

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

// ── Property 1: Global limiter enforces its threshold ──────────────────────
// Feature: api-rate-limiting, Property 1: global limiter enforces its threshold
//
// For any request to any route, a fresh app (fresh in-memory counters) should
// return a non-429 response for the first request and include rate-limit headers.
// The boundary test (201st request → 429) runs once outside fast-check because
// sending 201 requests per iteration would be prohibitively slow.
//
// Validates: Requirements 1.2, 1.3

async function testProperty1() {
  // fast-check part: random route, 1 request → non-429 + headers present
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: ALL_ROUTES.length - 1 }),
      async (routeIdx) => {
        const route = ALL_ROUTES[routeIdx];
        const srv = await startFreshServer();
        try {
          const res = await sendRequest(srv.baseUrl, route.method, route.path);
          assert.notEqual(res.status, 429, `Expected non-429 for ${route.method} ${route.path}`);
          assert.ok(
            res.headers.get("ratelimit-limit") !== null,
            "Expected ratelimit-limit header"
          );
          assert.ok(
            res.headers.get("ratelimit-remaining") !== null,
            "Expected ratelimit-remaining header"
          );
        } finally {
          await srv.close();
        }
      }
    ),
    { numRuns: 100 }
  );

  // Boundary test: 201st request must be 429
  {
    const srv = await startFreshServer();
    try {
      const route = ALL_ROUTES[0]; // GET /health — lightest route
      for (let i = 0; i < 200; i++) {
        const res = await sendRequest(srv.baseUrl, route.method, route.path);
        assert.notEqual(res.status, 429, `Request ${i + 1} should not be 429`);
      }
      const over = await sendRequest(srv.baseUrl, route.method, route.path);
      assert.equal(over.status, 429, "201st request should be 429");
    } finally {
      await srv.close();
    }
  }
}

// ── Property 2: Write limiter enforces its threshold ───────────────────────
// Feature: api-rate-limiting, Property 2: write limiter enforces its threshold
//
// For any write route, a fresh app should return non-429 for the first request.
// The boundary test (21st write request → 429) runs once outside fast-check.
//
// Validates: Requirements 2.2, 2.3

async function testProperty2() {
  // fast-check part: random write route, 1 request → non-429
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: WRITE_ROUTES.length - 1 }),
      async (routeIdx) => {
        const route = WRITE_ROUTES[routeIdx];
        const srv = await startFreshServer();
        try {
          const res = await sendRequest(srv.baseUrl, route.method, route.path, route.body);
          assert.notEqual(res.status, 429, `Expected non-429 for ${route.method} ${route.path}`);
        } finally {
          await srv.close();
        }
      }
    ),
    { numRuns: 100 }
  );

  // Boundary test: 21st write request must be 429
  {
    const srv = await startFreshServer();
    try {
      // Use PATCH with invalid email → Zod 400 before Prisma, still counts against write limiter
      const route = WRITE_ROUTES[1];
      for (let i = 0; i < 20; i++) {
        const res = await sendRequest(srv.baseUrl, route.method, route.path, route.body);
        assert.notEqual(res.status, 429, `Write request ${i + 1} should not be 429`);
      }
      const over = await sendRequest(srv.baseUrl, route.method, route.path, route.body);
      assert.equal(over.status, 429, "21st write request should be 429");
    } finally {
      await srv.close();
    }
  }
}

// ── Property 3: 429 responses always carry a JSON error body ──────────────
// Feature: api-rate-limiting, Property 3: 429 responses always carry a JSON error body
//
// When either limiter is exhausted, the response body must be a JSON object
// with an `error` string field.
//
// Validates: Requirements 1.4, 2.4
// numRuns: 10 — exhausting a limiter requires 20–201 requests per iteration;
// 10 iterations keeps the suite fast while still exercising both limiters.

async function testProperty3() {
  await fc.assert(
    fc.asyncProperty(
      // 0 = exhaust global limiter (via GET /health × 201)
      // 1 = exhaust write limiter (via PATCH × 21)
      fc.integer({ min: 0, max: 1 }),
      async (limiterType) => {
        const srv = await startFreshServer();
        try {
          let triggerRes: Response;
          if (limiterType === 0) {
            // Exhaust global limiter
            for (let i = 0; i < 200; i++) {
              await sendRequest(srv.baseUrl, "GET", "/health");
            }
            triggerRes = await sendRequest(srv.baseUrl, "GET", "/health");
          } else {
            // Exhaust write limiter using invalid body (Zod 400, no DB call)
            for (let i = 0; i < 20; i++) {
              await sendRequest(srv.baseUrl, "PATCH", "/profiles/nonexistent-user", { email: "not-an-email" });
            }
            triggerRes = await sendRequest(srv.baseUrl, "PATCH", "/profiles/nonexistent-user", { email: "not-an-email" });
          }

          assert.equal(triggerRes.status, 429, "Expected 429 after exhausting limiter");
          const body = await triggerRes.json();
          assert.equal(typeof body, "object", "Body must be an object");
          assert.ok(body !== null, "Body must not be null");
          assert.equal(typeof body.error, "string", "Body must have an error string field");
          assert.ok(body.error.length > 0, "error field must be non-empty");
        } finally {
          await srv.close();
        }
      }
    ),
    { numRuns: 10 }
  );
}

// ── Property 4: Rate limit headers present on all responses ───────────────
// Feature: api-rate-limiting, Property 4: rate limit headers present on all rate-limited responses
//
// For any request to any route, the response must include ratelimit-limit,
// ratelimit-remaining, and ratelimit-reset headers.
//
// Validates: Requirements 3.1, 3.2, 3.3

async function testProperty4() {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: ALL_ROUTES.length - 1 }),
      async (routeIdx) => {
        const route = ALL_ROUTES[routeIdx];
        const srv = await startFreshServer();
        try {
          const res = await sendRequest(srv.baseUrl, route.method, route.path);
          assert.ok(
            res.headers.get("ratelimit-limit") !== null,
            `Expected ratelimit-limit header for ${route.method} ${route.path}`
          );
          assert.ok(
            res.headers.get("ratelimit-remaining") !== null,
            `Expected ratelimit-remaining header for ${route.method} ${route.path}`
          );
          assert.ok(
            res.headers.get("ratelimit-reset") !== null,
            `Expected ratelimit-reset header for ${route.method} ${route.path}`
          );
        } finally {
          await srv.close();
        }
      }
    ),
    { numRuns: 100 }
  );
}

// ── Property 5: Write requests count against the global limit ─────────────
// Feature: api-rate-limiting, Property 5: write requests count against the global limit
//
// For any write request, the global RateLimit-Remaining value must decrement
// by 1 between consecutive requests (confirming the global limiter counted it).
//
// Validates: Requirements 2.6

async function testProperty5() {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: WRITE_ROUTES.length - 1 }),
      async (routeIdx) => {
        const route = WRITE_ROUTES[routeIdx];
        const srv = await startFreshServer();
        try {
          // First request — captures the initial remaining count
          const res1 = await sendRequest(srv.baseUrl, route.method, route.path, route.body);
          const remaining1 = parseInt(res1.headers.get("ratelimit-remaining") ?? "-1", 10);
          assert.ok(remaining1 >= 0, "ratelimit-remaining must be a non-negative integer");

          // Second request — remaining must have decremented by 1
          const res2 = await sendRequest(srv.baseUrl, route.method, route.path, route.body);
          const remaining2 = parseInt(res2.headers.get("ratelimit-remaining") ?? "-1", 10);
          assert.ok(remaining2 >= 0, "ratelimit-remaining must be a non-negative integer");

          assert.equal(
            remaining2,
            remaining1 - 1,
            `Global RateLimit-Remaining should decrement by 1: was ${remaining1}, now ${remaining2}`
          );
        } finally {
          await srv.close();
        }
      }
    ),
    { numRuns: 100 }
  );
}

// ── Property 6: Profile creation limiter enforces 3-per-hour threshold ────
// Feature: profile-creation-rate-limiting, Property 6: profile creation limiter
//
// POST /profiles must return 429 on the 4th request from the same IP within
// an hour. Uses an invalid body so Zod rejects it (400) before Prisma is
// called — the profileCreationLimiter runs before the handler and still
// counts the request.
//
// Validates: Issue #316 acceptance criteria

async function testProperty6() {
  // fast-check part: first request to POST /profiles → non-429
  await fc.assert(
    fc.asyncProperty(
      fc.constant(null),
      async () => {
        const srv = await startFreshServer();
        try {
          const res = await sendRequest(srv.baseUrl, "POST", "/profiles", { username: "x" });
          assert.notEqual(res.status, 429, "First POST /profiles should not be 429");
        } finally {
          await srv.close();
        }
      }
    ),
    { numRuns: 10 }
  );

  // Boundary test: 4th POST /profiles must be 429
  {
    const srv = await startFreshServer();
    try {
      for (let i = 0; i < 3; i++) {
        const res = await sendRequest(srv.baseUrl, "POST", "/profiles", { username: "x" });
        assert.notEqual(res.status, 429, `Profile creation request ${i + 1} should not be 429`);
      }
      const over = await sendRequest(srv.baseUrl, "POST", "/profiles", { username: "x" });
      assert.equal(over.status, 429, "4th POST /profiles should be 429");

      // Verify the error body has the correct structure
      const body = await over.json();
      assert.equal(typeof body.error, "string", "429 body must have an error string");
      assert.ok(body.error.length > 0, "error field must be non-empty");
      assert.equal(body.code, "PROFILE_CREATION_RATE_LIMIT_EXCEEDED", "429 body must have correct code");
    } finally {
      await srv.close();
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  await runTest(
    "Property 1: global limiter enforces its threshold (fast-check × 100 + boundary)",
    testProperty1
  );
  await runTest(
    "Property 2: write limiter enforces its threshold (fast-check × 100 + boundary)",
    testProperty2
  );
  await runTest(
    "Property 3: 429 responses always carry a JSON error body (fast-check × 10)",
    testProperty3
  );
  await runTest(
    "Property 4: rate limit headers present on all responses (fast-check × 100)",
    testProperty4
  );
  await runTest(
    "Property 5: write requests count against the global limit (fast-check × 100)",
    testProperty5
  );
  await runTest(
    "Property 6: profile creation limiter enforces 3-per-hour threshold (fast-check × 10 + boundary)",
    testProperty6
  );
}

main().catch((err) => {
  console.error("Property-based tests failed.");
  console.error(err);
  process.exit(1);
});
