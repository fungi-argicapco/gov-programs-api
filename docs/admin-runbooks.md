# Admin Runbooks: Account & Canvas Operations

## Signing In
- Operators authenticate at `/account/login`. Successful logins drop an HttpOnly session cookie (`fungi_session`) that the Worker checks on every request.
- Accounts with TOTP enabled will trigger a second step; enter the 6 digit code or use the emailed decision link to bootstrap MFA.
- Sessions can be refreshed with the hidden `*_rt` cookie—users do not see the raw refresh token.
- Activation emails land on `/account/activate?token=…`. Set your password there; expired or empty links can be reissued from the “Need a new activation email?” form on the sign-in page.

## Approving Account Requests
Inbound requests flow through the access portal served at `/`, which writes to `account_requests` and emails the operator distribution list configured via `EMAIL_ADMIN`.

1. Visit `/admin` after signing in to view the pending queue. Each row exposes justification, requested apps, and timestamps.
2. Approve or decline directly from the console; the Worker applies the decision using the embedded token and records the audit trail.
3. On approval the backend will:
   - Update the `account_requests` row to `approved`.
   - Provision the user profile and default “Lean Canvas Quickstart” canvas (if the user is new).
   - Issue a one-time signup token (24 hour TTL) and dispatch both the approval and activation emails.
4. Confirm the onboarding email landed by checking Postmark activity or worker logs for `Email send requested` entries. Declines dispatch a courteous rejection note automatically.
5. Requests submitted from the configured `EMAIL_ADMIN` address are auto-approved, promoted to the `admin` role, and receive the approval + activation emails immediately.

### Handling Duplicate Requests
- Submissions now reuse the existing record when a pending request already exists for the same email. The API returns `{ status: "pending", existing: true }` rather than creating a new row.
- If the user already has an active account, the API responds with `409 account_exists`. Surface that response back to the UI so the applicant is prompted to sign in instead of reapplying.

## Revoking Sessions & Refresh Tokens
1. Look up the session ID via `/admin` (session listings coming soon) or D1 tooling.
2. Call `POST /v1/auth/logout` while sending the current session cookie, or directly delete the session row in D1: `DELETE FROM sessions WHERE id = ?`.
3. Our refresh rotation helper removes stale sessions automatically if an invalid refresh token is presented or the refresh TTL has elapsed. You can also proactively expire a session by setting `refresh_expires_at` to a past timestamp and forcing clients to reauthenticate.
4. When investigating compromised accounts, clear all sessions for the user (`DELETE FROM sessions WHERE user_id = ?`) and issue a password reset token with `purpose = 'signup'`.

## Configuring Postmark Webhooks
- Bounce and spam suppressions are processed via the Canvas worker endpoint `POST /api/postmark/webhook`. Postmark’s current UI exposes Basic Auth instead of the legacy signature toggle.
- Recommended flow:
  1. Generate credentials (e.g. `hook-user` / `openssl rand -hex 16`).
  2. In Postmark → *Servers → Webhooks → Add Outbound Webhook*, set the URL to `https://program.fungiagricap.com/api/postmark/webhook`, enter the username/password under **Basic auth credentials**, and enable only **Bounce** + **Spam Complaint** events.
  3. Store the credentials in Cloudflare so the worker can validate them:
     ```bash
     echo "hook-user"          | bunx wrangler secret put POSTMARK_WEBHOOK_BASIC_USER
     echo "<generated-pass>"   | bunx wrangler secret put POSTMARK_WEBHOOK_BASIC_PASS
     ```
- If Postmark reintroduces webhook signatures you can instead set `POSTMARK_WEBHOOK_SECRET`, but either approach will keep the endpoint locked down.
- Email sends default to the `outbound` message stream. Override with `POSTMARK_MESSAGE_STREAM=<stream-id>` if your server uses a custom stream ID.

## Archiving Canvases
1. Use the authenticated Canvas API (`PATCH /v1/canvases/:id`) with `{ "status": "archived" }` and the latest `revision` to avoid conflicts.
2. Each mutation records a new `canvas_versions` entry. Validate via `GET /v1/canvases/:id/versions` that the revision advanced and the diff references the expected base revision.
3. Archived canvases remain available for audit but are hidden from active dashboards; unarchive by PATCHing back to `status: "active"`.
