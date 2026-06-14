export const PLAN_FEATURES = {
  Free: {
    name: 'Free',
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
    name: 'Basic',
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
    name: 'Pro',
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

export const PLAN_PRICES = {
  Free: { monthly: 0, yearly: 0 },
  Basic: { monthly: 149, yearly: 1341 },
  Pro: { monthly: 399, yearly: 3591 }
};

export const PLAN_ORDER = ['Free', 'Basic', 'Pro'];

export function getPlanFeatures(tier) {
  return PLAN_FEATURES[tier] || PLAN_FEATURES.Free;
}

export function hasFeature(tier, feature) {
  const features = getPlanFeatures(tier);
  return features[feature] === true || features[feature] === Infinity;
}

export function getFeatureLimit(tier, limitKey) {
  const features = getPlanFeatures(tier);
  return features[limitKey] ?? 0;
}

export function isFeatureUnlimited(tier, limitKey) {
  return getFeatureLimit(tier, limitKey) === Infinity;
}

export function canAccess(tier, feature) {
  if (tier === 'Pro') return true;
  if (tier === 'Basic' && feature !== 'whiteLabel' && feature !== 'customSubdomain' && feature !== 'apiAccess' && feature !== 'tournamentAutomation' && feature !== 'advancedBranding' && feature !== 'premiumDiscovery' && feature !== 'advancedReports' && feature !== 'multiAdmin') {
    return getPlanFeatures('Basic')[feature] === true;
  }
  return getPlanFeatures(tier)[feature] === true;
}

export function getNextPlan(tier) {
  const idx = PLAN_ORDER.indexOf(tier);
  if (idx < PLAN_ORDER.length - 1) return PLAN_ORDER[idx + 1];
  return null;
}

export function getUpgradeMessage(limitType) {
  const messages = {
    tournaments: "You've reached your monthly tournament limit. Upgrade to create more tournaments.",
    participants: 'Participant limit reached. Upgrade to accommodate more participants.',
    staff: 'Staff management is limited on your current plan. Upgrade to add more staff members.',
    api: 'API access is only available on the Pro plan.',
    whiteLabel: 'White-label branding is only available on the Pro plan.',
    subdomain: 'Custom subdomains are only available on the Pro plan.',
    automation: 'Tournament automation is only available on the Pro plan.',
    csvExport: 'CSV export is available on Basic and Pro plans.',
    sponsorSections: 'Sponsor sections are available on Basic and Pro plans.',
    advancedBranding: 'Advanced branding is only available on the Pro plan.',
    premiumDiscovery: 'Premium discovery placement is only available on the Pro plan.',
    earlyAccess: 'Early access to new features is only available on the Pro plan.',
    customRegistrationForms: 'Custom registration forms are only available on the Pro plan.',
    customLinks: 'Custom share links are available on Basic and Pro plans.',
    multiAdmin: 'Multi-admin staff management is only available on the Pro plan.',
    tournamentAutomation: 'Tournament automation is only available on the Pro plan.'
  };
  return messages[limitType] || 'This feature is not available on your current plan. Upgrade to unlock it.';
}
