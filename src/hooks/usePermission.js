import useSubscriptionStore from '../stores/subscriptionStore';
import { hasFeature, getLimit, isUnlimited, getPlan } from '../utils/subscriptionPlans';

const FEATURE_PERMISSIONS = {
  createDraftTournament: (plan) => true,
  useCustomForms: (plan) => hasFeature(plan, 'customRegistrationForms'),
  useAnalytics: (plan) => getPlan(plan).features.analyticsLevel !== 'basic',
  useRevenueAnalytics: (plan) => ['advanced', 'full'].includes(getPlan(plan).features.analyticsLevel),
  useGrowthAnalytics: (plan) => ['advanced', 'full'].includes(getPlan(plan).features.analyticsLevel),
  exportCsv: (plan) => hasFeature(plan, 'csvExport'),
  exportXlsx: (plan) => hasFeature(plan, 'xlsxExport'),
  useAutomations: (plan) => hasFeature(plan, 'tournamentAutomation'),
  createCustomDashboardLink: (plan) => hasFeature(plan, 'customLinks'),
  requestSponsorPrizePool: (plan) => hasFeature(plan, 'sponsorSections'),
  useMultiAdmin: (plan) => hasFeature(plan, 'multiAdmin'),
  manageStaff: (plan) => hasFeature(plan, 'staffManagement'),
  useApi: (plan) => hasFeature(plan, 'apiAccess'),
  useWhiteLabel: (plan) => hasFeature(plan, 'whiteLabel'),
  useCustomSubdomain: (plan) => hasFeature(plan, 'customSubdomain'),
  accessEarlyFeatures: (plan) => hasFeature(plan, 'earlyAccess'),
  useVerifiedBadge: (plan) => hasFeature(plan, 'verifiedBadge'),
  usePremiumBadge: (plan) => hasFeature(plan, 'premiumBadge'),
};

const LIMIT_KEYS = {
  tournaments: 'maxTournamentsPerMonth',
  participants: 'maxParticipantsPerTournament',
  staff: 'maxStaffMembers',
  drafts: 'maxDrafts',
  sponsorships: 'maxSponsorshipRequests',
  exports: 'maxExportsPerMonth',
  admins: 'maxAdmins',
};

export function usePermission() {
  const plan = useSubscriptionStore((s) => s.plan);

  return Object.fromEntries(
    Object.entries(FEATURE_PERMISSIONS).map(([key, check]) => [key, () => check(plan)])
  );
}

export function useCan(featureKey) {
  const plan = useSubscriptionStore((s) => s.plan);
  const check = FEATURE_PERMISSIONS[featureKey];
  return check ? check(plan) : false;
}

export function useLimit(limitKey) {
  const plan = useSubscriptionStore((s) => s.plan);
  const dbKey = LIMIT_KEYS[limitKey] || limitKey;
  return getLimit(plan, dbKey);
}

export function useIsUnlimited(limitKey) {
  const plan = useSubscriptionStore((s) => s.plan);
  const dbKey = LIMIT_KEYS[limitKey] || limitKey;
  return isUnlimited(plan, dbKey);
}

export function useFeatureCheck(featureKey) {
  const plan = useSubscriptionStore((s) => s.plan);
  return hasFeature(plan, featureKey);
}
