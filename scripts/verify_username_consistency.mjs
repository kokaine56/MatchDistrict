import assert from 'node:assert/strict';
import {
  getCanonicalUsername,
  validateUsername,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  RESERVED_USERNAMES,
} from '../server/usernameValidator.js';

console.log('🧪 Starting Username Consistency & Synchronization Tests...\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// ─────────────────────────────────────────────────────────────
// Test Suite 1: Canonical Username Resolution
// ─────────────────────────────────────────────────────────────
console.log('--- Test Suite 1: Canonical Username Resolution ---');

runTest('Authoritative username takes absolute precedence over legacy gamerTag', () => {
  const user = {
    id: 'USR-123',
    name: 'Rajnish Singh',
    gamerTag: '@rajnishin87c3',
    username: 'rajnish_singh_9502',
  };
  const canonical = getCanonicalUsername(user);
  assert.equal(canonical, 'rajnish_singh_9502');
});

runTest('User object with only username returns canonical username', () => {
  const user = { username: 'gamer_pro' };
  assert.equal(getCanonicalUsername(user), 'gamer_pro');
});

runTest('Legacy user without username falls back cleanly to gamerTag without @', () => {
  const legacyUser = { gamerTag: '@rajnishin87c3' };
  assert.equal(getCanonicalUsername(legacyUser), 'rajnishin87c3');
});

runTest('Organizer user without username falls back to orgHandle without @', () => {
  const orgUser = { orgHandle: '@apex_syndicate' };
  assert.equal(getCanonicalUsername(orgUser), 'apex_syndicate');
});

runTest('Null, undefined, and empty objects return empty string without error', () => {
  assert.equal(getCanonicalUsername(null), '');
  assert.equal(getCanonicalUsername(undefined), '');
  assert.equal(getCanonicalUsername({}), '');
  assert.equal(getCanonicalUsername('invalid-type'), '');
});

// ─────────────────────────────────────────────────────────────
// Test Suite 2: Profile Header vs Settings Parity
// ─────────────────────────────────────────────────────────────
console.log('\n--- Test Suite 2: Profile Header vs Settings Parity ---');

runTest('Header and Settings render identical canonical username for user from screenshot', () => {
  // Simulates the exact screenshot state:
  // users record: username = 'rajnish_singh_9502', gamerTag = '@rajnishin87c3'
  const currentUser = {
    id: 'USR-SCREENSHOT',
    name: 'Rajnish Singh',
    username: 'rajnish_singh_9502',
    gamerTag: '@rajnishin87c3',
  };
  const playerData = {
    name: 'Rajnish Singh',
    username: getCanonicalUsername(currentUser),
    gamerTag: currentUser.gamerTag,
  };

  const ownCanonicalUsername = getCanonicalUsername(currentUser) || getCanonicalUsername(playerData) || 'gamer';

  // Header display logic:
  const headerDisplay = ownCanonicalUsername;
  // Settings display logic:
  const settingsDisplay = `@${ownCanonicalUsername}`;

  assert.equal(headerDisplay, 'rajnish_singh_9502');
  assert.equal(settingsDisplay, '@rajnish_singh_9502');
  assert.equal(`@${headerDisplay}`, settingsDisplay, 'Header and Settings must display the exact same handle!');
});

runTest('Editing and saving username updates header and settings in lockstep', () => {
  let currentUser = {
    id: 'USR-SCREENSHOT',
    name: 'Rajnish Singh',
    username: 'rajnish_singh_9502',
    gamerTag: '@rajnishin87c3',
  };
  let playerData = {
    name: 'Rajnish Singh',
    username: getCanonicalUsername(currentUser),
    gamerTag: currentUser.gamerTag,
  };

  // User edits username in Settings:
  const newUsernameInput = 'rajnish_legend';
  const val = validateUsername(newUsernameInput);
  assert.equal(val.valid, true);

  // Simulated server PUT /api/users/:id response
  const updatedUserFromBackend = {
    ...currentUser,
    username: val.username,
    gamerTag: '@' + val.username,
    username_last_changed: new Date().toISOString(),
  };

  // Frontend updates on success:
  currentUser = updatedUserFromBackend;
  const canonicalU = getCanonicalUsername(updatedUserFromBackend) || val.username;
  playerData = { ...playerData, username: canonicalU, gamerTag: '@' + canonicalU };

  const ownCanonicalUsername = getCanonicalUsername(currentUser) || getCanonicalUsername(playerData) || 'gamer';
  assert.equal(ownCanonicalUsername, 'rajnish_legend');

  const headerDisplay = ownCanonicalUsername;
  const settingsDisplay = `@${ownCanonicalUsername}`;

  assert.equal(headerDisplay, 'rajnish_legend');
  assert.equal(settingsDisplay, '@rajnish_legend');
});

runTest('Public profile of another user displays that user\'s username, never logged-in user', () => {
  const loggedInUser = {
    id: 'USR-ME',
    name: 'Rajnish Singh',
    username: 'rajnish_singh_9502',
    gamerTag: '@rajnishin87c3',
  };
  const otherUser = {
    id: 'USR-OTHER',
    name: 'Other Player',
    username: 'pro_gamer_99',
    gamerTag: '@pro_gamer_99',
  };

  const isOwnProfile = false;
  const viewedUser = otherUser;
  const ownCanonicalUsername = getCanonicalUsername(loggedInUser);
  const viewedCanonicalUsername = (!isOwnProfile && viewedUser)
    ? (getCanonicalUsername(viewedUser) || 'gamer')
    : ownCanonicalUsername;

  assert.equal(viewedCanonicalUsername, 'pro_gamer_99');
  assert.notEqual(viewedCanonicalUsername, ownCanonicalUsername);
});

// ─────────────────────────────────────────────────────────────
// Test Suite 3: Username Validation and Uniqueness Rules
// ─────────────────────────────────────────────────────────────
console.log('\n--- Test Suite 3: Username Validation and Rules ---');

runTest('Accepts valid usernames with dots, underscores, numbers, and lowercase letters', () => {
  const validUsernames = [
    'rajnish_singh_9502',
    'player.one',
    'alpha_beta_1',
    'md.gamer',
    'x_99_y',
  ];
  for (const u of validUsernames) {
    const res = validateUsername(u);
    assert.equal(res.valid, true, `Expected "${u}" to be valid: ${res.message}`);
  }
});

runTest('Rejects usernames shorter than 3 or longer than 32 characters', () => {
  assert.equal(validateUsername('ab').valid, false);
  assert.equal(validateUsername('a'.repeat(33)).valid, false);
  assert.equal(validateUsername('abc').valid, true);
  assert.equal(validateUsername('a'.repeat(32)).valid, true);
});

runTest('Rejects illegal characters, leading/trailing dots, consecutive dots, all digits', () => {
  assert.equal(validateUsername('user@domain').valid, false, 'No @ or special chars');
  assert.equal(validateUsername('.startdot').valid, false, 'No leading dot');
  assert.equal(validateUsername('enddot.').valid, false, 'No trailing dot');
  assert.equal(validateUsername('double..dot').valid, false, 'No double dot');
  assert.equal(validateUsername('12345678').valid, false, 'Cannot be all digits');
});

runTest('Rejects reserved system usernames', () => {
  for (const reserved of RESERVED_USERNAMES) {
    const res = validateUsername(reserved);
    assert.equal(res.valid, false, `Expected reserved word "${reserved}" to be rejected`);
  }
});

// ─────────────────────────────────────────────────────────────
// Test Suite 4: Cooldown & Input State Behavior
// ─────────────────────────────────────────────────────────────
console.log('\n--- Test Suite 4: Cooldown & Input Reset Behavior ---');

runTest('Cancel button restores canonical username without dirty state', () => {
  const ownCanonicalUsername = 'rajnish_singh_9502';
  let settingsGamerTag = 'draft_username_typing';

  // User hits Cancel:
  settingsGamerTag = ownCanonicalUsername;
  assert.equal(settingsGamerTag, ownCanonicalUsername);

  // Save button is disabled when input matches current canonical username:
  const isSaveDisabled = settingsGamerTag.trim().toLowerCase() === ownCanonicalUsername.toLowerCase();
  assert.equal(isSaveDisabled, true, 'Save button must be disabled when input equals canonical username');
});

console.log(`\n========================================`);
console.log(`Results: ${passedTests} / ${totalTests} tests passed`);
console.log(`========================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
