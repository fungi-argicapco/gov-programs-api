# Program API Contract (Canvas + Auth)

## Authentication Overview

- Session state is managed with an HttpOnly cookie (`fungi_session` by default). A session is created on successful `/v1/auth/login` and rotated via `/v1/auth/refresh`.
- Passwords are salted SHA-256 digests stored in Cloudflare D1 (`users.password_hash`).
- Multi-factor authentication uses TOTP (RFC 6238). Secrets are stored in `mfa_methods` with type `totp`.
- Email tokens (`email_tokens` table) are used for approval links, password invites, and MFA enrollments.

All responses include `schema_version: 1` for payloads defined below. Errors use the existing `apiError` format: `{ error: string; message?: string; [extra] }` with HTTP status codes.

## Schemas

### UserProfile
```
{
  schema_version: 1,
  id: string,
  email: string,
  display_name: string,
  status: "pending" | "active" | "disabled",
  apps: { website: boolean; program: boolean; canvas: boolean },
  roles: string[],
  mfa_enrolled: boolean,
  mfa_methods: Array<{ id: string; type: "totp" | "webauthn"; verified_at: string | null }>,
  last_login_at: string | null,
  created_at: string,
  updated_at: string
}
```

### Canvas
```
{
  schema_version: 1,
  id: string,
  owner_id: string,
  title: string,
  summary?: string,
  content: Record<string, unknown>,
  status: "active" | "archived",
  created_at: string,
  updated_at: string
}
```

### Session
```
{
  schema_version: 1,
  id: string,
  user_id: string,
  issued_at: string,
  expires_at: string,
  mfa_required: boolean,
  ip?: string,
  ua?: string
}
```

## Endpoints

### POST /v1/account/request
Request body: `accountRequestCreateSchema`.
Response 202: `{ status: "pending", request: AccountRequest, decision_token_expires_at: string }`

### POST /v1/account/decision
Request body: `{ token: string, decision: "approve" | "decline", reviewer_comment?: string }`.
Approvals seed the D1 user record, create an invite token, and email the requester.

### POST /v1/account/accept-invite
Body: `{ token: string, password: string, totp_code?: string }`.
Sets the user password (12+ chars). When complete, the invite token is invalidated.

### POST /v1/auth/login
Body: `{ email: string, password: string, totp_code?: string }`.
- If MFA required and no `totp_code` provided → `401 { error: "mfa_required", methods: ["totp"] }`.
- On success → `200 { user: UserProfile, session: { id, expires_at } }` and sets the session cookie.

### POST /v1/auth/logout
Requires active session; deletes session row and clears cookie. Response `{ ok: true }`.

### POST /v1/auth/refresh
Rotates the session and cookie. Response mirrors `/v1/auth/login`.

### GET /v1/auth/me
Returns `{ user: UserProfile, session: Session }`.

### POST /v1/auth/mfa/totp/enroll
Creates a new (or resets) TOTP secret. Response `{ secret: string, uri: string }`.

### POST /v1/auth/mfa/totp/verify
Body `{ code: string }`. Verifies the secret and marks MFA as enrolled.

### Canvas routes (require session)
- `GET /v1/canvases` → `{ data: Canvas[] }`
- `POST /v1/canvases` body `canvasCreateSchema` → `201 { canvas: Canvas }`
- `GET /v1/canvases/:id` → `{ canvas: Canvas }`
- `PATCH /v1/canvases/:id` body `canvasUpdateSchema` → `{ canvas: Canvas }`
- `DELETE /v1/canvases/:id` → `{ ok: true }`
- `GET /v1/canvases/:id/versions` → `{ data: CanvasVersion[] }`

## Email Notifications

Emails are currently logged (Cloudflare Email Routing integration pending). Templates:
- Admin approval links (approve/decline).
- Requester notifications for approval/decline.
- Invite email with password setup link (`/account/activate?token=...`).

## Data Storage

Tables introduced in migrations 0010/0011:
- `users`: profile + password hash + MFA flags.
- `mfa_methods`: per-user MFA configuration (`totp`).
- `sessions`: active sessions with expiry.
- `account_requests`: pending/approved/declined requests.
- `email_tokens`: decision, invite, MFA tokens.
- `canvases` / `canvas_versions`: persistent lean canvases.

All timestamps are ISO8601 strings (UTC).
