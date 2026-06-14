import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSubscription } from '../contexts/SubscriptionContext';
import { subscriptionApi } from '../services/subscriptionApi';
import { PLAN_PRICES, PLAN_ORDER } from '../utils/featureGates';

const MASTER_FEATURES = [
  { name: 'Tournaments Per Month', free: true, basic: true, pro: true },
  { name: 'Maximum Slots Per Tournament', free: true, basic: true, pro: true },
  { name: 'Custom Registration Forms', free: false, basic: false, pro: true },
  { name: 'Gold Verified Badge', free: false, basic: false, pro: true },
  { name: 'Draft Tournament Support', free: false, basic: true, pro: true },
  { name: 'Sponsored Prize Pool Requests', free: false, basic: true, pro: true },
  { name: 'CSV / Excel Export', free: false, basic: true, pro: true },
  { name: 'Share Custom Tournament Link', free: false, basic: true, pro: true },
  { name: 'Revenue & Growth Analytics', free: false, basic: true, pro: true },
  { name: 'Staff Management', free: false, basic: true, pro: true },
  { name: 'Tournament Automations', free: false, basic: false, pro: true },
  { name: 'Custom Dashboard Link', free: false, basic: false, pro: true },
  { name: 'Early Access To New Features', free: false, basic: false, pro: true },
  { name: 'Multi Admin Access', free: false, basic: false, pro: true },
];

const plans = [
  {
    id: 'free',
    name: 'Free',
    tier: 'Free',
    desc: 'Best for new organizers & small communities getting started with competitive events.',
    priceMonthly: PLAN_PRICES.Free.monthly,
    priceYearly: PLAN_PRICES.Free.yearly,
    badge: null,
    features: [
      ['30 Tournaments Per Month', true],
      ['100 Maximum Slots Per Tournament', true],
      ...MASTER_FEATURES.slice(2).map(f => [f.name, f.free]),
    ],
  },
  {
    id: 'basic',
    name: 'Basic Plan',
    tier: 'Basic',
    desc: 'Built for growing communities and competitive organizers who need more power.',
    priceMonthly: PLAN_PRICES.Basic.monthly,
    priceYearly: PLAN_PRICES.Basic.yearly,
    badge: 'Most Popular',
    features: [
      ['60 Tournaments Per Month', true],
      ['300 Maximum Slots Per Tournament', true],
      ...MASTER_FEATURES.slice(2).map(f => [f.name, f.basic]),
    ],
  },
  {
    id: 'pro',
    name: 'Pro Plan',
    tier: 'Pro',
    desc: 'For professional tournament operators and large organizations scaling operations.',
    priceMonthly: PLAN_PRICES.Pro.monthly,
    priceYearly: PLAN_PRICES.Pro.yearly,
    badge: null,
    features: [
      ['Unlimited Tournaments Per Month', true],
      ['Up To 1000 Slots Per Tournament', true],
      ...MASTER_FEATURES.slice(2).map(f => [f.name, f.pro]),
    ],
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 100, damping: 20 },
  },
};

const PricingSection = ({
  onNavigate = () => {},
  onUpgrade = () => {},
  currentPlan = 'Free',
}) => {
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [openFaq, setOpenFaq] = useState(null);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeMsg, setUpgradeMsg] = useState(null);
  const [mobileIndex, setMobileIndex] = useState(0);
  const { refresh, subscription } = useSubscription();
  const currentPlanIndex = PLAN_ORDER.indexOf(currentPlan);
  const hasActivePaidSub = subscription?.status === 'active' && subscription?.plan !== 'Free';

  const [isLight, setIsLight] = useState(
    typeof document !== 'undefined' && document.documentElement.classList.contains('light')
  );

  useEffect(() => {
    const checkLight = () => setIsLight(
      document.documentElement.classList.contains('light')
    );
    const observer = new MutationObserver(checkLight);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const mobileBg = {
    free: { background: isLight ? '#f1f5f9' : '#1e293b', borderColor: isLight ? '#cbd5e1' : '#334155' },
    basic: { background: isLight ? '#eef2ff' : '#1e1b4b', borderColor: isLight ? '#c7d2fe' : '#3730a3' },
    pro: { background: isLight ? '#fffbeb' : '#451a03', borderColor: isLight ? '#fde68a' : '#78350f' },
  };

  const mobileText = (planId, role) => {
    const theme = {
      free: isLight
        ? { heading: 'text-slate-900', price: 'text-slate-900', period: 'text-slate-500', desc: 'text-slate-500', feature: 'text-slate-700', featureMuted: 'text-slate-400', icon: 'text-slate-500', iconMuted: 'text-slate-300' }
        : { heading: 'text-white', price: 'text-white', period: 'text-slate-400', desc: 'text-slate-400', feature: 'text-slate-200', featureMuted: 'text-slate-500', icon: 'text-slate-400', iconMuted: 'text-slate-600' },
      basic: isLight
        ? { heading: 'text-indigo-800', price: 'text-indigo-900', period: 'text-indigo-500', desc: 'text-indigo-500', feature: 'text-indigo-700', featureMuted: 'text-indigo-400', icon: 'text-indigo-500', iconMuted: 'text-indigo-300' }
        : { heading: 'text-indigo-200', price: 'text-white', period: 'text-indigo-400', desc: 'text-indigo-400', feature: 'text-indigo-200', featureMuted: 'text-indigo-500', icon: 'text-indigo-400', iconMuted: 'text-indigo-600' },
      pro: isLight
        ? { heading: 'text-amber-800', price: 'text-amber-900', period: 'text-amber-500', desc: 'text-amber-500', feature: 'text-amber-700', featureMuted: 'text-amber-400', icon: 'text-amber-500', iconMuted: 'text-amber-300' }
        : { heading: 'text-amber-200', price: 'text-amber-50', period: 'text-amber-400', desc: 'text-amber-400', feature: 'text-amber-200', featureMuted: 'text-amber-500', icon: 'text-amber-400', iconMuted: 'text-amber-600' },
    };
    return theme[planId][role];
  };

  const nextPlan = () => setMobileIndex(i => (i + 1) % plans.length);
  const prevPlan = () => setMobileIndex(i => (i - 1 + plans.length) % plans.length);

  const renderPlanCard = (plan, idx, mobileCard = false) => {
    const isPopular = plan.badge === 'Most Popular';
    const isFree = plan.id === 'free';
    const planIsCurrent = isCurrentPlan(plan.id);

    return (
      <div
        className={`relative flex flex-col rounded-2xl sm:rounded-3xl p-5 sm:p-6 lg:p-8 transition-all duration-300 transform-gpu ${
          mobileCard
            ? 'border-2'
            : isPopular
              ? 'glass-card bg-surface-container-low/75 border-2 border-primary lg:scale-[1.03] z-10 shadow-[0_0_30px_rgba(99,102,241,0.25)]'
              : 'glass-card bg-surface-container-low/30 border border-outline-variant/20 hover:border-outline-variant/50'
        }`}
        style={mobileCard ? { ...mobileBg[plan.id], borderWidth: '2px' } : undefined}
      >
        {isPopular && (
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-primary via-indigo-500 to-primary text-on-primary text-[9px] sm:text-[10px] font-bold uppercase tracking-wider rounded-full shadow-[0_0_20px_rgba(99,102,241,0.5)] whitespace-nowrap z-20">
            {plan.badge}
          </div>
        )}

        <div className="mb-5 sm:mb-6 relative z-10">
          <h3 className={`text-base sm:text-lg font-headline-md font-bold mb-1 ${isPopular ? 'text-primary' : (mobileCard ? mobileText(plan.id, 'heading') : 'text-white')}`}>
            {plan.name}
          </h3>
          <div className="flex items-baseline gap-1 mb-0.5">
            <span className={`text-3xl sm:text-4xl md:text-5xl font-display-lg font-extrabold font-prize-display ${mobileCard ? mobileText(plan.id, 'price') : 'text-white'}`}>
              {isFree ? <span className="text-2xl sm:text-3xl md:text-4xl">₹0</span> : (
                billingCycle === 'yearly' ? (
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-lg sm:text-xl md:text-2xl text-on-surface-variant/50 line-through">₹{plan.priceMonthly.toLocaleString('en-IN')}/mo</span>
                    <span>₹{plan.priceYearly.toLocaleString('en-IN')}</span>
                  </span>
                ) : (
                  <>₹{plan.priceMonthly.toLocaleString('en-IN')}</>
                )
              )}
            </span>
            {!isFree && (
              billingCycle === 'yearly' ? (
                <span className={`text-[10px] sm:text-xs font-medium ${mobileCard ? mobileText(plan.id, 'period') : 'text-on-surface-variant'}`}>/year</span>
              ) : (
                <span className={`text-xs sm:text-sm font-medium ${mobileCard ? mobileText(plan.id, 'period') : 'text-on-surface-variant'}`}>/month</span>
              )
            )}
          </div>
          {billingCycle === 'yearly' && !isFree && (
            <span className="inline-flex items-center px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] sm:text-[10px] font-bold rounded mt-0.5">SAVE 25%</span>
          )}
          {isFree && <p className={`text-xs sm:text-sm font-medium mt-1 ${mobileCard ? mobileText(plan.id, 'period') : 'text-on-surface-variant'}`}>Free forever</p>}
          <p className={`text-[11px] sm:text-xs mt-2 leading-relaxed ${mobileCard ? mobileText(plan.id, 'desc') : 'text-on-surface-variant/80'}`}>{plan.desc}</p>
        </div>

        {(() => {
          const available = plan.features.filter(([, included]) => included);
          const unavailable = plan.features.filter(([, included]) => !included);
          const sectionLabelClass = `text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${mobileCard ? mobileText(plan.id, 'iconMuted') : 'text-on-surface-variant/50'}`;

          return (
            <div className="mb-6 sm:mb-8 flex-1 relative z-10 space-y-2.5 sm:space-y-3">
              {available.length > 0 && (
                <>
                  {available.map(([feat], i) => (
                    <div key={`avail-${i}`} className="flex items-start gap-2.5 text-[11px] sm:text-xs md:text-sm">
                      <span className="material-symbols-outlined text-[15px] sm:text-[17px] shrink-0 select-none mt-0.5 text-emerald-400">check_circle</span>
                      <span className={`${mobileCard ? mobileText(plan.id, 'feature') : 'text-white font-semibold'} leading-normal`}>{feat}</span>
                    </div>
                  ))}
                </>
              )}
              {unavailable.length > 0 && (
                <>
                  <div className="border-t border-outline-variant/10" />
                  {unavailable.map(([feat], i) => (
                    <div key={`unavail-${i}`} className="flex items-start gap-2.5 text-[11px] sm:text-xs md:text-sm">
                      <span className="material-symbols-outlined text-[15px] sm:text-[17px] shrink-0 select-none mt-0.5 text-on-surface-variant/30">cancel</span>
                      <span className={`${mobileCard ? mobileText(plan.id, 'featureMuted') : 'text-on-surface-variant/50'} leading-normal`}>{feat}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })()}

        {/* Consistent button */}
        <div className="relative z-10 w-full">
          {(() => {
            const planIdx = PLAN_ORDER.indexOf(plan.tier);
            const isDowngrade = planIdx < currentPlanIndex;
            const isUnavailable = isDowngrade && (plan.tier !== 'Free' || hasActivePaidSub);

            if (planIsCurrent) {
              return (
                <button disabled className="w-full h-11 rounded-xl font-bold text-xs tracking-wider transition-all duration-200 border-2 border-primary/40 text-primary/60 cursor-not-allowed bg-transparent">
                  Current Plan
                </button>
              );
            }

            if (isUnavailable) {
              return null;
            }

            if (isDowngrade && plan.tier === 'Free') {
              return (
                <button onClick={() => handleUpgrade(plan.tier)} disabled={upgrading}
                  className="w-full h-11 rounded-xl font-bold text-xs tracking-wider transition-all duration-200 bg-gradient-to-r from-primary to-indigo-600 text-on-primary shadow-[0_0_20px_rgba(99,102,241,0.35)] hover:brightness-110 active:brightness-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {upgrading ? 'Downgrading...' : 'Downgrade to Free'}
                </button>
              );
            }

            if (plan.tier === 'Free') {
              return (
                <button onClick={() => onNavigate('become-organizer')}
                  className="w-full h-11 rounded-xl font-bold text-xs tracking-wider transition-all duration-200 bg-gradient-to-r from-primary to-indigo-600 text-on-primary shadow-[0_0_20px_rgba(99,102,241,0.35)] hover:brightness-110 active:brightness-90"
                >
                  Start Free
                </button>
              );
            }

            return (
              <button onClick={() => handleUpgrade(plan.tier)} disabled={upgrading}
                className="w-full h-11 rounded-xl font-bold text-xs tracking-wider transition-all duration-200 bg-gradient-to-r from-primary to-indigo-600 text-on-primary shadow-[0_0_20px_rgba(99,102,241,0.35)] hover:brightness-110 active:brightness-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {upgrading ? 'Upgrading...' : `Upgrade to ${plan.tier}`}
              </button>
            );
          })()}

          {upgradeMsg && (
            <div className={`text-xs mt-2 text-center ${upgradeMsg.type === 'success' ? 'text-emerald-400' : 'text-error'}`}>
              {upgradeMsg.text}
            </div>
          )}
        </div>
      </div>
    );
  };

  const handleUpgrade = async (plan) => {
    if (plan === currentPlan) return;
    if (plan === 'Free') {
      setUpgrading(true);
      setUpgradeMsg(null);
      try {
        const result = await subscriptionApi.downgrade(plan);
        if (result.success) {
          setUpgradeMsg({ type: 'success', text: `Successfully switched to Free plan!` });
          await refresh();
        } else {
          setUpgradeMsg({ type: 'error', text: result.message || 'Switch failed.' });
        }
      } catch (err) {
        setUpgradeMsg({ type: 'error', text: 'Network error. Please try again.' });
      } finally {
        setUpgrading(false);
      }
    } else {
      onUpgrade(plan, billingCycle);
    }
  };

  const isCurrentPlan = (planId) => currentPlan.toLowerCase() === planId.toLowerCase();

  const currentPrice = (plan) => billingCycle === 'monthly' ? plan.priceMonthly : plan.priceYearly;
  const periodLabel = billingCycle === 'monthly' ? '/month' : '/year';

  return (
    <section className="relative w-full py-12 sm:py-16 md:py-24 overflow-hidden isolate">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-primary/15 blur-[140px] rounded-full opacity-40 mix-blend-screen" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-tertiary/10 blur-[160px] rounded-full opacity-30 mix-blend-screen" />
        <div className="absolute -left-40 top-1/3 w-[500px] h-[500px] bg-secondary/5 blur-[120px] rounded-full opacity-20 mix-blend-screen" />
      </div>

      <div className="max-w-container-max mx-auto px-4 sm:px-lg relative z-10">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={containerVariants}
          className="text-center mb-10 sm:mb-12 md:mb-16 space-y-4"
        >
          <motion.h2 variants={itemVariants} className="font-display-lg text-3xl sm:text-4xl md:text-5xl font-extrabold text-white leading-[1.1] tracking-tight">
            Simple, transparent pricing
          </motion.h2>
          <motion.p variants={itemVariants} className="font-body-md text-xs sm:text-sm md:text-base text-on-surface-variant max-w-2xl mx-auto leading-relaxed px-4">
            Choose the plan that fits your community. Upgrade anytime as you grow.
          </motion.p>

          <motion.div variants={itemVariants} className="flex items-center justify-center gap-3 pt-4">
            <span className={`text-xs sm:text-sm font-bold transition-colors duration-300 ${billingCycle === 'monthly' ? 'text-white' : 'text-on-surface-variant'}`}>Monthly</span>
            <button
              onClick={() => setBillingCycle(p => p === 'monthly' ? 'yearly' : 'monthly')}
              className="relative w-14 h-7 sm:w-16 sm:h-8 bg-surface-container-high rounded-full border border-outline-variant/30 flex items-center px-1 cursor-pointer transition-colors hover:border-primary/50"
              aria-label={`Switch to ${billingCycle === 'monthly' ? 'yearly' : 'monthly'} billing`}
            >
              <motion.div
                layout
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="w-5 h-5 sm:w-6 sm:h-6 bg-primary rounded-full shadow-md"
                style={{ x: billingCycle === 'yearly' ? 28 : 2 }}
              />
            </button>
            <span className={`text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors duration-300 ${billingCycle === 'yearly' ? 'text-white' : 'text-on-surface-variant'}`}>
              Yearly
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[8px] sm:text-[10px] rounded font-label-caps font-bold">SAVE 25%</span>
            </span>
          </motion.div>
        </motion.div>

        {/* Mobile stacked cards */}
        <div className="md:hidden mb-16 sm:mb-20 md:mb-24">
          <div className="max-w-md mx-auto relative">
            {/* Left arrow button */}
            <button
              onClick={prevPlan}
              className="absolute -left-3 sm:-left-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center bg-surface-container-high/90 text-primary border border-primary/20 hover:bg-surface-container-high transition-all shadow-lg backdrop-blur-sm touch-manipulation"
              aria-label="Previous plan"
            >
              <span className="material-symbols-outlined text-base sm:text-lg">arrow_back_ios</span>
            </button>

            {/* Right arrow button */}
            <button
              onClick={nextPlan}
              className="absolute -right-3 sm:-right-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center bg-surface-container-high/90 text-primary border border-primary/20 hover:bg-surface-container-high transition-all shadow-lg backdrop-blur-sm touch-manipulation"
              aria-label="Next plan"
            >
              <span className="material-symbols-outlined text-base sm:text-lg">arrow_forward_ios</span>
            </button>

            {/* Card deck */}
            <div>
              <motion.div
                className="relative min-h-[44rem] cursor-grab active:cursor-grabbing select-none"
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.15}
                onDragEnd={(_, info) => {
                  const swipe = info.offset.x;
                  if (Math.abs(swipe) > 60 || Math.abs(info.velocity.x) > 300) {
                    if (swipe < 0) {
                      nextPlan();
                    } else if (swipe > 0) {
                      prevPlan();
                    }
                  }
                }}
              >
                <AnimatePresence initial={false}>
                  {plans
                    .map((plan, idx) => ({ plan, idx, offset: idx - mobileIndex }))
                    .filter(({ offset }) => Math.abs(offset) <= 1)
                    .sort((a, b) => {
                      if (a.offset === 0) return 1;
                      if (b.offset === 0) return -1;
                      return a.offset - b.offset;
                    })
                    .map(({ plan, idx, offset }) => {
                      const isActive = offset === 0;
                      return (
                          <motion.div
                            key={plan.id}
                            className={`absolute inset-0 ${isActive ? '' : 'overflow-hidden'}`}
                            style={{ zIndex: isActive ? 10 : 1 }}
                          initial={{ opacity: 0, scale: 0.9, y: 20 }}
                          animate={{
                            opacity: isActive ? 1 : 0.85,
                            scale: isActive ? 1 : 0.95,
                            x: offset * 18,
                            y: isActive ? 0 : 10,
                            rotate: offset * -1.5,
                          }}
                          exit={{ opacity: 0, scale: 0.9, y: -20 }}
                          transition={{
                            type: 'spring',
                            stiffness: 400,
                            damping: 35,
                            mass: 1,
                          }}
                        >
                          <div className={isActive ? '' : 'pointer-events-none select-none'}>
                            {renderPlanCard(plan, idx, true)}
                          </div>
                        </motion.div>
                      );
                    })}
                </AnimatePresence>
              </motion.div>
            </div>

            {/* Dot indicators */}
            <div className="flex justify-center gap-2 mt-4 sm:mt-6">
              {plans.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setMobileIndex(i)}
                  className={`w-2 h-2 rounded-full transition-all duration-200 ${i === mobileIndex ? 'bg-primary w-4' : 'bg-outline-variant/30 hover:bg-outline-variant/50'}`}
                  aria-label={`Go to ${plans[i].name} plan`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Desktop grid */}
        <div className="hidden md:grid md:grid-cols-3 gap-6 lg:gap-6 xl:gap-8 max-w-6xl mx-auto items-stretch mb-16 sm:mb-20 md:mb-24">
          {plans.map((plan, idx) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: idx * 0.1 }}
              whileHover={{ y: -8, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
            >
              {renderPlanCard(plan, idx)}
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto pb-8"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
          >
            <h3 className="font-display-lg text-xl sm:text-2xl md:text-3xl text-white font-extrabold tracking-tight text-center mb-8 sm:mb-10">
              Frequently Asked Questions
            </h3>
            <div className="space-y-3 sm:space-y-4">
              {[
                { q: 'Can I switch plans anytime?', a: 'Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.' },
                { q: 'What payment methods do you accept?', a: 'We accept UPI, credit/debit cards, and net banking. All payments are processed securely.' },
                { q: 'Is there a discount for annual billing?', a: 'Yes, save 25% when you choose yearly billing on any paid plan.' },
                { q: 'What happens if I exceed my plan limits?', a: "You'll be notified when you're approaching your limits. You can upgrade to a higher plan to unlock more capacity." },
                { q: 'Can I cancel my subscription?', a: 'Yes, you can cancel anytime. Your access continues until the end of your billing period.' },
              ].map((faq, idx) => (
                <motion.div key={idx} initial={false} className="border border-outline-variant/20 bg-surface-container-low/50 glass-card rounded-xl overflow-hidden">
                  <button onClick={() => setOpenFaq(openFaq === idx ? null : idx)} className="w-full flex items-center justify-between p-3 sm:p-4 md:p-5 text-left hover:bg-surface-variant/50 transition-colors">
                    <span className="font-headline-md text-[12px] sm:text-sm font-bold text-white pr-4">{faq.q}</span>
                    <span className={`material-symbols-outlined text-primary shrink-0 transition-transform duration-300 ${openFaq === idx ? 'rotate-180' : ''}`}>expand_more</span>
                  </button>
                  <AnimatePresence>
                    {openFaq === idx && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: 'easeInOut' }}>
                        <div className="p-3 sm:p-4 md:p-5 pt-0 text-[11px] sm:text-sm text-on-surface-variant leading-relaxed border-t border-outline-variant/10">{faq.a}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default PricingSection;
