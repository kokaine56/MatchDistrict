import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock3, Layers3, ListOrdered, MapPinned, ShieldCheck, Users } from 'lucide-react'
import { getAuthToken } from '../utils/getAuthToken'
import { formatTime12hIST } from '../utils/timeFormat'
import { subtractMinutesNaive } from '../utils/roomReveal'
import { buildRoadmapSchedule, formatMatchStatus, formatRoadmapDate } from './roadmapViewModel'

function statusClasses(status) {
  if (status === 'Live') return 'border-rose-400/25 bg-rose-400/10 text-rose-300'
  if (status === 'Completed') return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
  if (status === 'Cancelled') return 'border-white/10 bg-white/5 text-gray-400'
  return 'border-indigo-400/25 bg-indigo-400/10 text-indigo-300'
}

function MatchCard({ match, group, participant }) {
  const status = formatMatchStatus(match.status)
  const releaseAt = match.date && match.startTime
    ? subtractMinutesNaive(match.date, match.startTime, Number(match.releaseMinutes) || 15)
    : null
  const releaseLabel = releaseAt?.date && releaseAt?.time
    ? `${formatRoadmapDate(releaseAt.date)} · ${formatTime12hIST(releaseAt.time)} IST`
    : 'at the configured release time'

  return (
    <article className="min-w-0 rounded-xl border border-white/10 bg-[#080A0F] p-3.5 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-300">{group.name}</p>
          <h4 className="mt-1 text-sm font-bold text-white sm:text-base">{match.label}</h4>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClasses(status)}`}>{status}</span>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="flex min-w-0 items-start gap-2 text-gray-300">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
          <div className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Date</dt><dd className="text-xs font-semibold">{formatRoadmapDate(match.date)}</dd></div>
        </div>
        <div className="flex min-w-0 items-start gap-2 text-gray-300">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
          <div className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Start · IST</dt><dd className="text-xs font-semibold">{match.startTime ? formatTime12hIST(match.startTime) : 'Time to be confirmed'}</dd></div>
        </div>
        <div className="flex min-w-0 items-start gap-2 text-gray-300">
          <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" />
          <div className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Map</dt><dd className="text-xs font-semibold">{match.map || 'To be confirmed'}</dd></div>
        </div>
        {group.teamCapacity != null && <div className="flex min-w-0 items-start gap-2 text-gray-300"><Users className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><div><dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Teams</dt><dd className="text-xs font-semibold">{group.teamCapacity} teams</dd></div></div>}
        {match.durationMinutes && <div className="flex min-w-0 items-start gap-2 text-gray-300"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" /><div><dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Duration</dt><dd className="text-xs font-semibold">{match.durationMinutes} minutes</dd></div></div>}
        {match.roomNumber != null && <div className="flex min-w-0 items-start gap-2 text-gray-300"><Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div><dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">BGMI Room</dt><dd className="text-xs font-semibold">Room {match.roomNumber}</dd></div></div>}
        {participant && <div className="flex min-w-0 items-start gap-2 text-gray-300"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div><dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Room credentials</dt><dd className="text-xs font-semibold">{match.credentialsAvailable ? 'Available now in My Team' : `Available ${releaseLabel}`}</dd></div></div>}
      </dl>

      {!participant && (
        <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.025] px-3 py-2 text-xs text-gray-400">
          {match.roomIdentifier || match.roomPassword
            ? <span className="break-all">BGMI Room ID: <strong className="text-gray-200">{match.roomIdentifier || '—'}</strong> · Password: <strong className="text-gray-200">{match.roomPassword || '—'}</strong></span>
            : 'BGMI Room credentials have not been added yet.'}
        </div>
      )}
    </article>
  )
}

function RoundHeader({ round, index, participant }) {
  const number = round.round_number ?? index + 1
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
      <span className="rounded-lg bg-indigo-500/15 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-indigo-200">Round {number}</span>
      <h3 className="text-base font-bold text-white">{round.name || `Round ${number}`}</h3>
      {round.status && <span className="text-[10px] font-semibold capitalize text-gray-500">{round.status}</span>}
      {participant && <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-emerald-300">Your schedule</span>}
    </div>
  )
}

function GroupCard({ group, participant, standings = [] }) {
  const dates = [...new Set(group.matches.map((match) => match.date).filter(Boolean))]
  return (
    <section className="min-w-0 rounded-2xl border border-emerald-400/20 bg-[#0D1118] p-3.5 sm:p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2.5 border-b border-white/10 pb-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><Users className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-black uppercase tracking-wide text-white">{participant ? 'Your Group · ' : ''}{group.name}</h4>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {group.teamCapacity != null ? `${group.teamCapacity} team${group.teamCapacity === 1 ? '' : 's'}` : 'Team count not configured'}
            {group.assignedTeamCount != null ? ` · ${group.assignedTeamCount} allocated` : ''}
            {` · ${group.matches.length} match${group.matches.length === 1 ? '' : 'es'}`}
          </p>
        </div>
        {dates.length > 0 && <span className="text-[11px] font-semibold text-gray-400">{dates.map(formatRoadmapDate).join(' – ')}</span>}
      </header>
      <div className="space-y-2.5">
        {group.matches.map((match) => <MatchCard key={match.id} match={match} group={group} participant={participant} />)}
      </div>
      {standings.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
          <div className="flex items-center justify-between bg-white/[0.04] px-3 py-2">
            <h5 className="text-xs font-bold text-white">Group standings</h5>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Verified results</span>
          </div>
          <ol className="divide-y divide-white/5">
            {standings.map((row, index) => (
              <li key={row.team_id} className="flex min-w-0 items-center gap-2 px-3 py-2 text-xs">
                <span className="w-5 shrink-0 text-gray-500">{row.rank ?? index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-gray-200">{row.team_name}</span>
                <span className="shrink-0 text-gray-400">{row.matches_played} matches</span>
                <span className="w-14 shrink-0 text-right font-bold text-emerald-300">{row.total_points} pts</span>
                {row.advanced && <span className="shrink-0 rounded bg-indigo-500/15 px-1.5 py-1 text-[9px] font-bold text-indigo-300">Advanced</span>}
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
    return <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm font-semibold text-amber-200">Final standings → Winner</div>
  }
  const number = round.teams_advancing
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-indigo-400/20 bg-indigo-400/5 px-4 py-3 text-center text-xs font-semibold text-indigo-200">
      <span>Round standings</span><span aria-hidden="true">↓</span>
      <span>{number != null && Number(number) > 0 ? `Top ${number} overall team${Number(number) === 1 ? '' : 's'} advance` : 'Advancement follows verified standings'}</span>
      <span aria-hidden="true">→</span><span>{nextRound ? `Round ${nextRound.round_number}: ${nextRound.name}` : 'Next round'}</span>
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

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Loading tournament schedule…</div>
  if (error || !roadmap || schedule.matches.length === 0) {
    return <div className="rounded-2xl border border-white/10 bg-[#0A0B10] p-8 text-center text-sm text-gray-400">{participant ? 'Your group schedule will appear here after you are allocated.' : 'Generate a draft roadmap to preview the group schedule and timetable.'}</div>
  }

  const roundIndex = new Map(schedule.rounds.map((round, index) => [round.id, index]))
  const timelineByRound = schedule.rounds.map((round) => ({ round, matches: schedule.timeline.filter((match) => match.roundId === round.id) }))
    .filter((section) => section.matches.length > 0)
  const roundGroups = schedule.groupsByRound.filter((section) => section.groups.length > 0)
  const isFinalRound = (round, index) => /(^|\s)final(\s|$)/i.test(round.name || '') || index === schedule.rounds.length - 1

  return (
    <div className="w-full space-y-5 rounded-2xl border border-white/10 bg-[#0A0B10] p-3.5 text-white sm:p-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-300">Tournament timetable</p>
          <h2 className="mt-1 text-lg font-black sm:text-xl">{participant ? 'Your Group & Matches' : 'Groups, Matches & Schedule'}</h2>
          <p className="mt-1 text-xs text-gray-400">Competitive groups stay together across their scheduled matches. Each match has its own BGMI room.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/[0.025] p-1" role="tablist" aria-label="Roadmap view">
          <button type="button" role="tab" aria-selected={view === 'groups'} onClick={() => setView('groups')} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${view === 'groups' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`}><Layers3 className="mr-1.5 inline h-3.5 w-3.5" />Group view</button>
          <button type="button" role="tab" aria-selected={view === 'timeline'} onClick={() => setView('timeline')} className={`rounded-lg px-3 py-2 text-xs font-bold transition ${view === 'timeline' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`}><ListOrdered className="mr-1.5 inline h-3.5 w-3.5" />Schedule</button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 text-[11px] text-gray-400">
        <span className="rounded-lg border border-white/10 px-2.5 py-1.5">{roundGroups.reduce((count, section) => count + section.groups.length, 0)} groups</span>
        <span className="rounded-lg border border-white/10 px-2.5 py-1.5">{schedule.matches.length} matches</span>
        <span className="rounded-lg border border-white/10 px-2.5 py-1.5">{new Set(schedule.matches.map((match) => match.date).filter(Boolean)).size} schedule days</span>
      </div>

      {view === 'groups' ? (
        <div className="space-y-5">
          {roundGroups.map((section) => {
            const index = roundIndex.get(section.round.id) ?? 0
            const nextRound = schedule.rounds[index + 1]
            return (
              <section key={section.round.id} className="space-y-3">
                <RoundHeader round={section.round} index={index} participant={participant} />
                <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">{section.groups.map((group) => <GroupCard key={group.id} group={group} participant={participant} standings={groupStandings.filter((row) => row.group_id === group.id && row.round_number === group.roundNumber)} />)}</div>
                <Advancement round={section.round} nextRound={nextRound} isFinal={isFinalRound(section.round, index)} />
              </section>
            )
          })}
        </div>
      ) : (
        <div className="space-y-5">
          {timelineByRound.map(({ round, matches }) => {
            const index = roundIndex.get(round.id) ?? 0
            const nextRound = schedule.rounds[index + 1]
            return (
              <section key={round.id} className="space-y-3">
                <RoundHeader round={round} index={index} participant={participant} />
                <ol className="space-y-2.5">
                  {matches.map((match) => {
                    const group = schedule.groups.find((item) => item.id === match.groupId) || { name: 'Group', matches: [] }
                    return <li key={match.id} className="relative min-w-0"><div className="absolute left-4 top-10 bottom-[-10px] w-px bg-white/10 last:hidden" /><span className="absolute left-2.5 top-4 z-10 flex h-3 w-3 rounded-full border-2 border-indigo-300 bg-[#0A0B10]" aria-hidden="true" /><div className="pl-8"><MatchCard match={match} group={group} participant={participant} /></div></li>
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
