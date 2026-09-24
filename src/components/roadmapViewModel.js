function dateTimeKey(match) {
  const day = match.date || '9999-12-31'
  return `${day}T${match.start_time || '99:99'}`
}

function matchName(round, matchNumber) {
  const stage = String(round?.name || '').toLowerCase()
  if (stage.includes('semi')) return `Semi-final Match ${matchNumber}`
  if (stage.includes('final')) return `Final Match ${matchNumber}`
  if (stage.includes('qualif') || !round || Number(round.round_number) === 1) return `Qualifier ${matchNumber}`
  return `Match ${matchNumber}`
}

function matchDuration(match) {
  if (Number(match.duration_minutes) > 0) return Number(match.duration_minutes)
  if (!match.start_time || !match.end_time) return null
  const [startHour, startMinute] = match.start_time.split(':').map(Number)
  const [endHour, endMinute] = match.end_time.split(':').map(Number)
  const start = startHour * 60 + startMinute
  const end = endHour * 60 + endMinute
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : null
}

export function buildRoadmapSchedule(roadmap = {}, { participant = false } = {}) {
  const rounds = [...(roadmap.rounds || [])].sort((a, b) => (a.round_number || 0) - (b.round_number || 0))
  const roundById = new Map(rounds.map((round) => [round.id, round]))
  const dayById = new Map((roadmap.days || []).map((day) => [day.id, day]))
  const roomById = new Map((roadmap.rooms || []).map((room) => [room.id, room]))
  const assignmentCounts = new Map()
  const groupTeamCounts = new Map()
  for (const assignment of roadmap.assignments || []) {
    assignmentCounts.set(assignment.match_id, (assignmentCounts.get(assignment.match_id) || 0) + 1)
    if (assignment.tournament_team_id) {
      if (!groupTeamCounts.has(assignment.group_id)) groupTeamCounts.set(assignment.group_id, new Set())
      groupTeamCounts.get(assignment.group_id).add(assignment.tournament_team_id)
    }
  }

  const matchById = new Map()
  const matches = (roadmap.matches || []).map((match) => {
    const day = dayById.get(match.day_id) || {}
    const round = roundById.get(match.round_id || day.round_id) || null
    const room = roomById.get(match.room_id) || {}
    const shaped = {
      id: match.id,
      roundId: round?.id || null,
      roundNumber: round?.round_number ?? day.round_number ?? null,
      roundName: round?.name || null,
      groupId: match.group_id,
      matchNumber: Number(match.match_number),
      label: matchName(round, match.match_number),
      date: day.date || match.date || null,
      dayNumber: day.day_number ?? null,
      startTime: match.start_time || null,
      endTime: match.end_time || null,
      map: match.map || round?.map || null,
      status: match.status || 'PENDING',
      durationMinutes: matchDuration(match),
      roomNumber: room.room_number ?? null,
      roomId: room.id || match.room_id || null,
      roomCapacity: room.capacity ?? null,
      credentialsAvailable: match.credentials_available === true,
      releaseMinutes: match.release_minutes ?? null,
      credentialStatus: match.credential_status || null,
      roomIdentifier: participant ? null : (match.room_identifier || null),
      roomPassword: participant ? null : (match.room_password || null),
      assignedTeams: participant ? null : (assignmentCounts.get(match.id) || 0),
      raw: match,
    }
    matchById.set(match.id, shaped)
    return shaped
  }).sort((a, b) =>
    (rounds.findIndex((round) => round.id === a.roundId) - rounds.findIndex((round) => round.id === b.roundId)) ||
    dateTimeKey(a).localeCompare(dateTimeKey(b)) || a.matchNumber - b.matchNumber
  )

  const groups = (roadmap.groups || []).map((group) => {
    const day = dayById.get(group.day_id) || {}
    const round = roundById.get(group.round_id || day.round_id) || null
    const groupMatches = matches.filter((match) => match.groupId === group.id)
      .sort((a, b) => a.matchNumber - b.matchNumber || dateTimeKey(a).localeCompare(dateTimeKey(b)))
    const capacity = Math.max(0, ...groupMatches.map((match) => Number(match.roomCapacity) || 0)) || null
    return {
      id: group.id,
      name: group.group_name || `Group ${group.sequence}`,
      sequence: Number(group.sequence) || 0,
      roundId: round?.id || null,
      roundNumber: round?.round_number ?? null,
      roundName: round?.name || null,
      teamsAdvancing: round?.teams_advancing ?? null,
      teamCapacity: capacity,
      assignedTeamCount: participant ? null : (groupTeamCounts.get(group.id)?.size || 0),
      matches: groupMatches,
    }
  }).filter((group) => group.matches.length > 0)
    .sort((a, b) => (rounds.findIndex((round) => round.id === a.roundId) - rounds.findIndex((round) => round.id === b.roundId)) || a.sequence - b.sequence)

  const groupsByRound = rounds.map((round) => ({
    round,
    groups: groups.filter((group) => group.roundId === round.id),
    matches: matches.filter((match) => match.roundId === round.id),
  })).filter((section) => section.groups.length || section.matches.length)

  const matchIdsFromGroups = new Set(groups.flatMap((group) => group.matches.map((match) => match.id)))
  const timeline = matches.filter((match) => matchIdsFromGroups.has(match.id))
    .slice()
    .sort((a, b) => dateTimeKey(a).localeCompare(dateTimeKey(b)) || (a.roundNumber || 0) - (b.roundNumber || 0) || a.matchNumber - b.matchNumber)

  return { rounds, groups, groupsByRound, matches, timeline, matchById }
}

export function formatRoadmapDate(date) {
  if (!date) return 'Date to be confirmed'
  const parsed = new Date(`${date}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? String(date) : parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

export function formatMatchStatus(status) {
  const normalized = String(status || 'PENDING').toUpperCase()
  if (['LIVE', 'IN_PROGRESS'].includes(normalized)) return 'Live'
  if (['COMPLETED', 'FINISHED', 'VERIFIED'].includes(normalized)) return 'Completed'
  if (['CANCELLED', 'CANCELED'].includes(normalized)) return 'Cancelled'
  return 'Scheduled'
}
