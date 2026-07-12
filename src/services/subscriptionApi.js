import { getAuthToken } from '../utils/getAuthToken.js';

const API_BASE = '/api';

async function getAuthHeaders() {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiRequest(url, options = {}) {
  const authHeaders = await getAuthHeaders();
  const config = {
    headers: { 'Content-Type': 'application/json', ...authHeaders, ...options.headers },
    ...options
  };
  const res = await fetch(`${API_BASE}${url}`, config);
  return res.json();
}

export const subscriptionApi = {
  // Get current subscription with usage
  getMySubscription: () => apiRequest('/subscription/my'),
  
  // Get usage statistics
  getUsage: () => apiRequest('/subscription/usage'),
  
  // Get feature access
  getFeatures: () => apiRequest('/subscription/features'),
  
  // Upgrade to a plan
  upgrade: (plan, billingCycle = 'monthly') => apiRequest('/subscription/upgrade', {
    method: 'POST',
    body: JSON.stringify({ plan, billingCycle })
  }),
  
  // Downgrade to a plan
  downgrade: (plan) => apiRequest('/subscription/downgrade', {
    method: 'POST',
    body: JSON.stringify({ plan })
  }),
  
  // Cancel subscription
  cancel: () => apiRequest('/subscription/cancel', { method: 'POST' }),
  
  // Switch billing cycle
  switchCycle: (billingCycle) => apiRequest('/subscription/switch-cycle', {
    method: 'POST',
    body: JSON.stringify({ billingCycle })
  }),

  // Staff management
  getStaff: () => apiRequest('/organizer/staff'),
  inviteStaff: (data) => apiRequest('/organizer/staff', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  removeStaff: (staffId) => apiRequest(`/organizer/staff/${staffId}`, { method: 'DELETE' }),

  // API Keys
  getApiKeys: () => apiRequest('/api-keys'),
  createApiKey: (data) => apiRequest('/api-keys', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  revokeApiKey: (keyId) => apiRequest(`/api-keys/${keyId}`, { method: 'DELETE' }),

  // Subdomains
  checkSubdomain: (subdomain) => apiRequest('/subdomains/check', {
    method: 'POST',
    body: JSON.stringify({ subdomain })
  }),
  claimSubdomain: (subdomain) => apiRequest('/subdomains', {
    method: 'POST',
    body: JSON.stringify({ subdomain })
  }),
  getMySubdomains: () => apiRequest('/subdomains/my'),

  // White-label
  getWhiteLabel: () => apiRequest('/white-label'),
  saveWhiteLabel: (data) => apiRequest('/white-label', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // Automation
  getAutomationRules: () => apiRequest('/automation-rules'),
  createAutomationRule: (data) => apiRequest('/automation-rules', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  deleteAutomationRule: (ruleId) => apiRequest(`/automation-rules/${ruleId}`, { method: 'DELETE' }),

  // Payment verification
  submitPayment: (data) => apiRequest('/payment/submit', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getMyPayments: () => apiRequest('/payment/my'),
  getPaymentStatus: (id) => apiRequest(`/payment/status/${id}`),

  // Device pairing for auto payment verification
  generatePairingKey: () => apiRequest('/pair/generate-key', { method: 'POST' }),
  getPairedDevices: () => apiRequest('/pair/devices'),
  unpairDevice: (deviceId) => apiRequest(`/pair/devices/${deviceId}`, { method: 'DELETE' }),

  // Admin
  getAdminPayments: (status) => apiRequest(`/admin/payments${status ? `?status=${status}` : ''}`),
  approvePayment: (paymentId) => apiRequest('/admin/payments/approve', {
    method: 'POST',
    body: JSON.stringify({ paymentId })
  }),
  rejectPayment: (paymentId, reason) => apiRequest('/admin/payments/reject', {
    method: 'POST',
    body: JSON.stringify({ paymentId, reason })
  }),
  getAdminPaymentStats: () => apiRequest('/admin/payments/stats'),

  // Sponsor requests
  submitSponsorRequest: (data) => apiRequest('/sponsor/request', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getSponsorRequests: () => apiRequest('/sponsor/requests'),

  // Custom registration forms (PRO)
  saveRegistrationForm: (data) => apiRequest('/registration-form', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getRegistrationForm: (tournamentId) => apiRequest(`/registration-form/${tournamentId}`),
  getRegistrationForms: () => apiRequest('/registration-forms'),

  // Custom links
  createCustomLink: (data) => apiRequest('/custom-link', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getCustomLinks: () => apiRequest('/custom-links'),
  deleteCustomLink: (id) => apiRequest(`/custom-link/${id}`, { method: 'DELETE' }),
  resolveSlug: (slug) => apiRequest(`/slug/${slug}`),

  // Export (BASIC/PRO)
  async exportCsv(tournamentId) {
    const token = await getAuthToken();
    return fetch(`/api/tournament/${tournamentId}/export/csv`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
  },
  async exportXlsx(tournamentId) {
    const token = await getAuthToken();
    return fetch(`/api/tournament/${tournamentId}/export/xlsx`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
  },

  // Analytics (BASIC/PRO)
  getOrganizerAnalytics: () => apiRequest('/analytics/organizer'),

  // Revenue analytics (BASIC/PRO)
  getRevenueAnalytics: () => apiRequest('/analytics/revenue'),

  // Growth analytics (BASIC/PRO)
  getGrowthAnalytics: () => apiRequest('/analytics/growth'),

  // Export usage
  getExportUsage: () => apiRequest('/organizer/export-usage'),

  // Feature flags
  getFeatureFlags: () => apiRequest('/feature-flags'),

  // Early access (PRO)
  checkEarlyAccess: () => apiRequest('/early-access'),

  // Staff permissions / multi-admin (PRO)
  updateStaffPermissions: (data) => apiRequest('/organizer/staff/permissions', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // Dashboard slug
  getDashboardSlug: () => apiRequest('/organizer/dashboard-slug'),
  setDashboardSlug: (slug) => apiRequest('/organizer/dashboard-slug', {
    method: 'POST',
    body: JSON.stringify({ slug })
  }),
  checkDashboardSlug: (slug) => apiRequest('/organizer/dashboard-slug/check', {
    method: 'POST',
    body: JSON.stringify({ slug })
  }),

  // Custom link edit
  updateCustomLink: (id, data) => apiRequest(`/custom-link/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  // Admin
  getAdminSponsorRequests: (status) => apiRequest(`/admin/sponsor/requests${status ? `?status=${status}` : ''}`),
  approveSponsorRequest: (requestId, adminNotes) => apiRequest('/admin/sponsor/approve', {
    method: 'POST',
    body: JSON.stringify({ requestId, adminNotes })
  }),
  rejectSponsorRequest: (requestId, adminNotes) => apiRequest('/admin/sponsor/reject', {
    method: 'POST',
    body: JSON.stringify({ requestId, adminNotes })
  }),
  assignSponsor: (data) => apiRequest('/admin/sponsor/assign', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getAdminActionLog: () => apiRequest('/admin/action-log'),

  getAdminSubscriptions: () => apiRequest('/admin/subscriptions'),
  overrideSubscription: (data) => apiRequest('/admin/subscriptions/override', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getAdminSubscriptionStats: () => apiRequest('/admin/subscriptions/stats'),

  // Admin feature flags
  adminSaveFeatureFlag: (data) => apiRequest('/admin/feature-flags', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  adminToggleEarlyAccess: (userId, enabled) => apiRequest(`/admin/early-access/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled })
  }),

  // Admin purge database (danger zone)
  purgeDatabase: () => apiRequest('/admin/purge-database', {
    method: 'POST'
  })
};

export default subscriptionApi;
