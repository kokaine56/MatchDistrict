import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getAuthToken } from '../utils/getAuthToken.js';

// Official Brand SVGs with authentic vector coordinates and brand colors
export function InstagramIcon({ className = 'w-5 h-5 flex-shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

export function DiscordIcon({ className = 'w-5 h-5 flex-shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2914a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.1776-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z" />
    </svg>
  );
}

export function WhatsAppIcon({ className = 'w-5 h-5 flex-shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}

export function YouTubeIcon({ className = 'w-5 h-5 flex-shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

/**
 * Validates a platform URL according to strict rules:
 * - Must start with https://
 * - instagram: instagram.com or www.instagram.com
 * - discord: discord.gg or discord.com/invite
 * - whatsapp: whatsapp.com/channel/...
 * - youtube: youtube.com or youtu.be
 */
export function validateSocialUrl(platform, rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return { valid: true, error: null };
  }
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('https://')) {
    return { valid: false, error: 'Link must start with https://' };
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Please enter a valid URL' };
  }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;

  switch (platform) {
    case 'instagram':
      if (host !== 'instagram.com' && host !== 'www.instagram.com') {
        return { valid: false, error: 'Must be a valid instagram.com link' };
      }
      if (path.length <= 1) {
        return { valid: false, error: 'Please include an Instagram profile or page link' };
      }
      return { valid: true, error: null };

    case 'discord':
      if (host === 'discord.gg' || host === 'www.discord.gg') {
        if (!/^\/[A-Za-z0-9-_]+\/?$/.test(path)) {
          return { valid: false, error: 'Must include a valid Discord invite code (e.g. https://discord.gg/yourcode)' };
        }
        return { valid: true, error: null };
      } else if (host === 'discord.com' || host === 'www.discord.com') {
        if (!/^\/invite\/[A-Za-z0-9-_]+\/?$/.test(path)) {
          return { valid: false, error: 'Must be a discord.com/invite/... link' };
        }
        return { valid: true, error: null };
      } else {
        return { valid: false, error: 'Must be a valid Discord invite link (discord.gg or discord.com/invite)' };
      }

    case 'whatsapp':
      if (!host.endsWith('whatsapp.com')) {
        return { valid: false, error: 'Must be a valid whatsapp.com link' };
      }
      if (!path.startsWith('/channel/')) {
        return { valid: false, error: 'Must be a WhatsApp channel link (https://whatsapp.com/channel/...)' };
      }
      return { valid: true, error: null };

    case 'youtube':
      if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
        if (path.length <= 1) {
          return { valid: false, error: 'Please include a YouTube channel or video link' };
        }
        return { valid: true, error: null };
      } else if (host === 'youtu.be') {
        if (path.length <= 1) {
          return { valid: false, error: 'Please include a YouTube video ID' };
        }
        return { valid: true, error: null };
      } else {
        return { valid: false, error: 'Must be a valid YouTube link (youtube.com or youtu.be)' };
      }

    default:
      return { valid: false, error: 'Unknown platform' };
  }
}

/**
 * In-Page Modal for Organiser to Add/Edit Social Links
 */
export function SocialLinksModal({ isOpen, onClose, tournament, onSaved }) {
  const [formData, setFormData] = useState({
    instagram: '',
    discord: '',
    whatsapp: '',
    youtube: '',
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  useEffect(() => {
    if (isOpen && tournament) {
      const links = tournament.social_links || {};
      const prefilledDiscord =
        links.discord ||
        tournament.discord_invite_url ||
        tournament.discord_invite ||
        tournament.discordInvite ||
        '';

      setFormData({
        instagram: links.instagram || '',
        discord: prefilledDiscord,
        whatsapp: links.whatsapp || '',
        youtube: links.youtube || '',
      });
      setErrors({});
      setServerError(null);
    }
  }, [isOpen, tournament]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleChange = (platform, value) => {
    setFormData((prev) => ({ ...prev, [platform]: value }));
    if (errors[platform]) {
      const valRes = validateSocialUrl(platform, value);
      setErrors((prev) => ({ ...prev, [platform]: valRes.valid ? null : valRes.error }));
    }
    if (serverError) setServerError(null);
  };

  const handleBlur = (platform) => {
    const valRes = validateSocialUrl(platform, formData[platform]);
    setErrors((prev) => ({ ...prev, [platform]: valRes.valid ? null : valRes.error }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError(null);

    // Validate all fields
    const newErrors = {};
    let hasInvalid = false;
    for (const platform of ['instagram', 'discord', 'whatsapp', 'youtube']) {
      const valRes = validateSocialUrl(platform, formData[platform]);
      if (!valRes.valid) {
        newErrors[platform] = valRes.error;
        hasInvalid = true;
      }
    }

    if (hasInvalid) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getAuthToken();
      const payload = {
        social_links: {
          instagram: formData.instagram.trim(),
          discord: formData.discord.trim(),
          whatsapp: formData.whatsapp.trim(),
          youtube: formData.youtube.trim(),
        },
      };

      const response = await fetch(`/api/tournaments/${encodeURIComponent(tournament.id)}/social-links`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to update social links.');
      }

      if (onSaved) {
        onSaved(data.social_links, data.discord_invite_url);
      }
      onClose();
    } catch (err) {
      setServerError(err.message || 'An unexpected error occurred while saving.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearField = (platform) => {
    setFormData((prev) => ({ ...prev, [platform]: '' }));
    setErrors((prev) => ({ ...prev, [platform]: null }));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="social-links-modal-title"
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 id="social-links-modal-title" className="text-base sm:text-lg font-bold text-slate-900">
              {Object.values(formData).some(Boolean) ? 'Edit Social Links' : 'Add Social Links'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Connect your community and channels for tournament participants.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close dialog"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-4">
          {serverError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-700 flex items-start gap-2">
              <span className="material-symbols-outlined text-[18px] text-red-500 shrink-0 mt-0.5">error</span>
              <span>{serverError}</span>
            </div>
          )}

          {/* Instagram */}
          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <InstagramIcon className="w-4 h-4 text-[#E1306C]" />
                <span>Instagram Profile</span>
              </span>
              {formData.instagram && (
                <button
                  type="button"
                  onClick={() => handleClearField('instagram')}
                  className="text-[11px] text-slate-400 hover:text-red-500 transition-colors"
                >
                  Clear
                </button>
              )}
            </label>
            <input
              type="url"
              value={formData.instagram}
              onChange={(e) => handleChange('instagram', e.target.value)}
              onBlur={() => handleBlur('instagram')}
              placeholder="https://instagram.com/yourhandle"
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition focus:outline-none focus:ring-2 placeholder:text-slate-400 ${
                errors.instagram
                  ? 'border-red-300 bg-red-50/30 text-red-900 focus:ring-red-200 focus:border-red-500'
                  : 'border-slate-300 bg-white text-slate-900 focus:ring-blue-100 focus:border-blue-500'
              }`}
            />
            {errors.instagram && (
              <p className="mt-1 text-xs text-red-600 font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">error</span>
                {errors.instagram}
              </p>
            )}
          </div>

          {/* Discord */}
          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <DiscordIcon className="w-4 h-4 text-[#5865F2]" />
                <span>Discord Invite Link</span>
              </span>
              {formData.discord && (
                <button
                  type="button"
                  onClick={() => handleClearField('discord')}
                  className="text-[11px] text-slate-400 hover:text-red-500 transition-colors"
                >
                  Clear
                </button>
              )}
            </label>
            <input
              type="url"
              value={formData.discord}
              onChange={(e) => handleChange('discord', e.target.value)}
              onBlur={() => handleBlur('discord')}
              placeholder="https://discord.gg/yourinvite"
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition focus:outline-none focus:ring-2 placeholder:text-slate-400 ${
                errors.discord
                  ? 'border-red-300 bg-red-50/30 text-red-900 focus:ring-red-200 focus:border-red-500'
                  : 'border-slate-300 bg-white text-slate-900 focus:ring-blue-100 focus:border-blue-500'
              }`}
            />
            {errors.discord ? (
              <p className="mt-1 text-xs text-red-600 font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">error</span>
                {errors.discord}
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-slate-400">
                Powers both the Discord icon button and the &quot;Join Discord&quot; button in the overview.
              </p>
            )}
          </div>

          {/* WhatsApp Channel */}
          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <WhatsAppIcon className="w-4 h-4 text-[#25D366]" />
                <span>WhatsApp Channel</span>
              </span>
              {formData.whatsapp && (
                <button
                  type="button"
                  onClick={() => handleClearField('whatsapp')}
                  className="text-[11px] text-slate-400 hover:text-red-500 transition-colors"
                >
                  Clear
                </button>
              )}
            </label>
            <input
              type="url"
              value={formData.whatsapp}
              onChange={(e) => handleChange('whatsapp', e.target.value)}
              onBlur={() => handleBlur('whatsapp')}
              placeholder="https://whatsapp.com/channel/0029Va..."
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition focus:outline-none focus:ring-2 placeholder:text-slate-400 ${
                errors.whatsapp
                  ? 'border-red-300 bg-red-50/30 text-red-900 focus:ring-red-200 focus:border-red-500'
                  : 'border-slate-300 bg-white text-slate-900 focus:ring-blue-100 focus:border-blue-500'
              }`}
            />
            {errors.whatsapp && (
              <p className="mt-1 text-xs text-red-600 font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">error</span>
                {errors.whatsapp}
              </p>
            )}
          </div>

          {/* YouTube */}
          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <YouTubeIcon className="w-4 h-4 text-[#FF0000]" />
                <span>YouTube Channel or Stream</span>
              </span>
              {formData.youtube && (
                <button
                  type="button"
                  onClick={() => handleClearField('youtube')}
                  className="text-[11px] text-slate-400 hover:text-red-500 transition-colors"
                >
                  Clear
                </button>
              )}
            </label>
            <input
              type="url"
              value={formData.youtube}
              onChange={(e) => handleChange('youtube', e.target.value)}
              onBlur={() => handleBlur('youtube')}
              placeholder="https://youtube.com/@channel or https://youtu.be/..."
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition focus:outline-none focus:ring-2 placeholder:text-slate-400 ${
                errors.youtube
                  ? 'border-red-300 bg-red-50/30 text-red-900 focus:ring-red-200 focus:border-red-500'
                  : 'border-slate-300 bg-white text-slate-900 focus:ring-blue-100 focus:border-blue-500'
              }`}
            />
            {errors.youtube && (
              <p className="mt-1 text-xs text-red-600 font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">error</span>
                {errors.youtube}
              </p>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-95 transition shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Links</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

/**
 * Main TournamentSocialLinks Component
 * Displayed below "About Tournament" in the Overview tab.
 */
export default function TournamentSocialLinks({
  tournament,
  isOwner,
  onSocialLinksUpdated,
  isGoldTheme = false,
}) {
  const [showModal, setShowModal] = useState(false);

  const socialLinks = tournament?.social_links || {};
  const instagram = socialLinks.instagram?.trim() || '';
  const discord = socialLinks.discord?.trim() || tournament?.discord_invite_url?.trim() || '';
  const whatsapp = socialLinks.whatsapp?.trim() || '';
  const youtube = socialLinks.youtube?.trim() || '';

  const platforms = [
    {
      id: 'instagram',
      name: 'Instagram',
      url: instagram,
      Icon: InstagramIcon,
      colorClass:
        'bg-[#E1306C]/10 text-[#E1306C] border-[#E1306C]/30 hover:bg-[#E1306C]/20 hover:border-[#E1306C]/50 hover:text-[#E1306C] focus:ring-[#E1306C]/40',
    },
    {
      id: 'discord',
      name: 'Discord',
      url: discord,
      Icon: DiscordIcon,
      colorClass:
        'bg-[#5865F2]/10 text-[#5865F2] border-[#5865F2]/30 hover:bg-[#5865F2]/20 hover:border-[#5865F2]/50 hover:text-[#5865F2] focus:ring-[#5865F2]/40',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      url: whatsapp,
      Icon: WhatsAppIcon,
      colorClass:
        'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/20 hover:border-[#25D366]/50 hover:text-[#25D366] focus:ring-[#25D366]/40',
    },
    {
      id: 'youtube',
      name: 'YouTube',
      url: youtube,
      Icon: YouTubeIcon,
      colorClass:
        'bg-[#FF0000]/10 text-[#FF0000] border-[#FF0000]/30 hover:bg-[#FF0000]/20 hover:border-[#FF0000]/50 hover:text-[#FF0000] focus:ring-[#FF0000]/40',
    },
  ].filter((p) => Boolean(p.url));

  const hasAnyLink = platforms.length > 0;

  // If visitor (not owner) and no links are set, show nothing at all
  if (!hasAnyLink && !isOwner) {
    return null;
  }

  return (
    <>
      <div className="mt-4 flex flex-col items-center text-center space-y-3">
        {hasAnyLink && (
          <h4 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Join our community
          </h4>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-3.5">
          {/* Circular icon buttons for each set link without text label */}
          {platforms.map(({ id, name, url, Icon, colorClass }) => (
            <a
              key={id}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={name}
              title={name}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border transition-all duration-200 hover:scale-110 active:scale-95 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 ${colorClass}`}
            >
              <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
            </a>
          ))}

          {/* Organiser: Add / Edit Social Links Button */}
          {isOwner && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              aria-label={hasAnyLink ? 'Edit Social Links' : 'Add Social Links'}
              title={hasAnyLink ? 'Edit Social Links' : 'Add Social Links'}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition border shadow-sm active:scale-95 ${
                isGoldTheme
                  ? 'bg-[#D4A017]/10 text-[#D4A017] border-[#D4A017]/40 hover:bg-[#D4A017]/20'
                  : 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-white/20 hover:bg-slate-200 dark:hover:bg-white/15'
              }`}
            >
              <span className="material-symbols-outlined text-[17px]">
                {hasAnyLink ? 'edit' : 'add'}
              </span>
              <span>{hasAnyLink ? 'Edit Social Links' : 'Add Social Links'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Organiser Modal */}
      {isOwner && (
        <SocialLinksModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          tournament={tournament}
          onSaved={(newSocialLinks, newDiscordInvite) => {
            if (onSocialLinksUpdated) {
              onSocialLinksUpdated(newSocialLinks, newDiscordInvite);
            }
          }}
        />
      )}
    </>
  );
}

