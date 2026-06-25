import React, { useState } from 'react'
import { AlertTriangle, Trash2, X } from 'lucide-react'

const CONFIRMATION_PHRASE = "PURGE MATCH DISTRICT"

export const DangerZoneSettings = ({ resetGlobalState }) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [confirmationText, setConfirmationText] = useState('')
  const [isPurging, setIsPurging] = useState(false)

  const isConfirmValid = confirmationText === CONFIRMATION_PHRASE

  const handlePurgeDatabase = async () => {
    if (!isConfirmValid) return
    setIsPurging(true)
    try {
      const { getAuthToken } = await import('../../utils/getAuthToken.js')
      const token = await getAuthToken()
      const res = await fetch('/api/admin/purge-database', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        resetGlobalState({
          totalUsers: 0,
          activeArenas: 0,
          totalLivePrizePools: 0,
          allTimePrizePool: 0,
          allTimeCommission: 0,
          abuseFilters: [],
          applications: [],
        })
        setIsModalOpen(false)
        setConfirmationText('')
        alert("CRITICAL ALARM: Database has been entirely wiped.")
      } else {
        alert(data.error || 'Purge request rejected by server')
      }
    } catch (error) {
      console.error("Purge Failed:", error)
      alert("Failed to purge database. Check server logs.")
    } finally {
      setIsPurging(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Settings Card */}
      <div className="p-6 border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/[0.04] rounded-xl">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-red-100 dark:bg-red-500/20 rounded-full text-red-600 dark:text-red-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-red-900 dark:text-red-300">Danger Zone: Database Purge</h3>
            <p className="max-w-2xl mt-1 text-sm text-red-700 dark:text-red-400/70">
              This action is irreversible. It will permanently delete all registered users, game rosters, tournament histories, prize pools, and abuse filter settings. The platform will be reset to an absolute factory state.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 mt-4 text-sm font-bold text-white transition-colors bg-red-600 rounded-lg hover:bg-red-700 shadow-sm"
            >
              Wipe Platform Data
            </button>
          </div>
        </div>
      </div>

      {/* Strict Confirmation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 bg-white dark:bg-surface rounded-2xl shadow-xl border border-outline-variant/20">

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Confirm Global Purge</h2>
              <button onClick={() => { setIsModalOpen(false); setConfirmationText('') }} className="text-slate-400 hover:text-slate-600 dark:hover:text-white/60">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 mb-6 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg">
              <p className="text-sm font-medium text-red-800 dark:text-red-300 text-center">
                To confirm this destructive action, please type exactly:<br />
                <span className="block mt-2 font-mono text-base font-bold text-red-900 dark:text-red-200 select-none">
                  {CONFIRMATION_PHRASE}
                </span>
              </p>
            </div>

            <input
              type="text"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder="Type confirmation phrase..."
              className="w-full px-4 py-3 mb-6 font-mono text-center border rounded-lg border-slate-300 dark:border-white/10 bg-white dark:bg-white/5 text-slate-900 dark:text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
              autoComplete="off"
              onPaste={(e) => e.preventDefault()}
            />

            <button
              onClick={handlePurgeDatabase}
              disabled={!isConfirmValid || isPurging}
              className={`flex items-center justify-center w-full py-3 text-sm font-bold text-white rounded-lg transition-all ${
                isConfirmValid && !isPurging
                  ? 'bg-red-600 hover:bg-red-700 shadow-md cursor-pointer'
                  : 'bg-slate-300 dark:bg-white/10 cursor-not-allowed'
              }`}
            >
              {isPurging ? (
                'Purging Database...'
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" /> EXECUTE PURGE</>
              )}
            </button>

          </div>
        </div>
      )}

    </div>
  )
}

export default DangerZoneSettings
