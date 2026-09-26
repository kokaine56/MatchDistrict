// --- GROUP SERVICE ---
// Single source of truth for the group-system mathematics and the DB-backed
// group assignment used by the slot worker / approval paths.
// Groups are deterministic subdivisions of the global slot range:
//   numberOfGroups = ceil(slotsTotal / teamsPerGroup)
// Every slot (and therefore every admitted team) belongs to exactly one group.

// Statuses that count as occupying a slot / group (mirrors the authoritative
// set used by workers/slotManagerWorker.js and GET /slots).
export const VERIFIED_GROUP_STATUSES = ['approved', 'confirmed', 'VERIFIED_BY_HOST', 'verified_by_host'];

export const DEFAULT_TEAMS_PER_GROUP = 16;

export function computeGroupCount(slotsTotal, teamsPerGroup) {
  const total = Number(slotsTotal);
  const tpg = Number(teamsPerGroup);
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(tpg) || tpg <= 0) return 0;
  return Math.ceil(total / tpg);
}

// 0-based index -> "A", "B", ... "Z", "AA", "AB", ...
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

// Builds the deterministic group layout for a tournament. Groups are
// equal-sized when the slot count divides evenly, otherwise the earlier
// groups absorb the remainder (smallest possible size imbalance).
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

// 0-based admission sequence (e.g. number of already-confirmed teams) -> group.
export function groupIndexForSequence(sequenceIndex, slotsTotal, teamsPerGroup) {
  const groups = buildGroups(slotsTotal, teamsPerGroup);
  return groupIndexWithin(groups, sequenceIndex);
}

// 1-based position of a team inside its group ("A07" suffix).
export function positionWithinGroup(sequenceIndex, slotsTotal, teamsPerGroup) {
  const groups = buildGroups(slotsTotal, teamsPerGroup);
  let accounted = 0;
  for (const g of groups) {
    if (sequenceIndex < accounted + g.capacity) return sequenceIndex - accounted + 1;
    accounted += g.capacity;
  }
  return 1;
}

export function formatDistrictName(nameOrIndex) {
  if (nameOrIndex === null || nameOrIndex === undefined) return 'District 1';
  if (typeof nameOrIndex === 'number') {
    return `District ${nameOrIndex}`;
  }
  const str = String(nameOrIndex).trim();
  if (/^district\s*\d+/i.test(str)) {
    const num = str.match(/\d+/)[0];
    return `District ${num}`;
  }
  if (/^group\s*([a-z]+|\d+)/i.test(str)) {
    const match = str.match(/^group\s*([a-z]+|\d+)/i)[1];
    if (/^\d+$/.test(match)) return `District ${match}`;
    let code = 0;
    for (let i = 0; i < match.length; i++) {
      code = code * 26 + (match.toUpperCase().charCodeAt(i) - 64);
    }
    return `District ${code}`;
  }
  if (/^[a-z]+$/i.test(str)) {
    let code = 0;
    for (let i = 0; i < str.length; i++) {
      code = code * 26 + (str.toUpperCase().charCodeAt(i) - 64);
    }
    return `District ${code}`;
  }
  if (/^\d+$/.test(str)) {
    return `District ${str}`;
  }
  return str;
}

export function formatDistrictCode(nameOrIndex) {
  const distName = formatDistrictName(nameOrIndex);
  const num = distName.replace(/\D+/g, '');
  return `D${num || '1'}`;
}

export function padDistrictPosition(nameOrIndex, position) {
  const code = formatDistrictCode(nameOrIndex);
  return `${code}-${String(Math.max(1, Math.floor(position))).padStart(2, '0')}`;
}

// Full label, e.g. "D1-07".
export function padGroupPosition(name, position) {
  return padDistrictPosition(name, position);
}

export function groupLabelForSequence(sequenceIndex, slotsTotal, teamsPerGroup) {
  const groups = buildGroups(slotsTotal, teamsPerGroup);
  const idx = groupIndexWithin(groups, sequenceIndex);
  const name = groups[idx] ? groups[idx].name : 'A';
  const pos = positionWithinGroup(sequenceIndex, slotsTotal, teamsPerGroup);
  return padDistrictPosition(name, pos);
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

// Map a global assigned slot number back to its group descriptor.
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

// Sequence index 0 -> the predicted group the NEXT confirmed team will land in.
export function predictedGroupIndex(confirmedCount, slotsTotal, teamsPerGroup) {
  return groupIndexForSequence(confirmedCount, slotsTotal, teamsPerGroup);
}

export function normalizeTeamsPerGroup(value, fallback = DEFAULT_TEAMS_PER_GROUP) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export function validateGroupConfig(slotsTotal, teamsPerGroup) {
  const total = Number(slotsTotal);
  const tpg = Number(teamsPerGroup);
  if (!Number.isFinite(total) || total <= 0) return { ok: false, error: 'TOTAL_SLOTS_INVALID' };
  if (!Number.isFinite(tpg) || tpg <= 0) return { ok: false, error: 'TEAMS_PER_GROUP_INVALID' };
  if (Math.floor(tpg) > Math.floor(total)) return { ok: false, error: 'TEAMS_PER_GROUP_EXCEEDS_SLOTS' };
  return { ok: true };
}

// DB-backed group assignment. MUST be called inside an already-open
// transaction on `client` (BEGIN/COMMIT owned by the caller). Idempotent:
// re-running never duplicates group rows and simply re-stamps groups from the
// current verified slot-holders in deterministic slot order.
export async function assignGroups(client, tournamentId) {
  const tRes = await client.query(
    'SELECT "slotsTotal", teams_per_group FROM tournaments WHERE id = $1',
    [tournamentId]
  );
  if (tRes.rows.length === 0) return { groups: [], assigned: 0 };
  const slotsTotal = parseInt(tRes.rows[0].slotsTotal) || 100;
  const teamsPerGroup = normalizeTeamsPerGroup(tRes.rows[0].teams_per_group, DEFAULT_TEAMS_PER_GROUP);

  const groups = buildGroups(slotsTotal, teamsPerGroup);

  // Idempotent recompute of the group catalog for this tournament.
  for (const g of groups) {
    await client.query(
      `INSERT INTO tournament_registration_groups (id, tournament_id, group_index, name, capacity)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tournament_id, group_index) DO UPDATE SET name = EXCLUDED.name, capacity = EXCLUDED.capacity`,
      [`GRP-${tournamentId.slice(-6)}-${String(g.group_index).padStart(2, '0')}`, tournamentId, g.group_index, g.name, g.capacity]
    );
  }

  // Verified slot-holders in deterministic admission order (slot asc).
  const verifiedRes = await client.query(
    `SELECT id FROM tournament_registrations
     WHERE tournament_id = $1 AND slot_number IS NOT NULL
       AND status IN ('approved', 'confirmed', 'VERIFIED_BY_HOST', 'verified_by_host')
     ORDER BY slot_number ASC`,
    [tournamentId]
  );

  let assigned = 0;
  for (let i = 0; i < verifiedRes.rows.length; i++) {
    const idx = groupIndexWithin(groups, i);
    const g = groups[idx];
    // Sequence-based position within the group (1-based), e.g. 7 -> "A07".
    const seqPos = positionWithinGroup(i, slotsTotal, teamsPerGroup);
    await client.query(
      'UPDATE tournament_registrations SET group_id = $1, group_name = $2 WHERE id = $3',
      [`GRP-${tournamentId.slice(-6)}-${String(g.group_index).padStart(2, '0')}`, g.name, verifiedRes.rows[i].id]
    );
    assigned++;
  }

  // Clear group stamps from registrations that no longer hold a verified slot.
  await client.query(
    `UPDATE tournament_registrations
     SET group_id = NULL, group_name = NULL
     WHERE tournament_id = $1
       AND (status IS NULL OR status NOT IN ('approved', 'confirmed', 'VERIFIED_BY_HOST', 'verified_by_host'))`,
    [tournamentId]
  );

  return { groups, assigned };
}

// Predicted group helpers for the registration -> success screen. Pure.
export function predictedGroupFor(confirmedCount, slotsTotal, teamsPerGroup) {
  const groups = buildGroups(slotsTotal, teamsPerGroup);
  const idx = groupIndexForSequence(confirmedCount, slotsTotal, teamsPerGroup);
  const name = groups[idx] ? groups[idx].name : 'A';
  const pos = positionWithinGroup(confirmedCount, slotsTotal, teamsPerGroup);
  return { index: idx + 1, name, label: padGroupPosition(name, pos) };
}

// Read a tournament's persisted group catalog (deterministic order).
export async function getGroups(client, tournamentId) {
  const res = await client.query(
    `SELECT id, tournament_id, group_index, name, capacity
     FROM tournament_registration_groups
     WHERE tournament_id = $1
     ORDER BY group_index ASC`,
    [tournamentId]
  );
  return res.rows;
}