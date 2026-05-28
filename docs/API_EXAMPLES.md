# NovaSupport API Examples

This document provides practical cURL and JavaScript examples for all NovaSupport API endpoints.

## Base URL

```
http://localhost:4000
```

## Authentication

Most write operations require a JWT token obtained through the authentication flow.

### 1. Request Challenge

**cURL:**
```bash
curl -X POST http://localhost:4000/auth/challenge \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI"
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/auth/challenge', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    walletAddress: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI'
  })
});

const data = await response.json();
console.log(data);
// { challenge: "...", walletAddress: "..." }
```

### 2. Verify Signature

**cURL:**
```bash
curl -X POST http://localhost:4000/auth/verify \
  -H "Content-Type: application/json" \
  -d '{
    "walletAddress": "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
    "signature": "a1b2c3d4e5f6..."
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/auth/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    walletAddress: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
    signature: 'a1b2c3d4e5f6...'
  })
});

const data = await response.json();
console.log(data);
// { token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", walletAddress: "...", userId: "..." }
```

## Profiles

### 3. List Profiles

**cURL:**
```bash
curl "http://localhost:4000/profiles?limit=20&offset=0&sort=newest&asset=XLM"
```

**JavaScript:**
```javascript
const params = new URLSearchParams({
  limit: '20',
  offset: '0',
  sort: 'newest',
  asset: 'XLM'
});

const response = await fetch(`http://localhost:4000/profiles?${params}`);
const data = await response.json();
console.log(data);
// { profiles: [...], total: 42, limit: 20, offset: 0 }
```

### 4. Get Profile by Username

**cURL:**
```bash
curl http://localhost:4000/profiles/johndoe
```

**JavaScript:**
```javascript
const username = 'johndoe';
const response = await fetch(`http://localhost:4000/profiles/${username}`);
const profile = await response.json();
console.log(profile);
// { id: "...", username: "johndoe", displayName: "John Doe", ... }
```

### 5. Create Profile

**cURL:**
```bash
curl -X POST http://localhost:4000/profiles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "username": "johndoe",
    "displayName": "John Doe",
    "bio": "Creator and developer",
    "walletAddress": "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
    "email": "john@example.com",
    "websiteUrl": "https://johndoe.com",
    "twitterHandle": "johndoe",
    "githubHandle": "johndoe",
    "acceptedAssets": [
      { "code": "XLM" },
      { "code": "USDC", "issuer": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" }
    ]
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    username: 'johndoe',
    displayName: 'John Doe',
    bio: 'Creator and developer',
    walletAddress: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
    email: 'john@example.com',
    websiteUrl: 'https://johndoe.com',
    twitterHandle: 'johndoe',
    githubHandle: 'johndoe',
    acceptedAssets: [
      { code: 'XLM' },
      { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' }
    ]
  })
});

const profile = await response.json();
console.log(profile);
```

### 6. Update Profile

**cURL:**
```bash
curl -X PATCH http://localhost:4000/profiles/johndoe \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "displayName": "John Doe Updated",
    "bio": "Updated bio text",
    "websiteUrl": "https://newsite.com"
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles/johndoe', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    displayName: 'John Doe Updated',
    bio: 'Updated bio text',
    websiteUrl: 'https://newsite.com'
  })
});

const updated = await response.json();
console.log(updated);
```

### 7. Search Profiles

**cURL:**
```bash
curl "http://localhost:4000/profiles/search?q=john"
```

**JavaScript:**
```javascript
const query = 'john';
const response = await fetch(`http://localhost:4000/profiles/search?q=${encodeURIComponent(query)}`);
const results = await response.json();
console.log(results);
// [{ username: "johndoe", displayName: "John Doe", ... }]
```

### 8. Get Profile Stats

**cURL:**
```bash
curl http://localhost:4000/profiles/johndoe/stats
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles/johndoe/stats');
const stats = await response.json();
console.log(stats);
// { totalTransactions: 42, uniqueSupporters: 15, totalByAsset: [...] }
```

### 9. Update Accepted Assets

**cURL:**
```bash
curl -X PATCH http://localhost:4000/profiles/johndoe/assets \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "assets": [
      { "code": "XLM" },
      { "code": "USDC", "issuer": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" }
    ]
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles/johndoe/assets', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    assets: [
      { code: 'XLM' },
      { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' }
    ]
  })
});

const updated = await response.json();
console.log(updated);
```

### 10. Upload Avatar

**cURL:**
```bash
curl -X POST http://localhost:4000/profiles/johndoe/avatar \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "avatar=@/path/to/image.jpg"
```

**JavaScript:**
```javascript
const formData = new FormData();
const fileInput = document.querySelector('input[type="file"]');
formData.append('avatar', fileInput.files[0]);

const response = await fetch('http://localhost:4000/profiles/johndoe/avatar', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: formData
});

const updated = await response.json();
console.log(updated);
```

## Transactions

### 11. Get Profile Transactions

**cURL:**
```bash
curl "http://localhost:4000/profiles/johndoe/transactions?limit=20&offset=0"
```

**JavaScript:**
```javascript
const params = new URLSearchParams({
  limit: '20',
  offset: '0'
});

const response = await fetch(`http://localhost:4000/profiles/johndoe/transactions?${params}`);
const data = await response.json();
console.log(data);
// { transactions: [...], total: 42, limit: 20, offset: 0 }
```

### 12. Record Support Transaction

**cURL:**
```bash
curl -X POST http://localhost:4000/support-transactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "txHash": "a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890",
    "amount": "100.0000000",
    "assetCode": "XLM",
    "status": "SUCCESS",
    "message": "Keep up the great work!",
    "stellarNetwork": "TESTNET",
    "supporterAddress": "GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM",
    "recipientAddress": "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
    "profileId": "clx1234567890"
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/support-transactions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    txHash: 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890',
    amount: '100.0000000',
    assetCode: 'XLM',
    status: 'SUCCESS',
    message: 'Keep up the great work!',
    stellarNetwork: 'TESTNET',
    supporterAddress: 'GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM',
    recipientAddress: 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI',
    profileId: 'clx1234567890'
  })
});

const transaction = await response.json();
console.log(transaction);
```

## Leaderboard

### 13. Get Profile Leaderboard

**cURL:**
```bash
curl "http://localhost:4000/profiles/johndoe/leaderboard?limit=10&offset=0&sort=total_amount"
```

**JavaScript:**
```javascript
const params = new URLSearchParams({
  limit: '10',
  offset: '0',
  sort: 'total_amount'
});

const response = await fetch(`http://localhost:4000/profiles/johndoe/leaderboard?${params}`);
const data = await response.json();
console.log(data);
// { leaderboard: [...], total: 15, limit: 10, offset: 0, sort: "total_amount" }
```

## Milestones

### 14. Create Milestone

**cURL:**
```bash
curl -X POST http://localhost:4000/profiles/johndoe/milestones \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "New Equipment Fund",
    "description": "Raising funds for new recording equipment",
    "targetAmount": "5000.0000000",
    "assetCode": "XLM"
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles/johndoe/milestones', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    title: 'New Equipment Fund',
    description: 'Raising funds for new recording equipment',
    targetAmount: '5000.0000000',
    assetCode: 'XLM'
  })
});

const milestone = await response.json();
console.log(milestone);
```

### 15. Get Profile Milestones

**cURL:**
```bash
curl http://localhost:4000/profiles/johndoe/milestones
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles/johndoe/milestones');
const data = await response.json();
console.log(data);
// { milestones: [...] }
```

## Webhooks

### 16. Create Webhook

**cURL:**
```bash
curl -X POST http://localhost:4000/profiles/johndoe/webhooks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "url": "https://example.com/webhook"
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles/johndoe/webhooks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    url: 'https://example.com/webhook'
  })
});

const webhook = await response.json();
console.log(webhook);
// { id: "...", url: "https://example.com/webhook", secret: "..." }
```

### 17. List Webhooks

**cURL:**
```bash
curl http://localhost:4000/profiles/johndoe/webhooks \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles/johndoe/webhooks', {
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  }
});

const webhooks = await response.json();
console.log(webhooks);
// [{ id: "...", url: "...", active: true, createdAt: "..." }]
```

### 18. Delete Webhook

**cURL:**
```bash
curl -X DELETE http://localhost:4000/profiles/johndoe/webhooks/webhook-id-123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**JavaScript:**
```javascript
const webhookId = 'webhook-id-123';
const response = await fetch(`http://localhost:4000/profiles/johndoe/webhooks/${webhookId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  }
});

console.log(response.status);
// 204
```

## Analytics

### 19. Get Campaign Analytics

**cURL:**
```bash
curl "http://localhost:4000/analytics/johndoe?limit=10&offset=0"
```

**JavaScript:**
```javascript
const params = new URLSearchParams({
  limit: '10',
  offset: '0'
});

const response = await fetch(`http://localhost:4000/analytics/johndoe?${params}`);
const analytics = await response.json();
console.log(analytics);
// { profile: {...}, summary: {...}, dailyContributions: [...], assetBreakdown: [...], recentTransactions: [...] }
```

### 20. Get Time-Series Analytics

**cURL:**
```bash
curl "http://localhost:4000/profiles/johndoe/analytics/timeseries?period=daily&from=2024-01-01&to=2024-01-31&assetCode=XLM"
```

**JavaScript:**
```javascript
const params = new URLSearchParams({
  period: 'daily',
  from: '2024-01-01',
  to: '2024-01-31',
  assetCode: 'XLM'
});

const response = await fetch(`http://localhost:4000/profiles/johndoe/analytics/timeseries?${params}`);
const data = await response.json();
console.log(data);
// [{ date: "2024-01-01", total: "100.0000000", txCount: 5 }, ...]
```

### 21. Get Asset Breakdown

**cURL:**
```bash
curl http://localhost:4000/profiles/johndoe/analytics/assets
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles/johndoe/analytics/assets');
const data = await response.json();
console.log(data);
// { breakdown: [{ assetCode: "XLM", amount: 1000.0, percentage: 75.5 }], total: 1324.5 }
```

## Email Verification

### 22. Verify Email

**cURL:**
```bash
curl -X POST http://localhost:4000/profiles/johndoe/verify-email \
  -H "Content-Type: application/json" \
  -d '{
    "token": "a1b2c3d4e5f6..."
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles/johndoe/verify-email', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    token: 'a1b2c3d4e5f6...'
  })
});

const result = await response.json();
console.log(result);
// { ok: true, message: "Email verified successfully" }
```

## Health Check

### 23. Health Check

**cURL:**
```bash
curl http://localhost:4000/health
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/health');
const health = await response.json();
console.log(health);
// { ok: true, service: "NovaSupport backend", network: "Stellar Testnet", database: "connected" }
```

## Delete Profile

### 24. Delete Profile

**cURL:**
```bash
curl -X DELETE http://localhost:4000/profiles/johndoe \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles/johndoe', {
  method: 'DELETE',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  }
});

console.log(response.status);
// 204
```

## Notification Preferences

### 25. Get Notification Preferences

**cURL:**
```bash
curl http://localhost:4000/profiles/johndoe/notification-preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles/johndoe/notification-preferences', {
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  }
});

const prefs = await response.json();
console.log(prefs);
// { notifyOnSupport: true, notifyOnMilestone: true, weeklyDigest: false }
```

### 26. Update Notification Preferences

**cURL:**
```bash
curl -X PATCH http://localhost:4000/profiles/johndoe/notification-preferences \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "notifyOnSupport": true,
    "notifyOnMilestone": false,
    "weeklyDigest": true
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles/johndoe/notification-preferences', {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    notifyOnSupport: true,
    notifyOnMilestone: false,
    weeklyDigest: true
  })
});

const updated = await response.json();
console.log(updated);
// { notifyOnSupport: true, notifyOnMilestone: false, weeklyDigest: true }
```

## GitHub Profile Import

### 27. Import Profile from GitHub

**cURL:**
```bash
curl -X POST http://localhost:4000/profiles/johndoe/import/github \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "githubHandle": "johndoe"
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles/johndoe/import/github', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    githubHandle: 'johndoe'
  })
});

const updated = await response.json();
console.log(updated);
// Updated profile with bio, avatarUrl, websiteUrl populated from GitHub
```

## Transaction Export

### 28. Export Transactions as CSV

**cURL:**
```bash
curl "http://localhost:4000/profiles/johndoe/transactions/export" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -o transactions.csv
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles/johndoe/transactions/export', {
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  }
});

const csv = await response.text();
// "Created At","Amount","Asset","Supporter","Message",...
```

## Webhook Deliveries

### 29. List Webhook Deliveries

**cURL:**
```bash
curl "http://localhost:4000/profiles/johndoe/webhooks/webhook-id-123/deliveries?limit=20&offset=0" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**JavaScript:**
```javascript
const webhookId = 'webhook-id-123';
const params = new URLSearchParams({ limit: '20', offset: '0' });
const response = await fetch(
  `http://localhost:4000/profiles/johndoe/webhooks/${webhookId}/deliveries?${params}`,
  {
    headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
  }
);

const deliveries = await response.json();
console.log(deliveries);
// { deliveries: [...], total: 5, limit: 20, offset: 0 }
```

## Milestones (Update & Delete)

### 30. Update Milestone

**cURL:**
```bash
curl -X PATCH http://localhost:4000/profiles/johndoe/milestones/milestone-id-123 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "Updated Title",
    "description": "Updated description",
    "targetAmount": "7500.0000000"
  }'
```

**JavaScript:**
```javascript
const milestoneId = 'milestone-id-123';
const response = await fetch(
  `http://localhost:4000/profiles/johndoe/milestones/${milestoneId}`,
  {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    body: JSON.stringify({
      title: 'Updated Title',
      description: 'Updated description',
      targetAmount: '7500.0000000'
    })
  }
);

const milestone = await response.json();
console.log(milestone);
```

### 31. Delete Milestone

**cURL:**
```bash
curl -X DELETE http://localhost:4000/profiles/johndoe/milestones/milestone-id-123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**JavaScript:**
```javascript
const milestoneId = 'milestone-id-123';
const response = await fetch(
  `http://localhost:4000/profiles/johndoe/milestones/${milestoneId}`,
  {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
  }
);

console.log(response.status);
// 204
```

## Supporter Activity

### 32. Get Supporter Activity by Wallet Address

**cURL:**
```bash
curl "http://localhost:4000/supporters/GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM?limit=20&offset=0"
```

**JavaScript:**
```javascript
const address = 'GCZJM35NKGVK47BB4SPBDV25477PZYIYPVVG453LPYFNXLS3FGHDXOCM';
const params = new URLSearchParams({ limit: '20', offset: '0' });
const response = await fetch(`http://localhost:4000/supporters/${address}?${params}`);
const data = await response.json();
console.log(data);
// { transactions: [...], total: 10, limit: 20, offset: 0 }
```

## Recurring Support

### 33. Create Recurring Support

**cURL:**
```bash
curl -X POST http://localhost:4000/recurring-support \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "profileId": "clx1234567890",
    "amount": "10.0000000",
    "assetCode": "XLM",
    "frequency": "monthly",
    "message": "Monthly support!"
  }'
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/recurring-support', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    profileId: 'clx1234567890',
    amount: '10.0000000',
    assetCode: 'XLM',
    frequency: 'monthly',
    message: 'Monthly support!'
  })
});

const plan = await response.json();
console.log(plan);
```

### 34. List Recurring Support Plans

**cURL:**
```bash
curl http://localhost:4000/recurring-support \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/recurring-support', {
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});

const plans = await response.json();
console.log(plans);
// [{ id: "...", amount: "10.0000000", frequency: "monthly", status: "active", ... }]
```

### 35. Get Recurring Support Plan

**cURL:**
```bash
curl http://localhost:4000/recurring-support/plan-id-123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**JavaScript:**
```javascript
const planId = 'plan-id-123';
const response = await fetch(`http://localhost:4000/recurring-support/${planId}`, {
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});

const plan = await response.json();
console.log(plan);
```

### 36. Update Recurring Support Plan

**cURL:**
```bash
curl -X PATCH http://localhost:4000/recurring-support/plan-id-123 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "status": "paused"
  }'
```

**JavaScript:**
```javascript
const planId = 'plan-id-123';
const response = await fetch(`http://localhost:4000/recurring-support/${planId}`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({ status: 'paused' })
});

const updated = await response.json();
console.log(updated);
```

### 37. Cancel Recurring Support Plan

**cURL:**
```bash
curl -X DELETE http://localhost:4000/recurring-support/plan-id-123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**JavaScript:**
```javascript
const planId = 'plan-id-123';
const response = await fetch(`http://localhost:4000/recurring-support/${planId}`, {
  method: 'DELETE',
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});

console.log(response.status);
// 204
```

## Resend Email Verification

### 38. Resend Verification Email

**cURL:**
```bash
curl -X POST http://localhost:4000/profiles/johndoe/resend-verification \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles/johndoe/resend-verification', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer YOUR_JWT_TOKEN' }
});

const result = await response.json();
console.log(result);
// { ok: true, message: "Verification email sent" }
```

## Indexer Status

### 39. Get Indexer Status

**cURL:**
```bash
curl http://localhost:4000/indexer/status
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/indexer/status');
const status = await response.json();
console.log(status);
// { status: "running", lastProcessedLedger: 50123456, network: "TESTNET" }
```

## RSS Feed

### 40. Get Profile Activity RSS Feed

**cURL:**
```bash
curl http://localhost:4000/profiles/johndoe/feed.xml
```

**JavaScript:**
```javascript
const response = await fetch('http://localhost:4000/profiles/johndoe/feed.xml');
const xml = await response.text();
// Returns RSS/Atom XML feed of recent supporter activity
```

## Error Responses

All endpoints return consistent error responses:

**Success Response (200-299):**
```json
{
  "id": "...",
  "username": "johndoe",
  "displayName": "John Doe"
}
```

**Error Response (400-599):**
```json
{
  "error": "Profile not found",
  "code": "PROFILE_NOT_FOUND"
}
```

Common error codes:
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `INVALID_REQUEST` - Validation failed
- `UNAUTHORIZED` - Missing or invalid authentication
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `DUPLICATE_TX` - Transaction already recorded
- `EMAIL_TAKEN` - Email already in use
- `USERNAME_TAKEN` - Username already in use

## Rate Limiting

All endpoints are rate-limited. Check response headers:
- `RateLimit-Limit`: Request limit for the current window
- `RateLimit-Remaining`: Requests remaining in the current window
- `RateLimit-Reset`: Unix timestamp when the rate limit resets

**Example:**
```bash
curl -i http://localhost:4000/profiles

# Response headers:
# RateLimit-Limit: 200
# RateLimit-Remaining: 199
# RateLimit-Reset: 1704067200
```
