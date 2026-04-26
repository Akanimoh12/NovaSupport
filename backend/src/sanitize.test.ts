import assert from "node:assert";
import {
  sanitizeString,
  sanitizeObject,
  sanitizeBody,
  sanitizeQuery,
} from "./middleware/sanitize.js";

async function runTest(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(error);
    process.exit(1);
  }
}

async function main() {
  console.log("Running sanitization tests...\n");

  // Test 1: Basic HTML sanitization
  await runTest("sanitizeString strips HTML tags from bio", async () => {
    const { result } = sanitizeString("bio", "<script>evil()</script>Hello World");
    assert.equal(result, "Hello World");
  });

  // Test 2: URL normalization
  await runTest("sanitizeString normalizes URLs", async () => {
    const { result } = sanitizeString("websiteUrl", "example.com");
    assert.equal(result, "https://example.com/");
  });

  // Test 3: Invalid URL blocking
  await runTest("sanitizeString blocks invalid URLs", async () => {
    const { result } = sanitizeString("websiteUrl", "ftp://example.com");
    assert.equal(result, "");
  });

  // Test 4: Private IP blocking
  await runTest("sanitizeString blocks private IPs", async () => {
    const { result } = sanitizeString("websiteUrl", "http://192.168.1.1");
    assert.equal(result, "");
  });

  // Test 5: Twitter handle sanitization
  await runTest("sanitizeString validates Twitter handles", async () => {
    const { result } = sanitizeString("twitterHandle", "@john_doe123");
    assert.equal(result, "john_doe123");
  });

  // Test 6: Invalid Twitter handle
  await runTest("sanitizeString cleans invalid Twitter handles", async () => {
    const { result } = sanitizeString("twitterHandle", "invalid@handle!");
    assert.equal(result, "invalidhandle");
  });

  // Test 7: GitHub handle validation
  await runTest("sanitizeString validates GitHub handles", async () => {
    const { result } = sanitizeString("githubHandle", "user-name");
    assert.equal(result, "user-name");
  });

  // Test 8: Email normalization
  await runTest("sanitizeString normalizes emails", async () => {
    const { result } = sanitizeString("email", "  User@Example.COM  ");
    assert.equal(result, "user@example.com");
  });

  // Test 9: Length limits
  await runTest("sanitizeString enforces length limits", async () => {
    const longBio = "a".repeat(600);
    const { result } = sanitizeString("bio", longBio);
    assert.equal(result.length, 500);
  });

  // Test 10: Control character removal
  await runTest("sanitizeString removes control characters", async () => {
    const input = "Hello\x00\x01World\x7F";
    const { result } = sanitizeString("displayName", input);
    assert.equal(result, "HelloWorld");
  });

  // Test 11: Lowercase transformation
  await runTest("sanitizeString converts to lowercase", async () => {
    const { result } = sanitizeString("username", "UserName123");
    assert.equal(result, "username123");
  });

  // Test 12: XSS prevention
  await runTest("sanitizeString prevents XSS attacks", async () => {
    const xssPayload = "<img src=x onerror=alert(1)>Hello";
    const { result } = sanitizeString("bio", xssPayload);
    assert.equal(result, "Hello");
    assert.ok(!result.includes("<img"));
    assert.ok(!result.includes("onerror"));
  });

  // Test 13: Middleware integration
  await runTest("sanitizeBody middleware works correctly", async () => {
    const req = {
      body: { 
        bio: "<script>evil()</script>Hello", 
        displayName: "  World  ",
        websiteUrl: "example.com",
        twitterHandle: "@test123"
      },
      method: "POST",
      path: "/test",
      ip: "127.0.0.1",
      get: () => "test-agent",
    } as any;
    const res = {} as any;
    
    await new Promise<void>((resolve) => sanitizeBody(req, res, resolve));
    
    assert.equal(req.body.bio, "Hello");
    assert.equal(req.body.displayName, "World");
    assert.equal(req.body.websiteUrl, "https://example.com/");
    assert.equal(req.body.twitterHandle, "test123");
  });

  // Test 14: Query parameter sanitization
  await runTest("sanitizeQuery middleware works correctly", async () => {
    const req = {
      query: { 
        q: "  search term  ", 
        tags: ["  tag1  ", "<b>tag2</b>content", "normal_tag"],
        page: "1" 
      },
      method: "GET",
      path: "/search",
      ip: "127.0.0.1",
      get: () => "test-agent",
    } as any;
    const res = {} as any;
    
    await new Promise<void>((resolve) => sanitizeQuery(req, res, resolve));
    
    assert.equal(req.query.q, "search term");
    // HTML tags are stripped, so <b>tag2</b>content becomes tag2content
    assert.deepEqual(req.query.tags, ["tag1", "tag2content", "normal_tag"]);
    assert.equal(req.query.page, "1");
  });

  // Test 15: Suspicious domain blocking
  await runTest("sanitizeString blocks suspicious domains", async () => {
    const { result } = sanitizeString("websiteUrl", "http://example.tk");
    assert.equal(result, "");
  });

  // Test 16: Complex nested object sanitization
  await runTest("sanitizeObject handles nested structures", async () => {
    const input = {
      profile: {
        bio: "<script>alert(1)</script>Clean bio",
        social: {
          twitterHandle: "@user123",
          websiteUrl: "example.com"
        }
      },
      // Note: Arrays in objects are processed as generic strings, not field-specific
      metadata: {
        description: "<b>Clean description</b>",
        count: 42
      }
    };

    const { result } = sanitizeObject(input);
    const output = result as any;
    
    assert.equal(output.profile.bio, "Clean bio");
    assert.equal(output.profile.social.twitterHandle, "user123");
    assert.equal(output.profile.social.websiteUrl, "https://example.com/");
    assert.equal(output.metadata.description, "Clean description");
    assert.equal(output.metadata.count, 42);
  });

  console.log("\n✅ All sanitization tests passed!");
}

main().catch(console.error);