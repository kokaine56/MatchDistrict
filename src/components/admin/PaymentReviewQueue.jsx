import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAuthToken } from '../../utils/getAuthToken.js';
import { useRefetchOnFocus } from '../../hooks/useRefetchOnFocus.js';
import BottomSheetModal from '../BottomSheetModal.jsx';

const REJECTION_REASONS = [
  { code: 'payment_not_received', label: 'Payment not received in bank/UPI account' },
  { code: 'wrong_amount', label: 'Wrong amount paid (underpaid or invalid amount)' },
  { code: 'invalid_utr', label: 'Invalid or unverified UTR reference number' },
  { code: 'duplicate_utr', label: 'Duplicate UTR already claimed by another team' },
  { code: 'unclear_proof', label: 'Unclear, blurry, or cropped screenshot proof' },
  { code: 'other', label: 'Other issue (custom note required)' }
];

const PAYMENT_APP_LABELS = {
  google_pay: 'Google Pay',
  phonepe: 'PhonePe',
  paytm: 'Paytm',
  bhim: 'BHIM',
  amazon_pay: 'Amazon Pay',
  cred: 'CRED',
  whatsapp_pay: 'WhatsApp Pay',
  mobikwik: 'MobiKwik',
  other: 'Other UPI App',
};
const formatPaymentApp = (val) => PAYMENT_APP_LABELS[(val || '').toLowerCase()] || val || 'UPI / Other';

export default function PaymentReviewQueue({ role = 'admin', tournamentId = null, className = '' }) {
  const [activeTab, setActiveTab] = useState('pending_review');
  const [counts, setCounts] = useState({ pending_review: 0, awaiting_payment: 0, approved: 0, rejected: 0 });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [tournamentFilter, setTournamentFilter] = useState('');
  const [availableTournaments, setAvailableTournaments] = useState([]);

  // Selected item for desktop 2-column view
  const [selectedId, setSelectedId] = useState(null);

  // Modals & Sheets
  const [proofModalUrl, setProofModalUrl] = useState(null);
  const [proofZoom, setProofZoom] = useState(1);
  const [dupModalData, setDupModalData] = useState(null);

  // Action sheets
  const [flagWarningItem, setFlagWarningItem] = useState(null);
  const [flagWarningNote, setFlagWarningNote] = useState('');
  const [rejectingItem, setRejectingItem] = useState(null);
  const [rejectReason, setRejectReason] = useState('payment_not_received');
  const [rejectNote, setRejectNote] = useState('');
  const [reopeningItem, setReopeningItem] = useState(null);
  const [reopenReason, setReopenReason] = useState('');
  const [releasingItem, setReleasingItem] = useState(null);
  const [releaseNote, setReleaseNote] = useState('');

  // Bulk approve sheet & state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResults, setBulkResults] = useState(null);

  // Toast state
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });
  const [copiedUtr, setCopiedUtr] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 4000);
  }, []);

  const handleCopy = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedUtr(id);
    showToast(`Copied: ${text}`, 'success');
    setTimeout(() => setCopiedUtr(null), 2000);
  };

  // Fetch queue items
  const fetchQueue = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    try {
      const token = await getAuthToken();

      const params = new URLSearchParams({
        tab: activeTab,
        limit: '20'
      });
      if (tournamentId || tournamentFilter) {
        params.set('tournamentId', tournamentId || tournamentFilter);
      }
      if (search.trim()) {
        params.set('search', search.trim());
      }

      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/admin/payments/review-queue?${params.toString()}`, {
        credentials: 'include',
        headers
      });
      const data = await res.json();

      if (data.success) {
        setItems(data.items || []);
        if (data.counts) setCounts(data.counts);
        setNextCursor(data.nextCursor || null);
        setHasMore(Boolean(data.hasMore));

        // Auto-extract tournaments for filter dropdown if not scoped
        if (!tournamentId && data.items) {
          setAvailableTournaments(prev => {
            const map = new Map(prev.map(t => [t.id, t]));
            data.items.forEach(item => {
              if (item.tournament_id && !map.has(item.tournament_id)) {
                map.set(item.tournament_id, { id: item.tournament_id, title: item.tournament_title });
              }
            });
            return Array.from(map.values());
          });
        }

        // Set selected item if none selected or no longer exists
        if (data.items?.length > 0) {
          setSelectedId(prev => (prev && data.items.some(i => i.id === prev) ? prev : data.items[0].id));
        } else {
          setSelectedId(null);
        }
      } else {
        showToast(data.message || 'Failed to load review items.', 'error');
      }
    } catch {
      showToast('Network error loading review queue.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, tournamentId, tournamentFilter, search, showToast]);

  // Load more with cursor
  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const token = await getAuthToken();
      const params = new URLSearchParams({
        tab: activeTab,
        limit: '20',
        cursor: nextCursor
      });
      if (tournamentId || tournamentFilter) params.set('tournamentId', tournamentId || tournamentFilter);
      if (search.trim()) params.set('search', search.trim());

      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/admin/payments/review-queue?${params.toString()}`, {
        credentials: 'include',
        headers
      });
      const data = await res.json();
      if (data.success) {
        setItems(prev => [...prev, ...(data.items || [])]);
        setNextCursor(data.nextCursor || null);
        setHasMore(Boolean(data.hasMore));
      }
    } catch {
      showToast('Failed to load more items.', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  // Initial & tab-change fetch
  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Background refetch on focus
  useRefetchOnFocus(() => fetchQueue(true));

  // 30s background polling
  useEffect(() => {
    const timer = setInterval(() => {
      fetchQueue(true);
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchQueue]);

  // Selected item object
  const selectedItem = useMemo(() => {
    return items.find(i => i.id === selectedId) || items[0] || null;
  }, [items, selectedId]);

  // Clean items for bulk approve
  const cleanPendingItems = useMemo(() => {
    return items.filter(i => !i.flags?.has_flags && (i.status === 'pending' || i.status === 'VERIFIED_BY_HOST' || i.status === 'pending_admin_review'));
  }, [items]);

  // ── ACTION HANDLERS ────────────────────────────────────────────────────────

  // Approve action
  const handleApproveClick = (item) => {
    if (item.flags?.has_flags) {
      setFlagWarningItem(item);
      setFlagWarningNote('');
    } else {
      executeApprove(item.id, '');
    }
  };

  const executeApprove = async (regId, note) => {
    const targetItem = items.find(i => i.id === regId);
    if (!targetItem) return;

    // Optimistic removal
    setItems(prev => prev.filter(i => i.id !== regId));
    setCounts(prev => ({
      ...prev,
      pending_review: Math.max(0, prev.pending_review - 1),
      approved: prev.approved + 1
    }));
    setFlagWarningItem(null);
    setActionLoadingId(regId);

    try {
      const token = await getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/admin/payments/review-queue/${regId}/approve`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ note })
      });
      const data = await res.json();

      if (res.status === 409) {
        showToast(data.message || 'Already handled by another reviewer.', 'warning');
        fetchQueue(true);
      } else if (!data.success) {
        showToast(data.message || 'Failed to approve registration.', 'error');
        fetchQueue(true);
      } else {
        showToast(`Approved ${targetItem.team_name} successfully.`, 'success');
      }
    } catch {
      showToast('Network error during approval.', 'error');
      fetchQueue(true);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Reject action
  const executeReject = async () => {
    if (!rejectingItem) return;
    const item = rejectingItem;
    if (rejectReason === 'other' && !rejectNote.trim()) {
      showToast('A note is required when selecting "Other issue".', 'error');
      return;
    }

    // Optimistic removal
    setItems(prev => prev.filter(i => i.id !== item.id));
    setCounts(prev => ({
      ...prev,
      pending_review: Math.max(0, prev.pending_review - 1),
      rejected: prev.rejected + 1
    }));
    setRejectingItem(null);
    setActionLoadingId(item.id);

    try {
      const token = await getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/admin/payments/review-queue/${item.id}/reject`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ reason: rejectReason, note: rejectNote.trim() })
      });
      const data = await res.json();

      if (res.status === 409) {
        showToast(data.message || 'Already handled by another reviewer.', 'warning');
        fetchQueue(true);
      } else if (!data.success) {
        showToast(data.message || 'Failed to reject registration.', 'error');
        fetchQueue(true);
      } else {
        showToast(`Registration for ${item.team_name} rejected.`, 'info');
      }
    } catch {
      showToast('Network error during rejection.', 'error');
      fetchQueue(true);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Reopen action (Admins only)
  const executeReopen = async () => {
    if (!reopeningItem) return;
    const item = reopeningItem;
    if (!reopenReason.trim()) {
      showToast('A reason is required to move back to pending review.', 'error');
      return;
    }

    // Optimistic removal
    setItems(prev => prev.filter(i => i.id !== item.id));
    setCounts(prev => ({
      ...prev,
      [activeTab]: Math.max(0, prev[activeTab] - 1),
      pending_review: prev.pending_review + 1
    }));
    setReopeningItem(null);
    setActionLoadingId(item.id);

    try {
      const token = await getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/admin/payments/review-queue/${item.id}/reopen`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ reason: reopenReason.trim() })
      });
      const data = await res.json();

      if (!data.success) {
        showToast(data.message || 'Failed to reopen registration.', 'error');
        fetchQueue(true);
      } else {
        showToast(`Reopened ${item.team_name} and moved back to pending review.`, 'success');
      }
    } catch {
      showToast('Network error during reopen.', 'error');
      fetchQueue(true);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Release slot action
  const executeReleaseSlot = async () => {
    if (!releasingItem) return;
    const item = releasingItem;

    // Optimistic removal
    setItems(prev => prev.filter(i => i.id !== item.id));
    setCounts(prev => ({
      ...prev,
      awaiting_payment: Math.max(0, prev.awaiting_payment - 1)
    }));
    setReleasingItem(null);
    setActionLoadingId(item.id);

    try {
      const token = await getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/admin/payments/review-queue/${item.id}/release-slot`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ note: releaseNote.trim() })
      });
      const data = await res.json();

      if (!data.success) {
        showToast(data.message || 'Failed to release slot.', 'error');
        fetchQueue(true);
      } else {
        showToast(`Slot released for ${item.team_name}.`, 'info');
      }
    } catch {
      showToast('Network error during slot release.', 'error');
      fetchQueue(true);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Bulk approve clean items
  const executeBulkApprove = async () => {
    const ids = cleanPendingItems.slice(0, 50).map(i => i.id);
    if (ids.length === 0) return;

    setBulkLoading(true);
    try {
      const token = await getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/admin/payments/review-queue/bulk-approve', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ registrationIds: ids })
      });
      const data = await res.json();
      if (data.success) {
        setBulkResults(data);
        showToast(data.message || `Bulk approved ${data.approvedCount} registrations.`, 'success');
        fetchQueue(true);
      } else {
        showToast(data.message || 'Bulk approval failed.', 'error');
      }
    } catch {
      showToast('Network error during bulk approval.', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  // ── DESKTOP KEYBOARD SHORTCUTS (J, K, A, R) ───────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is inside an input, textarea, or modal
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (proofModalUrl || flagWarningItem || rejectingItem || reopeningItem || releasingItem || bulkModalOpen) return;

      const currentIndex = items.findIndex(i => i.id === selectedId);

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        if (currentIndex < items.length - 1) {
          setSelectedId(items[currentIndex + 1].id);
        }
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        if (currentIndex > 0) {
          setSelectedId(items[currentIndex - 1].id);
        }
      } else if (e.key === 'a' || e.key === 'A') {
        if (selectedItem && (activeTab === 'pending_review' || activeTab === 'awaiting_payment')) {
          e.preventDefault();
          handleApproveClick(selectedItem);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        if (selectedItem && (activeTab === 'pending_review' || activeTab === 'awaiting_payment')) {
          e.preventDefault();
          setRejectingItem(selectedItem);
          setRejectReason('payment_not_received');
          setRejectNote('');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, selectedId, selectedItem, activeTab, proofModalUrl, flagWarningItem, rejectingItem, reopeningItem, releasingItem, bulkModalOpen]);

  const tabs = [
    { id: 'pending_review', label: 'Pending Review', count: counts.pending_review },
    { id: 'awaiting_payment', label: 'Awaiting Payment', count: counts.awaiting_payment },
    { id: 'approved', label: 'Approved', count: counts.approved },
    { id: 'rejected', label: 'Rejected', count: counts.rejected }
  ];

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`fixed top-4 right-4 z-[200] px-4 py-2.5 rounded-full text-xs font-semibold shadow-lg backdrop-blur-md flex items-center gap-2 border ${
              toast.type === 'error'
                ? 'bg-rose-950/90 text-rose-200 border-rose-500/40'
                : toast.type === 'warning'
                ? 'bg-amber-950/90 text-amber-200 border-amber-500/40'
                : toast.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/40'
                : 'bg-surface/90 text-on-background border-outline-variant/40'
            }`}
          >
            <span className="material-symbols-outlined text-sm">
              {toast.type === 'error' ? 'error' : toast.type === 'warning' ? 'warning' : toast.type === 'success' ? 'check_circle' : 'info'}
            </span>
            <span>{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header & Tabs */}
      <div className="bg-surface rounded-2xl border border-outline-variant/20 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-on-background flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl">verified_user</span>
              Payment Verification Queue
            </h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Review proof, verify UPI reference, and manage slot confirmations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'pending_review' && cleanPendingItems.length > 0 && role === 'admin' && (
              <button
                type="button"
                onClick={() => { setBulkResults(null); setBulkModalOpen(true); }}
                className="rounded-full px-4 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">playlist_add_check</span>
                Bulk Approve Clean ({cleanPendingItems.length})
              </button>
            )}

            <button
              type="button"
              onClick={() => fetchQueue(false)}
              disabled={loading || refreshing}
              className="rounded-full px-3 py-1.5 bg-surface-variant/40 hover:bg-surface-variant border border-outline-variant/30 text-on-background text-xs font-semibold transition-all flex items-center gap-1.5"
              title="Refresh Queue"
            >
              <span className={`material-symbols-outlined text-sm ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Tab Strip */}
        <div className="flex overflow-x-auto gap-2 border-b border-outline-variant/15 pb-2 -mx-2 px-2 scrollbar-none">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all flex items-center gap-2 shrink-0 ${
                activeTab === t.id
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-variant/30 text-on-surface-variant hover:bg-surface-variant/60 hover:text-on-background'
              }`}
            >
              <span>{t.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                activeTab === t.id ? 'bg-black/20 text-white' : 'bg-surface text-on-surface-variant'
              }`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Tournament Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="sm:col-span-2 relative">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant/60 text-sm">search</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search team name, leader, District ID, UTR, or amount..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-variant/30 border border-outline-variant/20 text-xs text-on-background placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary/50 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-on-surface-variant/60 hover:text-on-background text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {!tournamentId && (
            <div>
              <select
                value={tournamentFilter}
                onChange={e => setTournamentFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-surface-variant/30 border border-outline-variant/20 text-xs text-on-background focus:outline-none focus:border-primary/50 transition-colors"
              >
                <option value="">All Tournaments</option>
                {availableTournaments.map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-on-surface-variant">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-3" />
          <p className="text-xs font-semibold">Loading verification items...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant/20 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-surface-variant/40 mx-auto flex items-center justify-center text-on-surface-variant/60">
            <span className="material-symbols-outlined text-2xl">inbox</span>
          </div>
          <h3 className="text-sm font-bold text-on-background">No items found</h3>
          <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
            {search
              ? 'No registrations match your search filter.'
              : activeTab === 'pending_review'
              ? 'All submitted payments have been reviewed!'
              : `No registrations found under ${tabs.find(t => t.id === activeTab)?.label}.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Column: Cards List */}
          <div className="lg:col-span-7 space-y-3">
            {/* Desktop helper tip */}
            <div className="hidden lg:flex items-center justify-between text-[11px] text-on-surface-variant px-1">
              <span>Showing {items.length} of {counts[activeTab] || items.length}</span>
              <span className="text-[10px] bg-surface-variant/40 px-2 py-0.5 rounded-md font-mono">
                Shortcuts: J / K (navigate) • A (approve) • R (reject)
              </span>
            </div>

            {items.map((item) => {
              const isSelected = selectedId === item.id;
              const hasFlags = item.flags?.has_flags;
              const isDueMatch = !item.flags?.amount_mismatch && item.amount_due !== null;

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`bg-surface rounded-2xl border transition-all cursor-pointer p-4 space-y-3 ${
                    isSelected
                      ? 'border-primary/60 ring-2 ring-primary/20 shadow-md'
                      : 'border-outline-variant/20 hover:border-outline-variant/40'
                  }`}
                >
                  {/* Top Bar: Team, Game, Slot */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-on-background truncate">{item.team_name}</span>
                        {item.slot_number && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                            Slot #{item.slot_number}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-on-surface-variant truncate mt-0.5">
                        {item.tournament_title} • <span className="font-semibold text-primary">{item.tournament_game}</span>
                      </p>
                    </div>

                    <span className="text-[10px] font-semibold text-on-surface-variant shrink-0 bg-surface-variant/40 px-2 py-1 rounded-full">
                      {item.waiting_display || item.age_display}
                    </span>
                  </div>

                  {/* Leader and ID */}
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant flex-wrap">
                    <span>Leader: <strong className="text-on-background font-semibold">{item.leader_name}</strong></span>
                    {item.district_id && (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-variant/50 text-on-background font-bold">
                        {item.district_id}
                      </span>
                    )}
                    {item.payment_app && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-variant/40 text-on-surface-variant">
                        via {formatPaymentApp(item.payment_app)}
                      </span>
                    )}
                  </div>

                  {/* Amount Due vs Paid & UTR */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-surface-variant/25 text-xs">
                    <div>
                      <span className="text-[10px] text-on-surface-variant/70 block">Due vs Paid</span>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="font-semibold text-on-surface-variant">
                          Due: {item.amount_due !== null ? `₹${item.amount_due}` : 'Not recorded'}
                        </span>
                        <span>•</span>
                        <span className={`font-bold flex items-center gap-1 ${
                          item.flags?.amount_mismatch
                            ? 'text-rose-400'
                            : isDueMatch
                            ? 'text-emerald-400'
                            : 'text-on-background'
                        }`}>
                          Paid: ₹{item.amount_paid !== null ? item.amount_paid : '0'}
                          {isDueMatch && <span className="text-emerald-400 text-xs font-bold">✓</span>}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-on-surface-variant/70 block">UTR Reference</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-xs font-bold text-on-background truncate">
                          {item.payment_utr || '—'}
                        </span>
                        {item.payment_utr && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleCopy(item.payment_utr, item.id); }}
                            className="p-1 rounded hover:bg-surface text-on-surface-variant hover:text-on-background transition-colors"
                            title="Copy UTR"
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {copiedUtr === item.id ? 'check' : 'content_copy'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Verification Flags */}
                  {hasFlags && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {item.flags.amount_mismatch && (
                        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">warning</span> Amount mismatch
                        </span>
                      )}
                      {item.flags.duplicate_utr && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDupModalData(item); }}
                          className="rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 hover:bg-amber-500/25 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[12px]">content_copy</span> Duplicate UTR ({item.flags.duplicate_utr_matches?.length})
                        </button>
                      )}
                      {item.flags.missing_utr && (
                        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          Missing UTR
                        </span>
                      )}
                      {item.flags.missing_proof && (
                        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          No proof screenshot
                        </span>
                      )}
                    </div>
                  )}

                  {/* Submission Timestamp & Proof Thumbnail */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-outline-variant/15 text-xs">
                    <span className="text-[11px] text-on-surface-variant font-mono">
                      {item.payment_submitted_at_ist || item.reg_created_at_ist}
                    </span>

                    {item.payment_proof_url ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProofModalUrl(item.payment_proof_url);
                          setProofZoom(1);
                        }}
                        className="rounded-full px-2.5 py-1 text-[11px] font-bold bg-surface-variant/40 hover:bg-surface-variant text-primary border border-outline-variant/30 flex items-center gap-1 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[13px]">image</span>
                        View Proof
                      </button>
                    ) : (
                      <span className="text-[11px] text-on-surface-variant/50 italic">No proof attached</span>
                    )}
                  </div>

                  {/* Mobile Actions (Visible on small screens) */}
                  <div className="lg:hidden flex items-center gap-2 pt-2 border-t border-outline-variant/15 flex-wrap">
                    {(activeTab === 'pending_review' || activeTab === 'awaiting_payment') && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleApproveClick(item); }}
                          disabled={actionLoadingId === item.id}
                          className="rounded-full px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1 disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-sm">check</span>
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setRejectingItem(item); setRejectReason('payment_not_received'); setRejectNote(''); }}
                          disabled={actionLoadingId === item.id}
                          className="rounded-full px-4 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 text-xs font-bold transition-all flex items-center gap-1 disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-sm">close</span>
                          Reject
                        </button>
                      </>
                    )}

                    {activeTab === 'awaiting_payment' && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setReleasingItem(item); setReleaseNote(''); }}
                        className="rounded-full px-3 py-1.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-bold hover:bg-amber-500/25 transition-all"
                      >
                        Release Slot
                      </button>
                    )}

                    {(activeTab === 'approved' || activeTab === 'rejected') && role === 'admin' && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setReopeningItem(item); setReopenReason(''); }}
                        className="rounded-full px-3.5 py-1.5 bg-sky-500/15 text-sky-400 border border-sky-500/30 text-xs font-bold hover:bg-sky-500/25 transition-all flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">replay</span>
                        Move to Pending
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Load More Button */}
            {hasMore && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="rounded-full px-6 py-2 bg-surface border border-outline-variant/30 text-xs font-bold text-on-background hover:bg-surface-variant transition-colors inline-flex items-center gap-2"
                >
                  {loadingMore ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      Loading more...
                    </>
                  ) : (
                    'Load More'
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Desktop Detail & Large Proof Pane */}
          <div className="hidden lg:block lg:col-span-5">
            <div className="sticky top-24 space-y-4">
              {selectedItem ? (
                <div className="bg-surface rounded-2xl border border-outline-variant/30 p-5 space-y-4 shadow-sm">
                  {/* Header Detail */}
                  <div className="flex items-start justify-between gap-3 border-b border-outline-variant/15 pb-4">
                    <div>
                      <h3 className="text-base font-bold text-on-background">{selectedItem.team_name}</h3>
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {selectedItem.tournament_title} ({selectedItem.tournament_game})
                      </p>
                    </div>
                    {selectedItem.slot_number && (
                      <span className="rounded-full px-3 py-1 bg-primary/10 text-primary border border-primary/25 text-xs font-bold">
                        Slot #{selectedItem.slot_number}
                      </span>
                    )}
                  </div>

                  {/* Large Proof Preview Container */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-on-surface-variant block uppercase tracking-wider">
                      Payment Screenshot Proof
                    </span>
                    {selectedItem.payment_proof_url ? (
                      <div
                        onClick={() => { setProofModalUrl(selectedItem.payment_proof_url); setProofZoom(1); }}
                        className="relative group rounded-xl overflow-hidden border border-outline-variant/20 bg-black/40 max-h-[300px] flex items-center justify-center cursor-zoom-in"
                      >
                        <img
                          src={selectedItem.payment_proof_url}
                          alt="Proof preview"
                          className="w-full object-contain max-h-[300px] group-hover:scale-102 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5">
                          <span className="material-symbols-outlined text-lg">zoom_in</span>
                          Click to pinch-zoom / fullscreen
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-outline-variant/30 p-8 text-center text-on-surface-variant/50 text-xs">
                        No screenshot proof attached.
                      </div>
                    )}
                  </div>

                  {/* Verification Key Points */}
                  <div className="space-y-2 text-xs bg-surface-variant/20 p-3 rounded-xl">
                    <div className="flex justify-between items-center">
                      <span className="text-on-surface-variant">Captain / Leader:</span>
                      <strong className="text-on-background">{selectedItem.leader_name}</strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-on-surface-variant">District ID:</span>
                      <strong className="font-mono text-on-background">{selectedItem.district_id || '—'}</strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-on-surface-variant">Payment App:</span>
                      <strong className="text-on-background">{formatPaymentApp(selectedItem.payment_app)}</strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-on-surface-variant">Amount Due:</span>
                      <strong className="text-on-background">
                        {selectedItem.amount_due !== null ? `₹${selectedItem.amount_due}` : 'Not recorded'}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-on-surface-variant">Amount Paid:</span>
                      <strong className={`font-bold ${selectedItem.flags?.amount_mismatch ? 'text-rose-400' : 'text-emerald-400'}`}>
                        ₹{selectedItem.amount_paid !== null ? selectedItem.amount_paid : '0'}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-on-surface-variant">Submitted At (IST):</span>
                      <strong className="font-mono text-on-background">
                        {selectedItem.payment_submitted_at_ist || selectedItem.reg_created_at_ist}
                      </strong>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 border-t border-outline-variant/15 flex items-center gap-2.5">
                    {(activeTab === 'pending_review' || activeTab === 'awaiting_payment') && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleApproveClick(selectedItem)}
                          disabled={actionLoadingId === selectedItem.id}
                          className="flex-1 rounded-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-base">check</span>
                          Approve (A)
                        </button>
                        <button
                          type="button"
                          onClick={() => { setRejectingItem(selectedItem); setRejectReason('payment_not_received'); setRejectNote(''); }}
                          disabled={actionLoadingId === selectedItem.id}
                          className="flex-1 rounded-full py-2.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 text-xs font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-base">close</span>
                          Reject (R)
                        </button>
                      </>
                    )}

                    {activeTab === 'awaiting_payment' && (
                      <button
                        type="button"
                        onClick={() => { setReleasingItem(selectedItem); setReleaseNote(''); }}
                        className="rounded-full px-4 py-2 bg-amber-500/15 text-amber-400 border border-amber-500/30 text-xs font-bold hover:bg-amber-500/25 transition-all"
                      >
                        Release Slot
                      </button>
                    )}

                    {(activeTab === 'approved' || activeTab === 'rejected') && role === 'admin' && (
                      <button
                        type="button"
                        onClick={() => { setReopeningItem(selectedItem); setReopenReason(''); }}
                        className="w-full rounded-full py-2.5 bg-sky-500/15 text-sky-400 border border-sky-500/30 text-xs font-bold hover:bg-sky-500/25 transition-all flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-base">replay</span>
                        Move back to Pending Review
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-surface rounded-2xl border border-outline-variant/30 p-8 text-center text-on-surface-variant text-xs">
                  Select an item from the queue to view full proof details and trigger shortcuts.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SHEETS & MODALS (USING SHARED BottomSheetModal) ────────────────── */}

      {/* 1. Flag Warning Sheet (Approve with flags) */}
      <BottomSheetModal
        isOpen={Boolean(flagWarningItem)}
        onClose={() => setFlagWarningItem(null)}
        title="Approve With Active Flags?"
        icon="warning"
        maxWidth="max-w-md"
        actions={
          <div className="flex items-center gap-2 justify-end w-full">
            <button
              type="button"
              onClick={() => setFlagWarningItem(null)}
              className="rounded-full px-4 py-2 text-xs font-semibold bg-surface-variant/40 hover:bg-surface-variant text-on-background transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => flagWarningItem && executeApprove(flagWarningItem.id, flagWarningNote)}
              className="rounded-full px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-black transition-colors"
            >
              Approve Anyway
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-xs text-on-surface-variant">
          <p>This registration has active flags that usually require manual verification:</p>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-1.5 text-amber-200">
            {flagWarningItem?.flags?.amount_mismatch && (
              <p>• <strong>Amount Mismatch:</strong> Due is ₹{flagWarningItem.amount_due}, but paid is ₹{flagWarningItem.amount_paid}.</p>
            )}
            {flagWarningItem?.flags?.duplicate_utr && (
              <p>• <strong>Duplicate UTR:</strong> This UTR ({flagWarningItem.payment_utr}) is already linked to other registrations.</p>
            )}
            {flagWarningItem?.flags?.missing_utr && (
              <p>• <strong>Missing UTR:</strong> No transaction reference was provided.</p>
            )}
            {flagWarningItem?.flags?.missing_proof && (
              <p>• <strong>Missing Proof:</strong> No screenshot proof was attached.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-background mb-1">
              Reviewer Note (optional)
            </label>
            <input
              type="text"
              value={flagWarningNote}
              onChange={e => setFlagWarningNote(e.target.value)}
              placeholder="e.g. Host verified offline via bank statement"
              className="w-full px-3 py-2 rounded-xl bg-surface-variant/30 border border-outline-variant/30 text-xs text-on-background focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>
      </BottomSheetModal>

      {/* 2. Rejection Sheet */}
      <BottomSheetModal
        isOpen={Boolean(rejectingItem)}
        onClose={() => setRejectingItem(null)}
        title="Reject Registration"
        icon="cancel"
        maxWidth="max-w-md"
        actions={
          <div className="flex items-center gap-2 justify-end w-full">
            <button
              type="button"
              onClick={() => setRejectingItem(null)}
              className="rounded-full px-4 py-2 text-xs font-semibold bg-surface-variant/40 hover:bg-surface-variant text-on-background transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={executeReject}
              disabled={rejectReason === 'other' && !rejectNote.trim()}
              className="rounded-full px-5 py-2 text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white transition-colors disabled:opacity-50"
            >
              Confirm Rejection
            </button>
          </div>
        }
      >
        <div className="space-y-3.5 text-xs">
          <p className="text-on-surface-variant">
            Select the primary reason for rejecting <strong>{rejectingItem?.team_name}</strong>. The player will be notified and given the option to re-upload.
          </p>

          <div className="space-y-2">
            {REJECTION_REASONS.map(r => (
              <label
                key={r.code}
                className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                  rejectReason === r.code
                    ? 'border-rose-500 bg-rose-500/10 text-on-background'
                    : 'border-outline-variant/20 bg-surface-variant/20 text-on-surface-variant hover:bg-surface-variant/40'
                }`}
              >
                <input
                  type="radio"
                  name="reject_reason"
                  value={r.code}
                  checked={rejectReason === r.code}
                  onChange={() => setRejectReason(r.code)}
                  className="mt-0.5 text-rose-500 focus:ring-0"
                />
                <span className="font-semibold">{r.label}</span>
              </label>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-background mb-1">
              Additional Note {rejectReason === 'other' ? '(Required)' : '(Optional)'}
            </label>
            <textarea
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="Explain what was wrong so the player can correct their submission..."
              rows={3}
              className="w-full px-3 py-2 rounded-xl bg-surface-variant/30 border border-outline-variant/30 text-xs text-on-background focus:outline-none focus:border-rose-400 resize-none"
            />
          </div>
        </div>
      </BottomSheetModal>

      {/* 3. Reopen Sheet (Admins only) */}
      <BottomSheetModal
        isOpen={Boolean(reopeningItem)}
        onClose={() => setReopeningItem(null)}
        title="Move Back to Pending Review"
        icon="replay"
        maxWidth="max-w-md"
        actions={
          <div className="flex items-center gap-2 justify-end w-full">
            <button
              type="button"
              onClick={() => setReopeningItem(null)}
              className="rounded-full px-4 py-2 text-xs font-semibold bg-surface-variant/40 hover:bg-surface-variant text-on-background transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={executeReopen}
              disabled={!reopenReason.trim()}
              className="rounded-full px-5 py-2 text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white transition-colors disabled:opacity-50"
            >
              Confirm Reopen
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          <p className="text-on-surface-variant">
            Moving <strong>{reopeningItem?.team_name}</strong> back to pending review will reset its status and allow reviewers to re-evaluate proof.
          </p>

          <div>
            <label className="block text-xs font-semibold text-on-background mb-1">
              Reason for reopening (Required)
            </label>
            <textarea
              value={reopenReason}
              onChange={e => setReopenReason(e.target.value)}
              placeholder="State why this registration is being returned to pending review..."
              rows={3}
              className="w-full px-3 py-2 rounded-xl bg-surface-variant/30 border border-outline-variant/30 text-xs text-on-background focus:outline-none focus:border-sky-400 resize-none"
            />
          </div>
        </div>
      </BottomSheetModal>

      {/* 4. Release Slot Sheet */}
      <BottomSheetModal
        isOpen={Boolean(releasingItem)}
        onClose={() => setReleasingItem(null)}
        title="Release Reserved Slot"
        icon="person_remove"
        maxWidth="max-w-md"
        actions={
          <div className="flex items-center gap-2 justify-end w-full">
            <button
              type="button"
              onClick={() => setReleasingItem(null)}
              className="rounded-full px-4 py-2 text-xs font-semibold bg-surface-variant/40 hover:bg-surface-variant text-on-background transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={executeReleaseSlot}
              className="rounded-full px-5 py-2 text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white transition-colors"
            >
              Release & Cancel
            </button>
          </div>
        }
      >
        <div className="space-y-3 text-xs text-on-surface-variant">
          <p>
            Are you sure you want to release <strong>Slot #{releasingItem?.slot_number || 'allocated'}</strong> reserved for team <strong>{releasingItem?.team_name}</strong>?
          </p>
          <p className="text-rose-400">
            This will mark the registration as cancelled and immediately make the slot available for other teams.
          </p>
          <div>
            <label className="block text-xs font-semibold text-on-background mb-1">
              Internal Note (optional)
            </label>
            <input
              type="text"
              value={releaseNote}
              onChange={e => setReleaseNote(e.target.value)}
              placeholder="e.g. Payment timeout exceeded"
              className="w-full px-3 py-2 rounded-xl bg-surface-variant/30 border border-outline-variant/30 text-xs text-on-background focus:outline-none focus:border-rose-400"
            />
          </div>
        </div>
      </BottomSheetModal>

      {/* 5. Duplicate UTR Matches Sheet */}
      <BottomSheetModal
        isOpen={Boolean(dupModalData)}
        onClose={() => setDupModalData(null)}
        title="Duplicate UTR Matches"
        icon="content_copy"
        maxWidth="max-w-md"
        actions={
          <button
            type="button"
            onClick={() => setDupModalData(null)}
            className="rounded-full px-5 py-2 text-xs font-semibold bg-surface-variant/40 hover:bg-surface-variant text-on-background transition-colors"
          >
            Close
          </button>
        }
      >
        <div className="space-y-3 text-xs">
          <p className="text-on-surface-variant">
            UTR <strong>{dupModalData?.payment_utr}</strong> was also submitted by:
          </p>
          <div className="space-y-2">
            {dupModalData?.flags?.duplicate_utr_matches?.map((m, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-surface-variant/30 border border-outline-variant/20 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-on-background">{m.teamName}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {m.status}
                  </span>
                </div>
                <p className="text-[11px] text-on-surface-variant">{m.tournamentTitle}</p>
                <p className="text-[10px] font-mono text-on-surface-variant/70">ID: {m.registrationId}</p>
              </div>
            ))}
          </div>
        </div>
      </BottomSheetModal>

      {/* 6. Bulk Approve Sheet */}
      <BottomSheetModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        title="Bulk Approve Clean Payments"
        icon="playlist_add_check"
        maxWidth="max-w-lg"
        actions={
          <div className="flex items-center gap-2 justify-end w-full">
            <button
              type="button"
              onClick={() => setBulkModalOpen(false)}
              className="rounded-full px-4 py-2 text-xs font-semibold bg-surface-variant/40 hover:bg-surface-variant text-on-background transition-colors"
            >
              {bulkResults ? 'Done' : 'Cancel'}
            </button>
            {!bulkResults && (
              <button
                type="button"
                onClick={executeBulkApprove}
                disabled={bulkLoading || cleanPendingItems.length === 0}
                className="rounded-full px-5 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {bulkLoading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Approving...
                  </>
                ) : (
                  `Approve ${Math.min(50, cleanPendingItems.length)} Items`
                )}
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-3 text-xs">
          {!bulkResults ? (
            <>
              <p className="text-on-surface-variant">
                Bulk approval safely skips any registrations with verification flags (mismatches, missing UTR, duplicates). Only clean items are processed up to 50 at a time.
              </p>
              <div className="p-3 rounded-xl bg-surface-variant/20 border border-outline-variant/20 text-on-surface-variant">
                <span className="font-bold text-emerald-400">{cleanPendingItems.length}</span> clean registrations ready for instant bulk approval.
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-semibold">
                {bulkResults.message}
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1.5 divide-y divide-outline-variant/10">
                {bulkResults.results?.approved?.map((item, idx) => (
                  <div key={idx} className="pt-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-on-background font-semibold">{item.teamName || item.id}</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">✓ Approved</span>
                  </div>
                ))}
                {bulkResults.results?.skipped?.map((item, idx) => (
                  <div key={idx} className="pt-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-on-surface-variant font-mono">{item.id}</span>
                    <span className="text-amber-400 font-semibold">{item.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </BottomSheetModal>

      {/* 7. Fullscreen Pinch-Zoom Proof Modal */}
      <AnimatePresence>
        {proofModalUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[220] bg-black/90 backdrop-blur-md flex flex-col p-4"
            onClick={() => setProofModalUrl(null)}
          >
            {/* Modal Top Bar */}
            <div className="flex items-center justify-between text-white pb-3" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-primary">receipt_long</span>
                <span className="text-xs font-bold">Screenshot Proof Viewer</span>
              </div>

              {/* Zoom Controls */}
              <div className="flex items-center gap-1.5 bg-white/10 px-2 py-1 rounded-full border border-white/15">
                <button
                  type="button"
                  onClick={() => setProofZoom(prev => Math.max(0.5, prev - 0.25))}
                  className="w-7 h-7 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors text-white"
                  title="Zoom Out"
                >
                  <span className="material-symbols-outlined text-sm">remove</span>
                </button>
                <span className="text-[11px] font-mono px-1">{Math.round(proofZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setProofZoom(prev => Math.min(3, prev + 0.25))}
                  className="w-7 h-7 flex items-center justify-center hover:bg-white/20 rounded-full transition-colors text-white"
                  title="Zoom In"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProofZoom(1)}
                  className="px-2 py-0.5 hover:bg-white/20 rounded-full text-[10px] font-bold text-white/80 transition-colors"
                >
                  Reset
                </button>
              </div>

              <button
                type="button"
                onClick={() => setProofModalUrl(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Modal Image Body with Zoom */}
            <div
              className="flex-1 flex items-center justify-center overflow-auto p-2"
              onClick={e => e.stopPropagation()}
            >
              <img
                src={proofModalUrl}
                alt="Proof Fullscreen"
                style={{ transform: `scale(${proofZoom})`, transition: 'transform 0.15s ease-out' }}
                className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl cursor-grab"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
