import { calculateProgressionPlan } from '../server/roadmapGenerator.js';

// ---------------------------------------------------------------------------
// District progression planner — capacity/edge scenarios.
// See progressionPlanner.test.js for the contract description.
// ---------------------------------------------------------------------------

const scenarios = [
  [64, 25], [128, 25], [256, 25],
  [20, 25], [23, 25], [24, 25], [25, 25],
  [20, 20], [16, 16]
];

let failedAssertions = 0;
function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    failedAssertions++;
  }
}

scenarios.forEach(([totalTeams, maxCap]) => {
  const plan = calculateProgressionPlan(totalTeams, maxCap);

  if (totalTeams <= maxCap) {
    assert(plan.length === 0, `Plan should be empty if totalTeams (${totalTeams}) <= maxCapacity (${maxCap})`);
    return;
  }

  let expectedTeams = totalTeams;

  plan.forEach((round) => {
    assert(round.matchSizes.every((s) => s <= maxCap), `Round ${round.roundNumber} has a match larger than ${maxCap}`);
    assert(round.qualifiersPerMatch.every((q, i) => q <= round.matchSizes[i]), `Round ${round.roundNumber} qualifies more than it holds`);
    const sumSizes = round.matchSizes.reduce((a, b) => a + b, 0);
    const sumQualifiers = round.qualifiersPerMatch.reduce((a, b) => a + b, 0);
    assert(sumSizes === round.totalTeamsBefore, 'Round size sum must equal the entering pool');
    assert(sumQualifiers === round.totalTeamsAfter, 'Round qualifier sum must equal the advancing pool');
    assert(round.totalTeamsBefore === expectedTeams, 'Rounds must chain without losing or duplicating teams');
    expectedTeams = round.totalTeamsAfter;
  });

  assert(expectedTeams <= maxCap, `final participant pool ${expectedTeams} exceeds maxCap ${maxCap}`);
  assert(expectedTeams >= 1, `final participant pool ${expectedTeams} must be positive`);
});

if (failedAssertions === 0) {
  console.log(`\n✅ ALL ASSERTIONS PASSED.`);
} else {
  console.error(`\n❌ FAILED ASSERTIONS: ${failedAssertions}`);
  process.exit(1);
}
