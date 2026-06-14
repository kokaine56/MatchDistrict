import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { subscriptionApi } from '../services/subscriptionApi';
import { getPlanFeatures } from '../utils/featureGates';
import { supabase } from '../utils/supabaseClient';
import { useUser } from '../UserContext';

const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [planDetails, setPlanDetails] = useState(null);
  const [billingHistory, setBillingHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { currentUser } = useUser();
  const refreshRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await subscriptionApi.getMySubscription();
      if (data.success) {
        setSubscription(data.subscription);
        setUsage(data.usage);
        setPlanDetails(data.planDetails);
        setBillingHistory(data.billingHistory || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  refreshRef.current = refresh;

  // Initial fetch
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-fetch on tab focus (catches external changes like admin override)
  useEffect(() => {
    const onFocus = () => refreshRef.current();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Supabase Realtime: instantly reflect subscription changes
  useEffect(() => {
    if (!currentUser?.id) return;

    const channel = supabase
      .channel('subscription-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions',
          filter: `organizer_id=eq.${currentUser.id}`
        },
        () => {
          refreshRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id]);

  const features = subscription ? getPlanFeatures(subscription.plan) : getPlanFeatures('Free');
  const tier = subscription?.plan || 'Free';

  const hasFeature = useCallback((feature) => {
    return features[feature] === true || features[feature] === Infinity;
  }, [features]);

  const getLimit = useCallback((key) => {
    return features[key] ?? 0;
  }, [features]);

  const isUnlimited = useCallback((key) => {
    return features[key] === Infinity;
  }, [features]);

  const value = {
    subscription,
    usage,
    planDetails,
    billingHistory,
    loading,
    error,
    refresh,
    features,
    tier,
    hasFeature,
    getLimit,
    isUnlimited
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    return {
      subscription: null,
      usage: null,
      planDetails: null,
      billingHistory: [],
      loading: false,
      error: null,
      refresh: () => {},
      features: getPlanFeatures('Free'),
      tier: 'Free',
      hasFeature: () => false,
      getLimit: () => 0,
      isUnlimited: () => false
    };
  }
  return ctx;
}

export default SubscriptionContext;
