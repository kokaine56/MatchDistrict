// Participant-specific roadmap virtualization.
//
// The organizer-facing GET /roadmap returns the complete approved roadmap
// (every day → group → room → match, including room credentials). Visitors who
// are NOT the organizer must instead receive ONLY their own allocated team's
// schedule, with explicit columns and NO credential fields ever.
//
// This module is pure: it takes the full roadmap rows the server already loaded
// plus the authenticated user's team context and returns the participant view.
// Keeping it pure makes the visibility contract unit-testable without a DB.
import { isMatchReleased, normalizeReleaseMinutes } from './matchRelease.js';

/** Team statuses that grant participant roadmap placement visibility. */
export const PARTICIPANT_VISIBLE_TEAM_STATUSES = Object.freeze(['allocated']);

/**
 * Decide which roadmap slice a non-organizer may see.
 * @param {object} ctx
 * @param {object|null} ctx.team     the caller's tournament_teams row
 * @param {number} ctx.releaseMinutes
 * @param {number} ctx.nowMs
 * @returns {{ mode: 'participant'|'no-team'|'unallocated' }}
 */
export function participantAccessMode(ctx) {
  if (!ctx || !ctx.team) return { mode: 'no-team' };
  if (!PARTICIPANT_VISIBLE_TEAM_STATUSES.includes(ctx.team.status)) {
    return { mode: 'unallocated' };
  }
  return { mode: 'participant' };
}

/**
 * Build the participant roadmap object.
 *
 * Only rows on the caller's own allocation chain are included (their days,
 * groups, rooms, matches and assignment rows). Matches are surfaced with
 * explicit safe columns and a server-computed `credentials_available` flag —
 * room_identifier / room_password / credential_status NEVER leave this
 * function for a non-organizer.
 *
 * @param {object} full        full roadmap rows from the DB:
 *   { rounds: object[], days: object[], groups: object[],
 *     rooms: object[], matches: object[], assignments: object[] }
 * @param {string} teamId      the caller's team id (their own allocations)
 * @param {object} opts
 * @param {number} opts.releaseMinutes
 * @param {number} opts.nowMs
 * @returns {object} participant roadmap shape
 */
export function buildParticipantRoadmap(full, teamId, opts = {}) {
  const releaseMinutes = normalizeReleaseMinutes(opts.releaseMinutes);
  const nowMs = typeof opts.nowMs === 'number' && Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const data = full && typeof full === 'object' ? full : {};

  const ownAssignments = (data.assignments || []).filter((a) => a.tournament_team_id === teamId);

  // The end time is embedded on the match rows already, so matches carrying one
  // of these fields would leak credentials. Keep them off.
  const matchSafeColumns = (m) => ({
    id: m.id,
    room_id: m.room_id,
    group_id: m.group_id,
    day_id: m.day_id,
    tournament_id: m.tournament_id,
    match_number: m.match_number,
    start_time: m.start_time,
    end_time: m.end_time,
    status: m.status,
    round_id: m.round_id,
  });

  // Canonical round ordering — the SAME rule the organizer branch uses (round
  // array order, `roundOrder.get(id) ?? -1`): participant days/groups/rooms/
  // matches are always presented round-major, then day_number, group sequence,
  // room number, match number. match_number resets each round, so matching by
  // match_number alone was ambiguous once a team held Round 1 + Round 2 rows.
  const roundOrder = new Map((data.rounds || []).map((r, i) => [r.id, i]));
  const roundNumberById = new Map((data.rounds || []).map((r) => [r.id, r.round_number ?? null]));
  const roundIndexOf = (id) => (id != null ? roundOrder.get(id) ?? -1 : -1);

  const matchIds = new Set(ownAssignments.map((a) => a.match_id));
  const roomIds = new Set(ownAssignments.map((a) => a.room_id));
  const dayIds = new Set(ownAssignments.map((a) => a.day_id));
  const groupIds = new Set(ownAssignments.map((a) => a.group_id));

  const daysById = new Map((data.days || []).map((d) => [d.id, d]));

  // Days carry authoritative round context (round_id + round_number) and are
  // ordered round-major → day_number so multi-round chains read in order.
  const days = (data.days || [])
    .filter((d) => dayIds.has(d.id))
    .map((d) => ({ ...d, round_number: roundNumberById.get(d.round_id) ?? null }))
    .sort((a, b) => roundIndexOf(a.round_id) - roundIndexOf(b.round_id) || a.day_number - b.day_number);

  const dayOrder = new Map(days.map((d, i) => [d.id, i]));

  const groups = (data.groups || [])
    .filter((g) => groupIds.has(g.id))
    .sort((a, b) =>
      roundIndexOf(a.round_id) - roundIndexOf(b.round_id) ||
      (dayOrder.get(a.day_id) ?? 0) - (dayOrder.get(b.day_id) ?? 0) ||
      a.sequence - b.sequence
    );

  const groupOrder = new Map(groups.map((g, i) => [g.id, i]));

  const rooms = (data.rooms || [])
    .filter((r) => roomIds.has(r.id))
    .sort((a, b) =>
      roundIndexOf(a.round_id) - roundIndexOf(b.round_id) ||
      (dayOrder.get(a.day_id) ?? 0) - (dayOrder.get(b.day_id) ?? 0) ||
      (groupOrder.get(a.group_id) ?? 0) - (groupOrder.get(b.group_id) ?? 0) ||
      a.room_number - b.room_number
    );

  const roomOrder = new Map(rooms.map((r, i) => [r.id, i]));

  const matches = (data.matches || [])
    .filter((m) => matchIds.has(m.id))
    .map((m) => {
      const day = daysById.get(m.day_id) || {};
      return {
        ...matchSafeColumns(m),
        round_number: roundNumberById.get(m.round_id) ?? null,
        credentials_available: isMatchReleased(day.date, m.start_time, releaseMinutes, nowMs),
        release_minutes: releaseMinutes,
      };
    })
    .sort((a, b) =>
      roundIndexOf(a.round_id) - roundIndexOf(b.round_id) ||
      (dayOrder.get(a.day_id) ?? 0) - (dayOrder.get(b.day_id) ?? 0) ||
      (groupOrder.get(a.group_id) ?? 0) - (groupOrder.get(b.group_id) ?? 0) ||
      (roomOrder.get(a.room_id) ?? 0) - (roomOrder.get(b.room_id) ?? 0) ||
      a.match_number - b.match_number
    );

  // Assignments follow their match's canonical order so the response reads in
  // round order too.
  const matchOrder = new Map(matches.map((m, i) => [m.id, i]));
  const assignments = ownAssignments
    .slice()
    .sort((a, b) => (matchOrder.get(a.match_id) ?? 0) - (matchOrder.get(b.match_id) ?? 0) || String(a.id).localeCompare(String(b.id)));

  // Keep only public progression information needed to explain the next round.
  // Planning internals and private credential data remain excluded.
  const roundSafeColumns = (r) => ({
    id: r.id,
    tournament_id: r.tournament_id,
    round_number: r.round_number,
    name: r.name,
    status: r.status,
    teams_advancing: r.teams_advancing ?? null,
    date: r.date,
    time: r.time,
    map: r.map,
  });
  const roundIds = new Set(days.map((d) => d.round_id).filter(Boolean));
  const rounds = (data.rounds || [])
    .filter((r) => roundIds.has(r.id))
    .map(roundSafeColumns);

  return {
    rounds,
    days,
    groups,
    rooms,
    matches,
    assignments,
  };
}

/**
 * Empty participant roadmap — used for anonymous visitors, users with no team,
 * or teams that are not yet allocated. Keeps the same shape so the client
 * renderer never has to branch on missing keys.
 * @returns {object}
 */
export function emptyParticipantRoadmap() {
  return { rounds: [], days: [], groups: [], rooms: [], matches: [], assignments: [] };
}
