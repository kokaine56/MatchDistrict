export const GAME_CANONICAL_OPTIONS = ['BGMI', 'CODM', 'Valorant', 'Free Fire', 'CS2']

const GAME_ALIASES = {
  bgmi: 'BGMI',
  'battlegrounds mobile india': 'BGMI',
  codm: 'CODM',
  'cod mobile': 'CODM',
  'call of duty mobile': 'CODM',
  'free fire': 'Free Fire',
  'freefire': 'Free Fire',
  valorant: 'Valorant',
  cs2: 'CS2',
  'counter-strike 2': 'CS2',
}

export function normalizeGameName(value) {
  const key = (value || '').trim().toLowerCase()
  return GAME_ALIASES[key] || (value && typeof value === 'string' ? value.trim() : '')
}