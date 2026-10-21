/**
 * Pure tournament roadmap progression planner.
 *
 * Implements deterministic progression planning from slot count (N),
 * teams per district / lobby capacity (L), and Grand Final capacity (F).
 *
 * Rules:
 * 1. Inputs: N = slotsTotal, L = teams per district (default 16), F = teams in Grand Final (default L, <= L).
 * 2. If N <= F: plan is only a Grand Final. No qualifier rounds.
 * 3. Otherwise build qualifier rounds until remaining teams equal F:
 *    - districts d = ceil(teams / L)
 *    - if Round 1 has custom teamsAdvancingPerDistrict: advance d * teamsAdvancingPerDistrict.
 *      If advancing teams > F, add an intermediate round so Grand Final always has 1 lobby.
 *    - choose q = max(1, ceil(F / d))
 *    - if d * q == F: rule = per_district with top q, next round has F teams, stop
 *    - if d * q > F and d <= F: rule = overall with top F, next round has F teams, stop
 *    - if d > F: rule = per_district top 1, next round has d teams, repeat
 * 4. Each round's incoming teams is always taken from previous round's qualifier count.
 *    Never create a qualifier round with exactly 1 district (that is the Grand Final).
 * 5. Round names: "Round 1", "Round 2"... and "Grand Final".
 * 6. Grand Final is always 1 lobby (districtCount: 1).
 */

export function planRoadmapStages({
  slotsTotal,
  teamsPerDistrict = 16,
  grandFinalTeams,
  teamsAdvancingPerDistrict,
} = {}) {
  const N = Math.max(1, parseInt(slotsTotal, 10) || 16);
  const L = Math.max(2, parseInt(teamsPerDistrict, 10) || 16);

  const rawF = (grandFinalTeams !== undefined && grandFinalTeams !== null && grandFinalTeams !== '')
    ? parseInt(grandFinalTeams, 10)
    : L;
  const F = Math.min(L, Math.max(2, Number.isFinite(rawF) ? rawF : L));

  // If total slots fit in or equal Grand Final capacity: Grand Final only
  if (N <= F) {
    return [
      {
        roundNumber: 1,
        name: 'Grand Final',
        roundType: 'grand_final',
        teamsIn: N,
        districtCount: 1,
        advancementType: null,
        teamsAdvancingPerDistrict: null,
        teamsAdvancing: null,
        isGrandFinal: true,
      },
    ];
  }

  const rounds = [];
  let currentTeams = N;
  let roundNumber = 1;
  const customAdv = (teamsAdvancingPerDistrict !== undefined && teamsAdvancingPerDistrict !== null && teamsAdvancingPerDistrict !== '')
    ? Math.max(1, Math.min(L, parseInt(teamsAdvancingPerDistrict, 10)))
    : null;

  while (currentTeams > F) {
    const d = Math.ceil(currentTeams / L);

    // Rule 4: Never create a qualifier round with 1 district
    if (d <= 1) {
      break;
    }

    // If Round 1 has an explicit advancement override from organizer (e.g. top 4 each)
    if (roundNumber === 1 && customAdv != null) {
      const advTotal = d * customAdv;
      if (advTotal <= F) {
        rounds.push({
          roundNumber,
          name: `Round ${roundNumber}`,
          roundType: 'qualifier',
          teamsIn: currentTeams,
          districtCount: d,
          advancementType: 'per_district',
          teamsAdvancingPerDistrict: customAdv,
          teamsAdvancing: advTotal,
          isGrandFinal: false,
        });
        currentTeams = advTotal;
        roundNumber++;
        break;
      } else {
        // Exceeds Grand Final size F (e.g. 128 teams, 8 districts, top 4 each = 32 teams > 16)
        // MUST add an intermediate round so Grand Final stays exactly 1 lobby!
        rounds.push({
          roundNumber,
          name: `Round ${roundNumber}`,
          roundType: 'qualifier',
          teamsIn: currentTeams,
          districtCount: d,
          advancementType: 'per_district',
          teamsAdvancingPerDistrict: customAdv,
          teamsAdvancing: advTotal,
          isGrandFinal: false,
        });
        currentTeams = advTotal;
        roundNumber++;
        continue;
      }
    }

    const q = Math.max(1, Math.ceil(F / d));

    if (d * q === F) {
      // Branch A: Exact per-district split reaches F
      rounds.push({
        roundNumber,
        name: `Round ${roundNumber}`,
        roundType: 'qualifier',
        teamsIn: currentTeams,
        districtCount: d,
        advancementType: 'per_district',
        teamsAdvancingPerDistrict: q,
        teamsAdvancing: F,
        isGrandFinal: false,
      });
      currentTeams = F;
      roundNumber++;
      break;
    } else if (d * q > F && d <= F) {
      // Branch B: d <= F but d * q > F -> advance top F overall across all districts
      rounds.push({
        roundNumber,
        name: `Round ${roundNumber}`,
        roundType: 'qualifier',
        teamsIn: currentTeams,
        districtCount: d,
        advancementType: 'overall',
        teamsAdvancingPerDistrict: null,
        teamsAdvancing: F,
        isGrandFinal: false,
      });
      currentTeams = F;
      roundNumber++;
      break;
    } else {
      // Branch C: d > F -> advance top 1 per district, next round has d teams
      rounds.push({
        roundNumber,
        name: `Round ${roundNumber}`,
        roundType: 'qualifier',
        teamsIn: currentTeams,
        districtCount: d,
        advancementType: 'per_district',
        teamsAdvancingPerDistrict: 1,
        teamsAdvancing: d,
        isGrandFinal: false,
      });
      currentTeams = d;
      roundNumber++;
    }
  }

  // Terminal round is always the Grand Final (always districtCount: 1 when currentTeams <= F)
  rounds.push({
    roundNumber,
    name: 'Grand Final',
    roundType: 'grand_final',
    teamsIn: currentTeams,
    districtCount: 1,
    advancementType: null,
    teamsAdvancingPerDistrict: null,
    teamsAdvancing: null,
    isGrandFinal: true,
  });

  return rounds;
}
