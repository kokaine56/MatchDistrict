import { describe, it, expect } from 'vitest';
import { calculateMatchPoints, sortAndRank } from '../server/leaderboardService.js';

describe('Match Results & Scoring Engine', () => {

  const scoringRules = {
    kill_points_multiplier: 1,
    placement_points_map: {
      "1": 15,
      "2": 12,
      "3": 10,
      "4": 8,
      "5": 6
    },
    wwcd_bonus: 5
  };

  it('should calculate points correctly for WWCD', () => {
    const result = calculateMatchPoints(5, 1, scoringRules);
    
    // Kills = 5 * 1 = 5
    // Placement = 15
    // WWCD Bonus = 5
    // Total = 25
    
    expect(result.kill_points).toBe(5);
    expect(result.placement_points).toBe(15);
    expect(result.wwcd).toBe(true);
    expect(result.total_points).toBe(25);
  });

  it('should calculate points correctly for non-WWCD', () => {
    const result = calculateMatchPoints(3, 4, scoringRules);
    
    // Kills = 3 * 1 = 3
    // Placement = 8
    // WWCD Bonus = 0
    // Total = 11
    
    expect(result.kill_points).toBe(3);
    expect(result.placement_points).toBe(8);
    expect(result.wwcd).toBe(false);
    expect(result.total_points).toBe(11);
  });

  it('should rank teams using deterministic tiebreakers', () => {
    const rows = [
      { team_id: 'C', total_points: 10, total_kills: 2, wwcd_count: 0, best_placement: 4 },
      { team_id: 'A', total_points: 10, total_kills: 5, wwcd_count: 0, best_placement: 3 }, // More kills
      { team_id: 'B', total_points: 10, total_kills: 2, wwcd_count: 1, best_placement: 1 }, // WWCD wins over C despite same points/kills
      { team_id: 'D', total_points: 20, total_kills: 10, wwcd_count: 1, best_placement: 1 } // Highest points
    ];

    const ranked = sortAndRank(rows);
    
    expect(ranked[0].team_id).toBe('D'); // 20 pts
    expect(ranked[1].team_id).toBe('A'); // 10 pts, 5 kills
    expect(ranked[2].team_id).toBe('B'); // 10 pts, 2 kills, 1 WWCD
    expect(ranked[3].team_id).toBe('C'); // 10 pts, 2 kills, 0 WWCD
  });
});
