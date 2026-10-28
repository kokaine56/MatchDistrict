import { useEffect, useState } from 'react'
import { getAuthToken } from '../../utils/getAuthToken.js'
import { uploadImage } from '../../utils/imagekitUpload.js'

export default function TournamentPaymentSettings({ tournament, onSaved }) {
  const [qrUrl, setQrUrl] = useState('')
  const [upiId, setUpiId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setMessage('')
    const load = async () => {
      try {
        const token = await getAuthToken()
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournament.id)}/payment-settings`, { credentials: 'include', headers })
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load payment settings.')
        if (active) {
          setQrUrl(data.settings?.payment_qr_image_url || '')
          setUpiId(data.settings?.payment_upi_id || '')
        }
      } catch (error) {
        if (active) setMessage(error.message || 'Unable to load payment settings.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [tournament.id])

  const handleUpload = async (file) => {
    if (!file) return
    setUploading(true)
    setMessage('')
    try {
      const uploadedUrl = await uploadImage(file)
      setQrUrl(uploadedUrl)
    } catch (error) {
      setMessage(error.message || 'QR image upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const save = async (event) => {
    event.preventDefault()
    if (saving || loading || uploading) return
    setSaving(true)
    setMessage('')
    try {
      const token = await getAuthToken()
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournament.id)}/payment-settings`, {
        method: 'PUT', credentials: 'include', headers,
        body: JSON.stringify({ payment_qr_image_url: qrUrl, payment_upi_id: upiId }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to save payment settings.')
      setQrUrl(data.settings?.payment_qr_image_url || '')
      setUpiId(data.settings?.payment_upi_id || '')
      setMessage('Payment settings saved.')
      onSaved?.()
    } catch (error) {
      setMessage(error.message || 'Unable to save payment settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="mb-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/50 p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-on-background">Tournament Payment Details</h3>
        <p className="mt-1 text-xs text-on-surface-variant">Optional. If left blank, the current default QR and UPI ID remain in use.</p>
      </div>
      {qrUrl && <img src={qrUrl} alt={`${tournament.title} payment QR`} className="h-36 w-36 rounded-lg border border-outline-variant/30 bg-white object-contain p-2" />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-on-surface-variant">
          Payment QR image
          <input type="file" accept="image/*" disabled={loading || uploading || saving} onChange={(event) => handleUpload(event.target.files?.[0])}
            className="mt-1 block w-full rounded-lg border border-outline-variant/30 bg-surface-container p-2 text-xs text-on-background" />
          {uploading && <span className="mt-1 block">Uploading…</span>}
        </label>
        <label className="text-xs font-semibold text-on-surface-variant">
          UPI ID
          <input value={upiId} onChange={(event) => setUpiId(event.target.value)} maxLength={255} placeholder="name@bank" disabled={loading || saving}
            className="mt-1 block w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2 text-sm text-on-background" />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={loading || saving || uploading} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
          {saving ? 'Saving…' : 'Save Payment Details'}
        </button>
        {message && <span className="text-xs text-on-surface-variant">{message}</span>}
      </div>
    </form>
  )
}
