import { useState } from 'react';
import {
  Clock,
  Calendar,
  Layers,
  MapPin,
  Lock,
  Unlock,
  Trophy,
  Shield,
  Eye,
  Info,
} from 'lucide-react';
import { getRoadmapTheme } from './RoadmapTheme';
import RoadmapPlanSummary from './RoadmapPlanSummary';

function formatTime12h(timeStr) {
  if (!timeStr) return 'TBD';
  const parts = timeStr.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return timeStr;
  const [h, m] = parts;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period} IST`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return 'Date TBD';
  try {
    const clean = String(dateStr).slice(0, 10);
    const parts = clean.split('-').map(Number);
    if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) return dateStr;
    const [y, m, d] = parts;
    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    const dd = String(d).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    return `${dayName}, ${dd}/${mm}/${y}`;
  } catch {
    return dateStr;
  }
}

export default function ParticipantRoadmapViewer({
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
  const [selectedRoundIdx, setSelectedRoundIdx] = useState(0);

  const effectiveMyDistIds = new Set([
    ...(Array.isArray(myDistrictIds) ? myDistrictIds : []),
    ...(Array.isArray(meta?.my_district_ids) ? meta.my_district_ids : []),
    ...(Array.isArray(meta?.myDistrictIds) ? meta.myDistrictIds : []),
  ]);
  const effectiveMyMatchIds = new Set([
    ...(Array.isArray(myMatchIds) ? myMatchIds : []),
    ...(Array.isArray(meta?.my_match_ids) ? meta.my_match_ids : []),
    ...(Array.isArray(meta?.myMatchIds) ? meta.myMatchIds : []),
  ]);

  // 1. Unpublished State
  if (!isPublished && !previewMode) {
    return (
      <div className="w-full max-w-3xl mx-auto my-6 sm:my-8 p-6 sm:p-12 bg-white border border-slate-200 rounded-2xl text-center shadow-xs">
        <div className="inline-flex p-3 sm:p-4 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 mb-4 sm:mb-5">
          <Clock className="w-8 h-8 sm:w-9 sm:h-9" />
        </div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-2 tracking-tight">
          Roadmap will be published soon
        </h2>
        <p className="text-slate-500 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
          The tournament organizer is setting up the round schedules and district match allocations. Check back once the roadmap goes live!
        </p>
      </div>
    );
  }

  // 2. Published but Empty Roadmap
  if (rounds.length === 0) {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6">
        {previewMode && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 sm:p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 shadow-xs">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 shrink-0" />
              <span className="font-semibold text-xs sm:text-sm">
                Participant Preview Mode — Showing how attendees see the live roadmap.
              </span>
            </div>
            {onExitPreview && (
              <button
                type="button"
                onClick={onExitPreview}
                className="w-full sm:w-auto text-center px-3.5 py-2 sm:py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition shadow-xs cursor-pointer"
              >
                Exit Preview
              </button>
            )}
          </div>
        )}

        <div className="p-6 sm:p-12 bg-white border border-slate-200 rounded-2xl text-center shadow-xs">
          <div className="inline-flex p-3.5 sm:p-4 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 mb-3 sm:mb-4">
            <Calendar className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-1">Schedule Details Pending</h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
            The tournament schedule has been published, but match rounds and district allocations are currently being finalized. Please check back shortly.
          </p>
        </div>
      </div>
    );
  }

  const activeRound = rounds[selectedRoundIdx] || rounds[0];
  const isGrandFinal =
    activeRound.round_type === 'grand_final' ||
    (selectedRoundIdx === rounds.length - 1 && rounds.length > 1) ||
    (activeRound.name || '').toLowerCase().includes('grand final');

  const totalSlots = meta.total_slots || meta.slotsTotal || 64;
  const totalDistricts = districts.length || meta.total_districts || meta.num_groups || 1;
  const game = meta.game || 'BGMI';

  return (
    <div className="w-full max-w-5xl mx-auto space-y-4 sm:space-y-5 px-1 sm:px-0">
      {/* Organizer Preview Banner */}
      {previewMode && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 sm:p-4 bg-amber-50 border border-amber-200/90 rounded-2xl text-amber-900 shadow-2xs">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold">
            <Eye className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Participant Preview Mode — Showing how attendees see the live roadmap.</span>
          </div>
          {onExitPreview && (
            <button
              type="button"
              onClick={onExitPreview}
              className="w-full sm:w-auto px-3.5 py-2 sm:py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition shadow-2xs cursor-pointer text-center"
            >
              Exit Preview
            </button>
          )}
        </div>
      )}

      {/* 1. Header Overview Bar */}
      <div className={`p-4 sm:p-5 rounded-2xl ${theme.cardBg} transition-all`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 sm:gap-4">
          <div className="w-full sm:w-auto">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${theme.badgeSuccess}`}>
                Official Schedule
              </span>
              <span className={`text-[11px] font-mono uppercase px-2 py-0.5 rounded ${theme.badgeNeutral}`}>
                Game: {game}
              </span>
            </div>
            <h1 className={`text-lg sm:text-2xl font-black ${theme.headingText} tracking-tight leading-snug`}>
              {tournamentTitle}
            </h1>
            <p className={`text-xs ${theme.mutedText} mt-0.5`}>
              Complete stage progression, match timeline, and lobby schedules.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-6 text-xs sm:text-sm w-full sm:w-auto border-t sm:border-t-0 border-slate-200/80 pt-3 sm:pt-0">
            <div className="bg-slate-50 sm:bg-transparent p-2 sm:p-0 rounded-xl text-center sm:text-right border sm:border-0 border-slate-200/80">
              <div className={`text-[10px] sm:text-[11px] font-bold ${theme.mutedText} uppercase tracking-wider`}>Capacity</div>
              <div className={`text-sm sm:text-lg font-black ${theme.headingText}`}>
                {totalSlots} Slots
              </div>
            </div>
            <div className="hidden sm:block w-px h-8 bg-slate-200/80" />
            <div className="bg-slate-50 sm:bg-transparent p-2 sm:p-0 rounded-xl text-center sm:text-right border sm:border-0 border-slate-200/80">
              <div className={`text-[10px] sm:text-[11px] font-bold ${theme.mutedText} uppercase tracking-wider`}>Districts</div>
              <div className={`text-sm sm:text-lg font-black ${theme.accentText}`}>
                {totalDistricts} {totalDistricts === 1 ? 'Lobby' : 'Lobbies'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Live Tournament Progression Plan */}
      <RoadmapPlanSummary
        rounds={rounds}
        meta={meta}
        cardColor={cardColor}
      />

      {/* 3. Main Roadmap Section (Single Container — Zero Nested Cards) */}
      <div className={`rounded-2xl ${theme.cardBg} overflow-hidden transition-all`}>
        {/* Section Header with Segmented Round Selector */}
        <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3.5">
          <div className="flex items-center gap-2 shrink-0">
            <Layers className={`w-4 h-4 ${theme.accentText}`} />
            <h2 className={`text-sm sm:text-base font-extrabold ${theme.headingText}`}>
              Match Stages & Timelines
            </h2>
          </div>

          {/* Compact Modern Segmented Tab Bar */}
          <div className="inline-flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/70 max-w-full overflow-x-auto no-scrollbar gap-1">
            {rounds.map((round, idx) => {
              const isSelected = idx === selectedRoundIdx;
              const isRoundGF =
                round.round_type === 'grand_final' ||
                (idx === rounds.length - 1 && rounds.length > 1) ||
                (round.name || '').toLowerCase().includes('grand final');

              return (
                <button
                  key={round.id || idx}
                  type="button"
                  onClick={() => setSelectedRoundIdx(idx)}
                  className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 flex items-center gap-1.5 shrink-0 cursor-pointer min-h-[34px] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    isSelected
                      ? theme.isGold
                        ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black shadow-xs'
                        : 'bg-white text-blue-600 shadow-xs font-bold border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60 font-semibold'
                  }`}
                >
                  {isRoundGF ? (
                    <Trophy className="w-3.5 h-3.5 text-amber-500" />
                  ) : (
                    <Shield className="w-3.5 h-3.5 opacity-60" />
                  )}
                  <span>{round.name || `Round ${round.round_number || idx + 1}`}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Schedule Subheading Bar */}
        <div className="flex items-center justify-between flex-wrap gap-2 px-4 sm:px-6 py-2.5 bg-slate-50/70 border-y border-slate-200/70">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Schedule for {activeRound.name || `Round ${activeRound.round_number}`}
          </span>
          {isGrandFinal && (
            <span className="text-[10px] sm:text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Trophy className="w-3 h-3 text-amber-600" />
              Final Championship Stage
            </span>
          )}
        </div>

        {/* Days & Match Rows Container */}
        {(!activeRound.days || activeRound.days.length === 0) ? (
          <div className={`p-8 text-center text-xs ${theme.mutedText}`}>
            No match days have been scheduled for this round yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-200/70">
            {activeRound.days.map((day) => {
              const dayAllocs = day.allocations || [];
              return (
                <div key={day.id || day.day_number} className="py-4 sm:py-5 first:pt-4 last:pb-4">
                  {/* Clean Day Header */}
                  <div className="px-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 pb-3">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200/60">
                        Day {day.day_number}
                      </span>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                        <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>{formatDateDisplay(day.date)}</span>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-slate-400">
                      {dayAllocs.length} {dayAllocs.length === 1 ? 'district scheduled' : 'districts scheduled'}
                    </span>
                  </div>

                  {/* Day's Districts and Matches */}
                  {dayAllocs.length === 0 ? (
                    <div className={`px-4 sm:px-6 py-4 text-center text-xs ${theme.mutedText} font-medium italic`}>
                      No districts scheduled on this day.
                    </div>
                  ) : (
                    <div>
                      {/* Desktop Table Header for fast scanning */}
                      <div className="hidden md:grid grid-cols-12 gap-3 px-6 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 bg-slate-50/40">
                        <div className="col-span-4">District / Lobby</div>
                        <div className="col-span-3">Scheduled Time</div>
                        <div className="col-span-3">Map</div>
                        <div className="col-span-2 text-right">Status</div>
                      </div>

                      {/* Compact District Rows List */}
                      <div className="divide-y divide-slate-100 px-2 sm:px-4">
                        {dayAllocs.map((alloc, aIdx) => {
                          const distName = alloc.district_name || alloc.name || `District ${aIdx + 1}`;
                          const matches = Array.isArray(alloc.matches) && alloc.matches.length > 0
                            ? alloc.matches
                            : [{
                                district_match_number: 1,
                                start_time: '13:00',
                                end_time: '13:30',
                                map: 'Erangel',
                                status: 'PENDING',
                              }];

                          const isMyDistrict = effectiveMyDistIds.has(alloc.district_id) ||
                            effectiveMyDistIds.has(alloc.id) ||
                            effectiveMyDistIds.has(alloc.group_id) ||
                            matches.some((m) => effectiveMyMatchIds.has(m.id) || effectiveMyMatchIds.has(m.match_id));

                          // Single-match district: render in a clean, unified row
                          if (matches.length === 1) {
                            const m = matches[0];
                            return (
                              <div
                                key={alloc.id || aIdx}
                                className={`py-2.5 px-3 rounded-xl transition-all duration-150 ${
                                  isMyDistrict
                                    ? 'bg-blue-50/80 dark:bg-blue-950/40 border-2 border-blue-500 shadow-xs ring-2 ring-blue-500/20'
                                    : `${theme.rowHover}`
                                }`}
                              >
                                {/* Desktop Row */}
                                <div className="hidden md:grid grid-cols-12 gap-3 items-center text-xs">
                                  {/* Col 1: District Name & Match identifier */}
                                  <div className="col-span-4 flex items-center gap-2 min-w-0">
                                    <Shield className={`w-3.5 h-3.5 ${isGrandFinal ? 'text-amber-500' : 'text-blue-600'} shrink-0`} />
                                    <span className={`font-bold ${theme.headingText} truncate`}>
                                      {distName}
                                    </span>
                                    {isMyDistrict && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-100 dark:bg-blue-900/60 dark:text-blue-200 border border-blue-300 dark:border-blue-700 px-2 py-0.5 rounded-full shrink-0 shadow-2xs">
                                        ★ Your match
                                      </span>
                                    )}
                                    <span className="text-slate-300">·</span>
                                    <span className={`font-mono text-[11px] font-bold ${isGrandFinal ? 'text-amber-600' : 'text-blue-600'} shrink-0`}>
                                      Match {m.district_match_number || 1}
                                    </span>
                                  </div>

                                  {/* Col 2: Scheduled time */}
                                  <div className="col-span-3 flex items-center gap-1.5 text-slate-700 font-semibold text-xs tabular-nums">
                                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <span>{formatTime12h(m.start_time)}</span>
                                  </div>

                                  {/* Col 3: Map */}
                                  <div className="col-span-3 flex items-center gap-1.5">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded">
                                      <MapPin className="w-3 h-3 text-emerald-600" />
                                      {m.map || 'Erangel'}
                                    </span>
                                  </div>

                                  {/* Col 4: Status */}
                                  <div className="col-span-2 flex items-center justify-end">
                                    {m.credentials_available ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                        <Unlock className="w-3 h-3 text-emerald-600" /> ID/Pass Active
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500" title="Room credentials will unlock before match start">
                                        <Lock className="w-3 h-3 text-slate-400" /> Locked
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Mobile Row (compact, cardless, no horizontal overflow) */}
                                <div className="md:hidden space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <Shield className={`w-3.5 h-3.5 ${isGrandFinal ? 'text-amber-500' : 'text-blue-600'} shrink-0`} />
                                      <span className={`text-xs font-black ${theme.headingText} truncate`}>{distName}</span>
                                      {isMyDistrict && (
                                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-blue-700 bg-blue-100 dark:bg-blue-900/60 dark:text-blue-200 border border-blue-300 dark:border-blue-700 px-1.5 py-0.2 rounded-full shrink-0">
                                          ★ Your match
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded shrink-0">
                                      1 Match
                                    </span>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs pt-0.5">
                                    <span className={`font-mono text-[11px] font-bold ${isGrandFinal ? 'text-amber-600' : 'text-blue-600'}`}>
                                      Match {m.district_match_number || 1}
                                    </span>
                                    <span className="text-slate-300">·</span>
                                    <span className="font-semibold text-slate-700 text-[11px] tabular-nums">
                                      {formatTime12h(m.start_time)}
                                    </span>
                                    <span className="text-slate-300">·</span>
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.2 rounded">
                                      <MapPin className="w-2.5 h-2.5 text-emerald-600" />
                                      {m.map || 'Erangel'}
                                    </span>
                                    <span className="text-slate-300">·</span>
                                    {m.credentials_available ? (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                        <Unlock className="w-2.5 h-2.5 text-emerald-600" /> ID/Pass Active
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                                        <Lock className="w-2.5 h-2.5 text-slate-400" /> Locked
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Match Notes if any */}
                                {m.notes && (
                                  <div className="text-[10px] text-slate-500 italic pt-1 pl-5 sm:pl-6 flex items-center gap-1">
                                    <Info className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span>{m.notes}</span>
                                  </div>
                                )}
                              </div>
                            );
                          }

                          // Multi-match District: compact district header + sub-rows
                          return (
                            <div
                              key={alloc.id || aIdx}
                              className={`py-2.5 px-3 rounded-xl transition-all duration-150 space-y-1.5 ${
                                isMyDistrict
                                  ? 'bg-blue-50/80 dark:bg-blue-950/40 border-2 border-blue-500 shadow-xs ring-2 ring-blue-500/20'
                                  : `${theme.rowHover}`
                              }`}
                            >
                              {/* District Heading Row */}
                              <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-100">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`text-xs font-black ${theme.headingText} flex items-center gap-1.5 truncate`}>
                                    <Shield className={`w-3.5 h-3.5 ${isGrandFinal ? 'text-amber-500' : 'text-blue-600'} shrink-0`} />
                                    <span>{distName}</span>
                                  </span>
                                  {isMyDistrict && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-100 dark:bg-blue-900/60 dark:text-blue-200 border border-blue-300 dark:border-blue-700 px-2 py-0.5 rounded-full shrink-0 shadow-2xs">
                                      ★ Your match
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">
                                  {matches.length} Matches
                                </span>
                              </div>

                              {/* Matches sub-rows */}
                              <div className="space-y-1 sm:space-y-0.5">
                                {matches.map((m, mIdx) => (
                                  <div key={m.id || mIdx} className="py-1">
                                    {/* Desktop Row */}
                                    <div className="hidden md:grid grid-cols-12 gap-3 items-center text-xs">
                                      <div className="col-span-4 pl-5 flex items-center gap-2">
                                        <span className={`font-mono text-[11px] font-bold ${isGrandFinal ? 'text-amber-600' : 'text-blue-600'}`}>
                                          Match {m.district_match_number || mIdx + 1}
                                        </span>
                                      </div>
                                      <div className="col-span-3 flex items-center gap-1.5 text-slate-700 font-semibold text-xs tabular-nums">
                                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                        <span>{formatTime12h(m.start_time)}</span>
                                      </div>
                                      <div className="col-span-3 flex items-center gap-1.5">
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded">
                                          <MapPin className="w-3 h-3 text-emerald-600" />
                                          {m.map || 'Erangel'}
                                        </span>
                                      </div>
                                      <div className="col-span-2 flex items-center justify-end">
                                        {m.credentials_available ? (
                                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                            <Unlock className="w-3 h-3 text-emerald-600" /> ID/Pass Active
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                                            <Lock className="w-3 h-3 text-slate-400" /> Locked
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Mobile Row */}
                                    <div className="md:hidden flex flex-wrap items-center gap-x-2 gap-y-1 text-xs pl-2">
                                      <span className={`font-mono text-[11px] font-bold ${isGrandFinal ? 'text-amber-600' : 'text-blue-600'}`}>
                                        Match {m.district_match_number || mIdx + 1}
                                      </span>
                                      <span className="text-slate-300">·</span>
                                      <span className="font-semibold text-slate-700 text-[11px] tabular-nums">
                                        {formatTime12h(m.start_time)}
                                      </span>
                                      <span className="text-slate-300">·</span>
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.2 rounded">
                                        <MapPin className="w-2.5 h-2.5 text-emerald-600" />
                                        {m.map || 'Erangel'}
                                      </span>
                                      <span className="text-slate-300">·</span>
                                      {m.credentials_available ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                          <Unlock className="w-2.5 h-2.5 text-emerald-600" /> ID/Pass Active
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500">
                                          <Lock className="w-2.5 h-2.5 text-slate-400" /> Locked
                                        </span>
                                      )}
                                    </div>

                                    {m.notes && (
                                      <div className="text-[10px] text-slate-500 italic pt-0.5 pl-6 flex items-center gap-1">
                                        <Info className="w-3 h-3 text-slate-400 shrink-0" />
                                        <span>{m.notes}</span>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
