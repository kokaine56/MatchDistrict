// --- GROUP UTILS (client mirror of server/groupService.js) ---
// Pure helpers for rendering group-based slots / predicted groups in the UI.
// Boxing anywhere the server computes groups (server/groupService.js) is the
// single source of truth — these functions must stay in lock-step with it.

export const DEFAULT_TEAMS_PER_GROUP = 16;

export function computeGroupCount(slotsTotal, teamsPerGroup) {
  const total = Number(slotsTotal);
  const tpg = Number(teamsPerGroup);
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(tpg) || tpg <= 0) return 0;
  return Math.ceil(total / tpg);
}

export function generateGroupName(index) {
  let n = Math.max(0, Math.floor(index));
  let name = '';
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

export function generateGroupNames(count) {
  const names = [];
  const n = Math.max(0, Math.floor(count));
  for (let i = 0; i < n; i++) names.push(generateGroupName(i));
  return names;
}

// Equal-sized groups preferred; earlier groups absorb any remainder.
export function buildGroups(slotsTotal, teamsPerGroup) {
  const total = Number(slotsTotal) || 0;
  const tpg = Number(teamsPerGroup) || 0;
  if (total <= 0 || tpg <= 0) return [];
  const count = computeGroupCount(total, tpg);
  const base = Math.floor(total / count);
  const extra = total % count;
  const groups = [];
  let cursor = 1;
  for (let i = 0; i < count; i++) {
    const size = i < extra ? base + 1 : base;
    groups.push({
      group_index: i + 1,
      name: generateGroupName(i),
      capacity: size,
      slotStart: cursor,
      slotEnd: cursor + size - 1,
    });
    cursor += size;
  }
  return groups;
}

export function padGroupPosition(name, position) {
  return `${name}${String(Math.max(1, Math.floor(position))).padStart(2, '0')}`;
}

function groupIndexWithin(groups, sequenceIndex) {
  if (!groups || groups.length === 0) return 0;
  const seq = Math.max(0, Math.floor(sequenceIndex));
  let accounted = 0;
  for (let i = 0; i < groups.length; i++) {
    accounted += groups[i].capacity;
    if (seq < accounted) return i;
  }
  return groups.length - 1;
}

export function groupIndexForSequence(sequenceIndex, slotsTotal, teamsPerGroup) {
  return groupIndexWithin(buildGroups(slotsTotal, teamsPerGroup), sequenceIndex);
}

export function positionWithinGroup(
  sequenceIndex,
  slotsTotal,
  teamsPerGroup
) {
  const groups = buildGroups(slotsTotal, teamsPerGroup);
  let accounted = 0;
  for (const g of groups) {
    if (sequenceIndex < accounted + g.capacity) return sequenceIndex - accounted + 1;
    accounted += g.capacity;
  }
  return 1;
}

export function groupLabelForSequence(sequenceIndex, slotsTotal, teamsPerGroup) {
  const groups = buildGroups(slotsTotal, teamsPerGroup);
  const idx = groupIndexWithin(groups, sequenceIndex);
  const name = groups[idx] ? groups[idx].name : 'A';
  const pos = positionWithinGroup(sequenceIndex, slotsTotal, teamsPerGroup);
  return padGroupPosition(name, pos);
}

export function groupForGlobalSlot(slotNumber, groups) {
  const slot = Number(slotNumber);
  if (!groups || groups.length === 0 || !Number.isFinite(slot) || slot < 1) return null;
  for (const g of groups) {
    if (slot >= g.slotStart && slot <= g.slotEnd) return g;
  }
  return null;
}

export function groupLabelForSlot(slotNumber, groups) {
  const g = groupForGlobalSlot(slotNumber, groups);
  if (!g) return null;
  return padGroupPosition(g.name, slotNumber - g.slotStart + 1);
}

// Predicted group for a team registering when `confirmedCount` teams are
// already confirmed. Returns { index, name, label }.
export function predictedGroupFor(confirmedCount, slotsTotal, teamsPerGroup) {
  const groups = buildGroups(slotsTotal, teamsPerGroup);
  const idx = groupIndexWithin(groups, confirmedCount || 0);
  const name = groups[idx] ? groups[idx].name : 'A';
  const pos = positionWithinGroup(confirmedCount || 0, slotsTotal, teamsPerGroup);
  return { index: idx + 1, name, label: padGroupPosition(name, pos) };
}

export function validateGroupConfig(slotsTotal, teamsPerGroup) {
  const total = Number(slotsTotal);
  const tpg = Number(teamsPerGroup);
  if (!Number.isFinite(total) || total <= 0) return { ok: false, error: 'TOTAL_SLOTS_INVALID' };
  if (!Number.isFinite(tpg) || tpg <= 0) return { ok: false, error: 'TEAMS_PER_GROUP_INVALID' };
  if (Math.floor(tpg) > Math.floor(total)) return { ok: false, error: 'TEAMS_PER_GROUP_EXCEEDS_SLOTS' };
  return { ok: true };
}

// Server-sent group metadata may be raw DB rows or plain objects — normalize.
export function normalizeGroupsFromServer(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => ({
      group_index: Number(g.group_index) || Number(g.index) || 0,
      name: g.name || g.name_text || 'A',
      capacity: Number(g.capacity) || 0,
      slotStart: Number(g.slotStart) || Number(g.slot_start) || 1,
      slotEnd: Number(g.slotEnd) || Number(g.slot_end) || 1,
    }))
    .sort((a, b) => a.group_index - b.group_index);
}