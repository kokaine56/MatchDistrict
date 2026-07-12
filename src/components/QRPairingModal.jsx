import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef } from 'react'

const QR_BASE = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data='

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
}

export default function QRPairingModal({ isOpen, onClose, onGenerateKey, devices, onUnpair, generating }) {
  const [pairingData, setPairingData] = useState(null)
  const generatingRef = useRef(false)

  useEffect(() => {
    if (isOpen && !generatingRef.current) {
      generatingRef.current = true
      setPairingData(null)
      onGenerateKey().then(result => {
        generatingRef.current = false
        if (result) setPairingData(result)
      })
    }
    if (!isOpen) generatingRef.current = false
  }, [isOpen])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-surface-container-low border border-outline-variant/20 rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="p-5 md:p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-on-background">Link Payment Verifier</h2>
                <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface/50 text-on-surface-variant transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {generating && !pairingData && (
                <div className="flex flex-col items-center py-8 gap-3">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-on-surface-variant">Generating pairing key...</p>
                </div>
              )}

              {pairingData && (
                <>
                  <div className="bg-surface/50 border border-outline-variant/20 rounded-xl p-4 text-center space-y-3">
                    <p className="text-xs text-on-surface-variant font-medium">
                      Scan this QR with your <span className="text-primary font-bold">Payment Verification App</span>
                    </p>
                    <div className="inline-flex flex-col items-center bg-white rounded-xl p-2 shadow-lg">
                      <img
                        src={QR_BASE + encodeURIComponent(JSON.stringify({ url: pairingData.server_url, api_key: pairingData.api_key }))}
                        alt="Pairing QR Code"
                        className="w-56 h-56 rounded-lg"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-center gap-2 bg-surface-container-low/60 rounded-lg px-3 py-2 border border-outline-variant/20">
                        <span className="text-[10px] text-on-surface-variant">Server:</span>
                        <span className="text-xs font-bold text-primary">{pairingData.server_url}</span>
                      </div>
                      <div className="flex items-center justify-center gap-2 bg-surface-container-low/60 rounded-lg px-3 py-2 border border-outline-variant/20">
                        <span className="text-[10px] text-on-surface-variant">Key:</span>
                        <code className="text-[10px] font-mono font-bold text-on-background truncate max-w-[200px]">{pairingData.api_key}</code>
                        <button
                          onClick={() => { navigator.clipboard?.writeText(pairingData.api_key) }}
                          className="p-1 rounded hover:bg-surface/50 text-on-surface-variant transition-colors shrink-0"
                          title="Copy API Key"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                    <p className="text-[11px] text-amber-300 leading-relaxed">
                      Open your Payment Verification App → Settings → Scan QR code.
                      The app will automatically read SMS from supported banks and forward them here for matching.
                    </p>
                  </div>
                </>
              )}

              {devices && devices.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Paired Devices</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {devices.map((d) => (
                      <div key={d.id} className="flex items-center justify-between bg-surface/30 border border-outline-variant/20 rounded-lg px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-on-background truncate">{d.device_name || d.device_id}</p>
                          <p className="text-[10px] text-on-surface-variant/60">Last seen: {formatDate(d.last_seen_at)}</p>
                        </div>
                        <button
                          onClick={() => onUnpair(d.id)}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-error bg-error/10 hover:bg-error/20 transition-colors shrink-0 ml-2"
                        >
                          Unlink
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
