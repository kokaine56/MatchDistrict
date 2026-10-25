import React, { useState, useEffect } from 'react';
import BottomSheetModal from './BottomSheetModal.jsx';
import { getAuthToken } from '../utils/getAuthToken.js';

function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 1) {
    return `${local}***@${domain}`;
  }
  return `${local[0]}***@${domain}`;
}

export default function PasswordModal({
  isOpen,
  onClose,
  passwordSet,
  currentUser,
  triggerToast,
  onSuccess,
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      setError('');
      setForgotMessage('');
      setForgotLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleForgotPassword = async () => {
    if (!currentUser?.email) {
      setError('No email address associated with this account.');
      return;
    }
    setForgotLoading(true);
    setError('');
    setForgotMessage('');
    try {
      const res = await fetch('/api/auth/forgot-password-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: currentUser.email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        const masked = maskEmail(currentUser.email);
        setForgotMessage(`We sent a reset link to ${masked}`);
        triggerToast?.(`Password reset link sent to ${masked}`);
      } else {
        setError(data.message || 'Could not send reset link. Please try again.');
      }
    } catch {
      setError('Could not send reset link. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setForgotMessage('');

    if (passwordSet && !currentPassword) {
      setError('Please enter your current password.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && token !== 'null' ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: passwordSet ? currentPassword : undefined,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.message || (res.status === 401 ? 'Current password is incorrect. Please try again.' : 'Could not save. Please try again.'));
        return;
      }

      triggerToast?.(passwordSet ? 'Password changed successfully.' : 'Password created successfully.');
      if (onSuccess) onSuccess();
      onClose();
    } catch {
      setError('Could not save. Please try again.');
    } finally {
      setLoading(false);
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
        onClick={handleSubmit}
        disabled={loading || !newPassword || newPassword.length < 6 || newPassword !== confirmPassword || (passwordSet && !currentPassword)}
        className="px-6 h-9 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-headline-md text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 whitespace-nowrap"
      >
        {loading ? (
          <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
        ) : (
          <span className="material-symbols-outlined text-sm">{passwordSet ? 'lock_reset' : 'key'}</span>
        )}
        <span>{loading ? 'Saving...' : passwordSet ? 'Change Password' : 'Create Password'}</span>
      </button>
    </>
  );

  return (
    <BottomSheetModal
      isOpen={isOpen}
      onClose={onClose}
      title={passwordSet ? 'Change Password' : 'Create Password'}
      icon="lock"
      actions={actionButtons}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium flex items-center gap-2">
            <span className="material-symbols-outlined text-base shrink-0">error</span>
            <span>{error}</span>
          </div>
        )}

        {forgotMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium flex items-center gap-2">
            <span className="material-symbols-outlined text-base shrink-0">mark_email_read</span>
            <span>{forgotMessage}</span>
          </div>
        )}

        {!passwordSet ? (
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Create a password to enable email &amp; password sign-in for your account.
          </p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                Current Password
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={forgotLoading}
                className="text-[11px] text-primary hover:underline font-semibold flex items-center gap-0.5 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-xs">help_outline</span>
                <span>{forgotLoading ? 'Sending...' : 'Forgot?'}</span>
              </button>
            </div>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                autoFocus
                className="w-full h-10 pl-3.5 pr-10 rounded-xl bg-surface-container border border-outline-variant text-xs font-semibold text-on-background outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-background p-1"
                aria-label="Toggle password visibility"
              >
                <span className="material-symbols-outlined text-base">
                  {showCurrent ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* New Password */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
            New Password
          </label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              autoFocus={!passwordSet}
              className="w-full h-10 pl-3.5 pr-10 rounded-xl bg-surface-container border border-outline-variant text-xs font-semibold text-on-background outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-background p-1"
              aria-label="Toggle password visibility"
            >
              <span className="material-symbols-outlined text-base">
                {showNew ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
            Confirm Password
          </label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-type new password"
              className="w-full h-10 pl-3.5 pr-10 rounded-xl bg-surface-container border border-outline-variant text-xs font-semibold text-on-background outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-background p-1"
              aria-label="Toggle password visibility"
            >
              <span className="material-symbols-outlined text-base">
                {showConfirm ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </div>
      </form>
    </BottomSheetModal>
  );
}
