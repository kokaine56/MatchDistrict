// server/verificationAbuse.js
// Database-backed abuse guard for every flow that emails a verification code
// (signup OTP, password reset, email change, provider-link confirmation).
//
// Counters live in the `verification_abuse` table so restarts and multiple server
// instances behave identically. Subject keys are HMAC-SHA256 hashes of the normalized
// value (email / user id / IP) - raw emails and IPs are never stored.
//
// Rules (see OVERVIEW.md "Verification abuse guard"):
//   * 60 s cooldown between sends to the same target (user or email).
//   * Max 3 sends / 15 min per subject (user, email, IP) per flow. Exceeding it => timeout.
//   * Max 5 wrong codes / 15 min per subject per flow. Exceeding it => timeout.
//   * Timeout: 30 min the first time, 8 h when a previous timeout ended < 24 h ago.
//   * While a timeout is active every send and verify attempt returns the same message.
//   * Email-change feature has its own stricter lock (8 h) tracked per user.
import crypto from 'node:crypto';

export const ABUSE_CONFIG = Object.freeze({
  RESEND_COOLDOWN_MS: 60 * 1000,
  SEND_MAX: 3,
  SEND_WINDOW_MS: 15 * 60 * 1000,
  FAIL_MAX: 5,
  FAIL_WINDOW_MS: 15 * 60 * 1000,
  LOCK_FIRST_MS: 30 * 60 * 1000,
  LOCK_REPEAT_MS: 8 * 60 * 60 * 1000,
  REPEAT_LOOKBACK_MS: 24 * 60 * 60 * 1000,
  EMAIL_CHANGE_WINDOW_MS: 60 * 60 * 1000,
  EMAIL_CHANGE_MAX_REQUESTS: 3,
  EMAIL_CHANGE_MAX_EVENTS: 5,
  EMAIL_CHANGE_LOCK_MS: 8 * 60 * 60 * 1000,
  RETENTION_DAYS: 7,
});

export const EMAIL_CHANGE_ACTION = 'email_change_guard';

const IST_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

/** IST 12-hour clock string such as "06:15 PM". */
export function formatIstTime(date) {
  return IST_TIME.format(new Date(date)).toUpperCase();
}

/** Human readable duration, e.g. "29 minutes", "8 hours". */
export function formatDuration(ms) {
  const mins = Math.max(1, Math.ceil(ms / 60000));
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  const h = `${hours} hour${hours === 1 ? '' : 's'}`;
  return rest ? `${h} ${rest} min` : h;
}

/** The single user-facing message shown for every blocked send / verify attempt. */
export function lockedMessage(lockedUntil, now = Date.now()) {
  const until = new Date(lockedUntil);
  return `Too many attempts. Try again after ${formatDuration(until.getTime() - now)} (at ${formatIstTime(until)}).`;
}

function normalizeSubject(type, value) {
  const raw = String(value ?? '').trim();
  return type === 'email' ? raw.toLowerCase() : raw;
}

export function createVerificationAbuseGuard({ secret }) {
  if (!secret) throw new Error('verificationAbuse: secret is required');
  const key = crypto.createHmac('sha256', secret).update('verification-abuse:v1').digest();

  const hashSubject = (type, value) =>
    crypto.createHmac('sha256', key).update(`${type}:${normalizeSubject(type, value)}`).digest('hex');

  const toSubjects = (subjects) =>
    (subjects || [])
      .filter((s) => s && s.value !== undefined && s.value !== null && String(s.value).trim() !== '')
      .map((s) => ({ type: s.type, key: hashSubject(s.type, s.value) }));

  async function withTx(pool, fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function lockRow(client, subject, action) {
    await client.query(
      `INSERT INTO verification_abuse (subject_type, subject_key, action)
       VALUES ($1, $2, $3) ON CONFLICT (subject_type, subject_key, action) DO NOTHING`,
      [subject.type, subject.key, action]
    );
    const res = await client.query(
      `SELECT * FROM verification_abuse
       WHERE subject_type = $1 AND subject_key = $2 AND action = $3 FOR UPDATE`,
      [subject.type, subject.key, action]
    );
    return res.rows[0];
  }

  /** Latest unexpired lock across all verification flows for the given subjects. */
  async function findActiveLock(client, subjects, now) {
    if (!subjects.length) return null;
    const res = await client.query(
      `SELECT MAX(locked_until) AS locked_until
         FROM verification_abuse
        WHERE (subject_type, subject_key) IN (SELECT * FROM unnest($1::text[], $2::text[]))
          AND action <> $3 AND locked_until > $4`,
      [subjects.map((s) => s.type), subjects.map((s) => s.key), EMAIL_CHANGE_ACTION, now]
    );
    return res.rows[0]?.locked_until ? new Date(res.rows[0].locked_until) : null;
  }

  /** First timeout = 30 min; a repeat (previous timeout ended < 24 h ago) = 8 h. */
  async function startTimeout(client, subject, rowId, now) {
    const prev = await client.query(
      `SELECT MAX(locked_until) AS last FROM verification_abuse
        WHERE subject_type = $1 AND subject_key = $2 AND action <> $3 AND locked_until IS NOT NULL`,
      [subject.type, subject.key, EMAIL_CHANGE_ACTION]
    );
    const last = prev.rows[0]?.last ? new Date(prev.rows[0].last).getTime() : 0;
    const repeat = last > now.getTime() - ABUSE_CONFIG.REPEAT_LOOKBACK_MS;
    const durationMs = repeat ? ABUSE_CONFIG.LOCK_REPEAT_MS : ABUSE_CONFIG.LOCK_FIRST_MS;
    const lockedUntil = new Date(now.getTime() + durationMs);
    await client.query(
      `UPDATE verification_abuse
          SET locked_until = $2, lock_level = $3, attempt_count = 0, request_count = 0,
              window_started_at = $4, updated_at = $4
        WHERE id = $1`,
      [rowId, lockedUntil, repeat ? 2 : 1, now]
    );
    return { lockedUntil, durationMs, level: repeat ? 2 : 1 };
  }

  const windowExpired = (row, windowMs, now) =>
    now.getTime() - new Date(row.window_started_at).getTime() > windowMs;

  return {
    hashSubject,

    /**
     * Gate + count a code send.
     * @returns {{ok:true}|{ok:false, code:'LOCKED'|'COOLDOWN', lockedUntil?:Date, retryAfterSeconds?:number, newlyLocked?:object}}
     */
    async registerSend(pool, { flow, subjects, now = new Date() }) {
      const subs = toSubjects(subjects);
      const action = `${flow}:send`;
      return withTx(pool, async (client) => {
        const active = await findActiveLock(client, subs, now);
        if (active) return { ok: false, code: 'LOCKED', lockedUntil: active };

        const targetSubs = subs.filter((s) => s.type === 'email');
        if (targetSubs.length) {
          const cd = await client.query(
            `SELECT MAX(last_sent_at) AS last FROM verification_abuse
              WHERE (subject_type, subject_key) IN (SELECT * FROM unnest($1::text[], $2::text[])) AND action = $3`,
            [targetSubs.map((s) => s.type), targetSubs.map((s) => s.key), action]
          );
          const last = cd.rows[0]?.last ? new Date(cd.rows[0].last).getTime() : 0;
          const elapsed = now.getTime() - last;
          if (last && elapsed < ABUSE_CONFIG.RESEND_COOLDOWN_MS) {
            return {
              ok: false,
              code: 'COOLDOWN',
              retryAfterSeconds: Math.ceil((ABUSE_CONFIG.RESEND_COOLDOWN_MS - elapsed) / 1000),
            };
          }
        }

        const rows = [];
        for (const subject of subs) {
          let row = await lockRow(client, subject, action);
          if (row.locked_until && new Date(row.locked_until) > now) {
            return { ok: false, code: 'LOCKED', lockedUntil: new Date(row.locked_until) };
          }
          if (windowExpired(row, ABUSE_CONFIG.SEND_WINDOW_MS, now)) {
            await client.query(
              `UPDATE verification_abuse SET attempt_count = 0, window_started_at = $2 WHERE id = $1`,
              [row.id, now]
            );
            row = { ...row, attempt_count: 0, window_started_at: now };
          }
          if (Number(row.attempt_count) >= ABUSE_CONFIG.SEND_MAX) {
            const t = await startTimeout(client, subject, row.id, now);
            return {
              ok: false,
              code: 'LOCKED',
              lockedUntil: t.lockedUntil,
              newlyLocked: { ...t, subjectType: subject.type, reason: 'requests' },
            };
          }
          rows.push(row);
        }
        for (const row of rows) {
          await client.query(
            `UPDATE verification_abuse
                SET attempt_count = attempt_count + 1, last_sent_at = $2, updated_at = $2
              WHERE id = $1`,
            [row.id, now]
          );
        }
        return { ok: true };
      });
    },

    /** Gate a verify attempt without counting it. */
    async checkLocked(pool, { subjects, now = new Date() }) {
      const subs = toSubjects(subjects);
      const client = await pool.connect();
      try {
        const active = await findActiveLock(client, subs, now);
        return active ? { ok: false, code: 'LOCKED', lockedUntil: active } : { ok: true };
      } finally {
        client.release();
      }
    },

    /** Count a wrong code. 5 wrong codes / 15 min => timeout. */
    async registerFailure(pool, { flow, subjects, now = new Date() }) {
      const subs = toSubjects(subjects);
      const action = `${flow}:verify`;
      return withTx(pool, async (client) => {
        const active = await findActiveLock(client, subs, now);
        if (active) return { ok: false, code: 'LOCKED', lockedUntil: active };
        for (const subject of subs) {
          let row = await lockRow(client, subject, action);
          if (row.locked_until && new Date(row.locked_until) > now) {
            return { ok: false, code: 'LOCKED', lockedUntil: new Date(row.locked_until) };
          }
          if (windowExpired(row, ABUSE_CONFIG.FAIL_WINDOW_MS, now)) {
            await client.query(
              `UPDATE verification_abuse SET attempt_count = 0, window_started_at = $2 WHERE id = $1`,
              [row.id, now]
            );
            row = { ...row, attempt_count: 0 };
          }
          const count = Number(row.attempt_count) + 1;
          if (count >= ABUSE_CONFIG.FAIL_MAX) {
            const t = await startTimeout(client, subject, row.id, now);
            return {
              ok: false,
              code: 'LOCKED',
              lockedUntil: t.lockedUntil,
              newlyLocked: { ...t, subjectType: subject.type, reason: 'failures' },
            };
          }
          await client.query(
            `UPDATE verification_abuse SET attempt_count = $2, updated_at = $3 WHERE id = $1`,
            [row.id, count, now]
          );
        }
        return { ok: true };
      });
    },

    /** Clear wrong-code counters after a successful verification. */
    async clearFailures(pool, { flow, subjects }) {
      const subs = toSubjects(subjects);
      if (!subs.length) return;
      await pool.query(
        `UPDATE verification_abuse SET attempt_count = 0, updated_at = NOW()
          WHERE (subject_type, subject_key) IN (SELECT * FROM unnest($1::text[], $2::text[])) AND action = $3`,
        [subs.map((s) => s.type), subs.map((s) => s.key), `${flow}:verify`]
      );
    },

    // ───────────── Email-change feature lock (per user, authoritative) ─────────────
    async emailChangeStatus(pool, userId, now = new Date()) {
      const subject = { type: 'user', key: hashSubject('user', userId) };
      const res = await pool.query(
        `SELECT locked_until FROM verification_abuse
          WHERE subject_type = $1 AND subject_key = $2 AND action = $3 AND locked_until > $4`,
        [subject.type, subject.key, EMAIL_CHANGE_ACTION, now]
      );
      return res.rows[0]?.locked_until ? { locked: true, lockedUntil: new Date(res.rows[0].locked_until) } : { locked: false };
    },

    /**
     * Count one email-change event. kind = 'request' | 'wrong'.
     * 3 requests or 5 events (requests + wrong codes) in 60 min => 8 h lock.
     * A request that would be the 3rd-over-limit or the 5th event is refused and locks the feature.
     */
    async emailChangeEvent(pool, { userId, kind, now = new Date() }) {
      const subject = { type: 'user', key: hashSubject('user', userId) };
      return withTx(pool, async (client) => {
        let row = await lockRow(client, subject, EMAIL_CHANGE_ACTION);
        if (row.locked_until && new Date(row.locked_until) > now) {
          return { ok: false, locked: true, lockedUntil: new Date(row.locked_until) };
        }
        if (windowExpired(row, ABUSE_CONFIG.EMAIL_CHANGE_WINDOW_MS, now)) {
          await client.query(
            `UPDATE verification_abuse SET attempt_count = 0, request_count = 0, window_started_at = $2 WHERE id = $1`,
            [row.id, now]
          );
          row = { ...row, attempt_count: 0, request_count: 0 };
        }
        const events = Number(row.attempt_count) + 1;
        const requests = Number(row.request_count) + (kind === 'request' ? 1 : 0);
        const tooManyRequests = kind === 'request' && Number(row.request_count) >= ABUSE_CONFIG.EMAIL_CHANGE_MAX_REQUESTS;
        const refuseRequest = kind === 'request' && events >= ABUSE_CONFIG.EMAIL_CHANGE_MAX_EVENTS;
        const wrongLimit = kind === 'wrong' && events >= ABUSE_CONFIG.EMAIL_CHANGE_MAX_EVENTS;
        if (tooManyRequests || refuseRequest || wrongLimit) {
          const lockedUntil = new Date(now.getTime() + ABUSE_CONFIG.EMAIL_CHANGE_LOCK_MS);
          await client.query(
            `UPDATE verification_abuse
                SET locked_until = $2, lock_level = 2, attempt_count = 0, request_count = 0,
                    window_started_at = $3, updated_at = $3
              WHERE id = $1`,
            [row.id, lockedUntil, now]
          );
          return {
            ok: false,
            locked: true,
            lockedUntil,
            newlyLocked: { lockedUntil, durationMs: ABUSE_CONFIG.EMAIL_CHANGE_LOCK_MS, level: 2, subjectType: 'user', reason: kind === 'wrong' ? 'failures' : 'requests' },
          };
        }
        await client.query(
          `UPDATE verification_abuse SET attempt_count = $2, request_count = $3, updated_at = $4 WHERE id = $1`,
          [row.id, events, requests, now]
        );
        return { ok: true, locked: false };
      });
    },

    async emailChangeReset(pool, userId) {
      await pool.query(
        `UPDATE verification_abuse SET attempt_count = 0, request_count = 0, updated_at = NOW()
          WHERE subject_type = 'user' AND subject_key = $1 AND action = $2 AND (locked_until IS NULL OR locked_until <= NOW())`,
        [hashSubject('user', userId), EMAIL_CHANGE_ACTION]
      );
    },

    /** Remove rows untouched for 7 days. */
    async cleanup(pool) {
      const res = await pool.query(
        `DELETE FROM verification_abuse WHERE updated_at < NOW() - ($1::int * INTERVAL '1 day')`,
        [ABUSE_CONFIG.RETENTION_DAYS]
      );
      return res.rowCount || 0;
    },
  };
}
