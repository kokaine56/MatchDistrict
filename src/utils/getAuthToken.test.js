import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAuthToken, getAuthTokenSync } from './getAuthToken';
import { supabase } from './supabaseClient';

vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

describe('getAuthTokenSync', () => {
  let cookieValue = '';

  beforeEach(() => {
    cookieValue = '';
    Object.defineProperty(document, 'cookie', {
      get: () => cookieValue,
      set: (val) => {
        cookieValue = val;
      },
      configurable: true
    });
  });

  it('should return token from cookie if present', () => {
    document.cookie = 'token=test-sync-token';
    expect(getAuthTokenSync()).toBe('test-sync-token');
  });

  it('should decode URI component from cookie', () => {
    document.cookie = 'token=test%20sync%20token';
    expect(getAuthTokenSync()).toBe('test sync token');
  });

  it('should return null if token cookie is missing', () => {
    document.cookie = 'other=cookie';
    expect(getAuthTokenSync()).toBe(null);
  });

  it('should handle multiple cookies correctly', () => {
    document.cookie = 'foo=bar; token=my-sync-token; baz=qux';
    expect(getAuthTokenSync()).toBe('my-sync-token');
  });

  it('should return null if an error is thrown', () => {
    // Mock document.cookie to throw an error
    Object.defineProperty(document, 'cookie', {
      get() {
        throw new Error('Cookie error');
      },
      configurable: true
    });

    expect(getAuthTokenSync()).toBe(null);
  });
});

describe('getAuthToken', () => {
  let cookieValue = '';

  beforeEach(() => {
    cookieValue = '';
    Object.defineProperty(document, 'cookie', {
      get: () => cookieValue,
      set: (val) => {
        cookieValue = val;
      },
      configurable: true
    });
    vi.clearAllMocks();
  });

  it('should return token from cookie if present', async () => {
    document.cookie = 'token=test-async-token';
    const result = await getAuthToken();
    expect(result).toBe('test-async-token');
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it('should decode URI component from cookie', async () => {
    document.cookie = 'token=test%20async%20token';
    const result = await getAuthToken();
    expect(result).toBe('test async token');
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it('should fallback to supabase session if no cookie token', async () => {
    document.cookie = 'other=cookie';
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'supabase-token' } },
    });

    const result = await getAuthToken();
    expect(result).toBe('supabase-token');
    expect(supabase.auth.getSession).toHaveBeenCalled();
  });

  it('should return null if no cookie and no supabase session', async () => {
    document.cookie = '';
    supabase.auth.getSession.mockResolvedValue({
      data: { session: null },
    });

    const result = await getAuthToken();
    expect(result).toBe(null);
    expect(supabase.auth.getSession).toHaveBeenCalled();
  });

  it('should return null if no cookie and supabase session has no access_token', async () => {
    document.cookie = '';
    supabase.auth.getSession.mockResolvedValue({
      data: { session: {} },
    });

    const result = await getAuthToken();
    expect(result).toBe(null);
    expect(supabase.auth.getSession).toHaveBeenCalled();
  });

  it('should return null if supabase.auth.getSession throws an error', async () => {
    document.cookie = '';
    supabase.auth.getSession.mockRejectedValue(new Error('Supabase error'));

    const result = await getAuthToken();
    expect(result).toBe(null);
    expect(supabase.auth.getSession).toHaveBeenCalled();
  });

  it('should return null if reading cookie throws an error', async () => {
    Object.defineProperty(document, 'cookie', {
      get() {
        throw new Error('Cookie error');
      },
      configurable: true
    });

    const result = await getAuthToken();
    expect(result).toBe(null);
  });
});
