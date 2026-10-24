# District ID production migration

District IDs are permanent public identifiers. `users.id` remains the canonical relational primary key; no foreign keys or provider mappings are rewritten.

## Rollout

1. Take and verify a PostgreSQL backup or point-in-time recovery checkpoint. Review the current user count and confirm staging has passed the migration and signup checks.
2. Deploy the application release. Startup adds the nullable `users.district_id` field and runs an idempotent transactional backfill. It assigns IDs to accounts without a valid unique value, preserves existing valid unique values, records any repaired value in `district_id_migration_audit`, and creates the unique index and format check. Startup deliberately leaves the column nullable during a rolling deploy so old instances can finish draining.
3. After all old application instances have drained, run `npm run migrate:district-ids` with the production `DATABASE_URL`. It reruns verification/backfill and then applies `NOT NULL`.
4. Confirm the command reports `invalid=0` and `duplicates=0`, then verify the deployed service health endpoint and a test account’s profile display/copy behavior.

The migration uses a transaction, a PostgreSQL advisory lock, and a write-blocking table lock while it scans and updates users. Schedule the backfill in a low-traffic window. If a value is duplicated, the account with the lexicographically first `users.id` retains it; other rows receive a new ID. Invalid and missing values are also replaced. Every changed value is recorded in `district_id_migration_audit`, which contains only internal user IDs, prior/assigned District IDs, and a reason code; it does not record email or provider credentials.

## Rollback

If the new application release must be rolled back before the final `NOT NULL` step, keep the new column, unique index, check constraint, and assigned District IDs in place; the prior release can ignore the nullable column. After `NOT NULL` is applied, an older release that omits `district_id` cannot safely create accounts. Roll back only to a compatibility release that still generates District IDs, or first relax `NOT NULL` in a reviewed rollback migration. Do not drop the column or reuse assigned IDs. If a migration fails, its transaction rolls back; inspect the error and audit state before retrying. Restore from backup only for a separately approved recovery event.

## Verification queries

Run these read-only checks after migration:

```sql
SELECT COUNT(*) AS accounts,
       COUNT(district_id) AS assigned,
       COUNT(DISTINCT district_id) AS unique_ids,
       COUNT(*) FILTER (WHERE district_id !~ '^[1-9][0-9]{7}$') AS invalid
FROM users;

SELECT district_id, COUNT(*)
FROM users
GROUP BY district_id
HAVING COUNT(*) > 1;
```
