import crypto from 'crypto';

export function getDefaultMap(game, matchNumber) {
  const gameKey = (game || 'bgmi').toLowerCase().trim();
  const DEFAULT_MAPS = {
    bgmi: ['Erangel', 'Miramar', 'Rondo', 'Sanhok', 'Vikendi', 'Livik', 'Karakin', 'Nusa'],
    'battlegrounds mobile india': ['Erangel', 'Miramar', 'Rondo', 'Sanhok', 'Vikendi', 'Livik', 'Karakin', 'Nusa'],
    freefire: ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NexTerra'],
    'free fire': ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NexTerra'],
    codm: ['Crash', 'Standoff', 'Raid', 'Crossfire', 'Summit'],
    'cod mobile': ['Crash', 'Standoff', 'Raid', 'Crossfire', 'Summit'],
    valorant: ['Ascent', 'Haven', 'Bind', 'Split', 'Sunset'],
  };
  const maps = DEFAULT_MAPS[gameKey] || DEFAULT_MAPS.bgmi;
  return maps[(Math.max(1, matchNumber) - 1) % maps.length] || 'Erangel';
}

export function computeReleaseTime12h(timeStr, offsetMinutes = 15) {
  if (!timeStr) return '';
  const parts = timeStr.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return '';
  let mins = parts[0] * 60 + parts[1] - offsetMinutes;
  if (mins < 0) mins += 1440;
  const relH = Math.floor(mins / 60) % 24;
  const relM = mins % 60;
  const period = relH >= 12 ? 'PM' : 'AM';
  const hour12 = relH % 12 === 0 ? 12 : relH % 12;
  return `${String(hour12).padStart(2, '0')}:${String(relM).padStart(2, '0')} ${period}`;
}

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

function formatTime(mins) {
  const h = Math.floor(Math.abs(mins) / 60) % 24;
  const m = Math.abs(mins) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseTimeMins(timeStr) {
  if (!timeStr) return 13 * 60; // 1:00 PM default
  const parts = timeStr.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 13 * 60;
  return parts[0] * 60 + parts[1];
}

function addDays(dateStr, n) {
  if (!dateStr) return null;
  try {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const base = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
    base.setUTCDate(base.getUTCDate() + n);
    return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

const DEFAULT_START_TIME = '13:00';
const MATCH_GAP_MINUTES = 60;
const GRAND_FINAL_MATCHES = 3;

export function calculateQualifiers(matchSize) {
  return Math.ceil(matchSize / 2);
}

export function calculateProgressionPlan(totalTeams, maxCapacity, teamsPerGroup = 16) {
  const rounds = [];
  const tpg = Number(teamsPerGroup) || 16;
  const canonicalCapacity = tpg;
  
  // Round 1: strictly map initial registration groups (teams_per_group) to Round 1 matches
  const numGroups = Math.max(1, Math.ceil(totalTeams / tpg));
  const baseSize = Math.floor(totalTeams / numGroups);
  const extraSize = totalTeams % numGroups;
  
  const r1MatchSizes = [];
  for (let i = 0; i < numGroups; i++) {
    r1MatchSizes.push(baseSize + (i < extraSize ? 1 : 0));
  }
  
  const r1Qualifiers = r1MatchSizes.map(size => calculateQualifiers(size));
  const r1NextTeams = r1Qualifiers.reduce((a, b) => a + b, 0);
  const r1QType = (r1NextTeams <= canonicalCapacity) ? 'final_elimination' : 'normal';

  rounds.push({
    roundNumber: 1,
    matchCount: numGroups,
    matchSizes: r1MatchSizes,
    qualifiersPerMatch: r1Qualifiers,
    totalTeamsBefore: totalTeams,
    totalTeamsAfter: r1NextTeams,
    qualificationType: r1QType
  });

  let currentTeams = r1NextTeams;
  let roundNumber = 2;

  // Subsequent rounds: redistribute qualified teams into match rooms up to canonicalCapacity
  while (currentTeams > canonicalCapacity) {
    let numMatches = Math.ceil(currentTeams / canonicalCapacity);
    
    let base = Math.floor(currentTeams / numMatches);
    let extra = currentTeams % numMatches;
    let matchSizes = [];
    for (let i = 0; i < numMatches; i++) matchSizes.push(base + (i < extra ? 1 : 0));
    
    let qualifyCounts = matchSizes.map(size => calculateQualifiers(size));
    let nextTeams = qualifyCounts.reduce((a, b) => a + b, 0);
    
    let qType = (nextTeams <= canonicalCapacity) ? 'final_elimination' : 'normal';

    rounds.push({
      roundNumber,
      matchCount: numMatches,
      matchSizes,
      qualifiersPerMatch: qualifyCounts,
      totalTeamsBefore: currentTeams,
      totalTeamsAfter: nextTeams,
      qualificationType: qType
    });
    
    currentTeams = nextTeams;
    roundNumber++;
  }
  return rounds;
}

export function generateTournamentRoadmap(param1, legacyPlan, legacyTourn) {
  try {
    let tournament = {};
    if (param1 && typeof param1 === 'object') {
      tournament = { ...tournament, ...param1 };
    }
    if (legacyPlan && typeof legacyPlan === 'object') {
      tournament = { ...tournament, ...legacyPlan };
    }
    if (legacyTourn && typeof legacyTourn === 'object') {
      tournament = { ...tournament, ...legacyTourn };
    }

    if (!tournament || !tournament.id) {
      return { ok: false, error: 'Tournament data is required.' };
    }

    const slotsTotal = parseInt(tournament.slotsTotal || tournament.slots_total || tournament.teamsCount || 64, 10);
    const teamsPerGroup = parseInt(tournament.teams_per_group || tournament.teams_per_match || 16, 10);
    const maxCapacity = teamsPerGroup;
    
    // Strict validations
    if (maxCapacity <= 0 || maxCapacity > slotsTotal) {
      // Use fallback if invalid, to prevent crashing
    }
    
    const game = tournament.game || 'bgmi';
    const releaseMinutes = parseInt(tournament.room_credentials_release_minutes, 10) || 15;

    let startDate = null;
    const rawDate = tournament.startDate || tournament.date || tournament.start_date || tournament.registrationCloseDate || legacyPlan?.daily_plan?.[0]?.date || legacyPlan?.tournament_start_date || '2026-10-10';
    if (rawDate) {
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
      } catch { /* ignore */ }
    }
    if (!startDate) startDate = '2026-10-10';

    const rounds = [];
    const days = [];
    const groups = [];
    const rooms = [];
    const matches = [];

    // Special case: Total teams <= maxCapacity (Grand Final Only)
    if (slotsTotal <= maxCapacity) {
      const gfRoundId = `RND-${generateId()}`;
      const dayId = `DAY-${generateId()}`;
      let currentTimeMins = parseTimeMins(DEFAULT_START_TIME);
      
      const gfRound = {
        id: gfRoundId,
        tournament_id: tournament.id,
        round_number: 1,
        name: 'Grand Final',
        status: 'configured',
        teams_advancing: null,
        date: startDate,
        time: formatTime(currentTimeMins),
        is_grand_final: true,
      };
      rounds.push(gfRound);

      days.push({
        id: dayId,
        tournament_id: tournament.id,
        day_number: 1,
        date: startDate,
        round_id: gfRoundId
      });

      for (let m = 0; m < GRAND_FINAL_MATCHES; m++) {
        const matchId = `MAT-${generateId()}`;
        const mapName = (m === 0 ? 'Erangel' : (m === 1 ? 'Miramar' : 'Rondo'));
        
        const startTimeStr = formatTime(currentTimeMins);
        const endTimeStr = formatTime(currentTimeMins + 30);
        const releaseTime = computeReleaseTime12h(startTimeStr, releaseMinutes);

        matches.push({
          id: matchId,
          tournament_id: tournament.id,
          round_id: gfRoundId,
          day_id: dayId,
          group_id: null,
          group_name: null,
          match_number: m + 1,
          start_time: startTimeStr,
          end_time: endTimeStr,
          status: 'PENDING',
          map: mapName,
          id_pwd_release_time: releaseTime,
          next_match_id: null,
          next_round_id: null,
          teams_advancing: null,
          is_grand_final: true
        });

        currentTimeMins += MATCH_GAP_MINUTES;
      }
    } else {
      const plan = calculateProgressionPlan(slotsTotal, maxCapacity, teamsPerGroup);
      let dayCounter = 1;
      let previousRoundMatches = [];

      for (let pIdx = 0; pIdx < plan.length; pIdx++) {
        const pRound = plan[pIdx];
        const roundId = `RND-${generateId()}`;
        
        // Schedule first round across days if there are multiple initial groups (max 2 groups per day)
        const isRound1 = (pRound.roundNumber === 1);
        const matchesPerDay = isRound1 ? 2 : pRound.matchCount;
        const totalDaysForRound = Math.ceil(pRound.matchSizes.length / matchesPerDay);
        
        const roundStartDate = addDays(startDate, dayCounter - 1);
        let currentTimeMins = parseTimeMins(DEFAULT_START_TIME);

        const roundData = {
          id: roundId,
          tournament_id: tournament.id,
          round_number: pRound.roundNumber,
          name: `Round ${pRound.roundNumber}`,
          status: 'configured',
          teams_advancing: pRound.totalTeamsAfter,
          date: roundStartDate,
          time: formatTime(currentTimeMins),
          is_grand_final: false,
        };
        rounds.push(roundData);

        const currentRoundMatches = [];
        
        for (let m = 0; m < pRound.matchSizes.length; m++) {
          const dayOffsetForMatch = Math.floor(m / matchesPerDay);
          const currentDayNumber = dayCounter + dayOffsetForMatch;
          const currentDayDate = addDays(startDate, currentDayNumber - 1);

          // Find or create day record
          let dayRec = days.find(d => d.day_number === currentDayNumber && d.tournament_id === tournament.id);
          if (!dayRec) {
            dayRec = {
              id: `DAY-${generateId()}`,
              tournament_id: tournament.id,
              day_number: currentDayNumber,
              date: currentDayDate,
              round_id: roundId
            };
            days.push(dayRec);
          }

          let groupId = null;
          let groupNameStr = null;

          // Round 1 matches explicitly map to initial District allocations (District 1, District 2, District 3...)
          if (isRound1) {
            groupNameStr = `District ${m + 1}`;
            const groupRec = {
              id: `GRP-${generateId()}`,
              day_id: dayRec.id,
              tournament_id: tournament.id,
              group_name: groupNameStr,
              sequence: m + 1,
              round_id: roundId
            };
            groups.push(groupRec);
            groupId = groupRec.id;

            const roomRec = {
              id: `RM-${generateId()}`,
              group_id: groupRec.id,
              day_id: dayRec.id,
              tournament_id: tournament.id,
              room_number: m + 1,
              capacity: pRound.matchSizes[m],
              status: 'DRAFT',
              round_id: roundId
            };
            rooms.push(roomRec);
          }

          const matchId = `MAT-${generateId()}`;
          const mapName = getDefaultMap(game, m + 1);
          
          const startTimeStr = formatTime(currentTimeMins);
          const endTimeStr = formatTime(currentTimeMins + 30);
          const releaseTime = computeReleaseTime12h(startTimeStr, releaseMinutes);

          const match = {
            id: matchId,
            tournament_id: tournament.id,
            round_id: roundId,
            day_id: dayRec.id,
            group_id: groupId,
            group_name: groupNameStr,
            match_number: m + 1,
            start_time: startTimeStr,
            end_time: endTimeStr,
            status: 'PENDING',
            map: mapName,
            id_pwd_release_time: releaseTime,
            next_match_id: null,
            next_round_id: null,
            teams_advancing: null,
            is_grand_final: false
          };
          currentRoundMatches.push(match);
          matches.push(match);

          currentTimeMins += MATCH_GAP_MINUTES;
        }

        dayCounter += totalDaysForRound;

        // Wire up previous round's progression
        if (previousRoundMatches.length > 0) {
          for (let p = 0; p < previousRoundMatches.length; p++) {
            const destIndex = Math.floor(p / (previousRoundMatches.length / currentRoundMatches.length));
            if (currentRoundMatches[destIndex]) {
              previousRoundMatches[p].next_match_id = currentRoundMatches[destIndex].id;
            }
          }
        }

        previousRoundMatches = currentRoundMatches;
      }
      
      // Wire up the final qualification round to the Grand Final
      const gfRoundId = `RND-${generateId()}`;
      const gfDayNumber = dayCounter;
      const gfRoundDate = addDays(startDate, gfDayNumber - 1);
      let currentTimeMins = parseTimeMins(DEFAULT_START_TIME);
      
      const gfRound = {
        id: gfRoundId,
        tournament_id: tournament.id,
        round_number: rounds.length + 1,
        name: 'Grand Final',
        status: 'configured',
        teams_advancing: null,
        date: gfRoundDate,
        time: formatTime(currentTimeMins),
        is_grand_final: true,
      };
      rounds.push(gfRound);

      const gfDayRec = {
        id: `DAY-${generateId()}`,
        tournament_id: tournament.id,
        day_number: gfDayNumber,
        date: gfRoundDate,
        round_id: gfRoundId
      };
      days.push(gfDayRec);
      
      for (let m = 0; m < GRAND_FINAL_MATCHES; m++) {
        const matchId = `MAT-${generateId()}`;
        const mapName = (m === 0 ? 'Erangel' : (m === 1 ? 'Miramar' : 'Rondo'));
        
        const startTimeStr = formatTime(currentTimeMins);
        const endTimeStr = formatTime(currentTimeMins + 30);
        const releaseTime = computeReleaseTime12h(startTimeStr, releaseMinutes);

        matches.push({
          id: matchId,
          tournament_id: tournament.id,
          round_id: gfRoundId,
          day_id: gfDayRec.id,
          group_id: null,
          group_name: null,
          match_number: m + 1,
          start_time: startTimeStr,
          end_time: endTimeStr,
          status: 'PENDING',
          map: mapName,
          id_pwd_release_time: releaseTime,
          next_match_id: null,
          next_round_id: null,
          teams_advancing: null,
          is_grand_final: true
        });

        currentTimeMins += MATCH_GAP_MINUTES;
      }
      
      for (const prevMatch of previousRoundMatches) {
        prevMatch.next_round_id = gfRoundId;
      }
    }

    return {
      ok: true,
      roadmap: {
        rounds,
        days,
        groups,
        rooms,
        matches,
        meta: {
          total_slots: slotsTotal,
          max_capacity: maxCapacity,
          teams_per_group: teamsPerGroup,
          game,
        },
      },
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}