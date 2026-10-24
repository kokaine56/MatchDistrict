// server/avatarResolver.js
// Single source of truth for which profile picture is shown for a user.
//
// Rule: if a Google or Discord account is linked, show that provider's picture
// (the most recently linked provider wins when both are linked). Otherwise return
// null and the client Avatar component renders the uppercase initial on a colored
// circle. Previously uploaded custom avatars remain in users.avatar but are never shown.
//
// NOTE: Discord CDN avatar URLs contain the public Discord user ID. This is accepted.
// No other API field may expose discord_id to other users.

const GOOGLE_HOST = /(^|\.)googleusercontent\.com$/i;
const DISCORD_HOST = /^cdn\.discordapp\.com$/i;

function safeProviderUrl(provider, value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const allowed = provider === 'google' ? GOOGLE_HOST : DISCORD_HOST;
  return allowed.test(parsed.hostname) ? parsed.toString() : null;
}

/** Builds a Discord CDN URL from the public id and avatar hash. */
export function buildDiscordAvatarUrl(discordId, avatarHash) {
  const id = String(discordId || '').replace(/[^0-9]/g, '');
  const hash = String(avatarHash || '').replace(/[^a-zA-Z0-9_]/g, '');
  if (!id || !hash) return null;
  return `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=128`;
}

/**
 * Pure resolver. `user.avatarSources` is an array of { provider, url, linkedAt }.
 * Returns the https URL of the most recently linked provider picture, or null.
 */
export function resolveAvatarUrl(user) {
  const sources = Array.isArray(user?.avatarSources) ? user.avatarSources : [];
  const usable = sources
    .map((s) => ({ ...s, url: safeProviderUrl(s.provider, s.url) }))
    .filter((s) => s.url);
  if (!usable.length) return null;
  usable.sort((a, b) => new Date(b.linkedAt || 0).getTime() - new Date(a.linkedAt || 0).getTime());
  return usable[0].url;
}

/** Loads per-provider avatar sources for the given user ids. Returns Map(userId -> sources[]). */
export async function loadAvatarSources(db, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const result = new Map();
  if (!ids.length) return result;

  const push = (userId, source) => {
    if (!result.has(userId)) result.set(userId, []);
    result.get(userId).push(source);
  };

  const identities = await db.query(
    `SELECT user_id, provider, avatar_url, linked_at FROM auth_identities WHERE user_id = ANY($1::text[])`,
    [ids]
  );
  const identityByUser = new Map();
  for (const row of identities.rows) {
    identityByUser.set(`${row.user_id}:${row.provider}`, row);
  }

  const discord = await db.query(
    `SELECT user_id, discord_id, avatar_hash, connected_at FROM user_discord_connections WHERE user_id = ANY($1::text[])`,
    [ids]
  );
  const discordHandled = new Set();
  for (const row of discord.rows) {
    const identity = identityByUser.get(`${row.user_id}:discord`);
    const url = buildDiscordAvatarUrl(row.discord_id, row.avatar_hash) || identity?.avatar_url || null;
    discordHandled.add(row.user_id);
    push(row.user_id, {
      provider: 'discord',
      url,
      linkedAt: identity?.linked_at || row.connected_at || null,
    });
  }

  for (const row of identities.rows) {
    if (row.provider === 'discord' && discordHandled.has(row.user_id)) continue;
    push(row.user_id, { provider: row.provider, url: row.avatar_url, linkedAt: row.linked_at });
  }
  // The Discord connection table is authoritative for Discord; identity rows without
  // a connection row still contribute their stored provider URL (handled above).
  return result;
}

/**
 * Sets `avatar` and `avatarUrl` on each row to the resolved provider picture (or null).
 * Mutates and returns the rows. `idKey` names the property holding the users.id value.
 */
export async function attachResolvedAvatars(db, rows, idKey = 'id') {
  const list = Array.isArray(rows) ? rows : [rows];
  const present = list.filter(Boolean);
  const sources = await loadAvatarSources(db, present.map((r) => r[idKey]));
  for (const row of present) {
    const url = resolveAvatarUrl({ avatarSources: sources.get(String(row[idKey])) || [] });
    row.avatar = url;
    row.avatarUrl = url;
  }
  return rows;
}
