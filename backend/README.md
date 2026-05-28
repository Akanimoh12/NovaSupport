# NovaSupport Backend

Express + Prisma API service for profile and support metadata.

## Quick Start

```bash
cp .env.example .env
npm install
npm run db:setup
npm run dev
```

Runs on `http://localhost:4001` (configurable via `PORT`).

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values. All available variables are documented with inline comments in `.env.example`.

## CORS Configuration

### `ALLOWED_ORIGINS`

Controls which frontend origins are permitted to make cross-origin requests to the API.

**Format:** Comma-separated list of full origins (protocol + host + optional port).

```
ALLOWED_ORIGINS=http://localhost:3000,https://nova-support.vercel.app
```

**Rules:**

- Each origin must include the protocol (`http://` or `https://`).
- Port numbers are significant — `localhost:3000` and `localhost:4001` are different origins.
- Trailing slashes and whitespace around commas are trimmed automatically.
- The wildcard `*` is **not** supported as a list member. See below.

### Allowing All Origins (Wildcard)

Setting `ALLOWED_ORIGINS=*` will **not** work out of the box — the current CORS middleware compares origins by exact string match. To allow all origins:

1. Modify `src/app.ts` to detect `*` and pass `true` instead of using the origin callback.
2. Be aware that browsers block credentialed requests (cookies, `Authorization` headers) when `Access-Control-Allow-Origin: *` is used. If your API relies on cookies or JWTs in Authorization headers, you **must** list explicit origins instead.

### Examples

| Environment | Value |
|---|---|
| Local dev (Next.js) | `ALLOWED_ORIGINS=http://localhost:3000` |
| Local dev (Vite) | `ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173` |
| Production | `ALLOWED_ORIGINS=https://nova-support.vercel.app` |
| Staging + Prod | `ALLOWED_ORIGINS=https://staging.novasupport.xyz,https://app.novasupport.xyz` |

### Security Implications

- **Narrow allowlists are safer.** Only add origins you control. Adding `http://localhost:*` or arbitrary third-party URLs could expose your API to CSRF-style attacks.
- **Credentials require exact origins.** If your frontend sends cookies or `Authorization` headers, the browser requires a specific (non-wildcard) `Access-Control-Allow-Origin` header. The current setup already enforces this by taking the `origin` from the request and echoing it back in the response.
- **Requests without an origin** (e.g., `curl`, Postman, server-to-server calls) are always allowed — the CORS middleware passes them through.

## Preflight Requests

Browsers automatically send an `OPTIONS` preflight request before any cross-origin request that uses:

- Methods other than `GET`, `HEAD`, or `POST`
- Headers other than `Accept`, `Accept-Language`, `Content-Language`, or `Content-Type` with a safe value
- `Content-Type` values like `application/json`
- `Authorization` headers
- Credentials mode

The Express `cors` middleware handles preflight automatically. When a preflight arrives:

1. The middleware checks the `Origin` header against `ALLOWED_ORIGINS`.
2. If allowed, it responds with `200 OK` and the appropriate `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, and `Access-Control-Allow-Origin` headers.
3. The browser then sends the actual request.

No manual `OPTIONS` route handlers are needed.

## Troubleshooting CORS Errors

### Symptom: `Access to fetch at '...' from origin '...' has been blocked by CORS policy`

This is the classic browser CORS error. Check:

1. **Verify the origin is listed.** Open `.env` and confirm the exact origin the browser is sending (including protocol and port) is in `ALLOWED_ORIGINS`.
2. **Check for typos.** Trailing slashes, missing `https://`, or wrong port numbers are common mistakes.
3. **Restart the backend.** Changes to `.env` require a server restart.

### Symptom: Works in Postman but not in the browser

Postman does not enforce CORS. The browser does. This is normal and means your `ALLOWED_ORIGINS` likely does not include the frontend origin.

### Symptom: Preflight `OPTIONS` request returns 403/500

1. Check the backend logs — the CORS middleware throws `"Not allowed by CORS"` when the origin is not in the allowlist.
2. Verify the preflight `OPTIONS` request is not hitting a rate limiter before the CORS middleware runs. Express middleware executes in the order it is registered. In `src/app.ts`, `cors()` is registered before `rateLimit`.

### Symptom: `Authorization` header not sent (JWT missing on requests)

Browsers strip sensitive headers on cross-origin requests unless the server explicitly allows credentials. Ensure:

1. Your CORS configuration does not use a wildcard origin.
2. The frontend includes `credentials: 'include'` or sets the `Authorization` header explicitly (both work with the current explicit-origin setup).

### Quick health check

```bash
curl -I -X OPTIONS \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  http://localhost:4001/
```

A `200 OK` response with `Access-Control-Allow-Origin: http://localhost:3000` means CORS is configured correctly for that origin. Replace the port if your backend runs on a different one.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run start` | Start production server |
| `npm run build` | Compile TypeScript |
| `npm run test` | Run test suite |
| `npm run lint` | Lint with ESLint |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:seed` | Seed the database |
| `npm run db:setup` | Generate + migrate + seed |
