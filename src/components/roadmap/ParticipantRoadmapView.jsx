import React, { useState, useMemo } from 'react';
import {
  Clock,
  Calendar,
  Layers,
  MapPin,
  Lock,
  Unlock,
  Trophy,
  ChevronDown,
  ChevronUp,
  Eye,
  CheckCircle2,
  Radio,
} from 'lucide-react';
import { getRoadmapTheme } from './RoadmapTheme';
import {
  formatDateWithWeekdayIST,
  formatDateRangeIST,
} from '../../utils/roadmapDateUtils';
import { formatTime12hIST } from '../../utils/timeFormat';

/**
 * Builds the compact single-line plan overview: "128 teams → 16 → Grand Final"
 */
export function getCompactPlanOverview(rounds = [], totalSlots = 16) {
  if (!rounds || rounds.length === 0) return '';
  const firstIn = rounds[0]?.teams_in != null ? rounds[0].teams_in : totalSlots;
  const parts = [`${firstIn} teams`];

  for (let i = 0; i < rounds.length; i++) {
    const r = rounds[i];
    const isGF =
      r.round_type === 'grand_final' ||
      (i === rounds.length - 1 && rounds.length > 1) ||
      (r.name || '').toLowerCase().includes('grand final');

    if (isGF) {
      parts.push('Grand Final');
    } else {
      let advancing = r.teams_advancing;
      if (advancing == null) {
        if (r.advancement_type === 'per_district') {
          const districtCount = (r.days || []).reduce((acc, d) => acc + (d.allocations?.length || 0), 0) || 1;
          advancing = districtCount * (r.teams_advancing_per_district || 2);
        } else {
          advancing = 16;
        }
      }
      parts.push(String(advancing));
    }
  }

  return parts.join(' → ');
}

export default function ParticipantRoadmapView({
  tournamentTitle = 'Tournament Roadmap',
  rounds = [],
  meta = {},
  districts = [],
  isPublished = true,
  cardColor = 'white',
  previewMode = false,
  onExitPreview,
  myDistrictIds = [],
  myMatchIds = [],
}) {
  const theme = getRoadmapTheme(cardColor);

  const effectiveMyDistIds = useMemo(() => {
    return new Set([
      ...(Array.isArray(myDistrictIds) ? myDistrictIds : []),
      ...(Array.isArray(meta?.my_district_ids) ? meta.my_district_ids : []),
      ...(Array.isArray(meta?.myDistrictIds) ? meta.myDistrictIds : []),
    ]);
  }, [myDistrictIds, meta]);

  const effectiveMyMatchIds = useMemo(() => {
    return new Set([
      ...(Array.isArray(myMatchIds) ? myMatchIds : []),
      ...(Array.isArray(meta?.my_match_ids) ? meta.my_match_ids : []),
      ...(Array.isArray(meta?.myMatchIds) ? meta.myMatchIds : []),
    ]);
  }, [myMatchIds, meta]);

  const totalSlots = Number(meta.total_slots || meta.slotsTotal || 16);
  const game = meta.game || 'BGMI';

  // Overall date range across all rounds and days
  const dateRangeStr = useMemo(() => {
    const dates = [];
    (rounds || []).forEach((r) => {
      (r.days || []).forEach((d) => {
        if (d && d.date) dates.push(d.date);
      });
    });
    if (dates.length === 0) return '';
    dates.sort();
    return formatDateRangeIST(dates[0], dates[dates.length - 1]);
  }, [rounds]);

  // Total unique districts scheduled
  const totalDistrictsCount = useMemo(() => {
    const ids = new Set();
    (rounds || []).forEach((r) => {
      (r.days || []).forEach((d) => {
        (d.allocations || []).forEach((a) => {
          if (a.district_id || a.id) ids.add(a.district_id || a.id);
        });
      });
    });
    return ids.size || districts.length || 1;
  }, [rounds, districts]);

  // Find the participant's assigned "Your next match"
  const myNextMatch = useMemo(() => {
    for (let rIdx = 0; rIdx < (rounds || []).length; rIdx++) {
      const round = rounds[rIdx];
      for (const day of round.days || []) {
        for (const alloc of day.allocations || []) {
          const isMyDist =
            effectiveMyDistIds.has(alloc.district_id) ||
            effectiveMyDistIds.has(alloc.id) ||
            effectiveMyDistIds.has(alloc.group_id);

          const matches = alloc.matches || [];
          const hasMyMatch = matches.some((m) =>
            effectiveMyMatchIds.has(m.id) || effectiveMyMatchIds.has(m.match_id)
          );

          if (isMyDist || hasMyMatch) {
            const firstMatch = matches[0] || {
              start_time: '13:00',
              map: 'Erangel',
              district_match_number: 1,
            };
            return {
              roundName: round.name || `Round ${round.round_number || rIdx + 1}`,
              districtName: alloc.district_name || alloc.name || 'Your District',
              dayNumber: day.day_number,
              date: day.date,
              match: firstMatch,
              matchCount: matches.length || 1,
            };
          }
        }
      }
    }
    return null;
  }, [rounds, effectiveMyDistIds, effectiveMyMatchIds]);

  // Determine default expanded round: expand the round containing the viewer's match or Round 1
  const [expandedRounds, setExpandedRounds] = useState(() => {
    const initial = new Set();
    initial.add(0); // Round 1 open by default
    return initial;
  });

  const toggleRound = (idx) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  // Compact plan overview line
  const planOverview = useMemo(() => {
    return getCompactPlanOverview(rounds, totalSlots);
  }, [rounds, totalSlots]);

  // 1. Unpublished State (Short, calm empty state)
  if (!isPublished && !previewMode) {
    return (
      <div className={`w-full max-w-2xl mx-auto my-8 p-8 ${theme.cardBg} text-center space-y-3`}>
        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center mx-auto">
          <Clock className="w-5 h-5" />
        </div>
        <h2 className={`text-base font-bold ${theme.headingText}`}>
          Roadmap will be published soon
        </h2>
        <p className={`text-xs ${theme.mutedText} max-w-sm mx-auto`}>
          The tournament organizer is setting up the schedule and district allocations. Check back once live!
        </p>
      </div>
    );
  }

  // 2. Published but Empty Roadmap
  if (rounds.length === 0) {
    return (
      <div className={`w-full max-w-2xl mx-auto my-8 p-8 ${theme.cardBg} text-center space-y-3`}>
        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center mx-auto">
          <Calendar className="w-5 h-5" />
        </div>
        <h3 className={`text-base font-bold ${theme.headingText}`}>
          Schedule details pending
        </h3>
        <p className={`text-xs ${theme.mutedText} max-w-sm mx-auto`}>
          Rounds and district match times will appear here as soon as finalized by the organizer.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 px-2 sm:px-0">
      {/* Organizer Preview Banner */}
      {previewMode && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs">
          <div className="flex items-center gap-2 font-medium">
            <Eye className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Participant Preview Mode — Displaying public schedule.</span>
          </div>
          {onExitPreview && (
            <button
              type="button"
              onClick={onExitPreview}
              className="px-3 py-1 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 transition cursor-pointer text-xs"
            >
              Exit Preview
            </button>
          )}
        </div>
      )}

      {/* TOP STRIP: Tournament Quick Summary */}
      <div className={`p-4 rounded-xl ${theme.cardBg} space-y-3`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${theme.badgeNeutral}`}>
                {game}
              </span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Official Schedule
              </span>
            </div>
            <h1 className={`text-base sm:text-lg font-bold ${theme.headingText} tracking-tight`}>
              {tournamentTitle}
            </h1>
          </div>

          <div className="flex items-center gap-3 text-xs font-medium text-slate-600 dark:text-slate-300">
            <span><strong>{totalSlots}</strong> teams</span>
            <span className="opacity-40">·</span>
            <span><strong>{rounds.length}</strong> {rounds.length === 1 ? 'round' : 'rounds'}</span>
            <span className="opacity-40">·</span>
            <span><strong>{totalDistrictsCount}</strong> {totalDistrictsCount === 1 ? 'district' : 'districts'}</span>
          </div>
        </div>

        {/* Date Range & Progression Line */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          {dateRangeStr && (
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{dateRangeStr}</span>
            </div>
          )}

          {planOverview && (
            <div className={`font-mono text-xs font-semibold ${theme.accentText} flex items-center gap-1`}>
              <span>Plan:</span>
              <span className="text-slate-700 dark:text-slate-200">{planOverview}</span>
            </div>
          )}
        </div>
      </div>

      {/* YOUR NEXT MATCH CARD (Glanceable participant card) */}
      {myNextMatch && (
        <div className={`p-4 rounded-xl border-2 ${theme.isGold ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-400 dark:border-amber-600' : 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-500 dark:border-blue-600'} shadow-xs space-y-2`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-600 text-white">
                ★ Your Next Match
              </span>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                {myNextMatch.roundName} · {myNextMatch.districtName}
              </span>
            </div>

            {myNextMatch.match.credentials_available ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full">
                <Unlock className="w-3 h-3 text-emerald-600" />
                ID & Password Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <Lock className="w-3 h-3 text-slate-400" />
                Room Locked
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block">When</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {myNextMatch.date ? formatDateWithWeekdayIST(myNextMatch.date) : 'Date TBD'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Time</span>
              <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {formatTime12hIST(myNextMatch.match.start_time)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Map</span>
              <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-400" />
                {myNextMatch.match.map || 'Erangel'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Matches</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {myNextMatch.matchCount} {myNextMatch.matchCount === 1 ? 'match' : 'matches'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* VERTICAL TIMELINE OF ROUNDS */}
      <div className="space-y-3">
        {rounds.map((round, rIdx) => {
          const isGF =
            round.round_type === 'grand_final' ||
            (rIdx === rounds.length - 1 && rounds.length > 1) ||
            (round.name || '').toLowerCase().includes('grand final');

          const isExpanded = expandedRounds.has(rIdx);

          // Compute round date range
          const roundDates = (round.days || [])
            .map((d) => d.date)
            .filter(Boolean)
            .sort();
          const roundDateStr = roundDates.length > 0
            ? formatDateRangeIST(roundDates[0], roundDates[roundDates.length - 1])
            : 'Date TBD';

          // Advancement rule summary
          let ruleSummary = '';
          if (isGF) {
            ruleSummary = 'Championship Finale';
          } else if (round.advancement_type === 'per_district') {
            const perD = round.teams_advancing_per_district || 2;
            const dists = (round.days || []).reduce((acc, d) => acc + (d.allocations?.length || 0), 0) || 1;
            const totalAdv = round.teams_advancing || (perD * dists);
            ruleSummary = `Top ${perD} per district → ${totalAdv} advance`;
          } else {
            const totalAdv = round.teams_advancing || 16;
            ruleSummary = `Top ${totalAdv} overall advance`;
          }

          return (
            <div
              key={round.id || rIdx}
              className={`rounded-xl ${theme.cardBg} overflow-hidden transition-all duration-150`}
            >
              {/* Collapsible Round Card Header */}
              <button
                type="button"
                onClick={() => toggleRound(rIdx)}
                aria-expanded={isExpanded}
                className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition cursor-pointer min-h-[44px]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                      isGF
                        ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {isGF ? <Trophy className="w-4 h-4 text-amber-600 dark:text-amber-400" /> : rIdx + 1}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold ${theme.headingText} truncate`}>
                        {round.name || `Round ${round.round_number || rIdx + 1}`}
                      </span>
                      <span className={`text-[10px] font-semibold uppercase px-2 py-0.2 rounded-full ${isGF ? theme.badgeWarning : theme.badgeNeutral}`}>
                        {isGF ? 'Grand Finals' : 'Qualifiers'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      <span>{roundDateStr}</span>
                      <span className="opacity-40">·</span>
                      <span className="font-medium">{ruleSummary}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </button>

              {/* Inside Round: Days and District Rows */}
              {isExpanded && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3 space-y-4">
                  {(!round.days || round.days.length === 0) ? (
                    <div className={`p-4 text-center text-xs ${theme.mutedText}`}>
                      No match days scheduled for this round yet.
                    </div>
                  ) : (
                    round.days.map((day) => {
                      const dayAllocs = day.allocations || [];
                      const dayDateFormatted = day.date ? formatDateWithWeekdayIST(day.date) : 'Date TBD';

                      return (
                        <div key={day.id || day.day_number} className="space-y-2">
                          {/* Day Header */}
                          <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-100 dark:border-slate-800">
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              Day {day.day_number} — {dayDateFormatted}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {dayAllocs.length} {dayAllocs.length === 1 ? 'district' : 'districts'}
                            </span>
                          </div>

                          {/* District Rows */}
                          {dayAllocs.length === 0 ? (
                            <div className="py-2 text-center text-xs text-slate-400 italic">
                              No districts assigned to Day {day.day_number}.
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {dayAllocs.map((alloc, aIdx) => {
                                const distName = alloc.district_name || alloc.name || `District ${aIdx + 1}`;
                                const matches = alloc.matches && alloc.matches.length > 0
                                  ? alloc.matches
                                  : [{
                                      district_match_number: 1,
                                      start_time: '13:00',
                                      map: 'Erangel',
                                    }];

                                const isMyDistrict =
                                  effectiveMyDistIds.has(alloc.district_id) ||
                                  effectiveMyDistIds.has(alloc.id) ||
                                  effectiveMyDistIds.has(alloc.group_id) ||
                                  matches.some((m) => effectiveMyMatchIds.has(m.id) || effectiveMyMatchIds.has(m.match_id));

                                return (
                                  <div
                                    key={alloc.id || aIdx}
                                    className={`p-2.5 rounded-lg border transition-all ${
                                      isMyDistrict
                                        ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 shadow-2xs'
                                        : 'bg-slate-50/50 dark:bg-slate-800/20 border-slate-200/60 dark:border-slate-800'
                                    }`}
                                  >
                                    {matches.map((m, mIdx) => (
                                      <div
                                        key={m.id || mIdx}
                                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs ${
                                          mIdx > 0 ? 'pt-2 mt-2 border-t border-slate-200/50 dark:border-slate-800' : ''
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                                            {distName}
                                          </span>
                                          {isMyDistrict && (
                                            <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/60 px-2 py-0.2 rounded-full shrink-0">
                                              ★ Your district
                                            </span>
                                          )}
                                          {matches.length > 1 && (
                                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                                              Match {m.district_match_number || mIdx + 1}
                                            </span>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300 flex-wrap">
                                          <span className="tabular-nums font-semibold flex items-center gap-1">
                                            <Clock className="w-3 h-3 text-slate-400" />
                                            {formatTime12hIST(m.start_time)}
                                          </span>

                                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                            <MapPin className="w-2.5 h-2.5 text-slate-400" />
                                            {m.map || 'Erangel'}
                                          </span>

                                          <div className="text-right shrink-0">
                                            {m.credentials_available ? (
                                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                                <Unlock className="w-2.5 h-2.5 text-emerald-600" /> ID/Pass Active
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                                                <Lock className="w-2.5 h-2.5 text-slate-400" /> Locked
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
