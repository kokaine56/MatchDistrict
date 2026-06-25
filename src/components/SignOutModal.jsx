import React, { useState } from 'react'

export const SignOutModal = ({ isOpen, onClose, onConfirm }) => {
  const [signOutType, setSignOutType] = useState('only')

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-sm p-6 bg-white shadow-2xl rounded-3xl">
        <h2 className="text-2xl font-bold text-slate-900">Sign Out</h2>
        <p className="mt-2 text-sm text-slate-500">How would you like to sign out?</p>

        <div className="flex flex-col gap-3 mt-6 mb-8">
          <label
            className={`flex items-start p-4 border-2 rounded-xl cursor-pointer transition-all ${
              signOutType === 'only'
                ? 'border-indigo-600 bg-indigo-50'
                : 'border-slate-100 bg-white hover:border-slate-200'
            }`}
          >
            <div className="flex items-center h-5 mt-0.5">
              <input
                type="radio"
                name="signOutOption"
                value="only"
                checked={signOutType === 'only'}
                onChange={() => setSignOutType('only')}
                className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-600"
              />
            </div>
            <div className="ml-3">
              <span className={`block text-sm font-bold ${signOutType === 'only' ? 'text-indigo-900' : 'text-slate-900'}`}>
                Sign out only
              </span>
              <span className={`block text-xs mt-1 leading-relaxed ${signOutType === 'only' ? 'text-indigo-700' : 'text-slate-500'}`}>
                Keep this account visible in account switcher.
              </span>
            </div>
          </label>

          <label
            className={`flex items-start p-4 border-2 rounded-xl cursor-pointer transition-all ${
              signOutType === 'remove'
                ? 'border-indigo-600 bg-indigo-50'
                : 'border-slate-100 bg-white hover:border-slate-200'
            }`}
          >
            <div className="flex items-center h-5 mt-0.5">
              <input
                type="radio"
                name="signOutOption"
                value="remove"
                checked={signOutType === 'remove'}
                onChange={() => setSignOutType('remove')}
                className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-600"
              />
            </div>
            <div className="ml-3">
              <span className={`block text-sm font-bold ${signOutType === 'remove' ? 'text-indigo-900' : 'text-slate-900'}`}>
                Sign out and remove
              </span>
              <span className={`block text-xs mt-1 leading-relaxed ${signOutType === 'remove' ? 'text-indigo-700' : 'text-slate-500'}`}>
                Remove this account from remembered list on this device.
              </span>
            </div>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 text-sm font-bold transition-colors bg-white border-2 rounded-xl text-indigo-600 border-indigo-100 hover:bg-indigo-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(signOutType)}
            className="flex-1 px-4 py-3 text-sm font-bold text-white transition-all shadow-md bg-red-600 rounded-xl hover:bg-red-700 hover:shadow-lg"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
