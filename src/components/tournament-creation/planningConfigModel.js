const PLAYERS_PER_TEAM = { solo: 1, duo: 2, squad: 4 }
export const DEFAULT_ROADMAP_PLANNING = {
  teams_per_group: '16',
  max_simultaneous_rooms: '1',
  matches_per_team: '3',
  match_duration_minutes: '25',
  break_between_matches_minutes: '5',
  daily_start_time: '10:00',
  daily_end_time: '22:00',
  max_matches_per_day: '',
}

export function deriveTournamentPlanningConfig(tournament = {}, savedConfig = {}) {
  const slots = Number.parseInt(tournament.slotsTotal, 10)
  const matchType = String(tournament.match_type || 'squad').toLowerCase()
  const playersPerTeam = PLAYERS_PER_TEAM[matchType] || PLAYERS_PER_TEAM.squad

  return {
    ...savedConfig,
    teams_per_group: String(savedConfig.teams_per_group ?? savedConfig.teams_per_room ?? DEFAULT_ROADMAP_PLANNING.teams_per_group),
    expected_teams: Number.isFinite(slots) && slots > 0 ? String(slots) : '',
    maximum_teams: Number.isFinite(slots) && slots > 0 ? String(slots) : '',
    players_per_team: String(playersPerTeam),
  }
}

export function buildPlanningConfigPayload(tournament = {}, savedConfig = {}) {
  const derived = deriveTournamentPlanningConfig(tournament, savedConfig)
  return {
    ...savedConfig,
    // The current database column is retained for compatibility with saved
    // roadmaps; its value now represents competitive group size.
    teams_per_room: derived.teams_per_group,
    teams_per_group: derived.teams_per_group,
    expected_teams: derived.expected_teams,
    maximum_teams: derived.maximum_teams,
    players_per_team: derived.players_per_team,
  }
}

export function requiredRoomCount(teamCapacity, teamsPerRoom) {
  const teams = Number(teamCapacity)
  const perRoom = Number(teamsPerRoom)
  if (!Number.isFinite(teams) || teams < 1 || !Number.isFinite(perRoom) || perRoom < 1) return null
  return Math.ceil(teams / perRoom)
}
