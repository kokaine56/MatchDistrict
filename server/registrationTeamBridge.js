// --- REGISTRATION → TOURNAMENT TEAM BRIDGE ---
//
// Additive, server-authoritative bridge between the legacy registration system
// (tournament_registrations: a user registers a TEAM SLOT with an optional
// roster snapshot) and the tournament-team flow (tournament_teams /
// tournament_team_members → members_complete → verified → allocated).
//
// Semantics (single source of truth):
//   - A registration answers "slot purchased / entered?"; a team answers
//     "which tournament-specific team?" They stay logically separate.
//   - The registered user (leader) may CREATE a team only when the registration
//     the registration system considers valid / slot-confirming.
//   - Invited members join the team to fill roster slots; they do NOT need
//     their own registration (leader-registers-slot product model), but a user
//     EXPLICITLY excluded by the registration system (rejected / cancelled /
//     expired / PAYMENT_REJECTED) cannot bypass that exclusion via an invite.
//   - Verification of a linked team requires its registration to still be
//     eligible. Legacy teams (no registration_id) keep the prior behavior.
//
// Every rule here is additive and idempotent: nothing is ever dropped,
// recreated, or guessed. Ambiguous legacy data is logged, never "fixed".

// Authoritative "valid / slot-confirming" registration statuses. This EXACT
// set mirrors the slot-holder set used by workers/slotManagerWorker.js and the
// /slots endpoint (VERIFIED_REG_STATUSES), so eligibility here == the
// registration system's own definition of a confirmed slot.
export const REG_BRIDGE_ELIGIBLE_STATUSES = Object.freeze([
  'approved',
  'confirmed',
  'VERIFIED_BY_HOST',
  'verified_by_host',
]);

// Users holding a registration in one of these statuses are explicitly denied
// participation in the tournament (the register endpoint allows re-registration
// only after these) — they must not be able to bypass that via a team invite.
export const REG_BRIDGE_EXCLUDED_STATUSES = Object.freeze([
  'rejected',
  'cancelled',
  'expired',
  'PAYMENT_REJECTED',
]);

// Team size derives from the tournament match_type, exactly like the existing
// team join/verify logic (solo=1, duo=2, else 4 = squad). Unknown or empty
// match types default to 4 (squad).
export function maxMembersForMatchType(matchType) {
  const type = String(matchType || '').trim().toLowerCase();
  if (type === 'solo') return 1;
  if (type === 'duo') return 2;
  return 4;
}

export function isEligibleRegistrationStatus(status) {
  return REG_BRIDGE_ELIGIBLE_STATUSES.includes(status);
}

export function isExcludedRegistrationStatus(status) {
  return REG_BRIDGE_EXCLUDED_STATUSES.includes(status);
}

// Pick the registration that grants the team slot for creation/backfill.
// Returns exactly one only when there is a SINGLE eligible registration (no
// guessing). Multiple eligible rows => ambiguous (should not happen; the
// register endpoint blocks duplicate active registrations, but legacy data may
// contain drift). Zero eligible rows => not eligible.
export function pickEligibleRegistration(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const eligible = list.filter((r) => r && isEligibleRegistrationStatus(r.status));
  if (eligible.length === 1) return { ok: true, registration: eligible[0] };
  if (eligible.length > 1) {
    return { ok: false, reason: 'ambiguous', count: eligible.length };
  }
  return { ok: false, reason: 'none', count: 0 };
}

// Pure mapping used by the idempotent legacy backfill AND by tests. Given a
// tournament's teams (with or without registration_id) and its registrations,
// compute which NEW links are unambiguous (leader has exactly one eligible
// registration) and which teams must be skipped. NEVER creates teams and NEVER
// overwrites an existing link, so it is safe to run repeatedly.
export function resolveBridgeBackfill({ teams, registrations }) {
  const regs = Array.isArray(registrations) ? registrations : [];
  const links = [];
  const skipped = [];
  let alreadyLinked = 0;

  for (const team of Array.isArray(teams) ? teams : []) {
    if (!team || !team.id || !team.leader_user_id || !team.tournament_id) continue;
    if (team.registration_id) {
      alreadyLinked++;
      continue;
    }
    const candidateRegs = regs.filter(
      (r) =>
        r &&
        r.tournament_id === team.tournament_id &&
        r.user_id === team.leader_user_id
    );
    const pick = pickEligibleRegistration(candidateRegs);
    if (pick.ok) {
      links.push({
        team_id: team.id,
        tournament_id: team.tournament_id,
        leader_user_id: team.leader_user_id,
        registration_id: pick.registration.id,
      });
    } else if (pick.reason === 'ambiguous') {
      skipped.push({
        team_id: team.id,
        tournament_id: team.tournament_id,
        leader_user_id: team.leader_user_id,
        reason: 'ambiguous',
        eligible_count: pick.count,
      });
    } else {
      skipped.push({
        team_id: team.id,
        tournament_id: team.tournament_id,
        leader_user_id: team.leader_user_id,
        reason: 'none',
        eligible_count: 0,
      });
    }
  }

  return { links, skipped, alreadyLinked };
}

// Idempotent legacy backfill executed at boot (and safe to re-run). Links a
// team to its leader's UNIQUE eligible registration only when unambiguous;
// ambiguous / unlinkable teams are counted and reported, never guessed.
// Accepts a pool OR a transaction client.
export async function backfillRegistrationLinks(poolOrClient) {
  const teamsRes = await poolOrClient.query(
    'SELECT id, tournament_id, leader_user_id, registration_id FROM tournament_teams WHERE registration_id IS NULL ORDER BY created_at ASC'
  );
  const teams = teamsRes.rows;
  const registrations = [];
  // Fetch registrations grouped so the pure mapper sees ALL rows for the
  // tournament (legacy data may contain multiple rows per user).
  const tournaments = [...new Set(teams.map((t) => t.tournament_id))];
  for (const tournamentId of tournaments) {
    const regsRes = await poolOrClient.query(
      'SELECT id, tournament_id, user_id, status FROM tournament_registrations WHERE tournament_id = $1',
      [tournamentId]
    );
    registrations.push(...regsRes.rows);
  }

  const plan = resolveBridgeBackfill({ teams: teams, registrations });

  for (const link of plan.links) {
    await poolOrClient.query(
      'UPDATE tournament_teams SET registration_id = $1 WHERE id = $2 AND registration_id IS NULL',
      [link.registration_id, link.team_id]
    );
  }

  return {
    total: teams.length,
    linked: plan.links.length,
    alreadyLinked: plan.alreadyLinked,
    skippedNone: plan.skipped.filter((s) => s.reason === 'none').length,
    skippedAmbiguous: plan.skipped.filter((s) => s.reason === 'ambiguous').length,
    skipped: plan.skipped,
  };
}