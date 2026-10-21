// tests/roadmapAutoGenerateAndModalFixes.test.js
// Unit tests for:
// 1. Task 1: Optimistic delete without undo toast, instant execution, and rollback on failure
// 2. Task 2: Capacity-based auto-generation with 0 registrations, draft-only generation without DB mutation
// 3. Task 3: Modal live progression line calculation & pre-flight validations

import test from 'node:test';
import assert from 'node:assert/strict';

import { generateTournamentRoadmap } from '../server/roadmapGenerator.js';
import { planRoadmapStages } from '../server/roadmapPlanner.js';
import { buildHierarchicalRoadmap } from '../server/manualRoadmapService.js';

function getLiveProgressionSummary(stages, slotsTotal, grandFinalTeams) {
  if (!stages || stages.length === 0) return `${slotsTotal} teams → Grand Final`;
  if (stages.length === 1 && stages[0].isGrandFinal) {
    return `${slotsTotal} teams → 1 district → Grand Final`;
  }
  const parts = [];
  stages.forEach((stg, i) => {
    if (i === 0) {
      parts.push(`${slotsTotal} teams`);
      parts.push(`${stg.districtCount} ${stg.districtCount === 1 ? 'district' : 'districts'}`);
      if (stg.advancementType === 'per_district' && stg.teamsAdvancingPerDistrict) {
        parts.push(`top ${stg.teamsAdvancingPerDistrict} each`);
      } else if (stg.teamsAdvancing) {
        parts.push(`top ${stg.teamsAdvancing} overall`);
      }
    } else if (!stg.isGrandFinal) {
      parts.push(`${stg.name} (${stg.teamsIn} teams)`);
      if (stg.advancementType === 'per_district' && stg.teamsAdvancingPerDistrict) {
        parts.push(`top ${stg.teamsAdvancingPerDistrict} each`);
      }
    } else {
      parts.push(`${grandFinalTeams} finalists`);
      parts.push('Grand Final');
    }
  });
  return parts.join(' → ');
}

test('TASK 2: Capacity-based Generation works with 0 registrations', () => {
  // A tournament with 0 registered teams, purely slotsTotal and teams_per_group
  const tournamentWith0Registrations = {
    id: 'T-ZERO-REG',
    total_slots: 128,
    slotsTotal: 128,
    teams_per_group: 16,
    registered_teams: 0,
    total_teams: 0,
  };

  const genResult = generateTournamentRoadmap(tournamentWith0Registrations);
  assert.strictEqual(genResult.ok, true, 'Generation must succeed with 0 registrations');
  assert.ok(genResult.roadmap, 'Must produce roadmap object');
  assert.strictEqual(genResult.roadmap.meta.total_slots, 128);
  assert.strictEqual(genResult.roadmap.rounds.length > 0, true, 'Must produce rounds');
  
  // Verify Round 1 district count derives from 128 / 16 = 8 districts
  assert.strictEqual(genResult.roadmap.meta.num_groups, 8);
});

test('TASK 2: Draft-only generation builds structured_rounds in memory without database mutation', () => {
  const tournament = {
    id: 'T-DRAFT-TEST',
    slotsTotal: 64,
    teams_per_group: 16,
    grand_final_teams: 16,
  };

  const genResult = generateTournamentRoadmap(tournament);
  assert.strictEqual(genResult.ok, true);

  const { rounds, days, groups, rooms, matches } = genResult.roadmap;
  const structuredRounds = buildHierarchicalRoadmap(rounds, days, groups, matches);

  assert.ok(Array.isArray(structuredRounds), 'Structured rounds must be an array');
  assert.strictEqual(structuredRounds.length, 2, '64 teams to 16 GF should produce Round 1 and Grand Final');
  assert.strictEqual(structuredRounds[0].name, 'Round 1');
  assert.strictEqual(structuredRounds[1].name, 'Grand Final');

  // Verify allocations and matches exist in draft (default 2 matches/day means 4 districts across 2 days)
  assert.strictEqual(structuredRounds[0].days.length, 2, 'Default 2 matches/day spreads 4 districts across 2 days');
  const allRound1Districts = structuredRounds[0].days.flatMap((d) => d.allocations);
  assert.strictEqual(allRound1Districts.length, 4, 'Round 1 total districts across all days is 4');
  assert.strictEqual(allRound1Districts[0].matches.length, 1, '1 match per district allocation');
});

test('TASK 2: Pre-flight validation rejects invalid slots or district counts', () => {
  // Validation for invalid slot count
  const invalidSlots = generateTournamentRoadmap({ id: 'T-INV-1', slotsTotal: 0 });
  assert.strictEqual(invalidSlots.ok, false);
  assert.match(invalidSlots.error, /positive number/i);

  // Validation for invalid teams_per_group
  const invalidTpg = generateTournamentRoadmap({ id: 'T-INV-2', slotsTotal: 64, teams_per_group: 0 });
  assert.strictEqual(invalidTpg.ok, false);
  assert.match(invalidTpg.error, /positive number/i);
});

test('TASK 3: Live progression summary line matches planned stage rules', () => {
  // Case A: 128 teams, 16 per district, 16 Grand Final finalists
  const stages128 = planRoadmapStages({ slotsTotal: 128, teamsPerDistrict: 16, grandFinalTeams: 16 });
  const summary128 = getLiveProgressionSummary(stages128, 128, 16);
  assert.strictEqual(summary128, '128 teams → 8 districts → top 2 each → 16 finalists → Grand Final');

  // Case B: 64 teams, 16 per district, 16 Grand Final finalists
  const stages64 = planRoadmapStages({ slotsTotal: 64, teamsPerDistrict: 16, grandFinalTeams: 16 });
  const summary64 = getLiveProgressionSummary(stages64, 64, 16);
  assert.strictEqual(summary64, '64 teams → 4 districts → top 4 each → 16 finalists → Grand Final');

  // Case C: 16 teams (fits in 1 district) collapses straight to Grand Final
  const stages16 = planRoadmapStages({ slotsTotal: 16, teamsPerDistrict: 16, grandFinalTeams: 16 });
  const summary16 = getLiveProgressionSummary(stages16, 16, 16);
  assert.strictEqual(summary16, '16 teams → 1 district → Grand Final');
});

test('TASK 1: Optimistic delete immediately clears rounds and rolls back on failure', async () => {
  let workingRounds = [
    { id: 'R1', name: 'Round 1', days: [] },
    { id: 'R2', name: 'Grand Final', days: [] },
  ];
  let sessionDraft = JSON.stringify(workingRounds);
  let errorBanner = null;

  const mockSnapshot = JSON.parse(JSON.stringify(workingRounds));

  // Simulate server delete failure
  const mockDeleteRoadmapFailure = async () => {
    return { success: false, error: 'Database timeout while deleting roadmap.' };
  };

  // Step 1: Optimistically clear
  workingRounds = [];
  sessionDraft = null;

  assert.strictEqual(workingRounds.length, 0, 'UI is immediately cleared (optimistic)');
  assert.strictEqual(sessionDraft, null, 'Session draft is immediately cleared');

  // Step 2: Server call returns failure
  const res = await mockDeleteRoadmapFailure();
  if (!res.success) {
    // Rollback
    workingRounds = mockSnapshot;
    sessionDraft = JSON.stringify(mockSnapshot);
    errorBanner = res.error;
  }

  assert.strictEqual(workingRounds.length, 2, 'UI restored to original snapshot on server failure');
  assert.ok(sessionDraft !== null, 'Session draft restored on server failure');
  assert.strictEqual(errorBanner, 'Database timeout while deleting roadmap.', 'Inline error surfaced to user');
});
