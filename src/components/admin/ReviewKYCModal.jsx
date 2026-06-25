import React, { useState } from 'react'
import { X, FileText } from 'lucide-react'

export const ReviewKYCModal = ({ application, onClose, onApprove, onReject }) => {
  const [adminNotes, setAdminNotes] = useState('')

  if (!application) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-xl font-bold text-slate-900 uppercase">Review KYC: {application.orgName || application.applicantName}</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex flex-col gap-6">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><span className="text-sm font-semibold text-slate-900">Applicant:</span> <span className="text-sm text-slate-600">{application.applicantName}</span></div>
            <div><span className="text-sm font-semibold text-slate-900">Email:</span> <span className="text-sm text-slate-600">{application.email}</span></div>
            <div><span className="text-sm font-semibold text-slate-900">Phone:</span> <span className="text-sm text-slate-600">{application.phone}</span></div>
            <div><span className="text-sm font-semibold text-slate-900">Selected Plan:</span> <span className="text-sm text-slate-600">{application.selectedPlan || 'Free'}</span></div>
            <div><span className="text-sm font-semibold text-slate-900">City / Region:</span> <span className="text-sm text-slate-600">{application.cityRegion || 'N/A'}</span></div>
            <div><span className="text-sm font-semibold text-slate-900">Portfolio:</span> <span className="text-sm text-slate-600">{application.portfolio || 'N/A'}</span></div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><span className="text-sm font-semibold text-slate-900">Experience:</span> <span className="text-sm text-slate-600">{application.experience || 'N/A'}</span></div>
            {application.games && (
              <div className="sm:col-span-2"><span className="text-sm font-semibold text-slate-900">Games:</span> <span className="text-sm text-slate-600">{(typeof application.games === 'string' ? JSON.parse(application.games) : application.games)?.join(', ') || 'N/A'}</span></div>
            )}
            <div><span className="text-sm font-semibold text-slate-900">Discord:</span> <span className="text-sm text-slate-600">{application.discordLink || 'N/A'}</span></div>
            <div><span className="text-sm font-semibold text-slate-900">Additional Notes:</span> <span className="text-sm text-slate-600">{application.additionalNotes || 'N/A'}</span></div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-3">
            <span className="text-sm font-semibold text-slate-900">KYC Document</span>
            <div className="flex gap-4">
              {application.kycDoc ? (
                <a href={application.kycDoc.startsWith('http') ? application.kycDoc : '#'} target="_blank" rel="noreferrer" className="flex items-center text-sm text-indigo-600 hover:underline">
                  <FileText className="w-4 h-4 mr-1" /> View KYC Document
                </a>
              ) : (
                <span className="text-sm text-slate-400">No document uploaded</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-slate-900 uppercase">Accreditation Feedback / Admin Notes</label>
            <textarea
              rows={3}
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
              placeholder="Provide reasoning for approval/rejection or staff guidelines..."
            />
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 flex gap-4">
          <button
            onClick={() => onReject(adminNotes)}
            className="flex-1 py-3 text-sm font-bold text-blue-600 bg-white border-2 border-blue-100 rounded-xl hover:bg-blue-50 transition"
          >
            REJECT APPLICATION
          </button>
          <button
            onClick={() => onApprove(adminNotes)}
            className="flex-1 py-3 text-sm font-bold text-white bg-emerald-500 rounded-xl hover:bg-emerald-600 shadow-md transition"
          >
            APPROVE &amp; ACTIVATE
          </button>
        </div>
      </div>
    </div>
  )
}
