# Match District — Full Database Schema Audit (`AUDIT_SCHEMA.md`)

**Audit Scope:** Database schema comparison between live export (`schema_live.csv`), code migrations (`server/schemaMigrations.js`), runtime initialization (`server.js:initDb()`), and application SQL queries.  
**Mode:** Read-only analysis. No database connection or destructive changes.

---

## 1. Executive Summary & Ground Truth Assessment

### Ground Truth Hierarchy
1. **`schema_live.csv` (Live Production Snapshot)**:
   - 101 lines exported from PostgreSQL `information_schema.columns`.
   - Contains 15 tables alphabetically from `admin_action_log` to `organiser_followers`.
   - **Critical Caveat (SCH-002)**: The export is **truncated** at line 101 on `organiser_followers,user_id,character varying`. Tables from P to Z (e.g., `paired_devices`, `tournaments`, `tournament_registrations`, `users`, `subscriptions`) are absent solely due to export truncation.
2. **`server/schemaMigrations.js` (Authoritative Code DDL)**:
   - Contains `SCHEMA_TABLES` manifest (59 tables) and `runSchemaMigrations()` creating core tables.
3. **`initDb()` in [server.js](file:///e:/Projects/MatchDistrict/server.js#L288)**:
   - Executes `runSchemaMigrations()` followed by ~75 additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements for tournament roadmaps, stages, and custom columns.
4. **`schema.sql` (Obsolete Legacy Schema)**:
   - Uses UUID primary keys and deprecated tables (`organizer_profiles`, `room_credentials`, `notices`). Does not match the active `VARCHAR(50)` architecture.

---

## 2. Table Inventory & Reconciliation Matrix

| Table Name | In `schema_live.csv`? | In `schemaMigrations.js`? | In `initDb()`? | Status & Operational Impact |
| :--- | :---: | :---: | :---: | :--- |
| `admin_action_log` | **Yes** (7 cols) | **Yes** | Yes | Live table has `action_type`, lacks `action`. 9 inserts fail silently (SCH-001). |
| `alerts` | **Yes** (7 cols) | **Yes** | Yes | Fully present. |
| `analytics_events` | **Yes** (6 cols) | **NO** | No | **Orphaned Live Table (SCH-003)**: Queried at `server.js:15571`, no DDL in repo. |
| `api_keys` | **Yes** (11 cols) | **NO** | No | **Orphaned Live Table (SCH-003)**: No DDL in repo; DR/staging rebuild impossible. |
| `automation_rules` | **Yes** (9 cols) | **NO** | No | **Orphaned Live Table (SCH-003)**: No DDL in repo. |
| `billing_history` | **Yes** (8 cols) | **NO** | No | **Orphaned Live Table (SCH-003)**: Queried at `server.js:15085`, no DDL in repo. |
| `custom_links` | **Yes** (8 cols) | **NO** | No | **Orphaned Live Table (SCH-003)**: No DDL in repo. |
| `custom_registration_forms` | **Yes** (7 cols) | **NO** | No | **Orphaned Live Table (SCH-003)**: No DDL in repo. |
| `custom_subdomains` | **Yes** (6 cols) | **NO** | No | **Orphaned Live Table (SCH-003)**: No DDL in repo. |
| `export_usage_log` | **Yes** (6 cols) | **NO** | No | **Orphaned Live Table (SCH-003)**: No DDL in repo. |
| `feature_flags` | **Yes** (8 cols) | **NO** | No | **Orphaned Live Table (SCH-003)**: Queried at `server.js:15999`, no DDL in repo. |
| `games` | **Yes** (6 cols) | **NO** | No | **Orphaned Live Table (SCH-003)**: Queried at `server.js:14008`, no DDL in repo. |
| `monitoring_settings` | **Yes** (3 cols) | **Yes** | Yes | Fully present. |
| `notifications` | **Yes** (5 cols) | **Yes** | Yes | Fully present. |
| `organiser_followers` | **Yes** *(truncated)* | **Yes** | Yes | Live export ends on column 2 (`user_id`). Missing from `SCHEMA_TABLES` array (SCH-004). |
| `users` | Truncated out | **Yes** | Yes | Core table; `display_name` does not exist (resolved via `server/userUtils.js`). |
| `tournaments` | Truncated out | **Yes** | Yes | Uses mixed-case columns (`"slotsTotal"`, `"roomID"`). Has duplicate org columns. |
| `tournament_registrations` | Truncated out | **Yes** | Yes | Hottest table; lacks hot-path indexes and unique constraint on `(tournament_id, slot_number)`. |
| `tournament_teams` | Truncated out | **Yes** | Yes | Has FKs and indices for leader and tournament. |
| `tournament_team_members` | Truncated out | **Yes** | Yes | Has unique index on `(tournament_team_id, roster_slot)`. |
| `tournament_team_invitations` | Truncated out | **Yes** | Yes | Invitation token gate; active. |
| `tournament_matches` | Truncated out | **Yes** | Yes | Additive columns (`district_id`, `day_id`, `round_id`) added via `initDb()`. |
| `tournament_rounds` | Truncated out | **Yes** | Yes | Roadmaps & progression engine table. |
| `tournament_days` | Truncated out | **Yes** | Yes | Roadmaps calendar table; column `date` is a SQL reserved word. |
| `tournament_groups` | Truncated out | **Yes** | Yes | Roadmaps group allocation table. |
| `tournament_rooms` | Truncated out | **Yes** | Yes | Dedicated room credentials table. |
| `paired_devices` | Truncated out | **Yes** | Yes | PGV companion app device authentication table. |
| `payment_verifications` | Truncated out | **Yes** | Yes | DDL updated to include all 13 runtime columns. |
| `subscriptions` | Truncated out | **Yes** | Yes | Created with `plan_start_date`; additive `created_at` migration added. |

---

## 3. Column-Level Mismatches & Code Discrepancies

### 1. `admin_action_log.action` vs `action_type` (SCH-001)
- **Problem**: In [schema_live.csv](file:///e:/Projects/MatchDistrict/schema_live.csv#L2-L8), the table has columns: `id`, `admin_id`, `action_type`, `target_type`, `target_id`, `details`, `created_at`. It has **no** column named `action`.
- **Failing Invocations**:
  - `server.js:3637` (Tournament create)
  - `server.js:4494` (Tournament update)
  - `server.js:8517` (Squad waive)
  - `server.js:8572` (Squad unwaive)
  - `server.js:8886` (Allocation release)
  - `server.js:9010` (Match credentials update)
  - `server.js:10233` (Registration status change)
  - `server.js:10334` (Registration reject)
  - `server.js:17731` (Security scan logging)
- **Result**: Each query throws `column "action" does not exist`, caught and swallowed by `catch {}`. The audit log is completely empty for critical admin actions.

### 2. `users.display_name` (Resolved)
- **Problem**: `users` has `name`, `"gamerTag"`, and `email`, but no `display_name`.
- **Resolution**: Implemented shared SQL helper `userDisplayNameSql('u')` in [server/userUtils.js](file:///e:/Projects/MatchDistrict/server/userUtils.js) falling back to `name` → `"gamerTag"` → `split_part(email, '@', 1)` → `'Player'`.

### 3. `tournaments.players_per_team`
- **Problem**: Historical queries attempted to read `tournaments.players_per_team`. The column does not exist in live database or code DDL.
- **Resolution**: Squad capacity is dynamically derived from `tournament_registrations.members` length with fallback to `match_type` (`solo: 1`, `duo: 2`, `squad: 4`).

### 4. `tournaments."entryFee"` vs `entry_fee_amount`
- **Problem**: Live schema stores numeric entry fees in `entry_fee_amount` (INTEGER) and display text in `entry` (VARCHAR). Analytics queries at `server.js:15565` and `15813` attempted to read `"entryFee"`.
- **Resolution**: Standardized on `entry_fee_amount` with `ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "entryFee" VARCHAR(100);` compatibility.

### 5. `subscriptions.created_at` vs `plan_start_date`
- **Problem**: The base `subscriptions` table was created with `plan_start_date TIMESTAMP`, but admin endpoints sorted by `s.created_at DESC` (`server.js:13333`, `13535`).
- **Resolution**: Added `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();` and query fallback `ORDER BY COALESCE(s.created_at, s.plan_start_date) DESC`.

---

## 4. PostgreSQL Identifier Casing Audit

PostgreSQL folds unquoted identifiers to lower-case. When tables are created with double-quoted mixed-case column names, unquoted queries will fail with `column ... does not exist`.

| Table | Column | Schema Definition | Unquoted Reference Risk | Status |
| :--- | :--- | :--- | :--- | :--- |
| `tournaments` | `"slotsTotal"` | `INTEGER DEFAULT 100` | Folds to `slotstotal` | Quoted everywhere |
| `tournaments` | `"slotsFilled"` | `INTEGER DEFAULT 0` | Folds to `slotsfilled` | **Fixed at line 15081** |
| `tournaments` | `"roomID"` | `VARCHAR(100)` | Folds to `roomid` | Quoted in queries |
| `tournaments` | `"roomPassword"` | `VARCHAR(100)` | Folds to `roompassword` | Quoted in queries |
| `tournaments` | `"orgId"` | `VARCHAR(50)` | Folds to `orgid` | Quoted in queries |
| `tournaments` | `"orgName"` | `VARCHAR(255)` | Folds to `orgname` | Quoted in queries |
| `tournaments` | `"isDraft"` | `BOOLEAN DEFAULT false` | Folds to `isdraft` | Quoted in queries |
| `users` | `"gamerTag"` | `VARCHAR(255)` | Folds to `gamertag` | Quoted in queries |
| `users` | `"orgHandle"` | `VARCHAR(100)` | Folds to `orghandle` | Quoted in queries |
| `users` | `"orgImage"` | `TEXT` | Folds to `orgimage` | Quoted in queries |
| `tournament_days` | `"date"` | `VARCHAR(30)` | Keyword collision with `DATE` | **Quoted in queries (d."date")** |

---

## 5. Duplicate Column Analysis: `"orgId"` vs `org_id`

`tournaments` carries duplicate columns created via `initDb()`:
```sql
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "orgId" VARCHAR(50);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "orgName" VARCHAR(255);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS org_id VARCHAR(50);
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS org_name VARCHAR(255);
```
- **Code Usage**: Over 95% of server queries write and filter by camelCase `t."orgId"`.
- **Snake-case Usage**: A few queries read `COALESCE(t."orgId", t.org_id)` or `WHERE (t."orgId" = $1 OR t.org_id = $1)`.
- **Finding (SCH-005)**: Having both columns creates data drift where `org_id` remains `NULL` on new tournament inserts.
- **Recommendation**: Standardize exclusively on `org_id` and `org_name` (snake_case) or create a generated column / trigger sync.

---

## 6. Constraints, Keys & Indexing Gaps

### Foreign Key Coverage (SCH-010)
Only 14 of 55 tables enforce `REFERENCES ... ON DELETE CASCADE`:
- `paired_devices(user_id)` → `users(id)`
- `tournament_matches(tournament_id)` → `tournaments(id)`
- `tournament_team_members(tournament_team_id)` → `tournament_teams(id)`
- `tournament_days(tournament_id)` → `tournaments(id)`
- `tournament_groups(tournament_id)` → `tournaments(id)`
- `tournament_rooms(tournament_id)` → `tournaments(id)`

**Critical Missing Cascades**:
- `tournament_registrations` does not cascade delete when `tournaments` is deleted.
- Deleting users via `DELETE FROM users WHERE id = $1` relies on 25 manual delete queries (`server.js:2920-2975`) instead of foreign key cascades. Five of these target non-existent tables (`tournament_notices`, `tournament_messages`, `staff_members`, `white_label_settings`, `wallet_transactions`), throwing errors and aborting user deletion midway.

### Missing Unique Constraints (SCH-007)
- **Table**: `tournament_registrations`
- **Missing Constraint**: `UNIQUE (tournament_id, slot_number)`
- **Impact**: Under concurrent registrations, two callers can reserve the same slot number, leading to double-booked slots.
- **Fix Required**:
  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS uq_reg_slot 
  ON tournament_registrations(tournament_id, slot_number) 
  WHERE slot_number IS NOT NULL;
  ```

### Missing Indexes on Hot Paths (SCH-008, PERF-001)
`tournament_registrations` is queried on every tournament view, user dashboard, admin registration review, and slot reconciliation worker, yet lacks basic indexes:
- Missing: `idx_tournament_registrations_tournament (tournament_id)`
- Missing: `idx_tournament_registrations_user (user_id)`
- Missing: `idx_tournament_registrations_status (status)`
- Missing: `idx_tournament_registrations_idempotency (idempotency_key)`

---

## 7. Type Mismatches & Data Encoding

1. **Date/Time as Strings**:
   - `tournament_days."date"` stored as `VARCHAR(30)` (e.g. `'2026-10-22'`).
   - `tournament_rounds."time"` stored as `VARCHAR(10)` (e.g. `'14:30'`).
   - *Impact*: Sorting and date interval math require string parsing and `EXTRACT` conversions rather than native PostgreSQL indexable timestamp comparisons.
2. **Monetary Amounts**:
   - `payment_submissions.amount` was `INTEGER` (in paise) then altered to `NUMERIC(10, 2)`.
   - `tournaments.entry_fee_amount` is `INTEGER` (in Rupees).
   - `tournaments.entry` is `VARCHAR(100)` (e.g. `'₹50'`).
   - `payment_verifications.amount` is `NUMERIC(10, 2)`.
   - *Impact*: Cross-table joins and calculations require regex stripping and explicit `CAST` statements.
3. **Primary Key Typings**:
   - Active database uses prefixed `VARCHAR(50)` strings (e.g., `'TOUR-...'`, `'REG-...'`, `'USR-...'`).
   - Legacy `schema.sql` uses `UUID DEFAULT gen_random_uuid()`.
   - Any script trying to run `schema.sql` fails against the live codebase.
