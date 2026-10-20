/**
 * Single source of truth for checking if a tournament roadmap is published.
 * Compatible with both tournament DB rows and API response payloads.
 * Used identically on server and client.
 *
 * @param {object|null} tournament
 * @returns {boolean}
 */
export function isRoadmapPublished(tournament) {
  if (!tournament) return false;
  if (typeof tournament.published === 'boolean') {
    return tournament.published;
  }
  const status = tournament.roadmap_status || tournament.status;
  const roundsPublished = tournament.rounds_published;
  return (status === 'approved' || status === 'published') && roundsPublished !== false;
}
