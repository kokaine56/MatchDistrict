import { randomBytes } from 'node:crypto';

export const PRIZE_PAYOUT_ERR = Object.freeze({
  FORBIDDEN: 'FORBIDDEN',
  TOURNAMENT_NOT_FOUND: 'TOURNAMENT_NOT_FOUND',
  AWARD_NOT_FOUND: 'AWARD_NOT_FOUND',
  RECIPIENT_NOT_ASSIGNED: 'RECIPIENT_NOT_ASSIGNED',
  RECIPIENT_NOT_FOUND: 'RECIPIENT_NOT_FOUND',
  RECIPIENT_UPI_MISSING: 'RECIPIENT_UPI_MISSING',
  RECIPIENT_UPI_MISMATCH: 'RECIPIENT_UPI_MISMATCH',
  INVALID_UPI_ID: 'INVALID_UPI_ID',
  INVALID_REFERENCE: 'INVALID_REFERENCE',
  MANUAL_PAYMENT_CONFIRMATION_REQUIRED: 'MANUAL_PAYMENT_CONFIRMATION_REQUIRED',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  UTR_ALREADY_USED: 'UTR_ALREADY_USED',
  AWARD_ALREADY_PAID: 'AWARD_ALREADY_PAID',
  AWARD_STATE_INVALID: 'AWARD_STATE_INVALID',
  PAYMENT_STATE_INCONSISTENT: 'PAYMENT_STATE_INCONSISTENT',
});

export class PrizePayoutError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = 'PrizePayoutError';
    this.code = code;
    this.status = status;
  }
}

function payoutError(code, message, status) {
  throw new PrizePayoutError(code, message, status);
}

function payoutId() {
  return `PPAY-${randomBytes(8).toString('hex').toUpperCase()}`;
}

function logId() {
  return `LOG-${randomBytes(6).toString('hex').toUpperCase()}`;
}

export function normalizeUtr(value) {
  if (typeof value !== 'string') return null;
  const utr = value.trim();
  return /^[A-Za-z0-9-]{6,128}$/.test(utr) ? utr : null;
}

export function isValidUpiId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9.-]{2,64}$/.test(value.trim());
}

function mapPayment(row, idempotent = false) {
  return {
    id: row.id,
    tournament_id: row.tournament_id,
    prize_award_id: row.prize_award_id,
    team_id: row.team_id,
    user_id: row.user_id,
    amount: Number(row.amount),
    currency: row.currency,
    payment_type: row.payment_type,
    payment_status: row.payment_status,
    utr_reference: row.utr_reference,
    recipient_upi_id: row.recipient_upi_id,
    paid_at: row.paid_at,
    recorded_by: row.recorded_by,
    idempotent,
  };
}

/** Caller owns the transaction. Locks the award before checking or writing settlement. */
export async function settlePrizeAward(client, {
  tournamentId,
  awardId: prizeAwardId,
  actorId,
  actorIsAuthorized = false,
  utrReference,
  manuallySent = false,
  submittedAmount,
  upiIdUsed,
} = {}) {
  if (!client || !tournamentId || !prizeAwardId || !actorId) {
    throw new TypeError('client, tournamentId, awardId and actorId are required.');
  }
  if (!actorIsAuthorized) payoutError(PRIZE_PAYOUT_ERR.FORBIDDEN, 'Only the tournament organizer or an admin can record this payout.', 403);
  if (manuallySent !== true) {
    payoutError(PRIZE_PAYOUT_ERR.MANUAL_PAYMENT_CONFIRMATION_REQUIRED, 'Confirm that the payment was already sent manually before recording it.', 400);
  }
  const utr = normalizeUtr(utrReference);
  if (!utr) payoutError(PRIZE_PAYOUT_ERR.INVALID_REFERENCE, 'Enter a valid UTR or payment reference (6–128 letters, digits, or hyphens).', 400);

  const awardResult = await client.query(
    `SELECT a.id, a.tournament_id, a.team_id, a.prize_amount, a.recipient_user_id, a.status,
            a.rank, a.award_type, a.paid_at, a.recorded_by,
            tt.team_name, u.id AS existing_recipient_id, u.name AS recipient_name
     FROM tournament_prize_awards a
     LEFT JOIN tournament_teams tt ON tt.id = a.team_id
     LEFT JOIN users u ON u.id = a.recipient_user_id
     WHERE a.id = $1 AND a.tournament_id = $2
     FOR UPDATE OF a`,
    [prizeAwardId, tournamentId]
  );
  if (!awardResult.rows.length) payoutError(PRIZE_PAYOUT_ERR.AWARD_NOT_FOUND, 'Prize award not found for this tournament.', 404);
  const award = awardResult.rows[0];

  if (!award.recipient_user_id) {
    payoutError(PRIZE_PAYOUT_ERR.RECIPIENT_NOT_ASSIGNED, 'This award does not have an assigned recipient. Payout cannot be recorded.');
  }
  if (!award.existing_recipient_id) {
    payoutError(PRIZE_PAYOUT_ERR.RECIPIENT_NOT_FOUND, 'The assigned recipient account no longer exists.');
  }

  const existingResult = await client.query(
    `SELECT id, tournament_id, prize_award_id, team_id, user_id, amount, currency,
            payment_type, payment_status, utr_reference, recipient_upi_id, paid_at, recorded_by
     FROM tournament_prize_payments WHERE prize_award_id = $1`,
    [prizeAwardId]
  );
  if (existingResult.rows.length && award.status !== 'paid') {
    payoutError(PRIZE_PAYOUT_ERR.PAYMENT_STATE_INCONSISTENT, 'A payment record exists while the award is not marked paid. Contact support before retrying.');
  }
  if (award.status === 'paid') {
    const existing = existingResult.rows[0];
    if (existing && existing.utr_reference.toLowerCase() === utr.toLowerCase()) {
      return { alreadyPaid: true, payment: mapPayment(existing, true) };
    }
    payoutError(PRIZE_PAYOUT_ERR.AWARD_ALREADY_PAID, 'This prize award has already been paid; its reference is immutable.');
  }
  if (!['pending_payout', 'pending_recipient'].includes(award.status)) {
    payoutError(PRIZE_PAYOUT_ERR.AWARD_STATE_INVALID, 'This prize award is not in a payable state.');
  }
  const profileResult = await client.query('SELECT upi_id FROM user_payout_profiles WHERE user_id = $1 FOR SHARE', [award.recipient_user_id]);
  const recipientUpiId = profileResult.rows[0]?.upi_id;
  if (!isValidUpiId(recipientUpiId)) {
    payoutError(PRIZE_PAYOUT_ERR.RECIPIENT_UPI_MISSING, 'The assigned recipient must add a valid UPI ID before settlement.');
  }
  if (typeof upiIdUsed !== 'string' || upiIdUsed.trim().toLowerCase() !== recipientUpiId.trim().toLowerCase()) {
    payoutError(PRIZE_PAYOUT_ERR.RECIPIENT_UPI_MISMATCH, 'Confirm the exact UPI ID currently saved for the assigned recipient.');
  }

  const amount = Number(award.prize_amount);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    payoutError(PRIZE_PAYOUT_ERR.AWARD_STATE_INVALID, 'The authoritative prize amount is invalid.');
  }
  if (submittedAmount !== undefined && Number(submittedAmount) !== amount) {
    payoutError(PRIZE_PAYOUT_ERR.AMOUNT_MISMATCH, 'The submitted amount must match the full prize award amount.', 400);
  }

  const duplicate = await client.query(
    'SELECT id FROM tournament_prize_payments WHERE lower(btrim(utr_reference)) = lower($1) LIMIT 1',
    [utr]
  );
  if (duplicate.rows.length) payoutError(PRIZE_PAYOUT_ERR.UTR_ALREADY_USED, 'This payment reference has already been used for another prize payment.');

  let payment;
  try {
    const inserted = await client.query(
      `INSERT INTO tournament_prize_payments
         (id, user_id, tournament_id, prize_award_id, team_id, amount, currency,
          payment_type, payment_status, utr_reference, recipient_upi_id, paid_at,
          recorded_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'INR', 'tournament_prize', 'paid', $7, $8, NOW(), $9, NOW(), NOW())
       RETURNING id, tournament_id, prize_award_id, team_id, user_id, amount, currency,
                 payment_type, payment_status, utr_reference, recipient_upi_id, paid_at, recorded_by`,
      [payoutId(), award.recipient_user_id, tournamentId, prizeAwardId, award.team_id, amount, utr, recipientUpiId, actorId]
    );
    payment = inserted.rows[0];
  } catch (err) {
    if (err.code === '23505' && String(err.constraint || '').includes('utr')) {
      payoutError(PRIZE_PAYOUT_ERR.UTR_ALREADY_USED, 'This payment reference has already been used for another prize payment.');
    }
    if (err.code === '23505') payoutError(PRIZE_PAYOUT_ERR.AWARD_ALREADY_PAID, 'A payment has already been recorded for this award.');
    throw err;
  }

  const paid = await client.query(
    `UPDATE tournament_prize_awards SET status = 'paid', paid_at = $2, recorded_by = $3, updated_at = NOW()
     WHERE id = $1 AND status IN ('pending_payout', 'pending_recipient') AND paid_at IS NULL
     RETURNING id`,
    [prizeAwardId, payment.paid_at, actorId]
  );
  if (!paid.rows.length) payoutError(PRIZE_PAYOUT_ERR.AWARD_ALREADY_PAID, 'This prize award has already been paid.');

  await client.query(
    `INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, details)
     VALUES ($1, $2, 'prize_payout_recorded', 'prize_payout', 'tournament_prize_award', $3, $4)`,
    [logId(), actorId, prizeAwardId, JSON.stringify({
      tournament_id: tournamentId,
      award_id: prizeAwardId,
      team_id: award.team_id,
      recipient_user_id: award.recipient_user_id,
      amount,
      currency: 'INR',
      utr_reference: utr,
      recorded_by: actorId,
      recorded_at: payment.paid_at,
    })]
  );

  return { alreadyPaid: false, payment: mapPayment(payment) };
}
