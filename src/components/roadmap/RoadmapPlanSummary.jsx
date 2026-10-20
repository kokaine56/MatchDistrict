import React from 'react';
import { ArrowRight, Trophy, AlertTriangle, CheckCircle2, ShieldCheck, Info } from 'lucide-react';
import { getRoadmapTheme } from './RoadmapTheme';

export default function RoadmapPlanSummary({ rounds = [], meta = {}, cardColor = 'white' }) {
  const theme = getRoadmapTheme(cardColor);

  if (!rounds || rounds.length === 0) {
    return null;
  }

  // Calculate live progression chain
  let previousQualifiers = null;
  let previousRoundName = null;

  const summaryItems = rounds.map((round, rIdx) => {
    const isGrandFinal = round.round_type === 'grand_final' || rIdx === rounds.length - 1 && rounds.length > 1;
    const roundName = round.name || `Round ${round.round_number || rIdx + 1}`;
    
    // Count unique districts allocated across all days of this round
    const districtIds = new Set();
    (round.days || []).forEach((d) => {
      (d.allocations || []).forEach((a) => {
        if (a.district_id || a.id) districtIds.add(a.district_id || a.id);
      });
    });
    const districtCount = districtIds.size || 1;

    // Incoming team count: planned teams_in or fallback
    let teamsIn = round.teams_in != null ? Number(round.teams_in) : null;
    if (teamsIn == null) {
      if (rIdx === 0) {
        teamsIn = Number(meta.total_slots || meta.slotsTotal || districtCount * (meta.teams_per_group || 16));
      } else {
        teamsIn = previousQualifiers || (districtCount * (meta.teams_per_group || 16));
      }
    }

    // Qualification calculation
    let qualifyCount = 0;
    let ruleDescription = '';

    if (isGrandFinal) {
      qualifyCount = 0;
      ruleDescription = 'Championship Finale';
    } else {
      const advType = round.advancement_type || 'per_district';
      if (advType === 'per_district') {
        const perDist = Number(round.teams_advancing_per_district) || 2;
        qualifyCount = districtCount * perDist;
        ruleDescription = `top ${perDist} per district (${districtCount} districts)`;
      } else if (advType === 'overall' || advType === 'round_total') {
        qualifyCount = Number(round.teams_advancing) || 16;
        ruleDescription = `top ${qualifyCount} overall`;
      } else if (advType === 'manual') {
        qualifyCount = Number(round.teams_advancing) || 16;
        ruleDescription = `organizer pick (${qualifyCount} teams)`;
      } else {
        qualifyCount = Number(round.teams_advancing) || 16;
        ruleDescription = `top ${qualifyCount}`;
      }
    }

    const eliminatedCount = isGrandFinal ? 0 : Math.max(0, teamsIn - qualifyCount);

    // Mismatch warning check
    let mismatchWarning = null;
    if (rIdx > 0 && previousQualifiers != null && previousQualifiers > 0 && teamsIn !== previousQualifiers) {
      mismatchWarning = `Planned for ${teamsIn} incoming teams, but "${previousRoundName}" qualifies ${previousQualifiers} teams.`;
    }

    previousQualifiers = qualifyCount;
    previousRoundName = roundName;

    return {
      roundNumber: round.round_number || rIdx + 1,
      roundName,
      isGrandFinal,
      teamsIn,
      districtCount,
      qualifyCount,
      eliminatedCount,
      ruleDescription,
      mismatchWarning,
    };
  });

  return (
    <div className={`p-4 sm:p-5 rounded-2xl ${theme.cardBg} transition-all`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-700/40">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-xl ${theme.isGold ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`text-sm sm:text-base ${theme.headingText} tracking-wide`}>
                TOURNAMENT PLAN
              </h3>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${theme.badgeNeutral}`}>
                Pre-Tournament Structure
              </span>
            </div>
            <p className={`text-xs ${theme.mutedText}`}>
              Structure and progression rules planned before tournament execution. Never tied to real-time registrations or results.
            </p>
          </div>
        </div>
      </div>

      {/* Progression Steps Flow */}
      <div className="space-y-3">
        {summaryItems.map((item, idx) => (
          <div
            key={idx}
            className={`p-3.5 sm:p-4 rounded-xl ${theme.innerCardBg} flex flex-col md:flex-row items-start md:items-center justify-between gap-3 transition-all`}
          >
            {/* Round & Teams In */}
            <div className="flex items-center gap-3 min-w-[200px]">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${
                  item.isGrandFinal
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/30'
                    : theme.isGold
                    ? 'bg-amber-950/80 text-amber-300 border border-amber-500/30'
                    : 'bg-slate-800 text-cyan-400 border border-cyan-500/30'
                }`}
              >
                {item.isGrandFinal ? <Trophy className="w-4 h-4" /> : item.roundNumber}
              </div>
              <div>
                <div className={`font-bold text-sm ${theme.headingText}`}>{item.roundName}</div>
                <div className={`text-xs ${theme.mutedText}`}>
                  <span className="font-semibold text-slate-100">{item.teamsIn}</span> teams in ·{' '}
                  <span className="font-semibold text-slate-100">{item.districtCount}</span> {item.districtCount === 1 ? 'district' : 'districts'}
                </div>
              </div>
            </div>

            {/* Transition Arrow / Rule */}
            <div className="flex-1 w-full md:w-auto flex items-center justify-start md:justify-center gap-2 py-1">
              {!item.isGrandFinal ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`px-2.5 py-1 rounded-md font-medium ${theme.isGold ? 'bg-amber-950/50 text-amber-200 border border-amber-500/20' : 'bg-slate-800/80 text-slate-300 border border-slate-700/60'}`}>
                    {item.ruleDescription}
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-500 shrink-0 hidden sm:block" />
                  <span className="px-2 py-0.5 rounded font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30">
                    {item.qualifyCount} qualify
                  </span>
                  <span className="text-slate-500 font-mono text-[11px]">·</span>
                  <span className="px-2 py-0.5 rounded font-bold text-rose-400 bg-rose-950/40 border border-rose-500/30">
                    {item.eliminatedCount} eliminated
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-3 py-1 rounded-md font-bold text-amber-400 bg-amber-950/40 border border-amber-500/30 flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    Final Championship Battle
                  </span>
                </div>
              )}
            </div>

            {/* Mismatch Warning Alert if any */}
            {item.mismatchWarning && (
              <div className="w-full md:w-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/50 border border-amber-500/40 text-amber-300 text-xs font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>{item.mismatchWarning}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
