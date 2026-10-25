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
      <div className="p-5 sm:p-6 border border-rose-500/25 bg-rose-500/[0.03] rounded-2xl shadow-sm">
        <div className="flex items-start gap-4">
          <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-on-background">Danger Zone: Database Purge</h3>
            <p className="max-w-2xl mt-1 text-xs text-on-surface-variant leading-relaxed">
              This action is irreversible. It will permanently delete all registered users, game rosters, tournament histories, prize pools, and abuse filter settings. The platform will be reset to an absolute factory state.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 mt-4 text-xs font-bold text-white transition-all bg-rose-600 hover:bg-rose-500 rounded-xl shadow-sm shadow-rose-600/20 active:scale-95"
            >
              Wipe Platform Data
            </button>
          </div>
        </div>
      </div>

      {/* Strict Confirmation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md p-6 bg-surface border border-outline-variant/30 rounded-2xl shadow-2xl text-on-background animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base sm:text-lg font-bold text-on-background">Confirm Global Purge</h2>
              <button
                onClick={() => { setIsModalOpen(false); setConfirmationText('') }}
                className="w-8 h-8 rounded-xl bg-surface-variant/40 hover:bg-surface-variant text-on-surface-variant hover:text-on-background flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 mb-5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
              <p className="text-xs font-medium text-on-surface-variant text-center">
                To confirm this destructive action, please type exactly:<br />
                <span className="block mt-2 font-mono text-sm font-bold text-rose-500 select-none">
                  {CONFIRMATION_PHRASE}
                </span>
              </p>
            </div>

            <input
              type="text"
              value={confirmationText}
              onChange={(e) => setConfirmationText(e.target.value)}
              placeholder="Type confirmation phrase..."
              className="w-full px-4 py-2.5 mb-5 font-mono text-center text-xs border rounded-xl border-outline-variant/30 bg-surface text-on-background focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all"
              autoComplete="off"
              onPaste={(e) => e.preventDefault()}
            />

            <button
              onClick={handlePurgeDatabase}
              disabled={!isConfirmValid || isPurging}
              className={`flex items-center justify-center w-full py-2.5 text-xs font-bold text-white rounded-xl transition-all ${
                isConfirmValid && !isPurging
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-md shadow-rose-600/25 cursor-pointer active:scale-95'
                  : 'bg-surface-variant/60 text-on-surface-variant/40 border border-outline-variant/20 cursor-not-allowed'
              }`}
            >
              {isPurging ? (
                'Purging Database...'
              ) : (
                <><Trash2 className="w-4 h-4 mr-1.5" /> EXECUTE PURGE</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default DangerZoneSettings
