import React from 'react'

export const PersonalVerification = ({ formData, updateFormData }) => {
  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm sm:p-8">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">

          <div className="sm:col-span-2 flex flex-col gap-2">
            <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Full Name *</label>
            <input
              type="text"
              value={formData.fullName || ''}
              onChange={(e) => updateFormData('fullName', e.target.value)}
              className="w-full px-4 py-3 text-sm bg-slate-50 border rounded-xl border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Rajnish Singh"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Email *</label>
            <input
              type="email"
              disabled
              value={formData.email || ''}
              className="w-full px-4 py-3 text-sm text-slate-500 bg-slate-100 border rounded-xl border-slate-200 cursor-not-allowed"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Phone Number *</label>
            <input
              type="tel"
              value={formData.phone || ''}
              onChange={(e) => updateFormData('phone', e.target.value)}
              className="w-full px-4 py-3 text-sm bg-slate-50 border rounded-xl border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="10-digit mobile number"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Country *</label>
            <select className="w-full px-4 py-3 text-sm bg-slate-50 border rounded-xl border-slate-200 focus:ring-2 focus:ring-indigo-500">
              <option>Select...</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">State *</label>
            <select className="w-full px-4 py-3 text-sm bg-slate-50 border rounded-xl border-slate-200 focus:ring-2 focus:ring-indigo-500">
              <option>Select state</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Age Group *</label>
            <select className="w-full px-4 py-3 text-sm bg-slate-50 border rounded-xl border-slate-200 focus:ring-2 focus:ring-indigo-500">
              <option>Select...</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Government ID Type *</label>
            <select className="w-full px-4 py-3 text-sm bg-slate-50 border rounded-xl border-slate-200 focus:ring-2 focus:ring-indigo-500">
              <option>Select...</option>
            </select>
          </div>

          <div className="sm:col-span-2 flex flex-col gap-2 mt-2">
            <label className="text-xs font-bold tracking-wider text-slate-500 uppercase">Upload Government ID *</label>
            <div className="flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 cursor-pointer">
              <span className="text-sm font-semibold text-indigo-600">Upload ID Scan (PDF, JPG, PNG)</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
