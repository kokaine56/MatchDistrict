import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import pg from 'pg';
import { settlePrizeAward, PRIZE_PAYOUT_ERR, PrizePayoutError } from '../server/prizePayoutService.js';

const TEST_URL = process.env.PGTEST_URL || process.env.SUPABASE_TEST_URL || 'postgresql://postgres:postgres@localhost:54322/postgres';
const SSL = TEST_URL.includes('localhost') || TEST_URL.includes('127.0.0.1') ? false : { rejectUnauthorized: false };
let dbReady = false;
let dbProbeMessage = '';
let seedCounter = 0;

test('prize payouts: PostgreSQL availability probe', async () => {
  const client = new pg.Client({ connectionString: TEST_URL, ssl: SSL, connectionTimeoutMillis: 2500 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    dbReady = true;
  } catch (error) {
    dbProbeMessage = error.message || String(error);
  } finally {
    await client.end().catch(() => {});
  }
});

async function withTransaction(fn, t) {
  if (!dbReady) {
    t.skip(`No test database reachable (${new URL(TEST_URL).host}): ${dbProbeMessage}`);
    return;
  }
  const client = new pg.Client({ connectionString: TEST_URL, ssl: SSL });
  await client.connect();
  await client.query('BEGIN');
  try {
    await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}

async function seed(client, { status = 'pending_payout', withRecipient = true, withUpi = true } = {}) {
  const tag = `PP${Date.now().toString(36)}${(++seedCounter).toString(36)}`.toUpperCase().slice(-12);
  const ownerId = `${tag}-O`;
  const recipientId = withRecipient ? `${tag}-U` : null;
  const teamId = `${tag}-T`;
  const tournamentId = `${tag}-TO`;
  const awardId = `${tag}-A`;
  for (const [id, name] of [[ownerId, 'Organizer'], ...(recipientId ? [[recipientId, 'Winner']] : [])]) {
    await client.query('INSERT INTO users (id,email,name,password) VALUES ($1,$2,$3,$4)', [id, `${id}@payout.test`, name, 'test-only']);
  }
  await client.query('INSERT INTO tournaments (id,title,game,status,"orgId",match_type) VALUES ($1,$2,$3,$4,$5,$6)', [tournamentId, 'Prize Payout Test', 'BGMI', 'completed', ownerId, 'squad']);
  await client.query('INSERT INTO tournament_teams (id,tournament_id,team_name,leader_user_id,status) VALUES ($1,$2,$3,$4,$5)', [teamId, tournamentId, 'Winner Team', recipientId || ownerId, 'verified']);
  await client.query(
    `INSERT INTO tournament_prize_awards (id,tournament_id,team_id,rank,award_type,prize_amount,recipient_user_id,status,generated_by)
     VALUES ($1,$2,$3,1,'placement',5000,$4,$5,$6)`,
    [awardId, tournamentId, teamId, recipientId, status, ownerId]
  );
  if (recipientId && withUpi) {
    await client.query('INSERT INTO user_payout_profiles (user_id,upi_id) VALUES ($1,$2)', [recipientId, 'winner@bank']);
  }
  return { ownerId, recipientId, teamId, tournamentId, awardId };
}

function request(scenario, extras = {}) {
  return {
    tournamentId: scenario.tournamentId,
    awardId: scenario.awardId,
    actorId: scenario.ownerId,
    actorIsAuthorized: true,
    utrReference: 'PAYOUTUTR123456',
    manuallySent: true,
    upiIdUsed: 'winner@bank',
    ...extras,
  };
}

test('real database settlement persists payment, award state, UTR, recipient snapshot and audit atomically', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client);
  const result = await settlePrizeAward(client, request(scenario));
  assert.equal(result.payment.amount, 5000);
  assert.equal(result.payment.user_id, scenario.recipientId);
  assert.equal(result.payment.recipient_upi_id, 'winner@bank');
  const payment = await client.query('SELECT * FROM tournament_prize_payments WHERE prize_award_id=$1', [scenario.awardId]);
  assert.equal(payment.rows.length, 1);
  assert.equal(payment.rows[0].utr_reference, 'PAYOUTUTR123456');
  assert.equal(payment.rows[0].payment_status, 'paid');
  assert.equal((await client.query('SELECT status FROM tournament_prize_awards WHERE id=$1', [scenario.awardId])).rows[0].status, 'paid');
  assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM admin_action_log WHERE target_id=$1 AND action='prize_payout_recorded'", [scenario.awardId])).rows[0].n, 1);
  await assert.rejects(client.query('UPDATE tournament_prize_payments SET utr_reference=$1 WHERE prize_award_id=$2', ['CHANGEDUTR123', scenario.awardId]), /immutable/);
}, t));

test('real database same-award same-UTR retry is idempotent and a changed UTR is rejected', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client);
  await settlePrizeAward(client, request(scenario));
  const retry = await settlePrizeAward(client, request(scenario, { utrReference: ' payoututr123456 ' }));
  assert.equal(retry.alreadyPaid, true);
  assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM tournament_prize_payments WHERE prize_award_id=$1', [scenario.awardId])).rows[0].n, 1);
  await assert.rejects(settlePrizeAward(client, request(scenario, { utrReference: 'DIFFERENT123' })), (error) => error.code === PRIZE_PAYOUT_ERR.AWARD_ALREADY_PAID);
}, t));

test('real database rejects an unassigned or missing recipient UPI and altered amount', async (t) => withTransaction(async (client) => {
  const noRecipient = await seed(client, { withRecipient: false });
  await assert.rejects(settlePrizeAward(client, request(noRecipient)), (error) => error.code === PRIZE_PAYOUT_ERR.RECIPIENT_NOT_ASSIGNED);
  const noUpi = await seed(client, { withUpi: false });
  await assert.rejects(settlePrizeAward(client, request(noUpi)), (error) => error.code === PRIZE_PAYOUT_ERR.RECIPIENT_UPI_MISSING);
  await assert.rejects(settlePrizeAward(client, request(noUpi, { submittedAmount: 1 })), (error) => error.code === PRIZE_PAYOUT_ERR.AMOUNT_MISMATCH);
}, t));

test('real database uniqueness rejects UTR reuse by another award', async (t) => withTransaction(async (client) => {
  const first = await seed(client);
  const second = await seed(client);
  await settlePrizeAward(client, request(first));
  await assert.rejects(settlePrizeAward(client, request(second)), (error) => error instanceof PrizePayoutError && error.code === PRIZE_PAYOUT_ERR.UTR_ALREADY_USED);
}, t));

test('real database rollback leaves no payment or paid award after an audit failure', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client);
  await client.query("CREATE FUNCTION pg_temp.reject_prize_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'prize_payout_recorded' THEN RAISE EXCEPTION 'forced audit failure'; END IF; RETURN NEW; END $$");
  await client.query('CREATE TRIGGER reject_prize_audit BEFORE INSERT ON admin_action_log FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_prize_audit()');
  await client.query('SAVEPOINT payout_attempt');
  await assert.rejects(settlePrizeAward(client, request(scenario)), /forced audit failure/);
  await client.query('ROLLBACK TO SAVEPOINT payout_attempt');
  await client.query('RELEASE SAVEPOINT payout_attempt');
  assert.equal((await client.query('SELECT status FROM tournament_prize_awards WHERE id=$1', [scenario.awardId])).rows[0].status, 'pending_payout');
  assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM tournament_prize_payments WHERE prize_award_id=$1', [scenario.awardId])).rows[0].n, 0);
}, t));
