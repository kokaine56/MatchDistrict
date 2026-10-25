import React, { useState } from 'react'
import { X, FileText } from 'lucide-react'

export const ReviewKYCModal = ({ application, onClose, onApprove, onReject }) => {
  const [adminNotes, setAdminNotes] = useState('')

  if (!application) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-surface border border-outline-variant/30 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] text-on-background overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-on-background tracking-tight">
              Review KYC: {application.orgName || application.applicantName}
            </h2>
            <p className="text-[11px] text-on-surface-variant">Review identity credentials and approve organizer accreditation.</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-surface-variant/40 hover:bg-surface-variant text-on-surface-variant hover:text-on-background transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex flex-col gap-5 custom-scrollbar">
          {/* Primary details */}
          <div className="p-4 bg-surface-container/50 rounded-xl border border-outline-variant/20 grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
            <div>
              <span className="font-bold text-on-surface-variant uppercase tracking-wider text-[10px] block">Applicant</span>
              <span className="font-semibold text-on-background">{application.applicantName || '—'}</span>
            </div>
            <div>
              <span className="font-bold text-on-surface-variant uppercase tracking-wider text-[10px] block">Email</span>
              <span className="font-semibold text-on-background">{application.email || '—'}</span>
            </div>
            <div>
              <span className="font-bold text-on-surface-variant uppercase tracking-wider text-[10px] block">Phone</span>
              <span className="font-semibold text-on-background">{application.phone || '—'}</span>
            </div>
            <div>
              <span className="font-bold text-on-surface-variant uppercase tracking-wider text-[10px] block">Selected Plan</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                {application.selectedPlan || 'Free'}
              </span>
            </div>
            <div>
              <span className="font-bold text-on-surface-variant uppercase tracking-wider text-[10px] block">City / Region</span>
              <span className="text-on-background">{application.cityRegion || 'N/A'}</span>
            </div>
            <div>
              <span className="font-bold text-on-surface-variant uppercase tracking-wider text-[10px] block">Portfolio</span>
              <span className="text-on-background truncate block">{application.portfolio || 'N/A'}</span>
            </div>
          </div>

          {/* Secondary Details */}
          <div className="p-4 bg-surface-container/50 rounded-xl border border-outline-variant/20 grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
            <div className="sm:col-span-2">
              <span className="font-bold text-on-surface-variant uppercase tracking-wider text-[10px] block">Experience</span>
              <p className="text-on-background mt-0.5 leading-relaxed">{application.experience || 'N/A'}</p>
            </div>
            {application.games && (
              <div className="sm:col-span-2">
                <span className="font-bold text-on-surface-variant uppercase tracking-wider text-[10px] block">Games</span>
                <span className="text-on-background">
                  {(typeof application.games === 'string' ? JSON.parse(application.games) : application.games)?.join(', ') || 'N/A'}
                </span>
              </div>
            )}
            <div>
              <span className="font-bold text-on-surface-variant uppercase tracking-wider text-[10px] block">Discord</span>
              <span className="text-on-background">{application.discordLink || 'N/A'}</span>
            </div>
            <div>
              <span className="font-bold text-on-surface-variant uppercase tracking-wider text-[10px] block">Additional Notes</span>
              <span className="text-on-background">{application.additionalNotes || 'N/A'}</span>
            </div>
          </div>

          {/* KYC Document Link */}
          <div className="p-4 bg-surface-container/50 rounded-xl border border-outline-variant/20 flex flex-col gap-2">
            <span className="font-bold text-on-surface-variant uppercase tracking-wider text-[10px] block">KYC Verification Document</span>
            <div>
              {application.kycDoc ? (
                <a
                  href={application.kycDoc.startsWith('http') ? application.kycDoc : '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  View Uploaded Document
                </a>
              ) : (
                <span className="text-xs text-on-surface-variant/60 italic">No document uploaded</span>
              )}
            </div>
          </div>

          {/* Admin Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
              Accreditation Feedback / Admin Notes
            </label>
            <textarea
              rows={3}
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              className="w-full p-3 bg-surface border border-outline-variant/30 rounded-xl text-xs text-on-background placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none"
              placeholder="Provide reasoning for approval/rejection or organizer guidelines..."
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-outline-variant/20 flex items-center justify-end gap-3 bg-surface/50">
          <button
            onClick={() => onReject(adminNotes)}
            className="px-4 py-2.5 min-h-[42px] text-xs font-bold text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-xl hover:bg-rose-500 hover:text-white transition-all"
          >
            Reject Application
          </button>
          <button
            onClick={() => onApprove(adminNotes)}
            className="px-5 py-2.5 min-h-[42px] text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-sm shadow-emerald-600/20 transition-all"
          >
            Approve &amp; Activate
          </button>
        </div>
      </div>
    </div>
  )
}
