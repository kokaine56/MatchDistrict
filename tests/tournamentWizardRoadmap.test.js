import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildPlanningConfigPayload,
  deriveTournamentPlanningConfig,
  requiredRoomCount,
} from '../src/components/tournament-creation/planningConfigModel.js'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('wizard ends at Publish with nine steps and no roadmap step', async () => {
  const [wizard, indicator] = await Promise.all([
    read('../src/components/tournament-creation/CreationWizard.jsx'),
    read('../src/components/tournament-creation/StepIndicator.jsx'),
  ])
  assert.match(wizard, /const STEPS = \[1, 2, 3, 4, 5, 6, 7, 8, 9\]/)
  assert.doesNotMatch(wizard, /case 10\s*:/)
  assert.match(wizard, /case 9: return <Step9Publish/)
  assert.match(wizard, /case 7: return <Step7Rules/)
  assert.doesNotMatch(indicator, /Planning Config|Roadmap|num:\s*11/)
});

test('wizard never references roadmap authoring, schedule views, or rounds_published', async () => {
  const [wizard, preview] = await Promise.all([
    read('../src/components/tournament-creation/CreationWizard.jsx'),
    read('../src/components/tournament-creation/steps/Step8Preview.jsx'),
  ])
  assert.doesNotMatch(wizard, /Step7Roadmap/)
  assert.doesNotMatch(wizard, /Step7RoadmapImage/)
  assert.doesNotMatch(wizard, /RoadmapScheduleEditor/)
  assert.doesNotMatch(wizard, /roadmap_image_url/)
  assert.doesNotMatch(wizard, /rounds_published/)
  assert.doesNotMatch(wizard, /roundOrderingErrors/)
  assert.doesNotMatch(preview, /const rounds = data\.roadmap/)
  const roadmapFileExists = await import('node:fs').then(fs => fs.existsSync(new URL('../src/components/tournament-creation/steps/Step7Roadmap.jsx', import.meta.url)))
  assert.equal(roadmapFileExists, false)
});

test('capacity and roster size derive from Slots & Entry and Match Setup', () => {
  for (const [match_type, players] of [['solo', '1'], ['duo', '2'], ['squad', '4']]) {
    const config = deriveTournamentPlanningConfig({ slotsTotal: '64', match_type }, { teams_per_room: '16' })
    assert.equal(config.expected_teams, '64')
    assert.equal(config.maximum_teams, '64')
    assert.equal(config.players_per_team, players)
    assert.equal(config.teams_per_room, '16')
    assert.equal(config.teams_per_group, '16')
  }
});

test('saved planning payload overrides legacy duplicate capacity fields but preserves planner settings', () => {
  const payload = buildPlanningConfigPayload(
    { slotsTotal: '100', match_type: 'duo' },
    { expected_teams: '60', maximum_teams: '120', players_per_team: '4', teams_per_room: '16' },
  )
  assert.equal(payload.expected_teams, '100')
  assert.equal(payload.maximum_teams, '100')
  assert.equal(payload.players_per_team, '2')
  assert.equal(payload.teams_per_room, '16')
  assert.equal(payload.teams_per_group, '16')
});

test('competitive group count is calculated from capacity and teams per group', () => {
  assert.equal(requiredRoomCount(64, 16), 4)
  assert.equal(requiredRoomCount(65, 16), 5)
  assert.equal(requiredRoomCount(0, 16), null)
});

test('publishing saves Roadmap planning before publishing the tournament', async () => {
  const wizard = await read('../src/components/tournament-creation/CreationWizard.jsx')
  const publishStart = wizard.indexOf('const handlePublish = useCallback')
  const publishEnd = wizard.indexOf('const handlePublishStep9', publishStart)
  const publishHandler = wizard.slice(publishStart, publishEnd)
  assert.ok(publishStart >= 0 && publishEnd > publishStart)
  assert.ok(publishHandler.indexOf('handleSavePlanningConfig(') < publishHandler.indexOf("saveToServer('PUBLISHED')"))
  assert.match(wizard, /const validStep = Math\.min\(Math\.max\(Number\(savedStep\) \|\| 1, 1\), STEPS\.length\)/)
});

test('old wizard planning component is removed without deleting planning schema or planner fields', async () => {
  const [wizard, server] = await Promise.all([
    read('../src/components/tournament-creation/CreationWizard.jsx'),
    read('../server.js'),
  ])
  assert.doesNotMatch(wizard, /Step10PlanningConfig/)
  assert.match(server, /CREATE TABLE IF NOT EXISTS tournament_planning_config/)
  assert.match(server, /INSERT INTO tournament_planning_config/)
});

test('server derives persisted team counts and roster size from tournament source fields', async () => {
  const server = await read('../server.js')
  assert.match(server, /SELECT "orgId", title, finalized_at, status, "slotsTotal", match_type FROM tournaments/)
  assert.match(server, /const expectedTeams = tournamentCapacity;\s*const maximumTeams = tournamentCapacity;/)
  assert.match(server, /const playersPerTeam = \(\{ solo: 1, duo: 2, squad: 4 \}\)\[matchType\] \|\| 4;/)
  assert.match(server, /\['expected_teams',\s+expectedTeams,\s+false\]/)
  assert.match(server, /\['maximum_teams',\s+maximumTeams,\s+false\]/)
  assert.match(server, /INSERT INTO tournament_planning_config \(\s*id, tournament_id,\s*teams_per_room/)
  assert.doesNotMatch(server.match(/INSERT INTO tournament_planning_config \(([\s\S]*?)\) VALUES/)?.[1] || '', /expected_teams|maximum_teams|players_per_team/)
});
