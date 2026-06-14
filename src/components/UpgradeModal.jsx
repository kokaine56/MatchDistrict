import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { subscriptionApi } from '../services/subscriptionApi'
import { PLAN_PRICES } from '../utils/featureGates'

const plans = [
  {
    name: 'basic',
    label: 'Basic Plan',
    price: PLAN_PRICES.Basic.monthly,
    period: 'month',
    badge: null,
    benefits: [
      ['60 Tournaments Per Month', true],
      ['Up To 300 Slots Per Tournament', true],
      ['Standard Registration Forms', true],
      ['Draft Tournament Support', true],
      ['Sponsored Prize Pool Requests', true],
      ['CSV / Excel Slot Export', true],
      ['Share Custom Tournament Link', true],
      ['Revenue & Growth Analytics', true],
      ['Staff Management', true],
    ],
    cta: 'Upgrade to Basic',
  },
  {
    name: 'pro',
    label: 'Pro Plan',
    price: PLAN_PRICES.Pro.monthly,
    period: 'month',
    badge: 'Recommended',
    benefits: [
      ['Unlimited Tournaments Per Month', true],
      ['Up To 1000 Slots Per Tournament', true],
      ['Custom Registration Forms', true],
      ['Gold Verified Badge', true],
      ['Draft Tournament Support', true],
      ['Sponsored Prize Pool Requests', true],
      ['CSV / Excel Slot Export', true],
      ['Tournament Automations', true],
      ['Custom Dashboard Link', true],
      ['Share Custom Tournament Link', true],
      ['Revenue & Growth Analytics', true],
      ['Early Access To New Features', true],
      ['Multi Admin Access', true],
      ['Staff Management', true],
    ],
    cta: 'Go Pro',
  },
]

const planLabels = { free: 'Free', basic: 'Basic', pro: 'Pro' }

export default function UpgradeModal({ isOpen, onClose, currentPlan, limitType, limitValue, onUpgrade }) {
  if (!isOpen) return null

  const limitLabel = limitType === 'tournament' ? 'tournament' : 'participant'
  const label = planLabels[currentPlan] || 'Free'
  const [upgrading, setUpgrading] = useState(false)
  const [result, setResult] = useState(null)

  const handleUpgrade = async (plan) => {
    const tier = plan.charAt(0).toUpperCase() + plan.slice(1)
    setUpgrading(true)
    setResult(null)
    try {
      const isPaid = tier !== 'Free'
      if (isPaid) {
        onClose()
        if (onUpgrade) onUpgrade(tier, 'monthly')
        return
      }
      const res = await subscriptionApi.upgrade(tier, 'monthly')
      if (res.success) {
        setResult({ type: 'success', message: `Switched to ${tier}!` })
        setTimeout(() => { onClose(); if (onUpgrade) onUpgrade(tier); }, 1500)
      } else {
        setResult({ type: 'error', message: res.message || 'Switch failed.' })
      }
    } catch (err) {
      setResult({ type: 'error', message: 'Network error.' })
    } finally {
      setUpgrading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(7, 8, 12, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, #0d0e16 0%, #0a0b12 100%)',
              border: '1px solid rgba(192,193,255,0.12)',
              boxShadow: '0 40px 120px rgba(0,0,0,0.95), 0 0 0 1px rgba(192,193,255,0.05)',
            }}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <span className="material-symbols-outlined text-white/50 hover:text-white text-base transition-colors">close</span>
            </button>

            <div className="px-8 pt-10 pb-6 text-center space-y-4">
              <div
                className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}
              >
                <span className="material-symbols-outlined text-3xl" style={{ color: '#fbbf24' }}>workspace_premium</span>
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-extrabold text-white tracking-tight">
                  You've reached your monthly {limitLabel} limit
                </h2>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  Your {label} plan allows up to {limitValue} {limitLabel}s per month. Upgrade to continue hosting.
                </p>
              </div>
            </div>

            <div className="px-8 pb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className="group relative text-left rounded-xl p-5 transition-all duration-300"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: plan.name === 'pro'
                      ? '1px solid rgba(192,193,255,0.25)'
                      : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {plan.name === 'pro' && (
                    <div
                      className="absolute -inset-px rounded-xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                      style={{
                        background: 'rgba(192,193,255,0.06)',
                        boxShadow: '0 0 30px rgba(192,193,255,0.12)',
                      }}
                    />
                  )}

                  {plan.badge && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-widest mb-3"
                      style={{ background: 'rgba(192,193,255,0.12)', border: '1px solid rgba(192,193,255,0.2)', color: '#c0c1ff' }}
                    >
                      {plan.badge}
                    </span>
                  )}

                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-extrabold text-white tracking-tight">{plan.label}</h3>
                      <div className="flex items-baseline gap-0.5 mt-1">
                        <span className="text-3xl font-extrabold text-white tracking-tight">₹{plan.price.toLocaleString('en-IN')}</span>
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>/{plan.period}</span>
                      </div>
                    </div>

                    <ul className="space-y-1.5">
                      {plan.benefits.map(([feat, included], i) => (
                        <li key={i} className="flex items-center gap-2 text-[11px]" style={{ color: included ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.15)' }}>
                          <span className="material-symbols-outlined text-[14px]" style={{ color: included ? '#34d399' : 'rgba(255,255,255,0.15)' }}>
                            {included ? 'check' : 'close'}
                          </span>
                          {feat}
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={() => handleUpgrade(plan.name)}
                      disabled={upgrading}
                      className="w-full py-2.5 rounded-xl text-xs font-bold text-center transition-all duration-200 disabled:opacity-50"
                      style={{
                        background: plan.name === 'pro'
                          ? 'linear-gradient(135deg, #c0c1ff, #a5b4fc)'
                          : 'rgba(255,255,255,0.06)',
                        color: plan.name === 'pro' ? '#07080C' : 'rgba(255,255,255,0.7)',
                        border: plan.name !== 'pro' ? '1px solid rgba(255,255,255,0.1)' : 'none',
                      }}
                    >
                      {upgrading ? 'Upgrading...' : plan.cta}
                    </button>

                    {result && (
                      <div className={`text-xs text-center mt-2 ${result.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {result.message}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pb-8 text-center">
              <button
                onClick={onClose}
                className="text-xs font-semibold transition-all"
                style={{ color: 'rgba(255,255,255,0.35)' }}
              >
                Maybe later
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
