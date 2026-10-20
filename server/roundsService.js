import crypto from 'crypto';

// server/roundsService.js
// Structural Round/Stage foundation for the Phase 3 roadmap.
// The Round/Stage entity sits between a Tournament and its Days:
//   Tournament -> Round/Stage -> Day -> Group -> Room -> Match.
//
// Round definitions are authored in the Step 6 wizard (tournaments.timeline JSON)
// and this module materialises them once into tournament_rounds via an idempotent
// one-way sync. tournament_rounds is a derived snapshot, never a second authoring
// source of truth. Race/scheduling decisions (full day->round assignment, real
// group topologies, advancement allocation) remain future planning-engine work;
// today the day->round mapping uses documented, deterministic transitional rules.

export function generateRoundId() {
  return 'RND-' + crypto.randomBytes(8).toString('hex');
}

export function normalizeRoundNumber(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function toTeamsAdvancing(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function defaultRound() {
  return {
    round_number: 1,
    name: 'Round 1',
    date: null,
    time: null,
    map: null,
    teams_advancing: null
  };
}

// Extract raw round rows from tournaments.timeline (string JSON, array, or
// { rounds: [...] } / legacy { roadmap: [...] } shapes).
export function extractTimelineRoundRows(tournament) {
  let timeline = tournament && tournament.timeline;
  if (timeline == null) return [];
  if (typeof timeline === 'string') {
    if (!timeline.trim()) return [];
    try {
      timeline = JSON.parse(timeline);
    } catch {
      return [];
    }
  }
  let rows = [];
  if (Array.isArray(timeline)) rows = timeline;
  else if (Array.isArray(timeline && timeline.rounds)) rows = timeline.rounds;
  else if (Array.isArray(timeline && timeline.roadmap)) rows = timeline.roadmap;
  return rows.filter((r) => r && typeof r === 'object');
}

// Normalize timeline round rows into tournament_rounds descriptors. Array order
// is authoritative; round_number defaults to the 1-based position. Duplicate
// round numbers are collapsed (first occurrence wins) so the UNIQUE
// (tournament_id, round_number) constraint can never be violated.
export function parseTimelineRounds(tournament) {
  const rows = extractTimelineRoundRows(tournament);
  const seen = new Set();
  const rounds = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const roundNumber = normalizeRoundNumber(
      row.round_number != null ? row.round_number : row.roundNo != null ? row.roundNo : i + 1
    );
    if (seen.has(roundNumber)) continue;
    seen.add(roundNumber);
    rounds.push({
      round_number: roundNumber,
      name:
        (typeof row.name === 'string' && row.name.trim()) ||
        (typeof row.roundName === 'string' && row.roundName.trim()) ||
        `Round ${roundNumber}`,
      date: row.date ? String(row.date).trim() : null,
      time: row.time ? String(row.time).trim() : null,
      map: row.map ? String(row.map).trim() : null,
      teams_advancing: toTeamsAdvancing(row.qualified)
    });
  }
  return rounds.length > 0 ? rounds : [defaultRound()];
}

// Pure day->round mapping used by BOTH the generator and the legacy backfill so
// the rule lives in exactly one place. Transitional rules, in priority order:
//   1. exact date match against a round's configured date;
//   2. the latest configured round that has already started on/before the day;
//   3. the first round (lowest round_number) otherwise.
// A single configured round therefore correctly spans multiple consecutive days
// (a multi-day round), and "Day N" never implies "Round N".
export function assignDaysToRounds(days, rounds) {
  if (!Array.isArray(days)) return [];
  const ordered = (Array.isArray(rounds) ? rounds : [])
    .slice()
    .sort((a, b) => (a.round_number || 0) - (b.round_number || 0) || String(a.id || '').localeCompare(String(b.id || '')));
  if (ordered.length === 0) return days.map((day) => ({ day, round: null }));

  const dated = ordered
    .filter((r) => r.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.round_number || 0) - (b.round_number || 0));
  const first = ordered[0];

  return days.map((day) => {
    if (dated.length === 0) return { day, round: first };

    const dayDate = day.date ? String(day.date) : '';
    const exact = ordered.find((r) => r.date && String(r.date) === dayDate);
    if (exact) return { day, round: exact };

    let chosen = null;
    for (const r of dated) {
      if (String(r.date).localeCompare(dayDate) <= 0) chosen = r;
    }
    return { day, round: chosen || first };
  });
}

// Idempotent one-way sync of round definitions into tournament_rounds. Re-running
// is safe: upsert keyed by (tournament_id, round_number) updates display fields
// and never creates duplicate rounds. Returns rows ordered by round_number.
export async function syncTournamentRounds(pool, tournament) {
  const descriptors = parseTimelineRounds(tournament);
  const rows = [];
  for (const r of descriptors) {
    const res = await pool.query(
      `
      INSERT INTO tournament_rounds
        (id, tournament_id, round_number, name, teams_advancing, "date", "time", map, status, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'configured', NOW())
      ON CONFLICT (tournament_id, round_number) DO UPDATE SET
        name = EXCLUDED.name,
        teams_advancing = EXCLUDED.teams_advancing,
        "date" = EXCLUDED."date",
        "time" = EXCLUDED."time",
        map = EXCLUDED.map,
        status = 'configured',
        updated_at = NOW()
      RETURNING id, round_number, name, teams_advancing, "date", "time", map, status
      `,
      [generateRoundId(), tournament.id, r.round_number, r.name, r.teams_advancing, r.date, r.time, r.map]
    );
    rows.push(res.rows[0]);
  }
  return rows.sort((a, b) => a.round_number - b.round_number);
}

// Idempotent init-time backfill for tournaments generated before the Round/Stage
// entity existed. For every tournament that has structural roadmap rows but no
// round rows: materialize rounds (timeline-derived, or default "Round 1") and
// stamp round_id onto its existing days/groups/rooms/matches using the same
// day->round rule as fresh generation. Existing data is never recreated or
// deleted — only association columns are written. Safe to run repeatedly.
export async function legacyRoundBackfill(pool) {
  const missing = await pool.query(`
    SELECT DISTINCT d.tournament_id
    FROM tournament_days d
    WHERE NOT EXISTS (SELECT 1 FROM tournament_rounds r WHERE r.tournament_id = d.tournament_id)
  `);
  for (const m of missing.rows) {
    try {
      const tRes = await pool.query('SELECT id, timeline, roadmap_status FROM tournaments WHERE id = $1', [m.tournament_id]);
      if (tRes.rows.length === 0) continue;
      const tournament = tRes.rows[0];

      // Never backfill or resurrect a deliberately reset or unpublished draft roadmap
      if (!tournament.timeline && (tournament.roadmap_status === 'draft' || tournament.roadmap_status === 'pending')) {
        continue;
      }

      const rounds = await syncTournamentRounds(pool, tournament);
      const dayRes = await pool.query(
        'SELECT id, day_number, date FROM tournament_days WHERE tournament_id = $1 ORDER BY day_number ASC',
        [tournament.id]
      );
      if (dayRes.rows.length === 0) continue;

      const mapping = assignDaysToRounds(dayRes.rows, rounds);
      for (const { day, round } of mapping) {
        if (!round) continue;
        await pool.query('UPDATE tournament_days SET round_id = $1 WHERE id = $2', [round.id, day.id]);
        await pool.query('UPDATE tournament_groups SET round_id = $1 WHERE day_id = $2', [round.id, day.id]);
        await pool.query('UPDATE tournament_rooms SET round_id = $1 WHERE day_id = $2', [round.id, day.id]);
        await pool.query('UPDATE tournament_matches SET round_id = $1 WHERE day_id = $2', [round.id, day.id]);
      }
    } catch (err) {
      console.warn(`⚠️ [ROUNDS] Backfill skipped for tournament ${m.tournament_id}:`, err.message);
    }
  }
  return true;
}

// Read a tournament's persisted rounds (used by the roadmap GET endpoint).
export async function getTournamentRounds(pool, tournamentId) {
  const res = await pool.query(
    'SELECT id, round_number, name, teams_advancing, teams_in, "date", "time", map, status, round_type, advancement_type, advancement_target_round_id, teams_advancing_per_district, teams_advancing_per_match, round_order FROM tournament_rounds WHERE tournament_id = $1 ORDER BY round_number ASC',
    [tournamentId]
  );
  return res.rows;
}