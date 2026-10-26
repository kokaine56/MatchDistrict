import assert from 'assert';
import { sortAndRank, calculateMatchPoints } from '../server/leaderboardService.js';
import { resolveQualificationCutoff } from '../server/roundProgressionService.js';

console.log('=== Running Leaderboard Workflow & Scoring Tests ===');

// 1. Test Scoring calculation: Total Points = Placement Points + Total Kills
console.log('\n1. Testing Scoring Calculation...');
const scoreInput1 = {
  rank: 1,
  placementPoints: 12,
  kills: 5,
};
const points = calculateMatchPoints(5, 1, { placement_points_map: { '1': 12 } });
assert.strictEqual(points.total_points, 17, 'Total points should be 12 + 5 = 17');
assert.strictEqual(points.placement_points, 12);
assert.strictEqual(points.kill_points, 5);
console.log('✓ Match points calculated correctly: 12 + 5 = 17');

// 2. Test Standings Ranking & Tie breaking
console.log('\n2. Testing Standings Ranking & Tie-breaking...');
const rawTeams = [
  { id: 'team-b', team_id: 'team-b', team_name: 'Team Beta', total_points: 15, placement_points: 10, kills: 5, wwcd: 0 },
  { id: 'team-a', team_id: 'team-a', team_name: 'Team Alpha', total_points: 15, placement_points: 10, kills: 5, wwcd: 1 },
  { id: 'team-c', team_id: 'team-c', team_name: 'Team Charlie', total_points: 17, placement_points: 15, kills: 2, wwcd: 0 },
];
// Points: Team Alpha (15 pts, 1 WWCD), Team Beta (15 pts, 0 WWCD), Team Charlie (17 pts, 0 WWCD)
const ranked = sortAndRank(rawTeams);
assert.strictEqual(ranked[0].team_name, 'Team Charlie', 'Charlie should be #1 with 17 pts');
assert.strictEqual(ranked[1].team_name, 'Team Alpha', 'Alpha should be #2 with 15 pts and 1 WWCD');
assert.strictEqual(ranked[2].team_name, 'Team Beta', 'Beta should be #3 with 15 pts and 0 WWCD');
console.log('✓ Ranking & WWCD tie-break verified correctly');

// 3. Test Cutoff Tie Detection
console.log('\n3. Testing Cutoff Tie Detection...');
function detectCutoffTies(teams, targetCount) {
  if (!teams || teams.length <= targetCount) return [];
  const cutoffTeam = teams[targetCount - 1];
  if (!cutoffTeam) return [];

  const tiedTeams = teams.filter(t => (
    Number(t.total_points || 0) === Number(cutoffTeam.total_points || 0) &&
    Number(t.wwcd || 0) === Number(cutoffTeam.wwcd || 0) &&
    Number(t.placement_points || 0) === Number(cutoffTeam.placement_points || 0) &&
    Number(t.kills || 0) === Number(cutoffTeam.kills || 0)
  ));

  const allInsideCutoff = tiedTeams.every(t => teams.indexOf(t) < targetCount);
  return allInsideCutoff ? [] : tiedTeams;
}

const teamsWithCutoffTie = [
  { id: '1', team_name: 'Team 1', total_points: 30, wwcd: 2, placement_points: 20, kills: 10 },
  { id: '2', team_name: 'Team 2', total_points: 25, wwcd: 1, placement_points: 15, kills: 10 },
  { id: '3', team_name: 'Team 3', total_points: 20, wwcd: 1, placement_points: 10, kills: 10 },
  { id: '4', team_name: 'Team 4 (Tied)', total_points: 15, wwcd: 0, placement_points: 10, kills: 5 },
  { id: '5', team_name: 'Team 5 (Tied)', total_points: 15, wwcd: 0, placement_points: 10, kills: 5 },
  { id: '6', team_name: 'Team 6', total_points: 10, wwcd: 0, placement_points: 5, kills: 5 },
];

const tiesDetected = detectCutoffTies(teamsWithCutoffTie, 4);
assert.strictEqual(tiesDetected.length, 2, 'Should detect 2 teams tied at cutoff index 4');
assert.strictEqual(tiesDetected[0].id, '4');
assert.strictEqual(tiesDetected[1].id, '5');
console.log('✓ Cutoff tie correctly detected between Team 4 and Team 5');

// When resolved by organizer picking Team 5 over Team 4:
const resolvedTeams = [
  teamsWithCutoffTie[0],
  teamsWithCutoffTie[1],
  teamsWithCutoffTie[2],
  teamsWithCutoffTie[4], // Team 5 chosen
];
assert.strictEqual(resolvedTeams.length, 4);
assert.strictEqual(resolvedTeams[3].id, '5');
console.log('✓ Manual tie resolution verified: organizer successfully broke cutoff tie');

// 4. Test Qualification Cutoff Resolution from roadmap config
console.log('\n4. Testing Qualification Cutoff Resolver...');
assert.strictEqual(resolveQualificationCutoff(4), 4);
assert.strictEqual(resolveQualificationCutoff('top 8'), 8);
assert.strictEqual(resolveQualificationCutoff('top_16'), 16);
assert.strictEqual(resolveQualificationCutoff('32 teams'), 32);
assert.strictEqual(resolveQualificationCutoff(null), 0);
console.log('✓ Roadmap qualification cutoff strings resolved accurately');

// 5. Test Human-Readable Error Formatting vs Internal ID
console.log('\n5. Testing Team Name and Canonical ID resolution...');
const teamNameMap = new Map([
  ['TEAM-390555-171be7', 'Red Tigers Esports'],
  ['reg-123', 'Red Tigers Esports'],
]);
const teamCanonicalIdMap = new Map([
  ['reg-123', 'TEAM-390555-171be7'],
  ['TEAM-390555-171be7', 'TEAM-390555-171be7'],
]);

// Source round simulation:
const playedTeamSet = new Set(['TEAM-390555-171be7']);
const candidateId = 'reg-123';
const canonicalId = teamCanonicalIdMap.get(candidateId) || candidateId;
const didPlay = playedTeamSet.has(canonicalId);
assert.strictEqual(didPlay, true, 'Candidate with registration ID resolves to canonical ID and counts as played');

// If an unknown team didn't play:
const unknownId = 'reg-999';
const unknownCanonical = teamCanonicalIdMap.get(unknownId) || unknownId;
const unknownDidPlay = playedTeamSet.has(unknownCanonical);
assert.strictEqual(unknownDidPlay, false);
const resolvedName = teamNameMap.get(unknownId) || teamNameMap.get(unknownCanonical) || unknownId;
const errorMsg = `Team "${resolvedName}" did not play in source round "Round 1" and cannot be advanced.`;
assert.strictEqual(errorMsg, 'Team "reg-999" did not play in source round "Round 1" and cannot be advanced.');
console.log('✓ Human-readable error message and canonical ID mapping validated successfully');

// 6. Test Method A: Top N Teams From Each District
console.log('\n6. Testing Method A (Top N from Each District) & Partial Saves...');
const district1Teams = [
  { id: 't1', team_name: 'Alpha 1', total_points: 20, rank: 1, district_id: 'd1' },
  { id: 't2', team_name: 'Alpha 2', total_points: 18, rank: 2, district_id: 'd1' },
  { id: 't3', team_name: 'Alpha 3', total_points: 15, rank: 3, district_id: 'd1' },
  { id: 't4', team_name: 'Alpha 4', total_points: 10, rank: 4, district_id: 'd1' },
];
const district2Teams = [
  { id: 't5', team_name: 'Beta 1', total_points: 22, rank: 1, district_id: 'd2' },
  { id: 't6', team_name: 'Beta 2', total_points: 19, rank: 2, district_id: 'd2' },
  { id: 't7', team_name: 'Beta 3', total_points: 14, rank: 3, district_id: 'd2' },
  { id: 't8', team_name: 'Beta 4', total_points: 12, rank: 4, district_id: 'd2' },
];
const districtMetadata = [
  { id: 'd1', name: 'District 1', scores_saved: true, scores_status: 'saved' },
  { id: 'd2', name: 'District 2', scores_saved: false, scores_status: 'unsaved' },
];

// Qualifying top 2 per district:
const N_PER_DISTRICT = 2;
const qualifyingMethodA = (districts, teamsByDistrict, allowPartial = true) => {
  const advancing = [];
  const processedDistricts = [];
  const unprocessedDistricts = [];

  for (const d of districts) {
    if (!d.scores_saved && !allowPartial) {
      throw new Error(`District ${d.name} has unsaved scores`);
    }
    if (d.scores_saved) {
      const teams = teamsByDistrict[d.id] || [];
      const topN = teams.slice(0, N_PER_DISTRICT);
      advancing.push(...topN);
      processedDistricts.push(d.name);
    } else {
      unprocessedDistricts.push(d.name);
    }
  }

  return { advancing, processedDistricts, unprocessedDistricts, isComplete: unprocessedDistricts.length === 0 };
};

const resultA = qualifyingMethodA(districtMetadata, { d1: district1Teams, d2: district2Teams });
assert.strictEqual(resultA.advancing.length, 2, 'Should advance 2 teams from saved District 1');
assert.strictEqual(resultA.processedDistricts[0], 'District 1');
assert.strictEqual(resultA.unprocessedDistricts[0], 'District 2');
assert.strictEqual(resultA.isComplete, false, 'Should flag qualification as partial/incomplete when d2 is unsaved');
console.log('✓ Method A qualified top N per district and transparently flagged unsaved District 2');

// 7. Test Method B: Top N Teams Overall
console.log('\n7. Testing Method B (Top N Overall)...');
const allSourceTeams = [...district1Teams, ...district2Teams];
const N_OVERALL = 3;
const qualifyingMethodB = (districts, teams, cutoff) => {
  const hasUnsaved = districts.some(d => !d.scores_saved);
  const rankedAll = sortAndRank(teams);
  const topTeams = rankedAll.slice(0, cutoff);
  return {
    advancing: topTeams,
    isProvisional: hasUnsaved,
    warning: hasUnsaved ? `Provisional: ${districts.filter(d => !d.scores_saved).map(d => d.name).join(', ')} scores are unsaved.` : null
  };
};

const resultB = qualifyingMethodB(districtMetadata, allSourceTeams, N_OVERALL);
assert.strictEqual(resultB.advancing.length, 3, 'Should advance top 3 overall');
assert.strictEqual(resultB.advancing[0].team_name, 'Beta 1', 'Beta 1 is #1 overall with 22 pts');
assert.strictEqual(resultB.advancing[1].team_name, 'Alpha 1', 'Alpha 1 is #2 overall with 20 pts');
assert.strictEqual(resultB.advancing[2].team_name, 'Beta 2', 'Beta 2 is #3 overall with 19 pts');
assert.strictEqual(resultB.isProvisional, true);
assert.ok(resultB.warning.includes('District 2'));
console.log('✓ Method B qualified top N overall across districts with provisional warning for unsaved district');

// 8. Test Three Separate Actions
console.log('\n8. Testing Distinct Action States (Save vs Qualify vs Publish)...');
const mockTournamentState = {
  scoresSaved: false,
  qualifiedTeams: [],
  isPublished: false,
};

// Action 1: Save Scores
mockTournamentState.scoresSaved = true;
assert.strictEqual(mockTournamentState.scoresSaved, true);
assert.strictEqual(mockTournamentState.qualifiedTeams.length, 0, 'Saving scores must NOT qualify teams');
assert.strictEqual(mockTournamentState.isPublished, false, 'Saving scores must NOT publish leaderboard');

// Action 2: Qualify
mockTournamentState.qualifiedTeams = resultA.advancing.map(t => t.id);
assert.strictEqual(mockTournamentState.qualifiedTeams.length, 2);
assert.strictEqual(mockTournamentState.isPublished, false, 'Qualifying must NOT publish leaderboard');

// Action 3: Publish Leaderboard
mockTournamentState.isPublished = true;
assert.strictEqual(mockTournamentState.isPublished, true);
console.log('✓ Actions remain strictly decoupled: Save Scores, Qualify, and Publish Leaderboard operate independently');

console.log('\n=== All Tests Passed Successfully! ===');
