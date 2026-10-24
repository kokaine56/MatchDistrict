import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAuthToken } from '../utils/getAuthToken.js';

function cleanWhatsAppInput(input) {
  if (!input) return '';
  let digits = String(input).replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length > 10) {
    digits = digits.slice(2);
  } else if (digits === '91') {
    digits = '';
  } else if (digits.startsWith('0')) {
    digits = digits.replace(/^0+/, '');
  }
  return digits.slice(0, 10);
}

export default function ProfileEditFieldModal({
  isOpen,
  onClose,
  fieldType, // 'whatsapp' | 'upi'
  initialValue,
  userId,
  onSuccess,
  triggerToast,
}) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const titles = {
    whatsapp: 'WhatsApp Mobile Number',
    upi: 'Prize Payout UPI ID',
  };

  useEffect(() => {
    if (isOpen) {
      if (fieldType === 'whatsapp') {
        setValue(cleanWhatsAppInput(initialValue));
      } else if (fieldType === 'upi') {
        setValue(String(initialValue || '').trim().toLowerCase());
      } else {
        setValue(initialValue || '');
      }
      setError('');
    }
  }, [isOpen, fieldType, initialValue]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setError('');

    if (fieldType === 'whatsapp') {
      const digits = cleanWhatsAppInput(value);
      if (!digits) {
        setError('Please enter a 10-digit mobile number.');
        return;
      }
      if (!/^[6-9]\d{9}$/.test(digits)) {
        setError('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
        return;
      }

      setLoading(true);
      try {
        const token = await getAuthToken();
        const res = await fetch(`/api/users/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ phone: `+91 ${digits}` }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          setError(data.message || 'Failed to update WhatsApp number.');
          return;
        }
        triggerToast('WhatsApp number updated.');
        if (onSuccess) onSuccess(data.user);
        onClose();
      } catch {
        setError('Network error updating profile.');
      } finally {
        setLoading(false);
      }
    } else if (fieldType === 'upi') {
      const trimmed = value.trim().toLowerCase();
      if (!trimmed) {
        setError('Please enter your UPI ID.');
        return;
      }
      if (!/^[a-zA-Z0-9._-]+@[a-zA-Z]+$/.test(trimmed)) {
        setError('Invalid format. Enter a valid UPI ID (e.g. name@bank).');
        return;
      }

      setLoading(true);
      try {
        const token = await getAuthToken();
        const res = await fetch('/api/users/me/payout-profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ upi_id: trimmed }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          setError(data.message || 'Failed to save UPI ID.');
          return;
        }
        triggerToast('UPI ID saved for prize payouts.');
        if (onSuccess) onSuccess(data.payout_profile?.upi_id || trimmed);
        onClose();
      } catch {
        setError('Network error saving payout profile.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="w-full max-w-md bg-white dark:bg-[#121520] border-t sm:border border-outline-variant/50 rounded-t-3xl sm:rounded-2xl shadow-2xl relative max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 pb-3 border-b border-outline-variant/30 shrink-0">
            <h3 className="font-headline-md text-base sm:text-lg font-bold text-on-background">
              {titles[fieldType] || 'Edit Field'}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-variant flex items-center justify-center text-on-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto p-5 py-4 space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium flex items-center gap-2">
                  <span className="material-symbols-outlined text-base shrink-0">error</span>
                  <span>{error}</span>
                </div>
              )}

              {fieldType === 'whatsapp' ? (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                    10-Digit Mobile Number
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="h-10 px-3 flex items-center justify-center rounded-xl bg-surface-container border border-outline-variant text-xs font-bold text-on-surface-variant select-none shrink-0">
                      🇮🇳 +91
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={value}
                      onChange={(e) => setValue(cleanWhatsAppInput(e.target.value))}
                      placeholder="9876543210"
                      autoFocus
                      className="flex-1 h-10 px-3.5 rounded-xl bg-surface-container border border-outline-variant text-xs font-semibold text-on-background outline-none focus:border-primary tracking-wide"
                    />
                  </div>
                  <p className="text-[10px] text-on-surface-variant/70 leading-relaxed">
                    Used for urgent tournament updates and match calls. Must be 10 digits starting with 6, 7, 8, or 9.
                  </p>
                </div>
              ) : fieldType === 'upi' ? (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                    UPI ID (name@bank)
                  </label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    placeholder="yourname@okaxis"
                    autoFocus
                    autoCapitalize="none"
                    autoComplete="off"
                    spellCheck="false"
                    className="w-full h-10 px-3.5 rounded-xl bg-surface-container border border-outline-variant text-xs font-semibold text-on-background outline-none focus:border-primary font-mono lowercase"
                  />
                  <p className="text-[10px] text-on-surface-variant/70 leading-relaxed">
                    Used to send your tournament prize payouts.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Bottom buttons pinned with safe area padding */}
            <div className="p-5 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] border-t border-outline-variant/20 flex items-center justify-end gap-2.5 shrink-0 bg-inherit">
              <button
                type="button"
                onClick={onClose}
                className="px-4 h-9 rounded-full border border-outline-variant/60 text-xs font-semibold text-on-background hover:bg-surface-variant transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 h-9 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-headline-md text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                {loading ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-sm">check</span>}
                Save
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
