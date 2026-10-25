// server/accountSecurity.js
// Account-safety services wired into server.js:
//   * verification abuse guard glue (send / verify gates, one in-app notice per timeout)
//   * 24-hour notification lifetime cleanup job and verification_abuse retention cleanup
import crypto from 'node:crypto';
import {
  createVerificationAbuseGuard,
  formatDuration,
  formatIstTime,
  lockedMessage,
  ABUSE_CONFIG,
} from './verificationAbuse.js';

const NOTIFICATION_RETENTION_SQL = `INTERVAL '24 hours'`;
export const NOTIFICATION_TABLES = Object.freeze(['alerts', 'notifications']);
const CLEANUP_BATCH_SIZE = 500;
const CLEANUP_MAX_BATCHES_PER_RUN = 40;

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

  /** Handles /api/account/email-change/*. Returns HTTP 410 Gone. */
  async function handleEmailChangeRoute(req, res) {
    return sendJson(res, 410, {
      success: false,
      error: 'GONE',
      message: 'Email changes are no longer supported.',
    });
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
