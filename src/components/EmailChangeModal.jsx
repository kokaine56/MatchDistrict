import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAuthToken } from '../utils/getAuthToken.js';

export default function EmailChangeModal({ isOpen, onClose, currentEmail, onSuccess, triggerToast }) {
  const [step, setStep] = useState('init'); // 'init' | 'old_code_sent' | 'old_verified' | 'new_code_sent'
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Form states
  const [oldCode, setOldCode] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newCode, setNewCode] = useState('');
  
  // Cooldowns and Lockout
  const [resendCooldown, setResendCooldown] = useState(0);
  const [cooldownDays, setCooldownDays] = useState(0);
  const [lockoutMsg, setLockoutMsg] = useState('');

  // Fetch email change status on open
  useEffect(() => {
    if (!isOpen) {
      setStep('init');
      setError('');
      setOldCode('');
      setNewEmail('');
      setNewCode('');
      setLockoutMsg('');
      return;
    }

    let isMounted = true;
    async function checkStatus() {
      setStatusLoading(true);
      setError('');
      try {
        const token = await getAuthToken();
        const res = await fetch('/api/account/email-change/status', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!isMounted) return;

        if (data.cooldownRemainingDays > 0) {
          setCooldownDays(data.cooldownRemainingDays);
        } else {
          setCooldownDays(0);
        }

        if (data.lockedUntil) {
          setLockoutMsg(`Account security timeout active until ${data.lockTimeIst || 'later'} IST.`);
        }

        if (data.step === 'old_verified') {
          setStep('old_verified');
        }
      } catch (err) {
        if (isMounted) setError('Failed to load email security status.');
      } finally {
        if (isMounted) setStatusLoading(false);
      }
    }

    checkStatus();
    return () => { isMounted = false; };
  }, [isOpen]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // 1. Send code to current email
  const handleStart = async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/account/email-change/start', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.error === 'LOCKED') {
          setLockoutMsg(data.message);
        } else {
          setError(data.message || 'Failed to send verification code.');
        }
        return;
      }
      setStep('old_code_sent');
      setResendCooldown(60);
      triggerToast('Verification code sent to current email.');
    } catch {
      setError('Network error sending code.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Verify code for current email
  const handleVerifyOld = async () => {
    if (!/^\d{6}$/.test(oldCode.trim())) {
      setError('Please enter the 6-digit code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/account/email-change/verify-old', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: oldCode.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.error === 'LOCKED') setLockoutMsg(data.message);
        else setError(data.message || 'Verification failed.');
        return;
      }
      setStep('old_verified');
      setResendCooldown(0);
      triggerToast('Current email verified. Enter new email.');
    } catch {
      setError('Network error verifying code.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Send code to new email
  const handleSendNew = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setError('Enter a valid new email address.');
      return;
    }
    if (trimmed === (currentEmail || '').trim().toLowerCase()) {
      setError('New email must be different from current email.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/account/email-change/send-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newEmail: trimmed })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.error === 'LOCKED') setLockoutMsg(data.message);
        else setError(data.message || 'Failed to send code to new email.');
        return;
      }
      setStep('new_code_sent');
      setResendCooldown(60);
      triggerToast(`Code sent to ${trimmed}`);
    } catch {
      setError('Network error sending code.');
    } finally {
      setLoading(false);
    }
  };

  // 4. Confirm new email code
  const handleConfirm = async () => {
    if (!/^\d{6}$/.test(newCode.trim())) {
      setError('Please enter the 6-digit code sent to your new email.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/account/email-change/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: newCode.trim() })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.error === 'LOCKED') setLockoutMsg(data.message);
        else setError(data.message || 'Confirmation failed.');
        return;
      }
      triggerToast('Email updated successfully!');
      if (onSuccess) onSuccess(newEmail.trim().toLowerCase());
      onClose();
    } catch {
      setError('Network error confirming email change.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="w-full max-w-md bg-white dark:bg-[#121520] border-t sm:border border-outline-variant/50 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl relative max-h-[85vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+20px)] sm:pb-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-outline-variant/30">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl">mark_email_read</span>
              <h3 className="font-headline-md text-base sm:text-lg font-bold text-on-background">
                Change Email Address
              </h3>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-variant flex items-center justify-center text-on-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          <div className="py-4 space-y-4">
            {/* Lockout banner */}
            {lockoutMsg && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5">
                <span className="material-symbols-outlined text-rose-400 text-lg shrink-0 mt-0.5">lock_clock</span>
                <p className="text-xs text-rose-300 leading-relaxed font-medium">{lockoutMsg}</p>
              </div>
            )}

            {/* 15-day cooldown banner */}
            {!lockoutMsg && cooldownDays > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
                <span className="material-symbols-outlined text-amber-400 text-lg shrink-0 mt-0.5">schedule</span>
                <p className="text-xs text-amber-300 leading-relaxed">
                  Email was recently changed. You can change it again in <strong>{cooldownDays} days</strong>.
                </p>
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-base">error</span>
                <span>{error}</span>
              </div>
            )}

            {!lockoutMsg && cooldownDays === 0 && !statusLoading && (
              <>
                {/* Step indicator */}
                <div className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    step === 'old_verified' || step === 'new_code_sent' ? 'bg-emerald-500 text-white' : 'bg-primary text-white'
                  }`}>
                    {step === 'old_verified' || step === 'new_code_sent' ? '✓' : '1'}
                  </span>
                  <span className={step === 'init' || step === 'old_code_sent' ? 'text-on-background font-bold' : ''}>
                    Verify Current
                  </span>
                  <span className="text-outline-variant">→</span>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    step === 'old_verified' || step === 'new_code_sent' ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'
                  }`}>
                    2
                  </span>
                  <span className={step === 'old_verified' || step === 'new_code_sent' ? 'text-on-background font-bold' : ''}>
                    Verify New
                  </span>
                </div>

                {/* STEP 1: Current Email Code */}
                {(step === 'init' || step === 'old_code_sent') && (
                  <div className="space-y-3.5 pt-1">
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      To keep your account secure, we first need to send a 6-digit verification code to your current email:
                    </p>
                    <div className="p-3 rounded-xl bg-surface-container/60 border border-outline-variant/30 text-xs font-mono font-bold text-on-background truncate">
                      {currentEmail}
                    </div>

                    {step === 'init' ? (
                      <button
                        type="button"
                        onClick={handleStart}
                        disabled={loading}
                        className="w-full sm:w-auto px-6 h-10 rounded-full bg-primary hover:bg-primary/90 text-white font-headline-md text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                      >
                        {loading ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-sm">send</span>}
                        Send Verification Code
                      </button>
                    ) : (
                      <div className="space-y-3 pt-1">
                        <div>
                          <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                            Enter 6-digit Code
                          </label>
                          <input
                            type="text"
                            maxLength={6}
                            value={oldCode}
                            onChange={(e) => setOldCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="123456"
                            className="w-full h-11 px-4 rounded-xl bg-surface-container border border-outline-variant text-center font-mono text-lg font-bold tracking-widest text-on-background outline-none focus:border-primary"
                          />
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                          <button
                            type="button"
                            disabled={resendCooldown > 0 || loading}
                            onClick={handleStart}
                            className="text-xs text-primary hover:underline font-semibold disabled:text-on-surface-variant/50"
                          >
                            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                          </button>
                          <button
                            type="button"
                            onClick={handleVerifyOld}
                            disabled={loading || oldCode.length !== 6}
                            className="w-full sm:w-auto px-6 h-10 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-headline-md text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                          >
                            {loading ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-sm">check</span>}
                            Verify Code
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* STEP 2: New Email Code */}
                {(step === 'old_verified' || step === 'new_code_sent') && (
                  <div className="space-y-3.5 pt-1">
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      Now enter your new email address. We will send a confirmation code to finalize the update:
                    </p>
                    <div>
                      <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                        New Email Address
                      </label>
                      <input
                        type="email"
                        disabled={step === 'new_code_sent' && loading}
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="newemail@domain.com"
                        className="w-full h-10 px-3.5 rounded-xl bg-surface-container border border-outline-variant text-xs text-on-background outline-none focus:border-primary"
                      />
                    </div>

                    {step === 'old_verified' ? (
                      <button
                        type="button"
                        onClick={handleSendNew}
                        disabled={loading || !newEmail.trim()}
                        className="w-full sm:w-auto px-6 h-10 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-headline-md text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                      >
                        {loading ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-sm">send</span>}
                        Send Code to New Email
                      </button>
                    ) : (
                      <div className="space-y-3 pt-1">
                        <div>
                          <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-1">
                            Enter Code Sent to New Email
                          </label>
                          <input
                            type="text"
                            maxLength={6}
                            value={newCode}
                            onChange={(e) => setNewCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="654321"
                            className="w-full h-11 px-4 rounded-xl bg-surface-container border border-outline-variant text-center font-mono text-lg font-bold tracking-widest text-on-background outline-none focus:border-primary"
                          />
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                          <button
                            type="button"
                            disabled={resendCooldown > 0 || loading}
                            onClick={handleSendNew}
                            className="text-xs text-primary hover:underline font-semibold disabled:text-on-surface-variant/50"
                          >
                            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
                          </button>
                          <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={loading || newCode.length !== 6}
                            className="w-full sm:w-auto px-6 h-10 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-headline-md text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                          >
                            {loading ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-sm">verified</span>}
                            Confirm &amp; Update
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
