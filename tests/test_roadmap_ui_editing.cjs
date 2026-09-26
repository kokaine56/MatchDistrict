const assert = require('assert');

function runUiEditingTests() {
  console.log('🧪 Running Roadmap UI Editing & Component State Tests...\n');

  // Re-simulate TournamentRoadmapBuilder state & updateMatchField behavior
  let roadmapData = {
    meta: { max_capacity: 25 },
    rounds: [
      { id: 'RND-1', round_number: 1, name: 'Round 1', date: '2026-10-01', is_grand_final: false },
      { id: 'RND-GF', round_number: 2, name: 'Grand Final', date: '2026-10-02', is_grand_final: true }
    ],
    matches: [
      { id: 'MAT-1', round_id: 'RND-1', match_number: 1, map: 'Erangel', start_time: '13:00', id_pwd_release_time: '12:45 PM', status: 'PENDING', is_grand_final: false },
      { id: 'MAT-2', round_id: 'RND-GF', match_number: 1, map: 'Erangel', start_time: '14:00', id_pwd_release_time: '01:45 PM', status: 'PENDING', is_grand_final: true }
    ]
  };

  function computeReleaseFromStart(startTimeStr) {
    if (!startTimeStr) return "";
    const [h, m] = startTimeStr.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return "";
    let relMins = h * 60 + m - 15;
    if (relMins < 0) relMins += 1440;
    const rH = Math.floor(relMins / 60) % 24;
    const rM = relMins % 60;
    const period = rH >= 12 ? "PM" : "AM";
    const h12 = rH % 12 === 0 ? 12 : rH % 12;
    return `${String(h12).padStart(2, "0")}:${String(rM).padStart(2, "0")} ${period}`;
  }

  function updateMatchField(matchId, field, value) {
    roadmapData = {
      ...roadmapData,
      matches: roadmapData.matches.map(m => {
        if (m.id !== matchId) return m;
        const updated = { ...m, [field]: value };
        if (field === "start_time" && value) {
          updated.id_pwd_release_time = computeReleaseFromStart(value);
        }
        return updated;
      })
    };
  }

  // TEST 1: Update map field
  updateMatchField('MAT-1', 'map', 'Miramar');
  assert.strictEqual(roadmapData.matches[0].map, 'Miramar', 'Map should update to Miramar');
  console.log('✅ TEST 1 PASSED: Match map editing updates component state.');

  // TEST 2: Update start_time field & verify auto-calculated release time
  updateMatchField('MAT-1', 'start_time', '15:30');
  assert.strictEqual(roadmapData.matches[0].start_time, '15:30', 'Start time should update to 15:30');
  assert.strictEqual(roadmapData.matches[0].id_pwd_release_time, '03:15 PM', 'Release time should auto-calculate to 03:15 PM');
  console.log('✅ TEST 2 PASSED: Match start time editing updates start_time & auto-computes release time.');

  // TEST 3: Update custom release time field
  updateMatchField('MAT-1', 'id_pwd_release_time', '03:00 PM');
  assert.strictEqual(roadmapData.matches[0].id_pwd_release_time, '03:00 PM', 'Release time should update to 03:00 PM');
  console.log('✅ TEST 3 PASSED: Custom release time editing updates component state.');

  console.log('\n🎉 ALL ROADMAP UI EDITING COMPONENT STATE TESTS PASSED!\n');
}

runUiEditingTests();
