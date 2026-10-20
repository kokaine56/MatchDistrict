import React, { useState } from 'react';
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
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
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
}) {
  const theme = getRoadmapTheme(cardColor);
  const [selectedRoundIdx, setSelectedRoundIdx] = useState(0);

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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 sm:p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 shadow-xs">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold">
            <Eye className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Participant Preview Mode — Showing how attendees see the live roadmap.</span>
          </div>
          {onExitPreview && (
            <button
              type="button"
              onClick={onExitPreview}
              className="w-full sm:w-auto px-3.5 py-2 sm:py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition shadow-xs cursor-pointer text-center"
            >
              Exit Preview
            </button>
          )}
        </div>
      )}

      {/* 1. Header Overview Card */}
      <div className={`p-4 sm:p-6 rounded-2xl ${theme.cardBg} transition-all`}>
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

          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-6 text-xs sm:text-sm w-full sm:w-auto border-t sm:border-t-0 border-slate-200 pt-3 sm:pt-0">
            <div className="bg-slate-50 sm:bg-transparent p-2 sm:p-0 rounded-xl text-center sm:text-right border sm:border-0 border-slate-200/80">
              <div className={`text-[10px] sm:text-[11px] font-bold ${theme.mutedText} uppercase tracking-wider`}>Capacity</div>
              <div className={`text-sm sm:text-lg font-black ${theme.headingText}`}>
                {totalSlots} Slots
              </div>
            </div>
            <div className="hidden sm:block w-px h-8 bg-slate-200" />
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

      {/* 3. Round Selection Tabs & Match Stages */}
      <div className={`p-3.5 sm:p-5 rounded-2xl ${theme.cardBg} space-y-4 sm:space-y-5`}>
        <div className="flex items-center gap-2 pb-2.5 border-b border-slate-200">
          <Layers className={`w-4 h-4 ${theme.accentText}`} />
          <h2 className={`text-sm sm:text-base font-extrabold ${theme.headingText}`}>
            Match Stages & Timelines
          </h2>
        </div>

        {/* Round Tabs with Mobile Horizontal Swipe / Scroll */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1.5 sm:flex-wrap">
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
                className={`px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer min-h-[38px] ${
                  isSelected
                    ? `${theme.primaryBtn} shadow-sm`
                    : `${theme.secondaryBtn}`
                }`}
              >
                {isRoundGF ? (
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <Shield className="w-3.5 h-3.5 opacity-70" />
                )}
                <span>{round.name || `Round ${round.round_number || idx + 1}`}</span>
              </button>
            );
          })}
        </div>

        {/* 4. Active Round Schedule & Days List */}
        <div className="space-y-3.5 sm:space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 pt-0.5">
            <span className={`text-[11px] sm:text-xs font-bold ${theme.mutedText} uppercase tracking-wider`}>
              Schedule for {activeRound.name || `Round ${activeRound.round_number}`}
            </span>
            {isGrandFinal && (
              <span className="text-[10px] sm:text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                Final Championship Stage
              </span>
            )}
          </div>

          {(!activeRound.days || activeRound.days.length === 0) ? (
            <div className={`p-6 rounded-xl ${theme.innerCardBg} text-center text-xs ${theme.mutedText}`}>
              No match days have been scheduled for this round yet.
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {activeRound.days.map((day) => {
                const dayAllocs = day.allocations || [];
                return (
                  <div
                    key={day.id || day.day_number}
                    className={`p-3.5 sm:p-5 rounded-2xl ${theme.innerCardBg} space-y-3`}
                  >
                    {/* Day Header with formatted date */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200 gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 font-black text-xs flex items-center justify-center">
                          {day.day_number}
                        </span>
                        <span className={`text-sm font-black ${theme.headingText}`}>
                          Day {day.day_number}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                        <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>{formatDateDisplay(day.date)}</span>
                      </div>
                    </div>

                    {/* Districts Allocated to this Day */}
                    {dayAllocs.length === 0 ? (
                      <div className={`p-4 rounded-xl text-center text-xs ${theme.mutedText}`}>
                        No districts scheduled on this day.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {dayAllocs.map((alloc, aIdx) => {
                          const distName = alloc.district_name || alloc.name || `District ${aIdx + 1}`;
                          const matches = Array.isArray(alloc.matches) && alloc.matches.length > 0
                            ? alloc.matches
                            : [{
                                start_time: '13:00',
                                end_time: '13:30',
                                map: 'Erangel',
                                status: 'PENDING',
                              }];

                          return (
                            <div
                              key={alloc.id || aIdx}
                              className="p-3 sm:p-3.5 rounded-xl bg-white border border-slate-200 space-y-2.5 shadow-2xs hover:border-slate-300 transition"
                            >
                              {/* District Name and match count */}
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-xs font-black ${theme.headingText} flex items-center gap-1.5`}>
                                  <Shield className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                                  <span className="truncate">{distName}</span>
                                </span>
                                <span className="text-[10px] sm:text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
                                  {matches.length} {matches.length === 1 ? 'Match' : 'Matches'}
                                </span>
                              </div>

                              {/* Matches Timeline */}
                              <div className="space-y-1.5 pt-0.5">
                                {matches.map((m, mIdx) => (
                                  <div
                                    key={m.id || mIdx}
                                    className="p-2 sm:p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs flex flex-wrap items-center justify-between gap-2"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-[11px] font-bold text-blue-600">
                                        Match {m.district_match_number || mIdx + 1}
                                      </span>
                                      <span className="text-slate-700 font-semibold text-[11px]">
                                        {formatTime12h(m.start_time)}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5 sm:gap-2">
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                                        <MapPin className="w-3 h-3" />
                                        {m.map || 'Erangel'}
                                      </span>

                                      {/* Credentials Lock Indicator */}
                                      {m.credentials_available ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded border border-emerald-300">
                                          <Unlock className="w-3 h-3 text-emerald-600" /> ID/Pass Active
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500" title="Room credentials will unlock before match start">
                                          <Lock className="w-3 h-3 text-slate-400" /> Locked
                                        </span>
                                      )}
                                    </div>

                                    {/* District Notes if any */}
                                    {m.notes && (
                                      <div className="w-full text-[10px] text-slate-500 italic pt-1 flex items-center gap-1 border-t border-slate-200">
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
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
