import { ArrowRight, Trophy, AlertTriangle } from 'lucide-react';
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
    const isGrandFinal = round.round_type === 'grand_final' || (rIdx === rounds.length - 1 && rounds.length > 1);
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
        const distLabel = districtCount === 1 ? 'district' : 'districts';
        ruleDescription = `top ${perDist} per district (${districtCount} ${distLabel})`;
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
      <div className="flex flex-wrap items-center justify-between gap-2.5 mb-3.5 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl ${theme.isGold ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
            <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className={`text-xs sm:text-sm ${theme.headingText} tracking-wide`}>
                TOURNAMENT PLAN
              </h3>
              <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${theme.badgeNeutral}`}>
                Pre-Tournament Structure
              </span>
            </div>
            <p className={`text-[11px] sm:text-xs ${theme.mutedText} mt-0.5`}>
              Planned round progression rules. Independent of live registrations.
            </p>
          </div>
        </div>
      </div>

      {/* Progression Steps Flow */}
      <div className="divide-y divide-slate-100">
        {summaryItems.map((item, idx) => (
          <div
            key={idx}
            className={`py-2.5 sm:py-3 px-2 sm:px-3 rounded-lg ${theme.rowHover} flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5 transition-colors`}
          >
            {/* Round & Teams In */}
            <div className="flex items-center gap-3 w-full md:w-auto min-w-[210px]">
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                  item.isGrandFinal
                    ? 'bg-amber-500 text-slate-950 shadow-2xs'
                    : theme.isGold
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-blue-100 text-blue-700 font-black'
                }`}
              >
                {item.isGrandFinal ? <Trophy className="w-4 h-4" /> : item.roundNumber}
              </div>
              <div className="min-w-0">
                <div className={`font-bold text-xs sm:text-sm ${theme.headingText} truncate`}>{item.roundName}</div>
                <div className={`text-[11px] sm:text-xs ${theme.mutedText}`}>
                  <span className="font-bold text-slate-800">{item.teamsIn}</span> teams in ·{' '}
                  <span className="font-semibold text-slate-800">{item.districtCount}</span> {item.districtCount === 1 ? 'district' : 'districts'}
                </div>
              </div>
            </div>

            {/* Transition Arrow / Rule */}
            <div className="w-full md:w-auto flex items-center justify-start md:justify-center gap-2">
              {!item.isGrandFinal ? (
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
                  <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${theme.isGold ? 'bg-amber-50 text-amber-900 border border-amber-200' : 'bg-slate-100 text-slate-700 border border-slate-200/80'}`}>
                    {item.ruleDescription}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:block" />
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                    {item.qualifyCount} qualify
                  </span>
                  <span className="text-slate-400 font-mono text-[10px]">·</span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200">
                    {item.eliminatedCount} out
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-3 py-1 rounded-md font-bold text-amber-900 bg-amber-50 border border-amber-200 flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-amber-600" />
                    Championship Final
                  </span>
                </div>
              )}
            </div>

            {/* Mismatch Warning Alert if any */}
            {item.mismatchWarning && (
              <div className="w-full md:w-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-medium">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                <span>{item.mismatchWarning}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
