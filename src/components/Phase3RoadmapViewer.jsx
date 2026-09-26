import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock3, MapPin, ShieldCheck, Trophy, ListOrdered } from 'lucide-react'
import { getAuthToken } from '../utils/getAuthToken'
import { formatTime12hIST } from '../utils/timeFormat'
import { buildRoadmapSchedule, formatMatchStatus, formatRoadmapDate } from './roadmapViewModel'

function statusClasses(status) {
  if (status === 'Live') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'Completed') return 'border-slate-200 bg-slate-100 text-slate-600'
  if (status === 'Cancelled') return 'border-rose-200 bg-rose-50 text-rose-600'
  return 'border-blue-200 bg-blue-50 text-blue-700'
}

function MatchCard({ match, participant }) {
  const status = formatMatchStatus(match.status)

  return (
    <article className={`min-w-0 rounded-xl border p-3.5 sm:p-4 shadow-xs transition-colors ${match.isGrandFinal ? 'border-amber-200 bg-amber-50/30' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2 mb-3">
        <h4 className="text-sm font-bold text-slate-900 sm:text-base uppercase tracking-wider">{match.label}</h4>
        <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${statusClasses(status)}`}>{status}</span>
      </div>

      <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-xs">
        <div className="flex min-w-0 items-start gap-2 text-slate-700">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Start Time</dt><dd className="font-semibold text-slate-800">{match.startTime ? formatTime12hIST(match.startTime) : 'TBD'}</dd></div>
        </div>
        <div className="flex min-w-0 items-start gap-2 text-slate-700">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Map</dt><dd className="font-bold text-blue-700 uppercase">{match.map}</dd></div>
        </div>
        <div className="flex min-w-0 items-start gap-2 text-slate-700">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">ID/PWD Release</dt>
            <dd className="font-semibold text-slate-700">{match.id_pwd_release_time || '15m before match'}</dd>
          </div>
        </div>
      </dl>

      {(() => {
        const advancing = match.teams_advancing ?? match.teamsAdvancing;
        const isGF = match.is_grand_final || match.isGrandFinal;
        if (!isGF && advancing != null) {
          return (
            <div className="mt-3 bg-blue-50 text-blue-700 text-[11px] font-black uppercase text-center py-1 rounded-md">
              Top {advancing} Advance
            </div>
          );
        }
        return null;
      })()}

      {(match.roomIdentifier || match.roomPassword) && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="break-all">Room ID: <strong className="text-slate-900">{match.roomIdentifier || '—'}</strong> · Password: <strong className="text-slate-900">{match.roomPassword || '—'}</strong></span>
        </div>
      )}
    </article>
  )
}

function RoundHeader({ round, isGrandFinal }) {
  if (isGrandFinal) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-amber-200 pb-3 mb-4">
        <span className="rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-3 py-1.5 text-sm font-black uppercase tracking-widest text-white shadow-xs flex items-center gap-2">
          <Trophy className="w-4 h-4" /> Grand Final
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3 mb-4">
      <span className="rounded-lg bg-slate-100 text-slate-500 px-2.5 py-1 text-xs font-black uppercase tracking-wider shadow-xs">Round {round.round_number}</span>
      <h3 className="text-base font-bold text-slate-900 uppercase tracking-widest">{round.name}</h3>
      {round.date && <span className="text-xs font-semibold text-slate-500 ml-auto">{formatRoadmapDate(round.date)}</span>}
    </div>
  )
}

export default function Phase3RoadmapViewer({ tournamentId }) {
  const [loading, setLoading] = useState(true)
  const [roadmap, setRoadmap] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState(null)

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
        <p className="text-xs text-slate-500">The tournament roadmap has not been published yet.</p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm text-slate-900">
      <header className="border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            Match Schedule
          </span>
        </div>
        <h2 className="text-xl font-black tracking-tight text-slate-900">Tournament Roadmap</h2>
        <p className="mt-0.5 text-xs font-semibold text-slate-500">Official match schedule, maps, and ID/password release timings.</p>
      </header>

      <div className="space-y-6">
        {schedule.timelineByRound.map(({ round, matches }) => {
          const isGF = round.is_grand_final || round.name?.toLowerCase().includes('grand final')
          return (
            <section key={round.id} className={`p-5 rounded-xl border ${isGF ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-white' : 'border-slate-200 bg-slate-50'}`}>
              <RoundHeader round={round} isGrandFinal={isGF} />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {matches.map((match) => (
                  <MatchCard key={match.id} match={match} participant={participant} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
