# Lean Canvas API Specification

This document defines the REST contract that the Cloudflare Worker at `program.fungiagricap.com` must expose so that the Lean Canvas SvelteKit app and future fungiagricap properties can interoperate. All responses are JSON, all timestamps are RFC3339/ISO-8601 strings, and every payload includes a `schema_version` (currently `1`).

Authentication uses secure, HttpOnly cookies. The Worker creates both an access session (short lived) stored in D1 and a refresh token (hashed) also stored in D1. Clients never see the refresh token directly; the Worker issues and rotates it via cookies.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PROGRAM_API_BASE` | Base URL self reference. Defaults to `https://program.fungiagricap.com` but can point to a staging host. |
| `EMAIL_ADMIN` | Address that should receive account approval emails (e.g. `admin@fungiagricap.com`). |
| `EMAIL_SENDER` | Verified sender identity in Cloudflare Email Routing (`register@fungiagricap.com`). |
| `SESSION_COOKIE_NAME` | Optional override for the session cookie (default `fungi_session`). |
| `MFA_ISSUER` | Issuer string used when generating TOTP URIs (default `fungiagricap`). |
| `CLOUDFLARE_ZONE_ID` / `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | Already required for deployment. |
| `WORKERS_EMAIL_R2_BUCKET` (future) | Optional bucket for storing rendered email templates if we externalise content. |
|

Additional production credentials that must be provisioned:

- Cloudflare Email Routing must verify `register@fungiagricap.com` and forward admin notifications to `EMAIL_ADMIN`.
- Durable Object migrations are already defined in `wrangler.toml`; ensure the plan has Durable Object support.
- D1 must be migrated with `0010_canvas_onboarding.sql`.

## Security & Sessions

- Access cookie: name `SESSION_COOKIE_NAME`, `HttpOnly`, `Secure`, `SameSite=Lax`, 8 hour expiry.
- Refresh cookie: name `${SESSION_COOKIE_NAME}_rt`, same cookie attributes, 30 day expiry. Refresh tokens are stored SHA-256 hashed and rotated on every refresh.
- Password hashing: SHA-256 with 16 byte random salt (helper in `apps/api/src/security/password.ts`).
- MFA: default to TOTP. Future WebAuthn endpoints are delineated but can be disabled behind feature flag.

### Error Envelope

All error responses follow the existing convention: `{ "error": string, "message": string, "details"?: object }` with appropriate HTTP status.

## Endpoints

### 1. Account Onboarding

#### POST `/v1/account/request`
Submit a public signup request.

Request:
```json
{
  "email": "user@example.com",
  "display_name": "User Example",
  "requested_apps": {
    "website": false,
    "program": true,
    "canvas": true
  },
  "justification": "Optional context"
}
```

Response `202 Accepted`:
```json
{
  "status": "pending",
  "request": {
    "schema_version": 1,
    "id": "acct_a1b2",
    "email": "user@example.com",
    "display_name": "User Example",
    "requested_apps": { "website": false, "program": true, "canvas": true },
    "status": "pending",
    "created_at": "2025-09-29T14:30:00Z"
  },
  "decision_token_expires_at": "2025-10-06T14:30:00Z"
}
```

Side-effects: store request in D1, create email token, send admin email with approve/decline links.

#### POST `/v1/account/decision`
Consume approval/decline link.

Request:
```json
{
  "token": "decision_abc",
  "decision": "approve",
  "reviewer_comment": "Optional note"
}
```

Responses:
- `200 OK` with updated request body on success.
- `404` if token invalid.
- `410` if expired.
- `409` if already used.

When decision is `approve` the Worker:
1. Creates/updates user row in D1.
2. Seeds default “Lean Canvas Quickstart” canvas and first canvas version.
3. Sends approval email to requester.
4. Issues a one-time signup token (EMAIL_TOKEN with purpose `signup`).

When `decline`, Worker only records status and sends decline email.

### 2. Authentication & MFA

All auth endpoints return `401` with error envelope when credentials invalid. Session cookies are set using helper functions.

#### POST `/v1/auth/signup`
Used after approval email. Exchange a `signup` email token for initial password.

Request:
```json
{
  "token": "signup_xyz",
  "password": "S3cure!Password",
  "accept_terms": true
}
```

Responses:
- `200 OK` with `{ "schema_version": 1, "user": UserProfile }` and sets session/refresh cookies.
- `400` if password insufficient (minimum 12 chars, must include upper, lower, digit, symbol).

#### POST `/v1/auth/login`
Requires email + password.
```json
{ "email": "user@example.com", "password": "S3cure!Password" }
```

- `200 OK`: returns `{ "schema_version": 1, "user": UserProfile, "mfa_required": false }` and sets cookies.
- If MFA enrolled, returns `{ ..., "mfa_required": true, "challenge_id": "mfa_ch_123" }` without setting final session. Client must call MFA verify.

#### POST `/v1/auth/mfa/challenge`
Initiated automatically in login response but can be retried to re-send TOTP details (for WebAuthn future).

Request: `{ "challenge_id": "mfa_ch_123" }`

Response `200 OK`: `{ "schema_version": 1, "type": "totp" }`

#### POST `/v1/auth/mfa/verify`
Complete MFA challenge.
```json
{
  "challenge_id": "mfa_ch_123",
  "code": "123456"
}
```

`200 OK` sets final session cookies and returns `{ "schema_version": 1, "user": UserProfile }`.

#### POST `/v1/auth/mfa/setup`
Authenticated users can enroll TOTP.
- Request `{ "method": "totp" }`
- Response `200 OK` `{ "schema_version": 1, "secret": "base32", "otpauth_url": "otpauth://totp/..." }`

#### POST `/v1/auth/mfa/setup/confirm`
```json
{ "method_id": "mfa_abc", "code": "123456" }
```
Marks method verified.

#### POST `/v1/auth/logout`
Clears both cookies and deletes refresh token.

#### POST `/v1/auth/refresh`
Reads refresh cookie, rotates token, sets new cookies, returns `{ schema_version: 1 }`.

#### GET `/v1/auth/me`
Returns current `UserProfile`; `401` if session invalid.

### 3. Canvas API

All canvas endpoints require valid session; decline otherwise.

#### GET `/v1/canvases`
Query parameters: none (future support for pagination).
Response:
```json
{
  "schema_version": 1,
  "data": [Canvas]
}
```

#### POST `/v1/canvases`
Request: `canvasCreateSchema`
Response `201 Created`: `{ "schema_version": 1, "canvas": Canvas }`

#### GET `/v1/canvases/{id}`
Returns single canvas. `404` if not found.

#### PATCH `/v1/canvases/{id}`
Supports optimistic concurrency via `revision` field.
Request example:
```json
{
  "title": "Updated title",
  "content": { "problem": ["New insight"] },
  "revision": 3
}
```
Response `200 OK`: updated `Canvas`. Worker appends new row to `canvas_versions` with `diff` containing `{ "base_revision": 3 }` for now; future diff spec TBD.

On conflict (revision mismatch) response `409` with `{ "error": "conflict", "message": "Canvas has moved", "details": { "latest_revision": 4 } }`.

#### DELETE `/v1/canvases/{id}`
Soft delete not needed; immediate removal is acceptable. Response `204 No Content`.

#### GET `/v1/canvases/{id}/versions`
Returns chronological version history:
```json
{
  "schema_version": 1,
  "data": [CanvasVersion]
}
```

Future extension: `POST /v1/canvases/{id}/versions/{revision}/restore` to roll back.

## Data Model Summary

- `users`: core profile, email unique, stores JSON for app permissions + roles.
- `mfa_methods`: one-to-many. `type` currently `totp`, may add `webauthn`.
- `account_requests`: onboarding queue.
- `email_tokens`: multi-purpose (account decision, signup, password reset, etc.).
- `sessions`: stores access + refresh metadata.
- `canvases` & `canvas_versions`: current state + history. `content` is JSON object mirroring the Lean Canvas fields defined in the Svelte repo (`src/lib/schemas/index.ts`).

`exampleCanvasContent` in the Worker should stay aligned with the Svelte app default to avoid drift.

## Required API/Worker Privileges

The Cloudflare API token used for deployment must include:

- Account: Workers Scripts (read/write), Workers Routes (edit), Workers KV (write), D1 (write), Email Routing (edit) once email integration is automated.
- Zone: DNS edit (already required).

Additionally, enabling Email Routing requires verifying DNS records (MX, SPF, DKIM, DMARC). The deploy script should validate and optionally create these records in a future iteration.

## Outstanding Items

- Implement password complexity validation helper shared between Worker and Svelte.
- Add WebAuthn routes (`/v1/auth/mfa/webauthn/options`, `/v1/auth/mfa/webauthn/verify`) when platform support is ready.
- Define diff format for canvas versioning (currently placeholder `base_revision`).
- Create OpenAPI YAML mirroring this document once endpoints are live; consider automating via `ts-to-openapi` in a later sprint.
