import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAuthToken } from '../utils/getAuthToken.js';

export default function ProfileEditFieldModal({
  isOpen,
  onClose,
  fieldType, // 'whatsapp' | 'gamerTag' | 'bgmiId' | 'riotId' | 'steamId' | 'socialLinks'
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
    gamerTag: 'Gamer Tag',
    bgmiId: 'BGMI Character ID',
    riotId: 'Riot ID',
    steamId: 'Steam ID',
    socialLinks: 'Social Link / Handle',
  };

  useEffect(() => {
    if (isOpen) {
      if (fieldType === 'whatsapp') {
        const raw = String(initialValue || '').replace(/\D/g, '');
        const ten = raw.length === 12 && raw.startsWith('91') ? raw.slice(2) : (raw.length === 11 && raw.startsWith('0') ? raw.slice(1) : raw);
        setValue(ten);
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

    let payload = {};
    if (fieldType === 'whatsapp') {
      const digits = value.replace(/\D/g, '');
      if (!digits) {
        payload.phone = null;
      } else if (!/^[6-9]\d{9}$/.test(digits)) {
        setError('Please enter a valid 10-digit Indian mobile number starting with 6-9.');
        return;
      } else {
        payload.phone = `+91 ${digits}`;
      }
    } else if (fieldType === 'gamerTag') {
      const tag = value.trim();
      if (!tag) {
        setError('Gamer tag cannot be blank.');
        return;
      }
      payload.gamerTag = tag;
    } else if (fieldType === 'bgmiId') {
      payload.bgmiId = value.trim() || null;
    } else if (fieldType === 'riotId') {
      payload.riotId = value.trim() || null;
    } else if (fieldType === 'steamId') {
      payload.steamId = value.trim() || null;
    } else if (fieldType === 'socialLinks') {
      payload.socialLinks = value.trim() || null;
    }

    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || 'Failed to update profile field.');
        return;
      }
      triggerToast(`${titles[fieldType] || 'Field'} updated.`);
      if (onSuccess) onSuccess(data.user);
      onClose();
    } catch {
      setError('Network error updating profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 30 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="w-full max-w-md bg-white dark:bg-[#121520] border-t sm:border border-outline-variant/50 rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl relative"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-outline-variant/30">
            <h3 className="font-headline-md text-base sm:text-lg font-bold text-on-background">
              {titles[fieldType] || 'Edit Field'}
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-variant flex items-center justify-center text-on-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          <form onSubmit={handleSave} className="py-4 space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-base">error</span>
                <span>{error}</span>
              </div>
            )}

            {fieldType === 'whatsapp' ? (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                  10-Digit Mobile Number
                </label>
                <div className="flex items-center gap-2">
                  <span className="h-10 px-3 flex items-center justify-center rounded-xl bg-surface-container border border-outline-variant text-xs font-bold text-on-surface-variant select-none">
                    🇮🇳 +91
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={value}
                    onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
                    placeholder="9876543210"
                    autoFocus
                    className="flex-1 h-10 px-3.5 rounded-xl bg-surface-container border border-outline-variant text-xs font-semibold text-on-background outline-none focus:border-primary tracking-wide"
                  />
                </div>
                <p className="text-[10px] text-on-surface-variant/70 leading-relaxed">
                  Used for urgent tournament updates and match calls. Starts with digits 6, 7, 8, or 9.
                </p>
              </div>
            ) : fieldType === 'gamerTag' ? (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                  Gamer Tag / In-Game Handle
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. Phoenix"
                  autoFocus
                  className="w-full h-10 px-3.5 rounded-xl bg-surface-container border border-outline-variant text-xs font-semibold text-on-background outline-none focus:border-primary"
                />
              </div>
            ) : fieldType === 'bgmiId' ? (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                  BGMI Character ID
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. 5123456789"
                  autoFocus
                  className="w-full h-10 px-3.5 rounded-xl bg-surface-container border border-outline-variant text-xs font-semibold text-on-background outline-none focus:border-primary font-mono"
                />
              </div>
            ) : fieldType === 'riotId' ? (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                  Riot ID (Valorant)
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. Player#IND"
                  autoFocus
                  className="w-full h-10 px-3.5 rounded-xl bg-surface-container border border-outline-variant text-xs font-semibold text-on-background outline-none focus:border-primary"
                />
              </div>
            ) : fieldType === 'steamId' ? (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                  Steam ID
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. 76561198000000000"
                  autoFocus
                  className="w-full h-10 px-3.5 rounded-xl bg-surface-container border border-outline-variant text-xs font-semibold text-on-background outline-none focus:border-primary font-mono"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block">
                  Social Link (Twitter, Instagram, YouTube)
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g. @player or https://instagram.com/..."
                  autoFocus
                  className="w-full h-10 px-3.5 rounded-xl bg-surface-container border border-outline-variant text-xs font-semibold text-on-background outline-none focus:border-primary"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-outline-variant/30">
              <button
                type="button"
                onClick={onClose}
                className="px-4 h-9 rounded-full border border-outline-variant/60 text-xs font-semibold text-on-background hover:bg-surface-variant transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 h-9 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-headline-md text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
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
