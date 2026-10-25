import React, { useState, useEffect } from 'react';
import BottomSheetModal from './BottomSheetModal.jsx';
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

  const icons = {
    whatsapp: 'chat',
    upi: 'account_balance_wallet',
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
        setError('Enter a valid 10-digit mobile number.');
        return;
      }
      if (!/^[6-9]\d{9}$/.test(digits)) {
        setError('Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
        return;
      }

      setLoading(true);
      try {
        const token = await getAuthToken();
        const targetUserId = userId || 'me';
        const res = await fetch(`/api/users/${targetUserId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token && token !== 'null' ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({ phone: `+91 ${digits}` }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          setError(
            data.message ||
            data.error ||
            (res.status === 401 ? 'Please sign in to update your WhatsApp number.' : 'Could not save, please try again.')
          );
          return;
        }

        triggerToast?.('WhatsApp number updated.');
        if (onSuccess) {
          onSuccess(data.user || { phone: `+91 ${digits}` });
        }
        onClose();
      } catch {
        setError('Could not save, please try again.');
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
        setError('Enter a valid UPI ID (e.g. name@bank).');
        return;
      }

      setLoading(true);
      try {
        const token = await getAuthToken();
        const res = await fetch('/api/users/me/payout-profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token && token !== 'null' ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({ upi_id: trimmed }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          setError(
            data.message ||
            data.error ||
            (res.status === 401 ? 'Please sign in to save UPI ID.' : 'Could not save, please try again.')
          );
          return;
        }

        triggerToast?.('UPI ID saved for prize payouts.');
        const updatedUpi = data.payout_profile?.upi_id || trimmed;
        if (onSuccess) {
          onSuccess({ upi_id: updatedUpi });
        }
        onClose();
      } catch {
        setError('Could not save, please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  const actionButtons = (
    <>
      <button
        type="button"
        onClick={onClose}
        disabled={loading}
        className="px-4 h-9 rounded-full border border-outline-variant/60 text-xs font-semibold text-on-background hover:bg-surface-variant transition-colors whitespace-nowrap"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={loading}
        className="px-6 h-9 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-headline-md text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 whitespace-nowrap"
      >
        {loading ? (
          <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
        ) : (
          <span className="material-symbols-outlined text-sm">check</span>
        )}
        <span>{loading ? 'Saving...' : 'Save'}</span>
      </button>
    </>
  );

  return (
    <BottomSheetModal
      isOpen={isOpen}
      onClose={onClose}
      title={titles[fieldType] || 'Edit Field'}
      icon={icons[fieldType] || 'edit'}
      actions={actionButtons}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSave} className="space-y-4">
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
      </form>
    </BottomSheetModal>
  );
}
