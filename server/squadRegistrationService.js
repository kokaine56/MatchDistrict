// server/squadRegistrationService.js
// Shared single source of truth for squad capacity, roster slots, and registration stages.
// Mirrored on the client in src/utils/squadRegistration.js.

/**
 * Parses raw registration members into a normalized array of { ign, uid }.
 * Handles JSON string or raw array.
 */
export function parseRosterMembers(rawMembers) {
  if (!rawMembers) return [];
  if (Array.isArray(rawMembers)) {
    return rawMembers
      .filter((m) => m && (typeof m === 'object' ? m.ign || m.uid : typeof m === 'string' && m.trim()))
      .map((m) => (typeof m === 'object' ? { ign: (m.ign || '').trim(), uid: (m.uid || '').trim() } : { ign: m.trim(), uid: '' }));
  }
  if (typeof rawMembers === 'string' && rawMembers.trim()) {
    try {
      const parsed = JSON.parse(rawMembers);
      if (Array.isArray(parsed)) return parseRosterMembers(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Derives squad capacity from:
 * 1. Registration roster size (1 leader + registered members count) when non-empty.
 * 2. Fall back to tournament.players_per_team (if > 0).
 * 3. Fall back to match_type (solo=1, duo=2, else 4).
 */
export function computeSquadCapacity(registration, tournament) {
  const members = parseRosterMembers(registration?.members);
  if (members.length > 0) {
    return 1 + members.length;
  }
  const ppt = parseInt(tournament?.players_per_team, 10);
  if (Number.isFinite(ppt) && ppt > 0) {
    return ppt;
  }
  const matchType = String(tournament?.match_type || '').trim().toLowerCase();
  if (matchType === 'solo') return 1;
  if (matchType === 'duo') return 2;
  return 4;
}

/**
 * Builds the ordered list of roster slots for a registration.
 * Slot 0 is always the leader/captain.
 * Slots 1..N-1 are teammates from the registration roster (or generic fallback).
 */
export function parseRosterSlots(registration, tournament) {
  const capacity = computeSquadCapacity(registration, tournament);
  const members = parseRosterMembers(registration?.members);
  const leaderIgn = (registration?.captain || '').trim() || 'Leader';

  const slots = [
    {
      slot: 0,
      ign: leaderIgn,
      role: 'leader',
      is_leader: true,
    },
  ];

  for (let i = 1; i < capacity; i++) {
    const memberEntry = members[i - 1];
    const ign = memberEntry?.ign || `Player ${i + 1}`;
    slots.push({
      slot: i,
      ign,
      role: 'member',
      is_leader: false,
    });
  }

  return slots;
}

/**
 * Computes the authoritative registration stage for a team/registration.
 * Stages:
 * - 'payment_pending': Registration waiting for payment or review.
 * - 'rejected_cancelled': Registration rejected or cancelled.
 * - 'slot_secured_squad_incomplete': Slot secured (approved/confirmed), squad not complete.
 * - 'fully_registered': Squad has all roster slots linked, or squad requirement waived by organizer.
 *
 * @param {object} params
 * @param {string} params.registrationStatus
 * @param {number} params.capacity
 * @param {number} params.joinedCount
 * @param {boolean} params.isWaived
 * @param {string} params.teamStatus
 */
export function computeRegistrationStage({
  registrationStatus = 'pending',
  capacity = 4,
  joinedCount = 1,
  isWaived = false,
  teamStatus = null,
} = {}) {
  const normReg = String(registrationStatus || '').toLowerCase();

  if (['rejected', 'cancelled', 'expired', 'payment_rejected'].includes(normReg)) {
    return {
      stage: 'rejected_cancelled',
      label: 'Rejected / Cancelled',
      isComplete: false,
      joined: joinedCount,
      required: capacity,
      message: 'Registration was rejected or cancelled.',
    };
  }

  if (['pending_payment', 'pending', 'pending_payment_verification', 'waitlisted'].includes(normReg)) {
    return {
      stage: 'payment_pending',
      label: normReg === 'waitlisted' ? 'Waitlisted' : 'Payment / Verification Pending',
      isComplete: false,
      joined: joinedCount,
      required: capacity,
      message: 'Payment verification is pending.',
    };
  }

  // Approved or Confirmed
  if (isWaived) {
    return {
      stage: 'fully_registered',
      label: 'Fully registered (Squad waived)',
      isComplete: true,
      joined: joinedCount,
      required: capacity,
      isWaived: true,
      message: 'Fully registered (Squad requirement waived by organizer).',
    };
  }

  // Grandfathered status check: teams already verified or allocated are complete
  if (teamStatus && ['verified', 'allocated', 'allocation_pending'].includes(teamStatus)) {
    return {
      stage: 'fully_registered',
      label: 'Fully registered',
      isComplete: true,
      joined: Math.max(joinedCount, capacity),
      required: capacity,
      message: 'Fully registered',
    };
  }

  if (joinedCount >= capacity) {
    return {
      stage: 'fully_registered',
      label: 'Fully registered',
      isComplete: true,
      joined: joinedCount,
      required: capacity,
      message: 'Fully registered',
    };
  }

  return {
    stage: 'slot_secured_squad_incomplete',
    label: `Squad ${joinedCount}/${capacity}`,
    isComplete: false,
    joined: joinedCount,
    required: capacity,
    message: `Slot secured. Complete your squad (${joinedCount}/${capacity}) to unlock match room details`,
  };
}
