# Admin Runbooks: Account & Canvas Operations

## Approving Account Requests
1. Navigate to the Cloudflare Worker admin decision console at `/admin/account/decision`.
2. Verify the requester context (email, justification, requested apps).
3. Approve via the generated decision token link; this will automatically:
   - Update the `account_requests` row to `approved`.
   - Provision the user profile and default “Lean Canvas Quickstart” canvas.
   - Issue a one-time signup token (24 hour TTL) and dispatch both the approval and activation emails.
4. Confirm the onboarding email landed by checking Cloudflare Email Routing logs or worker logs for `Email send requested` entries.

## Revoking Sessions & Refresh Tokens
1. Look up the session ID via the admin metrics console or database tooling.
2. Call `POST /v1/auth/logout` (planned) or directly delete the session row in D1: `DELETE FROM sessions WHERE id = ?`.
3. Our refresh rotation helper removes stale sessions automatically if an invalid refresh token is presented. You can also proactively expire a session by setting `refresh_expires_at` to a past timestamp and forcing clients to reauthenticate.
4. When investigating compromised accounts, clear all sessions for the user (`DELETE FROM sessions WHERE user_id = ?`) and issue a password reset token with `purpose = 'signup'`.

## Archiving Canvases
1. Use the authenticated Canvas API (`PATCH /v1/canvases/:id`) with `{ "status": "archived" }` and the latest `revision` to avoid conflicts.
2. Each mutation records a new `canvas_versions` entry. Validate via `GET /v1/canvases/:id/versions` that the revision advanced and the diff references the expected base revision.
3. Archived canvases remain available for audit but are hidden from active dashboards; unarchive by PATCHing back to `status: "active"`.
