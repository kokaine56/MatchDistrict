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
      <div className="w-full max-w-3xl mx-auto my-8 p-8 sm:p-12 bg-white border border-[#E4E7EC] rounded-2xl text-center shadow-xs">
        <div className="inline-flex p-4 rounded-2xl bg-blue-50 border border-blue-100 text-[#2563EB] mb-5">
          <Clock className="w-9 h-9" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-[#172033] mb-2 tracking-tight">
          Roadmap will be published soon
        </h2>
        <p className="text-[#667085] text-sm sm:text-base max-w-md mx-auto leading-relaxed">
          The tournament organizer is setting up the round schedules and district match allocations. Check back once the roadmap goes live!
        </p>
      </div>
    );
  }

  // 2. Published but Empty Roadmap
  if (rounds.length === 0) {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-6">
        {previewMode && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 shadow-xs">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-amber-600 shrink-0" />
              <span className="font-semibold text-xs sm:text-sm">
                Participant Preview Mode — Showing how attendees see the live roadmap.
              </span>
            </div>
            {onExitPreview && (
              <button
                type="button"
                onClick={onExitPreview}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition shadow-xs cursor-pointer"
              >
                Exit Preview
              </button>
            )}
          </div>
        )}

        <div className="p-8 sm:p-12 bg-white border border-[#E4E7EC] rounded-2xl text-center shadow-xs">
          <div className="inline-flex p-4 rounded-2xl bg-blue-50 border border-blue-100 text-[#2563EB] mb-4">
            <Calendar className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-[#172033] mb-1">Schedule Details Pending</h3>
          <p className="text-xs sm:text-sm text-[#667085] max-w-md mx-auto">
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
    <div className="w-full max-w-5xl mx-auto space-y-5">
      {/* Organizer Preview Banner */}
      {previewMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300 shadow-xs">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold">
            <Eye className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Participant Preview Mode — Showing how attendees see the live roadmap.</span>
          </div>
          {onExitPreview && (
            <button
              type="button"
              onClick={onExitPreview}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition shadow-xs cursor-pointer"
            >
              Exit Preview
            </button>
          )}
        </div>
      )}

      {/* 1. Header Overview Card */}
      <div className={`p-4 sm:p-6 rounded-2xl ${theme.cardBg} transition-all`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${theme.badgeSuccess}`}>
                Official Tournament Schedule
              </span>
              <span className={`text-xs font-mono uppercase px-2 py-0.5 rounded ${theme.badgeNeutral}`}>
                Game: {game}
              </span>
            </div>
            <h1 className={`text-xl sm:text-2xl font-black ${theme.headingText} tracking-tight`}>
              {tournamentTitle}
            </h1>
            <p className={`text-xs ${theme.mutedText} mt-0.5`}>
              Complete stage progression, match timeline, and lobby schedules.
            </p>
          </div>

          <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm self-stretch sm:self-auto justify-around sm:justify-end border-t sm:border-t-0 border-slate-700/40 pt-3 sm:pt-0">
            <div className="text-center sm:text-right">
              <div className={`text-[11px] font-bold ${theme.mutedText} uppercase tracking-wider`}>Total Capacity</div>
              <div className={`text-base sm:text-lg font-black ${theme.headingText}`}>
                {totalSlots} Slots
              </div>
            </div>
            <div className="w-px h-8 bg-slate-700/40" />
            <div className="text-center sm:text-right">
              <div className={`text-[11px] font-bold ${theme.mutedText} uppercase tracking-wider`}>Districts</div>
              <div className={`text-base sm:text-lg font-black ${theme.accentText}`}>
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

      {/* 3. Round Selection Tabs */}
      <div className={`p-4 sm:p-5 rounded-2xl ${theme.cardBg} space-y-5`}>
        <div className="flex items-center gap-2 pb-2 border-b border-slate-700/40">
          <Layers className={`w-4 h-4 ${theme.accentText}`} />
          <h2 className={`text-base font-extrabold ${theme.headingText}`}>
            Match Stages & Timelines
          </h2>
        </div>

        {/* Round Tabs */}
        <div className="flex flex-wrap items-center gap-2">
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
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? `${theme.primaryBtn} shadow-sm`
                    : `${theme.secondaryBtn}`
                }`}
              >
                {isRoundGF ? (
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Shield className="w-3.5 h-3.5 opacity-70" />
                )}
                <span>{round.name || `Round ${round.round_number || idx + 1}`}</span>
              </button>
            );
          })}
        </div>

        {/* 4. Active Round Schedule & Days List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
            <span className={`text-xs font-bold ${theme.mutedText} uppercase tracking-wider`}>
              Schedule for {activeRound.name || `Round ${activeRound.round_number}`}
            </span>
            {isGrandFinal && (
              <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                Final Championship Stage
              </span>
            )}
          </div>

          {(!activeRound.days || activeRound.days.length === 0) ? (
            <div className={`p-6 rounded-xl ${theme.innerCardBg} text-center text-xs ${theme.mutedText}`}>
              No match days have been scheduled for this round yet.
            </div>
          ) : (
            <div className="space-y-4">
              {activeRound.days.map((day) => {
                const dayAllocs = day.allocations || [];
                return (
                  <div
                    key={day.id || day.day_number}
                    className={`p-4 sm:p-5 rounded-2xl ${theme.innerCardBg} border border-slate-700/30 space-y-3.5`}
                  >
                    {/* Day Header with formatted date */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2.5 border-b border-slate-700/40 gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 font-black text-xs flex items-center justify-center">
                          {day.day_number}
                        </span>
                        <span className={`text-sm font-black ${theme.headingText}`}>
                          Day {day.day_number}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                        <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>{formatDateDisplay(day.date)}</span>
                      </div>
                    </div>

                    {/* Districts Allocated to this Day */}
                    {dayAllocs.length === 0 ? (
                      <div className={`p-4 rounded-xl text-center text-xs ${theme.mutedText}`}>
                        No districts scheduled on this day.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
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
                              className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/50 space-y-2.5 shadow-2xs hover:border-slate-600 transition"
                            >
                              {/* District Name and match count */}
                              <div className="flex items-center justify-between">
                                <span className={`text-xs font-black ${theme.headingText} flex items-center gap-1.5`}>
                                  <Shield className="w-3.5 h-3.5 text-blue-400" />
                                  <span>{distName}</span>
                                </span>
                                <span className="text-[11px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md border border-slate-700">
                                  {matches.length} {matches.length === 1 ? 'Match' : 'Matches'}
                                </span>
                              </div>

                              {/* Matches Timeline */}
                              <div className="space-y-1.5 pt-1">
                                {matches.map((m, mIdx) => (
                                  <div
                                    key={m.id || mIdx}
                                    className="p-2 rounded-lg bg-slate-800/70 border border-slate-700/40 text-xs flex flex-wrap items-center justify-between gap-2"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-[11px] font-bold text-blue-400 w-14">
                                        Match {m.district_match_number || mIdx + 1}
                                      </span>
                                      <span className="text-slate-300 font-semibold text-[11px]">
                                        {formatTime12h(m.start_time)}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded">
                                        <MapPin className="w-3 h-3" />
                                        {m.map || 'Erangel'}
                                      </span>

                                      {/* Credentials Lock Indicator */}
                                      {m.credentials_available ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                                          <Unlock className="w-3 h-3" /> ID/Pass Active
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500" title="Room credentials will unlock before match start">
                                          <Lock className="w-3 h-3" /> Credentials Locked
                                        </span>
                                      )}
                                    </div>

                                    {/* District Notes if any */}
                                    {m.notes && (
                                      <div className="w-full text-[10px] text-slate-400 italic pt-0.5 flex items-center gap-1 border-t border-slate-700/30">
                                        <Info className="w-3 h-3 text-slate-500 shrink-0" />
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
