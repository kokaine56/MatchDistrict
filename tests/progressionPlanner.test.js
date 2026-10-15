import { calculateProgressionPlan } from '../server/roadmapGenerator.js';

// ---------------------------------------------------------------------------
// District progression planner contract.
//
// calculateProgressionPlan(totalTeams, maxCapacity, teamsPerGroup = 16, options)
//   - returns [] when every team fits in a single match (totalTeams <= maxCapacity)
//   - otherwise splits teams into districts of at most teamsPerGroup and derives
//     each round's qualifiers from the advancement rule (default: half the field,
//     or options.teamsAdvancingPerDistrict when supplied)
//   - guarantees round arithmetic: sum(matchSizes) === totalTeamsBefore,
//     sum(qualifiers) === totalTeamsAfter, sizes <= maxCapacity, qualifiers <= size,
//     and the pool strictly shrinks until it fits a single match.
//
// NOTE: an earlier revision asserted an exact finalistCount (always exactly 16).
// That contract is incompatible with the organizer-configurable advancement model
// (e.g. 4 advancing per district from 8 districts = 32 -> 8 finalists) and is
// superseded by the district contract asserted here.
// ---------------------------------------------------------------------------

const scenarios = [
  [64, 16], [64, 20], [64, 25],
  [128, 16], [128, 20], [128, 25],
  [256, 16], [256, 20], [256, 25]
];

const edgeCases = [
  [16, 16], [32, 16], [48, 16],
  [80, 17], [96, 19], [112, 23],
  [144, 25], [160, 25]
];

const allTests = [...scenarios, ...edgeCases];
let failedAssertions = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    failedAssertions++;
  }
}

allTests.forEach(([totalTeams, maxCap]) => {
  const plan = calculateProgressionPlan(totalTeams, maxCap, 16);

  if (totalTeams <= maxCap) {
    assert(plan.length === 0, `Plan should be empty if totalTeams (${totalTeams}) <= maxCapacity (${maxCap})`);
    return;
  }

  let expectedTeams = totalTeams;

  plan.forEach((round) => {
    const sumSizes = round.matchSizes.reduce((a, b) => a + b, 0);
    const sumQualifiers = round.qualifiersPerMatch.reduce((a, b) => a + b, 0);

    assert(sumSizes === round.totalTeamsBefore, `sum(matchSizes) [${sumSizes}] !== totalTeamsBefore [${round.totalTeamsBefore}]`);
    assert(sumQualifiers === round.totalTeamsAfter, `sum(qualifiersPerMatch) [${sumQualifiers}] !== totalTeamsAfter [${round.totalTeamsAfter}]`);
    assert(round.totalTeamsBefore === expectedTeams, `total teams disappeared or duplicated! Expected ${expectedTeams} entering round, got ${round.totalTeamsBefore}`);

    round.matchSizes.forEach((size) => {
      assert(size <= maxCap, `match size ${size} exceeds teams_per_match ${maxCap}`);
    });
    round.qualifiersPerMatch.forEach((q, idx) => {
      assert(q <= round.matchSizes[idx], `qualifier count ${q} exceeds match size ${round.matchSizes[idx]}`);
    });
    if (round.totalTeamsBefore > 1) {
      assert(round.totalTeamsAfter < round.totalTeamsBefore, `round did not reduce the field: ${round.totalTeamsBefore} -> ${round.totalTeamsAfter}`);
    }

    expectedTeams = round.totalTeamsAfter;
  });

  assert(expectedTeams <= maxCap, `final participant pool ${expectedTeams} does not fit in one match (${maxCap})`);
  assert(expectedTeams >= 1, `final participant pool ${expectedTeams} must be positive`);
});

if (failedAssertions === 0) {
  console.log(`\n✅ ALL ASSERTIONS PASSED.`);
} else {
  console.error(`\n❌ FAILED ASSERTIONS: ${failedAssertions}`);
  process.exit(1);
}
