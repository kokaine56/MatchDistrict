import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeTournament, FINALIZATION_ERR, TournamentFinalizationError } from '../server/tournamentFinalizationService.js';

function makeClient(responses) {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next || { rows: [] };
    },
  };
}

test('finalization detects the highest round number without assuming a fixed round count', async () => {
  const client = makeClient([
    { rows: [{ id: 'T', status: 'live', roadmap_status: 'approved', finalized_at: null }] },
    { rows: [] },
    { rows: [] },
    { rows: [{ id: 'ROUND-7', round_number: 7, name: 'Final', status: 'live' }] },
    { rows: [{ id: 'M', assigned_count: 1, verified_count: 1, unresolved_count: 0, inactive_assignment_count: 0, missing_result_count: 0 }] },
    { rows: [{ unresolved_count: 0 }] },
    { rows: [{ team_id: 'TEAM', team_name: 'Team', leader_name: 'Leader', rank: 1, total_points: 20, total_kills: 5, wwcd_count: 1, best_placement: 1 }] },
    { rows: [] },
    { rows: [{ finalized_at: '2026-09-24T00:00:00.000Z' }] },
    { rows: [] },
  ]);
  const result = await finalizeTournament(client, { tournamentId: 'T', actorId: 'ORG' });
  assert.equal(result.final_round.id, 'ROUND-7');
  assert.equal(result.final_standings[0].rank, 1);
  assert.ok(client.calls.some(({ sql }) => sql.includes('ORDER BY round_number DESC LIMIT 1')));
  assert.ok(client.calls.some(({ sql }) => sql.includes('FROM tournament_leaderboard')));
  assert.ok(client.calls.some(({ sql }) => sql.includes('INSERT INTO tournament_final_standings')));
});

test('finalization rejects an unapproved roadmap before reading rounds or results', async () => {
  const client = makeClient([{ rows: [{ id: 'T', status: 'live', roadmap_status: 'draft', finalized_at: null }] }]);
  await assert.rejects(
    finalizeTournament(client, { tournamentId: 'T', actorId: 'ORG' }),
    (err) => err instanceof TournamentFinalizationError && err.code === FINALIZATION_ERR.ROADMAP_NOT_APPROVED
  );
  assert.equal(client.calls.length, 1);
});

test('a completed status without finalized_at is not classified as finalized', async () => {
  const client = makeClient([{ rows: [{ id: 'T', status: 'completed', roadmap_status: 'approved', finalized_at: null }] }]);
  await assert.rejects(
    finalizeTournament(client, { tournamentId: 'T', actorId: 'ORG' }),
    (err) => err instanceof TournamentFinalizationError && err.code === FINALIZATION_ERR.TOURNAMENT_NOT_LIVE
  );
});

test('finalization rejects a match with no assigned teams', async () => {
  const client = makeClient([
    { rows: [{ id: 'T', status: 'live', roadmap_status: 'approved', finalized_at: null }] },
    { rows: [] },
    { rows: [] },
    { rows: [{ id: 'R2', round_number: 2 }] },
    { rows: [{ id: 'M', assigned_count: 0, verified_count: 0, unresolved_count: 0, inactive_assignment_count: 0, missing_result_count: 0 }] },
  ]);
  await assert.rejects(
    finalizeTournament(client, { tournamentId: 'T', actorId: 'ORG' }),
    (err) => err instanceof TournamentFinalizationError && err.code === FINALIZATION_ERR.FINAL_MATCHES_INCOMPLETE
  );
});

test('finalization rejects a result row that is not verified', async () => {
  const client = makeClient([
    { rows: [{ id: 'T', status: 'live', roadmap_status: 'approved', finalized_at: null }] },
    { rows: [] },
    { rows: [] },
    { rows: [{ id: 'R2', round_number: 2 }] },
    { rows: [{ id: 'M', assigned_count: 1, verified_count: 0, unresolved_count: 1, inactive_assignment_count: 0, missing_result_count: 0 }] },
    { rows: [{ unresolved_count: 1 }] },
  ]);
  await assert.rejects(
    finalizeTournament(client, { tournamentId: 'T', actorId: 'ORG' }),
    (err) => err instanceof TournamentFinalizationError && err.code === FINALIZATION_ERR.FINAL_RESULTS_INCOMPLETE
  );
});

test('repeated finalization returns the persisted snapshot without inserting again', async () => {
  const client = makeClient([
    { rows: [{ id: 'T', status: 'completed', roadmap_status: 'approved', finalized_at: '2026-09-24T00:00:00.000Z', finalized_by: 'ORG' }] },
    { rows: [{ id: 'S1', tournament_id: 'T', team_id: 'TEAM', rank: 1, total_points: 5, finalized_at: '2026-09-24T00:00:00.000Z', finalized_by: 'ORG' }] },
  ]);
  const result = await finalizeTournament(client, { tournamentId: 'T', actorId: 'ORG' });
  assert.equal(result.alreadyFinalized, true);
  assert.equal(result.final_standings[0].team_id, 'TEAM');
  assert.equal(client.calls.length, 2);
});

