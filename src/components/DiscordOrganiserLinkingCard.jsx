import React, { useState, useEffect } from 'react';
import { getAuthToken } from '../utils/getAuthToken.js';

export default function DiscordOrganiserLinkingCard({ triggerToast = () => {} }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [linkingData, setLinkingData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [showConfirmRegen, setShowConfirmRegen] = useState(false);
  const [showConfirmRevoke, setShowConfirmRevoke] = useState(false);

  const fetchLinkingData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/organizer/discord-linking-code', {
        headers: {
          'Accept': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to load linking code.');
      }
      setLinkingData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinkingData();
  }, []);

  const handleCopyCode = () => {
    if (!linkingData?.code) return;
    navigator.clipboard?.writeText(linkingData.code);
    setCopied(true);
    triggerToast('Organiser Linking Code copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleRegenerateCode = async () => {
    setRegenerating(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/organizer/discord-linking-code/regenerate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to regenerate code.');
      }
      setLinkingData((prev) => ({
        ...prev,
        code: data.code,
        status: data.status || 'active',
      }));
      setShowConfirmRegen(false);
      triggerToast('New Organiser Linking Code generated! Previous codes revoked.');
    } catch (err) {
      triggerToast(`Error: ${err.message}`);
    } finally {
      setRegenerating(false);
    }
  };

  const handleRevokeCode = async () => {
    setRevoking(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/organizer/discord-linking-code/revoke', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to revoke code.');
      }
      setLinkingData((prev) => ({
        ...prev,
        status: 'revoked',
      }));
      setShowConfirmRevoke(false);
      triggerToast('Organiser Linking Code has been revoked.');
    } catch (err) {
      triggerToast(`Error: ${err.message}`);
    } finally {
      setRevoking(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-card p-5 sm:p-6 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm space-y-4 animate-pulse">
        <div className="h-5 w-48 bg-surface-variant/60 rounded"></div>
        <div className="h-10 w-full bg-surface-variant/40 rounded-xl"></div>
        <div className="h-4 w-3/4 bg-surface-variant/30 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-5 sm:p-6 rounded-[20px] border border-rose-500/20 bg-rose-500/5 backdrop-blur-md shadow-sm space-y-3">
        <div className="flex items-center gap-2 text-rose-500 font-bold text-sm">
          <span className="material-symbols-outlined text-lg">error</span>
          <span>Could not load Discord Linking Code</span>
        </div>
        <p className="text-xs text-on-surface-variant">{error}</p>
        <button
          onClick={fetchLinkingData}
          className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-xs">refresh</span> Try Again
        </button>
      </div>
    );
  }

  const isRevoked = linkingData?.status === 'revoked';
  const linkedServers = linkingData?.linkedServers || [];

  return (
    <div className="glass-card p-5 sm:p-6 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/20 pb-4">
        <div>
          <h3 className="font-headline-md text-base sm:text-lg font-bold text-on-background flex items-center gap-2 tracking-tight">
            <span className="material-symbols-outlined text-[#5865F2] text-2xl">smart_toy</span>
            Discord Server Linking
          </h3>
          <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
            Connect your Discord server to MatchDistrict to host rounds, assign group slots, and deliver match credentials.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isRevoked ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Code Revoked
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Code Active
            </span>
          )}
        </div>
      </div>

      {/* Code Box */}
      <div className="space-y-3">
        <label className="font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider block font-bold">
          Your Organiser Linking Code
        </label>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="flex-1 flex items-center justify-between bg-surface-container/70 border border-outline-variant/40 rounded-xl px-4 py-3 shadow-inner">
            <code className={`font-mono text-xs sm:text-sm tracking-wider font-bold ${isRevoked ? 'text-on-surface-variant/40 line-through' : 'text-primary'}`}>
              {linkingData?.code || '••••-••••-••••-••••'}
            </code>
            {!isRevoked && (
              <span className="text-[10px] uppercase font-bold tracking-widest text-on-surface-variant/60 hidden sm:inline">
                SECRET
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={isRevoked}
            onClick={handleCopyCode}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-secondary hover:bg-secondary/90 disabled:opacity-40 text-on-primary rounded-xl font-headline-md text-xs font-bold transition-all shadow-sm active:scale-95 shrink-0"
          >
            <span className="material-symbols-outlined text-sm">
              {copied ? 'check' : 'content_copy'}
            </span>
            <span>{copied ? 'Copied!' : 'Copy Code'}</span>
          </button>
        </div>

        <p className="text-[11px] text-on-surface-variant leading-relaxed">
          🔒 <strong>Confidential:</strong> This code identifies your organiser profile in Discord. It stops working immediately if regenerated or revoked.
        </p>
      </div>

      {/* Action Controls: Regenerate & Revoke */}
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        {!showConfirmRegen ? (
          <button
            type="button"
            onClick={() => { setShowConfirmRegen(true); setShowConfirmRevoke(false); }}
            className="px-3.5 py-1.5 border border-outline-variant hover:bg-surface-variant text-on-surface-variant hover:text-on-background rounded-lg font-headline-md text-xs font-semibold transition-all flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">cached</span>
            <span>Regenerate Code</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <span className="text-xs font-bold text-amber-500">Revoke current & generate new code?</span>
            <button
              type="button"
              disabled={regenerating}
              onClick={handleRegenerateCode}
              className="px-3 py-1 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-all disabled:opacity-50"
            >
              {regenerating ? 'Generating…' : 'Yes, Regenerate'}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirmRegen(false)}
              className="px-2 py-1 text-on-surface-variant text-xs hover:text-on-background"
            >
              Cancel
            </button>
          </div>
        )}

        {!isRevoked && (
          !showConfirmRevoke ? (
            <button
              type="button"
              onClick={() => { setShowConfirmRevoke(true); setShowConfirmRegen(false); }}
              className="px-3.5 py-1.5 border border-rose-500/30 hover:bg-rose-500/10 text-rose-500 rounded-lg font-headline-md text-xs font-semibold transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">block</span>
              <span>Revoke Code</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded-xl">
              <span className="text-xs font-bold text-rose-500">Permanently revoke current code?</span>
              <button
                type="button"
                disabled={revoking}
                onClick={handleRevokeCode}
                className="px-3 py-1 bg-rose-500 text-white rounded-lg text-xs font-bold hover:bg-rose-600 transition-all disabled:opacity-50"
              >
                {revoking ? 'Revoking…' : 'Confirm Revoke'}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmRevoke(false)}
                className="px-2 py-1 text-on-surface-variant text-xs hover:text-on-background"
              >
                Cancel
              </button>
            </div>
          )
        )}
      </div>

      {/* Connected Discord Servers */}
      <div className="border-t border-outline-variant/20 pt-4 space-y-3">
        <h4 className="font-headline-md text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">dns</span>
          Connected Discord Servers ({linkedServers.length})
        </h4>

        {linkedServers.length === 0 ? (
          <div className="p-4 rounded-xl bg-surface-container/40 border border-outline-variant/30 space-y-3">
            <p className="text-xs text-on-surface-variant">
              No Discord servers connected yet. Connect your server in 3 simple steps:
            </p>
            <ol className="list-decimal list-inside text-xs text-on-surface-variant space-y-1.5 font-medium">
              <li>Invite the <strong>MatchDistrict Bot</strong> to your Discord server.</li>
              <li>In your server, run <code className="px-1.5 py-0.5 rounded bg-surface border border-outline-variant/40 font-mono text-primary font-bold">.organiser</code>.</li>
              <li>Enter your unique code when prompted by the bot.</li>
            </ol>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {linkedServers.map((srv) => (
              <div
                key={srv.id || srv.guild_id}
                className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container/50 border border-outline-variant/30 shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#5865F2]/10 text-[#5865F2] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">forum</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-on-background truncate">{srv.guild_name || 'Discord Server'}</p>
                    <p className="text-[10px] text-on-surface-variant/80 font-mono">ID: {srv.guild_id}</p>
                  </div>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
                  Linked
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

