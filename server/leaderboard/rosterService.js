// server/leaderboard/rosterService.js
/**
 * Authoritative roster service (Design Principles P1 & P3).
 *
 * P1: One canonical team identifier: tournament_teams.id.
 * P3: One roster source: tournament_match_assignments (team to match) is authoritative.
 * District roster = union of the teams assigned to the matches of that district in that round.
 * Match roster = teams assigned to that match, in a stable slot order.
 * Every consumer calls getMatchRoster(matchId) and getDistrictRoster(roundId, districtId).
 */

/**
 * Builds the canonical team map and metadata lookup for a tournament.
 * Maps any known identifier (canonical tournament_teams.id, registration_id, legacy hash)
 * to canonical tournament_teams.id.
 *
 * @param {object} clientOrPool
 * @param {string} tournamentId
 * @returns {Promise<{
 *   canonicalMap: Map<string, string>,
 *   teamsById: Map<string, object>
 * }>}
 */
export async function loadCanonicalTeamDirectory(clientOrPool, tournamentId) {
  if (!clientOrPool || !tournamentId) {
    return { canonicalMap: new Map(), teamsById: new Map() };
  }

  const query = `
    SELECT
      tt.id AS team_id,
      tt.tournament_id,
      tt.team_name,
      tt.status AS team_status,
      tt.registration_id,
      tt.leader_user_id,
      COALESCE(tr.captain, u.display_name, u.name, 'Captain') AS captain_name,
      tr.status AS registration_status,
      tr.group_id AS registration_group_id,
      tr.group_name AS registration_group_name,
      tr.slot_number AS registration_slot_number
    FROM tournament_teams tt
    LEFT JOIN tournament_registrations tr
      ON tr.id = tt.registration_id
    LEFT JOIN users u
      ON u.id = tt.leader_user_id
    WHERE tt.tournament_id = $1::varchar
  `;

  const res = await clientOrPool.query(query, [tournamentId]);

  const canonicalMap = new Map();
  const teamsById = new Map();

  for (const row of res.rows) {
    const canonicalId = row.team_id;
    const teamRecord = {
      id: canonicalId,
      team_id: canonicalId,
      team_name: row.team_name,
      captain_name: row.captain_name || 'Captain',
      status: row.team_status,
      is_disqualified: row.team_status === 'disqualified',
      registration_id: row.registration_id,
      registration_status: row.registration_status,
      registration_group_id: row.registration_group_id,
      registration_group_name: row.registration_group_name,
      registration_slot_number: row.registration_slot_number,
    };

    teamsById.set(canonicalId, teamRecord);
    canonicalMap.set(canonicalId, canonicalId);

    if (row.registration_id) {
      canonicalMap.set(row.registration_id, canonicalId);
    }
  }

  // Also include any registrations not yet in tournament_teams (mapping layer for historical/orphan data)
  const regQuery = `
    SELECT
      tr.id AS registration_id,
      tr.team_name,
      tr.captain,
      tr.status,
      tr.group_id,
      tr.group_name,
      tr.slot_number
    FROM tournament_registrations tr
    WHERE tr.tournament_id = $1::varchar
  `;
  const regRes = await clientOrPool.query(regQuery, [tournamentId]);
  for (const r of regRes.rows) {
    if (!canonicalMap.has(r.registration_id)) {
      // Find matching tournament_teams by exact team_name (case-insensitive)
      let foundCanonical = null;
      for (const t of teamsById.values()) {
        if (t.team_name && t.team_name.toLowerCase().trim() === (r.team_name || '').toLowerCase().trim()) {
          foundCanonical = t.id;
          break;
        }
      }
      if (foundCanonical) {
        canonicalMap.set(r.registration_id, foundCanonical);
      }
    }
  }

  return { canonicalMap, teamsById };
}

/**
 * Authoritative Match Roster (P3).
 * Returns teams assigned to that match, in a stable slot order.
 * Discrepancies with registration or team status are reported explicitly.
 *
 * @param {object} clientOrPool
 * @param {string} matchId
 * @returns {Promise<{
 *   match: object,
 *   roster: Array<object>,
 *   discrepancies: Array<object>
 * }>}
 */
export async function getMatchRoster(clientOrPool, matchId) {
  if (!clientOrPool || !matchId) {
    throw new Error('Valid database client and matchId are required.');
  }

  // Fetch match details
  const matchRes = await clientOrPool.query(
    `SELECT m.id, m.tournament_id, m.round_id, m.group_id, m.district_id,
            m.match_number, m.room_id,
            COALESCE(r.capacity, rg.capacity, 16) AS capacity
     FROM tournament_matches m
     LEFT JOIN tournament_rooms r ON r.id = m.room_id
     LEFT JOIN tournament_registration_groups rg ON rg.id = COALESCE(m.group_id, m.district_id)
     WHERE m.id = $1::varchar
     LIMIT 1`,
    [matchId]
  );

  if (matchRes.rows.length === 0) {
    throw new Error(`Match not found: ${matchId}`);
  }

  const match = matchRes.rows[0];
  const tournamentId = match.tournament_id;
  const effectiveDistrictId = match.district_id || match.group_id;

  const { canonicalMap, teamsById } = await loadCanonicalTeamDirectory(clientOrPool, tournamentId);

  // Authoritative match assignments query
  const assignRes = await clientOrPool.query(
    `SELECT a.id AS assignment_id, a.tournament_team_id, a.match_id, a.room_id,
            a.group_id, a.day_id, a.slot_number, a.status AS assignment_status,
            a.source, a.assigned_at
     FROM tournament_match_assignments a
     WHERE a.match_id = $1::varchar AND a.status = 'allocated'
     ORDER BY a.slot_number ASC NULLS LAST, a.assigned_at ASC, a.id ASC`,
    [matchId]
  );

  const roster = [];
  const discrepancies = [];
  const seenTeamIds = new Set();

  for (let idx = 0; idx < assignRes.rows.length; idx++) {
    const row = assignRes.rows[idx];
    const rawId = row.tournament_team_id;
    const canonicalId = canonicalMap.get(rawId) || rawId;
    const teamMeta = teamsById.get(canonicalId) || null;

    if (seenTeamIds.has(canonicalId)) {
      discrepancies.push({
        team_id: canonicalId,
        team_name: teamMeta?.team_name || `Team ${canonicalId}`,
        type: 'duplicate_slot_assignment',
        details: `Team is assigned to match ${match.match_number} more than once.`,
        assignment_id: row.assignment_id,
      });
      continue;
    }
    seenTeamIds.add(canonicalId);

    // Stable slot number: use assignment slot_number or sequential index 1-based
    const slotNumber = Number.isInteger(row.slot_number) && row.slot_number > 0
      ? row.slot_number
      : (idx + 1);

    const teamName = teamMeta?.team_name || `Team ${canonicalId}`;
    const captainName = teamMeta?.captain_name || 'Captain';
    const isDisqualified = teamMeta?.is_disqualified || teamMeta?.status === 'disqualified';

    // Discrepancy checks (P3: report explicitly, never guess)
    if (teamMeta?.registration_group_id && effectiveDistrictId && teamMeta.registration_group_id !== effectiveDistrictId) {
      discrepancies.push({
        team_id: canonicalId,
        team_name: teamName,
        type: 'registration_group_mismatch',
        details: `Team registered in group ${teamMeta.registration_group_name || teamMeta.registration_group_id} but assigned to district ${effectiveDistrictId}.`,
        canRepair: true,
      });
    }

    if (teamMeta?.registration_status && !['approved', 'confirmed', 'verified_by_host', 'verified'].includes(teamMeta.registration_status.toLowerCase())) {
      discrepancies.push({
        team_id: canonicalId,
        team_name: teamName,
        type: 'registration_status_not_approved',
        details: `Team registration status is "${teamMeta.registration_status}" while assigned to match.`,
        canRepair: true,
      });
    }

    roster.push({
      assignment_id: row.assignment_id,
      team_id: canonicalId,
      team_name: teamName,
      captain_name: captainName,
      slot_number: slotNumber,
      status: teamMeta?.status || 'verified',
      is_disqualified: Boolean(isDisqualified),
      assigned_at: row.assigned_at,
    });
  }

  // Sort strictly by slot_number ASC, then assignment_id
  roster.sort((a, b) => {
    if (a.slot_number !== b.slot_number) return a.slot_number - b.slot_number;
    return String(a.assignment_id || '').localeCompare(String(b.assignment_id || ''));
  });

  return {
    match: {
      id: match.id,
      tournament_id: match.tournament_id,
      round_id: match.round_id,
      district_id: effectiveDistrictId,
      group_id: match.group_id,
      match_number: match.match_number,
      capacity: Number(match.capacity) || 16,
    },
    roster,
    discrepancies,
  };
}

/**
 * Authoritative District Roster (P3).
 * District roster = union of the teams assigned to the matches of that district in that round.
 *
 * @param {object} clientOrPool
 * @param {string} roundId
 * @param {string} districtId
 * @returns {Promise<{
 *   round_id: string,
 *   district_id: string,
 *   matches: Array<object>,
 *   roster: Array<object>,
 *   discrepancies: Array<object>
 * }>}
 */
export async function getDistrictRoster(clientOrPool, roundId, districtId) {
  if (!clientOrPool || !roundId || !districtId) {
    throw new Error('Valid database client, roundId, and districtId are required.');
  }

  // Find matches belonging to this district in this round
  const matchesRes = await clientOrPool.query(
    `SELECT m.id, m.tournament_id, m.round_id, m.group_id, m.district_id,
            m.match_number, m.room_id,
            COALESCE(r.capacity, rg.capacity, 16) AS capacity
     FROM tournament_matches m
     LEFT JOIN tournament_rooms r ON r.id = m.room_id
     LEFT JOIN tournament_registration_groups rg ON rg.id = COALESCE(m.group_id, m.district_id)
     WHERE m.round_id = $1::varchar
       AND (m.group_id = $2::varchar OR m.district_id = $2::varchar)
     ORDER BY m.match_number ASC, m.id ASC`,
    [roundId, districtId]
  );

  const matches = matchesRes.rows;
  if (matches.length === 0) {
    return {
      round_id: roundId,
      district_id: districtId,
      matches: [],
      roster: [],
      discrepancies: [{
        type: 'no_matches_in_district',
        details: `No roadmap matches found for district ${districtId} in round ${roundId}.`,
      }],
    };
  }

  const teamRosterMap = new Map();
  const allDiscrepancies = [];

  for (const m of matches) {
    const matchData = await getMatchRoster(clientOrPool, m.id);
    if (Array.isArray(matchData.discrepancies)) {
      allDiscrepancies.push(...matchData.discrepancies);
    }

    for (const team of matchData.roster) {
      if (!teamRosterMap.has(team.team_id)) {
        teamRosterMap.set(team.team_id, {
          team_id: team.team_id,
          team_name: team.team_name,
          captain_name: team.captain_name,
          slot_number: team.slot_number,
          status: team.status,
          is_disqualified: team.is_disqualified,
          matches_assigned: [m.match_number],
        });
      } else {
        const existing = teamRosterMap.get(team.team_id);
        existing.matches_assigned.push(m.match_number);
        // Retain lowest slot number if inconsistent
        if (team.slot_number < existing.slot_number) {
          existing.slot_number = team.slot_number;
        }
      }
    }
  }

  // Stable slot order
  const roster = Array.from(teamRosterMap.values()).sort((a, b) => {
    if (a.slot_number !== b.slot_number) return a.slot_number - b.slot_number;
    return a.team_name.localeCompare(b.team_name);
  });

  return {
    round_id: roundId,
    district_id: districtId,
    matches: matches.map((m) => ({
      id: m.id,
      match_number: m.match_number,
      capacity: Number(m.capacity) || 16,
    })),
    roster,
    discrepancies: allDiscrepancies,
  };
}
