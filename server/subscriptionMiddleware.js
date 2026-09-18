const PLAN_FEATURES = {
  Free: {
    maxTournamentsPerMonth: 30,
    maxParticipantsPerTournament: 100,
    analytics: 'basic',
    staffManagement: false,
    staffLimit: 0,
    verifiedBadge: false,
    premiumBadge: false,
    whiteLabel: false,
    customSubdomain: false,
    apiAccess: false,
    tournamentAutomation: false,
    csvExport: false,
    sponsorSections: false,
    tournamentDuplication: false,
    discordIntegration: false,
    prioritySupport: false,
    advancedBranding: false,
    premiumDiscovery: false,
    advancedReports: false,
    multiAdmin: false,
    earlyAccess: false,
    customRegistrationForms: false,
    customLinks: false,
    apiRateLimit: 0
  },
  Basic: {
    maxTournamentsPerMonth: 60,
    maxParticipantsPerTournament: 300,
    analytics: 'advanced',
    staffManagement: true,
    staffLimit: 3,
    verifiedBadge: false,
    premiumBadge: false,
    whiteLabel: false,
    customSubdomain: false,
    apiAccess: false,
    tournamentAutomation: false,
    csvExport: true,
    sponsorSections: true,
    tournamentDuplication: true,
    discordIntegration: true,
    prioritySupport: true,
    advancedBranding: false,
    premiumDiscovery: false,
    advancedReports: false,
    multiAdmin: false,
    earlyAccess: false,
    customRegistrationForms: false,
    customLinks: true,
    apiRateLimit: 0
  },
  Pro: {
    maxTournamentsPerMonth: Infinity,
    maxParticipantsPerTournament: 1000,
    analytics: 'full',
    staffManagement: true,
    staffLimit: Infinity,
    verifiedBadge: true,
    premiumBadge: true,
    whiteLabel: true,
    customSubdomain: true,
    apiAccess: true,
    tournamentAutomation: true,
    csvExport: true,
    sponsorSections: true,
    tournamentDuplication: true,
    discordIntegration: true,
    prioritySupport: true,
    advancedBranding: true,
    premiumDiscovery: true,
    advancedReports: true,
    multiAdmin: true,
    earlyAccess: true,
    customRegistrationForms: true,
    customLinks: true,
    apiRateLimit: 1000
  }
};

const PLAN_ORDER = ['Free', 'Basic', 'Pro'];

async function requireFeature(pool, req, res, featureKey) {
  const authUser = req.authUser;
  if (!authUser) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
    return false;
  }

  try {
    const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
    if (userRes.rows.length === 0) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
      return false;
    }

    const tier = userRes.rows[0].tier || 'Free';
    const plan = PLAN_FEATURES[tier] || PLAN_FEATURES.Free;
    const hasAccess = plan[featureKey] === true || plan[featureKey] === Infinity;

    if (!hasAccess) {
      const requiredPlan = PLAN_ORDER.find(p => {
        const pPlan = PLAN_FEATURES[p];
        return pPlan && (pPlan[featureKey] === true || pPlan[featureKey] === Infinity);
      }) || 'Pro';

      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'FEATURE_LOCKED',
        message: `This feature requires the ${requiredPlan} plan or higher.`,
        requiredPlan,
        currentPlan: tier,
        featureKey
      }));
      return false;
    }

    return true;
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: err.message }));
    return false;
  }
}

async function checkPlanLimits(pool, userId, slotsTotal, isDraft, tournamentId = null) {
  const userRes = await pool.query('SELECT role, roles, tier, status FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) {
    return { allowed: false, error: 'User profile not found.' };
  }
  const user = userRes.rows[0];

  if (user.status === 'Held' || user.status === 'Suspended') {
    return { allowed: false, error: 'Administrative Hold: Your organizer privilege to host or edit tournaments is currently held/suspended.' };
  }

  if (isDraft) return { allowed: true, plan: PLAN_FEATURES[user.tier] || PLAN_FEATURES.Free };
  const userRoles = (user.roles && Array.isArray(user.roles) && user.roles.length > 0) ? user.roles : [user.role];
  if (userRoles.includes('admin')) return { allowed: true, plan: PLAN_FEATURES.Pro };

  const tier = user.tier || 'Free';
  const plan = PLAN_FEATURES[tier] || PLAN_FEATURES.Free;

  if (slotsTotal > plan.maxParticipantsPerTournament) {
    return {
      allowed: false,
      error: `Participant limit exceeded! Your ${tier} plan supports a maximum of ${plan.maxParticipantsPerTournament === Infinity ? 'unlimited' : plan.maxParticipantsPerTournament} participants per tournament.`,
      limitType: 'participants',
      limitValue: plan.maxParticipantsPerTournament,
      plan: tier
    };
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  let query = 'SELECT COUNT(*) FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false AND created_at >= $2';
  let params = [userId, startOfMonth];
  if (tournamentId) {
    query += ' AND id <> $3';
    params.push(tournamentId);
  }

  const countRes = await pool.query(query, params);
  const count = parseInt(countRes.rows[0].count);

  if (count >= plan.maxTournamentsPerMonth) {
    return {
      allowed: false,
      error: `Tournament hosting limit reached! Your ${tier} plan supports a maximum of ${plan.maxTournamentsPerMonth === Infinity ? 'unlimited' : plan.maxTournamentsPerMonth} published tournaments per month.`,
      limitType: 'tournaments',
      limitValue: plan.maxTournamentsPerMonth,
      plan: tier
    };
  }

  return { allowed: true, plan };
}

async function getOrganizerUsage(pool, userId) {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const userRes = await pool.query('SELECT tier, role FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) return null;
  const user = userRes.rows[0];
  const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;

  const tourneyRes = await pool.query(
    'SELECT COUNT(*) FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false AND created_at >= $2',
    [userId, startOfMonth]
  );
  const tournamentsUsed = parseInt(tourneyRes.rows[0].count) || 0;

  const slotsRes = await pool.query(
    'SELECT COALESCE(SUM("slotsFilled"), 0) as filled, COALESCE(SUM("slotsTotal"), 0) as total FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false',
    [userId]
  );
  const participantsUsed = parseInt(slotsRes.rows[0].filled) || 0;

  const staffRes = await pool.query(
    'SELECT COUNT(*) FROM staff_members WHERE organizer_id = $1 AND status = $2',
    [userId, 'active']
  );
  const staffUsed = parseInt(staffRes.rows[0].count) || 0;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const regRes = await pool.query(
    'SELECT COUNT(*) FROM tournament_registrations WHERE tournament_id IN (SELECT id FROM tournaments WHERE "orgId" = $1) AND created_at >= $2',
    [userId, thirtyDaysAgo]
  );
  const registrations30d = parseInt(regRes.rows[0].count) || 0;

  const activeRes = await pool.query(
    'SELECT COUNT(*) FROM tournaments WHERE "orgId" = $1 AND status = $2 AND "isDraft" = false',
    [userId, 'live']
  );
  const activeTournaments = parseInt(activeRes.rows[0].count) || 0;

  const completedRes = await pool.query(
    'SELECT COUNT(*) FROM tournaments WHERE "orgId" = $1 AND status = $2 AND "isDraft" = false',
    [userId, 'completed']
  );
  const completedCount = parseInt(completedRes.rows[0].count) || 0;
  const totalPublished = tournamentsUsed || 1;
  const completionRate = Math.round((completedCount / totalPublished) * 100);

  const exportRes = await pool.query(
    'SELECT COUNT(*) as cnt FROM export_usage_log WHERE organizer_id = $1 AND created_at >= $2',
    [userId, startOfMonth]
  );
  const exportCount = parseInt(exportRes.rows[0].cnt) || 0;

  const draftRes = await pool.query(
    'SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND "isDraft" = true',
    [userId]
  );
  const draftCount = parseInt(draftRes.rows[0].cnt) || 0;

  let sponsorRequestCount = 0;
  try {
    const sponsorRes = await pool.query(
      'SELECT COUNT(*) as cnt FROM sponsor_requests WHERE organizer_id = $1',
      [userId]
    );
    sponsorRequestCount = parseInt(sponsorRes.rows[0].cnt) || 0;
  } catch (sponsorErr) {
    // sponsor_requests may not exist on fresh/partial databases — treat as zero usage
    sponsorRequestCount = 0;
  }

  const adminRes = await pool.query(
    "SELECT COUNT(*) as cnt FROM staff_members WHERE organizer_id = $1 AND status = 'active'",
    [userId]
  );
  const adminCount = parseInt(adminRes.rows[0].cnt) || 0;

  return {
    tournaments: { used: tournamentsUsed, limit: plan.maxTournamentsPerMonth, percentage: Math.round((tournamentsUsed / plan.maxTournamentsPerMonth) * 100) },
    participants: { used: participantsUsed, limit: plan.maxParticipantsPerTournament, percentage: Math.min(100, Math.round((participantsUsed / (plan.maxParticipantsPerTournament || 1)) * 100)) },
    staff: { used: staffUsed, limit: plan.staffLimit, percentage: plan.staffLimit === Infinity ? 0 : Math.round((staffUsed / (plan.staffLimit || 1)) * 100) },
    exports: { used: exportCount, limit: plan.csvExport ? (user.tier === 'Pro' ? Infinity : 50) : 0, percentage: plan.csvExport ? (plan.staffLimit === Infinity ? 0 : Math.round((exportCount / 50) * 100)) : 0 },
    drafts: { used: draftCount, limit: plan.staffLimit > 0 || plan.multiAdmin ? 20 : 5, percentage: Math.round((draftCount / (plan.staffLimit > 0 || plan.multiAdmin ? 20 : 5)) * 100) },
    sponsorshipRequests: { used: sponsorRequestCount, limit: plan.sponsorSections ? 10 : 0, percentage: plan.sponsorSections ? Math.round((sponsorRequestCount / 10) * 100) : 0 },
    admins: { used: adminCount, limit: plan.staffLimit, percentage: plan.staffLimit === Infinity ? 0 : Math.round((adminCount / (plan.staffLimit || 1)) * 100) },
    registrations30d,
    activeTournaments,
    completionRate,
    plan: user.tier || 'Free',
    features: plan
  };
}

export {
  PLAN_FEATURES,
  PLAN_ORDER,
  requireFeature,
  checkPlanLimits,
  getOrganizerUsage
};
