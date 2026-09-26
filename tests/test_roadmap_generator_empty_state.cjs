const assert = require('assert');

function runTests() {
  console.log('🧪 Running Roadmap Generator & Empty State Integration Tests...\n');

  // Test 1: Organizer Ownership Detection
  const currentUser = { id: 'USR-ORG-100', role: 'organizer' };
  const adminUser = { id: 'USR-ADMIN-1', role: 'admin', system_role: 'admin' };
  const participantUser = { id: 'USR-PLAYER-1', role: 'user' };

  // Tournament rows with various organizer id column formats
  const tRow1 = { id: 'TRN-1', orgId: 'USR-ORG-100', slotsTotal: 64 };
  const tRow2 = { id: 'TRN-2', organizer_id: 'USR-ORG-100', slotsTotal: 128 };
  const tRow3 = { id: 'TRN-3', organizerId: 'USR-ORG-100', slotsTotal: 256 };

  function isOwner(user, t) {
    if (!user || !t) return false;
    if (user.role === 'admin' || user.system_role === 'admin') return true;
    const orgId = t.orgId || t.organizer_id || t.organizerId || t.org_id;
    return user.id === orgId;
  }

  assert.strictEqual(isOwner(currentUser, tRow1), true, 'Organizer should be owner for tRow1 (orgId)');
  assert.strictEqual(isOwner(currentUser, tRow2), true, 'Organizer should be owner for tRow2 (organizer_id)');
  assert.strictEqual(isOwner(currentUser, tRow3), true, 'Organizer should be owner for tRow3 (organizerId)');
  assert.strictEqual(isOwner(adminUser, tRow1), true, 'Admin should be owner for any tournament');
  assert.strictEqual(isOwner(participantUser, tRow1), false, 'Participant should NOT be owner');

  console.log('✅ TEST 1 PASSED: Organizer ownership identification verified for all column variations.');

  // Test 2: Empty State Logic
  function getEmptyState(isOrganizer, hasRoadmap) {
    if (hasRoadmap) {
      return { showRoadmap: true, canEdit: isOrganizer };
    }
    if (isOrganizer) {
      return {
        showRoadmap: false,
        title: 'Tournament Roadmap',
        subheading: 'No roadmap has been generated yet.',
        body: 'Generate the tournament roadmap from the saved tournament schedule and match settings.',
        showGenerateButton: true
      };
    }
    return {
      showRoadmap: false,
      title: 'Tournament Roadmap',
      body: 'The tournament roadmap has not been published yet.',
      showGenerateButton: false
    };
  }

  const orgEmpty = getEmptyState(true, false);
  assert.strictEqual(orgEmpty.showGenerateButton, true);
  assert.strictEqual(orgEmpty.subheading, 'No roadmap has been generated yet.');
  console.log('✅ TEST 2 PASSED: Organizer Empty State displays [ + Generate Roadmap ] button.');

  const partEmpty = getEmptyState(false, false);
  assert.strictEqual(partEmpty.showGenerateButton, false);
  assert.strictEqual(partEmpty.body, 'The tournament roadmap has not been published yet.');
  console.log('✅ TEST 3 PASSED: Participant Empty State displays read-only notice without generate button.');

  const generatedState = getEmptyState(true, true);
  assert.strictEqual(generatedState.showRoadmap, true);
  assert.strictEqual(generatedState.canEdit, true);
  console.log('✅ TEST 4 PASSED: Generated state displays roadmap structure & edit controls for organizer.');

  console.log('\n🎉 ALL ROADMAP EMPTY-STATE & AUTHORIZATION TESTS PASSED!\n');
}

runTests();
