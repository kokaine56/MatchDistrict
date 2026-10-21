// src/utils/prizePool.js
// Utility to parse configured prize pool distribution from tournament metadata

export function getPrizePositions(meta) {
  if (!meta) return [];

  // 1. If structured prize_positions JSON is available
  if (meta.prize_positions) {
    try {
      const raw =
        typeof meta.prize_positions === 'string'
          ? JSON.parse(meta.prize_positions)
          : meta.prize_positions;
      if (Array.isArray(raw) && raw.length > 0) {
        return raw.map((p, idx) => {
          const pool =
            Number(meta.prize_pool_amount) ||
            (meta.prize && !isNaN(Number(meta.prize)) ? Number(meta.prize) : 0);
          const pct = p.percentage != null ? Number(p.percentage) : null;
          let calculatedAmount =
            p.prize_amount != null ? Number(p.prize_amount) : null;
          if (calculatedAmount == null && pct != null && pool > 0) {
            calculatedAmount = Math.round((pct / 100) * pool);
          }
          return {
            rank: idx + 1,
            name: p.name || `Rank ${idx + 1}`,
            percentage: pct,
            prize_amount: calculatedAmount,
          };
        });
      }
    } catch {
      // Fallback below
    }
  }

  // 2. Fallback to individual splits (prize_split_1st, prize_split_2nd, prize_split_3rd, prize_split_mvp)
  const splits = [];
  const pool =
    Number(meta.prize_pool_amount) ||
    (meta.prize && !isNaN(Number(meta.prize)) ? Number(meta.prize) : 0);

  if (meta.prize_split_1st) {
    const pct = Number(meta.prize_split_1st);
    splits.push({
      rank: 1,
      name: '1st Place (Champion)',
      percentage: pct,
      prize_amount: pool ? Math.round((pct / 100) * pool) : null,
    });
  }
  if (meta.prize_split_2nd) {
    const pct = Number(meta.prize_split_2nd);
    splits.push({
      rank: 2,
      name: '2nd Place (Runner-up)',
      percentage: pct,
      prize_amount: pool ? Math.round((pct / 100) * pool) : null,
    });
  }
  if (meta.prize_split_3rd) {
    const pct = Number(meta.prize_split_3rd);
    splits.push({
      rank: 3,
      name: '3rd Place',
      percentage: pct,
      prize_amount: pool ? Math.round((pct / 100) * pool) : null,
    });
  }
  if (meta.prize_split_mvp) {
    const pct = Number(meta.prize_split_mvp);
    splits.push({
      rank: 4,
      name: 'MVP / 4th Place',
      percentage: pct,
      prize_amount: pool ? Math.round((pct / 100) * pool) : null,
    });
  }

  if (splits.length > 0) return splits;

  // 3. Fallback: default placement distribution
  return [
    {
      rank: 1,
      name: '1st Place (Champion)',
      percentage: 50,
      prize_amount: pool ? Math.round(pool * 0.5) : null,
    },
    {
      rank: 2,
      name: '2nd Place',
      percentage: 25,
      prize_amount: pool ? Math.round(pool * 0.25) : null,
    },
    {
      rank: 3,
      name: '3rd Place',
      percentage: 15,
      prize_amount: pool ? Math.round(pool * 0.15) : null,
    },
    {
      rank: 4,
      name: '4th Place',
      percentage: 10,
      prize_amount: pool ? Math.round(pool * 0.10) : null,
    },
  ];
}
