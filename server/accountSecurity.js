// server/accountSecurity.js
// Account-safety services wired into server.js:
//   * verification abuse guard glue (send / verify gates, one in-app notice per timeout)
//   * two-step email change flow (old email code -> new email code -> save)
//   * 24-hour notification lifetime cleanup job and verification_abuse retention cleanup
import crypto from 'node:crypto';
import {
  createVerificationAbuseGuard,
  formatDuration,
  formatIstTime,
  lockedMessage,
  ABUSE_CONFIG,
} from './verificationAbuse.js';
import { normalizeEmailAddress } from './accountRules.js';
import { attachResolvedAvatars } from './avatarResolver.js';

const CODE_TTL_MS = 10 * 60 * 1000;
const OLD_VERIFIED_TTL_MS = 30 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const EMAIL_CHANGE_COOLDOWN_DAYS = 15;
const NOTIFICATION_RETENTION_SQL = `INTERVAL '24 hours'`;
export const NOTIFICATION_TABLES = Object.freeze(['alerts', 'notifications']);
const CLEANUP_BATCH_SIZE = 500;
const CLEANUP_MAX_BATCHES_PER_RUN = 40;

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

function codesMatch(code, hash) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code) || !hash) return false;
  const a = Buffer.from(sha256(code), 'hex');
  const b = Buffer.from(String(hash), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createAccountSecurity({
  pool,
  secret,
  sendEmail,
  getAuthUser,
  hasRole,
  ROLES,
  rootAdminEmail,
  signJwt,
  buildSessionCookie,
  publicUserRow,
  maskUserEmail,
  checkRateLimit,
}) {
  const abuse = createVerificationAbuseGuard({ secret });

  const getRequestIp = (req) => {
    const remote = req.socket?.remoteAddress || '127.0.0.1';
    const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';
    if (!trustProxy) return remote;
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const first = String(forwarded).split(',').map((s) => s.trim()).filter(Boolean)[0];
      if (first) return first;
    }
    return remote;
  };

  const sendJson = (res, status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
    res.end(JSON.stringify(payload));
  };

  async function findUserIdByEmail(email) {
    if (!email) return null;
    const r = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
    return r.rows[0]?.id || null;
  }

  /** Exactly one bell notice per timeout event, only for accounts that exist. */
  async function notifyVerificationPaused(userId, lock, subjectLabel) {
    const what = subjectLabel
      || (lock.reason === 'failures' ? 'incorrect verification codes' : 'code requests');
    const message =
      `Verification codes were paused for ${formatDuration(lock.durationMs)} ` +
      `(until ${formatIstTime(lock.lockedUntil)}) because of too many ${what}. ` +
      'If this was not you, change your password.';
    try {
      await pool.query(
        `INSERT INTO alerts (id, user_id, type, title, message, is_read, created_at)
         VALUES ($1, $2, 'security', 'Verification paused', $3, false, NOW())`,
        ['ALERT-' + crypto.randomBytes(6).toString('hex').toUpperCase(), userId, message]
      );
    } catch (error) {
      console.error('[ABUSE] Could not create timeout notification [code: ' + (error?.code || 'UNKNOWN') + ']');
    }
  }

  async function respondBlocked(res, result, { userId = null, email = null } = {}) {
    if (result.newlyLocked) {
      const uid = userId || (await findUserIdByEmail(email));
      if (uid) await notifyVerificationPaused(uid, result.newlyLocked);
    }
    if (result.code === 'COOLDOWN') {
      return sendJson(res, 429, {
        success: false,
        error: 'RESEND_COOLDOWN',
        message: `Please wait ${result.retryAfterSeconds} seconds before requesting another verification code.`,
        secondsLeft: result.retryAfterSeconds,
        retry_after_seconds: result.retryAfterSeconds,
      });
    }
    const lockedUntil = new Date(result.lockedUntil);
    return sendJson(res, 429, {
      success: false,
      error: 'VERIFICATION_LOCKED',
      message: lockedMessage(lockedUntil),
      locked_until: lockedUntil.toISOString(),
      retry_after_seconds: Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000)),
    });
  }

  const subjectsFor = (req, { email, userId }) => [
    { type: 'ip', value: getRequestIp(req) },
    ...(email ? [{ type: 'email', value: email }] : []),
    ...(userId ? [{ type: 'user', value: userId }] : []),
  ];

  /** Returns true when the send may proceed; otherwise writes the 429 response. */
  async function guardSend(req, res, { flow, email = null, userId = null }) {
    try {
      const result = await abuse.registerSend(pool, { flow, subjects: subjectsFor(req, { email, userId }) });
      if (result.ok) return true;
      await respondBlocked(res, result, { userId, email });
      return false;
    } catch (error) {
      console.error('[ABUSE] Send guard failed [code: ' + (error?.code || 'UNKNOWN') + ']');
      sendJson(res, 503, { success: false, error: 'SERVICE_UNAVAILABLE', message: 'Verification is temporarily unavailable. Try again shortly.' });
      return false;
    }
  }

  /** Returns true when verification may proceed; otherwise writes the 429 response. */
  async function guardVerify(req, res, { email = null, userId = null }) {
    try {
      const result = await abuse.checkLocked(pool, { subjects: subjectsFor(req, { email, userId }) });
      if (result.ok) return true;
      await respondBlocked(res, result, { userId, email });
      return false;
    } catch (error) {
      console.error('[ABUSE] Verify gate failed [code: ' + (error?.code || 'UNKNOWN') + ']');
      sendJson(res, 503, { success: false, error: 'SERVICE_UNAVAILABLE', message: 'Verification is temporarily unavailable. Try again shortly.' });
      return false;
    }
  }

  /**
   * Counts a wrong code. Returns true when this failure started a timeout (response written),
   * false when the caller should continue with its normal "invalid code" response.
   */
  async function recordFailure(req, res, { flow, email = null, userId = null }) {
    try {
      const result = await abuse.registerFailure(pool, { flow, subjects: subjectsFor(req, { email, userId }) });
      if (result.ok) return false;
      await respondBlocked(res, result, { userId, email });
      return true;
    } catch (error) {
      console.error('[ABUSE] Failure counter failed [code: ' + (error?.code || 'UNKNOWN') + ']');
      return false;
    }
  }

  const clearFailures = (req, { flow, email = null, userId = null }) =>
    abuse.clearFailures(pool, { flow, subjects: subjectsFor(req, { email, userId }) }).catch(() => {});

  // ───────────────────────── Email change ─────────────────────────
  async function loadAccount(authUser) {
    const r = await pool.query('SELECT * FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
    return r.rows[0] || null;
  }

  function cooldownDaysLeft(account) {
    if (!account.email_last_changed) return 0;
    const days = (Date.now() - new Date(account.email_last_changed).getTime()) / 86400000;
    return days < EMAIL_CHANGE_COOLDOWN_DAYS ? Math.ceil(EMAIL_CHANGE_COOLDOWN_DAYS - days) : 0;
  }

  function changeNotAllowedReason(account) {
    if ((rootAdminEmail || '') && String(account.email || '').toLowerCase() === String(rootAdminEmail).toLowerCase()) {
      return 'This account email cannot be changed here.';
    }
    if (!hasRole(account, ROLES.ADMIN) && hasRole(account, ROLES.ORGANISER)) {
      return 'Organizer account emails cannot be changed here.';
    }
    return null;
  }

  async function readJson(req, limit = 4096) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > limit) {
          reject(Object.assign(new Error('PAYLOAD_TOO_LARGE'), { status: 413 }));
          req.destroy();
        }
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch {
          reject(Object.assign(new Error('INVALID_JSON'), { status: 400 }));
        }
      });
      req.on('error', reject);
    });
  }

  function emailCodeHtml(code, intro) {
    return `<div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 20px;">
      <h2 style="text-align:center;">Match District</h2>
      <p>${intro}</p>
      <div style="background:#f4f4f4;padding:18px;text-align:center;font-size:30px;font-weight:bold;letter-spacing:5px;border-radius:6px;">${code}</div>
      <p>This code expires in 10 minutes. If you did not request it, change your password.</p>
    </div>`;
  }

  async function lockedOrNull(account) {
    const status = await abuse.emailChangeStatus(pool, account.id);
    return status.locked ? status.lockedUntil : null;
  }

  async function respondEmailChangeLocked(res, lockedUntil, newlyLocked, account) {
    if (newlyLocked) await notifyVerificationPaused(account.id, newlyLocked, 'email change attempts');
    return sendJson(res, 429, {
      success: false,
      error: 'EMAIL_CHANGE_LOCKED',
      message: lockedMessage(lockedUntil),
      locked_until: new Date(lockedUntil).toISOString(),
      retry_after_seconds: Math.max(1, Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 1000)),
    });
  }

  /** Handles /api/account/email-change/*. Always writes a response. */
  async function handleEmailChangeRoute(req, res, urlPath) {
    const step = urlPath.replace('/api/account/email-change/', '').replace(/\/+$/, '');
    const validPost = ['start', 'verify-old', 'send-new', 'confirm'];
    if (!((step === 'status' && req.method === 'GET') || (validPost.includes(step) && req.method === 'POST'))) {
      return sendJson(res, 404, { success: false, error: 'NOT_FOUND' });
    }
    const authUser = getAuthUser(req);
    if (!authUser) return sendJson(res, 401, { success: false, error: 'UNAUTHORIZED' });
    const ip = getRequestIp(req);
    if (!checkRateLimit(`email_change_ip:${ip}`, 60, 10 * 60 * 1000)) {
      return sendJson(res, 429, { success: false, error: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' });
    }

    try {
      const account = await loadAccount(authUser);
      if (!account) return sendJson(res, 404, { success: false, error: 'USER_NOT_FOUND' });

      const request = (await pool.query('SELECT * FROM email_change_requests WHERE user_id = $1', [account.id])).rows[0] || null;
      const lockedUntil = await lockedOrNull(account);

      if (step === 'status') {
        const now = Date.now();
        let flowStep = 'idle';
        if (request?.old_verified_at && now - new Date(request.old_verified_at).getTime() < OLD_VERIFIED_TTL_MS) {
          flowStep = request.new_code_hash && new Date(request.new_code_expires_at).getTime() > now ? 'new_code_sent' : 'old_verified';
        } else if (request?.old_code_hash && new Date(request.old_code_expires_at).getTime() > now) {
          flowStep = 'old_code_sent';
        }
        const lastSend = request ? new Date(request.updated_at).getTime() : 0;
        return sendJson(res, 200, {
          success: true,
          locked: Boolean(lockedUntil),
          locked_until: lockedUntil ? new Date(lockedUntil).toISOString() : null,
          step: flowStep,
          masked_email: maskUserEmail(account.email),
          masked_new_email: flowStep === 'new_code_sent' ? maskUserEmail(request.new_email) : null,
          cooldown_days_left: cooldownDaysLeft(account),
          not_allowed_reason: changeNotAllowedReason(account),
          resend_in_seconds: lastSend ? Math.max(0, Math.ceil((ABUSE_CONFIG.RESEND_COOLDOWN_MS - (now - lastSend)) / 1000)) : 0,
        });
      }

      const notAllowed = changeNotAllowedReason(account);
      if (notAllowed) return sendJson(res, 403, { success: false, error: 'EMAIL_CHANGE_NOT_ALLOWED', message: notAllowed });
      const daysLeft = cooldownDaysLeft(account);
      if (daysLeft > 0) {
        return sendJson(res, 400, {
          success: false,
          error: 'COOLDOWN_ACTIVE',
          message: `You can only change your email address once every ${EMAIL_CHANGE_COOLDOWN_DAYS} days. Try again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
          cooldown_days_left: daysLeft,
        });
      }
      if (lockedUntil) return respondEmailChangeLocked(res, lockedUntil, null, account);

      const body = await readJson(req);

      // ── Step 1: send a code to the CURRENT email ──
      if (step === 'start') {
        if (!(await guardSend(req, res, { flow: 'email_change', email: account.email, userId: account.id }))) return;
        const event = await abuse.emailChangeEvent(pool, { userId: account.id, kind: 'request' });
        if (!event.ok) return respondEmailChangeLocked(res, event.lockedUntil, event.newlyLocked, account);
        const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
        await pool.query(
          `INSERT INTO email_change_requests (user_id, old_code_hash, old_code_expires_at, old_attempts, old_verified_at,
             new_email, new_code_hash, new_code_expires_at, new_attempts, created_at, updated_at)
           VALUES ($1, $2, NOW() + INTERVAL '10 minutes', 0, NULL, NULL, NULL, NULL, 0, NOW(), NOW())
           ON CONFLICT (user_id) DO UPDATE SET old_code_hash = EXCLUDED.old_code_hash,
             old_code_expires_at = EXCLUDED.old_code_expires_at, old_attempts = 0, old_verified_at = NULL,
             new_email = NULL, new_code_hash = NULL, new_code_expires_at = NULL, new_attempts = 0, updated_at = NOW()`,
          [account.id, sha256(code)]
        );
        const mail = await sendEmail({
          to: account.email,
          subject: 'Confirm your Match District email change',
          html: emailCodeHtml(code, 'Use this code to confirm you want to change the email address on your account:'),
        });
        if (!mail.success) {
          return sendJson(res, 503, { success: false, error: 'EMAIL_UNAVAILABLE', message: 'We could not send the code right now. Try again later.' });
        }
        return sendJson(res, 200, { success: true, step: 'old_code_sent', masked_email: maskUserEmail(account.email), resend_in_seconds: 60 });
      }

      // ── Step 2: verify the code from the OLD email ──
      if (step === 'verify-old') {
        if (!request?.old_code_hash || new Date(request.old_code_expires_at).getTime() <= Date.now()) {
          return sendJson(res, 400, { success: false, error: 'CODE_EXPIRED', message: 'That code expired. Request a new one.' });
        }
        if (!(await guardVerify(req, res, { email: account.email, userId: account.id }))) return;
        if (Number(request.old_attempts) >= MAX_CODE_ATTEMPTS) {
          return sendJson(res, 400, { success: false, error: 'CODE_EXPIRED', message: 'That code is no longer valid. Request a new one.' });
        }
        if (!codesMatch(String(body.code || '').trim(), request.old_code_hash)) {
          await pool.query('UPDATE email_change_requests SET old_attempts = old_attempts + 1, updated_at = updated_at WHERE user_id = $1', [account.id]);
          const event = await abuse.emailChangeEvent(pool, { userId: account.id, kind: 'wrong' });
          if (!event.ok) return respondEmailChangeLocked(res, event.lockedUntil, event.newlyLocked, account);
          if (await recordFailure(req, res, { flow: 'email_change', email: account.email, userId: account.id })) return;
          return sendJson(res, 400, { success: false, error: 'INVALID_CODE', message: 'Incorrect code. Check the email and try again.' });
        }
        await pool.query(
          `UPDATE email_change_requests SET old_verified_at = NOW(), old_code_hash = NULL WHERE user_id = $1`,
          [account.id]
        );
        await clearFailures(req, { flow: 'email_change', email: account.email, userId: account.id });
        return sendJson(res, 200, { success: true, step: 'old_verified' });
      }

      const oldVerified = request?.old_verified_at && Date.now() - new Date(request.old_verified_at).getTime() < OLD_VERIFIED_TTL_MS;
      if (!oldVerified) {
        return sendJson(res, 400, { success: false, error: 'OLD_EMAIL_NOT_VERIFIED', message: 'Verify your current email first.' });
      }

      // ── Step 3: send a code to the NEW email ──
      if (step === 'send-new') {
        const newEmail = normalizeEmailAddress(body.newEmail);
        if (!newEmail) return sendJson(res, 400, { success: false, error: 'INVALID_EMAIL', message: 'Enter a valid email address.' });
        if (newEmail === String(account.email).trim().toLowerCase()) {
          return sendJson(res, 400, { success: false, error: 'SAME_EMAIL', message: 'Enter a different email address.' });
        }
        // Each attempt (including taken addresses) counts, so addresses cannot be probed in bulk.
        const event = await abuse.emailChangeEvent(pool, { userId: account.id, kind: 'request' });
        if (!event.ok) return respondEmailChangeLocked(res, event.lockedUntil, event.newlyLocked, account);
        const taken = await pool.query('SELECT 1 FROM users WHERE LOWER(email) = $1 AND id <> $2 LIMIT 1', [newEmail, account.id]);
        if (taken.rows.length) {
          return sendJson(res, 409, { success: false, error: 'EMAIL_UNAVAILABLE', message: 'This email address cannot be used. Try a different one.' });
        }
        if (!(await guardSend(req, res, { flow: 'email_change', email: newEmail, userId: account.id }))) return;
        const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
        await pool.query(
          `UPDATE email_change_requests SET new_email = $2, new_code_hash = $3,
             new_code_expires_at = NOW() + INTERVAL '10 minutes', new_attempts = 0, updated_at = NOW()
           WHERE user_id = $1`,
          [account.id, newEmail, sha256(code)]
        );
        const mail = await sendEmail({
          to: newEmail,
          subject: 'Verify your new Match District email',
          html: emailCodeHtml(code, 'Use this code to confirm this is your new email address:'),
        });
        if (!mail.success) {
          return sendJson(res, 503, { success: false, error: 'EMAIL_UNAVAILABLE', message: 'We could not send the code right now. Try again later.' });
        }
        return sendJson(res, 200, { success: true, step: 'new_code_sent', masked_new_email: maskUserEmail(newEmail), resend_in_seconds: 60 });
      }

      // ── Step 4: verify the NEW email code and save ──
      if (step === 'confirm') {
        if (!request?.new_code_hash || !request.new_email || new Date(request.new_code_expires_at).getTime() <= Date.now()) {
          return sendJson(res, 400, { success: false, error: 'CODE_EXPIRED', message: 'That code expired. Request a new one.' });
        }
        if (!(await guardVerify(req, res, { email: request.new_email, userId: account.id }))) return;
        if (Number(request.new_attempts) >= MAX_CODE_ATTEMPTS) {
          return sendJson(res, 400, { success: false, error: 'CODE_EXPIRED', message: 'That code is no longer valid. Request a new one.' });
        }
        if (!codesMatch(String(body.code || '').trim(), request.new_code_hash)) {
          await pool.query('UPDATE email_change_requests SET new_attempts = new_attempts + 1, updated_at = updated_at WHERE user_id = $1', [account.id]);
          const event = await abuse.emailChangeEvent(pool, { userId: account.id, kind: 'wrong' });
          if (!event.ok) return respondEmailChangeLocked(res, event.lockedUntil, event.newlyLocked, account);
          if (await recordFailure(req, res, { flow: 'email_change', email: request.new_email, userId: account.id })) return;
          return sendJson(res, 400, { success: false, error: 'INVALID_CODE', message: 'Incorrect code. Check the email and try again.' });
        }

        const oldEmail = account.email;
        const newEmail = request.new_email;
        const client = await pool.connect();
        let updated;
        try {
          await client.query('BEGIN');
          const locked = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [account.id]);
          if (!locked.rows.length) throw Object.assign(new Error('USER_NOT_FOUND'), { status: 404 });
          const clash = await client.query('SELECT 1 FROM users WHERE LOWER(email) = $1 AND id <> $2 LIMIT 1', [newEmail, account.id]);
          if (clash.rows.length) {
            await client.query('ROLLBACK');
            return sendJson(res, 409, { success: false, error: 'EMAIL_UNAVAILABLE', message: 'This email address cannot be used. Try a different one.' });
          }
          const upd = await client.query(
            `UPDATE users SET email = $1, "email_last_changed" = NOW() WHERE id = $2 RETURNING *`,
            [newEmail, account.id]
          );
          updated = upd.rows[0];
          await client.query('DELETE FROM email_change_requests WHERE user_id = $1', [account.id]);
          await client.query('DELETE FROM otps WHERE email = ANY($1::text[])', [[String(oldEmail).toLowerCase(), newEmail]]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK').catch(() => {});
          if (error?.code === '23505') {
            return sendJson(res, 409, { success: false, error: 'EMAIL_UNAVAILABLE', message: 'This email address cannot be used. Try a different one.' });
          }
          throw error;
        } finally {
          client.release();
        }

        await abuse.emailChangeReset(pool, account.id).catch(() => {});
        await clearFailures(req, { flow: 'email_change', email: newEmail, userId: account.id });
        // Notify the OLD address (best effort; never blocks the change).
        sendEmail({
          to: oldEmail,
          subject: 'Your Match District email address was changed',
          html: `<p>The email address on your Match District account was changed to <strong>${maskUserEmail(newEmail)}</strong>.</p>
                 <p>If you did not make this change, reset your password and contact support immediately.</p>`,
        }).catch(() => {});

        const token = signJwt({ email: updated.email, role: updated.role, roles: updated.roles || [updated.role], id: updated.uid || updated.id });
        res.setHeader('Set-Cookie', buildSessionCookie(token, req));
        const safeUser = publicUserRow(updated);
        await attachResolvedAvatars(pool, [safeUser]);
        return sendJson(res, 200, { success: true, step: 'done', user: safeUser, message: 'Email address updated.' });
      }

      return sendJson(res, 404, { success: false, error: 'NOT_FOUND' });
    } catch (error) {
      if (error?.status === 413 || error?.status === 400) {
        return sendJson(res, error.status, { success: false, error: error.message });
      }
      console.error('[EMAIL CHANGE] Failed [code: ' + (error?.code || 'UNKNOWN') + ']');
      return sendJson(res, 500, { success: false, error: 'SERVER_ERROR', message: 'Could not process the email change.' });
    }
  }

  // ───────────────────────── Background jobs ─────────────────────────
  let notificationCleanupRunning = false;

  /** Deletes expired notification rows (older than 24 h) in batches. Returns deleted count. */
  async function runNotificationCleanup() {
    if (notificationCleanupRunning) return 0;
    notificationCleanupRunning = true;
    let total = 0;
    try {
      for (const table of NOTIFICATION_TABLES) {
        for (let i = 0; i < CLEANUP_MAX_BATCHES_PER_RUN; i += 1) {
          const res = await pool.query(
            `DELETE FROM ${table} WHERE id IN (
               SELECT id FROM ${table} WHERE created_at < NOW() - ${NOTIFICATION_RETENTION_SQL} LIMIT $1
             )`,
            [CLEANUP_BATCH_SIZE]
          );
          total += res.rowCount || 0;
          if ((res.rowCount || 0) < CLEANUP_BATCH_SIZE) break;
        }
      }
      console.log(`[NOTIFICATIONS] Cleanup removed ${total} expired row(s).`);
    } catch (error) {
      console.error('[NOTIFICATIONS] Cleanup failed [code: ' + (error?.code || 'UNKNOWN') + ']');
    } finally {
      notificationCleanupRunning = false;
    }
    return total;
  }

  function startNotificationCleanup() {
    runNotificationCleanup();
    const timer = setInterval(runNotificationCleanup, 15 * 60 * 1000);
    if (timer.unref) timer.unref();
  }

  let abuseCleanupRunning = false;
  async function runAbuseCleanup() {
    if (abuseCleanupRunning) return 0;
    abuseCleanupRunning = true;
    try {
      const removed = await abuse.cleanup(pool);
      if (removed) console.log(`[ABUSE] Retention cleanup removed ${removed} row(s).`);
      return removed;
    } catch (error) {
      console.error('[ABUSE] Retention cleanup failed [code: ' + (error?.code || 'UNKNOWN') + ']');
      return 0;
    } finally {
      abuseCleanupRunning = false;
    }
  }

  function startAbuseCleanup() {
    runAbuseCleanup();
    const timer = setInterval(runAbuseCleanup, 60 * 60 * 1000);
    if (timer.unref) timer.unref();
  }

  return {
    abuse,
    guardSend,
    guardVerify,
    recordFailure,
    clearFailures,
    handleEmailChangeRoute,
    runNotificationCleanup,
    startNotificationCleanup,
    startAbuseCleanup,
  };
}
