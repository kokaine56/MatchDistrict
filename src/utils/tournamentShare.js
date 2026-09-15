export function getTournamentShareUrl(tournament) {
  if (tournament && typeof tournament.url === 'string' && tournament.url.trim()) {
    return tournament.url.trim();
  }
  if (tournament && tournament.id && typeof window !== 'undefined' && window.location && window.location.origin) {
    return `${window.location.origin}/tournaments/${tournament.id}`;
  }
  return typeof window !== 'undefined' && window.location ? window.location.href : '';
}

export function formatTournamentShareText(tournament = {}) {
  const title = String(tournament.title || 'Tournament on Match District').trim();
  const url = getTournamentShareUrl(tournament);

  const parts = [`🏆 ${title}`];

  const orgName = String(tournament.orgName || '').trim();
  if (orgName) parts.push('', `Organized by ${orgName}`);

  const stats = [];
  if (tournament.prize != null && tournament.prize !== '') stats.push(`💰 Prize Pool: ${tournament.prize}`);
  if (tournament.entry != null && tournament.entry !== '') stats.push(`🎟️ Entry Fee: ${tournament.entry}`);
  if (tournament.format) stats.push(`🎮 Format: ${tournament.format}`);
  if (tournament.slots) stats.push(`👥 Slots: ${tournament.slots}`);
  if (stats.length) parts.push('', stats.join('\n'));

  parts.push('', 'Join the tournament on Match District:');
  if (url) parts.push(url);

  return parts.join('\n');
}

export async function copyShareTextToClipboard(shareText) {
  const text = String(shareText || '');
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return text;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!ok) throw new Error('Clipboard fallback failed');
  return text;
}

/**
 * Shares a tournament through the native Web Share API (text only).
 *
 * The tournament URL is embedded in `text` exactly once (via
 * formatTournamentShareText) and is intentionally NOT passed through the
 * `url` share field, so no share target can append a duplicate link.
 *
 * Returns one of:
 *   'shared'  — navigator.share() completed (native sheet shown).
 *   'aborted' — user cancelled/dismissed the native sheet (no toast needed).
 *   'copied'  — native sharing unavailable/failed; the exact share text copied to clipboard.
 *   'failed'  — neither native sharing nor clipboard succeeded.
 */
export async function shareTournament(tournament) {
  const shareText = formatTournamentShareText(tournament);
  const shareData = {
    title: (tournament && tournament.title) || 'Tournament on Match District',
    text: shareText
  };

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(shareData);
      return 'shared';
    } catch (error) {
      if (error && (error.name === 'AbortError' || error.name === 'NotAllowedError')) {
        return 'aborted';
      }
    }
  }

  try {
    await copyShareTextToClipboard(shareText);
    return 'copied';
  } catch (err) {
    console.error('[Share] Could not copy share text to clipboard', err);
    return 'failed';
  }
}