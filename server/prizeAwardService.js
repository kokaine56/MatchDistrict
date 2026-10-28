import { randomBytes } from 'node:crypto';

export const PRIZE_AWARD_ERR = Object.freeze({
  TOURNAMENT_NOT_FOUND: 'TOURNAMENT_NOT_FOUND',
  TOURNAMENT_NOT_FINALIZED: 'TOURNAMENT_NOT_FINALIZED',
  FINAL_STANDINGS_MISSING: 'FINAL_STANDINGS_MISSING',
  PRIZE_DISTRIBUTION_MISSING: 'PRIZE_DISTRIBUTION_MISSING',
  PRIZE_CONFIGURATION_INVALID: 'PRIZE_CONFIGURATION_INVALID',
});

export const AWARD_STATUS = Object.freeze({
  PENDING_RECIPIENT: 'pending_recipient',
  PENDING_PAYOUT: 'pending_payout',
});

export const AWARD_TYPE = Object.freeze({
  PLACEMENT: 'placement',
});

export class PrizeAwardError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = 'PrizeAwardError';
    this.code = code;
    this.status = status;
  }
}

function awardError(code, message, status) {
  throw new PrizeAwardError(code, message, status);
}

function awardId() {
  return `PAW-${randomBytes(8).toString('hex').toUpperCase()}`;
}

function logId() {
  return `LOG-${randomBytes(6).toString('hex').toUpperCase()}`;
}

/**
 * Parse and validate organizer-configured prize_positions.
 * Positions are ordered: index 0 → rank 1, index 1 → rank 2, …
 * New tournaments store exact INR amounts. Legacy percentage rows are still
 * accepted so existing saved tournaments can continue to be finalized.
 */
export function parseAndValidatePrizePositions(raw) {
  let positions;
  if (raw == null || raw === '') {
    return { ok: false, code: PRIZE_AWARD_ERR.PRIZE_DISTRIBUTION_MISSING, message: 'No prize distribution is configured for this tournament.' };
  }
  if (typeof raw === 'string') {
    try {
      positions = JSON.parse(raw);
    } catch {
      return { ok: false, code: PRIZE_AWARD_ERR.PRIZE_CONFIGURATION_INVALID, message: 'Prize distribution JSON could not be parsed.' };
    }
  } else {
    positions = raw;
  }
  if (!Array.isArray(positions) || positions.length === 0) {
    return { ok: false, code: PRIZE_AWARD_ERR.PRIZE_DISTRIBUTION_MISSING, message: 'No prize distribution is configured for this tournament.' };
  }

  const seenRanks = new Set();
  const normalized = [];
  for (let i = 0; i < positions.length; i += 1) {
    const pos = positions[i];
    if (!pos || typeof pos !== 'object') {
      return { ok: false, code: PRIZE_AWARD_ERR.PRIZE_CONFIGURATION_INVALID, message: `Prize position at index ${i} is invalid.` };
    }
    const rank = i + 1;
    if (seenRanks.has(rank)) {
      return { ok: false, code: PRIZE_AWARD_ERR.PRIZE_CONFIGURATION_INVALID, message: `Duplicate prize position for rank ${rank}.` };
    }
    seenRanks.add(rank);
    const amount = pos.amount ?? pos.prize_amount;
    const percentage = amount == null || amount === '' ? parseFloat(pos.percentage) : null;
    if (amount != null && amount !== '' && (!Number.isFinite(Number(amount)) || Number(amount) < 0)) {
      return { ok: false, code: PRIZE_AWARD_ERR.PRIZE_CONFIGURATION_INVALID, message: `Prize position rank ${rank} has an invalid INR amount.` };
    }
    if (amount == null && (!Number.isFinite(percentage) || percentage <= 0)) {
      return { ok: false, code: PRIZE_AWARD_ERR.PRIZE_CONFIGURATION_INVALID, message: `Prize position rank ${rank} has an invalid amount.` };
    }
    normalized.push({
      rank,
      name: typeof pos.name === 'string' ? pos.name : `${rank}`,
      amount: amount == null || amount === '' ? null : Number(amount),
      percentage,
    });
  }

  const legacyPercentages = normalized.every((position) => position.amount == null);
  const totalPct = Number(normalized.reduce((sum, p) => sum + (p.percentage || 0), 0).toFixed(2));
  if (legacyPercentages && Math.abs(totalPct - 100) >= 0.01) {
    return {
      ok: false,
      code: PRIZE_AWARD_ERR.PRIZE_CONFIGURATION_INVALID,
      message: `Prize distribution percentages must total 100 (got ${totalPct}).`,
    };
  }

  return { ok: true, positions: normalized };
}

/**
 * Calculate placement award amounts from the configured pool and percentages.
 * Amounts are derived server-side only — never trust client-submitted amounts.
 * Uses largest-remainder so integer rupee amounts sum to the pool.
 */
export function calculatePlacementAmounts(positions, prizePoolAmount) {
  const pool = parseInt(prizePoolAmount, 10);
  if (!Number.isFinite(pool) || pool <= 0) {
    return {
      ok: false,
      code: PRIZE_AWARD_ERR.PRIZE_CONFIGURATION_INVALID,
      message: 'Configured prize pool amount must be a positive integer.',
    };
  }

  const manualAmounts = positions.every((p) => p.amount != null);
  if (manualAmounts) {
    return {
      ok: true,
      pool,
      awards: positions.map((p) => ({
        rank: p.rank,
        name: p.name,
        percentage: null,
        prize_amount: p.amount,
        award_type: AWARD_TYPE.PLACEMENT,
      })),
    };
  }

  const exact = positions.map((p) => ({ ...p, exact: (p.percentage / 100) * pool }));
  const floored = exact.map((p) => ({
    ...p,
    prize_amount: Math.floor(p.exact),
    remainder: p.exact - Math.floor(p.exact),
  }));
  let leftover = pool - floored.reduce((sum, p) => sum + p.prize_amount, 0);
  const byRemainder = [...floored].sort((a, b) => b.remainder - a.remainder || a.rank - b.rank);
  for (const row of byRemainder) {
    if (leftover <= 0) break;
    row.prize_amount += 1;
    leftover -= 1;
  }

  return {
    ok: true,
    pool,
    awards: floored
      .sort((a, b) => a.rank - b.rank)
      .map(({ rank, name, percentage, prize_amount }) => ({
        rank,
        name,
        percentage,
        prize_amount,
        award_type: AWARD_TYPE.PLACEMENT,
      })),
  };
}

function mapAwardRow(row) {
  return {
    id: row.id,
    tournament_id: row.tournament_id,
    final_standing_id: row.final_standing_id,
    team_id: row.team_id,
    team_name: row.team_name || null,
    rank: row.rank,
    award_type: row.award_type,
    prize_amount: Number(row.prize_amount),
    percentage: row.percentage != null ? Number(row.percentage) : null,
    recipient_user_id: row.recipient_user_id || null,
    recipient_name: row.recipient_name || null,
    status: row.status,
    generated_by: row.generated_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadExistingAwards(client, tournamentId) {
  const result = await client.query(
    `SELECT a.id, a.tournament_id, a.final_standing_id, a.team_id, a.rank, a.award_type,
            a.prize_amount, a.percentage, a.recipient_user_id, a.status,
            a.generated_by, a.created_at, a.updated_at,
            COALESCE(s.team_name, tt.team_name) AS team_name,
            u.name AS recipient_name
     FROM tournament_prize_awards a
     LEFT JOIN tournament_final_standings s ON s.id = a.final_standing_id
     LEFT JOIN tournament_teams tt ON tt.id = a.team_id
     LEFT JOIN users u ON u.id = a.recipient_user_id
     WHERE a.tournament_id = $1
     ORDER BY a.rank ASC, a.award_type ASC`,
    [tournamentId]
  );
  return result.rows.map(mapAwardRow);
}

/**
 * List prize awards for a tournament (no generation).
 */
export async function listPrizeAwards(client, { tournamentId } = {}) {
  if (!client || !tournamentId) {
    throw new TypeError('client and tournamentId are required.');
  }
  const tournamentResult = await client.query(
    `SELECT id, finalized_at FROM tournaments WHERE id = $1`,
    [tournamentId]
  );
  if (!tournamentResult.rows.length) {
    awardError(PRIZE_AWARD_ERR.TOURNAMENT_NOT_FOUND, 'Tournament not found.', 404);
  }
  const awards = await loadExistingAwards(client, tournamentId);
  return {
    tournament_id: tournamentId,
    finalized: Boolean(tournamentResult.rows[0].finalized_at),
    awards,
    award_count: awards.length,
    total_award_amount: awards.reduce((sum, a) => sum + a.prize_amount, 0),
  };
}

/**
 * Generate immutable placement prize-award records from finalized standings
 * and the organizer-configured prize distribution.
 *
 * Caller owns the transaction. Does not move money or mark awards paid.
 */
export async function generatePrizeAwards(client, { tournamentId, actorId } = {}) {
  if (!client || !tournamentId || !actorId) {
    throw new TypeError('client, tournamentId and actorId are required.');
  }

  const tournamentResult = await client.query(
    `SELECT id, status, finalized_at, finalized_by, prize_positions, prize_pool_amount
     FROM tournaments WHERE id = $1 FOR UPDATE`,
    [tournamentId]
  );
  if (!tournamentResult.rows.length) {
    awardError(PRIZE_AWARD_ERR.TOURNAMENT_NOT_FOUND, 'Tournament not found.', 404);
  }
  const tournament = tournamentResult.rows[0];

  const existing = await loadExistingAwards(client, tournamentId);
  if (existing.length > 0) {
    return {
      alreadyGenerated: true,
      tournament_id: tournamentId,
      awards: existing,
      award_count: existing.length,
      total_award_amount: existing.reduce((sum, a) => sum + a.prize_amount, 0),
    };
  }

  // Phase 9A boundary: finalized_at is required. A plain "completed" status is not enough.
  if (!tournament.finalized_at) {
    awardError(
      PRIZE_AWARD_ERR.TOURNAMENT_NOT_FINALIZED,
      'Prize awards can only be generated after Phase 9A tournament finalization.',
      409
    );
  }

  const standingsResult = await client.query(
    `SELECT s.id, s.tournament_id, s.team_id, s.rank, s.team_name, s.total_points,
            tt.leader_user_id
     FROM tournament_final_standings s
     JOIN tournament_teams tt ON tt.id = s.team_id
     WHERE s.tournament_id = $1
     ORDER BY s.rank ASC`,
    [tournamentId]
  );
  if (!standingsResult.rows.length) {
    awardError(
      PRIZE_AWARD_ERR.FINAL_STANDINGS_MISSING,
      'Final standings snapshot is missing for this finalized tournament.',
      409
    );
  }

  const parsed = parseAndValidatePrizePositions(tournament.prize_positions);
  if (!parsed.ok) {
    awardError(parsed.code, parsed.message, 409);
  }

  const calculated = calculatePlacementAmounts(parsed.positions, tournament.prize_pool_amount);
  if (!calculated.ok) {
    awardError(calculated.code, calculated.message, 409);
  }

  const standingsByRank = new Map(standingsResult.rows.map((row) => [row.rank, row]));
  const toInsert = [];
  for (const award of calculated.awards) {
    const standing = standingsByRank.get(award.rank);
    if (!standing) {
      // Configured prize with no matching final standing — skip (do not invent a winner).
      continue;
    }
    const recipientUserId = standing.leader_user_id || null;
    const status = recipientUserId ? AWARD_STATUS.PENDING_PAYOUT : AWARD_STATUS.PENDING_RECIPIENT;
    toInsert.push({
      id: awardId(),
      tournament_id: tournamentId,
      final_standing_id: standing.id,
      team_id: standing.team_id,
      rank: award.rank,
      award_type: award.award_type,
      prize_amount: award.prize_amount,
      percentage: award.percentage,
      recipient_user_id: recipientUserId,
      status,
      team_name: standing.team_name,
    });
  }

  if (!toInsert.length) {
    awardError(
      PRIZE_AWARD_ERR.PRIZE_CONFIGURATION_INVALID,
      'No prize awards could be matched to final standings for the configured positions.',
      409
    );
  }

  for (const row of toInsert) {
    await client.query(
      `INSERT INTO tournament_prize_awards
         (id, tournament_id, final_standing_id, team_id, rank, award_type,
          prize_amount, percentage, recipient_user_id, status, generated_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())`,
      [
        row.id,
        row.tournament_id,
        row.final_standing_id,
        row.team_id,
        row.rank,
        row.award_type,
        row.prize_amount,
        row.percentage,
        row.recipient_user_id,
        row.status,
        actorId,
      ]
    );
  }

  const awards = await loadExistingAwards(client, tournamentId);
  const totalAwardAmount = awards.reduce((sum, a) => sum + a.prize_amount, 0);

  await client.query(
    `INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, details)
     VALUES ($1, $2, 'prize_awards_generated', 'prize_award', 'tournament', $3, $4)`,
    [
      logId(),
      actorId,
      tournamentId,
      JSON.stringify({
        tournament_id: tournamentId,
        award_count: awards.length,
        generated_by: actorId,
        generated_at: new Date().toISOString(),
        total_award_amount: totalAwardAmount,
        prize_pool_amount: calculated.pool,
        note: 'Configured prize obligations only; no funds moved; awards are not marked paid.',
      }),
    ]
  );

  return {
    alreadyGenerated: false,
    tournament_id: tournamentId,
    awards,
    award_count: awards.length,
    total_award_amount: totalAwardAmount,
  };
}
