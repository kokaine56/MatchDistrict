import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../UserContext.jsx'
import { subscriptionApi } from '../services/subscriptionApi.js'

const STATUS_CONFIG = {
  pending: { label: 'Pending Verification', color: 'text-amber-400', bg: 'bg-amber-400/10', icon: 'hourglass_top' },
  approved: { label: 'Approved', color: 'text-success', bg: 'bg-success/10', icon: 'check_circle' },
  rejected: { label: 'Rejected', color: 'text-error', bg: 'bg-error/10', icon: 'cancel' },
}

export default function PaymentHistory() {
  const navigate = useNavigate()
  const { currentUser } = useUser()
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPayment, setSelectedPayment] = useState(null)

  useEffect(() => {
    if (!currentUser) return
    const fetchPayments = async () => {
      try {
        const res = await subscriptionApi.getMyPayments()
        if (res.success) setPayments(res.payments || [])
      } catch (err) { console.error(err) }
      finally { setLoading(false) }
    }
    fetchPayments()
  }, [currentUser])

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-on-surface-variant">Please sign in to view payment history.</p>
      </div>
    )
  }

  const statusConfig = (s) => STATUS_CONFIG[s] || STATUS_CONFIG.pending

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="absolute inset-0 bg-grid-pattern pointer-events-none z-0" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-outline-variant/20">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-surface-container-low/50 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant">arrow_back</span>
          </button>
          <div>
            <p className="text-sm font-bold text-on-background">Payment History</p>
            <p className="text-[10px] text-on-surface-variant">Track your subscription payments</p>
          </div>
        </div>
      </header>

      <div className="relative z-10 flex-1 max-w-3xl mx-auto w-full p-4 sm:p-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-surface-container-low/30 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <div className="glass-card p-8 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md text-center">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant block mb-3">receipt_long</span>
            <p className="text-sm font-semibold text-on-background mb-1">No payment history</p>
            <p className="text-xs text-on-surface-variant mb-4">You haven't made any subscription payments yet.</p>
            <button onClick={() => navigate('/profile?tab=subscription')} className="px-4 py-2 bg-primary/10 text-primary text-xs font-semibold rounded-xl hover:bg-primary/20 transition-colors">
              View Plans
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {payments.map((payment) => {
              const sc = statusConfig(payment.status)
              return (
                <motion.div
                  key={payment.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => setSelectedPayment(selectedPayment?.id === payment.id ? null : payment)}
                  className="glass-card p-4 rounded-[16px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md cursor-pointer hover:border-outline-variant/50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${sc.bg} flex items-center justify-center`}>
                        <span className={`material-symbols-outlined ${sc.color} text-lg`}>{sc.icon}</span>
                      </div>
                      <div>
                        <p className="text-sm font-bold text-on-background">{payment.plan_name} Plan</p>
                        <p className="text-[10px] text-on-surface-variant">
                          {new Date(payment.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          <span className="mx-1">·</span>
                          ₹{Number(payment.amount).toLocaleString('en-IN')}
                          <span className="mx-1">·</span>
                          <span className="capitalize">{payment.billing_cycle}</span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${sc.bg} ${sc.color}`}>
                        {sc.label}
                      </span>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {selectedPayment?.id === payment.id && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4 pt-4 border-t border-outline-variant/20 space-y-3">
                      {payment.transaction_id && (
                        <div className="flex justify-between text-xs">
                          <span className="text-on-surface-variant">Transaction ID</span>
                          <span className="text-on-surface font-mono text-[10px]">{payment.transaction_id}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-xs">
                        <span className="text-on-surface-variant">Amount</span>
                        <span className="text-on-surface font-medium">₹{Number(payment.amount).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-on-surface-variant">Billing Cycle</span>
                        <span className="text-on-surface font-medium capitalize">{payment.billing_cycle}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-on-surface-variant">Submitted</span>
                        <span className="text-on-surface">{new Date(payment.created_at).toLocaleString('en-IN')}</span>
                      </div>
                      {payment.reviewed_at && (
                        <div className="flex justify-between text-xs">
                          <span className="text-on-surface-variant">Reviewed</span>
                          <span className="text-on-surface">{new Date(payment.reviewed_at).toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {payment.rejection_reason && (
                        <div className="p-3 bg-error/5 border border-error/20 rounded-xl">
                          <p className="text-[10px] text-error font-medium">Rejection Reason:</p>
                          <p className="text-[10px] text-error/80 mt-0.5">{payment.rejection_reason}</p>
                        </div>
                      )}
                      {payment.payment_screenshot_url && (
                        <div>
                          <p className="text-[10px] text-on-surface-variant mb-2">Payment Screenshot:</p>
                          <img src={payment.payment_screenshot_url} alt="Payment Screenshot" className="w-full max-h-48 object-contain rounded-xl bg-black/20" />
                        </div>
                      )}
                      {payment.status === 'rejected' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); navigate(`/subscription/payment?plan=${payment.plan_name}&cycle=${payment.billing_cycle}`) }}
                          className="w-full py-2.5 bg-primary/10 text-primary text-xs font-semibold rounded-xl hover:bg-primary/20 transition-colors mt-2"
                        >
                          Resubmit Payment
                        </button>
                      )}
                    </motion.div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
