import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Map as MapIcon, Sliders, Check, Copy, RotateCcw, Plus, Trash2, AlertCircle } from 'lucide-react';
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

function minsToHHMM(mins) {
  const h = String(Math.floor(mins / 60) % 24).padStart(2, '0');
  const m = String(mins % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function timeToMins(tStr) {
  if (!tStr) return 780; // 13:00 default
  const parts = tStr.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 780;
  return parts[0] * 60 + parts[1];
}

function generateMatches(count, startStr, durationMins, gapMins, mapName, existing = []) {
  const dur = Number(durationMins) || 30;
  const gap = Number(gapMins) || 60;
  let curMins = timeToMins(startStr);
  const result = [];

  for (let i = 0; i < count; i++) {
    const sTime = minsToHHMM(curMins);
    const eTime = minsToHHMM(curMins + dur);
    const ex = existing[i] || {};
    result.push({
      id: ex.id || `MAT-${Date.now()}-${i}`,
      district_match_number: i + 1,
      start_time: sTime,
      end_time: eTime,
      map: mapName || 'Erangel',
      notes: ex.notes || '',
      district_id: ex.district_id,
      district_name: ex.district_name,
    });
    curMins += gap;
  }
  return result;
}

export default function RoadmapDistrictSettingsModal({
  isOpen,
  onClose,
  allocation = null,
  displayName = '',
  dayNumber = 1,
  game = 'bgmi',
  onSave,
  onApplyToAllOnDay,
  cardColor = 'white',
}) {
  const theme = getRoadmapTheme(cardColor);

  const gameKey = (game || 'bgmi').toLowerCase().trim();
  const mapOptions = DEFAULT_MAPS[gameKey] || DEFAULT_MAPS.bgmi;

  // Auto-fill parameters
  const [matchCount, setMatchCount] = useState(1);
  const [startTime, setStartTime] = useState('13:00');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [gapMinutes, setGapMinutes] = useState(60);
  const [defaultMap, setDefaultMap] = useState('Erangel');
  const [notes, setNotes] = useState('');
  const [appliedNotice, setAppliedNotice] = useState(false);
  const [limitMessage, setLimitMessage] = useState('');

  // Per-match editable state
  const [matches, setMatches] = useState([]);

  // Initialize state when allocation opens
  useEffect(() => {
    if (!allocation) return;
    const existingMatches = Array.isArray(allocation.matches) ? allocation.matches : [];
    const count = allocation.match_count || existingMatches.length || 1;
    const firstStart = existingMatches[0]?.start_time || '13:00';
    const firstMap = existingMatches[0]?.map || 'Erangel';

    let dur = 30;
    if (existingMatches[0]?.start_time && existingMatches[0]?.end_time) {
      const diff = timeToMins(existingMatches[0].end_time) - timeToMins(existingMatches[0].start_time);
      if (diff > 0) dur = diff;
    }

    let gap = 60;
    if (existingMatches.length > 1 && existingMatches[0]?.start_time && existingMatches[1]?.start_time) {
      const diff = timeToMins(existingMatches[1].start_time) - timeToMins(existingMatches[0].start_time);
      if (diff > 0) gap = diff;
    }

    setMatchCount(count);
    setStartTime(firstStart);
    setDefaultMap(firstMap);
    setDurationMinutes(dur);
    setGapMinutes(gap);
    setNotes(existingMatches[0]?.notes || '');
    setLimitMessage('');

    if (existingMatches.length > 0) {
      setMatches(
        existingMatches.map((m, i) => ({
          id: m.id || `MAT-${Date.now()}-${i}`,
          district_match_number: m.district_match_number || i + 1,
          start_time: m.start_time || minsToHHMM(timeToMins(firstStart) + i * gap),
          end_time: m.end_time || minsToHHMM(timeToMins(firstStart) + i * gap + dur),
          map: m.map || firstMap,
          notes: m.notes || '',
        }))
      );
    } else {
      setMatches(generateMatches(count, firstStart, dur, gap, firstMap));
    }
  }, [allocation]);

  if (!isOpen || !allocation) return null;

  // Handle Match Count change: adjust matches array size (clamped 1 to 12)
  const handleMatchCountChange = (newCountVal) => {
    let newCount = parseInt(newCountVal, 10);
    if (isNaN(newCount)) newCount = 1;
    if (newCount > 12) {
      newCount = 12;
      setLimitMessage('Maximum 12 matches per day allowed.');
      setTimeout(() => setLimitMessage(''), 3500);
    } else {
      setLimitMessage('');
    }
    newCount = Math.max(1, newCount);
    setMatchCount(newCount);

    setMatches((prev) => {
      if (newCount === prev.length) return prev;
      if (newCount < prev.length) {
        return prev.slice(0, newCount);
      }
      // Expand matches
      const expanded = [...prev];
      let lastMins = prev.length > 0
        ? timeToMins(prev[prev.length - 1].start_time) + gapMinutes
        : timeToMins(startTime);

      for (let i = prev.length; i < newCount; i++) {
        expanded.push({
          id: `MAT-${Date.now()}-${i}`,
          district_match_number: i + 1,
          start_time: minsToHHMM(lastMins),
          end_time: minsToHHMM(lastMins + durationMinutes),
          map: defaultMap,
          notes: '',
        });
        lastMins += gapMinutes;
      }
      return expanded;
    });
  };

  const handleAddMatch = () => {
    if (matches.length >= 12) {
      setLimitMessage('Maximum 12 matches per day allowed.');
      setTimeout(() => setLimitMessage(''), 3500);
      return;
    }
    setLimitMessage('');
    handleMatchCountChange(matches.length + 1);
  };

  const handleRemoveMatch = (idx) => {
    if (matches.length <= 1) {
      setLimitMessage('A day must have at least 1 match.');
      setTimeout(() => setLimitMessage(''), 3500);
      return;
    }
    setLimitMessage('');
    const updated = matches
      .filter((_, i) => i !== idx)
      .map((m, i) => ({ ...m, district_match_number: i + 1 }));
    setMatches(updated);
    setMatchCount(updated.length);
  };

  // Reset all matches to auto-filled values
  const handleResetToAuto = () => {
    const refreshed = generateMatches(matchCount, startTime, durationMinutes, gapMinutes, defaultMap, matches);
    setMatches(refreshed);
  };

  // Individual match field editor
  const handleMatchFieldChange = (idx, field, val) => {
    setMatches((prev) =>
      prev.map((m, i) => {
        if (i !== idx) return m;
        const updated = { ...m, [field]: val };
        if (field === 'start_time') {
          const startM = timeToMins(val);
          updated.end_time = minsToHHMM(startM + durationMinutes);
        }
        return updated;
      })
    );
  };

  const handleSaveIndividual = () => {
    onSave({
      matchCount: matches.length,
      matches,
      startTime: matches[0]?.start_time || startTime,
      map: matches[0]?.map || defaultMap,
      durationMinutes,
      gapMinutes,
      notes: notes.trim(),
    });
    onClose();
  };

  const handleApplyToAll = () => {
    onApplyToAllOnDay({
      matchCount: matches.length,
      matches,
      startTime: matches[0]?.start_time || startTime,
      map: matches[0]?.map || defaultMap,
      durationMinutes,
      gapMinutes,
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
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 ${theme.modalOverlay}`}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className={`w-full max-w-xl rounded-2xl ${theme.modalBg} overflow-hidden shadow-2xl flex flex-col max-h-[90vh]`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${theme.isGold ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-200' : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-200'}`}>
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base sm:text-lg font-bold ${theme.headingText}`}>
                  {displayName || allocation?.district_name || allocation?.name || 'District'} Settings
                </h3>
                <p className={`text-xs ${theme.mutedText}`}>
                  Day {dayNumber} individual match timing, map selection & schedule properties
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form Scroll Body */}
          <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
            {/* Auto-fill Generator Controls */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  Auto-Fill Timing Generator
                </span>
                <button
                  type="button"
                  onClick={handleResetToAuto}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition cursor-pointer flex items-center gap-1"
                  title="Recalculate matches from first start time, gap, and default map"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset to auto</span>
                </button>
              </div>

              {limitMessage && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{limitMessage}</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-slate-500">
                    Matches Count
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={matchCount}
                    onChange={(e) => handleMatchCountChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-slate-500">
                    First Start
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-slate-500">
                    Duration (m)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="120"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Math.max(10, parseInt(e.target.value, 10) || 30))}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-slate-500">
                    Interval (m)
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="180"
                    value={gapMinutes}
                    onChange={(e) => setGapMinutes(Math.max(15, parseInt(e.target.value, 10) || 60))}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-slate-500">
                  Default Map
                </label>
                <select
                  value={defaultMap}
                  onChange={(e) => setDefaultMap(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-white text-slate-800"
                >
                  {mapOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Individual Matches List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className={`text-xs font-extrabold uppercase tracking-wider ${theme.mutedText}`}>
                  Individual Match Settings ({matches.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddMatch}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add match</span>
                </button>
              </div>

              <div className="space-y-2 max-h-[36vh] overflow-y-auto pr-1">
                {matches.map((m, idx) => (
                  <div
                    key={m.id || idx}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 transition-colors shadow-2xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        Match {m.district_match_number || idx + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-mono">
                          {m.start_time} - {m.end_time}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveMatch(idx)}
                          disabled={matches.length <= 1}
                          className="p-1 rounded text-slate-400 hover:text-rose-600 disabled:opacity-20 disabled:hover:text-slate-400 cursor-pointer"
                          title={matches.length <= 1 ? "A day must have at least 1 match." : "Remove match"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider mb-0.5 text-slate-500">
                          Start Time (IST)
                        </label>
                        <input
                          type="time"
                          value={m.start_time || '13:00'}
                          onChange={(e) => handleMatchFieldChange(idx, 'start_time', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider mb-0.5 text-slate-500">
                          Map
                        </label>
                        <select
                          value={m.map || defaultMap}
                          onChange={(e) => handleMatchFieldChange(idx, 'map', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {mapOptions.map((mapName) => (
                            <option key={mapName} value={mapName}>
                              {mapName}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${theme.mutedText}`}>
                Match Notes (Optional)
              </label>
              <textarea
                rows="2"
                placeholder="e.g. Streamed live, lobby host info, etc."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl text-xs font-normal ${theme.inputBg} resize-none`}
              />
            </div>

            {/* Shortcut: Apply to All Districts on This Day */}
            <div>
              <button
                type="button"
                onClick={handleApplyToAll}
                className={`w-full py-2 px-3 rounded-xl border border-dashed flex items-center justify-center gap-1.5 text-xs font-bold transition cursor-pointer min-h-[36px] ${
                  appliedNotice
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200'
                    : 'border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                }`}
              >
                {appliedNotice ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Applied to all districts on Day {dayNumber}!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Apply these matches to all districts on Day {dayNumber}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 sm:gap-3 p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 shrink-0">
            <button
              onClick={onClose}
              className={`w-full sm:w-auto px-4 py-2 rounded-xl font-bold text-xs min-h-[38px] ${theme.secondaryBtn}`}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveIndividual}
              className={`w-full sm:w-auto px-5 py-2 rounded-xl font-extrabold text-xs min-h-[38px] ${theme.primaryBtn}`}
            >
              Save District Settings
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
