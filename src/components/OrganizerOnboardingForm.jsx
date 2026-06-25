import React, { useState, useRef, useEffect } from 'react'

export const OrganizerOnboardingForm = () => {
  const [currentStep, setCurrentStep] = useState(1)
  const formTopRef = useRef(null)

  useEffect(() => {
    if (formTopRef.current) {
      setTimeout(() => {
        formTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [currentStep])

  const handleNext = () => {
    setCurrentStep(prev => prev + 1)
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div ref={formTopRef} className="scroll-mt-6" />

      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5, 6].map(step => (
              <div key={step} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                step <= currentStep ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
              }`}>
                {step}
              </div>
            ))}
          </div>
          <span className="text-sm text-slate-500">Step {currentStep} of 6</span>
        </div>

        <div className="mt-8">
          {currentStep === 1 && <div className="text-slate-900">Step 1: Personal Verification</div>}
          {currentStep === 2 && <div className="text-slate-900">Step 2: KYC Documents</div>}
          {currentStep === 3 && <div className="text-slate-900">Step 3: Branding</div>}
          {currentStep === 4 && <div className="text-slate-900">Step 4: Operations</div>}
          {currentStep === 5 && <div className="text-slate-900">Step 5: Trust &amp; Safety</div>}
          {currentStep === 6 && <div className="text-slate-900">Step 6: Review &amp; Submit</div>}
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
          {currentStep < 6 && (
            <button onClick={handleNext} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition">
              Next Step
            </button>
          )}
          {currentStep === 6 && (
            <button className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition">
              Submit Application
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
