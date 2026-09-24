import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRoadmapSchedule } from '../src/components/roadmapViewModel.js'
import { buildParticipantRoadmap } from '../server/participantRoadmap.js'

function fixture() {
  const rounds = [
    { id: 'R1', round_number: 1, name: 'Qualifier', teams_advancing: 32, map: 'Erangel' },
    { id: 'R2', round_number: 2, name: 'Semi-final', teams_advancing: 16, map: 'Miramar' },
    { id: 'R3', round_number: 3, name: 'Final', teams_advancing: null, map: 'Sanhok' },
  ]
  const days = []
  const groups = []
  const rooms = []
  const matches = []
  const assignments = []

  for (let groupIndex = 0; groupIndex < 4; groupIndex += 1) {
    const groupId = `R1-G${groupIndex + 1}`
    const dayId = `R1-D${groupIndex + 1}`
    days.push({ id: dayId, round_id: 'R1', day_number: groupIndex + 1, date: `2026-10-0${groupIndex + 1}` })
    groups.push({ id: groupId, day_id: dayId, round_id: 'R1', group_name: `Group ${String.fromCharCode(65 + groupIndex)}`, sequence: groupIndex + 1 })
    for (let matchNumber = 1; matchNumber <= 3; matchNumber += 1) {
      const matchId = `${groupId}-M${matchNumber}`
      const roomId = `${groupId}-ROOM${matchNumber}`
      rooms.push({ id: roomId, room_number: matchNumber, capacity: 16 })
      matches.push({ id: matchId, day_id: dayId, round_id: 'R1', group_id: groupId, room_id: roomId, match_number: matchNumber, start_time: `1${matchNumber}:00`, end_time: `1${matchNumber}:25`, status: 'SCHEDULED', room_identifier: `secret-${matchId}`, room_password: 'private' })
      for (let teamNumber = 1; teamNumber <= 16; teamNumber += 1) {
        assignments.push({ match_id: matchId, group_id: groupId, tournament_team_id: `G${groupIndex + 1}-T${teamNumber}` })
      }
    }
  }

  days.push({ id: 'R2-D1', round_id: 'R2', day_number: 1, date: '2026-10-10' })
  groups.push({ id: 'R2-G1', day_id: 'R2-D1', round_id: 'R2', group_name: 'Group A', sequence: 1 })
  for (let matchNumber = 1; matchNumber <= 2; matchNumber += 1) {
    const matchId = `R2-M${matchNumber}`
    const roomId = `R2-ROOM${matchNumber}`
    rooms.push({ id: roomId, room_number: matchNumber, capacity: 16 })
    matches.push({ id: matchId, day_id: 'R2-D1', round_id: 'R2', group_id: 'R2-G1', room_id: roomId, match_number: matchNumber, start_time: matchNumber === 1 ? '10:00' : '12:00', end_time: matchNumber === 1 ? '10:25' : '12:25' })
  }

  return { rounds, days, groups, rooms, matches, assignments }
}

test('roadmap schedule keeps competitive groups together across separate BGMI matches', () => {
  const source = fixture()
  const schedule = buildRoadmapSchedule(source)
  const qualifierGroups = schedule.groups.filter((group) => group.roundNumber === 1)

  assert.equal(qualifierGroups.length, 4)
  assert.deepEqual(qualifierGroups.map((group) => group.name), ['Group A', 'Group B', 'Group C', 'Group D'])
  assert.deepEqual(qualifierGroups.map((group) => group.matches.length), [3, 3, 3, 3])
  assert.deepEqual(qualifierGroups.map((group) => group.assignedTeamCount), [16, 16, 16, 16])
  assert.equal(schedule.matches.filter((match) => match.roundNumber === 1).length, 12)

  for (const group of qualifierGroups) {
    assert.equal(new Set(group.matches.map((match) => match.groupId)).size, 1)
    assert.equal(new Set(group.matches.map((match) => match.roomId)).size, 3)
    assert.notEqual(group.id, group.matches[0].roomId)
  }
  assert.equal(qualifierGroups[0].matches.some((match) => match.raw.id === 'R1-G2-M1'), false)
})

test('group and chronological views are derived from the same match records and preserve round order', () => {
  const schedule = buildRoadmapSchedule(fixture())
  const groupedIds = schedule.groups.flatMap((group) => group.matches.map((match) => match.id)).sort()
  const timelineIds = schedule.timeline.map((match) => match.id).sort()

  assert.deepEqual(groupedIds, timelineIds)
  assert.deepEqual(schedule.groupsByRound.map((section) => section.round.id), ['R1', 'R2'])
  assert.equal(schedule.groups.find((group) => group.roundId === 'R1').teamsAdvancing, 32)
  assert.equal(schedule.timeline.at(-1).roundId, 'R2')
  assert.deepEqual(schedule.timeline.filter((match) => match.roundId === 'R2').map((match) => match.startTime), ['10:00', '12:00'])
})

test('participant shaping suppresses room credentials while retaining only assigned group matches', () => {
  const source = fixture()
  source.assignments = source.assignments.filter((assignment) => assignment.tournament_team_id === 'G1-T1')
  const participantRoadmap = buildParticipantRoadmap(source, 'G1-T1', { releaseMinutes: 15 })
  const schedule = buildRoadmapSchedule(participantRoadmap, { participant: true })
  const match = schedule.groups[0].matches[0]

  assert.equal(schedule.groups[0].name, 'Group A')
  assert.equal(schedule.groups[0].matches.length, 3)
  assert.equal(schedule.groups.some((group) => group.name === 'Group B'), false)
  assert.equal(match.roomIdentifier, null)
  assert.equal(match.roomPassword, null)
})
