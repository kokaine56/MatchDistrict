export const PLANS = {
  Free: {
    name: 'Free',
    tier: 'free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    limits: {
      maxTournamentsPerMonth: 30,
      maxParticipantsPerTournament: 100,
      maxStaffMembers: 0,
      maxDrafts: 0,
      maxSponsorshipRequests: 0,
      maxExportsPerMonth: 0,
      maxAdmins: 0,
      apiRateLimit: 0,
    },
    features: {
      analyticsLevel: 'basic',
      verifiedBadge: false,
      premiumBadge: false,
      staffManagement: false,
      csvExport: false,
      xlsxExport: false,
      sponsorSections: false,
      tournamentDuplication: false,
      discordIntegration: false,
      prioritySupport: false,
      whiteLabel: false,
      customSubdomain: false,
      apiAccess: false,
      tournamentAutomation: false,
      customRegistrationForms: false,
      customLinks: false,
      advancedBranding: false,
      premiumDiscovery: false,
      advancedReports: false,
      multiAdmin: false,
      earlyAccess: false,
    }
  },
  Basic: {
    name: 'Basic',
    tier: 'basic',
    monthlyPrice: 149,
    yearlyPrice: 1341,
    limits: {
      maxTournamentsPerMonth: 60,
      maxParticipantsPerTournament: 300,
      maxStaffMembers: 3,
      maxDrafts: 20,
      maxSponsorshipRequests: 10,
      maxExportsPerMonth: 50,
      maxAdmins: 1,
      apiRateLimit: 0,
    },
    features: {
      analyticsLevel: 'advanced',
      verifiedBadge: false,
      premiumBadge: false,
      staffManagement: true,
      csvExport: true,
      xlsxExport: true,
      sponsorSections: true,
      tournamentDuplication: true,
      discordIntegration: true,
      prioritySupport: true,
      whiteLabel: false,
      customSubdomain: false,
      apiAccess: false,
      tournamentAutomation: false,
      customRegistrationForms: false,
      customLinks: true,
      advancedBranding: false,
      premiumDiscovery: false,
      advancedReports: false,
      multiAdmin: false,
      earlyAccess: false,
    }
  },
  Pro: {
    name: 'Pro',
    tier: 'pro',
    monthlyPrice: 399,
    yearlyPrice: 3591,
    limits: {
      maxTournamentsPerMonth: Infinity,
      maxParticipantsPerTournament: 1000,
      maxStaffMembers: Infinity,
      maxDrafts: Infinity,
      maxSponsorshipRequests: Infinity,
      maxExportsPerMonth: Infinity,
      maxAdmins: Infinity,
      apiRateLimit: 1000,
    },
    features: {
      analyticsLevel: 'full',
      verifiedBadge: true,
      premiumBadge: true,
      staffManagement: true,
      csvExport: true,
      xlsxExport: true,
      sponsorSections: true,
      tournamentDuplication: true,
      discordIntegration: true,
      prioritySupport: true,
      whiteLabel: true,
      customSubdomain: true,
      apiAccess: true,
      tournamentAutomation: true,
      customRegistrationForms: true,
      customLinks: true,
      advancedBranding: true,
      premiumDiscovery: true,
      advancedReports: true,
      multiAdmin: true,
      earlyAccess: true,
    }
  }
};

export const PLAN_ORDER = ['Free', 'Basic', 'Pro'];

export function getPlan(planName) {
  return PLANS[planName] || PLANS.Free;
}

export function hasFeature(planName, featureKey) {
  return getPlan(planName).features[featureKey] === true;
}

export function getLimit(planName, limitKey) {
  return getPlan(planName).limits[limitKey] ?? 0;
}

export function isUnlimited(planName, limitKey) {
  return getLimit(planName, limitKey) === Infinity;
}

export function getNextPlan(planName) {
  const idx = PLAN_ORDER.indexOf(planName);
  if (idx < PLAN_ORDER.length - 1) return PLAN_ORDER[idx + 1];
  return null;
}

export function getRequiredPlanForFeature(featureKey) {
  for (const planName of PLAN_ORDER) {
    if (hasFeature(planName, featureKey)) return planName;
  }
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
    xlsxExport: 'Excel export is available on Basic and Pro plans.',
    sponsorSections: 'Sponsor sections are available on Basic and Pro plans.',
    advancedBranding: 'Advanced branding is only available on the Pro plan.',
    premiumDiscovery: 'Premium discovery placement is only available on the Pro plan.',
    earlyAccess: 'Early access to new features is only available on the Pro plan.',
    customRegistrationForms: 'Custom registration forms are only available on the Pro plan.',
    customLinks: 'Custom share links are available on Basic and Pro plans.',
    multiAdmin: 'Multi-admin staff management is only available on the Pro plan.',
    tournamentAutomation: 'Tournament automation is only available on the Pro plan.',
  };
  return messages[limitType] || 'This feature is not available on your current plan. Upgrade to unlock it.';
}

export function getUpgradeMessageForFeature(featureKey) {
  return getUpgradeMessage(featureKey);
}
