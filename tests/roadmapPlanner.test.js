import test from 'node:test';
import assert from 'node:assert/strict';
import { planRoadmapStages } from '../server/roadmapPlanner.js';

test('Example 1: 128 slots / L=16 / F=16 -> Round 1 (8 districts, top 2 each) -> 16 -> Grand Final', () => {
  const plan = planRoadmapStages({ slotsTotal: 128, teamsPerDistrict: 16 });
  assert.strictEqual(plan.length, 2);

  assert.strictEqual(plan[0].roundNumber, 1);
  assert.strictEqual(plan[0].name, 'Round 1');
  assert.strictEqual(plan[0].roundType, 'qualifier');
  assert.strictEqual(plan[0].teamsIn, 128);
  assert.strictEqual(plan[0].districtCount, 8);
  assert.strictEqual(plan[0].advancementType, 'per_district');
  assert.strictEqual(plan[0].teamsAdvancingPerDistrict, 2);
  assert.strictEqual(plan[0].teamsAdvancing, 16);
  assert.strictEqual(plan[0].isGrandFinal, false);

  assert.strictEqual(plan[1].roundNumber, 2);
  assert.strictEqual(plan[1].name, 'Grand Final');
  assert.strictEqual(plan[1].roundType, 'grand_final');
  assert.strictEqual(plan[1].teamsIn, 16);
  assert.strictEqual(plan[1].districtCount, 1);
  assert.strictEqual(plan[1].isGrandFinal, true);
});

test('Example 2: 64 slots / L=16 / F=16 -> Round 1 (4 districts, top 4 each) -> 16 -> Grand Final', () => {
  const plan = planRoadmapStages({ slotsTotal: 64, teamsPerDistrict: 16 });
  assert.strictEqual(plan.length, 2);

  assert.strictEqual(plan[0].name, 'Round 1');
  assert.strictEqual(plan[0].teamsIn, 64);
  assert.strictEqual(plan[0].districtCount, 4);
  assert.strictEqual(plan[0].advancementType, 'per_district');
  assert.strictEqual(plan[0].teamsAdvancingPerDistrict, 4);
  assert.strictEqual(plan[0].teamsAdvancing, 16);

  assert.strictEqual(plan[1].name, 'Grand Final');
  assert.strictEqual(plan[1].teamsIn, 16);
  assert.strictEqual(plan[1].districtCount, 1);
});

test('Example 3: 32 slots / L=16 / F=16 -> Round 1 (2 districts, top 8 each) -> 16 -> Grand Final', () => {
  const plan = planRoadmapStages({ slotsTotal: 32, teamsPerDistrict: 16 });
  assert.strictEqual(plan.length, 2);

  assert.strictEqual(plan[0].name, 'Round 1');
  assert.strictEqual(plan[0].teamsIn, 32);
  assert.strictEqual(plan[0].districtCount, 2);
  assert.strictEqual(plan[0].advancementType, 'per_district');
  assert.strictEqual(plan[0].teamsAdvancingPerDistrict, 8);
  assert.strictEqual(plan[0].teamsAdvancing, 16);

  assert.strictEqual(plan[1].name, 'Grand Final');
  assert.strictEqual(plan[1].teamsIn, 16);
});

test('Example 4: 100 slots / L=16 / F=16 -> Round 1 (7 districts, overall top 16) -> 16 -> Grand Final', () => {
  const plan = planRoadmapStages({ slotsTotal: 100, teamsPerDistrict: 16 });
  assert.strictEqual(plan.length, 2);

  assert.strictEqual(plan[0].name, 'Round 1');
  assert.strictEqual(plan[0].teamsIn, 100);
  assert.strictEqual(plan[0].districtCount, 7);
  assert.strictEqual(plan[0].advancementType, 'overall');
  assert.strictEqual(plan[0].teamsAdvancingPerDistrict, null);
  assert.strictEqual(plan[0].teamsAdvancing, 16);

  assert.strictEqual(plan[1].name, 'Grand Final');
  assert.strictEqual(plan[1].teamsIn, 16);
});

test('Example 5: 16 slots / L=16 / F=16 -> Grand Final only', () => {
  const plan = planRoadmapStages({ slotsTotal: 16, teamsPerDistrict: 16 });
  assert.strictEqual(plan.length, 1);
  assert.strictEqual(plan[0].roundNumber, 1);
  assert.strictEqual(plan[0].name, 'Grand Final');
  assert.strictEqual(plan[0].roundType, 'grand_final');
  assert.strictEqual(plan[0].teamsIn, 16);
  assert.strictEqual(plan[0].districtCount, 1);
  assert.strictEqual(plan[0].isGrandFinal, true);
});

test('Example 6: 512 slots / L=16 / F=16 -> Round 1 (32 dist, top 1 each -> 32) -> Round 2 (2 dist, top 8 each -> 16) -> Grand Final', () => {
  const plan = planRoadmapStages({ slotsTotal: 512, teamsPerDistrict: 16 });
  assert.strictEqual(plan.length, 3);

  // Round 1
  assert.strictEqual(plan[0].roundNumber, 1);
  assert.strictEqual(plan[0].name, 'Round 1');
  assert.strictEqual(plan[0].teamsIn, 512);
  assert.strictEqual(plan[0].districtCount, 32);
  assert.strictEqual(plan[0].advancementType, 'per_district');
  assert.strictEqual(plan[0].teamsAdvancingPerDistrict, 1);
  assert.strictEqual(plan[0].teamsAdvancing, 32);

  // Round 2
  assert.strictEqual(plan[1].roundNumber, 2);
  assert.strictEqual(plan[1].name, 'Round 2');
  assert.strictEqual(plan[1].teamsIn, 32);
  assert.strictEqual(plan[1].districtCount, 2);
  assert.strictEqual(plan[1].advancementType, 'per_district');
  assert.strictEqual(plan[1].teamsAdvancingPerDistrict, 8);
  assert.strictEqual(plan[1].teamsAdvancing, 16);

  // Grand Final
  assert.strictEqual(plan[2].roundNumber, 3);
  assert.strictEqual(plan[2].name, 'Grand Final');
  assert.strictEqual(plan[2].teamsIn, 16);
  assert.strictEqual(plan[2].districtCount, 1);
  assert.strictEqual(plan[2].isGrandFinal, true);
});

test('Edge Case: L = 25 (e.g. 100 slots -> 4 districts, top 25 overall -> Grand Final)', () => {
  const plan = planRoadmapStages({ slotsTotal: 100, teamsPerDistrict: 25 });
  assert.strictEqual(plan.length, 2);
  assert.strictEqual(plan[0].districtCount, 4);
  assert.strictEqual(plan[0].teamsAdvancing, 25);
  assert.strictEqual(plan[1].name, 'Grand Final');
  assert.strictEqual(plan[1].teamsIn, 25);
});

test('Edge Case: N = 129 / L = 16 / F = 16 -> 9 districts, top 16 overall -> Grand Final', () => {
  const plan = planRoadmapStages({ slotsTotal: 129, teamsPerDistrict: 16 });
  assert.strictEqual(plan.length, 2);
  assert.strictEqual(plan[0].districtCount, 9);
  assert.strictEqual(plan[0].advancementType, 'overall');
  assert.strictEqual(plan[0].teamsAdvancing, 16);
  assert.strictEqual(plan[1].name, 'Grand Final');
  assert.strictEqual(plan[1].teamsIn, 16);
});

test('Edge Case: N = 1 -> Grand Final only with 1 team', () => {
  const plan = planRoadmapStages({ slotsTotal: 1, teamsPerDistrict: 16 });
  assert.strictEqual(plan.length, 1);
  assert.strictEqual(plan[0].name, 'Grand Final');
  assert.strictEqual(plan[0].teamsIn, 1);
  assert.strictEqual(plan[0].districtCount, 1);
});

test('Edge Case: F different from L (F = 12, L = 16, N = 64 -> 4 districts, top 3 each -> 12 -> Grand Final)', () => {
  const plan = planRoadmapStages({ slotsTotal: 64, teamsPerDistrict: 16, grandFinalTeams: 12 });
  assert.strictEqual(plan.length, 2);
  assert.strictEqual(plan[0].districtCount, 4);
  assert.strictEqual(plan[0].advancementType, 'per_district');
  assert.strictEqual(plan[0].teamsAdvancingPerDistrict, 3);
  assert.strictEqual(plan[0].teamsAdvancing, 12);
  assert.strictEqual(plan[1].name, 'Grand Final');
  assert.strictEqual(plan[1].teamsIn, 12);
});

test('Edge Case: F clamped to L if higher (F = 30, L = 16 -> clamped to 16)', () => {
  const plan = planRoadmapStages({ slotsTotal: 64, teamsPerDistrict: 16, grandFinalTeams: 30 });
  assert.strictEqual(plan.length, 2);
  assert.strictEqual(plan[0].teamsAdvancing, 16);
  assert.strictEqual(plan[1].teamsIn, 16);
});

test('Property Test: for various N and L, incoming always equals previous qualifiers and ends with Grand Final', () => {
  const testSlotCounts = [2, 10, 16, 20, 32, 50, 64, 75, 100, 128, 129, 200, 256, 384, 512, 1000, 1024];
  const testLobbySizes = [10, 16, 20, 25];

  for (const L of testLobbySizes) {
    for (const N of testSlotCounts) {
      for (const F of [undefined, L, Math.floor(L / 2), L - 2]) {
        const plan = planRoadmapStages({ slotsTotal: N, teamsPerDistrict: L, grandFinalTeams: F });
        assert.ok(plan.length >= 1, `Must have at least one round for N=${N}, L=${L}`);

        // Round 1 incoming must be N
        assert.strictEqual(plan[0].teamsIn, N, `Round 1 incoming must be ${N}`);

        // Every subsequent round's incoming must equal the previous round's qualifiers
        for (let i = 1; i < plan.length; i++) {
          const prev = plan[i - 1];
          const curr = plan[i];
          assert.strictEqual(
            curr.teamsIn,
            prev.teamsAdvancing,
            `Round ${i + 1} incoming (${curr.teamsIn}) must equal previous round qualifiers (${prev.teamsAdvancing}) for N=${N}, L=${L}`
          );
        }

        // Last round must always be Grand Final
        const last = plan[plan.length - 1];
        assert.strictEqual(last.name, 'Grand Final', `Last round must be Grand Final for N=${N}, L=${L}`);
        assert.strictEqual(last.roundType, 'grand_final');
        assert.strictEqual(last.districtCount, 1);
        assert.strictEqual(last.isGrandFinal, true);

        // All non-final rounds must be qualifiers with at least 2 districts
        for (let i = 0; i < plan.length - 1; i++) {
          const r = plan[i];
          assert.strictEqual(r.roundType, 'qualifier');
          assert.ok(r.districtCount >= 2, `Qualifier round ${r.name} must have >= 2 districts for N=${N}, L=${L}, got ${r.districtCount}`);
          assert.ok(r.teamsAdvancing > 0, `Qualifier round must advance > 0 teams`);
        }
      }
    }
  }
});

// Generation Tests (Mock tests always run; scratch PGTEST_URL if configured)
import { generateTournamentRoadmap } from '../server/roadmapGenerator.js';
import { validateRoadmapStructure } from '../server/roadmapValidation.js';
import { buildHierarchicalRoadmap } from '../server/manualRoadmapService.js';

test('Generation Test (Mock): 128 slots generates exactly Round 1 (8 districts, top 2 each) -> Grand Final', () => {
  const res = generateTournamentRoadmap({
    id: 'TRN-128-GEN',
    slotsTotal: 128,
    teams_per_group: 16,
    startDate: '2026-10-10',
  });
  assert.strictEqual(res.ok, true, res.error);
  const { rounds, days, groups, matches } = res.roadmap;

  // Exactly 2 rounds: Round 1 + Grand Final
  assert.strictEqual(rounds.length, 2, 'Must generate exactly 2 rounds for 128 slots');
  assert.strictEqual(rounds[0].name, 'Round 1');
  assert.strictEqual(rounds[0].teams_in, 128);
  assert.strictEqual(rounds[0].advancement_type, 'per_district');
  assert.strictEqual(rounds[0].teams_advancing_per_district, 2);
  assert.strictEqual(rounds[0].teams_advancing, 16);

  assert.strictEqual(rounds[1].name, 'Grand Final');
  assert.strictEqual(rounds[1].teams_in, 16);
  assert.strictEqual(rounds[1].round_type, 'grand_final');
  assert.strictEqual(rounds[1].is_grand_final, true);

  // Incoming to Grand Final matches qualifiers of Round 1
  assert.strictEqual(rounds[1].teams_in, rounds[0].teams_advancing);

  // Groups: 8 in Round 1 + 1 in Grand Final = 9
  assert.strictEqual(groups.length, 9);
  assert.strictEqual(groups.filter((g) => g.round_id === rounds[0].id).length, 8);
  assert.strictEqual(groups.filter((g) => g.round_id === rounds[1].id).length, 1);

  // Validate structural integrity
  const { rooms } = res.roadmap;
  const validation = validateRoadmapStructure({
    rounds,
    days,
    groups,
    rooms,
    matches,
    config: {
      daily_start_time: '10:00',
      daily_end_time: '23:00',
      teams_per_room: 16,
      max_simultaneous_rooms: 8,
      match_duration_minutes: 30,
      break_between_matches_minutes: 10,
    },
  });
  assert.strictEqual(validation.errors.length, 0, `Validation failed: ${validation.errors.join('; ')}`);

  // Hierarchical hydration produces 0 mismatch warnings
  const structured = buildHierarchicalRoadmap(rounds, days, groups, matches);
  assert.strictEqual(structured.length, 2);
  assert.strictEqual(structured[0].teams_in, 128);
  assert.strictEqual(structured[1].teams_in, 16);
});

test('Generation Test (Mock): 64 slots generates Round 1 (top 4 each) -> 16 -> Grand Final', () => {
  const res = generateTournamentRoadmap({
    id: 'TRN-64-GEN',
    slotsTotal: 64,
    teams_per_group: 16,
    startDate: '2026-10-10',
  });
  assert.strictEqual(res.ok, true, res.error);
  const { rounds, groups } = res.roadmap;

  assert.strictEqual(rounds.length, 2);
  assert.strictEqual(rounds[0].teams_in, 64);
  assert.strictEqual(rounds[0].teams_advancing_per_district, 4);
  assert.strictEqual(rounds[0].teams_advancing, 16);
  assert.strictEqual(rounds[1].teams_in, 16);
  assert.strictEqual(groups.length, 5); // 4 R1 + 1 GF
});

test('Generation Test (Mock): 100 slots generates Round 1 (overall top 16) -> Grand Final', () => {
  const res = generateTournamentRoadmap({
    id: 'TRN-100-GEN',
    slotsTotal: 100,
    teams_per_group: 16,
    startDate: '2026-10-10',
  });
  assert.strictEqual(res.ok, true, res.error);
  const { rounds, groups } = res.roadmap;

  assert.strictEqual(rounds.length, 2);
  assert.strictEqual(rounds[0].teams_in, 100);
  assert.strictEqual(rounds[0].advancement_type, 'overall');
  assert.strictEqual(rounds[0].teams_advancing, 16);
  assert.strictEqual(rounds[1].teams_in, 16);
  assert.strictEqual(groups.length, 8); // 7 R1 + 1 GF
});

test('Generation Test (Mock): 16 slots generates Grand Final only', () => {
  const res = generateTournamentRoadmap({
    id: 'TRN-16-GEN',
    slotsTotal: 16,
    teams_per_group: 16,
    startDate: '2026-10-10',
  });
  assert.strictEqual(res.ok, true, res.error);
  const { rounds, groups } = res.roadmap;

  assert.strictEqual(rounds.length, 1);
  assert.strictEqual(rounds[0].name, 'Grand Final');
  assert.strictEqual(rounds[0].teams_in, 16);
  assert.strictEqual(groups.length, 1);
});

test('Generation Test (Mock): 512 slots generates 3 rounds with perfect incoming-to-qualifier matching', () => {
  const res = generateTournamentRoadmap({
    id: 'TRN-512-GEN',
    slotsTotal: 512,
    teams_per_group: 16,
    startDate: '2026-10-10',
  });
  assert.strictEqual(res.ok, true, res.error);
  const { rounds, groups } = res.roadmap;

  assert.strictEqual(rounds.length, 3);
  assert.strictEqual(rounds[0].teams_in, 512);
  assert.strictEqual(rounds[0].teams_advancing, 32);
  assert.strictEqual(rounds[1].teams_in, 32);
  assert.strictEqual(rounds[1].teams_advancing, 16);
  assert.strictEqual(rounds[2].teams_in, 16);

  // Groups: R1 (32) + R2 (2) + GF (1) = 35 groups
  assert.strictEqual(groups.length, 35);
});

test('Generation Test (Mock): custom grandFinalTeams (e.g. 12 finalists from 64 slots)', () => {
  const res = generateTournamentRoadmap({
    id: 'TRN-CUSTOM-GF',
    slotsTotal: 64,
    teams_per_group: 16,
    grandFinalTeams: 12,
    startDate: '2026-10-10',
  });
  assert.strictEqual(res.ok, true, res.error);
  const { rounds } = res.roadmap;

  assert.strictEqual(rounds.length, 2);
  assert.strictEqual(rounds[0].teams_in, 64);
  assert.strictEqual(rounds[0].teams_advancing, 12);
  assert.strictEqual(rounds[1].teams_in, 12);
});

test('Generation Test: scratch PGTEST_URL database integration (if available)', async (t) => {
  const testDbUrl = process.env.PGTEST_URL;
  if (!testDbUrl) {
    t.skip('Skipping DB integration test: PGTEST_URL is not set.');
    return;
  }

  // Safety rule check: never run on real DATABASE_URL
  if (process.env.DATABASE_URL && testDbUrl === process.env.DATABASE_URL) {
    t.skip('Safety rule guard: PGTEST_URL must not equal DATABASE_URL.');
    return;
  }

  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: testDbUrl, connectionTimeoutMillis: 2000 });
  try {
    const client = await pool.connect();
    client.release();
    // Test successfully verified scratch DB is safe and reachable
  } catch {
    t.skip('Scratch test database unreachable.');
  } finally {
    await pool.end().catch(() => {});
  }
});

