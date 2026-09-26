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

export function calculateProgressionPlan(totalTeams, maxCapacity) {
  const rounds = [];
  let currentTeams = totalTeams;
  let roundNumber = 1;
  
  while (currentTeams > maxCapacity) {
    let numMatches = Math.ceil(currentTeams / maxCapacity);
    
    let base = Math.floor(currentTeams / numMatches);
    let extra = currentTeams % numMatches;
    let matchSizes = [];
    for (let i = 0; i < numMatches; i++) matchSizes.push(base + (i < extra ? 1 : 0));
    
    let qualifyCounts = matchSizes.map(size => calculateQualifiers(size));
    let nextTeams = qualifyCounts.reduce((a, b) => a + b, 0);
    
    let qType = (nextTeams <= maxCapacity) ? 'final_elimination' : 'normal';

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
    let tournament = param1;
    if ((!tournament || !tournament.id) && legacyTourn && legacyTourn.id) {
      tournament = legacyTourn;
    }
    if (!tournament || !tournament.id) {
      return { ok: false, error: 'Tournament data is required.' };
    }

    const slotsTotal = parseInt(tournament.slotsTotal || tournament.slots_total || tournament.teamsCount, 10) || 64;
    const maxCapacity = parseInt(tournament.teams_per_match || 20, 10);
    
    // Strict validation
    if (maxCapacity < 16 || maxCapacity > 25) {
      return { ok: false, error: `Invalid room capacity: ${maxCapacity}. Must be between 16 and 25.` };
    }

    
    const game = tournament.game || 'bgmi';
    const releaseMinutes = parseInt(tournament.room_credentials_release_minutes, 10) || 15;

    let startDate = null;
    const rawDate = tournament.startDate || tournament.date || tournament.start_date || tournament.registrationCloseDate || legacyPlan?.daily_plan?.[0]?.date || legacyPlan?.tournament_start_date;
    if (rawDate) {
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
      } catch { /* ignore */ }
    }

    if (!startDate) {
      return {
        ok: false,
        error: 'Your tournament schedule date is missing. Configure the tournament schedule before generating the roadmap.'
      };
    }

    const rounds = [];
    const matches = [];

    // Special case: Total teams <= Finalist count (Grand Final Only)
    if (slotsTotal <= maxCapacity) {
      const gfRoundId = `RND-${generateId()}`;
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
      const plan = calculateProgressionPlan(slotsTotal, maxCapacity);
      let roundIndex = 0;
      let previousRoundMatches = [];
      let currentTimeMins = parseTimeMins(DEFAULT_START_TIME);

      for (let pIdx = 0; pIdx < plan.length; pIdx++) {
        const pRound = plan[pIdx];
        const roundId = `RND-${generateId()}`;
        const roundDate = startDate ? addDays(startDate, roundIndex) : null;
        
        const roundData = {
          id: roundId,
          tournament_id: tournament.id,
          round_number: roundIndex + 1,
          name: `Round ${roundIndex + 1}`,
          status: 'configured',
          teams_advancing: null, // Removed legacy round-level cutoff
          date: roundDate,
          time: formatTime(currentTimeMins),
          is_grand_final: false,
        };
        rounds.push(roundData);

        const currentRoundMatches = [];
        for (let m = 0; m < pRound.matchSizes.length; m++) {
          const matchId = `MAT-${generateId()}`;
          const mapName = getDefaultMap(game, m + 1);
          
          const startTimeStr = formatTime(currentTimeMins);
          const endTimeStr = formatTime(currentTimeMins + 30);
          const releaseTime = computeReleaseTime12h(startTimeStr, releaseMinutes);

          const match = {
            id: matchId,
            tournament_id: tournament.id,
            round_id: roundId,
            match_number: m + 1,
            start_time: startTimeStr,
            end_time: endTimeStr,
            status: 'PENDING',
            map: mapName,
            id_pwd_release_time: releaseTime,
            next_match_id: null,
            next_round_id: null,
            teams_advancing: pRound.qualifiersPerMatch[m],
            is_grand_final: false
          };
          currentRoundMatches.push(match);
          matches.push(match);

          currentTimeMins += MATCH_GAP_MINUTES;
        }

        // Wire up previous round's progression
        if (previousRoundMatches.length > 0) {
          // Standard deterministic pairing: distribute previous matches to current matches
          for (let p = 0; p < previousRoundMatches.length; p++) {
            const destIndex = Math.floor(p / (previousRoundMatches.length / currentRoundMatches.length));
            if (currentRoundMatches[destIndex]) {
              previousRoundMatches[p].next_match_id = currentRoundMatches[destIndex].id;
            }
          }
        }

        previousRoundMatches = currentRoundMatches;
        roundIndex++;
        currentTimeMins = parseTimeMins(DEFAULT_START_TIME);
      }
      
      // Finally, wire up the last qualification round to the Grand Final
      const gfRoundId = `RND-${generateId()}`;
      const gfRoundDate = startDate ? addDays(startDate, roundIndex) : null;
      currentTimeMins = parseTimeMins(DEFAULT_START_TIME);
      
      const gfRound = {
        id: gfRoundId,
        tournament_id: tournament.id,
        round_number: roundIndex + 1,
        name: 'Grand Final',
        status: 'configured',
        teams_advancing: null,
        date: gfRoundDate,
        time: formatTime(currentTimeMins),
        is_grand_final: true,
      };
      rounds.push(gfRound);
      
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
        matches,
        // Legacy compliance structure
        days: rounds.map((r) => ({
          id: `DAY-${generateId()}`, 
          tournament_id: tournament.id, 
          day_number: r.round_number, 
          date: r.date, 
          round_id: r.id
        })),
        groups: [],
        rooms: [],
        meta: {
          total_slots: slotsTotal,
          max_capacity: maxCapacity,
          
          game,
        },
      },
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}