import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock3, Layers3, ListOrdered, MapPin, ShieldCheck, Users, Swords } from 'lucide-react'
import { getAuthToken } from '../utils/getAuthToken'
import { formatTime12hIST } from '../utils/timeFormat'
import { subtractMinutesNaive } from '../utils/roomReveal'
import { buildRoadmapSchedule, formatMatchStatus, formatRoadmapDate } from './roadmapViewModel'

function statusClasses(status) {
  if (status === 'Live') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'Completed') return 'border-slate-200 bg-slate-100 text-slate-600'
  if (status === 'Cancelled') return 'border-rose-200 bg-rose-50 text-rose-600'
  return 'border-blue-200 bg-blue-50 text-blue-700'
}

function MatchCard({ match, group, participant }) {
  const status = formatMatchStatus(match.status)
  const releaseAt = match.date && match.startTime
    ? subtractMinutesNaive(match.date, match.startTime, Number(match.releaseMinutes) || 15)
    : null
  const releaseLabel = releaseAt?.date && releaseAt?.time
    ? `${formatRoadmapDate(releaseAt.date)} · ${formatTime12hIST(releaseAt.time)} IST`
    : (match.id_pwd_release_time || '15m before match')

  return (
    <article className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs hover:border-blue-300 transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">{group.name || 'Match'}</p>
          <h4 className="mt-0.5 text-sm font-bold text-slate-900 sm:text-base">{match.label || `Match ${match.match_number || 1}`}</h4>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${statusClasses(status)}`}>{status}</span>
      </div>

      <dl className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 text-xs">
        <div className="flex min-w-0 items-start gap-2 text-slate-700">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Date</dt><dd className="font-semibold text-slate-800">{formatRoadmapDate(match.date)}</dd></div>
        </div>
        <div className="flex min-w-0 items-start gap-2 text-slate-700">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Start Time</dt><dd className="font-semibold text-slate-800">{match.startTime ? formatTime12hIST(match.startTime) : (match.start_time ? formatTime12hIST(match.start_time) : 'TBD')}</dd></div>
        </div>
        <div className="flex min-w-0 items-start gap-2 text-slate-700">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Map</dt><dd className="font-bold text-blue-700">{match.map || 'Erangel'}</dd></div>
        </div>
        {group.teamCapacity != null && (
          <div className="flex min-w-0 items-start gap-2 text-slate-700">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Teams</dt><dd className="font-semibold text-slate-800">{group.teamCapacity} teams</dd></div>
          </div>
        )}
        <div className="flex min-w-0 items-start gap-2 text-slate-700">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">ID/PWD Release</dt>
            <dd className="font-semibold text-slate-700">{match.id_pwd_release_time || releaseLabel}</dd>
          </div>
        </div>
      </dl>

      {!participant && (match.roomIdentifier || match.roomPassword) && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="break-all">Room ID: <strong className="text-slate-900">{match.roomIdentifier || '—'}</strong> · Password: <strong className="text-slate-900">{match.roomPassword || '—'}</strong></span>
        </div>
      )}
    </article>
  )
}

function RoundHeader({ round, index, participant }) {
  const number = round.round_number ?? index + 1
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
      <span className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-white shadow-xs">Round {number}</span>
      <h3 className="text-base font-bold text-slate-900">{round.name || `Round ${number}`}</h3>
      {round.status && <span className="text-[10px] font-semibold capitalize text-slate-400">({round.status})</span>}
      {participant && <span className="ml-auto text-xs font-bold text-blue-600">Your schedule</span>}
    </div>
  )
}

function GroupCard({ group, participant, standings = [] }) {
  const dates = [...new Set(group.matches.map((match) => match.date).filter(Boolean))]
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-4 shadow-xs">
      <header className="mb-3 flex flex-wrap items-center gap-2.5 border-b border-slate-200/60 pb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-200 shrink-0"><Users className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">{participant ? 'Your Group · ' : ''}{group.name}</h4>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {group.teamCapacity != null ? `${group.teamCapacity} team${group.teamCapacity === 1 ? '' : 's'}` : '16 teams'}
            {group.assignedTeamCount != null ? ` · ${group.assignedTeamCount} allocated` : ''}
            {` · ${group.matches.length} match${group.matches.length === 1 ? '' : 'es'}`}
          </p>
        </div>
        {dates.length > 0 && <span className="text-xs font-semibold text-slate-500">{dates.map(formatRoadmapDate).join(' – ')}</span>}
      </header>
      <div className="space-y-2.5">
        {group.matches.map((match) => <MatchCard key={match.id} match={match} group={group} participant={participant} />)}
      </div>
      {standings.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between bg-slate-50 px-3 py-2 border-b border-slate-100">
            <h5 className="text-xs font-bold text-slate-900">Group Standings</h5>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Verified Results</span>
          </div>
          <ol className="divide-y divide-slate-100">
            {standings.map((row, index) => (
              <li key={row.team_id} className="flex min-w-0 items-center gap-2 px-3 py-2 text-xs">
                <span className="w-5 shrink-0 text-slate-400 font-bold">{row.rank ?? index + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">{row.team_name}</span>
                <span className="shrink-0 text-slate-400">{row.matches_played} matches</span>
                <span className="w-14 shrink-0 text-right font-bold text-blue-600">{row.total_points} pts</span>
                {row.advanced && <span className="shrink-0 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-bold">Advanced</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

function Advancement({ round, nextRound, isFinal }) {
  if (isFinal) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800 text-center">Final Standings → Winner & Prize Allocation</div>
  }
  const number = round.teams_advancing
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-center text-xs font-bold text-blue-800">
      <span>Round Standings</span><span aria-hidden="true">↓</span>
      <span>{number != null && Number(number) > 0 ? `Top ${number} overall team${Number(number) === 1 ? '' : 's'} advance` : 'Advancement follows verified standings'}</span>
      <span aria-hidden="true">→</span><span>{nextRound ? `Round ${nextRound.round_number}: ${nextRound.name}` : 'Next Round'}</span>
    </div>
  )
}

export default function Phase3RoadmapViewer({ tournamentId }) {
  const [loading, setLoading] = useState(true)
  const [roadmap, setRoadmap] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState(null)
  const [groupStandings, setGroupStandings] = useState([])
  const [view, setView] = useState('groups')

  useEffect(() => {
    let current = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await getAuthToken()
        const response = await fetch(`/api/tournaments/${tournamentId}/roadmap`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.message || data.error || 'Roadmap request failed')
        if (current) {
          setRoadmap(data.roadmap || null)
          setMode(data.mode || 'participant')
        }
      } catch (loadError) {
        if (current) setError(loadError.message)
      } finally {
        if (current) setLoading(false)
      }
    }
    load()
    return () => { current = false }
  }, [tournamentId])

  useEffect(() => {
    if (!roadmap || !mode) return undefined
    let current = true
    const loadStandings = async () => {
      try {
        const token = await getAuthToken()
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        if (mode === 'organizer') {
          const rounds = roadmap.rounds || []
          const responses = await Promise.all(rounds.map(async (round) => {
            const response = await fetch(`/api/tournaments/${tournamentId}/rounds/${round.round_number}/standings`, { headers })
            if (!response.ok) return []
            const data = await response.json()
            if (!data.success) return []
            const roundById = new Map(rounds.map((item) => [item.id, item.round_number]))
            const matchById = new Map((roadmap.matches || []).map((match) => [match.id, match]))
            const dayById = new Map((roadmap.days || []).map((day) => [day.id, day]))
            const teamGroups = new Map()
            for (const assignment of roadmap.assignments || []) {
              if (!assignment.tournament_team_id) continue
              const match = matchById.get(assignment.match_id)
              const assignmentRound = roundById.get(match?.round_id || dayById.get(match?.day_id)?.round_id)
              const key = `${assignmentRound}:${assignment.tournament_team_id}`
              if (!teamGroups.has(key)) teamGroups.set(key, new Set())
              teamGroups.get(key).add(assignment.group_id)
            }
            return (data.standings || []).flatMap((row) => [...(teamGroups.get(`${round.round_number}:${row.team_id}`) || [])].map((groupId) => ({
              ...row,
              group_id: groupId,
              round_number: round.round_number,
            })))
          }))
          if (current) setGroupStandings(responses.flat())
        } else {
          const response = await fetch(`/api/tournaments/${tournamentId}/my-team`, { headers })
          const data = await response.json()
          if (current && response.ok && data.success) setGroupStandings(data.groupStandings || [])
        }
      } catch {
        if (current) setGroupStandings([])
      }
    }
    loadStandings()
    return () => { current = false }
  }, [mode, roadmap, tournamentId])

  const participant = mode !== 'organizer'
  const schedule = useMemo(() => buildRoadmapSchedule(roadmap || {}, { participant }), [roadmap, participant])

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm font-semibold text-slate-500 shadow-sm">
        Loading tournament roadmap schedule…
      </div>
    )
  }

  if (error || !roadmap || schedule.matches.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs">
        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
          <CalendarDays className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-900 mb-1">Tournament Roadmap</h3>
        <p className="text-xs text-slate-500">The tournament schedule has not been published yet.</p>
      </div>
    )
  }

  const roundIndex = new Map(schedule.rounds.map((round, index) => [round.id, index]))
  const timelineByRound = schedule.rounds.map((round) => ({ round, matches: schedule.timeline.filter((match) => match.roundId === round.id) }))
    .filter((section) => section.matches.length > 0)
  const roundGroups = schedule.groupsByRound.filter((section) => section.groups.length > 0)
  const isFinalRound = (round, index) => /(^|\s)final(\s|$)/i.test(round.name || '') || index === schedule.rounds.length - 1

  return (
    <div className="w-full space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm text-slate-900">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              Match Schedule
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Tournament Roadmap</h2>
          <p className="mt-0.5 text-xs text-slate-500">Official match schedule, maps, and ID/password release timings.</p>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-auto" role="tablist" aria-label="Roadmap view">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'groups'}
            onClick={() => setView('groups')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              view === 'groups' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers3 className="mr-1.5 inline h-3.5 w-3.5" />Group View
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'timeline'}
            onClick={() => setView('timeline')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              view === 'timeline' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <ListOrdered className="mr-1.5 inline h-3.5 w-3.5" />Timeline
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1 font-semibold">{roundGroups.reduce((count, section) => count + section.groups.length, 0)} Groups</span>
        <span className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1 font-semibold">{schedule.matches.length} Matches</span>
        <span className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1 font-semibold">{new Set(schedule.matches.map((match) => match.date).filter(Boolean)).size} Schedule Days</span>
      </div>

      {view === 'groups' ? (
        <div className="space-y-6">
          {roundGroups.map((section) => {
            const index = roundIndex.get(section.round.id) ?? 0
            const nextRound = schedule.rounds[index + 1]
            return (
              <section key={section.round.id} className="space-y-3">
                <RoundHeader round={section.round} index={index} participant={participant} />
                <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
                  {section.groups.map((group) => (
                    <GroupCard
                      key={group.id}
                      group={group}
                      participant={participant}
                      standings={groupStandings.filter((row) => row.group_id === group.id && row.round_number === group.roundNumber)}
                    />
                  ))}
                </div>
                <Advancement round={section.round} nextRound={nextRound} isFinal={isFinalRound(section.round, index)} />
              </section>
            )
          })}
        </div>
      ) : (
        <div className="space-y-6">
          {timelineByRound.map(({ round, matches }) => {
            const index = roundIndex.get(round.id) ?? 0
            const nextRound = schedule.rounds[index + 1]
            return (
              <section key={round.id} className="space-y-3">
                <RoundHeader round={round} index={index} participant={participant} />
                <ol className="space-y-2.5">
                  {matches.map((match) => {
                    const group = schedule.groups.find((item) => item.id === match.groupId) || { name: 'Group', matches: [] }
                    return (
                      <li key={match.id} className="relative min-w-0">
                        <div className="absolute left-4 top-10 bottom-[-10px] w-px bg-slate-200 last:hidden" />
                        <span className="absolute left-2.5 top-4 z-10 flex h-3 w-3 rounded-full border-2 border-blue-600 bg-white" aria-hidden="true" />
                        <div className="pl-8"><MatchCard match={match} group={group} participant={participant} /></div>
                      </li>
                    )
                  })}
                </ol>
                <Advancement round={round} nextRound={nextRound} isFinal={isFinalRound(round, index)} />
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
