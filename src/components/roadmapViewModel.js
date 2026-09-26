function dateTimeKey(match) {
  const day = match.date || '9999-12-31';
  return `${day}T${match.start_time || '99:99'}`;
}

export function buildRoadmapSchedule(roadmap = {}, { participant = false } = {}) {
  const rounds = [...(roadmap.rounds || [])].sort((a, b) => (a.round_number || 0) - (b.round_number || 0));
  const roundById = new Map(rounds.map(round => [round.id, round]));

  const assignmentCounts = new Map();
  for (const assignment of roadmap.assignments || []) {
    assignmentCounts.set(assignment.match_id, (assignmentCounts.get(assignment.match_id) || 0) + 1);
  }

  const matchById = new Map();
  const matches = (roadmap.matches || []).map(match => {
    const round = roundById.get(match.round_id) || null;
    const shaped = {
      id: match.id,
      roundId: round?.id || null,
      roundNumber: round?.round_number ?? null,
      roundName: round?.name || null,
      matchNumber: Number(match.match_number),
      label: `Match ${match.match_number}`,
      date: round?.date || match.date || null,
      startTime: match.start_time || null,
      endTime: match.end_time || null,
      map: match.map || 'Erangel',
      status: match.status || 'PENDING',
      isGrandFinal: match.is_grand_final === true,
      teamsAdvancing: match.teams_advancing ?? null,
      releaseMinutes: match.release_minutes ?? 15,
      id_pwd_release_time: match.id_pwd_release_time || null,
      
      // Hidden from participants if not assigned or not time yet
      roomIdentifier: participant ? null : (match.room_identifier || null),
      roomPassword: participant ? null : (match.room_password || null),
      assignedTeams: participant ? null : (assignmentCounts.get(match.id) || 0),
      raw: match,
    };
    matchById.set(match.id, shaped);
    return shaped;
  }).sort((a, b) => (a.roundNumber - b.roundNumber) || a.matchNumber - b.matchNumber);

  const timelineByRound = rounds.map(round => ({
    round,
    matches: matches.filter(match => match.roundId === round.id)
  })).filter(section => section.matches.length > 0);

  return { rounds, matches, timelineByRound, matchById };
}

export function formatRoadmapDate(date) {
  if (!date) return 'Date to be confirmed';
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? String(date) : parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatMatchStatus(status) {
  const normalized = String(status || 'PENDING').toUpperCase();
  if (['LIVE', 'IN_PROGRESS'].includes(normalized)) return 'Live';
  if (['COMPLETED', 'FINISHED', 'VERIFIED'].includes(normalized)) return 'Completed';
  if (['CANCELLED', 'CANCELED'].includes(normalized)) return 'Cancelled';
  return 'Scheduled';
}
