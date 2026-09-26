import { calculateProgressionPlan } from '../server/roadmapGenerator.js';

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
const finalistCount = 16;
let failedAssertions = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    failedAssertions++;
  }
}

allTests.forEach(([totalTeams, maxCap]) => {
  console.log(`\n==================================================`);
  console.log(`TOTAL TEAMS: ${totalTeams} | MAX TEAMS/MATCH: ${maxCap}`);
  console.log(`==================================================`);
  
  // Validation Assertions
  assert(totalTeams % 16 === 0, `Invalid slots_total ${totalTeams}, must be multiple of 16`);
  assert(maxCap >= 16 && maxCap <= 25, `teams_per_match ${maxCap} outside 16-25 range`);

  const plan = calculateProgressionPlan(totalTeams, maxCap, finalistCount);
  
  if (totalTeams <= finalistCount) {
    console.log(`No qualification rounds needed. Goes straight to Grand Final.`);
    assert(plan.length === 0, `Plan should be empty if totalTeams <= finalistCount`);
    return;
  }

  let expectedTeams = totalTeams;

  plan.forEach((round, i) => {
    console.log(`Round ${round.roundNumber}: ${round.qualificationType.toUpperCase()}`);
    console.log(`  match count: ${round.matchCount}`);
    console.log(`  actual match sizes: ${round.matchSizes.join(', ')}`);
    console.log(`  qualifiers per match: ${round.qualifiersPerMatch.join(', ')}`);
    console.log(`  total advancing: ${round.totalTeamsAfter}`);
    
    // Internal Round Auditing Assertions
    const sumSizes = round.matchSizes.reduce((a, b) => a + b, 0);
    const sumQualifiers = round.qualifiersPerMatch.reduce((a, b) => a + b, 0);

    assert(sumSizes === round.totalTeamsBefore, `sum(matchSizes) [${sumSizes}] !== totalTeamsBefore [${round.totalTeamsBefore}]`);
    assert(sumQualifiers === round.totalTeamsAfter, `sum(qualifiersPerMatch) [${sumQualifiers}] !== totalTeamsAfter [${round.totalTeamsAfter}]`);
    
    assert(round.totalTeamsBefore === expectedTeams, `total teams disappeared or duplicated! Expected ${expectedTeams} entering round, got ${round.totalTeamsBefore}`);
    
    round.matchSizes.forEach(size => {
      assert(size <= maxCap, `match size ${size} exceeds teams_per_match ${maxCap}`);
    });

    round.qualifiersPerMatch.forEach((q, idx) => {
      assert(q <= round.matchSizes[idx], `qualifier count ${q} exceeds match size ${round.matchSizes[idx]}`);
    });

    expectedTeams = round.totalTeamsAfter;
  });

  console.log(`\nFINALIST COUNT: ${expectedTeams}`);
  assert(expectedTeams === finalistCount, `final participant count ${expectedTeams} != finalist_count ${finalistCount}`);
});

if (failedAssertions === 0) {
  console.log(`\n✅ ALL ASSERTIONS PASSED.`);
} else {
  console.log(`\n❌ FAILED ASSERTIONS: ${failedAssertions}`);
}
