import { describe, it, expect } from 'vitest';
import { getUpgradeMessage, getUpgradeMessageForFeature } from './subscriptionPlans';

describe('getUpgradeMessage', () => {
  it('returns the correct message for "tournaments"', () => {
    expect(getUpgradeMessage('tournaments')).toBe("You've reached your monthly tournament limit. Upgrade to create more tournaments.");
  });

  it('returns the correct message for "participants"', () => {
    expect(getUpgradeMessage('participants')).toBe('Participant limit reached. Upgrade to accommodate more participants.');
  });

  it('returns the correct message for "staff"', () => {
    expect(getUpgradeMessage('staff')).toBe('Staff management is limited on your current plan. Upgrade to add more staff members.');
  });

  it('returns the correct message for "api"', () => {
    expect(getUpgradeMessage('api')).toBe('API access is only available on the Pro plan.');
  });

  it('returns the correct message for "whiteLabel"', () => {
    expect(getUpgradeMessage('whiteLabel')).toBe('White-label branding is only available on the Pro plan.');
  });

  it('returns the correct message for "subdomain"', () => {
    expect(getUpgradeMessage('subdomain')).toBe('Custom subdomains are only available on the Pro plan.');
  });

  it('returns the correct message for "automation"', () => {
    expect(getUpgradeMessage('automation')).toBe('Tournament automation is only available on the Pro plan.');
  });

  it('returns the correct message for "csvExport"', () => {
    expect(getUpgradeMessage('csvExport')).toBe('CSV export is available on Basic and Pro plans.');
  });

  it('returns the correct message for "xlsxExport"', () => {
    expect(getUpgradeMessage('xlsxExport')).toBe('Excel export is available on Basic and Pro plans.');
  });

  it('returns the correct message for "sponsorSections"', () => {
    expect(getUpgradeMessage('sponsorSections')).toBe('Sponsor sections are available on Basic and Pro plans.');
  });

  it('returns the correct message for "advancedBranding"', () => {
    expect(getUpgradeMessage('advancedBranding')).toBe('Advanced branding is only available on the Pro plan.');
  });

  it('returns the correct message for "premiumDiscovery"', () => {
    expect(getUpgradeMessage('premiumDiscovery')).toBe('Premium discovery placement is only available on the Pro plan.');
  });

  it('returns the correct message for "earlyAccess"', () => {
    expect(getUpgradeMessage('earlyAccess')).toBe('Early access to new features is only available on the Pro plan.');
  });

  it('returns the correct message for "customRegistrationForms"', () => {
    expect(getUpgradeMessage('customRegistrationForms')).toBe('Custom registration forms are only available on the Pro plan.');
  });

  it('returns the correct message for "customLinks"', () => {
    expect(getUpgradeMessage('customLinks')).toBe('Custom share links are available on Basic and Pro plans.');
  });

  it('returns the correct message for "multiAdmin"', () => {
    expect(getUpgradeMessage('multiAdmin')).toBe('Multi-admin staff management is only available on the Pro plan.');
  });

  it('returns the correct message for "tournamentAutomation"', () => {
    expect(getUpgradeMessage('tournamentAutomation')).toBe('Tournament automation is only available on the Pro plan.');
  });

  it('returns the default fallback message for unknown keys', () => {
    const fallbackMessage = 'This feature is not available on your current plan. Upgrade to unlock it.';
    expect(getUpgradeMessage('unknownKey')).toBe(fallbackMessage);
    expect(getUpgradeMessage('somethingElse')).toBe(fallbackMessage);
  });

  it('returns the default fallback message when no key is provided', () => {
    const fallbackMessage = 'This feature is not available on your current plan. Upgrade to unlock it.';
    expect(getUpgradeMessage()).toBe(fallbackMessage);
    expect(getUpgradeMessage(null)).toBe(fallbackMessage);
    expect(getUpgradeMessage(undefined)).toBe(fallbackMessage);
    expect(getUpgradeMessage('')).toBe(fallbackMessage);
  });
});

describe('getUpgradeMessageForFeature', () => {
  it('calls getUpgradeMessage internally and returns the correct value', () => {
    expect(getUpgradeMessageForFeature('api')).toBe('API access is only available on the Pro plan.');
    expect(getUpgradeMessageForFeature('unknown')).toBe('This feature is not available on your current plan. Upgrade to unlock it.');
  });
});
