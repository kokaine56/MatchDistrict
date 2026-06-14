import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getPlan, hasFeature, getLimit, isUnlimited } from '../utils/subscriptionPlans';

const useSubscriptionStore = create(
  persist(
    (set, get) => ({
      plan: 'Free',
      status: 'active',
      billingCycle: 'monthly',
      renewalDate: null,
      usage: null,
      billingHistory: [],
      isLoading: true,
      error: null,
      lastSynced: null,

      setSubscription: (data) => set({
        plan: data.plan || 'Free',
        status: data.status || 'active',
        billingCycle: data.billingCycle || 'monthly',
        renewalDate: data.renewalDate || null,
        lastSynced: Date.now(),
      }),

      setUsage: (usage) => set({ usage }),

      setBillingHistory: (history) => set({ billingHistory: history }),

      setLoading: (isLoading) => set({ isLoading }),

      setError: (error) => set({ error }),

      syncFromServer: async () => {
        try {
          set({ isLoading: true, error: null });
          const res = await fetch('/api/subscription/my');
          const data = await res.json();
          if (data.success) {
            set({
              plan: data.subscription.plan || 'Free',
              status: data.subscription.status || 'active',
              billingCycle: data.subscription.billingCycle || 'monthly',
              renewalDate: data.subscription.renewalDate || null,
              usage: data.usage,
              billingHistory: data.billingHistory || [],
              lastSynced: Date.now(),
            });
          }
        } catch (err) {
          set({ error: err.message });
        } finally {
          set({ isLoading: false });
        }
      },

      planFeatures: () => getPlan(get().plan).features,

      planLimits: () => getPlan(get().plan).limits,

      hasFeature: (feature) => hasFeature(get().plan, feature),

      getLimit: (key) => getLimit(get().plan, key),

      isUnlimited: (key) => isUnlimited(get().plan, key),

      planName: () => getPlan(get().plan).name,

      planTier: () => getPlan(get().plan).tier,
    }),
    {
      name: 'match-district-subscription',
      partialize: (state) => ({
        plan: state.plan,
        status: state.status,
        billingCycle: state.billingCycle,
        renewalDate: state.renewalDate,
      }),
    }
  )
);

export default useSubscriptionStore;
