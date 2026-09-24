import test from 'node:test';
import assert from 'node:assert';
import pg from 'pg';
import {
  DEFAULT_CREDENTIALS_RELEASE_MINUTES,
  normalizeReleaseMinutes,
  matchReleaseEpoch,
  isMatchReleased,
} from '../server/matchRelease.js';
import {
  PARTICIPANT_VISIBLE_TEAM_STATUSES,
  participantAccessMode,
  buildParticipantRoadmap,
  emptyParticipantRoadmap,
} from '../server/participantRoadmap.js';

// Phase 7 — Secure Roadmap Visibility + Room Credential Release.
//   PART A (pure): release arithmetic + participant roadmap virtualization.
//   PART B (DB-backed, probe/skip): the exact SQL the server runs to resolve an
//   authenticated user's team and fetch their assignments, plus a leak audit
//   against the real schema (credential columns can never appear in a
//   participant payload, regardless of release state).

// ───────────────────────── PART A: pure release arithmetic ─────────────────────────

test('matchRelease: default release window is 15 minutes', () => {
  assert.strictEqual(DEFAULT_CREDENTIALS_RELEASE_MINUTES, 15);
});

test('matchRelease: normalizeReleaseMinutes bounds 0..1440, tolerant of strings', () => {
  assert.strictEqual(normalizeReleaseMinutes(15), 15);
  assert.strictEqual(normalizeReleaseMinutes('10'), 10);
  assert.strictEqual(normalizeReleaseMinutes('015'), 15);
  assert.strictEqual(normalizeReleaseMinutes(0), 0);
  assert.strictEqual(normalizeReleaseMinutes(1440), 1440);
  assert.strictEqual(normalizeReleaseMinutes(15.9), 15); // parseInt truncates
  assert.strictEqual(normalizeReleaseMinutes(null), 15);
  assert.strictEqual(normalizeReleaseMinutes(undefined), 15);
  assert.strictEqual(normalizeReleaseMinutes('abc'), 15);
  assert.strictEqual(normalizeReleaseMinutes(-5), 15);
  assert.strictEqual(normalizeReleaseMinutes(1441), 15);
  assert.strictEqual(normalizeReleaseMinutes(NaN), 15);
});

test('matchRelease: normalizeReleaseMinutes honors a valid fallback, else default', () => {
  assert.strictEqual(normalizeReleaseMinutes('bad', 5), 5);
  assert.strictEqual(normalizeReleaseMinutes('bad', 0), 0);
  assert.strictEqual(normalizeReleaseMinutes('bad', null), 15);
  assert.strictEqual(normalizeReleaseMinutes('bad', 9999), 15);
});

test('matchRelease: epoch = match start minus release window (naive local)', () => {
  const start = new Date('2026-11-01T10:00:00');
  assert.strictEqual(matchReleaseEpoch('2026-11-01', '10:00', 15), start.getTime() - 15 * 60000);
  assert.strictEqual(matchReleaseEpoch('2026-11-01', '10:00', 0), start.getTime());
});

test('matchRelease: midnight-crossing release borrows from the previous day', () => {
  // 00:05 − 15min → previous day 23:50
  const prevDay2350 = new Date('2026-11-01T23:50:00');
  assert.strictEqual(matchReleaseEpoch('2026-11-02', '00:05', 15), prevDay2350.getTime());
});

test('matchRelease: unparseable date/start produce null epoch (never a release)', () => {
  assert.strictEqual(matchReleaseEpoch('', '10:00', 15), null);
  assert.strictEqual(matchReleaseEpoch('2026-11-01', '', 15), null);
  assert.strictEqual(matchReleaseEpoch('2026-11-01', '10:00:00', 15), null); // HH:MM only
  assert.strictEqual(matchReleaseEpoch('2026-11-01', '10', 15), null);
  assert.strictEqual(matchReleaseEpoch('2026-13-99', '10:00', 15), null);
  assert.strictEqual(matchReleaseEpoch(null, null, 15), null);
});

test('matchRelease: isMatchReleased compares against server time (>=), locks before', () => {
  // Release at 09:45 for a 10:00 match with 15min window.
  const before = new Date('2026-11-01T09:44:59').getTime();
  const atRelease = new Date('2026-11-01T09:45:00').getTime();
  const after = new Date('2026-11-01T09:45:01').getTime();
  assert.strictEqual(isMatchReleased('2026-11-01', '10:00', 15, before), false);
  assert.strictEqual(isMatchReleased('2026-11-01', '10:00', 15, atRelease), true);
  assert.strictEqual(isMatchReleased('2026-11-01', '10:00', 15, after), true);
});

test('matchRelease: invalid data can never be ' + "'released'", () => {
  assert.strictEqual(isMatchReleased('', '10:00', 15, Date.now()), false);
  assert.strictEqual(isMatchReleased('2026-11-01', '', 15, Date.now()), false);
  assert.strictEqual(isMatchReleased('bad-date', '10:00', 15, Date.now()), false);
});

// ──────────────────── PART A: pure participant roadmap virtualization ────────────────────

test('participantRoadmap: only "allocated" teams grant placement visibility', () => {
  assert.deepStrictEqual([...PARTICIPANT_VISIBLE_TEAM_STATUSES], ['allocated']);
});

test('participantAccessMode: no-team / unallocated / participant', () => {
  assert.deepStrictEqual(participantAccessMode(null), { mode: 'no-team' });
  assert.deepStrictEqual(participantAccessMode({ team: null }), { mode: 'no-team' });
  assert.deepStrictEqual(participantAccessMode({ team: { status: 'verified' } }), { mode: 'unallocated' });
  assert.deepStrictEqual(participantAccessMode({ team: { status: 'allocation_pending' } }), { mode: 'unallocated' });
  assert.deepStrictEqual(participantAccessMode({ team: { status: 'awaiting_members' } }), { mode: 'unallocated' });
  assert.deepStrictEqual(participantAccessMode({ team: { status: 'allocated' } }), { mode: 'participant' });
});

test('participantRoadmap: empty roadmap keeps the full shape', () => {
  const empty = emptyParticipantRoadmap();
  assert.deepStrictEqual(
    Object.keys(empty).sort(),
    ['assignments', 'days', 'groups', 'matches', 'rooms', 'rounds']
  );
  for (const k of Object.keys(empty)) assert.deepStrictEqual(empty[k], []);
});

// Build a full, organizer-style roadmap with two teams to prove isolation.
function makeFullRoadmap(opts = {}) {
  const releaseMinutes = opts.releaseMinutes ?? 15;
  const nowMs = opts.nowMs ?? Date.now();
  const rounds = [
    { id: 'RND1', tournament_id: 'TRN1', round_number: 1, name: 'Qualifier', status: 'configured', teams_advancing: 48, date: '2026-11-01', time: '10:00', map: 'Erangel' },
    { id: 'RND2', tournament_id: 'TRN1', round_number: 2, name: 'Final', status: 'configured', teams_advancing: 16, date: '2026-11-02', time: '14:00', map: 'Miramar' },
  ];
  const days = [
    { id: 'DAY1', tournament_id: 'TRN1', round_id: 'RND1', day_number: 1, date: '2026-11-01' },
    { id: 'DAY2', tournament_id: 'TRN1', round_id: 'RND2', day_number: 1, date: '2026-11-02' },
  ];
  const groups = [
    { id: 'GRP1', day_id: 'DAY1', tournament_id: 'TRN1', group_name: 'Group A', sequence: 1, round_id: 'RND1' },
    { id: 'GRP2', day_id: 'DAY2', tournament_id: 'TRN1', group_name: 'Group A', sequence: 1, round_id: 'RND2' },
  ];
  const rooms = [
    { id: 'RM1', group_id: 'GRP1', day_id: 'DAY1', tournament_id: 'TRN1', room_number: 1, capacity: 4, status: 'READY', round_id: 'RND1' },
    { id: 'RM2', group_id: 'GRP2', day_id: 'DAY2', tournament_id: 'TRN1', room_number: 2, capacity: 4, status: 'READY', round_id: 'RND2' },
  ];
  const matches = [
    { id: 'MTC1', room_id: 'RM1', group_id: 'GRP1', day_id: 'DAY1', tournament_id: 'TRN1', match_number: 1, start_time: '10:00', end_time: '11:00', status: 'SCHEDULED', room_identifier: 'SECRET-ID-1', room_password: 'SECRET-PWD-1', credential_status: 'Configured', round_id: 'RND1' },
    { id: 'MTC2', room_id: 'RM2', group_id: 'GRP2', day_id: 'DAY2', tournament_id: 'TRN1', match_number: 1, start_time: '14:00', end_time: '15:00', status: 'SCHEDULED', room_identifier: 'SECRET-ID-2', room_password: 'SECRET-PWD-2', credential_status: 'Configured', round_id: 'RND2' },
  ];
  const assignments = [
    { id: 'ASG1', tournament_id: 'TRN1', tournament_team_id: 'TEAM-A', match_id: 'MTC1', room_id: 'RM1', group_id: 'GRP1', day_id: 'DAY1', status: 'allocated' },
    { id: 'ASG2', tournament_id: 'TRN1', tournament_team_id: 'TEAM-B', match_id: 'MTC2', room_id: 'RM2', group_id: 'GRP2', day_id: 'DAY2', status: 'allocated' },
  ];
  return { full: { rounds, days, groups, rooms, matches, assignments }, releaseMinutes, nowMs };
}

test('participantRoadmap: only the caller' + "'s own chain is included", () => {
  const { full, releaseMinutes, nowMs } = makeFullRoadmap();
  const built = buildParticipantRoadmap(full, 'TEAM-A', { releaseMinutes, nowMs });

  assert.deepStrictEqual(built.matches.map((m) => m.id), ['MTC1']);
  assert.deepStrictEqual(built.rooms.map((r) => r.id), ['RM1']);
  assert.deepStrictEqual(built.groups.map((g) => g.id), ['GRP1']);
  assert.deepStrictEqual(built.days.map((d) => d.id), ['DAY1']);
  assert.deepStrictEqual(built.rounds.map((r) => r.id), ['RND1']);
  assert.deepStrictEqual(built.assignments.map((a) => a.id), ['ASG1']);
});

test('participantRoadmap: multi-round assignments are ordered and carry safe round metadata', () => {
  const { full } = makeFullRoadmap();
  // Reverse source row order and place a later day before an earlier one to
  // ensure the participant view uses round/day ordering, not input order.
  full.days = [
    { ...full.days[0], id: 'DAY1-LATE', day_number: 2 },
    { ...full.days[1], id: 'DAY2-EARLY', day_number: 1 },
    { ...full.days[0], id: 'DAY1-EARLY', day_number: 1 },
  ];
  full.groups = [
    { ...full.groups[0], id: 'GRP1-LATE', day_id: 'DAY1-LATE' },
    { ...full.groups[1], id: 'GRP2', day_id: 'DAY2-EARLY' },
    { ...full.groups[0], id: 'GRP1-EARLY', day_id: 'DAY1-EARLY' },
  ];
  full.rooms = [
    { ...full.rooms[0], id: 'RM1-LATE', group_id: 'GRP1-LATE', day_id: 'DAY1-LATE' },
    { ...full.rooms[1], id: 'RM2', group_id: 'GRP2', day_id: 'DAY2-EARLY' },
    { ...full.rooms[0], id: 'RM1-EARLY', group_id: 'GRP1-EARLY', day_id: 'DAY1-EARLY' },
  ];
  full.matches = [
    { ...full.matches[0], id: 'M1-LATE', room_id: 'RM1-LATE', group_id: 'GRP1-LATE', day_id: 'DAY1-LATE', match_number: 2 },
    { ...full.matches[1], id: 'M2-R2', room_id: 'RM2', group_id: 'GRP2', day_id: 'DAY2-EARLY', match_number: 1 },
    { ...full.matches[0], id: 'M1-EARLY', room_id: 'RM1-EARLY', group_id: 'GRP1-EARLY', day_id: 'DAY1-EARLY', match_number: 1 },
  ];
  full.assignments = [
    { id: 'ASG-LATE', tournament_team_id: 'TEAM-A', match_id: 'M1-LATE', room_id: 'RM1-LATE', group_id: 'GRP1-LATE', day_id: 'DAY1-LATE' },
    { id: 'ASG-R2', tournament_team_id: 'TEAM-A', match_id: 'M2-R2', room_id: 'RM2', group_id: 'GRP2', day_id: 'DAY2-EARLY', source: 'advancement' },
    { id: 'ASG-EARLY', tournament_team_id: 'TEAM-A', match_id: 'M1-EARLY', room_id: 'RM1-EARLY', group_id: 'GRP1-EARLY', day_id: 'DAY1-EARLY' },
    { id: 'ASG-B', tournament_team_id: 'TEAM-B', match_id: 'MTC1', room_id: 'RM1', group_id: 'GRP1', day_id: 'DAY1' },
  ];

  const built = buildParticipantRoadmap(full, 'TEAM-A', { releaseMinutes: 15, nowMs: new Date('2026-11-01T09:59:59').getTime() });
  assert.deepStrictEqual(built.rounds.map((r) => r.round_number), [1, 2]);
  assert.deepStrictEqual(built.days.map((d) => [d.round_number, d.day_number]), [[1, 1], [1, 2], [2, 1]]);
  assert.deepStrictEqual(built.matches.map((m) => [m.round_number, m.match_number]), [[1, 1], [1, 2], [2, 1]]);
  assert.deepStrictEqual(built.matches.map((m) => m.id), ['M1-EARLY', 'M1-LATE', 'M2-R2']);
  assert.strictEqual(built.matches[2].round_id, 'RND2');
  assert.strictEqual(built.rounds[1].name, 'Final');
  assert.ok(!('teams_advancing' in built.rounds[1]));
  assert.strictEqual(built.matches[2].credentials_available, false);
  for (const match of built.matches) {
    assert.ok(!('room_identifier' in match));
    assert.ok(!('room_password' in match));
    assert.ok(!('credential_status' in match));
  }
  assert.strictEqual(built.matches.some((m) => m.id === 'MTC1'), false, 'unrelated team match excluded');
  assert.deepStrictEqual(built.assignments.map((a) => a.id), ['ASG-EARLY', 'ASG-LATE', 'ASG-R2']);
});

test('participantRoadmap: an unqualified team with only Round 1 assignment sees no Round 2 data', () => {
  const { full } = makeFullRoadmap();
  const built = buildParticipantRoadmap(full, 'TEAM-A', { releaseMinutes: 15, nowMs: Date.now() });
  assert.deepStrictEqual(built.rounds.map((r) => r.round_number), [1]);
  assert.ok(built.matches.every((m) => m.round_number === 1));
  assert.ok(built.rooms.every((r) => r.id !== 'RM2'));
  assert.ok(built.groups.every((g) => g.id !== 'GRP2'));
  assert.ok(built.days.every((d) => d.id !== 'DAY2'));
});

test('participantRoadmap: Round 2 release uses the shared schedule release rule', () => {
  const { full } = makeFullRoadmap();
  full.assignments = [{ id: 'ASG2', tournament_team_id: 'TEAM-A', match_id: 'MTC2', room_id: 'RM2', group_id: 'GRP2', day_id: 'DAY2', source: 'advancement' }];
  const before = buildParticipantRoadmap(full, 'TEAM-A', { releaseMinutes: 15, nowMs: new Date('2026-11-02T13:44:59').getTime() });
  const after = buildParticipantRoadmap(full, 'TEAM-A', { releaseMinutes: 15, nowMs: new Date('2026-11-02T13:45:00').getTime() });
  assert.strictEqual(before.matches[0].round_number, 2);
  assert.strictEqual(before.matches[0].credentials_available, false);
  assert.strictEqual(after.matches[0].credentials_available, true);
  for (const m of after.matches) {
    assert.ok(!('room_identifier' in m));
    assert.ok(!('room_password' in m));
  }
});

test('participant /my-team assignment SQL uses match round and scopes tournament before round-day ordering', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../server.js', import.meta.url), 'utf8');
  const start = source.indexOf("const myTeamMatch = urlPath.match");
  const end = source.indexOf('// POST /api/tournaments/:id/teams (Create a team)', start);
  assert.ok(start >= 0 && end > start, 'my-team handler source found');
  const handler = source.slice(start, end);
  assert.match(handler, /rnd\.round_number, rnd\.name as round_name/);
  assert.match(handler, /LEFT JOIN tournament_rounds rnd ON rnd\.id = m\.round_id AND rnd\.tournament_id = a\.tournament_id/);
  assert.match(handler, /WHERE a\.tournament_team_id = \$1 AND a\.tournament_id = \$2/);
  assert.match(handler, /ORDER BY rnd\.round_number ASC NULLS LAST, d\.day_number ASC, m\.match_number ASC/);
  assert.match(handler, /SELECT m\.id, m\.role, m\.joined_at AS created_at, u\.name, u\.avatar/);
  assert.match(handler, /ORDER BY m\.joined_at ASC NULLS LAST, m\.id ASC/);
  assert.doesNotMatch(handler, /m\.created_at/);
});

test('participant credential authorization remains scoped to authenticated membership, match, and tournament', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../server.js', import.meta.url), 'utf8');
  const start = source.indexOf('if (credentialsMatch && req.method === \'GET\')');
  const end = source.indexOf('// ── PHASE 10: MATCH RESULTS', start);
  assert.ok(start >= 0 && end > start, 'credential handler source found');
  const handler = source.slice(start, end);
  assert.match(handler, /a\.match_id = \$1 AND a\.tournament_id = \$2 AND tm\.user_id = \$3/);
  assert.match(handler, /\[mId, tId, authUser\.id\]/);
  assert.match(handler, /WHERE m\.id = \$1 AND m\.tournament_id = \$2/);
  assert.match(handler, /\[mId, tId\]/);
});

test('participantRoadmap: credential fields NEVER leave the builder', () => {
  const { full, releaseMinutes, nowMs } = makeFullRoadmap({ nowMs: new Date('2026-11-01T10:00:00').getTime() });
  const built = buildParticipantRoadmap(full, 'TEAM-A', { releaseMinutes, nowMs });

  for (const m of built.matches) {
    assert.ok(!('room_identifier' in m), 'room_identifier must be absent');
    assert.ok(!('room_password' in m), 'room_password must be absent');
    assert.ok(!('credential_status' in m), 'credential_status must be absent');
  }
});

test('participantRoadmap: credentials_available flips with server release timing', () => {
  const releaseMinutes = 0; // release == match start for a clean boundary test
  const early = new Date('2026-11-01T09:59:59').getTime();
  const atMatch = new Date('2026-11-01T10:00:00').getTime();

  const locked = buildParticipantRoadmap(makeFullRoadmap({ releaseMinutes, nowMs: early }).full, 'TEAM-A', { releaseMinutes, nowMs: early });
  assert.strictEqual(locked.matches[0].credentials_available, false);
  assert.strictEqual(locked.matches[0].release_minutes, 0);

  const open = buildParticipantRoadmap(makeFullRoadmap({ releaseMinutes, nowMs: atMatch }).full, 'TEAM-A', { releaseMinutes, nowMs: atMatch });
  assert.strictEqual(open.matches[0].credentials_available, true);
});

test('participantRoadmap: rounds strip planning/qualification metadata', () => {
  const { full, releaseMinutes, nowMs } = makeFullRoadmap();
  const built = buildParticipantRoadmap(full, 'TEAM-A', { releaseMinutes, nowMs });
  assert.strictEqual(built.rounds.length, 1);
  assert.ok(!('teams_advancing' in built.rounds[0]), 'teams_advancing must be stripped');
  assert.strictEqual(built.rounds[0].round_number, 1);
  assert.ok('map' in built.rounds[0], 'non-sensitive scheduling fields are kept');
});

test('participantRoadmap: no assignments (or junk ids) yields an empty chain', () => {
  const { full, releaseMinutes, nowMs } = makeFullRoadmap();
  const built = buildParticipantRoadmap(full, 'NO-SUCH-TEAM', { releaseMinutes, nowMs });
  assert.deepStrictEqual(built.matches, []);
  assert.deepStrictEqual(built.rooms, []);
  assert.deepStrictEqual(built.groups, []);
  assert.deepStrictEqual(built.days, []);
  assert.deepStrictEqual(built.rounds, []);
  assert.deepStrictEqual(built.assignments, []);
});

test('participantRoadmap: tolerant of null/empty input', () => {
  const empty = emptyParticipantRoadmap();
  const built = buildParticipantRoadmap(null, 'TEAM-A', { releaseMinutes: 15, nowMs: Date.now() });
  assert.deepStrictEqual(built, empty);
});

// ──────────────────── PART B: DB-backed leak audit + server SQL contract ────────────────────

const TEST_URL =
  process.env.PGTEST_URL ||
  process.env.SUPABASE_TEST_URL ||
  'postgresql://postgres:postgres@localhost:54322/postgres';

const SSL = TEST_URL.includes('localhost') || TEST_URL.includes('127.0.0.1')
  ? false
  : { rejectUnauthorized: false };

let dbReady = false;
let dbProbeMessage = '';

test('credentials roadmap: database availability probe', async () => {
  const probe = new pg.Client({ connectionString: TEST_URL, ssl: SSL, connectionTimeoutMillis: 3000 });
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    dbReady = true;
  } catch (err) {
    dbProbeMessage = err.message || String(err);
  } finally {
    await probe.end().catch(() => {});
  }
});

async function withTransaction(fn, t) {
  if (!dbReady) {
    t.skip(`No test database reachable (${TEST_URL}): ${dbProbeMessage}`);
    return { ran: false };
  }
  const client = new pg.Client({ connectionString: TEST_URL, ssl: SSL });
  await client.connect();
  await client.query('BEGIN');
  try {
    const result = await fn(client);
    await client.query('ROLLBACK');
    return { ran: true, result };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

async function seedParticipantScenario(client, tournamentId = 'CRD-TRN-1') {
  const orgId = `ORG-${tournamentId}`;
  await client.query(
    'INSERT INTO users (id, email, name, password) VALUES ($1, $2, $3, $4)',
    [orgId, `${orgId.toLowerCase()}@crd.test`, 'Org', 'x']
  );
  await client.query(
    'INSERT INTO users (id, email, name, password) VALUES ($1, $2, $3, $4)',
    ['CRD-A', 'crd-a@crd.test', 'Player A', 'x']
  );
  await client.query(
    'INSERT INTO users (id, email, name, password) VALUES ($1, $2, $3, $4)',
    ['CRD-B', 'crd-b@crd.test', 'Player B', 'x']
  );
  await client.query(
    `INSERT INTO tournaments (id, title, game, status, match_type, "orgId")
     VALUES ($1, $2, 'BGMI', 'upcoming', 'squad', $3)`,
    [tournamentId, `Credentials test ${tournamentId}`, orgId]
  );
  await client.query(
    'UPDATE tournaments SET roadmap_status = $1, room_credentials_release_minutes = $2 WHERE id = $3',
    ['approved', 15, tournamentId]
  );
  await client.query(
    'INSERT INTO tournament_rounds (id, tournament_id, round_number, name, status, teams_advancing, "date", "time") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [`${tournamentId}-R`, tournamentId, 1, 'Qualifier', 'configured', 48, '2026-11-01', '10:00']
  );
  await client.query(
    'INSERT INTO tournament_days (id, tournament_id, round_id, day_number, date) VALUES ($1,$2,$3,$4,$5)',
    [`${tournamentId}-D`, tournamentId, `${tournamentId}-R`, 1, '2026-11-01']
  );
  await client.query(
    'INSERT INTO tournament_groups (id, day_id, tournament_id, group_name, sequence, round_id) VALUES ($1,$2,$3,$4,$5,$6)',
    [`${tournamentId}-G`, `${tournamentId}-D`, tournamentId, 'Group A', 1, `${tournamentId}-R`]
  );
  await client.query(
    'INSERT INTO tournament_rooms (id, group_id, day_id, tournament_id, room_number, capacity, round_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [`${tournamentId}-RM`, `${tournamentId}-G`, `${tournamentId}-D`, tournamentId, 1, 4, `${tournamentId}-R`]
  );
  // Match carries credentials in the DB — they must never surface to participants.
  await client.query(
    `INSERT INTO tournament_matches (id, room_id, group_id, day_id, tournament_id, match_number, start_time, end_time, round_id, room_identifier, room_password, credential_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [`${tournamentId}-M`, `${tournamentId}-RM`, `${tournamentId}-G`, `${tournamentId}-D`, tournamentId, 1, '10:00', '11:00', `${tournamentId}-R`, 'ROOM-SECRET', 'PWD-SECRET', 'Configured']
  );
  for (const team of ['CRD-TEAM-A', 'CRD-TEAM-B']) {
    await client.query(
      `INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [team, tournamentId, team, `CRD-${team.endsWith('A') ? 'A' : 'B'}`, 'allocated']
    );
  }
  await client.query(
    'INSERT INTO tournament_team_members (id, tournament_team_id, tournament_id, user_id, role) VALUES ($1,$2,$3,$4,$5)',
    ['CRD-MEM-A', 'CRD-TEAM-A', tournamentId, 'CRD-A', 'leader']
  );
  await client.query(
    'INSERT INTO tournament_team_members (id, tournament_team_id, tournament_id, user_id, role) VALUES ($1,$2,$3,$4,$5)',
    ['CRD-MEM-B', 'CRD-TEAM-B', tournamentId, 'CRD-B', 'leader']
  );
  // Team A → match; Team B → nothing allocated this round.
  await client.query(
    `INSERT INTO tournament_match_assignments (id, tournament_id, tournament_team_id, match_id, room_id, group_id, day_id, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [`${tournamentId}-ASG`, tournamentId, 'CRD-TEAM-A', `${tournamentId}-M`, `${tournamentId}-RM`, `${tournamentId}-G`, `${tournamentId}-D`, 'allocated']
  );
}

test('my-team members query reads the real joined_at column and preserves created_at response shape', async (t) => {
  await withTransaction(async (client) => {
    const tournamentId = 'CRD-MYTEAM-MEMBERS';
    await seedParticipantScenario(client, tournamentId);
    await client.query(
      'INSERT INTO users (id, email, name, password) VALUES ($1, $2, $3, $4)',
      ['CRD-A2', 'crd-a2@crd.test', 'Player A2', 'x']
    );
    await client.query(
      `INSERT INTO tournament_team_members (id, tournament_team_id, tournament_id, user_id, role, joined_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['CRD-MEM-A2', 'CRD-TEAM-A', tournamentId, 'CRD-A2', 'member', null]
    );
    await client.query(
      'UPDATE tournament_team_members SET joined_at = $1 WHERE id = $2',
      ['2026-01-01T00:00:00Z', 'CRD-MEM-A']
    );

    const membersRes = await client.query(`
      SELECT m.id, m.role, m.joined_at AS created_at, u.name, u.avatar
      FROM tournament_team_members m
      JOIN users u ON m.user_id = u.id
      WHERE m.tournament_team_id = $1
      ORDER BY m.joined_at ASC NULLS LAST, m.id ASC
    `, ['CRD-TEAM-A']);
    assert.deepStrictEqual(membersRes.rows.map((member) => member.id), ['CRD-MEM-A', 'CRD-MEM-A2']);
    assert.strictEqual(membersRes.rows[0].created_at.toISOString(), '2026-01-01T00:00:00.000Z');
    assert.strictEqual(membersRes.rows[1].created_at, null);
    assert.strictEqual(membersRes.rows[1].name, 'Player A2');
  }, t);
});

test('credentials roadmap: server SQL resolves only the caller' + "'s team + scoped assignments", async (t) => {
  await withTransaction(async (client) => {     const tournamentId = 'CRD-TRN-1';
    await seedParticipantScenario(client, tournamentId);

    // Exactly the participant-mode queries from GET /roadmap (server.js ~5673-5699).
    const teamRes = await client.query(`
      SELECT t.id, t.team_name, t.status, t.tournament_id
      FROM tournament_teams t
      JOIN tournament_team_members tm ON tm.tournament_team_id = t.id
      WHERE t.tournament_id = $1 AND tm.user_id = $2
      LIMIT 1
    `, [tournamentId, 'CRD-A']);
    assert.strictEqual(teamRes.rows.length, 1);
    assert.strictEqual(teamRes.rows[0].id, 'CRD-TEAM-A');

    const assignRes = await client.query(`
      SELECT a.id, a.match_id, a.room_id, a.group_id, a.day_id, a.tournament_team_id, a.status
      FROM tournament_match_assignments a
      WHERE a.tournament_id = $1 AND a.tournament_team_id = $2
    `, [tournamentId, 'CRD-TEAM-A']);
    assert.strictEqual(assignRes.rows.length, 1);
    assert.strictEqual(assignRes.rows[0].match_id, `${tournamentId}-M`);

    // The membership JOIN must be scoped to the tournament — a membership row in
    // a DIFFERENT tournament for the same user must not grant this roadmap.
    await client.query(
      'INSERT INTO users (id, email, name, password) VALUES ($1,$2,$3,$4)',
      ['CRD-C', 'crd-c@crd.test', 'Player C', 'x']
    );
    await client.query(
      'INSERT INTO users (id, email, name, password) VALUES ($1,$2,$3,$4)',
      ['ORG-OTHER', 'org-other@crd.test', 'OtherOrg', 'x']
    );
    await client.query(
      `INSERT INTO tournaments (id, title, game, status, match_type, "orgId")
       VALUES ('CRD-OTH-TRN', 'Other', 'BGMI', 'upcoming', 'squad', 'ORG-OTHER')`
    );
    await client.query(
      `INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id, status)
       VALUES ('CRD-TEAM-C', 'CRD-OTH-TRN', 'Team C', 'CRD-C', 'allocated')`
    );
    await client.query(
      'INSERT INTO tournament_team_members (id, tournament_team_id, tournament_id, user_id, role) VALUES ($1,$2,$3,$4,$5)',
      ['CRD-MEM-C', 'CRD-TEAM-C', 'CRD-OTH-TRN', 'CRD-C', 'leader']
    );
    const cross = await client.query(`
      SELECT t.id FROM tournament_teams t
      JOIN tournament_team_members tm ON tm.tournament_team_id = t.id
      WHERE t.tournament_id = $1 AND tm.user_id = $2
    `, [tournamentId, 'CRD-C']);
    assert.strictEqual(cross.rows.length, 0, 'foreign memberships cannot grant this roadmap');
  }, t);
});

test('credentials roadmap: DB-loaded participant slice leaks no credential columns and flips release flag', async (t) => {
  await withTransaction(async (client) => {     const tournamentId = 'CRD-TRN-2';
    await seedParticipantScenario(client, tournamentId);

    const [rounds, days, groups, rooms, matches] = await Promise.all([
      client.query('SELECT * FROM tournament_rounds WHERE tournament_id = $1', [tournamentId]),
      client.query('SELECT * FROM tournament_days WHERE tournament_id = $1', [tournamentId]),
      client.query('SELECT * FROM tournament_groups WHERE tournament_id = $1 ORDER BY sequence ASC', [tournamentId]),
      client.query('SELECT * FROM tournament_rooms WHERE tournament_id = $1 ORDER BY room_number ASC', [tournamentId]),
      client.query('SELECT * FROM tournament_matches WHERE tournament_id = $1 ORDER BY match_number ASC', [tournamentId]),
    ]);
    const assignments = await client.query(`
      SELECT a.id, a.match_id, a.room_id, a.group_id, a.day_id, a.tournament_team_id, a.status
      FROM tournament_match_assignments a
      WHERE a.tournament_id = $1 AND a.tournament_team_id = $2
    `, [tournamentId, 'CRD-TEAM-A']);

    const full = { rounds: rounds.rows, days: days.rows, groups: groups.rows, rooms: rooms.rows, matches: matches.rows, assignments: assignments.rows };
    // Sanity: the real DB row carries the credentials (so the strip is meaningful).
    const rawMatch = matches.rows.find((m) => m.id === `${tournamentId}-M`);
    assert.strictEqual(rawMatch.room_identifier, 'ROOM-SECRET');
    assert.strictEqual(rawMatch.room_password, 'PWD-SECRET');

    try {
      const built = buildParticipantRoadmap(full, 'CRD-TEAM-A', { releaseMinutes: 15, nowMs: new Date('2026-11-01T09:59:59').getTime() });
      assert.strictEqual(built.matches.length, 1);
      assert.strictEqual(built.matches[0].credentials_available, false);
      for (const k of ['room_identifier', 'room_password', 'credential_status']) {
        assert.ok(!(k in built.matches[0]), `${k} leaked into the participant payload`);
      }
      assert.ok(!('teams_advancing' in built.rounds[0]), 'teams_advancing leaked');
    } catch (err) {
      // If the schema diverges from the DDL above, this surfaces as a wait,
      // not a silent pass.
      assert.fail(`participant slice build failed against real schema: ${err.message}`);
    }
  }, t);
});

test('credentials roadmap: unallocated team yields empty participant roadmap against real rows', async (t) => {
  await withTransaction(async (client) => {     const tournamentId = 'CRD-TRN-3';
    await seedParticipantScenario(client, tournamentId);

    const rounds = await client.query('SELECT * FROM tournament_rounds WHERE tournament_id = $1', [tournamentId]);
    const days = await client.query('SELECT * FROM tournament_days WHERE tournament_id = $1', [tournamentId]);
    const groups = await client.query('SELECT * FROM tournament_groups WHERE tournament_id = $1 ORDER BY sequence ASC', [tournamentId]);
    const rooms = await client.query('SELECT * FROM tournament_rooms WHERE tournament_id = $1 ORDER BY room_number ASC', [tournamentId]);
    const matches = await client.query('SELECT * FROM tournament_matches WHERE tournament_id = $1 ORDER BY match_number ASC', [tournamentId]);
    const assignments = await client.query(`
      SELECT a.id, a.match_id, a.room_id, a.group_id, a.day_id, a.tournament_team_id, a.status
      FROM tournament_match_assignments a
      WHERE a.tournament_id = $1 AND a.tournament_team_id = $2
    `, [tournamentId, 'CRD-TEAM-B']);

    const built = buildParticipantRoadmap(
      { rounds: rounds.rows, days: days.rows, groups: groups.rows, rooms: rooms.rows, matches: matches.rows, assignments: assignments.rows },
      'CRD-TEAM-B',
      { releaseMinutes: 15, nowMs: Date.now() }
    );
    assert.deepStrictEqual(built, emptyParticipantRoadmap());
  }, t);
});
