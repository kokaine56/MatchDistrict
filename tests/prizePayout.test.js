import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidUpiId, normalizeUtr, PRIZE_PAYOUT_ERR, PrizePayoutError, settlePrizeAward } from '../server/prizePayoutService.js';

function makeClient(responses) {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response || { rows: [] };
    },
  };
}

const award = {
  id: 'AWARD-1', tournament_id: 'TOURNAMENT-1', team_id: 'TEAM-1',
  prize_amount: 5000, recipient_user_id: 'USER-1', status: 'pending_payout',
  rank: 1, award_type: 'placement', recipient_name: 'Winner', recipient_upi_id: 'winner@bank',
  existing_recipient_id: 'USER-1',
};

function successClient() {
  return makeClient([
    { rows: [award] },
    { rows: [] },
    { rows: [{ upi_id: 'winner@bank' }] },
    { rows: [] },
    { rows: [{ id: 'PPAY-1', tournament_id: award.tournament_id, prize_award_id: award.id, team_id: award.team_id, user_id: award.recipient_user_id, amount: 5000, currency: 'INR', payment_type: 'tournament_prize', payment_status: 'paid', utr_reference: 'UTR123456', recipient_upi_id: award.recipient_upi_id, paid_at: '2026-09-24T00:00:00.000Z', recorded_by: 'ORG-1' }] },
    { rows: [{ id: award.id }] },
    { rows: [] },
  ]);
}

const request = {
  tournamentId: award.tournament_id,
  awardId: award.id,
  actorId: 'ORG-1',
  actorIsAuthorized: true,
  utrReference: ' UTR123456 ',
  manuallySent: true,
  upiIdUsed: 'winner@bank',
};

test('manual prize settlement uses the locked award amount and recipient, snapshots UPI, and audits the UTR', async () => {
  const client = successClient();
  const result = await settlePrizeAward(client, request);
  assert.equal(result.payment.amount, 5000);
  assert.equal(result.payment.user_id, 'USER-1');
  assert.equal(result.payment.recipient_upi_id, 'winner@bank');
  assert.equal(result.payment.utr_reference, 'UTR123456');
  assert.ok(client.calls.some(({ sql, values }) => sql.includes("SET status = 'paid'") && values[0] === 'AWARD-1'));
  const insert = client.calls.find(({ sql }) => sql.includes('INSERT INTO tournament_prize_payments'));
  assert.equal(insert.values[5], 5000);
  assert.equal(insert.values[1], 'USER-1');
  assert.equal(client.calls.at(-1).values[3].includes('UTR123456'), true);
});

test('manual payment acknowledgement is required', async () => {
  const client = makeClient([]);
  await assert.rejects(settlePrizeAward(client, { ...request, manuallySent: false }), (err) => err.code === PRIZE_PAYOUT_ERR.MANUAL_PAYMENT_CONFIRMATION_REQUIRED);
  assert.equal(client.calls.length, 0);
});

test('unauthorized actor cannot settle an award', async () => {
  const client = makeClient([]);
  await assert.rejects(settlePrizeAward(client, { ...request, actorIsAuthorized: false }), (err) => err.code === PRIZE_PAYOUT_ERR.FORBIDDEN);
  assert.equal(client.calls.length, 0);
});

test('missing recipient rejects settlement', async () => {
  const client = makeClient([{ rows: [{ ...award, recipient_user_id: null }] }]);
  await assert.rejects(settlePrizeAward(client, request), (err) => err.code === PRIZE_PAYOUT_ERR.RECIPIENT_NOT_ASSIGNED);
});

test('deleted recipient account rejects settlement', async () => {
  const client = makeClient([{ rows: [{ ...award, existing_recipient_id: null }] }]);
  await assert.rejects(settlePrizeAward(client, request), (err) => err.code === PRIZE_PAYOUT_ERR.RECIPIENT_NOT_FOUND);
});

test('missing recipient UPI rejects settlement', async () => {
  const client = makeClient([{ rows: [award] }, { rows: [] }, { rows: [] }]);
  await assert.rejects(settlePrizeAward(client, request), (err) => err.code === PRIZE_PAYOUT_ERR.RECIPIENT_UPI_MISSING);
});

test('changed or client-substituted UPI ID rejects settlement', async () => {
  const client = makeClient([{ rows: [award] }, { rows: [] }, { rows: [{ upi_id: 'winner@bank' }] }]);
  await assert.rejects(settlePrizeAward(client, { ...request, upiIdUsed: 'attacker@bank' }), (err) => err.code === PRIZE_PAYOUT_ERR.RECIPIENT_UPI_MISMATCH);
});

test('submitted amount cannot differ from the award amount', async () => {
  const client = makeClient([{ rows: [award] }, { rows: [] }, { rows: [{ upi_id: 'winner@bank' }] }]);
  await assert.rejects(settlePrizeAward(client, { ...request, submittedAmount: 4999 }), (err) => err.code === PRIZE_PAYOUT_ERR.AMOUNT_MISMATCH);
  assert.equal(client.calls.length, 3);
});

test('same award and same UTR returns the prior payment idempotently', async () => {
  const prior = { id: 'PPAY-1', tournament_id: award.tournament_id, prize_award_id: award.id, team_id: award.team_id, user_id: award.recipient_user_id, amount: 5000, currency: 'INR', payment_type: 'tournament_prize', payment_status: 'paid', utr_reference: 'UTR123456', recipient_upi_id: 'winner@bank', paid_at: '2026-09-24T00:00:00.000Z', recorded_by: 'ORG-1' };
  const client = makeClient([{ rows: [{ ...award, status: 'paid' }] }, { rows: [prior] }]);
  const result = await settlePrizeAward(client, request);
  assert.equal(result.alreadyPaid, true);
  assert.equal(result.payment.id, 'PPAY-1');
  assert.equal(client.calls.length, 2);
});

test('already-paid award rejects a different UTR', async () => {
  const prior = { id: 'PPAY-1', utr_reference: 'OTHER123' };
  const client = makeClient([{ rows: [{ ...award, status: 'paid' }] }, { rows: [prior] }]);
  await assert.rejects(settlePrizeAward(client, request), (err) => err.code === PRIZE_PAYOUT_ERR.AWARD_ALREADY_PAID);
});

test('UTR used by another award is rejected before insert', async () => {
  const client = makeClient([{ rows: [award] }, { rows: [] }, { rows: [{ upi_id: 'winner@bank' }] }, { rows: [{ id: 'PPAY-OTHER' }] }]);
  await assert.rejects(settlePrizeAward(client, request), (err) => err.code === PRIZE_PAYOUT_ERR.UTR_ALREADY_USED);
  assert.equal(client.calls.some(({ sql }) => sql.includes('INSERT INTO tournament_prize_payments')), false);
});

test('database UTR uniqueness violations map to a structured conflict', async () => {
  const client = makeClient([
    { rows: [award] }, { rows: [] }, { rows: [{ upi_id: 'winner@bank' }] }, { rows: [] },
    Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'uq_tournament_prize_payments_utr' }),
  ]);
  await assert.rejects(settlePrizeAward(client, request), (err) => err instanceof PrizePayoutError && err.code === PRIZE_PAYOUT_ERR.UTR_ALREADY_USED);
});

test('UPI and UTR input validation rejects malformed values', () => {
  assert.equal(isValidUpiId('winner@bank'), true);
  assert.equal(isValidUpiId('not-a-vpa'), false);
  assert.equal(normalizeUtr(' UTR123456 '), 'UTR123456');
  assert.equal(normalizeUtr('bad ref'), null);
});
