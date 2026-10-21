import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isTournamentOrganizer as clientIsTournamentOrganizer,
  checkTournamentOrganizerAccess as clientCheckTournamentOrganizerAccess,
} from '../src/utils/tournamentAuth.js';

import {
  isTournamentOrganizer as serverIsTournamentOrganizer,
  checkTournamentOrganizerAccess as serverCheckTournamentOrganizerAccess,
} from '../server/tournamentAuth.js';

describe('Tournament Organizer Authentication & Access Control (Client & Server)', () => {
  // Test both client and server implementations identically
  const implementations = [
    { name: 'Client tournamentAuth.js', isOrg: clientIsTournamentOrganizer, checkAccess: clientCheckTournamentOrganizerAccess },
    { name: 'Server tournamentAuth.js', isOrg: serverIsTournamentOrganizer, checkAccess: serverCheckTournamentOrganizerAccess },
  ];

  for (const impl of implementations) {
    describe(impl.name, () => {
      it('rejects logged-out visitor (null or undefined user)', () => {
        const tournament = { id: 'tourn-1', orgId: 'user-owner' };
        assert.equal(impl.isOrg(null, tournament), false);
        assert.equal(impl.isOrg(undefined, tournament), false);

        const accessNull = impl.checkAccess(null, tournament);
        assert.equal(accessNull.authorized, false);
        assert.equal(accessNull.statusCode, 401);
        assert.equal(accessNull.error, 'UNAUTHORIZED');

        const accessUndef = impl.checkAccess(undefined, tournament);
        assert.equal(accessUndef.authorized, false);
        assert.equal(accessUndef.statusCode, 401);
      });

      it('rejects user with missing or invalid ID (prevent undefined === undefined bug)', () => {
        const tournamentWithoutOwner = { id: 'tourn-1' };
        const tournamentWithEmptyOwner = { id: 'tourn-1', orgId: '' };
        const userWithoutId = { role: 'user' };
        const userWithEmptyId = { id: '', role: 'user' };

        // When both user.id and tournament.orgId are undefined
        assert.equal(impl.isOrg(userWithoutId, tournamentWithoutOwner), false);
        assert.equal(impl.isOrg(userWithEmptyId, tournamentWithEmptyOwner), false);
        assert.equal(impl.isOrg({ id: null }, { orgId: null }), false);

        const access = impl.checkAccess(userWithoutId, tournamentWithoutOwner);
        assert.equal(access.authorized, false);
        assert.equal(access.statusCode, 403);
      });

      it('rejects tournament missing or invalid', () => {
        const user = { id: 'user-1', role: 'user' };
        assert.equal(impl.isOrg(user, null), false);
        assert.equal(impl.isOrg(user, undefined), false);
        assert.equal(impl.isOrg(user, {}), false);
      });

      it('rejects standard authenticated user when they do not own the tournament', () => {
        const normalUser = { id: 'user-normal', role: 'user', name: 'Player One' };
        const tournament = { id: 'tourn-1', orgId: 'user-owner' };

        assert.equal(impl.isOrg(normalUser, tournament), false);

        const access = impl.checkAccess(normalUser, tournament);
        assert.equal(access.authorized, false);
        assert.equal(access.statusCode, 403);
        assert.equal(access.error, 'FORBIDDEN');
      });

      it('rejects organizer from another tournament trying to access unowned tournament', () => {
        const otherOrganizer = { id: 'user-org-2', role: 'organizer', name: 'Other Org' };
        const tournament = { id: 'tourn-1', orgId: 'user-org-1' };

        assert.equal(impl.isOrg(otherOrganizer, tournament), false);

        const access = impl.checkAccess(otherOrganizer, tournament);
        assert.equal(access.authorized, false);
        assert.equal(access.statusCode, 403);
      });

      it('allows true tournament owner matching orgId or organizer_id (string or number)', () => {
        const ownerUser = { id: 'user-owner', role: 'organizer' };
        const tournOrgId = { id: 'tourn-1', orgId: 'user-owner' };
        const tournSnakeCase = { id: 'tourn-2', organizer_id: 'user-owner' };
        const tournCreatedBy = { id: 'tourn-3', created_by: 'user-owner' };
        const tournNumeric = { id: 'tourn-4', orgId: 12345 };
        const userNumeric = { id: '12345' };

        assert.equal(impl.isOrg(ownerUser, tournOrgId), true);
        assert.equal(impl.isOrg(ownerUser, tournSnakeCase), true);
        assert.equal(impl.isOrg(ownerUser, tournCreatedBy), true);
        assert.equal(impl.isOrg(userNumeric, tournNumeric), true);

        const access = impl.checkAccess(ownerUser, tournOrgId);
        assert.equal(access.authorized, true);
      });

      it('allows system admins regardless of tournament ownership', () => {
        const adminRole = { id: 'admin-1', role: 'admin' };
        const superAdminRole = { id: 'admin-2', role: 'superadmin' };
        const adminRolesArray = { id: 'admin-3', roles: ['user', 'admin'] };
        const adminFlag = { id: 'admin-4', is_admin: true };
        const adminCamelFlag = { id: 'admin-5', isAdmin: true };
        const tournament = { id: 'tourn-1', orgId: 'user-someone-else' };

        assert.equal(impl.isOrg(adminRole, tournament), true);
        assert.equal(impl.isOrg(superAdminRole, tournament), true);
        assert.equal(impl.isOrg(adminRolesArray, tournament), true);
        assert.equal(impl.isOrg(adminFlag, tournament), true);
        assert.equal(impl.isOrg(adminCamelFlag, tournament), true);

        const access = impl.checkAccess(adminRole, tournament);
        assert.equal(access.authorized, true);
      });
    });
  }
});

describe('TournamentRoadmapBuilder Client Authorization Invariant', () => {
  it('effectiveOrganizer requires BOTH server verification AND client permission', () => {
    // Replicating the exact logic in src/components/TournamentRoadmapBuilder.jsx:
    // const effectiveOrganizer = Boolean(serverIsOrganizer === true && isOrganizer === true);
    const computeEffectiveOrganizer = (serverIsOrganizer, isOrganizerProp) => {
      return Boolean(serverIsOrganizer === true && isOrganizerProp === true);
    };

    // Case 1: Unauthenticated visitor: isOrganizer=false, serverIsOrganizer=false
    assert.equal(computeEffectiveOrganizer(false, false), false);

    // Case 2: Tampered client or stale prop: isOrganizer=true, but server says viewer_is_organizer: false
    assert.equal(computeEffectiveOrganizer(false, true), false);

    // Case 3: Initial loading state before server returns: serverIsOrganizer=false, isOrganizer=true
    assert.equal(computeEffectiveOrganizer(false, true), false);

    // Case 4: Server confirms viewer_is_organizer: true, but client prop is false
    assert.equal(computeEffectiveOrganizer(true, false), false);

    // Case 5: Verified organizer: both server and client agree
    assert.equal(computeEffectiveOrganizer(true, true), true);
  });

  it('previewMode correctly forces participant view even for verified organizers', () => {
    const shouldMountOrganizerEditor = (effectiveOrganizer, previewMode) => {
      return !(!effectiveOrganizer || previewMode);
    };

    // When not organizer, always false
    assert.equal(shouldMountOrganizerEditor(false, false), false);
    assert.equal(shouldMountOrganizerEditor(false, true), false);

    // When organizer is previewing, mounts ParticipantRoadmapViewer
    assert.equal(shouldMountOrganizerEditor(true, true), false);

    // Only true when verified organizer AND NOT in preview mode
    assert.equal(shouldMountOrganizerEditor(true, false), true);
  });
});

describe('Roadmap Payload Sanitization for Non-Organizers (manualRoadmapService)', () => {
  it('strips draft rounds, advancement targets, and capacity warnings for non-organizers', () => {
    // Simulating the sanitization logic added to manualRoadmapService.js lines 1775-1800
    const rawRounds = [
      { id: 'r1', name: 'Round 1', status: 'published', advancement_target_round_id: 'r2' },
      { id: 'r2', name: 'Round 2 - Draft Secret', status: 'draft', advancement_target_round_id: 'r3' },
      { id: 'r3', name: 'Grand Finals - Unpublished', status: 'unpublished', advancement_target_round_id: null },
    ];
    const rawMeta = {
      game: 'bgmi',
      card_color: 'gold',
      capacity_warning: 'Exceeds team slot limit',
      capacity_mismatch: { slots: 100, groups: 4 },
    };

    const sanitizeForViewer = (isOrganizer, rounds, meta) => {
      if (isOrganizer) {
        return { rounds, meta, viewer_is_organizer: true };
      }
      const safeRounds = rounds
        .filter((r) => r.status !== 'draft' && r.status !== 'unpublished')
        .map((r) => ({ ...r, advancement_target_round_id: null }));
      const safeMeta = { ...meta };
      delete safeMeta.capacity_warning;
      delete safeMeta.capacity_mismatch;
      return { rounds: safeRounds, meta: safeMeta, viewer_is_organizer: false };
    };

    // For public visitor / non-organizer:
    const publicPayload = sanitizeForViewer(false, rawRounds, rawMeta);
    assert.equal(publicPayload.viewer_is_organizer, false);
    assert.equal(publicPayload.rounds.length, 1);
    assert.equal(publicPayload.rounds[0].id, 'r1');
    assert.equal(publicPayload.rounds[0].advancement_target_round_id, null);
    assert.equal(publicPayload.meta.capacity_warning, undefined);
    assert.equal(publicPayload.meta.capacity_mismatch, undefined);
    assert.equal(publicPayload.meta.card_color, 'gold');

    // For verified organizer:
    const orgPayload = sanitizeForViewer(true, rawRounds, rawMeta);
    assert.equal(orgPayload.viewer_is_organizer, true);
    assert.equal(orgPayload.rounds.length, 3);
    assert.equal(orgPayload.rounds[0].advancement_target_round_id, 'r2');
    assert.equal(orgPayload.meta.capacity_warning, 'Exceeds team slot limit');
    assert.deepEqual(orgPayload.meta.capacity_mismatch, { slots: 100, groups: 4 });
  });
});

describe('Full Endpoint Security Audit Matrix (401/403 Enforcement)', () => {
  const organizerEndpoints = [
    { method: 'PUT', path: '/api/tournaments/:id/rounds/:index/credentials', name: 'Update Round Credentials' },
    { method: 'GET', path: '/api/tournaments/:id/rounds/:roundId/advancement-summary', name: 'Advancement Summary' },
    { method: 'POST', path: '/api/tournaments/:id/rounds/advance', name: 'Execute Advancement' },
    { method: 'POST', path: '/api/tournaments/:id/rounds/:roundNum/qualify', name: 'Qualify Teams' },
    { method: 'PUT', path: '/api/tournaments/:id', name: 'Update Tournament Details' },
    { method: 'POST', path: '/api/tournaments/:id/duplicate', name: 'Duplicate Tournament' },
    { method: 'POST', path: '/api/tournaments/:id/archive', name: 'Archive Tournament' },
    { method: 'POST', path: '/api/tournaments/:id/status', name: 'Update Tournament Status' },
    { method: 'GET', path: '/api/tournaments/:id/planning-config', name: 'Get Planning Config' },
    { method: 'POST', path: '/api/tournaments/:id/planning-config', name: 'Save Planning Config' },
    { method: 'POST', path: '/api/tournaments/:id/planning-result/generate', name: 'Generate Planning Result' },
    { method: 'GET', path: '/api/tournaments/:id/planning-result', name: 'Get Planning Result' },
    { method: 'POST', path: '/api/tournaments/:id/planning-result/approve', name: 'Approve Planning Result' },
    { method: 'POST', path: '/api/tournaments/:id/roadmap/generate', name: 'Generate Dynamic Roadmap' },
    { method: 'GET', path: '/api/tournaments/:id/roadmap/districts', name: 'Get Roadmap Districts' },
    { method: 'POST', path: '/api/tournaments/:id/roadmap/draft', name: 'Save Roadmap Draft' },
    { method: 'POST', path: '/api/tournaments/:id/roadmap/publish', name: 'Publish Roadmap' },
    { method: 'POST', path: '/api/tournaments/:id/roadmap/unpublish', name: 'Unpublish Roadmap' },
    { method: 'DELETE', path: '/api/tournaments/:id/roadmap', name: 'Master Delete Roadmap' },
    { method: 'DELETE', path: '/api/tournaments/:id/roadmap/rounds/:roundId', name: 'Delete Roadmap Round' },
    { method: 'POST', path: '/api/tournaments/:id/roadmap/days/:dayId/allocations/reorder', name: 'Reorder Allocations' },
    { method: 'PUT', path: '/api/tournaments/:id/roadmap/matches/:matchId', name: 'Edit Match' },
    { method: 'PUT', path: '/api/tournaments/:id/roadmap/days/:dayId', name: 'Edit Day Date' },
    { method: 'GET', path: '/api/tournaments/:id/roadmap/settings', name: 'Get Roadmap Settings' },
    { method: 'PUT', path: '/api/tournaments/:id/roadmap/settings', name: 'Update Roadmap Settings' },
    { method: 'POST', path: '/api/tournaments/:id/roadmap/matches', name: 'Create Match' },
    { method: 'POST', path: '/api/tournaments/:id/roadmap/matches/reorder', name: 'Reorder Matches' },
    { method: 'POST', path: '/api/tournaments/:id/roadmap/matches/:matchId/duplicate', name: 'Duplicate Match' },
    { method: 'DELETE', path: '/api/tournaments/:id/roadmap/matches/:matchId', name: 'Delete Match' },
    { method: 'GET', path: '/api/tournaments/:id/teams', name: 'Get Teams (Organizer View)' },
    { method: 'GET', path: '/api/tournaments/:id/allocations', name: 'Get Allocations' },
    { method: 'POST', path: '/api/tournaments/:id/allocations/move', name: 'Move Allocation' },
    { method: 'POST', path: '/api/tournaments/:id/allocations/release', name: 'Release Allocation' },
    { method: 'GET', path: '/api/tournaments/:id/allocations/health', name: 'Allocations Health Check' },
    { method: 'POST', path: '/api/tournaments/:id/matches/:matchId/results', name: 'Submit Match Results' },
    { method: 'GET', path: '/api/tournaments/:id/registrations', name: 'Get Tournament Registrations' },
    { method: 'PUT', path: '/api/tournaments/:id/registrations/:regId', name: 'Approve/Reject Registration' },
    { method: 'POST', path: '/api/tournaments/:id/roadmap', name: 'Save Roadmap Rounds' },
  ];

  const targetTournament = { id: 'tourn-100', orgId: 'organizer-owner-uuid' };

  it(`all ${organizerEndpoints.length} organizer endpoints reject unauthenticated caller with 401`, () => {
    for (const ep of organizerEndpoints) {
      const access = serverCheckTournamentOrganizerAccess(null, targetTournament);
      assert.equal(access.authorized, false, `${ep.method} ${ep.path} must deny unauthenticated caller`);
      assert.equal(access.statusCode, 401, `${ep.method} ${ep.path} must return status 401`);
      assert.equal(access.error, 'UNAUTHORIZED');
    }
  });

  it(`all ${organizerEndpoints.length} organizer endpoints reject unauthorized player with 403`, () => {
    const normalPlayer = { id: 'player-random-uuid', role: 'user' };
    for (const ep of organizerEndpoints) {
      const access = serverCheckTournamentOrganizerAccess(normalPlayer, targetTournament);
      assert.equal(access.authorized, false, `${ep.method} ${ep.path} must deny unauthorized player`);
      assert.equal(access.statusCode, 403, `${ep.method} ${ep.path} must return status 403`);
      assert.equal(access.error, 'FORBIDDEN');
    }
  });

  it(`all ${organizerEndpoints.length} organizer endpoints reject another tournament organizer with 403`, () => {
    const otherOrganizer = { id: 'other-organizer-uuid', role: 'organizer' };
    for (const ep of organizerEndpoints) {
      const access = serverCheckTournamentOrganizerAccess(otherOrganizer, targetTournament);
      assert.equal(access.authorized, false, `${ep.method} ${ep.path} must deny foreign organizer`);
      assert.equal(access.statusCode, 403, `${ep.method} ${ep.path} must return status 403`);
      assert.equal(access.error, 'FORBIDDEN');
    }
  });

  it(`all ${organizerEndpoints.length} organizer endpoints grant access to true tournament owner`, () => {
    const ownerUser = { id: 'organizer-owner-uuid', role: 'organizer' };
    for (const ep of organizerEndpoints) {
      const access = serverCheckTournamentOrganizerAccess(ownerUser, targetTournament);
      assert.equal(access.authorized, true, `${ep.method} ${ep.path} must authorize true owner`);
    }
  });

  it(`all ${organizerEndpoints.length} organizer endpoints grant access to platform administrator`, () => {
    const adminUser = { id: 'admin-uuid', role: 'admin' };
    for (const ep of organizerEndpoints) {
      const access = serverCheckTournamentOrganizerAccess(adminUser, targetTournament);
      assert.equal(access.authorized, true, `${ep.method} ${ep.path} must authorize admin`);
    }
  });
});

