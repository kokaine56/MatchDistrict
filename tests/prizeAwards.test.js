import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAndValidatePrizePositions,
  calculatePlacementAmounts,
  generatePrizeAwards,
  listPrizeAwards,
  PRIZE_AWARD_ERR,
  PrizeAwardError,
  AWARD_STATUS,
} from '../server/prizeAwardService.js';

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

test('missing prize distribution is rejected', () => {
  const result = parseAndValidatePrizePositions('[]');
  assert.equal(result.ok, false);
  assert.equal(result.code, PRIZE_AWARD_ERR.PRIZE_DISTRIBUTION_MISSING);
});

test('invalid percentage total is rejected', () => {
  const result = parseAndValidatePrizePositions([
    { name: '1st', percentage: '50' },
    { name: '2nd', percentage: '30' },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.code, PRIZE_AWARD_ERR.PRIZE_CONFIGURATION_INVALID);
});

test('valid prize positions parse with ranks mapped by order', () => {
  const result = parseAndValidatePrizePositions([
    { id: 'pos_1', name: '1st', percentage: '50' },
    { id: 'pos_2', name: '2nd', percentage: '30' },
    { id: 'pos_3', name: '3rd', percentage: '20' },
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.positions.map((p) => p.rank), [1, 2, 3]);
  assert.deepEqual(result.positions.map((p) => p.percentage), [50, 30, 20]);
});

test('server calculates prize amounts from pool and percentages', () => {
  const parsed = parseAndValidatePrizePositions([
    { name: '1st', percentage: '50' },
    { name: '2nd', percentage: '30' },
    { name: '3rd', percentage: '20' },
  ]);
  const calc = calculatePlacementAmounts(parsed.positions, 10000);
  assert.equal(calc.ok, true);
  assert.deepEqual(calc.awards.map((a) => a.prize_amount), [5000, 3000, 2000]);
  assert.equal(calc.awards.reduce((s, a) => s + a.prize_amount, 0), 10000);
});

test('largest-remainder keeps integer amounts summing to the pool', () => {
  const parsed = parseAndValidatePrizePositions([
    { name: '1st', percentage: '33.33' },
    { name: '2nd', percentage: '33.33' },
    { name: '3rd', percentage: '33.34' },
  ]);
  const calc = calculatePlacementAmounts(parsed.positions, 100);
  assert.equal(calc.ok, true);
  assert.equal(calc.awards.reduce((s, a) => s + a.prize_amount, 0), 100);
});

test('zero or missing prize pool is rejected', () => {
  const parsed = parseAndValidatePrizePositions([{ name: '1st', percentage: '100' }]);
  const calc = calculatePlacementAmounts(parsed.positions, 0);
  assert.equal(calc.ok, false);
  assert.equal(calc.code, PRIZE_AWARD_ERR.PRIZE_CONFIGURATION_INVALID);
});

test('awards cannot be generated before finalization', async () => {
  const client = makeClient([
    { rows: [{ id: 'T', status: 'live', finalized_at: null, prize_positions: '[{"percentage":"100"}]', prize_pool_amount: 1000 }] },
    { rows: [] },
  ]);
  await assert.rejects(
    generatePrizeAwards(client, { tournamentId: 'T', actorId: 'ORG' }),
    (err) => err instanceof PrizeAwardError && err.code === PRIZE_AWARD_ERR.TOURNAMENT_NOT_FINALIZED
  );
});

test('completed status without finalized_at is rejected', async () => {
  const client = makeClient([
    { rows: [{ id: 'T', status: 'completed', finalized_at: null, prize_positions: '[{"percentage":"100"}]', prize_pool_amount: 1000 }] },
    { rows: [] },
  ]);
  await assert.rejects(
    generatePrizeAwards(client, { tournamentId: 'T', actorId: 'ORG' }),
    (err) => err instanceof PrizeAwardError && err.code === PRIZE_AWARD_ERR.TOURNAMENT_NOT_FINALIZED
  );
});

test('missing prize configuration is rejected after finalization', async () => {
  const client = makeClient([
    { rows: [{ id: 'T', status: 'completed', finalized_at: '2026-09-24T00:00:00Z', prize_positions: '[]', prize_pool_amount: 1000 }] },
    { rows: [] },
    { rows: [{ id: 'S1', team_id: 'TEAM1', rank: 1, team_name: 'A', leader_user_id: 'U1' }] },
  ]);
  await assert.rejects(
    generatePrizeAwards(client, { tournamentId: 'T', actorId: 'ORG' }),
    (err) => err instanceof PrizeAwardError && err.code === PRIZE_AWARD_ERR.PRIZE_DISTRIBUTION_MISSING
  );
});

test('invalid distribution is rejected', async () => {
  const client = makeClient([
    {
      rows: [{
        id: 'T',
        status: 'completed',
        finalized_at: '2026-09-24T00:00:00Z',
        prize_positions: JSON.stringify([{ percentage: '70' }, { percentage: '20' }]),
        prize_pool_amount: 1000,
      }],
    },
    { rows: [] },
    { rows: [{ id: 'S1', team_id: 'TEAM1', rank: 1, team_name: 'A', leader_user_id: 'U1' }] },
  ]);
  await assert.rejects(
    generatePrizeAwards(client, { tournamentId: 'T', actorId: 'ORG' }),
    (err) => err instanceof PrizeAwardError && err.code === PRIZE_AWARD_ERR.PRIZE_CONFIGURATION_INVALID
  );
});

test('valid finalized tournament generates correct placement awards', async () => {
  const positions = JSON.stringify([
    { name: '1st', percentage: '50' },
    { name: '2nd', percentage: '30' },
    { name: '3rd', percentage: '20' },
  ]);
  const client = makeClient([
    { rows: [{ id: 'T', status: 'completed', finalized_at: '2026-09-24T00:00:00Z', prize_positions: positions, prize_pool_amount: 10000 }] },
    { rows: [] },
    {
      rows: [
        { id: 'S1', team_id: 'TEAM1', rank: 1, team_name: 'Alpha', leader_user_id: 'LEAD1' },
        { id: 'S2', team_id: 'TEAM2', rank: 2, team_name: 'Beta', leader_user_id: 'LEAD2' },
        { id: 'S3', team_id: 'TEAM3', rank: 3, team_name: 'Gamma', leader_user_id: 'LEAD3' },
      ],
    },
    { rows: [] },
    { rows: [] },
    { rows: [] },
    {
      rows: [
        { id: 'PAW1', tournament_id: 'T', final_standing_id: 'S1', team_id: 'TEAM1', rank: 1, award_type: 'placement', prize_amount: 5000, percentage: 50, recipient_user_id: 'LEAD1', status: AWARD_STATUS.PENDING_PAYOUT, team_name: 'Alpha', recipient_name: 'L1' },
        { id: 'PAW2', tournament_id: 'T', final_standing_id: 'S2', team_id: 'TEAM2', rank: 2, award_type: 'placement', prize_amount: 3000, percentage: 30, recipient_user_id: 'LEAD2', status: AWARD_STATUS.PENDING_PAYOUT, team_name: 'Beta', recipient_name: 'L2' },
        { id: 'PAW3', tournament_id: 'T', final_standing_id: 'S3', team_id: 'TEAM3', rank: 3, award_type: 'placement', prize_amount: 2000, percentage: 20, recipient_user_id: 'LEAD3', status: AWARD_STATUS.PENDING_PAYOUT, team_name: 'Gamma', recipient_name: 'L3' },
      ],
    },
    { rows: [] },
  ]);

  const result = await generatePrizeAwards(client, { tournamentId: 'T', actorId: 'ORG' });
  assert.equal(result.alreadyGenerated, false);
  assert.equal(result.award_count, 3);
  assert.equal(result.total_award_amount, 10000);
  assert.equal(result.awards[0].prize_amount, 5000);
  assert.equal(result.awards[0].team_id, 'TEAM1');
  assert.equal(result.awards[0].recipient_user_id, 'LEAD1');
  assert.equal(result.awards[0].status, AWARD_STATUS.PENDING_PAYOUT);
  assert.ok(result.awards.every((a) => a.status !== 'paid'));

  const inserts = client.calls.filter(({ sql }) => sql.includes('INSERT INTO tournament_prize_awards'));
  assert.equal(inserts.length, 3);
  assert.deepEqual(inserts[0].values.slice(3, 10), ['TEAM1', 1, 'placement', 5000, 50, 'LEAD1', AWARD_STATUS.PENDING_PAYOUT]);
  assert.ok(client.calls.some(({ sql }) => sql.includes("admin_action_log") && sql.includes("'prize_awards_generated'")));
  assert.ok(!client.calls.some(({ sql }) => /wallet/i.test(sql)));
});

test('repeated generation is idempotent and does not insert again', async () => {
  const client = makeClient([
    { rows: [{ id: 'T', status: 'completed', finalized_at: '2026-09-24T00:00:00Z', prize_positions: '[{"percentage":"100"}]', prize_pool_amount: 500 }] },
    {
      rows: [
        { id: 'PAW1', tournament_id: 'T', team_id: 'TEAM1', rank: 1, award_type: 'placement', prize_amount: 500, recipient_user_id: 'LEAD1', status: AWARD_STATUS.PENDING_PAYOUT, team_name: 'Alpha' },
      ],
    },
  ]);
  const result = await generatePrizeAwards(client, { tournamentId: 'T', actorId: 'ORG' });
  assert.equal(result.alreadyGenerated, true);
  assert.equal(result.award_count, 1);
  assert.ok(!client.calls.some(({ sql }) => sql.includes('INSERT INTO tournament_prize_awards')));
});

test('client-supplied amounts are never read — only server pool and percentages are used', async () => {
  const positions = JSON.stringify([
    { name: '1st', percentage: '100', amount: 999999 },
  ]);
  const client = makeClient([
    { rows: [{ id: 'T', status: 'completed', finalized_at: '2026-09-24T00:00:00Z', prize_positions: positions, prize_pool_amount: 2500 }] },
    { rows: [] },
    { rows: [{ id: 'S1', team_id: 'TEAM1', rank: 1, team_name: 'Alpha', leader_user_id: 'LEAD1' }] },
    { rows: [] },
    {
      rows: [
        { id: 'PAW1', tournament_id: 'T', final_standing_id: 'S1', team_id: 'TEAM1', rank: 1, award_type: 'placement', prize_amount: 2500, percentage: 100, recipient_user_id: 'LEAD1', status: AWARD_STATUS.PENDING_PAYOUT, team_name: 'Alpha' },
      ],
    },
    { rows: [] },
  ]);
  const result = await generatePrizeAwards(client, { tournamentId: 'T', actorId: 'ORG' });
  assert.equal(result.awards[0].prize_amount, 2500);
  const insert = client.calls.find(({ sql }) => sql.includes('INSERT INTO tournament_prize_awards'));
  assert.equal(insert.values[6], 2500);
  assert.ok(!insert.values.includes(999999));
});

test('listPrizeAwards returns existing awards without generating', async () => {
  const client = makeClient([
    { rows: [{ id: 'T', finalized_at: '2026-09-24T00:00:00Z' }] },
    {
      rows: [
        { id: 'PAW1', tournament_id: 'T', team_id: 'TEAM1', rank: 1, award_type: 'placement', prize_amount: 100, status: AWARD_STATUS.PENDING_PAYOUT, team_name: 'A' },
      ],
    },
  ]);
  const result = await listPrizeAwards(client, { tournamentId: 'T' });
  assert.equal(result.award_count, 1);
  assert.equal(result.finalized, true);
  assert.ok(!client.calls.some(({ sql }) => sql.includes('INSERT INTO')));
});
