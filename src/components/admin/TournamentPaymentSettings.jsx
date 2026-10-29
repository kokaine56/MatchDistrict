import { useEffect, useState } from 'react'
import { getAuthToken } from '../../utils/getAuthToken.js'
import { uploadImage } from '../../utils/imagekitUpload.js'

export default function TournamentPaymentSettings({ tournament, onSaved }) {
  const [qrUrl, setQrUrl] = useState('')
  const [qrFile, setQrFile] = useState(null)
  const [qrPreviewUrl, setQrPreviewUrl] = useState('')
  const [upiId, setUpiId] = useState('')
  const [upiError, setUpiError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!qrFile) { setQrPreviewUrl(''); return }
    const preview = URL.createObjectURL(qrFile)
    setQrPreviewUrl(preview)
    return () => URL.revokeObjectURL(preview)
  }, [qrFile])

  useEffect(() => {
    let active = true
    setLoading(true)
    setMessage('')
    const load = async () => {
      try {
        const token = await getAuthToken()
        const headers = token ? { Authorization: `Bearer ${token}` } : {}
        const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournament.id)}/payment-settings`, { credentials: 'include', cache: 'no-store', headers })
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

  const handleFileChange = (file) => {
    if (!file) return
    setMessage('')
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
    const allowedExtensions = /\.(png|jpe?g|webp)$/i
    if (!allowedTypes.includes(file.type) || !allowedExtensions.test(file.name)) {
      setQrFile(null)
      setMessage('QR image must be a PNG, JPG, JPEG, or WebP file.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setQrFile(null)
      setMessage('QR image must be 5 MB or smaller.')
      return
    }
    setQrFile(file)
  }

  const save = async (event) => {
    event.preventDefault()
    if (saving || loading || uploading) return
    const normalizedUpi = upiId.trim()
    const upiPattern = /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/
    if (normalizedUpi && !upiPattern.test(normalizedUpi)) {
      setUpiError('Enter a valid UPI ID, for example 66566656556@upi.')
      return
    }
    setUpiError('')
    setSaving(true)
    setMessage('')
    let uploadedQrUrl = ''
    try {
      const token = await getAuthToken()
      const headers = token ? { Authorization: `Bearer ${token}` } : {}
      console.info('[TournamentPaymentSettings] Checking admin permission', { tournamentId: tournament.id })
      const permissionResponse = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournament.id)}/payment-settings`, { credentials: 'include', cache: 'no-store', headers })
      const permissionData = await permissionResponse.json()
      if (!permissionResponse.ok || !permissionData.success) {
        const error = new Error(permissionData.message || permissionData.error || `Admin permission check failed (HTTP ${permissionResponse.status}).`)
        console.error('[TournamentPaymentSettings] Admin permission check failed', { tournamentId: tournament.id, status: permissionResponse.status, error: permissionData.error, message: error.message })
        throw error
      }

      if (qrFile) {
        setUploading(true)
        console.info('[TournamentPaymentSettings] Uploading tournament QR', { tournamentId: tournament.id, fileName: qrFile.name, bytes: qrFile.size })
        uploadedQrUrl = await uploadImage(qrFile, { purpose: 'tournament-payment-qr', tournamentId: tournament.id, token })
        uploadedQrUrl += `${uploadedQrUrl.includes('?') ? '&' : '?'}v=${Date.now()}`
        console.info('[TournamentPaymentSettings] QR upload succeeded', { tournamentId: tournament.id, url: uploadedQrUrl })
      }

      const savedQrUrl = uploadedQrUrl || permissionData.settings?.payment_qr_image_url || qrUrl || ''
      const updateHeaders = { 'Content-Type': 'application/json', ...headers }
      console.info('[TournamentPaymentSettings] Updating tournament payment settings', { tournamentId: tournament.id, hasNewQr: Boolean(uploadedQrUrl), hasUpi: Boolean(normalizedUpi) })
      const response = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournament.id)}/payment-settings`, {
        method: 'PUT', credentials: 'include', headers: updateHeaders,
        body: JSON.stringify({ payment_qr_image_url: savedQrUrl, payment_upi_id: normalizedUpi, payment_qr_uploaded: Boolean(uploadedQrUrl) }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data.success) {
        const error = new Error(data.message || data.error || `Database update failed (HTTP ${response.status}).`)
        console.error('[TournamentPaymentSettings] Database update failed', { tournamentId: tournament.id, status: response.status, error: data.error, message: error.message })
        throw error
      }
      console.info('[TournamentPaymentSettings] Payment settings saved', { tournamentId: tournament.id })
      setQrUrl(data.settings?.payment_qr_image_url || '')
      setUpiId(data.settings?.payment_upi_id || '')
      setQrFile(null)
      setMessage('Payment settings saved.')
      onSaved?.()
    } catch (error) {
      console.error('[TournamentPaymentSettings] Save failed', { tournamentId: tournament.id, error })
      setMessage(error.message || 'Unable to save payment settings.')
    } finally {
      setUploading(false)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="mb-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/50 p-4 sm:p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-on-background">Tournament Payment Details</h3>
        <p className="mt-1 text-xs text-on-surface-variant">Optional. If left blank, the current default QR and UPI ID remain in use.</p>
      </div>
      {(qrPreviewUrl || qrUrl) && <img src={qrPreviewUrl || qrUrl} alt={`${tournament.title} payment QR`} className="h-36 w-36 rounded-lg border border-outline-variant/30 bg-white object-contain p-2" />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-on-surface-variant">
          Payment QR image
          <input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" disabled={loading || uploading || saving} onChange={(event) => handleFileChange(event.target.files?.[0])}
            className="mt-1 block w-full rounded-lg border border-outline-variant/30 bg-surface-container p-2 text-xs text-on-background" />
          {uploading && <span className="mt-1 block">Uploading…</span>}
        </label>
        <label className="text-xs font-semibold text-on-surface-variant">
          UPI ID
          <input value={upiId} onChange={(event) => { const value = event.target.value; setUpiId(value); setUpiError(value.trim() && !/^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/.test(value.trim()) ? 'Enter a valid UPI ID, for example 66566656556@upi.' : '') }} maxLength={255} placeholder="name@bank" disabled={loading || saving}
            className="mt-1 block w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2 text-sm text-on-background" />
          {upiError && <span className="mt-1 block text-xs text-red-500">{upiError}</span>}
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
