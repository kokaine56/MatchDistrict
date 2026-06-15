export function getTournamentLifecycleStatus(t, now = new Date()) {
  if (!t) return 'upcoming';

  // Support both snake_case and camelCase keys from DB/API normalization
  const regOpenStr = t.registrationOpenDate || t.registration_open_date;
  const regCloseStr = t.registrationCloseDate || t.registration_close_date;
  const matchStartStr = t.startDate || t.start_date || t.date;

  const regOpen = regOpenStr ? new Date(regOpenStr) : null;
  const regClose = regCloseStr ? new Date(regCloseStr) : null;
  const matchStart = matchStartStr ? new Date(matchStartStr) : null;

  if (regOpen && now < regOpen) {
    return 'upcoming';
  }
  if (regOpen && regClose && now >= regOpen && now <= regClose) {
    return 'open';
  }
  if (regClose && matchStart && now > regClose && now < matchStart) {
    return 'closed';
  }
  if (matchStart && now >= matchStart) {
    return 'live';
  }

  // Fallback to static status if timestamps are missing
  const fallbackStatus = (t.status || 'upcoming').toLowerCase();
  if (fallbackStatus === 'live' || fallbackStatus === 'active') return 'live';
  if (fallbackStatus === 'open' || fallbackStatus === 'registrations_open') return 'open';
  if (fallbackStatus === 'closed' || fallbackStatus === 'registration_closed') return 'closed';
  return 'upcoming';
}

export function getStatusBadgeConfig(status) {
  switch (status) {
    case 'upcoming':
      return {
        text: 'UPCOMING',
        bg: 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
      };
    case 'open':
      return {
        text: 'REGISTRATION OPEN',
        bg: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
      };
    case 'closed':
      return {
        text: 'REGISTRATION CLOSED',
        bg: 'bg-slate-500/25 text-slate-400 border border-slate-500/30'
      };
    case 'live':
      return {
        text: 'LIVE',
        bg: 'bg-rose-500/20 text-rose-400 border border-rose-500/30 font-black animate-pulse'
      };
    default:
      return {
        text: 'UPCOMING',
        bg: 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
      };
  }
}

export function getCTAButtonConfig(status) {
  switch (status) {
    case 'upcoming':
      return {
        text: 'Registration Not Started',
        disabled: true,
        styleClass: 'opacity-60 cursor-not-allowed bg-blue-500/10 text-blue-400/80 border border-blue-500/20'
      };
    case 'open':
      return {
        text: 'Join Now',
        disabled: false,
        styleClass: 'bg-primary hover:bg-primary/95 text-white active:scale-95 shadow-[0_0_12px_rgba(99,102,241,0.25)]'
      };
    case 'closed':
      return {
        text: 'Registration Closed',
        disabled: true,
        styleClass: 'opacity-60 cursor-not-allowed bg-slate-500/10 text-slate-400/80 border border-slate-500/25'
      };
    case 'live':
      return {
        text: 'View Match',
        disabled: false,
        styleClass: 'bg-rose-600 hover:bg-rose-500 text-white font-bold animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.25)]'
      };
    default:
      return {
        text: 'Join Now',
        disabled: false,
        styleClass: 'bg-primary hover:bg-primary/95 text-white'
      };
  }
}
