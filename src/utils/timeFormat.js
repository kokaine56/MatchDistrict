function pad(n) { return String(n).padStart(2, '0') }

/**
 * Format a date string to DD/MM/YYYY
 * @param {string} dateStr - ISO date string or datetime-local value
 * @returns {string} e.g. "03/08/2026"
 */
export function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  } catch { return dateStr }
}

/**
 * Format a date string to DD/MM/YYYY HH:MM (24h)
 * @param {string} dateStr - ISO date string or datetime-local value
 * @returns {string} e.g. "03/08/2026 14:30"
 */
export function formatDateTime(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return dateStr }
}

/**
 * Format a date string to DD/MM/YYYY HH:MM IST
 * @param {string} dateStr - ISO date string
 * @returns {string} e.g. "03/08/2026 14:30 IST"
 */
export function formatDateTimeIST(dateStr) {
  if (!dateStr) return ''
  try {
    const hasTz = /[Z+-]\d{2}:\d{2}$/.test(dateStr) || dateStr.endsWith('Z')
    const d = new Date(hasTz ? dateStr : dateStr + '+05:30')
    if (isNaN(d.getTime())) return dateStr
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())} IST`
  } catch { return dateStr }
}

/**
 * Format a date string to DD/MM/YYYY (with IST offset if no timezone)
 * @param {string} dateStr - ISO date string
 * @returns {string} e.g. "03/08/2026"
 */
export function formatDateIST(dateStr) {
  if (!dateStr) return ''
  try {
    const hasTz = /[Z+-]\d{2}:\d{2}$/.test(dateStr) || dateStr.endsWith('Z')
    const d = new Date(hasTz ? dateStr : dateStr + '+05:30')
    if (isNaN(d.getTime())) return dateStr
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  } catch { return dateStr }
}

/**
 * Format date + time parts to DD/MM/YYYY HH:MM
 * @param {string} dateStr - e.g. "2026-08-03"
 * @param {string} timeStr - e.g. "14:30"
 * @returns {string} e.g. "03/08/2026 14:30"
 */
export function formatRoundDateTime(dateStr, timeStr) {
  if (!dateStr) return 'TBD'
  if (timeStr) return `${formatDate(dateStr)} ${timeStr}`
  return formatDate(dateStr)
}

export function formatTime12h(time24) {
  if (!time24 || !/^\d{2}:\d{2}$/.test(time24)) return time24 || ''
  const [h, m] = time24.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${pad(m)} ${period}`
}

export function formatTime12hIST(time24) {
  const t = formatTime12h(time24)
  return t ? `${t} IST` : ''
}

export function convertTo24h(h12, period) {
  const h = Number(h12)
  if (period === 'AM') return h === 12 ? 0 : h
  return h === 12 ? 12 : h + 12
}

export function parseTime12h(h12, m, period) {
  const h = convertTo24h(h12, period)
  return `${pad(h)}:${pad(m)}`
}

export function splitTime24(time24) {
  if (!time24 || !/^\d{2}:\d{2}$/.test(time24)) return { h12: 12, m: '00', period: 'AM' }
  const h = Number(time24.slice(0, 2))
  const m = time24.slice(3, 5)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return { h12, m, period }
}
