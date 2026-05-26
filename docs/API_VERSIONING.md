# API Versioning

NovaSupport uses URL-based API versioning. All endpoints are available under `/v1/`.

## Current Version

**v1** — stable, actively maintained.

## How to Use

Prefix every request with `/v1/`:

```
GET  /v1/profiles
POST /v1/auth/challenge
GET  /v1/profiles/:username/stats
```

## Response Headers

Every response includes versioning headers:

| Header | Example | Description |
|--------|---------|-------------|
| `API-Version` | `1` | The current API version |
| `X-Supported-API-Versions` | `1` | All supported versions |

Deprecated (unversioned) routes also include:

| Header | Description |
|--------|-------------|
| `Deprecation` | Date when the unversioned route will be removed |
| `Sunset` | Same as Deprecation — RFC 8594 compliant |
| `Link` | Points to the successor `/v1` route |

## Unversioned Routes (Deprecated)

The original unversioned routes (e.g. `GET /profiles`) still work but are
deprecated. They return the same responses as `/v1/` but include deprecation
headers to signal that clients should migrate.

**Unversioned routes will be removed on 2027-01-01.**

## Endpoint Reference

All endpoints below are available at both `/v1/<path>` and `/<path>` (deprecated).

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/auth/challenge` | Request a challenge nonce |
| POST | `/v1/auth/verify` | Verify signature, receive JWT |

### Profiles
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/profiles` | — | List profiles (paginated) |
| GET | `/v1/profiles/search` | — | Search profiles |
| POST | `/v1/profiles` | ✓ | Create profile |
| GET | `/v1/profiles/:username` | — | Get profile |
| PATCH | `/v1/profiles/:username` | ✓ | Update profile |
| PATCH | `/v1/profiles/:username/assets` | ✓ | Replace accepted assets |
| POST | `/v1/profiles/:username/avatar` | ✓ | Upload avatar |
| GET | `/v1/profiles/:username/stats` | — | Profile statistics |
| GET | `/v1/profiles/:username/transactions` | — | Transaction history |
| GET | `/v1/profiles/:username/leaderboard` | — | Top supporters |
| POST | `/v1/profiles/:username/verify-email` | — | Verify email token |
| POST | `/v1/profiles/:username/resend-verification-email` | ✓ | Resend verification |

### Milestones
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/profiles/:username/milestones` | — | List milestones |
| POST | `/v1/profiles/:username/milestones` | ✓ | Create milestone |
| PATCH | `/v1/profiles/:username/milestones/:id` | ✓ | Update milestone |
| DELETE | `/v1/profiles/:username/milestones/:id` | ✓ | Delete milestone |

### Webhooks
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/profiles/:username/webhooks` | ✓ | List webhooks |
| POST | `/v1/profiles/:username/webhooks` | ✓ | Create webhook |
| DELETE | `/v1/profiles/:username/webhooks/:id` | ✓ | Delete webhook |
| GET | `/v1/profiles/:username/webhooks/:id/deliveries` | ✓ | Delivery history |

### Analytics
| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/analytics/:campaignId` | Campaign analytics |
| GET | `/v1/profiles/:username/analytics/timeseries` | Time-series data |
| GET | `/v1/profiles/:username/analytics/assets` | Asset breakdown |

### Support Transactions
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/support-transactions` | ✓ | Record a transaction |

### Recurring Support
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/recurring-support` | ✓ | List subscriptions |
| POST | `/v1/recurring-support` | ✓ | Create subscription |
| GET | `/v1/recurring-support/:id` | ✓ | Get subscription |
| PATCH | `/v1/recurring-support/:id` | ✓ | Pause/cancel |
| DELETE | `/v1/recurring-support/:id` | ✓ | Delete subscription |

### Supporters
| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/supporters/:address` | Supporter profile and history |

### Utilities
| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/health` | Health check |
| GET | `/v1/indexer/status` | Indexer status |
| GET | `/docs` | Swagger UI |
| GET | `/docs.json` | OpenAPI spec |

## Migration Guide

Replace the base path in your client:

```diff
- const BASE = "https://api.novasupport.xyz"
+ const BASE = "https://api.novasupport.xyz/v1"
```

No request bodies, query parameters, or response shapes have changed in v1.
