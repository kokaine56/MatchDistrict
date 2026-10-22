# Match District — Full Security, Schema & Code Health Audit

**Repository:** `E:\Projects\MatchDistrict`
**Audit date:** 2026-10-22
**Scope:** 12 audit sections (schema, endpoints, auth/roles, sensitive data, registration/payment, tournament lifecycle, teams/squads, security, frontend, PGV/companion app, performance, code health)
**Mode:** Read-only. No code was modified, no tests run, no builds executed, no database or network connection made.

**Companion documents**
- `AUDIT_SCHEMA.md` — full column-level diff between the live database export and the code's DDL.
- `AUDIT_ENDPOINTS.md` — full route table with per-route authentication / role / data-exposure classification.

**Severity scale**

| Severity | Meaning |
|---|---|
| `critical` | Unauthenticated data breach, privilege escalation, or a feature that is permanently broken. Fix before anything ships. |
| `high` | Data exposure, authorisation bypass, financial risk, or data loss under realistic conditions. |
| `medium` | Correctness / reliability / defence-in-depth issues that will cause incidents or make future changes dangerous. |
| `low` | Code health, maintainability, and hygiene issues with no immediate security impact. |

---

## 0. Executive summary

The Match District backend is a **17,893-line hand-rolled HTTP server** (`server.js`, 865 KB) that routes every request with `if (req.url === '...')` string comparisons, owns its own JWT/crypto layer, owns its own DDL, and shares a single `pg` pool with ~1,000 inline SQL statements. There is no framework, no ORM, no middleware chain, and no schema migration tool. `server/schemaMigrations.js` is the only real DDL source of truth, and it is supplemented by ~75 ad-hoc `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements executed inline inside `initDb()`.

The most serious problems fall into four groups:

1. **Unauthenticated or under-scoped data disclosure.** `GET /api/users/:id` has no authentication at all and returns an entire `users` row after deleting only `password` — leaking e-mail, phone, KYC document reference, wallet balance and the admin TOTP secret. `GET /api/users` is admin-gated but returns raw rows including password hashes and the TOTP secret. `GET /api/v1/payments/all` requires only a *device* API key and dumps every payment record with customer e-mail, phone, screenshot URL and UTR for every user in the platform.

2. **A shadowed helper that silently breaks two money/security endpoints.** `checkRateLimit` is declared **twice** at module scope: at `server.js:1175` returning `{allowed, remaining, retryAfter}`, and again at `server.js:7188` returning a bare boolean. The second declaration hoists over the first, so `rl.allowed` is `undefined` at both call sites — meaning `POST /api/v1/payments/verify` and `GET /api/admin/monitoring/security/scan` return HTTP 429 to **every** caller, unconditionally.

3. **Session handling that is hostile to the browser.** The auth cookie is `token=...; Path=/; SameSite=Lax` — no `HttpOnly`, no `Secure` — the JWT is additionally returned in the JSON body, and the SPA reads it back out of `document.cookie`. Any XSS becomes full account takeover, and the cookie is also transmitted over plain HTTP.

4. **Schema drift with no reconciliation.** The live export lists 15 tables, of which **10 have no `CREATE TABLE` anywhere in the repository** (`analytics_events`, `api_keys`, `automation_rules`, `billing_history`, `custom_links`, `custom_registration_forms`, `custom_subdomains`, `export_usage_log`, `feature_flags`, `games`) even though the code queries all of them. Conversely, `admin_action_log` in the live database has `action_type` but **no `action` column**, while nine code sites still `INSERT` into `action` — those writes throw and are swallowed, so the admin audit trail is silently empty for tournament create/update, squad waive/unwaive, allocation release, credential changes, security scans and auto-publish.

**Severity counts** (full lists in sections 1–12, master index in section 13):

| Severity | Count |
|---|---|
| Critical | 13 |
| High | 38 |
| Medium | 45 |
| Low | 17 |
| **Total findings** | **113** |

113 findings are recorded. Two of them (`SEC-001` and `SEC-002`) are deliberate cross-references to `SENS-001` and `PAY-002` so that the security section reads as a standalone list; the number of **distinct** issues is therefore **111**.

**Findings by area**

| Area | Crit | High | Med | Low | Total |
|---|---:|---:|---:|---:|---:|
| Schema (SCH) | 0 | 5 | 4 | 1 | 10 |
| Endpoints (EP) | 1 | 3 | 2 | 0 | 6 |
| Auth & roles (AUTH) | 2 | 2 | 4 | 1 | 9 |
| Sensitive data (SENS) | 4 | 4 | 2 | 1 | 11 |
| Registration & payment (PAY) | 3 | 5 | 3 | 0 | 11 |
| Tournament lifecycle (LIFE) | 0 | 2 | 5 | 2 | 9 |
| Teams & squads (TEAM) | 0 | 2 | 4 | 1 | 7 |
| Security (SEC) | 3 | 6 | 5 | 2 | 16 |
| Frontend (FE) | 0 | 2 | 4 | 3 | 9 |
| Companion app (APP) | 0 | 2 | 3 | 1 | 6 |
| Performance (PERF) | 0 | 3 | 4 | 2 | 9 |
| Code health (CODE) | 0 | 2 | 5 | 3 | 10 |
| **Total** | **13** | **38** | **45** | **17** | **113** |

---

## 1. Database schema

> Full column-by-column diff: **`AUDIT_SCHEMA.md`**. This section states the findings that matter operationally.

Ground truth = `schema_live.csv` (101 rows, 15 distinct tables, sorted alphabetically, **truncated mid-table** at `organiser_followers.user_id`).
What the code believes = `server/schemaMigrations.js` (`SCHEMA_TABLES`, 53 names; 55 `CREATE TABLE` statements) + `initDb()` in `server.js:289-460`.

### SCH-001 | high | `admin_action_log` column mismatch silently destroys the admin audit trail
- **File:Line**: `server.js:3637`, `server.js:4494`, `server.js:8517`, `server.js:8572`, `server.js:8886`, `server.js:9010`, `server.js:10233`, `server.js:10334`, `server.js:17731`
- **What is wrong**: Nine `INSERT INTO admin_action_log` statements name a column `action`, but the live table (per `schema_live.csv:2-8`) only has `action_type`, so every one of those inserts raises `column "action" does not exist` and is swallowed by a `catch {}` / `catch (logErr) {}` block.
- **Affected**: Admin and compliance — no record is kept of tournament create/update, squad waive/unwaive, allocation release, match-credential updates, security scans or rule-driven auto-publish. Two other call sites (`server.js:3346`, `server.js:12286`) correctly use `action_type`, so the failure is invisible in code review.
- **Fix**: Rename `action` → `action_type` in all nine statements (or add a migration that adds an `action` column), and stop wrapping audit inserts in a swallowing `catch`.

### SCH-002 | high | The live schema export is truncated, so ~49 tables cannot be verified
- **File:Line**: `schema_live.csv:100-101` (last line is `organiser_followers,user_id`)
- **What is wrong**: The export stops in the middle of `organiser_followers`, yet the table list is alphabetical and ten more tables follow it — so every table sorting after `o` (including `users`, `tournaments`, `tournament_registrations`, `paired_devices`, `payment_verifications`, `subscribed`) is simply **not visible** in the ground truth, and it is impossible to tell truncation from genuine absence.
- **Affected**: The entire schema-drift conclusion and every endpoint that touches a table past `organiser_followers`.
- **Fix**: Re-export `information_schema.columns` for all tables with no `LIMIT` and re-run the diff before acting on any "missing table" claim.

### SCH-003 | high | Ten production tables have no DDL anywhere in the repository
- **File:Line**: `server.js:15571` (`analytics_events`), `server.js:15999` (`feature_flags`), plus `schema_live.csv:16-90`
- **What is wrong**: `analytics_events`, `api_keys`, `automation_rules`, `billing_history`, `custom_links`, `custom_registration_forms`, `custom_subdomains`, `export_usage_log`, `feature_flags` and `games` exist in the live database and are queried by the application (76 references across `server.js` and `server/*.js`), but no `CREATE TABLE` for any of them exists in `server.js`, `server/schemaMigrations.js` or any script under `scripts/`.
- **Affected**: Any environment rebuilt from source (CI, staging, disaster recovery) loses the analytics, feature-flag, custom-link, custom-subdomain, automation-rule, billing, export-log and games catalogue features entirely; there is no way to recreate them.
- **Fix**: Add idempotent `CREATE TABLE IF NOT EXISTS` DDL for all ten tables to `server/schemaMigrations.js` and list them in `SCHEMA_TABLES`.

### SCH-004 | medium | `SCHEMA_TABLES` manifest omits a table the migration itself creates
- **File:Line**: `server/schemaMigrations.js:5-59` (manifest) vs `server/schemaMigrations.js:233-240` (DDL)
- **What is wrong**: `organiser_followers` is created by `runSchemaMigrations()` and is used by 12 code sites (`server.js:388,1104-1107,2811-2818,2947`), but it is missing from the exported `SCHEMA_TABLES` array that the test suite treats as the completeness oracle (`tests/phase5Hardening.test.js:536-544`).
- **Affected**: Tests and reviewers relying on the manifest as proof the schema is complete.
- **Fix**: Add `'organiser_followers'` to `SCHEMA_TABLES`.

### SCH-005 | medium | `tournaments` carries four organiser columns for two concepts
- **File:Line**: `server.js:377-380`
- **What is wrong**: `initDb()` adds both `"orgId"`/`"orgName"` (camelCase) and `org_id`/`org_name` (snake_case) to `tournaments`, while every query in the code reads and writes only the camelCase pair (e.g. `server.js:4913` `WHERE t."orgId" = $1`), so the snake_case columns stay permanently NULL and are a live trap for the next developer who guesses the other casing.
- **Affected**: Organiser-ownership lookups; any BI or reporting consumer.
- **Fix**: Remove `org_id`/`org_name` from the migration and standardise on one naming convention.

### SCH-006 | medium | The checked-in `schema.sql` describes a different, legacy database
- **File:Line**: `schema.sql:1-…`
- **What is wrong**: The root `schema.sql` uses UUID primary keys and `organizer_profiles`, `room_credentials`, `notices` and `registrations` tables, none of which match the `VARCHAR(50)`-keyed `users` / `tournaments` / `tournament_registrations` model the code actually uses, so anyone provisioning from it produces a database the server cannot talk to.
- **Affected**: New-environment setup, onboarding, disaster recovery.
- **Fix**: Delete `schema.sql` and treat `server/schemaMigrations.js` as the single source of truth.

### SCH-007 | high | `tournament_registrations` has no unique constraint on `(tournament_id, slot_number)`
- **File:Line**: `server/schemaMigrations.js:403-427`
- **What is wrong**: `slot_number` is a plain nullable `INTEGER` with no unique index, so the read-then-write slot reservation in `POST /api/tournaments/:id/register` (`server.js:9751-9760`, `SELECT id … WHERE tournament_id = $1 AND slot_number = $2`) can hand the same slot to two teams when two requests interleave.
- **Affected**: Players — double-booked slots, overbooked tournaments.
- **Fix**: Add `CREATE UNIQUE INDEX IF NOT EXISTS uq_reg_slot ON tournament_registrations(tournament_id, slot_number) WHERE slot_number IS NOT NULL` and translate the `23505` conflict into a `SLOT_TAKEN` response.

### SCH-008 | high | The hottest table in the product has no indexes at all
- **File:Line**: `server/schemaMigrations.js:403-427` (no `idx_tournament_registrations_*` anywhere in the 29 index statements in the file)
- **What is wrong**: `tournament_registrations` has zero indexes while sibling tables have three each (`tournament_teams` has `idx_tournament_teams_tournament`, `…_registration`, `…_squad_waived`), so every tournament page, every dashboard, every slot reconciliation and the `DELETE FROM tournament_registrations WHERE user_id = $1` cascade (`server.js:2968`) is a sequential scan whose cost grows linearly with total registrations across the whole platform.
- **Affected**: All users — latency on tournament, registration, dashboard and admin-list pages.
- **Fix**: Add indexes on `tournament_registrations(tournament_id)`, `(user_id)`, `(status)` and `(idempotency_key)`.

### SCH-009 | medium | User deletion targets five tables that no migration creates
- **File:Line**: `server.js:2971-2976`
- **What is wrong**: The delete-user handler issues `DELETE FROM tournament_notices`, `tournament_messages`, `staff_members`, `white_label_settings` and `wallet_transactions`, none of which appear in `SCHEMA_TABLES` or in any `CREATE TABLE` in the repo, so those statements raise `relation "…" does not exist` and abort the sequence, leaving the user's tournaments and tournament-owned registrations behind after the "complete purge" message is logged.
- **Affected**: Account-deletion / right-to-erasure requests and GDPR compliance.
- **Fix**: Either create those tables in `server/schemaMigrations.js` or delete the statements and rely on `ON DELETE CASCADE` foreign keys.

### SCH-010 | low | Foreign keys cover only 14 of 55 tables
- **File:Line**: `server/schemaMigrations.js` (`REFERENCES` appears 14 times, all to `users`, `tournaments`, `tournament_teams`, `tournament_days`, `tournament_groups`, `tournament_matches`, `tournament_rounds`, `tournament_rooms`, `system_services`, `tournament_final_standings`, `tournament_prize_awards`, `tournament_registrations`, `tournament_match_results`, `sponsor_requests`)
- **What is wrong**: Most child tables reference parents only by an unconstrained `VARCHAR`, so deleting a parent row silently orphans children instead of cascading or blocking.
- **Affected**: Data integrity across tournaments, teams, rounds and results.
- **Fix**: Add `REFERENCES … ON DELETE CASCADE` to child tables and backfill the constraint set.

---

## 2. Endpoint surface

> Full route table with per-route auth/role/data classification: **`AUDIT_ENDPOINTS.md`**.

**Shape of the surface**

| Metric | Value |
|---|---|
| HTTP server | Hand-rolled `http.createServer` (`server.js:1235`) — no Express/Fastify |
| Route dispatch | ~219 `req.url ===` / `req.url.startsWith` / `urlPath ===` string comparisons (`server.js`) |
| Distinct URL patterns | ~180 |
| Inline SQL statements | ~1,000 (`.query(` calls), 131 `INSERT`, 527 `SELECT`, 154 `UPDATE`, 66 `DELETE` |
| `res.end()` call sites | 1,259 |
| `try/catch` blocks | 395 |
| Auth helpers | `getAuthUser` (JWT only), `authenticateDevice` (device API key), `resolveAuthUser` (JWT → device), `requireOrganizer`, `requireApprovedOrganizer`, `checkTournamentOrganizerAccess` |
| Framework-level protections | **none** — no helmet, no body-size limit, no rate-limit middleware, no request logging, no CSRF layer |

**Structural problems**

### EP-001 | high | Seven route handlers are declared twice; the second copy wins
- **File:Line**: `server.js:13320` & `server.js:13522` (`GET /api/admin/subscriptions`), `server.js:13346` & `server.js:13548` (`POST /api/admin/subscriptions/override`), `server.js:13399` & `server.js:13601` (`GET /api/admin/subscriptions/stats`), `server.js:13437` & `server.js:13639` (`GET /api/admin/pending-registrations`), `server.js:15592` & `server.js:15804` (`GET /api/analytics/revenue`), `server.js:15646` & `server.js:15872` (`GET /api/analytics/growth`), `server.js:1302` & `server.js:14365` (`GET /api/health`)
- **What is wrong**: Because dispatch is a chain of `if (req.url === …) { … return; }`, the first handler always returns before the second is reached, so the duplicate blocks are ~200 lines of dead code that still gets reviewed and still contains its own — possibly different — authorisation logic.
- **Affected**: Maintainers; any future edit to the *second* copy silently has no effect.
- **Fix**: Delete the second copy of each pair and move route matching into a table-driven router.

### EP-002 | high | There is no request body size limit anywhere
- **File:Line**: `server.js:1252-1253` (`/api/media/upload`), `server.js:9673`, `server.js:1600`, `server.js:16399` — representative `req.on('data', chunk => body += chunk)` handlers
- **What is wrong**: Every JSON body is accumulated with an unbounded `body += chunk` and there is no `Content-Length` check, no byte counter and no `req.destroy()`, so a single request can force the process to buffer as much memory as the attacker sends.
- **Affected**: The whole platform — memory exhaustion / OOM on a single request.
- **Fix**: Add a shared body reader with a hard cap (e.g. 1 MB for JSON, 10 MB for uploads) that responds `413` and destroys the socket.

### EP-003 | high | No HTTP security headers are set
- **File:Line**: `server.js:1236-1240` (the only header block in the file)
- **What is wrong**: The server sets only `Access-Control-*` and never `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` or `Strict-Transport-Security`, so the SPA is served without any browser-side hardening.
- **Affected**: All users; makes clickjacking and MIME-confusion attacks possible.
- **Fix**: Set the standard header set (or mount `helmet`) before the routing chain.

### EP-004 | medium | `Access-Control-Allow-Origin: *` is applied to every route, including admin ones
- **File:Line**: `server.js:1238`
- **What is wrong**: Every response — including `/api/admin/*`, `/api/users`, `/api/v1/payments/*` — is given `Access-Control-Allow-Origin: *` with no origin allow-list, so any web page can read the JSON body of any endpoint it can authenticate against.
- **Affected**: Users and admins, via any malicious site they visit while logged in.
- **Fix**: Replace `*` with a configured allow-list of origins and echo the request origin only when it matches.

### EP-005 | medium | No rate limiting on authentication, registration or password reset
- **File:Line**: `server.js:1300-1400` (OTP), `server.js:1595-1700` (register), `server.js:1450-1560` (login) — the only rate limiter is the device-key one at `server.js:1175` and the shadowed one at `server.js:7188`
- **What is wrong**: Credential-stuffing, OTP brute force, e-mail-bombing through the Resend key and mass account creation are all unthrottled; the in-memory `checkRateLimit` that was supposed to cover the v1 app surface is dead code because of EP-006.
- **Affected**: The authentication system, the Resend quota, and the user base.
- **Fix**: Add a per-IP and per-account limiter on `/api/auth/*` backed by a shared store, and put OTP attempts under a hard cap with exponential back-off.

### EP-006 | critical | A duplicate `checkRateLimit` declaration permanently breaks two endpoints
- **File:Line**: `server.js:1175` (returns `{allowed, remaining, retryAfter}`) shadowed by `server.js:7188` (returns a bare boolean); call sites `server.js:10175` and `server.js:16487`
- **What is wrong**: `server.js:7188` is a function *declaration* at the same module scope, so it hoists over `server.js:1175` and replaces it for the whole file; the surviving version returns `true`/`false`, therefore `rl.allowed` at both call sites is always `undefined`, therefore `!rl.allowed` is always `true` and both handlers unconditionally answer `429 Too Many Requests` on the first request.
- **Affected**: `POST /api/v1/payments/verify` (companion-app payment confirmation) and `GET /api/admin/monitoring/security/scan` (the admin security scanner) are dead — the latter is the very endpoint that would report the weak `ADMIN_PASSWORD` described in SENS-004. The `rateLimitMap` at `server.js:1173` and its cleanup interval at `server.js:1191` are unreachable dead code.
- **Fix**: Delete the `server.js:7188` duplicate (or rename it) so the object-returning implementation is the only one, and make the two call sites use `rl.allowed` consistently.

---

## 3. Authentication, roles and authorisation

The system has **two independent role models that disagree**, which is the root cause of the most serious finding in this audit:

- **`getUserRoles` / `hasRole` / `hasRoleClearance`** (`server.js`, ~offset 37194) prefer the `roles` **array** and fall back to the `role` string.
- **`isTournamentOrganizer`** (`server/tournamentAuth.js:19-27`) reads the **raw `role` string** on the JWT payload and grants blanket organiser rights when it equals `admin` or `superadmin`.

### AUTH-001 | critical | Registration lets a client choose its own role, yielding organiser rights over every tournament
- **File:Line**: `server.js:1571` (`userData.role || 'player'` stored into `temp_users.role`), `server.js:1654` (`const defaultRole = tempUser.role || 'player'`), `server.js:1660-1671` (`INSERT INTO users (… role, roles …)` with `role = defaultRole`), `server.js:1690` (`signJwt({ email, role: newUser.role, roles: newUser.roles || [newUser.role], id })`), `server/tournamentAuth.js:19-27`
- **What is wrong**: `POST /api/auth/register-temp` accepts an arbitrary `role` in the request body with no whitelist, it is persisted to `temp_users.role`, and `POST /api/auth/register` copies it verbatim into `users.role` and into the signed JWT; because `isTournamentOrganizer` grants organiser access on `user.role === 'admin'` — read straight off the JWT — a self-registered account with `role: "admin"` passes `checkTournamentOrganizerAccess` for **any** tournament, while `hasRole` (which reads the `roles` array, hardcoded to `['user']` at insert) never sees the injected value, so no admin-detection check fires.
- **Affected**: Every tournament, every organiser, the payment-verification queue and the admin surfaces guarded by `checkTournamentOrganizerAccess` — which is called in **44 places** in `server.js`.
- **Fix**: Never accept a role from the client — force `role = 'player'` and `roles = ['user']` at both `server.js:1571` and `server.js:1654`, whitelist any role change behind an admin-only endpoint, and make `isTournamentOrganizer` read the same `roles` array as `hasRole`.

### AUTH-002 | critical | Final registration requires no e-mail verification
- **File:Line**: `server.js:1595-1612`
- **What is wrong**: `POST /api/auth/register` only checks that an unexpired `temp_users` row exists for the e-mail; there is no check that the OTP was ever sent, received or verified, so the entire verification step that the UI performs is optional for an attacker who talks to the API directly.
- **Affected**: Anyone who can reach the API — enables AUTH-001, mass fake accounts, spam registration and OTP-bypass.
- **Fix**: Record a `verified_at` / `otp_verified` flag on `temp_users` when the OTP is validated and reject `/api/auth/register` for rows without it.

### AUTH-003 | high | Role changes do not take effect until the 24-hour JWT expires
- **File:Line**: `server.js:651` (`exp: Date.now() + 86400000`), `server.js:1690` and every other `signJwt` call site
- **What is wrong**: The role is baked into a 24-hour HMAC token and every authorisation decision reads the token, never the database, so demoting or banning a user — including demoting a compromised organiser — leaves their elevated access valid for up to a day.
- **Affected**: Organisers and admins whose accounts are compromised or whose role is revoked.
- **Fix**: Shorten the access-token lifetime (15 min) with a refresh token, and re-read the role from `users` for privileged operations.

### AUTH-004 | high | The shared organiser guard accepts five different spellings of the owner column
- **File:Line**: `server/tournamentAuth.js:38-43`
- **What is wrong**: `isTournamentOrganizer` accepts `tournament.orgId`, `organizer_id`, `organizerId`, `org_id` or `created_by` as the owner id, so if two of those columns ever hold different values the guard silently picks the first match and may authorise the wrong account.
- **Affected**: Organiser ownership checks across 44 call sites.
- **Fix**: Read exactly one column (`"orgId"`) and fail closed when it is missing.

### AUTH-005 | medium | `requireOrganizer` trusts the token's role claim instead of the database
- **File:Line**: `server.js` `requireOrganizer` (~offset 44650) and `requireApprovedOrganizer` (same region)
- **What is wrong**: `requireOrganizer` calls `hasOrganizerRights(authUser)`, which reads the JWT payload, so a stale or forged-role token passes; only `requireApprovedOrganizer` additionally re-reads `"orgApplicationStatus"` from `users`, and that check is skipped entirely for admins.
- **Affected**: Organiser-only endpoints.
- **Fix**: Make both helpers re-read the user's role and approval status from the database for organiser-tier actions.

### AUTH-006 | medium | JWT signature comparison is not constant-time
- **File:Line**: `server.js:662`
- **What is wrong**: `verifyJwt` compares signatures with `signature === expectedSig`, a short-circuiting string comparison that leaks timing information about the HMAC.
- **Affected**: The authentication layer of every endpoint.
- **Fix**: Use `crypto.timingSafeEqual` on equal-length buffers.

### AUTH-007 | medium | A user can request an OTP for any e-mail address with no captcha or throttling
- **File:Line**: `server.js:1300-1360`
- **What is wrong**: The OTP endpoint accepts any e-mail, writes a row to `otps`, sends mail through the paid Resend key and only guards with an in-memory per-e-mail timer that resets on restart, so an attacker can burn the mail quota and spam arbitrary third parties.
- **Affected**: Third-party inboxes, the Resend account, the OTP table.
- **Fix**: Add per-IP throttling, a captcha, and an e-mail-domain allow/block list.

### AUTH-008 | medium | No session revocation, no logout invalidation on the server
- **File:Line**: `server.js:17280` (logout only clears the cookie)
- **What is wrong**: Logout deletes the client cookie but the JWT remains cryptographically valid until its 24-hour expiry, and there is no denylist, no `session_id` claim and no rotation counter.
- **Affected**: Users who log out from a shared device and users whose token is stolen.
- **Fix**: Track a session version per user and reject tokens whose version is stale.

### AUTH-009 | low | `encryptSessionData` uses unauthenticated AES-CBC
- **File:Line**: `server.js` `encryptSessionData` / `decryptSessionData` (~offset 1400 of the file body)
- **What is wrong**: AES-256-CBC with a random IV and no MAC/AEAD means a tampered ciphertext can produce a distinguishable decryption error, and the key is derived from `JWT_SECRET` with a fixed salt (`scryptSync(JWT_SECRET, 'md-salt-string', 32)`).
- **Affected**: The browser persistent session blob.
- **Fix**: Use AES-256-GCM (or `crypto.timingSafeEqual` on an HMAC) and a per-install random salt.

---

## 4. Sensitive data, secrets and personal information

**Secret-handling posture (verified, values never printed)**

| Item | Result |
|---|---|
| `.env` tracked by git | **No** — `.gitignore` line 28 lists `.env` |
| `.env.example` contains live values | **No** — all 15 keys are placeholders, none identical to the live values |
| Hardcoded secrets in `src/` | **None** — no service-role key, JWT secret, `sk_…` key, bearer token or private key block found |
| Secrets in the built client bundle | Only `SUPABASE_ANON_KEY` (in `dist/assets/getAuthToken-*.js`) — this key is designed to be public, but it means every Supabase table must be protected by RLS, which could not be verified without database access |
| `JWT_SECRET` | Present, 90 chars, not the code's own fallback constant — acceptable |
| `ADMIN_PASSWORD` | **6 characters, identical to the code's hardcoded weak default** — see SENS-004 |

### SENS-001 | critical | `GET /api/users/:id` is unauthenticated and returns an entire user row
- **File:Line**: `server.js:2892-2913`
- **What is wrong**: The handler performs `SELECT * FROM users WHERE id = $1 OR uid = $1` with **no authentication check at all**, then deletes only the `password` property before returning the row, so every other column — `email`, `phone`, `uid`, `role`, `roles`, `tier`, `kycDoc` (KYC document reference), `wallet_balance`, `early_access`, `orgApplicationStatus` and `admin_totp_secret` — is world-readable by guessing a user id.
- **Affected**: Every registered user; the platform's PII and KYC references are enumerable without logging in.
- **Fix**: Require authentication, scope the query to the caller's own row (or an admin/organiser relationship), and select an explicit column allow-list instead of `*`.

### SENS-002 | critical | `GET /api/users` returns password hashes and the admin TOTP secret to admins
- **File:Line**: `server.js:2643-2658`
- **What is wrong**: The endpoint is admin-gated but returns `dbRes.rows` verbatim from `SELECT * FROM users`, which includes the `password` column (the PBKDF2 hash), `admin_totp_secret` (the plaintext TOTP shared secret) and `kycDoc`.
- **Affected**: Admins — and anyone who compromises an admin session gains offline cracking material for every user plus the 2FA seed.
- **Fix**: Replace `SELECT *` with an explicit allow-list and never return `password` or `admin_totp_secret`.

### SENS-003 | critical | The admin TOTP secret is stored in plaintext in the user table
- **File:Line**: `server.js:1732-1744` (write), `server/schemaMigrations.js:111` (`admin_totp_secret VARCHAR(255)`)
- **What is wrong**: The TOTP shared secret is written to `users.admin_totp_secret` in the clear (no encryption, no hashing), lives in the same table as passwords, and is returned by both `SELECT *` user endpoints (SENS-001, SENS-002).
- **Affected**: The admin account and every user's KYC/identity data if the database is ever read or leaked.
- **Fix**: Store the TOTP secret encrypted with a KMS-held key (or in a dedicated secrets table with restricted grants) and exclude it from every user-facing projection.

### SENS-004 | critical | The production admin password is the code's own hardcoded weak default
- **File:Line**: `.env` `ADMIN_PASSWORD` (6 characters, verified identical to the literal `'101010'`), `server.js:512-516` (admin account seeded with `hashPassword(process.env.ADMIN_PASSWORD)`), `server.js:10185` (the app's own scanner flags this exact value as `severity: 'critical'`)
- **What is wrong**: The admin account is seeded with a six-digit password that the application itself hard-codes as an insecure default and that its built-in security scan reports as a critical finding — and that scan endpoint is permanently broken by EP-006, so the warning never reaches anyone.
- **Affected**: The entire platform — anyone who guesses `101010` gets a seeded admin account.
- **Fix**: Rotate `ADMIN_PASSWORD` to a strong unique value, remove the literal default from the code, fail startup if the password is a known default, and re-enable the security scan.

### SENS-005 | high | Password hashing uses 1,000 PBKDF2 iterations and falls back to plaintext comparison
- **File:Line**: `server.js:92-116`
- **What is wrong**: `hashPassword` uses `crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512')` — 1,000 iterations is roughly three orders of magnitude below current guidance (600,000+ for PBKDF2-SHA512, or bcrypt/argon2) — and `verifyPassword` silently accepts a **plaintext** password whenever the stored value does not start with `pbkdf2$`.
- **Affected**: Every user account; a leaked hash table can be brute-forced offline in minutes, and any legacy plaintext row is compared directly.
- **Fix**: Re-hash on next login with `scrypt`/argon2id, migrate the iteration count, and remove the plaintext fallback (force a password reset for any row that still matches).

### SENS-006 | high | OTPs are printed to stdout and stored in plaintext
- **File:Line**: `server.js:1347-1352` (console print of the OTP and e-mail), `server.js:1356-1359` (`INSERT INTO otps (email, otp, expires_at)`), `server/schemaMigrations.js:114-117`
- **What is wrong**: The one-time code is written to the process log (which on most PaaS providers is retained and searchable) and stored in the `otps` table in the clear, so anyone with log access or read-only database access can complete any pending verification.
- **Affected**: All users during registration and password reset.
- **Fix**: Store a hash of the OTP, never log it, and stop printing e-mail addresses and codes to stdout.

### SENS-007 | high | The database TLS connection disables certificate verification
- **File:Line**: `server.js:284-286` (`ssl: { rejectUnauthorized: false }`), `.env` `DATABASE_URL` (contains no `sslmode=` parameter)
- **What is wrong**: The `pg` pool is configured to accept any TLS certificate, so a network-positioned attacker can present a forged certificate and read or modify the entire database, including all password hashes, TOTP secrets and payment records.
- **Affected**: Everyone — all data in the platform.
- **Fix**: Set `rejectUnauthorized: true` with the managed-CA certificate (or `sslmode=verify-full` in `DATABASE_URL`) and pin the CA.

### SENS-008 | high | Room IDs and passwords are stored in plaintext and rendered directly in the UI
- **File:Line**: `server/schemaMigrations.js` (`tournament_matches.room_id`, `room_password`), `src/components/Phase3RoadmapViewer.jsx:57`, `src/components/TournamentRoadmap.jsx:397,399`, `src/pages/Profile.jsx:890-891,2006-2018`, `src/pages/CreateTournament.jsx:169-170`, `src/utils/api.js:50-51`, `src/pages/TournamentDetail.jsx:739`
- **What is wrong**: Lobby credentials are kept as clear-text columns, mapped straight into the client payload and rendered into the DOM; the server does delete them from the timeline projection (`server.js:869-871`) but the dedicated `/matches/:id/credentials` endpoint returns them and the front end stores them in component state.
- **Affected**: Players and organisers — credentials leak through shared screens, browser history and any XSS.
- **Fix**: Store credentials encrypted at rest, return them only through the time-gated endpoint, and never mirror them into general-purpose component state.

### SENS-009 | medium | Payment screenshots and UTR references are stored as arbitrary URLs
- **File:Line**: `server.js:9853-9854`, `server.js:9913-9914` (`screenshot_url` taken from the request body), `server.js:11779` (`payment_screenshot_url`), `server.js:14741` (`sponsor_contributions.screenshot_url`)
- **What is wrong**: The server accepts any string as a "screenshot URL" with no allow-list, no scheme check and no ownership binding, and later fetches it server-side (SEC-003) and returns it to other clients.
- **Affected**: Payment reviewers and the platform's egress reputation.
- **Fix**: Accept only uploaded file identifiers (or a fixed CDN host), and reject `http://`, `file://` and private-address targets.

### SENS-010 | medium | `.env` is committed-adjacent: `dockerignore` and `Dockerfile` may copy it into the image
- **File:Line**: `Dockerfile`, `.dockerignore`
- **What is wrong**: `.env` is excluded from git, but the build context rules that decide whether `.env` reaches the image were not verified to exclude it, and the server reads `.env` from `process.cwd()` at runtime (`server.js` `loadEnv()`), which encourages baking it into an image.
- **Affected**: Deployment pipeline; image layers can leak the whole secret set.
- **Fix**: Explicitly add `.env` to `.dockerignore`, inject secrets at runtime via the platform's secret manager, and delete `loadEnv()`'s filesystem fallback in production.

### SENS-011 | low | The admin password is compared to a literal in the source tree
- **File:Line**: `server.js:10185`, `server.js:10188`
- **What is wrong**: The literal `'101010'` and the literal JWT fallback are embedded in the source, so anyone with the repository can confirm the production value without guessing.
- **Affected**: Defence in depth against the weak-password scenario.
- **Fix**: Store the known-bad-value fingerprints as hashes in the config, or compare against a list loaded from the environment.

---

## 5. Registration, slots and payment flow

### PAY-001 | critical | Any paired device key can dump every payment record in the platform
- **File:Line**: `server.js:16336-16370` (`GET /api/v1/payments/all`)
- **What is wrong**: The handler authenticates with `authenticateDevice(req)` — a single shared `MDK-…` API key — and performs **no role or capability check** before returning the union of `payment_verifications` and `tournament_registrations`, which includes `user_email`, `user_phone`, `screenshot_url`, `transaction_id`/UTR and amounts for every customer.
- **Affected**: Every paying customer in the platform; a single leaked or shared device key is a bulk PII and financial-data breach.
- **Fix**: Require the `VERIFY_PAYMENTS` capability (admin or `reg_payment_verifier`) on top of device auth, scope results to the caller's organisation, and remove customer e-mail/phone from the payload.

### PAY-002 | critical | The payment screenshot proxy is a server-side request forgery vector
- **File:Line**: `server.js:17070-17139` (`GET /api/v1/payments/screenshot-image`), write path `server.js:9853-9854` and `server.js:9913-9914`
- **What is wrong**: The endpoint reads the stored `screenshot_url` (which the client supplied verbatim at registration time) and then `fetch()`es it from the server with a 15-second timeout, with **no scheme check, no host allow-list and no private-address blocking**, so a registrant who stores `http://169.254.169.254/latest/meta-data/` or `http://10.0.0.5/` makes the server fetch cloud metadata or internal services and returns the body.
- **Affected**: The hosting account's internal network and any cloud metadata service; the response body is echoed back to the caller.
- **Fix**: Accept only uploads (file IDs) or a fixed CDN allow-list, reject non-HTTPS and RFC1918/link-local targets, and resolve DNS before connecting to defeat rebinding.

### PAY-003 | critical | The session cookie has no `HttpOnly` and no `Secure`, and the token is also returned in the body
- **File:Line**: `server.js:1469`, `server.js:1533`, `server.js:1694`, `server.js:2031`, `server.js:17255`, `server.js:17280`; consumed by `src/utils/getAuthToken.js:15` and `src/utils/getAuthToken.js:39`
- **What is wrong**: Every auth cookie is `token=<jwt>; Path=/; SameSite=Lax` — no `HttpOnly` (so JavaScript can read it, which the SPA relies on) and no `Secure` (so it is sent over plain HTTP) — and the same JWT is returned in the JSON response body of login and registration, so it also lands in `localStorage`/`sessionStorage` caches and in any error-reporting payload.
- **Affected**: Every user; a single XSS or any HTTP interception yields a 24-hour account token.
- **Fix**: Move to an `HttpOnly; Secure; SameSite=Lax` session cookie with server-side sessions, stop returning the token in the body, and terminate TLS at the edge with HSTS.

### PAY-004 | high | Slot reservation is a check-then-act sequence with no transaction and no unique constraint
- **File:Line**: `server.js:9751-9762` (`SELECT id … WHERE tournament_id = $1 AND slot_number = $2 AND status IN ('approved','confirmed','pending','pending_payment')`), `server.js:9791-9795` (`INSERT`), `server/schemaMigrations.js:403-427` (no unique constraint on `slot_number`)
- **What is wrong**: The slot is checked with a `SELECT` and then inserted in a separate statement with no `BEGIN`/`COMMIT` and no database-level uniqueness, so two concurrent registrations for the same slot both pass the check and both insert.
- **Affected**: Players — double-booked slots and overbooked tournaments.
- **Fix**: Wrap the check and the insert in one transaction with `SELECT … FOR UPDATE` on the tournament row, and add the unique index from SCH-007.

### PAY-005 | high | The slot worker strips slot numbers from pending registrations, contradicting the registration check
- **File:Line**: `workers/slotManagerWorker.js:28-41` (statuses that keep a slot) vs `server.js:9753-9756` (statuses that occupy a slot)
- **What is wrong**: The registration endpoint treats `pending` and `pending_payment` as occupying a slot, but `reconcileTournamentSlots` counts only `approved`/`confirmed`/`VERIFIED_BY_HOST`/`verified_by_host` and therefore **nulls the `slot_number` of every pending or awaiting-payment registration** (`workers/slotManagerWorker.js:37-39`), so the next registrant can take the same slot.
- **Affected**: Players whose payment is in flight; the reconciliation runs on registration, approval and bulk-approve (`server.js:9798, 9857, 10807, 13731, 13913, 14002, 16721, 16866`).
- **Fix**: Define one shared `SLOT_HOLDING_STATUSES` constant and use it in the registration check, the worker and the bridge.

### PAY-006 | high | `slotsFilled` counts a different set of registrations than the slot map
- **File:Line**: `workers/slotManagerWorker.js:75-80`
- **What is wrong**: `slotsFilled` is computed as `COUNT(*)` over approved/confirmed/verified rows, which counts registrations that have **no slot number at all**, so the displayed occupancy can exceed the number of actually occupied slots and the waitlist promotion logic at `workers/slotManagerWorker.js:44-52` (which compares `occupiedSlots.size < slotsTotal`) can promote waitlisted users beyond capacity.
- **Affected**: Organisers and players — the tournament fills up invisibly.
- **Fix**: Derive `slotsFilled` from the same `occupiedSlots` set that drives assignment, and promote the waitlist from that same set.

### PAY-007 | high | `PUT /api/tournaments/:id/registrations/:regId` does not scope the registration to the tournament
- **File:Line**: `server.js:10636` (`SELECT * FROM tournament_registrations WHERE id = $1`), `server.js:10613-10620` (organiser access check on the *tournament* only), `server.js:10652-10657` (`UPDATE … WHERE id = $3`)
- **What is wrong**: The handler verifies that the caller organises the tournament named in the URL, then fetches and updates the registration by **id alone**, so an organiser of tournament A can approve, reject or waitlist a registration belonging to tournament B simply by supplying its id — and the follow-up `reconcileTournamentSlots(pool, id)` then reconciles the wrong tournament.
- **Affected**: Organisers of any tournament; cross-tournament approval of payments and roster changes.
- **Fix**: Add `AND tournament_id = $2` to the `SELECT` and the `UPDATE`, and reconcile `currentReg.tournament_id` rather than the URL id.

### PAY-008 | high | Cross-tournament access is possible on other registration-scoped routes too
- **File:Line**: `server.js:9853` (`UPDATE tournament_registrations SET … screenshot_url = $3 WHERE id = $4`), `server.js:9913` (same pattern), `server.js:16721` (`reconcileTournamentSlots(pool, regForSlot.rows[0].tournament_id)`)
- **What is wrong**: The payment-proof upload and update handlers address the registration by id without re-checking that the caller owns it, so a user can attach or replace the payment proof of a registration they do not own.
- **Affected**: Players and organisers — payment proofs can be tampered with or spoofed.
- **Fix**: Scope every registration mutation by `tournament_id` **and** by the caller's own `user_id` (or organiser ownership).

### PAY-009 | medium | The registration handler has no transaction around the duplicate check, the slot check and the insert
- **File:Line**: `server.js:9680-9700` (duplicate-registration `SELECT`), `server.js:9751-9762` (slot `SELECT`), `server.js:9791-9798` (`INSERT`)
- **What is wrong**: Three separate round-trips with no `BEGIN`, so a double-submit from two tabs can insert two registrations for the same user and tournament.
- **Affected**: Players — duplicate registrations and inflated slot counts.
- **Fix**: Use a single transaction with `SELECT … FOR UPDATE` and rely on the existing `idempotency_key` unique constraint.

### PAY-010 | medium | The registration id is a truncated timestamp
- **File:Line**: `server.js:9764` (`const regId = 'REG-' + Date.now().toString().slice(-6)`)
- **What is wrong**: The last 6 digits of `Date.now()` repeat roughly every 17 minutes, so registration ids collide under load, and `id` is the primary key.
- **Affected**: Players — registration writes and updates fail with a duplicate-key error.
- **Fix**: Use `crypto.randomBytes(6).toString('hex')` in the id, as the rest of the codebase already does.

### PAY-011 | medium | `POST /api/auth/register` returns the entire new user row, including the password hash
- **File:Line**: `server.js:1699` (`res.end(JSON.stringify({ success: true, token, encryptedSession, user: newUser }))` where `newUser` comes from `INSERT … RETURNING *` at `server.js:1657-1672`)
- **What is wrong**: The `users` row is returned verbatim, so the client receives its own PBKDF2 hash and every column including `kycDoc` and `wallet_balance`.
- **Affected**: The registering user; the hash ends up in browser storage and in any client-side analytics.
- **Fix**: Return `publicUserRow(newUser)` (the helper that already exists at `server.js:~80`) instead of the raw row.

---

## 6. Tournament lifecycle

### LIFE-001 | high | Two different credential-release time conventions coexist
- **File:Line**: `server/matchRelease.js:45` (`new Date(\`${date}T${startTime}:00+05:30\`)` — explicit IST) vs `server.js:831-838` (`new Date(\`${round.date}T${round.time}\`)` — naive, interpreted in the server's local timezone)
- **What is wrong**: `server.js` imports and uses the IST-based `matchReleaseEpoch`/`isMatchReleased` at `server.js:9141-9143` for the credential endpoint, but its own `roundReleaseEpoch` helper at `server.js:831` uses naive local time for the timeline projection; on a UTC host (the common container/Render default) the two disagree by 5 h 30 m, so `release_available` and `room_credentials_configured` are published to participants 5.5 hours early.
- **Affected**: Players and organisers — the UI says credentials are available while the credential endpoint refuses them.
- **Fix**: Delete `roundReleaseEpoch` and call the single `matchRelease` helper everywhere.

### LIFE-002 | high | Slot reconciliation runs on every registration and approval write, inside the request
- **File:Line**: `server.js:9798`, `server.js:9857`, `server.js:10807`, `server.js:13731`, `server.js:13913`, `server.js:14002`, `server.js:16721`, `server.js:16866` (eight call sites of `reconcileTournamentSlots`)
- **What is wrong**: Each call opens its own connection, runs `BEGIN`, scans every registration of the tournament, rewrites slot numbers, calls `assignGroups()` and re-counts, all synchronously inside the HTTP request that triggered it, so approving N registrations performs N full reconciliations.
- **Affected**: Organisers — bulk approval (`/api/admin/pending-registrations`, `approve-all-verified`) takes minutes and holds connections.
- **Fix**: Make reconciliation asynchronous (queue/worker) and coalesce multiple triggers into one run per tournament.

### LIFE-003 | medium | `startSlotManagerWorker` is a no-op, so no periodic reconciliation exists
- **File:Line**: `workers/slotManagerWorker.js:91-93`, called at `server.js:17884`
- **What is wrong**: The daemon function only prints a log line and never schedules anything, so slot numbers are only ever reconciled as a side effect of a registration or approval request; a tournament whose registrations changed by any other path keeps stale slot numbers indefinitely.
- **Affected**: Organisers — inconsistent slot maps and `slotsFilled` counts.
- **Fix**: Implement the periodic sweep (or a `pg_cron`/queue job) and make the event-driven path idempotent with it.

### LIFE-004 | medium | Follower notification sends one e-mail per follower inside the request
- **File:Line**: `server.js:1094-1151` (`notifyFollowersOfTournament`), called at `server.js:3846` (create) and `server.js:4780` (update)
- **What is wrong**: The helper queries every follower and calls `sendEmail()` sequentially inside the loop, so creating a tournament with 5,000 followers blocks the request for minutes and burns 5,000 Resend calls synchronously.
- **Affected**: Organisers creating a popular tournament; the Resend account and its daily quota.
- **Fix**: Batch the recipients into a single Resend call and enqueue the job rather than doing it inline.

### LIFE-005 | medium | The tournament timeline is stored as a JSON blob inside the tournament row
- **File:Line**: `server.js:1048-1081` (`withTournamentDisplay`), `server.js:846-888` (`sanitizeTimelineForUser`)
- **What is wrong**: The whole multi-round roadmap, including room credentials, lives in one JSON column on `tournaments` and must be parsed, scrubbed and re-serialised on every read, which is why the sanitiser exists at all and why it must be applied consistently by hand at every read site.
- **Affected**: Performance and correctness — a missed call site leaks credentials (see LIFE-006).
- **Fix**: Move the roadmap into the normalised `tournament_rounds` / `tournament_matches` tables that already exist and select credential columns explicitly.

### LIFE-006 | medium | Timeline sanitisation is applied by hand, and at least one organiser route omits it
- **File:Line**: `server.js:3185-3200` (public `GET /api/tournaments` → sanitised) vs `server.js:4904-4930` (`GET /api/organiser/tournaments` → `SELECT t.*` at `server.js:4908` with no `sanitizeTimelineForUser`)
- **What is wrong**: Credential redaction depends on each route remembering to call the sanitiser; the organiser route returns the raw `timeline` column, which still contains `room_id`/`room_password` for every round, and there is no structural guarantee that a future route will redact.
- **Affected**: Organisers (their own data today) — but the pattern is one copy-paste away from a public credential leak.
- **Fix**: Stop storing credentials in the timeline blob and return them only through the time-gated endpoint.

### LIFE-007 | medium | `isRegisteredForTournament` accepts `pending` registrations as "registered"
- **File:Line**: `server.js:890-903`
- **What is wrong**: The eligibility query counts `status IN ('pending','pending_payment','approved','confirmed')`, which is a fourth distinct definition of who counts as a registered participant in the codebase (the bridge uses approved/confirmed/verified; the worker uses approved/confirmed/verified; the slot check adds pending).
- **Affected**: Players — unpaid users may be treated as eligible for participant-only views.
- **Fix**: Consolidate every status list into one shared module and import it everywhere.

### LIFE-008 | low | Tournament duplication does not carry over the roadmap state
- **File:Line**: `server.js:4934+` (`POST /api/tournaments/:id/duplicate`)
- **What is wrong**: The duplicate endpoint clones the tournament row but not its rounds, groups, rooms or registration state, so a duplicated tournament starts empty in a way that is not obvious to the organiser.
- **Affected**: Organisers who reuse a template.
- **Fix**: Either copy the roadmap in the same transaction or state clearly in the UI that only the shell is cloned.

### LIFE-009 | low | `GET /api/health` is implemented twice with no health/readiness distinction
- **File:Line**: `server.js:1302` and `server.js:14365`
- **What is wrong**: Two different health handlers exist, the second always wins, and neither distinguishes liveness from readiness or reports dependency status.
- **Affected**: Operations — an orchestrator cannot tell a degraded instance from a healthy one.
- **Fix**: Keep one handler, add `/api/health/live` and `/api/health/ready`, and have the ready probe check the database.

---

## 7. Teams and squads

**What is built well:** `POST /api/invitation/:token/join` (`server.js:7942-8140`) is the best-engineered handler in the codebase — it opens a transaction, takes `FOR UPDATE` row locks on the invitation, the tournament and the team, re-checks capacity *inside* the lock, validates the requested roster slot, handles the `23505` unique-constraint races explicitly, enforces the registration-exclusion rule, and refuses to touch a finalised tournament. `server/registrationTeamBridge.js` is a well-documented, pure, idempotent module with explicit "never guess" semantics and its own test file.

The problems are in the **inconsistency between parallel implementations**, not in the core join path.

### TEAM-001 | high | Four different definitions of "this registration occupies a slot" coexist
- **File:Line**: `server.js:9753-9756` (`approved, confirmed, pending, pending_payment`), `workers/slotManagerWorker.js:29` (`approved, confirmed, VERIFIED_BY_HOST, verified_by_host`), `server/registrationTeamBridge.js:29-34` (`REG_BRIDGE_ELIGIBLE_STATUSES`), `server/squadRegistrationService.js:111` (`pending_payment, pending, pending_payment_verification, waitlisted` → "payment pending")
- **What is wrong**: Four modules in the same repository answer "is this registration a confirmed slot holder?" four different ways, and the registration endpoint and the slot worker disagree about whether `pending` and `pending_payment` hold a slot — so a reconciliation can release a slot that a player is still paying for.
- **Affected**: Players and organisers — overbooking, wrong waitlist promotion, wrong eligibility.
- **Fix**: Create one `server/registrationStatus.js` exporting `SLOT_HOLDING_STATUSES`, `ELIGIBLE_STATUSES` and `EXCLUDED_STATUSES`, and import it in all four places.

### TEAM-002 | high | Squad capacity is derived from the registration roster, ignoring the tournament's match type
- **File:Line**: `server/squadRegistrationService.js:32-41` (`computeSquadCapacity` returns `1 + members.length` when the roster is non-empty), `server/registrationTeamBridge.js:49-53` (`maxMembersForMatchType` returns 1/2/4), `server.js:8046-8047` (capacity used for the join)
- **What is wrong**: `computeSquadCapacity` never consults `match_type` once the registration carries a `members` array, so a registration that lists ten names yields a capacity of eleven and a team of eleven players in a tournament declared as `solo`, `duo` or 4-player squad.
- **Affected**: Players and organisers — illegal team sizes enter the bracket and the leaderboard.
- **Fix**: Cap the derived capacity at `maxMembersForMatchType(tournament.match_type)` and reject registrations whose roster exceeds it.

### TEAM-003 | medium | Two copies of the squad rules exist — one in the server, one in the browser
- **File:Line**: `server/squadRegistrationService.js:1-3` ("Mirrored on the client in `src/utils/squadRegistration.js`"), `src/utils/squadRegistration.js`
- **What is wrong**: The file's own header states that the capacity and stage rules are duplicated on the client, so the browser holds a second implementation of the rules the server is supposed to enforce; the two can drift and the client copy will silently disagree with the server.
- **Affected**: Users on the team-hub screens; every future rule change.
- **Fix**: Keep the server authoritative and have the client fetch the computed stage, or share one pure module through the build.

### TEAM-004 | medium | A join can insert a member with a `NULL` roster slot
- **File:Line**: `server.js:8059-8074` (slot selection and `INSERT`)
- **What is wrong**: The auto-assign loop scans slots `1..capacity-1` and leaves `chosenSlot` as `undefined` when every index is already claimed but the member count is still below capacity (possible because the count is taken from `status = 'active'` rows while the claimed set comes from `roster_slot`, and legacy rows can have `NULL` slots); the insert then stores `NULL`, which the partial unique index `WHERE roster_slot IS NOT NULL` does not protect.
- **Affected**: Players — a member with no slot breaks the roster display and the capacity maths.
- **Fix**: Compute the free slot from the same set used for the count, and reject the join with `TEAM_FULL` when no slot is available.

### TEAM-005 | medium | Invitation tokens are stored in plaintext and travel in the URL
- **File:Line**: `server/schemaMigrations.js` (`tournament_team_invitations.token VARCHAR(100) UNIQUE NOT NULL`), `server/registrationTeamBridge.js:57-62` (`createInvitationCredentials` returns a raw 16-byte hex token), `src/pages/TournamentInvite.jsx` (`/tournament/invite/:token`)
- **What is wrong**: The bearer token is stored as-is and is the only thing that authorises a join, so a database read (or the `tournament_team_invitations` dump) yields joinable invitations, and the token travels in the URL where it lands in logs, referrers and browser history.
- **Affected**: All players; anyone who obtains a token can take a roster slot.
- **Fix**: Store only a hash of the token, exchange it for a short-lived scoped grant, and use a POST body or a single-use fragment instead of a URL path parameter.

### TEAM-006 | medium | Team member ids are generated with `Math.random`
- **File:Line**: `server.js:8076` (`const memberId = 'mem_' + Math.random().toString(36).substr(2, 9) + Date.now()`), `server.js:7266-7267` (`'tt_'` / `'ttm_'` team and member ids), `server.js:7262` (team-name suffix), `server.js:10235` (`'LOG-' + Date.now()` audit-log id)
- **What is wrong**: `Math.random()` is not a cryptographic generator, and `substr` is deprecated; the same pattern appears at 11 sites across the file, including the team/member id generators and the audit-log id.
- **Affected**: Predictable primary keys; weak uniqueness.
- **Fix**: Use `crypto.randomBytes(6).toString('hex')` consistently.

### TEAM-007 | low | The leaderboard, allocation, group and progression services overlap in responsibility
- **File:Line**: `server/leaderboardService.js`, `server/allocationService.js`, `server/roundProgressionService.js`, `server/groupService.js`, `server/prizeAwardService.js`, `server/prizePayoutService.js`, `server/manualRoadmapService.js` (1,895 lines), `server/roadmapGenerator.js`
- **What is wrong**: Nine services implement ranking, capacity, grouping, advancement and payouts with no single owner of the "who is in which group, who advances, who gets paid" rules, and `server/manualRoadmapService.js` alone is 1,895 lines; the tie-break and advancement rules are therefore defined in more than one place.
- **Affected**: Maintainers; bracket correctness.
- **Fix**: Define the advancement/prize rules once as pure functions with a single orchestrator, and keep the services as thin adapters over it.

---

## 8. Security — general findings

### SEC-001 | critical | Unauthenticated user-record disclosure
- **File:Line**: `server.js:2892-2913`
- **What is wrong**: `GET /api/users/:id` has no auth check and returns `SELECT * FROM users` minus only `password`, exposing e-mail, phone, KYC reference, wallet balance, roles and the admin TOTP secret to anyone.
- **Affected**: Every user.
- **Fix**: Require authentication, scope the row to the caller, and select an explicit allow-list.

*(see also SENS-001 for the full detail)*

### SEC-002 | critical | Stored SSRF through the payment screenshot proxy
- **File:Line**: `server.js:17070-17139` (fetch), `server.js:9853-9854` / `server.js:9913-9914` (attacker-controlled `screenshot_url`)
- **What is wrong**: The server fetches a client-supplied URL with no scheme/host validation, turning a registration into a proxy into the private network.
- **Affected**: The hosting account's internal network and cloud metadata endpoints.
- **Fix**: Allow-list the CDN, reject private ranges, and resolve-then-connect to defeat DNS rebinding.

### SEC-003 | critical | Unauthenticated media upload proxy
- **File:Line**: `server.js:1249-1290` (`POST /api/media/upload`)
- **What is wrong**: The handler requires no authentication, accepts an arbitrary `file` data-URI string with no size or type validation, and forwards it to the unsigned Cloudinary upload preset, so anyone can use the platform as a free image host and as a memory-exhaustion vector (the body is accumulated without a limit).
- **Affected**: The Cloudinary account, the platform's egress quota and memory.
- **Fix**: Require a session, validate MIME type and byte size, rate-limit per user, and use a signed (not unsigned) upload preset.

### SEC-004 | high | The `/api/media/upload` proxy uses an unsigned upload preset
- **File:Line**: `server.js:1274-1280` (`uploadPreset = process.env.VITE_CLOUDINARY_UPLOAD_PRESET || process.env.CLOUDINARY_UPLOAD_PRESET || 'matchdistrict_default'`)
- **What is wrong**: The preset name is taken from a `VITE_`-prefixed variable, which means it is **also embedded in the client bundle** and is therefore public; the comment states the unsigned preset is used because the API key may lack permissions.
- **Affected**: The Cloudinary account — anyone can upload arbitrary assets.
- **Fix**: Use a signed upload with a server-generated timestamp/signature, and never read a `VITE_`-prefixed variable on the server.

### SEC-005 | high | `getClientIp` trusts a spoofable header, defeating every IP rate limit
- **File:Line**: `server.js:7202-7206` (`const forwarded = req.headers['x-forwarded-for']`), used at `server.js:7957-7958`, `server.js:10176`
- **What is wrong**: The `x-forwarded-for` header is read unconditionally and the first value is used as the client IP, so any caller can set an arbitrary IP and reset their own rate-limit bucket on every request.
- **Affected**: The rate limits on invite-join, the security scan and the payment-verify path.
- **Fix**: Only honour `x-forwarded-for` from a known proxy, and use `req.socket.remoteAddress` otherwise.

### SEC-006 | high | Errors are returned to the client verbatim
- **File:Line**: `server.js:2909`, `server.js:2659`, `server.js:1538`, `server.js:3199`, `server.js:4929`, and ~225 further `JSON.stringify({ error: err.message })` sites (230 matches for `error: err.message` in `server.js`)
- **What is wrong**: Raw driver and application error messages are returned to clients, which leaks table names, column names, constraint names and file paths.
- **Affected**: Everyone — it hands an attacker the schema for free.
- **Fix**: Log the detail server-side with a correlation id and return a generic message plus the id.

### SEC-007 | high | The CORS policy allows every origin
- **File:Line**: `server.js:1238`
- **What is wrong**: `Access-Control-Allow-Origin: *` on every route means any website can read the JSON body of any endpoint, and the `Authorization` header is explicitly allowed in `Access-Control-Allow-Headers`, so any page that has obtained a token can use the full API from the victim's browser.
- **Affected**: All users and admins.
- **Fix**: Use an origin allow-list; return the request origin only on a match.

### SEC-008 | high | The `Access-Control-Allow-Headers` list omits `X-Device-Key`-style headers but allows `Authorization` unconditionally
- **File:Line**: `server.js:1239`
- **What is wrong**: The preflight allows `Authorization` from any origin, and because the companion app authenticates with a `Bearer MDK-…` device key, a cross-origin page that has leaked one device key can call every `/api/v1/*` endpoint including the bulk payment dump.
- **Affected**: Every customer whose payment data the device key can reach.
- **Fix**: Combine with an origin allow-list and require a scoped, per-device capability rather than one platform-wide key.

### SEC-009 | medium | Debug and diagnostic output is written to stdout
- **File:Line**: `server.js:1347-1352` (OTP value and e-mail), `server.js:1530` (login success with e-mail), `server.js:1574` (temporary registration e-mail), `server.js:693-697` (terms acceptance with e-mail, IP and user-agent)
- **What is wrong**: 79 `console.log` calls emit e-mail addresses, OTPs, IPs, user agents and internal ids to stdout, which on most PaaS providers is retained, indexed and readable by anyone with platform access.
- **Affected**: Users' personal data; the OTP path directly enables account takeover.
- **Fix**: Route logs through a structured logger with redaction and levels, and never log secrets or one-time codes.

### SEC-010 | medium | No CSRF defence, and the architecture accidentally relies on it
- **File:Line**: `server.js` `getAuthUser` (reads only the `Authorization` header; `req.headers.cookie` appears **0 times** in the file)
- **What is wrong**: The server never reads cookies, so it is currently CSRF-immune — but only because the SPA reads the cookie in JavaScript and re-sends it as a header. The moment the token is moved to a real `HttpOnly` cookie (the correct fix for PAY-003), the server must add CSRF protection, and nothing in the codebase is prepared for it.
- **Affected**: Future engineering work; the current design is one refactor away from a CSRF vulnerability.
- **Fix**: Introduce the `HttpOnly` cookie together with a double-submit CSRF token and an `Origin`/`Referer` check.

### SEC-011 | medium | `crypto.randomBytes` is used for most ids, but several paths use `Math.random` or timestamps
- **File:Line**: `server.js:3575`, `server.js:3772`, `server.js:4954` (tournament ids from `Date.now()` + `Math.random()`), `server.js:7262`, `server.js:7266-7267`, `server.js:7624-7625`, `server.js:8076` (team / member ids from `Math.random()`), `server.js:9764` (registration id from a truncated timestamp), `server.js:10228`, `server.js:10235` (security-finding and audit-log ids from `Date.now()`) — 11 `Math.random()` call sites in total, and no other non-cryptographic generator is used for ids
- **What is wrong**: Security-relevant identifiers (member ids, audit log ids, registration ids) are derived from `Math.random()` or a truncated millisecond timestamp, so they are predictable and collide under load.
- **Affected**: Data integrity; a predictable audit-log id can be guessed or overwritten.
- **Fix**: Centralise id generation on `crypto.randomBytes`.

### SEC-012 | medium | The admin "security scan" endpoint cannot run, so none of its other checks happen
- **File:Line**: `server.js:10175-10181` (blocked by EP-006), checks at `server.js:10185-10230`
- **What is wrong**: The endpoint that hunts for leaked secrets in the built bundle, that detects the weak admin password and that records findings into `security_findings` always returns 429, so the platform's own security monitoring has never run.
- **Affected**: The whole platform.
- **Fix**: Fix EP-006 first, then make the scan run on a schedule as well as on demand.

### SEC-013 | medium | The `otps` table has no attempt counter and the OTP path has no brute-force limit
- **File:Line**: `server.js:1300-1360`, `server/schemaMigrations.js:114-117`
- **What is wrong**: The OTP table stores only the code and its expiry, and the verification handler is not covered by the (broken) rate limiter, so a 6-digit code is brute-forceable within the 5-minute window with a 4-digit numeric PIN.
- **Affected**: Every account.
- **Fix**: Count failed attempts per e-mail/IP, lock the OTP after 5 failures, and lengthen the code to 8+ characters.

### SEC-014 | low | `console.log` on every request path makes structured logging impossible
- **File:Line**: 79 `console.log` call sites across `server.js`
- **What is wrong**: There is no logger, no request id, no duration metric and no access log, so incident investigation depends on ad-hoc prints.
- **Affected**: Operations.
- **Fix**: Introduce a structured logger with a request id middleware and an access log.

### SEC-015 | low | The in-memory rate-limit maps are per-process and unbounded
- **File:Line**: `server.js:1173` (`rateLimitMap`), `server.js:7185` (`rateLimitBuckets`)
- **What is wrong**: Both limiters live in process memory, so they reset on every deploy, do not work across multiple instances, and are bypassed entirely by a restart; the cleanup intervals only run in the process that owns them.
- **Affected**: Security controls under scale-out or redeploy.
- **Fix**: Move rate limiting to a shared store (Redis) or to the edge.

### SEC-016 | high | Security tokens are generated with a non-cryptographic PRNG
- **File:Line**: `server.js:1320` (`otp = Math.floor(100000 + Math.random() * 900000).toString()`), `server.js:1618` (`'MatchDistrictTempPass' + Math.random().toString(36).slice(-8)`), `server.js:9518` and `server.js:9736` (payment-amount suffix)
- **What is wrong**: The one-time verification code that gates registration is generated with `Math.random()`, whose output is a deterministic Mersenne Twister sequence that can be reconstructed from a handful of observed values, and the fallback registration password is derived the same way, so both are predictable to an attacker who can observe or influence a few outputs.
- **Affected**: Every user who registers or resets a password; the fallback password path also creates a shared password for every account that reaches it.
- **Fix**: Generate the OTP and any password material with `crypto.randomInt()` / `crypto.randomBytes()`, which the codebase already uses correctly for ids elsewhere (`server.js:687`).

---

## 9. Frontend

### FE-001 | high | Four admin routes have no client-side role guard
- **File:Line**: `src/App.jsx:543-565` (`/admin`, `/admin/payments`, `/admin/sponsorships`, `/admin/system-health`) vs `src/App.jsx:367-431` (`AdminAuthenticatorRoute`, `AdminProfileRoute`, `AdminOrganizersRoute`, which all check `hasRole(getUserRoles(currentUser), ROLES.ADMIN)`)
- **What is wrong**: The guarded routes redirect a non-admin to `/admin`, but the four unguarded routes render the admin component for any signed-in user, so a normal player navigating to `/admin/payments` gets the admin payments UI (and a stream of 403s, or worse, real data if any endpoint is under-guarded).
- **Affected**: Non-admin users; the admin pages themselves.
- **Fix**: Extract one `AdminRoute` wrapper and use it for every `/admin/*` route.

### FE-002 | high | The session token is readable by any script and is mirrored into `localStorage`
- **File:Line**: `src/utils/getAuthToken.js:15` and `:39` (`document.cookie.match(/(^|;)\s*token\s*=\s*([^;]+)/)`), `src/pages/Auth.jsx:553`, `:607`, `:832` (`localStorage.setItem('md_persistent_session', data.encryptedSession)`), `src/lib/apiClient.js:66-73`
- **What is wrong**: The design requires the token to be JavaScript-readable (no `HttpOnly`), and the encrypted session blob containing the same token is additionally persisted to `localStorage`, so any XSS or a malicious browser extension exfiltrates a 24-hour bearer token.
- **Affected**: Every user.
- **Fix**: Move to an `HttpOnly` cookie and let the browser attach it; keep only a non-sensitive refresh token in `sessionStorage`.

### FE-003 | medium | Date and time are rendered in two different time zones
- **File:Line**: `src/utils/timeFormat.js:11-16` (`formatDate` → browser-local), `src/utils/timeFormat.js:26-31` (`formatDateTime` → browser-local), `src/utils/timeFormat.js:41-46` (`formatDateTimeIST` → fixed `+05:30`), `src/utils/timeFormat.js:56-61` (`formatDateIST` → fixed `+05:30`)
- **What is wrong**: Four formatters coexist; two use the viewer's local timezone and two force IST, and the choice is made at each call site, so a user outside India sees some tournament times in IST and others in their own zone.
- **Affected**: All players — match times and credential release times appear inconsistent.
- **Fix**: One formatter with an explicit timezone argument, defaulting to the tournament's timezone, rendered with the zone label.

### FE-004 | medium | The front end duplicates the server's authorisation model
- **File:Line**: `src/utils/iamRoles.js:16-113` (`ROLES`, `ROLE_HIERARCHY`, `PERMISSIONS`, `hasRole`, `hasRoleClearance`, `hasCapability`), mirrored by `server.js` (`ROLES`, `ROLE_HIERARCHY`, `PERMISSIONS`, `hasRole`, `hasRoleClearance`, `hasCapability`)
- **What is wrong**: The role names, the hierarchy and the permission matrix are duplicated verbatim in the browser and the server, so a change on one side silently diverges — and the two servers already disagree about `role` versus `roles` (AUTH-001).
- **Affected**: Every role change.
- **Fix**: Share one module between client and server (the build already supports it for `server/tournamentAuth.js` on the server side) and treat the client copy as display-only.

### FE-005 | medium | The SPA ships three large image assets that dominate the bundle
- **File:Line**: `dist/assets/hero-*.png` (1.98 MB), `dist/assets/hero_mobile-*.png` (1.83 MB), `dist/assets/sponsor_lenovo-*.png` (196 KB), `dist/assets/sponsor_nvidia-*.png` (321 KB), `dist/assets/sponsor_valorant-*.png` (272 KB)
- **What is wrong**: The landing hero images are 1.8–2.0 MB PNGs that are served to every first-time visitor, and the vendor chunk is 720 KB; the total first-load payload is dominated by a single decorative image.
- **Affected**: Every new visitor, mostly on mobile data.
- **Fix**: Convert the heroes to AVIF/WebP with responsive `srcset`, lazy-load below-the-fold media, and preload only the LCP candidate.

### FE-006 | medium | The route table has no lazy loading and no data prefetch
- **File:Line**: `src/App.jsx:452-636` (every page imported eagerly at the top of the file)
- **What is wrong**: All 171 source modules are statically imported, so the initial bundle contains every admin, roadmap and tournament page even though most users only ever see the landing page and one tournament.
- **Affected**: All users — time to first byte on mobile.
- **Fix**: `React.lazy` the route elements and split by route.

### FE-007 | low | Only one error boundary exists, and it is route-scoped
- **File:Line**: `src/components/RouteErrorBoundary.jsx:6-17` (the only `componentDidCatch` in the codebase)
- **What is wrong**: A render error inside a route unmounts the whole subtree and shows the route-level fallback, with no global boundary, no error reporting and no "reload" affordance beyond a refresh.
- **Affected**: Users on flaky connections.
- **Fix**: Add a top-level error boundary and report errors to a monitored sink.

### FE-008 | low | `dangerouslySetInnerHTML` is used once, for static content
- **File:Line**: `src/pages/Auth.jsx:1104`
- **What is wrong**: The only `dangerouslySetInnerHTML` in `src/` injects a static keyframes string; it is not exploitable today but there is no lint rule preventing a future interpolation.
- **Affected**: Low risk today.
- **Fix**: Replace with a CSS `<style>` block or add an ESLint `react/no-danger` rule.

### FE-009 | low | The `apiClient` 401 handler wipes every cookie on the origin
- **File:Line**: `src/lib/apiClient.js:41-45`
- **What is wrong**: On a 401 the client iterates `document.cookie` and expires **every** cookie with `path=/`, including unrelated application cookies and any `HttpOnly` cookie it cannot actually remove.
- **Affected**: Other features sharing the origin; a single expired token logs the user out of everything.
- **Fix**: Delete only the `token` cookie by name.

---

## 10. PGV / companion app (`/api/v1/*`)

There is **no "PGV" string anywhere in the repository**. The companion app is the mobile client that talks to the `/api/v1/*` namespace using a paired-device API key. The surface is 10 routes:

| Route | Method | Auth | Notes |
|---|---|---|---|
| `/api/v1/health` | GET | none | Liveness probe |
| `/api/v1/plans` | GET | none | Public plan catalogue |
| `/api/v1/auth/device` | POST | device key | Registers/refreshes the device |
| `/api/v1/device/heartbeat` | POST | device key | Updates `last_seen_at` / `app_version` |
| `/api/v1/payments/verify` | POST | device key | **Permanently 429** (EP-006) |
| `/api/v1/payments/pending` | GET | device key | Pending payment queue |
| `/api/v1/payments/history` | GET | device key | Payment history |
| `/api/v1/payments/all` | GET | device key | **No role check** (PAY-001) |
| `/api/v1/payments/resolve` | POST | device key | Fuzzy name/UTR resolution |
| `/api/v1/payments/screenshot-image` | GET | device key | **SSRF** (PAY-002) |

### APP-001 | high | The device authentication endpoint returns the device row including the key hash
- **File:Line**: `server.js:16437-16468` (`res.end(JSON.stringify({ success: true, device: deviceAuth, … }))`), `server.js:726` (`SELECT * FROM paired_devices …`)
- **What is wrong**: `deviceAuth` is the raw `paired_devices` row, so the response includes `api_key_hash` — the SHA-256 of the platform-wide device key — which lets an attacker confirm a guessed key offline and, combined with a weak key, obtain the key itself.
- **Affected**: The whole companion-app surface.
- **Fix**: Return an explicit projection (`id`, `device_id`, `device_name`, `is_active`, `app_version`, `last_seen_at`) and never the hash.

### APP-002 | high | There is one platform-wide device key, not per-user scoped keys
- **File:Line**: `server.js:717-740` (`authenticateDevice` matches on `api_key_hash` alone), `server/schemaMigrations.js:145-157` (`paired_devices` has `device_id UNIQUE` and `api_key_hash`, but the key is not bound to a scope)
- **What is wrong**: Authentication is "does this key exist and is the device active", with no notion of what the caller is *allowed* to do, so a single key unlocks every `/api/v1/*` route including the bulk payment dump.
- **Affected**: Every customer whose data the key can reach.
- **Fix**: Store a per-device scope/permission set and check it on every route; issue one key per device, not one per platform.

### APP-003 | medium | The minimum supported app version is reported but never enforced
- **File:Line**: `server.js:1166` (`MIN_SUPPORTED_APP_VERSION = '1.1.0'`), `server.js:17059` (returned in the heartbeat response)
- **What is wrong**: The constant is only echoed back to the client; no route rejects a request from an older app version, so an outdated client that speaks a changed contract keeps working against a changed API.
- **Affected**: Reliability for both sides.
- **Fix**: Compare the `app_version` header in `authenticateDevice` against the constant and return `426 Upgrade Required`.

### APP-004 | medium | The heartbeat updates `last_seen_at` on a fire-and-forget query
- **File:Line**: `server.js:730-734`, `server.js:17046-17047`
- **What is wrong**: The `UPDATE paired_devices SET last_seen_at = NOW()` is issued without awaiting it, so the pool client is not released before the next query on the same connection and an error is swallowed by `.catch(() => {})`.
- **Affected**: Connection-pool efficiency; device-presence accuracy.
- **Fix**: Await the update (or use a separate pool) and log failures.

### APP-005 | medium | Payment resolution matches on a fuzzy, normalised name and UTR
- **File:Line**: `server.js:1199-1201` (`normalizeForFuzzy`), `server.js:1203-1215` (`fuzzyNameMatch`), `server.js:16742+` (`POST /api/v1/payments/resolve`)
- **What is wrong**: The fuzzy matcher strips every non-alphanumeric character and lowercases the name before comparing, so two different customers with similar names (or a name that normalises to an empty string) can resolve to the same payment record.
- **Affected**: Customers whose payments could be confirmed against someone else's record.
- **Fix**: Require an exact UTR match as the primary key and treat the name as a display cross-check only.

### APP-006 | low | The `/api/v1` namespace has no versioning of the response contract
- **File:Line**: `server.js:16301-17069`
- **What is wrong**: The namespace is versioned in the path, but the response shapes differ between the `v1.0` and `v1.1` comments in the code and are not documented, so a client upgrade can break silently.
- **Affected**: The mobile app.
- **Fix**: Publish a frozen contract for `/api/v1` and add `/api/v2` for changes.

---

## 11. Performance

### PERF-001 | high | The registration table has no indexes at all
- **File:Line**: `server/schemaMigrations.js:403-427`; the file creates 29 indexes, none of which touch `tournament_registrations`
- **What is wrong**: Every tournament page, dashboard, slot reconciliation, duplicate check and user-deletion cascade scans the whole registration table.
- **Affected**: All users, worsening linearly with platform growth.
- **Fix**: Add indexes on `tournament_registrations(tournament_id)`, `(user_id)`, `(status)` and `(idempotency_key)`.

### PERF-002 | high | Slot reconciliation is triggered inline by eight separate write paths
- **File:Line**: `server.js:9798`, `9857`, `10807`, `13731`, `13913`, `14002`, `16721`, `16866`
- **What is wrong**: Each trigger opens a connection, begins a transaction, reads every registration of the tournament, rewrites slot numbers, runs `assignGroups()` and re-counts — synchronously, inside the originating HTTP request.
- **Affected**: Organisers approving registrations; bulk operations are O(n²).
- **Fix**: Move reconciliation to a queue with per-tournament coalescing.

### PERF-003 | high | The tournament roadmap is a JSON blob re-parsed on every read
- **File:Line**: `server.js:846-888` (`sanitizeTimelineForUser` parses and re-serialises the whole timeline), `server.js:1048-1081` (`withTournamentDisplay`)
- **What is wrong**: The full multi-round roadmap — including credentials — is stored in one `tournaments` column, so every public listing parses, scrubs and re-serialises it, and `GET /api/tournaments` does that for the whole catalogue.
- **Affected**: The public tournament list; bandwidth and CPU.
- **Fix**: Store the roadmap in the existing `tournament_rounds`/`tournament_matches` tables and query only the columns a given view needs.

### PERF-004 | medium | `SELECT *` is used on the two hottest tables
- **File:Line**: 12 × `SELECT * FROM users` and 20 × `SELECT * FROM tournament_registrations` in `server.js`, plus 7 × `SELECT t.*` and 16 × `SELECT * FROM tournaments` and 40 × `RETURNING *`
- **What is wrong**: Every one of these pulls the credential-bearing columns (`password`, `admin_totp_secret`, `room_password`, `screenshot_url`) across the wire even when the caller discards them, which is both a performance and a data-minimisation problem.
- **Affected**: The database and the API surface.
- **Fix**: Replace `*` with explicit column lists, and make `RETURNING *` the exception rather than the default.

### PERF-005 | medium | `GET /api/organiser/tournaments` runs two correlated sub-queries per row
- **File:Line**: `server.js:4907-4913`
- **What is wrong**: The query computes `registrationCount` and `sponsorRevenue` with a `SELECT COUNT(*)` and a `SELECT SUM(...)` sub-query for every tournament returned, so an organiser with N tournaments performs 2N extra scans of `tournament_registrations` and `sponsor_contributions`.
- **Affected**: Organiser dashboards.
- **Fix**: Replace the correlated sub-queries with `LEFT JOIN` + `GROUP BY`, or a pre-aggregated view.

### PERF-006 | medium | Follower notification is an N+1 e-mail loop inside the request
- **File:Line**: `server.js:1104-1151`
- **What is wrong**: One e-mail per follower, sent synchronously.
- **Affected**: Organisers creating popular tournaments.
- **Fix**: Batch into a single call and enqueue.

### PERF-007 | medium | The `apiClient` retries 5xx and 429 three times with linear back-off
- **File:Line**: `src/lib/apiClient.js:81-110` (`MAX_RETRIES = 3`, `BASE_DELAY_MS = 500`, delay = `500 * (attempt + 1)`)
- **What is wrong**: A `429` is retried — which is exactly the response the broken rate limiter returns — so the broken payment-verify endpoint is retried three times per click, and the back-off is linear rather than exponential despite the comment claiming exponential.
- **Affected**: Users on flaky networks; the mobile app's error handling.
- **Fix**: Do not retry `429`; use exponential back-off with jitter; honour `Retry-After`.

### PERF-008 | low | The `pg` pool has no explicit sizing
- **File:Line**: `server.js:283-286` (`new Pool({ … })` with no sizing options)
- **What is wrong**: The pool is created with default settings and no `max`, `idleTimeoutMillis` or `connectionTimeoutMillis`, so under load it can open more connections than PostgreSQL's `max_connections` allows, and a hung query can hold a slot indefinitely.
- **Affected**: Database availability.
- **Fix**: Set an explicit `max` and `connectionTimeoutMillis`, and add `statement_timeout` on the server.

### PERF-009 | low | The client bundle is dominated by uncompressed images and a large vendor chunk
- **File:Line**: `dist/assets/hero-*.png` (1.98 MB), `dist/assets/hero_mobile-*.png` (1.83 MB), `dist/assets/vendor-*.js` (295 KB), `dist/assets/dependencies-*.js` (720 KB)
- **What is wrong**: See FE-005 and FE-006; the same content is reported here because the cost lands on the network.
- **Affected**: All users.
- **Fix**: Modern image formats, responsive sources, and route-level code splitting.

---

## 12. Code health

### CODE-001 | high | `server.js` is a 17,893-line single file
- **File:Line**: `server.js` (865 KB, 1,259 `res.end()` calls, ~1,000 SQL statements, 395 `try/catch` blocks)
- **What is wrong**: The HTTP server, the router, the auth layer, the DDL, the e-mailer, the payment engine, the roadmap engine and the admin tooling are all in one file, so a change to any of them requires reading all of it, and the router is a flat chain of string comparisons with no structure to test against.
- **Affected**: Every engineer on the project; the review burden is the direct cause of the dead duplicate handlers in EP-001.
- **Fix**: Split into `server/http/`, `server/routes/`, `server/services/`, `server/db/` and introduce a router with a declarative route table.

### CODE-002 | high | Duplicate and dead code is left in place throughout
- **File:Line**: `server.js:7188` (duplicate `checkRateLimit`), `server.js:1302`/`14365` (duplicate `/api/health`), `server.js:13320`-`13639` (four duplicate admin routes), `server.js:15592`-`15872` (two duplicate analytics routes), `server.js:1173` + `server.js:1191` (unreachable rate-limit map and its cleanup timer)
- **What is wrong**: Roughly 400 lines of unreachable code remain, and the duplicate `checkRateLimit` is not merely redundant — it is the cause of a critical outage in two endpoints.
- **Affected**: Maintainers; the two broken endpoints.
- **Fix**: Delete the dead blocks and enable a linter rule that flags duplicate function declarations in the same scope.

### CODE-003 | medium | Giant single-purpose page and service files
- **File:Line**: `src/pages/Profile.jsx` (4,244 lines), `src/pages/TournamentDetail.jsx` (2,205), `server/manualRoadmapService.js` (1,895), `src/components/OrganizerDashboard.jsx` (1,887), `src/pages/Auth.jsx` (1,812), `src/components/roadmap/OrganizerRoadmapView.jsx` (1,793), `src/pages/AdminDashboard.jsx` (1,669)
- **What is wrong**: Seven files exceed 1,600 lines, several of them mixing routing, data fetching, form state, validation and presentation in one component body.
- **Affected**: Maintainers; merge conflicts; testability.
- **Fix**: Extract hooks (`useTournament`, `useProfile`) and presentational sub-components, with a soft cap enforced in review.

### CODE-004 | medium | Every audit write is wrapped in a swallowing `catch`
- **File:Line**: `server.js:3637`, `4494`, `8517`, `8572`, `8886`, `9010`, `10233`, `10334`, `17731` (`catch (logErr) { /* non-critical */ }`)
- **What is wrong**: The audit trail is best-effort by design, which is why the `action`/`action_type` mismatch (SCH-001) has gone unnoticed; the same pattern hides real failures in the payment and slot paths (`server.js:16866` `catch (e) { /* non-critical */ }`).
- **Affected**: Compliance and debugging.
- **Fix**: Write audit rows in the same transaction as the change, or at minimum log the failure at `error` level with the message.

### CODE-005 | medium | Three different DDL authorities coexist
- **File:Line**: `server/schemaMigrations.js` (authoritative), `server.js:289-460` (`initDb` with ~75 ad-hoc `ALTER TABLE … ADD COLUMN IF NOT EXISTS`), `schema.sql` (stale legacy file)
- **What is wrong**: There is no single place that defines the schema, so new columns are added in whichever file the author happened to be in, and a third file documents a database that does not exist.
- **Affected**: Every engineer; the drift measured in Section 1.
- **Fix**: One migration tool, one ordered migration list, and delete the legacy file.

### CODE-006 | medium | No automated formatting or import-order enforcement
- **File:Line**: `eslint.config.js` (589 bytes), no Prettier configuration in `package.json`
- **What is wrong**: The lint configuration is a single short file and there is no formatter, so style is decided per author; the codebase visibly mixes quote styles, semicolon conventions and naming (`organiser` vs `organizer`).
- **Affected**: Maintainers; diff noise.
- **Fix**: Add Prettier with a committed config and run it in CI.

### CODE-007 | medium | Test coverage is concentrated in the pure modules, not the routes
- **File:Line**: `tests/` (62 files, ~610 KB) — heavy coverage of `roadmap*`, `allocation*`, `prize*`, `tournament*` services; nothing covering the 1,259 `res.end()` call sites in `server.js`
- **What is wrong**: The test suite is substantial and well-organised, but it exercises the extracted services rather than the HTTP layer, so every finding in this audit — the shadowed rate limiter, the missing auth check, the cross-tournament IDOR, the role injection — would pass the suite.
- **Affected**: Confidence in releases.
- **Fix**: Add request-level tests against the real handler for authentication, authorisation and the payment/slot flows.

### CODE-008 | low | `server.js` mixes UTF-8 decorative characters with mojibake in log strings
- **File:Line**: `server.js:1350` (`dY"` …), `server.js:2641` (`console.warn('�s��,? …')`), and ~60 similar log lines
- **What is wrong**: The log banner strings were written in an encoding that does not survive the current file encoding, so server logs are partly unreadable, which makes the log-based evidence in this audit harder to use and hides real errors in noise.
- **Affected**: Operations.
- **Fix**: Re-save the file as UTF-8 and replace the decorative banners with plain ASCII.

### CODE-009 | low | Scratch and experiment files are committed to the repository root
- **File:Line**: `scratch_patch_two_phase.cjs`, `scratch_patch_status.js`, `scratch_patch_status.cjs`, `test_write_gemini.txt`
- **What is wrong**: One-off debugging artefacts live next to the real source and are not excluded by any tooling.
- **Affected**: Repository hygiene.
- **Fix**: Delete them and add a `scratch/` convention to `.gitignore`.

### CODE-010 | low | `API_DOCUMENTATION.md` cannot be relied on
- **File:Line**: `API_DOCUMENTATION.md` (28 KB), `README.md`, `MATCH_DISTRICT_ANDROID_PLAN.md`, `ROADMAP_AUDIT.md`
- **What is wrong**: The repository contains substantial documentation, but this audit found behaviours that contradict it (for example the rate limiter, the role model and the schema), and there is no test that checks the documentation against the code.
- **Affected**: Onboarding and integrators.
- **Fix**: Generate the API reference from the route table, and add a CI check that fails when a route changes without a doc update.

## 13. Master finding index

All 113 findings, in document order. The severity column is this audit's own rating, not a CVSS score.

| ID | Severity | Finding |
|---|---|---|
| `SCH-001` | `high` | `admin_action_log` column mismatch silently destroys the admin audit trail |
| `SCH-002` | `high` | The live schema export is truncated, so ~49 tables cannot be verified |
| `SCH-003` | `high` | Ten production tables have no DDL anywhere in the repository |
| `SCH-004` | `medium` | `SCHEMA_TABLES` manifest omits a table the migration itself creates |
| `SCH-005` | `medium` | `tournaments` carries four organiser columns for two concepts |
| `SCH-006` | `medium` | The checked-in `schema.sql` describes a different, legacy database |
| `SCH-007` | `high` | `tournament_registrations` has no unique constraint on `(tournament_id, slot_number)` |
| `SCH-008` | `high` | The hottest table in the product has no indexes at all |
| `SCH-009` | `medium` | User deletion targets five tables that no migration creates |
| `SCH-010` | `low` | Foreign keys cover only 14 of 55 tables |
| `EP-001` | `high` | Seven route handlers are declared twice; the second copy wins |
| `EP-002` | `high` | There is no request body size limit anywhere |
| `EP-003` | `high` | No HTTP security headers are set |
| `EP-004` | `medium` | `Access-Control-Allow-Origin: *` is applied to every route, including admin ones |
| `EP-005` | `medium` | No rate limiting on authentication, registration or password reset |
| `EP-006` | `critical` | A duplicate `checkRateLimit` declaration permanently breaks two endpoints |
| `AUTH-001` | `critical` | Registration lets a client choose its own role, yielding organiser rights over every tournament |
| `AUTH-002` | `critical` | Final registration requires no e-mail verification |
| `AUTH-003` | `high` | Role changes do not take effect until the 24-hour JWT expires |
| `AUTH-004` | `high` | The shared organiser guard accepts five different spellings of the owner column |
| `AUTH-005` | `medium` | `requireOrganizer` trusts the token's role claim instead of the database |
| `AUTH-006` | `medium` | JWT signature comparison is not constant-time |
| `AUTH-007` | `medium` | A user can request an OTP for any e-mail address with no captcha or throttling |
| `AUTH-008` | `medium` | No session revocation, no logout invalidation on the server |
| `AUTH-009` | `low` | `encryptSessionData` uses unauthenticated AES-CBC |
| `SENS-001` | `critical` | `GET /api/users/:id` is unauthenticated and returns an entire user row |
| `SENS-002` | `critical` | `GET /api/users` returns password hashes and the admin TOTP secret to admins |
| `SENS-003` | `critical` | The admin TOTP secret is stored in plaintext in the user table |
| `SENS-004` | `critical` | The production admin password is the code's own hardcoded weak default |
| `SENS-005` | `high` | Password hashing uses 1,000 PBKDF2 iterations and falls back to plaintext comparison |
| `SENS-006` | `high` | OTPs are printed to stdout and stored in plaintext |
| `SENS-007` | `high` | The database TLS connection disables certificate verification |
| `SENS-008` | `high` | Room IDs and passwords are stored in plaintext and rendered directly in the UI |
| `SENS-009` | `medium` | Payment screenshots and UTR references are stored as arbitrary URLs |
| `SENS-010` | `medium` | `.env` is committed-adjacent: `dockerignore` and `Dockerfile` may copy it into the image |
| `SENS-011` | `low` | The admin password is compared to a literal in the source tree |
| `PAY-001` | `critical` | Any paired device key can dump every payment record in the platform |
| `PAY-002` | `critical` | The payment screenshot proxy is a server-side request forgery vector |
| `PAY-003` | `critical` | The session cookie has no `HttpOnly` and no `Secure`, and the token is also returned in the body |
| `PAY-004` | `high` | Slot reservation is a check-then-act sequence with no transaction and no unique constraint |
| `PAY-005` | `high` | The slot worker strips slot numbers from pending registrations, contradicting the registration check |
| `PAY-006` | `high` | `slotsFilled` counts a different set of registrations than the slot map |
| `PAY-007` | `high` | `PUT /api/tournaments/:id/registrations/:regId` does not scope the registration to the tournament |
| `PAY-008` | `high` | Cross-tournament access is possible on other registration-scoped routes too |
| `PAY-009` | `medium` | The registration handler has no transaction around the duplicate check, the slot check and the insert |
| `PAY-010` | `medium` | The registration id is a truncated timestamp |
| `PAY-011` | `medium` | `POST /api/auth/register` returns the entire new user row, including the password hash |
| `LIFE-001` | `high` | Two different credential-release time conventions coexist |
| `LIFE-002` | `high` | Slot reconciliation runs on every registration and approval write, inside the request |
| `LIFE-003` | `medium` | `startSlotManagerWorker` is a no-op, so no periodic reconciliation exists |
| `LIFE-004` | `medium` | Follower notification sends one e-mail per follower inside the request |
| `LIFE-005` | `medium` | The tournament timeline is stored as a JSON blob inside the tournament row |
| `LIFE-006` | `medium` | Timeline sanitisation is applied by hand, and at least one organiser route omits it |
| `LIFE-007` | `medium` | `isRegisteredForTournament` accepts `pending` registrations as "registered" |
| `LIFE-008` | `low` | Tournament duplication does not carry over the roadmap state |
| `LIFE-009` | `low` | `GET /api/health` is implemented twice with no health/readiness distinction |
| `TEAM-001` | `high` | Four different definitions of "this registration occupies a slot" coexist |
| `TEAM-002` | `high` | Squad capacity is derived from the registration roster, ignoring the tournament's match type |
| `TEAM-003` | `medium` | Two copies of the squad rules exist — one in the server, one in the browser |
| `TEAM-004` | `medium` | A join can insert a member with a `NULL` roster slot |
| `TEAM-005` | `medium` | Invitation tokens are stored in plaintext and travel in the URL |
| `TEAM-006` | `medium` | Team member ids are generated with `Math.random` |
| `TEAM-007` | `low` | The leaderboard, allocation, group and progression services overlap in responsibility |
| `SEC-001` | `critical` | Unauthenticated user-record disclosure |
| `SEC-002` | `critical` | Stored SSRF through the payment screenshot proxy |
| `SEC-003` | `critical` | Unauthenticated media upload proxy |
| `SEC-004` | `high` | The `/api/media/upload` proxy uses an unsigned upload preset |
| `SEC-005` | `high` | `getClientIp` trusts a spoofable header, defeating every IP rate limit |
| `SEC-006` | `high` | Errors are returned to the client verbatim |
| `SEC-007` | `high` | The CORS policy allows every origin |
| `SEC-008` | `high` | The `Access-Control-Allow-Headers` list omits `X-Device-Key`-style headers but allows `Authorization` unconditionally |
| `SEC-009` | `medium` | Debug and diagnostic output is written to stdout |
| `SEC-010` | `medium` | No CSRF defence, and the architecture accidentally relies on it |
| `SEC-011` | `medium` | `crypto.randomBytes` is used for most ids, but several paths use `Math.random` or timestamps |
| `SEC-012` | `medium` | The admin "security scan" endpoint cannot run, so none of its other checks happen |
| `SEC-013` | `medium` | The `otps` table has no attempt counter and the OTP path has no brute-force limit |
| `SEC-014` | `low` | `console.log` on every request path makes structured logging impossible |
| `SEC-015` | `low` | The in-memory rate-limit maps are per-process and unbounded |
| `SEC-016` | `high` | Security tokens are generated with a non-cryptographic PRNG |
| `FE-001` | `high` | Four admin routes have no client-side role guard |
| `FE-002` | `high` | The session token is readable by any script and is mirrored into `localStorage` |
| `FE-003` | `medium` | Date and time are rendered in two different time zones |
| `FE-004` | `medium` | The front end duplicates the server's authorisation model |
| `FE-005` | `medium` | The SPA ships three large image assets that dominate the bundle |
| `FE-006` | `medium` | The route table has no lazy loading and no data prefetch |
| `FE-007` | `low` | Only one error boundary exists, and it is route-scoped |
| `FE-008` | `low` | `dangerouslySetInnerHTML` is used once, for static content |
| `FE-009` | `low` | The `apiClient` 401 handler wipes every cookie on the origin |
| `APP-001` | `high` | The device authentication endpoint returns the device row including the key hash |
| `APP-002` | `high` | There is one platform-wide device key, not per-user scoped keys |
| `APP-003` | `medium` | The minimum supported app version is reported but never enforced |
| `APP-004` | `medium` | The heartbeat updates `last_seen_at` on a fire-and-forget query |
| `APP-005` | `medium` | Payment resolution matches on a fuzzy, normalised name and UTR |
| `APP-006` | `low` | The `/api/v1` namespace has no versioning of the response contract |
| `PERF-001` | `high` | The registration table has no indexes at all |
| `PERF-002` | `high` | Slot reconciliation is triggered inline by eight separate write paths |
| `PERF-003` | `high` | The tournament roadmap is a JSON blob re-parsed on every read |
| `PERF-004` | `medium` | `SELECT *` is used on the two hottest tables |
| `PERF-005` | `medium` | `GET /api/organiser/tournaments` runs two correlated sub-queries per row |
| `PERF-006` | `medium` | Follower notification is an N+1 e-mail loop inside the request |
| `PERF-007` | `medium` | The `apiClient` retries 5xx and 429 three times with linear back-off |
| `PERF-008` | `low` | The `pg` pool has no explicit sizing |
| `PERF-009` | `low` | The client bundle is dominated by uncompressed images and a large vendor chunk |
| `CODE-001` | `high` | `server.js` is a 17,893-line single file |
| `CODE-002` | `high` | Duplicate and dead code is left in place throughout |
| `CODE-003` | `medium` | Giant single-purpose page and service files |
| `CODE-004` | `medium` | Every audit write is wrapped in a swallowing `catch` |
| `CODE-005` | `medium` | Three different DDL authorities coexist |
| `CODE-006` | `medium` | No automated formatting or import-order enforcement |
| `CODE-007` | `medium` | Test coverage is concentrated in the pure modules, not the routes |
| `CODE-008` | `low` | `server.js` mixes UTF-8 decorative characters with mojibake in log strings |
| `CODE-009` | `low` | Scratch and experiment files are committed to the repository root |
| `CODE-010` | `low` | `API_DOCUMENTATION.md` cannot be relied on |

---

## 14. What could not be verified, and why

The audit was read-only by design: no code was changed, no test or build was run, and no database or network connection was opened. The following questions **cannot** be answered from the repository alone. No finding above depends on guessing them — each is either confirmed from source, or explicitly labelled as unverified.

| # | What could not be verified | Why | How to close it |
|---|---|---|---|
| 1 | Whether `.env` is actually tracked by git | `git` is not on the audit host's PATH and no `git.exe` was found at the standard locations. `.gitignore:28` lists `.env` and a `.git/` directory with at least one commit exists, so the *intent* to exclude it is confirmed, but the index was never read. | `git ls-files --error-unmatch .env` (expect: not found) plus `git log --all -- .env`. |
| 2 | The complete live schema | `schema_live.csv` is 101 lines and ends **mid-table** at `organiser_followers,user_id`. Because the export is alphabetical, every table sorting after `o` — including `users`, `tournaments`, `tournament_registrations`, `paired_devices`, `payment_verifications`, `subscribed` — is absent, and it is impossible to distinguish "table missing" from "table not exported". | Re-export `information_schema.columns` for all tables with no `LIMIT`, then re-run the diff. Until then, treat every "missing table" claim as *unverified*. |
| 3 | Live indexes, unique constraints, foreign keys and check constraints | The CSV export is column-only, and there is no database access by design. The 29-index / 14-FK counts in section 1 describe what the **code** creates, not what the database actually enforces. | Export `pg_indexes`, `information_schema.table_constraints` and `information_schema.key_column_usage`. |
| 4 | Supabase RLS policies | The client bundle ships `SUPABASE_ANON_KEY`, which is public by design. If any table is reachable with the anon key and RLS is not enabled on it, the exposure surface is far larger than anything this audit measured. | Query `pg_policies` for every table in `public`, then probe each table with the anon key. |
| 5 | The runtime behaviour of every route | No server was started and no request was issued. Every finding above is derived from static reading of the handler bodies and the SQL they execute. | After EP-006 is fixed, boot against a seeded staging database and replay the route table in `AUDIT_ENDPOINTS.md` with anonymous / player / organiser / admin credentials. |
| 6 | Whether the test suite currently passes | Tests were not run. `package.json` lists 30 test files; `tests/` holds 62 files (~610 KB). | `npm test`. |
| 7 | Whether the built `dist/` bundle matches the current source | `dist/` was rebuilt at 12:37 PM and the last source edit was 12:30 PM, so the bundle is *probably* current — but no build hash ties `dist/assets/*.js` to a source revision. | Build in CI and embed the source commit in the bundle manifest. |
| 8 | E-mail delivery, Resend quota and domain reputation, Cloudinary preset policy, Supabase Auth behaviour | These are external services; the code shows only the outbound request. | Confirm the Cloudinary preset is unsigned **and** unrate-limited, and review the Resend domain/quotas. |
| 9 | Whether `admin_action_log` really lacks the `action` column in production | The CSV export is the only ground truth and it is truncated — but `admin_action_log` sorts *before* the truncation point and its column list (`action_type`, no `action`) is unambiguous, so SCH-001 is high-confidence rather than merely inferred. | `SELECT column_name FROM information_schema.columns WHERE table_name = 'admin_action_log';` |
| 10 | Row counts, data volumes and real index usage | Requires database access. | `pg_stat_user_indexes` for unused indexes and `pg_stat_statements` for the hot queries flagged in PERF-003 and PERF-005. |
| 11 | Whether a CDN / WAF / reverse proxy already mitigates some findings | The deployment topology is not described in the repository. | Confirm what terminates TLS, whether `x-forwarded-for` is overwritten by a trusted proxy (which would neutralise SEC-005), and whether a body-size limit is enforced at the edge (which would reduce EP-002). |

### Things that *were* verified, and are worth restating

- **No secret value was printed, copied or transcribed** into this report. Only file, line and secret *type* are recorded.
- `.env` is listed in `.gitignore`; `.env.example` contains placeholders only and no live value.
- The only credential-shaped string in the built client bundle is `SUPABASE_ANON_KEY`, which is designed to be public.
- The repository contains **no literal string `PGV`**; the companion surface is the `/api/v1/*` namespace (10 routes).
- The server never reads `req.headers.cookie` (0 occurrences in 17,893 lines) — SEC-010 is an accurate description of the current state, not an assumption.

---

## 15. Phased remediation order

The order below is driven by *exploitability and blast radius first*, then by whether a fix is a prerequisite for another fix. It is deliberately not ordered by severity number alone: EP-006 is high-impact but sits in Phase 1 because it is a one-line fix that unlocks the platform's own security scanner, while PAY-003 sits in Phase 1 because it cannot ship without SEC-010.

### Phase 0 — Emergency (same day, before anything else ships)

These are actively exploitable right now and each is a small, contained edit.

| # | Findings | Action |
|---|---|---|
| 0.1 | SENS-004 | Rotate `ADMIN_PASSWORD` to a strong unique value; delete the literal default from `server.js`; fail startup when the password matches a known-bad fingerprint. |
| 0.2 | SENS-001, SENS-002, SENS-003 | Stop returning `SELECT * FROM users`. Introduce an explicit column allow-list, strip `password` / `admin_totp_secret` / `kycDoc` from every user projection, and put an authentication check on `GET /api/users/:id`. |
| 0.3 | AUTH-001 | Never accept `role` from the client. Force `role = 'player'` and `roles = ['user']` at `server.js:1571` and `server.js:1654`; make `isTournamentOrganizer` read the `roles` array exactly as `hasRole` does. |
| 0.4 | PAY-001 | Add a `VERIFY_PAYMENTS` capability check to `GET /api/v1/payments/all` and remove customer e-mail / phone from the payload. |
| 0.5 | PAY-002, SENS-009 | Stop storing client-supplied URLs as `screenshot_url`. Accept only uploaded file ids or a fixed CDN allow-list; reject non-HTTPS and private/link-local targets. |
| 0.6 | SEC-003, SEC-004 | Require a session on `POST /api/media/upload`, cap the body, validate MIME type, rate-limit per user, and switch to a signed upload preset. |

### Phase 1 — Critical correctness & security hardening (≤ 1 week)

| # | Findings | Action |
|---|---|---|
| 1.1 | EP-006 | Remove the duplicate `checkRateLimit` at `server.js:7188` (or rename it) so the object-returning implementation at `server.js:1175` is the only one — but **keep** the `server.js:7188` behaviour available to the invite-join call site at `server.js:7957-7958`, which currently relies on the boolean form. Unifies instead of deletes. |
| 1.2 | AUTH-002 | Record a `verified_at` / `otp_verified` flag on `temp_users` when the OTP validates, and reject `POST /api/auth/register` for rows without it. |
| 1.3 | SEC-016, SENS-006 | Generate OTPs with `crypto.randomInt`, stop printing them to stdout, and store only a hash of the OTP in the `otps` table. |
| 1.4 | SENS-005 | Raise PBKDF2 to ≥ 600,000 iterations (or migrate to scrypt/argon2id), delete the plaintext comparison fallback, and force a reset for any row that still matches in plaintext. Re-hash transparently on next login. |
| 1.5 | SENS-007 | Enable `rejectUnauthorized: true` with the managed-CA certificate, or `sslmode=verify-full` in `DATABASE_URL`, and pin the CA. |
| 1.6 | SEC-005, SEC-007, SEC-008, EP-004 | Replace `Access-Control-Allow-Origin: *` with a configured allow-list; honour `x-forwarded-for` only from a known proxy and otherwise use `req.socket.remoteAddress`. |
| 1.7 | SEC-006 | Stop returning `err.message` to clients (≈230 sites). Log the detail server-side with a correlation id and return a generic message plus the id. |
| 1.8 | PAY-003 + SEC-010 **together** | Move to `HttpOnly; Secure; SameSite=Lax` session cookies, stop returning the JWT in the body, and introduce double-submit CSRF tokens plus an `Origin`/`Referer` check **in the same change**. These two must not ship separately. |
| 1.9 | SCH-001, CODE-004 | Rename `action` → `action_type` in the nine broken audit inserts and stop wrapping audit writes in a swallowing `catch`, so the admin trail starts recording. |

### Phase 2 — High: data integrity, money and authorisation (2–4 weeks)

| # | Findings | Action |
|---|---|---|
| 2.1 | PAY-004, PAY-007, PAY-008, PAY-009 | Scope every registration mutation by `tournament_id` **and** by the caller (`user_id` or organiser ownership); wrap the duplicate check, slot check and insert in one transaction with `SELECT … FOR UPDATE`. |
| 2.2 | PAY-005, PAY-006, TEAM-001, LIFE-007 | Create one `server/registrationStatus.js` exporting `SLOT_HOLDING_STATUSES`, `ELIGIBLE_STATUSES` and `EXCLUDED_STATUSES`, and import it in `server.js`, `workers/slotManagerWorker.js`, `server/registrationTeamBridge.js`, `server/squadRegistrationService.js` and `isRegisteredForTournament`. |
| 2.3 | TEAM-002 | Cap the derived squad capacity at `maxMembersForMatchType(tournament.match_type)` and reject over-sized rosters at registration. |
| 2.4 | SCH-007, SCH-008, PERF-001 | Add the unique index on `(tournament_id, slot_number) WHERE slot_number IS NOT NULL`, translate `23505` into `SLOT_TAKEN`, and add indexes on `(tournament_id)`, `(user_id)`, `(status)` and `(idempotency_key)`. |
| 2.5 | SCH-003 | Write `CREATE TABLE IF NOT EXISTS` DDL for the ten tables that have none, so staging / DR / CI rebuilds are possible. |
| 2.6 | APP-001, APP-002, SEC-008 | Replace the platform-wide device key with per-device scoped keys, add a capability check to every `/api/v1/*` route, and stop returning `api_key_hash`. |
| 2.7 | AUTH-003, AUTH-004, AUTH-005 | Shorten the access token to 15 minutes with refresh, re-read the role from the database for privileged operations, and make `isTournamentOrganizer` read exactly one owner column and fail closed. |
| 2.8 | EP-001, EP-002, EP-003 | Delete the seven duplicate handlers, add a shared body reader with a hard cap (1 MB JSON / 10 MB upload) that answers `413`, and set the standard security headers. |
| 2.9 | FE-001, FE-002 | Extract one `AdminRoute` wrapper for every `/admin/*` route, and stop mirroring the token into `localStorage`. |
| 2.10 | PERF-002, PERF-003, LIFE-005, LIFE-006 | Move the roadmap out of the `tournaments` JSON blob into `tournament_rounds` / `tournament_matches`, and move slot reconciliation to a queued worker with per-tournament coalescing. |
| 2.11 | LIFE-001 | Delete `roundReleaseEpoch` and call the single IST-based `server/matchRelease.js` helper everywhere. |
| 2.12 | CODE-001, CODE-002 | Split `server.js` behind a declarative router and delete the ~400 lines of unreachable code. |

### Phase 3 — Medium (1–2 months)

| # | Findings | Action |
|---|---|---|
| 3.1 | EP-005, AUTH-007, SEC-013, AUTH-008 | Per-IP and per-account throttling on `/api/auth/*` backed by a shared store; an OTP attempt counter with a hard lock; server-side session revocation. |
| 3.2 | SEC-009, SEC-014, CODE-008 | Introduce a structured logger with levels, redaction and a request id; stop printing e-mails, OTPs, IPs and user agents; re-save `server.js` as clean UTF-8. |
| 3.3 | SENS-008, SENS-010, TEAM-005 | Encrypt room credentials at rest and serve them only through the time-gated endpoint; store only a hash of invitation tokens and move them out of the URL; add `.env` to `.dockerignore` and inject secrets at runtime. |
| 3.4 | AUTH-006, AUTH-009, TEAM-003, TEAM-004 | Constant-time JWT comparison; AES-256-GCM for the session blob; one authoritative squad-rules module shared with the client; never insert a `NULL` roster slot. |
| 3.5 | SCH-004, SCH-005, SCH-006, SCH-009, CODE-005 | One migration tool and one ordered migration list; add `organiser_followers` to `SCHEMA_TABLES`; remove the duplicate organiser columns; delete the legacy `schema.sql`; fix the delete-user statement list. |
| 3.6 | LIFE-003, LIFE-004, PERF-006, APP-004 | Implement the periodic slot sweep; batch and enqueue follower notifications; await the heartbeat update. |
| 3.7 | PERF-004, PERF-005, PERF-007 | Replace `SELECT *` / `RETURNING *` with explicit column lists; convert the correlated sub-queries to `LEFT JOIN` + `GROUP BY`; stop retrying `429` and use exponential back-off with jitter. |
| 3.8 | FE-003, FE-004, FE-005, FE-006, APP-003, APP-005 | One timezone-aware formatter; share the role matrix between client and server; AVIF/WebP heroes with `srcset`; `React.lazy` the routes; enforce `MIN_SUPPORTED_APP_VERSION`; require an exact UTR match for payment resolution. |
| 3.9 | CODE-003, CODE-006, CODE-007 | Split the seven >1,600-line files; add Prettier and an import-order rule; add request-level tests for authentication, authorisation and the payment/slot flows. |

### Phase 4 — Low / hygiene (ongoing, no deadline)

CODE-009, CODE-010, FE-007, FE-008, FE-009, APP-006, LIFE-008, LIFE-009, PERF-008, PERF-009, SCH-010, SEC-015, TEAM-007, AUTH-009.

### Sequencing constraints that must not be broken

1. **PAY-003 and SEC-010 ship together.** Moving to an `HttpOnly` cookie without adding CSRF protection converts a currently-inert design into a live CSRF vulnerability.
2. **EP-006 first.** The admin security scanner (SEC-012) is the mechanism that would have caught SENS-004; it cannot report anything while the rate limiter always answers 429.
3. **SEC-001 and SEC-002 are the same issue in two sections.** Fixing one without the other leaves the disclosure open.
4. **SCH-007 (unique index) must land with PAY-004.** The unique constraint alone will turn a silent double-booking into a user-visible 500 until the `23505` handling exists.
5. **AUTH-001 and AUTH-002 are a pair.** Removing the role injection without enforcing OTP verification still leaves mass unverified account creation.
6. **SENS-005 needs a migration, not a flag.** Raising the iteration count invalidates every existing hash unless the plaintext-fallback path is used to re-hash on next login.
7. **SCH-002 blocks the rest of the schema work.** Re-export the live schema before acting on any "missing table" claim.

---



