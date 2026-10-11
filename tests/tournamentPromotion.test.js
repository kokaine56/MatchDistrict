import test from 'node:test';
import assert from 'node:assert';

import {
  PROMOTION_PLACEMENTS,
  PRIORITY_LEVELS,
  DEFAULT_PROMOTED_LIMIT,
  canManagePromotions,
  resolveRoles,
  normalizePlacement,
  normalizePriority,
  normalizeDisplayOrder,
  validatePromotionPayload,
  isPromotionActive,
  placementIncludes,
  sortPromotions,
  dedupePromotionsByTournament,
  parseDisplayLimit,
  toPublicPromotion,
} from '../server/tournamentPromotion.js';

// ─────────────────────────────────────────────────────────────
// Authorization
// ─────────────────────────────────────────────────────────────

test('authorization: database admin (roles: [user, admin]) can manage promotions', () => {
  assert.equal(canManagePromotions({ roles: ['user', 'admin'] }), true);
  assert.equal(canManagePromotions({ role: 'admin' }), true);
});

test('authorization: regular authenticated user cannot manage promotions', () => {
  assert.equal(canManagePromotions({ roles: ['user'] }), false);
  assert.equal(canManagePromotions({ roles: ['user', 'organiser'] }), false);
});

test('authorization: unauthenticated / empty identity cannot manage promotions', () => {
  assert.equal(canManagePromotions(null), false);
  assert.equal(canManagePromotions(undefined), false);
  assert.equal(canManagePromotions({}), false);
  assert.equal(canManagePromotions({ roles: [] }), false);
});

test('authorization: forged client role claim is ignored when roles array is authoritative', () => {
  // A user whose DB row only lists ["user"] is denied even if a client
  // tries to smuggle `isAdmin: true` or a non-standard flag.
  const forged = { id: 'USR-x', roles: ['user'], isAdmin: true, admin: true, role: 'organiser' };
  assert.equal(canManagePromotions(forged), false);
});

test('authorization: resolveRoles normalizes user rows, arrays and strings', () => {
  assert.deepEqual(resolveRoles({ roles: ['user', 'admin'] }), ['user', 'admin']);
  assert.deepEqual(resolveRoles(['admin']), ['admin']);
  assert.deepEqual(resolveRoles({ role: 'organiser' }), ['organiser']);
  assert.deepEqual(resolveRoles(null), []);
});

// ─────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────

test('validation: rejects an unknown placement', () => {
  const res = validatePromotionPayload({ placement: 'homepage' });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('placement')));
});

test('validation: accepts each valid placement', () => {
  for (const p of Object.values(PROMOTION_PLACEMENTS)) {
    const res = validatePromotionPayload({ placement: p });
    assert.equal(res.ok, true, `expected ${p} to be valid`);
    assert.equal(res.value.placement, p);
  }
});

test('validation: clamps priority into range and maps presets', () => {
  assert.equal(validatePromotionPayload({ placement: 'featured', priority: 999 }).value.priority, 100);
  assert.equal(validatePromotionPayload({ placement: 'featured', priority: -5 }).value.priority, 0);
  assert.equal(validatePromotionPayload({ placement: 'featured', priority: PRIORITY_LEVELS.high }).value.priority, 50);
});

test('validation: rejects a schedule whose end precedes its start', () => {
  const res = validatePromotionPayload({
    placement: 'trending',
    starts_at: '2026-05-01T10:00:00.000Z',
    ends_at: '2026-04-01T10:00:00.000Z',
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('ends_at')));
});

test('validation: rejects unparseable timestamps', () => {
  const res = validatePromotionPayload({ placement: 'trending', starts_at: 'not-a-date' });
  assert.equal(res.ok, false);
});

test('validation: null end date means unlimited duration', () => {
  const res = validatePromotionPayload({ placement: 'trending', starts_at: '2026-05-01T10:00:00.000Z', ends_at: null });
  assert.equal(res.ok, true);
  assert.equal(res.value.ends_at, null);
  assert.equal(res.value.starts_at, '2026-05-01T10:00:00.000Z');
});

test('validation: normalizes legacy string booleans for is_active', () => {
  assert.equal(validatePromotionPayload({ placement: 'featured', is_active: 'false' }).value.is_active, false);
  assert.equal(validatePromotionPayload({ placement: 'featured', is_active: 'true' }).value.is_active, true);
});

// ─────────────────────────────────────────────────────────────
// Activation / expiry
// ─────────────────────────────────────────────────────────────

const NOW = Date.parse('2026-06-15T12:00:00.000Z');

test('activation: inactive promotions never appear', () => {
  const p = { is_active: false, placement: 'featured', starts_at: null, ends_at: null };
  assert.equal(isPromotionActive(p, NOW), false);
});

test('activation: future promotions do not appear before their start time', () => {
  const p = { is_active: true, placement: 'featured', starts_at: '2026-07-01T00:00:00.000Z', ends_at: null };
  assert.equal(isPromotionActive(p, NOW), false);
});

test('activation: expired promotions disappear after their end time', () => {
  const p = { is_active: true, placement: 'featured', starts_at: null, ends_at: '2026-06-01T00:00:00.000Z' };
  assert.equal(isPromotionActive(p, NOW), false);
});

test('activation: active promotions with no schedule are live', () => {
  const p = { is_active: true, placement: 'trending', starts_at: null, ends_at: null };
  assert.equal(isPromotionActive(p, NOW), true);
});

test('activation: promotion is live inside an inclusive window', () => {
  const p = { is_active: true, placement: 'featured', starts_at: '2026-06-01T00:00:00.000Z', ends_at: '2026-06-30T00:00:00.000Z' };
  assert.equal(isPromotionActive(p, NOW), true);
});

// ─────────────────────────────────────────────────────────────
// Placement semantics
// ─────────────────────────────────────────────────────────────

test('placement: trending-only is eligible for trending, not featured', () => {
  assert.equal(placementIncludes('trending', 'trending'), true);
  assert.equal(placementIncludes('trending', 'featured'), false);
});

test('placement: featured-only is eligible for featured, not trending', () => {
  assert.equal(placementIncludes('featured', 'featured'), true);
  assert.equal(placementIncludes('featured', 'trending'), false);
});

test('placement: combined placement is eligible for both sections from one record', () => {
  assert.equal(placementIncludes('trending_featured', 'trending'), true);
  assert.equal(placementIncludes('trending_featured', 'featured'), true);
});

// ─────────────────────────────────────────────────────────────
// Ordering + de-duplication
// ─────────────────────────────────────────────────────────────

test('ordering: highest priority is returned first', () => {
  const list = [
    { id: 'b', tournament_id: 'T2', priority: PRIORITY_LEVELS.high, display_order: 0, created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'a', tournament_id: 'T1', priority: PRIORITY_LEVELS.top, display_order: 5, created_at: '2026-02-01T00:00:00.000Z' },
    { id: 'c', tournament_id: 'T3', priority: PRIORITY_LEVELS.normal, display_order: 1, created_at: '2026-03-01T00:00:00.000Z' },
  ];
  assert.deepEqual(sortPromotions(list).map((p) => p.id), ['a', 'b', 'c']);
});

test('ordering: equal priority falls back to display_order then created_at', () => {
  const list = [
    { id: 'late', tournament_id: 'T4', priority: 50, display_order: 2, created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'early', tournament_id: 'T5', priority: 50, display_order: 0, created_at: '2026-03-01T00:00:00.000Z' },
    { id: 'tie-a', tournament_id: 'T6', priority: 50, display_order: 0, created_at: '2026-01-01T00:00:00.000Z' },
  ];
  assert.deepEqual(sortPromotions(list).map((p) => p.id), ['tie-a', 'early', 'late']);
});

test('ordering: is deterministic and does not mutate the input', () => {
  const list = [
    { id: 'z', tournament_id: 'T9', priority: 0, display_order: 0, created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'a', tournament_id: 'T8', priority: 0, display_order: 0, created_at: '2026-01-01T00:00:00.000Z' },
  ];
  const first = sortPromotions(list).map((p) => p.id);
  const second = sortPromotions(list).map((p) => p.id);
  assert.deepEqual(first, second);
  assert.deepEqual(first, ['a', 'z']); // id tie-break, stable across loads
  assert.deepEqual(list.map((p) => p.id), ['z', 'a']); // input untouched
});

test('de-duplication: combined placement never yields duplicate cards', () => {
  const list = [
    { id: 'p1', tournament_id: 'TRN-1', placement: 'trending_featured' },
    { id: 'p2', tournament_id: 'TRN-1', placement: 'trending' },
    { id: 'p3', tournament_id: 'TRN-2', placement: 'featured' },
  ];
  const deduped = dedupePromotionsByTournament(list);
  assert.equal(deduped.length, 2);
  assert.deepEqual(deduped.map((p) => p.tournament_id), ['TRN-1', 'TRN-2']);
});

// ─────────────────────────────────────────────────────────────
// Display limit + public projection
// ─────────────────────────────────────────────────────────────

test('display limit: parses, clamps and defaults centrally', () => {
  assert.equal(parseDisplayLimit('6'), 6);
  assert.equal(parseDisplayLimit(999), 50);
  assert.equal(parseDisplayLimit(0), 1);
  assert.equal(parseDisplayLimit('abc'), DEFAULT_PROMOTED_LIMIT);
  assert.equal(parseDisplayLimit(undefined), DEFAULT_PROMOTED_LIMIT);
});

test('public projection: strips admin-only fields', () => {
  const projected = toPublicPromotion({
    tournament_id: 'TRN-1',
    placement: 'trending',
    priority: 100,
    display_order: 3,
    is_active: true,
    starts_at: null,
    ends_at: null,
    created_by: 'ADM-secret',
    updated_by: 'ADM-secret',
  });
  assert.deepEqual(projected, {
    tournament_id: 'TRN-1',
    placement: 'trending',
    priority: 100,
    display_order: 3,
    is_active: true,
    starts_at: null,
    ends_at: null,
  });
  assert.equal('created_by' in projected, false);
});

test('normalizers: placement/priority/displayOrder handle junk safely', () => {
  assert.equal(normalizePlacement('FEATURED '), 'featured');
  assert.equal(normalizePlacement('nonsense'), null);
  assert.equal(normalizePriority('bad'), PRIORITY_LEVELS.normal);
  assert.equal(normalizeDisplayOrder(-3), 0);
});
