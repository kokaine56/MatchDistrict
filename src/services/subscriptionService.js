import { getAuthToken } from '../utils/getAuthToken';

const API_BASE = '/api';

async function authHeaders() {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(url, options = {}) {
  const headers = await authHeaders();
  const config = {
    headers: { 'Content-Type': 'application/json', ...headers, ...options.headers },
    ...options,
  };
  const res = await fetch(`${API_BASE}${url}`, config);
  return res.json();
}

async function requestBlob(url) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}${url}`, { headers });
  if (!res.ok) throw new Error('Download failed');
  return res.blob();
}

export const subscriptionService = {
  getMySubscription: () => request('/subscription/my'),

  getUsage: () => request('/subscription/usage'),

  getFeatures: () => request('/subscription/features'),

  submitPayment: (data) => request('/payment/submit', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  getMyPayments: () => request('/payment/my'),

  getPaymentStatus: (id) => request(`/payment/status/${id}`),

  cancelSubscription: () => request('/subscription/cancel', { method: 'POST' }),

  switchCycle: (billingCycle) => request('/subscription/switch-cycle', {
    method: 'POST',
    body: JSON.stringify({ billingCycle }),
  }),

  getStaff: () => request('/organizer/staff'),

  inviteStaff: (data) => request('/organizer/staff', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  removeStaff: (staffId) => request(`/organizer/staff/${staffId}`, { method: 'DELETE' }),

  getApiKeys: () => request('/api-keys'),

  createApiKey: (data) => request('/api-keys', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  revokeApiKey: (keyId) => request(`/api-keys/${keyId}`, { method: 'DELETE' }),

  getAutomationRules: () => request('/automation-rules'),

  createAutomationRule: (data) => request('/automation-rules', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  deleteAutomationRule: (ruleId) => request(`/automation-rules/${ruleId}`, { method: 'DELETE' }),

  exportCsv: (tournamentId) => requestBlob(`/tournament/${tournamentId}/export/csv`),

  exportXlsx: (tournamentId) => requestBlob(`/tournament/${tournamentId}/export/xlsx`),

  getOrganizerAnalytics: () => request('/analytics/organizer'),

  getRevenueAnalytics: () => request('/analytics/revenue'),

  getGrowthAnalytics: () => request('/analytics/growth'),

  getSponsorRequests: () => request('/sponsor/requests'),

  submitSponsorRequest: (data) => request('/sponsor/request', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  getRegistrationForm: (tournamentId) => request(`/registration-form/${tournamentId}`),

  getRegistrationForms: () => request('/registration-forms'),

  saveRegistrationForm: (data) => request('/registration-form', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  getCustomLinks: () => request('/custom-links'),

  createCustomLink: (data) => request('/custom-link', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  updateCustomLink: (id, data) => request(`/custom-link/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  deleteCustomLink: (id) => request(`/custom-link/${id}`, { method: 'DELETE' }),

  resolveSlug: (slug) => request(`/slug/${slug}`),

  checkEarlyAccess: () => request('/early-access'),

  updateStaffPermissions: (data) => request('/organizer/staff/permissions', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  getDashboardSlug: () => request('/organizer/dashboard-slug'),

  setDashboardSlug: (slug) => request('/organizer/dashboard-slug', {
    method: 'POST',
    body: JSON.stringify({ slug }),
  }),

  getWhiteLabel: () => request('/white-label'),

  saveWhiteLabel: (data) => request('/white-label', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  checkSubdomain: (subdomain) => request('/subdomains/check', {
    method: 'POST',
    body: JSON.stringify({ subdomain }),
  }),

  claimSubdomain: (subdomain) => request('/subdomains', {
    method: 'POST',
    body: JSON.stringify({ subdomain }),
  }),

  getMySubdomains: () => request('/subdomains/my'),

  getExportUsage: () => request('/organizer/export-usage'),

  getFeatureFlags: () => request('/feature-flags'),

  getAdminPayments: (status) => request(`/admin/payments${status ? `?status=${status}` : ''}`),

  approvePayment: (paymentId) => request('/admin/payments/approve', {
    method: 'POST',
    body: JSON.stringify({ paymentId }),
  }),

  rejectPayment: (paymentId, reason) => request('/admin/payments/reject', {
    method: 'POST',
    body: JSON.stringify({ paymentId, reason }),
  }),

  getAdminPaymentStats: () => request('/admin/payments/stats'),

  getAdminSubscriptions: () => request('/admin/subscriptions'),

  overrideSubscription: (data) => request('/admin/subscriptions/override', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  getAdminSubscriptionStats: () => request('/admin/subscriptions/stats'),

  adminSaveFeatureFlag: (data) => request('/admin/feature-flags', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  adminToggleEarlyAccess: (userId, enabled) => request(`/admin/early-access/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  }),

  getAdminSponsorRequests: (status) => request(`/admin/sponsor/requests${status ? `?status=${status}` : ''}`),

  approveSponsorRequest: (requestId, adminNotes) => request('/admin/sponsor/approve', {
    method: 'POST',
    body: JSON.stringify({ requestId, adminNotes }),
  }),

  rejectSponsorRequest: (requestId, adminNotes) => request('/admin/sponsor/reject', {
    method: 'POST',
    body: JSON.stringify({ requestId, adminNotes }),
  }),

  assignSponsor: (data) => request('/admin/sponsor/assign', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  getAdminActionLog: () => request('/admin/action-log'),
};

export default subscriptionService;
