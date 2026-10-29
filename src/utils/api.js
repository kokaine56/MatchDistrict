/**
 * Fetch JSON with retries for transient network / server errors.
 */
export async function fetchJsonWithRetry(url, options = {}, retries = 3, baseDelayMs = 500) {
  let lastError = null
  let lastData = null
  let lastStatus = 0

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, options)
      lastStatus = res.status
      lastData = await res.json().catch(() => ({}))

      if (res.ok) {
        return { ok: true, data: lastData, status: res.status }
      }

      lastError = new Error(
        lastData?.message || lastData?.error || `Request failed (${res.status})`
      )

      // Don't retry most client errors
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        break
      }
    } catch (err) {
      lastError = err
    }

    if (attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)))
    }
  }

  return { ok: false, data: lastData, error: lastError, status: lastStatus }
}

export function normalizeTournamentRow(matched) {
  if (!matched) return null
  return {
    ...matched,
    orgId: matched.orgId || matched.organizer_id || matched.organizerId || matched.org_id || '',
    bannerUrl: matched.bannerUrl || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
    logoUrl: matched.logoUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=100&q=80',
    region: matched.region || 'Mumbai',
    format: matched.format || 'Battle Royale',
    slotsTotal: parseInt(matched.slotsTotal, 10) || 100,
    slotsFilled: parseInt(matched.slotsFilled, 10) || 0,
    roomID: matched.roomID || '',
    roomPassword: matched.roomPassword || '',
    rules: matched.rules || 'Matches commence exactly at coordinate check-in intervals.',
    prizeSplit1st: matched.prize_split_1st || matched.prizeSplit1st || 'TBD',
    prizeSplit2nd: matched.prize_split_2nd || matched.prizeSplit2nd || 'TBD',
    prizeSplit3rd: matched.prize_split_3rd || matched.prizeSplit3rd || 'TBD',
    prizeSplitMvp: matched.prize_split_mvp || matched.prizeSplitMvp || 'TBD',
    kycRequired: matched.kycRequired ?? true,
    emulatorBanned: matched.emulatorBanned ?? true,
    antiCheatRequired: matched.antiCheatRequired ?? true,
    match_type: matched.match_type || 'squad',
    perspective: matched.perspective || 'tpp',
    reserved_slots: parseInt(matched.reserved_slots, 10) || 0,
    entry_fee_amount: parseInt(matched.entry_fee_amount, 10) || 0,
    prize_pool_type: matched.prize_pool_type || 'fixed',
    prize_pool_amount: parseInt(matched.prize_pool_amount, 10) || 0,
    payment_qr_image_url: matched.payment_qr_image_url || '',
    payment_upi_id: matched.payment_upi_id || '',
    prize_split_1st: matched.prize_split_1st || 'TBD',
    prize_split_2nd: matched.prize_split_2nd || 'TBD',
    prize_split_3rd: matched.prize_split_3rd || 'TBD',
    prize_split_mvp: matched.prize_split_mvp || 'TBD',
    description: matched.description || '',
    cover_image_url: matched.cover_image_url || '',
    orgImage: matched.userOrgImage || matched.orgImage || '',
    lobby_start_time: matched.lobby_start_time || '',
    teams: (() => {
      try {
        return typeof matched.teams === 'string' ? JSON.parse(matched.teams) : (matched.teams || [])
      } catch {
        return []
      }
    })(),
    max_slots_per_room: matched.max_slots_per_room ? parseInt(matched.max_slots_per_room, 10) : null,
    sponsors_enabled: matched.sponsors_enabled ?? false,
    rounds_published: matched.rounds_published !== false && matched.rounds_published !== 'false',
    sponsors_data: (() => {
      try {
        return typeof matched.sponsors_data === 'string' ? JSON.parse(matched.sponsors_data) : (matched.sponsors_data || [])
      } catch {
        return []
      }
    })(),
    hasApprovedSponsors: (() => {
      try {
        const data = typeof matched.sponsors_data === 'string' ? JSON.parse(matched.sponsors_data) : (matched.sponsors_data || [])
        return Array.isArray(data) && data.some(s => s.status === 'approved')
      } catch {
        return false
      }
    })(),
    totalSponsorContributions: (() => {
      try {
        const data = typeof matched.sponsors_data === 'string' ? JSON.parse(matched.sponsors_data) : (matched.sponsors_data || [])
        return Array.isArray(data) ? data.filter(s => s.status === 'approved').reduce((sum, s) => sum + (parseInt(s.amount) || 0), 0) : 0
      } catch {
        return 0
      }
    })(),
    basePrize: parseInt(matched.prize_pool_amount || matched.basePrize || 0, 10) || 0,
    totalPrize: parseInt(matched.prize_pool_amount || matched.basePrize || 0, 10) || 0,
    social_links: (() => {
      try {
        if (!matched.social_links) return {}
        return typeof matched.social_links === 'string' ? JSON.parse(matched.social_links) : (matched.social_links || {})
      } catch {
        return {}
      }
    })(),
    discord_invite_url: matched.discord_invite_url || '',
  }
}
