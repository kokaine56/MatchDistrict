import { describe, it, expect } from 'vitest';
import { hasFeature } from './subscriptionPlans';

describe('subscriptionPlans - hasFeature', () => {
  it('returns false for features not available in Free plan', () => {
    expect(hasFeature('Free', 'staffManagement')).toBe(false);
  });

  it('returns true for features available in Basic plan', () => {
    expect(hasFeature('Basic', 'staffManagement')).toBe(true);
  });

  it('returns true for features available in Pro plan', () => {
    expect(hasFeature('Pro', 'staffManagement')).toBe(true);
  });

  it('returns true for premium badge in Pro plan', () => {
    expect(hasFeature('Pro', 'premiumBadge')).toBe(true);
  });

  it('returns false for premium badge in Basic plan', () => {
    expect(hasFeature('Basic', 'premiumBadge')).toBe(false);
  });

  it('falls back to Free plan (and thus false for staffManagement) if plan name is invalid', () => {
    expect(hasFeature('InvalidPlan', 'staffManagement')).toBe(false);
  });

  it('returns false if the feature does not exist', () => {
    expect(hasFeature('Pro', 'nonExistentFeature')).toBe(false);
  });
});
