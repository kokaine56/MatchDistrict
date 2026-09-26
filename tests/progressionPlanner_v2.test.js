import { calculateProgressionPlan } from '../server/roadmapGenerator.js';

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
  console.log(`\n==================================================`);
  console.log(`TOTAL TEAMS: ${totalTeams} | MAX TEAMS/MATCH: ${maxCap}`);
  console.log(`==================================================`);
  
  const plan = calculateProgressionPlan(totalTeams, maxCap);
  
  if (totalTeams <= maxCap) {
    console.log(`No elimination rounds. Direct to Grand Final with ${totalTeams} teams.`);
    assert(plan.length === 0, `Plan should be empty if totalTeams <= maxCapacity`);
    return;
  }

  let expectedTeams = totalTeams;

  plan.forEach((round) => {
    console.log(`Round ${round.roundNumber}: ${round.qualificationType.toUpperCase()}`);
    console.log(`  match sizes: ${round.matchSizes.join(', ')}`);
    console.log(`  qualifiers: ${round.qualifiersPerMatch.join(', ')}`);
    console.log(`  advancing: ${round.totalTeamsAfter}`);
    
    // Internal Auditing
    assert(round.totalTeamsAfter > 16 || round.totalTeamsAfter === 16, 'Check final size'); // Not forcing 16, just auditing
    expectedTeams = round.totalTeamsAfter;
  });

  console.log(`\nGRAND FINAL PARTICIPANT POOL: ${expectedTeams} teams`);
  assert(expectedTeams <= maxCap, `final participant pool ${expectedTeams} exceeds maxCap ${maxCap}`);
});

if (failedAssertions === 0) {
  console.log(`\n✅ ALL ASSERTIONS PASSED.`);
}
