import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Map as MapIcon, Sliders, Check, Copy, FileText, Layers } from 'lucide-react';
import { getRoadmapTheme } from './RoadmapTheme';

const DEFAULT_MAPS = {
  bgmi: ['Erangel', 'Miramar', 'Rondo', 'Sanhok', 'Vikendi', 'Livik', 'Karakin', 'Nusa'],
  'battlegrounds mobile india': ['Erangel', 'Miramar', 'Rondo', 'Sanhok', 'Vikendi', 'Livik', 'Karakin', 'Nusa'],
  freefire: ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NexTerra'],
  'free fire': ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NexTerra'],
  codm: ['Crash', 'Standoff', 'Raid', 'Crossfire', 'Summit'],
  'cod mobile': ['Crash', 'Standoff', 'Raid', 'Crossfire', 'Summit'],
  valorant: ['Ascent', 'Haven', 'Bind', 'Split', 'Sunset'],
};

export default function RoadmapDistrictSettingsModal({
  isOpen,
  onClose,
  allocation = null,
  dayNumber = 1,
  game = 'bgmi',
  onSave,
  onApplyToAllOnDay,
  cardColor = 'white',
}) {
  const theme = getRoadmapTheme(cardColor);

  // Initial state derived from allocation
  const [matchCount, setMatchCount] = useState(
    allocation?.match_count || (Array.isArray(allocation?.matches) ? allocation.matches.length : 1) || 1
  );
  const [startTime, setStartTime] = useState(
    allocation?.matches?.[0]?.start_time || '13:00'
  );
  const [selectedMap, setSelectedMap] = useState(
    allocation?.matches?.[0]?.map || 'Erangel'
  );
  const initialDuration = (() => {
    const m = allocation?.matches?.[0];
    if (m?.start_time && m?.end_time) {
      const [sh, sm] = m.start_time.split(':').map(Number);
      const [eh, em] = m.end_time.split(':').map(Number);
      if (!isNaN(sh) && !isNaN(sm) && !isNaN(eh) && !isNaN(em)) {
        const diff = (eh * 60 + em) - (sh * 60 + sm);
        if (diff > 0) return diff;
      }
    }
    return 30;
  })();

  const initialGap = (() => {
    const m1 = allocation?.matches?.[0];
    const m2 = allocation?.matches?.[1];
    if (m1?.start_time && m2?.start_time) {
      const [s1h, s1m] = m1.start_time.split(':').map(Number);
      const [s2h, s2m] = m2.start_time.split(':').map(Number);
      if (!isNaN(s1h) && !isNaN(s1m) && !isNaN(s2h) && !isNaN(s2m)) {
        const diff = (s2h * 60 + s2m) - (s1h * 60 + s1m);
        if (diff > 0) return diff;
      }
    }
    return 60;
  })();

  const [durationMinutes, setDurationMinutes] = useState(initialDuration);
  const [gapMinutes, setGapMinutes] = useState(initialGap);
  const [notes, setNotes] = useState(
    allocation?.matches?.[0]?.notes || ''
  );
  const [appliedNotice, setAppliedNotice] = useState(false);

  if (!isOpen || !allocation) return null;

  const gameKey = (game || 'bgmi').toLowerCase().trim();
  const mapOptions = DEFAULT_MAPS[gameKey] || DEFAULT_MAPS.bgmi;
  const isCustomMapSelected = !mapOptions.includes(selectedMap);

  const handleSaveIndividual = () => {
    const finalMap = isCustomMapSelected ? (customMap.trim() || 'Erangel') : selectedMap;
    onSave({
      matchCount: Math.max(1, parseInt(matchCount, 10) || 1),
      startTime,
      map: finalMap,
      durationMinutes: Math.max(10, parseInt(durationMinutes, 10) || 30),
      gapMinutes: Math.max(15, parseInt(gapMinutes, 10) || 60),
      notes: notes.trim(),
    });
    onClose();
  };

  const handleApplyToAll = () => {
    const finalMap = isCustomMapSelected ? (customMap.trim() || 'Erangel') : selectedMap;
    onApplyToAllOnDay({
      matchCount: Math.max(1, parseInt(matchCount, 10) || 1),
      startTime,
      map: finalMap,
      durationMinutes: Math.max(10, parseInt(durationMinutes, 10) || 30),
      gapMinutes: Math.max(15, parseInt(gapMinutes, 10) || 60),
      notes: notes.trim(),
    });
    setAppliedNotice(true);
    setTimeout(() => {
      setAppliedNotice(false);
      onClose();
    }, 600);
  };

  return (
    <AnimatePresence>
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${theme.modalOverlay}`}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className={`w-full max-w-lg rounded-2xl ${theme.modalBg} overflow-hidden shadow-2xl`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${theme.isGold ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-lg font-bold ${theme.headingText}`}>
                  {allocation.district_name || allocation.name || 'District'} Settings
                </h3>
                <p className={`text-xs ${theme.mutedText}`}>
                  Day {dayNumber} match timing, map selection & schedule properties
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Match Count & Start Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${theme.mutedText}`}>
                  Matches on Day {dayNumber}
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={matchCount}
                  onChange={(e) => setMatchCount(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-bold ${theme.inputBg}`}
                />
                <span className="text-[11px] text-slate-500 mt-1 block">Number of matches played by this district</span>
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${theme.mutedText}`}>
                  First Match Start Time (IST)
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-bold ${theme.inputBg}`}
                />
                <span className="text-[11px] text-slate-500 mt-1 block">Format: HH:MM (24h IST)</span>
              </div>
            </div>

            {/* Map Selection */}
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${theme.mutedText}`}>
                Map
              </label>
              <select
                value={isCustomMapSelected ? 'custom' : selectedMap}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setSelectedMap('Custom');
                  } else {
                    setSelectedMap(e.target.value);
                  }
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold ${theme.inputBg}`}
              >
                {mapOptions.map((m) => (
                  <option key={m} value={m} className="bg-slate-900 text-white">
                    {m}
                  </option>
                ))}
                <option value="custom" className="bg-slate-900 text-white">
                  Other / Custom Map...
                </option>
              </select>

              {isCustomMapSelected && (
                <input
                  type="text"
                  placeholder="Enter custom map name"
                  value={customMap}
                  onChange={(e) => setCustomMap(e.target.value)}
                  className={`w-full mt-2 px-3.5 py-2.5 rounded-xl text-sm font-medium ${theme.inputBg}`}
                />
              )}
            </div>

            {/* Match Duration & Gap */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${theme.mutedText}`}>
                  Match Duration (mins)
                </label>
                <input
                  type="number"
                  min="10"
                  max="120"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-bold ${theme.inputBg}`}
                />
                <span className="text-[11px] text-slate-500 mt-1 block">Default: 30 minutes</span>
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${theme.mutedText}`}>
                  Interval Gap (mins)
                </label>
                <input
                  type="number"
                  min="15"
                  max="180"
                  value={gapMinutes}
                  onChange={(e) => setGapMinutes(e.target.value)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-bold ${theme.inputBg}`}
                />
                <span className="text-[11px] text-slate-500 mt-1 block">Start-to-start interval (e.g. 60m)</span>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${theme.mutedText}`}>
                Match Notes (Optional)
              </label>
              <textarea
                rows="2"
                placeholder="e.g. Streamed live on YouTube, lobby host details, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-normal ${theme.inputBg} resize-none`}
              />
            </div>

            {/* Shortcut: Apply to All Districts on This Day */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleApplyToAll}
                className={`w-full py-2.5 px-4 rounded-xl border border-dashed flex items-center justify-center gap-2 text-xs font-extrabold transition cursor-pointer ${
                  appliedNotice
                    ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                    : theme.isGold
                    ? 'border-amber-500/40 text-amber-300 hover:bg-amber-950/30'
                    : 'border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/30'
                }`}
              >
                {appliedNotice ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    Applied to all districts on Day {dayNumber}!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Apply settings to all districts on Day {dayNumber}
                  </>
                )}
              </button>
              <span className="text-[11px] text-slate-500 text-center block mt-1">
                Copies start time, duration, gap, match count, and map across all Day {dayNumber} districts.
              </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-700/50 bg-black/20">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-xl font-bold text-xs ${theme.secondaryBtn}`}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveIndividual}
              className={`px-5 py-2 rounded-xl font-extrabold text-xs ${theme.primaryBtn}`}
            >
              Save District Settings
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
