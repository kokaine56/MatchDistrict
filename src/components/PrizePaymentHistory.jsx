import { useCallback, useEffect, useState } from 'react'
import { getAuthToken } from '../utils/getAuthToken.js'
import CountUp from './CountUp.jsx'

function formatISTDateTime(dateInput) {
  if (!dateInput) return ''
  const date = new Date(dateInput)
  if (isNaN(date.getTime())) return ''

  const dateStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)

  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)

  return `${dateStr}, ${timeStr}`
}

export default function PrizePaymentHistory() {
  const [totalEarnings, setTotalEarnings] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState('')

  const fetchTransactions = useCallback(async (currentOffset, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError('')
    try {
      const token = await getAuthToken()
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      const res = await fetch(`/api/users/me/payment-history?limit=20&offset=${currentOffset}`, {
        headers,
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Could not load payment history.')
      }
      setTotalEarnings(Number(data.total_earnings) || 0)
      setHasMore(Boolean(data.has_more))
      setOffset(currentOffset + (data.transactions?.length || 0))
      setTransactions((prev) => append ? [...prev, ...(data.transactions || [])] : (data.transactions || []))
    } catch (err) {
      setError(err.message || 'Could not load payment history. Please try again.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    fetchTransactions(0, false)
  }, [fetchTransactions])

  return (
    <section className="space-y-5">
      {/* Total Earnings Card */}
      <div className="glass-card p-5 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-1">
        <span className="font-label-caps text-[10px] text-on-surface-variant font-bold uppercase tracking-wider block">
          Total Earnings
        </span>
        <div className="font-prize-display text-2xl sm:text-3xl font-extrabold text-secondary flex items-baseline gap-1 pt-0.5">
          ₹<CountUp endValue={totalEarnings} decimals={0} />
        </div>
        <p className="font-body-sm text-[10px] sm:text-xs text-on-surface-variant/70 leading-tight pt-1">
          All tournament rewards and distributions.
        </p>
      </div>

      {/* Transaction List Card */}
      <div className="glass-card rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-outline-variant/20 flex items-center justify-between">
          <h3 className="font-headline-md text-xs sm:text-sm font-bold uppercase flex items-center gap-2 text-on-background tracking-tight">
            <span className="material-symbols-outlined text-primary text-base sm:text-lg">receipt_long</span>
            Transactions
          </h3>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-on-surface-variant animate-pulse">
            Loading payments…
          </div>
        ) : error && transactions.length === 0 ? (
          <div className="py-10 px-4 text-center space-y-2">
            <p className="text-xs text-rose-400">{error}</p>
            <button
              type="button"
              onClick={() => fetchTransactions(0, false)}
              className="px-4 py-1.5 rounded-full border border-outline-variant/60 hover:border-primary/40 text-xs font-semibold text-on-background hover:bg-surface-variant transition-all"
            >
              Try again
            </button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-12 text-center px-4">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant/40 block mb-2">receipt_long</span>
            <p className="text-sm font-semibold text-on-background">No payments yet.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-outline-variant/15">
              {transactions.map((tx) => {
                const isCredit = tx.kind === 'credit'
                const isDebit = tx.kind === 'debit'

                let statusLabel = ''
                let statusBadgeClass = ''
                let amountColorClass = ''

                if (isDebit) {
                  if (tx.status === 'approved') {
                    statusLabel = 'Approved'
                    statusBadgeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    amountColorClass = 'text-rose-400 font-bold'
                  } else if (tx.status === 'rejected') {
                    statusLabel = 'Rejected'
                    statusBadgeClass = 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    amountColorClass = 'text-on-surface-variant font-medium'
                  } else {
                    statusLabel = 'Pending verification'
                    statusBadgeClass = 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                    amountColorClass = 'text-on-surface-variant font-medium'
                  }
                } else {
                  if (tx.status === 'paid') {
                    statusLabel = 'Paid'
                    statusBadgeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    amountColorClass = 'text-emerald-400 font-bold'
                  } else if (tx.status === 'processing') {
                    statusLabel = 'Processing'
                    statusBadgeClass = 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/20'
                    amountColorClass = 'text-emerald-400/80 font-bold'
                  } else {
                    statusLabel = 'Pending'
                    statusBadgeClass = 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                    amountColorClass = 'text-on-surface-variant font-medium'
                  }
                }

                const arrowIcon = isCredit ? 'south_west' : 'north_east'
                const arrowBg = isCredit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'

                const amountVal = Number(tx.amount) || 0
                const formattedAmount = isCredit
                  ? `+₹${amountVal.toLocaleString('en-IN')}`
                  : `-₹${Number.isInteger(amountVal)
                      ? amountVal.toLocaleString('en-IN')
                      : amountVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

                const formattedDateTime = formatISTDateTime(tx.created_at)

                return (
                  <div
                    key={tx.id}
                    className="p-3.5 sm:p-4 flex items-center justify-between gap-3 select-none"
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 ${arrowBg}`}>
                        <span className="material-symbols-outlined text-sm sm:text-base">{arrowIcon}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-semibold text-on-background truncate">
                          {tx.title}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] sm:text-xs text-on-surface-variant mt-0.5">
                          <span className="font-medium text-on-surface-variant/90">{tx.label}</span>
                          <span className="text-on-surface-variant/40">·</span>
                          <span>{formattedDateTime}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <span className={`text-xs sm:text-sm ${amountColorClass}`}>
                        {formattedAmount}
                      </span>
                      <span className={`text-[9px] sm:text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusBadgeClass}`}>
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {hasMore && (
              <div className="p-4 sm:p-5 border-t border-outline-variant/15 flex justify-center">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => fetchTransactions(offset, true)}
                  className="px-6 py-2 rounded-full border border-outline-variant/60 hover:border-primary/40 text-xs font-semibold text-on-background hover:bg-surface-variant disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {loadingMore ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Loading…
                    </>
                  ) : (
                    'Load more'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
