import { getAuthToken } from './getAuthToken';

export const injectDummyRegistrations = async (tournamentId, targetSlots = 1000) => {
  try {
    console.log(`Starting injection of ${targetSlots} teams for Tournament: ${tournamentId}`);

    const token = await getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/inject-dummy-registrations`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ slotCount: targetSlots })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.success) {
      const errMsg = data?.message || data?.error || `HTTP ${response.status}`;
      throw new Error(errMsg);
    }

    console.log('Injection Complete!', data);
    return { success: true, message: data.message || `Successfully injected ${targetSlots} teams.` };

  } catch (error) {
    console.error('Injection Failed:', error);
    return { success: false, error: error.message };
  }
};

export const getTestInjectionSummary = async (tournamentId) => {
  try {
    const token = await getAuthToken();
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/test-injection-summary`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.success) {
      const errMsg = data?.message || data?.error || `HTTP ${response.status}`;
      throw new Error(errMsg);
    }

    return { success: true, summary: data.summary };

  } catch (error) {
    console.error('Failed to get test injection summary:', error);
    return { success: false, error: error.message };
  }
};

export const deleteTestInjectionData = async (tournamentId) => {
  try {
    const token = await getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      'X-Confirm-Test-Data-Deletion': 'true'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournamentId)}/delete-test-injection-data`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ confirmed: true })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.success) {
      const errMsg = data?.message || data?.error || `HTTP ${response.status}`;
      throw new Error(errMsg);
    }

    return {
      success: true,
      message: data.message,
      deleted: data.deleted,
      slotsFilled: data.slotsFilled
    };

  } catch (error) {
    console.error('Failed to delete test injection data:', error);
    return { success: false, error: error.message };
  }
};
