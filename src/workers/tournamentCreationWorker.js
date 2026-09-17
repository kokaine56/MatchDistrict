// --- ESPORTS MATCH CREATION ASSISTANT WEB WORKER ---

self.onmessage = (e) => {
  const { action, game, slotsTotal, startDate, presetType } = e.data;
  
  if (action === 'generateSetup') {
    const gameUpper = String(game || 'BGMI').toUpperCase();
    
    // 1. Map pools for different games
    let maps = [];
    if (gameUpper === 'BGMI') {
      maps = ['Erangel', 'Miramar', 'Sanhok', 'Vikendi'];
    } else if (gameUpper === 'VALORANT') {
      maps = ['Ascent', 'Bind', 'Haven', 'Split', 'Sunset'];
    } else if (gameUpper === 'CS2') {
      maps = ['Mirage', 'Inferno', 'Dust II', 'Nuke', 'Ancient'];
    } else if (gameUpper === 'FREE FIRE') {
      maps = ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine'];
    } else {
      maps = ['Map Alpha', 'Map Beta', 'Map Gamma'];
    }

    // 2. Rules generation based on game title
    let rules = '';
    if (gameUpper === 'BGMI') {
      rules = `1. All players must play on mobile devices (Emulators are strictly banned).\n2. GFX tools or any 3rd party game file modifications will lead to instant disqualification.\n3. Screen recording or active anti-cheat telemetry must run at all times.`;
    } else if (gameUpper === 'VALORANT') {
      rules = `1. Standard VCT rules apply. Tactical timeouts are allowed.\n2. Vanguard anti-cheat must be active at all times. Riot IDs must match registration.\n3. Any forms of toxic behavior, slurs, or chat abuse will lead to match loss.`;
    } else if (gameUpper === 'CS2') {
      rules = `1. VAC-secured servers will be used. Standard competitive 5v5 settings apply.\n2. Coaching slot is allowed only during timeouts. Friendly fire is enabled.\n3. Disconnects: A team has up to 10 minutes of pause time per match.`;
    } else {
      rules = `1. Standard fairplay guidelines apply.\n2. All game matches must start at the scheduled coordinates.\n3. Organizer decision is final in all disputes.`;
    }

    // 3. Recommended Entry Fee & Prize Pool based on preset type and slots
    let entry = 'FREE';
    let prize = '₹5,000';
    let payoutPercent = 90;
    
    if (presetType === 'Pro Cup') {
      entry = '₹500';
      prize = '₹25,00,000';
      payoutPercent = 95;
    } else if (presetType === 'Casual Cup') {
      entry = '₹100';
      prize = '₹10,000';
      payoutPercent = 90;
    } else if (presetType === 'Speed Run') {
      entry = 'FREE';
      prize = '₹2,000';
      payoutPercent = 100;
    }

    // 4. Roadmap Rounds generation based on slots and game type
    const rounds = [];
    const baseDate = startDate ? new Date(startDate) : new Date();
    
    let numRounds = 3;
    if (slotsTotal <= 16) {
      numRounds = 2;
    } else if (slotsTotal > 100) {
      numRounds = 4;
    }

    for (let i = 1; i <= numRounds; i++) {
      const roundDate = new Date(baseDate);
      // Increment days/hours depending on preset
      if (presetType === 'Speed Run') {
        // Hourly schedule for speed run
        roundDate.setHours(roundDate.getHours() + (i - 1) * 2);
      } else {
        // Daily schedule
        roundDate.setDate(roundDate.getDate() + (i - 1));
      }
      
      let roundName = `Round ${i}`;
      if (i === numRounds) {
        roundName = 'Grand Finals';
      } else if (i === numRounds - 1) {
        roundName = 'Semifinals';
      } else if (i === 1) {
        roundName = 'Qualifiers';
      }

      // Qualification rules
      let qualifyText = 'Top 4 teams from each group qualify';
      if (i === numRounds) {
        qualifyText = 'Champion takes home the grand prize pool';
      } else if (i === numRounds - 1) {
        qualifyText = 'Top 8 teams advance to the finals';
      }

      // Format ISO dates and times
      const dateStr = roundDate.toISOString().slice(0, 10);
      const timeStr = roundDate.toTimeString().slice(0, 5);

      rounds.push({
        id: `rnd-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
        name: roundName,
        date: dateStr,
        time: timeStr,
        map: maps[(i - 1) % maps.length],
        qualify: qualifyText,
        id_password_release_mode: 'automatic',
        id_password_release_offset_minutes: 10,
        id_password_release_at: ''
      });
    }

    // Post results back
    self.postMessage({
      success: true,
      rules,
      roadmap: rounds,
      entry,
      prize,
      payoutPercent
    });
  }
};
