/**
 * Copies profiles for legacy users that do not already have a matching profile.
 * Existing profiles are never overwritten. Email conflicts owned by another
 * profile are skipped so account identities are not merged during startup.
 */
export async function syncMissingProfiles(client) {
  try {
    const result = await client.query(`
      WITH candidates AS MATERIALIZED (
        SELECT uid, name, email, "gamerTag", role, roles, tier, avatar, banner, phone, status,
               "riotId", "bgmiId", "steamId", "discordTag", "socialLinks", "orgName", "orgMotto", "orgHandle", "orgImage", "orgBio"
        FROM users
        WHERE uid IS NOT NULL AND uid NOT LIKE 'ADM-%'
      ),
      email_conflicts AS (
        SELECT candidates.uid
        FROM candidates
        JOIN profiles existing ON existing.email = candidates.email AND existing.id <> candidates.uid
        UNION
        SELECT candidate.uid
        FROM candidates candidate
        JOIN (
          SELECT email FROM candidates GROUP BY email HAVING COUNT(*) > 1
        ) duplicate_source_emails ON duplicate_source_emails.email = candidate.email
      ),
      inserted AS (
        INSERT INTO profiles (id, uid, name, email, "gamerTag", role, roles, tier, avatar, banner, phone, status,
                              "riotId", "bgmiId", "steamId", "discordTag", "socialLinks", "orgName", "orgMotto", "orgHandle", "orgImage", "orgBio")
        SELECT candidates.uid, candidates.uid, candidates.name, candidates.email, candidates."gamerTag",
               candidates.role, candidates.roles, candidates.tier, candidates.avatar, candidates.banner, candidates.phone,
               candidates.status, candidates."riotId", candidates."bgmiId", candidates."steamId", candidates."discordTag",
               candidates."socialLinks", candidates."orgName", candidates."orgMotto", candidates."orgHandle", candidates."orgImage", candidates."orgBio"
        FROM candidates
        WHERE NOT EXISTS (SELECT 1 FROM email_conflicts WHERE email_conflicts.uid = candidates.uid)
          AND NOT EXISTS (
            SELECT 1 FROM profiles existing
            WHERE existing.id = candidates.uid OR existing.email = candidates.email
          )
        ON CONFLICT DO NOTHING
        RETURNING 1
      )
      SELECT
        (SELECT COUNT(*)::int FROM email_conflicts) AS email_conflicts_skipped,
        (SELECT COUNT(*)::int FROM inserted) AS profiles_inserted
    `);

    const { email_conflicts_skipped: conflicts = 0, profiles_inserted: inserted = 0 } = result.rows[0] || {};
    if (conflicts > 0) {
      console.warn(`[STARTUP] Profile sync skipped ${conflicts} user record(s) because the email is already assigned to a different profile ID. Existing accounts were left unchanged.`);
    }
    console.log(`[STARTUP] Profile sync complete: ${inserted} inserted, ${conflicts} email conflict(s) skipped.`);
    return { inserted, conflicts };
  } catch (error) {
    const code = error?.code || 'UNKNOWN';
    const constraint = error?.constraint ? `, constraint: ${error.constraint}` : '';
    console.error(`[STARTUP] Profile sync operation=insert_missing_profiles failed [code: ${code}${constraint}].`);
    throw error;
  }
}
