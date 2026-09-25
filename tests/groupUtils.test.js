import test from 'node:test';
import assert from 'node:assert';
import {
  computeGroupCount,
  generateGroupName,
  generateGroupNames,
  buildGroups,
  groupIndexForSequence,
  positionWithinGroup,
  groupLabelForSequence,
  groupForGlobalSlot,
  groupLabelForSlot,
  predictedGroupFor,
  validateGroupConfig,
  DEFAULT_TEAMS_PER_GROUP,
  padGroupPosition,
} from '../server/groupService.js';

// Pure acceptance tests for the group layout / assignment math.
// Mirrors the client `src/utils/groupUtils.js` (same formulas).

const sameLab = (a, b) => JSON.stringify(a) === JSON.stringify(b);

test('GROUP TEST 1: 64 slots / 16 per group -> exactly 4 groups of 16', () => {
  const groups = buildGroups(64, 16);
  assert.strictEqual(groups.length, 4);
  assert.deepStrictEqual(groups.map(g => g.name), ['A', 'B', 'C', 'D']);
  assert.ok(groups.every(g => g.capacity === 16));
  assert.strictEqual(groups[0].slotStart, 1);
  assert.strictEqual(groups[0].slotEnd, 16);
  assert.strictEqual(groups[3].slotStart, 49);
  assert.strictEqual(groups[3].slotEnd, 64);
});

test('GROUP TEST 2: 32 slots / 16 per group -> exactly 2 groups of 16', () => {
  const groups = buildGroups(32, 16);
  assert.strictEqual(groups.length, 2);
  assert.deepStrictEqual(groups.map(g => g.name), ['A', 'B']);
  assert.ok(groups.every(g => g.capacity === 16));
});

test('GROUP TEST 3: 48 slots / 12 per group -> exactly 4 groups of 12', () => {
  const groups = buildGroups(48, 12);
  assert.strictEqual(groups.length, 4);
  assert.deepStrictEqual(groups.map(g => g.name), ['A', 'B', 'C', 'D']);
  assert.ok(groups.every(g => g.capacity === 12));
});

test('GROUP TEST 4: 17th confirmed team lands in group B', () => {
  // 64 slots / 16 per group. Team #16 sits in A16, team #17 -> B01.
  assert.strictEqual(groupLabelForSequence(15, 64, 16), 'A16');
  assert.strictEqual(groupLabelForSequence(16, 64, 16), 'B01');
  // Predicted group AFTER 16 confirmed = B.
  const pred = predictedGroupFor(16, 64, 16);
  assert.strictEqual(pred.name, 'B');
  assert.strictEqual(pred.label, 'B01');
});

test('GROUP TEST 5: 64th team fills the last slot, 65th exceeds capacity', () => {
  assert.strictEqual(groupLabelForSequence(63, 64, 16), 'D16');
  assert.strictEqual(groupIndexForSequence(64, 64, 16), 3); // clamps to last group
  assert.strictEqual(computeGroupCount(64, 16), 4);
  assert.strictEqual(computeGroupCount(64, 64), 1);
});

test('GROUP TEST: global slot numbers map back to groups/labels', () => {
  const groups = buildGroups(64, 16);
  assert.strictEqual(groupForGlobalSlot(1, groups)?.name, 'A');
  assert.strictEqual(groupForGlobalSlot(33, groups)?.name, 'C');
  assert.strictEqual(groupLabelForSlot(33, groups), 'C01');
  assert.strictEqual(groupLabelForSlot(40, groups), 'C08');
  assert.strictEqual(groupLabelForSlot(64, groups), 'D16');
});

test('GROUP TEST: uneven split puts remainder in the earlier groups', () => {
  const groups = buildGroups(50, 16);
  assert.strictEqual(groups.length, 4);
  // 50 / 4 = 12 r 2 -> [13, 13, 12, 12]
  assert.deepStrictEqual(groups.map(g => g.capacity), [13, 13, 12, 12]);
  assert.strictEqual(groups[0].slotEnd, 13);
  assert.strictEqual(groups[1].slotStart, 14);
  assert.strictEqual(groups[3].slotEnd, 50);
});

test('GROUP TEST: group name generation A..Z -> AA..AB (beyond 26)', () => {
  assert.deepStrictEqual(generateGroupNames(26), Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)));
  assert.strictEqual(generateGroupName(0), 'A');
  assert.strictEqual(generateGroupName(25), 'Z');
  assert.strictEqual(generateGroupName(26), 'AA');
  assert.strictEqual(generateGroupName(27), 'AB');
});

test('GROUP TEST: position / label helpers stay 1-based and padded', () => {
  assert.strictEqual(positionWithinGroup(0, 64, 16), 1);
  assert.strictEqual(positionWithinGroup(15, 64, 16), 16);
  assert.strictEqual(padGroupPosition('A', 7), 'A07');
  assert.strictEqual(padGroupPosition('A', 16), 'A16');
});

test('GROUP TEST: validateGroupConfig accepts/rejects', () => {
  assert.strictEqual(validateGroupConfig(64, 16).ok, true);
  assert.strictEqual(validateGroupConfig(0, 16).ok, false);
  assert.strictEqual(validateGroupConfig(64, 0).ok, false);
  assert.strictEqual(validateGroupConfig(16, 64).error, 'TEAMS_PER_GROUP_EXCEEDS_SLOTS');
});

test('GROUP TEST: predictedGroupFor edge cases', () => {
  const zero = predictedGroupFor(0, 64, 16);
  assert.strictEqual(zero.name, 'A');
  assert.strictEqual(zero.label, 'A01');
  const boundary = predictedGroupFor(16, 64, 16);
  assert.strictEqual(boundary.name, 'B');
  const beyond = predictedGroupFor(1000, 64, 16);
  assert.strictEqual(beyond.index, 4);
});

test('GROUP TEST: normalizeGroupsFromServer tolerates DB + plain shapes', async () => {
  const client = await import('../src/utils/groupUtils.js');
  const raw = [
    { group_index: 2, name: 'B', capacity: 16, slotStart: 17, slotEnd: 32 },
    { index: 1, name_text: 'A', capacity: 16, slot_start: 1, slot_end: 16 },
  ];
  const norm = client.normalizeGroupsFromServer(raw);
  assert.strictEqual(norm.length, 2);
  assert.strictEqual(norm[0].name, 'A');
  assert.strictEqual(norm[0].group_index, 1);
  assert.strictEqual(norm[0].slotEnd, 16);
  assert.strictEqual(norm[1].name, 'B');
  assert.deepStrictEqual(client.normalizeGroupsFromServer(null), []);
  assert.deepStrictEqual(client.normalizeGroupsFromServer('nope'), []);
});

test('GROUP TEST: DEFAULT_TEAMS_PER_GROUP matches server constant', () => {
  assert.strictEqual(DEFAULT_TEAMS_PER_GROUP, 16);
});

test('GROUP TEST: client mirror stays in lock-step with server', async () => {
  // Import the client mirror and compare a battery of inputs.
  const client = await import('../src/utils/groupUtils.js');
  assert.ok(sameLab(client.buildGroups(64, 16), buildGroups(64, 16)));
  assert.ok(sameLab(client.buildGroups(50, 16), buildGroups(50, 16)));
  assert.ok(sameLab(client.buildGroups(48, 12), buildGroups(48, 12)));
  assert.ok(sameLab(client.buildGroups(100, 16), buildGroups(100, 16)));
  assert.ok(sameLab(client.buildGroups(17, 5), buildGroups(17, 5)));
  for (let i = 0; i < 70; i++) {
    assert.strictEqual(client.generateGroupName(i), generateGroupName(i));
  }
  for (const [seq, slots, tpg] of [[0,64,16],[15,64,16],[16,64,16],[63,64,16],[17,48,12],[24,48,12],[31,48,12],[0,50,16],[49,50,16]]) {
    assert.strictEqual(client.groupLabelForSequence(seq, slots, tpg), groupLabelForSequence(seq, slots, tpg));
    assert.strictEqual(client.predictedGroupFor(seq, slots, tpg).label, predictedGroupFor(seq, slots, tpg).label);
  }
  assert.strictEqual(client.DEFAULT_TEAMS_PER_GROUP, DEFAULT_TEAMS_PER_GROUP);
});