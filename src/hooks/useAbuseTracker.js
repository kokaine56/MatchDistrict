// ─────────────────────────────────────────────────────────────────────────────
// useAbuseTracker — React hook  (v2 — reliable singleton)
//
// One worker is shared across the whole app (module-level singleton).
// The word list is fetched fresh every time the hook first mounts on a page,
// ensuring the latest admin-configured list is always used.
//
// Usage:
//   const { checkField, getFieldError, clearFieldError, hasAnyError } = useAbuseTracker()
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Module-level singleton (one worker for the whole app) ────────────────────
let _worker = null;
let _pendingCbs = {};        // fieldId → resolve fn
let _initialized = false;

function getWorker() {
  if (!_worker) {
    try {
      _worker = new Worker(
        new URL('../workers/abuseTrackerWorker.js', import.meta.url),
        { type: 'module' }
      );

      _worker.onmessage = (e) => {
        const msg = e.data;
        if (!msg) return;

        if (msg.type === 'INIT_ACK') {
          _initialized = true;
          console.log(`🛡️ [AbuseTracker] Ready — ${msg.count} banned word(s) loaded.`);
        }

        if (msg.type === 'CHECK_RESULT') {
          const cb = _pendingCbs[msg.fieldId];
          if (cb) {
            cb(msg);
            delete _pendingCbs[msg.fieldId];
          }
        }
      };

      _worker.onerror = (err) => {
        console.error('❌ [AbuseTracker] Worker error:', err.message);
      };

    } catch (err) {
      console.warn('⚠️ [AbuseTracker] Web Workers not supported:', err.message);
      _worker = null;
    }
  }
  return _worker;
}

// Fetch the current word list from the server
async function loadWords() {
  try {
    const res = await fetch('/api/admin/badwords', { cache: 'no-store' });
    if (!res.ok) {
      console.warn(`⚠️ [AbuseTracker] GET /api/admin/badwords returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data.words) ? data.words : [];
  } catch (err) {
    console.warn('⚠️ [AbuseTracker] Failed to load word list:', err.message);
    return [];
  }
}

// Initialise (or reinitialise) the worker with fresh words from the server
async function initWorker() {
  const worker = getWorker();
  if (!worker) return;

  const words = await loadWords();
  worker.postMessage({ action: 'INIT', words });
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useAbuseTracker() {
  const [fieldErrors, setFieldErrors] = useState({});
  const workerRef = useRef(null);

  // Boot / connect to the singleton worker on first mount of any consumer
  useEffect(() => {
    workerRef.current = getWorker();

    // Always (re-)initialize so the latest admin word list is used
    initWorker();

    return () => {
      // Don't destroy the singleton — other components are using it
    };
  }, []);

  // ── checkField ─────────────────────────────────────────────────────────────
  // Sends value to the worker and updates state when the result arrives.
  // Returns a Promise so callers can await the result directly.
  const checkField = useCallback((fieldId, value) => {
    return new Promise((resolve) => {
      const worker = workerRef.current;
      if (!worker) {
        resolve({ hasBadWord: false });
        return;
      }

      // Overwrite any pending callback for this field (debounce scenario)
      _pendingCbs[fieldId] = (result) => {
        setFieldErrors(prev => ({
          ...prev,
          [fieldId]: result.hasBadWord ? result.message : null
        }));
        resolve(result);
      };

      worker.postMessage({ action: 'CHECK', value, fieldId });
    });
  }, []);

  // ── helpers ────────────────────────────────────────────────────────────────
  const getFieldError = useCallback((fieldId) => {
    return fieldErrors[fieldId] || null;
  }, [fieldErrors]);

  const clearFieldError = useCallback((fieldId) => {
    setFieldErrors(prev => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  }, []);

  const hasAnyError = useCallback(() => {
    return Object.values(fieldErrors).some(Boolean);
  }, [fieldErrors]);

  // Force a fresh word-list reload (call after admin saves new words)
  const reloadWordList = useCallback(async () => {
    _initialized = false;
    await initWorker();
  }, []);

  return { checkField, getFieldError, clearFieldError, hasAnyError, reloadWordList };
}
