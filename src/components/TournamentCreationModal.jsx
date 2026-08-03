import React from 'react'
import { formatDate, formatDateTime } from '../utils/timeFormat'

const STEPS = [
  { step: 1, label: 'Basic Details',  icon: 'info',          desc: 'Title & game' },
  { step: 2, label: 'Match Setup',    icon: 'settings',      desc: 'Mode & region' },
  { step: 3, label: 'Prize Pool',     icon: 'military_tech', desc: 'Rewards & splits' },
  { step: 4, label: 'Slot Config',    icon: 'groups',        desc: 'Capacity & fees' },
  { step: 5, label: 'Rules & KYC',   icon: 'gavel',         desc: 'Compliance' },
  { step: 6, label: 'Media & Brand', icon: 'photo',          desc: 'Banners & logos' },
  { step: 7, label: 'Timeline',       icon: 'schedule',      desc: 'Key dates' },
  { step: 8, label: 'Preview & Pub', icon: 'rocket_launch',  desc: 'Launch' },
]

const STEP_TITLES = [
  'Tournament Basics',
  'Match Logistics',
  'Rewards & Prize Splits',
  'Slot Configuration',
  'Rules & KYC Verification',
  'Media & Cover Branding',
  'Key Dates & Milestones',
  'Form Preview & Publish',
]

const STEP_DESCS = [
  'Fill in the fundamental information about this event.',
  'Configure the server regions and battle mode rules.',
  'Specify rewards and distributions for top placing squads.',
  'Set capacities, VIP slots, and registration charges.',
  'Enforce fairplay requirements and publish the official rulebook.',
  'Select standard graphic covers or host custom assets.',
  'Input key date coordinates. Timers auto-sync accordingly.',
  'Verify how your live tournament details look.',
]

const COORDINATOR_TIPS = [
  'Make your title catchy. Highlight sponsors or specific game modes.',
  'Choose close server regions to minimize ping. Battle Royale is popular for large entry pools.',
  'A higher player payout (90–95%) attracts more registrations and fills slots faster.',
  'Balance entry fees against slot counts. Reserve slots for VIPs & streamers.',
  'Require KYC for cash tournaments to prevent smurfing & duplicate accounts.',
  'Upload high-quality banners (16:9 ratio) to make your event stand out.',
  'Give players at least 3–5 days to register before the tournament starts.',
  'Double-check bracket formats and dates before publishing. Save drafts freely.',
]

const PRESET_BANNERS = [
  { title: 'Cyber Arena',   url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80' },
  { title: 'Neon Lounge',   url: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?auto=format&fit=crop&w=600&q=80' },
  { title: 'Vapor Fire',    url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80' },
  { title: 'Midnight Tech', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80' },
]

// Helper: clean numeric value from ₹ string
const cleanNum = (str) => Number(String(str || '').replace(/[^\d]/g, '')) || 0

export default function TournamentCreationModal({
  // Visibility
  isOpen,
  // Tournament state
  newTourney,
  setNewTourney,
  createStep,
  setCreateStep,
  isEditingExisting,
  saveStatus,
  isUploadingImage,
  // Prize calc state
  isAutoCalculate,
  setIsAutoCalculate,
  payoutPercent,
  setPayoutPercent,
  split1stPercent, setSplit1stPercent,
  split2ndPercent, setSplit2ndPercent,
  split3rdPercent, setSplit3rdPercent,
  splitMvpPercent, setSplitMvpPercent,
  // Handlers
  onClose,
  onSaveDraft,
  onNextStep,
  onPrevStep,
  onPublish,
  onImageUpload,
}) {
  if (!isOpen) return null

  const totalCollection = cleanNum(newTourney.entry) * (Number(newTourney.slotsTotal) || 0)
  const organizerKeep   = Math.round(totalCollection * ((100 - payoutPercent) / 100))
  const splitSum        = Number(split1stPercent) + Number(split2ndPercent) + Number(split3rdPercent) + Number(splitMvpPercent)

  const inputClass = 'w-full bg-[#12131a] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-[#c0c1ff] focus:ring-1 focus:ring-[#c0c1ff]/30 outline-none transition-all placeholder:text-white/25'
  const selectClass = inputClass
  const labelClass  = 'block text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/92 backdrop-blur-xl animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-6xl max-h-[96vh] flex flex-col rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ background: 'linear-gradient(135deg, #0d0e16 0%, #0a0b12 100%)', border: '1px solid rgba(192,193,255,0.12)', boxShadow: '0 40px 120px rgba(0,0,0,0.95), 0 0 0 1px rgba(192,193,255,0.05)' }}
      >

        {/* ──────────── TOP HEADER BAR ──────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(7,8,12,0.7)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(192,193,255,0.1)', border: '1px solid rgba(192,193,255,0.2)' }}>
              <span className="material-symbols-outlined text-[#c0c1ff] text-xl">
                {isEditingExisting ? 'edit_note' : 'add_circle'}
              </span>
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white tracking-tight leading-none">
                {isEditingExisting ? 'Edit Tournament' : 'Tournament Creation Manager'}
              </h3>
              <p className="text-[10px] text-white/40 font-medium mt-0.5">
                Step {createStep} of 8 &mdash; {STEP_TITLES[createStep - 1]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saveStatus && (
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                {saveStatus}
              </div>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <span className="material-symbols-outlined text-white/50 hover:text-white text-base transition-colors">close</span>
            </button>
          </div>
        </div>

        {/* ──────────── MAIN BODY ──────────── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* ─── LEFT SIDEBAR: Step Navigator ─── */}
          <div className="hidden lg:flex flex-col w-52 shrink-0 py-4 px-2.5 gap-0.5 overflow-y-auto" style={{ borderRight: '1px solid rgba(255,255,255,0.06)', background: 'rgba(7,8,12,0.5)' }}>
            {STEPS.map((s) => {
              const isActive = createStep === s.step
              const isDone   = createStep > s.step
              return (
                <button
                  key={s.step}
                  type="button"
                  onClick={async () => { await onSaveDraft(); setCreateStep(s.step) }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 group"
                  style={{
                    background: isActive ? 'rgba(192,193,255,0.1)' : 'transparent',
                    border: isActive ? '1px solid rgba(192,193,255,0.2)' : '1px solid transparent',
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all"
                    style={{
                      background: isActive ? '#c0c1ff' : isDone ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.05)',
                      border: isActive ? 'none' : isDone ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <span className="material-symbols-outlined text-[13px]" style={{ color: isActive ? '#07080C' : isDone ? '#34d399' : 'rgba(255,255,255,0.4)' }}>
                      {isDone ? 'check' : s.icon}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold leading-tight truncate" style={{ color: isActive ? '#c0c1ff' : isDone ? '#34d399' : 'rgba(255,255,255,0.45)' }}>
                      {s.label}
                    </div>
                    <div className="text-[9px] truncate" style={{ color: 'rgba(255,255,255,0.25)' }}>{s.desc}</div>
                  </div>
                </button>
              )
            })}

            {/* Circular Progress Ring */}
            <div className="mt-auto pt-4 px-1 flex flex-col items-center gap-2">
              {(() => {
                const pct = Math.round(((createStep - 1) / 7) * 100)
                const r = 22
                const circ = 2 * Math.PI * r
                const dash = (pct / 100) * circ
                return (
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
                      {/* Track */}
                      <circle
                        cx="32" cy="32" r={r}
                        fill="none"
                        stroke="rgba(255,255,255,0.07)"
                        strokeWidth="4"
                      />
                      {/* Active arc */}
                      <circle
                        cx="32" cy="32" r={r}
                        fill="none"
                        stroke="url(#progGrad)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={`${dash} ${circ}`}
                        style={{ transition: 'stroke-dasharray 0.5s ease' }}
                      />
                      <defs>
                        <linearGradient id="progGrad" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor="#c0c1ff" />
                          <stop offset="100%" stopColor="#a8b4ff" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[11px] font-extrabold text-[#c0c1ff] leading-none">{pct}%</span>
                      <span className="text-[8px] text-white/30 font-bold uppercase tracking-widest leading-none mt-0.5">done</span>
                    </div>
                  </div>
                )
              })()}
              <span className="text-[9px] text-white/25 font-bold uppercase tracking-widest">
                Step {createStep} of 8
              </span>
            </div>
          </div>

          {/* ─── MOBILE: Compact Step Pills ─── */}
          <div className="lg:hidden absolute top-[57px] left-0 right-0 z-10 px-4 py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(7,8,12,0.9)', backdropFilter: 'blur(12px)' }}>
            {STEPS.map((s) => (
              <button
                key={s.step}
                onClick={async () => { await onSaveDraft(); setCreateStep(s.step) }}
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all"
                style={{
                  background: createStep === s.step ? '#c0c1ff' : createStep > s.step ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)',
                  border: createStep === s.step ? 'none' : createStep > s.step ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(255,255,255,0.1)',
                  color: createStep === s.step ? '#07080C' : createStep > s.step ? '#34d399' : 'rgba(255,255,255,0.4)',
                }}
              >
                {createStep > s.step ? <span className="material-symbols-outlined text-[12px]">check</span> : s.step}
              </button>
            ))}
          </div>

          {/* ─── CENTER: Main Form Content ─── */}
          <div className="flex-1 overflow-y-auto lg:pt-0 pt-12" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(192,193,255,0.2) transparent' }}>
            <div className="p-6 lg:p-8 max-w-2xl mx-auto space-y-6">

              {/* Step label */}
              <div className="space-y-1.5">
                <span
                  className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest"
                  style={{ background: 'rgba(192,193,255,0.1)', border: '1px solid rgba(192,193,255,0.2)', color: '#c0c1ff' }}
                >
                  Step {createStep} / 8
                </span>
                <h4 className="text-xl font-extrabold text-white tracking-tight">{STEP_TITLES[createStep - 1]}</h4>
                <p className="text-xs text-white/40">{STEP_DESCS[createStep - 1]}</p>
              </div>

              {/* ────────── STEP 1: Basic Details ────────── */}
              {createStep === 1 && (
                <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div>
                    <label className={labelClass}>Tournament Title *</label>
                    <input
                      type="text" required
                      value={newTourney.title}
                      onChange={(e) => setNewTourney({ ...newTourney, title: e.target.value })}
                      placeholder="e.g. BGMI Apex Masters 2025"
                      className={inputClass}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Game Title *</label>
                      <select value={newTourney.game} onChange={(e) => setNewTourney({ ...newTourney, game: e.target.value })} className={selectClass}>
                        <option value="BGMI">BGMI</option>
                        <option value="VALORANT">Valorant</option>
                        <option value="CS2">CS2</option>
                        <option value="FREE FIRE">Free Fire</option>
                        <option value="APEX LEGENDS">Apex Legends</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Organizer Brand Name *</label>
                      <input
                        type="text" required
                        value={newTourney.orgName || ''}
                        onChange={(e) => setNewTourney({ ...newTourney, orgName: e.target.value })}
                        placeholder="Your org / team name"
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ────────── STEP 2: Match Settings ────────── */}
              {createStep === 2 && (
                <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Match Mode</label>
                      <select value={newTourney.format} onChange={(e) => setNewTourney({ ...newTourney, format: e.target.value })} className={selectClass}>
                        <option value="Battle Royale">Battle Royale</option>
                        <option value="Squad (5v5)">Squad (5v5)</option>
                        <option value="Squad (4v4)">Squad (4v4)</option>
                        <option value="Duo (2v2)">Duo (2v2)</option>
                        <option value="Solo (1v1)">Solo (1v1)</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Server Region</label>
                      <select value={newTourney.region} onChange={(e) => setNewTourney({ ...newTourney, region: e.target.value })} className={selectClass}>
                        <option value="Mumbai">Mumbai (India)</option>
                        <option value="Delhi">Delhi (India)</option>
                        <option value="Singapore">Singapore (SEA)</option>
                        <option value="Frankfurt">Frankfurt (Europe)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* ────────── STEP 3: Prize Pool ────────── */}
              {createStep === 3 && (
                <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Hero prize display */}
                  <div className="rounded-2xl p-5 text-center space-y-2" style={{ background: 'rgba(192,193,255,0.05)', border: '1px solid rgba(192,193,255,0.15)' }}>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Auto-Calculated Prize Pool</p>
                    <div className="text-4xl font-extrabold tracking-tight" style={{ color: '#c0c1ff' }}>
                      {newTourney.prize || '₹0'}
                    </div>
                    {!isAutoCalculate && (
                      <input
                        type="text"
                        value={newTourney.prize}
                        onChange={(e) => setNewTourney({ ...newTourney, prize: e.target.value })}
                        placeholder="e.g. ₹25,00,000"
                        className={inputClass + ' mt-2 text-center'}
                      />
                    )}
                  </div>

                  {/* Payout configuration */}
                  <div className="space-y-4 p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-white/70">Auto-Calculate Prize</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={isAutoCalculate} onChange={(e) => setIsAutoCalculate(e.target.checked)} className="sr-only peer" />
                        <div className="w-9 h-5 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#c0c1ff]" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}></div>
                      </label>
                    </div>

                    {isAutoCalculate && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between text-[10px] font-medium">
                            <span className="text-white/40">Player Payout %</span>
                            <span className="font-bold" style={{ color: '#c0c1ff' }}>{payoutPercent}% → Organizer keeps {100 - payoutPercent}%</span>
                          </div>
                          <input type="range" min="50" max="100" step="5" value={payoutPercent} onChange={(e) => setPayoutPercent(parseInt(e.target.value))} className="w-full h-1.5 cursor-pointer rounded-full accent-[#c0c1ff]" />
                        </div>

                        <div className="space-y-1">
                          <p className="text-[10px] text-white/30 uppercase tracking-widest font-bold">Reward Allocation Splits</p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { label: '🥇 1st', value: split1stPercent, setter: setSplit1stPercent, color: '#fbbf24' },
                            { label: '🥈 2nd', value: split2ndPercent, setter: setSplit2ndPercent, color: '#94a3b8' },
                            { label: '🥉 3rd', value: split3rdPercent, setter: setSplit3rdPercent, color: '#d97706' },
                            { label: '🏅 MVP', value: splitMvpPercent, setter: setSplitMvpPercent, color: '#c0c1ff' },
                          ].map(({ label, value, setter, color }) => (
                            <div key={label} className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                              <div className="flex justify-between text-[9px]">
                                <span className="text-white/40">{label}</span>
                                <span className="font-bold" style={{ color }}>{value}%</span>
                              </div>
                              <input type="range" min="0" max="100" step="5" value={value} onChange={(e) => setter(parseInt(e.target.value))} className="w-full h-0.5 cursor-pointer rounded-full" style={{ accentColor: color }} />
                            </div>
                          ))}
                        </div>

                        {splitSum !== 100 && (
                          <div className="flex items-center gap-2 p-2.5 rounded-lg text-[10px] font-medium" style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', color: '#fb7185' }}>
                            <span className="material-symbols-outlined text-[14px]">warning</span>
                            Splits must total 100% (currently: {splitSum}%)
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Individual payout display fields */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: '🥇 1st Place', key: 'prizeSplit1st' },
                      { label: '🥈 2nd Place', key: 'prizeSplit2nd' },
                      { label: '🥉 3rd Place', key: 'prizeSplit3rd' },
                      { label: '🏅 MVP Award', key: 'prizeSplitMvp' },
                    ].map(({ label, key }) => (
                      <div key={key}>
                        <label className={labelClass}>{label}</label>
                        <input type="text" value={newTourney[key] || ''} onChange={(e) => setNewTourney({ ...newTourney, [key]: e.target.value })} disabled={isAutoCalculate} className={inputClass + ' disabled:opacity-50'} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ────────── STEP 4: Slot Configuration ────────── */}
              {createStep === 4 && (
                <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className={labelClass}>Total Slot Count *</label>
                      <input type="number" required value={newTourney.slotsTotal} onChange={(e) => setNewTourney({ ...newTourney, slotsTotal: parseInt(e.target.value) || 64 })} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Reserved VIP Slots</label>
                      <input type="number" value={newTourney.slotsReserved} onChange={(e) => setNewTourney({ ...newTourney, slotsReserved: parseInt(e.target.value) || 0 })} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Entry Fee *</label>
                      <input type="text" required value={newTourney.entry} onChange={(e) => setNewTourney({ ...newTourney, entry: e.target.value })} placeholder="e.g. ₹500 or FREE" className={inputClass} />
                    </div>
                  </div>

                  {/* Slot summary cards */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Public Slots',  value: Math.max(0, (newTourney.slotsTotal || 0) - (newTourney.slotsReserved || 0)), color: '#c0c1ff' },
                      { label: 'VIP Reserved',  value: newTourney.slotsReserved || 0, color: '#fbbf24' },
                      { label: 'Max Revenue',   value: `₹${totalCollection.toLocaleString('en-IN')}`, color: '#34d399' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="text-xl font-extrabold" style={{ color }}>{value}</div>
                        <div className="text-[9px] text-white/30 uppercase tracking-widest mt-1 font-bold">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ────────── STEP 5: Rules & KYC ────────── */}
              {createStep === 5 && (
                <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { key: 'kycRequired',       icon: 'badge',                   label: 'KYC Verified',    desc: 'Require player ID checks' },
                      { key: 'emulatorBanned',    icon: 'desktop_access_disabled', label: 'Emulator Ban',    desc: 'Block PCs & emulators' },
                      { key: 'antiCheatRequired', icon: 'security',                label: 'Anti-Cheat Scan', desc: 'Enable memory telemetry' },
                    ].map(({ key, icon, label, desc }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setNewTourney((p) => ({ ...p, [key]: !p[key] }))}
                        className="p-4 rounded-xl text-left transition-all"
                        style={{
                          background: newTourney[key] ? 'rgba(192,193,255,0.08)' : 'rgba(255,255,255,0.03)',
                          border: newTourney[key] ? '1px solid rgba(192,193,255,0.25)' : '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-base" style={{ color: newTourney[key] ? '#c0c1ff' : 'rgba(255,255,255,0.3)' }}>{icon}</span>
                              <span className="text-xs font-bold" style={{ color: newTourney[key] ? 'white' : 'rgba(255,255,255,0.5)' }}>{label}</span>
                            </div>
                            <p className="text-[10px] text-white/30">{desc}</p>
                          </div>
                          <div className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-all" style={{ background: newTourney[key] ? '#c0c1ff' : 'transparent', borderColor: newTourney[key] ? '#c0c1ff' : 'rgba(255,255,255,0.15)' }}>
                            {newTourney[key] && <span className="material-symbols-outlined text-[11px]" style={{ color: '#07080C' }}>check</span>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className={labelClass}>Official Rules & Guidelines</label>
                    <textarea
                      rows="7"
                      value={newTourney.rules}
                      onChange={(e) => setNewTourney({ ...newTourney, rules: e.target.value })}
                      placeholder="Write your rulebook here (Markdown supported)..."
                      className={inputClass + ' resize-none'}
                    />
                  </div>
                </div>
              )}

              {/* ────────── STEP 6: Media & Branding ────────── */}
              {createStep === 6 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div>
                    <label className={labelClass}>Select Preset Tournament Cover</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {PRESET_BANNERS.map((preset) => (
                        <button
                          key={preset.title}
                          type="button"
                          onClick={() => setNewTourney({ ...newTourney, bannerUrl: preset.url })}
                          className="group rounded-xl overflow-hidden relative h-24 transition-all"
                          style={{
                            border: newTourney.bannerUrl === preset.url ? '2px solid #c0c1ff' : '1px solid rgba(255,255,255,0.1)',
                            transform: newTourney.bannerUrl === preset.url ? 'scale(1.02)' : 'scale(1)',
                          }}
                        >
                          <img src={preset.url} alt={preset.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          <div className="absolute inset-0 flex items-end p-2" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)' }}>
                            <span className="text-[9px] font-bold tracking-wider uppercase text-white">{preset.title}</span>
                          </div>
                          {newTourney.bannerUrl === preset.url && (
                            <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#c0c1ff' }}>
                              <span className="material-symbols-outlined text-[11px]" style={{ color: '#07080C' }}>check</span>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {[
                      { label: 'Tournament Cover Banner', urlKey: 'bannerUrl', fit: 'object-cover',   icon: 'image' },
                      { label: 'Organizer Logo',          urlKey: 'logoUrl',   fit: 'object-contain', icon: 'business_center' },
                    ].map(({ label, urlKey, fit, icon }) => (
                      <div key={urlKey}>
                        <label className={labelClass}>{label}</label>
                        <div className="relative w-full h-36 rounded-xl overflow-hidden flex items-center justify-center group" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
                          {newTourney[urlKey] ? (
                            <img src={newTourney[urlKey]} alt={label} className={`w-full h-full ${fit}`} />
                          ) : (
                            <span className="material-symbols-outlined text-4xl" style={{ color: 'rgba(255,255,255,0.15)' }}>{icon}</span>
                          )}
                          <label className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-opacity opacity-0 group-hover:opacity-100" style={{ background: 'rgba(0,0,0,0.75)' }}>
                            <span className="material-symbols-outlined text-white text-2xl">cloud_upload</span>
                            <span className="text-[10px] text-white font-bold uppercase tracking-wider">Upload</span>
                            <input
                              type="file" accept="image/*" className="hidden"
                              disabled={isUploadingImage}
                              onChange={async (e) => {
                                const file = e.target.files[0]
                                if (file) {
                                  const url = await onImageUpload(file)
                                  if (url) setNewTourney((prev) => ({ ...prev, [urlKey]: url }))
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ────────── STEP 7: Timeline ────────── */}
              {createStep === 7 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[
                      { label: 'Registration Opens',         key: 'registrationOpenDate',  accent: false },
                      { label: 'Registration Closes',        key: 'registrationCloseDate', accent: false },
                      { label: '🚀 Match Kickoff Start Time', key: 'startDate',             accent: true  },
                    ].map(({ label, key, accent }) => (
                      <div key={key}>
                        <label className={labelClass} style={{ color: accent ? '#c0c1ff' : undefined }}>{label}</label>
                        <input
                          type="datetime-local"
                          value={newTourney[key]}
                          onChange={(e) => setNewTourney({ ...newTourney, [key]: e.target.value })}
                          className={inputClass}
                          style={{ borderColor: accent ? 'rgba(192,193,255,0.3)' : undefined }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Visual timeline */}
                  <div className="space-y-3 pl-8 relative">
                    <div className="absolute left-3 top-2 bottom-2 w-px" style={{ background: 'rgba(255,255,255,0.08)' }}></div>
                    {[
                      { label: 'Registration Open',    date: newTourney.registrationOpenDate,  color: '#34d399', icon: 'how_to_reg' },
                      { label: 'Registration Close',   date: newTourney.registrationCloseDate, color: '#fbbf24', icon: 'event_busy' },
                      { label: 'Tournament Kick-Off', date: newTourney.startDate,              color: '#c0c1ff', icon: 'sports_esports' },
                    ].map(({ label, date, color, icon }) => (
                      <div key={label} className="relative flex items-center gap-3">
                        <div className="absolute -left-8 w-6 h-6 rounded-full flex items-center justify-center shadow-lg" style={{ background: color }}>
                          <span className="material-symbols-outlined text-[11px] text-white">{icon}</span>
                        </div>
                        <div className="flex-1 flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <span className="text-[11px] font-semibold text-white">{label}</span>
                          <span className="text-[10px] text-white/40">{date ? formatDateTime(date) : 'Not set'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ────────── STEP 8: Preview & Publish ────────── */}
              {createStep === 8 && (
                <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {isEditingExisting && !newTourney.isDraft && (
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                      <span className="material-symbols-outlined text-base" style={{ color: '#fbbf24' }}>warning</span>
                      <span className="text-[11px] font-semibold" style={{ color: '#fbbf24' }}>Changes have not been published yet.</span>
                    </div>
                  )}

                  {/* Preview card */}
                  <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div className="h-44 w-full relative">
                      <img src={newTourney.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #07080C 0%, rgba(7,8,12,0.4) 50%, transparent 100%)' }}></div>
                      <div className="absolute bottom-4 left-4 flex items-center gap-3">
                        <div className="w-14 h-14 rounded-xl overflow-hidden p-1.5 shrink-0" style={{ background: 'rgba(7,8,12,0.8)', border: '1px solid rgba(255,255,255,0.15)' }}>
                          <img src={newTourney.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                        </div>
                        <div>
                          <span className="inline-flex px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase" style={{ background: 'rgba(192,193,255,0.15)', border: '1px solid rgba(192,193,255,0.2)', color: '#c0c1ff' }}>{newTourney.game}</span>
                          <h4 className="text-sm font-extrabold text-white pt-0.5 truncate max-w-xs">{newTourney.title || 'Untitled Battle Arena'}</h4>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4" style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                      {[
                        { label: 'Prize Pool', value: newTourney.prize, color: '#c0c1ff' },
                        { label: 'Entry Fee', value: newTourney.entry, color: 'white' },
                        { label: 'Total Slots', value: `${newTourney.slotsTotal} Squads`, color: 'white' },
                        { label: 'Kick-Off', value: newTourney.startDate ? formatDate(newTourney.startDate) : 'Pending', color: '#34d399' },
                      ].map(({ label, value, color }) => (
                        <div key={label}>
                          <div className="text-[9px] text-white/30 uppercase tracking-widest font-bold">{label}</div>
                          <div className="text-sm font-extrabold mt-0.5" style={{ color }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: 'rgba(192,193,255,0.04)', border: '1px solid rgba(192,193,255,0.12)' }}>
                    <span className="material-symbols-outlined text-xl shrink-0 mt-0.5" style={{ color: '#c0c1ff' }}>verified_user</span>
                    <div>
                      <h5 className="text-xs font-bold uppercase tracking-wide" style={{ color: '#c0c1ff' }}>Anti-Cheat & KYC Ready</h5>
                      <p className="text-[11px] text-white/40 leading-relaxed mt-1">
                        By publishing this event, you verify that a secure prize pool of <strong style={{ color: '#c0c1ff' }}>{newTourney.prize}</strong> has been committed. Players must comply with active anti-cheat hardware telemetry.
                      </p>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* ─── RIGHT SIDEBAR: Co-Pilot Panel ─── */}
          <div className="hidden xl:flex flex-col w-60 shrink-0 overflow-y-auto" style={{ borderLeft: '1px solid rgba(255,255,255,0.06)', background: 'rgba(7,8,12,0.5)', scrollbarWidth: 'thin', scrollbarColor: 'rgba(192,193,255,0.15) transparent' }}>
            <div className="p-4 space-y-5">

              {/* Header */}
              <div className="flex items-center justify-between pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg" style={{ color: '#c0c1ff' }}>smart_toy</span>
                  <span className="text-xs font-bold text-white uppercase tracking-wider">Co-Pilot</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">Live</span>
                </div>
              </div>

              {/* Live Cashflow */}
              <div className="space-y-2">
                <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold">Live Cashflow</p>
                <div className="space-y-1.5">
                  {[
                    { label: 'Total Slots',      value: `${newTourney.slotsTotal} squads`,                                     color: 'rgba(255,255,255,0.7)' },
                    { label: 'Entry Fee',         value: newTourney.entry,                                                       color: 'rgba(255,255,255,0.7)' },
                    { label: 'Total Collection', value: `₹${totalCollection.toLocaleString('en-IN')}`,                         color: 'white' },
                    { label: 'Prize Pool',        value: newTourney.prize,                                                       color: '#c0c1ff' },
                    { label: 'Org Keep',          value: `₹${organizerKeep.toLocaleString('en-IN')}`,                          color: '#34d399' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex justify-between py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span className="text-[10px] text-white/30">{label}</span>
                      <span className="text-[10px] font-semibold" style={{ color }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Auto-Calc compact sliders */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-white/40">Auto-Calc Prize</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={isAutoCalculate} onChange={(e) => setIsAutoCalculate(e.target.checked)} className="sr-only peer" />
                    <div className="w-7 h-4 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#c0c1ff]" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}></div>
                  </label>
                </div>
                {isAutoCalculate && (
                  <div className="space-y-2">
                    {[
                      { label: 'Payout %', value: payoutPercent, setter: setPayoutPercent, min: 50, max: 100, color: '#c0c1ff' },
                      { label: '1st',      value: split1stPercent, setter: setSplit1stPercent, min: 0, max: 100, color: '#fbbf24' },
                      { label: '2nd',      value: split2ndPercent, setter: setSplit2ndPercent, min: 0, max: 100, color: '#94a3b8' },
                      { label: '3rd',      value: split3rdPercent, setter: setSplit3rdPercent, min: 0, max: 100, color: '#d97706' },
                      { label: 'MVP',      value: splitMvpPercent, setter: setSplitMvpPercent, min: 0, max: 100, color: '#c0c1ff' },
                    ].map(({ label, value, setter, min, max, color }) => (
                      <div key={label} className="space-y-0.5">
                        <div className="flex justify-between text-[9px]">
                          <span className="text-white/30">{label}</span>
                          <span className="font-bold" style={{ color }}>{value}%</span>
                        </div>
                        <input type="range" min={min} max={max} step="5" value={value} onChange={(e) => setter(parseInt(e.target.value))} className="w-full h-0.5 cursor-pointer rounded-full" style={{ accentColor: color }} />
                      </div>
                    ))}
                    {splitSum !== 100 && (
                      <p className="text-[9px] font-medium" style={{ color: '#fb7185' }}>⚠ Splits must = 100%</p>
                    )}
                  </div>
                )}
              </div>

              {/* Contextual tip */}
              <div className="p-3 rounded-xl space-y-1.5" style={{ background: 'rgba(192,193,255,0.04)', border: '1px solid rgba(192,193,255,0.1)' }}>
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[13px]" style={{ color: '#c0c1ff' }}>tips_and_updates</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#c0c1ff' }}>Coordinator Tip</span>
                </div>
                <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  {COORDINATOR_TIPS[createStep - 1]}
                </p>
              </div>

            </div>
          </div>

        </div>

        {/* ──────────── FOOTER: Navigation ──────────── */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 shrink-0 gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: 'rgba(7,8,12,0.7)' }}>
          <button
            type="button" onClick={onPrevStep} disabled={createStep === 1}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-25 disabled:pointer-events-none"
            style={{ border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)' }}
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Previous
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button" onClick={onSaveDraft}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all"
              style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.04)' }}
            >
              Save Draft
            </button>

            {createStep < 8 ? (
              <button
                type="button" onClick={onNextStep}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold transition-all"
                style={{ background: '#c0c1ff', color: '#07080C', boxShadow: '0 0 20px rgba(192,193,255,0.3)' }}
              >
                Next Step
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            ) : (
              <button
                type="button" onClick={onPublish}
                className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-extrabold transition-all"
                style={{ background: 'linear-gradient(135deg, #c0c1ff, #a5b4fc)', color: '#07080C', boxShadow: '0 0 30px rgba(192,193,255,0.4)' }}
              >
                <span className="material-symbols-outlined text-[16px]">rocket_launch</span>
                Publish Arena Live
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
