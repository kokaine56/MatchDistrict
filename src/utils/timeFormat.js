export function formatTime12h(time24) {
  if (!time24 || !/^\d{2}:\d{2}$/.test(time24)) return time24 || '';
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatTime12hIST(time24) {
  const t = formatTime12h(time24);
  return t ? `${t} IST` : '';
}

export function convertTo24h(h12, period) {
  const h = Number(h12);
  if (period === 'AM') return h === 12 ? 0 : h;
  return h === 12 ? 12 : h + 12;
}

export function parseTime12h(h12, m, period) {
  const h = convertTo24h(h12, period);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function splitTime24(time24) {
  if (!time24 || !/^\d{2}:\d{2}$/.test(time24)) return { h12: 12, m: '00', period: 'AM' };
  const h = Number(time24.slice(0, 2));
  const m = time24.slice(3, 5);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { h12, m, period };
}

export function formatDateIST(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + '+05:30');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) + ' IST';
  } catch {
    return dateStr;
  }
}
