export function getTournamentLifecycleStatus(t, now = new Date()) {
  if (!t) return 'upcoming';

  const stored = (t.status || '').toLowerCase();
  if (stored === 'live' || stored === 'active') return 'live';
  if (stored === 'completed') return 'completed';

  const regOpenStr = t.registrationOpenDate || t.registration_open_date;
  const regCloseStr = t.registrationCloseDate || t.registration_close_date;
  const regOpen = regOpenStr ? new Date(regOpenStr) : null;
  const regClose = regCloseStr ? new Date(regCloseStr) : null;

  if (regOpen && now < regOpen) return 'upcoming';
  if (regOpen && now >= regOpen && (!regClose || now <= regClose)) return 'open';
  if (regClose && now > regClose) return 'closed';

  return 'upcoming';
}

export function getStatusBadgeConfig(status) {
  switch (status) {
    case 'upcoming':
      return {
        text: 'Upcoming',
        bg: 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
      };
    case 'open':
      return {
        text: 'Reg. open',
        bg: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
      };
    case 'closed':
      return {
        text: 'Reg. closed',
        bg: 'bg-slate-500/25 text-slate-400 border border-slate-500/30'
      };
    case 'live':
      return {
        text: 'Live',
        bg: 'bg-rose-500/20 text-rose-400 border border-rose-500/30 font-black animate-pulse'
      };
    case 'completed':
      return {
        text: 'Completed',
        bg: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
      };
    default:
      return {
        text: 'Upcoming',
        bg: 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
      };
  }
}

export function getCTAButtonConfig(status) {
  return {
    text: 'View Details',
    disabled: false,
    styleClass: 'bg-primary hover:bg-primary/95 text-white active:scale-95 shadow-[0_0_12px_rgba(99,102,241,0.25)]'
  };
}
