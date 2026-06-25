import React, { useState, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'

export const ConfirmIdentityOTP = ({ email, onVerify, onBack }) => {
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const inputRefs = useRef([])

  const handleChange = (index, value) => {
    if (isNaN(value)) return
    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)

    if (value !== '' && index < 5) {
      inputRefs.current[index + 1].focus()
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && index > 0 && otp[index] === '') {
      inputRefs.current[index - 1].focus()
    }
  }

  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-full text-center pb-2">
        <p className="text-xs text-emerald-400 font-bold">Verification code sent to {email}</p>
      </div>

      <div className="flex justify-center w-full mt-4 gap-1.5 sm:gap-3">
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={(el) => (inputRefs.current[index] = el)}
            type="text"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className="w-10 h-12 sm:w-14 sm:h-16 p-0 text-xl sm:text-2xl font-bold text-center text-slate-900 transition-all bg-white border rounded-xl sm:rounded-2xl shrink-0 border-indigo-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
          />
        ))}
      </div>

      <button
        onClick={() => onVerify(otp.join(''))}
        className="w-full py-3.5 mt-8 text-sm font-bold text-white transition-all shadow-md bg-indigo-600 rounded-xl hover:bg-indigo-700 hover:shadow-lg flex items-center justify-center gap-2"
      >
        <span>Verify Code &amp; Join</span>
      </button>

      <div className="flex flex-col items-center mt-6 gap-4">
        <p className="text-xs text-on-surface-variant">
          No receipt?{' '}
          <button
            type="button"
            className="text-primary font-bold hover:underline underline-offset-4"
          >
            Resend Code
          </button>
        </p>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center text-xs font-bold text-on-surface-variant/60 hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Registration
        </button>
      </div>
    </div>
  )
}
