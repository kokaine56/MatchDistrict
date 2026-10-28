// src/utils/prizePool.js
// Switch to true to re-enable platform deductions in the prize allocation UI.
export const PLATFORM_FEE_ENABLED = false

// Utility to parse configured prize pool distribution from tournament metadata

export function getPrizePositions(meta) {
  if (!meta) return [];

  // 1. Exact manual position amounts take precedence.
  if (meta.prize_positions) {
    try {
      const raw =
        typeof meta.prize_positions === 'string'
          ? JSON.parse(meta.prize_positions)
          : meta.prize_positions;
      if (Array.isArray(raw) && raw.length > 0) {
        return raw.map((p, idx) => {
          const pct = p.percentage != null ? Number(p.percentage) : null;
          const configuredAmount = p.amount ?? p.prize_amount;
          return {
            rank: idx + 1,
            name: p.name || `Rank ${idx + 1}`,
            percentage: configuredAmount == null ? pct : null,
            prize_amount: configuredAmount == null || configuredAmount === '' ? null : Number(configuredAmount),
          };
        });
      }
    } catch {
      // Fallback below
    }
  }

  // Legacy tournaments may have fixed split values; never calculate from percentages.
  const splits = [];
  if (meta.prize_split_1st) {
    splits.push({
      rank: 1,
      name: '1st Place (Champion)',
      percentage: null,
      prize_amount: Number(meta.prize_split_1st) || null,
    });
  }
  if (meta.prize_split_2nd) {
    splits.push({
      rank: 2,
      name: '2nd Place (Runner-up)',
      percentage: null,
      prize_amount: Number(meta.prize_split_2nd) || null,
    });
  }
  if (meta.prize_split_3rd) {
    splits.push({
      rank: 3,
      name: '3rd Place',
      percentage: null,
      prize_amount: Number(meta.prize_split_3rd) || null,
    });
  }
  if (meta.prize_split_mvp) {
    splits.push({
      rank: 4,
      name: 'MVP / 4th Place',
      percentage: null,
      prize_amount: Number(meta.prize_split_mvp) || null,
    });
  }

  if (splits.length > 0) return splits;

  return [];
}
