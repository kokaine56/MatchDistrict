import { useState, useEffect } from 'react';
import { formatDateIST12h } from '../utils/timeFormat.js';

export default function DiscordConnectCard({ currentUser, providerIdentity, onUserUpdated, triggerToast }) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [cardError, setCardError] = useState(null);

  // Read discord connection object from currentUser
  const discord = currentUser?.discord || (currentUser?.discord_id ? {
    connected: true,
    username: currentUser.discordTag || '',
    global_name: currentUser.name || '',
    avatar_url: null,
    connected_at: null,
  } : {
    connected: false,
    username: null,
    global_name: null,
    avatar_url: null,
    connected_at: null,
  });

  const isConnected = Boolean(discord?.connected);

  // Process ?discord= query status/errors on page load and clean up URL
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const discordStatus = params.get('discord');
    const errCode = params.get('code') || params.get('error') || params.get('discord_error');

    if (discordStatus === 'connected' || discordStatus === 'linked') {
      setCardError(null);
      if (typeof triggerToast === 'function') {
        triggerToast('Discord connected successfully!');
      }
      if (typeof onUserUpdated === 'function') {
        onUserUpdated();
      }
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, newUrl);
    } else if (discordStatus === 'error' || errCode) {
      const errorMap = {
        not_configured: {
          msg: 'Discord integration is not configured on the server. Please check environment settings.',
          ref: 'not_configured',
        },
        state_mismatch: {
          msg: 'Security verification failed or state mismatch. Please try connecting again.',
          ref: 'state_mismatch',
        },
        session_expired: {
          msg: 'Your session expired while connecting. Please sign in again and reconnect Discord.',
          ref: 'session_expired',
        },
        discord_denied: {
          msg: 'Discord authorization was cancelled or denied.',
          ref: 'discord_denied',
        },
        access_denied: {
          msg: 'Discord authorization was cancelled or denied.',
          ref: 'discord_denied',
        },
        token_exchange_failed: {
          msg: 'Could not complete authentication with Discord. Token exchange failed.',
          ref: 'token_exchange_failed',
        },
        invalid_grant: {
          msg: 'Discord rejected the connection. The authorization code may have expired or already been used. Please try again.',
          ref: 'invalid_grant',
        },
        invalid_client: {
          msg: 'Discord server configuration error. Please contact support.',
          ref: 'invalid_client',
        },
        timeout: {
          msg: 'The connection to Discord timed out. Please check your network and try again.',
          ref: 'timeout',
        },
        blocked: {
          msg: 'Connection to Discord was temporarily blocked. Please try again in a few moments.',
          ref: 'blocked',
        },
        profile_fetch_failed: {
          msg: 'Failed to retrieve your Discord profile details. Please try again.',
          ref: 'profile_fetch_failed',
        },
        already_linked: {
          msg: 'This Discord account is already connected to another MatchDistrict account.',
          ref: 'already_linked',
        },
        discord_already_linked: {
          msg: 'This Discord account is already connected to another MatchDistrict account.',
          ref: 'already_linked',
        },
        db_error: {
          msg: 'Database error occurred while saving your Discord connection.',
          ref: 'db_error',
        },
        rate_limited: {
          msg: 'Too many requests. Please wait a moment before trying again.',
          ref: 'rate_limited',
        },
        unknown: {
          msg: 'An unexpected error occurred while connecting Discord. Please try again.',
          ref: 'unknown',
        },
        server_error: {
          msg: 'Failed to connect Discord due to a server error. Please try again.',
          ref: 'server_error',
        },
      };

      const errInfo = errorMap[errCode] || {
        msg: 'Discord connection failed. Please try again.',
        ref: errCode || 'unknown',
      };

      setCardError(errInfo);
      if (typeof triggerToast === 'function') {
        triggerToast(`${errInfo.msg} (Code: ${errInfo.ref})`);
      }
      const newUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, [triggerToast, onUserUpdated]);

  const handleConnectClick = (reconnect = false) => {
    const url = reconnect ? '/api/auth/discord/connect?reconnect=true' : '/api/auth/discord/connect';
    window.location.href = url;
  };

  const handleDisconnectConfirm = async () => {
    try {
      setIsDisconnecting(true);
      const res = await fetch('/api/auth/discord/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ currentPassword }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (typeof triggerToast === 'function') {
          triggerToast('Discord disconnected successfully.');
        }
        setShowConfirmModal(false);
        setCurrentPassword('');
        if (typeof onUserUpdated === 'function') {
          onUserUpdated();
        }
      } else {
        const msg = data.message || data.error || 'Failed to disconnect Discord.';
        if (typeof triggerToast === 'function') {
          triggerToast(msg);
        }
      }
    } catch {
      if (typeof triggerToast === 'function') {
        triggerToast('Network error while disconnecting Discord.');
      }
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <>
      <div className="border-t border-outline-variant/20 pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-headline-md text-sm font-bold uppercase flex items-center gap-1.5 text-on-background tracking-tight">
            <span className="material-symbols-outlined text-primary text-lg">link</span> Connected Accounts
          </h4>
          {isConnected ? (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-label-caps flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Connected
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-surface-variant text-on-surface-variant border border-outline-variant/40 font-label-caps">
              Not Connected
            </span>
          )}
        </div>

        {cardError && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-xl flex items-start justify-between gap-3 text-rose-300 text-xs animate-in fade-in duration-200">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="material-symbols-outlined text-rose-400 text-lg shrink-0 mt-0.5">error</span>
              <div>
                <p className="font-medium text-rose-200">{cardError.msg}</p>
                <p className="text-[11px] text-rose-400 font-mono mt-0.5 font-semibold">Reference Code: {cardError.ref}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCardError(null)}
              className="text-rose-400 hover:text-rose-200 transition-colors shrink-0 p-0.5"
              title="Dismiss"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        )}

        <div className="p-4 bg-surface-container rounded-xl border border-outline-variant/30 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            {/* Avatar or Brand Icon */}
            {isConnected && discord.avatar_url && !avatarLoadError ? (
              <img
                src={discord.avatar_url}
                alt={discord.username || 'Discord Avatar'}
                onError={() => setAvatarLoadError(true)}
                className="w-12 h-12 rounded-xl object-cover border border-[#5865F2]/30 shadow-sm shrink-0 bg-surface-container-highest"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-[#5865F2]/10 border border-[#5865F2]/30 flex items-center justify-center shrink-0 shadow-sm">
                <svg className="w-6 h-6 fill-[#5865F2]" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              </div>
            )}

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-headline-md text-sm font-bold text-on-background">Discord</span>
                {isConnected && discord.username && (
                  <span className="font-mono text-xs text-primary font-semibold">
                    @{discord.username}
                  </span>
                )}
              </div>

              {isConnected ? (
                <div className="space-y-0.5">
                  {discord.global_name && discord.global_name !== discord.username && (
                    <p className="font-body-sm text-xs text-on-surface-variant truncate">
                      {discord.global_name}
                    </p>
                  )}
              {providerIdentity?.provider_email && <p className="text-xs text-on-surface-variant">{providerIdentity.provider_email}</p>}
                  {discord.connected_at ? (
                    <p className="font-body-sm text-[11px] text-on-surface-variant/80">
                      Connected on {formatDateIST12h(discord.connected_at)} (IST)
                    </p>
                  ) : (
                    <p className="font-body-sm text-[11px] text-on-surface-variant/80">
                      Connected profile
                    </p>
                  )}
                </div>
              ) : (
                <p className="font-body-sm text-[11px] text-on-surface-variant leading-relaxed max-w-xl">
                  Connect Discord for login and account linking. Its stable ID, verified email, display name, and avatar are private to your account.
                </p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 self-end md:self-center w-full md:w-auto">
            {isConnected ? (
              <>
                <button
                  type="button"
                  onClick={() => handleConnectClick(true)}
                  className="flex-1 md:flex-initial px-3.5 min-h-[40px] border border-outline-variant hover:bg-surface-variant text-on-background rounded-lg font-headline-md text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Reconnect your Discord account to refresh profile details"
                >
                  <span className="material-symbols-outlined text-sm">refresh</span>
                  <span>Reconnect to refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(true)}
                  className="flex-1 md:flex-initial px-3.5 min-h-[40px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded-lg font-headline-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">link_off</span>
                  <span>Disconnect</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => handleConnectClick(false)}
                className="w-full md:w-auto px-5 min-h-[42px] bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg font-headline-md text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                <svg className="w-4 h-4 fill-white shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                <span>Connect Discord</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Disconnect Confirmation Dialog */}
      {showConfirmModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => !isDisconnecting && setShowConfirmModal(false)}
        >
          <div
            className="relative max-w-md w-full bg-surface-container border border-outline-variant/60 rounded-2xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0 border border-rose-500/20">
                <span className="material-symbols-outlined text-xl">link_off</span>
              </div>
              <div>
                <h3 className="font-headline-md text-base font-bold text-on-background">Disconnect Discord</h3>
                <p className="font-body-sm text-xs text-on-surface-variant">Are you sure you want to disconnect your Discord account?</p>
              </div>
            </div>

            <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed bg-surface-container-low p-3 rounded-lg border border-outline-variant/20">
              Disconnecting removes the Discord identity record and compatibility link from Match District. You can reconnect anytime.
            </p>

            {currentUser?.password_set === false ? (
              <p className="text-xs text-amber-500">Confirm within 10 minutes of signing in. Another login method must remain connected.</p>
            ) : (
              <label className="block space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Current password to confirm</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-background outline-none focus:border-primary"
                />
              </label>
            )}

            <div className="flex justify-end gap-2.5 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                disabled={isDisconnecting}
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 border border-outline hover:bg-surface-variant text-on-background rounded-lg font-headline-md text-xs font-semibold cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDisconnecting}
                onClick={handleDisconnectConfirm}
                className="px-4.5 py-2 bg-rose-500 hover:bg-rose-600 disabled:opacity-60 text-white rounded-lg font-headline-md text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                {isDisconnecting ? (
                  <>
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                    <span>Disconnecting...</span>
                  </>
                ) : (
                  <span>Disconnect</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
