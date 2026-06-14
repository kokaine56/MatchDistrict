// ─────────────────────────────────────────────────────────────────────────────
// MATCH DISTRICT — ABUSE TRACKER WEB WORKER  (v2 — bulletproof)
// Runs entirely off the main thread.
// Detection method: fast substring match on the raw word + every leet-speak
// variant. No regex escaping bugs, no boundary issues.
// ─────────────────────────────────────────────────────────────────────────────

let activePairs = [];   // [{ original, variant }] – pre-computed at INIT time

// ── Leet-speak variant generator ────────────────────────────────────────────
// Returns every practical substitution of a word without exponential blowup.
// We replace ONE character class at a time so the variant count stays linear.
function getLeetVariants(word) {
  const SUBS = {
    a: ['@', '4'],
    e: ['3'],
    i: ['1', '!'],
    o: ['0'],
    s: ['$', '5'],
    t: ['7'],
    l: ['1'],
    g: ['9'],
    b: ['8'],
    z: ['2'],
  };

  const base = word.toLowerCase();
  const variants = new Set([base]);

  for (const [char, replacements] of Object.entries(SUBS)) {
    if (!base.includes(char)) continue;
    for (const rep of replacements) {
      // Replace ALL occurrences of char with the leet substitute
      variants.add(base.replaceAll(char, rep));
      // Also replace only first occurrence (partial leet)
      variants.add(base.replace(char, rep));
    }
  }

  return [...variants];
}

// ── Initialise / refresh word list ──────────────────────────────────────────
function initWordList(words) {
  const list = Array.isArray(words)
    ? words.map(w => String(w).trim().toLowerCase()).filter(w => w.length > 0)
    : [];

  // Expand every word into its leet variants upfront
  activePairs = list.flatMap(original =>
    getLeetVariants(original).map(variant => ({ original, variant }))
  );

  self.postMessage({ type: 'INIT_ACK', count: list.length });
}

// ── Core scanner ─────────────────────────────────────────────────────────────
function checkValue(value, fieldId) {
  // Always reply so the Promise in the hook resolves
  if (!value || typeof value !== 'string') {
    self.postMessage({ type: 'CHECK_RESULT', fieldId, hasBadWord: false, blockedWord: null });
    return;
  }

  if (activePairs.length === 0) {
    self.postMessage({ type: 'CHECK_RESULT', fieldId, hasBadWord: false, blockedWord: null });
    return;
  }

  const normalized = value.toLowerCase();

  for (const { original, variant } of activePairs) {
    if (normalized.includes(variant)) {
      self.postMessage({
        type: 'CHECK_RESULT',
        fieldId,
        hasBadWord: true,
        blockedWord: original,
        message: `Inappropriate language detected. Please choose different wording.`
      });
      return;
    }
  }

  self.postMessage({ type: 'CHECK_RESULT', fieldId, hasBadWord: false, blockedWord: null, message: null });
}

// ── Message router ────────────────────────────────────────────────────────────
self.onmessage = (e) => {
  const { action, words, value, fieldId } = e.data || {};

  if (action === 'INIT') {
    initWordList(words);
  } else if (action === 'CHECK') {
    checkValue(value, fieldId);
  } else if (action === 'PING') {
    self.postMessage({ type: 'PONG' });
  }
};
