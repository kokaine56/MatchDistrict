// src/utils/squadRegistration.js
// Client mirror of server/squadRegistrationService.js.
// Shared single source of truth for squad capacity, roster slots, and registration stages.

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

export function computeSquadCapacity(registration, tournament) {
  const members = parseRosterMembers(registration?.members);
  if (members.length > 0) {
    return 1 + members.length;
  }
  const matchType = String(tournament?.match_type || '').trim().toLowerCase();
  if (matchType === 'solo') return 1;
  if (matchType === 'duo') return 2;
  return 4;
}

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
