import { useEffect, useState } from 'react'
import { getAuthToken } from '../utils/getAuthToken.js'

export default function PrizePaymentHistory() {
  const [upiId, setUpiId] = useState('')
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      try {
        const token = await getAuthToken()
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        const [profileRes, historyRes] = await Promise.all([
          fetch('/api/users/me/payout-profile', { headers }),
          fetch('/api/users/me/payment-history', { headers }),
        ])
        const [profile, history] = await Promise.all([profileRes.json(), historyRes.json()])
        if (!active) return
        if (profile.success) setUpiId(profile.payout_profile?.upi_id || '')
        if (history.success) setPayments(history.payments || [])
        else setMessage({ type: 'error', text: history.message || 'Could not load prize payment history.' })
      } catch {
        if (active) setMessage({ type: 'error', text: 'Could not load prize payment information.' })
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  const saveUpi = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const token = await getAuthToken()
      const response = await fetch('/api/users/me/payout-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ upi_id: upiId }),
      })
      const data = await response.json()
      if (!data.success) throw new Error(data.message || 'Could not save UPI ID.')
      setUpiId(data.payout_profile.upi_id)
      setMessage({ type: 'success', text: 'UPI ID saved for prize payouts.' })
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Could not save UPI ID.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-5">
      <div className="glass-card rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 p-5 sm:p-6">
        <h2 className="text-base font-bold text-on-background">Prize payout details</h2>
        <p className="mt-1 text-xs text-on-surface-variant">Your UPI ID is private and is shown only to the organizer or admin managing your award. A saved UPI ID does not mean a payment has been sent or verified.</p>
        <form onSubmit={saveUpi} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label className="flex-1 text-xs font-semibold text-on-surface-variant">
            UPI ID
            <input
              value={upiId}
              onChange={(event) => setUpiId(event.target.value)}
              autoComplete="off"
              placeholder="name@bank"
              className="mt-1.5 min-h-11 w-full rounded-xl border border-outline-variant/40 bg-surface px-3 text-sm text-on-background outline-none focus:border-primary"
            />
          </label>
          <button disabled={saving} className="self-end rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save UPI ID'}
          </button>
        </form>
        {message && <p role="status" className={`mt-3 text-xs ${message.type === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>{message.text}</p>}
      </div>

      <div className="glass-card rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 p-5 sm:p-6">
        <h2 className="text-base font-bold text-on-background">Tournament prize payment history</h2>
        {loading ? <p className="py-8 text-center text-sm text-on-surface-variant">Loading…</p> : payments.length === 0 ? (
          <p className="py-8 text-center text-sm text-on-surface-variant">No tournament prize payments recorded yet.</p>
        ) : (
          <div className="mt-4 divide-y divide-outline-variant/20">
            {payments.map((payment) => (
              <article key={payment.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-on-background">Tournament Prize · {payment.tournament_title}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">Rank #{payment.rank} · UPI reference {payment.utr_reference}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">{payment.paid_at ? new Date(payment.paid_at).toLocaleString() : 'Date unavailable'}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-base font-bold text-emerald-400">₹{Number(payment.amount).toLocaleString('en-IN')}</p>
                  <p className="text-xs capitalize text-on-surface-variant">{payment.payment_status}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
