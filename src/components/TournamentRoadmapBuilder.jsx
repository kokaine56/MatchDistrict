import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CalendarDays, Map, Layers, LayoutGrid, Clock, Users, Swords,
  CheckCircle2, AlertCircle, RefreshCw, X, ChevronDown, ChevronRight,
  ShieldCheck, Pencil, XCircle, Save, BadgeCheck, Trash2
} from 'lucide-react';
import { getAuthToken } from '../utils/getAuthToken';

const STATUS_STYLES = {
  pending: {
    banner: 'bg-amber-500/10 border-amber-500/20',
    icon: 'text-amber-400',
    title: 'No Roadmap Generated',
    desc: 'Generate the structural roadmap from your approved capacity plan.'
  },
  draft: {
    banner: 'bg-indigo-500/10 border-indigo-500/20',
    icon: 'text-indigo-400',
    title: 'Draft Roadmap',
    desc: 'Review the structure, adjust match timings or day dates, then validate and approve.'
  },
  approved: {
    banner: 'bg-emerald-500/10 border-emerald-500/20',
    icon: 'text-emerald-400',
    title: 'Roadmap Approved',
    desc: 'This roadmap is locked and ready for team allocation. Regenerate a new draft to edit.'
  }
};

export default function TournamentRoadmapBuilder({
  tournamentId,
  tournamentTitle,
  onClose,
  onApproved
}) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [roadmapStatus, setRoadmapStatus] = useState('pending');
  const [roadmap, setRoadmap] = useState(null);

  const [expandedDays, setExpandedDays] = useState({});
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedRooms, setExpandedRooms] = useState({});

  // Staged edits: { matches: { id: start_time }, days: { id: date } }
  const [staged, setStaged] = useState({ matches: {}, days: {} });
  const [editingMatchId, setEditingMatchId] = useState(null);
  const [editingDayId, setEditingDayId] = useState(null);

  const [validation, setValidation] = useState(null); // { valid, errors, warnings }
  const [confirmDialog, setConfirmDialog] = useState(null); // 'approve' | 'regenerate' | null

  const fetchRoadmap = useCallback(async () => {
    setLoading(true);
    setError(null);
    setValidation(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to fetch roadmap.');
      }
      setRoadmapStatus(data.roadmap_status);
      const rd = data.roadmap;
      if (rd && rd.days && rd.days.length > 0) {
        setRoadmap(rd);
        setExpandedDays(Object.fromEntries(rd.days.map((day) => [day.id, true])));
        setExpandedGroups(Object.fromEntries((rd.groups || []).map((group) => [group.id, true])));
        setExpandedRooms(Object.fromEntries((rd.rooms || []).map((room) => [room.id, true])));
      } else {
        setRoadmap(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) fetchRoadmap()
    })
    return () => {
      cancelled = true
    }
  }, [fetchRoadmap]);

  const tokenHeader = useCallback(async () => {
    const token = await getAuthToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const roundOf = useMemo(() => {
    const m = new Map();
    (roadmap?.rounds || []).forEach((r) => m.set(r.id, r));
    return m;
  }, [roadmap]);

  const assignmentCounts = useMemo(() => {
    const m = new Map();
    (roadmap?.assignments || []).forEach((a) => {
      m.set(a.match_id, (m.get(a.match_id) || 0) + 1);
    });
    return m;
  }, [roadmap]);

  const pendingCount = Object.keys(staged.matches).length + Object.keys(staged.days).length;

  // ── Mutations ─────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setSuccess(null);
    setValidation(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/generate`, {
        method: 'POST',
        headers: await tokenHeader()
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to generate roadmap.');
      }
      setRoadmapStatus('draft');
      setRoadmap(data.roadmap);
      setStaged({ matches: {}, days: {} });
      setEditingMatchId(null);
      setEditingDayId(null);
      if (data.roadmap.days.length > 0) {
        setExpandedDays(Object.fromEntries(data.roadmap.days.map((day) => [day.id, true])));
        setExpandedGroups(Object.fromEntries((data.roadmap.groups || []).map((group) => [group.id, true])));
        setExpandedRooms(Object.fromEntries((data.roadmap.rooms || []).map((room) => [room.id, true])));
      }
      setSuccess('Roadmap generated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
      setConfirmDialog(null);
    }
  };

  // Flush staged edits to their PUT endpoints, then refresh local rows.
  const flushStaged = async () => {
    if (pendingCount === 0) return { flushed: 0 };
    const headers = await tokenHeader();
    const flushed = { matches: {}, days: {} };

    for (const [id, start_time] of Object.entries(staged.matches)) {
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/matches/${id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_time })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to save match edit.');
      }
      flushed.matches[id] = data.match || { start_time };
    }

    for (const [id, date] of Object.entries(staged.days)) {
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/days/${id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date })
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to save day edit.');
      }
      flushed.days[id] = data.day || { date };
    }

    // Merge flushed values into the local roadmap copy.
    setRoadmap((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      next.matches = (prev.matches || []).map((m) => ({ ...m, ...(flushed.matches[m.id] || {}) }));
      next.days = (prev.days || []).map((d) => ({ ...d, ...(flushed.days[d.id] || {}) }));
      return next;
    });
    setStaged({ matches: {}, days: {} });
    setEditingMatchId(null);
    setEditingDayId(null);
    return { flushed: Object.keys(flushed.matches).length + Object.keys(flushed.days).length };
  };

  const runValidate = async () => {
    const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/validate`, {
      method: 'POST',
      headers: await tokenHeader()
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.message || data.error || 'Failed to validate roadmap.');
    }
    return { valid: data.valid, errors: data.errors || [], warnings: data.warnings || [] };
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    setValidation(null);
    try {
      const { flushed } = await flushStaged();
      const v = await runValidate();
      setValidation(v);
      setSuccess(
        flushed > 0
          ? `Saved ${flushed} edit${flushed === 1 ? '' : 's'} and validated the roadmap.`
          : 'Roadmap validated.'
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    setError(null);
    setSuccess(null);
    setValidation(null);
    try {
      const { flushed } = await flushStaged();
      const v = await runValidate();
      setValidation(v);
      if (flushed > 0 && v.valid) {
        setSuccess(`${flushed} edit${flushed === 1 ? '' : 's'} saved and roadmap is structurally sound.`);
      } else if (v.valid) {
        setSuccess('Roadmap is structurally sound.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setValidating(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    setError(null);
    setSuccess(null);
    setValidation(null);
    try {
      await flushStaged();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/approve`, {
        method: 'POST',
        headers: await tokenHeader()
      });
      const data = await res.json();
      if (!data.success) {
        if (data.details && Array.isArray(data.details.errors)) {
          setValidation({ valid: false, errors: data.details.errors, warnings: data.details.warnings || [] });
        }
        throw new Error(data.message || data.error || 'Failed to approve roadmap.');
      }
      setRoadmapStatus('approved');
      setSuccess('Roadmap approved.');
      if (onApproved) onApproved();
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
      setConfirmDialog(null);
    }
  };

  const stageMatch = (id, start_time) => setStaged((p) => ({ ...p, matches: { ...p.matches, [id]: start_time } }));
  const stageDay = (id, date) => setStaged((p) => ({ ...p, days: { ...p.days, [id]: date } }));
  const clearStageMatch = (id) =>
    setStaged((p) => {
      const next = { ...p, matches: { ...p.matches } };
      delete next.matches[id];
      return next;
    });
  const clearStageDay = (id) =>
    setStaged((p) => {
      const next = { ...p, days: { ...p.days } };
      delete next.days[id];
      return next;
    });

  const toggleDay = (id) => setExpandedDays((p) => ({ ...p, [id]: !p[id] }));
  const toggleGroup = (id) => setExpandedGroups((p) => ({ ...p, [id]: !p[id] }));
  const toggleRoom = (id) => setExpandedRooms((p) => ({ ...p, [id]: !p[id] }));

  const statusCfg = STATUS_STYLES[roadmapStatus] || STATUS_STYLES.pending;
  const inputCls =
    'bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500/50 [color-scheme:dark]';

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-[#0A0B10] border border-white/10 rounded-xl p-8 shadow-xl max-w-md w-full flex flex-col items-center justify-center">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
          <p className="text-gray-300">Loading roadmap...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-[#07080C] border border-white/10 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#07080C]/90 backdrop-blur-md border-b border-white/10 p-5 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Map className="w-6 h-6 text-indigo-400" />
              Tournament Roadmap Builder
            </h2>
            <p className="text-sm text-gray-400 mt-1">{tournamentTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close roadmap builder"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl flex items-start gap-3 mb-6">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl flex items-start gap-3 mb-6">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{success}</p>
            </div>
          )}

          {/* Status Banner */}
          <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 ${statusCfg.banner}`}>
            <div className="flex items-center gap-3">
              {roadmapStatus === 'approved' ? (
                <ShieldCheck className={`w-6 h-6 ${statusCfg.icon}`} />
              ) : (
                <AlertCircle className={`w-6 h-6 ${statusCfg.icon}`} />
              )}
              <div>
                <h3 className={`font-semibold ${statusCfg.icon}`}>{statusCfg.title}</h3>
                <p className="text-sm text-gray-400">{statusCfg.desc}</p>
              </div>
            </div>
            {roadmapStatus === 'pending' && !roadmap && (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 shrink-0"
              >
                {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Map className="w-4 h-4" />}
                Generate Roadmap
              </button>
            )}
          </div>

          {!roadmap ? (
            <div className="text-center py-12">
              <Map className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">No Roadmap Exists</h3>
              <p className="text-gray-400 max-w-md mx-auto mb-6">
                A structured roadmap has not been generated for this tournament yet. You must have an approved
                capacity plan before generating the roadmap.
              </p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors flex items-center gap-2 mx-auto disabled:opacity-50"
              >
                {generating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Map className="w-5 h-5" />}
                Generate Roadmap
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Validation Result */}
              {validation && (
                <div className="space-y-2">
                  {validation.valid ? (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl flex items-center gap-3">
                      <BadgeCheck className="w-5 h-5 flex-shrink-0" />
                      <p className="text-sm font-medium">Roadmap is structurally sound.</p>
                    </div>
                  ) : (
                    <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl">
                      <div className="flex items-center gap-3 text-rose-400 mb-2">
                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                        <p className="text-sm font-medium">Blocking errors found — approve is disabled until these are resolved.</p>
                      </div>
                      <ul className="space-y-1 pl-8">
                        {validation.errors.map((e, i) => (
                          <li key={`e-${i}`} className="text-xs text-rose-400/90 list-disc">{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {validation.warnings.length > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl">
                      <p className="text-amber-400 text-sm font-medium mb-1.5">Non-blocking warnings</p>
                      <ul className="space-y-1 pl-8">
                        {validation.warnings.map((w, i) => (
                          <li key={`w-${i}`} className="text-xs text-amber-400/90 list-disc">{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { icon: CalendarDays, label: 'Days', value: roadmap.days.length },
                  { icon: Layers, label: 'Groups', value: roadmap.groups.length },
                  { icon: LayoutGrid, label: 'BGMI Rooms', value: roadmap.rooms.length },
                  { icon: Swords, label: 'Matches', value: roadmap.matches.length }
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                    <Icon className="w-5 h-5 text-gray-400 mb-2" />
                    <div className="text-2xl font-black text-white">{value}</div>
                    <div className="text-xs text-gray-500 uppercase font-semibold mt-1">{label}</div>
                  </div>
                ))}
              </div>

              {/* Edit hint for drafts */}
              {roadmapStatus === 'draft' && (
                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 flex items-center gap-3">
                  <Pencil className="w-4 h-4 text-indigo-400 shrink-0" />
                  <p className="text-xs text-gray-400">
                    Click the pencil on any day or match to adjust its date or start time. Changes are staged and
                    only written to the database when you press{' '}
                    <span className="text-gray-200 font-semibold">Save Draft</span> or{' '}
                    <span className="text-gray-200 font-semibold">Approve</span>.
                  </p>
                </div>
              )}

              {/* Roadmap Hierarchy Tree */}
              <div className="bg-[#0A0B10] border border-white/10 rounded-xl overflow-hidden">
                <div className="p-4 bg-white/5 border-b border-white/10 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-white">Structural Preview</h3>
                    <p className="text-xs text-gray-400 mt-1">Groups keep the same teams for all matches; every match has its own scheduled BGMI room.</p>
                  </div>
                  {pendingCount > 0 && (
                    <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-1 rounded-lg font-semibold">
                      {pendingCount} pending edit{pendingCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                <div className="p-2 space-y-1 max-h-[500px] overflow-y-auto">
                  {roadmap.days.map((day) => {
                    const dayGroups = roadmap.groups.filter((g) => g.day_id === day.id);
                    const isExpandedDay = expandedDays[day.id];
                    const round = roundOf.get(day.round_id);
                    const isDraftMode = roadmapStatus === 'draft';
                    const dayIsEditing = editingDayId === day.id;
                    const stagedDate = staged.days[day.id];

                    return (
                      <div key={day.id} className="border border-white/5 rounded-lg overflow-hidden">
                        <button
                          onClick={toggleDay(day.id)}
                          className={`w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors bg-[#0D0E15] ${dayIsEditing ? 'cursor-default' : ''}`}
                        >
                          {isExpandedDay ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                          <CalendarDays className="w-5 h-5 text-indigo-400" />
                          <span className="font-bold text-white flex-1">Day {day.day_number}</span>
                          {round && (
                            <span className="text-xs bg-indigo-500/15 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30 font-semibold">
                              Round {round.round_number}
                            </span>
                          )}
                          {dayIsEditing && (
                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="date"
                                className={inputCls}
                                value={stagedDate ?? day.date}
                                onChange={(e) => stageDay(day.id, e.target.value)}
                              />
                              <button
                                onClick={() => { setEditingDayId(null); clearStageDay(day.id); }}
                                className="p-1 text-gray-400 hover:text-rose-400 rounded"
                                aria-label="Cancel day edit"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                          {!dayIsEditing && <span className="text-sm text-gray-500">{day.date}</span>}
                          <span className="text-xs bg-white/10 px-2 py-1 rounded text-gray-300">{dayGroups.length} Groups</span>
                          {isDraftMode && !dayIsEditing && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingDayId(day.id); }}
                              className="p-1.5 text-gray-400 hover:text-indigo-300 rounded hover:bg-white/5"
                              aria-label="Edit day date"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </button>

                        {isExpandedDay && (
                          <div className="p-3 pl-9 space-y-2 bg-[#0A0B10]">
                            {dayGroups.map((group) => {
                              const groupRooms = roadmap.rooms.filter((r) => r.group_id === group.id);
                              const groupMatchIds = new Set(roadmap.matches.filter((match) => match.group_id === group.id).map((match) => match.id));
                              const groupAssignedTeams = new Set((roadmap.assignments || []).filter((assignment) => groupMatchIds.has(assignment.match_id)).map((assignment) => assignment.tournament_team_id));
                              const groupCapacity = Math.max(0, ...groupRooms.map((room) => Number(room.capacity) || 0));
                              const isExpandedGroup = expandedGroups[group.id];
                              return (
                                <div key={group.id} className="border border-white/5 rounded-lg overflow-hidden">
                                  <button
                                    onClick={() => toggleGroup(group.id)}
                                    className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-white/5 transition-colors bg-white/[0.02]"
                                  >
                                    {isExpandedGroup ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                                    <Layers className="w-4 h-4 text-emerald-400" />
                                    <span className="font-semibold text-gray-200 flex-1">{group.group_name}</span>
                                    <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-gray-300">{groupCapacity || '—'} teams · {groupRooms.length} matches</span>
                                    {groupAssignedTeams.size > 0 && <span className="text-[10px] text-emerald-300">{groupAssignedTeams.size} allocated</span>}
                                  </button>

                                  {isExpandedGroup && (
                                    <div className="p-2 pl-9 space-y-2">
                                      {groupRooms.map((room) => {
                                        const roomMatches = roadmap.matches
                                          .filter((m) => m.room_id === room.id)
                                          .sort((a, b) => a.match_number - b.match_number);
                                        const isExpandedRoom = expandedRooms[room.id];
                                        return (
                                          <div key={room.id} className="border border-white/5 rounded-lg overflow-hidden">
                                            <button
                                              onClick={() => toggleRoom(room.id)}
                                              className="w-full flex items-center gap-3 p-2 text-left hover:bg-white/5 transition-colors"
                                            >
                                              {isExpandedRoom ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
                                              <LayoutGrid className="w-4 h-4 text-amber-400" />
                                              <span className="font-medium text-sm text-gray-300 flex-1">Match {roomMatches[0]?.match_number ?? '—'}</span>
                                              <span className="text-[10px] uppercase tracking-wide text-amber-300">BGMI Room {room.room_number}</span>
                                              <span className="flex items-center gap-1 text-xs text-gray-500">
                                                <Users className="w-3 h-3" /> {room.capacity} team slots
                                              </span>
                                            </button>

                                            {isExpandedRoom && (
                                              <div className="p-2 pl-9 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-black/20 rounded-b-lg">
                                                {roomMatches.map((match) => {
                                                  const isEditing = editingMatchId === match.id;
                                                  const stagedTime = staged.matches[match.id];
                                                  const assigned = assignmentCounts.get(match.id) || 0;
                                                  const matchDay = roadmap.days.find((scheduledDay) => scheduledDay.id === match.day_id);
                                                  const matchRound = roundOf.get(match.round_id);
                                                  return (
                                                    <div key={match.id} className="bg-white/5 border border-white/10 p-2 rounded flex items-center justify-between gap-2">
                                                      <div className="min-w-0">
                                                        <span className="text-xs font-semibold text-gray-200">{matchRound?.name?.toLowerCase().includes('final') ? 'Final' : matchRound?.round_number === 1 ? 'Qualifier' : 'Match'} {match.match_number}</span>
                                                        <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-gray-500">
                                                          <span>{matchDay?.date || 'Date TBD'}</span>
                                                          {matchRound?.map && <span>{matchRound.map}</span>}
                                                          <span>{match.status || 'Scheduled'}</span>
                                                        </div>
                                                      </div>
                                                      <span className="flex items-center gap-1.5">
                                                        {isEditing ? (
                                                          <span className="flex items-center gap-1 text-xs text-gray-400 bg-black/30 px-2 py-0.5 rounded">
                                                            <Clock className="w-3 h-3" />
                                                            <input
                                                              type="time"
                                                              className={`${inputCls} !py-0.5 !px-1.5`}
                                                              value={stagedTime ?? match.start_time}
                                                              onChange={(e) => stageMatch(match.id, e.target.value)}
                                                            />
                                                            <button
                                                              onClick={() => { setEditingMatchId(null); clearStageMatch(match.id); }}
                                                              className="text-gray-400 hover:text-rose-400"
                                                              aria-label="Cancel match edit"
                                                            >
                                                              <XCircle className="w-3.5 h-3.5" />
                                                            </button>
                                                          </span>
                                                        ) : (
                                                          <span className="flex items-center gap-1 text-xs text-gray-400 bg-black/30 px-2 py-0.5 rounded">
                                                            <Clock className="w-3 h-3" />
                                                            {stagedTime || match.start_time} - {match.end_time}
                                                            {assigned > 0 && (
                                                              <span className="text-[10px] bg-white/10 text-gray-300 px-1.5 py-0.5 rounded ml-1">{assigned} teams</span>
                                                            )}
                                                          </span>
                                                        )}
                                                        {isDraftMode && !isEditing && (
                                                          <button
                                                            onClick={() => setEditingMatchId(match.id)}
                                                            className="p-1 text-gray-500 hover:text-indigo-300 rounded hover:bg-white/5"
                                                            aria-label="Edit match start time"
                                                          >
                                                            <Pencil className="w-3 h-3" />
                                                          </button>
                                                        )}
                                                      </span>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {roadmap && roadmapStatus === 'draft' && (
          <div className="bg-white/5 border-t border-white/10 p-4 shrink-0 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleValidate}
                disabled={validating}
                className="text-sm text-gray-300 hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-lg"
              >
                {validating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
                Validate
              </button>
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="text-sm text-gray-300 hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-lg"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Draft
              </button>
              <button
                onClick={() => setConfirmDialog('regenerate')}
                disabled={generating}
                className="text-sm text-amber-400/80 hover:text-amber-300 transition-colors flex items-center gap-2 disabled:opacity-50 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
                Regenerate
              </button>
            </div>
            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-500 hidden sm:block">
                {validation !== null && !validation.valid
                  ? 'Resolve blocking errors to approve.'
                  : 'Approval is required before slot allocation.'}
              </p>
              <button
                onClick={() => setConfirmDialog('approve')}
                disabled={approving || (validation !== null && !validation.valid)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {approving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Approve Roadmap
              </button>
            </div>
          </div>
        )}

        {/* Confirm dialog */}
        <AnimatePresence>
          {confirmDialog && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm rounded-2xl"
              onClick={() => setConfirmDialog(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#0A0B10] border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3 mb-3">
                  {confirmDialog === 'approve' ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-amber-400" />
                  )}
                  <h3 className="text-lg font-bold text-white">
                    {confirmDialog === 'approve' ? 'Approve Roadmap?' : 'Regenerate Roadmap?'}
                  </h3>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {confirmDialog === 'approve'
                    ? 'Approving locks the roadmap and makes it available for team allocation. Pending edits will be saved first. An approved roadmap cannot be edited in place.'
                    : 'Regenerating replaces the current draft with a freshly generated schedule. Any pending edits will be discarded. An approved roadmap cannot be regenerated.'}
                </p>
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setConfirmDialog(null)}
                    className="flex-1 py-2.5 rounded-lg border border-white/10 text-gray-300 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmDialog === 'approve' ? handleApprove : handleGenerate}
                    disabled={confirmDialog === 'approve' ? approving : generating}
                    className={`flex-1 py-2.5 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-50 ${
                      confirmDialog === 'approve'
                        ? 'bg-emerald-600 hover:bg-emerald-500'
                        : 'bg-amber-600 hover:bg-amber-500'
                    }`}
                  >
                    {confirmDialog === 'approve' ? 'Approve' : 'Regenerate'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
