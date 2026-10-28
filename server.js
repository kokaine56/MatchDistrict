import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Resend } from 'resend';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { startSlotManagerWorker, reconcileTournamentSlots } from './workers/slotManagerWorker.js';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { encryptSecret, decryptSecret } from './server/cryptoSecrets.js';

import { requireFeature, checkPlanLimits, getOrganizerUsage, PLAN_FEATURES, PLAN_ORDER } from './server/subscriptionMiddleware.js';
import { calculateTournamentPlan } from './server/tournamentPlanner.js';
import { generateTournamentRoadmap } from './server/roadmapGenerator.js';
import { normalizeRoadmapConfig, validateRoadmapConfig, distributeDistrictSizes, computeDistrictCount, defaultTeamsAdvancing, isValidTime, releaseTimeFor } from './server/roadmapConfig.js';
import { syncTournamentRounds, legacyRoundBackfill, getTournamentRounds } from './server/roundsService.js';
import { validateRoadmapStructure, validateSingleMatchEdit, validateDayDateEdit, computeMatchEndTime } from './server/roadmapValidation.js';
import {
  getTournamentDistricts,
  validateManualRoadmap,
  saveManualRoadmapDraft,
  publishManualRoadmap,
  unpublishManualRoadmap,
  buildHierarchicalRoadmap,
  calculateAdvancingTeams,
  deleteTournamentRound,
  deleteEntireRoadmap,
  reorderDistrictAllocations,
  getTournamentRoadmapResponse,
} from './server/manualRoadmapService.js';
import { backfillRegistrationLinks, maxMembersForMatchType, pickEligibleRegistration, isEligibleRegistrationStatus, isExcludedRegistrationStatus, createInvitationCredentials } from './server/registrationTeamBridge.js';
import {
  computeSquadCapacity,
  parseRosterSlots,
  computeRegistrationStage,
  parseRosterMembers
} from './server/squadRegistrationService.js';
import { allocateTeam, AllocationError, ALLOCATION_SOURCES, ALLOCATION_ERR } from './server/allocationService.js';
import { matchReleaseEpoch, isMatchReleased, normalizeReleaseMinutes } from './server/matchRelease.js';
import { isRoadmapPublished } from './server/roadmapStatus.js';
import {
  qualifyMatch,
  advanceTeamsManually,
  ProgressionError,
} from './server/roundProgressionService.js';
import { mapPublicMatchResult } from './server/matchResultService.js';
import { runSchemaMigrations, runMigrationBatch, SCHEMA_TABLES } from './server/schemaMigrations.js';
import { syncMissingProfiles } from './server/profileSync.js';
import { generateDistrictId, insertWithDistrictId, migrateDistrictIds } from './server/districtId.js';
import { createDatabasePool } from './server/db.js';
import { updateTeamQualificationStatus } from './server/teamDisqualificationService.js';
import {
  getTournamentTestInjectionSummary,
  deleteTournamentTestInjectionData,
  deleteAllTestInjectionData,
  hasTestProvenanceColumns
} from './server/testDataCleanupService.js';
import { generatePrizeAwards, listPrizeAwards, PrizeAwardError } from './server/prizeAwardService.js';
import { settlePrizeAward, PrizePayoutError, isValidUpiId } from './server/prizePayoutService.js';
import { buildGroups, normalizeTeamsPerGroup, validateGroupConfig, computeGroupCount, generateGroupName, assignGroups, predictedGroupFor, groupForGlobalSlot, groupLabelForSlot, DEFAULT_TEAMS_PER_GROUP } from './server/groupService.js';
import {
  DEFAULT_PROMOTED_LIMIT,
  PROMOTED_LIMIT_SETTING_KEY,
  canManagePromotions,
  resolveRoles,
  validatePromotionPayload,
  parseDisplayLimit,
} from './server/tournamentPromotion.js';
import { isTournamentOrganizer, checkTournamentOrganizerAccess, checkTournamentOrganizerOrStaffAccess } from './server/tournamentAuth.js';
import {
  listQueue as reviewListQueue,
  getItem as reviewGetItem,
  approve as reviewApprove,
  reject as reviewReject,
  reopen as reviewReopen,
  releaseSlot as reviewReleaseSlot,
  isValidUpiUtr,
  normalizeUtr,
  normalizePaymentApp,
  isValidPaymentApp,
  formatPaymentApp
} from './server/paymentReviewService.js';
import { userDisplayNameSql, userDisplayNameRawSql, formatUserDisplayName, maskUserEmail, sanitizeUserForPublic } from './server/userUtils.js';
import { createAccountSecurity } from './server/accountSecurity.js';
import { attachResolvedAvatars } from './server/avatarResolver.js';
import { normalizeIndianMobile } from './server/accountRules.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sanitizeImageUrlForDb(value) {
  if (value == null || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.length > 2048) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

// Clean environment variables: strip whitespace and surrounding double/single quotes
function cleanEnvVar(val) {
  if (typeof val !== 'string') return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
}

function cleanEndpointUrl(val) {
  const cleaned = cleanEnvVar(val);
  return cleaned ? cleaned.replace(/\/+$/, '') : '';
}

function getImageKitPrivateKey() {
  return cleanEnvVar(process.env.IMAGEKIT_PRIVATE_KEY);
}

function getImageKitUrlEndpoint() {
  return cleanEndpointUrl(process.env.IMAGEKIT_URL_ENDPOINT);
}

/**
 * PAY-002 / SENS-009: Strict allow-list validation for payment proof / screenshot URLs.
 * Requires https: and strictly matches the configured ImageKit endpoint or Supabase Storage.
 * Rejects javascript:, data:, http:, internal IP addresses, and unknown domains.
 */
function isAllowedStorageUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return false;
  const trimmed = urlString.trim();
  if (trimmed.length > 2048) return false;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;

  const hostname = (parsed.hostname || '').toLowerCase();
  
  // Reject private/internal/loopback addresses
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
    /^169\.254\./.test(hostname)
  ) {
    return false;
  }

  // Match the configured ImageKit endpoint host and path, including custom URL endpoints.
  const configuredEndpoint = getImageKitUrlEndpoint();
  if (configuredEndpoint) {
    try {
      const imageKitEndpoint = new URL(configuredEndpoint);
      const endpointPath = imageKitEndpoint.pathname.replace(/\/+$/, '');
      if (
        imageKitEndpoint.protocol === 'https:' &&
        hostname === imageKitEndpoint.hostname.toLowerCase() &&
        parsed.port === imageKitEndpoint.port &&
        (!endpointPath || parsed.pathname === endpointPath || parsed.pathname.startsWith(endpointPath + '/'))
      ) {
        return true;
      }
    } catch {}
  }

  // Also accept standard ImageKit delivery domains
  if (hostname === 'ik.imagekit.io' || hostname.endsWith('.imagekit.io')) {
    return true;
  }

  if (hostname.endsWith('.supabase.co') || hostname.endsWith('.supabase.in')) {
    return true;
  }

  const supaUrl = cleanEnvVar(process.env.SUPABASE_URL);
  if (supaUrl) {
    try {
      const supaHost = new URL(supaUrl).hostname.toLowerCase();
      if (hostname === supaHost) return true;
    } catch {}
  }

  return false;
}

/**
 * SEC-004: Validates real file content using magic byte inspection.
 * Allowed formats: JPEG, PNG, GIF, WEBP, and ISOBMFF formats (HEIC, HEIF, AVIF).
 */
function isValidImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return true;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    return true;
  }

  // GIF: GIF87a or GIF89a (47 49 46 38 37/39 61)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return true;
  }

  // WEBP: RIFF....WEBP (52 49 46 46 .... 57 45 42 50)
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return true;
  }

  // ISOBMFF (HEIC/HEIF, AVIF): bytes 4..7 must be 'ftyp'
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12).toLowerCase();
    const isHeic = ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand);
    const isAvif = ['avif', 'avis'].includes(brand);
    if (isHeic || isAvif) {
      return true;
    }
    const headerString = buffer.slice(8, Math.min(buffer.length, 64)).toString('ascii').toLowerCase();
    if (/heic|heix|hevc|hevx|mif1|msf1|avif|avis/.test(headerString)) {
      return true;
    }
  }

  return false;
}

const UNLINK_COOLDOWN_DAYS = 14;
const UNLINK_COOLDOWN_MS = UNLINK_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

function getUnlinkCooldownStatus(linkedAt) {
  if (!linkedAt) {
    return { canUnlink: true, remainingDays: 0, canUnlinkAt: null, elapsedDays: null };
  }
  const linkedTime = new Date(linkedAt).getTime();
  if (isNaN(linkedTime)) {
    return { canUnlink: true, remainingDays: 0, canUnlinkAt: null, elapsedDays: null };
  }
  const canUnlinkAt = new Date(linkedTime + UNLINK_COOLDOWN_MS);
  const diffMs = canUnlinkAt.getTime() - Date.now();
  if (diffMs <= 0) {
    return { canUnlink: true, remainingDays: 0, canUnlinkAt, elapsedDays: Math.floor((Date.now() - linkedTime) / (24 * 60 * 60 * 1000)) };
  }
  const remainingDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return { canUnlink: false, remainingDays, canUnlinkAt, elapsedDays: Math.floor((Date.now() - linkedTime) / (24 * 60 * 60 * 1000)) };
}

function publicUserRow(row) {
  if (!row) return null;
  const user = { ...row };
  delete user.password;
  delete user.admin_totp_secret;
  delete user.admin_totp_activated;
  delete user.kycDoc;
  delete user.username;
  delete user.username_last_changed;
  delete user.google_id;
  delete user.discord_id;
  user.password_set = row.password_set === false ? false : (row.password_set === true ? true : !row.google_id);
  user.display_name = formatUserDisplayName(user);
  user.avatar = sanitizeImageUrlForDb(user.avatar);
  user.banner = sanitizeImageUrlForDb(user.banner);
  user.orgImage = sanitizeImageUrlForDb(user.orgImage);
  user.orgBanner = sanitizeImageUrlForDb(user.orgBanner);

  user.google_linked_at = row.google_linked_at || null;
  user.discord_linked_at = row.discord_linked_at || null;
  const googleCd = getUnlinkCooldownStatus(row.google_linked_at);
  const discordCd = getUnlinkCooldownStatus(row.discord_linked_at);
  user.can_unlink_google = googleCd.canUnlink;
  user.google_unlink_remaining_days = googleCd.remainingDays;
  user.can_unlink_discord = discordCd.canUnlink;
  user.discord_unlink_remaining_days = discordCd.remainingDays;
  return user;
}

// Validate same-site relative redirect path; rejects protocol-relative ('//'), backslashes ('\'), and external URLs
function getSafeRelativeRedirect(redirectUrl, defaultPath = '/') {
  if (!redirectUrl || typeof redirectUrl !== 'string') return defaultPath;
  const trimmed = redirectUrl.trim();
  // Prevent landing back on authentication pages after successful login
  if (trimmed === '/auth' || trimmed.startsWith('/auth?') || trimmed === '/login' || trimmed.startsWith('/login?')) {
    return defaultPath;
  }
  if ((/^\/[^/\\]/.test(trimmed) || trimmed === '/') && !trimmed.includes(':') && !trimmed.startsWith('//')) {
    return trimmed;
  }
  return defaultPath;
}

async function storeProviderIdentity(db, { userId, provider, providerUserId, providerEmail = null, emailVerified = null, displayName = null, avatarUrl = null, lastLogin = false }) {
  await db.query(
    `INSERT INTO auth_identities (id, user_id, provider, provider_user_id, provider_email, email_verified, display_name, avatar_url, linked_at, last_login_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), CASE WHEN $9 THEN NOW() ELSE NULL END)
     ON CONFLICT (provider, provider_user_id) DO UPDATE SET
       provider_email = COALESCE(EXCLUDED.provider_email, auth_identities.provider_email),
       email_verified = COALESCE(EXCLUDED.email_verified, auth_identities.email_verified),
       display_name = COALESCE(EXCLUDED.display_name, auth_identities.display_name),
       avatar_url = COALESCE(EXCLUDED.avatar_url, auth_identities.avatar_url),
       last_login_at = CASE WHEN $9 THEN NOW() ELSE auth_identities.last_login_at END
     WHERE auth_identities.user_id = EXCLUDED.user_id`,
    ['AID-' + crypto.randomBytes(16).toString('hex'), userId, provider, String(providerUserId), providerEmail, emailVerified, displayName, avatarUrl, lastLogin]
  );
}

function makeErrorRef() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function logErrorWithRef(ref, routeName, err, step = 'execute') {
  const code = err?.code || (typeof err === 'object' && err?.pgCode) || 'N/A';
  const status = err?.status || (typeof err === 'object' && err?.httpStatus) || '';
  const statusStr = status ? ` status=${status}` : '';
  const detail = err?.constraint ? ` constraint=${err.constraint}` : (err?.column ? ` column=${err.column}` : '');
  const msg = (err?.message || (typeof err === 'string' ? err : 'Unknown error')).replace(/[\r\n]+/g, ' ');
  console.error(`[ERROR Ref:${ref}] route="${routeName}" step="${step}" pgCode=${code}${statusStr}${detail} message="${msg}"`);
}

// ─────────────────────────────────────────────────────────────
// Shared Session Cookie Engine
// Ensures set and clear operations use identical attributes so cookies never drift.
// ─────────────────────────────────────────────────────────────
function isHttpsRequest(req) {
  if (!req) return false;
  if (req.socket && req.socket.encrypted) return true;
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';
  const proto = req.headers && req.headers['x-forwarded-proto'];
  const host = (req.headers && (req.headers.host || req.headers['x-forwarded-host'])) || '';
  const isLocalhost = /^localhost(:\d+)?$/i.test(host) || /^127\.0\.0\.1(:\d+)?$/i.test(host);

  // If localhost on plain HTTP, never set Secure cookie (browser would silently drop it)
  if (isLocalhost && proto !== 'https') {
    return false;
  }

  if (trustProxy && proto === 'https') return true;
  if (process.env.NODE_ENV === 'production' && !isLocalhost) {
    if (proto === 'https' || (!proto && !host.includes('localhost') && !host.includes('127.0.0.1'))) {
      return true;
    }
  }
  return false;
}

function buildSessionCookie(token, req, options = {}) {
  const isSecure = isHttpsRequest(req);
  const maxAge = options.maxAge !== undefined ? options.maxAge : 86400; // 24 hours default
  const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
  let cookie = `token=${token}; Path=/; SameSite=Lax; HttpOnly; Max-Age=${maxAge}; Expires=${expires}`;
  if (isSecure) cookie += '; Secure';
  return cookie;
}

function buildClearSessionCookies(req) {
  const isSecure = isHttpsRequest(req);
  const expiredDate = 'Thu, 01 Jan 1970 00:00:00 GMT';
  const cookies = [];
  cookies.push(`token=; Path=/; SameSite=Lax; HttpOnly; Max-Age=0; Expires=${expiredDate}${isSecure ? '; Secure' : ''}`);
  if (isSecure) {
    cookies.push(`token=; Path=/; SameSite=Lax; HttpOnly; Max-Age=0; Expires=${expiredDate}`);
  }
  return cookies;
}

// Hash a password using pbkdf2
function hashPassword(password) {
  if (password == null || typeof password !== 'string') return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `pbkdf2$${salt}$${hash}`;
}

// Verify a password against a hash
function verifyPassword(password, storedPassword) {
  if (!password || !storedPassword) return false;

  // If stored password doesn't follow the hash format, check plaintext (fallback for existing users)
  if (!storedPassword.startsWith('pbkdf2$')) {
    return password === storedPassword;
  }

  const parts = storedPassword.split('$');
  if (parts.length !== 3) return false;

  const salt = parts[1];
  const storedHash = parts[2];
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === storedHash;
}

// Manual .env loader
function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const firstEqual = trimmed.indexOf('=');
          if (firstEqual !== -1) {
            const key = trimmed.slice(0, firstEqual).trim();
            let val = trimmed.slice(firstEqual + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (val) {
              process.env[key] = val;
            }
          }
        }
      });
    }
  } catch (err) {
    console.warn('⚠️ [ENV LOADER] Could not load .env file:', err.message);
  }
}
loadEnv();

const REQUIRED_ENV_KEYS = ['DATABASE_URL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
for (const key of REQUIRED_ENV_KEYS) {
  console.log(`[ENV] ${key}: ${process.env[key] ? 'present' : 'missing'}`);
}

const PORT = process.env.PORT || 10000;

// Derive the public-facing server URL from the incoming request
function getServerUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers['host'] || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

// Clean Discord environment variables: strip whitespace and surrounding double/single quotes
function cleanDiscordEnv(val) {
  if (typeof val !== 'string') return '';
  return val.trim().replace(/^["']|["']$/g, '').trim();
}

// Custom User-Agent for all Discord API requests to avoid Cloudflare bot blocking (HTTP 403 / Error 1010)
const DISCORD_API_USER_AGENT = 'MatchDistrict (https://matchdistrict.in, 1.0)';

// In-memory cache to prevent duplicate token exchange attempts on single-use authorization codes
const processedDiscordCodes = new Map();
if (typeof setInterval === 'function') {
  const codeCleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [code, entry] of processedDiscordCodes.entries()) {
      if (now - entry.timestamp > 5 * 60 * 1000) {
        processedDiscordCodes.delete(code);
      }
    }
  }, 60 * 1000);
  if (codeCleanupTimer.unref) codeCleanupTimer.unref();
}


// Enforce and validate environment variables for production-grade security
if (!process.env.DATABASE_URL) {
  console.error('\n❌ [CRITICAL ERROR] DATABASE_URL is not set in the environment or .env file.');
  console.error('Hardcoded database credentials have been removed for production security.');
  console.error('Please configure DATABASE_URL in your environment or .env file before starting the server.\n');
  process.exit(1);
}

for (const key of ['DATABASE_URL', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']) {
  if (!process.env[key]) {
    console.error(`❌ CRITICAL: ${key} is required. Set it in the server environment before starting.`);
    process.exit(1);
  }
}

if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.error("❌ CRITICAL: ADMIN_EMAIL or ADMIN_PASSWORD environment variable is missing.");
  process.exit(1);
}

if (process.env.ADMIN_PASSWORD === '101010') {
  console.error("❌ CRITICAL: ADMIN_PASSWORD is set to the known insecure default ('101010'). Set a strong, unique ADMIN_PASSWORD in your environment before starting.");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'matchdistrict_super_secure_jwt_secret_key_2026') {
  console.error("❌ CRITICAL: JWT_SECRET environment variable is missing or set to the insecure default. Set a strong, unique JWT_SECRET in your environment before starting.");
  process.exit(1);
}

// Encryption helper functions for browser persistent session
const ENCRYPTION_KEY = crypto.scryptSync(JWT_SECRET, 'md-salt-string', 32);
const IV_LENGTH = 16;

function encryptSessionData(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptSessionData(text) {
  const textParts = text.split(':');
  if (textParts.length < 2) throw new Error('Invalid format');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

function encryptAuthPayload(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptAuthPayload(value) {
  const [ivHex, tagHex, encryptedHex] = String(value || '').split(':');
  if (!ivHex || !tagHex || !encryptedHex) throw new Error('Invalid auth payload.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8');
}

function readCookie(req, name) {
  const match = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}

function pendingProviderCookie(req, value, maxAge = 600) {
  const secure = isHttpsRequest(req) ? '; Secure' : '';
  return `md_pending_provider=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function getPendingProvider(req) {
  const value = readCookie(req, 'md_pending_provider');
  if (!value) return null;
  try {
    const payload = JSON.parse(decryptAuthPayload(value));
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

function makePendingProviderCookie(req, { provider, providerUserId, providerEmail, displayName, avatarUrl, returnTo = '/' }) {
  return pendingProviderCookie(req, encryptAuthPayload(JSON.stringify({
    provider, providerUserId: String(providerUserId), providerEmail, emailVerified: true,
    displayName: displayName || null, avatarUrl: avatarUrl || null,
    returnTo: getSafeRelativeRedirect(returnTo, '/'), exp: Date.now() + 10 * 60 * 1000
  })));
}

async function findPendingLinkAccount(db, providerEmail) {
  const result = await db.query(
    `SELECT DISTINCT u.* FROM users u
     LEFT JOIN auth_identities i ON i.user_id = u.id AND i.email_verified = true
     WHERE lower(u.email) = $1 OR (i.provider_email IS NOT NULL AND lower(i.provider_email) = $1)
     LIMIT 2`, [providerEmail]
  );
  return result.rows;
}

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const IMAGEKIT_PRIVATE_KEY = getImageKitPrivateKey();
const IMAGEKIT_URL_ENDPOINT = getImageKitUrlEndpoint();
const IMAGEKIT_UPLOAD_IDS_BY_URL = new Map();
// Sponsorship feature flag — gated until production-ready. Flip `ENABLE_SPONSORSHIP=true` to activate the full flow.
const SPONSORSHIP_ENABLED = process.env.ENABLE_SPONSORSHIP === 'true';

// Initialize Resend
if (!RESEND_API_KEY) {
  console.warn('⚠️ [RESEND] RESEND_API_KEY is not set. Email sending will be disabled.');
}
const resend = new Resend(RESEND_API_KEY);

// Helper: send email via Resend with consistent error handling
async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.warn(`⚠️ [EMAIL] Skipping send to ${to} — RESEND_API_KEY is not configured.`);
    return { success: false, error: 'Email service not configured' };
  }
  try {
    const recipients = Array.isArray(to) ? to : [to];
    const { data, error } = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: recipients,
      subject,
      html,
    });
    if (error) {
      console.error(`❌ [RESEND] Failed to send email to ${recipients.join(', ')}:`, error.message || JSON.stringify(error));
      return { success: false, error: error.message || 'Resend API error' };
    }
    console.log(`✅ [RESEND] Email sent to: ${recipients.join(', ')}`);
    return { success: true };
  } catch (err) {
    console.error(`❌ [RESEND EXCEPTION] Failed to send email to ${to}:`, err.message);
    return { success: false, error: err.message };
  }
}

// Helper: remove a recently uploaded ImageKit file if its database transaction fails.
async function removeUploadedMedia(mediaUrl) {
  if (!mediaUrl || typeof mediaUrl !== 'string') return;
  try {
    const now = Date.now();
    for (const [url, file] of IMAGEKIT_UPLOAD_IDS_BY_URL) {
      if (now - file.createdAt > 10 * 60 * 1000) IMAGEKIT_UPLOAD_IDS_BY_URL.delete(url);
    }
    const ikPrivateKey = getImageKitPrivateKey();
    if (!uploadedFile || !ikPrivateKey) return;

    const auth = Buffer.from(ikPrivateKey + ':').toString('base64');
    const response = await fetch('https://api.imagekit.io/v1/files/' + encodeURIComponent(uploadedFile.fileId), {
      method: 'DELETE',
      headers: { Authorization: 'Basic ' + auth }
    });
    if (!response.ok) throw new Error('ImageKit file deletion failed with status ' + response.status);
    IMAGEKIT_UPLOAD_IDS_BY_URL.delete(mediaUrl);
    console.log('[MediaCleanup] Removed uploaded ImageKit file after transaction rollback.');
  } catch (err) {
    console.warn('[MediaCleanup] Could not remove uploaded media:', err.message);
  }
}

// Initialize Supabase Client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

// The shared module is the sole PostgreSQL pool factory; it reads DATABASE_URL only.
const pool = createDatabasePool();

async function ensureSupabaseProfile(client, user) {
  if (!user || !(user.uid || user.id) || !user.email) return;
  const profileValues = [user.uid || user.id, user.uid || null, user.name || null, user.email, user.gamerTag || user['gamerTag'] || null,
    user.role || 'gamer', user.roles || ['user'], user.tier || 'Amateur', user.avatar || null, user.banner || null,
    user.phone || null, user.status || 'Active', user.riotId || user['riotId'] || null, user.bgmiId || user['bgmiId'] || null,
    user.steamId || user['steamId'] || null, user.discordTag || user['discordTag'] || null,
    user.socialLinks || user['socialLinks'] || null, user.orgName || user['orgName'] || null,
    user.orgMotto || user['orgMotto'] || null, user.orgHandle || user['orgHandle'] || null,
    user.orgImage || user['orgImage'] || null, user.orgBio || user['orgBio'] || null];

  // Only enrich the same profile when its email still matches. Never copy the
  // incoming identity over another profile that already owns this email.
  await client.query(
    `UPDATE profiles
     SET "gamerTag" = COALESCE(profiles."gamerTag", $5)
     WHERE id = $1 AND email = $4`,
    profileValues.slice(0, 5)
  );

  const insertResult = await client.query(
    `INSERT INTO profiles (id, uid, name, email, "gamerTag", role, roles, tier, avatar, banner, phone, status,
                          "riotId", "bgmiId", "steamId", "discordTag", "socialLinks", "orgName", "orgMotto", "orgHandle", "orgImage", "orgBio")
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
     WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE email = $4 AND id <> $1)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    profileValues
  );
  if (insertResult.rowCount === 0) {
    const conflict = await client.query(
      'SELECT EXISTS (SELECT 1 FROM profiles WHERE email = $1 AND id <> $2) AS email_conflict',
      [user.email, user.uid || user.id]
    );
    if (conflict.rows[0]?.email_conflict) {
      console.warn('[PROFILE] Profile creation skipped because the email is already assigned to a different profile ID. Existing accounts were left unchanged.');
    }
  }
}

// Initialize Supabase Tables & Verify Connection
async function initDb() {
  let client;
  try {
    client = await pool.connect();
    console.log('\n📦 [MATCH DISTRICT DB] Connected to Supabase PostgreSQL Database.');

    const beforeTables = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
      [SCHEMA_TABLES]
    );
    const existingTables = new Set(beforeTables.rows.map(row => row.tablename));

    // Authoritative idempotent schema migrations for the live Supabase database.
    // Runs shared DDL for all core tables (CREATE TABLE IF NOT EXISTS tournament_planning_config, etc.)
    await runSchemaMigrations(client);
    const districtIdMigration = await migrateDistrictIds(client);
    console.log(`[STARTUP] District ID backfill complete: ${districtIdMigration.assigned} assigned across ${districtIdMigration.scanned} account(s).`);
    for (const table of SCHEMA_TABLES) {
      console.log(`[SCHEMA] ${table}: ${existingTables.has(table) ? 'already present; checked' : 'created'}`);
    }

    // Startup check for Discord configuration & table presence (no secrets logged)
    loadEnv();
    const hasDiscordClientId = Boolean(cleanDiscordEnv(process.env.DISCORD_CLIENT_ID));
    const hasDiscordClientSecret = Boolean(cleanDiscordEnv(process.env.DISCORD_CLIENT_SECRET));
    const hasDiscordRedirectUri = Boolean(cleanDiscordEnv(process.env.DISCORD_REDIRECT_URI));
    const isDiscordConfigured = hasDiscordClientId && hasDiscordClientSecret && hasDiscordRedirectUri;

    const discordTableCheck = await client.query(
      `SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_discord_connections'`
    );
    const discordTableExists = discordTableCheck.rows.length > 0;

    console.log(
      `🎮 [DISCORD STARTUP] Feature configured: ${isDiscordConfigured} ` +
      `(client_id=${hasDiscordClientId}, client_secret=${hasDiscordClientSecret}, redirect_uri=${hasDiscordRedirectUri}) | ` +
      `Table "user_discord_connections": ${discordTableExists ? 'EXISTS' : 'MISSING'}`
    );
    await syncMissingProfiles(client);

    // ── ROADMAP & LIVE SCHEMA COLUMN MIGRATIONS (TASK 2 & 3) ───────────────
    // Idempotent migrations for tournament_matches, tournament_rounds, etc.
    try {
      await runMigrationBatch(client, `
        -- 0. Discord and Google account linking columns on users and connections table
        ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id VARCHAR(50);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_user_id VARCHAR(50);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_username VARCHAR(100);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_linked_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS google_linked_at TIMESTAMP WITH TIME ZONE;
        CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
        CREATE INDEX IF NOT EXISTS idx_users_discord_user_id ON users(discord_user_id);
        CREATE INDEX IF NOT EXISTS idx_users_google_linked_at ON users(google_linked_at);
        CREATE INDEX IF NOT EXISTS idx_users_discord_linked_at ON users(discord_linked_at);

        CREATE TABLE IF NOT EXISTS user_discord_connections (
          user_id VARCHAR(50) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          discord_id VARCHAR(32) NOT NULL UNIQUE,
          username VARCHAR(64),
          global_name VARCHAR(128),
          avatar_hash VARCHAR(64),
          connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_user_discord_connections_discord_id ON user_discord_connections(discord_id);

        -- 1. tournament_matches additive columns
        ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS district_id VARCHAR(50);
        ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS display_order INTEGER;
        ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS origin VARCHAR(20) DEFAULT 'automatic';
        ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT FALSE;
        ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS notes TEXT;
        ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS id_pwd_release_time VARCHAR(50);
        ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS group_name VARCHAR(100);
        ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS map VARCHAR(100);
        ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS teams_advancing INTEGER;
        ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS progression_processed BOOLEAN DEFAULT false;
        ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS next_match_id VARCHAR(50);
        ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS next_round_id VARCHAR(50);
        ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS round_id VARCHAR(50);
        ALTER TABLE tournament_matches ADD COLUMN IF NOT EXISTS day_id VARCHAR(50);

        CREATE INDEX IF NOT EXISTS idx_tournament_matches_district ON tournament_matches(district_id);
        CREATE INDEX IF NOT EXISTS idx_tournament_matches_round ON tournament_matches(round_id);
        CREATE INDEX IF NOT EXISTS idx_tournament_matches_day ON tournament_matches(day_id);

        -- 2. tournament_rounds additive columns
        ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS teams_in INTEGER;
        ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS round_type VARCHAR(50) DEFAULT 'qualifier';
        ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS advancement_type VARCHAR(50) DEFAULT 'per_district';
        ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS advancement_target_round_id VARCHAR(50);
        ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS teams_advancing_per_district INTEGER;
        ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS teams_advancing_per_match INTEGER;
        ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS round_order INTEGER;
        ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS lobbies_note TEXT;
        ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
        ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS is_grand_final BOOLEAN DEFAULT false;
        ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS "date" VARCHAR(30);
        ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS "time" VARCHAR(10);
        ALTER TABLE tournament_rounds ADD COLUMN IF NOT EXISTS map VARCHAR(255);

        -- 3. tournament_days additive columns
        ALTER TABLE tournament_days ADD COLUMN IF NOT EXISTS round_id VARCHAR(50);
        ALTER TABLE tournament_days ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
        ALTER TABLE tournament_days ADD COLUMN IF NOT EXISTS "date" VARCHAR(30);
        ALTER TABLE tournament_days ADD COLUMN IF NOT EXISTS day_number INTEGER;

        -- 4. tournament_groups additive columns
        ALTER TABLE tournament_groups ADD COLUMN IF NOT EXISTS district_id VARCHAR(50);
        ALTER TABLE tournament_groups ADD COLUMN IF NOT EXISTS display_order INTEGER;
        ALTER TABLE tournament_groups ADD COLUMN IF NOT EXISTS round_id VARCHAR(50);

        -- 5. tournament_rooms additive columns
        ALTER TABLE tournament_rooms ADD COLUMN IF NOT EXISTS round_id VARCHAR(50);
        ALTER TABLE tournament_rooms ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'DRAFT';
        ALTER TABLE tournament_rooms ADD COLUMN IF NOT EXISTS capacity INTEGER;

        -- 6. tournament_teams additive columns
        ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS status_before_dq VARCHAR(50);
        ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS registration_id VARCHAR(50);
        ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS squad_waived_by VARCHAR(50);
        ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS squad_waived_at TIMESTAMPTZ;
        ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS squad_waived_reason TEXT;
        CREATE INDEX IF NOT EXISTS idx_tournament_teams_squad_waived ON tournament_teams(squad_waived_by);

        -- 6b. tournament_team_members additive columns
        ALTER TABLE tournament_team_members ADD COLUMN IF NOT EXISTS roster_slot INTEGER;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_roster_slot ON tournament_team_members(tournament_team_id, roster_slot) WHERE roster_slot IS NOT NULL;

        -- 7. tournament_match_results additive columns
        ALTER TABLE tournament_match_results ADD COLUMN IF NOT EXISTS wwcd BOOLEAN DEFAULT FALSE;
        ALTER TABLE tournament_match_results ADD COLUMN IF NOT EXISTS kill_points INTEGER DEFAULT 0;
        ALTER TABLE tournament_match_results ADD COLUMN IF NOT EXISTS placement_points INTEGER DEFAULT 0;
        ALTER TABLE tournament_match_results ADD COLUMN IF NOT EXISTS total_points INTEGER DEFAULT 0;
        ALTER TABLE tournament_match_results ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';
        ALTER TABLE tournament_match_results ADD COLUMN IF NOT EXISTS submitted_by VARCHAR(50);
        ALTER TABLE tournament_match_results ADD COLUMN IF NOT EXISTS verified_by VARCHAR(50);

        -- 8. Payment & organization schema enhancements
        ALTER TABLE payment_submissions ALTER COLUMN amount TYPE NUMERIC(10, 2);
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "orgId" VARCHAR(50);
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "orgName" VARCHAR(255);
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS org_id VARCHAR(50);
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS org_name VARCHAR(255);

        -- 9. Full column audit additive migrations (idempotent)
        ALTER TABLE users ADD COLUMN IF NOT EXISTS "orgImage" TEXT;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10, 2) DEFAULT 0;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS early_access BOOLEAN DEFAULT FALSE;
        ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS "entryFee" VARCHAR(100);
        ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE organiser_followers ADD COLUMN IF NOT EXISTS organiser_id VARCHAR(50);
        ALTER TABLE organiser_followers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS user_id VARCHAR(50);
        ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS plan_name VARCHAR(100);
        ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(50);
        ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS amount NUMERIC(10, 2);
        ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255);
        ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';
        ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS admin_id VARCHAR(50);
        ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
        ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
        ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS payment_screenshot_url TEXT;
        ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS payment_notes TEXT;
        ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS utr_ref VARCHAR(255);
        ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
        ALTER TABLE temp_users ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
        ALTER TABLE temp_users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);
        ALTER TABLE otps ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;
      `);
      console.log('📦 [MATCH DISTRICT DB] Roadmap & progression schema migrations applied.');
    } catch (migErr) {
      console.error('❌ [MATCH DISTRICT DB] Roadmap schema migration failed:', migErr.message);
      throw migErr;
    }

    // ── BACKFILL: Inferred district_id for legacy matches (TASK 4) ───────────
    try {
      const backfillRes = await client.query(`
        UPDATE tournament_matches m
        SET district_id = COALESCE(g.district_id, g.id)
        FROM tournament_groups g
        LEFT JOIN tournament_rooms r ON r.id = m.room_id
        WHERE m.district_id IS NULL
          AND g.id = COALESCE(m.group_id, r.group_id)
      `);
      if (backfillRes.rowCount > 0) {
        console.log(`📦 [MATCH DISTRICT DB] Backfilled district_id for ${backfillRes.rowCount} legacy match(es).`);
      }
    } catch (bfErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] district_id backfill skipped:', bfErr.message);
    }

    try {
      await legacyRoundBackfill(pool);
      console.log('📦 [MATCH DISTRICT DB] Tournament rounds (Round/Stage) initialized.');
    } catch (roundErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Legacy round backfill skipped:', roundErr.message);
    }

    let shouldBackfill = true;
    try {
      const marker = await client.query("SELECT 1 FROM site_settings WHERE key = 'promotions_featured_backfilled' LIMIT 1");
      if (marker.rows.length > 0) shouldBackfill = false;
    } catch { /* ignore */ }
    if (shouldBackfill) {
      try {
        const backfill = await client.query(`
          INSERT INTO tournament_promotions (id, tournament_id, is_active, placement, priority, display_order)
          SELECT 'PRM-' || UPPER(SUBSTR(MD5(RANDOM()::TEXT || t.id), 1, 16)), t.id, true, 'trending_featured', 0, 0
          FROM tournaments t
          WHERE t.featured = true
            AND NOT EXISTS (SELECT 1 FROM tournament_promotions p WHERE p.tournament_id = t.id)
          ON CONFLICT (tournament_id) DO NOTHING
        `);
        await client.query(
          `INSERT INTO site_settings (key, value, updated_at) VALUES ('promotions_featured_backfilled', '1', NOW())
           ON CONFLICT (key) DO NOTHING`
        );
        if (backfill.rowCount > 0) {
          console.log(`📦 [MATCH DISTRICT DB] Backfilled ${backfill.rowCount} featured tournament(s) into tournament_promotions.`);
        }
      } catch (backfillErr) {
        console.warn('⚠️ [MATCH DISTRICT DB] Promotion backfill skipped:', backfillErr.message);
      }
    }

    // --- ENABLE REALTIME REPLICATION ---
    try {
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
            CREATE PUBLICATION supabase_realtime;
          END IF;
        END $$;
      `);

      const tables = [
        'users',
        'organizer_applications',
        'org_applications',
        'tournaments',
        'tournament_registrations',
        'tournament_notices',
        'tournament_messages',
        'wallet_transactions',
        'tournament_promotions'
      ];

      for (const table of tables) {
        const checkTableExists = await client.query(`
          SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = $1
        `, [table]);

        if (checkTableExists.rows.length > 0) {
          await client.query(`ALTER TABLE "${table}" REPLICA IDENTITY FULL;`);

          const pubTableCheck = await client.query(`
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND schemaname = 'public' 
            AND tablename = $1
          `, [table]);

          if (pubTableCheck.rows.length === 0) {
            await client.query(`ALTER PUBLICATION supabase_realtime ADD TABLE "${table}";`);
            console.log(`📡 [REALTIME] Added table "${table}" to supabase_realtime publication.`);
          }
        }
      }
    } catch (realtimeErr) {
      console.warn('⚠️ [REALTIME] Failed to configure Supabase Realtime publication:', realtimeErr.message);
    }

    // Seed admin user if not present
    try {
      const adminEmail = process.env.ADMIN_EMAIL || ROOT_ADMIN_EMAIL;
      const adminPassword = process.env.ADMIN_PASSWORD;
      const checkAdmin = await client.query('SELECT * FROM users WHERE email = $1', [adminEmail]);
      if (checkAdmin.rows.length === 0) {
        const adminId = 'ADM-' + crypto.randomBytes(8).toString('hex');
        const hashedAdminPassword = hashPassword(adminPassword);
        const seededAdmin = await insertWithDistrictId((districtId) => client.query(
          `INSERT INTO users (id, uid, name, email, password, "gamerTag", role, roles, tier, "orgApplicationStatus", avatar, status, district_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (district_id) DO NOTHING RETURNING *`,
          [
            adminId,
            adminId,
            'Super Admin',
            adminEmail,
            hashedAdminPassword,
            '@admin',
            'admin',
            ['user', 'admin'],
            'Pro',
            'none',
            'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=500&q=80',
            'Active',
            districtId
          ]
        ));
        await ensureSupabaseProfile(client, seededAdmin);
        console.log(`🛡️ [MATCH DISTRICT DB] Super Admin user seeded successfully (${adminEmail}).`);
      } else {
        console.log('[SEED] Root-admin email already exists; existing account data was left unchanged.');
      }
    } catch (seedErr) {
      console.error('❌ [MATCH DISTRICT DB] Failed to seed admin user:', seedErr.message);
      throw seedErr;
    }

    // Seed default fee percentages if not set
    try {
      await client.query(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('platform_fee_percentage', '10', CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO NOTHING
      `);
      console.log('💰 [MATCH DISTRICT DB] Default platform fee seeded (10%).');
    } catch (feeErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not seed platform fee:', feeErr.message);
    }

    try {
      await client.query(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('organizer_fee_percentage', '5', CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO NOTHING
      `);
      console.log('💰 [MATCH DISTRICT DB] Default organizer fee seeded (5%).');
    } catch (orgFeeErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not seed organizer fee:', orgFeeErr.message);
    }

    // Seed default terms & privacy versions
    try {
      await client.query(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('terms_version', '1.0', CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO NOTHING
      `);
      await client.query(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES ('privacy_version', '1.0', CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO NOTHING
      `);
      console.log('📜 [MATCH DISTRICT DB] Default terms v1.0 & privacy v1.0 seeded.');
    } catch (verErr) {
      console.warn('⚠️ [MATCH DISTRICT DB] Could not seed terms versions:', verErr.message);
    }

    // ── HANDLE UNIFICATION MIGRATION: Sync orgHandle to gamerTag ──────────
    try {
      const migrateRes = await client.query(
        `UPDATE users SET "orgHandle" = "gamerTag"
         WHERE ("orgHandle" IS DISTINCT FROM "gamerTag" OR "orgHandle" IS NULL)
           AND ('organiser' = ANY(roles) OR 'admin' = ANY(roles))
           AND "gamerTag" IS NOT NULL`
      );
      if (migrateRes.rowCount > 0) {
        console.log(`🔄 [MIGRATION] Synced ${migrateRes.rowCount} existing organizer orgHandle → gamerTag.`);
        // Notify affected users via alerts
        const affectedRes = await client.query(
          `SELECT id FROM users
           WHERE ("orgHandle" IS DISTINCT FROM "gamerTag" OR "orgHandle" IS NULL)
             AND ('organiser' = ANY(roles) OR 'admin' = ANY(roles))
             AND "gamerTag" IS NOT NULL`
        );
        for (const row of affectedRes.rows) {
          await client.query(
            `INSERT INTO alerts (id, user_id, type, title, message, created_at)
             VALUES ($1, $2, 'info', 'Handle Unified',
                     'Your organization handle has been synced to match your gamerTag. You can now use your personal username as your org identity.',
                     CURRENT_TIMESTAMP)`,
            ['ALERT-' + crypto.randomBytes(4).toString('hex').toUpperCase(), row.id]
          );
        }
      }
    } catch (migErr) {
      console.warn('⚠️ [MIGRATION] Handle sync skipped:', migErr.message);
    }

    // ── REGISTRATION → TEAM BRIDGE: idempotent legacy backfill ─────────────
    // Links existing tournament_teams to their leader's UNIQUE eligible
    // registration where unambiguous. Never creates teams, never guesses, and
    // re-running is a no-op (only NULL registration_id rows are ever written).
    try {
      const backfill = await backfillRegistrationLinks(client);
      if (backfill.total > 0) {
        console.log(
          `🔗 [BRIDGE] Registration→Team backfill: ${backfill.linked} linked, ` +
          `${backfill.skippedNone} no eligible registration, ${backfill.skippedAmbiguous} ambiguous, ` +
          `${backfill.total} unlinked teams scanned.`
        );
      }
    } catch (bridgeBfErr) {
      console.warn('⚠️ [BRIDGE] Registration→Team backfill skipped:', bridgeBfErr.message);
    }

    console.log('📦 [MATCH DISTRICT DB] Supabase Tables Initialized Successfully.\n');
  } catch (err) {
    const code = err?.code || 'UNKNOWN';
    const constraint = err?.constraint ? `, constraint: ${err.constraint}` : '';
    console.error(`❌ [MATCH DISTRICT DB] Initialization failed [code: ${code}${constraint}].`);
    throw err;
  } finally {
    client?.release();
  }
}

// DB init completes before server accepts traffic (see listen below)

// Helper to sign JWT
function signJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 86400000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

// Helper to verify JWT
function verifyJwt(token) {
  try {
    const [header, body, signature] = token.split('.');
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (signature === expectedSig) {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (payload.exp && payload.exp < Date.now()) {
        return { valid: false, error: 'Token expired' };
      }
      return { valid: true, payload };
    }
    return { valid: false, error: 'Invalid signature' };
  } catch (err) {
    return { valid: false, error: 'Malformed token' };
  }
}

// Helper to log terms/privacy acceptance to the audit table
async function logTermsAcceptance(pool, email, userId, action, req) {
  try {
    const tvRes = await pool.query(`SELECT value FROM site_settings WHERE key = 'terms_version'`).catch(() => ({ rows: [] }));
    const pvRes = await pool.query(`SELECT value FROM site_settings WHERE key = 'privacy_version'`).catch(() => ({ rows: [] }));
    const termsVersion = tvRes.rows[0]?.value || '1.0';
    const privacyVersion = pvRes.rows[0]?.value || '1.0';
    const ipAddress = req && req.headers
      ? ((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket ? req.socket.remoteAddress : '') || 'unknown')
      : 'unknown';
    const userAgent = (req && req.headers && req.headers['user-agent']) || '';

    const id = 'TAL-' + crypto.randomBytes(8).toString('hex');
    await pool.query(
      `INSERT INTO terms_acceptance_log (id, user_id, email, action, terms_version, privacy_version, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, userId || null, email, action, termsVersion, privacyVersion, ipAddress, userAgent]
    ).catch(() => {});
    console.log(`\n📜 [TERMS ACCEPTANCE] ${action}`);
    console.log(`    Email: ${email} | User: ${userId || '—'}`);
    console.log(`    Terms: v${termsVersion} | Privacy: v${privacyVersion}`);
    console.log(`    IP: ${ipAddress} | UA: ${userAgent.slice(0, 80)}`);
    console.log(`    Log ID: ${id}\n`);
  } catch (err) {
    console.warn(`⚠️ [TERMS ACCEPTANCE] Failed to log ${action} for ${email}:`, err.message);
  }
}
// Helper to get authenticated user from cookies or Authorization header
function getAuthUser(req) {
  let token = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const rawToken = authHeader.split(' ')[1];
    if (rawToken && rawToken !== 'null' && rawToken !== 'undefined') {
      token = rawToken;
    }
  }
  if (!token && req.headers.cookie) {
    const match = req.headers.cookie.match(/(^|;)\s*token\s*=\s*([^;]+)/);
    if (match) {
      try {
        token = decodeURIComponent(match[2]);
      } catch {
        token = match[2];
      }
    }
  }

  if (!token) {
    req.authUser = null;
    return null;
  }
  const res = verifyJwt(token);
  const user = res.valid ? res.payload : null;
  req.authUser = user;
  return user;
}

// ─────────────────────────────────────────────────────────────
// IAM Role Hierarchy Engine (Multi-Role Array)
// Role inheritance model:
//   admin (4) → organiser (3) → reg_payment_verifier (2) → user (1)
// Every user has a `roles TEXT[]` array (e.g. ["user", "organiser"]).
// Admin in the array grants automatic system-wide override.
// ─────────────────────────────────────────────────────────────
const ROLES = Object.freeze({
  ADMIN:               'admin',
  ORGANISER:           'organiser',
  REG_PAYMENT_VERIFIER: 'reg_payment_verifier',
  USER:                'user',
});

// ─── Absolute immutable root admin protection ───
// This hardcoded constant ensures the root admin account can NEVER be demoted,
// even if the ADMIN_EMAIL env variable is accidentally cleared or misconfigured.
// The primary guard uses env.ADMIN_EMAIL; this constant acts as the failsafe.
const ROOT_ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (!ROOT_ADMIN_EMAIL) {
  console.error("❌ CRITICAL: ADMIN_EMAIL environment variable is missing.");
  process.exit(1);
}

const ROLE_HIERARCHY = Object.freeze({
  [ROLES.USER]:               1,
  [ROLES.REG_PAYMENT_VERIFIER]: 2,
  [ROLES.ORGANISER]:           3,
  [ROLES.ADMIN]:              4,
});

/**
 * Normalizes a user object to always return a roles array.
 * Handles migration: if `roles` is missing but `role` exists, wraps it in an array.
 * @param {object} user - User object with optional `roles` (array) or `role` (string)
 * @returns {string[]}
 */
function getUserRoles(user) {
  if (!user) return [];
  if (user.roles && Array.isArray(user.roles) && user.roles.length > 0) return user.roles;
  if (user.role) return [user.role];
  return [];
}

/**
 * Checks if a user's roles array includes the target role.
 * Admin in the roles array grants automatic system-wide override.
 * @param {object} user       - User object with `roles` (array) or legacy `role` (string)
 * @param {string} targetRole - The role to check for
 * @returns {boolean}
 */
function hasRole(user, targetRole) {
  if (!user || !targetRole) return false;
  const roles = getUserRoles(user);
  if (roles.includes(ROLES.ADMIN)) return true;
  return roles.includes(targetRole);
}

// Strictly coerce true/false/1/0/'true'/'false' to a boolean, otherwise return fallback.
function coerceBool(v, fallback) {
  if (v === true || v === 1 || v === 'true') return true;
  if (v === false || v === 0 || v === 'false') return false;
  return fallback;
}

// ── Per-round room credentials (server-enforced reveal) ──
const ID_PASS_RELEASE_OFFSETS = [15, 10, 5];
const DEFAULT_ID_PASS_RELEASE_OFFSET_MINUTES = 15;

function normalizeReleaseOffset(value) {
  const n = parseInt(value, 10);
  return ID_PASS_RELEASE_OFFSETS.includes(n) ? n : DEFAULT_ID_PASS_RELEASE_OFFSET_MINUTES;
}

// Effective release timestamp = round start minus the per-round release offset (naive local, same convention as the app).
function roundReleaseEpoch(round, offsetMinutes) {
  if (!round || !round.date || !/^\d{4}-\d{2}-\d{2}$/.test(round.date) ||
      !round.time || !/^\d{2}:\d{2}$/.test(round.time)) return null;
  const startMs = new Date(`${round.date}T${round.time}`).getTime();
  if (isNaN(startMs)) return null;
  return startMs - normalizeReleaseOffset(offsetMinutes) * 60 * 1000;
}

// Never send unreleased / unauthorized round credentials to clients.
// Owner (or admin) ALWAYS gets the actual values immediately — the release time
// is purely a participant-visibility rule and never gates the organizer.
// Registered/eligible participants get values only when: round published, the
// user is an auth user holding an eligible registration, and server time >=
// the per-round release time. For everyone else the sensitive keys are OMITTED
// entirely (not nulled) so they never leave the server.
function sanitizeTimelineForUser(timelineRaw, opts = {}) {
  if (!timelineRaw) return timelineRaw;
  let parsed;
  try {
    parsed = typeof timelineRaw === 'string' ? JSON.parse(timelineRaw) : timelineRaw;
  } catch {
    return timelineRaw;
  }
  if (!parsed || typeof parsed !== 'object') return timelineRaw;
  const isArray = Array.isArray(parsed);
  const roadmap = isArray ? parsed : (Array.isArray(parsed.roadmap) ? parsed.roadmap : []);
  if (roadmap.length === 0) return timelineRaw;
  const now = Date.now();
  const isOwner = opts.isOwner === true;
  const isRegistered = opts.isRegistered === true;
  const isPublished = opts.published !== false;
  const scrubbed = roadmap.map((r) => {
    const round = { ...r };
    const offsetMinutes = normalizeReleaseOffset(round.id_pass_release_offset_minutes);
    round.id_pass_release_offset_minutes = offsetMinutes;
    const releaseEpoch = roundReleaseEpoch(round, offsetMinutes);
    const released = releaseEpoch !== null && now >= releaseEpoch;
    const configured = Boolean(String(round.room_id || '').trim()) || Boolean(String(round.room_password || '').trim());
    // A1: Room credentials are served strictly via GET .../matches/:matchId/credentials.
    // Never leak room_id, room_password, or has_room_credentials in timeline JSON to anyone.
    delete round.room_id;
    delete round.room_password;
    delete round.has_room_credentials;
    // Time/schedule metadata is safe for all clients (never the credential values).
    round.release_available = released;
    // "configured" reveals whether the organizer has entered credentials — send it
    // only when it cannot leak scheduling state: to the owner, or after release.
    if (isOwner || released) {
      round.room_credentials_configured = configured;
    } else {
      delete round.room_credentials_configured;
    }
    return round;
  });
  const next = isArray ? scrubbed : { ...parsed, roadmap: scrubbed };
  return JSON.stringify(next);
}

// Does this user hold an active registration for a tournament?
async function isRegisteredForTournament(tournamentId, userId) {
  if (!tournamentId || !userId) return false;
  try {
    const result = await pool.query(
      `SELECT 1 FROM tournament_registrations
       WHERE tournament_id = $1 AND user_id = $2
         AND status IN ('pending', 'pending_payment', 'approved', 'confirmed')
       LIMIT 1`,
      [tournamentId, userId]
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Checks if a user's highest role has sufficient hierarchical clearance.
 * @param {object} user        - User object
 * @param {string} requiredRole - The minimum role required
 * @returns {boolean}
 */
function hasRoleClearance(user, requiredRole) {
  if (!user || !requiredRole) return false;
  const roles = getUserRoles(user);
  if (roles.includes(ROLES.ADMIN)) return true;
  // Find the user's highest hierarchy level among their roles
  let userLevel = 0;
  for (const r of roles) {
    const level = ROLE_HIERARCHY[r] ?? 0;
    if (level > userLevel) userLevel = level;
  }
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? Infinity;
  return userLevel >= requiredLevel;
}

/**
 * Returns true if the user has at least organiser-level clearance.
 */
function hasOrganizerRights(user) {
  if (!user) return false;
  return hasRoleClearance(user, ROLES.ORGANISER);
}

/**
 * Permission matrix — maps capabilities to the roles allowed to perform them.
 * Admin auto-passes all capabilities via hasCapability.
 */
const PERMISSIONS = Object.freeze({
  PUBLISH_TOURNAMENT: [ROLES.ADMIN, ROLES.ORGANISER],
  VERIFY_PAYMENTS:    [ROLES.ADMIN, ROLES.REG_PAYMENT_VERIFIER],
  VERIFY_SUBSCRIPTIONS: [ROLES.ADMIN],
  MANAGE_ROLES:       [ROLES.ADMIN],
});

/**
 * Validates if a user has the required capability.
 * Accepts a user object (with `roles` or `role` property).
 */
function hasCapability(user, capability) {
  if (!user || !capability) return false;
  const roles = getUserRoles(user);
  if (roles.includes(ROLES.ADMIN)) return true;
  const authorizedRoles = PERMISSIONS[capability];
  if (!authorizedRoles) return false;
  return roles.some(r => authorizedRoles.includes(r));
}

// Middleware to validate organizer status (uses hasOrganizerRights)
function requireOrganizer(req, res, authUser) {
  if (!authUser) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
    return false;
  }
  if (!hasOrganizerRights(authUser)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only organizers or administrators can perform this action.' }));
    return false;
  }
  return true;
}

// Middleware to validate organizer is approved (DB check) — for create/update tournament endpoints
async function requireApprovedOrganizer(req, res, authUser, pool) {
  if (!authUser) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
    return false;
  }
  if (!hasOrganizerRights(authUser)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only organizers or administrators can perform this action.' }));
    return false;
  }
  if (hasRole(authUser, ROLES.ADMIN)) return true; // admins bypass approval check
  try {
    const result = await pool.query(
      `SELECT "orgApplicationStatus" FROM users WHERE id = $1`,
      [authUser.id]
    );
    const status = result.rows[0]?.orgApplicationStatus || 'none';
    if (status !== 'approved') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'FORBIDDEN',
        message: 'Your organizer account has not been approved yet.'
      }));
      return false;
    }
    return true;
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: err.message }));
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// Tournament Promotion authorization + display helpers
// ─────────────────────────────────────────────────────────────

// Admin guard for promotion management. Authorization is derived from the
// server-side user record (roles loaded from the database), never from a
// client-supplied role claim or the (potentially stale) JWT payload alone.
async function requireAdminFromDb(req, res) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
    return null;
  }
  try {
    const result = await pool.query(
      'SELECT id, name, roles, role FROM users WHERE id = $1 OR uid = $1 LIMIT 1',
      [authUser.id]
    );
    if (result.rows.length === 0) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Account not found.' }));
      return null;
    }
    const dbUser = result.rows[0];
    if (!canManagePromotions(dbUser)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only administrators can manage tournament promotions.' }));
      return null;
    }
    return { id: dbUser.id, name: dbUser.name, roles: resolveRoles(dbUser) };
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: err.message }));
    return null;
  }
}

// Shared projection for public tournament rows (listing + promoted section).
// Computes sponsor revenue and the display prize string exactly once.
function withTournamentDisplay(r) {
  let sponsorRevenue = 0;
  let hasApprovedSponsors = false;
  try {
    const sd = typeof r.sponsors_data === 'string' ? JSON.parse(r.sponsors_data) : (r.sponsors_data || []);
    if (Array.isArray(sd)) {
      const approved = sd.filter((s) => s.status === 'approved');
      sponsorRevenue = approved.reduce((sum, s) => sum + (parseInt(s.amount) || 0), 0);
      hasApprovedSponsors = approved.length > 0;
    }
  } catch { /* malformed sponsor JSON is treated as no sponsors */ }
  const basePrize = parseInt(r.prize_pool_amount) || 0;
  const totalPrize = basePrize + sponsorRevenue;
  const sanitized = {
    ...r,
    timeline: sanitizeTimelineForUser(r.timeline),
    cover_image_url: r.cover_image_url || '',
    orgName: r.orgName || r.userOrgName || r.userName || 'Match District Organizer',
    orgLogo: r.orgLogo || r.userOrgImage || '',
    sponsorRevenue,
    hasApprovedSponsors,
    basePrize,
    totalPrize,
    prize: (() => {
      if (r.prize && r.prize.startsWith('\u20B9') && !hasApprovedSponsors) return r.prize;
      if (totalPrize > 0) return `\u20B9${totalPrize.toLocaleString('en-IN')}`;
      if (r.prize && r.prize !== 'TBD' && r.prize !== 'TBA') return r.prize;
      return 'TBD';
    })(),
  };
  delete sanitized.roomID;
  delete sanitized.roomPassword;
  return sanitized;
}

// Reads the centrally configured promoted-section display limit.
async function getPromotedSectionLimit() {
  try {
    const res = await pool.query('SELECT value FROM site_settings WHERE key = $1', [PROMOTED_LIMIT_SETTING_KEY]);
    if (res.rows[0]?.value != null) return parseDisplayLimit(res.rows[0].value, DEFAULT_PROMOTED_LIMIT);
  } catch {}
  return DEFAULT_PROMOTED_LIMIT;
}

// Plan definitions moved to server/subscriptionMiddleware.js (imported above)

async function notifyFollowersOfTournament(t) {
  try {
    const orgId = t.orgId;
    if (!orgId) return;

    // Fetch organizer name
    const orgRes = await pool.query('SELECT name FROM users WHERE id = $1', [orgId]);
    const orgName = orgRes.rows[0]?.name || t.orgName || 'An Organizer';

    // Get followers
    const followersRes = await pool.query(
      `SELECT u.id, u.email, u.name 
       FROM users u 
       JOIN organiser_followers f ON u.id = f.user_id 
       WHERE f.organiser_id = $1`,
      [orgId]
    );

    for (const follower of followersRes.rows) {
      const alertId = 'ALT-' + crypto.randomBytes(8).toString('hex');
      const title = `New Tournament: ${t.title}`;
      const message = `${orgName} has hosted a new tournament "${t.title}" for ${t.game}! Check it out and register now.`;

      // 1. Insert alert in database
      await pool.query(
        `INSERT INTO alerts (id, user_id, title, message, tournament_id) 
         VALUES ($1, $2, $3, $4, $5)`,
        [alertId, follower.id, title, message, t.id]
      );

      // 2. Send email via Resend
      if (follower.email) {
        await sendEmail({
          to: follower.email,
          subject: `New Tournament by ${orgName}: ${t.title}`,
          html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
                <h2 style="color: #333;">New Tournament Hosted!</h2>
                <p>Hello ${follower.name || 'Gamer'},</p>
                <p><strong>${orgName}</strong>, an organizer you follow, has just hosted a new tournament:</p>
                <div style="background-color: #f9f9f9; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #6366f1;">
                  <h3 style="margin-top: 0;">${t.title}</h3>
                  <p><strong>Game:</strong> ${t.game}</p>
                  <p><strong>Prize Pool:</strong> ${t.prize || 'N/A'}</p>
                  <p><strong>Date:</strong> ${t.date || 'TBD'}</p>
                </div>
                <p>Don't miss out on registering before slots are filled!</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 12px; color: #888;">You are receiving this email because you follow ${orgName} on Match District.</p>
              </div>
            `
        });
      }
    }
  } catch (err) {
    console.error('❌ [NOTIFICATION SERVICE] Error notifying followers:', err.message);
  }
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

const UNIQUE_AMOUNT_SUFFIX_RANGE = 99;         // max paisa suffix (0.01–0.99)

// ── Existing in-memory rate limiter used by upload and invitation routes ──
const rateLimitMap = new Map();

// Account safety: verification abuse guard, notification/abuse cleanup jobs.
const accountSecurity = createAccountSecurity({
  pool,
  secret: JWT_SECRET,
  sendEmail,
  getAuthUser,
  hasRole,
  ROLES,
  rootAdminEmail: ROOT_ADMIN_EMAIL,
  signJwt,
  buildSessionCookie,
  publicUserRow,
  maskUserEmail,
  checkRateLimit,
});

function getClientIp(req) {
  if (!req) return '127.0.0.1';
  const remoteAddr = req.socket?.remoteAddress || '127.0.0.1';
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';
  if (!trustProxy) {
    return remoteAddr;
  }
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const parts = String(forwarded).split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[0];
  }
  return remoteAddr;
}

function checkRateLimit(key, maxRequests = 60, windowMs = 60_000) {
  const limit = typeof maxRequests === 'number' && maxRequests > 0 ? maxRequests : 60;
  const window = typeof windowMs === 'number' && windowMs > 0 ? windowMs : 60_000;
  const now = Date.now();
  let entry = rateLimitMap.get(key);

  if (!entry || now - entry.windowStart > window) {
    entry = { count: 1, windowStart: now };
    rateLimitMap.set(key, entry);
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfter: 0 };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((entry.windowStart + window - now) / 1000));
    return { allowed: false, remaining: 0, retryAfter };
  }

  entry.count++;
  return { allowed: true, remaining: Math.max(0, limit - entry.count), retryAfter: 0 };
}

function rollbackRateLimit(key) {
  const entry = rateLimitMap.get(key);
  if (entry && entry.count > 0) {
    entry.count--;
  }
}

// Periodic cleanup of stale upload/invitation/auth rate-limit entries (every 5 min)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStart > 15 * 60_000) rateLimitMap.delete(key);
  }
}, 300_000);

const server = http.createServer(async (req, res) => {
  const urlPath = (req.url || '').split('?')[0];
  // Hardened CORS & Origin Validation
  const requestOrigin = req.headers.origin;
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1';
  const effectiveHost = ((trustProxy && req.headers['x-forwarded-host']) ? req.headers['x-forwarded-host'].split(',')[0] : (req.headers.host || '')).trim().toLowerCase();

  const normalizedAllowedOrigins = new Set(['https://matchdistrict.in', 'https://www.matchdistrict.in']);
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(',').forEach(entry => {
      const clean = entry.trim().toLowerCase().replace(/\/+$/, '');
      if (clean) normalizedAllowedOrigins.add(clean);
    });
  }

  const isAllowedOrigin = (origin) => {
    if (!origin) return false;
    const trimmedOrigin = origin.trim().toLowerCase().replace(/\/+$/, '');
    if (normalizedAllowedOrigins.has(trimmedOrigin)) return true;

    let parsedOrigin;
    try {
      parsedOrigin = new URL(trimmedOrigin);
    } catch {
      return false;
    }

    const originHost = parsedOrigin.host.toLowerCase();

    // 1. Same-origin check: Origin host equals request Host (use X-Forwarded-Host only when TRUST_PROXY is enabled)
    if (effectiveHost && originHost === effectiveHost) {
      return true;
    }

    // 2. In development (non-production) also accept http://localhost:* and http://127.0.0.1:*
    if (process.env.NODE_ENV !== 'production') {
      if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(originHost)) {
        return true;
      }
    }

    return false;
  };

  const originAllowed = isAllowedOrigin(requestOrigin);

  if (originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!requestOrigin) {
    // Same-origin or non-browser server request
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    // Untrusted external browser origin
    res.setHeader('Access-Control-Allow-Origin', 'null');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,Authorization,X-CSRF-Token');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Basic CSRF mitigation: Reject cross-site state mutations from unapproved browser origins
  const isStateChangingRequest = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
  const fetchSite = req.headers['sec-fetch-site'];
  const hasSessionCookie = /(?:^|;\s*)token=/.test(req.headers.cookie || '');

  let blockRule = null;
  if (isStateChangingRequest) {
    if (requestOrigin && !originAllowed) {
      blockRule = 'ORIGIN_DISALLOWED';
    } else if (!requestOrigin && hasSessionCookie && fetchSite === 'cross-site') {
      blockRule = 'CROSS_SITE_FETCH_METADATA_NO_ORIGIN';
    }
  }

  if (blockRule) {
    // Log server side (not to client), without cookies or tokens, for deployment diagnostics
    console.warn(`[SECURITY] CSRF blocked: rule=${blockRule}, path=${urlPath}, method=${req.method}, origin=${requestOrigin || 'none'}, host=${effectiveHost || req.headers.host || 'none'}, sec-fetch-site=${fetchSite || 'none'}`);

    // Exclude logout endpoints so logout cannot be blocked by CSRF check
    if (urlPath !== '/api/auth/logout' && urlPath !== '/api/admin/logout') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'CSRF_BLOCKED', message: 'Request blocked. Please reload the page and try again.' }));
      return;
    }
  }

  // Account security: email change flow endpoints (removed)
  if (urlPath.startsWith('/api/account/email-change')) {
    res.writeHead(410, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ success: false, error: 'GONE', message: 'Email changes are no longer supported.' }));
    return;
  }

  // --- SECURE IMAGEKIT MEDIA PROXY ---
  if (urlPath === '/api/media/upload' && req.method === 'POST') {
    const authUser = getAuthUser(req);
    if (!authUser) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required to upload media.' }));
      return;
    }

    const authUserId = authUser.id || authUser.uid;
    const uploadLimit = checkRateLimit('upload:' + authUserId, 15, 60000);
    if (!uploadLimit.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': uploadLimit.retryAfter });
      res.end(JSON.stringify({ success: false, error: 'RATE_LIMITED', message: 'Too many uploads. Please wait a minute and try again.' }));
      return;
    }

    // Payment screenshots may be 10 MiB before base64 encoding (about 13.4 MiB as JSON).
    const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
    const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    let body = '';
    let size = 0;
    let aborted = false;

    req.on('data', chunk => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_UPLOAD_BYTES) {
        aborted = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'PAYLOAD_TOO_LARGE', message: 'Upload request exceeds the allowed size.' }));
        return;
      }
      body += chunk.toString();
    });

    req.on('end', async () => {
      if (aborted) return;
      try {
        const privateKey = getImageKitPrivateKey();
        const urlEndpoint = getImageKitUrlEndpoint();
        if (!privateKey || !urlEndpoint) {
          const ref = makeErrorRef();
          logErrorWithRef(ref, 'POST /api/media/upload', new Error('ImageKit media configuration is missing or empty.'), 'check_config', 500);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'SERVER_ERROR',
            ref,
            message: `Could not upload image. Please try again. (Ref: ${ref})`,
          }));
          return;
        }

        let data;
        try {
          data = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_JSON', message: 'Malformed JSON payload.' }));
          return;
        }

        if (!data || !data.file || typeof data.file !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'No file data provided' }));
          return;
        }

        if (/^https:\/\//i.test(data.file)) {
          try {
            const sourceUrl = new URL(data.file);
            const imageKitEndpoint = new URL(urlEndpoint);
            const endpointPath = imageKitEndpoint.pathname.replace(/\/+$/, '');
            if (
              sourceUrl.origin === imageKitEndpoint.origin &&
              (!endpointPath || sourceUrl.pathname === endpointPath || sourceUrl.pathname.startsWith(endpointPath + '/'))
            ) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, secure_url: sourceUrl.toString() }));
              return;
            }
          } catch {}
        }

        const dataUrlMatch = data.file.match(/^data:(image\/(?:jpeg|jpg|png|gif|webp|heic|heif|avif));base64,([\s\S]*)$/i);
        const isRemoteUrl = /^https:\/\//i.test(data.file);
        let rawBuffer = null;
        let uploadSource = null;
        let mimeType = 'image/jpeg';

        if (dataUrlMatch) {
          mimeType = dataUrlMatch[1].toLowerCase();
          rawBuffer = Buffer.from(dataUrlMatch[2], 'base64');
          uploadSource = new Blob([rawBuffer], { type: mimeType });
        } else if (isRemoteUrl) {
          let sourceUrl;
          try {
            sourceUrl = new URL(data.file);
          } catch {
            sourceUrl = null;
          }
          const host = sourceUrl?.hostname.toLowerCase() || '';
          if (!sourceUrl || sourceUrl.protocol !== 'https:' || host === 'localhost' || host.endsWith('.local') ||
              host.endsWith('.internal') || /^127\./.test(host) || /^10\./.test(host) ||
              /^192\.168\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host) ||
              /^169\.254\./.test(host) || host === '::1' || host.includes(':') || sourceUrl.username || sourceUrl.password) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'INVALID_IMAGE_URL', message: 'Image source must be a public HTTPS URL.' }));
            return;
          }
          uploadSource = data.file;
        } else {
          rawBuffer = Buffer.from(data.file, 'base64');
          uploadSource = new Blob([rawBuffer], { type: mimeType });
        }

        if (rawBuffer && rawBuffer.length > MAX_IMAGE_BYTES) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'PAYLOAD_TOO_LARGE', message: 'Image must be 10 MB or smaller.' }));
          return;
        }

        if (rawBuffer && !isValidImageBuffer(rawBuffer)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_IMAGE_TYPE', message: 'Invalid image format. Allowed formats: PNG, JPEG, GIF, WEBP.' }));
          return;
        }

        const extension = mimeType === 'image/png' ? 'png'
          : mimeType === 'image/gif' ? 'gif'
          : mimeType === 'image/webp' ? 'webp'
          : mimeType === 'image/heic' ? 'heic'
          : mimeType === 'image/heif' ? 'heif'
          : mimeType === 'image/avif' ? 'avif'
          : 'jpg';
        const uploadName = 'matchdistrict-' + crypto.randomBytes(12).toString('hex') + '.' + extension;
        const imageKitForm = new FormData();
        if (typeof uploadSource === 'string') {
          imageKitForm.append('file', uploadSource);
        } else {
          imageKitForm.append('file', uploadSource, uploadName);
        }
        imageKitForm.append('fileName', uploadName);
        imageKitForm.append('folder', '/matchdistrict');
        imageKitForm.append('useUniqueFileName', 'true');

        const imageKitAuth = Buffer.from(privateKey + ':').toString('base64');
        const imageKitResponse = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
          method: 'POST',
          headers: { Authorization: 'Basic ' + imageKitAuth },
          body: imageKitForm,
        });

        let imageKitData = null;
        try {
          imageKitData = await imageKitResponse.json();
        } catch {}

        if (imageKitResponse.ok && imageKitData?.url && imageKitData?.fileId) {
          const now = Date.now();
          for (const [url, file] of IMAGEKIT_UPLOAD_IDS_BY_URL) {
            if (now - file.createdAt > 10 * 60 * 1000) IMAGEKIT_UPLOAD_IDS_BY_URL.delete(url);
          }
          if (IMAGEKIT_UPLOAD_IDS_BY_URL.size >= 500) {
            const oldestUrl = IMAGEKIT_UPLOAD_IDS_BY_URL.keys().next().value;
            if (oldestUrl) IMAGEKIT_UPLOAD_IDS_BY_URL.delete(oldestUrl);
          }
          IMAGEKIT_UPLOAD_IDS_BY_URL.set(imageKitData.url, { fileId: imageKitData.fileId, createdAt: now });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, secure_url: imageKitData.url }));
        } else {
          const ref = makeErrorRef();
          const ikMsg = imageKitData?.message || imageKitData?.help || `HTTP ${imageKitResponse.status}`;
          const ikError = new Error(`ImageKit rejected upload: ${ikMsg}`);
          ikError.status = imageKitResponse.status;
          logErrorWithRef(ref, 'POST /api/media/upload', ikError, 'imagekit_upload');
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', ref, message: `Could not upload image. Please try again. (Ref: ${ref})` }));
        }
      } catch (err) {
        const ref = makeErrorRef();
        logErrorWithRef(ref, 'POST /api/media/upload', err, 'handler');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', ref, message: `Could not upload image. Please try again. (Ref: ${ref})` }));
      }
    });
    return;
  }

  // Health check endpoint for Docker/Render
  if (urlPath === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
    return;
  }

  // 1. OTP Sending Service
  if (req.url === '/api/auth/send-otp' && req.method === 'POST') {
    let body = '';
    let bodySize = 0;
    const MAX_AUTH_BODY = 16 * 1024; // 16KB limit
    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_AUTH_BODY) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds limit.' }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', async () => {
      if (bodySize > MAX_AUTH_BODY) return;
      try {
        const parsed = JSON.parse(body);
        const email = (parsed.email || '').trim().toLowerCase();
        if (!email || !email.includes('@')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_EMAIL', message: 'A valid email address is required.' }));
          return;
        }

        // Generate cryptographically secure 6-digit OTP on server only.
        // Never allow client to supply otp!
        const otp = crypto.randomInt(100000, 1000000).toString();
        const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes

        // Database-backed abuse guard: 60 s resend cooldown, 3 sends / 15 min per email and IP, timeouts.
        const otpFlow = parsed.purpose === 'gamertag_change' ? 'gamertag' : 'signup';
        if (!(await accountSecurity.guardSend(req, res, { flow: otpFlow, email }))) return;

        console.log(`🔑 [MATCH DISTRICT OTP SERVICE] Verification Code Generated for email: ${email}`);

        // Store OTP in database with attempts reset to 0
        const expiresAt = new Date(expiry);
        await pool.query(
          `INSERT INTO otps (email, otp, expires_at, attempts, created_at)
           VALUES ($1, $2, $3, 0, CURRENT_TIMESTAMP)
           ON CONFLICT (email)
           DO UPDATE SET otp = $2, expires_at = $3, attempts = 0, created_at = CURRENT_TIMESTAMP`,
          [email, otp, expiresAt]
        );

        // Send email via Resend
        const emailResult = await sendEmail({
          to: email,
          subject: 'Your Match District Verification Code',
          html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
                <h2 style="color: #333; text-align: center;">Verify Your Email</h2>
                <p>Hello,</p>
                <p>Your verification code for Match District is:</p>
                <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #000; margin: 20px 0; border-radius: 4px;">
                  ${otp}
                </div>
                <p>This code will expire in 5 minutes.</p>
                <p>If you didn't request this code, you can safely ignore this email.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 12px; color: #888; text-align: center;">&copy; 2026 Match District. All rights reserved.</p>
              </div>
            `
        });
        const emailSent = emailResult.success;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, emailSent, expiry }));
      } catch (err) {
        const isSchemaError = err.message && err.message.includes('does not exist');
        const message = isSchemaError
          ? 'Registration service configuration error. Please contact support.'
          : err.message;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: message }));
      }
    });
    return;
  }

  // 1b. OTP Verification Service
  if (req.url === '/api/auth/verify-otp' && req.method === 'POST') {
    let body = '';
    let bodySize = 0;
    const MAX_AUTH_BODY = 16 * 1024;
    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_AUTH_BODY) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'PAYLOAD_TOO_LARGE' }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', async () => {
      if (bodySize > MAX_AUTH_BODY) return;
      try {
        const parsed = JSON.parse(body);
        const email = (parsed.email || '').trim().toLowerCase();
        const otp = (parsed.otp || '').trim();

        if (!email || !otp) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Email and OTP are required.' }));
          return;
        }

        const verifyFlow = parsed.purpose === 'gamertag_change' ? 'gamertag' : 'signup';
        if (!(await accountSecurity.guardVerify(req, res, { email }))) return;

        const now = new Date();
        const otpRes = await pool.query('SELECT * FROM otps WHERE email = $1', [email]);
        if (otpRes.rows.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'OTP_NOT_FOUND', message: 'No active verification code found. Please request a new one.' }));
          return;
        }

        const otpRecord = otpRes.rows[0];

        // Check expiry
        if (new Date(otpRecord.expires_at) <= now) {
          await pool.query('DELETE FROM otps WHERE email = $1', [email]);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'OTP_EXPIRED', message: 'Verification code has expired. Please request a new one.' }));
          return;
        }

        // Check attempts limit (max 5)
        const attempts = parseInt(otpRecord.attempts || 0, 10);
        if (attempts >= 5) {
          await pool.query('DELETE FROM otps WHERE email = $1', [email]);
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'TOO_MANY_ATTEMPTS',
            message: 'Too many incorrect attempts. Verification code invalidated. Please request a new code.'
          }));
          return;
        }

        // Timing-safe comparison
        const otpBuf = Buffer.from(otp);
        const storedBuf = Buffer.from(otpRecord.otp);
        const isMatch = otpBuf.length === storedBuf.length && crypto.timingSafeEqual(otpBuf, storedBuf);

        if (!isMatch) {
          // Count wrong codes in the database-backed guard (5 wrong / 15 min => timeout).
          if (await accountSecurity.recordFailure(req, res, { flow: verifyFlow, email })) return;
          const attemptRes = await pool.query(
            `UPDATE otps SET attempts = COALESCE(attempts, 0) + 1
             WHERE email = $1 AND expires_at > NOW() AND COALESCE(attempts, 0) < 5
             RETURNING attempts`,
            [email]
          );
          const attemptsNow = attemptRes.rows[0]?.attempts ?? 5;
          const remaining = Math.max(0, 5 - attemptsNow);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'INVALID_OTP',
            message: remaining > 0
              ? `Incorrect verification code. ${remaining} attempt(s) remaining.`
              : 'Incorrect verification code. Maximum attempts exceeded. Please request a new code.'
          }));
          return;
        }

        // Consume atomically so concurrent requests cannot verify the same OTP.
        const consumeRes = await pool.query(
          `DELETE FROM otps WHERE email = $1 AND otp = $2
             AND expires_at > NOW() AND COALESCE(attempts, 0) < 5 RETURNING email`,
          [email, otpRecord.otp]
        );
        if (consumeRes.rows.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_OTP', message: 'Verification code is invalid or expired. Please request a new code.' }));
          return;
        }

        // Issue cryptographically secure verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // Mark temp_users as verified
        const verifiedRes = await pool.query(
          `UPDATE temp_users SET verified = true, verification_token = $1
           WHERE email = $2 AND expires_at > NOW() RETURNING email`,
          [verificationToken, email]
        );
        if (verifiedRes.rows.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'REGISTRATION_SESSION_EXPIRED', message: 'Registration session expired. Please submit your details again.' }));
          return;
        }

        accountSecurity.clearFailures(req, { flow: verifyFlow, email });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'OTP verified successfully.',
          verificationToken
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 2. JWT & Supabase Login Service
  if (req.url === '/api/auth/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        let { email: emailOrDistrictId, password } = JSON.parse(body);
        let email = emailOrDistrictId;

        // Login identifiers are the primary email or the public District ID.
        if (emailOrDistrictId && !emailOrDistrictId.includes('@')) {
          const userLookup = await pool.query('SELECT email FROM users WHERE district_id = $1', [emailOrDistrictId.trim()]);
          if (userLookup.rows.length > 0) email = userLookup.rows[0].email;
        }

        // Look up the user by email in the Supabase Database (users table)
        const dbUserRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        let foundUser = dbUserRes.rows[0];

        // If found, verify password from the database
        if (foundUser && foundUser.password && verifyPassword(password, foundUser.password)) {
          // Establish Supabase Auth session if they have a real auth UUID
          if (foundUser.uid && !foundUser.uid.startsWith('USR-') && !foundUser.uid.startsWith('ADM-')) {
            try {
              await supabase.auth.signInWithPassword({ email: foundUser.email, password });
            } catch (supErr) {
              console.warn('⚠️ [LOGIN] Supabase Auth session establish warning:', supErr.message);
            }
          }

          const token = signJwt({ email: foundUser.email, role: foundUser.role, roles: foundUser.roles || [foundUser.role], id: foundUser.uid || foundUser.id });
          const encryptedSession = encryptSessionData(JSON.stringify({ token, userId: foundUser.uid || foundUser.id, email: foundUser.email }));
          console.log(`\n🛡️ [MATCH DISTRICT AUTH] User "${foundUser.name || email}" logged in successfully via database verification. JWT Generated.\n`);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Set-Cookie': buildSessionCookie(token, req)
          });
          res.end(JSON.stringify({
            success: true,
            token,
            encryptedSession,
            user: publicUserRow(foundUser),
            message: hasRole(foundUser, ROLES.ADMIN)
              ? 'Superadmin credentials verified! Accessing Platform Command Center...'
              : `Welcome back, ${foundUser.name || foundUser.email.split('@')[0]}! Redirecting...`
          }));
          return;
        }

        // If not found in database or password verification failed, fall back to authenticating with Supabase Auth
        let authData = null;
        let authError = null;
        try {
          const authRes = await supabase.auth.signInWithPassword({ email, password });
          authData = authRes.data;
          authError = authRes.error;
        } catch (err) {
          authError = err;
        }

        if (authError) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: authError.message || 'Incorrect email or password.', code: 'WRONG_PASSWORD' }));
          return;
        }

        // If Supabase Auth succeeded, load/create profile from database
        const dbRes = await pool.query('SELECT * FROM users WHERE uid = $1 OR email = $2', [authData.user.id, email]);
        if (dbRes.rows.length > 0) {
          foundUser = dbRes.rows[0];
          if (foundUser.uid !== authData.user.id) {
            await pool.query('UPDATE users SET uid = $1 WHERE email = $2', [authData.user.id, email]);
            foundUser.uid = authData.user.id;
          }
        } else {
          const registrationClient = await pool.connect();
          try {
            await registrationClient.query('BEGIN');
            foundUser = await insertWithDistrictId((districtId) => registrationClient.query(
              `INSERT INTO users (id, uid, name, email, password, "gamerTag", role, roles, tier, "orgApplicationStatus", district_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
               ON CONFLICT (district_id) DO NOTHING RETURNING *`,
              [authData.user.id, authData.user.id, email.split('@')[0], email, 'REDACTED',
                '@' + email.split('@')[0], 'player', ['user'], 'Amateur', 'none', districtId]
            ));
            await ensureSupabaseProfile(registrationClient, foundUser);
            const profileCheck = await registrationClient.query(
              'SELECT 1 FROM profiles WHERE id = $1 AND email = $2',
              [foundUser.uid || foundUser.id, foundUser.email]
            );
            if (profileCheck.rows.length === 0) {
              throw new Error('Supabase-authenticated account profile was not created.');
            }
            await registrationClient.query('COMMIT');
          } catch (registrationError) {
            await registrationClient.query('ROLLBACK').catch(() => {});
            throw registrationError;
          } finally {
            registrationClient.release();
          }
        }

        await ensureSupabaseProfile(pool, foundUser);

        const token = signJwt({ email: foundUser.email, role: foundUser.role, roles: foundUser.roles || [foundUser.role], id: foundUser.uid || foundUser.id });
        const encryptedSession = encryptSessionData(JSON.stringify({ token, userId: foundUser.uid || foundUser.id, email: foundUser.email }));
        console.log(`\n🛡️ [MATCH DISTRICT AUTH] User "${foundUser.name || email}" logged in successfully via Supabase Auth. JWT Generated.\n`);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': buildSessionCookie(token, req)
        });
        res.end(JSON.stringify({ success: true, token, encryptedSession, user: publicUserRow(foundUser), message: `Welcome back, ${foundUser.name || foundUser.email.split('@')[0]}! Redirecting...` }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 2a-2. Public Auth Configuration Endpoint (Runtime client ID fallback)
  if ((req.url === '/api/auth/config' || urlPath === '/api/auth/config') && req.method === 'GET') {
    loadEnv();
    const googleClientId = (process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '').trim();
    const discordEnabled = Boolean(
      cleanDiscordEnv(process.env.DISCORD_CLIENT_ID) &&
      cleanDiscordEnv(process.env.DISCORD_CLIENT_SECRET) &&
      cleanDiscordEnv(process.env.DISCORD_REDIRECT_URI)
    );
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      googleClientId,
      discordEnabled
    }));
    return;
  }

  // 2b. Google Sign-In & Sign-Up Service (GIS ID Token Verification)
  if ((req.url === '/api/auth/google' || urlPath === '/api/auth/google') && req.method === 'POST') {
    let body = '';
    let bodySize = 0;
    const MAX_AUTH_BODY = 16 * 1024;
    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_AUTH_BODY) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds limit.' }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', async () => {
      if (bodySize > MAX_AUTH_BODY) return;
      try {
        const clientIp = getClientIp(req);
        const googleAuthLimit = checkRateLimit('google_auth:' + clientIp, 30, 10 * 60 * 1000);
        if (!googleAuthLimit.allowed) {
          res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': googleAuthLimit.retryAfter });
          res.end(JSON.stringify({ success: false, error: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' }));
          return;
        }

        loadEnv();
        const configuredClientId = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
        if (!configuredClientId) {
          console.error('❌ [AUTH ERROR] GOOGLE_CLIENT_ID is not configured in server environment.');
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'CONFIG_ERROR', message: 'Google authentication is not configured on this server.' }));
          return;
        }

        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_JSON', message: 'Malformed JSON payload.' }));
          return;
        }

        const idToken = (parsed.idToken || parsed.credential || '').trim();
        if (!idToken || typeof idToken !== 'string' || idToken.length > 4096 || idToken.split('.').length !== 3) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_TOKEN', message: 'A valid Google ID token credential is required.' }));
          return;
        }

        // Cryptographically verify ID token against Google\'s tokeninfo API
        let googlePayload;
        try {
          const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
          const googleRes = await fetch(verifyUrl, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000)
          });
          if (!googleRes.ok) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'INVALID_CREDENTIALS', message: 'Google credential verification failed.' }));
            return;
          }
          googlePayload = await googleRes.json();
        } catch (fetchErr) {
          console.error('⚠️ [GOOGLE AUTH] Token verification request failed:', fetchErr.message);
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UPSTREAM_ERROR', message: 'Unable to reach Google verification service.' }));
          return;
        }

        // Verify claims
        const isTrustedIssuer = ['https://accounts.google.com', 'accounts.google.com'].includes(googlePayload.iss);
        const isAudienceMatch = googlePayload.aud === configuredClientId;
        const isEmailVerified = googlePayload.email_verified === 'true' || googlePayload.email_verified === true;
        const googleSub = (googlePayload.sub || '').trim();
        const googleEmail = (googlePayload.email || '').trim().toLowerCase();

        if (!isTrustedIssuer || !isAudienceMatch) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_CREDENTIALS', message: 'Invalid token audience or issuer.' }));
          return;
        }

        if (!googleSub || !googleEmail || !googleEmail.includes('@')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_PAYLOAD', message: 'Incomplete identity payload from Google.' }));
          return;
        }

        if (!isEmailVerified) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'EMAIL_NOT_VERIFIED', message: 'Your Google email is not verified. Please verify your email with Google first.' }));
          return;
        }

        if (googlePayload.exp && Number(googlePayload.exp) < Math.floor(Date.now() / 1000)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOKEN_EXPIRED', message: 'Google credential has expired.' }));
          return;
        }

        // Only an existing Google subject is an authentication link. Email
        // equality is not proof that this Google identity owns a local account.
        let targetUser = null;
        const byGoogleIdRes = await pool.query(
          `SELECT u.* FROM auth_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = 'google' AND i.provider_user_id = $1
           UNION ALL SELECT u.* FROM users u WHERE u.google_id = $1 AND NOT EXISTS (SELECT 1 FROM auth_identities i WHERE i.provider = 'google' AND i.provider_user_id = $1)
           LIMIT 1`, [googleSub]
        );
        if (byGoogleIdRes.rows.length > 0) {
          targetUser = byGoogleIdRes.rows[0];
        } else {
          // Both account tables have an independent unique email constraint.
          // A legacy/orphan profile must block registration too, or the new
          // users row could be committed without a matching profile.
          const byEmailRes = await findPendingLinkAccount(pool, googleEmail);
          const legacyProfileConflict = await pool.query('SELECT id FROM profiles WHERE LOWER(email) = $1 LIMIT 1', [googleEmail]);
          if (byEmailRes.length > 0 || legacyProfileConflict.rows.length > 0) {
            if (byEmailRes.length === 1) {
              const pendingCookie = makePendingProviderCookie(req, {
                provider: 'google', providerUserId: googleSub, providerEmail: googleEmail,
                displayName: googlePayload.name, avatarUrl: sanitizeImageUrlForDb(googlePayload.picture)
              });
              res.writeHead(409, { 'Content-Type': 'application/json', 'Set-Cookie': pendingCookie });
              res.end(JSON.stringify({ success: false, error: 'PENDING_LINK_REQUIRED', redirect: '/auth/link', message: 'Confirm account ownership to connect Google.' }));
              return;
            }
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: byEmailRes.length > 1 ? 'ACCOUNT_CONFLICT' : 'ACCOUNT_LINK_REQUIRED',
              message: 'A Match District account already uses this email. Sign in to that account first, then link Google from your profile.'
            }));
            return;
          }
        }

        // Check Admin MFA / Security
        if (targetUser) {
          const status = String(targetUser.status || 'active').toLowerCase();
          if (['banned', 'suspended', 'disabled'].includes(status)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'ACCOUNT_UNAVAILABLE', message: 'This account is unavailable. Contact support.' }));
            return;
          }
          const isRootAdmin = targetUser.email.toLowerCase() === (ROOT_ADMIN_EMAIL || '').toLowerCase();
          const isAdmin = isRootAdmin || hasRole(targetUser, ROLES.ADMIN);
          if (isAdmin && (targetUser.admin_totp_activated && targetUser.admin_totp_secret)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'ADMIN_MFA_REQUIRED',
              message: 'Administrator accounts require dedicated two-factor authentication via the Admin Login portal.'
            }));
            return;
          }
        } else {
          // New User Registration with least-privileged participant defaults
          const userUUID = 'USR-' + crypto.randomBytes(12).toString('hex');
          const cleanName = (googlePayload.name || googleEmail.split('@')[0]).trim().slice(0, 50);
          const gamerTag = cleanName;

          const avatarUrl = sanitizeImageUrlForDb(googlePayload.picture) || 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=500&q=80';

          const registrationClient = await pool.connect();
          try {
            await registrationClient.query('BEGIN');
            const emailOwner = await registrationClient.query(
              `SELECT id FROM users WHERE LOWER(email) = $1
               UNION ALL
               SELECT id FROM profiles WHERE LOWER(email) = $1
               LIMIT 1`,
              [googleEmail]
            );
            if (emailOwner.rows.length > 0) {
              await registrationClient.query('ROLLBACK');
              res.writeHead(409, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'ACCOUNT_LINK_REQUIRED',
                message: 'A Match District account already uses this email. Sign in to that account first, then link Google from your profile.'
              }));
              return;
            }

            let createdNewUser = false;
            for (let attempt = 0; attempt < 8 && !targetUser; attempt += 1) {
              const districtId = generateDistrictId();
              const insertRes = await registrationClient.query(
                `INSERT INTO users (id, uid, name, email, password, "gamerTag", role, roles, tier, "orgApplicationStatus", avatar, status, google_id, google_linked_at, password_set, district_id)
                 VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), false, $13)
                 ON CONFLICT DO NOTHING
                 RETURNING *`,
                [userUUID, userUUID, cleanName, googleEmail, gamerTag, 'player', ['user'], 'Amateur', 'none', avatarUrl, 'Active', googleSub, districtId]
              );
              targetUser = insertRes.rows[0] || null;
              if (targetUser) {
                createdNewUser = true;
                break;
              }

              // A concurrent provider registration may have won. Reuse only
              // the same Google subject; matching email alone is never proof.
              const racedGoogleIdentity = await registrationClient.query('SELECT * FROM users WHERE google_id = $1', [googleSub]);
              targetUser = racedGoogleIdentity.rows[0] || null;
              if (!targetUser) {
                const racedEmail = await registrationClient.query(
                  `SELECT id FROM users WHERE LOWER(email) = $1
                   UNION ALL SELECT id FROM profiles WHERE LOWER(email) = $1 LIMIT 1`,
                  [googleEmail]
                );
                if (racedEmail.rows.length > 0) {
                  await registrationClient.query('ROLLBACK');
                  res.writeHead(409, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({
                    success: false,
                    error: 'ACCOUNT_LINK_REQUIRED',
                    message: 'An account already uses this email. Sign in to that account first, then link Google from your profile.'
                  }));
                  return;
                }
              }
            }
            if (!targetUser) {
              const collisionError = new Error('Could not allocate a unique District ID for Google registration after 8 attempts.');
              collisionError.code = 'DISTRICT_ID_COLLISION_LIMIT';
              throw collisionError;
            }
            if (createdNewUser) {
              await ensureSupabaseProfile(registrationClient, targetUser);
              const profileCheck = await registrationClient.query(
                'SELECT 1 FROM profiles WHERE id = $1 AND email = $2',
                [targetUser.uid || targetUser.id, targetUser.email]
              );
              if (profileCheck.rows.length === 0) {
                throw new Error('Google registration profile was not created for the new account.');
              }
            }
            await storeProviderIdentity(registrationClient, {
              userId: targetUser.id, provider: 'google', providerUserId: googleSub,
              providerEmail: googleEmail, emailVerified: true,
              displayName: (googlePayload.name || '').slice(0, 128),
              avatarUrl: sanitizeImageUrlForDb(googlePayload.picture), lastLogin: true
            });
            await registrationClient.query('COMMIT');
          } catch (registrationError) {
            await registrationClient.query('ROLLBACK').catch(() => {});
            throw registrationError;
          } finally {
            registrationClient.release();
          }
        }

        // Legacy mirror and normalized identity are kept in the same transaction.
        const identityClient = await pool.connect();
        try {
          await identityClient.query('BEGIN');
          await identityClient.query('UPDATE users SET google_id = COALESCE(google_id, $1), google_linked_at = COALESCE(google_linked_at, NOW()) WHERE id = $2', [googleSub, targetUser.id]);
          await storeProviderIdentity(identityClient, {
            userId: targetUser.id, provider: 'google', providerUserId: googleSub,
            providerEmail: googleEmail, emailVerified: true,
            displayName: (googlePayload.name || '').slice(0, 128),
            avatarUrl: sanitizeImageUrlForDb(googlePayload.picture), lastLogin: true
          });
          await identityClient.query('COMMIT');
        } catch (identityError) {
          await identityClient.query('ROLLBACK').catch(() => {});
          throw identityError;
        } finally { identityClient.release(); }

        // Generate native Match District JWT & HttpOnly Session Cookie
        const token = signJwt({
          email: targetUser.email,
          role: targetUser.role,
          roles: targetUser.roles || [targetUser.role],
          id: targetUser.uid || targetUser.id
        });
        const encryptedSession = encryptSessionData(JSON.stringify({
          token,
          userId: targetUser.uid || targetUser.id,
          email: targetUser.email
        }));
        const cookieHeader = buildSessionCookie(token, req);

        logTermsAcceptance(pool, targetUser.email, targetUser.id || targetUser.uid, 'google_signin', req).catch(() => {});
        console.log('[AUTH] Provider login succeeded: google.');

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': cookieHeader
        });
        res.end(JSON.stringify({
          success: true,
          token,
          encryptedSession,
          user: publicUserRow(targetUser),
          message: `Welcome${targetUser.name ? ', ' + targetUser.name : ''}! Signed in with Google.`
        }));
      } catch (err) {
        console.error('❌ [MATCH DISTRICT GOOGLE AUTH EXCEPTION]:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: 'Authentication processing failed.' }));
      }
    });
    return;
  }

  if (urlPath === '/api/auth/link/pending' && req.method === 'GET') {
    const pending = getPendingProvider(req);
    if (!pending) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'PENDING_LINK_EXPIRED' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, provider: pending.provider, maskedProviderEmail: maskUserEmail(pending.providerEmail) }));
    return;
  }

  if (urlPath === '/api/auth/link/send-code' && req.method === 'POST') {
    const pending = getPendingProvider(req);
    if (!pending) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'PENDING_LINK_EXPIRED', message: 'Restart provider sign-in and try again.' }));
      return;
    }
    const ip = getClientIp(req);
    const linkSendLimit = checkRateLimit(`auth_link_ip:${ip}`, 10, 10 * 60 * 1000);
    if (!linkSendLimit.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': linkSendLimit.retryAfter });
      res.end(JSON.stringify({ success: false, error: 'RATE_LIMITED', message: 'Please wait before requesting another code.' }));
      return;
    }
    try {
      const accounts = await findPendingLinkAccount(pool, pending.providerEmail);
      if (accounts.length !== 1) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'ACCOUNT_CONFLICT', message: 'We could not safely identify one account for this provider.' }));
        return;
      }
      const account = accounts[0];
      if (!(await accountSecurity.guardSend(req, res, { flow: 'auth_link', email: account.email, userId: account.id }))) return;
      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      await pool.query(
        `INSERT INTO auth_link_challenges (user_id, code_hash, attempts, expires_at, created_at)
         VALUES ($1, $2, 0, NOW() + INTERVAL '10 minutes', NOW())
         ON CONFLICT (user_id) DO UPDATE SET code_hash = EXCLUDED.code_hash, attempts = 0,
           expires_at = EXCLUDED.expires_at, created_at = NOW()`,
        [account.id, crypto.createHash('sha256').update(code).digest('hex')]
      );
      const emailResult = await sendEmail({
        to: account.email, subject: 'Confirm your Match District account',
        html: `<p>Your Match District account confirmation code is <strong>${code}</strong>.</p><p>It expires in 10 minutes. If you did not request this, ignore this message.</p>`
      });
      if (!emailResult.success) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'EMAIL_UNAVAILABLE', message: 'We could not send a code right now. Try password confirmation or try again later.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, maskedEmail: maskUserEmail(account.email), message: 'A confirmation code was sent to the account email.' }));
    } catch (error) {
      console.error('[AUTH LINK] Code request failed [code: ' + (error?.code || 'UNKNOWN') + '].');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: 'Could not request a confirmation code.' }));
    }
    return;
  }

  if (urlPath === '/api/auth/link/complete' && req.method === 'POST') {
    const pending = getPendingProvider(req);
    if (!pending) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'PENDING_LINK_EXPIRED', message: 'Restart provider sign-in and try again.' }));
      return;
    }
    const ip = getClientIp(req);
    const linkCompIpLimit = checkRateLimit(`auth_link_complete_ip:${ip}`, 20, 10 * 60 * 1000);
    if (!linkCompIpLimit.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': linkCompIpLimit.retryAfter });
      res.end(JSON.stringify({ success: false, error: 'RATE_LIMITED', message: 'Too many attempts. Please wait and try again.' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
    req.on('end', async () => {
      let db;
      try {
        const proof = JSON.parse(body || '{}');
        const accounts = await findPendingLinkAccount(pool, pending.providerEmail);
        if (accounts.length !== 1) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ACCOUNT_CONFLICT', message: 'We could not safely identify one account for this provider.' }));
          return;
        }
        db = await pool.connect();
        await db.query('BEGIN');
        const locked = await db.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [accounts[0].id]);
        const account = locked.rows[0];
        const accountId = account?.id || account?.uid;
        if (accountId) {
          const linkCompAccLimit = checkRateLimit(`auth_link_complete_account:${accountId}`, 10, 10 * 60 * 1000);
          if (!linkCompAccLimit.allowed) {
            rollbackRateLimit(`auth_link_complete_ip:${ip}`);
            await db.query('ROLLBACK');
            res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': linkCompAccLimit.retryAfter });
            res.end(JSON.stringify({ success: false, error: 'RATE_LIMITED', message: 'Too many attempts. Please wait and try again.' }));
            return;
          }
        }
        if (!account || ['banned', 'suspended', 'disabled'].includes(String(account.status || '').toLowerCase())) {
          await db.query('ROLLBACK');
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ACCOUNT_UNAVAILABLE', message: 'This account cannot complete provider linking.' }));
          return;
        }
        const adminGuard = account.email?.toLowerCase() === (ROOT_ADMIN_EMAIL || '').toLowerCase() || hasRole(account, ROLES.ADMIN);
        if (adminGuard && account.admin_totp_activated && account.admin_totp_secret) {
          await db.query('ROLLBACK');
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ADMIN_MFA_REQUIRED', message: 'Use the administrator login portal to access this account.' }));
          return;
        }

        let proofValid = false;
        if (account.password_set === true && account.password) {
          proofValid = typeof proof.password === 'string' && verifyPassword(proof.password, account.password);
        } else if (typeof proof.code === 'string' && /^\d{6}$/.test(proof.code)) {
          if (!(await accountSecurity.guardVerify(req, res, { email: account.email, userId: account.id }))) {
            await db.query('ROLLBACK');
            return;
          }
          const challenge = await db.query('SELECT * FROM auth_link_challenges WHERE user_id = $1 FOR UPDATE', [account.id]);
          const stored = challenge.rows[0];
          const candidateHash = crypto.createHash('sha256').update(proof.code).digest();
          const storedHash = stored ? Buffer.from(stored.code_hash, 'hex') : Buffer.alloc(0);
          proofValid = Boolean(stored && new Date(stored.expires_at) > new Date() && Number(stored.attempts) < 5 && storedHash.length === candidateHash.length && crypto.timingSafeEqual(storedHash, candidateHash));
          if (stored && !proofValid) {
            await db.query('UPDATE auth_link_challenges SET attempts = attempts + 1 WHERE user_id = $1', [account.id]);
            if (await accountSecurity.recordFailure(req, res, { flow: 'auth_link', email: account.email, userId: account.id })) {
              await db.query('COMMIT');
              return;
            }
          } else if (proofValid) {
            accountSecurity.clearFailures(req, { flow: 'auth_link', email: account.email, userId: account.id });
          }
        }
        if (!proofValid) {
          if (!(account.password_set === true && account.password) && typeof proof.code === 'string') await db.query('COMMIT');
          else await db.query('ROLLBACK');
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'OWNERSHIP_PROOF_FAILED', message: 'Confirmation failed. Check your details and try again.' }));
          return;
        }

        const existingIdentity = await db.query('SELECT user_id FROM auth_identities WHERE provider = $1 AND provider_user_id = $2 FOR UPDATE', [pending.provider, pending.providerUserId]);
        if (existingIdentity.rows.length && existingIdentity.rows[0].user_id !== account.id) {
          await db.query('ROLLBACK');
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'PROVIDER_ALREADY_LINKED', message: 'This provider is already linked to another account. Sign in there and disconnect it first.' }));
          return;
        }
        const providerOnAccount = await db.query('SELECT provider_user_id FROM auth_identities WHERE user_id = $1 AND provider = $2 FOR UPDATE', [account.id, pending.provider]);
        if (providerOnAccount.rows.length && providerOnAccount.rows[0].provider_user_id !== pending.providerUserId) {
          await db.query('ROLLBACK');
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'PROVIDER_REPLACEMENT_REQUIRED', message: 'A different provider account is already linked. Use Reconnect from profile settings.' }));
          return;
        }
        if (pending.provider === 'google') {
          await db.query('UPDATE users SET google_id = COALESCE(google_id, $1) WHERE id = $2', [pending.providerUserId, account.id]);
        } else {
          await db.query('UPDATE users SET discord_id = COALESCE(discord_id, $1) WHERE id = $2', [pending.providerUserId, account.id]);
          await db.query(
            `INSERT INTO user_discord_connections (user_id, discord_id, username, global_name, avatar_hash, connected_at, updated_at)
             VALUES ($1, $2, $3, $3, NULL, NOW(), NOW()) ON CONFLICT (user_id) DO NOTHING`,
            [account.id, pending.providerUserId, pending.displayName || '']
          );
        }
        await storeProviderIdentity(db, {
          userId: account.id, provider: pending.provider, providerUserId: pending.providerUserId,
          providerEmail: pending.providerEmail, emailVerified: true, displayName: pending.displayName,
          avatarUrl: pending.avatarUrl, lastLogin: true
        });
        if (!(account.password_set === true && account.password)) await db.query('DELETE FROM auth_link_challenges WHERE user_id = $1', [account.id]);
        await db.query('COMMIT');
        const token = signJwt({ email: account.email, role: account.role, roles: account.roles || [account.role], id: account.uid || account.id });
        const clearPending = pendingProviderCookie(req, '', 0);
        const clearLoggedOut = 'md_logged_out=; Path=/; SameSite=Lax; Max-Age=0' + (isHttpsRequest(req) ? '; Secure' : '');
        res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': [clearPending, buildSessionCookie(token, req), clearLoggedOut] });
        res.end(JSON.stringify({ success: true, provider: pending.provider, redirect: getSafeRelativeRedirect(pending.returnTo, '/'), message: `${pending.provider === 'discord' ? 'Discord' : 'Google'} connected and you are logged in.` }));
      } catch (error) {
        await db?.query('ROLLBACK').catch(() => {});
        console.error('[AUTH LINK] Ownership confirmation failed [code: ' + (error?.code || 'UNKNOWN') + '].');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: 'Could not complete provider linking.' }));
      } finally { db?.release(); }
    });
    return;
  }

  // Authenticated Google account linking. Email matching is intentionally not
  // used here: both the existing app session and Google credential prove control.
  if (urlPath === '/api/auth/google/link' && req.method === 'POST') {
    const authUser = getAuthUser(req);
    if (!authUser) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Sign in before linking Google.' }));
      return;
    }
    const clientIp = getClientIp(req);
    const authUserId = authUser.id || authUser.uid;
    const ipLimit = checkRateLimit(`google_link_ip:${clientIp}`, 30, 10 * 60 * 1000);
    if (!ipLimit.allowed) {
      const mins = Math.max(1, Math.ceil(ipLimit.retryAfter / 60));
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': ipLimit.retryAfter });
      res.end(JSON.stringify({ success: false, error: 'RATE_LIMITED', message: `Too many attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`, retryAfter: ipLimit.retryAfter }));
      return;
    }
    const userLimit = authUserId ? checkRateLimit(`google_link_user:${authUserId}`, 10, 10 * 60 * 1000) : { allowed: true, retryAfter: 0 };
    if (!userLimit.allowed) {
      rollbackRateLimit(`google_link_ip:${clientIp}`);
      const mins = Math.max(1, Math.ceil(userLimit.retryAfter / 60));
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': userLimit.retryAfter });
      res.end(JSON.stringify({ success: false, error: 'RATE_LIMITED', message: `Too many attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`, retryAfter: userLimit.retryAfter }));
      return;
    }

    let body = '';
    let bodySize = 0;
    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > 8192) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'PAYLOAD_TOO_LARGE' }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', async () => {
      if (bodySize > 8192) return;
      try {
        const idToken = JSON.parse(body).idToken;
        if (typeof idToken !== 'string' || idToken.length > 4096 || idToken.split('.').length !== 3) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_TOKEN', message: 'A valid Google credential is required.' }));
          return;
        }
        loadEnv();
        const configuredClientId = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
        if (!configuredClientId) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'CONFIG_ERROR', message: 'Google authentication is not configured.' }));
          return;
        }
        const verifyResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10000)
        });
        if (!verifyResponse.ok) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_CREDENTIALS', message: 'Google credential verification failed.' }));
          return;
        }
        const claims = await verifyResponse.json();
        const googleId = typeof claims.sub === 'string' ? claims.sub.trim() : '';
        if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) ||
            claims.aud !== configuredClientId || claims.email_verified !== 'true' && claims.email_verified !== true ||
            !googleId || claims.exp && Number(claims.exp) < Math.floor(Date.now() / 1000)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_CREDENTIALS', message: 'Google credential is invalid or unverified.' }));
          return;
        }

        const dbClient = await pool.connect();
        try {
          await dbClient.query('BEGIN');
          const accountResult = await dbClient.query(
            'SELECT * FROM users WHERE id = $1 OR uid = $1 ORDER BY (id = $1) DESC LIMIT 1 FOR UPDATE',
            [authUser.id || authUser.uid]
          );
          const account = accountResult.rows[0];
          if (!account) {
            await dbClient.query('ROLLBACK');
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'ACCOUNT_NOT_FOUND', message: 'Match District account not found.' }));
            return;
          }
          if (account.google_id && account.google_id !== googleId) {
            await dbClient.query('ROLLBACK');
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'ACCOUNT_CONFLICT', message: 'A different Google account is already linked.' }));
            return;
          }
          const owner = await dbClient.query(
            `SELECT id FROM users WHERE google_id = $1 AND id <> $2
             UNION SELECT user_id AS id FROM auth_identities WHERE provider = 'google' AND provider_user_id = $1 AND user_id <> $2 LIMIT 1`,
            [googleId, account.id]
          );
          if (owner.rows.length > 0) {
            await dbClient.query('ROLLBACK');
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'PROVIDER_ALREADY_LINKED', message: 'This Google account is already linked to another Match District account.' }));
            return;
          }
          await dbClient.query('UPDATE users SET google_id = $1, google_linked_at = NOW() WHERE id = $2', [googleId, account.id]);
          await storeProviderIdentity(dbClient, {
            userId: account.id, provider: 'google', providerUserId: googleId,
            providerEmail: (claims.email || '').toLowerCase() || null, emailVerified: true,
            displayName: claims.name || null, avatarUrl: sanitizeImageUrlForDb(claims.picture)
          });
          await dbClient.query('COMMIT');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, linked: true, message: 'Google account linked successfully.' }));
        } catch (dbErr) {
          await dbClient.query('ROLLBACK').catch(() => {});
          if (dbErr.code === '23505') {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'PROVIDER_ALREADY_LINKED', message: 'This Google account is already linked to another Match District account.' }));
            return;
          }
          throw dbErr;
        } finally {
          dbClient.release();
        }
      } catch (err) {
        console.error('[GOOGLE LINK] Provider linking failed [code: ' + (err?.code || 'UNKNOWN') + '].');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: 'Could not link Google. Please try again.' }));
      }
    });
    return;
  }

  if (urlPath === '/api/auth/google/unlink' && req.method === 'POST') {
    const authUser = getAuthUser(req);
    if (!authUser) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Sign in before unlinking Google.' }));
      return;
    }
    const clientIp = getClientIp(req);
    const authUserId = authUser.id || authUser.uid;
    const ipLimit = checkRateLimit(`google_unlink_ip:${clientIp}`, 30, 10 * 60 * 1000);
    if (!ipLimit.allowed) {
      const mins = Math.max(1, Math.ceil(ipLimit.retryAfter / 60));
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': ipLimit.retryAfter });
      res.end(JSON.stringify({ success: false, error: 'RATE_LIMITED', message: `Too many attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`, retryAfter: ipLimit.retryAfter }));
      return;
    }
    const userLimit = authUserId ? checkRateLimit(`google_unlink_user:${authUserId}`, 10, 10 * 60 * 1000) : { allowed: true, retryAfter: 0 };
    if (!userLimit.allowed) {
      rollbackRateLimit(`google_unlink_ip:${clientIp}`);
      const mins = Math.max(1, Math.ceil(userLimit.retryAfter / 60));
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': userLimit.retryAfter });
      res.end(JSON.stringify({ success: false, error: 'RATE_LIMITED', message: `Too many attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`, retryAfter: userLimit.retryAfter }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let dbClient;
      try {
        const { currentPassword } = JSON.parse(body || '{}');
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');
        const result = await dbClient.query(
          'SELECT id, google_id, google_linked_at, discord_id, password, password_set, created_at FROM users WHERE id = $1 OR uid = $1 ORDER BY (id = $1) DESC LIMIT 1 FOR UPDATE',
          [authUser.id || authUser.uid]
        );
        const account = result.rows[0];
        if (!account) {
          await dbClient.query('ROLLBACK');
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ACCOUNT_NOT_FOUND', message: 'Match District account not found.' }));
          return;
        }
        if (!account.google_id) {
          await dbClient.query('ROLLBACK');
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_LINKED', message: 'Google account is not linked.' }));
          return;
        }

        // 14-day unlink lock rule: accounts can only be unlinked 14 days after being linked
        let googleLinkedAt = account.google_linked_at;
        if (!googleLinkedAt) {
          const idRes = await dbClient.query("SELECT linked_at FROM auth_identities WHERE user_id = $1 AND provider = 'google' LIMIT 1", [account.id]);
          googleLinkedAt = idRes.rows[0]?.linked_at || account.created_at;
        }
        const cooldown = getUnlinkCooldownStatus(googleLinkedAt);
        if (!cooldown.canUnlink) {
          await dbClient.query('ROLLBACK');
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'UNLINK_COOLDOWN',
            message: `Google account can only be unlinked 14 days after linking. You can unlink it in ${cooldown.remainingDays} day${cooldown.remainingDays === 1 ? '' : 's'}.`,
            remainingDays: cooldown.remainingDays,
            canUnlinkAt: cooldown.canUnlinkAt ? cooldown.canUnlinkAt.toISOString() : null,
          }));
          return;
        }

        const hasPassword = account.password_set === true && Boolean(account.password);
        if (!hasPassword) {
          const recentLogin = Number.isFinite(Number(authUser.iat)) && Date.now() - Number(authUser.iat) * 1000 <= 10 * 60 * 1000;
          if (!recentLogin) {
            await dbClient.query('ROLLBACK');
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'RECENT_LOGIN_REQUIRED', message: 'Sign in again before disconnecting a provider.' }));
            return;
          }
          const otherMethod = await dbClient.query("SELECT 1 FROM auth_identities WHERE user_id = $1 AND provider <> 'google' LIMIT 1", [account.id]);
          if (!account.discord_id && otherMethod.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'LAST_LOGIN_METHOD_REQUIRED', message: 'Add another sign-in method before disconnecting Google.' }));
            return;
          }
        } else if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, account.password)) {
          await dbClient.query('ROLLBACK');
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'REAUTHENTICATION_REQUIRED', message: 'Enter your current password to confirm this change.' }));
          return;
        }
        await dbClient.query('UPDATE users SET google_id = NULL, google_linked_at = NULL WHERE id = $1', [account.id]);
        await dbClient.query("DELETE FROM auth_identities WHERE user_id = $1 AND provider = 'google'", [account.id]);
        await dbClient.query('COMMIT');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, linked: false, message: 'Google account unlinked. Email and password sign-in remains available.' }));
      } catch (err) {
        await dbClient?.query('ROLLBACK').catch(() => {});
        console.error('[GOOGLE UNLINK] Provider unlink failed [code: ' + (err?.code || 'UNKNOWN') + '].');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: 'Could not unlink Google. Please try again.' }));
      } finally {
        dbClient?.release();
      }
    });
    return;
  }

// Helper: Query user Discord connection details (owner/admin view only)
async function getDiscordConnectionForUser(clientOrPool, userId, discordIdFallback = null) {
  if (!userId) {
    return {
      connected: false,
      username: null,
      global_name: null,
      avatar_url: null,
      connected_at: null,
    };
  }
  try {
    const res = await clientOrPool.query(
      'SELECT discord_id, username, global_name, avatar_hash, connected_at FROM user_discord_connections WHERE user_id = $1',
      [userId]
    );
    if (res.rows.length > 0) {
      const conn = res.rows[0];
      const dId = conn.discord_id;
      let avatarUrl = null;
      if (conn.avatar_hash) {
        avatarUrl = `https://cdn.discordapp.com/avatars/${dId}/${conn.avatar_hash}.png`;
      } else {
        try {
          const discNum = (BigInt(dId) >> 22n) % 6n;
          avatarUrl = `https://cdn.discordapp.com/embed/avatars/${discNum}.png`;
        } catch {
          avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
        }
      }
      return {
        connected: true,
        username: conn.username || '',
        global_name: conn.global_name || conn.username || '',
        avatar_url: avatarUrl,
        connected_at: conn.connected_at ? new Date(conn.connected_at).toISOString() : null,
      };
    }

    if (discordIdFallback) {
      let avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
      try {
        const discNum = (BigInt(discordIdFallback) >> 22n) % 6n;
        avatarUrl = `https://cdn.discordapp.com/embed/avatars/${discNum}.png`;
      } catch {}
      return {
        connected: true,
        username: '',
        global_name: '',
        avatar_url: avatarUrl,
        connected_at: null,
      };
    }
  } catch (err) {
    console.warn('⚠️ [DISCORD] Failed to query user_discord_connections:', err.message);
  }
  return {
    connected: false,
    username: null,
    global_name: null,
    avatar_url: null,
    connected_at: null,
  };
}

  // 2b_methods. Query authenticated user's available login methods (email, Google, Discord)
  if (urlPath === '/api/auth/login-methods' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'private, no-store');
    const authUser = getAuthUser(req);
    if (!authUser) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
    }
    try {
      const userRes = await pool.query(
        'SELECT id, email, password, password_set, google_id, google_linked_at, discord_id, discord_linked_at, created_at FROM users WHERE id = $1 OR uid = $1 ORDER BY (id = $1) DESC LIMIT 1',
        [authUser.id || authUser.uid]
      );
      const user = userRes.rows[0];
      if (!user) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
      }

      // Check auth_identities
      const identitiesRes = await pool.query(
        'SELECT provider, provider_user_id, provider_email, display_name, avatar_url, linked_at FROM auth_identities WHERE user_id = $1',
        [user.id]
      );
      const googleIdentity = identitiesRes.rows.find(i => i.provider === 'google') || null;
      const discordIdentity = identitiesRes.rows.find(i => i.provider === 'discord') || null;

      // Check user_discord_connections
      const discordConn = await getDiscordConnectionForUser(pool, user.id, user.discord_id);

      const isPasswordSet = Boolean(user.password_set === true && user.password);
      const isGoogleConnected = Boolean(googleIdentity || user.google_id);
      const googleEmail = googleIdentity?.provider_email || (user.google_id ? user.email : null);

      const isDiscordConnected = Boolean(discordIdentity || user.discord_id || discordConn?.connected);
      const discordName = discordIdentity?.display_name || discordConn?.global_name || discordConn?.username || (user.discord_id ? 'Connected' : null);

      const googleLinkedAt = googleIdentity?.linked_at || user.google_linked_at || (user.google_id ? user.created_at : null);
      const googleCooldown = getUnlinkCooldownStatus(googleLinkedAt);

      const discordLinkedAt = user.discord_linked_at || discordConn?.connected_at || discordIdentity?.linked_at || null;
      const discordCooldown = getUnlinkCooldownStatus(discordLinkedAt);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        methods: {
          email: {
            address: user.email || '',
            passwordSet: isPasswordSet,
          },
          google: isGoogleConnected ? {
            email: googleEmail || user.email || '',
            linked_at: googleLinkedAt || null,
            can_unlink: googleCooldown.canUnlink,
            remaining_days: googleCooldown.remainingDays,
            can_unlink_at: googleCooldown.canUnlinkAt ? googleCooldown.canUnlinkAt.toISOString() : null,
          } : null,
          discord: isDiscordConnected ? {
            name: discordName || 'Connected',
            username: discordConn?.username || '',
            display_name: discordConn?.global_name || discordName || '',
            avatar_url: discordConn?.avatar_url || discordIdentity?.avatar_url || null,
            linked_at: discordLinkedAt || null,
            can_unlink: discordCooldown.canUnlink,
            remaining_days: discordCooldown.remainingDays,
            can_unlink_at: discordCooldown.canUnlinkAt ? discordCooldown.canUnlinkAt.toISOString() : null,
          } : null,
        }
      }));
    } catch (err) {
      console.error('[LOGIN-METHODS] Failed to fetch sign-in methods:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: 'Could not load sign-in methods.' }));
    }
  }

  // 2c. Discord OAuth2 Flow: Start authentication or authenticated account linking.
  if ((urlPath === '/api/auth/discord/connect' || urlPath === '/api/auth/discord' || urlPath === '/api/auth/discord/link' || urlPath === '/api/auth/discord/login') && req.method === 'GET') {
    const isLoginFlow = urlPath === '/api/auth/discord/login';
    const parsedUrl = new URL(req.url, 'http://localhost');
    const returnTo = getSafeRelativeRedirect(parsedUrl.searchParams.get('redirect'), '/profile');
    const authUser = getAuthUser(req);
    if (!isLoginFlow && !authUser) {
      const errRedirect = returnTo && returnTo !== '/' && returnTo !== '/profile'
        ? `${returnTo}${returnTo.includes('?') ? '&' : '?'}discord=error&code=unauthorized`
        : '/login?discord_error=unauthorized';
      res.writeHead(302, { Location: errRedirect });
      res.end();
      return;
    }

    const clientIp = getClientIp(req);
    const authUserId = authUser ? (authUser.id || authUser.uid) : null;
    const ipLimit = checkRateLimit('discord_connect_ip:' + clientIp, 30, 10 * 60 * 1000);
    if (!ipLimit.allowed) {
      console.error(`[DISCORD AUTH] Step: connect_ip_rate_limit | Code: rate_limited | Flow: ${isLoginFlow ? 'login' : 'link'} | IP: ${clientIp}`);
      res.writeHead(302, { Location: isLoginFlow ? `/login?discord_error=rate_limited&retry_after=${ipLimit.retryAfter}` : `/profile?discord=error&code=rate_limited&retry_after=${ipLimit.retryAfter}` });
      res.end();
      return;
    }
    if (authUserId) {
      const userLimit = checkRateLimit('discord_connect_user:' + authUserId, 10, 10 * 60 * 1000);
      if (!userLimit.allowed) {
        rollbackRateLimit('discord_connect_ip:' + clientIp);
        console.error(`[DISCORD AUTH] Step: connect_user_rate_limit | Code: rate_limited | Flow: ${isLoginFlow ? 'login' : 'link'} | User: ${authUserId}`);
        res.writeHead(302, { Location: isLoginFlow ? `/login?discord_error=rate_limited&retry_after=${userLimit.retryAfter}` : `/profile?discord=error&code=rate_limited&retry_after=${userLimit.retryAfter}` });
        res.end();
        return;
      }
    }

    loadEnv();
    const discordClientId = cleanDiscordEnv(process.env.DISCORD_CLIENT_ID);
    const discordClientSecret = cleanDiscordEnv(process.env.DISCORD_CLIENT_SECRET);
    const discordRedirectUri = cleanDiscordEnv(process.env.DISCORD_REDIRECT_URI);

    if (!discordClientId || !discordClientSecret || !discordRedirectUri) {
      const missing = [];
      if (!discordClientId) missing.push('DISCORD_CLIENT_ID');
      if (!discordClientSecret) missing.push('DISCORD_CLIENT_SECRET');
      if (!discordRedirectUri) missing.push('DISCORD_REDIRECT_URI');
      console.error(`[DISCORD CONNECT ERROR] Step: connect_start | Code: not_configured | Missing env: ${missing.join(', ')}`);
      res.writeHead(302, { Location: isLoginFlow ? '/login?discord_error=not_configured' : '/profile?discord=error&code=not_configured' });
      res.end();
      return;
    }

    const isReconnect = parsedUrl.searchParams.get('reconnect') === 'true';

    // Generate 32-byte CSPRNG state and PKCE verifier/challenge
    const stateRandom = crypto.randomBytes(32).toString('hex');
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    // BIND state to the logged-in user id and store redirect_uri for byte-for-byte matching
    const statePayload = {
      state: stateRandom,
      flow: isLoginFlow ? 'login' : 'link',
      userId: authUser ? (authUser.id || authUser.uid) : null,
      reconnect: isReconnect,
      codeVerifier,
      redirectUri: discordRedirectUri,
      returnTo,
      createdAt: Date.now()
    };

    const stateToken = encryptAuthPayload(JSON.stringify(statePayload));
    const isHttps = isHttpsRequest(req);
    // Isolated cookie name per flow to prevent login and link verifiers from colliding
    const cookieName = isLoginFlow ? 'discord_oauth_state_login' : 'discord_oauth_state_link';
    const stateCookie = `${cookieName}=${encodeURIComponent(stateToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${isHttps ? '; Secure' : ''}`;

    // Email is requested only for new-account eligibility; it is never used to
    // link to an existing account. Profile linking still requests identify only.
    const discordAuthUrl = new URL('https://discord.com/oauth2/authorize');
    discordAuthUrl.searchParams.set('client_id', discordClientId);
    discordAuthUrl.searchParams.set('redirect_uri', discordRedirectUri);
    discordAuthUrl.searchParams.set('response_type', 'code');
    discordAuthUrl.searchParams.set('scope', 'identify email');
    discordAuthUrl.searchParams.set('state', stateRandom);
    discordAuthUrl.searchParams.set('code_challenge', codeChallenge);
    discordAuthUrl.searchParams.set('code_challenge_method', 'S256');
    discordAuthUrl.searchParams.set('prompt', 'consent');

    res.writeHead(302, {
      'Set-Cookie': stateCookie,
      'Location': discordAuthUrl.toString()
    });
    res.end();
    return;
  }

  // 2d. Discord OAuth2 Flow: Callback Handler (GET /api/auth/discord/callback)
  if (urlPath === '/api/auth/discord/callback' && req.method === 'GET') {
    const clientIp = getClientIp(req);
    const isHttps = isHttpsRequest(req);
    const clearStateCookies = [
      `discord_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps ? '; Secure' : ''}`,
      `discord_oauth_state_link=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps ? '; Secure' : ''}`,
      `discord_oauth_state_login=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps ? '; Secure' : ''}`
    ];
    const clearStateCookie = clearStateCookies;
    let statePayload = null;
    const callbackErrorLocation = (code, retryAfter = null) => {
      const qs = retryAfter ? `&retry_after=${encodeURIComponent(retryAfter)}` : '';
      if (statePayload?.flow === 'login') {
        return `/login?discord_error=${encodeURIComponent(code)}${qs}`;
      }
      if (statePayload?.returnTo && typeof statePayload.returnTo === 'string' && statePayload.returnTo.startsWith('/') && !statePayload.returnTo.startsWith('//')) {
        const sep = statePayload.returnTo.includes('?') ? '&' : '?';
        return `${statePayload.returnTo}${sep}discord=error&code=${encodeURIComponent(code)}${qs}`;
      }
      return `/profile?discord=error&code=${encodeURIComponent(code)}${qs}`;
    };

    const cbIpLimit = checkRateLimit('discord_callback_ip:' + clientIp, 60, 10 * 60 * 1000);
    if (!cbIpLimit.allowed) {
      console.error(`[DISCORD CONNECT ERROR] Step: callback_ip_rate_limit | Code: rate_limited | IP: ${clientIp}`);
      res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation('rate_limited', cbIpLimit.retryAfter) });
      res.end();
      return;
    }

    loadEnv();
    const discordClientId = cleanDiscordEnv(process.env.DISCORD_CLIENT_ID);
    const discordClientSecret = cleanDiscordEnv(process.env.DISCORD_CLIENT_SECRET);
    const discordRedirectUri = cleanDiscordEnv(process.env.DISCORD_REDIRECT_URI);

    const parsedUrl = new URL(req.url, 'http://localhost');
    const queryCode = parsedUrl.searchParams.get('code');
    const queryState = parsedUrl.searchParams.get('state');
    const queryError = parsedUrl.searchParams.get('error');

    // Extract encrypted state cookie supporting isolated flows (link, login) and legacy cookie
    const candidateCookieNames = ['discord_oauth_state_link', 'discord_oauth_state_login', 'discord_oauth_state'];
    if (req.headers.cookie) {
      // First pass: match cookie whose decrypted state matches queryState
      for (const cName of candidateCookieNames) {
        const regex = new RegExp(`(?:^|;)\\s*${cName}\\s*=\\s*([^;]+)`);
        const match = req.headers.cookie.match(regex);
        if (match) {
          try {
            const raw = decodeURIComponent(match[1]);
            const decrypted = decryptAuthPayload(raw);
            const parsed = JSON.parse(decrypted);
            if (queryState && parsed.state === queryState) {
              statePayload = parsed;
              break;
            }
          } catch {}
        }
      }
      // Second pass fallback if state didn't match directly
      if (!statePayload) {
        for (const cName of candidateCookieNames) {
          const regex = new RegExp(`(?:^|;)\\s*${cName}\\s*=\\s*([^;]+)`);
          const match = req.headers.cookie.match(regex);
          if (match) {
            try {
              const raw = decodeURIComponent(match[1]);
              const decrypted = decryptAuthPayload(raw);
              statePayload = JSON.parse(decrypted);
              break;
            } catch {}
          }
        }
      }
    }

    if (!statePayload) {
      console.error('[DISCORD CONNECT ERROR] Step: state_cookie_decrypt | Code: state_mismatch | Reason: state cookie missing or corrupted');
      res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation('state_mismatch') });
      res.end();
      return;
    }

    // Verify expiration (10 min)
    if (!statePayload.createdAt || Date.now() - statePayload.createdAt > 600000) {
      console.error('[DISCORD CONNECT ERROR] Step: state_expiry | Code: session_expired | Reason: state cookie older than 10m');
      res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation('session_expired') });
      res.end();
      return;
    }

    // Timing-safe state comparison
    const stateBuf = Buffer.from(statePayload.state || '');
    const queryBuf = Buffer.from(queryState || '');
    if (stateBuf.length === 0 || stateBuf.length !== queryBuf.length || !crypto.timingSafeEqual(stateBuf, queryBuf)) {
      console.error('[DISCORD CONNECT ERROR] Step: state_verify | Code: state_mismatch | Reason: query state does not match cookie state');
      res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation('state_mismatch') });
      res.end();
      return;
    }

    if (!['login', 'link'].includes(statePayload.flow)) {
      console.error('[DISCORD AUTH] Callback rejected because encrypted state has no valid flow intent.');
      res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation('state_mismatch') });
      res.end();
      return;
    }

    // Linking requires the session that initiated the flow. Login is allowed
    // without an app session, but any state-bound user ID must still match.
    const authUser = getAuthUser(req);
    const isLoginFlow = statePayload.flow === 'login';
    if (!isLoginFlow && !authUser) {
      console.error('[DISCORD CONNECT ERROR] Step: session_check | Code: session_expired | Reason: no active session in callback');
      res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation('session_expired') });
      res.end();
      return;
    }
    if (!isLoginFlow && statePayload.userId !== authUser.id && statePayload.userId !== authUser.uid) {
      console.error('[DISCORD CONNECT ERROR] Step: session_user_match | Code: state_mismatch | Reason: bound identity did not match session');
      res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation('state_mismatch') });
      res.end();
      return;
    }

    const cbUserId = authUser ? (authUser.id || authUser.uid) : null;
    if (cbUserId) {
      const cbUserLimit = checkRateLimit('discord_callback_user:' + cbUserId, 20, 10 * 60 * 1000);
      if (!cbUserLimit.allowed) {
        rollbackRateLimit('discord_callback_ip:' + clientIp);
        console.error('[DISCORD AUTH] Step: callback_user_rate_limit | Code: rate_limited');
        res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation('rate_limited', cbUserLimit.retryAfter) });
        res.end();
        return;
      }
    }

    if (queryError) {
      const safeDiscordErr = String(queryError).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'unknown_denied';
      console.error(`[DISCORD CONNECT ERROR] Step: discord_authorize | Code: discord_denied | Discord: ${safeDiscordErr}`);
      res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation('discord_denied') });
      res.end();
      return;
    }

    if (!queryCode) {
      console.error('[DISCORD CONNECT ERROR] Step: callback_params | Code: unknown | Reason: missing authorization code in query');
      res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation('unknown') });
      res.end();
      return;
    }

    // Single-use code deduplication: prevent double token exchange replay
    if (processedDiscordCodes.has(queryCode)) {
      const prior = processedDiscordCodes.get(queryCode);
      console.warn(`[DISCORD AUTH] Step: code_dedup | Replay detected for code: ${queryCode.slice(0, 6)}... (age: ${Math.round((Date.now() - prior.timestamp) / 1000)}s)`);
      res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation('invalid_grant') });
      res.end();
      return;
    }
    processedDiscordCodes.set(queryCode, { timestamp: Date.now() });

    if (!discordClientId || !discordClientSecret || !discordRedirectUri) {
      const missing = [];
      if (!discordClientId) missing.push('DISCORD_CLIENT_ID');
      if (!discordClientSecret) missing.push('DISCORD_CLIENT_SECRET');
      if (!discordRedirectUri) missing.push('DISCORD_REDIRECT_URI');
      console.error(`[DISCORD CONNECT ERROR] Step: callback_env | Code: not_configured | Missing env: ${missing.join(', ')}`);
      res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation('not_configured') });
      res.end();
      return;
    }

    if (statePayload.redirectUri !== discordRedirectUri) {
      console.warn('[DISCORD AUTH] Callback rejected because the configured redirect URI changed during authorization.');
      res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation('state_mismatch') });
      res.end();
      return;
    }

    try {
      // Exchange code for token with request timeout (10s) using exact matched redirect_uri
      const exchangeStartTime = Date.now();
      const effectiveRedirectUri = statePayload.redirectUri || discordRedirectUri;
      const urisMatch = statePayload.redirectUri === effectiveRedirectUri;
      const pkceUsed = Boolean(statePayload.codeVerifier);

      const tokenBody = new URLSearchParams({
        client_id: discordClientId,
        client_secret: discordClientSecret,
        grant_type: 'authorization_code',
        code: queryCode,
        redirect_uri: effectiveRedirectUri
      });
      if (statePayload.codeVerifier) {
        tokenBody.append('code_verifier', statePayload.codeVerifier);
      }

      const tokenAbort = new AbortController();
      const tokenTimer = setTimeout(() => tokenAbort.abort(), 10000);
      let tokenRes;
      try {
        tokenRes = await fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'User-Agent': DISCORD_API_USER_AGENT
          },
          body: tokenBody.toString(),
          signal: tokenAbort.signal
        });
      } catch (fetchErr) {
        clearTimeout(tokenTimer);
        const durationMs = Date.now() - exchangeStartTime;
        const isTimeout = tokenAbort.signal.aborted || fetchErr.name === 'AbortError';
        const stepName = isTimeout ? 'token_exchange_timeout' : 'token_exchange_network';
        const errCode = isTimeout ? 'timeout' : 'token_exchange_failed';
        console.error(`[DISCORD TOKEN EXCHANGE ERROR] step: ${stepName} | status: 0 | content_type: none | error: ${isTimeout ? 'timeout' : 'network_error'} | description: ${fetchErr.message} | pkce: ${pkceUsed} | redirect_uri_auth: ${statePayload.redirectUri || 'none'} | redirect_uri_token: ${effectiveRedirectUri} | uris_match: ${urisMatch} | duration_ms: ${durationMs}`);
        res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation(errCode) });
        res.end();
        return;
      }
      clearTimeout(tokenTimer);

      const durationMs = Date.now() - exchangeStartTime;

      if (!tokenRes.ok) {
        const contentType = tokenRes.headers.get('content-type') || 'unknown';
        const rawBody = await tokenRes.text().catch(() => '');
        let discordError = '';
        let discordErrorDesc = '';
        let isJson = false;

        try {
          const errJson = JSON.parse(rawBody);
          isJson = true;
          discordError = errJson.error || errJson.message || `http_${tokenRes.status}`;
          discordErrorDesc = errJson.error_description || '';
        } catch {
          isJson = false;
        }

        const bodySnippet = isJson
          ? `error: ${discordError} | description: ${discordErrorDesc}`
          : `body_preview: ${rawBody.slice(0, 200).replace(/[\r\n\t]+/g, ' ').trim() || 'empty'}`;

        console.error(`[DISCORD TOKEN EXCHANGE ERROR] step: token_exchange | status: ${tokenRes.status} | content_type: ${contentType} | ${bodySnippet} | pkce: ${pkceUsed} | redirect_uri_auth: ${statePayload.redirectUri || 'none'} | redirect_uri_token: ${effectiveRedirectUri} | uris_match: ${urisMatch} | duration_ms: ${durationMs}`);

        let clientRedirectCode = 'token_exchange_failed';
        let retryAfterVal = null;
        if (discordError === 'invalid_grant') {
          clientRedirectCode = 'invalid_grant';
        } else if (discordError === 'invalid_client') {
          clientRedirectCode = 'invalid_client';
        } else if (tokenRes.status === 403 || tokenRes.status === 429) {
          clientRedirectCode = tokenRes.status === 429 ? 'rate_limited' : 'blocked';
          const headerRetry = tokenRes.headers.get('retry-after');
          if (headerRetry) retryAfterVal = parseInt(headerRetry, 10) || 60;
        }

        res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation(clientRedirectCode, retryAfterVal) });
        res.end();
        return;
      }

      const tokenJson = await tokenRes.json();
      const accessToken = tokenJson.access_token;
      const tokenType = tokenJson.token_type || 'Bearer';

      // Fetch user profile from Discord (id, username, global_name, avatar)
      const userAbort = new AbortController();
      const userTimer = setTimeout(() => userAbort.abort(), 10000);
      let userRes;
      try {
        userRes = await fetch('https://discord.com/api/users/@me', {
          headers: {
            'Authorization': `${tokenType} ${accessToken}`,
            'Accept': 'application/json',
            'User-Agent': DISCORD_API_USER_AGENT
          },
          signal: userAbort.signal
        });
      } catch (userFetchErr) {
        clearTimeout(userTimer);
        const isTimeout = userAbort.signal.aborted || userFetchErr.name === 'AbortError';
        const errCode = isTimeout ? 'timeout' : 'profile_fetch_failed';
        console.error(`[DISCORD CONNECT ERROR] Step: profile_fetch_network | Code: ${errCode} | Exception: ${userFetchErr.message}`);
        res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation(errCode) });
        res.end();
        return;
      }
      clearTimeout(userTimer);

      // Best-effort immediate token revocation — access/refresh tokens are NEVER stored
      try {
        const revokeBody = new URLSearchParams({
          client_id: discordClientId,
          client_secret: discordClientSecret,
          token: accessToken,
          token_type_hint: 'access_token'
        });
        fetch('https://discord.com/api/oauth2/token/revoke', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': DISCORD_API_USER_AGENT
          },
          body: revokeBody.toString()
        }).catch(() => {});
      } catch {}

      if (!userRes.ok) {
        const rawUserBody = await userRes.text().catch(() => '');
        let discordErrCode = `http_${userRes.status}`;
        try {
          const errJson = JSON.parse(rawUserBody);
          discordErrCode = errJson.message || errJson.error || `http_${userRes.status}`;
        } catch {}
        const safeDiscordErr = String(discordErrCode).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || `http_${userRes.status}`;
        console.error(`[DISCORD CONNECT ERROR] Step: profile_fetch | HTTP: ${userRes.status} | Discord: ${safeDiscordErr}`);
        const clientRedirectCode = userRes.status === 403 ? 'blocked' : 'profile_fetch_failed';
        res.writeHead(302, { 'Set-Cookie': clearStateCookies, 'Location': callbackErrorLocation(clientRedirectCode) });
        res.end();
        return;
      }

      const discordUser = await userRes.json();
      const discordId = (discordUser.id || '').trim().slice(0, 32);
      const discordUsername = (discordUser.username || '').trim().slice(0, 64).replace(/[<>]/g, '');
      const discordGlobalName = (discordUser.global_name || discordUser.username || '').trim().slice(0, 128).replace(/[<>]/g, '');
      const discordAvatarHash = (discordUser.avatar || '').trim().slice(0, 64).replace(/[^a-zA-Z0-9_]/g, '');
      const discordEmail = typeof discordUser.email === 'string' ? discordUser.email.trim().toLowerCase() : '';
      const discordEmailVerified = discordUser.verified === true && Boolean(discordEmail && discordEmail.includes('@'));
      const discordAvatarUrl = discordAvatarHash ? `https://cdn.discordapp.com/avatars/${discordId}/${discordAvatarHash}.png` : null;

      if (!discordId) {
        console.error('[DISCORD CONNECT ERROR] Step: profile_parse | Code: profile_fetch_failed | Reason: missing discord id in @me response');
        res.writeHead(302, { 'Set-Cookie': clearStateCookie, 'Location': callbackErrorLocation('profile_fetch_failed') });
        res.end();
        return;
      }

      if (isLoginFlow) {
        let targetUser = null;
        const connectedUser = await pool.query(
          `SELECT users.* FROM auth_identities identities JOIN users ON users.id = identities.user_id
           WHERE identities.provider = 'discord' AND identities.provider_user_id = $1
           UNION ALL
           SELECT users.* FROM users
           LEFT JOIN user_discord_connections connections
             ON connections.user_id = users.id AND connections.discord_id = $1
           WHERE (users.discord_id = $1 OR connections.discord_id = $1)
             AND NOT EXISTS (SELECT 1 FROM auth_identities identities WHERE identities.provider = 'discord' AND identities.provider_user_id = $1)
           LIMIT 2`,
          [discordId]
        );
        if (new Set(connectedUser.rows.map(row => row.id)).size > 1) {
          console.error('[DISCORD AUTH] Refusing an ambiguous provider mapping.');
          res.writeHead(302, { 'Set-Cookie': clearStateCookie, 'Location': '/login?discord_error=account_conflict' });
          res.end();
          return;
        }
        targetUser = connectedUser.rows[0] || null;

        if (!targetUser) {
          if (!discordEmailVerified) {
            res.writeHead(302, { 'Set-Cookie': clearStateCookie, 'Location': '/login?discord_error=verified_email_required' });
            res.end();
            return;
          }

          const existingAccounts = await findPendingLinkAccount(pool, discordEmail);
          const orphanProfile = await pool.query('SELECT id FROM profiles WHERE LOWER(email) = $1 LIMIT 1', [discordEmail]);
          if (existingAccounts.length > 0 || orphanProfile.rows.length > 0) {
            if (existingAccounts.length === 1) {
              const pendingCookie = makePendingProviderCookie(req, {
                provider: 'discord', providerUserId: discordId, providerEmail: discordEmail,
                displayName: discordGlobalName, avatarUrl: discordAvatarUrl,
                returnTo: statePayload.returnTo
              });
              res.writeHead(302, { 'Set-Cookie': [...clearStateCookies, pendingCookie], 'Location': '/auth/link' });
              res.end();
              return;
            }
            res.writeHead(302, { 'Set-Cookie': clearStateCookie, 'Location': '/login?discord_error=account_conflict' });
            res.end();
            return;
          }

          const userId = 'USR-' + crypto.randomBytes(12).toString('hex');
          const cleanName = (discordGlobalName || discordUsername || 'Player').trim().slice(0, 50);
          const gamerTag = cleanName;
          const dbClient = await pool.connect();
          try {
            await dbClient.query('BEGIN');
            targetUser = await insertWithDistrictId((districtId) => dbClient.query(
              `INSERT INTO users (id, uid, name, email, password, "gamerTag", role, roles, tier, "orgApplicationStatus", avatar, status, discord_id, password_set, district_id)
               VALUES ($1, $1, $2, $3, NULL, $4, 'player', ARRAY['user'], 'Amateur', 'none', NULL, 'Active', $5, false, $6)
               ON CONFLICT (district_id) DO NOTHING RETURNING *`,
              [userId, cleanName, discordEmail, gamerTag, discordId, districtId]
            ));
            await dbClient.query(
              `INSERT INTO profiles (id, uid, name, email, "gamerTag", role, roles, tier, status, "discordTag")
               VALUES ($1, $1, $2, $3, $4, 'player', ARRAY['user'], 'Amateur', 'Active', $5)`,
              [userId, cleanName, discordEmail, gamerTag, discordUsername]
            );
            await dbClient.query(
              `INSERT INTO user_discord_connections (user_id, discord_id, username, global_name, avatar_hash, connected_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
              [userId, discordId, discordUsername, discordGlobalName, discordAvatarHash || null]
            );
            await storeProviderIdentity(dbClient, {
              userId, provider: 'discord', providerUserId: discordId, providerEmail: discordEmail,
              emailVerified: discordEmailVerified, displayName: discordGlobalName, avatarUrl: discordAvatarUrl
            });
            await dbClient.query('COMMIT');
          } catch (createErr) {
            await dbClient.query('ROLLBACK').catch(() => {});
            if (createErr.code === '23505') {
              const racedMapping = await pool.query(
                `SELECT users.* FROM users
                 LEFT JOIN user_discord_connections connections
                   ON connections.user_id = users.id AND connections.discord_id = $1
                 WHERE users.discord_id = $1 OR connections.discord_id = $1
                 LIMIT 2`,
                [discordId]
              );
              if (new Set(racedMapping.rows.map(row => row.id)).size > 1) {
                res.writeHead(302, { 'Set-Cookie': clearStateCookie, 'Location': '/login?discord_error=account_conflict' });
                res.end();
                return;
              } else if (racedMapping.rows.length > 0) {
                targetUser = racedMapping.rows[0];
              } else {
                res.writeHead(302, { 'Set-Cookie': clearStateCookie, 'Location': '/login?discord_error=account_link_required' });
                res.end();
                return;
              }
            } else {
              throw createErr;
            }
          } finally {
            dbClient.release();
          }
        }
        const accountStatus = String(targetUser.status || 'active').toLowerCase();
        if (['banned', 'suspended', 'disabled'].includes(accountStatus)) {
          res.writeHead(302, { 'Set-Cookie': clearStateCookie, 'Location': '/login?discord_error=account_unavailable' });
          res.end();
          return;
        }
        const isProtectedAdmin = targetUser.email?.toLowerCase() === (ROOT_ADMIN_EMAIL || '').toLowerCase() || hasRole(targetUser, ROLES.ADMIN);
        if (isProtectedAdmin && targetUser.admin_totp_activated && targetUser.admin_totp_secret) {
          res.writeHead(302, { 'Set-Cookie': clearStateCookie, 'Location': '/login?discord_error=admin_mfa_required' });
          res.end();
          return;
        }
        const loginClient = await pool.connect();
        try {
          await loginClient.query('BEGIN');
          const legacyMapping = await loginClient.query('SELECT discord_id FROM users WHERE id = $1 FOR UPDATE', [targetUser.id]);
          if (legacyMapping.rows[0]?.discord_id && legacyMapping.rows[0].discord_id !== discordId) {
            throw Object.assign(new Error('Discord identity mapping conflict.'), { code: 'PROVIDER_MAPPING_CONFLICT' });
          }
          const connectionMapping = await loginClient.query('SELECT discord_id FROM user_discord_connections WHERE user_id = $1 FOR UPDATE', [targetUser.id]);
          if (connectionMapping.rows[0]?.discord_id && connectionMapping.rows[0].discord_id !== discordId) {
            throw Object.assign(new Error('Discord connection mapping conflict.'), { code: 'PROVIDER_MAPPING_CONFLICT' });
          }
          await loginClient.query('UPDATE users SET discord_id = COALESCE(discord_id, $1) WHERE id = $2', [discordId, targetUser.id]);
          await loginClient.query(
            `INSERT INTO user_discord_connections (user_id, discord_id, username, global_name, avatar_hash, connected_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) ON CONFLICT (user_id) DO UPDATE SET
             discord_id = EXCLUDED.discord_id, username = EXCLUDED.username, global_name = EXCLUDED.global_name,
             avatar_hash = EXCLUDED.avatar_hash, updated_at = NOW()`,
            [targetUser.id, discordId, discordUsername, discordGlobalName, discordAvatarHash || null]
          );
          await storeProviderIdentity(loginClient, {
            userId: targetUser.id, provider: 'discord', providerUserId: discordId,
            providerEmail: discordEmailVerified ? discordEmail : null, emailVerified: discordEmailVerified,
            displayName: discordGlobalName, avatarUrl: discordAvatarUrl, lastLogin: true
          });
          await loginClient.query('COMMIT');
        } catch (identityError) {
          await loginClient.query('ROLLBACK').catch(() => {});
          throw identityError;
        } finally { loginClient.release(); }
        const token = signJwt({
          email: targetUser.email,
          role: targetUser.role,
          roles: targetUser.roles || [targetUser.role],
          id: targetUser.uid || targetUser.id
        });
        res.writeHead(302, {
          'Set-Cookie': [...clearStateCookies, buildSessionCookie(token, req)],
          'Location': `/auth/success?provider=discord&next=${encodeURIComponent(getSafeRelativeRedirect(statePayload.returnTo, '/'))}`
        });
        res.end();
        return;
      }

      // Resolve primary user account row to ensure correct users.id
      const userLookupRes = await pool.query(
        'SELECT id, discord_id FROM users WHERE id = $1 OR uid = $1 LIMIT 1',
        [authUser.id || authUser.uid]
      );
      if (userLookupRes.rows.length === 0) {
        console.error('[DISCORD CONNECT ERROR] Step: user_lookup | Code: session_expired | Reason: user row not found in users table');
        res.writeHead(302, { 'Set-Cookie': clearStateCookie, 'Location': callbackErrorLocation('session_expired') });
        res.end();
        return;
      }
      const actualUserId = userLookupRes.rows[0].id;
      const existingDiscordId = userLookupRes.rows[0].discord_id;

      // Check collision 1: Is this discord_id already connected to a DIFFERENT MatchDistrict user?
      const conflictCheck = await pool.query(
        `SELECT id FROM users WHERE discord_id = $1 AND id != $2
         UNION
         SELECT user_id AS id FROM user_discord_connections WHERE discord_id = $1 AND user_id != $2
         UNION
         SELECT user_id AS id FROM auth_identities WHERE provider = 'discord' AND provider_user_id = $1 AND user_id != $2
         LIMIT 1`,
        [discordId, actualUserId]
      );
      if (conflictCheck.rows.length > 0) {
        console.warn(`[DISCORD CONNECT] Step: collision_check | Code: already_linked | Reason: discord_id claimed by other user`);
        res.writeHead(302, { 'Set-Cookie': clearStateCookie, 'Location': callbackErrorLocation('already_linked') });
        res.end();
        return;
      }

      // Check collision 2: Does current user already have a different Discord connected? Only replace if reconnect requested.
      if (existingDiscordId && existingDiscordId !== discordId && !statePayload.reconnect) {
        console.warn(`[DISCORD CONNECT] Step: user_collision_check | Code: already_linked | Reason: user already connected to different discord`);
        res.writeHead(302, { 'Set-Cookie': clearStateCookie, 'Location': callbackErrorLocation('already_linked') });
        res.end();
        return;
      }

      // Atomic transaction: Update users.discord_id and upsert user_discord_connections
      const dbClient = await pool.connect();
      try {
        await dbClient.query('BEGIN');
        const currentIdentity = await dbClient.query("SELECT provider_user_id FROM auth_identities WHERE user_id = $1 AND provider = 'discord' FOR UPDATE", [actualUserId]);
        if (currentIdentity.rows.length && currentIdentity.rows[0].provider_user_id !== discordId) {
          if (!statePayload.reconnect) {
            await dbClient.query('ROLLBACK');
            res.writeHead(302, { 'Set-Cookie': clearStateCookie, 'Location': callbackErrorLocation('already_linked') });
            res.end();
            return;
          }
          await dbClient.query("DELETE FROM auth_identities WHERE user_id = $1 AND provider = 'discord'", [actualUserId]);
        }
        await dbClient.query('UPDATE users SET discord_id = $1, discord_user_id = $1, discord_username = $2, discord_linked_at = NOW() WHERE id = $3', [discordId, discordUsername, actualUserId]);
        await dbClient.query(
          `INSERT INTO user_discord_connections (user_id, discord_id, username, global_name, avatar_hash, connected_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           ON CONFLICT (user_id)
           DO UPDATE SET discord_id = EXCLUDED.discord_id,
                         username = EXCLUDED.username,
                         global_name = EXCLUDED.global_name,
                         avatar_hash = EXCLUDED.avatar_hash,
                         updated_at = NOW()`,
          [actualUserId, discordId, discordUsername, discordGlobalName, discordAvatarHash || null]
        );
        await storeProviderIdentity(dbClient, {
          userId: actualUserId, provider: 'discord', providerUserId: discordId,
          providerEmail: discordEmailVerified ? discordEmail : null, emailVerified: discordEmailVerified,
          displayName: discordGlobalName, avatarUrl: discordAvatarUrl
        });
        await dbClient.query('COMMIT');
      } catch (txErr) {
        await dbClient.query('ROLLBACK').catch(() => {});
        const pgCode = txErr.code || 'UNKNOWN';
        console.error(`[DISCORD CONNECT ERROR] Step: db_transaction | PostgresCode: ${pgCode} | Exception: ${txErr.message}`);
        res.writeHead(302, { 'Set-Cookie': clearStateCookie, 'Location': callbackErrorLocation('db_error') });
        res.end();
        return;
      } finally {
        dbClient.release();
      }

      console.log('[AUTH] Provider link succeeded: discord.');

      // Notify Discord bot to synchronize tournament access if bot webhook or sync URL is configured
      const botSyncUrl = process.env.DISCORD_BOT_SYNC_URL || (process.env.PORT ? `http://127.0.0.1:${process.env.PORT}/api/bot/sync/user` : null);
      if (botSyncUrl && discordId) {
        fetch(botSyncUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-bot-secret': process.env.MATCHDISTRICT_BOT_SECRET || '',
          },
          body: JSON.stringify({ discord_id: discordId }),
        }).catch(() => {});
      }

      const returnUrl = (statePayload?.returnTo && typeof statePayload.returnTo === 'string' && statePayload.returnTo.startsWith('/') && !statePayload.returnTo.startsWith('//') && statePayload.returnTo !== '/')
        ? `${statePayload.returnTo}${statePayload.returnTo.includes('?') ? '&' : '?'}discord=connected`
        : '/profile?discord=connected';

      res.writeHead(302, {
        'Set-Cookie': clearStateCookie,
        'Location': returnUrl
      });
      res.end();
      return;
    } catch (err) {
      const pgCode = err.code || null;
      const isDb = Boolean(pgCode || /postgres|relation|column|database|syntax error/i.test(err.message));
      const stepCode = isDb ? 'db_error' : 'unknown';
      console.error(`[DISCORD CONNECT ERROR] Step: callback_handler | Code: ${stepCode} | PostgresCode: ${pgCode || 'N/A'} | Exception: ${err.message}`);
      res.writeHead(302, { 'Set-Cookie': clearStateCookie, 'Location': callbackErrorLocation(stepCode) });
      res.end();
      return;
    }
  }

  // 2e. Discord OAuth2 Flow: Disconnect Discord (POST /api/auth/discord/disconnect or POST /api/auth/discord/unlink)
  // Always allowed: Discord is connect-only, never a login credential.
  if ((urlPath === '/api/auth/discord/disconnect' || urlPath === '/api/auth/discord/unlink') && req.method === 'POST') {
    const authUser = getAuthUser(req);
    if (!authUser) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
      return;
    }

    const clientIp = getClientIp(req);
    const authUserId = authUser.id || authUser.uid;
    const ipLimit = checkRateLimit('discord_disconnect_ip:' + clientIp, 30, 10 * 60 * 1000);
    if (!ipLimit.allowed) {
      const mins = Math.max(1, Math.ceil(ipLimit.retryAfter / 60));
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': ipLimit.retryAfter });
      res.end(JSON.stringify({ success: false, error: 'RATE_LIMITED', message: `Too many attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`, retryAfter: ipLimit.retryAfter }));
      return;
    }
    const userLimit = authUserId ? checkRateLimit('discord_disconnect_user:' + authUserId, 10, 10 * 60 * 1000) : { allowed: true, retryAfter: 0 };
    if (!userLimit.allowed) {
      rollbackRateLimit('discord_disconnect_ip:' + clientIp);
      const mins = Math.max(1, Math.ceil(userLimit.retryAfter / 60));
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': userLimit.retryAfter });
      res.end(JSON.stringify({ success: false, error: 'RATE_LIMITED', message: `Too many attempts. Please try again in ${mins} minute${mins === 1 ? '' : 's'}.`, retryAfter: userLimit.retryAfter }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let dbClient;
      try {
        const { currentPassword } = JSON.parse(body || '{}');
        dbClient = await pool.connect();
        await dbClient.query('BEGIN');
        const accountResult = await dbClient.query(
          'SELECT id, password, password_set, google_id, discord_id, discord_linked_at, created_at FROM users WHERE id = $1 OR uid = $1 ORDER BY (id = $1) DESC LIMIT 1 FOR UPDATE',
          [authUser.id || authUser.uid]
        );
        const account = accountResult.rows[0];
        if (!account) {
          await dbClient.query('ROLLBACK');
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ACCOUNT_NOT_FOUND', message: 'Match District account not found.' }));
          return;
        }
        if (!account.discord_id) {
          await dbClient.query('ROLLBACK');
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_LINKED', message: 'Discord account is not connected.' }));
          return;
        }

        // 14-day unlink lock rule: accounts can only be unlinked 14 days after being linked
        let discordLinkedAt = account.discord_linked_at;
        if (!discordLinkedAt) {
          const dcRes = await dbClient.query('SELECT connected_at FROM user_discord_connections WHERE user_id = $1 LIMIT 1', [account.id]);
          discordLinkedAt = dcRes.rows[0]?.connected_at;
        }
        if (!discordLinkedAt) {
          const idRes = await dbClient.query("SELECT linked_at FROM auth_identities WHERE user_id = $1 AND provider = 'discord' LIMIT 1", [account.id]);
          discordLinkedAt = idRes.rows[0]?.linked_at || account.created_at;
        }
        const cooldown = getUnlinkCooldownStatus(discordLinkedAt);
        if (!cooldown.canUnlink) {
          await dbClient.query('ROLLBACK');
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'UNLINK_COOLDOWN',
            message: `Discord account can only be unlinked 14 days after linking. You can unlink it in ${cooldown.remainingDays} day${cooldown.remainingDays === 1 ? '' : 's'}.`,
            remainingDays: cooldown.remainingDays,
            canUnlinkAt: cooldown.canUnlinkAt ? cooldown.canUnlinkAt.toISOString() : null,
          }));
          return;
        }
        const hasPassword = account.password_set === true && Boolean(account.password);
        if (!hasPassword) {
          const recentLogin = Number.isFinite(Number(authUser.iat)) && Date.now() - Number(authUser.iat) * 1000 <= 10 * 60 * 1000;
          if (!recentLogin) {
            await dbClient.query('ROLLBACK');
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'RECENT_LOGIN_REQUIRED', message: 'Sign in again before disconnecting a provider.' }));
            return;
          }
          const otherMethod = await dbClient.query("SELECT 1 FROM auth_identities WHERE user_id = $1 AND provider <> 'discord' LIMIT 1", [account.id]);
          if (!account.google_id && otherMethod.rows.length === 0) {
            await dbClient.query('ROLLBACK');
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'LAST_LOGIN_METHOD_REQUIRED', message: 'Add another sign-in method before disconnecting Discord.' }));
            return;
          }
        } else if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, account.password)) {
          await dbClient.query('ROLLBACK');
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'REAUTHENTICATION_REQUIRED', message: 'Enter your current password to confirm this change.' }));
          return;
        }
        await dbClient.query('UPDATE users SET discord_id = NULL, discord_user_id = NULL, discord_username = NULL, discord_linked_at = NULL WHERE id = $1', [account.id]);
        await dbClient.query('DELETE FROM user_discord_connections WHERE user_id = $1', [account.id]);
        await dbClient.query("DELETE FROM auth_identities WHERE user_id = $1 AND provider = 'discord'", [account.id]);
        await dbClient.query('COMMIT');

        console.log('[DISCORD AUTH] Discord provider disconnected after password reauthentication.');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Discord disconnected successfully.' }));
      } catch (err) {
        await dbClient?.query('ROLLBACK').catch(() => {});
        console.error('[DISCORD DISCONNECT] Failed [code: ' + (err?.code || 'UNKNOWN') + '].');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: 'Failed to disconnect Discord account.' }));
      } finally {
        dbClient?.release();
      }
    });
    return;
  }

  // 2e-status. Get Discord Linking Status (GET /api/auth/discord/status)
  if (urlPath === '/api/auth/discord/status' && req.method === 'GET') {
    const authUser = getAuthUser(req);
    if (!authUser) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
      return;
    }
    try {
      const uId = authUser.id || authUser.uid;
      const statusRes = await pool.query(
        `SELECT udc.discord_id, udc.username, udc.global_name, udc.connected_at,
                u.discord_id AS u_discord_id, u.discord_user_id, u.discord_username, u.discord_linked_at
         FROM users u
         LEFT JOIN user_discord_connections udc ON udc.user_id = u.id
         WHERE u.id = $1 OR u.uid = $1
         LIMIT 1`,
        [uId]
      );
      if (statusRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'USER_NOT_FOUND' }));
        return;
      }
      const row = statusRes.rows[0];
      const discordId = row.discord_id || row.discord_user_id || row.u_discord_id || null;
      const connected = Boolean(discordId);
      const discordLinkedAt = connected ? (row.connected_at || row.discord_linked_at || null) : null;
      const cooldown = getUnlinkCooldownStatus(discordLinkedAt);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        connected,
        discordId: connected ? discordId : null,
        username: connected ? (row.username || row.discord_username || null) : null,
        displayName: connected ? (row.global_name || row.username || row.discord_username || null) : null,
        connectedAt: discordLinkedAt,
        canUnlink: cooldown.canUnlink,
        remainingDays: cooldown.remainingDays,
        canUnlinkAt: cooldown.canUnlinkAt ? cooldown.canUnlinkAt.toISOString() : null,
      }));
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: err.message }));
      return;
    }
  }

  // 2f. Logout Service (/api/auth/logout)
  if ((urlPath === '/api/auth/logout' || req.url === '/api/auth/logout') && (req.method === 'POST' || req.method === 'GET')) {
    const clearCookies = buildClearSessionCookies(req);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': clearCookies
    });
    res.end(JSON.stringify({ success: true, message: 'Logged out successfully.' }));
    return;
  }

  // 3-temp. Temporary User Registration Details (saves for 5 minutes)

  if (req.url === '/api/auth/register-temp' && req.method === 'POST') {
    let body = '';
    let bodySize = 0;
    const MAX_AUTH_BODY = 16 * 1024;
    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_AUTH_BODY) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'PAYLOAD_TOO_LARGE' }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', async () => {
      if (bodySize > MAX_AUTH_BODY) return;
      try {
        const userData = JSON.parse(body);
        const email = (userData.email || '').trim().toLowerCase();
        if (!email || !email.includes('@')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_EMAIL', message: 'Valid email is required.' }));
          return;
        }

        // Cleanup expired temp users
        await pool.query('DELETE FROM temp_users WHERE expires_at < NOW()');

        // Check if the user email is already registered permanently
        const checkUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (checkUser.rows.length > 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Email is already registered.' }));
          return;
        }

        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        const hashedPassword = hashPassword(userData.password || '');

        await pool.query(
          `INSERT INTO temp_users (email, name, password, "gamerTag", role, verified, verification_token, expires_at)
           VALUES ($1, $2, $3, $4, $5, false, NULL, $6)
           ON CONFLICT (email)
           DO UPDATE SET name = $2, password = $3, "gamerTag" = $4, role = $5, verified = false, verification_token = NULL, expires_at = $6, created_at = CURRENT_TIMESTAMP`,
          [email, userData.name || '', hashedPassword, userData.gamerTag || '', 'player', expiresAt]
        );

        console.log(`📦 [MATCH DISTRICT TEMP REGISTER] Temporary registration details saved for: ${email}`);

        // Log terms acceptance if user agreed (fire-and-forget)
        if (userData.agreeTerms === true) {
          logTermsAcceptance(pool, email, null, 'temp_submit', req).catch(() => {});
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Details submitted successfully. Proceeding to verification.'
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3. Supabase User Registration Service (finalizes from temp_users)
  if (req.url === '/api/auth/register' && req.method === 'POST') {
    let body = '';
    let bodySize = 0;
    const MAX_AUTH_BODY = 16 * 1024;
    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_AUTH_BODY) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'PAYLOAD_TOO_LARGE' }));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', async () => {
      if (bodySize > MAX_AUTH_BODY) return;
      try {
        const { email: rawEmail, password, verificationToken } = JSON.parse(body);
        const email = (rawEmail || '').trim().toLowerCase();

        // Cleanup expired temp users
        await pool.query('DELETE FROM temp_users WHERE expires_at < NOW()');

        // Fetch temporary user details
        const tempUserRes = await pool.query('SELECT * FROM temp_users WHERE email = $1 AND expires_at > NOW()', [email]);
        if (tempUserRes.rows.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Registration session expired (5 min limit). Please submit details again.' }));
          return;
        }

        const tempUser = tempUserRes.rows[0];

        // CRITICAL CHECK: Enforce that email OTP was verified!
        if (!tempUser.verified) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'EMAIL_NOT_VERIFIED',
            message: 'Email address has not been verified. Please verify your OTP code before finalizing registration.'
          }));
          return;
        }

        // Verify verificationToken matches if token was issued
        if (tempUser.verification_token && verificationToken) {
          if (typeof verificationToken !== 'string' || !/^[a-f0-9]{64}$/i.test(verificationToken)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'INVALID_VERIFICATION_TOKEN',
              message: 'Please complete email verification before finalizing registration.'
            }));
            return;
          }
          const storedTokenBuf = Buffer.from(tempUser.verification_token);
          const clientTokenBuf = Buffer.from(verificationToken);
          const isTokenMatch = storedTokenBuf.length === clientTokenBuf.length && crypto.timingSafeEqual(storedTokenBuf, clientTokenBuf);
          if (!isTokenMatch) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'INVALID_VERIFICATION_TOKEN',
              message: 'Invalid verification token. Please complete verification again.'
            }));
            return;
          }
        } else {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'INVALID_VERIFICATION_TOKEN',
            message: 'Please complete email verification before finalizing registration.'
          }));
          return;
        }

        // Register user in Supabase Auth
        let userUUID = null;
        let isLocalFallback = false;
        const registerPassword = password || ('MatchDistrictTempPass' + crypto.randomBytes(6).toString('hex'));

        try {
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: tempUser.email,
            password: registerPassword
          });

          if (authError || !authData || !authData.user) {
            isLocalFallback = true;
          } else {
            userUUID = authData.user.id;
          }
        } catch (signUpErr) {
          isLocalFallback = true;
        }

        if (isLocalFallback) {
          // Check if already in users table
          const checkUser = await pool.query('SELECT * FROM users WHERE email = $1', [tempUser.email]);
          if (checkUser.rows.length > 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Email is already registered.' }));
            return;
          }
          userUUID = 'USR-' + crypto.randomBytes(12).toString('hex');
        }

        const defaultRole = 'player';
        const defaultRoles = ['user'];
        const defaultStatus = 'Active';
        const defaultGamerTag = tempUser.gamerTag || ('@' + (tempUser.name || tempUser.email.split('@')[0]).toLowerCase().replace(/\s+/g, '_'));

        let newUser = null;
        const registrationClient = await pool.connect();
        try {
          await registrationClient.query('BEGIN');
          newUser = await insertWithDistrictId((districtId) => registrationClient.query(
            `INSERT INTO users (id, uid, name, email, password, "gamerTag", role, roles, tier, "orgApplicationStatus", avatar, status, district_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (district_id) DO NOTHING RETURNING *`,
            [userUUID, userUUID, tempUser.name || '', tempUser.email, tempUser.password,
              defaultGamerTag, defaultRole, defaultRoles, 'Amateur', 'none',
              'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=500&q=80',
              defaultStatus, districtId]
          ));
          await ensureSupabaseProfile(registrationClient, newUser);
          const profileCheck = await registrationClient.query(
            'SELECT 1 FROM profiles WHERE id = $1 AND email = $2',
            [newUser.uid || newUser.id, newUser.email]
          );
          if (profileCheck.rows.length === 0) {
            throw new Error('Registration profile was not created for the new account.');
          }

          // Delete from temp_users (single-use: registration completed)
          await registrationClient.query('DELETE FROM temp_users WHERE email = $1', [tempUser.email]);
          await registrationClient.query('COMMIT');
          console.log(`\n📦 [MATCH DISTRICT DB] User "${newUser.email}" registered permanently.\n`);

          // Log final terms acceptance
          logTermsAcceptance(pool, newUser.email, newUser.id || newUser.uid, 'final_register', req).catch(() => {});
        } catch (dbErr) {
          await registrationClient.query('ROLLBACK').catch(() => {});
          const duplicateEmail = dbErr.code === '23505' && /email/i.test(dbErr.constraint || '');
          console.error(`[AUTH REGISTER] Account/profile transaction failed [code: ${dbErr.code || 'UNKNOWN'}].`);
          res.writeHead(duplicateEmail ? 409 : 500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: duplicateEmail ? 'Email is already registered.' : 'Account registration could not be completed. Please try again.' }));
          return;
        } finally {
          registrationClient.release();
        }

        const token = signJwt({ email: newUser.email, role: newUser.role, roles: newUser.roles || [newUser.role], id: newUser.uid || newUser.id });

        // Strip sensitive fields from user response
        const safeUser = { ...newUser };
        delete safeUser.password;
        delete safeUser.salt;
        delete safeUser.admin_totp_secret;

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': buildSessionCookie(token, req)
        });
        res.end(JSON.stringify({ success: true, token, user: safeUser }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3a. POST /api/auth/reset-password Service — Token-enforced password reset (AUTH-003)
  if (req.url === '/api/auth/reset-password' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { token, password } = JSON.parse(body);
        if (!token || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'A valid reset token and new password are required.' }));
          return;
        }

        const now = new Date();
        const resetRes = await pool.query(
          'SELECT * FROM password_resets WHERE token = $1 AND expires_at > $2',
          [token, now]
        );

        if (resetRes.rows.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid or expired reset token.' }));
          return;
        }

        const email = resetRes.rows[0].email;
        const hashedPassword = hashPassword(password);
        const dbRes = await pool.query(
          'UPDATE users SET password = $1 WHERE email = $2 RETURNING *',
          [hashedPassword, email]
        );

        if (dbRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'User associated with token not found.' }));
          return;
        }

        const updatedUser = dbRes.rows[0];
        await pool.query('DELETE FROM password_resets WHERE token = $1', [token]);

        if (updatedUser.uid && !updatedUser.uid.startsWith('USR-')) {
          try {
            if (supabaseAdmin) await supabaseAdmin.auth.admin.updateUserById(updatedUser.uid, { password });
          } catch (supErr) {
            console.warn('⚠️ [RESET PASSWORD] Could not update Supabase Auth user password:', supErr.message);
          }
        }

        console.log(`🔑 [MATCH DISTRICT AUTH] Password reset successfully via token for user: ${email}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Password reset successful.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3a-3. POST /api/auth/change-password & POST /api/auth/create-password Services
  if ((req.url === '/api/auth/change-password' || req.url === '/api/auth/create-password') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required to update password.' }));
          return;
        }

        let parsedBody = {};
        try {
          parsedBody = JSON.parse(body || '{}');
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_JSON', message: 'Invalid request data.' }));
          return;
        }

        const { email, currentPassword, newPassword, confirmPassword } = parsedBody;

        // Fetch user from DB strictly by authenticated session ID
        const userRes = await pool.query('SELECT * FROM users WHERE id = $1::text OR uid = $1::text', [String(authUser.id)]);
        if (userRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'USER_NOT_FOUND', message: 'User account not found.' }));
          return;
        }

        const dbUser = userRes.rows[0];

        // Security check: if email is supplied, it must match authenticated account
        if (email && email.toLowerCase() !== dbUser.email.toLowerCase()) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Cannot modify password credentials for another account.' }));
          return;
        }

        // Validate new password format and length
        if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'PASSWORD_TOO_SHORT', message: 'Password must be at least 6 characters long.' }));
          return;
        }

        if (confirmPassword !== undefined && newPassword !== confirmPassword) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'PASSWORDS_DO_NOT_MATCH', message: 'New passwords do not match.' }));
          return;
        }

        // Determine whether user already has a valid password credential configured
        const hasExistingPassword = Boolean(dbUser.password_set === true && dbUser.password);

        if (hasExistingPassword) {
          // Existing password credential: current password verification is mandatory
          if (!currentPassword || typeof currentPassword !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'CURRENT_PASSWORD_REQUIRED', message: 'Current password is required to change password.' }));
            return;
          }

          let isPasswordCorrect = false;
          if (dbUser.password && verifyPassword(currentPassword, dbUser.password)) {
            isPasswordCorrect = true;
          } else {
            // Fallback: Verify current password via Supabase Auth
            try {
              const { error: signInError } = await supabase.auth.signInWithPassword({
                email: dbUser.email,
                password: currentPassword
              });
              if (!signInError) {
                isPasswordCorrect = true;
              }
            } catch (signInErr) {
              // ignore
            }
          }

          if (!isPasswordCorrect) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'INCORRECT_CURRENT_PASSWORD', message: 'Incorrect current password. Please try again.' }));
            return;
          }
        }

        const hashedNewPassword = hashPassword(newPassword);

        // Update password and record password_set = true
        const dbRes = await pool.query(
          'UPDATE users SET password = $1::text, password_set = true WHERE id = $2::text RETURNING *',
          [hashedNewPassword, String(dbUser.id)]
        );

        const updatedUser = dbRes.rows[0];

        // Sync with Supabase Auth user if standard UUID present
        if (updatedUser.uid && !updatedUser.uid.startsWith('USR-')) {
          try {
            if (supabaseAdmin) await supabaseAdmin.auth.admin.updateUserById(updatedUser.uid, { password: newPassword });
          } catch (supErr) {
            console.warn('⚠️ [PASSWORD UPDATE] Could not update Supabase Auth user password:', supErr.message);
          }
        }

        console.log(`🔑 [MATCH DISTRICT AUTH] Password ${hasExistingPassword ? 'changed' : 'created'} successfully for user: ${dbUser.email}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: hasExistingPassword ? 'Password updated successfully.' : 'Password created successfully.',
          user: publicUserRow(updatedUser)
        }));
      } catch (err) {
        const ref = makeErrorRef();
        logErrorWithRef(ref, 'POST /api/auth/change-password', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: `Could not save. Please try again. (Ref: ${ref})` }));
      }
    });
    return;
  }

  // 3a-1. POST /api/auth/forgot-password-link Service
  if (req.url === '/api/auth/forgot-password-link' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        let parsed = {};
        try {
          parsed = JSON.parse(body || '{}');
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_JSON', message: 'A valid email address is required.' }));
          return;
        }

        const rawEmail = typeof parsed.email === 'string' ? parsed.email : '';
        const cleanEmail = rawEmail.trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_EMAIL', message: 'A valid email address is required.' }));
          return;
        }

        // Database-backed abuse guard (60s cooldown, 3 sends / 15m, timeouts)
        if (!(await accountSecurity.guardSend(req, res, { flow: 'password_reset', email: cleanEmail }))) return;

        // Check if user exists in database (generic response to prevent user enumeration - AUTH-006)
        const userRes = await pool.query('SELECT id FROM users WHERE email = $1::text', [cleanEmail]);
        if (userRes.rows.length === 0) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'If an account exists with this email, a password reset link has been sent.' }));
          return;
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry (AUTH-005)

        await pool.query(
          'INSERT INTO password_resets (email, token, expires_at) VALUES ($1::text, $2::text, $3::timestamptz) ON CONFLICT (email) DO UPDATE SET token = $2::text, expires_at = $3::timestamptz, created_at = CURRENT_TIMESTAMP',
          [cleanEmail, token, expiresAt]
        );

        const proto = req.headers['x-forwarded-proto'] || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
        const resetLink = `${proto}://${req.headers.host}/reset-password?token=${token}`;
        await sendEmail({
          to: cleanEmail,
          subject: 'Reset Your Match District Password',
          html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
                <h2 style="color: #333; text-align: center;">Reset Your Password</h2>
                <p>Hello,</p>
                <p>You requested a password reset for your Match District account. Please use the link below to set a new password:</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${resetLink}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Reset Password</a>
                </div>
                <p>This link is valid for <strong>1 hour</strong>.</p>
                <p>If you didn't request this, you can safely ignore this email.</p>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 12px; color: #888; text-align: center;">&copy; 2026 Match District. All rights reserved.</p>
              </div>
            `
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Password reset link sent.' }));
      } catch (err) {
        const ref = makeErrorRef();
        logErrorWithRef(ref, 'POST /api/auth/forgot-password-link', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: `Could not save. Please try again. (Ref: ${ref})` }));
      }
    });
    return;
  }

  // 3a-2. POST /api/auth/reset-password-token Service
  if (req.url === '/api/auth/reset-password-token' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { token, password } = JSON.parse(body);
        if (!token || !password) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Token and password are required.' }));
          return;
        }

        if (!(await accountSecurity.guardVerify(req, res, { email: null }))) return;

        const now = new Date();
        const resetRes = await pool.query(
          'SELECT * FROM password_resets WHERE token = $1 AND expires_at > $2',
          [token, now]
        );

        if (resetRes.rows.length === 0) {
          if (await accountSecurity.recordFailure(req, res, { flow: 'password_reset', email: null })) return;
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid or expired reset token.' }));
          return;
        }

        const email = resetRes.rows[0].email;
        accountSecurity.clearFailures(req, { flow: 'password_reset', email });

        const hashedPassword = hashPassword(password);
        // Update password in database
        const dbRes = await pool.query(
          'UPDATE users SET password = $1, password_set = true WHERE email = $2 RETURNING *',
          [hashedPassword, email]
        );

        if (dbRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'User associated with token not found.' }));
          return;
        }

        const updatedUser = dbRes.rows[0];

        // Delete reset token (inactive now)
        await pool.query('DELETE FROM password_resets WHERE email = $1', [email]);

        // Try to update in Supabase Auth if user has UUID
        if (updatedUser.uid && !updatedUser.uid.startsWith('USR-')) {
          try {
            if (supabaseAdmin) await supabaseAdmin.auth.admin.updateUserById(updatedUser.uid, { password });
          } catch (supErr) {
            console.warn('⚠️ [RESET PASSWORD] Could not update Supabase Auth user password:', supErr.message);
          }
        }

        console.log(`🔑 [MATCH DISTRICT AUTH] Password updated successfully via reset token for user: ${email}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Password updated successfully.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3a-3. GET /api/auth/validate-reset-token Service
  if (req.url.startsWith('/api/auth/validate-reset-token') && req.method === 'GET') {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      if (!token) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Token is required.' }));
        return;
      }

      const now = new Date();
      const resetRes = await pool.query(
        'SELECT * FROM password_resets WHERE token = $1 AND expires_at > $2',
        [token, now]
      );

      if (resetRes.rows.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, valid: false, message: 'Invalid or expired reset token.' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, valid: true, message: 'Valid token.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 3b. GET /api/auth/me Service
  if ((req.url === '/api/auth/me' || urlPath === '/api/auth/me') && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const dbRes = await pool.query('SELECT * FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (dbRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'USER_NOT_FOUND' }));
        return;
      }
      let user = dbRes.rows[0];
      let token = null;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      } else if (req.headers.cookie) {
        const match = req.headers.cookie.match(/(^|;)\s*token\s*=\s*([^;]+)/);
        if (match) {
          try { token = decodeURIComponent(match[2]); } catch { token = match[2]; }
        }
      }
      let encryptedSession = null;
      if (token) {
        try {
          encryptedSession = encryptSessionData(JSON.stringify({
            token,
            userId: user.uid || user.id,
            email: user.email
          }));
        } catch {}
      }

      const discordConn = await getDiscordConnectionForUser(pool, user.id, user.discord_id);
      const safeUser = publicUserRow(user);
      await attachResolvedAvatars(pool, [safeUser]);
      delete safeUser.discord_id;
      safeUser.discord = discordConn;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        user: safeUser,
        ...(encryptedSession ? { encryptedSession } : {})
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 3b-2. POST /api/auth/restore-session Service
  if (req.url === '/api/auth/restore-session' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { encryptedSession } = JSON.parse(body);
        if (!encryptedSession) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Encrypted session is required.' }));
          return;
        }

        const decrypted = decryptSessionData(encryptedSession);
        const sessionData = JSON.parse(decrypted);

        // Verify JWT token inside the session
        const verified = verifyJwt(sessionData.token);
        if (!verified.valid) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Session expired or invalid.' }));
          return;
        }

        // Fetch user from database
        const dbRes = await pool.query('SELECT * FROM users WHERE id = $1 OR uid = $1', [sessionData.userId]);
        if (dbRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'User profile not found.' }));
          return;
        }

        const foundUser = dbRes.rows[0];
        const freshToken = signJwt({ email: foundUser.email, role: foundUser.role, roles: foundUser.roles || [foundUser.role], id: foundUser.uid || foundUser.id });
        const newEncryptedSession = encryptSessionData(JSON.stringify({ token: freshToken, userId: foundUser.uid || foundUser.id, email: foundUser.email }));

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': buildSessionCookie(freshToken, req)
        });
        res.end(JSON.stringify({
          success: true,
          token: freshToken,
          user: publicUserRow(foundUser),
          encryptedSession: newEncryptedSession
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Failed to restore session: ' + err.message }));
      }
    });
    return;
  }

  // Team-preset payload helpers (local to the request handler)
  const GAME_ALIASES = {
    bgmi: 'BGMI',
    'battlegrounds mobile india': 'BGMI',
    codm: 'CODM',
    'cod mobile': 'CODM',
    'call of duty mobile': 'CODM',
    'free fire': 'Free Fire',
    freefire: 'Free Fire',
    valorant: 'Valorant',
    cs2: 'CS2',
    'counter-strike 2': 'CS2',
  };
  const normalizeGameName = (value) => {
    const key = (value || '').trim().toLowerCase();
    return GAME_ALIASES[key] || (typeof value === 'string' ? value.trim() : '');
  };
  const normalizeRosterList = (value) => {
    const list = Array.isArray(value) ? value : [];
    return list
      .map((item) => {
        if (item && typeof item === 'object') {
          return {
            ign: typeof item.ign === 'string' ? item.ign.trim() : '',
            uid: typeof item.uid === 'string' ? item.uid.trim() : '',
          };
        }
        if (typeof item === 'string') return { ign: item.trim(), uid: '' };
        return { ign: '', uid: '' };
      })
      .filter((item) => item.ign !== '' || item.uid !== '');
  };

  const validatePresetPayload = (data) => {
    if (!data || typeof data !== 'object') {
      return { error: 'INVALID_INPUT', message: 'Invalid preset payload.' };
    }
    const teamName = typeof data.team_name === 'string' ? data.team_name.trim() : '';
    const captain = typeof data.captain === 'string' ? data.captain.trim() : '';
    const captainUid = typeof data.captain_uid === 'string' ? data.captain_uid.trim() : '';
    let game = typeof data.game === 'string' && data.game.trim() ? data.game.trim() : 'BGMI';
    game = normalizeGameName(game) || 'BGMI';
    if (game.length > 50) game = game.slice(0, 50);
    if (!teamName || teamName.length > 16) {
      return { error: 'INVALID_INPUT', message: 'Team name must be between 1 and 16 characters.' };
    }
    if (!captain) {
      return { error: 'INVALID_INPUT', message: 'Captain IGN is required.' };
    }
    if (captainUid && !/^\d+$/.test(captainUid)) {
      return { error: 'INVALID_INPUT', message: 'Captain UID must contain numbers only.' };
    }
    const players = normalizeRosterList(data.players).slice(0, 3);
    const substitutes = normalizeRosterList(data.substitutes).slice(0, 2);
    for (const slot of [...players, ...substitutes]) {
      if (slot.uid && !/^\d+$/.test(slot.uid)) {
        return { error: 'INVALID_INPUT', message: 'Player UIDs must contain numbers only.' };
      }
      if (slot.ign.length > 30 || slot.uid.length > 30) {
        return { error: 'INVALID_INPUT', message: 'Player IGN/UID values are too long.' };
      }
    }
    let presetName = typeof data.preset_name === 'string' && data.preset_name.trim()
      ? data.preset_name.trim()
      : teamName;
    if (presetName.length > 50) presetName = presetName.slice(0, 50);
    return {
      preset: {
        presetName,
        game,
        teamName,
        captain,
        captainUid,
        players,
        substitutes,
        isDefault: !!data.is_default,
      },
    };
  };

  // Helper to resolve all identity keys (id and uid) for the authenticated user
  const getUserIdentityIds = async (dbPool, authUser) => {
    const rawId = authUser.id || authUser.uid;
    const ids = [String(rawId)];
    try {
      const uRes = await dbPool.query(
        'SELECT id, uid FROM users WHERE id::varchar = $1::varchar OR uid::varchar = $1::varchar',
        [rawId]
      );
      if (uRes.rows.length > 0) {
        if (uRes.rows[0].id && !ids.includes(String(uRes.rows[0].id))) ids.push(String(uRes.rows[0].id));
        if (uRes.rows[0].uid && !ids.includes(String(uRes.rows[0].uid))) ids.push(String(uRes.rows[0].uid));
      }
    } catch {}
    return ids;
  };

  // 3c. GET /api/team-presets Service
  if (req.url === '/api/team-presets' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const userIds = await getUserIdentityIds(pool, authUser);
      const dbRes = await pool.query(
        'SELECT * FROM team_presets WHERE user_id = ANY($1::varchar[]) ORDER BY is_default DESC, created_at DESC',
        [userIds]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, presets: dbRes.rows }));
    } catch (err) {
      const ref = makeErrorRef();
      logErrorWithRef(ref, 'GET /api/team-presets', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: `Something went wrong. Please try again. (Ref: ${ref})` }));
    }
    return;
  }

  // 3d. POST /api/team-presets Service
  if (req.url === '/api/team-presets' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        const userIds = await getUserIdentityIds(pool, authUser);
        const userId = userIds[0];
        const data = JSON.parse(body);
        const parsed = validatePresetPayload(data);
        if (parsed.error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: parsed.error, message: parsed.message }));
          return;
        }
        const { presetName, game, teamName, captain, captainUid, players, substitutes, isDefault } = parsed.preset;

        // Limit check: max 4 presets
        const countRes = await pool.query('SELECT COUNT(*) FROM team_presets WHERE user_id = ANY($1::varchar[])', [userIds]);
        const currentCount = parseInt(countRes.rows[0].count, 10);
        if (currentCount >= 4) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'LIMIT_EXCEEDED', message: 'Maximum limit of 4 presets reached. Please delete an existing preset to save a new one.' }));
          return;
        }

        // Duplicate check: team_name (case-insensitive, per user + game)
        const dupRes = await pool.query(
          'SELECT * FROM team_presets WHERE user_id = ANY($1::varchar[]) AND game = $2::varchar AND LOWER(team_name) = LOWER($3::varchar)',
          [userIds, game, teamName]
        );
        if (dupRes.rows.length > 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'DUPLICATE_PRESET', message: 'A preset with this team name already exists for ' + game + '.' }));
          return;
        }

        // Only one default preset per game
        if (isDefault) {
          await pool.query('UPDATE team_presets SET is_default = false WHERE user_id = ANY($1::varchar[]) AND game = $2::varchar', [userIds, game]);
        }

        const presetId = 'PRST-' + Date.now().toString().slice(-6);
        const membersStr = JSON.stringify(players.map(p => p.ign).filter(Boolean));
        const playersStr = JSON.stringify(players);
        const subsStr = JSON.stringify(substitutes);

        const dbRes = await pool.query(
          `INSERT INTO team_presets (id, user_id, preset_name, game, team_name, captain, captain_uid, members, players, substitutes, is_default)
           VALUES ($1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::varchar, $6::varchar, $7::varchar, $8::text, $9::text, $10::text, $11::boolean) RETURNING *`,
          [presetId, userId, presetName, game, teamName, captain, captainUid || null, membersStr, playersStr, subsStr, isDefault]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, preset: dbRes.rows[0] }));
      } catch (err) {
        const ref = makeErrorRef();
        logErrorWithRef(ref, 'POST /api/team-presets', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: `Something went wrong. Please try again. (Ref: ${ref})` }));
      }
    });
    return;
  }

  // 3e. DELETE /api/team-presets/:id Service
  if (req.url.startsWith('/api/team-presets/') && req.method === 'DELETE') {
    const id = req.url.split('/api/team-presets/')[1];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const userIds = await getUserIdentityIds(pool, authUser);
      const existRes = await pool.query('SELECT * FROM team_presets WHERE id = $1::varchar', [id]);
      if (existRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Preset not found.' }));
        return;
      }
      if (!userIds.includes(String(existRes.rows[0].user_id))) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to delete this preset.' }));
        return;
      }
      await pool.query('DELETE FROM team_presets WHERE id = $1::varchar', [id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Preset deleted successfully.' }));
    } catch (err) {
      const ref = makeErrorRef();
      logErrorWithRef(ref, 'DELETE /api/team-presets/:id', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: `Something went wrong. Please try again. (Ref: ${ref})` }));
    }
    return;
  }

  // 3f. PUT /api/team-presets/:id Service
  if (req.url.startsWith('/api/team-presets/') && req.method === 'PUT') {
    const id = req.url.split('/api/team-presets/')[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        const userIds = await getUserIdentityIds(pool, authUser);
        const data = JSON.parse(body);
        const parsed = validatePresetPayload(data);
        if (parsed.error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: parsed.error, message: parsed.message }));
          return;
        }
        const { presetName, game, teamName, captain, captainUid, players, substitutes, isDefault } = parsed.preset;

        const existRes = await pool.query('SELECT * FROM team_presets WHERE id = $1::varchar', [id]);
        if (existRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Preset not found.' }));
          return;
        }
        if (!userIds.includes(String(existRes.rows[0].user_id))) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to modify this preset.' }));
          return;
        }

        // Duplicate check: team_name (case-insensitive, per user + game) excluding current preset
        const dupRes = await pool.query(
          'SELECT * FROM team_presets WHERE user_id = ANY($1::varchar[]) AND game = $2::varchar AND LOWER(team_name) = LOWER($3::varchar) AND id <> $4::varchar',
          [userIds, game, teamName, id]
        );
        if (dupRes.rows.length > 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'DUPLICATE_PRESET', message: 'A preset with this team name already exists for ' + game + '.' }));
          return;
        }

        // Only one default preset per game
        if (isDefault) {
          await pool.query('UPDATE team_presets SET is_default = false WHERE user_id = ANY($1::varchar[]) AND game = $2::varchar', [userIds, game]);
        }

        const membersStr = JSON.stringify(players.map(p => p.ign).filter(Boolean));
        const playersStr = JSON.stringify(players);
        const subsStr = JSON.stringify(substitutes);

        const dbRes = await pool.query(
          `UPDATE team_presets 
           SET preset_name = $1::varchar, game = $2::varchar, team_name = $3::varchar, captain = $4::varchar, captain_uid = $5::varchar, members = $6::text, players = $7::text, substitutes = $8::text, is_default = $9::boolean, updated_at = CURRENT_TIMESTAMP
           WHERE id = $10::varchar RETURNING *`,
          [presetName, game, teamName, captain, captainUid || null, membersStr, playersStr, subsStr, isDefault, id]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, preset: dbRes.rows[0] }));
      } catch (err) {
        const ref = makeErrorRef();
        logErrorWithRef(ref, 'PUT /api/team-presets/:id', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: `Something went wrong. Please try again. (Ref: ${ref})` }));
      }
    });
    return;
  }

  // 4. Supabase Organizer Application Submit Service
  if (req.url === '/api/org/apply' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }

        const appData = JSON.parse(body);
        let newApp = { ...appData };

        try {
          const checkApp = await pool.query('SELECT id FROM organizer_applications WHERE email = $1', [appData.email || authUser.email]);
          if (checkApp.rows.length > 0) {
            const existId = checkApp.rows[0].id;
            const dbRes = await pool.query(
              `UPDATE organizer_applications SET
                "applicantName" = $1, "orgName" = $2, phone = $3, "cityRegion" = $4, games = $5, experience = $6, "socialLinks" = $7, "discordLink" = $8, "additionalNotes" = $9, "kycDoc" = $10, portfolio = $11, "selectedPlan" = $12, status = $13, "orgImage" = $14, submitted_at = CURRENT_TIMESTAMP
               WHERE id = $15 RETURNING *`,
              [
                appData.applicantName || authUser.name || '',
                appData.orgName || '',
                appData.phone || '',
                appData.cityRegion || '',
                appData.games ? (typeof appData.games === 'string' ? appData.games : JSON.stringify(appData.games)) : '[]',
                appData.experience || '',
                appData.socialLinks || '',
                appData.discordLink || '',
                appData.additionalNotes || '',
                appData.kycDoc || 'Aadhaar / PAN ID Proof',
                appData.portfolio || '',
                appData.selectedPlan || 'Free',
                appData.status || 'pending',
                appData.orgImage || '',
                existId
              ]
            );
            newApp = dbRes.rows[0];
          } else {
            const dbRes = await pool.query(
              `INSERT INTO organizer_applications (id, "applicantName", "orgName", email, phone, "cityRegion", games, experience, "socialLinks", "discordLink", "additionalNotes", "kycDoc", portfolio, "selectedPlan", status, "orgImage") 
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
              [
                appData.id || `ORG-REQ-${Date.now().toString().slice(-3)}`,
                appData.applicantName || authUser.name || '',
                appData.orgName || '',
                appData.email || authUser.email,
                appData.phone || '',
                appData.cityRegion || '',
                appData.games ? (typeof appData.games === 'string' ? appData.games : JSON.stringify(appData.games)) : '[]',
                appData.experience || '',
                appData.socialLinks || '',
                appData.discordLink || '',
                appData.additionalNotes || '',
                appData.kycDoc || 'Aadhaar / PAN ID Proof',
                appData.portfolio || '',
                appData.selectedPlan || 'Free',
                appData.status || 'pending',
                appData.orgImage || ''
              ]
            );
            newApp = dbRes.rows[0];
          }

          await pool.query(`UPDATE users SET "orgApplicationStatus" = 'pending' WHERE id = $1 OR email = $2`, [authUser.id, authUser.email]);
          console.log(`\n📦 [MATCH DISTRICT DB] Organizer Application "${newApp.orgName}" saved in Supabase PostgreSQL.\n`);
        } catch (dbErr) {
          console.warn('⚠️ [MATCH DISTRICT DB] Supabase org apply failed:', dbErr.message);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, application: newApp }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 5. Supabase Get Organizer Applications Service
  if (req.url === '/api/org/applications' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      let query = 'SELECT * FROM organizer_applications';
      const params = [];
      if (!hasRole(authUser, ROLES.ADMIN)) {
        query += ' WHERE email = $1';
        params.push(authUser.email);
      }
      query += ' ORDER BY submitted_at DESC';

      const dbRes = await pool.query(query, params);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, applications: dbRes.rows }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Supabase fetch applications failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 6. Supabase Approve/Reject Organizer Application Service
  if (req.url === '/api/org/approve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only admins can approve organizer applications.' }));
          return;
        }

        const { id, status, email, adminNotes } = JSON.parse(body);
        let updatedApp = { id, status, email };

        try {
          const dbRes = await pool.query(`UPDATE organizer_applications SET status = $1, "adminNotes" = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *`, [status, adminNotes || '', id]);
          if (dbRes.rows.length > 0) { updatedApp = dbRes.rows[0]; }

          if (email && status === 'approved') {
            const newRole = 'organiser';
            const approvedTier = updatedApp.selectedPlan || 'Free';

            // Extract orgMotto from experience string
            let orgMotto = '';
            if (updatedApp.experience && updatedApp.experience.includes('Motto: ')) {
              const match = updatedApp.experience.match(/Motto:\s*(.*?)\s*\|/);
              if (match) orgMotto = match[1];
            }

            // Use the user's existing gamerTag as the orgHandle (handle-only unification)
            const gamerTagRes = await pool.query('SELECT "gamerTag" FROM users WHERE email = $1', [email]);
            const existingGamerTag = gamerTagRes.rows[0]?.gamerTag || '';
            const orgHandle = existingGamerTag || ('@' + (updatedApp.applicantName || 'organizer').split(' ')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase());

            // Use applicant real name as org name if orgName is empty
            const orgName = updatedApp.orgName || updatedApp.applicantName || 'Organizer';

            const newRoles = ['user', 'organiser'];
            const userRes = await pool.query(
              `UPDATE users SET 
                role = $1, 
                roles = $2,
                "orgApplicationStatus" = $3, 
                tier = $4, 
                "orgName" = $5, 
                "orgMotto" = $6,
                "orgImage" = $7,
                "orgHandle" = $8
               WHERE email = $9 RETURNING id`,
              [newRole, newRoles, status, approvedTier, orgName, orgMotto, updatedApp.orgImage, orgHandle, email]
            );

            if (userRes.rows.length > 0) {
              const organizerId = userRes.rows[0].id;
              // Create default subscription
              const planId = approvedTier === 'Free' ? 'plan_free' : (approvedTier === 'Basic' ? 'plan_basic' : 'plan_pro');
              await pool.query(
                `INSERT INTO subscriptions (id, organizer_id, plan_id, billing_status) VALUES ($1, $2, $3, 'active')
                 ON CONFLICT (organizer_id) DO UPDATE SET plan_id = EXCLUDED.plan_id`,
                [`SUB-${Date.now()}`, organizerId, planId]
              );
            }
          } else if (email && status === 'rejected') {
            await pool.query(`UPDATE users SET "orgApplicationStatus" = 'rejected' WHERE email = $1`, [email]);
          }
          console.log(`\n📦 [MATCH DISTRICT DB] Organizer Application "${id}" updated to "${status}".\n`);
        } catch (dbErr) {
          console.warn('⚠️ [MATCH DISTRICT DB] Supabase approve failed:', dbErr.message);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, application: updatedApp }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // [LEGACY REMOVED] plan_upgrade_requests endpoints consolidated into payment_verifications system

  // 6e. Get Org by custom dashboard slug
  const orgSlugMatch = req.url.match(/^\/api\/org\/by-slug\/([^/]+)$/);
  if (orgSlugMatch && req.method === 'GET') {
    try {
      const slug = decodeURIComponent(orgSlugMatch[1]);
      const dbRes = await pool.query(
        `SELECT u.id, u.name, u."orgName", u.tier, u.experience AS "bio", u."orgHandle", u.avatar, u.banner, u."orgImage", u."orgMotto", u.email, u.wallet_balance,
                u."customDashboardSlug", u.created_at, u."orgBanner", u."orgBio"
         FROM users u
         WHERE u."customDashboardSlug" = $1 AND ('organiser' = ANY(u.roles) OR 'admin' = ANY(u.roles))`,
        [slug]
      );
      if (dbRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Organization not found' }));
        return;
      }
      const org = dbRes.rows[0];
      const tourneyRes = await pool.query(
        `SELECT id, title, game, "startDate", status FROM tournaments WHERE "orgId" = $1 AND ("isDraft" = false OR "isDraft" IS NULL) ORDER BY created_at DESC LIMIT 6`,
        [org.id]
      );
      org.recent_tournaments = tourneyRes.rows || [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, org }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- Dedicated endpoint: Update Organization Profile (org-only fields) ---
  if (urlPath === '/api/organization/update' && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        if (!hasRole(authUser, ROLES.ORGANISER)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only organizers can update organization profiles.' }));
          return;
        }

        const updateData = JSON.parse(body);

        // 30 days cooldown verification for organization name change
        if (updateData.orgName !== undefined) {
          const userCheckRes = await pool.query('SELECT "orgName", "orgname_last_changed" FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
          const currentUserRecord = userCheckRes.rows[0];
          if (currentUserRecord && currentUserRecord.orgName && updateData.orgName !== currentUserRecord.orgName) {
            if (currentUserRecord.orgname_last_changed) {
              const lastChanged = new Date(currentUserRecord.orgname_last_changed);
              const daysDiff = (Date.now() - lastChanged.getTime()) / (1000 * 60 * 60 * 24);
              if (daysDiff < 30) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'COOLDOWN_ACTIVE', message: `You can only change your organization name once every 30 days. Remaining: ${Math.ceil(30 - daysDiff)} days.` }));
                return;
              }
            }
          }
        }

        let orgNameLastChangedVal = undefined;
        if (updateData.orgName !== undefined) {
          const userCheckRes = await pool.query('SELECT "orgName" FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
          if (userCheckRes.rows[0] && userCheckRes.rows[0].orgName !== updateData.orgName) {
            orgNameLastChangedVal = new Date();
          }
        }

        const orgImageUrl = sanitizeImageUrlForDb(updateData.orgImage);
        const orgBannerUrl = sanitizeImageUrlForDb(updateData.orgBanner);

        const dbRes = await pool.query(
          `UPDATE users SET
            "orgName" = COALESCE($1, "orgName"),
            "orgMotto" = COALESCE($2, "orgMotto"),
            "orgImage" = COALESCE($3, "orgImage"),
            "orgBanner" = COALESCE($4, "orgBanner"),
            "orgBio" = COALESCE($5, "orgBio"),
            "orgname_last_changed" = COALESCE($6, "orgname_last_changed")
           WHERE (id = $7 OR uid = $7) RETURNING *`,
          [
            updateData.orgName ?? null,
            updateData.orgMotto ?? null,
            orgImageUrl,
            orgBannerUrl,
            updateData.orgBio ?? null,
            orgNameLastChangedVal,
            authUser.id
          ]
        );
        if (dbRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'USER_NOT_FOUND', message: 'User profile not found.' }));
          return;
        }
        console.log(`\n📦 [MATCH DISTRICT DB] Organization profile for user "${authUser.id}" updated.\n`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, user: publicUserRow(dbRes.rows[0]) }));
      } catch (err) {
        console.warn('⚠️ [MATCH DISTRICT DB] Organization update failed:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7. JWT Token Verification Service
  if (req.url === '/api/auth/verify' && (req.method === 'POST' || req.method === 'GET')) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ valid: false, error: 'Missing or invalid Authorization header' }));
      return;
    }

    const token = authHeader.split(' ')[1];
    const result = verifyJwt(token);
    res.writeHead(result.valid ? 200 : 401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  // 7b. Supabase Get All Users Service (Admin-Only, Sanitized Projection)
  if (req.url === '/api/users' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only admins can view users list.' }));
        return;
      }

      const dbRes = await pool.query(`
        SELECT id, uid, name, "gamerTag", email, phone, role, roles, tier, status,
               avatar, banner, "orgName", "orgHandle", "orgApplicationStatus",
               wallet_balance, created_at, ${userDisplayNameSql('users', 'display_name')}
        FROM users
        ORDER BY created_at DESC
      `);
      const users = (dbRes.rows || []).map(u => {
        const safe = { ...u };
        delete safe.password;
        delete safe.admin_totp_secret;
        delete safe.admin_totp_activated;
        delete safe.kycDoc;
        safe.avatar = sanitizeImageUrlForDb(safe.avatar);
        safe.banner = sanitizeImageUrlForDb(safe.banner);
        return safe;
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, users }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Supabase fetch users failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Private recipient payout destination, owned by the authenticated user.
  if (urlPath === '/api/users/me/payout-profile' && (req.method === 'GET' || req.method === 'PUT')) {
    res.setHeader('Cache-Control', 'private, no-store');
    const authUser = getAuthUser(req);
    if (!authUser) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
    }
    if (req.method === 'GET') {
      try {
        const result = await pool.query('SELECT upi_id, updated_at FROM user_payout_profiles WHERE user_id = $1', [authUser.id]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, payout_profile: result.rows[0] || { upi_id: null } }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'INTERNAL_ERROR' }));
      }
    }
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const upiId = typeof payload.upi_id === 'string' ? payload.upi_id.trim() : '';
        if (!isValidUpiId(upiId)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_UPI_ID', message: 'Enter a valid UPI ID.' }));
          return;
        }
        const result = await pool.query(
          `INSERT INTO user_payout_profiles (user_id, upi_id, updated_at) VALUES ($1::text, $2::text, NOW())
           ON CONFLICT (user_id) DO UPDATE SET upi_id = EXCLUDED.upi_id, updated_at = NOW()
           RETURNING upi_id, updated_at`,
          [String(authUser.id), String(upiId)]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, payout_profile: result.rows[0] }));
      } catch (err) {
        const ref = makeErrorRef();
        logErrorWithRef(ref, 'POST /api/payments/payout-profile', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: `Could not save. Please try again. (Ref: ${ref})` }));
      }
    });
    return;
  }

  // Unified money movements (debited registration payments + credited prize payouts) and total earnings
  if (urlPath === '/api/users/me/payment-history' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'private, no-store');
    const authUser = getAuthUser(req);
    const authUserId = authUser?.id || authUser?.uid;
    if (!authUser || !authUserId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Please sign in to view payment history.' }));
    }

    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      const limit = Math.max(1, Math.min(100, parseInt(parsedUrl.searchParams.get('limit') || '20', 10) || 20));
      const offset = Math.max(0, parseInt(parsedUrl.searchParams.get('offset') || '0', 10) || 0);

      // Fetch total earnings: sum of all paid prize payments for this user
      const earningsRes = await pool.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total_earnings
         FROM tournament_prize_payments
         WHERE user_id = $1::varchar AND payment_status = 'paid'`,
        [authUserId]
      );
      const totalEarnings = Number(earningsRes.rows[0]?.total_earnings || 0);

      // Unified money movements (debited registration payments + credited prize payouts)
      // Fetch limit + 1 to determine has_more
      const fetchCount = limit + 1;
      const historyRes = await pool.query(
        `WITH user_movements AS (
           SELECT 
             ps.id AS id,
             'debit' AS kind,
             COALESCE(t.title, 'Tournament Registration') AS title,
             'Registration fee' AS label,
             ps.amount::numeric AS amount,
             CASE 
               WHEN lower(COALESCE(ps.payment_status, '')) IN ('verified', 'verified_by_host', 'approved')
                 OR lower(COALESCE(tr.status, '')) = 'approved' THEN 'approved'
               WHEN lower(COALESCE(ps.payment_status, '')) = 'rejected'
                 OR lower(COALESCE(tr.status, '')) = 'rejected' THEN 'rejected'
               ELSE 'pending_verification'
             END AS status,
             ps.created_at AS created_at,
             ps.tournament_id AS tournament_id
           FROM payment_submissions ps
           LEFT JOIN tournament_registrations tr ON tr.id = ps.registration_id
           LEFT JOIN tournaments t ON t.id = ps.tournament_id
           WHERE ps.user_id = $1::varchar

           UNION ALL

           SELECT
             COALESCE(p.id, a.id) AS id,
             'credit' AS kind,
             COALESCE(t.title, 'Tournament Prize') AS title,
             'Prize payout' AS label,
             COALESCE(p.amount, a.prize_amount)::numeric AS amount,
             CASE
               WHEN lower(COALESCE(p.payment_status, '')) = 'paid' OR lower(COALESCE(a.status, '')) = 'paid' THEN 'paid'
               WHEN lower(COALESCE(a.status, '')) IN ('processing', 'in_payout') THEN 'processing'
               ELSE 'pending'
             END AS status,
             COALESCE(p.paid_at, p.created_at, a.created_at) AS created_at,
             COALESCE(p.tournament_id, a.tournament_id) AS tournament_id
           FROM tournament_prize_awards a
           LEFT JOIN tournament_prize_payments p ON p.prize_award_id = a.id
           LEFT JOIN tournaments t ON t.id = a.tournament_id
           WHERE a.recipient_user_id = $1::varchar OR p.user_id = $1::varchar
         )
         SELECT id, kind, title, label, amount, status, created_at, tournament_id
         FROM user_movements
         ORDER BY created_at DESC
         LIMIT $2::integer OFFSET $3::integer`,
        [authUserId, fetchCount, offset]
      );

      const hasMore = historyRes.rows.length > limit;
      const rawRows = hasMore ? historyRes.rows.slice(0, limit) : historyRes.rows;

      const transactions = rawRows.map(row => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        label: row.label,
        amount: Number(row.amount) || 0,
        status: row.status,
        created_at: row.created_at,
        tournament_id: row.tournament_id
      }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        transactions,
        total_earnings: totalEarnings,
        has_more: hasMore,
        // Legacy compatibility for any caller reading payments
        payments: transactions.filter(t => t.kind === 'credit')
      }));
    } catch (err) {
      const ref = makeErrorRef();
      logErrorWithRef(ref, 'GET /api/users/me/payment-history', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: false,
        error: 'SERVER_ERROR',
        message: `Could not load payment history. Please try again. (Ref: ${ref})`
      }));
    }
  }

  // 7b-1. Supabase Get Public Organisers Service
  if (req.url === '/api/organisers' && req.method === 'GET') {
    try {
      const dbRes = await pool.query(`
        SELECT 
          u.id, u.name, u.email, u.avatar, u.banner, u.tier, u.experience, u."socialLinks", u.status, u.phone, u."orgApplicationStatus",
          u."orgName", u."orgHandle", u."orgImage", u."orgMotto",
          (SELECT COUNT(*) FROM tournaments t WHERE t."orgId" = u.id AND t."isDraft" = false) AS "tournamentsHosted"
        FROM users u
        WHERE 'organiser' = ANY(u.roles)
        ORDER BY u.created_at DESC
      `);

      const organisers = dbRes.rows.map(row => {
        // Deterministic hash based on ID
        let hash = 0;
        const idStr = row.id || '';
        for (let i = 0; i < idStr.length; i++) {
          hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
        }
        hash = Math.abs(hash);

        const rating = (4.3 + (hash % 7) * 0.1).toFixed(1);
        const followers = (hash % 120) * 500 + 1000;
        const disputes = hash % 3;

        return {
          id: row.id,
          name: row.name || 'Organiser',
          orgName: row.orgName || row.name || 'Organiser',
          orgHandle: row.orgHandle || `@${(row.name || 'org').toLowerCase().replace(/\s+/g, '')}`,
          orgImage: row.orgImage || row.avatar,
          orgMotto: row.orgMotto || '',
          email: maskUserEmail(row.email),
          phone: undefined,
          avatar: row.avatar,
          banner: row.banner,
          tier: row.tier || 'Free',
          experience: row.experience,
          socialLinks: row.socialLinks,
          status: row.status,
          orgApplicationStatus: row.orgApplicationStatus,
          tournamentsHosted: parseInt(row.tournamentsHosted) || 0,
          rating,
          followers,
          disputes,
          kycVerified: row.orgApplicationStatus === 'approved',
          games: ['VALORANT', 'BGMI'] // Default popular games
        };
      });

      await attachResolvedAvatars(pool, organisers);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, users: organisers }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Supabase fetch organisers failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7b-1-1. Toggle Organizer Follow status
  const followMatch = req.url.match(/^\/api\/organisers\/([^/]+)\/follow$/);
  if (followMatch && req.method === 'POST') {
    try {
      const organiserId = decodeURIComponent(followMatch[1]);
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be logged in to follow organizers.' }));
        return;
      }

      const existRes = await pool.query('SELECT * FROM organiser_followers WHERE user_id = $1 AND organiser_id = $2', [authUser.id, organiserId]);
      if (existRes.rows.length > 0) {
        await pool.query('DELETE FROM organiser_followers WHERE user_id = $1 AND organiser_id = $2', [authUser.id, organiserId]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, followed: false, message: 'Unfollowed organizer successfully.' }));
      } else {
        const followId = 'FOL-' + crypto.randomBytes(8).toString('hex');
        await pool.query('INSERT INTO organiser_followers (id, user_id, organiser_id) VALUES ($1, $2, $3)', [followId, authUser.id, organiserId]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, followed: true, message: 'Followed organizer successfully.' }));
      }
    } catch (err) {
      console.warn('⚠️ [FOLLOW SERVICE] Toggle follow failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7b-1-2. Get Organizer Follow status for logged in user
  const followStatusMatch = req.url.match(/^\/api\/organisers\/([^/]+)\/follow-status$/);
  if (followStatusMatch && req.method === 'GET') {
    try {
      const organiserId = decodeURIComponent(followStatusMatch[1]);
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, followed: false }));
        return;
      }

      const existRes = await pool.query('SELECT * FROM organiser_followers WHERE user_id = $1 AND organiser_id = $2', [authUser.id, organiserId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, followed: existRes.rows.length > 0 }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7b-1-3. Fetch user notifications/alerts (strictly <24 hours old)
  if ((req.url === '/api/alerts' || urlPath === '/api/alerts' || req.url === '/api/notifications' || urlPath === '/api/notifications') && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const dbRes = await pool.query(
        `SELECT id, user_id, COALESCE(type, 'info') AS type, title, message, tournament_id, COALESCE(is_read, false) AS is_read, created_at
         FROM alerts
         WHERE user_id = $1::text AND created_at > NOW() - INTERVAL '24 hours'
         ORDER BY created_at DESC LIMIT 50`,
        [String(authUser.id)]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, alerts: dbRes.rows, notifications: dbRes.rows }));
    } catch (err) {
      const ref = makeErrorRef();
      logErrorWithRef(ref, 'GET /api/alerts', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: `Could not load notifications. Please try again. (Ref: ${ref})` }));
    }
    return;
  }

  // 7b-1-4. Mark all notifications/alerts as read (only unexpired rows)
  if ((req.url === '/api/alerts/read' || urlPath === '/api/alerts/read' || req.url === '/api/notifications/read' || urlPath === '/api/notifications/read') && req.method === 'POST') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      await pool.query(
        `UPDATE alerts SET is_read = true WHERE user_id = $1::text AND created_at > NOW() - INTERVAL '24 hours'`,
        [String(authUser.id)]
      );
      await pool.query(
        `UPDATE notifications SET is_read = true WHERE user_id = $1::text AND created_at > NOW() - INTERVAL '24 hours'`,
        [String(authUser.id)]
      ).catch(() => {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'All alerts marked as read.' }));
    } catch (err) {
      const ref = makeErrorRef();
      logErrorWithRef(ref, 'POST /api/alerts/read', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: `Could not mark notifications as read. (Ref: ${ref})` }));
    }
    return;
  }

  // Deprecated username availability endpoint. District ID is the only public handle.
  if ((urlPath === '/api/users/check-username' || req.url.startsWith('/api/users/check-username')) && req.method === 'GET') {
    res.writeHead(410, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'GONE', message: 'Username handles are no longer supported. Use your District ID.' }));
    return;
  }
  if ((urlPath.startsWith('/api/users/') || urlPath === '/api/users/me') && req.method === 'GET') {
    const parts = urlPath.split('/');
    if (parts.length === 4 || urlPath === '/api/users/me') {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
          return;
        }

        const userId = (urlPath === '/api/users/me' || parts[3] === 'me') ? authUser.id : parts[3];
        const dbRes = await pool.query('SELECT * FROM users WHERE id = $1 OR uid = $1', [userId]);
        if (dbRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'User not found.' }));
          return;
        }
        let user = dbRes.rows[0];
        const isOwner = authUser.id === user.id || authUser.id === user.uid;
        const isAdmin = hasRole(authUser, ROLES.ADMIN);

        if (!isOwner && !isAdmin) {
          // Public allow-list: other users only see public identity (never Discord fields)
          const publicUser = {
            id: user.id,
            display_name: formatUserDisplayName(user),
            district_id: user.district_id,
            avatar: sanitizeImageUrlForDb(user.avatar),
            banner: sanitizeImageUrlForDb(user.banner),
            tier: user.tier || 'Amateur',
            status: user.status || 'Active',
            role: user.role || 'player',
            orgName: user.orgName || '',
            orgHandle: user.orgHandle || '',
            orgImage: sanitizeImageUrlForDb(user.orgImage),
            orgMotto: user.orgMotto || '',
            orgBio: user.orgBio || '',
            experience: user.experience || '',
            socialLinks: user.socialLinks || null,
          };
          await attachResolvedAvatars(pool, [publicUser]);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, user: publicUser }));
          return;
        }

        // Owner or Admin: full profile minus secrets + discord connection info
        const discordConn = await getDiscordConnectionForUser(pool, user.id, user.discord_id);
        const safeUser = { ...user };
        delete safeUser.password;
        delete safeUser.admin_totp_secret;
        delete safeUser.admin_totp_activated;
        delete safeUser.kycDoc;
        delete safeUser.google_id;
        delete safeUser.discord_id;
        safeUser.display_name = formatUserDisplayName(safeUser);
        safeUser.banner = sanitizeImageUrlForDb(safeUser.banner);
        safeUser.orgImage = sanitizeImageUrlForDb(safeUser.orgImage);
        safeUser.orgBanner = sanitizeImageUrlForDb(safeUser.orgBanner);
        safeUser.discord = discordConn;
        await attachResolvedAvatars(pool, [safeUser]);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, user: safeUser }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }
  }

  if (urlPath.startsWith('/api/users/') && req.method === 'DELETE') {
    const id = urlPath.split('/api/users/')[1];
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only admins can delete users.' }));
        return;
      }

      // 1. Get the user's details first (especially email and uid) to purge from other schemas
      const userRes = await pool.query('SELECT email, uid FROM users WHERE id = $1', [id]);
      const userEmail = userRes.rows[0]?.email;
      const userUid = userRes.rows[0]?.uid;

      // 2. Delete from auth.users (Supabase Auth)
      if (userUid) {
        await pool.query('DELETE FROM auth.users WHERE id = $1', [userUid]);
      }
      if (userEmail) {
        await pool.query('DELETE FROM auth.users WHERE email = $1', [userEmail]);
        await pool.query('DELETE FROM organizer_applications WHERE email = $1', [userEmail]);
        await pool.query('DELETE FROM otps WHERE email = $1', [userEmail]);
        await pool.query('DELETE FROM password_resets WHERE email = $1', [userEmail]);
        await pool.query('DELETE FROM temp_users WHERE email = $1', [userEmail]);
      }

      // 3. Delete subscriptions & upgrade requests
      await pool.query('DELETE FROM subscriptions WHERE organizer_id = $1', [id]);
      await pool.query('DELETE FROM plan_upgrade_requests WHERE organizer_id = $1', [id]);

      // 4. Delete followers / following
      await pool.query('DELETE FROM organiser_followers WHERE user_id = $1 OR organiser_id = $1', [id]);

      // 5. Delete alerts / notifications
      await pool.query('DELETE FROM alerts WHERE user_id = $1', [id]);

      // 6. Delete wallet transactions
      await pool.query('DELETE FROM wallet_transactions WHERE user_id = $1', [id]);

      // 7. Delete team presets
      await pool.query('DELETE FROM team_presets WHERE user_id = $1', [id]);

      // Cleanup subscription system tables
      await pool.query('DELETE FROM staff_members WHERE organizer_id = $1', [id]);
      await pool.query('DELETE FROM api_keys WHERE organizer_id = $1', [id]);
      await pool.query('DELETE FROM custom_subdomains WHERE organizer_id = $1', [id]);
      await pool.query('DELETE FROM white_label_settings WHERE organizer_id = $1', [id]);
      await pool.query('DELETE FROM automation_rules WHERE organizer_id = $1', [id]);
      await pool.query('DELETE FROM analytics_events WHERE organizer_id = $1', [id]);
      await pool.query('DELETE FROM billing_history WHERE organizer_id = $1', [id]);

      // 8. Delete user registrations from ALL tournaments
      await pool.query('DELETE FROM tournament_registrations WHERE user_id = $1', [id]);

      // 9. First delete all tournament registrations, notices, messages of tournaments hosted by this organizer
      await pool.query('DELETE FROM tournament_registrations WHERE tournament_id IN (SELECT id FROM tournaments WHERE "orgId" = $1)', [id]);
      await pool.query('DELETE FROM tournament_notices WHERE tournament_id IN (SELECT id FROM tournaments WHERE "orgId" = $1)', [id]);
      await pool.query('DELETE FROM tournament_messages WHERE tournament_id IN (SELECT id FROM tournaments WHERE "orgId" = $1)', [id]);

      // 10. Delete all tournaments hosted by this organizer
      await pool.query('DELETE FROM tournaments WHERE "orgId" = $1', [id]);

      // 11. Delete primary user record from public.users table
      await pool.query('DELETE FROM users WHERE id = $1', [id]);

      console.log(`\n📦 [MATCH DISTRICT DB] User "${id}" and all associated data completely purged from database.\n`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: `User ${id} and all associated data purged successfully.` }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Supabase delete user failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (urlPath.startsWith('/api/users/') && req.method === 'PUT') {
    const id = urlPath.split('/api/users/')[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to update your profile.' }));
          return;
        }

        const authUserId = authUser.id || authUser.uid;
        // Fetch authenticated user's database record to verify permissions
        const authUserRes = await pool.query('SELECT id, uid, role FROM users WHERE id = $1::text OR uid = $1::text', [String(authUserId)]);
        if (authUserRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'USER_NOT_FOUND', message: 'Authenticated user profile not found.' }));
          return;
        }
        const authUserRecord = authUserRes.rows[0];

        const targetId = (id === 'me' || !id) ? authUserRecord.id : id;

        if (!hasRole(authUserRecord, ROLES.ADMIN) && authUserRecord.id !== targetId && authUserRecord.uid !== targetId) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to modify this user profile.' }));
          return;
        }

        const updateData = JSON.parse(body);

        // Dynamic SET builder: setClauses and values are built from the exact same list so they never drift apart.
        const setClauses = [];
        const values = [];

        function addField(columnSql, val, castType) {
          values.push(val);
          setClauses.push(`${columnSql} = $${values.length}::${castType}`);
        }

        // 1. Phone / WhatsApp (must be 10-digit Indian mobile starting with 6-9)
        if (updateData.phone !== undefined) {
          if (updateData.phone === '' || updateData.phone === null) {
            addField('phone', null, 'text');
          } else {
            const digits = normalizeIndianMobile(updateData.phone);
            if (!digits) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'INVALID_PHONE',
                message: 'Enter a valid 10-digit Indian mobile number (e.g. 9876543210).'
              }));
              return;
            }
            addField('phone', `+91 ${digits}`, 'text');
          }
        }

        // 2. Name
        if (updateData.name !== undefined) {
          addField('name', updateData.name != null ? String(updateData.name).trim() : null, 'text');
        }

        // 3. Email & email_last_changed (Admin only; non-admin requests ignore these fields)
        if (updateData.email !== undefined && hasRole(authUserRecord, ROLES.ADMIN)) {
          const newEmail = updateData.email != null ? String(updateData.email).trim().toLowerCase() : null;
          addField('email', newEmail, 'text');

          const userCheckRes = await pool.query('SELECT email FROM users WHERE id = $1::text OR uid = $1::text', [String(targetId)]);
          if (userCheckRes.rows[0] && newEmail && userCheckRes.rows[0].email && userCheckRes.rows[0].email.trim().toLowerCase() !== newEmail) {
            addField('"email_last_changed"', new Date(), 'timestamptz');
          }
        }

        // 4. Avatar
        if (updateData.avatar !== undefined) {
          const avatarUrl = sanitizeImageUrlForDb(updateData.avatar);
          addField('avatar', avatarUrl || null, 'text');
        }

        // 5. Banner
        if (updateData.banner !== undefined) {
          const bannerUrl = sanitizeImageUrlForDb(updateData.banner);
          addField('banner', bannerUrl || null, 'text');
        }

        // 6. Experience / Bio
        if (updateData.experience !== undefined || updateData.bio !== undefined) {
          const expVal = updateData.experience !== undefined ? updateData.experience : updateData.bio;
          addField('experience', expVal != null ? String(expVal) : null, 'text');
        }

        // 7. Social Links (stored as TEXT in users table)
        if (updateData.socialLinks !== undefined) {
          let slVal = null;
          if (updateData.socialLinks != null) {
            slVal = typeof updateData.socialLinks === 'string'
              ? updateData.socialLinks
              : JSON.stringify(updateData.socialLinks);
          }
          addField('"socialLinks"', slVal, 'text');
        }

        // 8. Riot ID
        if (updateData.riotId !== undefined) {
          addField('"riotId"', updateData.riotId != null ? String(updateData.riotId) : null, 'text');
        }

        // 9. BGMI ID
        if (updateData.bgmiId !== undefined) {
          addField('"bgmiId"', updateData.bgmiId != null ? String(updateData.bgmiId) : null, 'text');
        }

        // 10. Steam ID
        if (updateData.steamId !== undefined) {
          addField('"steamId"', updateData.steamId != null ? String(updateData.steamId) : null, 'text');
        }

        // 11. Discord Tag
        if (updateData.discordTag !== undefined) {
          addField('"discordTag"', updateData.discordTag != null ? String(updateData.discordTag) : null, 'text');
        }

        // 12. Org Handle
        if (updateData.orgHandle !== undefined) {
          addField('"orgHandle"', updateData.orgHandle != null ? String(updateData.orgHandle) : null, 'text');
        }

        // 13. Tier (Admin only)
        if (updateData.tier !== undefined && hasRole(authUserRecord, ROLES.ADMIN)) {
          addField('tier', updateData.tier != null ? String(updateData.tier) : null, 'text');
        }

        // 14. Status (Admin only)
        if (updateData.status !== undefined && hasRole(authUserRecord, ROLES.ADMIN)) {
          addField('status', updateData.status != null ? String(updateData.status) : null, 'text');
        }

        // 15. Role & Roles (Admin only)
        if (hasRole(authUserRecord, ROLES.ADMIN)) {
          if (updateData.role !== undefined) {
            const roleVal = updateData.role != null ? String(updateData.role) : null;
            addField('role', roleVal, 'varchar');
            const rolesArr = roleVal === 'player' || roleVal === 'user' ? ['user'] :
              roleVal === 'organiser' ? ['user', 'organiser'] :
              roleVal === 'reg_payment_verifier' ? ['user', 'reg_payment_verifier'] :
              roleVal === 'admin' ? ['user', 'admin'] : ['user'];
            addField('roles', rolesArr, 'text[]');
          } else if (updateData.roles !== undefined) {
            addField('roles', Array.isArray(updateData.roles) ? updateData.roles : null, 'text[]');
          }
        }

        let updatedRow;
        if (setClauses.length === 0) {
          const currentRes = await pool.query(
            'SELECT * FROM users WHERE id = $1::text OR uid = $1::text',
            [String(targetId)]
          );
          if (currentRes.rows.length === 0) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'USER_NOT_FOUND', message: 'User profile not found.' }));
            return;
          }
          updatedRow = currentRes.rows[0];
        } else {
          values.push(String(targetId));
          const targetParamIndex = values.length;
          const queryText = `UPDATE users SET ${setClauses.join(', ')} WHERE (id = $${targetParamIndex}::text OR uid = $${targetParamIndex}::text) RETURNING *`;
          const dbRes = await pool.query(queryText, values);
          if (dbRes.rows.length === 0) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'USER_NOT_FOUND', message: 'User profile to update not found.' }));
            return;
          }
          console.log(`\n📦 [MATCH DISTRICT DB] User "${targetId}" updated in Supabase PostgreSQL.\n`);
          updatedRow = dbRes.rows[0];
        }

        const updatedUser = publicUserRow(updatedRow);
        await attachResolvedAvatars(pool, [updatedUser]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, user: updatedUser }));
      } catch (err) {
        const ref = makeErrorRef();
        logErrorWithRef(ref, 'PUT /api/users/:id', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: `Could not save. Please try again. (Ref: ${ref})` }));
      }
    });
    return;
  }

  // ─────────────────────────────────────────────────────────────
  // 7d-bot. MatchDistrict Official Discord Bot API Endpoints
  // Authenticated via MATCHDISTRICT_BOT_SECRET or Admin Session
  // ─────────────────────────────────────────────────────────────
  function verifyBotAuth(req) {
    const secret = process.env.MATCHDISTRICT_BOT_SECRET || process.env.BOT_API_SECRET;
    if (secret && typeof secret === 'string' && secret.trim().length > 0) {
      let incoming = req.headers['x-bot-secret'] || req.headers['x-bot-token'];
      if (!incoming && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        incoming = req.headers.authorization.slice(7).trim();
      }
      if (incoming && typeof incoming === 'string') {
        const bufIncoming = Buffer.from(incoming.trim());
        const bufSecret = Buffer.from(secret.trim());
        if (bufIncoming.length === bufSecret.length && crypto.timingSafeEqual(bufIncoming, bufSecret)) {
          return true;
        }
      }
    }

    // Also allow requests authenticated with an admin user session
    const authUser = getAuthUser(req);
    if (authUser && (authUser.role === 'admin' || (Array.isArray(authUser.roles) && authUser.roles.includes('admin')))) {
      return true;
    }

    return false;
  }

  // GET /api/bot/tournaments (List tournaments for Discord Bot)
  if (urlPath === '/api/bot/tournaments' && req.method === 'GET') {
    if (!verifyBotAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Missing or invalid bot authentication secret.' }));
      return;
    }

    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      const statusParam = (parsedUrl.searchParams.get('status') || 'published').toLowerCase().trim();
      const includeAll = statusParam === 'all';

      let query = `
        SELECT t.id, t.title, t.game, t.status, t."isDraft", t."slotsTotal", t."slotsFilled",
               t."registrationOpenDate", t."registrationCloseDate", t."startDate", t.created_at,
               (SELECT COUNT(*) FROM tournament_registrations tr
                WHERE tr.tournament_id = t.id
                  AND (tr.status IS NULL OR NOT (LOWER(tr.status) = ANY($1)))) AS registered_teams_count
        FROM tournaments t
      `;
      const EXCLUDED_REG_STATUSES = ['rejected', 'cancelled', 'expired', 'payment_rejected', 'PAYMENT_REJECTED'];
      const params = [EXCLUDED_REG_STATUSES];

      if (!includeAll) {
        query += ` WHERE (t."isDraft" = false OR t."isDraft" IS NULL) AND LOWER(COALESCE(t.status, '')) NOT IN ('archived', 'completed')`;
      }

      query += ` ORDER BY t.created_at DESC`;

      const dbRes = await pool.query(query, params);
      const now = new Date();

      const tournaments = (dbRes.rows || []).map((t) => {
        const slotsTotal = parseInt(t.slotsTotal, 10) || 100;
        const slotsFilled = parseInt(t.slotsFilled, 10) || 0;
        const regCount = parseInt(t.registered_teams_count, 10) || slotsFilled;

        // Compute registration status
        let regStatus = 'open';
        const regOpen = t.registrationOpenDate ? new Date(t.registrationOpenDate) : null;
        const regClose = t.registrationCloseDate ? new Date(t.registrationCloseDate) : null;

        if (slotsFilled >= slotsTotal && slotsTotal > 0) {
          regStatus = 'full';
        } else if (regOpen && now < regOpen) {
          regStatus = 'upcoming';
        } else if (regClose && now > regClose) {
          regStatus = 'closed';
        }

        const isDraft = Boolean(t.isDraft);
        const pubStatus = isDraft ? 'draft' : (t.status || 'published');

        return {
          id: t.id,
          title: t.title || 'Untitled Tournament',
          game: t.game || 'Esports',
          status: pubStatus,
          is_draft: isDraft,
          registration_status: regStatus,
          slots_total: slotsTotal,
          slots_filled: slotsFilled,
          registered_teams_count: regCount,
          start_date: t.startDate || null,
          created_at: t.created_at,
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: tournaments.length, tournaments }));
    } catch (err) {
      console.warn('⚠️ [BOT API] Failed to fetch tournaments:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: err.message }));
    }
    return;
  }

  // GET /api/bot/tournaments/:id/registrations (Fetch registered teams & Discord links for Discord Bot)
  const botRegMatch = urlPath.match(/^\/api\/bot\/tournaments\/([^/]+)\/registrations$/);
  if (botRegMatch && req.method === 'GET') {
    if (!verifyBotAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Missing or invalid bot authentication secret.' }));
      return;
    }

    const tId = decodeURIComponent(botRegMatch[1]);
    try {
      // 1. Fetch tournament
      const tRes = await pool.query(
        'SELECT id, title, game, status, "isDraft", "slotsTotal", "slotsFilled" FROM tournaments WHERE id = $1',
        [tId]
      );
      if (tRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      const tournament = tRes.rows[0];

      // 2. Fetch registrations
      const regRes = await pool.query(
        `SELECT id, tournament_id, user_id, team_name, captain, captain_uid, members, status, slot_number, created_at
         FROM tournament_registrations
         WHERE tournament_id = $1
         ORDER BY created_at ASC`,
        [tId]
      );

      // 3. Fetch bridged tournament teams & active members
      const teamsRes = await pool.query(
        `SELECT t.id AS team_id, t.team_name, t.leader_user_id, t.status AS team_status, t.registration_id,
                m.user_id AS member_user_id, m.role AS member_role, m.status AS member_status
         FROM tournament_teams t
         LEFT JOIN tournament_team_members m ON m.tournament_team_id = t.id AND m.status = 'active'
         WHERE t.tournament_id = $1`,
        [tId]
      );

      const teamsByRegId = new Map();
      const teamsByName = new Map();
      for (const row of teamsRes.rows) {
        const key = row.registration_id || row.team_id;
        if (!teamsByRegId.has(key)) {
          teamsByRegId.set(key, {
            id: row.team_id,
            team_name: row.team_name,
            leader_user_id: row.leader_user_id,
            status: row.team_status,
            members: [],
          });
        }
        if (row.member_user_id) {
          teamsByRegId.get(key).members.push({
            user_id: row.member_user_id,
            role: row.member_role,
            status: row.member_status,
          });
        }
        if (row.team_name) {
          teamsByName.set(row.team_name.toLowerCase().trim(), teamsByRegId.get(key));
        }
      }

      // Collect user IDs
      const userIds = new Set();
      for (const reg of regRes.rows) {
        if (reg.user_id) userIds.add(String(reg.user_id));
        if (reg.captain_uid) userIds.add(String(reg.captain_uid));
        const parsed = parseRosterMembers(reg.members);
        for (const m of parsed) {
          if (m.uid) userIds.add(String(m.uid));
        }
      }
      for (const row of teamsRes.rows) {
        if (row.leader_user_id) userIds.add(String(row.leader_user_id));
        if (row.member_user_id) userIds.add(String(row.member_user_id));
      }

      // Query discord accounts
      const discordMap = new Map();
      if (userIds.size > 0) {
        const discordRes = await pool.query(
          `SELECT u.id AS user_id,
                  COALESCE(udc.discord_id, u.discord_id, u.discord_user_id) AS discord_id,
                  COALESCE(udc.username, u.discord_username) AS discord_username
           FROM users u
           LEFT JOIN user_discord_connections udc ON udc.user_id = u.id
           WHERE u.id = ANY($1)`,
          [Array.from(userIds)]
        );
        for (const d of discordRes.rows) {
          const rawId = (d.discord_id || '').trim();
          const isValidSnowflake = /^\d{17,20}$/.test(rawId);
          discordMap.set(String(d.user_id), {
            discord_id: isValidSnowflake ? rawId : null,
            discord_username: isValidSnowflake ? (d.discord_username || null) : null,
            is_linked: isValidSnowflake,
          });
        }
      }

      const EXCLUDED_STATUSES = ['rejected', 'cancelled', 'expired', 'payment_rejected', 'PAYMENT_REJECTED'];
      const ELIGIBLE_STATUSES = ['approved', 'confirmed', 'verified_by_host', 'VERIFIED_BY_HOST', 'verified'];

      const teams = [];
      const seenDiscordIds = new Map();
      let totalRegisteredTeams = 0;
      let eligibleTeamsCount = 0;
      let ineligibleTeamsCount = 0;
      let eligibleLinkedMembersCount = 0;
      let unlinkedMembersCount = 0;
      let duplicateDiscordCount = 0;

      for (const reg of regRes.rows) {
        totalRegisteredTeams++;
        const rawStatus = (reg.status || 'pending').toLowerCase().trim();
        const bridgedTeam = teamsByRegId.get(reg.id) || teamsByName.get((reg.team_name || '').toLowerCase().trim());

        const isExcluded = EXCLUDED_STATUSES.includes(rawStatus) || (bridgedTeam && bridgedTeam.status === 'disqualified');
        const isEligible = !isExcluded && (ELIGIBLE_STATUSES.includes(rawStatus) || isEligibleRegistrationStatus(reg.status));

        if (isEligible) {
          eligibleTeamsCount++;
        } else {
          ineligibleTeamsCount++;
        }

        const teamMembers = [];
        const seenUserIdsInTeam = new Set();

        // Leader
        const leaderUserId = reg.user_id || reg.captain_uid || bridgedTeam?.leader_user_id || null;
        if (leaderUserId) {
          seenUserIdsInTeam.add(String(leaderUserId));
          const conn = discordMap.get(String(leaderUserId));
          const isLinked = Boolean(conn?.is_linked);
          const discordId = isLinked ? conn.discord_id : null;

          if (isEligible) {
            if (isLinked) {
              eligibleLinkedMembersCount++;
              if (seenDiscordIds.has(discordId)) {
                duplicateDiscordCount++;
              } else {
                seenDiscordIds.set(discordId, reg.team_name);
              }
            } else {
              unlinkedMembersCount++;
            }
          }

          teamMembers.push({
            user_id: leaderUserId,
            name: (reg.captain || 'Team Leader').trim(),
            role: 'leader',
            discord_id: discordId,
            discord_username: isLinked ? conn.discord_username : null,
            is_linked: isLinked,
          });
        }

        // Bridged members
        if (bridgedTeam && Array.isArray(bridgedTeam.members)) {
          for (const m of bridgedTeam.members) {
            const mUid = String(m.user_id);
            if (seenUserIdsInTeam.has(mUid)) continue;
            seenUserIdsInTeam.add(mUid);

            const conn = discordMap.get(mUid);
            const isLinked = Boolean(conn?.is_linked);
            const discordId = isLinked ? conn.discord_id : null;

            if (isEligible) {
              if (isLinked) {
                eligibleLinkedMembersCount++;
                if (seenDiscordIds.has(discordId)) {
                  duplicateDiscordCount++;
                } else {
                  seenDiscordIds.set(discordId, reg.team_name);
                }
              } else {
                unlinkedMembersCount++;
              }
            }

            teamMembers.push({
              user_id: mUid,
              name: 'Member',
              role: m.role || 'member',
              discord_id: discordId,
              discord_username: isLinked ? conn.discord_username : null,
              is_linked: isLinked,
            });
          }
        } else {
          // Roster members fallback
          const roster = parseRosterMembers(reg.members);
          for (const rm of roster) {
            if (rm.uid && !seenUserIdsInTeam.has(String(rm.uid))) {
              const mUid = String(rm.uid);
              seenUserIdsInTeam.add(mUid);
              const conn = discordMap.get(mUid);
              const isLinked = Boolean(conn?.is_linked);
              const discordId = isLinked ? conn.discord_id : null;

              if (isEligible) {
                if (isLinked) {
                  eligibleLinkedMembersCount++;
                  if (seenDiscordIds.has(discordId)) {
                    duplicateDiscordCount++;
                  } else {
                    seenDiscordIds.set(discordId, reg.team_name);
                  }
                } else {
                  unlinkedMembersCount++;
                }
              }

              teamMembers.push({
                user_id: mUid,
                name: rm.ign || 'Member',
                role: 'member',
                discord_id: discordId,
                discord_username: isLinked ? conn.discord_username : null,
                is_linked: isLinked,
              });
            } else if (!rm.uid) {
              if (isEligible) unlinkedMembersCount++;
              teamMembers.push({
                user_id: null,
                name: rm.ign || 'Member',
                role: 'member',
                discord_id: null,
                discord_username: null,
                is_linked: false,
              });
            }
          }
        }

        const teamLinkedMembers = teamMembers.filter((m) => m.is_linked && m.discord_id);
        const teamUnlinkedCount = teamMembers.filter((m) => !m.is_linked).length;

        teams.push({
          id: bridgedTeam?.id || reg.id,
          registration_id: reg.id,
          team_name: reg.team_name,
          captain: reg.captain,
          status: reg.status,
          is_eligible: isEligible,
          leader: teamMembers.find((m) => m.role === 'leader') || null,
          members: teamMembers,
          linked_members: teamLinkedMembers,
          unlinked_count: teamUnlinkedCount,
        });
      }

      const websiteBaseUrl = (process.env.MATCHDISTRICT_WEBSITE_URL || process.env.VITE_API_URL || 'https://matchdistrict.in').replace(/\/+$/, '');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        tournament: {
          id: tournament.id,
          title: tournament.title,
          game: tournament.game,
          status: tournament.isDraft ? 'draft' : (tournament.status || 'published'),
          url: `${websiteBaseUrl}/tournaments/${tournament.id}`,
        },
        summary: {
          total_registered_teams: totalRegisteredTeams,
          eligible_teams_count: eligibleTeamsCount,
          ineligible_teams_count: ineligibleTeamsCount,
          eligible_linked_members_count: eligibleLinkedMembersCount,
          unlinked_members_count: unlinkedMembersCount,
          duplicate_discord_ids_count: duplicateDiscordCount,
        },
        teams,
      }));
    } catch (err) {
      console.warn('⚠️ [BOT API] Failed to fetch registrations:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: err.message }));
    }
    return;
  }

  // GET /api/bot/users/:discordId/eligible-tournaments (Fetch tournaments a linked Discord user is eligible for)
  const botUserTourMatch = urlPath.match(/^\/api\/bot\/users\/([^/]+)\/eligible-tournaments$/);
  if (botUserTourMatch && req.method === 'GET') {
    if (!verifyBotAuth(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Missing or invalid bot authentication secret.' }));
      return;
    }

    const discordId = decodeURIComponent(botUserTourMatch[1]).trim();
    if (!/^\d{17,20}$/.test(discordId)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'INVALID_ID', message: 'Invalid Discord user ID snowflake.' }));
      return;
    }

    try {
      // 1. Look up user by Discord ID
      const userRes = await pool.query(
        `SELECT u.id, u.name, u.email
         FROM users u
         LEFT JOIN user_discord_connections udc ON udc.user_id = u.id
         WHERE u.discord_id = $1 OR u.discord_user_id = $1 OR udc.discord_id = $1
         LIMIT 1`,
        [discordId]
      );

      if (userRes.rows.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          discord_id: discordId,
          user_id: null,
          eligible_tournaments: [],
        }));
        return;
      }

      const user = userRes.rows[0];
      const userId = user.id;

      // 2. Query tournament registrations & tournament_teams for this user
      const regRes = await pool.query(
        `SELECT r.id AS registration_id, r.tournament_id, r.team_name, r.status, r.members,
                t.title AS tournament_title, t.game AS tournament_game, t.status AS tournament_status, t."isDraft"
         FROM tournament_registrations r
         JOIN tournaments t ON t.id = r.tournament_id
         WHERE (r.user_id = $1 OR r.captain_uid = $1 OR r.members::text LIKE $2)
           AND (t."isDraft" = false OR t."isDraft" IS NULL)
           AND LOWER(COALESCE(r.status, '')) NOT IN ('rejected', 'cancelled', 'expired', 'payment_rejected')`,
        [userId, `%"uid":"${userId}"%`]
      );

      const teamMemberRes = await pool.query(
        `SELECT tm.tournament_team_id, tt.tournament_id, tt.team_name, tt.status AS team_status,
                t.title AS tournament_title, t.game AS tournament_game, t.status AS tournament_status, t."isDraft"
         FROM tournament_team_members tm
         JOIN tournament_teams tt ON tt.id = tm.tournament_team_id
         JOIN tournaments t ON t.id = tt.tournament_id
         WHERE tm.user_id = $1 AND tm.status = 'active'
           AND tt.status != 'disqualified'
           AND (t."isDraft" = false OR t."isDraft" IS NULL)`,
        [userId]
      );

      const EXCLUDED_STATUSES = ['rejected', 'cancelled', 'expired', 'payment_rejected', 'PAYMENT_REJECTED'];
      const ELIGIBLE_STATUSES = ['approved', 'confirmed', 'verified_by_host', 'VERIFIED_BY_HOST', 'verified'];

      const eligibleMap = new Map();
      const websiteBaseUrl = (process.env.MATCHDISTRICT_WEBSITE_URL || process.env.VITE_API_URL || 'https://matchdistrict.in').replace(/\/+$/, '');

      for (const reg of regRes.rows) {
        const rawStatus = (reg.status || 'pending').toLowerCase().trim();
        const isEligible = !EXCLUDED_STATUSES.includes(rawStatus) &&
          (ELIGIBLE_STATUSES.includes(rawStatus) || (typeof isEligibleRegistrationStatus === 'function' ? isEligibleRegistrationStatus(reg.status) : false));

        if (isEligible && !eligibleMap.has(reg.tournament_id)) {
          eligibleMap.set(reg.tournament_id, {
            id: reg.tournament_id,
            title: reg.tournament_title || 'Untitled Tournament',
            game: reg.tournament_game || 'Esports',
            status: reg.isDraft ? 'draft' : (reg.tournament_status || 'published'),
            team_name: reg.team_name,
            url: `${websiteBaseUrl}/tournaments/${reg.tournament_id}`,
          });
        }
      }

      for (const tm of teamMemberRes.rows) {
        if (!eligibleMap.has(tm.tournament_id)) {
          eligibleMap.set(tm.tournament_id, {
            id: tm.tournament_id,
            title: tm.tournament_title || 'Untitled Tournament',
            game: tm.tournament_game || 'Esports',
            status: tm.isDraft ? 'draft' : (tm.tournament_status || 'published'),
            team_name: tm.team_name,
            url: `${websiteBaseUrl}/tournaments/${tm.tournament_id}`,
          });
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        discord_id: discordId,
        user_id: userId,
        eligible_tournaments: Array.from(eligibleMap.values()),
      }));
    } catch (err) {
      console.warn('⚠️ [BOT API] Failed to fetch user eligible tournaments:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: err.message }));
    }
    return;
  }

  // 7e. Supabase Get All Tournaments Service
  if (urlPath === '/api/tournaments' && req.method === 'GET') {
    try {
      const dbRes = await pool.query(`
        SELECT t.*, u.tier AS "orgTier", u."orgName" AS "userOrgName", u."orgImage" AS "userOrgImage", u.name AS "userName"
        FROM tournaments t
        LEFT JOIN users u ON t."orgId" = u.id
        WHERE (t."isDraft" = false OR t."isDraft" IS NULL)
        ORDER BY t.created_at DESC
      `);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      const normalized = (dbRes.rows || []).map(withTournamentDisplay);
      res.end(JSON.stringify({ success: true, tournaments: normalized }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Supabase fetch tournaments failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ─────────────────────────────────────────────────────────────
  // 7e-p. Tournament Promotion (Trending & Featured)
  // Public read of the promoted section + admin-only management.
  // NOTE: this must precede the generic GET /api/tournaments/:id
  // matcher so "promoted" is not treated as a tournament id.
  // ─────────────────────────────────────────────────────────────

  // GET /api/tournaments/promoted — public promoted section payload
  if (urlPath === '/api/tournaments/promoted' && req.method === 'GET') {
    try {
      let limit = await getPromotedSectionLimit();
      try {
        const requested = new URL(req.url, 'http://localhost').searchParams.get('limit');
        if (requested !== null && requested !== '') limit = parseDisplayLimit(requested, limit);
      } catch { /* ignore a malformed ?limit query string */ }
      const dbRes = await pool.query(
        `SELECT
           p.id AS promotion_id, p.placement, p.priority, p.display_order,
           p.starts_at, p.ends_at,
           t.*,
           u.tier AS "orgTier", u."orgName" AS "userOrgName", u."orgImage" AS "userOrgImage", u.name AS "userName"
         FROM tournament_promotions p
         JOIN tournaments t ON t.id = p.tournament_id
         LEFT JOIN users u ON t."orgId" = u.id
         WHERE p.is_active = true
           AND (p.starts_at IS NULL OR p.starts_at <= NOW())
           AND (p.ends_at IS NULL OR p.ends_at >= NOW())
           AND (t."isDraft" = false OR t."isDraft" IS NULL)
           AND LOWER(COALESCE(t.status, '')) NOT IN ('completed', 'archived')
         ORDER BY p.priority DESC, p.display_order ASC, p.created_at ASC, p.id ASC
         LIMIT $1`,
        [limit]
      );
      const normalized = (dbRes.rows || []).map(withTournamentDisplay);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, tournaments: normalized, limit }));
    } catch (err) {
      console.warn('⚠️ [PROMOTION] Failed to fetch promoted tournaments:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // GET /api/admin/tournament-promotions — every promotion record (admin)
  // Lets the admin UI show accurate status (including inactive promotions).
  if (urlPath === '/api/admin/tournament-promotions' && req.method === 'GET') {
    const admin = await requireAdminFromDb(req, res);
    if (!admin) return;
    try {
      const dbRes = await pool.query(
        `SELECT id, tournament_id, is_active, placement, priority, display_order,
                starts_at, ends_at, created_by, updated_by, created_at, updated_at
         FROM tournament_promotions
         ORDER BY priority DESC, display_order ASC, created_at ASC, id ASC`
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, promotions: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // GET/PUT/DELETE /api/admin/tournaments/:id/promotion
  const adminPromotionMatch = urlPath.match(/^\/api\/admin\/tournaments\/([^/]+)\/promotion$/);
  if (adminPromotionMatch && req.method === 'GET') {
    const admin = await requireAdminFromDb(req, res);
    if (!admin) return;
    const tournamentId = decodeURIComponent(adminPromotionMatch[1]);
    try {
      const dbRes = await pool.query('SELECT * FROM tournament_promotions WHERE tournament_id = $1 LIMIT 1', [tournamentId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, promotion: dbRes.rows[0] || null }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (adminPromotionMatch && req.method === 'PUT') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      const admin = await requireAdminFromDb(req, res);
      if (!admin) return;
      const tournamentId = decodeURIComponent(adminPromotionMatch[1]);
      try {
        let payload;
        try {
          payload = JSON.parse(body || '{}');
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON.' }));
          return;
        }

        // The tournament must exist (never create promotions for unknown ids).
        const tRes = await pool.query('SELECT id FROM tournaments WHERE id = $1', [tournamentId]);
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }

        const validation = validatePromotionPayload(payload);
        if (!validation.ok) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: validation.errors.join(' '), errors: validation.errors }));
          return;
        }
        const { is_active, placement, priority, display_order, starts_at, ends_at } = validation.value;

        const existing = await pool.query('SELECT id FROM tournament_promotions WHERE tournament_id = $1 LIMIT 1', [tournamentId]);
        const isNew = existing.rows.length === 0;
        const promotionId = isNew ? `PRM-${crypto.randomBytes(8).toString('hex').toUpperCase()}` : existing.rows[0].id;

        // Atomic upsert — a single record per tournament is enforced by the
        // UNIQUE index on tournament_id, so concurrent admin writes cannot
        // create duplicate promotions.
        const dbRes = await pool.query(
          `INSERT INTO tournament_promotions
             (id, tournament_id, is_active, placement, priority, display_order, starts_at, ends_at, created_by, updated_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, NOW(), NOW())
           ON CONFLICT (tournament_id) DO UPDATE SET
             is_active = EXCLUDED.is_active,
             placement = EXCLUDED.placement,
             priority = EXCLUDED.priority,
             display_order = EXCLUDED.display_order,
             starts_at = EXCLUDED.starts_at,
             ends_at = EXCLUDED.ends_at,
             updated_by = EXCLUDED.updated_by,
             updated_at = NOW()
           RETURNING *`,
          [promotionId, tournamentId, is_active, placement, priority, display_order, starts_at, ends_at, admin.id]
        );

        // Audit trail (non-fatal).
        try {
          await pool.query(
            `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
              'ADM-' + crypto.randomBytes(6).toString('hex').toUpperCase(),
              admin.id,
              isNew ? 'tournament_promotion_create' : 'tournament_promotion_update',
              'tournament',
              tournamentId,
              JSON.stringify({ placement, priority, display_order, is_active, starts_at, ends_at }),
            ]
          );
        } catch { /* audit failure must never block the promotion */ }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, created: isNew, promotion: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (adminPromotionMatch && req.method === 'DELETE') {
    const admin = await requireAdminFromDb(req, res);
    if (!admin) return;
    const tournamentId = decodeURIComponent(adminPromotionMatch[1]);
    try {
      // Capture the removed configuration for the audit trail before deleting.
      const existing = await pool.query('SELECT * FROM tournament_promotions WHERE tournament_id = $1 LIMIT 1', [tournamentId]);
      const removed = await pool.query('DELETE FROM tournament_promotions WHERE tournament_id = $1 RETURNING id', [tournamentId]);
      if (removed.rowCount > 0) {
        try {
          const prev = existing.rows[0] || {};
          await pool.query(
            `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details, created_at)
             VALUES ($1, $2, 'tournament_promotion_delete', 'tournament', $3, $4, NOW())`,
            [
              'ADM-' + crypto.randomBytes(6).toString('hex').toUpperCase(),
              admin.id,
              tournamentId,
              JSON.stringify({ placement: prev.placement, priority: prev.priority, display_order: prev.display_order, is_active: prev.is_active, starts_at: prev.starts_at, ends_at: prev.ends_at }),
            ]
          );
        } catch { /* non-fatal */ }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, removed: removed.rowCount > 0 }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // GET /api/settings/promotion-limit — public: current promoted-section limit
  if (urlPath === '/api/settings/promotion-limit' && req.method === 'GET') {
    try {
      const limit = await getPromotedSectionLimit();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, limit }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // PUT /api/admin/settings/promotion-limit — admin: configure display limit
  if (urlPath === '/api/admin/settings/promotion-limit' && req.method === 'PUT') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      const admin = await requireAdminFromDb(req, res);
      if (!admin) return;
      try {
        let payload;
        try { payload = JSON.parse(body || '{}'); } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_JSON', message: 'Request body must be valid JSON.' }));
          return;
        }
        const raw = payload.limit;
        const parsed = parseInt(raw, 10);
        if (!Number.isFinite(parsed)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'limit must be a number.' }));
          return;
        }
        const limit = parseDisplayLimit(parsed, DEFAULT_PROMOTED_LIMIT);
        await pool.query(
          `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [PROMOTED_LIMIT_SETTING_KEY, String(limit)]
        );
        try {
          await pool.query(
            `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details, created_at)
             VALUES ($1, $2, 'promoted_section_limit_update', 'site_settings', $3, $4, NOW())`,
            ['ADM-' + crypto.randomBytes(6).toString('hex').toUpperCase(), admin.id, PROMOTED_LIMIT_SETTING_KEY, JSON.stringify({ limit })]
          );
        } catch { /* non-fatal */ }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, limit }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7e-1. Supabase Get Single Tournament Service
  const singleTournamentMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)$/);
  if (singleTournamentMatch && req.method === 'GET') {
    const id = decodeURIComponent(singleTournamentMatch[1]);
    try {
      const dbRes = await pool.query(`
        SELECT t.*, u.tier AS "orgTier", u."orgName" AS "userOrgName", u."orgImage" AS "userOrgImage", u.name AS "userName"
        FROM tournaments t
        LEFT JOIN users u ON t."orgId" = u.id
        WHERE t.id = $1
      `, [id]);
      if (dbRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      const row = dbRes.rows[0];

      // Reconcile authoritative slotsFilled count from canonical active registrations
      try {
        const countRes = await pool.query(
          `SELECT COUNT(DISTINCT COALESCE(NULLIF(LOWER(TRIM(team_name)), ''), id)) AS count
           FROM tournament_registrations
           WHERE tournament_id = $1
             AND (status IS NULL OR NOT (LOWER(status) = ANY($2)))`,
          [id, ['rejected', 'cancelled', 'expired', 'payment_rejected', 'waitlisted']]
        );
        const canonicalCount = parseInt(countRes.rows[0]?.count) || 0;
        const total = parseInt(row.slotsTotal) || 128;
        const canonicalFilled = Math.min(total, Math.max(parseInt(row.slotsFilled) || 0, canonicalCount));
        if (canonicalFilled !== parseInt(row.slotsFilled)) {
          row.slotsFilled = canonicalFilled;
          pool.query('UPDATE tournaments SET "slotsFilled" = $1 WHERE id = $2', [canonicalFilled, id]).catch(() => {});
        } else {
          row.slotsFilled = canonicalFilled;
        }
      } catch (countErr) {
        console.warn(`[TournamentDetail] slotsFilled count reconcile warn: ${countErr.message}`);
      }

      // Block draft access for non-owners (drafts should only be visible to the organizer)
      if (row.isDraft) {
        const authUser = getAuthUser(req);
        if (!isTournamentOrganizer(authUser, row)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
      }

      row.orgName = row.orgName || row.userOrgName || row.userName || 'Match District Organizer';
      row.orgLogo = row.orgLogo || row.userOrgImage || '';
      delete row.userOrgName;
      delete row.userOrgImage;
      delete row.userName;
      // Sanitize per-round credentials: owner/admin always; registered teams only after release.
      let detailOwner = false;
      let detailRegistered = false;
      const detailAuth = getAuthUser(req);
      if (detailAuth) {
        detailOwner = isTournamentOrganizer(detailAuth, row);
        if (!detailOwner) {
          detailRegistered = await isRegisteredForTournament(row.id, detailAuth.id);
        }
      }
      row.timeline = sanitizeTimelineForUser(row.timeline, { isOwner: detailOwner, isRegistered: detailRegistered, published: row.rounds_published !== false });
      // Compute sponsor contributions
      let sponsorRevenue = 0;
      let hasApprovedSponsors = false;
      try {
        const sd = typeof row.sponsors_data === 'string' ? JSON.parse(row.sponsors_data) : (row.sponsors_data || []);
        if (Array.isArray(sd)) {
          const approved = sd.filter(s => s.status === 'approved');
          sponsorRevenue = approved.reduce((sum, s) => sum + (parseInt(s.amount) || 0), 0);
          hasApprovedSponsors = approved.length > 0;
        }
      } catch {}
      row.sponsorRevenue = sponsorRevenue;
      row.hasApprovedSponsors = hasApprovedSponsors;
      row.basePrize = parseInt(row.prize_pool_amount) || 0;
      row.totalPrize = row.basePrize + sponsorRevenue;
      // Room credentials are strictly served via the dedicated credentials / lobby endpoint
      delete row.roomID;
      delete row.roomPassword;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, tournament: row }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Supabase fetch tournament failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7f. Supabase Create Tournament Service
  if (urlPath === '/api/tournaments' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
          return;
        }

        const t = JSON.parse(body);
        const slotsTotal = t.slotsTotal !== undefined ? parseInt(t.slotsTotal) : 100;

        // ── ADMIN PATH: Full bypass, instant live state ──
        if (hasRole(authUser, ROLES.ADMIN)) {
          if (!t.title || t.title.length < 5 || t.title.length > 100) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'Title must be 5-100 characters.' }));
            return;
          }
          if (!t.game) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'Game selection is required.' }));
            return;
          }
          const adminMatchType = (t.match_type || 'squad').toLowerCase();
          if (!['solo', 'duo', 'squad'].includes(adminMatchType)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'Match type must be solo, duo, or squad.' }));
            return;
          }
          const floors = { solo: 50, duo: 25, squad: 13 };
          const ceilings = { solo: 100, duo: 50, squad: 25 };
          const ceiling = ceilings[adminMatchType] || 25;
          const adminSlotsTotal = slotsTotal < 2 ? 100 : slotsTotal;
          const adminTeamsPerGroup = normalizeTeamsPerGroup(t.teams_per_group, 16);
          let maxSlotsPerRoom = t.max_slots_per_room !== undefined && t.max_slots_per_room !== null && t.max_slots_per_room !== ''
            ? parseInt(t.max_slots_per_room) : ceiling;
          if (maxSlotsPerRoom > ceiling) maxSlotsPerRoom = ceiling;
          if (maxSlotsPerRoom < (floors[adminMatchType] || 13)) maxSlotsPerRoom = floors[adminMatchType] || 13;
          const numRooms = Math.ceil(adminSlotsTotal / maxSlotsPerRoom);
          const tournamentId = `TRN-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          const now = new Date();
          const prizePoolAmount = parseInt(t.prize_pool_amount) || 0;
          const entryFeeAmount = parseInt(t.entry_fee_amount) || 0;
          const prizeDisplay = prizePoolAmount > 0 ? `₹${prizePoolAmount.toLocaleString('en-IN')}` : '';
          const entryDisplay = entryFeeAmount > 0 ? `₹${entryFeeAmount}` : 'Free';
          const regOpen = t.registrationOpenDate || now.toISOString().slice(0, 16);
          const regClose = t.registrationCloseDate || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
          const startDate = t.startDate || new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);

          const dbRes = await pool.query(
            `INSERT INTO tournaments (
              id, title, game, status, "badgeBg", "badgeText", date, prize, entry, "teamsCount", featured, "orgName",
              "orgLogo", "orgHandle", "orgMotto",
              "registrationOpenDate", "registrationCloseDate", "startDate",
              rules, chat, notices, teams, region, format, "slotsTotal", "slotsFilled", "roomID", "roomPassword",
              timeline, "bannerUrl", "logoUrl", "isDraft", version, "orgId",
              match_type, perspective, reserved_slots, entry_fee_amount, prize_pool_type, prize_pool_amount,
              prize_split_1st, prize_split_2nd, prize_split_3rd, prize_split_mvp, description, cover_image_url,
              lobby_start_time, mvp_enabled, mvp_amount, kill_reward_enabled, kill_reward_per_kill, prize_positions,
              sponsors_enabled, max_slots_per_room, card_color, rounds_published, teams_per_group, teams_per_match, roadmap_image_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
              $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
              $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59)
            RETURNING *`,
            [
              tournamentId, t.title, t.game, 'upcoming', 'bg-primary', 'UPCOMING', now.toISOString(),
              prizeDisplay, entryDisplay, '', true, 'Match District', '', 'matchdistrict', 'Admin Hosted',
              regOpen, regClose, startDate,
              t.rules ? (typeof t.rules === 'string' ? t.rules : JSON.stringify(t.rules)) : '[]',
              '[]', '[]', '[]', t.region || 'India', t.format || adminMatchType.toUpperCase(),
              adminSlotsTotal, 0, t.roomID || '', t.roomPassword || '',
              t.timeline ? (typeof t.timeline === 'string' ? t.timeline : JSON.stringify(t.timeline)) : '[]',
              t.bannerUrl || (t.cover_image_url || ''), '', false, 1, authUser.id,
              adminMatchType, t.perspective || 'tpp', parseInt(t.reserved_slots) || 0, entryFeeAmount,
              prizePoolAmount > 0 ? 'fixed' : 'dynamic', prizePoolAmount,
              t.prize_split_1st || '', t.prize_split_2nd || '', t.prize_split_3rd || '', t.prize_split_mvp || '',
              t.description || '', t.cover_image_url || '', t.lobby_start_time || '',
              t.mvp_enabled || false, t.mvp_amount ? parseInt(t.mvp_amount) : 0,
              t.kill_reward_enabled || false, t.kill_reward_per_kill ? parseInt(t.kill_reward_per_kill) : 0,
              t.prize_positions || '[]', t.sponsors_enabled || false, maxSlotsPerRoom,
              t.card_color || 'white', coerceBool(t.rounds_published, true),
              adminTeamsPerGroup, t.teams_per_match ? parseInt(t.teams_per_match) : 16, sanitizeImageUrlForDb(t.roadmap_image_url) || ''
            ]
          );
          const createdTournament = dbRes.rows[0];
          try {
            const slotInserts = [];
            for (let r = 0; r < numRooms; r++) {
              const slotsInThisRoom = r < numRooms - 1 ? maxSlotsPerRoom : adminSlotsTotal - r * maxSlotsPerRoom;
              for (let s = 0; s < slotsInThisRoom; s++) {
                slotInserts.push(`('SG-${tournamentId}-R${r}-S${s}', '${tournamentId}', ${r}, ${s}, 'empty', NULL, CURRENT_TIMESTAMP)`);
              }
            }
            for (let i = 0; i < slotInserts.length; i += 500) {
              await pool.query(
                `INSERT INTO slot_grid (id, tournament_id, room_index, slot_index, status, registration_id, created_at) VALUES ${slotInserts.slice(i, i + 500).join(', ')} ON CONFLICT (tournament_id, room_index, slot_index) DO NOTHING`
              );
            }
          } catch (sgErr) { /* slot_grid non-critical */ }
          try {
            await pool.query(
              `INSERT INTO admin_action_log (id, admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5, $6)`,
              ['LOG-' + crypto.randomBytes(4).toString('hex').toUpperCase(), authUser.id,
               'admin_create_tournament', 'tournament', tournamentId,
               JSON.stringify({ title: t.title, game: t.game, slotsTotal: adminSlotsTotal, maxSlotsPerRoom, numRooms })]
            );
          } catch (logErr) { /* non-critical */ }
          // Admin-hosted tournaments are promoted to the Trending & Featured
          // section by default (previously via tournaments.featured = true).
          // ON CONFLICT keeps any existing/scheduled promotion untouched.
          try {
            await pool.query(
              `INSERT INTO tournament_promotions
                 (id, tournament_id, is_active, placement, priority, display_order, created_by, updated_by)
               VALUES ($1, $2, true, 'trending_featured', 0, 0, $3, $3)
               ON CONFLICT (tournament_id) DO NOTHING`,
              ['PRM-' + crypto.randomBytes(8).toString('hex').toUpperCase(), tournamentId, authUser.id]
            );
          } catch { /* promotion is non-critical to tournament creation */ }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, tournament: createdTournament }));
          return;
        }

        // ── ORGANIZER PATH: Standard verification ──
        if (!requireOrganizer(req, res, authUser)) return;
        const isApproved = await requireApprovedOrganizer(req, res, authUser, pool);
        if (!isApproved) return;

        const isDraft = t.isDraft !== false; // default to draft if not specified

        // Fetch user's organization data (never trust client-supplied values)
        const orgUserRes = await pool.query(
          `SELECT "orgName", "orgHandle", "orgImage", "orgMotto", name, avatar, tier FROM users WHERE id = $1`,
          [authUser.id]
        );
        const orgUserRow = orgUserRes.rows[0] || {};
        const orgName = orgUserRow.orgName || '';
        const orgLogo = orgUserRow.orgImage || orgUserRow.avatar || '';
        const orgHandle = orgUserRow.orgHandle || '';
        const orgMotto = orgUserRow.orgMotto || '';

        // Block publishing without an organization profile (admins bypass)
        if (!hasRole(authUser, ROLES.ADMIN) && !isDraft && !orgUserRow.orgName) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'NO_ORG',
            message: 'You must create and activate an organization profile before publishing tournaments.'
          }));
          return;
        }

        // Check plan limits (admins bypass)
        const limitCheck = await checkPlanLimits(pool, authUser.id, slotsTotal, isDraft);
        if (!hasRole(authUser, ROLES.ADMIN) && !limitCheck.allowed) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'LIMIT_EXCEEDED', message: limitCheck.error }));
          return;
        }

        // Plan gate sponsors_enabled — only Basic/Pro can enable
        if (!hasRole(authUser, ROLES.ADMIN) && t.sponsors_enabled && !limitCheck.plan.sponsorSections) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Sponsor Contributions require the Basic plan or higher.', requiredPlan: 'Basic' }));
          return;
        }

        // Validate max_slots_per_room against floor constraint
        if (t.max_slots_per_room !== undefined && t.max_slots_per_room !== null && t.max_slots_per_room !== '') {
          const matchType = (t.match_type || 'squad').toLowerCase();
          const floors = { solo: 50, duo: 25, squad: 13 };
          const ceilings = { solo: 100, duo: 50, squad: 25 };
          const floor = floors[matchType] || 13;
          const ceiling = ceilings[matchType] || 25;
          const label = matchType.charAt(0).toUpperCase() + matchType.slice(1);
          const mVal = parseInt(t.max_slots_per_room);
          if (mVal > ceiling) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `${label} tournaments allow at most ${ceiling} slots per room.` }));
            return;
          }
          if (mVal < floor) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `Target capacity cannot be less than ${floor} teams for ${label} matches.` }));
            return;
          }
        }

        // Validate teams-per-group config for the group-based layout
        const orgTeamsPerGroup = normalizeTeamsPerGroup(t.teams_per_group, 16);
        const groupValidation = validateGroupConfig(slotsTotal, orgTeamsPerGroup);
        if (!groupValidation.ok) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: groupValidation.error, message: 'Teams per group must be a positive number that does not exceed total slots.' }));
          return;
        }

        const dbRes = await pool.query(
          `INSERT INTO tournaments (
            id, title, game, status, "badgeBg", "badgeText", date, prize, entry, "teamsCount", featured, "orgName",
            "orgLogo", "orgHandle", "orgMotto",
            "registrationOpenDate", "registrationCloseDate", "startDate",
            rules, chat, notices, teams, region, format, "slotsTotal", "slotsFilled", "roomID", "roomPassword", timeline, "bannerUrl", "logoUrl", "isDraft", version, "orgId",
            match_type, perspective, reserved_slots, entry_fee_amount, prize_pool_type, prize_pool_amount,
            prize_split_1st, prize_split_2nd, prize_split_3rd, prize_split_mvp, description, cover_image_url, lobby_start_time,
            mvp_enabled, mvp_amount, kill_reward_enabled, kill_reward_per_kill, prize_positions, sponsors_enabled, max_slots_per_room,
            unique_amount_suffix_enabled, card_color, rounds_published, teams_per_group, teams_per_match, roadmap_image_url
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31,
            $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60)
          ON CONFLICT (id) DO UPDATE SET
            status = COALESCE(EXCLUDED.status, tournaments.status),
            "isDraft" = COALESCE(EXCLUDED."isDraft", tournaments."isDraft"),
            title = COALESCE(EXCLUDED.title, tournaments.title),
            game = COALESCE(EXCLUDED.game, tournaments.game),
            "cover_image_url" = COALESCE(EXCLUDED."cover_image_url", tournaments."cover_image_url"),
            "startDate" = COALESCE(EXCLUDED."startDate", tournaments."startDate"),
            "registrationOpenDate" = COALESCE(EXCLUDED."registrationOpenDate", tournaments."registrationOpenDate"),
            "registrationCloseDate" = COALESCE(EXCLUDED."registrationCloseDate", tournaments."registrationCloseDate"),
            "slotsTotal" = COALESCE(EXCLUDED."slotsTotal", tournaments."slotsTotal"),
            "slotsFilled" = COALESCE(EXCLUDED."slotsFilled", tournaments."slotsFilled"),
            prize = COALESCE(EXCLUDED.prize, tournaments.prize),
            entry = COALESCE(EXCLUDED.entry, tournaments.entry),
            match_type = COALESCE(EXCLUDED.match_type, tournaments.match_type),
            perspective = COALESCE(EXCLUDED.perspective, tournaments.perspective),
            entry_fee_amount = COALESCE(EXCLUDED.entry_fee_amount, tournaments.entry_fee_amount),
            description = COALESCE(EXCLUDED.description, tournaments.description),
            max_slots_per_room = COALESCE(EXCLUDED.max_slots_per_room, tournaments.max_slots_per_room),
            unique_amount_suffix_enabled = COALESCE(EXCLUDED.unique_amount_suffix_enabled, tournaments.unique_amount_suffix_enabled),
            card_color = COALESCE(EXCLUDED.card_color, tournaments.card_color),
            rounds_published = COALESCE(EXCLUDED.rounds_published, tournaments.rounds_published),
            teams_per_group = COALESCE(EXCLUDED.teams_per_group, tournaments.teams_per_group),
            teams_per_match = COALESCE(EXCLUDED.teams_per_match, tournaments.teams_per_match),
            roadmap_image_url = COALESCE(EXCLUDED.roadmap_image_url, tournaments.roadmap_image_url)
          RETURNING *`,
          [
            t.id || `TRN-${Date.now().toString(36).slice(-4)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            t.title || '',
            t.game || '',
            t.status || 'upcoming',
            t.badgeBg || (t.status === 'live' ? 'bg-error' : 'bg-primary'),
            t.badgeText || (t.status === 'live' ? 'LIVE NOW' : 'UPCOMING'),
            t.date || '',
            t.prize || '',
            t.entry || '',
            t.teamsCount || '',
            false, // `featured` is never client-settable; promotion is admin-managed via tournament_promotions
            orgName,
            orgLogo,
            orgHandle,
            orgMotto,
            t.registrationOpenDate || '',
            t.registrationCloseDate || '',
            t.startDate || '',
            t.rules ? (typeof t.rules === 'string' ? t.rules : JSON.stringify(t.rules)) : '[]',
            t.chat ? (typeof t.chat === 'string' ? t.chat : JSON.stringify(t.chat)) : '[]',
            t.notices ? (typeof t.notices === 'string' ? t.notices : JSON.stringify(t.notices)) : '[]',
            t.teams ? (typeof t.teams === 'string' ? t.teams : JSON.stringify(t.teams)) : '[]',
            t.region || '',
            t.format || '',
            slotsTotal,
            t.slotsFilled !== undefined ? parseInt(t.slotsFilled) : 0,
            t.roomID || '',
            t.roomPassword || '',
            t.timeline ? (typeof t.timeline === 'string' ? t.timeline : JSON.stringify(t.timeline)) : '[]',
            t.bannerUrl || '',
            t.logoUrl || '',
            isDraft,
            t.version !== undefined ? parseInt(t.version) : 1,
            authUser.id,
            t.match_type || 'squad',
            t.perspective || 'tpp',
            t.reserved_slots !== undefined ? parseInt(t.reserved_slots) : 0,
            t.entry_fee_amount !== undefined ? parseInt(t.entry_fee_amount) : 0,
            t.prize_pool_type || 'fixed',
            t.prize_pool_amount !== undefined ? parseInt(t.prize_pool_amount) : 0,
            t.prize_split_1st || '',
            t.prize_split_2nd || '',
            t.prize_split_3rd || '',
            t.prize_split_mvp || '',
            t.description || '',
            t.cover_image_url || '',
            t.lobby_start_time || '',
            t.mvp_enabled || false,
            t.mvp_amount !== undefined ? parseInt(t.mvp_amount) : 0,
            t.kill_reward_enabled || false,
            t.kill_reward_per_kill !== undefined ? parseInt(t.kill_reward_per_kill) : 0,
            t.prize_positions || '[]',
            t.sponsors_enabled !== undefined ? t.sponsors_enabled : false,
            t.max_slots_per_room !== undefined && t.max_slots_per_room !== null && t.max_slots_per_room !== '' ? parseInt(t.max_slots_per_room) : null,
            t.unique_amount_suffix_enabled || false,
            t.card_color || 'white',
            coerceBool(t.rounds_published, true),
            orgTeamsPerGroup,
            t.teams_per_match ? parseInt(t.teams_per_match) : 16,
            sanitizeImageUrlForDb(t.roadmap_image_url) || ''
          ]
        );
        console.log(`\n📦 [MATCH DISTRICT DB] Tournament "${t.id}" created in Supabase PostgreSQL.\n`);
        const createdTournament = dbRes.rows[0];
        // Track analytics event
        try {
          await pool.query(
            `INSERT INTO analytics_events (id, organizer_id, event_type, event_data, tournament_id)
             VALUES ($1, $2, $3, $4, $5)`,
            ['AE-' + crypto.randomBytes(6).toString('hex').toUpperCase(), authUser.id, 'tournament_created',
            JSON.stringify({ title: t.title, game: t.game, slotsTotal, isDraft }), createdTournament.id]
          );
        } catch (aeErr) { /* analytics non-critical */ }
        if (!isDraft) {
          notifyFollowersOfTournament(createdTournament);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tournament: createdTournament }));
      } catch (err) {
        console.warn('⚠️ [MATCH DISTRICT DB] Supabase create tournament failed:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7g. Supabase Update Tournament Service
  // 7g-0. PUT /api/tournaments/:id/rounds/:index/credentials — organizer manages per-round room credentials (must precede generic PUT)
  const roundCredsMatch = req.url.match(/^\/api\/tournaments\/([^/]+)\/rounds\/(\d+)\/credentials$/);
  if (roundCredsMatch && req.method === 'PUT') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
          return;
        }
        const tId = decodeURIComponent(roundCredsMatch[1]);
        const roundIndex = parseInt(roundCredsMatch[2], 10);

        const existRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [tId]);
        if (existRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const existing = existRes.rows[0];
        const access = checkTournamentOrganizerAccess(authUser, existing);
        if (!access.authorized) {
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
          return;
        }

        const payload = JSON.parse(body || '{}');
        const roomId = typeof payload.room_id === 'string' ? payload.room_id.trim() : '';
        const roomPassword = typeof payload.room_password === 'string' ? payload.room_password.trim() : '';
        const releaseOffset = payload.id_pass_release_offset_minutes;
        if (releaseOffset !== undefined && releaseOffset !== null && !ID_PASS_RELEASE_OFFSETS.includes(parseInt(releaseOffset, 10))) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'ID-Pass release timing must be 15, 10, or 5 minutes before the match.' }));
          return;
        }
        for (const v of [roomId, roomPassword]) {
          if (v.length > 80) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'Room ID / password must be at most 80 characters.' }));
            return;
          }
          if (v && /[\u0000-\u001f]/.test(v)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'Room ID / password contains invalid characters.' }));
            return;
          }
        }

        let parsed = {};
        try { parsed = existing.timeline ? JSON.parse(existing.timeline) : {}; } catch { parsed = {}; }
        if (!parsed || typeof parsed !== 'object') parsed = {};
        const existingArr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.roadmap) ? parsed.roadmap : []);
        if (!Array.isArray(existingArr) || roundIndex < 0 || roundIndex >= existingArr.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ROUND_NOT_FOUND', message: 'Round not found.' }));
          return;
        }
        const updatedRound = { ...(existingArr[roundIndex] || {}), room_id: roomId, room_password: roomPassword, id_pass_release_offset_minutes: normalizeReleaseOffset(releaseOffset) };
        existingArr[roundIndex] = updatedRound;
        const updatedTimeline = Array.isArray(parsed) ? existingArr : { ...parsed, roadmap: existingArr };
        await pool.query(
          'UPDATE tournaments SET timeline = $1, version = version + 1 WHERE id = $2',
          [JSON.stringify(updatedTimeline), tId]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, round: updatedRound }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/tournaments/:id/rounds — Return list of rounds (Hardened Phase 5)
  const roundsListMatch = req.url.match(/^\/api\/tournaments\/([^/]+)\/rounds$/);
  if (roundsListMatch && req.method === 'GET') {
    const tId = decodeURIComponent(roundsListMatch[1]);
    (async () => {
      try {
        const tournRes = await pool.query(
          'SELECT "orgId", roadmap_status, rounds_published, "isDraft" FROM tournaments WHERE id = $1',
          [tId]
        );
        if (tournRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        }

        const tourn = tournRes.rows[0];
        const authUser = getAuthUser(req);
        const isOwnerOrAdmin = isTournamentOrganizer(authUser, tourn);

        if (!isOwnerOrAdmin) {
          const isApproved = tourn.roadmap_status === 'approved' || tourn.roadmap_status === 'published';
          const isRoundsPublished = tourn.rounds_published !== false;
          if (!isApproved || !isRoundsPublished || tourn.isDraft) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'ROADMAP_NOT_APPROVED',
              message: 'Roadmap is not approved or published yet.'
            }));
          }
        }

        const allRounds = await getTournamentRounds(pool, tId);

        // For non-owners, sanitize internal progression rules and expose only public stage info
        const rounds = isOwnerOrAdmin
          ? allRounds
          : allRounds.map((r) => ({
              id: r.id,
              round_number: r.round_number,
              name: r.name,
              round_type: r.round_type,
              status: r.status,
              date: r.date,
              time: r.time,
              map: r.map,
            }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, rounds }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    })();
    return;
  }

  // 7g0b. Manual / Configured Team Advancement endpoint (Hardened Phase 4A)
  const roundAdvanceMatch = req.url.match(/^\/api\/tournaments\/([^/]+)\/rounds\/(?:(\d+)\/)?advance$/);
  if (roundAdvanceMatch && req.method === 'POST') {
    const tId = decodeURIComponent(roundAdvanceMatch[1]);
    const routeRoundNum = roundAdvanceMatch[2] ? parseInt(roundAdvanceMatch[2], 10) : null;
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
        }
        const existRes = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tId]);
        if (existRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        }
        const access = checkTournamentOrganizerAccess(authUser, existRes.rows[0]);
        if (!access.authorized) {
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
        }

        const payload = JSON.parse(body || '{}');
        const teamIds = Array.isArray(payload.team_ids)
          ? payload.team_ids
          : (Array.isArray(payload.teamIds) ? payload.teamIds : []);
        let targetRoundId = payload.target_round_id || payload.targetRoundId;
        const targetGroupId = payload.target_group_id || payload.targetGroupId || null;
        let sourceRoundId = payload.source_round_id || payload.sourceRoundId || null;
        const manualPlacement = payload.manual_placement || payload.manualPlacement || null;
        const allowUnverified = Boolean(payload.allow_unverified || payload.allowUnverified || payload.override_unverified || payload.overrideUnverified);

        if (routeRoundNum && !sourceRoundId) {
          const srcRnd = await pool.query(
            'SELECT id FROM tournament_rounds WHERE tournament_id = $1 AND round_number = $2',
            [tId, routeRoundNum]
          );
          if (srcRnd.rows.length > 0) sourceRoundId = srcRnd.rows[0].id;
        }

        if (!targetRoundId && routeRoundNum) {
          const nextRnd = await pool.query(
            'SELECT id FROM tournament_rounds WHERE tournament_id = $1 AND round_number > $2 ORDER BY round_number ASC LIMIT 1',
            [tId, routeRoundNum]
          );
          if (nextRnd.rows.length > 0) targetRoundId = nextRnd.rows[0].id;
        }

        if (!targetRoundId && sourceRoundId) {
          const srcRnd = await pool.query(
            'SELECT round_number FROM tournament_rounds WHERE id = $1 AND tournament_id = $2',
            [sourceRoundId, tId]
          );
          if (srcRnd.rows.length > 0) {
            const nextRnd = await pool.query(
              'SELECT id FROM tournament_rounds WHERE tournament_id = $1 AND round_number > $2 ORDER BY round_number ASC LIMIT 1',
              [tId, srcRnd.rows[0].round_number]
            );
            if (nextRnd.rows.length > 0) targetRoundId = nextRnd.rows[0].id;
          }
        }

        if (!targetRoundId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Target round ID is required.' }));
        }

        if (teamIds.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Please select at least one team to advance.' }));
        }

        // Capacity check: If target round or source round has configured advancement limit
        const trCapCheck = await pool.query(
          'SELECT id, name, round_number, teams_advancing FROM tournament_rounds WHERE id = $1 AND tournament_id = $2',
          [targetRoundId, tId]
        );
        if (trCapCheck.rows.length > 0 && trCapCheck.rows[0].teams_advancing) {
          const maxCapacity = parseInt(trCapCheck.rows[0].teams_advancing, 10);
          if (maxCapacity > 0 && teamIds.length > maxCapacity && !allowUnverified) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: false,
              error: 'CAPACITY_EXCEEDED',
              message: `Selected teams (${teamIds.length}) exceed target round capacity (${maxCapacity}). Please adjust your selection.`,
            }));
          }
        }

        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await advanceTeamsManually(client, {
            tournamentId: tId,
            sourceRoundId,
            targetRoundId,
            targetGroupId,
            teamIds,
            actorId: authUser.id,
            allow_unverified: allowUnverified,
            manual_placement: manualPlacement,
          });
          await client.query('COMMIT');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, ...result }));
        } catch (txnErr) {
          await client.query('ROLLBACK').catch(() => {});
          throw txnErr;
        } finally {
          client.release();
        }
      } catch (err) {
        console.error('Advancement error:', err);
        const code = err instanceof ProgressionError ? err.code : 'ADVANCEMENT_ERROR';
        let status = 400;
        if (code === 'TARGET_ROUND_HAS_RESULTS' || code === 'TOURNAMENT_FINALIZED') {
          status = 409;
        } else if (code === 'ROUND_NOT_FOUND' || code === 'TOURNAMENT_NOT_FOUND') {
          status = 404;
        }
        res.writeHead(status, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          error: code,
          message: err.message || 'Failed to advance teams.',
          unverified_match_ids: err.unverified_match_ids || undefined,
        }));
      }
    });
    return;
  }

  // 7g. Supabase Update Tournament Service
  const updateTournamentMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)$/);
  if (updateTournamentMatch && req.method === 'PUT') {
    const id = decodeURIComponent(updateTournamentMatch[1]);
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
          return;
        }

        const t = JSON.parse(body);
        if (String(t.status || '').toLowerCase() === 'completed') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FINALIZATION_REQUIRED', message: 'Use the validated tournament finalization action to mark this tournament completed.' }));
          return;
        }

        // ── ADMIN PATH: Full bypass ──
        if (hasRole(authUser, ROLES.ADMIN)) {
          const existRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
          if (existRes.rows.length === 0) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
            return;
          }
          const existing = existRes.rows[0];

          if (existing.finalized_at) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament configuration is locked.' }));
            return;
          }

          // Admin is always allowed — force live + featured + Match District branding
          const slotsTotal = t.slotsTotal !== undefined ? parseInt(t.slotsTotal) : existing.slotsTotal;
          const prizePoolAmount = parseInt(t.prize_pool_amount) || existing.prize_pool_amount || 0;
          const entryFeeAmount = parseInt(t.entry_fee_amount) || existing.entry_fee_amount || 0;
          const prizeDisplay = prizePoolAmount > 0 ? `₹${prizePoolAmount.toLocaleString('en-IN')}` : existing.prize;
          const entryDisplay = entryFeeAmount > 0 ? `₹${entryFeeAmount}` : 'Free';

          // Validate title/game if present
          if (t.title !== undefined && (t.title.length < 5 || t.title.length > 100)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: 'Title must be 5-100 characters.' }));
            return;
          }

          const adminUpdateClient = await pool.connect();
          let dbRes;
          try {
            await adminUpdateClient.query('BEGIN');
            const lockRes = await adminUpdateClient.query('SELECT finalized_at, status FROM tournaments WHERE id = $1 FOR UPDATE', [id]);
            if (!lockRes.rows.length || lockRes.rows[0].finalized_at) {
              await adminUpdateClient.query('ROLLBACK');
              res.writeHead(lockRes.rows.length ? 409 : 404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: lockRes.rows.length ? 'TOURNAMENT_FINALIZED' : 'NOT_FOUND', message: lockRes.rows.length ? 'Finalized tournament configuration is locked.' : 'Tournament not found.' }));
              return;
            }
            dbRes = await adminUpdateClient.query(
            `UPDATE tournaments SET
              title = COALESCE($1, title),
              game = COALESCE($2, game),
              status = $3,
              "badgeBg" = COALESCE($4, "badgeBg"),
              "badgeText" = COALESCE($5, "badgeText"),
              date = COALESCE($6, date),
              prize = COALESCE($7, prize),
              entry = COALESCE($8, entry),
              "teamsCount" = COALESCE($9, "teamsCount"),
              featured = true,
              "orgName" = 'Match District',
              "orgLogo" = COALESCE($10, "orgLogo"),
              "orgHandle" = 'matchdistrict',
              "orgMotto" = 'Admin Hosted',
              "registrationOpenDate" = COALESCE($11, "registrationOpenDate"),
              "registrationCloseDate" = COALESCE($12, "registrationCloseDate"),
              "startDate" = COALESCE($13, "startDate"),
              rules = COALESCE($14, rules),
              chat = COALESCE($15, chat),
              notices = COALESCE($16, notices),
              teams = COALESCE($17, teams),
              region = COALESCE($18, region),
              format = COALESCE($19, format),
              "slotsTotal" = COALESCE($20, "slotsTotal"),
              "slotsFilled" = COALESCE($21, "slotsFilled"),
              "roomID" = COALESCE($22, "roomID"),
              "roomPassword" = COALESCE($23, "roomPassword"),
              timeline = COALESCE($24, timeline),
              "bannerUrl" = COALESCE($25, "bannerUrl"),
              "logoUrl" = COALESCE($26, "logoUrl"),
              "isDraft" = false,
              version = COALESCE($27, version) + 1,
              "orgId" = COALESCE($28, "orgId"),
              match_type = COALESCE($29, match_type),
              perspective = COALESCE($30, perspective),
              reserved_slots = COALESCE($31, reserved_slots),
              entry_fee_amount = COALESCE($32, entry_fee_amount),
              prize_pool_type = COALESCE($33, prize_pool_type),
              prize_pool_amount = $34,
              prize_split_1st = COALESCE($35, prize_split_1st),
              prize_split_2nd = COALESCE($36, prize_split_2nd),
              prize_split_3rd = COALESCE($37, prize_split_3rd),
              prize_split_mvp = COALESCE($38, prize_split_mvp),
              description = COALESCE($39, description),
              cover_image_url = COALESCE($40, cover_image_url),
              lobby_start_time = COALESCE($41, lobby_start_time),
              mvp_enabled = COALESCE($42, mvp_enabled),
              mvp_amount = COALESCE($43, mvp_amount),
              kill_reward_enabled = COALESCE($44, kill_reward_enabled),
              kill_reward_per_kill = COALESCE($45, kill_reward_per_kill),
              prize_positions = COALESCE($46, prize_positions),
              sponsors_enabled = COALESCE($47, sponsors_enabled),
              max_slots_per_room = COALESCE($48, max_slots_per_room),
              unique_amount_suffix_enabled = COALESCE($49, unique_amount_suffix_enabled),
              card_color = COALESCE($50, card_color),
              rounds_published = COALESCE($51, rounds_published),
              teams_per_group = COALESCE($52, teams_per_group),
          teams_per_match = COALESCE($53, teams_per_match),
              roadmap_image_url = COALESCE($54, roadmap_image_url)
            WHERE id = $55 RETURNING *`,
            [
              t.title || null,
              t.game || null,
              'live',
              t.badgeBg || null,
              'LIVE',
              t.date || null,
              prizeDisplay,
              entryDisplay,
              t.teamsCount || null,
              t.orgLogo || null,
              t.registrationOpenDate || null,
              t.registrationCloseDate || null,
              t.startDate || null,
              t.rules ? (typeof t.rules === 'string' ? t.rules : JSON.stringify(t.rules)) : null,
              t.chat || null,
              t.notices || null,
              t.teams || null,
              t.region || null,
              t.format || null,
              slotsTotal,
              t.slotsFilled !== undefined ? parseInt(t.slotsFilled) : null,
              t.roomID || null,
              t.roomPassword || null,
              t.timeline ? (typeof t.timeline === 'string' ? t.timeline : JSON.stringify(t.timeline)) : null,
              t.bannerUrl || null,
              t.logoUrl || null,
              t.version !== undefined ? parseInt(t.version) : null,
              authUser.id,
              t.match_type || null,
              t.perspective || null,
              t.reserved_slots !== undefined ? parseInt(t.reserved_slots) : null,
              entryFeeAmount,
              t.prize_pool_type || null,
              prizePoolAmount,
              t.prize_split_1st || null,
              t.prize_split_2nd || null,
              t.prize_split_3rd || null,
              t.prize_split_mvp || null,
              t.description || null,
              t.cover_image_url || null,
              t.lobby_start_time || null,
              t.mvp_enabled !== undefined ? t.mvp_enabled : null,
              t.mvp_amount !== undefined ? parseInt(t.mvp_amount) : null,
              t.kill_reward_enabled !== undefined ? t.kill_reward_enabled : null,
              t.kill_reward_per_kill !== undefined ? parseInt(t.kill_reward_per_kill) : null,
              t.prize_positions || null,
              t.sponsors_enabled !== undefined ? t.sponsors_enabled : null,
              t.max_slots_per_room !== undefined && t.max_slots_per_room !== null && t.max_slots_per_room !== '' ? parseInt(t.max_slots_per_room) : null,
              t.unique_amount_suffix_enabled !== undefined ? !!t.unique_amount_suffix_enabled : null,
              t.card_color || null,
              t.rounds_published !== undefined ? coerceBool(t.rounds_published, true) : null,
              t.teams_per_group !== undefined ? normalizeTeamsPerGroup(t.teams_per_group, 16) : null,
      t.teams_per_match !== undefined ? parseInt(t.teams_per_match) : null,
              t.roadmap_image_url !== undefined ? sanitizeImageUrlForDb(t.roadmap_image_url) : null,
              id
            ]
            );
            await adminUpdateClient.query('COMMIT');
          } catch (txErr) {
            await adminUpdateClient.query('ROLLBACK').catch(() => {});
            throw txErr;
          } finally {
            adminUpdateClient.release();
          }
          const updated = dbRes.rows[0];
          // Attempt slot_grid init for admin path (non-critical)
          try {
            await pool.query(`DELETE FROM slot_grid WHERE tournament_id = $1`, [id]);
            const matchType = (t.match_type || existing.match_type || 'squad').toLowerCase();
            const ceilings = { solo: 100, duo: 50, squad: 25 };
            const maxPerRoom = ceilings[matchType] || 25;
            const numRooms = Math.ceil(slotsTotal / maxPerRoom);
            const slotInserts = [];
            for (let r = 0; r < numRooms; r++) {
              const slotsInThisRoom = r < numRooms - 1 ? maxPerRoom : slotsTotal - r * maxPerRoom;
              for (let s = 0; s < slotsInThisRoom; s++) {
                slotInserts.push(`('SG-${id}-R${r}-S${s}', '${id}', ${r}, ${s}, 'empty', NULL, CURRENT_TIMESTAMP)`);
              }
            }
            for (let i = 0; i < slotInserts.length; i += 500) {
              await pool.query(`INSERT INTO slot_grid (id, tournament_id, room_index, slot_index, status, registration_id, created_at) VALUES ${slotInserts.slice(i, i + 500).join(', ')} ON CONFLICT (tournament_id, room_index, slot_index) DO NOTHING`);
            }
          } catch (sgErr) { /* slot_grid non-critical */ }
          try {
            await pool.query(
              `INSERT INTO admin_action_log (id, admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5, $6)`,
              ['LOG-' + crypto.randomBytes(4).toString('hex').toUpperCase(), authUser.id,
               'admin_update_tournament', 'tournament', id,
               JSON.stringify({ title: t.title || existing.title, game: t.game || existing.game })]
            );
          } catch (logErr) { /* non-critical */ }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, tournament: updated }));
          return;
        }

        // ── ORGANIZER PATH: Standard verification ──
        if (!requireOrganizer(req, res, authUser)) return;
        const isApproved = await requireApprovedOrganizer(req, res, authUser, pool);
        if (!isApproved) return;

        // Fetch existing tournament
        const existRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
        if (existRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const existing = existRes.rows[0];

        if (existing.finalized_at) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament configuration is locked.' }));
          return;
        }

        // Authorization check: User must be tournament organizer or admin
        const access = checkTournamentOrganizerAccess(authUser, existing);
        if (!access.authorized) {
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
          return;
        }

        // Fetch user's organization data for orgName/orgLogo (never trust client-supplied values)
        const orgUserRes = await pool.query(
          `SELECT "orgName", "orgHandle", "orgImage", "orgMotto", name, avatar FROM users WHERE id = $1`,
          [authUser.id]
        );
        const orgUserRow = orgUserRes.rows[0] || {};
        t.orgName = orgUserRow.orgName || t.orgName || '';
        t.orgLogo = orgUserRow.orgImage || orgUserRow.avatar || '';
        t.orgHandle = orgUserRow.orgHandle || '';
        t.orgMotto = orgUserRow.orgMotto || '';

        // Block publishing without an organization profile (admins bypass)
        const newIsDraftPublish = t.isDraft !== undefined ? t.isDraft : existing.isDraft;
        if (!hasRole(authUser, ROLES.ADMIN) && !newIsDraftPublish && existing.isDraft === true && !orgUserRow.orgName) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'NO_ORG',
            message: 'You must create and activate an organization profile before publishing tournaments.'
          }));
          return;
        }

        // If trying to publish or modify slots total, validate plan limits
        const newSlotsTotal = t.slotsTotal !== undefined ? parseInt(t.slotsTotal) : existing.slotsTotal;
        const newIsDraft = t.isDraft !== undefined ? t.isDraft : existing.isDraft;

        if ((newIsDraft === false && existing.isDraft === true) || (t.slotsTotal !== undefined && parseInt(t.slotsTotal) !== existing.slotsTotal)) {
          const limitCheck = await checkPlanLimits(pool, existing.orgId || authUser.id, newSlotsTotal, newIsDraft, id);
          if (!hasRole(authUser, ROLES.ADMIN) && !limitCheck.allowed) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'LIMIT_EXCEEDED', message: limitCheck.error }));
            return;
          }
        }

        // Plan gate sponsors_enabled (admins bypass)
        if (!hasRole(authUser, ROLES.ADMIN) && t.sponsors_enabled) {
          const planCheck = await checkPlanLimits(pool, existing.orgId || authUser.id, 0, true, id);
          if (!planCheck.plan.sponsorSections) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Sponsor Contributions require the Basic plan or higher.' }));
            return;
          }
        }

        // Validate max_slots_per_room against floor constraint
        if (t.max_slots_per_room !== undefined && t.max_slots_per_room !== null && t.max_slots_per_room !== '') {
          const matchType = (t.match_type || existing.match_type || 'squad').toLowerCase();
          const floors = { solo: 50, duo: 25, squad: 13 };
          const ceilings = { solo: 100, duo: 50, squad: 25 };
          const floor = floors[matchType] || 13;
          const ceiling = ceilings[matchType] || 25;
          const label = matchType.charAt(0).toUpperCase() + matchType.slice(1);
          const mVal = parseInt(t.max_slots_per_room);
          if (mVal > ceiling) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `${label} tournaments allow at most ${ceiling} slots per room.` }));
            return;
          }
          if (mVal < floor) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', message: `Target capacity cannot be less than ${floor} teams for ${label} matches.` }));
            return;
          }
        }

        // Group-config validation + lock-guard: once teams are confirmed, the
        // slot layout and teams-per-group are immutable (never silently move
        // or re-group already-confirmed teams).
        const newTpgRaw = t.teams_per_group !== undefined && t.teams_per_group !== null && t.teams_per_group !== ''
          ? normalizeTeamsPerGroup(t.teams_per_group, 16)
          : normalizeTeamsPerGroup(existing.teams_per_group, 16);
        const newTotalRaw = t.slotsTotal !== undefined ? parseInt(t.slotsTotal) : parseInt(existing.slotsTotal) || 100;
        const groupValidation = validateGroupConfig(newTotalRaw, newTpgRaw);
        if (!groupValidation.ok) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: groupValidation.error, message: 'Teams per group must be a positive number that does not exceed total slots.' }));
          return;
        }
        const configChanged =
          (t.slotsTotal !== undefined && parseInt(t.slotsTotal) !== parseInt(existing.slotsTotal)) ||
          (t.teams_per_group !== undefined && t.teams_per_group !== null && t.teams_per_group !== '' &&
            normalizeTeamsPerGroup(t.teams_per_group, 16) !== normalizeTeamsPerGroup(existing.teams_per_group, 16));
        if (configChanged && !hasRole(authUser, ROLES.ADMIN)) {
          const confirmedRes = await pool.query(
            `SELECT COUNT(*) FROM tournament_registrations
             WHERE tournament_id = $1 AND status IN ('approved', 'confirmed', 'VERIFIED_BY_HOST', 'verified_by_host')`,
            [id]
          );
          const confirmedCount = parseInt(confirmedRes.rows[0].count) || 0;
          if (confirmedCount > 0) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'GROUP_CONFIG_LOCKED',
              message: 'Slot layout and group sizes are locked because teams are already confirmed. Contact support to reformat this tournament.'
            }));
            return;
          }
        }
        const orgTeamsPerGroup = newTpgRaw;

        const configClient = await pool.connect();
        let dbRes;
        try {
          await configClient.query('BEGIN');
          const lockRes = await configClient.query('SELECT finalized_at, status FROM tournaments WHERE id = $1 FOR UPDATE', [id]);
          if (!lockRes.rows.length || lockRes.rows[0].finalized_at) {
            await configClient.query('ROLLBACK');
            res.writeHead(lockRes.rows.length ? 409 : 404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: lockRes.rows.length ? 'TOURNAMENT_FINALIZED' : 'NOT_FOUND', message: lockRes.rows.length ? 'Finalized tournament configuration is locked.' : 'Tournament not found.' }));
            return;
          }
          dbRes = await configClient.query(
          `UPDATE tournaments SET
            title = COALESCE($1, title),
            game = COALESCE($2, game),
            status = COALESCE($3, status),
            "badgeBg" = COALESCE($4, "badgeBg"),
            "badgeText" = COALESCE($5, "badgeText"),
            date = COALESCE($6, date),
            prize = COALESCE($7, prize),
            entry = COALESCE($8, entry),
            "teamsCount" = COALESCE($9, "teamsCount"),
            featured = COALESCE($10, featured),
            "orgName" = COALESCE($11, "orgName"),
            "orgLogo" = COALESCE($12, "orgLogo"),
            "orgHandle" = COALESCE($13, "orgHandle"),
            "orgMotto" = COALESCE($14, "orgMotto"),
            "registrationOpenDate" = COALESCE($15, "registrationOpenDate"),
            "registrationCloseDate" = COALESCE($16, "registrationCloseDate"),
            "startDate" = COALESCE($17, "startDate"),
            rules = COALESCE($18, rules),
            chat = COALESCE($19, chat),
            notices = COALESCE($20, notices),
            teams = COALESCE($21, teams),
            region = COALESCE($22, region),
            format = COALESCE($23, format),
            "slotsTotal" = COALESCE($24, "slotsTotal"),
            "slotsFilled" = COALESCE($25, "slotsFilled"),
            "roomID" = COALESCE($26, "roomID"),
            "roomPassword" = COALESCE($27, "roomPassword"),
            timeline = COALESCE($28, timeline),
            "bannerUrl" = COALESCE($29, "bannerUrl"),
            "logoUrl" = COALESCE($30, "logoUrl"),
            "isDraft" = COALESCE($31, "isDraft"),
            version = COALESCE($32, version),
            match_type = COALESCE($33, match_type),
            perspective = COALESCE($34, perspective),
            reserved_slots = COALESCE($35, reserved_slots),
            entry_fee_amount = COALESCE($36, entry_fee_amount),
            prize_pool_type = COALESCE($37, prize_pool_type),
            prize_pool_amount = COALESCE($38, prize_pool_amount),
            prize_split_1st = COALESCE($39, prize_split_1st),
            prize_split_2nd = COALESCE($40, prize_split_2nd),
            prize_split_3rd = COALESCE($41, prize_split_3rd),
            prize_split_mvp = COALESCE($42, prize_split_mvp),
            description = COALESCE($43, description),
            cover_image_url = COALESCE($44, cover_image_url),
            lobby_start_time = COALESCE($45, lobby_start_time),
            mvp_enabled = COALESCE($46, mvp_enabled),
            mvp_amount = COALESCE($47, mvp_amount),
            kill_reward_enabled = COALESCE($48, kill_reward_enabled),
            kill_reward_per_kill = COALESCE($49, kill_reward_per_kill),
            prize_positions = COALESCE($50, prize_positions),
            sponsors_enabled = COALESCE($51, sponsors_enabled),
            max_slots_per_room = COALESCE($52, max_slots_per_room),
            unique_amount_suffix_enabled = COALESCE($53, unique_amount_suffix_enabled),
            card_color = COALESCE($54, card_color),
            rounds_published = COALESCE($55, rounds_published),
            teams_per_group = COALESCE($56, teams_per_group),
            teams_per_match = COALESCE($57, teams_per_match),
            roadmap_image_url = COALESCE($58, roadmap_image_url)
           WHERE id = $59 RETURNING *`,
          [
            t.title !== undefined ? t.title : null,
            t.game !== undefined ? t.game : null,
            t.status !== undefined ? t.status : null,
            t.badgeBg !== undefined ? t.badgeBg : null,
            t.badgeText !== undefined ? t.badgeText : null,
            t.date !== undefined ? t.date : null,
            t.prize !== undefined ? t.prize : null,
            t.entry !== undefined ? t.entry : null,
            t.teamsCount !== undefined ? t.teamsCount : null,
            null, // `featured` is never client-settable; promotion is admin-managed via tournament_promotions
            t.orgName !== undefined ? t.orgName : null,
            t.orgLogo !== undefined ? t.orgLogo : null,
            t.orgHandle !== undefined ? t.orgHandle : null,
            t.orgMotto !== undefined ? t.orgMotto : null,
            t.registrationOpenDate !== undefined ? t.registrationOpenDate : null,
            t.registrationCloseDate !== undefined ? t.registrationCloseDate : null,
            t.startDate !== undefined ? t.startDate : null,
            t.rules !== undefined ? (typeof t.rules === 'string' ? t.rules : JSON.stringify(t.rules)) : null,
            t.chat !== undefined ? (typeof t.chat === 'string' ? t.chat : JSON.stringify(t.chat)) : null,
            t.notices !== undefined ? (typeof t.notices === 'string' ? t.notices : JSON.stringify(t.notices)) : null,
            t.teams !== undefined ? (typeof t.teams === 'string' ? t.teams : JSON.stringify(t.teams)) : null,
            t.region !== undefined ? t.region : null,
            t.format !== undefined ? t.format : null,
            t.slotsTotal !== undefined ? parseInt(t.slotsTotal) : null,
            t.slotsFilled !== undefined ? parseInt(t.slotsFilled) : null,
            t.roomID !== undefined ? t.roomID : null,
            t.roomPassword !== undefined ? t.roomPassword : null,
            t.timeline !== undefined ? (typeof t.timeline === 'string' ? t.timeline : JSON.stringify(t.timeline)) : null,
            t.bannerUrl !== undefined ? t.bannerUrl : null,
            t.logoUrl !== undefined ? t.logoUrl : null,
            t.isDraft !== undefined ? t.isDraft : null,
            t.version !== undefined ? parseInt(t.version) : null,
            t.match_type !== undefined ? t.match_type : null,
            t.perspective !== undefined ? t.perspective : null,
            t.reserved_slots !== undefined ? parseInt(t.reserved_slots) : null,
            t.entry_fee_amount !== undefined ? parseInt(t.entry_fee_amount) : null,
            t.prize_pool_type !== undefined ? t.prize_pool_type : null,
            t.prize_pool_amount !== undefined ? parseInt(t.prize_pool_amount) : null,
            t.prize_split_1st !== undefined ? t.prize_split_1st : null,
            t.prize_split_2nd !== undefined ? t.prize_split_2nd : null,
            t.prize_split_3rd !== undefined ? t.prize_split_3rd : null,
            t.prize_split_mvp !== undefined ? t.prize_split_mvp : null,
            t.description !== undefined ? t.description : null,
            t.cover_image_url !== undefined ? t.cover_image_url : null,
            t.lobby_start_time !== undefined ? t.lobby_start_time : null,
            t.mvp_enabled !== undefined ? t.mvp_enabled : null,
            t.mvp_amount !== undefined ? parseInt(t.mvp_amount) : null,
            t.kill_reward_enabled !== undefined ? t.kill_reward_enabled : null,
            t.kill_reward_per_kill !== undefined ? parseInt(t.kill_reward_per_kill) : null,
            t.prize_positions !== undefined ? t.prize_positions : null,
            t.sponsors_enabled !== undefined ? t.sponsors_enabled : null,
            t.max_slots_per_room !== undefined && t.max_slots_per_room !== null && t.max_slots_per_room !== '' ? parseInt(t.max_slots_per_room) : null,
            t.unique_amount_suffix_enabled !== undefined ? !!t.unique_amount_suffix_enabled : null,
            t.card_color || null,
            t.rounds_published !== undefined ? coerceBool(t.rounds_published, true) : null,
            orgTeamsPerGroup,
            t.teams_per_match !== undefined ? parseInt(t.teams_per_match) : null,
            t.roadmap_image_url !== undefined ? sanitizeImageUrlForDb(t.roadmap_image_url) : null,
            id
          ]
          );
          await configClient.query('COMMIT');
        } catch (txErr) {
          await configClient.query('ROLLBACK').catch(() => {});
          throw txErr;
        } finally {
          configClient.release();
        }
        console.log(`\n📦 [MATCH DISTRICT DB] Tournament "${id}" updated in Supabase PostgreSQL.\n`);
        const updatedTournament = dbRes.rows[0];
        if (updatedTournament.isDraft === false && existing.isDraft === true) {
          notifyFollowersOfTournament(updatedTournament);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tournament: updatedTournament }));
      } catch (err) {
        console.warn('⚠️ [MATCH DISTRICT DB] Supabase update tournament failed:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7h. Supabase Delete Tournament Service
  const deleteTournamentMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)$/);
  if (deleteTournamentMatch && req.method === 'DELETE') {
    const id = decodeURIComponent(deleteTournamentMatch[1]);
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      const existRes = await pool.query('SELECT *, finalized_at FROM tournaments WHERE id = $1', [id]);
      if (existRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      const existing = existRes.rows[0];

      if (existing.finalized_at) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament cannot be deleted.' }));
        return;
      }

      if (!hasRole(authUser, ROLES.ADMIN) && existing.orgId !== authUser.id) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to delete this tournament.' }));
        return;
      }

      const deleteClient = await pool.connect();
      try {
        await deleteClient.query('BEGIN');
        const lockRes = await deleteClient.query('SELECT finalized_at FROM tournaments WHERE id = $1 FOR UPDATE', [id]);
        if (!lockRes.rows.length || lockRes.rows[0].finalized_at) {
          await deleteClient.query('ROLLBACK');
          res.writeHead(lockRes.rows.length ? 409 : 404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: lockRes.rows.length ? 'TOURNAMENT_FINALIZED' : 'NOT_FOUND', message: lockRes.rows.length ? 'Finalized tournament cannot be deleted.' : 'Tournament not found.' }));
          return;
        }
        // Keep related deletions in the same locked transaction so finalization
        // cannot race with a partially completed tournament delete.
        await deleteClient.query('DELETE FROM tournament_registrations WHERE tournament_id = $1', [id]);
        await deleteClient.query('DELETE FROM tournament_notices WHERE tournament_id = $1', [id]);
        await deleteClient.query('DELETE FROM tournament_messages WHERE tournament_id = $1', [id]);
        await deleteClient.query('DELETE FROM tournaments WHERE id = $1', [id]);
        await deleteClient.query('COMMIT');
      } catch (txErr) {
        await deleteClient.query('ROLLBACK').catch(() => {});
        throw txErr;
      } finally {
        deleteClient.release();
      }
      console.log(`\n📦 [MATCH DISTRICT DB] Tournament "${id}" and associated records deleted from Supabase PostgreSQL.\n`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: `Tournament ${id} and all related registrations/notices/messages deleted successfully.` }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Supabase delete tournament failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7i. Supabase Secure Lobby Coordinator endpoint
  if (req.url.startsWith('/api/tournaments/') && req.url.endsWith('/lobby') && req.method === 'GET') {
    const parts = req.url.split('/');
    const id = parts[3];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to access room details.' }));
        return;
      }

      const dbRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
      if (dbRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      const t = dbRes.rows[0];

      let isAllowed = false;
      if (hasRole(authUser, ROLES.ADMIN) || t.orgId === authUser.id) {
        isAllowed = true;
      } else {
        const regRes = await pool.query(
          'SELECT * FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2 AND status = $3',
          [id, authUser.id, 'approved']
        );
        if (regRes.rows.length > 0) {
          isAllowed = true;
        }
      }

      if (isAllowed) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, roomID: t.roomID, roomPassword: t.roomPassword }));
      } else {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'ACCESS_LOCKED', message: 'Credentials will unlock automatically once your registration status is Approved.' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7j1. GET /api/organiser/tournaments — fetch all tournaments for the authenticated organizer
  if (urlPath === '/api/organiser/tournaments' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const dbRes = await pool.query(`
        SELECT t.*,
          u.tier AS "orgTier", u."orgName" AS "userOrgName", u.name AS "userName",
          (SELECT COUNT(*) FROM tournament_registrations WHERE tournament_id = t.id) AS "registrationCount",
          (SELECT COALESCE(SUM(COALESCE(amount,0)),0) FROM sponsor_contributions WHERE tournament_id = t.id AND status = 'approved') AS "sponsorRevenue"
        FROM tournaments t
        LEFT JOIN users u ON t."orgId" = u.id
        WHERE t."orgId" = $1
        ORDER BY t.created_at DESC
      `, [authUser.id]);
      const tournaments = (dbRes.rows || []).map((r) => {
        const item = {
          ...r,
          timeline: sanitizeTimelineForUser(r.timeline, { isOwner: true }),
          orgName: r.orgName || r.userOrgName || r.userName || 'Organizer',
          orgLogo: r.orgLogo || r.userOrgImage || '',
          registrationCount: parseInt(r.registrationCount) || 0,
          sponsorRevenue: parseFloat(r.sponsorRevenue) || 0,
        };
        delete item.roomID;
        delete item.roomPassword;
        return item;
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, tournaments }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Fetch organiser tournaments failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7j2. POST /api/tournaments/:id/duplicate — duplicate a tournament
  const duplicateMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/duplicate$/);
  if (duplicateMatch && req.method === 'POST') {
    const srcId = duplicateMatch[1];
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const srcRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [srcId]);
      if (srcRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      const src = srcRes.rows[0];
      const access = checkTournamentOrganizerAccess(authUser, src);
      if (!access.authorized) {
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
        return;
      }
      const newId = `TRN-${Date.now().toString().slice(-4)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const dbRes = await pool.query(
        `INSERT INTO tournaments (
          id, title, game, status, "badgeBg", "badgeText", date, prize, entry, "teamsCount",
          featured, "orgName", "orgLogo", "orgHandle", "orgMotto",
          "registrationOpenDate", "registrationCloseDate", "startDate",
          rules, chat, notices, teams, region, format, "slotsTotal", "slotsFilled",
          "roomID", "roomPassword", timeline, "bannerUrl", "logoUrl", "isDraft", version, "orgId",
          match_type, perspective, reserved_slots, entry_fee_amount, prize_pool_type,
          prize_pool_amount, prize_split_1st, prize_split_2nd, prize_split_3rd,
          prize_split_mvp, description, cover_image_url, lobby_start_time,
          mvp_enabled, mvp_amount, kill_reward_enabled, kill_reward_per_kill,
          prize_positions, sponsors_enabled, rounds_published
        ) SELECT
          $1, title, game, 'draft', 'bg-primary', 'DRAFT', '', prize, entry, '0',
          false, "orgName", "orgLogo", "orgHandle", "orgMotto",
          '', '', '',
          rules, chat, notices, teams, region, format, "slotsTotal", 0,
          '', '', timeline, "bannerUrl", "logoUrl", true, 1, $2,
          match_type, perspective, reserved_slots, entry_fee_amount, prize_pool_type,
          prize_pool_amount, prize_split_1st, prize_split_2nd, prize_split_3rd,
          prize_split_mvp, description, cover_image_url, lobby_start_time,
          mvp_enabled, mvp_amount, kill_reward_enabled, kill_reward_per_kill,
          prize_positions, sponsors_enabled, rounds_published
        FROM tournaments WHERE id = $3 RETURNING *`,
        [newId, authUser.id, srcId]
      );
      const dup = dbRes.rows[0];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, tournament: dup }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Duplicate tournament failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7j3. POST /api/tournaments/:id/archive — archive a tournament
  const archiveMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/archive$/);
  if (archiveMatch && req.method === 'POST') {
    const id = archiveMatch[1];
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const existRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
      if (existRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      const access = checkTournamentOrganizerAccess(authUser, existRes.rows[0]);
      if (!access.authorized) {
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
        return;
      }
      const archiveClient = await pool.connect();
      try {
        await archiveClient.query('BEGIN');
        const lockRes = await archiveClient.query('SELECT finalized_at FROM tournaments WHERE id = $1 FOR UPDATE', [id]);
        if (!lockRes.rows.length || lockRes.rows[0].finalized_at) {
          await archiveClient.query('ROLLBACK');
          res.writeHead(lockRes.rows.length ? 409 : 404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: lockRes.rows.length ? 'TOURNAMENT_FINALIZED' : 'NOT_FOUND', message: lockRes.rows.length ? 'A finalized tournament cannot be archived.' : 'Tournament not found.' }));
          return;
        }
        await archiveClient.query('UPDATE tournaments SET status = $1, "isDraft" = false WHERE id = $2', ['archived', id]);
        await archiveClient.query('COMMIT');
      } catch (txErr) {
        await archiveClient.query('ROLLBACK').catch(() => {});
        throw txErr;
      } finally {
        archiveClient.release();
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Tournament archived.' }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Archive tournament failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  const finalizeMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/finalize$/);
  if (finalizeMatch && req.method === 'POST') {
    const tournamentId = decodeURIComponent(finalizeMatch[1]);
    let client = null;
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
      }
      const ownerResult = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tournamentId]);
      if (!ownerResult.rows.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_NOT_FOUND', message: 'Tournament not found.' }));
      }
      if (ownerResult.rows[0].orgId !== authUser.id && !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only the tournament owner or an admin can finalize it.' }));
      }

      client = await pool.connect();
      await client.query('BEGIN');
      const outcome = await finalizeTournament(client, { tournamentId, actorId: authUser.id });
      await client.query('COMMIT');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ...outcome }));
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch { /* connection may already be closed */ }
      }
      if (err instanceof TournamentFinalizationError) {
        res.writeHead(err.status || 409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.code, message: err.message }));
      } else {
        console.error('[FINALIZATION] Could not finalize tournament:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'INTERNAL_ERROR', message: 'Could not finalize this tournament.' }));
      }
    } finally {
      client?.release();
    }
    return;
  }

  // Phase 9B: generate / list immutable prize-award obligations (no payout).
  const prizeAwardsGenerateMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/prize-awards\/generate$/);
  if (prizeAwardsGenerateMatch && req.method === 'POST') {
    const tournamentId = decodeURIComponent(prizeAwardsGenerateMatch[1]);
    let client = null;
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
      }
      const ownerResult = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tournamentId]);
      if (!ownerResult.rows.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_NOT_FOUND', message: 'Tournament not found.' }));
      }
      if (ownerResult.rows[0].orgId !== authUser.id && !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only the tournament owner or an admin can generate prize awards.' }));
      }

      // Ignore any client body — amounts, ranks, winners, and recipients are server-derived.
      client = await pool.connect();
      await client.query('BEGIN');
      const outcome = await generatePrizeAwards(client, { tournamentId, actorId: authUser.id });
      await client.query('COMMIT');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, ...outcome }));
    } catch (err) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch { /* connection may already be closed */ }
      }
      if (err instanceof PrizeAwardError) {
        res.writeHead(err.status || 409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.code, message: err.message }));
      } else {
        console.error('[PRIZE_AWARDS] Could not generate prize awards:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'INTERNAL_ERROR', message: 'Could not generate prize awards.' }));
      }
    } finally {
      client?.release();
    }
    return;
  }

  const prizeAwardsListMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/prize-awards$/);
  if (prizeAwardsListMatch && req.method === 'GET') {
    const tournamentId = decodeURIComponent(prizeAwardsListMatch[1]);
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
      }
      const ownerResult = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tournamentId]);
      if (!ownerResult.rows.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_NOT_FOUND', message: 'Tournament not found.' }));
      }
      if (ownerResult.rows[0].orgId !== authUser.id && !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only the tournament owner or an admin can view prize awards.' }));
      }

      const client = await pool.connect();
      try {
        const outcome = await listPrizeAwards(client, { tournamentId });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...outcome }));
      } finally {
        client.release();
      }
    } catch (err) {
      if (err instanceof PrizeAwardError) {
        res.writeHead(err.status || 409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.code, message: err.message }));
      } else {
        console.error('[PRIZE_AWARDS] Could not list prize awards:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'INTERNAL_ERROR', message: 'Could not list prize awards.' }));
      }
    }
    return;
  }

  const prizeAwardPayoutsMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/prize-awards\/payouts$/);
  if (prizeAwardPayoutsMatch && req.method === 'GET') {
    res.setHeader('Cache-Control', 'private, no-store');
    const tournamentId = decodeURIComponent(prizeAwardPayoutsMatch[1]);
    const authUser = getAuthUser(req);
    if (!authUser) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
    }
    try {
      const tournament = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tournamentId]);
      if (!tournament.rows.length) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_NOT_FOUND' }));
      }
      if (tournament.rows[0].orgId !== authUser.id && !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
      }
      const result = await pool.query(
        `SELECT a.id, a.tournament_id, a.team_id, a.rank, a.award_type, a.prize_amount,
                a.recipient_user_id, a.status, a.paid_at, a.recorded_by,
                tt.team_name, u.name AS recipient_name,
                COALESCE(p.recipient_upi_id, pp.upi_id) AS payout_upi_id,
                p.utr_reference
         FROM tournament_prize_awards a
         LEFT JOIN tournament_teams tt ON tt.id = a.team_id
         LEFT JOIN users u ON u.id = a.recipient_user_id
         LEFT JOIN user_payout_profiles pp ON pp.user_id = a.recipient_user_id
         LEFT JOIN tournament_prize_payments p ON p.prize_award_id = a.id
         WHERE a.tournament_id = $1 ORDER BY a.rank, a.award_type`,
        [tournamentId]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, payouts: result.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'INTERNAL_ERROR' }));
    }
    return;
  }

  const prizeAwardSettleMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/prize-awards\/([^/]+)\/settle$/);
  if (prizeAwardSettleMatch && req.method === 'POST') {
    const tournamentId = decodeURIComponent(prizeAwardSettleMatch[1]);
    const awardId = decodeURIComponent(prizeAwardSettleMatch[2]);
    const authUser = getAuthUser(req);
    if (!authUser) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
    }
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      let client;
      try {
        const payload = JSON.parse(body || '{}');
        client = await pool.connect();
        await client.query('BEGIN');
        const tournament = await client.query('SELECT "orgId" FROM tournaments WHERE id = $1 FOR UPDATE', [tournamentId]);
        if (!tournament.rows.length) {
          await client.query('ROLLBACK');
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_NOT_FOUND' }));
          return;
        }
        const authorized = tournament.rows[0].orgId === authUser.id || hasRole(authUser, ROLES.ADMIN);
        if (!authorized) {
          await client.query('ROLLBACK');
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const outcome = await settlePrizeAward(client, {
          tournamentId,
          awardId,
          actorId: authUser.id,
          actorIsAuthorized: true,
          utrReference: payload.utr_reference,
          manuallySent: payload.confirm_manual_payment === true,
          submittedAmount: payload.amount,
          upiIdUsed: payload.upi_id_used,
        });
        await client.query('COMMIT');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...outcome }));
      } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        if (err instanceof PrizePayoutError) {
          res.writeHead(err.status || 409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.code, message: err.message }));
        } else if (err instanceof SyntaxError) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Request body must be valid JSON.' }));
        } else {
          console.error('[PRIZE_PAYOUT] Could not record payout:', err.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INTERNAL_ERROR', message: 'Could not record the manual payout.' }));
        }
      } finally {
        client?.release();
      }
    });
    return;
  }

  // 7j4. POST /api/tournaments/:id/status — live transitions only; completion uses /finalize.
  const statusMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/status$/);
  if (statusMatch && req.method === 'POST') {
    const id = statusMatch[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
          return;
        }
        const tRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const t = tRes.rows[0];
        // Only the tournament owner or admin can change status
        const access = checkTournamentOrganizerAccess(authUser, t);
        if (!access.authorized) {
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
          return;
        }
        const bodyData = JSON.parse(body);
        const newStatus = (bodyData.status || '').toLowerCase();
        const currentStatus = (t.status || '').toLowerCase();

        // Validate transitions
        const LIVE_ALLOWED_FROM = ['upcoming', 'open', 'registration_open', 'closed', 'registration_closed'];
        if (newStatus === 'live') {
          if (currentStatus === 'live') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'ALREADY_LIVE', message: 'Tournament is already live.' }));
            return;
          }
          if (currentStatus === 'completed' || currentStatus === 'archived') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'CANNOT_MODIFY', message: 'Cannot modify a completed or archived tournament.' }));
            return;
          }
          if (t.isDraft) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'IS_DRAFT', message: 'Publish the tournament first.' }));
            return;
          }
          if (!LIVE_ALLOWED_FROM.includes(currentStatus)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'INVALID_TRANSITION', message: 'Tournament must be past registration closed state before going live.' }));
            return;
          }
        } else if (newStatus === 'completed') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FINALIZATION_REQUIRED', message: 'Use the validated tournament finalization action to mark this tournament completed.' }));
          return;
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_STATUS', message: 'Invalid status. Use "live".' }));
          return;
        }

        await pool.query('UPDATE tournaments SET status = $1 WHERE id = $2', [newStatus, id]);
        console.log(`\n🏆 [MATCH DISTRICT TOURNAMENT] Status updated: ${id} → ${newStatus} (by ${authUser.email})\n`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status: newStatus, message: `Tournament marked as ${newStatus}.` }));
      } catch (err) {
        console.warn('⚠️ [MATCH DISTRICT DB] Status update failed:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7j5. GET /api/tournaments/:id/analytics — get analytics for a tournament
  const analyticsMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/analytics$/);
  if (analyticsMatch && req.method === 'GET') {
    const id = analyticsMatch[1];
    try {
      const authUser = getAuthUser(req);
      const tRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
      if (tRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      const t = tRes.rows[0];
      if (authUser && t.orgId !== authUser.id && !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Access denied.' }));
        return;
      }
      const regRes = await pool.query(
        `SELECT status, COUNT(*)::int AS count FROM tournament_registrations WHERE tournament_id = $1 GROUP BY status`,
        [id]
      );
      const sponsorRes = await pool.query(
        `SELECT COALESCE(SUM(COALESCE(amount,0)),0) AS total, COUNT(*)::int AS count FROM sponsor_contributions WHERE tournament_id = $1 AND status = 'approved'`,
        [id]
      );
      const statusCounts = { pending: 0, pending_payment: 0, confirmed: 0, approved: 0, waitlisted: 0, rejected: 0, cancelled: 0, expired: 0 };
      regRes.rows.forEach((r) => { statusCounts[r.status] = r.count; });
      const totalReg = Object.values(statusCounts).reduce((a, b) => a + b, 0);
      const slotsTotal = parseInt(t.slotsTotal) || 100;
      const slotsFilled = parseInt(t.slotsFilled) || 0;
      const entryFee = parseInt(t.entry_fee_amount) || 0;
      const baseRevenue = entryFee * totalReg;
      const sponsorTotal = parseFloat(sponsorRes.rows[0]?.total) || 0;
      const conversionRate = slotsTotal > 0 ? Math.round((slotsFilled / slotsTotal) * 100) : 0;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        analytics: {
          totalRegistrations: totalReg,
          statusBreakdown: statusCounts,
          totalRevenue: baseRevenue,
          sponsorContributions: sponsorTotal,
          prizePool: parseInt(t.prize_pool_amount) || 0,
          conversionRate,
          slotsTotal,
          slotsFilled,
          registrationProgress: slotsTotal > 0 ? Math.round((slotsFilled / slotsTotal) * 100) : 0,
        }
      }));
    } catch (err) {
      console.warn('⚠️ [MATCH DISTRICT DB] Analytics fetch failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7k_plan. GET /api/tournaments/:id/planning-config — retrieve planning config (owner or admin)
  const planningConfigGetMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/planning-config$/);
  if (planningConfigGetMatch && req.method === 'GET') {
    const tId = decodeURIComponent(planningConfigGetMatch[1]);
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
        return;
      }
      // Verify tournament exists and user owns it (or is admin)
      const tRes = await pool.query('SELECT "orgId", "slotsTotal", match_type, perspective FROM tournaments WHERE id = $1', [tId]);
      if (tRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      const access = checkTournamentOrganizerAccess(authUser, tRes.rows[0]);
      if (!access.authorized) {
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
        return;
      }
      const cfgRes = await pool.query(
        'SELECT * FROM tournament_planning_config WHERE tournament_id = $1',
        [tId]
      );
      const slots = parseInt(tRes.rows[0].slotsTotal, 10);
      const teamSize = ({ solo: 1, duo: 2, squad: 4 })[String(tRes.rows[0].match_type || 'squad').toLowerCase()] || 4;
      const savedConfig = cfgRes.rows.length > 0 ? cfgRes.rows[0] : null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        config: savedConfig ? { ...savedConfig, expected_teams: slots, maximum_teams: slots, players_per_team: teamSize } : null,
        tournament: {
          slotsTotal: tRes.rows[0].slotsTotal,
          match_type: tRes.rows[0].match_type,
          perspective: tRes.rows[0].perspective,
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7k_plan2. POST /api/tournaments/:id/planning-config — upsert planning config (owner or admin)
  const planningConfigPostMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/planning-config$/);
  if (planningConfigPostMatch && req.method === 'POST') {
    const tId = decodeURIComponent(planningConfigPostMatch[1]);
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
          return;
        }
        if (!requireOrganizer(req, res, authUser)) return;

        // Verify tournament ownership
        const tRes = await pool.query('SELECT "orgId", title, finalized_at, status, "slotsTotal", match_type FROM tournaments WHERE id = $1', [tId]);
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const access = checkTournamentOrganizerAccess(authUser, tRes.rows[0]);
        if (!access.authorized) {
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
          return;
        }

        if (tRes.rows[0].finalized_at) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament planning configuration is locked.' }));
          return;
        }

        const cfg = JSON.parse(body || '{}');

        // ── Server-side validation ──────────────────────────────────────────
        const validationErrors = {};

        // Helper: parse positive integer
        function parsePositiveInt(val, fieldName, allowZero = false) {
          const n = Number(val);
          if (!Number.isFinite(n) || !Number.isInteger(n)) return `${fieldName} must be a whole number.`;
          if (allowZero && n < 0) return `${fieldName} must be 0 or greater.`;
          if (!allowZero && n <= 0) return `${fieldName} must be greater than 0.`;
          return null;
        }

        const tournamentCapacity = parseInt(tRes.rows[0].slotsTotal, 10);
        const matchType = String(tRes.rows[0].match_type || 'squad').toLowerCase();
        const playersPerTeam = ({ solo: 1, duo: 2, squad: 4 })[matchType] || 4;
        const expectedTeams = tournamentCapacity;
        const maximumTeams = tournamentCapacity;

        const fields = [
          ['expected_teams',              expectedTeams,                    false],
          ['maximum_teams',               maximumTeams,                     false],
          ['players_per_team',            playersPerTeam,                   false],
          ['teams_per_room',              cfg.teams_per_room,              false],
          ['max_simultaneous_rooms',      cfg.max_simultaneous_rooms,      false],
          ['matches_per_team',            cfg.matches_per_team,            false],
          ['match_duration_minutes',      cfg.match_duration_minutes,      false],
          ['break_between_matches_minutes', cfg.break_between_matches_minutes, true],
        ];

        for (const [field, val, allowZero] of fields) {
          const errMsg = parsePositiveInt(val, field, allowZero);
          if (errMsg) validationErrors[field] = errMsg;
        }

        // maximum_teams must be >= expected_teams
        if (!validationErrors.expected_teams && !validationErrors.maximum_teams) {
          if (maximumTeams < expectedTeams) {
            validationErrors.maximum_teams = 'Maximum teams cannot be lower than expected teams.';
          }
        }

        // Validate time fields
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!cfg.daily_start_time || !timeRegex.test(cfg.daily_start_time)) {
          validationErrors.daily_start_time = 'Daily start time must be a valid time (HH:MM).';
        }
        if (!cfg.daily_end_time || !timeRegex.test(cfg.daily_end_time)) {
          validationErrors.daily_end_time = 'Daily end time must be a valid time (HH:MM).';
        }
        if (!validationErrors.daily_start_time && !validationErrors.daily_end_time) {
          const [sh, sm] = cfg.daily_start_time.split(':').map(Number);
          const [eh, em] = cfg.daily_end_time.split(':').map(Number);
          const startMins = sh * 60 + sm;
          const endMins   = eh * 60 + em;
          if (endMins <= startMins) {
            validationErrors.daily_end_time = 'Daily end time must be later than the start time.';
          }
        }

        // max_matches_per_day is optional — validate only if provided
        if (cfg.max_matches_per_day !== undefined && cfg.max_matches_per_day !== null && cfg.max_matches_per_day !== '') {
          const mmpd = parseInt(cfg.max_matches_per_day, 10);
          if (!Number.isFinite(mmpd) || !Number.isInteger(mmpd) || mmpd <= 0) {
            validationErrors.max_matches_per_day = 'Max matches per day must be a positive integer if provided.';
          }
        }

        if (Object.keys(validationErrors).length > 0) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'VALIDATION_ERROR', errors: validationErrors }));
          return;
        }

        // ── Upsert config ──────────────────────────────────────────────────
        const configId = 'PC-' + tId.slice(-8) + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
        const maxMatchesPerDay = (cfg.max_matches_per_day !== undefined && cfg.max_matches_per_day !== null && cfg.max_matches_per_day !== '')
          ? parseInt(cfg.max_matches_per_day, 10) : null;

        const updateClient = await pool.connect();
        let dbRes;
        try {
          await updateClient.query('BEGIN');
          const lockRes = await updateClient.query('SELECT finalized_at, status FROM tournaments WHERE id = $1 FOR UPDATE', [tId]);
          if (!lockRes.rows.length || lockRes.rows[0].finalized_at) {
            await updateClient.query('ROLLBACK');
            res.writeHead(lockRes.rows.length ? 409 : 404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: lockRes.rows.length ? 'TOURNAMENT_FINALIZED' : 'NOT_FOUND', message: lockRes.rows.length ? 'Finalized tournament planning configuration is locked.' : 'Tournament not found.' }));
            return;
          }
          dbRes = await updateClient.query(
          `INSERT INTO tournament_planning_config (
            id, tournament_id,
            teams_per_room, max_simultaneous_rooms, matches_per_team,
            match_duration_minutes, break_between_matches_minutes,
            daily_start_time, daily_end_time, max_matches_per_day,
            config_status, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'configured', NOW(), NOW())
          ON CONFLICT (tournament_id) DO UPDATE SET
            teams_per_room = EXCLUDED.teams_per_room,
            max_simultaneous_rooms = EXCLUDED.max_simultaneous_rooms,
            matches_per_team = EXCLUDED.matches_per_team,
            match_duration_minutes = EXCLUDED.match_duration_minutes,
            break_between_matches_minutes = EXCLUDED.break_between_matches_minutes,
            daily_start_time = EXCLUDED.daily_start_time,
            daily_end_time   = EXCLUDED.daily_end_time,
            max_matches_per_day = EXCLUDED.max_matches_per_day,
            config_status = EXCLUDED.config_status,
            updated_at = NOW()
          RETURNING *`,
          [
            configId,
            tId,
            parseInt(cfg.teams_per_room, 10),
            parseInt(cfg.max_simultaneous_rooms, 10),
            parseInt(cfg.matches_per_team, 10),
            parseInt(cfg.match_duration_minutes, 10),
            parseInt(cfg.break_between_matches_minutes, 10),
            cfg.daily_start_time,
            cfg.daily_end_time,
            maxMatchesPerDay,
          ]
          );
          await updateClient.query('COMMIT');
        } catch (txErr) {
          await updateClient.query('ROLLBACK').catch(() => {});
          throw txErr;
        } finally {
          updateClient.release();
        }

        console.log(`\n📋 [PLANNING CONFIG] Saved for tournament ${tId}\n`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          config: {
            ...dbRes.rows[0],
            expected_teams: tournamentCapacity,
            maximum_teams: tournamentCapacity,
            players_per_team: playersPerTeam,
          }
        }));
      } catch (err) {
        console.error('❌ [PLANNING CONFIG] Save failed:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7k_plan3. POST /api/tournaments/:id/planning-result/generate — Generate capacity plan (owner or admin)
  const planningGenerateMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/planning-result\/generate$/);
  if (planningGenerateMatch && req.method === 'POST') {
    const tId = decodeURIComponent(planningGenerateMatch[1]);
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
      }
      // Check organizer
      const oRes = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tId]);
      if (oRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
      }
      const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
      if (!access.authorized) {
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
      }

      // 1. Fetch tournament
      const tRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [tId]);
      const tournament = tRes.rows[0];

      if (tournament.finalized_at) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament planning is locked.' }));
      }

      // 2. Fetch config
      const cfgRes = await pool.query('SELECT * FROM tournament_planning_config WHERE tournament_id = $1', [tId]);
      if (cfgRes.rows.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NO_CONFIG', message: 'Tournament planning configuration is missing.' }));
      }
      const config = cfgRes.rows[0];

      // 3. Generate Plan
      // 3a. Materialize Round/Stage definitions (idempotent one-way sync from the
      //     Step 6 timeline) so the plan is computed against the real round
      //     structure (teams_advancing drives which teams enter each round).
      const roundRowsForPlan = await syncTournamentRounds(pool, tournament);
      const result = calculateTournamentPlan(config, tournament, roundRowsForPlan);
      if (!result.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'INFEASIBLE', messages: result.errors }));
      }

      // 4. Determine new version
      const vRes = await pool.query('SELECT COALESCE(MAX(plan_version), 0) as max_v FROM tournament_planning_result WHERE tournament_id = $1', [tId]);
      const nextVersion = parseInt(vRes.rows[0].max_v, 10) + 1;

      const p = result.plan;
      const insertQuery = `
        INSERT INTO tournament_planning_result (
          id, tournament_id, config_snapshot, planning_team_count, expected_teams, required_rooms,
          max_simultaneous_rooms, teams_per_room, matches_per_team, total_room_sessions,
          match_duration_minutes, break_between_matches_minutes, daily_operating_minutes,
          match_slot_minutes, sequential_slots_per_room, calculated_daily_capacity,
          configured_max_per_day, effective_daily_capacity, required_days,
          tournament_start_date, tournament_end_date, daily_plan, round_plan,
          plan_version, plan_status, generated_by, generated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, 'generated', $25, NOW()
        ) RETURNING *;
      `;
      const resDb = await pool.query(insertQuery, [
        generateId(), tId, JSON.stringify(p.configSnapshot), p.planningTeamCount, p.expectedTeams, p.requiredRooms,
        p.maxSimultaneousRooms, p.teamsPerRoom, p.matchesPerTeam, p.totalRoomMatchSessions,
        p.matchDurationMinutes, p.breakBetweenMatchesMinutes, p.dailyOperatingMinutes,
        p.matchSlotMinutes, p.sequentialSlotsPerRoom, p.calculatedDailyCapacity,
        p.configuredMaxPerDay, p.effectiveDailyCapacity, p.requiredDays,
        p.startDate, p.endDate, JSON.stringify(p.dailyPlan),
        JSON.stringify(p.round_plan || { rounds: [], days: [], summary: [], warnings: [] }),
        nextVersion, authUser.id
      ]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, result: resDb.rows[0] }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7k_plan4. GET /api/tournaments/:id/planning-result — Get current plan (owner or admin)
  const planningGetResultMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/planning-result$/);
  if (planningGetResultMatch && req.method === 'GET') {
    const tId = decodeURIComponent(planningGetResultMatch[1]);
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      const oRes = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tId]);
      if (oRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
      }
      const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
      if (!access.authorized) {
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
      }
      
        const resDb = await pool.query(
        'SELECT * FROM tournament_planning_result WHERE tournament_id = $1 ORDER BY plan_version DESC LIMIT 1',
        [tId]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        result: resDb.rows.length > 0 ? resDb.rows[0] : null
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7k_plan5. POST /api/tournaments/:id/planning-result/approve — Approve plan
  const planningApproveMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/planning-result\/approve$/);
  if (planningApproveMatch && req.method === 'POST') {
    const tId = decodeURIComponent(planningApproveMatch[1]);
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      // Check organizer
      const oRes = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tId]);
      if (oRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
      }
      const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
      if (!access.authorized) {
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
      }

      const resDb = await pool.query(`
        UPDATE tournament_planning_result 
        SET plan_status = 'approved', approved_by = $1, approved_at = NOW()
        WHERE tournament_id = $2 AND plan_status = 'generated'
        AND plan_version = (SELECT MAX(plan_version) FROM tournament_planning_result WHERE tournament_id = $2)
        RETURNING *;
      `, [authUser.id, tId]);

      if (resDb.rows.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'INVALID_STATE', message: 'No valid generated plan found to approve.' }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, result: resDb.rows[0] }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7k_road1. POST /api/tournaments/:id/roadmap/generate — Generate roadmap (group-based, no planning result required)
  const roadmapGenerateMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/roadmap\/generate$/);
  if (roadmapGenerateMatch && req.method === 'POST') {
    const tId = decodeURIComponent(roadmapGenerateMatch[1]);
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      const oRes = await pool.query('SELECT "orgId", roadmap_status, finalized_at, status FROM tournaments WHERE id = $1', [tId]);
      if (oRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
      }
      const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
      if (!access.authorized) {
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
      }
      if (oRes.rows[0].finalized_at) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
      }

      // Check if tournament has any verified match results
      const resCheck = await pool.query(
        `SELECT 1 FROM tournament_match_results WHERE tournament_id = $1 LIMIT 1`,
        [tId]
      );
      if (resCheck.rows.length > 0) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          error: 'ROADMAP_LOCKED_RESULTS_EXIST',
          message: 'Cannot regenerate roadmap: tournament has recorded match results.',
        }));
      }

      // 1. Fetch full tournament row — generator reads slotsTotal + teams_per_group + config
      const tRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [tId]);
      if (tRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
      }
      const tournament = tRes.rows[0];

      // Optional body: { mode: 'auto_only' | 'regenerate_all' }
      const genBody = await new Promise((resolve) => {
        let b = '';
        req.on('data', (c) => { b += c; });
        req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
      });
      const requestedMode = genBody && (genBody.mode === 'regenerate_all' || genBody.mode === 'auto_only') ? genBody.mode : null;

      // 2. Generate roadmap — purely group-based, no planningResult required
      const result = generateTournamentRoadmap({ ...tournament, ...(genBody && typeof genBody === 'object' ? genBody : {}) });
      if (!result.ok) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'ROADMAP_ERROR', message: result.error }));
      }

      const { rounds, days, groups, rooms, matches } = result.roadmap;

      if (genBody && genBody.draft_only) {
        const structured_rounds = buildHierarchicalRoadmap(rounds, days, groups, matches);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          draft_only: true,
          roadmap: {
            rounds,
            days,
            groups,
            rooms,
            matches,
            structured_rounds,
            meta: result.roadmap.meta,
          },
        }));
      }

      // 3. Atomic Database Transaction
      const dbClient = await pool.connect();
      try {
        await dbClient.query('BEGIN');

        const lockRes = await dbClient.query('SELECT roadmap_status, finalized_at, status FROM tournaments WHERE id = $1 FOR UPDATE', [tId]);
        if (!lockRes.rows.length || lockRes.rows[0].finalized_at) {
          await dbClient.query('ROLLBACK');
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
        }

        // Snapshot manual matches + the round each belongs to so they can be
        // preserved (re-homed) across an automatic regeneration.
        const exMatchRes = await dbClient.query('SELECT * FROM tournament_matches WHERE tournament_id = $1', [tId]);
        const exRoundsRes = await dbClient.query('SELECT id, round_number FROM tournament_rounds WHERE tournament_id = $1', [tId]);
        const oldRoundNumber = new Map(exRoundsRes.rows.map((r) => [r.id, r.round_number]));
        const manualMatches = exMatchRes.rows.filter((m) => m.origin === 'manual');
        const mode = requestedMode || (manualMatches.length > 0 ? 'auto_only' : 'regenerate_all');
        const preserveManual = mode === 'auto_only' && manualMatches.length > 0;

        // Delete any existing draft roadmap explicitly
        await dbClient.query('DELETE FROM tournament_matches WHERE tournament_id = $1', [tId]);
        await dbClient.query('DELETE FROM tournament_rooms WHERE tournament_id = $1', [tId]);
        await dbClient.query('DELETE FROM tournament_groups WHERE tournament_id = $1', [tId]);
        await dbClient.query('DELETE FROM tournament_days WHERE tournament_id = $1', [tId]);
        await dbClient.query('DELETE FROM tournament_rounds WHERE tournament_id = $1', [tId]);

        for (const r of (rounds || [])) {
          await dbClient.query(`
            INSERT INTO tournament_rounds (
              id, tournament_id, round_number, name, status, teams_advancing,
              "date", "time", map, round_type, advancement_type,
              teams_advancing_per_district, teams_in
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          `, [
            r.id, r.tournament_id, r.round_number, r.name, r.status || 'configured',
            r.teams_advancing, r.date, r.time, r.map || null,
            r.round_type || (r.is_grand_final ? 'grand_final' : 'qualifier'),
            r.advancement_type || null,
            r.teams_advancing_per_district || null,
            r.teams_in || null,
          ]);
        }

        for (const d of (days || [])) {
          await dbClient.query(`
            INSERT INTO tournament_days (id, tournament_id, day_number, date, round_id)
            VALUES ($1, $2, $3, $4, $5)
          `, [d.id, d.tournament_id, d.day_number, d.date || null, d.round_id || null]);
        }

        for (const g of (groups || [])) {
          await dbClient.query(`
            INSERT INTO tournament_groups (id, day_id, tournament_id, group_name, sequence, round_id)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [g.id, g.day_id, g.tournament_id, g.group_name, g.sequence, g.round_id || null]);
        }

        for (const r of (rooms || [])) {
          await dbClient.query(`
            INSERT INTO tournament_rooms (id, group_id, day_id, tournament_id, room_number, capacity, status, round_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [r.id, r.group_id, r.day_id, r.tournament_id, r.room_number, r.capacity || 16, r.status || 'DRAFT', r.round_id || null]);
        }

        // Phase 1: Insert all matches with next_match_id = NULL
        for (const m of (matches || [])) {
          await dbClient.query(`
            INSERT INTO tournament_matches (id, room_id, group_id, day_id, tournament_id, match_number, start_time, end_time, status, round_id, map, id_pwd_release_time, next_round_id, teams_advancing)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          `, [m.id, m.room_id || null, m.group_id || null, m.day_id || null, m.tournament_id, m.match_number, m.start_time, m.end_time || '', m.status || 'PENDING', m.round_id || null, m.map || 'Erangel', m.id_pwd_release_time || null, m.next_round_id || null, m.teams_advancing || null]);
        }

        // Phase 2: Populate progression links (next_match_id) now that destination matches exist
        for (const m of (matches || [])) {
          if (m.next_match_id) {
            await dbClient.query(`
              UPDATE tournament_matches
              SET next_match_id = $1
              WHERE id = $2
            `, [m.next_match_id, m.id]);
          }
        }

        // Preserve organizer-authored manual matches: re-home each to the new
        // round with the same round_number (fallback: last non-final round) and
        // that round's first day. Configuration is kept; credentials/results are
        // never carried over.
        let preservedManual = 0;
        if (preserveManual) {
          const nonFinalRounds = rounds.filter((r) => !r.is_grand_final);
          const nextNumberByRound = new Map();
          for (const m of (matches || [])) {
            const cur = nextNumberByRound.get(m.round_id) || 0;
            nextNumberByRound.set(m.round_id, Math.max(cur, m.match_number || 0));
          }
          for (const mm of manualMatches) {
            const rn = oldRoundNumber.get(mm.round_id);
            const targetRound = (rn != null && rounds.find((r) => r.round_number === rn))
              || nonFinalRounds[nonFinalRounds.length - 1]
              || rounds[rounds.length - 1];
            if (!targetRound) continue;
            const targetDay = (days || []).find((d) => d.round_id === targetRound.id) || null;
            const nextNumber = (nextNumberByRound.get(targetRound.id) || 0) + 1;
            nextNumberByRound.set(targetRound.id, nextNumber);
            const newId = `MAT-${crypto.randomBytes(8).toString('hex')}`;
            await dbClient.query(`
              INSERT INTO tournament_matches
                (id, room_id, group_id, day_id, tournament_id, match_number, start_time, end_time, status, round_id, map, id_pwd_release_time, next_round_id, teams_advancing, group_name, origin, manual_override, notes)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
            `, [
              newId, null, null, targetDay ? targetDay.id : null, tId, nextNumber,
              mm.start_time, mm.end_time || '', mm.status || 'PENDING', targetRound.id,
              mm.map || null, mm.id_pwd_release_time || null, null, mm.teams_advancing || null,
              mm.group_name || null, 'manual', true, mm.notes || null,
            ]);
            preservedManual += 1;
          }
        }

        await dbClient.query(`UPDATE tournaments SET roadmap_status = 'draft' WHERE id = $1`, [tId]);

        await dbClient.query('COMMIT');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, roadmap: result.roadmap, mode, preserved_manual: preservedManual }));
      } catch (txnErr) {
        await dbClient.query('ROLLBACK');
        throw txnErr;
      } finally {
        dbClient.release();
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7k_road1b. GET /api/tournaments/:id/roadmap/districts — Automatically retrieve tournament districts from DB
  const roadmapDistrictsMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/roadmap\/districts$/);
  if (roadmapDistrictsMatch && req.method === 'GET') {
    const tId = decodeURIComponent(roadmapDistrictsMatch[1]);
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
      }

      const tCheck = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tId]);
      if (tCheck.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
      }

      const access = checkTournamentOrganizerAccess(authUser, tCheck.rows[0]);
      if (!access.authorized) {
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
      }

      const districtsData = await getTournamentDistricts(pool, tId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, ...districtsData }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // 7k_road1c. POST /api/tournaments/:id/roadmap/draft & POST /roadmap/save — Save manual roadmap draft
  const roadmapDraftMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/roadmap\/(draft|save)$/);
  if (roadmapDraftMatch && req.method === 'POST') {
    const tId = decodeURIComponent(roadmapDraftMatch[1]);
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        }
        const oRes = await pool.query('SELECT "orgId", roadmap_status, finalized_at, status, timeline FROM tournaments WHERE id = $1', [tId]);
        if (oRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        }
        const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
        if (!access.authorized) {
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
        }
        if (oRes.rows[0].finalized_at) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
        }

        const payload = JSON.parse(body || '{}');
        const roadmapData = payload.roadmap || payload;

        const dbClient = await pool.connect();
        try {
          await dbClient.query('BEGIN');
          await saveManualRoadmapDraft(dbClient, tId, roadmapData);
          await dbClient.query('COMMIT');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, message: 'Draft saved successfully.' }));
        } catch (saveTxnErr) {
          await dbClient.query('ROLLBACK').catch(() => {});
          throw saveTxnErr;
        } finally {
          dbClient.release();
        }
      } catch (err) {
        console.error('Roadmap draft save error:', err);
        if (err.code === 'ROUND_STRUCTURALLY_LOCKED' || err.code === 'DAY_LOCKED' || err.code === 'MATCH_LOCKED' || err.code === 'ROOM_LOCKED') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: err.code, message: err.message, serverError: err.message }));
        }
        if (err.code === '23505' || (err.message && err.message.includes('unique constraint'))) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            error: 'DATABASE_UNIQUE_VIOLATION',
            serverError: 'A scheduling conflict occurred while saving room or match numbering. Please try saving again.',
            message: 'A scheduling conflict occurred while saving room or match numbering. Please try saving again.'
          }));
        }
        if (err.code && /^[0-9A-Z]{5}$/.test(err.code)) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            error: 'DATABASE_ERROR',
            serverError: 'Could not save roadmap: server error',
            message: 'Could not save roadmap: server error'
          }));
        }
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'INTERNAL_ERROR', serverError: 'Could not save roadmap: server error', message: 'Could not save roadmap: server error' }));
      }
    });
    return;
  }

  // 7k_road1d. POST /api/tournaments/:id/roadmap/publish & POST /roadmap/approve — Validate and publish manual roadmap
  const roadmapPublishMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/roadmap\/(publish|approve)$/);
  if (roadmapPublishMatch && req.method === 'POST') {
    const tId = decodeURIComponent(roadmapPublishMatch[1]);
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        }
        const oRes = await pool.query('SELECT "orgId", roadmap_status, finalized_at, status, "slotsTotal", teams_per_group, teams_per_match FROM tournaments WHERE id = $1', [tId]);
        if (oRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        }
        const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
        if (!access.authorized) {
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
        }
        if (oRes.rows[0].finalized_at) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
        }

        const payload = JSON.parse(body || '{}');
        let roadmapData = payload.roadmap || payload;

        // If body didn't contain explicit roadmap data (e.g. legacy approve call), load current DB state
        if (!roadmapData || !Array.isArray(roadmapData.rounds) || roadmapData.rounds.length === 0) {
          const rounds = await getTournamentRounds(pool, tId);
          const daysQuery = await pool.query('SELECT * FROM tournament_days WHERE tournament_id = $1', [tId]);
          const groupsQuery = await pool.query('SELECT * FROM tournament_groups WHERE tournament_id = $1', [tId]);
          const matchesQuery = await pool.query('SELECT * FROM tournament_matches WHERE tournament_id = $1', [tId]);
          roadmapData = {
            rounds: buildHierarchicalRoadmap(rounds, daysQuery.rows, groupsQuery.rows, matchesQuery.rows),
          };
        }

        const slotsTotal = parseInt(oRes.rows[0].slotsTotal, 10) || 64;
        const teamsPerGroup = parseInt(oRes.rows[0].teams_per_group || oRes.rows[0].teams_per_match, 10) || DEFAULT_TEAMS_PER_GROUP;

        // Validate complete roadmap
        const validation = validateManualRoadmap(roadmapData, {
          isPublish: true,
          slotsTotal,
          teams_per_group: teamsPerGroup,
        });
        if (!validation.valid) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            error: 'ROADMAP_VALIDATION_FAILED',
            message: 'Roadmap has validation errors that prevent publication.',
            errors: validation.errors,
            warnings: validation.warnings,
          }));
        }

        const publishClient = await pool.connect();
        try {
          await publishClient.query('BEGIN');
          const result = await publishManualRoadmap(publishClient, tId, roadmapData);
          await publishClient.query('COMMIT');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            status: 'published',
            message: 'Roadmap published successfully.',
            warnings: validation.warnings,
          }));
        } catch (publishErr) {
          await publishClient.query('ROLLBACK').catch(() => {});
          throw publishErr;
        } finally {
          publishClient.release();
        }
      } catch (err) {
        console.error('Roadmap publish error:', err);
        if (err.code === 'ROUND_STRUCTURALLY_LOCKED' || err.code === 'DAY_LOCKED' || err.code === 'MATCH_LOCKED' || err.code === 'ROOM_LOCKED') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: err.code, message: err.message, serverError: err.message }));
        }
        if (err.code === '23505' || (err.message && err.message.includes('unique constraint'))) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            error: 'DATABASE_UNIQUE_VIOLATION',
            serverError: 'A scheduling conflict occurred while publishing the roadmap. Please try publishing again.',
            message: 'A scheduling conflict occurred while publishing the roadmap. Please try publishing again.'
          }));
        }
        if (err.code && /^[0-9A-Z]{5}$/.test(err.code)) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            error: 'DATABASE_ERROR',
            serverError: 'Could not publish roadmap: server error',
            message: 'Could not publish roadmap: server error'
          }));
        }
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'INTERNAL_ERROR', serverError: 'Could not publish roadmap: server error', message: 'Could not publish roadmap: server error' }));
      }
    });
    return;
  }

  // 7k_road1e. POST /api/tournaments/:id/roadmap/unpublish — Revert roadmap to draft
  const roadmapUnpublishMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/roadmap\/unpublish$/);
  if (roadmapUnpublishMatch && req.method === 'POST') {
    const tId = decodeURIComponent(roadmapUnpublishMatch[1]);
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      const oRes = await pool.query('SELECT "orgId", roadmap_status, finalized_at, status FROM tournaments WHERE id = $1', [tId]);
      if (oRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
      }
      const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
      if (!access.authorized) {
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
      }
      if (oRes.rows[0].finalized_at) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
      }

      await unpublishManualRoadmap(pool, tId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, status: 'draft', message: 'Roadmap unpublished. Now visible only as draft.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // 7k_road1f. DELETE /api/tournaments/:id/roadmap — Master Delete Roadmap
  const roadmapMasterDeleteMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/roadmap$/);
  if (roadmapMasterDeleteMatch && req.method === 'DELETE') {
    const tId = decodeURIComponent(roadmapMasterDeleteMatch[1]);
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      const oRes = await pool.query('SELECT "orgId", roadmap_status, finalized_at, status FROM tournaments WHERE id = $1', [tId]);
      if (oRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
      }
      const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
      if (!access.authorized) {
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
      }
      if (oRes.rows[0].finalized_at) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await deleteEntireRoadmap(client, tId);
        await client.query('COMMIT');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (delErr) {
        await client.query('ROLLBACK').catch(() => {});
        if (delErr.code === 'ROADMAP_HAS_RESULTS' || delErr.code === 'ROADMAP_HAS_ASSIGNMENTS') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: delErr.code, message: delErr.message }));
        }
        if (delErr.code === 'TOURNAMENT_NOT_FOUND') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: delErr.code, message: delErr.message }));
        }
        if (delErr.code === 'TOURNAMENT_FINALIZED') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: delErr.code, message: delErr.message }));
        }
        throw delErr;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('Roadmap master deletion error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'INTERNAL_ERROR', message: err.message || 'Failed to delete roadmap.' }));
    }
  }

  // 7k_road1g. DELETE /api/tournaments/:id/roadmap/rounds/:roundId — Delete a specific round
  const roadmapRoundDeleteMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/roadmap\/rounds\/([^/]+)$/);
  if (roadmapRoundDeleteMatch && req.method === 'DELETE') {
    const tId = decodeURIComponent(roadmapRoundDeleteMatch[1]);
    const roundId = decodeURIComponent(roadmapRoundDeleteMatch[2]);
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      const oRes = await pool.query('SELECT "orgId", roadmap_status, finalized_at, status FROM tournaments WHERE id = $1', [tId]);
      if (oRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
      }
      const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
      if (!access.authorized) {
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
      }
      if (oRes.rows[0].finalized_at) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await deleteTournamentRound(client, tId, roundId);
        await client.query('COMMIT');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (delErr) {
        await client.query('ROLLBACK').catch(() => {});
        if (delErr.code === 'ROUND_HAS_RESULTS' || delErr.code === 'MINIMUM_ROUNDS_REQUIRED') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: delErr.code, message: delErr.message }));
        }
        if (delErr.code === 'ROUND_NOT_FOUND') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: delErr.code, message: delErr.message }));
        }
        throw delErr;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error('Roadmap round deletion error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: 'INTERNAL_ERROR', message: err.message || 'Failed to delete round.' }));
    }
  }

  // 7k_road1h. POST /api/tournaments/:id/roadmap/days/:dayId/allocations/reorder & /allocations/reorder — Reorder district allocations within a match day
  const roadmapAllocReorderMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/roadmap\/(?:days\/([^/]+)\/)?allocations\/reorder$/);
  if (roadmapAllocReorderMatch && req.method === 'POST') {
    const tId = decodeURIComponent(roadmapAllocReorderMatch[1]);
    const routeDayId = roadmapAllocReorderMatch[2] ? decodeURIComponent(roadmapAllocReorderMatch[2]) : null;
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        }
        const oRes = await pool.query('SELECT "orgId", roadmap_status, finalized_at, status FROM tournaments WHERE id = $1', [tId]);
        if (oRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        }
        const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
        if (!access.authorized) {
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
        }
        if (oRes.rows[0].finalized_at) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
        }

        const payload = JSON.parse(body || '{}');
        const dayId = routeDayId || payload.day_id;
        const orderedGroupIds = Array.isArray(payload.ordered_group_ids) ? payload.ordered_group_ids
          : Array.isArray(payload.ordered_allocation_ids) ? payload.ordered_allocation_ids
          : Array.isArray(payload.ordered_ids) ? payload.ordered_ids
          : null;

        if (!dayId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'day_id is required.' }));
        }
        if (!orderedGroupIds || orderedGroupIds.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'ordered_group_ids must be a non-empty array.' }));
        }

        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const result = await reorderDistrictAllocations(client, tId, dayId, orderedGroupIds);
          await client.query('COMMIT');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result));
        } catch (reorderErr) {
          await client.query('ROLLBACK').catch(() => {});
          if (reorderErr.code === 'DAY_NOT_FOUND' || reorderErr.code === 'INVALID_ALLOCATION' || reorderErr.code === 'INVALID_INPUT') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: reorderErr.code, message: reorderErr.message }));
          }
          throw reorderErr;
        } finally {
          client.release();
        }
      } catch (err) {
        console.error('Roadmap allocation reorder error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'INTERNAL_ERROR', message: err.message || 'Failed to reorder allocations.' }));
      }
    });
    return;
  }

  // 7k_road2. GET /api/tournaments/:id/roadmap — Fetch roadmap (privacy-gated for participants)
  const roadmapGetMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/roadmap$/);
  if (roadmapGetMatch && req.method === 'GET') {
    const tId = decodeURIComponent(roadmapGetMatch[1]);
    try {
      const authUser = getAuthUser(req);
      const result = await getTournamentRoadmapResponse(pool, tId, authUser, Date.now());
      res.writeHead(result.statusCode, {
        'Content-Type': 'application/json',
        'Cache-Control': result.headers?.['Cache-Control'] || 'private, no-cache, must-revalidate',
        ...(result.headers || {}),
      });
      return res.end(JSON.stringify(result.body));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // 7k_road3b. POST /api/tournaments/:id/roadmap/validate — Run validation
  const roadmapValidateMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/roadmap\/validate$/);
  if (roadmapValidateMatch && req.method === 'POST') {
    const tId = decodeURIComponent(roadmapValidateMatch[1]);
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        }
        const oRes = await pool.query('SELECT "orgId", roadmap_status FROM tournaments WHERE id = $1', [tId]);
        if (oRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        }
        const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
        if (!access.authorized) {
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
        }

        const payload = JSON.parse(body || '{}');
        if (payload.roadmap) {
          const val = validateManualRoadmap(payload.roadmap);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: true,
            valid: val.valid,
            errors: val.errors,
            warnings: val.warnings,
          }));
        }

        const cfgRes = await pool.query('SELECT * FROM tournament_planning_config WHERE tournament_id = $1', [tId]);
        const rounds = await getTournamentRounds(pool, tId);
        const daysQuery = await pool.query('SELECT * FROM tournament_days WHERE tournament_id = $1', [tId]);
        const groupsQuery = await pool.query('SELECT * FROM tournament_groups WHERE tournament_id = $1', [tId]);
        const roomsQuery = await pool.query('SELECT * FROM tournament_rooms WHERE tournament_id = $1', [tId]);
        const matchesQuery = await pool.query('SELECT * FROM tournament_matches WHERE tournament_id = $1', [tId]);

        const validation = validateRoadmapStructure({
          days: daysQuery.rows,
          groups: groupsQuery.rows,
          rooms: roomsQuery.rows,
          matches: matchesQuery.rows,
          config: cfgRes.rows[0] || {},
          rounds
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: true,
          valid: validation.errors.length === 0,
          errors: validation.errors,
          warnings: validation.warnings
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7k_road3c. PUT /api/tournaments/:id/roadmap/matches/:matchId — Edit match details
  const roadmapMatchEditMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/roadmap\/matches\/([^/]+)$/);
  if (roadmapMatchEditMatch && req.method === 'PUT') {
    const tId = decodeURIComponent(roadmapMatchEditMatch[1]);
    const matchId = decodeURIComponent(roadmapMatchEditMatch[2]);
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let editClient = null;
      let editTxnOpen = false;
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        editClient = await pool.connect();
        await editClient.query('BEGIN');
        editTxnOpen = true;
        const oRes = await editClient.query('SELECT "orgId", roadmap_status, finalized_at, status FROM tournaments WHERE id = $1 FOR UPDATE', [tId]);
        if (oRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
        if (!access.authorized) {
          if (editClient && editTxnOpen) await editClient.query('ROLLBACK').catch(() => {});
          editTxnOpen = false;
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
          return;
        }
        if (oRes.rows[0].finalized_at) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
          return;
        }

        const payload = JSON.parse(body || '{}');
        const matchRes = await editClient.query('SELECT * FROM tournament_matches WHERE id = $1 AND tournament_id = $2 FOR UPDATE', [matchId, tId]);
        if (matchRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Match not found.' }));
          return;
        }
        const match = matchRes.rows[0];

        const start_time = payload.start_time !== undefined ? payload.start_time : match.start_time;
        const end_time = payload.end_time !== undefined ? payload.end_time : match.end_time;
        const map = payload.map !== undefined ? payload.map : match.map;
        const id_pwd_release_time = payload.id_pwd_release_time !== undefined ? payload.id_pwd_release_time : match.id_pwd_release_time;
        const match_number = payload.match_number !== undefined ? payload.match_number : match.match_number;
        const status = payload.status !== undefined ? payload.status : match.status;

        await editClient.query(
          `UPDATE tournament_matches 
           SET start_time = $1, end_time = $2, map = $3, id_pwd_release_time = $4, match_number = $5, status = $6
           WHERE id = $7`,
          [start_time, end_time, map, id_pwd_release_time, match_number, status, matchId]
        );
        await editClient.query('COMMIT');
        editTxnOpen = false;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          match: { ...match, start_time, end_time, map, id_pwd_release_time, match_number, status }
        }));
      } catch (err) {
        if (editClient && editTxnOpen) await editClient.query('ROLLBACK').catch(() => {});
        editTxnOpen = false;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      } finally {
        if (editClient && editTxnOpen) await editClient.query('ROLLBACK').catch(() => {});
        editClient?.release();
      }
    });
    return;
  }

  // 7k_road3d. PUT /api/tournaments/:id/roadmap/days/:dayId — Edit a day's date
  const roadmapDayEditMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/roadmap\/days\/([^/]+)$/);
  if (roadmapDayEditMatch && req.method === 'PUT') {
    const tId = decodeURIComponent(roadmapDayEditMatch[1]);
    const dayId = decodeURIComponent(roadmapDayEditMatch[2]);
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let editClient = null;
      let editTxnOpen = false;
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        editClient = await pool.connect();
        await editClient.query('BEGIN');
        editTxnOpen = true;
        const oRes = await editClient.query('SELECT "orgId", roadmap_status, finalized_at, status FROM tournaments WHERE id = $1 FOR UPDATE', [tId]);
        if (oRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
        if (!access.authorized) {
          if (editClient && editTxnOpen) await editClient.query('ROLLBACK').catch(() => {});
          editTxnOpen = false;
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
          return;
        }
        if (oRes.rows[0].finalized_at) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
          return;
        }
        if (oRes.rows[0].roadmap_status === 'approved') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ROADMAP_APPROVED', message: 'An approved roadmap is locked. Regenerate a new draft to edit.' }));
          return;
        }

        const payload = JSON.parse(body || '{}');
        const date = payload.date;
        if (typeof date !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'date is required.' }));
          return;
        }

        const dayRes = await editClient.query('SELECT * FROM tournament_days WHERE id = $1 AND tournament_id = $2 FOR UPDATE', [dayId, tId]);
        if (dayRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Day not found.' }));
          return;
        }
        const day = dayRes.rows[0];

        const rounds = await getTournamentRounds(editClient, tId);
        const allDays = await editClient.query('SELECT * FROM tournament_days WHERE tournament_id = $1', [tId]);

        const gate = validateDayDateEdit({ day, editedDate: date, allDays: allDays.rows, rounds });
        if (!gate.ok) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_EDIT', message: gate.error }));
          return;
        }

        await editClient.query(`UPDATE tournament_days SET date = $1 WHERE id = $2`, [date, dayId]);
        await editClient.query('COMMIT');
        editTxnOpen = false;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, day: { ...day, date } }));
      } catch (err) {
        if (editClient && editTxnOpen) await editClient.query('ROLLBACK').catch(() => {});
        editTxnOpen = false;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      } finally {
        if (editClient && editTxnOpen) await editClient.query('ROLLBACK').catch(() => {});
        editClient?.release();
      }
    });
    return;
  }

  // ---------------------------------------------------------------------------
  // DYNAMIC ROADMAP: organizer settings + manual match management
  // ---------------------------------------------------------------------------

  // 7k_road4. GET /api/tournaments/:id/roadmap/settings — effective roadmap config
  const roadmapSettingsMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/roadmap\/settings$/);
  if (roadmapSettingsMatch && req.method === 'GET') {
    const tId = decodeURIComponent(roadmapSettingsMatch[1]);
    try {
      const tRes = await pool.query(
        `SELECT "orgId", "slotsTotal", teams_per_group, teams_per_match, game,
                matches_per_day, first_match_time, match_gap_minutes,
                match_duration_minutes, teams_advancing_per_district, enable_semi_finals
         FROM tournaments WHERE id = $1`, [tId]);
      if (tRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
      }
      const t = tRes.rows[0];
      const authUser = getAuthUser(req);
      const access = checkTournamentOrganizerAccess(authUser, t);
      if (!access.authorized) {
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
      }
      const slotsTotal = parseInt(t.slotsTotal, 10) || 0;
      const teamsPerGroup = parseInt(t.teams_per_group || t.teams_per_match, 10) || DEFAULT_TEAMS_PER_GROUP;
      const cfg = normalizeRoadmapConfig(t);
      const validation = validateRoadmapConfig(cfg, { slotsTotal, teamsPerGroup });
      const districtSizes = distributeDistrictSizes(slotsTotal, teamsPerGroup);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        success: true,
        settings: {
          matches_per_day: t.matches_per_day ?? null,
          first_match_time: t.first_match_time || null,
          match_gap_minutes: t.match_gap_minutes ?? null,
          match_duration_minutes: t.match_duration_minutes ?? null,
          teams_advancing_per_district: t.teams_advancing_per_district ?? null,
          enable_semi_finals: t.enable_semi_finals ?? null,
        },
        resolved: cfg,
        validation,
        districts: { count: districtSizes.length, sizes: districtSizes, teams_per_group: teamsPerGroup },
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // 7k_road5. PUT /api/tournaments/:id/roadmap/settings — update roadmap config
  if (roadmapSettingsMatch && req.method === 'PUT') {
    const tId = decodeURIComponent(roadmapSettingsMatch[1]);
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        }
        const tRes = await pool.query('SELECT "orgId", "slotsTotal", teams_per_group, teams_per_match, finalized_at FROM tournaments WHERE id = $1', [tId]);
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        }
        const t = tRes.rows[0];
        const access = checkTournamentOrganizerAccess(authUser, t);
        if (!access.authorized) {
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
        }
        if (t.finalized_at) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
        }
        const payload = JSON.parse(body || '{}');
        const slotsTotal = parseInt(t.slotsTotal, 10) || 0;
        const teamsPerGroup = parseInt(t.teams_per_group || t.teams_per_match, 10) || DEFAULT_TEAMS_PER_GROUP;
        const cfg = normalizeRoadmapConfig(payload);
        const validation = validateRoadmapConfig(cfg, { slotsTotal, teamsPerGroup });
        if (cfg.errors.length > 0 || !validation.ok) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'INVALID_CONFIG', message: [...cfg.errors, ...validation.errors].join(' ') }));
        }
        await pool.query(
          `UPDATE tournaments SET
             matches_per_day = $1, first_match_time = $2, match_gap_minutes = $3,
             match_duration_minutes = $4, teams_advancing_per_district = $5,
             enable_semi_finals = $6
           WHERE id = $7`,
          [
            cfg.matchesPerDayProvided ? cfg.matchesPerDay : null,
            cfg.firstMatchTime,
            cfg.matchGapMinutes,
            cfg.matchDurationMinutes,
            cfg.teamsAdvancingPerDistrict,
            cfg.enableSemiFinals,
            tId,
          ]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, settings: {
          matches_per_day: cfg.matchesPerDayProvided ? cfg.matchesPerDay : null,
          first_match_time: cfg.firstMatchTime,
          match_gap_minutes: cfg.matchGapMinutes,
          match_duration_minutes: cfg.matchDurationMinutes,
          teams_advancing_per_district: cfg.teamsAdvancingPerDistrict,
          enable_semi_finals: cfg.enableSemiFinals,
        } }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7k_road6. POST /api/tournaments/:id/roadmap/matches — create a manual match
  const roadmapMatchesCreateMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/roadmap\/matches$/);
  if (roadmapMatchesCreateMatch && req.method === 'POST') {
    const tId = decodeURIComponent(roadmapMatchesCreateMatch[1]);
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let client = null;
      let txn = false;
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        }
        client = await pool.connect();
        await client.query('BEGIN');
        txn = true;
        const oRes = await client.query('SELECT "orgId", finalized_at, room_credentials_release_minutes FROM tournaments WHERE id = $1 FOR UPDATE', [tId]);
        if (oRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        }
        const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
        if (!access.authorized) {
          if (client && txn) await client.query('ROLLBACK').catch(() => {});
          txn = false;
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
        }
        if (oRes.rows[0].finalized_at) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
        }
        const payload = JSON.parse(body || '{}');

        // Round is required and must belong to the tournament.
        const roundId = payload.round_id;
        if (!roundId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'round_id is required.' }));
        }
        const roundRes = await client.query('SELECT * FROM tournament_rounds WHERE id = $1 AND tournament_id = $2', [roundId, tId]);
        if (roundRes.rows.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'INVALID_ROUND', message: 'Round does not belong to this tournament.' }));
        }

        const startTime = payload.start_time;
        if (!isValidTime(startTime)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'INVALID_TIME', message: 'start_time must be a valid HH:MM time.' }));
        }
        const endTime = isValidTime(payload.end_time) ? payload.end_time : startTime;

        // Resolve/create the day for this match.
        let dayId = payload.day_id || null;
        if (dayId) {
          const dRes = await client.query('SELECT id FROM tournament_days WHERE id = $1 AND tournament_id = $2', [dayId, tId]);
          if (dRes.rows.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'INVALID_DAY', message: 'Day does not belong to this tournament.' }));
          }
        } else {
          const dRes = await client.query('SELECT id FROM tournament_days WHERE tournament_id = $1 AND round_id = $2 ORDER BY day_number ASC LIMIT 1', [tId, roundId]);
          if (dRes.rows.length > 0) {
            dayId = dRes.rows[0].id;
          } else {
            const nRes = await client.query('SELECT COALESCE(MAX(day_number), 0) AS n FROM tournament_days WHERE tournament_id = $1 AND round_id = $2', [tId, roundId]);
            const dayNumber = (parseInt(nRes.rows[0].n, 10) || 0) + 1;
            dayId = `DAY-${crypto.randomBytes(8).toString('hex')}`;
            await client.query(
              'INSERT INTO tournament_days (id, tournament_id, day_number, date, round_id) VALUES ($1, $2, $3, $4, $5)',
              [dayId, tId, dayNumber, payload.date || roundRes.rows[0].date || null, roundId]
            );
          }
        }

        const releaseMinutes = normalizeReleaseMinutes(oRes.rows[0].room_credentials_release_minutes);
        const releaseTime = payload.id_pwd_release_time !== undefined && payload.id_pwd_release_time !== null
          ? payload.id_pwd_release_time
          : releaseTimeFor(startTime, releaseMinutes);

        const nMatch = await client.query('SELECT COALESCE(MAX(match_number), 0) AS n FROM tournament_matches WHERE tournament_id = $1 AND round_id = $2', [tId, roundId]);
        const matchNumber = Number.isFinite(parseInt(payload.match_number, 10))
          ? parseInt(payload.match_number, 10)
          : (parseInt(nMatch.rows[0].n, 10) || 0) + 1;

        const matchId = `MAT-${crypto.randomBytes(8).toString('hex')}`;
        await client.query(
          `INSERT INTO tournament_matches
             (id, room_id, group_id, day_id, tournament_id, match_number, start_time, end_time, status, round_id, map, id_pwd_release_time, next_round_id, teams_advancing, group_name, origin, manual_override, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            matchId, null, payload.group_id || null, dayId, tId, matchNumber, startTime, endTime,
            payload.status || 'PENDING', roundId, payload.map || null, releaseTime || null,
            null, payload.teams_advancing || null, payload.group_name || null,
            'manual', true, payload.notes || null,
          ]
        );
        await client.query('COMMIT');
        txn = false;
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, match: { id: matchId, tournament_id: tId, round_id: roundId, day_id: dayId, match_number: matchNumber, start_time: startTime, end_time: endTime, map: payload.map || null, status: payload.status || 'PENDING', id_pwd_release_time: releaseTime || null, origin: 'manual' } }));
      } catch (err) {
        if (client && txn) await client.query('ROLLBACK').catch(() => {});
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      } finally {
        if (client && txn) await client.query('ROLLBACK').catch(() => {});
        client?.release();
      }
    });
    return;
  }

  // 7k_road6b. POST /api/tournaments/:id/roadmap/matches/reorder — reorder matches in a round
  const roadmapMatchesReorderMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/roadmap\/matches\/reorder$/);
  if (roadmapMatchesReorderMatch && req.method === 'POST') {
    const tId = decodeURIComponent(roadmapMatchesReorderMatch[1]);
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let client = null;
      let txn = false;
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        }
        client = await pool.connect();
        await client.query('BEGIN');
        txn = true;
        const oRes = await client.query('SELECT "orgId", finalized_at FROM tournaments WHERE id = $1 FOR UPDATE', [tId]);
        if (oRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        }
        const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
        if (!access.authorized) {
          if (client && txn) await client.query('ROLLBACK').catch(() => {});
          txn = false;
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
        }
        if (oRes.rows[0].finalized_at) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
        }
        const payload = JSON.parse(body || '{}');
        const ordered = Array.isArray(payload.ordered_ids) ? payload.ordered_ids
          : Array.isArray(payload.order) ? payload.order.map((o) => (typeof o === 'string' ? o : o?.id)).filter(Boolean)
          : null;
        if (!ordered || ordered.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'ordered_ids must be a non-empty array of match ids.' }));
        }
        // Two-phase renumber to avoid transient UNIQUE(tournament_id, round_id, match_number) collisions.
        const owned = await client.query('SELECT id, round_id FROM tournament_matches WHERE tournament_id = $1 AND id = ANY($2::text[])', [tId, ordered]);
        const ownedIds = new Set(owned.rows.map((r) => r.id));
        const roundId = owned.rows[0]?.round_id || null;
        for (const id of ordered) {
          if (!ownedIds.has(id)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'INVALID_MATCH', message: 'One or more matches do not belong to this tournament.' }));
          }
        }
        // Move to a negative temporary range, then assign the final order.
        let tmp = -1;
        for (const id of ordered) {
          await client.query('UPDATE tournament_matches SET match_number = $1, display_order = $2 WHERE id = $3', [tmp, tmp, id]);
          tmp -= 1;
        }
        let n = 1;
        for (const id of ordered) {
          await client.query('UPDATE tournament_matches SET match_number = $1, display_order = $2 WHERE id = $3', [n, n, id]);
          n += 1;
        }
        await client.query('COMMIT');
        txn = false;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, round_id: roundId, ordered_ids: ordered }));
      } catch (err) {
        if (client && txn) await client.query('ROLLBACK').catch(() => {});
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      } finally {
        if (client && txn) await client.query('ROLLBACK').catch(() => {});
        client?.release();
      }
    });
    return;
  }

  // 7k_road6c. POST /api/tournaments/:id/roadmap/matches/:matchId/duplicate — duplicate a match
  const roadmapMatchDuplicateMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/roadmap\/matches\/([^/]+)\/duplicate$/);
  if (roadmapMatchDuplicateMatch && req.method === 'POST') {
    const tId = decodeURIComponent(roadmapMatchDuplicateMatch[1]);
    const matchId = decodeURIComponent(roadmapMatchDuplicateMatch[2]);
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let client = null;
      let txn = false;
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        }
        client = await pool.connect();
        await client.query('BEGIN');
        txn = true;
        const oRes = await client.query('SELECT "orgId", finalized_at FROM tournaments WHERE id = $1 FOR UPDATE', [tId]);
        if (oRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        }
        const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
        if (!access.authorized) {
          if (client && txn) await client.query('ROLLBACK').catch(() => {});
          txn = false;
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
        }
        if (oRes.rows[0].finalized_at) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
        }
        const mRes = await client.query('SELECT * FROM tournament_matches WHERE id = $1 AND tournament_id = $2', [matchId, tId]);
        if (mRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Match not found.' }));
        }
        const m = mRes.rows[0];
        const nMatch = await client.query('SELECT COALESCE(MAX(match_number), 0) AS n FROM tournament_matches WHERE tournament_id = $1 AND round_id = $2', [tId, m.round_id]);
        const matchNumber = (parseInt(nMatch.rows[0].n, 10) || 0) + 1;
        const newId = `MAT-${crypto.randomBytes(8).toString('hex')}`;
        // Copy configuration only — never credentials, results or completed status.
        await client.query(
          `INSERT INTO tournament_matches
             (id, room_id, group_id, day_id, tournament_id, match_number, start_time, end_time, status, round_id, map, id_pwd_release_time, next_round_id, teams_advancing, group_name, origin, manual_override, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [
            newId, null, m.group_id || null, m.day_id || null, tId, matchNumber, m.start_time, m.end_time,
            'PENDING', m.round_id, m.map || null, m.id_pwd_release_time || null, null,
            m.teams_advancing || null, m.group_name || null, 'manual', true, m.notes || null,
          ]
        );
        await client.query('COMMIT');
        txn = false;
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, match: { ...m, id: newId, match_number: matchNumber, status: 'PENDING', room_identifier: null, room_password: null, origin: 'manual' } }));
      } catch (err) {
        if (client && txn) await client.query('ROLLBACK').catch(() => {});
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      } finally {
        if (client && txn) await client.query('ROLLBACK').catch(() => {});
        client?.release();
      }
    });
    return;
  }

  // 7k_road6d. DELETE /api/tournaments/:id/roadmap/matches/:matchId — delete an eligible match
  if (roadmapMatchEditMatch && req.method === 'DELETE') {
    const tId = decodeURIComponent(roadmapMatchEditMatch[1]);
    const matchId = decodeURIComponent(roadmapMatchEditMatch[2]);
    let client = null;
    let txn = false;
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      client = await pool.connect();
      await client.query('BEGIN');
      txn = true;
      const oRes = await client.query('SELECT "orgId", finalized_at FROM tournaments WHERE id = $1 FOR UPDATE', [tId]);
      if (oRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
      }
      const access = checkTournamentOrganizerAccess(authUser, oRes.rows[0]);
      if (!access.authorized) {
        if (client && txn) await client.query('ROLLBACK').catch(() => {});
        txn = false;
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
      }
      if (oRes.rows[0].finalized_at) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
      }
      const mRes = await client.query('SELECT * FROM tournament_matches WHERE id = $1 AND tournament_id = $2', [matchId, tId]);
      if (mRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Match not found.' }));
      }
      const m = mRes.rows[0];
      // Block deletion when dependent records exist.
      const assignRes = await client.query('SELECT 1 FROM tournament_match_assignments WHERE match_id = $1 LIMIT 1', [matchId]);
      if (assignRes.rows.length > 0) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'MATCH_HAS_DEPENDENCIES', message: 'This match has assigned teams. Remove the allocations before deleting it.' }));
      }
      const completed = String(m.status || '').toLowerCase();
      if (completed === 'completed' || completed === 'finished' || completed === 'live') {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'MATCH_IN_PROGRESS', message: 'Started or completed matches cannot be deleted.' }));
      }
      // Detach progression links so no dangling pointers remain.
      await client.query('UPDATE tournament_matches SET next_match_id = NULL WHERE next_match_id = $1', [matchId]);
      await client.query('DELETE FROM tournament_matches WHERE id = $1', [matchId]);
      await client.query('COMMIT');
      txn = false;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, deleted: matchId }));
    } catch (err) {
      if (client && txn) await client.query('ROLLBACK').catch(() => {});
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    } finally {
      if (client && txn) await client.query('ROLLBACK').catch(() => {});
      client?.release();
    }
    return;
  }



  // --- B2: AUTOMATIC / ON-DEMAND TEAM CREATION ---
  async function ensureTeamForRegistration(clientOrPool, tournamentId, userId, teamNameFallback = '') {
    const existingRes = await clientOrPool.query(`
      SELECT t.*, tm.role, tm.status AS member_status, tm.roster_slot
      FROM tournament_teams t
      JOIN tournament_team_members tm ON tm.tournament_team_id = t.id
      WHERE t.tournament_id = $1 AND tm.user_id = $2
      LIMIT 1
    `, [tournamentId, userId]);

    if (existingRes.rows.length > 0) {
      return { created: false, team: existingRes.rows[0] };
    }

    const regRes = await clientOrPool.query(`
      SELECT * FROM tournament_registrations
      WHERE tournament_id = $1 AND user_id = $2
      ORDER BY created_at DESC
    `, [tournamentId, userId]);

    if (regRes.rows.length === 0) {
      return { created: false, reason: 'REGISTRATION_NOT_FOUND' };
    }

    const eligiblePick = pickEligibleRegistration(regRes.rows);
    if (!eligiblePick.ok) {
      return { created: false, reason: 'REGISTRATION_NOT_ELIGIBLE' };
    }

    const registration = eligiblePick.registration;

    const tRes = await clientOrPool.query('SELECT status, finalized_at FROM tournaments WHERE id = $1', [tournamentId]);
    if (tRes.rows.length === 0 || tRes.rows[0].finalized_at || ['archived', 'completed'].includes(tRes.rows[0].status)) {
      return { created: false, reason: 'TOURNAMENT_CLOSED' };
    }

    let targetName = (registration.team_name || teamNameFallback || registration.captain || 'Team ' + userId.slice(0, 6)).trim();
    if (targetName.length > 20) targetName = targetName.slice(0, 20);
    if (targetName.length < 3) targetName = 'Team ' + targetName;

    const nameCheck = await clientOrPool.query(
      'SELECT 1 FROM tournament_teams WHERE tournament_id = $1 AND LOWER(team_name) = LOWER($2)',
      [tournamentId, targetName]
    );
    if (nameCheck.rows.length > 0) {
      const suffix = '-' + Math.random().toString(36).substr(2, 4);
      targetName = (targetName.slice(0, 20 - suffix.length) + suffix).trim();
    }

    const newTeamId = 'tt_' + Math.random().toString(36).substr(2, 9);
    const newMemberId = 'ttm_' + Math.random().toString(36).substr(2, 9);

    try {
      const insertTeamRes = await clientOrPool.query(`
        INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id, status, registration_id)
        VALUES ($1, $2, $3, $4, 'awaiting_members', $5)
        ON CONFLICT (tournament_id, team_name) DO NOTHING
        RETURNING *
      `, [newTeamId, tournamentId, targetName, userId, registration.id]);

      const createdTeam = insertTeamRes.rows[0];
      if (createdTeam) {
        await clientOrPool.query(`
          INSERT INTO tournament_team_members (id, tournament_team_id, tournament_id, user_id, role, status, roster_slot)
          VALUES ($1, $2, $3, $4, 'leader', 'active', 0)
          ON CONFLICT (tournament_id, user_id) DO NOTHING
        `, [newMemberId, createdTeam.id, tournamentId, userId]);

        return { created: true, team: createdTeam };
      }
    } catch (err) {
      console.warn('[ensureTeamForRegistration] Non-fatal creation error:', err.message);
    }

    const fallbackCheck = await clientOrPool.query(`
      SELECT t.*, tm.role, tm.status AS member_status, tm.roster_slot
      FROM tournament_teams t
      JOIN tournament_team_members tm ON tm.tournament_team_id = t.id
      WHERE t.tournament_id = $1 AND tm.user_id = $2
      LIMIT 1
    `, [tournamentId, userId]);

    return { created: false, team: fallbackCheck.rows[0] || null };
  }

  // --- PHASE 4: TOURNAMENT-SPECIFIC TEAMS ENDPOINTS ---

  // GET /api/tournaments/:id/my-registration
  // Returns the caller's own registration row (+ payment proof status) for this tournament.
  // Auth-required; returns registration: null for logged-out or unregistered users.
  // Never returns other users' data. Single query, no N+1.
  const myRegMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/my-registration$/);
  if (myRegMatch && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        // Unauthenticated — return null registration rather than 401 so the client
        // can safely call this without a login guard and get "not registered".
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true, registration: null }));
      }
      const tId = decodeURIComponent(myRegMatch[1]);
      const regRes = await pool.query(
        `SELECT tr.*,
                ps.id          AS payment_submission_id,
                ps.payment_status,
                ps.proof_url,
                ps.utr_number  AS payment_utr
         FROM   tournament_registrations tr
         LEFT JOIN payment_submissions ps ON ps.id = tr.payment_id
         WHERE  tr.tournament_id = $1
           AND  tr.user_id       = $2
         ORDER BY tr.created_at DESC
         LIMIT 1`,
        [tId, authUser.id]
      );
      const registration = regRes.rows.length > 0 ? regRes.rows[0] : null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, registration }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: false, error: err.message }));
    }
  }

  // GET /api/tournaments/:id/my-team
  const myTeamMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/my-team$/);
  if (myTeamMatch && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      const tId = decodeURIComponent(myTeamMatch[1]);
      const tRes = await pool.query('SELECT title, status, roadmap_status, match_type FROM tournaments WHERE id = $1', [tId]);
      if (tRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
      }
      const tournament = tRes.rows[0];
      const roadmapApproved = tournament.roadmap_status === 'approved';

      let teamRes = await pool.query(`
        SELECT t.*, m.role, m.status as member_status, m.roster_slot
        FROM tournament_teams t
        JOIN tournament_team_members m ON t.id = m.tournament_team_id
        WHERE t.tournament_id = $1 AND m.user_id = $2
      `, [tId, authUser.id]);

      // B2: On-demand team creation if user registered & approved but team row not yet created
      if (teamRes.rows.length === 0) {
        await ensureTeamForRegistration(pool, tId, authUser.id);
        teamRes = await pool.query(`
          SELECT t.*, m.role, m.status as member_status, m.roster_slot
          FROM tournament_teams t
          JOIN tournament_team_members m ON t.id = m.tournament_team_id
          WHERE t.tournament_id = $1 AND m.user_id = $2
        `, [tId, authUser.id]);
      }

      const warnings = [];
      let members = [];
      let assignments = [];
      let squadData = null;
      let registration = null;

      if (teamRes.rows.length > 0) {
        const team = teamRes.rows[0];
        const teamId = team.id;

        // 1. Team members with shared display name
        try {
          const membersRes = await pool.query(`
            SELECT m.id, m.user_id, m.role, m.roster_slot, m.joined_at AS created_at,
                   u.name, u.district_id, ${userDisplayNameSql('u')}, u.avatar
            FROM tournament_team_members m
            JOIN users u ON m.user_id = u.id
            WHERE m.tournament_team_id = $1
            ORDER BY m.roster_slot ASC NULLS LAST, m.joined_at ASC
          `, [teamId]);
          members = (membersRes.rows || []).map((m) => ({
            ...m,
            name: m.display_name || m.name || 'Player',
            display_name: m.display_name || m.name || 'Player',
          }));
          await attachResolvedAvatars(pool, members, 'user_id');
        } catch (membersErr) {
          console.error('⚠️ [MY-TEAM] Failed to load team members:', membersErr.message);
          warnings.push('Team members could not be fully loaded.');
          members = [];
        }

        // 2. Fetch registration for roster slots & stage calculation
        try {
          let regRes = null;
          if (team.registration_id) {
            regRes = await pool.query('SELECT * FROM tournament_registrations WHERE id = $1', [team.registration_id]);
          }
          if (!regRes || regRes.rows.length === 0) {
            regRes = await pool.query(
              'SELECT * FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1',
              [tId, team.leader_user_id]
            );
          }
          registration = regRes?.rows[0] || null;
        } catch (regErr) {
          console.warn('⚠️ [MY-TEAM] Registration lookup failed:', regErr.message);
          warnings.push('Registration details could not be loaded.');
          registration = null;
        }

        // 3. Compute squad capacity and roster slots
        try {
          const capacity = computeSquadCapacity(registration, tournament);
          const parsedSlots = parseRosterSlots(registration, tournament);
          const claimedSlotsMap = new Map();
          for (const m of members) {
            if (m.roster_slot !== null && m.roster_slot !== undefined) {
              claimedSlotsMap.set(m.roster_slot, m);
            }
          }

          const slotsWithStatus = parsedSlots.map((s) => {
            const linkedMember = claimedSlotsMap.get(s.slot);
            return {
              slot: s.slot,
              ign: s.ign,
              role: s.role,
              is_leader: s.is_leader,
              linked: Boolean(linkedMember),
              member: linkedMember ? {
                id: linkedMember.id,
                user_id: linkedMember.user_id,
                name: linkedMember.display_name || linkedMember.name || 'Unknown',
                avatar: linkedMember.avatar || null,
                role: linkedMember.role,
              } : null,
            };
          });

          const isWaived = Boolean(team.squad_waived_by);
          const stageInfo = computeRegistrationStage({
            registrationStatus: registration?.status || 'approved',
            capacity,
            joinedCount: members.length,
            isWaived,
            teamStatus: team.status,
          });

          squadData = {
            stage: stageInfo.stage,
            label: stageInfo.label,
            message: stageInfo.message,
            isComplete: stageInfo.isComplete,
            isWaived,
            waivedReason: team.squad_waived_reason || null,
            joined: members.length,
            required: capacity,
            capacity,
            slots: slotsWithStatus,
            unlinkedSlots: slotsWithStatus.filter((s) => !s.linked),
            unlinkedCount: slotsWithStatus.filter((s) => !s.linked).length,
          };
        } catch (squadErr) {
          console.warn('⚠️ [MY-TEAM] Squad calculation failed:', squadErr.message);
          warnings.push('Squad status calculation failed.');
        }

        // 4. Roadmap assignments (fail-soft)
        if (roadmapApproved) {
          try {
            const assignRes = await pool.query(`
              SELECT a.id, a.match_id, a.group_id, a.tournament_team_id, a.status,
                     rnd.round_number, rnd.name as round_name,
                     rnd.id as round_id,
                     d.day_number, d."date" as day_date,
                     g.group_name,
                     r.room_number,
                     m.match_number, m.start_time, m.end_time
              FROM tournament_match_assignments a
              JOIN tournament_days d ON a.day_id = d.id
              JOIN tournament_groups g ON a.group_id = g.id
              JOIN tournament_rooms r ON a.room_id = r.id
              JOIN tournament_matches m ON a.match_id = m.id
              LEFT JOIN tournament_rounds rnd ON rnd.id = m.round_id AND rnd.tournament_id = a.tournament_id
              WHERE a.tournament_team_id = $1 AND a.tournament_id = $2
              ORDER BY rnd.round_number ASC NULLS LAST, d.day_number ASC, g.sequence ASC, m.match_number ASC
            `, [teamId, tId]);
            assignments = assignRes.rows || [];
          } catch (assignErr) {
            console.warn('⚠️ [MY-TEAM] Assignments query soft-failed:', assignErr.message);
            warnings.push('Match assignments could not be loaded.');
            assignments = [];
          }


        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        team: teamRes.rows.length > 0 ? teamRes.rows[0] : null,
        members,
        assignments,
        registration: registration ? {
          id: registration.id,
          team_name: registration.team_name,
          captain: registration.captain,
          status: registration.status,
        } : null,
        squad: squadData,
        partial: warnings.length > 0,
        warnings: warnings.length > 0 ? warnings : undefined,
      }));
    } catch (err) {
      console.error('❌ [MY-TEAM] Server error loading team data:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'FAILED_TO_LOAD_TEAM',
        message: 'Unable to load team data right now. Please try again.',
        canRetry: true
      }));
    }
    return;
  }

  // POST /api/tournaments/:id/teams (Create a team)
  const createTeamMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/teams$/);
  if (createTeamMatch && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        }
        const tId = decodeURIComponent(createTeamMatch[1]);
        const data = JSON.parse(body);
        const teamName = data.teamName?.trim();

        if (!teamName || teamName.length < 3 || teamName.length > 20) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Invalid team name (3-20 characters).' }));
        }

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Serialize roster creation with finalization and all other writes
          // that can affect tournament integrity.
          const tournamentState = await client.query(
            'SELECT status, finalized_at FROM tournaments WHERE id = $1 FOR UPDATE',
            [tId]
          );
          if (tournamentState.rows.length === 0 || tournamentState.rows[0].finalized_at || ['archived', 'completed'].includes(tournamentState.rows[0].status)) {
            throw Object.assign(new Error('Tournament is not open for team creation.'), { code: 'TOURNAMENT_CLOSED' });
          }

          // Registration → team bridge gate: the team slot must be backed by an
          // eligible (slot-confirming) registration for the creating user.
          const regRowsRes = await client.query(
            'SELECT id, status FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2',
            [tId, authUser.id]
          );
          if (regRowsRes.rows.length === 0) {
            throw Object.assign(new Error('You must register for this tournament before creating a team.'), { code: 'REGISTRATION_NOT_FOUND' });
          }
          const eligiblePick = pickEligibleRegistration(regRowsRes.rows);
          if (!eligiblePick.ok) {
            throw Object.assign(
              new Error('Your registration for this tournament is not yet approved/verified. Create your team after it is confirmed.'),
              { code: 'REGISTRATION_NOT_ELIGIBLE' }
            );
          }

          // Check if user already in a team
          const existingMember = await client.query('SELECT 1 FROM tournament_team_members WHERE tournament_id = $1 AND user_id = $2', [tId, authUser.id]);
          if (existingMember.rows.length > 0) {
            const existingTeamRes = await client.query(
              `SELECT t.id, t.team_name, t.status, t.registration_id
               FROM tournament_teams t
               JOIN tournament_team_members m ON m.tournament_team_id = t.id
               WHERE m.tournament_id = $1 AND m.user_id = $2
               LIMIT 1`,
              [tId, authUser.id]
            );
            throw Object.assign(new Error('You are already part of a team for this tournament.'), {
              code: 'ALREADY_IN_TEAM',
              existing_team: existingTeamRes.rows[0] || null,
            });
          }
          // Check team name
          const existingTeam = await client.query('SELECT 1 FROM tournament_teams WHERE tournament_id = $1 AND team_name = $2', [tId, teamName]);
          if (existingTeam.rows.length > 0) {
            throw Object.assign(new Error('This team name is already taken in this tournament.'), { code: 'TEAM_NAME_TAKEN' });
          }

          const teamId = 'tt_' + Math.random().toString(36).substr(2, 9);
          const memberId = 'ttm_' + Math.random().toString(36).substr(2, 9);

          await client.query(`
            INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id, status, registration_id)
            VALUES ($1, $2, $3, $4, 'awaiting_members', $5)
          `, [teamId, tId, teamName, authUser.id, eligiblePick.registration.id]);

          await client.query(`
            INSERT INTO tournament_team_members (id, tournament_team_id, tournament_id, user_id, role, status, roster_slot)
            VALUES ($1, $2, $3, $4, 'leader', 'active', 0)
          `, [memberId, teamId, tId, authUser.id]);

          await client.query('COMMIT');
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Team created successfully!', team_id: teamId, registration_id: eligiblePick.registration.id }));
        } catch (txnErr) {
          await client.query('ROLLBACK').catch(() => {});
          const isUniqueViolation = txnErr && txnErr.code === '23505';
          const payload = { success: false, message: txnErr.message || 'Failed to create team.' };
          if (isUniqueViolation) {
            // Race from simult/duplicate team creation — the DB unique
            // constraints are the final backstop; map to a clean, idempotent message.
            payload.error = 'ALREADY_IN_TEAM';
            payload.message = txnErr.constraint && String(txnErr.constraint).includes('team_name')
              ? 'This team name is already taken in this tournament.'
              : 'You are already part of a team for this tournament.';
          } else if (txnErr.code) {
            payload.error = txnErr.code;
          }
          if (txnErr.existing_team) payload.existing_team = txnErr.existing_team;
          res.writeHead(txnErr.code === 'REGISTRATION_NOT_FOUND' || txnErr.code === 'REGISTRATION_NOT_ELIGIBLE' ? 403 : 400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
        } finally {
          client.release();
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/tournaments/:id/teams (Organizer view)
  const getTeamsMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/teams$/);
  if (getTeamsMatch && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      const tId = decodeURIComponent(getTeamsMatch[1]);
      
      const tRes = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tId]);
      if (tRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Tournament not found' }));
      }
      const access = checkTournamentOrganizerAccess(authUser, tRes.rows[0]);
      if (!access.authorized) {
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
      }

      const teamsRes = await pool.query(`
        SELECT t.id, t.team_name, t.status, t.created_at, t.registration_id, u.name as leader_ign,
        tr.status as registration_status,
        (SELECT COUNT(*) FROM tournament_team_members m WHERE m.tournament_team_id = t.id) as member_count
        FROM tournament_teams t
        LEFT JOIN users u ON t.leader_user_id = u.id
        LEFT JOIN tournament_registrations tr ON tr.id = t.registration_id
        WHERE t.tournament_id = $1
        ORDER BY t.created_at DESC
      `, [tId]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, teams: teamsRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- PHASE 5: TOURNAMENT-SPECIFIC TEAM INVITATIONS ---

  // POST /api/tournaments/:id/teams/:teamId/invitation (Generate / Regenerate)
  const generateInviteMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/teams\/([^/]+)\/invitation$/);
  if (generateInviteMatch && req.method === 'POST') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      const tId = decodeURIComponent(generateInviteMatch[1]);
      const teamId = decodeURIComponent(generateInviteMatch[2]);

      // A7: In-memory rate limit on invite creation (10 per minute per user)
      const authUserId = authUser.id || authUser.uid;
      const inviteLimit = checkRateLimit(`invite-create:${authUserId}`, 10, 60000);
      if (!inviteLimit.allowed) {
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': inviteLimit.retryAfter });
        return res.end(JSON.stringify({ success: false, error: 'RATE_LIMIT_EXCEEDED', message: 'Too many invite requests. Please wait a minute.' }));
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Verify user is leader
        const leaderCheck = await client.query(
          'SELECT 1 FROM tournament_teams WHERE id = $1 AND tournament_id = $2 AND leader_user_id = $3',
          [teamId, tId, authUser.id]
        );
        if (leaderCheck.rows.length === 0) {
          throw new Error('You must be the team leader to manage invitations.');
        }

        // Revoke any existing active invitations
        await client.query(`
          UPDATE tournament_team_invitations
          SET status = 'revoked', updated_at = NOW()
          WHERE tournament_team_id = $1 AND status = 'active'
        `, [teamId]);

        // Create new invitation
        const { id: inviteId, token } = createInvitationCredentials();
        const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

        await client.query(`
          INSERT INTO tournament_team_invitations
          (id, tournament_id, tournament_team_id, created_by_user_id, token, expires_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [inviteId, tId, teamId, authUser.id, token, expiresAt]);

        await client.query('COMMIT');
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, token, expiresAt }));
      } catch (txnErr) {
        await client.query('ROLLBACK');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: txnErr.message }));
      } finally {
        client.release();
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // GET /api/tournaments/:id/teams/:teamId/invitation (Get active invitation)
  if (generateInviteMatch && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      const tId = decodeURIComponent(generateInviteMatch[1]);
      const teamId = decodeURIComponent(generateInviteMatch[2]);

      const leaderCheck = await pool.query(
        'SELECT 1 FROM tournament_teams WHERE id = $1 AND tournament_id = $2 AND leader_user_id = $3',
        [teamId, tId, authUser.id]
      );
      if (leaderCheck.rows.length === 0) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Forbidden' }));
      }

      const invRes = await pool.query(
        "SELECT token, expires_at, status FROM tournament_team_invitations WHERE tournament_team_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1",
        [teamId]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, invitation: invRes.rows[0] || null }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/tournaments/:id/teams/:teamId/invitation/revoke
  const revokeInviteMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/teams\/([^/]+)\/invitation\/revoke$/);
  if (revokeInviteMatch && req.method === 'POST') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      const tId = decodeURIComponent(revokeInviteMatch[1]);
      const teamId = decodeURIComponent(revokeInviteMatch[2]);

      const leaderCheck = await pool.query(
        'SELECT 1 FROM tournament_teams WHERE id = $1 AND tournament_id = $2 AND leader_user_id = $3',
        [teamId, tId, authUser.id]
      );
      if (leaderCheck.rows.length === 0) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Forbidden' }));
      }

      await pool.query(
        "UPDATE tournament_team_invitations SET status = 'revoked', updated_at = NOW() WHERE tournament_team_id = $1 AND status = 'active'",
        [teamId]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // GET /api/invitation/:token (Public resolving API - A7 & A8)
  const resolveInviteMatch = urlPath.match(/^\/api\/invitation\/([^/]+)$/);
  if (resolveInviteMatch && req.method === 'GET') {
    try {
      const clientIp = getClientIp(req);
      const resolveLimit = checkRateLimit(`invite-resolve:${clientIp}`, 30, 60000);
      if (!resolveLimit.allowed) {
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': resolveLimit.retryAfter });
        return res.end(JSON.stringify({ success: false, error: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests. Please wait a minute.' }));
      }

      const token = decodeURIComponent(resolveInviteMatch[1]);
      const invRes = await pool.query(
        "SELECT * FROM tournament_team_invitations WHERE token = $1",
        [token]
      );

      if (invRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Invitation not found.' }));
      }

      const inv = invRes.rows[0];

      if (inv.status !== 'active' || new Date(inv.expires_at) < new Date()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, status: inv.status === 'active' ? 'expired' : inv.status, message: 'Invitation is expired or revoked.' }));
      }

      const tRes = await pool.query('SELECT title, status, match_type FROM tournaments WHERE id = $1', [inv.tournament_id]);
      const teamRes = await pool.query('SELECT id, team_name, status, leader_user_id, registration_id FROM tournament_teams WHERE id = $1', [inv.tournament_team_id]);
      
      if (tRes.rows.length === 0 || teamRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Tournament or Team no longer exists.' }));
      }

      const tournament = tRes.rows[0];
      const team = teamRes.rows[0];

      if (['archived', 'completed'].includes(tournament.status)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, status: 'closed', message: 'Tournament is closed.' }));
      }

      let regRes = null;
      if (team.registration_id) {
        regRes = await pool.query('SELECT * FROM tournament_registrations WHERE id = $1', [team.registration_id]);
      }
      if (!regRes || regRes.rows.length === 0) {
        regRes = await pool.query('SELECT * FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1', [inv.tournament_id, team.leader_user_id]);
      }
      const registration = regRes?.rows[0] || null;

      const capacity = computeSquadCapacity(registration, tournament);
      const membersRes = await pool.query('SELECT roster_slot FROM tournament_team_members WHERE tournament_team_id = $1 AND status = \'active\'', [inv.tournament_team_id]);
      const memberCount = membersRes.rows.length;

      if (memberCount >= capacity) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, status: 'full', message: 'Team is full.' }));
      }

      const leaderRes = await pool.query(`SELECT name, district_id, ${userDisplayNameSql('')} FROM users WHERE id = $1`, [team.leader_user_id]);
      const leaderDisplayName = leaderRes.rows[0]?.display_name || formatUserDisplayName(leaderRes.rows[0]) || 'Team Leader';

      // Parse roster slots and list unlinked slots by IGN display name only (A8: no UIDs, emails, or phone numbers)
      const parsedSlots = parseRosterSlots(registration, tournament);
      const claimedSlots = new Set(membersRes.rows.map((m) => m.roster_slot));
      const unlinkedSlots = parsedSlots
        .filter((s) => s.slot > 0 && !claimedSlots.has(s.slot))
        .map((s) => ({ slot: s.slot, ign: s.ign }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        invitation: {
          token: inv.token,
          tournamentId: inv.tournament_id,
          teamId: inv.tournament_team_id,
          tournamentTitle: tournament.title,
          teamName: team.team_name,
          leaderDisplayName,
          leaderDistrictId: leaderRes.rows[0]?.district_id || null,
          capacity,
          joined: memberCount,
          capacityRatio: `${memberCount}/${capacity}`,
          unlinkedSlots,
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/invitation/:token/join (A4, A5, A7, B1)
  const resolveInviteJoinMatch = req.url.match(/^\/api\/invitation\/([^/]+)\/join$/);
  if (resolveInviteJoinMatch && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const clientIp = getClientIp(req);
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        }

        // A7: In-memory rate limits per IP and per user
        const joinIpLimit = checkRateLimit(`invite-join-ip:${clientIp}`, 10, 60000);
        if (!joinIpLimit.allowed) {
          res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': joinIpLimit.retryAfter });
          return res.end(JSON.stringify({ success: false, error: 'RATE_LIMIT_EXCEEDED', message: 'Too many join attempts. Please wait a minute.' }));
        }
        const authUserId = authUser.id || authUser.uid;
        const joinUserLimit = checkRateLimit(`invite-join-user:${authUserId}`, 10, 60000);
        if (!joinUserLimit.allowed) {
          rollbackRateLimit(`invite-join-ip:${clientIp}`);
          res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': joinUserLimit.retryAfter });
          return res.end(JSON.stringify({ success: false, error: 'RATE_LIMIT_EXCEEDED', message: 'Too many join attempts. Please wait a minute.' }));
        }

        let parsedPayload = {};
        if (body.trim()) {
          try { parsedPayload = JSON.parse(body); } catch {}
        }
        const requestedSlot = parsedPayload.roster_slot != null ? parseInt(parsedPayload.roster_slot, 10) : null;

        const token = decodeURIComponent(resolveInviteJoinMatch[1]);
        const client = await pool.connect();

        try {
          await client.query('BEGIN');

          const invRes = await client.query('SELECT * FROM tournament_team_invitations WHERE token = $1 FOR UPDATE', [token]);
          if (invRes.rows.length === 0) {
            throw new Error('Invitation not found.');
          }

          const inv = invRes.rows[0];
          if (inv.status !== 'active' || new Date(inv.expires_at) < new Date()) {
            throw new Error('Invitation is expired or revoked.');
          }

          const tRes = await client.query(
            'SELECT title, status, match_type, finalized_at FROM tournaments WHERE id = $1 FOR UPDATE',
            [inv.tournament_id]
          );
          // A4: Lock the team row
          const teamRes = await client.query(
            'SELECT id, team_name, status, leader_user_id, registration_id FROM tournament_teams WHERE id = $1 FOR UPDATE',
            [inv.tournament_team_id]
          );
          
          if (tRes.rows.length === 0 || teamRes.rows.length === 0) {
            throw new Error('Tournament or Team no longer exists.');
          }

          const tournament = tRes.rows[0];
          const team = teamRes.rows[0];

          if (tournament.finalized_at || ['archived', 'completed'].includes(tournament.status)) {
            throw new Error('Tournament is closed.');
          }

          // Check if user is already in THIS team -> idempotent success
          const selfMemberCheck = await client.query(
            'SELECT 1 FROM tournament_team_members WHERE tournament_team_id = $1 AND user_id = $2',
            [inv.tournament_team_id, authUser.id]
          );
          if (selfMemberCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: true, message: 'You are already a member of this team.', status: 'already_member' }));
          }

          // Check if user is in ANOTHER team in THIS tournament -> ALREADY_IN_TEAM
          const otherMemberCheck = await client.query(
            'SELECT 1 FROM tournament_team_members WHERE tournament_id = $1 AND user_id = $2',
            [inv.tournament_id, authUser.id]
          );
          if (otherMemberCheck.rows.length > 0) {
            throw Object.assign(new Error('You are already part of another team for this tournament.'), { code: 'ALREADY_IN_TEAM' });
          }

          // Registration exclusion guard
          const joinRegRes = await client.query(
            'SELECT id, status FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2',
            [inv.tournament_id, authUser.id]
          );
          if (joinRegRes.rows.some((r) => isExcludedRegistrationStatus(r.status))) {
            throw new Error('Your previous registration for this tournament was rejected or cancelled, so you cannot join a team.');
          }

          // Fetch registration for capacity derivation
          let regRes = null;
          if (team.registration_id) {
            regRes = await client.query('SELECT * FROM tournament_registrations WHERE id = $1', [team.registration_id]);
          }
          if (!regRes || regRes.rows.length === 0) {
            regRes = await client.query('SELECT * FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1', [inv.tournament_id, team.leader_user_id]);
          }
          const registration = regRes?.rows[0] || null;

          const capacity = computeSquadCapacity(registration, tournament);
          const currentMembersRes = await client.query(
            'SELECT id, user_id, roster_slot FROM tournament_team_members WHERE tournament_team_id = $1 AND status = \'active\'',
            [inv.tournament_team_id]
          );
          const currentMembers = currentMembersRes.rows;

          // A4: Re-check capacity inside the lock
          if (currentMembers.length >= capacity) {
            throw new Error('Team is full.');
          }

          const claimedSlots = new Set(currentMembers.map((m) => m.roster_slot));
          let chosenSlot = requestedSlot;

          // B1: Validate chosen roster slot (1..capacity-1) or auto-assign first free slot
          if (chosenSlot !== null && !isNaN(chosenSlot)) {
            if (chosenSlot <= 0 || chosenSlot >= capacity) {
              throw new Error('Invalid roster slot selected.');
            }
            if (claimedSlots.has(chosenSlot)) {
              throw Object.assign(new Error('Selected roster slot has already been claimed by another player.'), { code: 'SLOT_ALREADY_CLAIMED' });
            }
          } else {
            for (let i = 1; i < capacity; i++) {
              if (!claimedSlots.has(i)) {
                chosenSlot = i;
                break;
              }
            }
          }

          // Insert new member with chosen roster_slot
          const memberId = 'mem_' + Math.random().toString(36).substr(2, 9) + Date.now();
          await client.query(`
            INSERT INTO tournament_team_members (id, tournament_team_id, tournament_id, user_id, role, status, roster_slot)
            VALUES ($1, $2, $3, $4, 'member', 'active', $5)
          `, [memberId, inv.tournament_team_id, inv.tournament_id, authUser.id, chosenSlot]);

          // A5: Status upgrade ONLY from awaiting_members -> members_complete
          // Never overwrite verified, allocated, allocation_pending or disqualified
          const newMemberCount = currentMembers.length + 1;
          if (newMemberCount >= capacity) {
            await client.query(`
              UPDATE tournament_teams 
              SET status = 'members_complete', updated_at = NOW()
              WHERE id = $1 AND status = 'awaiting_members'
            `, [inv.tournament_team_id]);
          }

          await client.query('COMMIT');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: 'Successfully joined the team.',
            roster_slot: chosenSlot,
            joined: newMemberCount,
            required: capacity,
          }));
        } catch (txnErr) {
          await client.query('ROLLBACK').catch(() => {});
          // A4: Handle UNIQUE(tournament_id, user_id) as ALREADY_IN_TEAM
          if (txnErr.code === '23505') {
            if (txnErr.constraint && String(txnErr.constraint).includes('roster_slot')) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              return res.end(JSON.stringify({ success: false, error: 'SLOT_ALREADY_CLAIMED', message: 'That roster slot was just claimed by another player.' }));
            }
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'ALREADY_IN_TEAM', message: 'You are already part of a team for this tournament.' }));
          }
          if (txnErr.code === 'ALREADY_IN_TEAM') {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'ALREADY_IN_TEAM', message: txnErr.message }));
          }
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: txnErr.message }));
        } finally {
          client.release();
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- B5: SQUAD MANAGEMENT (LEAVE, REMOVE, TRANSFER, DELETE) ---

  // POST /api/tournaments/:id/teams/:teamId/leave (Member leaves)
  const leaveTeamMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/teams\/([^/]+)\/leave$/);
  if (leaveTeamMatch && req.method === 'POST') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      const tId = decodeURIComponent(leaveTeamMatch[1]);
      const teamId = decodeURIComponent(leaveTeamMatch[2]);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const teamRes = await client.query(
          'SELECT id, status, leader_user_id, registration_id FROM tournament_teams WHERE id = $1 AND tournament_id = $2 FOR UPDATE',
          [teamId, tId]
        );
        if (teamRes.rows.length === 0) {
          throw new Error('Team not found.');
        }
        const team = teamRes.rows[0];

        // Allowed only while status is awaiting_members or members_complete
        if (!['awaiting_members', 'members_complete'].includes(team.status)) {
          throw new Error('Cannot leave team once verification or match allocation has started.');
        }

        const memberRes = await client.query(
          'SELECT id, role, roster_slot FROM tournament_team_members WHERE tournament_team_id = $1 AND user_id = $2 FOR UPDATE',
          [teamId, authUser.id]
        );
        if (memberRes.rows.length === 0) {
          throw new Error('You are not a member of this team.');
        }
        const member = memberRes.rows[0];

        if (member.role === 'leader' || team.leader_user_id === authUser.id) {
          throw new Error('Team leader cannot leave the team without transferring captaincy first.');
        }

        // Delete member (frees their roster_slot)
        await client.query('DELETE FROM tournament_team_members WHERE id = $1', [member.id]);

        // Recheck member count & status downgrade (reverts members_complete -> awaiting_members)
        const countRes = await client.query('SELECT COUNT(*) AS count FROM tournament_team_members WHERE tournament_team_id = $1 AND status = \'active\'', [teamId]);
        const remainingCount = parseInt(countRes.rows[0]?.count || '0', 10);

        if (team.status === 'members_complete') {
          await client.query(`
            UPDATE tournament_teams
            SET status = 'awaiting_members', updated_at = NOW()
            WHERE id = $1 AND status = 'members_complete'
          `, [teamId]);
        }

        await client.query('COMMIT');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'You have left the team.', remainingMembers: remainingCount }));
      } catch (txnErr) {
        await client.query('ROLLBACK').catch(() => {});
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: txnErr.message }));
      } finally {
        client.release();
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // DELETE /api/tournaments/:id/teams/:teamId/members/:memberId (Leader/Admin removes member)
  const removeMemberMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/teams\/([^/]+)\/members\/([^/]+)$/);
  if (removeMemberMatch && req.method === 'DELETE') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      const tId = decodeURIComponent(removeMemberMatch[1]);
      const teamId = decodeURIComponent(removeMemberMatch[2]);
      const memberId = decodeURIComponent(removeMemberMatch[3]);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const tRes = await client.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tId]);
        const isOrganizer = tRes.rows.length > 0 && (tRes.rows[0].orgId === authUser.id || hasRole(authUser, ROLES.ADMIN));

        const teamRes = await client.query(
          'SELECT id, status, leader_user_id, registration_id FROM tournament_teams WHERE id = $1 AND tournament_id = $2 FOR UPDATE',
          [teamId, tId]
        );
        if (teamRes.rows.length === 0) {
          throw new Error('Team not found.');
        }
        const team = teamRes.rows[0];

        const isLeader = team.leader_user_id === authUser.id;
        if (!isLeader && !isOrganizer) {
          throw new Error('Only the team leader or organizer can remove members.');
        }

        if (!isOrganizer && !['awaiting_members', 'members_complete'].includes(team.status)) {
          throw new Error('Members cannot be removed once verification or allocation has started.');
        }

        const targetMemberRes = await client.query(
          'SELECT id, user_id, role, roster_slot FROM tournament_team_members WHERE id = $1 AND tournament_team_id = $2 FOR UPDATE',
          [memberId, teamId]
        );
        if (targetMemberRes.rows.length === 0) {
          throw new Error('Member not found in team.');
        }
        const targetMember = targetMemberRes.rows[0];

        if (targetMember.role === 'leader' || targetMember.user_id === team.leader_user_id) {
          throw new Error('Cannot remove the team leader.');
        }

        // Delete member (frees their roster_slot)
        await client.query('DELETE FROM tournament_team_members WHERE id = $1', [memberId]);

        // Recheck member count & status downgrade (reverts members_complete -> awaiting_members)
        const countRes = await client.query('SELECT COUNT(*) AS count FROM tournament_team_members WHERE tournament_team_id = $1 AND status = \'active\'', [teamId]);
        const remainingCount = parseInt(countRes.rows[0]?.count || '0', 10);

        if (team.status === 'members_complete') {
          await client.query(`
            UPDATE tournament_teams
            SET status = 'awaiting_members', updated_at = NOW()
            WHERE id = $1 AND status = 'members_complete'
          `, [teamId]);
        }

        await client.query('COMMIT');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Member removed from team.', remainingMembers: remainingCount }));
      } catch (txnErr) {
        await client.query('ROLLBACK').catch(() => {});
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: txnErr.message }));
      } finally {
        client.release();
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/tournaments/:id/teams/:teamId/transfer (Leader transfers captaincy)
  const transferTeamMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/teams\/([^/]+)\/transfer$/);
  if (transferTeamMatch && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        }
        const tId = decodeURIComponent(transferTeamMatch[1]);
        const teamId = decodeURIComponent(transferTeamMatch[2]);
        const data = JSON.parse(body || '{}');
        const targetUserId = data.target_user_id || data.targetUserId;

        if (!targetUserId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Target user ID is required.' }));
        }

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          const teamRes = await client.query(
            'SELECT id, status, leader_user_id FROM tournament_teams WHERE id = $1 AND tournament_id = $2 FOR UPDATE',
            [teamId, tId]
          );
          if (teamRes.rows.length === 0) {
            throw new Error('Team not found.');
          }
          const team = teamRes.rows[0];

          if (team.leader_user_id !== authUser.id) {
            throw new Error('Only the current team leader can transfer captaincy.');
          }

          if (!['awaiting_members', 'members_complete'].includes(team.status)) {
            throw new Error('Captaincy cannot be transferred after verification or match allocation.');
          }

          if (targetUserId === authUser.id) {
            throw new Error('You are already the team leader.');
          }

          const targetMemberRes = await client.query(
            'SELECT id, user_id, roster_slot FROM tournament_team_members WHERE tournament_team_id = $1 AND user_id = $2 AND status = \'active\' FOR UPDATE',
            [teamId, targetUserId]
          );
          if (targetMemberRes.rows.length === 0) {
            throw new Error('Target user is not an active member of this team.');
          }
          const targetMember = targetMemberRes.rows[0];

          const currentLeaderMemberRes = await client.query(
            'SELECT id, user_id, roster_slot FROM tournament_team_members WHERE tournament_team_id = $1 AND user_id = $2 FOR UPDATE',
            [teamId, authUser.id]
          );
          const currentLeaderMember = currentLeaderMemberRes.rows[0];

          const oldSlot = targetMember.roster_slot;

          // Swap slots: Target member becomes slot 0 (leader), old leader takes target's slot
          await client.query(`
            UPDATE tournament_team_members
            SET role = 'member', roster_slot = $1
            WHERE id = $2
          `, [oldSlot, currentLeaderMember.id]);

          await client.query(`
            UPDATE tournament_team_members
            SET role = 'leader', roster_slot = 0
            WHERE id = $1
          `, [targetMember.id]);

          await client.query(`
            UPDATE tournament_teams
            SET leader_user_id = $1, updated_at = NOW()
            WHERE id = $2
          `, [targetUserId, teamId]);

          await client.query('COMMIT');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Captaincy transferred successfully.', new_leader_user_id: targetUserId }));
        } catch (txnErr) {
          await client.query('ROLLBACK').catch(() => {});
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: txnErr.message }));
        } finally {
          client.release();
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // DELETE /api/tournaments/:id/teams/:teamId (Lone leader deletes empty team before allocation)
  const deleteTeamMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/teams\/([^/]+)$/);
  if (deleteTeamMatch && req.method === 'DELETE') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      const tId = decodeURIComponent(deleteTeamMatch[1]);
      const teamId = decodeURIComponent(deleteTeamMatch[2]);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const tRes = await client.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tId]);
        const isOrganizer = tRes.rows.length > 0 && (tRes.rows[0].orgId === authUser.id || hasRole(authUser, ROLES.ADMIN));

        const teamRes = await client.query(
          'SELECT id, status, leader_user_id FROM tournament_teams WHERE id = $1 AND tournament_id = $2 FOR UPDATE',
          [teamId, tId]
        );
        if (teamRes.rows.length === 0) {
          throw new Error('Team not found.');
        }
        const team = teamRes.rows[0];

        const isLeader = team.leader_user_id === authUser.id;
        if (!isLeader && !isOrganizer) {
          throw new Error('Only the team leader or organizer can delete the team.');
        }

        const assignCheck = await client.query(
          'SELECT 1 FROM tournament_match_assignments WHERE tournament_team_id = $1 LIMIT 1',
          [teamId]
        );
        if (assignCheck.rows.length > 0) {
          throw new Error('Cannot delete team that has match assignments.');
        }

        if (!['awaiting_members', 'members_complete'].includes(team.status) && !isOrganizer) {
          throw new Error('Cannot delete team after verification or allocation.');
        }

        if (!isOrganizer) {
          const memberCountRes = await client.query(
            'SELECT COUNT(*) AS count FROM tournament_team_members WHERE tournament_team_id = $1 AND status = \'active\'',
            [teamId]
          );
          const activeCount = parseInt(memberCountRes.rows[0]?.count || '0', 10);
          if (activeCount > 1) {
            throw new Error('You cannot delete the team while teammates are still in the roster. Remove teammates first.');
          }
        }

        await client.query('DELETE FROM tournament_team_members WHERE tournament_team_id = $1', [teamId]);
        await client.query('DELETE FROM tournament_teams WHERE id = $1', [teamId]);

        await client.query('COMMIT');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Team deleted successfully.' }));
      } catch (txnErr) {
        await client.query('ROLLBACK').catch(() => {});
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: txnErr.message }));
      } finally {
        client.release();
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- B7: ORGANIZER WAIVE / UNWAIVE SQUAD REQUIREMENT ---

  // POST /api/tournaments/:id/teams/:teamId/waive
  const waiveTeamMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/teams\/([^/]+)\/waive$/);
  if (waiveTeamMatch && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        }
        const tId = decodeURIComponent(waiveTeamMatch[1]);
        const teamId = decodeURIComponent(waiveTeamMatch[2]);
        const data = JSON.parse(body || '{}');
        const reason = (data.reason || '').trim();

        if (!reason) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'A reason is required to waive squad completion.' }));
        }

        const tRes = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tId]);
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        }
        const isOrganizer = tRes.rows[0].orgId === authUser.id || hasRole(authUser, ROLES.ADMIN);
        if (!isOrganizer) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Only organizers or admins can waive squad requirements.' }));
        }

        const updateRes = await pool.query(`
          UPDATE tournament_teams
          SET squad_waived_by = $1, squad_waived_at = NOW(), squad_waived_reason = $2, updated_at = NOW()
          WHERE id = $3 AND tournament_id = $4
          RETURNING *
        `, [authUser.id, reason, teamId, tId]);

        if (updateRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, message: 'Team not found.' }));
        }

        try {
          const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
          await pool.query(`
            INSERT INTO admin_action_log (id, admin_id, action, target_type, target_id, details)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [logId, authUser.id, 'waive_squad', 'tournament_team', teamId, JSON.stringify({ reason, tournamentId: tId })]);
        } catch (logErr) {
          console.warn('[WAIVE_SQUAD] Non-fatal log failure:', logErr.message);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Squad requirement waived successfully.', team: updateRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/tournaments/:id/teams/:teamId/unwaive
  const unwaiveTeamMatch = urlPath.match(/^\/api\/tournaments\/([^/]+)\/teams\/([^/]+)\/unwaive$/);
  if (unwaiveTeamMatch && req.method === 'POST') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      const tId = decodeURIComponent(unwaiveTeamMatch[1]);
      const teamId = decodeURIComponent(unwaiveTeamMatch[2]);

      const tRes = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tId]);
      if (tRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
      }
      const isOrganizer = tRes.rows[0].orgId === authUser.id || hasRole(authUser, ROLES.ADMIN);
      if (!isOrganizer) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
      }

      const updateRes = await pool.query(`
        UPDATE tournament_teams
        SET squad_waived_by = NULL, squad_waived_at = NULL, squad_waived_reason = NULL, updated_at = NOW()
        WHERE id = $1 AND tournament_id = $2
        RETURNING *
      `, [teamId, tId]);

      if (updateRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, message: 'Team not found.' }));
      }

      try {
        const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(`
          INSERT INTO admin_action_log (id, admin_id, action, target_type, target_id, details)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [logId, authUser.id, 'unwaive_squad', 'tournament_team', teamId, JSON.stringify({ tournamentId: tId })]);
      } catch (logErr) {
        console.warn('[UNWAIVE_SQUAD] Non-fatal log failure:', logErr.message);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Squad waiver revoked successfully.', team: updateRes.rows[0] }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- PHASE 7: VERIFICATION & ALLOCATION ---
  const verifyTeamMatch = req.url.match(/^\/api\/tournaments\/([^\/]+)\/teams\/([^\/]+)\/verify$/);
  if (verifyTeamMatch && req.method === 'POST') {
    const tId = decodeURIComponent(verifyTeamMatch[1]);
    const teamId = decodeURIComponent(verifyTeamMatch[2]);
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Use the same tournament-first lock order as qualification and the
        // shared allocation service, then lock the team roster state.
        const tournamentLock = await client.query(
          'SELECT roadmap_status, finalized_at FROM tournaments WHERE id = $1 FOR UPDATE',
          [tId]
        );
        if (!tournamentLock.rows.length) throw new Error('Tournament not found');
        const teamRes = await client.query('SELECT * FROM tournament_teams WHERE id = $1 AND tournament_id = $2 FOR UPDATE', [teamId, tId]);
        if (teamRes.rows.length === 0) throw new Error('Team not found');
        
        const team = teamRes.rows[0];
        if (team.leader_user_id !== authUser.id && !hasRole(authUser, ROLES.ADMIN)) {
          throw new Error('Only the team leader or an admin can verify the team.');
        }

        if (['verified', 'allocated', 'allocation_pending'].includes(team.status)) {
          // Idempotent return or simple notification
          await client.query('ROLLBACK');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: true, status: team.status, message: 'Team is already processed.' }));
        }

        if (team.status !== 'members_complete') {
          throw new Error('Team does not have all required members joined yet.');
        }

        // Registration → team bridge check at verification time: a LINKED team
        // must still be backed by an eligible (slot-confirming) registration.
        // Legacy teams without a registration_id keep the prior behavior.
        if (team.registration_id) {
          const linkedRegRes = await client.query(
            'SELECT status FROM tournament_registrations WHERE id = $1 AND tournament_id = $2',
            [team.registration_id, tId]
          );
          const linkedStatus = linkedRegRes.rows[0] ? linkedRegRes.rows[0].status : null;
          if (!linkedRegRes.rows[0] || !isEligibleRegistrationStatus(linkedStatus)) {
            throw new Error('The registration linked to this team is no longer eligible for verification. Please contact the organizer.');
          }
        }

        // Proceed to allocation through the shared allocation service. The
        // service revalidates team state + registration-bridge eligibility, locks
        // the tournament (approved-roadmap gate), enforces capacity in the same
        // transaction, and assigns to the first available Round 1 room in
        // deterministic order. It never writes roadmap rows and never creates
        // duplicate/unassigned placements.
        const allocation = await allocateTeam(client, {
          teamId,
          tournamentId: tId,
          source: ALLOCATION_SOURCES.AUTOMATIC,
          actorId: authUser.id,
        });
        await client.query('COMMIT');
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, status: allocation.status, message: allocation.message }));
      } catch (txnErr) {
        await client.query('ROLLBACK');
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: txnErr.message, code: txnErr instanceof AllocationError ? txnErr.code : undefined }));
      } finally {
        client.release();
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- PHASE 5: TEAM DISQUALIFICATION & REINSTATEMENT ---
  const teamStatusMatch = req.url.match(/^\/api\/tournaments\/([^/]+)\/teams\/([^/]+)\/status$/);
  if (teamStatusMatch && (req.method === 'PUT' || req.method === 'POST')) {
    const tId = decodeURIComponent(teamStatusMatch[1]);
    const teamId = decodeURIComponent(teamStatusMatch[2]);
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
        }

        let payload = {};
        try {
          if (body) payload = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'INVALID_JSON', message: 'Invalid JSON payload.' }));
        }

        const isAdmin = hasRole(authUser, ROLES.ADMIN);
        const result = await updateTeamQualificationStatus(pool, {
          tournamentId: tId,
          teamId,
          status: payload.status,
          reason: payload.reason || '',
          actorId: authUser.id,
          isAdmin,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      } catch (err) {
        const statusCode = err.status || (err.code === 'FORBIDDEN' ? 403 : err.code === 'TEAM_NOT_FOUND' || err.code === 'TOURNAMENT_NOT_FOUND' ? 404 : 500);
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          success: false,
          error: err.code || 'INTERNAL_ERROR',
          message: err.message,
        }));
      }
    });
    return;
  }

  // --- PHASE 8: ORGANIZER ALLOCATION MANAGEMENT ---
  const allocationGetMatch = req.url.match(/^\/api\/tournaments\/([^\/]+)\/allocations$/);
  if (allocationGetMatch && req.method === 'GET') {
    const tId = decodeURIComponent(allocationGetMatch[1]);
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      const tRes = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tId]);
      if (tRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
      }
      const access = checkTournamentOrganizerAccess(authUser, tRes.rows[0]);
      if (!access.authorized) {
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
      }

      const metrics = await pool.query(`
        SELECT 
          COUNT(*) as total_teams,
          SUM(CASE WHEN status = 'members_complete' THEN 1 ELSE 0 END) as pending_verification,
          SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
          SUM(CASE WHEN status = 'allocated' THEN 1 ELSE 0 END) as allocated,
          SUM(CASE WHEN status = 'allocation_pending' THEN 1 ELSE 0 END) as pending_allocation
        FROM tournament_teams WHERE tournament_id = $1
      `, [tId]);

      const teamsRes = await pool.query(`
        SELECT t.id, t.team_name, t.status, t.created_at, u.name as leader_name,
               a.match_id, a.room_id, a.group_id, a.day_id, a.assigned_at, a.source,
               r.room_number, m.match_number, g.group_name, d.day_number, d."date"
        FROM tournament_teams t
        LEFT JOIN users u ON t.leader_user_id = u.id
        LEFT JOIN tournament_match_assignments a ON t.id = a.tournament_team_id
        LEFT JOIN tournament_rooms r ON a.room_id = r.id
        LEFT JOIN tournament_matches m ON a.match_id = m.id
        LEFT JOIN tournament_groups g ON a.group_id = g.id
        LEFT JOIN tournament_days d ON a.day_id = d.id
        WHERE t.tournament_id = $1
        ORDER BY t.created_at DESC
      `, [tId]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, metrics: metrics.rows[0], teams: teamsRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  const allocMoveMatch = req.url.match(/^\/api\/tournaments\/([^\/]+)\/allocations\/move$/);
  if (allocMoveMatch && req.method === 'POST') {
    const tId = decodeURIComponent(allocMoveMatch[1]);
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        }
        
        const payload = JSON.parse(body);
        const { teamId, matchId, roomId, reason } = payload;
        if (!teamId || !matchId || !roomId || !reason) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Missing fields' }));
        }

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Role gate (non-locking read; the shared service, which runs after,
          // locks the team then the tournament as the allocation serialization
          // point — uniform ordering on both automatic and manual paths).
          const tRes = await client.query('SELECT "orgId", finalized_at, status FROM tournaments WHERE id = $1', [tId]);
          if (tRes.rows.length === 0) {
            await client.query('ROLLBACK');
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found' }));
          }
          const access = checkTournamentOrganizerAccess(authUser, tRes.rows[0]);
          if (!access.authorized) {
            await client.query('ROLLBACK');
            res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
          }

          const allocation = await allocateTeam(client, {
            teamId,
            tournamentId: tId,
            source: ALLOCATION_SOURCES.ORGANIZER,
            options: { roomId, matchId, reason },
            actorId: authUser.id,
          });

          await client.query('COMMIT');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: allocation.message }));
        } catch (txnErr) {
          await client.query('ROLLBACK');
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: txnErr.message, code: txnErr instanceof AllocationError ? txnErr.code : undefined }));
        } finally {
          client.release();
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  const allocReleaseMatch = req.url.match(/^\/api\/tournaments\/([^\/]+)\/allocations\/release$/);
  if (allocReleaseMatch && req.method === 'POST') {
    const tId = decodeURIComponent(allocReleaseMatch[1]);
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        }
        
        const payload = JSON.parse(body);
        const { teamId, reason } = payload;
        
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const tRes = await client.query('SELECT "orgId", finalized_at, status FROM tournaments WHERE id = $1 FOR UPDATE', [tId]);
          if (tRes.rows.length === 0) {
            await client.query('ROLLBACK');
            res.writeHead(404, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found' }));
          }
          const access = checkTournamentOrganizerAccess(authUser, tRes.rows[0]);
          if (!access.authorized) {
            await client.query('ROLLBACK');
            res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
          }
          if (tRes.rows[0].finalized_at) {
            throw new AllocationError(ALLOCATION_ERR.TOURNAMENT_FINALIZED, 'This tournament is finalized; team allocations are locked.');
          }
          
          const oldAssignRes = await client.query('SELECT * FROM tournament_match_assignments WHERE tournament_team_id = $1', [teamId]);
          
          await client.query('DELETE FROM tournament_match_assignments WHERE tournament_team_id = $1', [teamId]);
          await client.query("UPDATE tournament_teams SET status = 'allocation_pending' WHERE id = $1", [teamId]);
          
          // Audit
          const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
          await client.query(`
            INSERT INTO admin_action_log (id, admin_id, action, target_type, target_id, details)
            VALUES ($1, $2, $3, $4, $5, $6)
          `, [logId, authUser.id, 'allocation_release', 'tournament_team', teamId, JSON.stringify({ old: oldAssignRes.rows[0], reason })]);
          
          await client.query('COMMIT');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Allocation released.' }));
        } catch (txnErr) {
          await client.query('ROLLBACK');
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: txnErr.message }));
        } finally {
          client.release();
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  const allocHealthMatch = req.url.match(/^\/api\/tournaments\/([^\/]+)\/allocations\/health$/);
  if (allocHealthMatch && req.method === 'GET') {
    const tId = decodeURIComponent(allocHealthMatch[1]);
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }
      
      const tRes = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tId]);
      if (tRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found' }));
      }
      const access = checkTournamentOrganizerAccess(authUser, tRes.rows[0]);
      if (!access.authorized) {
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
      }

      const healthIssues = [];
      const dupRes = await pool.query(`
        SELECT tournament_team_id, match_id, COUNT(*)
        FROM tournament_match_assignments
        WHERE tournament_id = $1
        GROUP BY tournament_team_id, match_id
        HAVING COUNT(*) > 1
      `, [tId]);
      if (dupRes.rows.length > 0) healthIssues.push('Duplicate allocations found.');

      const capRes = await pool.query(`
        SELECT a.room_id, r.capacity, COUNT(DISTINCT a.tournament_team_id) as count
        FROM tournament_match_assignments a
        JOIN tournament_rooms r ON a.room_id = r.id
        WHERE a.tournament_id = $1
        GROUP BY a.room_id, r.capacity
        HAVING COUNT(DISTINCT a.tournament_team_id) > r.capacity
      `, [tId]);
      if (capRes.rows.length > 0) healthIssues.push('Capacity violations detected.');

      const orphanedRes = await pool.query(`
        SELECT a.id FROM tournament_match_assignments a
        LEFT JOIN tournament_teams t ON a.tournament_team_id = t.id
        WHERE a.tournament_id = $1 AND t.id IS NULL
      `, [tId]);
      if (orphanedRes.rows.length > 0) healthIssues.push('Orphaned assignment records found.');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, healthy: healthIssues.length === 0, issues: healthIssues }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- PHASE 9: MATCH CREDENTIALS & PARTICIPANT EXPERIENCE ---
  const credentialsMatch = req.url.match(/^\/api\/tournaments\/([^\/]+)\/matches\/([^\/]+)\/credentials$/);
  if (credentialsMatch && req.method === 'PUT') {
    const tId = decodeURIComponent(credentialsMatch[1]);
    const mId = decodeURIComponent(credentialsMatch[2]);
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        }

        const tRes = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tId]);
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        }
        if (!hasRole(authUser, ROLES.ADMIN) && tRes.rows[0].orgId !== authUser.id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        }

        const payload = JSON.parse(body);
        const { room_identifier, room_password } = payload;
        
        const mRes = await pool.query('SELECT * FROM tournament_matches WHERE id = $1 AND tournament_id = $2', [mId, tId]);
        if (mRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Match not found.' }));
        }

        const status = (room_identifier && room_password) ? 'Configured' : 'Not Configured';

        await pool.query(`
          UPDATE tournament_matches 
          SET room_identifier = $1, room_password = $2, credential_status = $3
          WHERE id = $4
        `, [room_identifier || null, room_password || null, status, mId]);

        // Audit log
        const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(`
          INSERT INTO admin_action_log (id, admin_id, action, target_type, target_id, details)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [logId, authUser.id, 'update_credentials', 'tournament_match', mId, JSON.stringify({ action: 'Set room credentials', status })]);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Credentials saved.', credential_status: status }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (credentialsMatch && req.method === 'GET') {
    const tId = decodeURIComponent(credentialsMatch[1]);
    const mId = decodeURIComponent(credentialsMatch[2]);
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
      }

      // Organizer check + approved roadmap gate for participants. Participants only
      // get credentials from an APPROVED roadmap (a draft/pending roadmap never
      // releases them, even if a row was somehow created early).
      const tRes = await pool.query('SELECT "orgId", roadmap_status, room_credentials_release_minutes FROM tournaments WHERE id = $1', [tId]);
      if (tRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
      }
      const isOrganizer = hasRole(authUser, ROLES.ADMIN) || tRes.rows[0].orgId === authUser.id;
      const releaseMinutes = normalizeReleaseMinutes(tRes.rows[0].room_credentials_release_minutes);

      // Verify participant is allocated to this match — scoped to the tournament
      // so a foreign match id / assignment row can never satisfy the check.
      let isAllocated = false;
      let matchedTeam = null;
      if (!isOrganizer) {
        if (tRes.rows[0].roadmap_status !== 'approved') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Roadmap is not approved yet.' }));
        }
        const teamCheck = await pool.query(`
          SELECT a.id, t.id AS team_id, t.status AS team_status, t.squad_waived_by, t.registration_id, t.leader_user_id
          FROM tournament_match_assignments a
          JOIN tournament_teams t ON a.tournament_team_id = t.id
          JOIN tournament_team_members tm ON a.tournament_team_id = tm.tournament_team_id
          WHERE a.match_id = $1 AND a.tournament_id = $2 AND tm.user_id = $3 AND tm.status = 'active'
        `, [mId, tId, authUser.id]);
        if (teamCheck.rows.some((r) => r.team_status === 'disqualified')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({
            success: false,
            error: 'TEAM_DISQUALIFIED',
            message: 'Your team is disqualified and cannot receive room credentials.',
          }));
        }
        if (teamCheck.rows.length === 0) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'You are not allocated to this match.' }));
        }
        isAllocated = true;
        matchedTeam = teamCheck.rows[0];

        // B4, B6, B7: STRICT SQUAD GATE
        // A participant receives credentials only if:
        // 1. Organizer has waived this team (squad_waived_by IS NOT NULL) OR
        // 2. The team is grandfathered (already verified, allocated, or allocation_pending) OR
        // 3. The squad is fully registered (every roster slot linked to an account)
        const isWaived = Boolean(matchedTeam.squad_waived_by);
        const isGrandfathered = ['verified', 'allocated', 'allocation_pending'].includes(matchedTeam.team_status);

        if (!isWaived && !isGrandfathered) {
          let reg = null;
          if (matchedTeam.registration_id) {
            const regRes = await pool.query('SELECT * FROM tournament_registrations WHERE id = $1', [matchedTeam.registration_id]);
            reg = regRes.rows[0] || null;
          }
          if (!reg) {
            const regRes = await pool.query('SELECT * FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1', [tId, matchedTeam.leader_user_id]);
            reg = regRes.rows[0] || null;
          }

          const tourDetailsRes = await pool.query('SELECT match_type FROM tournaments WHERE id = $1', [tId]);
          const tourRow = tourDetailsRes.rows[0] || {};
          const capacity = computeSquadCapacity(reg, tourRow);

          const membersCountRes = await pool.query('SELECT COUNT(*) AS count FROM tournament_team_members WHERE tournament_team_id = $1 AND status = \'active\'', [matchedTeam.team_id]);
          const joinedCount = parseInt(membersCountRes.rows[0]?.count || '0', 10);

          const stageInfo = computeRegistrationStage({
            registrationStatus: reg?.status || 'approved',
            capacity,
            joinedCount,
            isWaived: false,
            teamStatus: matchedTeam.team_status
          });

          if (!stageInfo.isComplete) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({
              success: true,
              status: 'locked',
              reason: 'squad_incomplete',
              joined: joinedCount,
              required: capacity,
              message: `Slot secured. Complete your squad (${joinedCount}/${capacity}) to unlock match room details`,
              releaseTime: null
            }));
          }
        }
      }

      // A3: LEFT JOIN prevents 404 when match day_id is NULL
      const mRes = await pool.query(`
        SELECT m.start_time, m.room_identifier, m.room_password, d."date" 
        FROM tournament_matches m
        LEFT JOIN tournament_days d ON m.day_id = d.id
        WHERE m.id = $1 AND m.tournament_id = $2
      `, [mId, tId]);
      
      if (mRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Match not found.' }));
      }

      const matchData = mRes.rows[0];

      // Shared server-side release arithmetic
      const releaseEpoch = matchReleaseEpoch(matchData.date, matchData.start_time, releaseMinutes);
      const releaseTime = releaseEpoch !== null ? new Date(releaseEpoch) : null;
      const isReleased = isMatchReleased(matchData.date, matchData.start_time, releaseMinutes);

      if (isOrganizer || isReleased) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          status: 'released',
          room_identifier: matchData.room_identifier,
          room_password: matchData.room_password,
          releaseTime: releaseTime ? releaseTime.toISOString() : null
        }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          status: 'locked',
          releaseTime: releaseTime ? releaseTime.toISOString() : null
        }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // === REGISTRATION SESSION ENDPOINTS ===

  // 7i_a. Create registration session (temporary, before payment)
  if (req.url.match(/^\/api\/sessions\/create\/([^\/]+)$/) && req.method === 'POST') {
    const tournamentId = req.url.split('/')[4];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to register.' }));
          return;
        }

        const formData = JSON.parse(body);
        if (!formData.team_name || !formData.captain) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Team name and captain tag are required.' }));
          return;
        }

        // Check tournament exists and is open
        const tRes = await pool.query(
          'SELECT id, title, status, "slotsTotal", "slotsFilled", entry_fee_amount, "registrationCloseDate" FROM tournaments WHERE id = $1',
          [tournamentId]
        );
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const tournament = tRes.rows[0];

        // Validate tournament state
        if (tournament.status === 'archived' || tournament.status === 'completed') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_CLOSED', message: 'Tournament has ended.' }));
          return;
        }
        if (tournament.registrationCloseDate) {
          const raw = tournament.registrationCloseDate;
          const closeDate = /^\d{4}-\d{2}-\d{2}$/.test(raw)
            ? new Date(raw + 'T23:59:59.999Z')
            : new Date(raw);
          if (closeDate < new Date()) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'REGISTRATION_CLOSED', message: 'Registration for this tournament has closed.' }));
            return;
          }
        }
        if (tournament.slotsFilled >= tournament.slotsTotal) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FULL', message: 'All slots for this tournament are filled.' }));
          return;
        }

        // Check duplicate registration / handle safe retry
        let existingReg = null;
        let isOrphanRetry = false;
        const dupRes = await pool.query(
          `SELECT tr.id, tr.status, tr.screenshot_url, tr.transaction_id, tr.team_name, tr.captain, tr.captain_uid, tr.members,
                  ps.id AS payment_id, ps.payment_status, ps.proof_url
           FROM tournament_registrations tr
           LEFT JOIN payment_submissions ps ON ps.registration_id = tr.id
           WHERE tr.tournament_id = $1 AND tr.user_id = $2
           ORDER BY tr.created_at DESC LIMIT 1`,
          [tournamentId, authUser.id]
        );
        if (dupRes.rows.length > 0) {
          existingReg = dupRes.rows[0];
          const currentStatus = (existingReg.status || '').toLowerCase();
          const reRegisterable = ['cancelled', 'expired', 'rejected', 'payment_rejected'];
          if (!reRegisterable.includes(currentStatus)) {
            const hasPayment = Boolean(existingReg.payment_id || existingReg.proof_url || existingReg.screenshot_url || existingReg.transaction_id);
            if (hasPayment) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: true,
                already_registered: true,
                status: existingReg.payment_status || existingReg.status,
                registration: existingReg,
                message: `You have already registered for this tournament. Current status: ${existingReg.payment_status || existingReg.status}.`
              }));
              return;
            } else {
              // Registration exists with NO payment record and NO screenshot: allow retry and attach payment
              isOrphanRetry = true;
            }
          }
        }

        // Check duplicate team name (exclude current orphan if retrying)
        let nameQuery = 'SELECT id FROM tournament_registrations WHERE tournament_id = $1 AND LOWER(team_name) = LOWER($2) AND status NOT IN (\'cancelled\', \'expired\', \'rejected\', \'PAYMENT_REJECTED\')';
        const nameParams = [tournamentId, formData.team_name.trim()];
        if (isOrphanRetry && existingReg) {
          nameQuery += ' AND id != $3';
          nameParams.push(existingReg.id);
        }
        const nameRes = await pool.query(nameQuery, nameParams);
        if (nameRes.rows.length > 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TEAM_NAME_TAKEN', message: 'This team name is already registered.' }));
          return;
        }

        // Generate idempotency key for session
        const idempotencyKey = 'IK-' + crypto.randomBytes(12).toString('hex');

        // Clean up old active sessions for this user+tournament
        await pool.query(
          "DELETE FROM registration_sessions WHERE user_id = $1 AND tournament_id = $2 AND status = 'active'",
          [authUser.id, tournamentId]
        );

        // Create session (preserving existing_registration_id for orphan attachment)
        const sessionId = 'SES-' + Date.now().toString().slice(-6) + '-' + crypto.randomBytes(4).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min expiry
        const sessionFormData = {
          ...formData,
          existing_registration_id: isOrphanRetry && existingReg ? existingReg.id : null
        };

        await pool.query(
          `INSERT INTO registration_sessions (id, tournament_id, user_id, form_data, idempotency_key, status, expires_at)
           VALUES ($1, $2, $3, $4, $5, 'active', $6)`,
          [sessionId, tournamentId, authUser.id, JSON.stringify(sessionFormData), idempotencyKey, expiresAt]
        );

        const entryFeeAmount = parseInt(tournament.entry_fee_amount) || 0;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          session: {
            id: sessionId,
            tournament_id: tournamentId,
            expires_at: expiresAt,
            requiresPayment: entryFeeAmount > 0,
            entry_fee_amount: entryFeeAmount
          }
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7i_b. Get registration session data
  if (req.url.match(/^\/api\/sessions\/([^\/]+)$/) && req.method === 'GET') {
    const sessionId = req.url.split('/')[3];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const sesRes = await pool.query('SELECT * FROM registration_sessions WHERE id = $1 AND user_id = $2', [sessionId, authUser.id]);
      if (sesRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Session not found or expired.' }));
        return;
      }

      const session = sesRes.rows[0];

      // If session is expired by time, mark it
      if (session.status === 'active' && new Date(session.expires_at) < new Date()) {
        await pool.query("UPDATE registration_sessions SET status = 'expired' WHERE id = $1", [sessionId]);
        session.status = 'expired';
      }

      // For completed sessions, return success + registration info so the success page can be re-shown
      if (session.status === 'completed') {
        const regRes = await pool.query(
          'SELECT * FROM tournament_registrations WHERE tournament_id = $1 AND user_id = $2 AND idempotency_key = $3 LIMIT 1',
          [session.tournament_id, authUser.id, session.idempotency_key]
        );
        const tRes = await pool.query(
          'SELECT id, title, game, "cover_image_url", prize, entry, entry_fee_amount, "orgName", status, "slotsTotal", "slotsFilled", teams_per_group FROM tournaments WHERE id = $1',
          [session.tournament_id]
        );
        let predictedGroup = null;
        if (regRes.rows[0] && tRes.rows[0]) {
          const tRow = tRes.rows[0];
          const tpg = normalizeTeamsPerGroup(tRow.teams_per_group, 16);
          const cRes = await pool.query(
            `SELECT COUNT(*) FROM tournament_registrations
             WHERE tournament_id = $1 AND status IN ('approved', 'confirmed', 'VERIFIED_BY_HOST', 'verified_by_host')`,
            [session.tournament_id]
          );
          const cCount = parseInt(cRes.rows[0].count) || 0;
          predictedGroup = predictedGroupFor(cCount, tRow.slotsTotal, tpg);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          completed: true,
          session: {
            id: session.id,
            tournament_id: session.tournament_id,
            form_data: JSON.parse(session.form_data),
            status: 'completed'
          },
          registration: regRes.rows[0] || null,
          predicted_group: predictedGroup,
          tournament: tRes.rows[0] || null
        }));
        return;
      }

      if (session.status !== 'active') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SESSION_EXPIRED', message: 'This session has already been used or expired.' }));
        return;
      }

      // Also fetch tournament data
      const tRes = await pool.query(
        'SELECT id, title, game, "cover_image_url", prize, entry, entry_fee_amount, "orgName", status, "slotsTotal", "slotsFilled" FROM tournaments WHERE id = $1',
        [session.tournament_id]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        session: {
          id: session.id,
          tournament_id: session.tournament_id,
          form_data: JSON.parse(session.form_data),
          expires_at: session.expires_at,
          created_at: session.created_at
        },
        tournament: tRes.rows[0] || null
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7i_c. Combined register-and-pay endpoint (creates registration + payment_submission atomically)
  if (req.url.match(/^\/api\/sessions\/([^\/]+)\/complete$/) && req.method === 'POST') {
    const sessionId = req.url.split('/')[3];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let client = null;
      let payload = null;
      try {
        client = await pool.connect();
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to complete registration.' }));
          return;
        }

        payload = JSON.parse(body);

        // Verify session belongs to user and is active
        const sesRes = await client.query(
          'SELECT * FROM registration_sessions WHERE id = $1::varchar AND user_id = $2::varchar',
          [sessionId, authUser.id]
        );
        if (sesRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Session not found.' }));
          return;
        }

        let session = sesRes.rows[0];
        const idempotencyKey = session.idempotency_key;
        const sendCompletedSession = async (sessionRow, commit = false) => {
          let regRes = await client.query(
            `SELECT * FROM tournament_registrations
             WHERE idempotency_key = $1::varchar AND tournament_id = $2::varchar AND user_id = $3::varchar
             ORDER BY created_at DESC LIMIT 1`,
            [sessionRow.idempotency_key, sessionRow.tournament_id, sessionRow.user_id]
          );
          if (!regRes.rows.length) {
            // Older completed sessions may predate use of the session key on registrations.
            regRes = await client.query(
              `SELECT * FROM tournament_registrations
               WHERE tournament_id = $1::varchar AND user_id = $2::varchar
               ORDER BY created_at DESC LIMIT 1`,
              [sessionRow.tournament_id, sessionRow.user_id]
            );
          }
          const registration = regRes.rows[0] || null;
          let payment = null;
          if (registration) {
            const paymentRes = await client.query(
              `SELECT id, amount, payment_status AS status
               FROM payment_submissions WHERE registration_id = $1::varchar
               ORDER BY created_at DESC LIMIT 1`,
              [registration.id]
            );
            payment = paymentRes.rows[0] || null;
          }
          if (!registration) {
            if (commit) await client.query('ROLLBACK');
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'REGISTRATION_NOT_FOUND', message: 'We could not find the saved registration. Please contact support.' }));
            return;
          }
          if (commit) await client.query('COMMIT');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            registration,
            payment,
            requiresPayment: Boolean(payment),
            amount_to_pay: payment?.amount ?? registration?.amount_due ?? null,
            idempotent: true
          }));
        };
        if (session.status === 'completed') {
          await sendCompletedSession(session);
          return;
        }
        if (session.status !== 'active') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SESSION_EXPIRED', message: 'This session has already been used.' }));
          return;
        }
        if (new Date(session.expires_at) < new Date()) {
          await client.query("UPDATE registration_sessions SET status = 'expired' WHERE id = $1::varchar", [sessionId]);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SESSION_EXPIRED', message: 'Session has expired. Please register again.' }));
          return;
        }

        // Idempotency check: if we've already processed this key, return existing result
        if (idempotencyKey) {
          const existingReg = await client.query(
            'SELECT * FROM tournament_registrations WHERE idempotency_key = $1::varchar',
            [idempotencyKey]
          );
          if (existingReg.rows.length > 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, registration: existingReg.rows[0], idempotent: true }));
            return;
          }
        }

        const formData = JSON.parse(session.form_data);

        // Verify tournament is still open
        const tRes = await client.query(
          'SELECT id, title, "slotsTotal", "slotsFilled", entry_fee_amount, "registrationCloseDate", teams_per_group, unique_amount_suffix_enabled FROM tournaments WHERE id = $1::varchar',
          [session.tournament_id]
        );
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const tournament = tRes.rows[0];

        // Registration close date check (defense-in-depth)
        if (tournament.registrationCloseDate) {
          const raw = tournament.registrationCloseDate;
          const closeDate = /^\d{4}-\d{2}-\d{2}$/.test(raw)
            ? new Date(raw + 'T23:59:59.999Z')
            : new Date(raw);
          if (closeDate < new Date()) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'REGISTRATION_CLOSED', message: 'Registration for this tournament has closed.' }));
            return;
          }
        }

        // Optimistic slot check
        if (tournament.slotsFilled >= tournament.slotsTotal) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FULL', message: 'All slots are filled.' }));
          return;
        }

        const entryFeeAmount = parseInt(tournament.entry_fee_amount) || 0;
        const isPaid = entryFeeAmount > 0;

        const normPaymentApp = normalizePaymentApp(payload?.payment_app);
        if (isPaid && (
          !payload?.screenshot_url ||
          !payload?.utr_number ||
          !isValidPaymentApp(payload?.payment_app)
        )) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'PAYMENT_PROOF_REQUIRED',
            message: 'Select a payment app, enter the 12-digit UTR, and upload a payment screenshot.',
          }));
          return;
        }

        // v1.1: Unique amount suffix for high-volume tournaments
        let amountToPay = entryFeeAmount;
        if (isPaid && tournament.unique_amount_suffix_enabled) {
          const suffix = Math.floor(Math.random() * UNIQUE_AMOUNT_SUFFIX_RANGE) + 1; // 1–99 paisa
          amountToPay = entryFeeAmount + suffix / 100;
        }

        await client.query('BEGIN');

        // Serialize completion attempts for this session before creating records.
        const lockedSessionRes = await client.query(
          `SELECT * FROM registration_sessions
           WHERE id = $1::varchar AND user_id = $2::varchar FOR UPDATE`,
          [sessionId, authUser.id]
        );
        if (lockedSessionRes.rows.length === 0) {
          await client.query('ROLLBACK');
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Session not found.' }));
          return;
        }
        session = lockedSessionRes.rows[0];
        if (session.status === 'completed') {
          await sendCompletedSession(session, true);
          return;
        }
        if (session.status !== 'active' || new Date(session.expires_at) < new Date()) {
          await client.query('ROLLBACK');
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SESSION_EXPIRED', message: 'Session has expired. Please register again.' }));
          return;
        }

        // Serialize distinct sessions for the same tournament so parallel tabs cannot
        // both pass the duplicate-registration check before either inserts a row.
        const tournamentLockRes = await client.query(
          'SELECT id, "slotsTotal", "slotsFilled", title FROM tournaments WHERE id = $1::varchar FOR UPDATE',
          [session.tournament_id]
        );
        if (tournamentLockRes.rows.length === 0) {
          await client.query('ROLLBACK');
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }

        // Check duplicate registration / handle safe retry for orphans (within transaction)
        const dupGuard = await client.query(
          `SELECT tr.id, tr.status, tr.screenshot_url, tr.transaction_id,
                  ps.id AS payment_id, ps.payment_status, ps.proof_url
           FROM tournament_registrations tr
           LEFT JOIN payment_submissions ps ON ps.registration_id = tr.id
           WHERE tr.tournament_id = $1::varchar AND tr.user_id = $2::varchar
           ORDER BY tr.created_at DESC LIMIT 1 FOR UPDATE OF tr`,
          [session.tournament_id, authUser.id]
        );

        let targetRegId = formData.existing_registration_id || null;
        let isUpdatingExisting = false;

        if (dupGuard.rows.length > 0) {
          const existing = dupGuard.rows[0];
          const reRegisterable = ['cancelled', 'expired', 'rejected', 'payment_rejected'];
          const currentStatus = (existing.status || '').toLowerCase();
          const hasPayment = Boolean(existing.payment_id || existing.proof_url || existing.screenshot_url || existing.transaction_id);

          if (!reRegisterable.includes(currentStatus)) {
            if (hasPayment) {
              await client.query('ROLLBACK');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: true,
                already_registered: true,
                status: existing.payment_status || existing.status,
                registration: existing,
                message: `You have already registered a team for this tournament. Current status: ${existing.payment_status || existing.status}.`
              }));
              return;
            } else {
              // Orphan registration found! Safe retry attaches payment to this row
              targetRegId = existing.id;
              isUpdatingExisting = true;
            }
          } else {
            // Re-registering after rejection or cancellation: reuse the existing registration row
            targetRegId = existing.id;
            isUpdatingExisting = true;
          }
        }
        if (payload && payload.screenshot_url && !isAllowedStorageUrl(payload.screenshot_url)) {
          await client.query('ROLLBACK');
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_STORAGE_URL', message: 'Payment screenshot URL must use HTTPS and an allowed ImageKit or Supabase storage endpoint.' }));
          return;
        }

        // Validate 12-digit reference when UPI is used
        if (isPaid && payload && payload.utr_number) {
          const isUpi = Boolean(payload.utr_number) || !payload.payment_app || ['google_pay', 'phonepe', 'paytm', 'bhim', 'amazon_pay', 'cred', 'whatsapp_pay', 'mobikwik', 'other', 'upi', 'gpay'].includes((payload.payment_app || '').toLowerCase());
          if (isUpi && !isValidUpiUtr(payload.utr_number)) {
            await client.query('ROLLBACK');
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'INVALID_UTR', message: 'A valid 12-digit UPI reference (UTR) is required.' }));
            return;
          }
        }

        const assignedAmountDue = isPaid ? amountToPay : null;
        const membersStr = formData.members ? (typeof formData.members === 'string' ? formData.members : JSON.stringify(formData.members)) : '[]';
        const status = isPaid ? (payload.screenshot_url ? 'pending' : 'pending_payment') : 'pending';

        let regRes;
        let regId = targetRegId;

        if (isUpdatingExisting && regId) {
          regRes = await client.query(
            `UPDATE tournament_registrations
             SET team_name = $1::varchar, captain = $2::varchar, captain_uid = $3::varchar, members = $4::text,
                 status = $5::varchar, email = $6::varchar, phone = $7::varchar, screenshot_url = $8::text,
                 transaction_id = $9::varchar, payment_app = $10::varchar, amount_due = COALESCE(amount_due, $11::numeric),
                 rejection_reason = NULL, rejected_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = $12::varchar RETURNING *`,
            [formData.team_name, formData.captain, formData.captain_uid || null, membersStr,
             status, formData.email || null, formData.phone || null,
             payload.screenshot_url || null, payload.utr_number || null, normPaymentApp || 'other',
             assignedAmountDue, regId]
          );
        } else {
          const lockedTourney = tournamentLockRes.rows[0];
          const sessionSlotsTotal = parseInt(lockedTourney.slotsTotal) || 128;
          const capCheckRes = await client.query(
            `SELECT COUNT(DISTINCT COALESCE(NULLIF(LOWER(TRIM(team_name)), ''), id)) AS count
             FROM tournament_registrations
             WHERE tournament_id = $1::varchar
               AND (status IS NULL OR NOT (LOWER(status) = ANY($2)))`,
            [session.tournament_id, ['rejected', 'cancelled', 'expired', 'payment_rejected', 'waitlisted']]
          );
          const currentOccupied = parseInt(capCheckRes.rows[0]?.count) || 0;
          if (currentOccupied >= sessionSlotsTotal) {
            await client.query('ROLLBACK');
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'SLOTS_FULL',
              message: `Tournament "${lockedTourney.title || session.tournament_id}" is full (${currentOccupied}/${sessionSlotsTotal} slots occupied).`
            }));
            return;
          }

          regId = 'REG-' + Date.now().toString().slice(-6) + '-' + crypto.randomBytes(4).toString('hex');
          regRes = await client.query(
            `INSERT INTO tournament_registrations (id, tournament_id, user_id, team_name, captain, captain_uid, members, status, email, phone, idempotency_key, version, screenshot_url, transaction_id, payment_app, amount_due)
             VALUES ($1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::varchar, $6::varchar, $7::text, $8::varchar, $9::varchar, $10::varchar, $11::varchar, 1, $12::text, $13::varchar, $14::varchar, $15::numeric) RETURNING *`,
            [regId, session.tournament_id, authUser.id, formData.team_name, formData.captain, formData.captain_uid || null,
             membersStr, status, formData.email || null, formData.phone || null, idempotencyKey || null,
             payload.screenshot_url || null, payload.utr_number || null, normPaymentApp || 'other', assignedAmountDue]
          );
        }

        let paymentRecord = null;

        if (isPaid && payload.screenshot_url) {
          // Check if payment submission already exists for this registration to avoid duplicate records
          const existingPayRes = await client.query(
            `SELECT id FROM payment_submissions WHERE registration_id = $1::varchar LIMIT 1`,
            [regId]
          );
          let payId;
          if (existingPayRes.rows.length > 0) {
            payId = existingPayRes.rows[0].id;
            await client.query(
              `UPDATE payment_submissions
               SET amount = $1::numeric, proof_url = $2::text, utr_number = $3::varchar, payment_app = $4::varchar,
                   payment_status = 'pending_admin_review', admin_notes = NULL, reviewed_by = NULL, reviewed_at = NULL,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $5::varchar`,
              [amountToPay, payload.screenshot_url, payload.utr_number || null, normPaymentApp || 'other', payId]
            );
          } else {
            payId = 'PAY-' + Date.now().toString().slice(-6) + '-' + crypto.randomBytes(4).toString('hex');
            const payIdempKey = idempotencyKey ? 'PAY-' + idempotencyKey : null;
            await client.query(
              `INSERT INTO payment_submissions (id, registration_id, tournament_id, user_id, amount, proof_url, utr_number, payment_app, payment_status, idempotency_key)
               VALUES ($1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::numeric, $6::text, $7::varchar, $8::varchar, 'pending_admin_review', $9::varchar)`,
              [payId, regId, session.tournament_id, authUser.id, amountToPay,
               payload.screenshot_url, payload.utr_number || null, normPaymentApp || 'other', payIdempKey]
            );
          }

          // Link payment to registration
          await client.query(
            'UPDATE tournament_registrations SET payment_id = $1::varchar WHERE id = $2::varchar',
            [payId, regId]
          );

          paymentRecord = { id: payId, amount: amountToPay, status: 'pending_admin_review' };
        }

        // Mark session as used
        await client.query(
          "UPDATE registration_sessions SET status = 'completed' WHERE id = $1::varchar",
          [sessionId]
        );

        // Predicted group: where this (not-yet-confirmed) team will land once
        // approved, given the current confirmed/verified count.
        const tpgPredicted = normalizeTeamsPerGroup(tournament.teams_per_group, 16);
        const confirmedCountRes = await client.query(
          `SELECT COUNT(*) FROM tournament_registrations
           WHERE tournament_id = $1::varchar AND status IN ('approved', 'confirmed', 'VERIFIED_BY_HOST', 'verified_by_host')`,
          [session.tournament_id]
        );
        const confirmedCount = parseInt(confirmedCountRes.rows[0].count) || 0;
        const predictedGroup = predictedGroupFor(confirmedCount, tournament.slotsTotal, tpgPredicted);

        await client.query('COMMIT');

        try {
          await reconcileTournamentSlots(pool, session.tournament_id);
        } catch (slotErr) {
          console.warn('[SessionComplete] reconcileTournamentSlots skipped:', slotErr.message);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          registration: regRes.rows[0],
          predicted_group: predictedGroup,
          payment: paymentRecord,
          requiresPayment: isPaid,
          amount_to_pay: isPaid ? amountToPay : null
        }));
      } catch (err) {
        if (client) {
          try { await client.query('ROLLBACK'); } catch {}
        }
        if (payload?.screenshot_url) {
          try {
            await removeUploadedMedia(payload.screenshot_url);
          } catch (cleanupError) {
            console.warn('[SessionComplete] Uploaded image cleanup failed:', cleanupError.message);
          }
        }
        const ref = makeErrorRef();
        logErrorWithRef(ref, 'POST /api/sessions/:id/complete', err, 'complete_transaction');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', ref, message: `Could not save, please try again. (Ref: ${ref})` }));
        }
      } finally {
        client?.release();
      }
    });
    return;
  }

  if (req.url.startsWith('/api/tournaments/') && req.url.endsWith('/register') && req.method === 'POST') {
    const parts = req.url.split('/');
    const id = parts[3];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to register.' }));
          return;
        }

        const data = JSON.parse(body);
        if (!data.team_name || !data.captain) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Team name and captain tag are required.' }));
          return;
        }

        // Check if user is already registered for this tournament
        // Allow re-registration if previous attempt was rejected, cancelled, or expired; safe retry for orphans
        let existingOrphanId = null;
        const dupRes = await pool.query(
          `SELECT tr.id, tr.status, tr.screenshot_url, tr.transaction_id,
                  ps.id AS payment_id, ps.payment_status, ps.proof_url
           FROM tournament_registrations tr
           LEFT JOIN payment_submissions ps ON ps.registration_id = tr.id
           WHERE tr.tournament_id = $1::varchar AND tr.user_id = $2::varchar
           ORDER BY tr.created_at DESC LIMIT 1`,
          [id, authUser.id]
        );
        if (dupRes.rows.length > 0) {
          const existing = dupRes.rows[0];
          const currentStatus = (existing.status || '').toLowerCase();
          const reRegisterable = ['cancelled', 'expired', 'rejected', 'payment_rejected'];
          if (!reRegisterable.includes(currentStatus)) {
            const hasPayment = Boolean(existing.payment_id || existing.proof_url || existing.screenshot_url || existing.transaction_id);
            if (hasPayment) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: true,
                already_registered: true,
                status: existing.payment_status || existing.status,
                registration: existing,
                message: `You have already registered a team for this tournament. Current status: ${existing.payment_status || existing.status}.`
              }));
              return;
            } else {
              existingOrphanId = existing.id;
            }
          }
        }

        const regClient = await pool.connect();
        let dbRes;
        let entryFeeAmount = 0;
        let isPaid = false;
        let amountToPay = 0;
        try {
          await regClient.query('BEGIN');

          // Transaction row-lock on tournament row (PAY-004 concurrency control)
          const tRes = await regClient.query('SELECT "slotsTotal", "slotsFilled", "entry_fee_amount", "registrationCloseDate", unique_amount_suffix_enabled FROM tournaments WHERE id = $1::varchar FOR UPDATE', [id]);
          if (tRes.rows.length === 0) {
            await regClient.query('ROLLBACK');
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
            regClient.release();
            return;
          }
          const t = tRes.rows[0];

          // Check if registration window has closed
          if (t.registrationCloseDate && new Date(t.registrationCloseDate) < new Date()) {
            await regClient.query('ROLLBACK');
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'REGISTRATION_CLOSED', message: 'Registration has ended for this tournament.' }));
            regClient.release();
            return;
          }

          entryFeeAmount = parseInt(t.entry_fee_amount) || 0;
          isPaid = entryFeeAmount > 0;
          amountToPay = entryFeeAmount;

          if (isPaid && t.unique_amount_suffix_enabled) {
            const suffix = Math.floor(Math.random() * UNIQUE_AMOUNT_SUFFIX_RANGE) + 1;
            amountToPay = entryFeeAmount + suffix / 100;
          }

          // Count active registrations within transaction (excluding cancelled, rejected, expired, payment_rejected)
          const EXCLUDED_STATUSES = ['rejected', 'cancelled', 'expired', 'payment_rejected', 'waitlisted'];
          const activeCountRes = await regClient.query(
            `SELECT COUNT(DISTINCT COALESCE(NULLIF(LOWER(TRIM(team_name)), ''), id)) AS active_count
             FROM tournament_registrations
             WHERE tournament_id = $1::varchar
               AND (status IS NULL OR NOT (LOWER(status) = ANY($2)))`,
            [id, EXCLUDED_STATUSES]
          );
          const activeCount = parseInt(activeCountRes.rows[0]?.active_count || '0');
          const slotsTotal = parseInt(t.slotsTotal) || 128;

          if (activeCount >= slotsTotal && !existingOrphanId) {
            await regClient.query('ROLLBACK');
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'SLOTS_FULL',
              message: `Tournament "${t.title || id}" is full (${activeCount}/${slotsTotal} slots occupied).`
            }));
            regClient.release();
            return;
          }

          let status = isPaid ? 'pending_payment' : 'pending';

          let slotNumber = data.slot_number ? parseInt(data.slot_number) : null;
          if (slotNumber) {
            const slotCheck = await regClient.query(
              "SELECT id FROM tournament_registrations WHERE tournament_id = $1::varchar AND slot_number = $2::int AND status IN ('approved', 'confirmed', 'pending', 'pending_payment') FOR UPDATE",
              [id, slotNumber]
            );
            if (slotCheck.rows.length > 0) {
              await regClient.query('ROLLBACK');
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, error: 'SLOT_TAKEN', message: `Slot #${slotNumber} is already reserved by another team.` }));
              regClient.release();
              return;
            }
          }

          const regId = 'REG-' + Date.now().toString().slice(-6);
          const membersStr = data.members ? (typeof data.members === 'string' ? data.members : JSON.stringify(data.members)) : '[]';
          const idempotencyKey = data.idempotency_key || null;

          if (idempotencyKey) {
            const existingReg = await regClient.query(
              'SELECT * FROM tournament_registrations WHERE idempotency_key = $1::varchar',
              [idempotencyKey]
            );
            if (existingReg.rows.length > 0) {
              await regClient.query('COMMIT');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, registration: existingReg.rows[0], requiresPayment: isPaid, idempotent: true }));
              regClient.release();
              return;
            }
          }

          const assignedAmountDue = isPaid ? amountToPay : null;
          if (existingOrphanId) {
            dbRes = await regClient.query(
              `UPDATE tournament_registrations
               SET team_name = $1::varchar, captain = $2::varchar, captain_uid = $3::varchar, members = $4::text,
                   status = $5::varchar, slot_number = $6::int, email = $7::varchar, phone = $8::varchar, idempotency_key = $9::varchar, amount_due = COALESCE(amount_due, $10::numeric), updated_at = CURRENT_TIMESTAMP
               WHERE id = $11::varchar RETURNING *`,
              [data.team_name, data.captain, data.captain_uid || null, membersStr, status, slotNumber, data.email || null, data.phone || null, idempotencyKey, assignedAmountDue, existingOrphanId]
            );
          } else {
            dbRes = await regClient.query(
              `INSERT INTO tournament_registrations (id, tournament_id, user_id, team_name, captain, captain_uid, members, status, slot_number, email, phone, idempotency_key, version, amount_due)
               VALUES ($1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::varchar, $6::varchar, $7::text, $8::varchar, $9::int, $10::varchar, $11::varchar, $12::varchar, 1, $13::numeric) RETURNING *`,
              [regId, id, authUser.id, data.team_name, data.captain, data.captain_uid || null, membersStr, status, slotNumber, data.email || null, data.phone || null, idempotencyKey, assignedAmountDue]
            );
          }

          await regClient.query('COMMIT');
        } catch (txnErr) {
          await regClient.query('ROLLBACK');
          throw txnErr;
        } finally {
          regClient.release();
        }

        await reconcileTournamentSlots(pool, id);

        console.log(`\n📦 [MATCH DISTRICT DB] Team "${data.team_name}" registered for "${id}" with status "${status}" and entry fee ${entryFeeAmount} in Supabase.\n`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, registration: dbRes.rows[0], requiresPayment: isPaid, amount_to_pay: isPaid ? amountToPay : null }));
      } catch (err) {
        const ref = makeErrorRef();
        logErrorWithRef(ref, 'POST /api/tournaments/:id/register', err, 'register_team');
        const isSchemaError = err.message && err.message.includes('does not exist');
        const message = isSchemaError
          ? `Registration service configuration error. Please contact support. (Ref: ${ref})`
          : `Could not complete registration. Please try again. (Ref: ${ref})`;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', ref, message }));
      }
    });
    return;
  }

  // 7j_b. Confirm registration after payment
  if (req.url.startsWith('/api/tournaments/') && req.url.includes('/register/') && req.url.endsWith('/confirm') && req.method === 'POST') {
    const parts = req.url.split('/');
    const tournamentId = parts[3];
    const regId = parts[5];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to confirm registration.' }));
          return;
        }

        const regRes = await pool.query('SELECT * FROM tournament_registrations WHERE id = $1::varchar AND tournament_id = $2::varchar', [regId, tournamentId]);
        if (regRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Registration not found.' }));
          return;
        }

        const reg = regRes.rows[0];
        if (reg.user_id !== authUser.id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'This registration does not belong to you.' }));
          return;
        }

        if (reg.status !== 'pending_payment') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_STATUS', message: 'Registration is not awaiting payment.' }));
          return;
        }

        const bodyData = JSON.parse(body);
        if (bodyData.screenshot_url && !isAllowedStorageUrl(bodyData.screenshot_url)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_STORAGE_URL', message: 'Payment screenshot URL must use HTTPS and an allowed ImageKit or Supabase storage endpoint.' }));
          return;
        }
        const dbRes = await pool.query(
          `UPDATE tournament_registrations SET status = 'pending', transaction_id = $1::varchar, payment_app = $2::varchar, screenshot_url = $3::text WHERE id = $4::varchar RETURNING *`,
          [bodyData.transaction_id || null, bodyData.payment_app || null, bodyData.screenshot_url || null, regId]
        );

        await reconcileTournamentSlots(pool, tournamentId);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, registration: dbRes.rows[0] }));
      } catch (err) {
        const ref = makeErrorRef();
        logErrorWithRef(ref, 'POST /api/tournaments/:id/register/:regId/confirm', err, 'confirm_registration');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', ref, message: `Could not save, please try again. (Ref: ${ref})` }));
      }
    });
    return;
  }

  // 7j_c. Submit payment proof for a registration (keeps status pending_payment)
  if (req.url.startsWith('/api/tournaments/') && req.url.includes('/register/') && req.url.endsWith('/payment') && req.method === 'POST') {
    const parts = req.url.split('/');
    const tournamentId = parts[3];
    const regId = parts[5];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to submit payment proof.' }));
          return;
        }

        const bodyData = JSON.parse(body);
        if (!bodyData.screenshot_url || !isAllowedStorageUrl(bodyData.screenshot_url)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_STORAGE_URL', message: 'A valid payment screenshot from an allowed HTTPS ImageKit or Supabase storage endpoint is required.' }));
          return;
        }

        const normPutApp = normalizePaymentApp(bodyData.payment_app);
        // Validate 12-digit reference when UPI is used
        if (bodyData.transaction_id) {
          const isUpi = Boolean(bodyData.transaction_id) || !bodyData.payment_app || ['google_pay', 'phonepe', 'paytm', 'bhim', 'amazon_pay', 'cred', 'whatsapp_pay', 'mobikwik', 'other', 'upi', 'gpay'].includes((bodyData.payment_app || '').toLowerCase());
          if (isUpi && !isValidUpiUtr(bodyData.transaction_id)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'INVALID_UTR', message: 'A valid 12-digit UPI reference (UTR) is required.' }));
            return;
          }
        }

        const regRes = await pool.query('SELECT * FROM tournament_registrations WHERE id = $1::varchar AND tournament_id = $2::varchar', [regId, tournamentId]);
        if (regRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Registration not found.' }));
          return;
        }

        const reg = regRes.rows[0];
        if (reg.user_id !== authUser.id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'This registration does not belong to you.' }));
          return;
        }

        const allowedUploadStatuses = ['pending_payment', 'rejected', 'PAYMENT_REJECTED'];
        if (!allowedUploadStatuses.includes(reg.status)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_STATUS', message: 'This registration is not awaiting payment or proof re-upload.' }));
          return;
        }

        // Transitions: payment pending -> pending review; rejected -> pending review
        const dbRes = await pool.query(
          `UPDATE tournament_registrations
           SET status = 'pending', transaction_id = $1::varchar, payment_app = $2::varchar, screenshot_url = $3::text,
               rejection_reason = NULL, rejected_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $4::varchar RETURNING *`,
          [bodyData.transaction_id || null, normPutApp || 'other', bodyData.screenshot_url, regId]
        );

        // Update or insert payment_submissions
        if (reg.payment_id) {
          await pool.query(
            `UPDATE payment_submissions
             SET payment_status = 'pending_admin_review', proof_url = $1::text, utr_number = $2::varchar,
                 payment_app = $3::varchar, admin_notes = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = $4::varchar`,
            [bodyData.screenshot_url, bodyData.transaction_id || null, normPutApp || 'other', reg.payment_id]
          );
        } else {
          const payId = 'PAY-' + Date.now().toString().slice(-6) + '-' + crypto.randomBytes(4).toString('hex');
          await pool.query(
            `INSERT INTO payment_submissions (id, registration_id, tournament_id, user_id, amount, proof_url, utr_number, payment_app, payment_status)
             VALUES ($1::varchar, $2::varchar, $3::varchar, $4::varchar, $5::numeric, $6::text, $7::varchar, $8::varchar, 'pending_admin_review')`,
            [payId, regId, tournamentId, authUser.id, reg.amount_due || 0, bodyData.screenshot_url, bodyData.transaction_id || null, normPutApp || 'other']
          );
          await pool.query('UPDATE tournament_registrations SET payment_id = $1::varchar WHERE id = $2::varchar', [payId, regId]);
        }

        await reconcileTournamentSlots(pool, tournamentId);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Payment proof submitted successfully. Verification pending.', registration: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7k. Supabase Get All Registrations for a Tournament (auth required)
  if (req.url.startsWith('/api/tournaments/') && req.url.endsWith('/registrations') && req.method === 'GET') {
    const parts = req.url.split('/');
    const id = parts[3];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
        return;
      }
      const tournRes = await pool.query('SELECT "orgId", match_type FROM tournaments WHERE id = $1', [id]);
      if (tournRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
      }
      const tournament = tournRes.rows[0];
      const access = checkTournamentOrganizerAccess(authUser, tournament);
      if (!access.authorized) {
        res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
      }
      const dbRes = await pool.query('SELECT * FROM tournament_registrations WHERE tournament_id = $1 ORDER BY created_at ASC', [id]);

      // Enrich registrations with squad stage & team details
      const teamsRes = await pool.query(`
        SELECT t.id, t.team_name, t.leader_user_id, t.status, t.registration_id,
               t.squad_waived_by, t.squad_waived_at, t.squad_waived_reason,
               json_agg(
                 json_build_object(
                   'id', tm.id,
                   'user_id', tm.user_id,
                   'role', tm.role,
                   'roster_slot', tm.roster_slot,
                   'status', tm.status
                 )
               ) FILTER (WHERE tm.id IS NOT NULL) AS members
        FROM tournament_teams t
        LEFT JOIN tournament_team_members tm ON tm.tournament_team_id = t.id AND tm.status = 'active'
        WHERE t.tournament_id = $1
        GROUP BY t.id
      `, [id]);

      const teamByRegId = new Map();
      const teamByLeaderId = new Map();
      for (const t of teamsRes.rows) {
        if (t.registration_id) teamByRegId.set(t.registration_id, t);
        if (t.leader_user_id) teamByLeaderId.set(t.leader_user_id, t);
      }

      const enriched = dbRes.rows.map((reg) => {
        const team = teamByRegId.get(reg.id) || teamByLeaderId.get(reg.user_id) || null;
        const members = team?.members || [];
        const isWaived = Boolean(team?.squad_waived_by);
        const capacity = computeSquadCapacity(reg, tournament);
        const stageInfo = computeRegistrationStage({
          registrationStatus: reg.status,
          capacity,
          joinedCount: members.length,
          isWaived,
          teamStatus: team?.status,
        });
        const parsedSlots = parseRosterSlots(reg, tournament);
        const claimedSlots = new Set(members.map((m) => m.roster_slot).filter((s) => s !== null && s !== undefined));
        const unlinkedSlots = parsedSlots.filter((s) => !claimedSlots.has(s.slot));

        return {
          ...reg,
          stage: stageInfo.stage,
          stage_label: stageInfo.label,
          stage_message: stageInfo.message,
          is_squad_complete: stageInfo.isComplete,
          squad_joined: team ? members.length : 1,
          squad_required: capacity,
          squad_capacity: capacity,
          squad_waived: isWaived,
          squad_waived_at: team?.squad_waived_at || null,
          squad_waived_reason: team?.squad_waived_reason || null,
          unlinked_slots: team ? unlinkedSlots : parsedSlots.slice(1),
          team_id: team?.id || null,
          team_status: team?.status || null,
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, registrations: enriched }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- ADMIN: System Monitoring Endpoints ---
  if (req.url === '/api/admin/monitoring/overview' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }

      // Fetch all services
      const servicesRes = await pool.query('SELECT * FROM system_services ORDER BY name ASC');
      
      // Fetch active incidents
      const incidentsRes = await pool.query(`
        SELECT i.*, s.name as service_name 
        FROM system_incidents i 
        JOIN system_services s ON i.service_id = s.id 
        WHERE i.status = 'active'
        ORDER BY i.started_at DESC
      `);

      // For each service, calculate 24h, 7d, 30d uptime and get latest latency
      const services = await Promise.all(servicesRes.rows.map(async (srv) => {
        const stats = await pool.query(`
          SELECT 
            COUNT(*) as total_checks,
            SUM(CASE WHEN status = 'healthy' THEN 1 ELSE 0 END) as successful_checks,
            MAX(response_time_ms) as max_latency,
            AVG(response_time_ms) as avg_latency
          FROM service_health_checks
          WHERE service_id = $1 AND checked_at >= NOW() - INTERVAL '30 days'
        `, [srv.id]);

        const latest = await pool.query(`
          SELECT status, response_time_ms, checked_at 
          FROM service_health_checks 
          WHERE service_id = $1 
          ORDER BY checked_at DESC LIMIT 1
        `, [srv.id]);

        const total = parseInt(stats.rows[0].total_checks || '0', 10);
        const success = parseInt(stats.rows[0].successful_checks || '0', 10);
        const uptime30d = total > 0 ? ((success / total) * 100).toFixed(2) : 100;

        return {
          ...srv,
          status: latest.rows.length > 0 ? latest.rows[0].status : 'unknown',
          latency: latest.rows.length > 0 ? latest.rows[0].response_time_ms : null,
          last_checked: latest.rows.length > 0 ? latest.rows[0].checked_at : null,
          uptime_30d: parseFloat(uptime30d)
        };
      }));

      // Calculate global uptime (average of all 30d uptimes)
      const globalUptime = services.length > 0 
        ? (services.reduce((acc, s) => acc + s.uptime_30d, 0) / services.length).toFixed(2) 
        : 100;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: true, 
        services, 
        incidents: incidentsRes.rows,
        global_uptime: parseFloat(globalUptime)
      }));
    } catch (err) {
      console.error('[Monitoring] Overview Error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
    }
    return;
  }

  if (req.url === '/api/admin/monitoring/history' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }

      const checksRes = await pool.query(`
        SELECT service_id, status, response_time_ms, checked_at 
        FROM service_health_checks 
        WHERE checked_at >= NOW() - INTERVAL '24 hours'
        ORDER BY checked_at ASC
      `);

      // Group by service_id
      const history = {};
      checksRes.rows.forEach(row => {
        if (!history[row.service_id]) history[row.service_id] = [];
        history[row.service_id].push({
          time: row.checked_at,
          latency: row.response_time_ms,
          status: row.status
        });
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, history }));
    } catch (err) {
      console.error('[Monitoring] History Error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
    }
    return;
  }

  if (req.url === '/api/admin/monitoring/security' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      const findings = await pool.query('SELECT * FROM security_findings ORDER BY detected_at DESC');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, findings: findings.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
    }
    return;
  }

  if (req.url === '/api/admin/monitoring/security/scan' && req.method === 'POST') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }

      // Rate limit security scan
      const deviceKey = 'scan_' + (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown');
      const rl = checkRateLimit(deviceKey);
      if (!rl.allowed) {
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': rl.retryAfter });
        res.end(JSON.stringify({ success: false, error: 'Too many requests, try again later' }));
        return;
      }

      const findings = [];
      
      // 1. Check for exposed secrets in the environment
      if (process.env.ADMIN_PASSWORD === '101010' || !process.env.ADMIN_PASSWORD) {
        findings.push({ type: 'weak_config', severity: 'critical', service: 'authentication', description: 'Admin password is set to default or missing.' });
      }
      if (process.env.JWT_SECRET === 'matchdistrict_super_secure_jwt_secret_key_2026') {
        findings.push({ type: 'weak_config', severity: 'critical', service: 'authentication', description: 'JWT Secret is set to insecure default.' });
      }
      
      // 2. Scan frontend bundle (dist/assets/*.js) for sensitive strings (safely)
      const fs = await import('fs');
      const path = await import('path');
      const distAssetsPath = path.join(process.cwd(), 'dist', 'assets');
      
      if (fs.existsSync(distAssetsPath)) {
        const files = fs.readdirSync(distAssetsPath).filter(f => f.endsWith('.js'));
        const secretsToHunt = [
          { name: 'SUPABASE_SERVICE_ROLE_KEY', val: process.env.SUPABASE_SERVICE_ROLE_KEY },
          { name: 'IMAGEKIT_PRIVATE_KEY', val: process.env.IMAGEKIT_PRIVATE_KEY },
          { name: 'DATABASE_URL', val: process.env.DATABASE_URL },
          { name: 'JWT_SECRET', val: process.env.JWT_SECRET }
        ].filter(s => s.val && s.val.length > 5); // Only hunt if secret is substantial

        for (const file of files) {
          const content = fs.readFileSync(path.join(distAssetsPath, file), 'utf-8');
          for (const secret of secretsToHunt) {
            if (content.includes(secret.val)) {
               findings.push({ 
                 type: 'credential_leak', 
                 severity: 'critical', 
                 service: 'frontend_bundle', 
                 description: `Potential server-side credential (${secret.name}) exposed in client bundle: ${file}` 
               });
            }
          }
        }
      }

      // Save findings to DB
      for (const finding of findings) {
        const fingerprint = crypto.createHash('sha1').update(`${finding.type}-${finding.description}`).digest('hex');
        await pool.query(`
          INSERT INTO security_findings (id, type, severity, service, description, fingerprint) 
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (fingerprint) DO UPDATE SET detected_at = CURRENT_TIMESTAMP, status = 'open'
        `, [`SEC-${Date.now()}-${Math.floor(Math.random()*1000)}`, finding.type, finding.severity, finding.service, finding.description, fingerprint]);
      }

      // Audit Log
      await pool.query(
        `INSERT INTO admin_action_log (id, admin_id, action, target_type, target_id, details) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        ['LOG-' + Date.now(), authUser.id, 'security_scan', 'system', 'monitoring', JSON.stringify({ findings: findings.length })]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Scan complete', findingCount: findings.length }));
    } catch (err) {
      console.error('[Monitoring] Security Scan Error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Internal server error' }));
    }
    return;
  }

  // ── PHASE 10: SCORING CONFIGURATION ──
  if (req.url.startsWith('/api/tournaments/') && req.url.match(/\/api\/tournaments\/([^/]+)\/scoring$/) && req.method === 'GET') {
    const parts = req.url.split('/');
    const tournId = parts[3];
    try {
      const resDb = await pool.query('SELECT * FROM tournament_scoring_rules WHERE tournament_id = $1', [tournId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, scoringRules: resDb.rows[0] || null }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (req.url.startsWith('/api/tournaments/') && req.url.match(/\/api\/tournaments\/([^/]+)\/scoring$/) && req.method === 'PUT') {
    const parts = req.url.split('/');
    const tournId = parts[3];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
          return;
        }
        if (!hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
          return;
        }

        let data;
        try {
          data = JSON.parse(body || '{}');
        } catch (parseErr) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Request body must be valid JSON.' }));
          return;
        }

        // The full rule set is required so a partial PUT can never silently wipe the
        // DB-authoritative scoring configuration (multiplication, map and bonus).
        const { validateScoringRulesPayload } = await import('./server/matchResultService.js');
        const payload = {
          kill_points_multiplier: data.kill_points_multiplier,
          placement_points_map: data.placement_points_map,
          wwcd_bonus: data.wwcd_bonus,
        };
        const ruleErrors = validateScoringRulesPayload(payload);
        if (ruleErrors.length > 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: ruleErrors[0].code, message: ruleErrors[0].message }));
          return;
        }

        const scoringClient = await pool.connect();
        try {
          await scoringClient.query('BEGIN');
          const lockRes = await scoringClient.query('SELECT finalized_at, status FROM tournaments WHERE id = $1 FOR UPDATE', [tournId]);
          if (!lockRes.rows.length) {
            await scoringClient.query('ROLLBACK');
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
            return;
          }
          if (lockRes.rows[0].finalized_at) {
            await scoringClient.query('ROLLBACK');
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Scoring rules are locked after finalization.' }));
            return;
          }
          await scoringClient.query(
          `INSERT INTO tournament_scoring_rules (tournament_id, kill_points_multiplier, placement_points_map, wwcd_bonus, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (tournament_id) DO UPDATE SET
             kill_points_multiplier = EXCLUDED.kill_points_multiplier,
             placement_points_map = EXCLUDED.placement_points_map,
             wwcd_bonus = EXCLUDED.wwcd_bonus,
             updated_at = NOW()`,
          [tournId, payload.kill_points_multiplier, JSON.stringify(payload.placement_points_map), payload.wwcd_bonus]
          );

        await scoringClient.query(
          `INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, details)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase(),
            authUser.id,
            'scoring_rules_updated',
            'scoring',
            'tournament_scoring_rules',
            tournId,
            JSON.stringify({
              tournament_id: tournId,
              kill_points_multiplier: payload.kill_points_multiplier,
              placement_points_map: payload.placement_points_map,
              wwcd_bonus: payload.wwcd_bonus,
              actor_id: authUser.id,
              updated_at: new Date().toISOString(),
            }),
          ]
          );
          await scoringClient.query('COMMIT');
        } catch (txErr) {
          await scoringClient.query('ROLLBACK').catch(() => {});
          throw txErr;
        } finally {
          scoringClient.release();
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Scoring configuration updated' }));
      } catch (err) {
        console.error('[SCORING] Error updating scoring rules:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'INTERNAL_ERROR', message: 'Could not update scoring configuration.' }));
      }
    });
    return;
  }

  // ── PHASE 10: MATCH RESULTS ──
  if (req.url.startsWith('/api/tournaments/') && req.url.match(/\/api\/tournaments\/([^/]+)\/matches\/([^/]+)\/results$/) && req.method === 'GET') {
    const parts = req.url.split('/');
    const tournId = parts[3];
    const matchId = parts[5];
    try {
      const matchDb = await pool.query('SELECT id, "tournament_id" FROM tournament_matches WHERE id = $1', [matchId]);
      if (matchDb.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Match not found.' }));
        return;
      }
      if (matchDb.rows[0].tournament_id !== tournId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'MATCH_TOURNAMENT_MISMATCH', message: 'The match does not belong to this tournament.' }));
        return;
      }
      const resultsDb = await pool.query(
        `SELECT r.id, r.team_id, r.placement, r.kills, r.kill_points,
                r.placement_points, r.wwcd, r.total_points, r.status,
                r.created_at, r.updated_at,
                t.team_name, u.name as leader_name
         FROM tournament_match_results r
         JOIN tournament_teams t ON r.team_id = t.id
         JOIN users u ON t.leader_user_id = u.id
         WHERE r.match_id = $1`,
        [matchId]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, results: resultsDb.rows.map(mapPublicMatchResult) }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'INTERNAL_ERROR', message: 'Could not load match results.' }));
    }
    return;
  }

  if (req.url.startsWith('/api/tournaments/') && req.url.match(/\/api\/tournaments\/([^/]+)\/matches\/([^/]+)\/results$/) && req.method === 'POST') {
    const parts = req.url.split('/');
    const tournId = parts[3];
    const matchId = parts[5];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      let client = null;
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
          return;
        }

        // Tournament ownership gate (owner or admin). The client is never trusted for
        // the organizer identity — it always comes from the verified JWT.
        const tournRes = await pool.query('SELECT "orgId", roadmap_status, finalized_at, status FROM tournaments WHERE id = $1', [tournId]);
        if (tournRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const tourn = tournRes.rows[0];
        const access = checkTournamentOrganizerAccess(authUser, tourn);
        if (!access.authorized) {
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
          return;
        }
        if (tourn.finalized_at) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament results are locked.' }));
          return;
        }

        let data;
        try {
          data = JSON.parse(body || '{}');
        } catch (parseErr) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Request body must be valid JSON.' }));
          return;
        }
        const { results } = data;
        if (!Array.isArray(results) || results.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Expected a non-empty array of results.' }));
          return;
        }

        const { applyMatchResults, MatchResultError } = await import('./server/matchResultService.js');
        const { qualifyMatch, ProgressionError } = await import('./server/roundProgressionService.js');

        // Connection-pinned transaction: every gate + write runs on ONE client so the
        // ROLLBACK is reliable; row locks enforce deterministic ordering (no deadlocks).
        client = await pool.connect();
        try {
          await client.query('BEGIN');
          const outcome = await applyMatchResults(client, { tournId, matchId, results, actorId: authUser.id });
          const progOutcome = await qualifyMatch(client, { tournamentId: tournId, matchId, actorId: authUser.id });
          await client.query('COMMIT');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Results verified and progression processed.', written: outcome.written, progression: progOutcome }));
        } catch (txErr) {
          try { await client.query('ROLLBACK'); } catch (rbErr) { /* already broken */ }
          if (txErr instanceof MatchResultError || txErr instanceof ProgressionError) {
            res.writeHead(txErr.status || 400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: txErr.code, message: txErr.message }));
            return;
          }
          throw txErr;
        } finally {
          client.release();
          client = null;
        }
      } catch (err) {
        console.error('[MATCH RESULTS] Error recording results:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'INTERNAL_ERROR', message: 'Could not record match results.' }));
      }
    });
    return;
  }


  // 7k_b. Supabase Get All Registrations for a User (auth + ownership required)
  if (req.url.startsWith('/api/users/') && req.url.endsWith('/registrations') && req.method === 'GET') {
    const parts = req.url.split('/');
    const userId = parts[3];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
        return;
      }
      if (authUser.id !== userId && !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You can only view your own registrations.' }));
        return;
      }
      const dbRes = await pool.query('SELECT * FROM tournament_registrations WHERE user_id = $1 ORDER BY created_at DESC', [userId]);

      const tournIds = Array.from(new Set(dbRes.rows.map((r) => r.tournament_id).filter(Boolean)));
      let tournamentsMap = new Map();
      let teamByRegId = new Map();
      let teamByLeaderId = new Map();

      if (tournIds.length > 0) {
        const tRes = await pool.query('SELECT id, match_type FROM tournaments WHERE id = ANY($1)', [tournIds]);
        for (const t of tRes.rows) {
          tournamentsMap.set(t.id, t);
        }

        const teamsRes = await pool.query(`
          SELECT t.id, t.tournament_id, t.team_name, t.leader_user_id, t.status, t.registration_id,
                 t.squad_waived_by, t.squad_waived_at, t.squad_waived_reason,
                 json_agg(
                   json_build_object(
                     'id', tm.id,
                     'user_id', tm.user_id,
                     'role', tm.role,
                     'roster_slot', tm.roster_slot,
                     'status', tm.status
                   )
                 ) FILTER (WHERE tm.id IS NOT NULL) AS members
          FROM tournament_teams t
          LEFT JOIN tournament_team_members tm ON tm.tournament_team_id = t.id AND tm.status = 'active'
          WHERE t.tournament_id = ANY($1)
          GROUP BY t.id
        `, [tournIds]);

        for (const t of teamsRes.rows) {
          if (t.registration_id) teamByRegId.set(t.registration_id, t);
          teamByLeaderId.set(`${t.tournament_id}:${t.leader_user_id}`, t);
        }
      }

      const enriched = dbRes.rows.map((reg) => {
        const tournament = tournamentsMap.get(reg.tournament_id) || null;
        const team = teamByRegId.get(reg.id) || teamByLeaderId.get(`${reg.tournament_id}:${reg.user_id}`) || null;
        const members = team?.members || [];
        const isWaived = Boolean(team?.squad_waived_by);
        const capacity = computeSquadCapacity(reg, tournament);
        const stageInfo = computeRegistrationStage({
          registrationStatus: reg.status,
          capacity,
          joinedCount: members.length,
          isWaived,
          teamStatus: team?.status,
        });
        const parsedSlots = parseRosterSlots(reg, tournament);
        const claimedSlots = new Set(members.map((m) => m.roster_slot).filter((s) => s !== null && s !== undefined));
        const unlinkedSlots = parsedSlots.filter((s) => !claimedSlots.has(s.slot));

        return {
          ...reg,
          stage: stageInfo.stage,
          stage_label: stageInfo.label,
          stage_message: stageInfo.message,
          is_squad_complete: stageInfo.isComplete,
          squad_joined: team ? members.length : 1,
          squad_required: capacity,
          squad_capacity: capacity,
          squad_waived: isWaived,
          squad_waived_at: team?.squad_waived_at || null,
          squad_waived_reason: team?.squad_waived_reason || null,
          unlinked_slots: team ? unlinkedSlots : parsedSlots.slice(1),
          team_id: team?.id || null,
          team_status: team?.status || null,
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, registrations: enriched }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7l. Supabase Update Registration Status Service (Organizer approve/reject)
  if (req.url.startsWith('/api/tournaments/') && req.url.includes('/registrations/') && req.method === 'PUT') {
    const parts = req.url.split('/');
    const id = parts[3];
    const regId = parts[5];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to approve rosters.' }));
          return;
        }

        const tRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const t = tRes.rows[0];

        const access = checkTournamentOrganizerAccess(authUser, t);
        if (!access.authorized) {
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
          return;
        }

        const data = JSON.parse(body);
        const newStatus = data.status;

        let result;
        if (newStatus === 'confirmed' || newStatus === 'approved' || newStatus === 'VERIFIED_BY_HOST') {
          result = await reviewApprove(pool, authUser, { registrationId: regId, tournamentId: id, note: data.note || '' });
        } else if (newStatus === 'rejected' || newStatus === 'PAYMENT_REJECTED') {
          result = await reviewReject(pool, authUser, { registrationId: regId, tournamentId: id, reason: data.reason_code || 'other', note: data.rejection_reason || data.note || '' });
        } else if (newStatus === 'cancelled') {
          result = await reviewReleaseSlot(pool, authUser, { registrationId: regId, tournamentId: id, note: data.note || '' });
        } else if (newStatus === 'pending') {
          result = await reviewReopen(pool, authUser, { registrationId: regId, tournamentId: id, reason: data.reason || 'Moved back to pending review' });
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'INVALID_STATUS', message: `Invalid status: ${newStatus}` }));
        }

        if (!result.success) {
          res.writeHead(result.statusCode || 400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: result.error || 'ERROR', message: result.message }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: result.message, registration: result.registration }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7m. Supabase Get Notices Service
  if (req.url.startsWith('/api/tournaments/') && req.url.endsWith('/notices') && req.method === 'GET') {
    const parts = req.url.split('/');
    const id = parts[3];
    try {
      const dbRes = await pool.query('SELECT * FROM tournament_notices WHERE tournament_id = $1 ORDER BY pin DESC, created_at DESC', [id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, notices: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7n. Supabase Create Notice Service
  if (req.url.startsWith('/api/tournaments/') && req.url.endsWith('/notices') && req.method === 'POST') {
    const parts = req.url.split('/');
    const id = parts[3];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;

        const tRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [id]);
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const t = tRes.rows[0];

        // Authorization check: User must be admin or the original organizer
        if (!hasRole(authUser, ROLES.ADMIN) && t.orgId !== authUser.id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to post notices.' }));
          return;
        }

        const data = JSON.parse(body);
        if (!data.title || !data.text) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Title and text are required.' }));
          return;
        }

        const noticeId = 'NTC-' + Date.now().toString().slice(-6);
        const pin = data.pin || false;

        const dbRes = await pool.query(
          `INSERT INTO tournament_notices (id, tournament_id, title, text, pin)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [noticeId, id, data.title, data.text, pin]
        );

        console.log(`\n📦 [MATCH DISTRICT DB] Notice "${data.title}" saved in Supabase.\n`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, notice: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 7n_b. Supabase Delete Notice Service
  if (req.url.startsWith('/api/notices/') && req.method === 'DELETE') {
    const id = req.url.split('/api/notices/')[1];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to delete notices.' }));
        return;
      }

      const noticeRes = await pool.query('SELECT tournament_id FROM tournament_notices WHERE id = $1', [id]);
      if (noticeRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Notice not found.' }));
        return;
      }
      const tournamentId = noticeRes.rows[0].tournament_id;
      const tRes = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tournamentId]);
      if (tRes.rows.length > 0) {
        const t = tRes.rows[0];
        if (!hasRole(authUser, ROLES.ADMIN) && t.orgId !== authUser.id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not have permission to delete this notice.' }));
          return;
        }
      }

      await pool.query('DELETE FROM tournament_notices WHERE id = $1', [id]);
      console.log(`\n📦 [MATCH DISTRICT DB] Notice "${id}" deleted from Supabase.\n`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7o. Supabase Get Chat Messages Service
  if (req.url.startsWith('/api/tournaments/') && req.url.endsWith('/chat') && req.method === 'GET') {
    const parts = req.url.split('/');
    const id = parts[3];
    try {
      const dbRes = await pool.query('SELECT * FROM tournament_messages WHERE tournament_id = $1 ORDER BY created_at ASC', [id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, messages: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 7p. Supabase Create Chat Message Service
  if (req.url.startsWith('/api/tournaments/') && req.url.endsWith('/chat') && req.method === 'POST') {
    const parts = req.url.split('/');
    const id = parts[3];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in to send chat messages.' }));
          return;
        }

        const data = JSON.parse(body);
        if (!data.text) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Message text is required.' }));
          return;
        }

        const msgId = 'MSG-' + Date.now().toString().slice(-6);
        const senderName = data.sender_name || authUser.name || 'Anonymous';
        const senderRole = data.sender_role || authUser.role || 'gamer';
        const isSystem = data.is_system || false;

        const dbRes = await pool.query(
          `INSERT INTO tournament_messages (id, tournament_id, sender_name, sender_role, text, is_system)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [msgId, id, senderName, senderRole, data.text, isSystem]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }



  // --- SITE SETTINGS: GET GLOBAL THEME (public) ---
  if (req.url === '/api/settings/theme' && req.method === 'GET') {
    try {
      const result = await pool.query(`SELECT value FROM site_settings WHERE key = 'theme'`);
      const themeValue = result.rows.length > 0 ? result.rows[0].value : 'dark';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, theme: themeValue }));
    } catch (err) {
      console.error('❌ [SETTINGS] Failed to fetch theme setting:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, theme: 'dark', error: err.message }));
    }
    return;
  }

  // --- SITE SETTINGS: SET GLOBAL THEME (admin only) ---
  if (req.url === '/api/settings/theme' && req.method === 'PUT') {
    const authUser = getAuthUser(req);
    if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Forbidden: Admin access required.' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { theme } = JSON.parse(body);
        if (!['dark', 'light'].includes(theme)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid theme value. Must be "dark" or "light".' }));
          return;
        }
        await pool.query(
          `INSERT INTO site_settings (key, value, updated_at)
           VALUES ('theme', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
          [theme]
        );
        console.log(`🎨 [SETTINGS] Global theme updated to: ${theme} by admin ${authUser.email || authUser.id}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, theme, message: `Global site theme set to "${theme}" successfully.` }));
      } catch (err) {
        console.error('❌ [SETTINGS] Failed to update theme:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- SITE SETTINGS: GET PLATFORM FEE PERCENTAGE (public) ---
  if (req.url === '/api/settings/platform-fee' && req.method === 'GET') {
    try {
      const result = await pool.query(`SELECT value FROM site_settings WHERE key = 'platform_fee_percentage'`);
      const fee = result.rows.length > 0 ? parseFloat(result.rows[0].value) : 10;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, percentage: fee }));
    } catch (err) {
      console.error('❌ [SETTINGS] Failed to fetch platform fee:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, percentage: 10, error: err.message }));
    }
    return;
  }

  // --- SITE SETTINGS: SET PLATFORM FEE PERCENTAGE (admin only) ---
  if (req.url === '/api/settings/platform-fee' && req.method === 'PUT') {
    const authUser = getAuthUser(req);
    if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Forbidden: Admin access required.' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { percentage } = JSON.parse(body);
        const fee = parseFloat(percentage);
        if (isNaN(fee) || fee < 0 || fee > 100) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid fee percentage. Must be a number between 0 and 100.' }));
          return;
        }
        await pool.query(
          `INSERT INTO site_settings (key, value, updated_at)
           VALUES ('platform_fee_percentage', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
          [fee.toString()]
        );
        console.log(`💰 [SETTINGS] Platform fee updated to ${fee}% by admin ${authUser.email || authUser.id}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, percentage: fee, message: `Platform fee set to ${fee}% successfully.` }));
      } catch (err) {
        console.error('❌ [SETTINGS] Failed to update platform fee:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- SITE SETTINGS: GET ORGANIZER FEE PERCENTAGE (public) ---
  if (req.url === '/api/settings/organizer-fee' && req.method === 'GET') {
    try {
      const result = await pool.query(`SELECT value FROM site_settings WHERE key = 'organizer_fee_percentage'`);
      const fee = result.rows.length > 0 ? parseFloat(result.rows[0].value) : 5;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, percentage: fee }));
    } catch (err) {
      console.error('❌ [SETTINGS] Failed to fetch organizer fee:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, percentage: 5, error: err.message }));
    }
    return;
  }

  // --- SITE SETTINGS: SET ORGANIZER FEE PERCENTAGE (admin only) ---
  if (req.url === '/api/settings/organizer-fee' && req.method === 'PUT') {
    const authUser = getAuthUser(req);
    if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Forbidden: Admin access required.' }));
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { percentage } = JSON.parse(body);
        const fee = parseFloat(percentage);
        if (isNaN(fee) || fee < 0 || fee > 100) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Invalid fee percentage. Must be a number between 0 and 100.' }));
          return;
        }
        await pool.query(
          `INSERT INTO site_settings (key, value, updated_at)
           VALUES ('organizer_fee_percentage', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
          [fee.toString()]
        );
        console.log(`💰 [SETTINGS] Organizer fee updated to ${fee}% by admin ${authUser.email || authUser.id}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, percentage: fee, message: `Organizer fee set to ${fee}% successfully.` }));
      } catch (err) {
        console.error('❌ [SETTINGS] Failed to update organizer fee:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- GET PUBLIC UNIFIED REGISTERED TEAMS ---
  if ((urlPath.startsWith('/api/tournaments/') && (urlPath.endsWith('/registered-teams') || urlPath.endsWith('/public-teams'))) && req.method === 'GET') {
    const parts = urlPath.split('/');
    const id = parts[3];
    try {
      const EXCLUDED_STATUSES = ['rejected', 'cancelled', 'expired', 'payment_rejected', 'PAYMENT_REJECTED'];
      const regsRes = await pool.query(
        `SELECT tr.team_name, tr.captain, tr.user_id, tr.captain_uid, tr.status, tr.created_at,
                COALESCE(udc.discord_id, u.discord_id, u.discord_user_id) AS discord_id,
                COALESCE(udc.username, u.discord_username) AS discord_username
         FROM tournament_registrations tr
         LEFT JOIN users u ON (u.id::text = tr.user_id::text OR (tr.captain_uid IS NOT NULL AND u.id::text = tr.captain_uid::text))
         LEFT JOIN user_discord_connections udc ON (udc.user_id::text = tr.user_id::text OR (tr.captain_uid IS NOT NULL AND udc.user_id::text = tr.captain_uid::text))
         WHERE tr.tournament_id = $1
           AND (tr.status IS NULL OR NOT (LOWER(tr.status) = ANY($2)))
         ORDER BY tr.created_at ASC`,
        [id, EXCLUDED_STATUSES]
      );

      const seen = new Set();
      const teams = [];
      for (const r of regsRes.rows) {
        const rawName = (r.team_name || '').trim();
        if (!rawName) continue;
        const lower = rawName.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        const isLinked = Boolean(r.discord_id);
        teams.push({
          teamName: rawName,
          teamLeader: (r.captain || 'Anonymous').trim(),
          leaderUserId: r.user_id || r.captain_uid || null,
          discordLinked: isLinked,
          discordUsername: isLinked && r.discord_username ? r.discord_username : null,
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: teams.length, teams }));
      return;
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: err.message }));
      return;
    }
  }

  // --- GET TOURNAMENT SLOTS DETAIL ---
  if (req.url.startsWith('/api/tournaments/') && req.url.endsWith('/slots') && req.method === 'GET') {
    const parts = req.url.split('/');
    const id = parts[3];
    try {
      const tRes = await pool.query('SELECT "slotsTotal", "slotsFilled", match_type, max_slots_per_room, teams_per_group, teams_per_match FROM tournaments WHERE id = $1', [id]);
      if (tRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found' }));
        return;
      }
      const slotsTotal = parseInt(tRes.rows[0].slotsTotal) || 100;
      const matchType = (tRes.rows[0].match_type || 'squad').toLowerCase();
      const maxSlotsPerRoom = tRes.rows[0].max_slots_per_room
        ? parseInt(tRes.rows[0].max_slots_per_room)
        : null;
      const teamsPerGroup = normalizeTeamsPerGroup(tRes.rows[0].teams_per_group, 16);
      const groupLayout = buildGroups(slotsTotal, teamsPerGroup);

      // Authoritative payment/registration verification statuses
      // (mirrors workers/slotManagerWorker.js and registered-teams).
      const EXCLUDED_STATUSES = ['rejected', 'cancelled', 'expired', 'payment_rejected', 'PAYMENT_REJECTED'];
      const VERIFIED_REG_STATUSES = ['approved', 'confirmed', 'VERIFIED_BY_HOST', 'verified_by_host'];
      const ACTIVE_REG_STATUSES = ['pending', 'pending_payment', 'PENDING_PAYMENT_VERIFICATION', 'approved', 'confirmed', 'VERIFIED_BY_HOST', 'verified_by_host'];

      const regsRes = await pool.query(
        'SELECT id, team_name, captain, status, slot_number FROM tournament_registrations WHERE tournament_id = $1 ORDER BY created_at ASC',
        [id]
      );
      const regs = regsRes.rows;

      // Deduplicate valid registrations by team_name to prevent duplicates from inflating occupancy
      const seenTeams = new Set();
      const validRegs = [];
      for (const r of regs) {
        const s = (r.status || '').toLowerCase();
        if (EXCLUDED_STATUSES.includes(s) || s === 'waitlisted') continue;
        const normName = (r.team_name || '').trim().toLowerCase();
        if (normName) {
          if (seenTeams.has(normName)) continue;
          seenTeams.add(normName);
        }
        validRegs.push(r);
      }

      const canonicalFilled = Math.min(slotsTotal, Math.max(parseInt(tRes.rows[0].slotsFilled) || 0, validRegs.length));
      const slotsFilled = canonicalFilled;
      if (canonicalFilled !== parseInt(tRes.rows[0].slotsFilled)) {
        pool.query('UPDATE tournaments SET "slotsFilled" = $1 WHERE id = $2', [canonicalFilled, id]).catch(() => {});
      }

      const slots = [];
      for (let i = 1; i <= slotsTotal; i++) {
        const booked = regs.find(r => r.slot_number === i);
        const groupSlot = groupForGlobalSlot(i, groupLayout);
        const groupLabel = groupSlot ? groupLabelForSlot(i, groupLayout) : null;
        if (booked) {
          const verified = VERIFIED_REG_STATUSES.includes(booked.status);
          slots.push({
            number: i,
            status: verified ? (booked.status === 'approved' ? 'occupied' : 'confirmed') : 'pending',
            teamName: booked.team_name,
            captain: booked.captain,
            registrationId: booked.id,
            paymentVerified: verified,
            groupName: groupSlot ? groupSlot.name : null,
            groupLabel: groupLabel
          });
        } else {
          slots.push({
            number: i,
            status: 'available',
            teamName: null,
            captain: null,
            registrationId: null,
            paymentVerified: null,
            groupName: groupSlot ? groupSlot.name : null,
            groupLabel: groupLabel
          });
        }
      }

      // Surface active registrations that have not yet been assigned a physical
      // slot number (e.g. still awaiting payment verification). Reserve the next
      // free slot numbers so they remain visible in the room registration table.
      const takenSlots = new Set(slots.filter(s => s.registrationId).map(s => s.number));
      let reserveCursor = 1;
      for (const reg of regs) {
        if (!ACTIVE_REG_STATUSES.includes(reg.status)) continue;
        if (VERIFIED_REG_STATUSES.includes(reg.status)) continue;
        if (reg.slot_number !== null && reg.slot_number !== undefined) continue;
        while (reserveCursor <= slotsTotal && takenSlots.has(reserveCursor)) reserveCursor++;
        if (reserveCursor > slotsTotal) break;
        const reserved = slots[reserveCursor - 1];
        reserved.status = 'pending';
        reserved.teamName = reg.team_name;
        reserved.captain = reg.captain;
        reserved.registrationId = reg.id;
        reserved.paymentVerified = false;
        takenSlots.add(reserveCursor);
      }

      const roomCeilings = { solo: 100, duo: 50, squad: 25 };
      const roomFloors = { solo: 50, duo: 25, squad: 13 };
      const gameCeiling = roomCeilings[matchType] || 25;
      const floorConstraint = roomFloors[matchType] || 13;
      const effectiveMaxPerRoom = maxSlotsPerRoom || gameCeiling;
      const m = Math.max(1, effectiveMaxPerRoom);
      const total = Math.max(0, slotsTotal);

      let rooms = [];
      let balanced = false;

      if (total > 0 && total > m) {
        const initialRooms = Math.floor(total / m);
        const remainder = total % m;
        if (remainder > 0) {
          const newCapacity = Math.ceil(total / initialRooms);
          if (newCapacity <= gameCeiling && newCapacity >= floorConstraint) {
            // Balanced collapse
            const base = Math.floor(total / initialRooms);
            const extra = total % initialRooms;
            let cursor = 1;
            for (let i = 0; i < initialRooms; i++) {
              const size = i < extra ? base + 1 : base;
              const start = cursor;
              const end = cursor + size - 1;
              rooms.push({ roomNumber: i + 1, slotStart: start, slotEnd: end, slotsInRoom: size });
              cursor += size;
            }
            balanced = true;
          }
        }
      }

      if (rooms.length === 0) {
        // Fall back to simple split
        const totalRooms = Math.max(1, Math.ceil(total / m));
        for (let r = 0; r < totalRooms; r++) {
          const start = r * m + 1;
          const end = Math.min((r + 1) * m, total);
          rooms.push({
            roomNumber: r + 1,
            slotStart: start,
            slotEnd: end,
            slotsInRoom: end - start + 1,
          });
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        slotsTotal,
        slotsFilled,
        slotsAvailable: Math.max(0, slotsTotal - slotsFilled),
        slots,
        teamsPerGroup,
        groupMeta: {
          matchType,
          teamsPerGroup,
          groupCount: groupLayout.length,
          groups: groupLayout,
          perGroupFilled: groupLayout.map(g => (
            slots.filter(s => s.groupName === g.name && s.paymentVerified === true).length
          )),
        },
        roomMeta: {
          matchType,
          maxSlotsPerRoom: effectiveMaxPerRoom,
          gameCeiling,
          floorConstraint,
          totalRooms: rooms.length,
          balanced,
          rooms,
        },
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ========================
  // TOURNAMENT CREATION API v2
  // ========================

  // 8a. GET /api/games - List available games
  if (req.url === '/api/games' && req.method === 'GET') {
    try {
      const dbRes = await pool.query(
        'SELECT id, name, icon, active, sort_order FROM games WHERE active = true ORDER BY sort_order ASC'
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, games: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 8b. GET /api/tournaments/draft/:userId - Load latest draft for user
  const draftLoadMatch = req.url.match(/^\/api\/tournaments\/draft\/([^/]+)$/);
  if (draftLoadMatch && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || authUser.id !== draftLoadMatch[1]) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      const dbRes = await pool.query(
        `SELECT * FROM tournaments WHERE "orgId" = $1 AND "isDraft" = true ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 1`,
        [draftLoadMatch[1]]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, draft: dbRes.rows[0] || null }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 8c. DELETE /api/tournaments/:id/draft - Discard a draft
  const draftDeleteMatch = req.url.match(/^\/api\/tournaments\/([^/]+)\/draft$/);
  if (draftDeleteMatch && req.method === 'DELETE') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const tId = draftDeleteMatch[1];
      const existRes = await pool.query('SELECT * FROM tournaments WHERE id = $1 AND "isDraft" = true', [tId]);
      if (existRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Draft not found.' }));
        return;
      }
      if (!hasRole(authUser, ROLES.ADMIN) && existRes.rows[0].orgId !== authUser.id) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      await pool.query('DELETE FROM tournaments WHERE id = $1', [tId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Draft discarded.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 8d. PUT /api/tournaments/:id/auto-save - Save partial draft state
  const autoSaveMatch = req.url.match(/^\/api\/tournaments\/([^/]+)\/auto-save$/);
  if (autoSaveMatch && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        const tId = autoSaveMatch[1];
        const existRes = await pool.query('SELECT * FROM tournaments WHERE id = $1 AND "isDraft" = true', [tId]);
        if (existRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Draft not found.' }));
          return;
        }
        if (!hasRole(authUser, ROLES.ADMIN) && existRes.rows[0].orgId !== authUser.id) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }

        if (existRes.rows[0].finalized_at) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament configuration is locked.' }));
          return;
        }

        const t = JSON.parse(body);

        // Build partial update — only update provided fields
        const updates = [];
        const values = [];
        let idx = 1;

        const fieldMap = {
          title: 'title', game: 'game', status: 'status', badgeBg: '"badgeBg"',
          badgeText: '"badgeText"', date: 'date', prize: 'prize', entry: 'entry',
          teamsCount: '"teamsCount"', orgName: '"orgName"',
          registrationOpenDate: '"registrationOpenDate"', registrationCloseDate: '"registrationCloseDate"',
          startDate: '"startDate"', rules: 'rules', region: 'region', format: 'format',
          slotsTotal: '"slotsTotal"', roomID: '"roomID"', roomPassword: '"roomPassword"',
          timeline: 'timeline', bannerUrl: '"bannerUrl"', logoUrl: '"logoUrl"',
          match_type: 'match_type', perspective: 'perspective',
          reserved_slots: 'reserved_slots', entry_fee_amount: 'entry_fee_amount',
          prize_pool_type: 'prize_pool_type', prize_pool_amount: 'prize_pool_amount',
          prize_split_1st: 'prize_split_1st', prize_split_2nd: 'prize_split_2nd',
          prize_split_3rd: 'prize_split_3rd', prize_split_mvp: 'prize_split_mvp',
          description: 'description', cover_image_url: 'cover_image_url',
          lobby_start_time: 'lobby_start_time',
          sponsors_enabled: 'sponsors_enabled',
          teams_per_group: 'teams_per_group',
          roadmap_image_url: 'roadmap_image_url'
        };

        for (const [key, col] of Object.entries(fieldMap)) {
          if (t[key] !== undefined) {
            updates.push(`${col} = $${idx++}`);
            let val = t[key];
            if (['slotsTotal', 'slotsFilled', 'reserved_slots', 'entry_fee_amount', 'prize_pool_amount', 'version'].includes(key)) {
              val = parseInt(val);
            } else if (['featured', 'isDraft'].includes(key)) {
              val = Boolean(val);
            } else if (['rules', 'timeline'].includes(key) && typeof val !== 'string') {
              val = JSON.stringify(val);
            }
            values.push(val);
          }
        }

        if (updates.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NO_FIELDS', message: 'No fields to update.' }));
          return;
        }

        values.push(tId);
        const query = `UPDATE tournaments SET ${updates.join(', ')}, version = version + 1 WHERE id = $${idx} RETURNING *`;
        const dbRes = await pool.query(query, values);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tournament: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 8e. POST /api/tournaments/:id/roadmap - Save roadmap rounds
  const roadmapPostMatch = req.url.match(/^\/api\/tournaments\/([^/]+)\/roadmap$/);
  if (roadmapPostMatch && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        const tId = roadmapPostMatch[1];
        const existRes = await pool.query('SELECT * FROM tournaments WHERE id = $1', [tId]);
        if (existRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        const access = checkTournamentOrganizerAccess(authUser, existRes.rows[0]);
        if (!access.authorized) {
          res.writeHead(access.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: access.error, message: access.message }));
          return;
        }

        if (existRes.rows[0].finalized_at) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
          return;
        }

        const payload = JSON.parse(body);
        const existingTimeline = existRes.rows[0].timeline ? JSON.parse(existRes.rows[0].timeline) : {};
        const existingArr = Array.isArray(existingTimeline) ? [] : (existingTimeline.roadmap || []);
        let updatedRoadmap;

        if (payload.replace) {
          updatedRoadmap = payload.rounds || [];
        } else if (payload.round) {
          // Add or update a single round
          const idx = existingArr.findIndex(r => r.id === payload.round.id);
          if (idx >= 0) {
            existingArr[idx] = payload.round;
          } else {
            existingArr.push(payload.round);
          }
          updatedRoadmap = existingArr;
        } else {
          updatedRoadmap = existingArr;
        }

        const updatedTimeline = {
          ...(typeof existingTimeline === 'object' && !Array.isArray(existingTimeline) ? existingTimeline : {}),
          roadmap: updatedRoadmap
        };

        const updateClient = await pool.connect();
        try {
          await updateClient.query('BEGIN');
          const lockRes = await updateClient.query('SELECT status, finalized_at FROM tournaments WHERE id = $1 FOR UPDATE', [tId]);
          if (!lockRes.rows.length || lockRes.rows[0].finalized_at) {
            await updateClient.query('ROLLBACK');
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_FINALIZED', message: 'Finalized tournament roadmap is locked.' }));
            return;
          }
          await updateClient.query('UPDATE tournaments SET timeline = $1, version = version + 1 WHERE id = $2', [JSON.stringify(updatedTimeline), tId]);
          await updateClient.query('COMMIT');
        } catch (err) {
          await updateClient.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          updateClient.release();
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, roadmap: updatedRoadmap }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 8f. GET /api/tournaments/:id/roadmap is handled authoritatively above by 7k_road2 (lines ~7265)
  // using relational tables and strict privacy/cache controls. Obsolete legacy duplicate handler removed.

  // 8g. POST /api/sponsor-request - Submit sponsored prize pool request
  if (req.url === '/api/sponsor-request' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }

        const payload = JSON.parse(body);
        const dbRes = await pool.query(
          `INSERT INTO sponsor_requests (id, organizer_id, tournament_id, prize_pool_amount, sponsor_type, description, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
          [
            `SPR-${Date.now().toString().slice(-6)}`,
            authUser.id,
            payload.tournament_id || '',
            parseInt(payload.prize_pool_amount) || 0,
            payload.sponsor_type || 'prize_pool',
            payload.description || ''
          ]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, request: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 8h. GET /api/org/tournament-usage - Real-time tournament usage for current user
  if (req.url === '/api/org/tournament-usage' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Count tournaments created this month (excluding drafts)
      const countRes = await pool.query(
        `SELECT COUNT(*) as count FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false AND created_at >= $2`,
        [authUser.id, firstOfMonth]
      );
      const tournamentCount = parseInt(countRes.rows[0].count) || 0;

      // Total slots across active non-draft tournaments
      const slotsRes = await pool.query(
        `SELECT COALESCE(SUM("slotsTotal"), 0) as total, COALESCE(SUM("slotsFilled"), 0) as filled FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false`,
        [authUser.id]
      );

      let maxTournaments = 30;
      let maxSlots = 100;
      try {
        const planRes = await pool.query('SELECT tier FROM users WHERE id = $1', [authUser.id]);
        const tier = planRes.rows[0]?.tier || 'Free';
        if (tier === 'Pro') { maxTournaments = -1; maxSlots = 1000; }
        else if (tier === 'Basic') { maxTournaments = 60; maxSlots = 300; }
        else { maxTournaments = 30; maxSlots = 100; }
      } catch { /* use defaults */ }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        usage: {
          tournamentsThisMonth: tournamentCount,
          maxTournaments,
          totalSlots: parseInt(slotsRes.rows[0].total) || 0,
          maxSlots,
          tournamentsPercent: maxTournaments <= 0 ? 0 : Math.min(100, Math.round((tournamentCount / maxTournaments) * 100))
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 8i. POST /api/tournament/sponsors - Save sponsors for a tournament
  if (req.url === '/api/tournament/sponsors' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }

        const payload = JSON.parse(body);
        const { tournament_id, sponsors } = payload;

        if (!tournament_id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'MISSING_TOURNAMENT_ID' }));
          return;
        }

        // Verify ownership
        const ownerRes = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tournament_id]);
        if (ownerRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        if (ownerRes.rows[0].orgId !== authUser.id && !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }

        // Store sponsors as JSON
        const sponsorsJson = JSON.stringify(sponsors || []);
        await pool.query(
          'UPDATE tournaments SET sponsors_data = $1 WHERE id = $2',
          [sponsorsJson, tournament_id]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 8j. GET /api/tournament/sponsors/:id - Load sponsors for a tournament
  if (req.url.startsWith('/api/tournament/sponsors/') && req.method === 'GET') {
    const tournamentId = req.url.split('/api/tournament/sponsors/')[1];
    try {
      const resData = await pool.query(
        'SELECT sponsors_data FROM tournaments WHERE id = $1',
        [tournamentId]
      );

      if (resData.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        return;
      }

      let sponsors = [];
      try {
        sponsors = JSON.parse(resData.rows[0].sponsors_data || '[]');
      } catch {}

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, sponsors }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ========================
  // PAYMENT VERIFICATION API
  // ========================

  // POST /api/payment/submit - Submit payment proof for manual verification
  if (req.url === '/api/payment/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }

        const userRes = await pool.query('SELECT id, name, role FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const user = userRes.rows[0];

        const { plan, billingCycle, amount, transactionId, screenshotUrl, notes } = JSON.parse(body);
        if (!plan || !amount || !transactionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Plan, amount, and transaction ID are required.' }));
          return;
        }

        if (screenshotUrl && !isAllowedStorageUrl(screenshotUrl)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_STORAGE_URL', message: 'Payment screenshot URL must use HTTPS and an allowed ImageKit or Supabase storage endpoint.' }));
          return;
        }

        // Check for duplicate submission (same transaction ID for this user)
        const dupRes = await pool.query(
          'SELECT id FROM payment_verifications WHERE transaction_id = $1 AND user_id = $2',
          [transactionId, user.id]
        );
        if (dupRes.rows.length > 0) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'DUPLICATE', message: 'This transaction ID has already been submitted.' }));
          return;
        }

        const paymentId = 'PAY-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO payment_verifications (id, user_id, plan_name, billing_cycle, amount, transaction_id, payment_screenshot_url, payment_notes, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
          [paymentId, user.id, plan, billingCycle, amount, transactionId, screenshotUrl || null, notes || null]
        );

        // Create alert for user
        const alertId = 'ALT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO alerts (id, user_id, title, message, is_read)
           VALUES ($1, $2, $3, $4, false)`,
          [alertId, user.id, 'Payment Submitted', `Your ${plan} plan payment of ₹${amount} has been submitted for verification. We'll notify you once it's reviewed.`]
        );

        console.log(`💰 [PAYMENT] User ${user.id} submitted payment proof for ${plan} plan (₹${amount})`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Payment proof submitted successfully! Awaiting verification.',
          payment: {
            id: paymentId,
            plan,
            billingCycle,
            amount,
            transactionId,
            status: 'pending',
            createdAt: new Date().toISOString()
          }
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/payment/my - Get current user's payment submissions
  if (req.url === '/api/payment/my' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        return;
      }
      const user = userRes.rows[0];

      const dbRes = await pool.query(
        'SELECT * FROM payment_verifications WHERE user_id = $1 ORDER BY created_at DESC',
        [user.id]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, payments: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // GET /api/payment/status/:id - Check status of a specific payment
  const paymentStatusMatch = req.url.match(/^\/api\/payment\/status\/([^/]+)$/);
  if (paymentStatusMatch && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const paymentId = paymentStatusMatch[1];
      const dbRes = await pool.query(
        'SELECT pv.*, u.name as user_name FROM payment_verifications pv JOIN users u ON u.id = pv.user_id WHERE pv.id = $1',
        [paymentId]
      );

      if (dbRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, payment: dbRes.rows[0] }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- ADMIN PAYMENT VERIFICATION ENDPOINTS ---

  // GET /api/admin/payments - List all payment verifications
  if (req.url === '/api/admin/payments' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }

      const statusFilter = req.url.includes('?status=') ? req.url.split('?status=')[1].split('&')[0] : null;
      let query = `
        SELECT pv.*, u.name as user_name, u.email as user_email, u.tier as current_tier
        FROM payment_verifications pv
        JOIN users u ON u.id = pv.user_id
      `;
      const params = [];
      if (statusFilter) {
        query += ' WHERE pv.status = $1';
        params.push(statusFilter);
      }
      query += ' ORDER BY pv.created_at DESC';

      const dbRes = await pool.query(query, params);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, payments: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/admin/payments/approve - Approve a payment and activate subscription
  if (req.url === '/api/admin/payments/approve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Access denied: Subscription payment approval requires Admin privileges.' }));
          return;
        }

        const { paymentId } = JSON.parse(body);
        if (!paymentId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT' }));
          return;
        }

        // Get payment record
        const payRes = await pool.query('SELECT * FROM payment_verifications WHERE id = $1', [paymentId]);
        if (payRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const payment = payRes.rows[0];
        if (payment.status !== 'pending') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ALREADY_PROCESSED', message: 'This payment has already been reviewed.' }));
          return;
        }

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Update payment status
          await client.query(
            `UPDATE payment_verifications SET status = 'approved', admin_id = $1, reviewed_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [authUser.id, paymentId]
          );

          // Activate the subscription
          const plan = payment.plan_name;
          const cycle = payment.billing_cycle || 'monthly';

          // Get plan details
          const planRes = await client.query('SELECT * FROM organizer_plans WHERE name = $1', [plan]);
          if (planRes.rows.length === 0) {
            await client.query('ROLLBACK');
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'PLAN_NOT_FOUND' }));
            client.release();
            return;
          }
          const planDetails = planRes.rows[0];

          // ── Subscription Validation ───────────────────────────────────
          // Check for existing active subscription to prevent stacking
          const existingSubRes5 = await client.query('SELECT * FROM subscriptions WHERE organizer_id = $1', [payment.user_id]);
          const existingSub5 = existingSubRes5.rows[0];
          const userRes5 = await client.query('SELECT id, tier FROM users WHERE id = $1', [payment.user_id]);
          const targetUser5 = userRes5.rows[0];

          if (existingSub5 && existingSub5.billing_status === 'active') {
            if (targetUser5.tier === plan) {
              await client.query('ROLLBACK');
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'ALREADY_ACTIVE',
                message: `User already has an active ${plan} subscription. Cannot approve a duplicate.`
              }));
              client.release();
              return;
            }
            // Only allow upgrades (higher tier), block downgrades via payment approval
            const planOrder5 = ['Free', 'Basic', 'Pro'];
            const currentIdx5 = planOrder5.indexOf(targetUser5.tier);
            const newIdx5 = planOrder5.indexOf(plan);
            if (newIdx5 <= currentIdx5) {
              await client.query('ROLLBACK');
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: false,
                error: 'INVALID_UPGRADE',
                message: `Cannot activate ${plan} plan when user already has an active ${targetUser5.tier} subscription.`
              }));
              client.release();
              return;
            }
          }
          // ── End Validation ─────────────────────────────────────────

          // Update user tier
          await client.query('UPDATE users SET tier = $1 WHERE id = $2', [plan, payment.user_id]);

          // Calculate renewal date
          const renewalDate = new Date();
          if (cycle === 'monthly') {
            renewalDate.setMonth(renewalDate.getMonth() + 1);
          } else {
            renewalDate.setFullYear(renewalDate.getFullYear() + 1);
          }

          // Upsert subscription
          const subRes = await client.query('SELECT id FROM subscriptions WHERE organizer_id = $1', [payment.user_id]);
          if (subRes.rows.length > 0) {
            await client.query(
              `UPDATE subscriptions SET plan_id = $1, billing_status = 'active', billing_cycle = $2, plan_start_date = CURRENT_TIMESTAMP, renewal_date = $3, cancelled_at = NULL WHERE organizer_id = $4`,
              [planDetails.id, cycle, renewalDate, payment.user_id]
            );
          } else {
            const subId = 'SUB-' + crypto.randomBytes(6).toString('hex').toUpperCase();
            await client.query(
              `INSERT INTO subscriptions (id, organizer_id, plan_id, billing_status, billing_cycle, plan_start_date, renewal_date)
               VALUES ($1, $2, $3, 'active', $4, CURRENT_TIMESTAMP, $5)`,
              [subId, payment.user_id, planDetails.id, cycle, renewalDate]
            );
          }

          // Record billing history
          const billId = 'BILL-' + crypto.randomBytes(6).toString('hex').toUpperCase();
          await client.query(
            `INSERT INTO billing_history (id, organizer_id, plan_name, billing_cycle, amount, status)
             VALUES ($1, $2, $3, $4, $5, 'completed')`,
            [billId, payment.user_id, plan, cycle, payment.amount]
          );

          // Create alert for user - payment approved
          const alertId = 'ALT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
          await client.query(
            `INSERT INTO alerts (id, user_id, title, message, is_read)
             VALUES ($1, $2, $3, $4, false)`,
            [alertId, payment.user_id, 'Payment Approved! 🎉', `Your ${plan} plan payment of ₹${payment.amount} has been approved! Your subscription is now active. Welcome to ${plan}!`]
          );

          await client.query('COMMIT');

          console.log(`💰 [PAYMENT] Admin ${authUser.id} approved payment ${paymentId} for ${plan} plan`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: `Payment approved and ${plan} plan activated!`,
            payment: { id: paymentId, status: 'approved' }
          }));
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/admin/payments/reject - Reject a payment
  if (req.url === '/api/admin/payments/reject' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Access denied: Subscription payment rejection requires Admin privileges.' }));
          return;
        }

        const { paymentId, reason } = JSON.parse(body);
        if (!paymentId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT' }));
          return;
        }

        const payRes = await pool.query('SELECT * FROM payment_verifications WHERE id = $1', [paymentId]);
        if (payRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const payment = payRes.rows[0];
        if (payment.status !== 'pending') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ALREADY_PROCESSED', message: 'This payment has already been reviewed.' }));
          return;
        }

        const rejectionReason = reason || 'Payment verification failed. Please resubmit with correct details.';

        await pool.query(
          `UPDATE payment_verifications SET status = 'rejected', admin_id = $1, rejection_reason = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [authUser.id, rejectionReason, paymentId]
        );

        // Create alert for user
        const alertId = 'ALT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO alerts (id, user_id, title, message, is_read)
           VALUES ($1, $2, $3, $4, false)`,
          [alertId, payment.user_id, 'Payment Rejected', `Your ${payment.plan_name} plan payment was not approved. Reason: ${rejectionReason}. Please submit a new payment with corrected details.`]
        );

        console.log(`💰 [PAYMENT] Admin ${authUser.id} rejected payment ${paymentId}. Reason: ${rejectionReason}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Payment rejected.',
          payment: { id: paymentId, status: 'rejected', rejectionReason }
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/admin/payments/stats - Payment verification statistics
  if (req.url === '/api/admin/payments/stats' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Access denied: Subscription stats require Admin privileges.' }));
        return;
      }

      const totalRes = await pool.query('SELECT COUNT(*) FROM payment_verifications');
      const pendingRes = await pool.query("SELECT COUNT(*) FROM payment_verifications WHERE status = 'pending'");
      const approvedRes = await pool.query("SELECT COUNT(*) FROM payment_verifications WHERE status = 'approved'");
      const rejectedRes = await pool.query("SELECT COUNT(*) FROM payment_verifications WHERE status = 'rejected'");
      const revenueRes = await pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM payment_verifications WHERE status = 'approved'");

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        stats: {
          total: parseInt(totalRes.rows[0].count),
          pending: parseInt(pendingRes.rows[0].count),
          approved: parseInt(approvedRes.rows[0].count),
          rejected: parseInt(rejectedRes.rows[0].count),
          totalRevenue: parseFloat(revenueRes.rows[0].total)
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ─────────────────────────────────────────────────────────────
  // POST /api/admin/update-role — Admin-only: promote/demote user role
  // ─────────────────────────────────────────────────────────────
  if (req.url === '/api/admin/update-role' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasCapability(authUser, 'MANAGE_ROLES')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Unauthorized: Only administrators can access Role Management.' }));
          return;
        }

        const { targetUserId, newRole } = JSON.parse(body);
        if (!targetUserId || !newRole) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'targetUserId and newRole are required.' }));
          return;
        }

        // Validate newRole is a known role
        const validRoles = Object.values(ROLES);
        if (!validRoles.includes(newRole)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_ROLE', message: `Invalid role "${newRole}". Must be one of: ${validRoles.join(', ')}` }));
          return;
        }

        // Safety restraint: admins cannot demote themselves
        if (targetUserId === authUser.id && newRole !== ROLES.ADMIN) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SELF_DEMOTE', message: 'Safety Restraint: You cannot remove your own administrator status.' }));
          return;
        }

        // Check target user exists
        const userRes = await pool.query('SELECT id, name, email, role, roles FROM users WHERE id = $1', [targetUserId]);
        if (userRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'USER_NOT_FOUND' }));
          return;
        }

        const targetUser = userRes.rows[0];

        // ─── CRITICAL: Root admin account absolute safety guard ───
        const envRoot = (process.env.ADMIN_EMAIL || '').toLowerCase();
        const hardRoot = ROOT_ADMIN_EMAIL.toLowerCase();
        const isTargetRootAdmin = targetUser.email && (
          (envRoot && targetUser.email.toLowerCase() === envRoot) ||
          targetUser.email.toLowerCase() === hardRoot
        );
        if (isTargetRootAdmin) {
          if (newRole !== ROLES.ADMIN) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: false,
              error: 'SECURITY_CONSTRAINT',
              message: 'Security Constraint Violation: The root administrator account cannot be demoted or have its admin role removed.'
            }));
            return;
          }
          // Ensure the roles array always contains 'admin'
          if (!Array.isArray(targetUser.roles) || !targetUser.roles.includes(ROLES.ADMIN)) {
            await pool.query('UPDATE users SET roles = $1 WHERE id = $2', [['user', 'admin'], targetUserId]);
          }
        }
        // ─── End root admin guard ───

        // Build the new roles array:
        // - USER: reset to ["user"] and clear orgApplicationStatus
        // - Any privileged role: keep "user" base + add the new role (deduplicated)
        let newRoles;
        let orgStatusClear = '';
        if (newRole === ROLES.USER) {
          newRoles = ['user'];
          orgStatusClear = ', "orgApplicationStatus" = COALESCE("orgApplicationStatus", \'none\')';
        } else if (newRole === ROLES.ADMIN) {
          newRoles = ['user', 'admin'];
        } else if (newRole === ROLES.REG_PAYMENT_VERIFIER) {
          newRoles = ['user', 'reg_payment_verifier'];
        } else if (newRole === ROLES.ORGANISER) {
          newRoles = ['user', 'organiser'];
          orgStatusClear = ', "orgApplicationStatus" = \'approved\'';
        } else {
          newRoles = ['user'];
        }

        const updateRes = await pool.query(
          `UPDATE users SET role = $1, roles = $2${orgStatusClear} WHERE id = $3 RETURNING id, name, email, role, roles, "orgApplicationStatus"`,
          [newRole, newRoles, targetUserId]
        );

        // Auto-create a Free subscription for newly assigned organisers
        if (newRole === ROLES.ORGANISER) {
          try {
            await pool.query(
              `INSERT INTO subscriptions (id, organizer_id, plan_id, billing_status)
               VALUES ($1, $2, 'plan_free', 'active')
               ON CONFLICT (organizer_id) DO NOTHING`,
              ['SUB-' + Date.now(), targetUserId]
            );
          } catch (subErr) {
            console.warn('⚠️ [IAM] Could not auto-create subscription for organizer:', subErr.message);
          }
        }

        // Audit log
        const logId = 'ADM-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [logId, authUser.id, 'role_change', 'user', targetUserId, `${targetUser.role || JSON.stringify(targetUser.roles)} → ${newRole} (roles: ${JSON.stringify(newRoles)})`]
        );

        console.log(`🔐 [IAM] Admin ${authUser.id} changed ${targetUserId} role: ${targetUser.role} → ${newRole}, roles: ${JSON.stringify(newRoles)}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `User role successfully updated to ${newRole}`,
          user: updateRes.rows[0]
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- GET USER WALLET TRANSACTIONS ---
  if (req.url.startsWith('/api/users/') && req.url.endsWith('/wallet-transactions') && req.method === 'GET') {
    const parts = req.url.split('/');
    const userId = parts[3];
    try {
      const dbRes = await pool.query('SELECT * FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, transactions: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- POST USER WALLET TRANSACTION ---
  if (req.url.startsWith('/api/users/') && req.url.endsWith('/wallet-transactions') && req.method === 'POST') {
    const parts = req.url.split('/');
    const userId = parts[3];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      const client = await pool.connect();
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          client.release();
          return;
        }

        if (!hasRole(authUser, ROLES.ADMIN) && authUser.id !== userId) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          client.release();
          return;
        }

        const { description, type, amount, status } = JSON.parse(body);
        if (!description || !type || !amount) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT' }));
          client.release();
          return;
        }

        await client.query('BEGIN');

        const txId = 'TXN-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await client.query(
          `INSERT INTO wallet_transactions (id, user_id, description, type, amount, status) 
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [txId, userId, description, type, amount, status || 'Completed']
        );

        // Update user balance if credit or debit
        const balanceChange = type === 'credit' ? Number(amount) : -Number(amount);
        await client.query(
          'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2',
          [balanceChange, userId]
        );

        await client.query('COMMIT');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, transaction: { id: txId, user_id: userId, description, type, amount, status: status || 'Completed' } }));
      } catch (err) {
        await client.query('ROLLBACK');
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      } finally {
        client.release();
      }
    });
    return;
  }

  // ========================
  // SUBSCRIPTION API ENDPOINTS
  // ========================

  // GET /api/subscription/my - Get current subscription details with usage
  if (req.url === '/api/subscription/my' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const userRes = await pool.query('SELECT * FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        return;
      }
      const user = userRes.rows[0];

      // Get subscription
      const subRes = await pool.query('SELECT * FROM subscriptions WHERE organizer_id = $1', [user.id]);
      const subscription = subRes.rows[0] || null;

      // Get plan details
      const planRes = await pool.query('SELECT * FROM organizer_plans WHERE name = $1', [user.tier || 'Free']);
      const plan = planRes.rows[0] || null;

      // Get usage
      const usage = await getOrganizerUsage(pool, user.id);

      // Get billing history
      const billingRes = await pool.query(
        'SELECT * FROM billing_history WHERE organizer_id = $1 ORDER BY created_at DESC LIMIT 12',
        [user.id]
      );

      // Get plan features
      const features = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        subscription: {
          id: subscription?.id || null,
          plan: user.tier || 'Free',
          planId: plan?.id || 'plan_free',
          billingCycle: subscription?.billing_cycle || 'monthly',
          status: subscription?.billing_status || 'active',
          startDate: subscription?.plan_start_date || user.created_at,
          renewalDate: subscription?.renewal_date || subscription?.plan_expiration || null,
          isTrial: subscription?.is_trial || false,
          cancelledAt: subscription?.cancelled_at || null,
          features
        },
        planDetails: plan,
        usage,
        billingHistory: billingRes.rows
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/subscription/upgrade - Request plan upgrade (immediate for non-paid)
  if (req.url === '/api/subscription/upgrade' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }

        const { plan, billingCycle } = JSON.parse(body);
        if (!plan || !['Free', 'Basic', 'Pro'].includes(plan)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_PLAN', message: 'Invalid plan selected.' }));
          return;
        }

        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const user = userRes.rows[0];

        // ── Subscription Validation ─────────────────────────────────────
        // Check existing subscription to prevent stacking & same-plan re-purchase
        const existingSubRes4 = await pool.query('SELECT * FROM subscriptions WHERE organizer_id = $1', [user.id]);
        const existingSub4 = existingSubRes4.rows[0];
        const planOrder4 = ['Free', 'Basic', 'Pro'];
        const currentIdx4 = planOrder4.indexOf(user.tier);
        const newIdx4 = planOrder4.indexOf(plan);

        // Block same-plan re-purchase if user already on this tier with active subscription
        if (user.tier === plan && existingSub4 && existingSub4.billing_status === 'active') {
          const renewalDate4 = existingSub4.renewal_date;
          const dateStr4 = renewalDate4 ? new Date(renewalDate4).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'ALREADY_ACTIVE',
            message: `You already have an active ${plan} subscription until ${dateStr4}.`
          }));
          return;
        }

        // Block downgrades via this endpoint (must use /api/subscription/downgrade)
        if (newIdx4 < currentIdx4) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'UPGRADE_REQUIRED',
            message: 'Please use the downgrade endpoint to switch to a lower plan.'
          }));
          return;
        }

        // Calculate prorated credit if upgrading from an active paid plan
        let proratedCredit4 = 0;
        if (currentIdx4 > 0 && existingSub4 && existingSub4.billing_status === 'active') {
          const now4 = new Date();
          const startDate4 = new Date(existingSub4.plan_start_date);
          const renewal4 = existingSub4.renewal_date ? new Date(existingSub4.renewal_date) : null;
          if (renewal4 && renewal4 > now4) {
            const totalMs4 = renewal4 - startDate4;
            const remainingMs4 = renewal4 - now4;
            if (totalMs4 > 0 && remainingMs4 > 0) {
              const oldPlanRes4 = await pool.query('SELECT * FROM organizer_plans WHERE name = $1', [user.tier]);
              if (oldPlanRes4.rows.length > 0) {
                const oldCycle4 = existingSub4.billing_cycle || 'monthly';
                const oldPrice4 = oldCycle4 === 'yearly' ? oldPlanRes4.rows[0].yearly_price : oldPlanRes4.rows[0].monthly_price;
                proratedCredit4 = Math.round(oldPrice4 * (remainingMs4 / totalMs4));
              }
            }
          }
        }
        // ── End Validation ─────────────────────────────────────────────

        // Get plan details
        const planRes = await pool.query('SELECT * FROM organizer_plans WHERE name = $1', [plan]);
        if (planRes.rows.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'PLAN_NOT_FOUND' }));
          return;
        }
        const planDetails = planRes.rows[0];
        const planId = planDetails.id;

        // Calculate price
        const cycle = billingCycle || 'monthly';
        const price = cycle === 'yearly' ? planDetails.yearly_price : planDetails.monthly_price;
        const finalAmount = Math.max(0, price - proratedCredit4);

        // Calculate renewal date
        const renewalDate = new Date();
        if (cycle === 'monthly') {
          renewalDate.setMonth(renewalDate.getMonth() + 1);
        } else {
          renewalDate.setFullYear(renewalDate.getFullYear() + 1);
        }

        // Update user tier
        await pool.query('UPDATE users SET tier = $1 WHERE id = $2', [plan, user.id]);

        // Upsert subscription
        const subId = 'SUB-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO subscriptions (id, organizer_id, plan_id, billing_status, billing_cycle, plan_start_date, renewal_date)
           VALUES ($1, $2, $3, 'active', $4, CURRENT_TIMESTAMP, $5)
           ON CONFLICT (organizer_id) DO UPDATE SET
             plan_id = EXCLUDED.plan_id,
             billing_cycle = EXCLUDED.billing_cycle,
             billing_status = 'active',
             plan_start_date = CURRENT_TIMESTAMP,
             renewal_date = EXCLUDED.renewal_date,
             cancelled_at = NULL`,
          [subId, user.id, planId, cycle, renewalDate]
        );

        // Record billing history for paid plans
        if (price > 0) {
          const billId = 'BILL-' + crypto.randomBytes(6).toString('hex').toUpperCase();
          await pool.query(
            `INSERT INTO billing_history (id, organizer_id, plan_name, billing_cycle, amount, status)
             VALUES ($1, $2, $3, $4, $5, 'completed')`,
            [billId, user.id, plan, cycle, price]
          );
        }

        console.log(`\n📦 [SUBSCRIPTION] User ${user.id} upgraded to ${plan} (${cycle})\n`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Successfully upgraded to ${plan} plan!`,
          subscription: {
            plan,
            billingCycle: cycle,
            renewalDate,
            price,
            proratedCredit: proratedCredit4,
            finalAmount
          }
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/subscription/downgrade - Downgrade to a lower plan
  if (req.url === '/api/subscription/downgrade' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }

        const { plan } = JSON.parse(body);
        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const user = userRes.rows[0];

        const planRes = await pool.query('SELECT * FROM organizer_plans WHERE name = $1', [plan]);
        if (planRes.rows.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'PLAN_NOT_FOUND' }));
          return;
        }
        const planDetails = planRes.rows[0];

        const PLAN_ORDER = ['Free', 'Basic', 'Pro'];
        const currentIdx = PLAN_ORDER.indexOf(user.tier);
        const targetIdx = PLAN_ORDER.indexOf(plan);

        // Same-plan check
        if (user.tier === plan) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SAME_PLAN', message: `You are already on the ${plan} plan.` }));
          return;
        }

        // Block upgrade through downgrade endpoint
        if (targetIdx > currentIdx) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UPGRADE_ONLY', message: 'Please use the upgrade endpoint to move to a higher plan.' }));
          return;
        }

        // Block downgrade while active paid subscription exists
        const subRes = await pool.query('SELECT * FROM subscriptions WHERE organizer_id = $1', [user.id]);
        const existingSub = subRes.rows[0];
        if (existingSub && existingSub.billing_status === 'active' && currentIdx > 0 && targetIdx < currentIdx) {
          const expiryDate = existingSub.renewal_date
            ? new Date(existingSub.renewal_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'N/A';
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'DOWNGRADE_BLOCKED',
            message: `Your ${user.tier} subscription remains active until ${expiryDate}. Downgrading is available after expiry.`
          }));
          return;
        }

        // Update user tier
        await pool.query('UPDATE users SET tier = $1 WHERE id = $2', [plan, user.id]);

        // Get existing subscription or create new one
        if (subRes.rows.length > 0) {
          await pool.query(
            `UPDATE subscriptions SET plan_id = $1, billing_status = 'active' WHERE organizer_id = $2`,
            [planDetails.id, user.id]
          );
        } else {
          const subId = 'SUB-' + crypto.randomBytes(6).toString('hex').toUpperCase();
          await pool.query(
            `INSERT INTO subscriptions (id, organizer_id, plan_id, billing_status, billing_cycle)
             VALUES ($1, $2, $3, 'active', 'monthly')`,
            [subId, user.id, planDetails.id]
          );
        }

        console.log(`\n📦 [SUBSCRIPTION] User ${user.id} downgraded to ${plan}\n`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Downgraded to ${plan} plan. Some features may be limited.`
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/subscription/cancel - Cancel subscription (blocked for active paid plans)
  if (req.url === '/api/subscription/cancel' && req.method === 'POST') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        return;
      }
      const user = userRes.rows[0];

      // Block cancellation for active paid subscriptions
      if (user.tier !== 'Free') {
        const subRes = await pool.query('SELECT * FROM subscriptions WHERE organizer_id = $1', [user.id]);
        const existingSub = subRes.rows[0];
        if (existingSub && existingSub.billing_status === 'active') {
          const expiryDate = existingSub.renewal_date
            ? new Date(existingSub.renewal_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'N/A';
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'CANCEL_BLOCKED',
            message: `Your ${user.tier} subscription remains active until ${expiryDate}. Cancellation is available after expiry.`
          }));
          return;
        }
      }

      await pool.query(
        `UPDATE subscriptions SET billing_status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE organizer_id = $1`,
        [user.id]
      );
      await pool.query('UPDATE users SET tier = $1 WHERE id = $2', ['Free', user.id]);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'Subscription cancelled. You have been moved to the Free plan.'
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/subscription/switch-cycle - Toggle monthly/yearly
  if (req.url === '/api/subscription/switch-cycle' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }

        const { billingCycle } = JSON.parse(body);
        if (!['monthly', 'yearly'].includes(billingCycle)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_CYCLE' }));
          return;
        }

        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const user = userRes.rows[0];

        // Calculate new renewal date
        const renewalDate = new Date();
        if (billingCycle === 'monthly') {
          renewalDate.setMonth(renewalDate.getMonth() + 1);
        } else {
          renewalDate.setFullYear(renewalDate.getFullYear() + 1);
        }

        await pool.query(
          `UPDATE subscriptions SET billing_cycle = $1, renewal_date = $2 WHERE organizer_id = $3`,
          [billingCycle, renewalDate, user.id]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Billing cycle switched to ${billingCycle}.`,
          renewalDate
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/subscription/usage - Get usage statistics
  if (req.url === '/api/subscription/usage' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        return;
      }

      const usage = await getOrganizerUsage(pool, userRes.rows[0].id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, usage }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // GET /api/subscription/features - Check feature access
  if (req.url === '/api/subscription/features' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }

      const userRes = await pool.query('SELECT tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
        return;
      }

      const tier = userRes.rows[0].tier || 'Free';
      const features = PLAN_FEATURES[tier] || PLAN_FEATURES.Free;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, tier, features }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ========================
  // STAFF MANAGEMENT API
  // ========================

  // GET /api/organizer/staff - List staff members
  if (req.url === '/api/organizer/staff' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

      const dbRes = await pool.query(
        'SELECT * FROM staff_members WHERE organizer_id = $1 ORDER BY invited_at DESC',
        [userRes.rows[0].id]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, staff: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/organizer/staff - Invite staff member
  if (req.url === '/api/organizer/staff' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;

        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }
        const user = userRes.rows[0];
        const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;

        if (!plan.staffManagement) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Staff management is only available on Basic and Pro plans.', limitType: 'staff' }));
          return;
        }

        // Check staff limit
        const staffCountRes = await pool.query(
          'SELECT COUNT(*) FROM staff_members WHERE organizer_id = $1 AND status = $2',
          [user.id, 'active']
        );
        const staffCount = parseInt(staffCountRes.rows[0].count);
        if (staffCount >= plan.staffLimit) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'STAFF_LIMIT_REACHED', limitType: 'staff', limitValue: plan.staffLimit, message: `Staff limit reached (${plan.staffLimit}). Upgrade to add more.` }));
          return;
        }

        const data = JSON.parse(body);
        const staffId = 'STF-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        const dbRes = await pool.query(
          `INSERT INTO staff_members (id, organizer_id, name, email, role, permissions)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [staffId, user.id, data.name, data.email, data.role || 'staff', data.permissions || '{}']
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, staff: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // DELETE /api/organizer/staff/:id - Remove staff member
  const staffDeleteMatch = req.url.match(/^\/api\/organizer\/staff\/([^/]+)$/);
  if (staffDeleteMatch && req.method === 'DELETE') {
    const staffId = staffDeleteMatch[1];
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      await pool.query('DELETE FROM staff_members WHERE id = $1', [staffId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Staff member removed.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ========================
  // PRO FEATURES API
  // ========================

  // API Keys endpoints
  if (req.url === '/api/api-keys' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

      const plan = PLAN_FEATURES[userRes.rows[0].tier || 'Free'] || PLAN_FEATURES.Free;
      if (!plan.apiAccess) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'API access is only available on the Pro plan.', limitType: 'api' }));
        return;
      }

      const dbRes = await pool.query(
        'SELECT id, key_prefix, name, permissions, usage_count, last_used_at, status, created_at FROM api_keys WHERE organizer_id = $1 ORDER BY created_at DESC',
        [userRes.rows[0].id]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, keys: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (req.url === '/api/api-keys' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;

        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

        const plan = PLAN_FEATURES[userRes.rows[0].tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.apiAccess) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', limitType: 'api' }));
          return;
        }

        const data = JSON.parse(body);
        const rawKey = 'md_' + crypto.randomBytes(24).toString('hex');
        const keyPrefix = rawKey.substring(0, 10);
        const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
        const keyId = 'API-' + crypto.randomBytes(6).toString('hex').toUpperCase();

        await pool.query(
          `INSERT INTO api_keys (id, organizer_id, key_prefix, key_hash, name, permissions)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [keyId, userRes.rows[0].id, keyPrefix, keyHash, data.name || 'API Key', data.permissions || '{}']
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, key: { id: keyId, key_prefix: keyPrefix, name: data.name || 'API Key', rawKey }, message: 'Save this key now. It will not be shown again.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // DELETE /api/api-keys/:id - Revoke API key
  const apiKeyDeleteMatch = req.url.match(/^\/api\/api-keys\/([^/]+)$/);
  if (apiKeyDeleteMatch && req.method === 'DELETE') {
    const keyId = apiKeyDeleteMatch[1];
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      await pool.query(
        `UPDATE api_keys SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [keyId]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'API key revoked.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Subdomain endpoints
  if (req.url === '/api/subdomains/check' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;

        const { subdomain } = JSON.parse(body);
        if (!subdomain || !/^[a-z0-9-]{3,63}$/.test(subdomain)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_SUBDOMAIN', message: 'Subdomain must be 3-63 alphanumeric characters or hyphens.' }));
          return;
        }

        const existRes = await pool.query('SELECT id FROM custom_subdomains WHERE subdomain = $1', [subdomain]);
        const available = existRes.rows.length === 0;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, available, subdomain }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (req.url === '/api/subdomains' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;

        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

        const plan = PLAN_FEATURES[userRes.rows[0].tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.customSubdomain) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', limitType: 'subdomain' }));
          return;
        }

        const { subdomain } = JSON.parse(body);
        const existRes = await pool.query('SELECT id FROM custom_subdomains WHERE subdomain = $1', [subdomain]);
        if (existRes.rows.length > 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SUBDOMAIN_TAKEN' }));
          return;
        }

        const subId = 'SUBD-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO custom_subdomains (id, organizer_id, subdomain, ssl_status, cname_verified)
           VALUES ($1, $2, $3, 'pending', false)
           ON CONFLICT (organizer_id) DO UPDATE SET subdomain = EXCLUDED.subdomain, ssl_status = 'pending', cname_verified = false`,
          [subId, userRes.rows[0].id, subdomain]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, subdomain, message: `Subdomain ${subdomain}.matchdistrict.com claimed!` }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/subdomains/my - Get organizer's subdomains
  if (req.url === '/api/subdomains/my' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

      const dbRes = await pool.query(
        'SELECT * FROM custom_subdomains WHERE organizer_id = $1',
        [userRes.rows[0].id]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, subdomains: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // White-label endpoints
  if (req.url === '/api/white-label' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

      const plan = PLAN_FEATURES[userRes.rows[0].tier || 'Free'] || PLAN_FEATURES.Free;
      if (!plan.whiteLabel) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', limitType: 'whiteLabel' }));
        return;
      }

      const dbRes = await pool.query('SELECT * FROM white_label_settings WHERE organizer_id = $1', [userRes.rows[0].id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, settings: dbRes.rows[0] || null }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (req.url === '/api/white-label' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;

        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

        const plan = PLAN_FEATURES[userRes.rows[0].tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.whiteLabel) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', limitType: 'whiteLabel' }));
          return;
        }

        const data = JSON.parse(body);
        const wlId = 'WL-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        const dbRes = await pool.query(
          `INSERT INTO white_label_settings (id, organizer_id, primary_color, secondary_color, logo_url, banner_url, favicon_url, custom_css, tournament_page_branded, hide_matchdistrict_branding)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (organizer_id) DO UPDATE SET
             primary_color = COALESCE($3, white_label_settings.primary_color),
             secondary_color = COALESCE($4, white_label_settings.secondary_color),
             logo_url = COALESCE($5, white_label_settings.logo_url),
             banner_url = COALESCE($6, white_label_settings.banner_url),
             favicon_url = COALESCE($7, white_label_settings.favicon_url),
             custom_css = COALESCE($8, white_label_settings.custom_css),
             tournament_page_branded = COALESCE($9, white_label_settings.tournament_page_branded),
             hide_matchdistrict_branding = COALESCE($10, white_label_settings.hide_matchdistrict_branding),
             updated_at = CURRENT_TIMESTAMP
           RETURNING *`,
          [wlId, userRes.rows[0].id, data.primaryColor || '#6366F1', data.secondaryColor || '#14B8A6',
            data.logoUrl || null, data.bannerUrl || null, data.faviconUrl || null, data.customCss || null,
            data.tournamentPageBranded || false, data.hideMatchdistrictBranding || false]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, settings: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Automation rules endpoints
  if (req.url === '/api/automation-rules' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

      const plan = PLAN_FEATURES[userRes.rows[0].tier || 'Free'] || PLAN_FEATURES.Free;
      if (!plan.tournamentAutomation) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', limitType: 'automation' }));
        return;
      }

      const dbRes = await pool.query(
        'SELECT * FROM automation_rules WHERE organizer_id = $1 ORDER BY created_at DESC',
        [userRes.rows[0].id]
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, rules: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (req.url === '/api/automation-rules' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;

        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false })); return; }

        const plan = PLAN_FEATURES[userRes.rows[0].tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.tournamentAutomation) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', limitType: 'automation' }));
          return;
        }

        const data = JSON.parse(body);
        const ruleId = 'AUTO-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        const dbRes = await pool.query(
          `INSERT INTO automation_rules (id, organizer_id, name, trigger_event, action_type, action_config)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [ruleId, userRes.rows[0].id, data.name, data.triggerEvent, data.actionType, data.actionConfig || '{}']
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, rule: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // DELETE /api/automation-rules/:id
  const autoDeleteMatch = req.url.match(/^\/api\/automation-rules\/([^/]+)$/);
  if (autoDeleteMatch && req.method === 'DELETE') {
    const ruleId = autoDeleteMatch[1];
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      await pool.query('DELETE FROM automation_rules WHERE id = $1', [ruleId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Automation rule deleted.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ========================
  // ADMIN SUBSCRIPTION MANAGEMENT
  // ========================

  // GET /api/admin/subscriptions - List all subscriptions
  if (req.url === '/api/admin/subscriptions' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }

      const dbRes = await pool.query(`
        SELECT s.*, u.name as user_name, u.email as user_email, u.tier, u.status as user_status
        FROM subscriptions s
        JOIN users u ON u.id = s.organizer_id
        ORDER BY COALESCE(s.created_at, s.plan_start_date) DESC
      `);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, subscriptions: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/admin/subscriptions/override - Admin override subscription
  if (req.url === '/api/admin/subscriptions/override' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }

        const { userId, plan, billingCycle, status } = JSON.parse(body);
        if (!plan || !['Free', 'Basic', 'Pro'].includes(plan)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_PLAN' }));
          return;
        }

        // Update user tier
        await pool.query('UPDATE users SET tier = $1 WHERE id = $2', [plan, userId]);

        // Update subscription
        const planRes = await pool.query('SELECT id FROM organizer_plans WHERE name = $1', [plan]);
        if (planRes.rows.length > 0) {
          const planId = planRes.rows[0].id;
          const subRes = await pool.query('SELECT id FROM subscriptions WHERE organizer_id = $1', [userId]);
          if (subRes.rows.length > 0) {
            await pool.query(
              `UPDATE subscriptions SET plan_id = $1, billing_status = $2, billing_cycle = $3, cancelled_at = NULL WHERE organizer_id = $4`,
              [planId, status || 'active', billingCycle || 'monthly', userId]
            );
          } else {
            const subId = 'SUB-' + crypto.randomBytes(6).toString('hex').toUpperCase();
            await pool.query(
              `INSERT INTO subscriptions (id, organizer_id, plan_id, billing_status, billing_cycle)
               VALUES ($1, $2, $3, $4, $5)`,
              [subId, userId, planId, status || 'active', billingCycle || 'monthly']
            );
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `User subscription set to ${plan}.` }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/admin/subscriptions/stats - Subscription statistics
  if (req.url === '/api/admin/subscriptions/stats' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }

      const planCounts = await pool.query(
        `SELECT tier, COUNT(*) as count FROM users WHERE 'organiser' = ANY(roles) GROUP BY tier`
      );
      const totalOrganizers = await pool.query(`SELECT COUNT(*) FROM users WHERE 'organiser' = ANY(roles)`);
      const monthlyRevenue = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM billing_history WHERE status = 'completed' AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)`
      );
      const activeSubscriptions = await pool.query(
        `SELECT COUNT(*) FROM subscriptions WHERE billing_status = 'active'`
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        stats: {
          totalOrganizers: parseInt(totalOrganizers.rows[0].count),
          activeSubscriptions: parseInt(activeSubscriptions.rows[0].count),
          monthlyRevenue: parseFloat(monthlyRevenue.rows[0].total),
          planDistribution: planCounts.rows
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- ADMIN GET PENDING REGISTRATIONS WITH TOURNAMENT GAME INFO ---
  if (req.url === '/api/admin/pending-registrations' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
        return;
      }

      const dbRes = await pool.query(`
        SELECT r.*, t.title AS tournament_title, t.game AS tournament_game,
               t.entry_fee_amount, ps.payment_status AS pay_status, ps.id AS payment_submission_id,
               ps.proof_url AS payment_proof_url, ps.utr_number AS payment_utr
        FROM tournament_registrations r
        LEFT JOIN tournaments t ON r.tournament_id = t.id
        LEFT JOIN payment_submissions ps ON ps.registration_id = r.id
        WHERE (
          (r.status IN ('pending', 'pending_admin_review', 'PENDING_PAYMENT_VERIFICATION', 'confirmed', 'VERIFIED_BY_HOST', 'verified_by_host')
           OR ps.payment_status IN ('pending', 'pending_admin_review', 'VERIFIED_BY_HOST', 'verified_by_host', 'confirmed'))
          AND (ps.proof_url IS NOT NULL OR r.screenshot_url IS NOT NULL OR COALESCE(t.entry_fee_amount, 0) = 0 OR r.status IN ('confirmed', 'VERIFIED_BY_HOST', 'verified_by_host'))
        )
        ORDER BY t.game NULLS LAST, t.title NULLS LAST, r.created_at ASC
      `);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, registrations: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- VERIFIER: GET PENDING PAYMENT REGISTRATIONS ---
  if (req.url === '/api/verifier/pending-payments' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasCapability(authUser, 'VERIFY_PAYMENTS')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Access denied: Requires Payment Verifier or Admin permissions.' }));
        return;
      }

      const dbRes = await pool.query(`
        SELECT r.*, t.title AS tournament_title, t.game AS tournament_game,
               t.entry_fee_amount, COALESCE(t."orgId", t.org_id) AS tournament_org_id, COALESCE(t."orgName", t.org_name) AS tournament_org_name,
               ps.payment_status AS pay_status, ps.id AS payment_submission_id,
               ps.proof_url AS payment_proof_url, ps.utr_number AS payment_utr,
               ps.payment_app AS pay_app, u.name AS user_name, u.email AS user_email
        FROM tournament_registrations r
        LEFT JOIN tournaments t ON r.tournament_id = t.id
        LEFT JOIN payment_submissions ps ON ps.registration_id = r.id
        LEFT JOIN users u ON r.user_id = u.id
        WHERE (
          (r.status IN ('pending', 'pending_admin_review', 'PENDING_PAYMENT_VERIFICATION', 'VERIFIED_BY_HOST', 'verified_by_host', 'confirmed')
           OR ps.payment_status IN ('pending', 'pending_admin_review', 'VERIFIED_BY_HOST', 'verified_by_host', 'confirmed'))
          AND (ps.proof_url IS NOT NULL OR r.screenshot_url IS NOT NULL OR COALESCE(t.entry_fee_amount, 0) = 0 OR r.status IN ('confirmed', 'VERIFIED_BY_HOST', 'verified_by_host'))
        )
        ORDER BY r.created_at DESC
      `);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, registrations: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // DELETE /api/automation-rules/:id
  const autoRuleDeleteMatch2 = req.url.match(/^\/api\/automation-rules\/([^/]+)$/);
  if (autoRuleDeleteMatch2 && req.method === 'DELETE') {
    const ruleId = autoRuleDeleteMatch2[1];
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;

      await pool.query('DELETE FROM automation_rules WHERE id = $1', [ruleId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Automation rule deleted.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ========================
  // ADMIN SUBSCRIPTION MANAGEMENT
  // ========================

  // GET /api/admin/subscriptions - List all subscriptions
  if (req.url === '/api/admin/subscriptions' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }

      const dbRes = await pool.query(`
        SELECT s.*, u.name as user_name, u.email as user_email, u.tier, u.status as user_status
        FROM subscriptions s
        JOIN users u ON u.id = s.organizer_id
        ORDER BY COALESCE(s.created_at, s.plan_start_date) DESC
      `);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, subscriptions: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/admin/subscriptions/override - Admin override subscription
  if (req.url === '/api/admin/subscriptions/override' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }

        const { userId, plan, billingCycle, status } = JSON.parse(body);
        if (!plan || !['Free', 'Basic', 'Pro'].includes(plan)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_PLAN' }));
          return;
        }

        // Update user tier
        await pool.query('UPDATE users SET tier = $1 WHERE id = $2', [plan, userId]);

        // Update subscription
        const planRes = await pool.query('SELECT id FROM organizer_plans WHERE name = $1', [plan]);
        if (planRes.rows.length > 0) {
          const planId = planRes.rows[0].id;
          const subRes = await pool.query('SELECT id FROM subscriptions WHERE organizer_id = $1', [userId]);
          if (subRes.rows.length > 0) {
            await pool.query(
              `UPDATE subscriptions SET plan_id = $1, billing_status = $2, billing_cycle = $3, cancelled_at = NULL WHERE organizer_id = $4`,
              [planId, status || 'active', billingCycle || 'monthly', userId]
            );
          } else {
            const subId = 'SUB-' + crypto.randomBytes(6).toString('hex').toUpperCase();
            await pool.query(
              `INSERT INTO subscriptions (id, organizer_id, plan_id, billing_status, billing_cycle)
               VALUES ($1, $2, $3, $4, $5)`,
              [subId, userId, planId, status || 'active', billingCycle || 'monthly']
            );
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `User subscription set to ${plan}.` }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // GET /api/admin/subscriptions/stats - Subscription statistics
  if (req.url === '/api/admin/subscriptions/stats' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }

      const planCounts = await pool.query(
        `SELECT tier, COUNT(*) as count FROM users WHERE 'organiser' = ANY(roles) GROUP BY tier`
      );
      const totalOrganizers = await pool.query(`SELECT COUNT(*) FROM users WHERE 'organiser' = ANY(roles)`);
      const monthlyRevenue = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM billing_history WHERE status = 'completed' AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)`
      );
      const activeSubscriptions = await pool.query(
        `SELECT COUNT(*) FROM subscriptions WHERE billing_status = 'active'`
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        stats: {
          totalOrganizers: parseInt(totalOrganizers.rows[0].count),
          activeSubscriptions: parseInt(activeSubscriptions.rows[0].count),
          monthlyRevenue: parseFloat(monthlyRevenue.rows[0].total),
          planDistribution: planCounts.rows
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ==========================================
  // UNIFIED PAYMENT REVIEW QUEUE SERVICES
  // ==========================================

  // GET /api/admin/payments/review-queue
  if (req.url.startsWith('/api/admin/payments/review-queue') && req.method === 'GET' && !req.url.includes('/review-queue/')) {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
      }
      const parsedUrl = new URL(req.url, 'http://localhost');
      const tab = parsedUrl.searchParams.get('tab') || 'pending_review';
      const tournamentId = parsedUrl.searchParams.get('tournamentId') || null;
      const search = parsedUrl.searchParams.get('search') || '';
      const limit = parseInt(parsedUrl.searchParams.get('limit')) || 20;
      const cursor = parsedUrl.searchParams.get('cursor') || null;

      const result = await reviewListQueue(pool, authUser, { tab, tournamentId, search, limit, cursor });
      if (!result.success) {
        res.writeHead(result.statusCode || 400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // GET /api/admin/payments/review-queue/:regId
  const reviewGetMatch = req.url.match(/^\/api\/admin\/payments\/review-queue\/([A-Za-z0-9_-]+)$/);
  if (reviewGetMatch && req.method === 'GET') {
    const regId = reviewGetMatch[1];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
      }
      const result = await reviewGetItem(pool, authUser, { registrationId: regId });
      if (!result.success) {
        res.writeHead(result.statusCode || 400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(result));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/admin/payments/review-queue/:regId/approve
  const reviewApproveMatch = req.url.match(/^\/api\/admin\/payments\/review-queue\/([A-Za-z0-9_-]+)\/approve$/);
  if (reviewApproveMatch && req.method === 'POST') {
    const regId = reviewApproveMatch[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
        }
        const data = body ? JSON.parse(body) : {};
        const result = await reviewApprove(pool, authUser, { registrationId: regId, note: data.note || '' });
        if (!result.success) {
          res.writeHead(result.statusCode || 400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error(`[review-queue/approve] Internal server error for ${regId}:`, err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message, message: 'Server error while approving registration: ' + err.message }));
      }
    });
    return;
  }

  // POST /api/admin/payments/review-queue/:regId/reject
  const reviewRejectMatch = req.url.match(/^\/api\/admin\/payments\/review-queue\/([A-Za-z0-9_-]+)\/reject$/);
  if (reviewRejectMatch && req.method === 'POST') {
    const regId = reviewRejectMatch[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
        }
        const data = body ? JSON.parse(body) : {};
        const result = await reviewReject(pool, authUser, {
          registrationId: regId,
          reason: data.reason || 'other',
          note: data.note || ''
        });
        if (!result.success) {
          res.writeHead(result.statusCode || 400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error(`[review-queue/reject] Internal server error for ${regId}:`, err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message, message: 'Server error while rejecting registration: ' + err.message }));
      }
    });
    return;
  }

  // POST /api/tournaments/:id/registrations/:regId/approve
  const tourneyRegApproveMatch = req.url.match(/^\/api\/tournaments\/([A-Za-z0-9_-]+)\/registrations\/([A-Za-z0-9_-]+)\/approve$/);
  if (tourneyRegApproveMatch && req.method === 'POST') {
    const tournamentId = tourneyRegApproveMatch[1];
    const regId = tourneyRegApproveMatch[2];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
        }
        const data = body ? JSON.parse(body) : {};
        const result = await reviewApprove(pool, authUser, {
          registrationId: regId,
          tournamentId,
          note: data.note || ''
        });
        if (!result.success) {
          res.writeHead(result.statusCode || 400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error(`[tournaments/registrations/approve] Internal server error for ${regId}:`, err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message, message: 'Server error while approving registration: ' + err.message }));
      }
    });
    return;
  }

  // POST /api/tournaments/:id/registrations/:regId/reject
  const tourneyRegRejectMatch = req.url.match(/^\/api\/tournaments\/([A-Za-z0-9_-]+)\/registrations\/([A-Za-z0-9_-]+)\/reject$/);
  if (tourneyRegRejectMatch && req.method === 'POST') {
    const tournamentId = tourneyRegRejectMatch[1];
    const regId = tourneyRegRejectMatch[2];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
        }
        const data = body ? JSON.parse(body) : {};
        const result = await reviewReject(pool, authUser, {
          registrationId: regId,
          tournamentId,
          reason: data.reason || 'other',
          note: data.note || ''
        });
        if (!result.success) {
          res.writeHead(result.statusCode || 400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error(`[tournaments/registrations/reject] Internal server error for ${regId}:`, err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message, message: 'Server error while rejecting registration: ' + err.message }));
      }
    });
    return;
  }

  // POST /api/admin/payments/review-queue/:regId/reopen
  const reviewReopenMatch = req.url.match(/^\/api\/admin\/payments\/review-queue\/([A-Za-z0-9_-]+)\/reopen$/);
  if (reviewReopenMatch && req.method === 'POST') {
    const regId = reviewReopenMatch[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
        }
        const data = body ? JSON.parse(body) : {};
        const result = await reviewReopen(pool, authUser, {
          registrationId: regId,
          reason: data.reason || ''
        });
        if (!result.success) {
          res.writeHead(result.statusCode || 400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/admin/payments/review-queue/:regId/release-slot
  const reviewReleaseSlotMatch = req.url.match(/^\/api\/admin\/payments\/review-queue\/([A-Za-z0-9_-]+)\/release-slot$/);
  if (reviewReleaseSlotMatch && req.method === 'POST') {
    const regId = reviewReleaseSlotMatch[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
        }
        const data = body ? JSON.parse(body) : {};
        const result = await reviewReleaseSlot(pool, authUser, {
          registrationId: regId,
          note: data.note || ''
        });
        if (!result.success) {
          res.writeHead(result.statusCode || 400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/admin/payments/review-queue/bulk-approve
  if (req.url === '/api/admin/payments/review-queue/bulk-approve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required.' }));
        }
        const data = body ? JSON.parse(body) : {};
        const result = await reviewBulkApprove(pool, authUser, { registrationIds: data.registrationIds || [] });
        if (!result.success) {
          res.writeHead(result.statusCode || 400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result));
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- VERIFIER: VERIFY A SINGLE REGISTRATION PAYMENT (DELEGATES TO REVIEW SERVICE) ---
  if (req.url.startsWith('/api/verifier/verify/') && req.method === 'POST') {
    const regId = req.url.split('/api/verifier/verify/')[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasCapability(authUser, 'VERIFY_PAYMENTS')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Access denied: Requires Payment Verifier or Admin permissions.' }));
          return;
        }

        const data = body ? JSON.parse(body) : {};
        const result = await reviewApprove(pool, authUser, {
          registrationId: regId,
          note: data.payment_app ? 'Verified via payment app: ' + data.payment_app : ''
        });

        if (!result.success) {
          res.writeHead(result.statusCode || 400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: result.error, message: result.message }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Payment verified! Status set to VERIFIED_BY_HOST.',
          registration: result.registration
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- ADMIN: BULK APPROVE (DELEGATES TO REVIEW SERVICE) ---
  if (req.url === '/api/admin/bulk-approve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
          return;
        }

        const data = JSON.parse(body);
        const result = await reviewBulkApprove(pool, authUser, { registrationIds: data.registrationIds || [] });
        if (!result.success) {
          res.writeHead(result.statusCode || 400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify(result));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, results: result.results, approvedCount: result.approvedCount }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- ADMIN: BULK APPROVE ALL & BULK APPROVE VERIFIED (DELEGATES TO REVIEW SERVICE) ---
  if ((req.url === '/api/admin/bulk-approve-all' || req.url === '/api/admin/bulk-approve-verified') && req.method === 'POST') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
        return;
      }

      // Fetch pending review registrations eligible for bulk approval
      const pendingRes = await pool.query(
        `SELECT r.id
         FROM tournament_registrations r
         WHERE r.status IN ('pending', 'VERIFIED_BY_HOST', 'verified_by_host')
         ORDER BY r.created_at ASC
         LIMIT 50`
      );

      if (pendingRes.rows.length === 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'No pending verifications found to approve.', approvedCount: 0 }));
        return;
      }

      const ids = pendingRes.rows.map(r => r.id);
      const result = await reviewBulkApprove(pool, authUser, { registrationIds: ids });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: result.message,
        approvedCount: result.approvedCount,
        results: result.results
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- ADMIN: INJECT DUMMY REGISTRATIONS (DEV / TESTING TOOLS) ---
  const injectDummyMatch = urlPath.match(/^\/api\/admin\/tournaments\/([^/]+)\/(?:inject-dummy-registrations|inject-slots)$/);
  if (injectDummyMatch && req.method === 'POST') {
    const tournamentId = decodeURIComponent(injectDummyMatch[1]).trim();
    let body = '';
    let bodySize = 0;
    const MAX_INJECT_BODY = 64 * 1024; // 64KB
    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_INJECT_BODY) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'PAYLOAD_TOO_LARGE', message: 'Payload exceeds limit.' }));
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
          return;
        }

        let parsedBody = {};
        if (body.trim()) {
          try {
            parsedBody = JSON.parse(body);
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'INVALID_JSON', message: 'Malformed JSON payload.' }));
            return;
          }
        }

        const rawSlots = parsedBody.slotCount ?? parsedBody.targetSlots ?? parsedBody.slots ?? 1;
        const requestedSlots = parseInt(rawSlots, 10);
        if (isNaN(requestedSlots) || requestedSlots < 1) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_SLOT_COUNT', message: 'Slot count must be an integer of at least 1.' }));
          return;
        }
        if (requestedSlots > 5000) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SLOT_LIMIT_EXCEEDED', message: 'Maximum 5,000 slots can be injected in a single operation.' }));
          return;
        }

        // Validate tournament existence
        const tRes = await pool.query(
          'SELECT id, title, "slotsTotal", "slotsFilled", status FROM tournaments WHERE id = $1',
          [tournamentId]
        );
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_NOT_FOUND', message: `Tournament "${tournamentId}" does not exist.` }));
          return;
        }

        const tournament = tRes.rows[0];
        const slotsTotal = parseInt(tournament.slotsTotal, 10) || 128;

        // Query existing registrations to ensure no duplicate slot numbers or IDs
        const existingRegsRes = await pool.query(
          'SELECT id, slot_number FROM tournament_registrations WHERE tournament_id = $1',
          [tournamentId]
        );
        const existingCount = existingRegsRes.rows.length;

        // STRICT CAP: Max registrations cannot exceed tournament slotsTotal (max reg = number of slots)
        const remainingSlots = Math.max(0, slotsTotal - existingCount);
        if (remainingSlots <= 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: 'TOURNAMENT_FULL',
            message: `Tournament "${tournament.title || tournamentId}" has reached full capacity (${existingCount}/${slotsTotal} slots). Maximum registrations equals number of slots (${slotsTotal}).`
          }));
          return;
        }

        // Clamp to remaining slots so total registrations never exceed slotsTotal
        const slotsToInject = Math.min(requestedSlots, remainingSlots);

        const occupiedSlots = new Set(
          existingRegsRes.rows
            .map(r => parseInt(r.slot_number, 10))
            .filter(s => !isNaN(s) && s >= 1 && s <= slotsTotal)
        );

        const now = Date.now();
        const batchTag = crypto.randomBytes(3).toString('hex');
        const batchId = `BATCH-TEST-${now}-${batchTag}`;
        const adminId = authUser.id || authUser.email;
        const injectedAt = new Date(now).toISOString();
        const testRegistrations = [];
        let candidateSlot = 1;

        for (let i = 0; i < slotsToInject; i++) {
          const teamSeq = existingCount + i + 1;
          const regId = `REG-TEST-${now}-${batchTag}-${String(i + 1).padStart(4, '0')}`;
          const userId = `USR-TEST-${now}-${batchTag}-${String(i + 1).padStart(4, '0')}`;
          const leaderIgn = `TestLeader_${teamSeq}`;

          // Find next unoccupied slot within capacity (1..slotsTotal)
          while (occupiedSlots.has(candidateSlot) && candidateSlot <= slotsTotal) {
            candidateSlot++;
          }

          if (candidateSlot > slotsTotal) {
            break; // Strictly enforce: never exceed slotsTotal
          }

          const assignedSlot = candidateSlot;
          occupiedSlots.add(candidateSlot);
          candidateSlot++;
          const regStatus = 'approved';

          const members = JSON.stringify([
            { role: 'Leader', ign: leaderIgn, in_game_id: `999${teamSeq}1` },
            { role: 'Member', ign: `TestAssault_${teamSeq}`, in_game_id: `999${teamSeq}2` },
            { role: 'Member', ign: `TestSniper_${teamSeq}`, in_game_id: `999${teamSeq}3` },
            { role: 'Member', ign: `TestSupport_${teamSeq}`, in_game_id: `999${teamSeq}4` }
          ]);

          testRegistrations.push({
            id: regId,
            tournament_id: tournamentId,
            user_id: userId,
            team_name: `[TEST] Squad ${teamSeq}`,
            captain: leaderIgn,
            captain_uid: `UID-TEST-${now}-${i + 1}`,
            members,
            status: regStatus,
            slot_number: assignedSlot,
            transaction_id: `TXN-TEST-${batchTag}-${i + 1}`,
            payment_id: `PAY-TEST-${batchTag}-${i + 1}`,
            payment_app: 'TEST',
            email: `test_squad_${teamSeq}@test.matchdistrict.local`,
            phone: '9999999999',
            amount_due: '0.00',
            is_test: true,
            test_batch_id: batchId,
            injected_by: adminId,
            injected_at: injectedAt
          });
        }

        // Insert into database in batches using server connection pool
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const hasCols = await hasTestProvenanceColumns(client);
          const CHUNK_SIZE = 100;
          for (let c = 0; c < testRegistrations.length; c += CHUNK_SIZE) {
            const chunk = testRegistrations.slice(c, c + CHUNK_SIZE);
            const valueRows = [];
            const params = [];
            let pIdx = 1;

            if (hasCols) {
              for (const r of chunk) {
                valueRows.push(`(
                  $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++},
                  $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++},
                  $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++},
                  1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
                  $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}
                )`);
                params.push(
                  r.id, r.tournament_id, r.user_id, r.team_name, r.captain,
                  r.captain_uid, r.members, r.status, r.slot_number, r.transaction_id,
                  r.payment_id, r.payment_app, r.email, r.phone, r.amount_due,
                  r.is_test, r.test_batch_id, r.injected_by, r.injected_at
                );
              }

              const insertSql = `
                INSERT INTO tournament_registrations (
                  id, tournament_id, user_id, team_name, captain,
                  captain_uid, members, status, slot_number, transaction_id,
                  payment_id, payment_app, email, phone, amount_due,
                  version, created_at, updated_at,
                  is_test, test_batch_id, injected_by, injected_at
                ) VALUES ${valueRows.join(', ')}
              `;
              await client.query(insertSql, params);
            } else {
              for (const r of chunk) {
                valueRows.push(`(
                  $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++},
                  $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++},
                  $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++},
                  1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )`);
                params.push(
                  r.id, r.tournament_id, r.user_id, r.team_name, r.captain,
                  r.captain_uid, r.members, r.status, r.slot_number, r.transaction_id,
                  r.payment_id, r.payment_app, r.email, r.phone, r.amount_due
                );
              }

              const insertSql = `
                INSERT INTO tournament_registrations (
                  id, tournament_id, user_id, team_name, captain,
                  captain_uid, members, status, slot_number, transaction_id,
                  payment_id, payment_app, email, phone, amount_due,
                  version, created_at, updated_at
                ) VALUES ${valueRows.join(', ')}
              `;
              await client.query(insertSql, params);
            }
          }

          // Record injection event in admin_action_log
          const auditId = `AAL-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
          await client.query(`
            INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, details, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          `, [
            auditId,
            adminId,
            'INJECT_TEST_REGISTRATIONS',
            'INJECT_TEST_REGISTRATIONS',
            'tournament',
            tournamentId,
            JSON.stringify({
              batchId,
              slotCount: testRegistrations.length,
              injectedAt,
              adminEmail: authUser.email || authUser.id
            })
          ]);

          await client.query('COMMIT');
        } catch (dbErr) {
          await client.query('ROLLBACK');
          throw dbErr;
        } finally {
          client.release();
        }

        // Reconcile slots, groups, and slotsFilled counts
        await reconcileTournamentSlots(pool, tournamentId);

        console.log(`🛡️ [ADMIN INJECT] Injected ${testRegistrations.length} dummy registration(s) into tournament "${tournamentId}" by admin "${authUser.email || authUser.id}".`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Successfully injected ${testRegistrations.length} registration${testRegistrations.length === 1 ? '' : 's'}. Tournament capacity is now ${existingCount + testRegistrations.length}/${slotsTotal} slots.`,
          injectedCount: testRegistrations.length,
          slotsTotal,
          slotsFilled: existingCount + testRegistrations.length,
          batchId,
          tournamentId
        }));
      } catch (err) {
        console.error('❌ [ADMIN INJECT] Failed to inject dummy registrations:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: err.message }));
      }
    });
    return;
  }

  // --- ADMIN: PRUNE OVERFLOW REGISTRATIONS (ENFORCE MAX REG = SLOTS TOTAL) ---
  const pruneOverflowMatch = urlPath.match(/^\/api\/admin\/tournaments\/([^/]+)\/prune-overflow-registrations$/);
  if (pruneOverflowMatch && req.method === 'POST') {
    const tournamentId = decodeURIComponent(pruneOverflowMatch[1]).trim();
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
        return;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const tRes = await client.query(
          'SELECT id, title, "slotsTotal", "slotsFilled" FROM tournaments WHERE id = $1',
          [tournamentId]
        );
        if (tRes.rows.length === 0) {
          await client.query('ROLLBACK');
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TOURNAMENT_NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }

        const slotsTotal = parseInt(tRes.rows[0].slotsTotal, 10) || 128;

        // Delete test registrations that exceed slotsTotal
        const excessRes = await client.query(
          `DELETE FROM tournament_registrations
           WHERE tournament_id = $1
             AND (
               slot_number IS NULL
               OR slot_number > $2
               OR id IN (
                 SELECT id FROM tournament_registrations
                 WHERE tournament_id = $1
                 ORDER BY (slot_number IS NULL) ASC, slot_number ASC, created_at ASC
                 OFFSET $2
               )
             )
           RETURNING id`,
          [tournamentId, slotsTotal]
        );

        if (excessRes.rows.length > 0) {
          const deletedIds = excessRes.rows.map(r => r.id);
          await client.query(
            'DELETE FROM tournament_teams WHERE registration_id = ANY($1::text[])',
            [deletedIds]
          );
        }

        await client.query('COMMIT');
        await reconcileTournamentSlots(pool, tournamentId);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Pruned ${excessRes.rowCount} overflow registration(s). Active registrations are now capped at ${slotsTotal}.`,
          prunedCount: excessRes.rowCount,
          slotsTotal
        }));
      } catch (dbErr) {
        await client.query('ROLLBACK');
        throw dbErr;
      } finally {
        client.release();
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: err.message }));
    }
    return;
  }

  // --- ADMIN: GET TEST INJECTION SUMMARY FOR TOURNAMENT ---
  const testSummaryMatch = urlPath.match(/^\/api\/admin\/tournaments\/([^/]+)\/test-injection-summary$/);
  if (testSummaryMatch && req.method === 'GET') {
    const tournamentId = decodeURIComponent(testSummaryMatch[1]).trim();
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
        return;
      }

      const summary = await getTournamentTestInjectionSummary(pool, tournamentId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, summary }));
    } catch (err) {
      const statusCode = err.status || 500;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.code || 'SERVER_ERROR', message: err.message }));
    }
    return;
  }

  // --- ADMIN: DELETE TEST INJECTION DATA FOR ONE TOURNAMENT ONLY ---
  const deleteTestMatch = urlPath.match(/^\/api\/admin\/tournaments\/([^/]+)\/(?:delete-test-injection-data|delete-test-data|test-injection-data)$/);
  if (deleteTestMatch && (req.method === 'POST' || req.method === 'DELETE')) {
    const tournamentId = decodeURIComponent(deleteTestMatch[1]).trim();
    // Resume and drain stream immediately so connection is never stalled
    req.resume();
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
        return;
      }

      if (req.headers['x-confirm-test-data-deletion'] !== 'true') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: 'CONFIRMATION_REQUIRED',
          message: 'Explicit confirmation is required before deleting test-injection data.'
        }));
        return;
      }

      const result = await deleteTournamentTestInjectionData(pool, {
        tournamentId,
        adminId: authUser.id || authUser.email,
        adminEmail: authUser.email || authUser.id
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('❌ [ADMIN CLEANUP] Failed to delete test injection data:', err);
      const statusCode = err.status || 500;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.code || 'SERVER_ERROR', message: err.message }));
    }
    return;
  }

  // --- ADMIN: CLEAR DEV TESTING INJECTED DATA (FOR ALL OR SPECIFIC TOURNAMENT) ---
  if ((urlPath === '/api/admin/dev-testing/clear-data' || urlPath === '/api/admin/clear-test-data') && (req.method === 'POST' || req.method === 'DELETE')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
          return;
        }

        let parsedBody = {};
        if (body.trim()) {
          try { parsedBody = JSON.parse(body); } catch {}
        }

        const tournamentId = parsedBody.tournamentId?.trim();
        const adminId = authUser.id || authUser.email;
        const adminEmail = authUser.email || authUser.id;

        let result;
        if (tournamentId && tournamentId.toUpperCase() !== 'ALL') {
          result = await deleteTournamentTestInjectionData(pool, {
            tournamentId,
            adminId,
            adminEmail
          });
        } else {
          result = await deleteAllTestInjectionData(pool, {
            adminId,
            adminEmail
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error('❌ [ADMIN CLEANUP] Failed to clear dev testing data:', err);
        const statusCode = err.status || 500;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.code || 'SERVER_ERROR', message: err.message }));
      }
    });
    return;
  }

  // --- POST DYNAMIC SYSTEM PURGE (ADMIN ONLY) ---
  if (req.url === '/api/admin/purge' && req.method === 'POST') {
    const client = await pool.connect();
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
        client.release();
        return;
      }

      await client.query('BEGIN');

      // Delete registrations, notices, chat messages, tournaments, applications, transactions
      await client.query('DELETE FROM tournament_registrations');
      await client.query('DELETE FROM tournament_messages');
      await client.query('DELETE FROM tournament_notices');
      await client.query('DELETE FROM tournaments');
      await client.query('DELETE FROM organizer_applications');
      await client.query('DELETE FROM wallet_transactions');

      // Reset all players' wallet balances
      await client.query('UPDATE users SET wallet_balance = 0.00');

      await client.query('COMMIT');

      console.log('🛡️ [ADMIN COMMAND] Platform test & mock data purged to clean production state.');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'All database test data purged successfully!' }));
    } catch (err) {
      await client.query('ROLLBACK');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    } finally {
      client.release();
    }
    return;
  }

  // --- FULL DATABASE PURGE (ADMIN ONLY, DANGER ZONE) — Isolated Sequential Loop ---
  if (req.url === '/api/admin/purge-database' && req.method === 'POST') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
        return;
      }

      // Each table is TRUNCATE'd in isolation. CASCADE resolves FK dependencies automatically.
      // A missing table fails quietly without affecting the rest.
      const tablesToWipe = [
        'subscriptions',
        'alerts',
        'staff_members',
        'team_presets',
        'organiser_followers',
        'payment_verifications',
        'billing_history',
        'payment_submissions',
        'registration_sessions',
        'wallet_transactions',
        'export_usage_log',
        'api_keys',
        'custom_subdomains',
        'white_label_settings',
        'plan_upgrade_requests',
        'analytics_events',
        'tournament_registrations',
        'tournament_notices',
        'tournament_messages',
        'automation_rules',
        'sponsor_contributions',
        'slot_grid',
        'room_credentials',
        'sponsor_list',
        'sponsor_requests',
        'admin_action_log',
        'admin_subscription_log',
        'otps',
        'password_resets',
        'temp_users',
        'registration_cooldowns',
        'tournaments',
        'organizer_applications',
        'registrations',
        'notices',
        'organizer_profiles',
        'site_settings'
      ];

      let wipedCount = 0;
      let failedCount = 0;

      for (const tableName of tablesToWipe) {
        try {
          await pool.query(`TRUNCATE TABLE "${tableName}" CASCADE;`);
          wipedCount++;
        } catch (error) {
          console.warn(`[PURGE] Skipped table "${tableName}": relation might not exist.`);
          failedCount++;
        }
      }

      // Users table is special — preserve admin accounts so the platform isn't orphaned
      try {
        await pool.query(`DELETE FROM users WHERE role != 'admin'`);
        wipedCount++;
      } catch (error) {
        console.warn(`[PURGE] Could not delete from "users": ${error.message}`);
        failedCount++;
      }

      // Re-seed default site settings
      try {
        await pool.query(`
          INSERT INTO site_settings (key, value, updated_at) VALUES
            ('theme', 'dark', CURRENT_TIMESTAMP),
            ('platform_fee_percentage', '10', CURRENT_TIMESTAMP),
            ('organizer_fee_percentage', '5', CURRENT_TIMESTAMP)
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
        `);
      } catch (error) {
        console.warn(`[PURGE] Could not re-seed site_settings: ${error.message}`);
      }

      console.log(`🛡️ [ADMIN COMMAND] Full database purge executed. Wiped ${wipedCount} tables, skipped ${failedCount}.`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        message: 'CRITICAL ALARM: Database has been entirely wiped.',
        details: `Successfully wiped ${wipedCount} tables. Skipped ${failedCount} tables.`
      }));
    } catch (err) {
      console.error('❌ [ADMIN COMMAND] Database purge failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- GET DYNAMIC SYSTEM ACTIVITY LOGS (ADMIN ONLY) ---
  if (req.url === '/api/admin/activity-log' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
        return;
      }

      const usersRes = await pool.query('SELECT name, email, created_at FROM users ORDER BY created_at DESC LIMIT 3');
      const orgsRes = await pool.query('SELECT "orgName", submitted_at FROM organizer_applications ORDER BY submitted_at DESC LIMIT 3');
      const tourneysRes = await pool.query('SELECT title, created_at FROM tournaments ORDER BY created_at DESC LIMIT 3');

      const logs = [];

      usersRes.rows.forEach(u => {
        logs.push({
          text: `New gamer account registered: "${u.name || u.email.split('@')[0]}"`,
          time: u.created_at,
          icon: 'person_add',
          color: 'text-primary'
        });
      });

      orgsRes.rows.forEach(o => {
        logs.push({
          text: `New organizer KYC application submitted by "${o.orgName}"`,
          time: o.submitted_at,
          icon: 'how_to_reg',
          color: 'text-amber-400'
        });
      });

      tourneysRes.rows.forEach(t => {
        logs.push({
          text: `New tournament arena created: "${t.title}"`,
          time: t.created_at,
          icon: 'stadium',
          color: 'text-secondary'
        });
      });

      logs.sort((a, b) => new Date(b.time) - new Date(a.time));

      const logsWithRelativeTime = logs.map(l => {
        const diffMs = new Date() - new Date(l.time);
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr = Math.floor(diffMin / 60);
        let timeStr = 'Just now';
        if (diffMin > 0 && diffMin < 60) timeStr = `${diffMin}m ago`;
        else if (diffHr > 0 && diffHr < 24) timeStr = `${diffHr}h ago`;
        else if (diffHr >= 24) timeStr = `${Math.floor(diffHr / 24)}d ago`;

        return {
          text: l.text,
          time: timeStr,
          icon: l.icon,
          color: l.color
        };
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, logs: logsWithRelativeTime }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- GET DYNAMIC SYSTEM FINANCIALS (ADMIN ONLY) ---
  if (req.url === '/api/admin/financials' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
        return;
      }

      const tournamentsRes = await pool.query(
        `SELECT id, prize, entry, "slotsFilled", status FROM tournaments WHERE status IN ('live', 'upcoming')`
      );

      // Fetch dynamic platform fee percentage
      const feeRes = await pool.query(`SELECT value FROM site_settings WHERE key = 'platform_fee_percentage'`);
      const platformFeePercentage = feeRes.rows.length > 0 ? parseFloat(feeRes.rows[0].value) : 10;
      const commissionRate = platformFeePercentage / 100;

      let totalPrizePools = 0;
      let totalAvailableCommission = 0;
      let activeTourneysCount = 0;

      tournamentsRes.rows.forEach(t => {
        const prizeNum = parseInt(String(t.prize).replace(/[^0-9]/g, '')) || 0;
        const entryNum = parseInt(String(t.entry).replace(/[^0-9]/g, '')) || 0;
        const slots = parseInt(t.slotsFilled) || 0;

        totalPrizePools += prizeNum;
        totalAvailableCommission += (entryNum * slots) * commissionRate;
        activeTourneysCount++;
      });

      // All-time historical metrics (all statuses including completed/archived)
      const allTimeRes = await pool.query(
        `SELECT prize, entry, "slotsFilled", status FROM tournaments WHERE status != 'draft'`
      );
      let allTimePrizePool = 0;
      let allTimeCommission = 0;
      allTimeRes.rows.forEach(t => {
        const prizeNum = parseInt(String(t.prize).replace(/[^0-9]/g, '')) || 0;
        const entryNum = parseInt(String(t.entry).replace(/[^0-9]/g, '')) || 0;
        const slots = parseInt(t.slotsFilled) || 0;
        allTimePrizePool += prizeNum;
        allTimeCommission += (entryNum * slots) * commissionRate;
      });
      const totalHostedArenas = allTimeRes.rows.length;

      const txnRes = await pool.query('SELECT * FROM wallet_transactions ORDER BY created_at DESC LIMIT 10');
      const ledgers = txnRes.rows.map(tx => ({
        id: tx.id,
        desc: tx.description,
        type: tx.type,
        amount: `₹${Number(tx.amount).toLocaleString('en-IN')}`,
        date: new Date(tx.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
        status: tx.status
      }));

      // Compute actual daily signup trajectory (last 10 days)
      const signupsRes = await pool.query(`
        SELECT DATE_TRUNC('day', created_at) as day, COUNT(*) as count 
        FROM users 
        GROUP BY day 
        ORDER BY day DESC 
        LIMIT 10
      `);

      // Compute actual daily registrations trajectory (last 10 days)
      const regsRes = await pool.query(`
        SELECT DATE_TRUNC('day', created_at) as day, COUNT(*) as count 
        FROM tournament_registrations 
        GROUP BY day 
        ORDER BY day DESC 
        LIMIT 10
      `);

      const engagementCurve = new Array(10).fill(0);
      signupsRes.rows.forEach((row, idx) => {
        if (idx < 10) engagementCurve[9 - idx] = parseInt(row.count) || 0;
      });

      const totalUsersRes = await pool.query('SELECT COUNT(*) FROM users');
      const totalUsers = parseInt(totalUsersRes.rows[0].count) || 0;
      if (engagementCurve.reduce((a, b) => a + b, 0) === 0) {
        engagementCurve[9] = totalUsers;
      }

      const trafficBars = new Array(10).fill(0);
      regsRes.rows.forEach((row, idx) => {
        if (idx < 10) trafficBars[9 - idx] = parseInt(row.count) || 0;
      });

      const totalRegsRes = await pool.query('SELECT COUNT(*) FROM tournament_registrations');
      const totalRegs = parseInt(totalRegsRes.rows[0].count) || 0;
      if (trafficBars.reduce((a, b) => a + b, 0) === 0) {
        trafficBars[9] = totalRegs;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        totalOperationalRevenue: totalAvailableCommission,
        totalPrizePools,
        activeTourneysCount,
        platformFeePercentage,
        allTimePrizePool,
        allTimeCommission,
        totalHostedArenas,
        ledger: ledgers,
        engagementCurve,
        trafficBars
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── HEALTH CHECK ENDPOINT ──────────────────────────────────────────────────
  if (req.url === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, status: 'healthy', timestamp: new Date().toISOString() }));
    return;
  }

  // ── ABUSE TRACKER: GET bad_words list (public – needed by the frontend worker) ──
  if (req.url === '/api/admin/badwords' && req.method === 'GET') {
    try {
      const result = await pool.query(`SELECT value FROM site_settings WHERE key = 'bad_words'`);
      const raw = result.rows[0]?.value || '[]';
      let words = [];
      try { words = JSON.parse(raw); } catch { words = []; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, words }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── ABUSE TRACKER: PUT bad_words list (admin only) ──────────────────────────
  if (req.url === '/api/admin/badwords' && req.method === 'PUT') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
          return;
        }
        const { words } = JSON.parse(body);
        if (!Array.isArray(words)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'words must be an array of strings.' }));
          return;
        }
        // Sanitize: lowercase, trim, deduplicate, max 2000 words
        const sanitized = [...new Set(
          words.map(w => String(w).toLowerCase().trim()).filter(w => w.length > 0 && w.length <= 100)
        )].slice(0, 2000);

        await pool.query(
          `INSERT INTO site_settings (key, value, updated_at) VALUES ('bad_words', $1, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = CURRENT_TIMESTAMP`,
          [JSON.stringify(sanitized)]
        );
        console.log(`🛡️ [ABUSE TRACKER] Admin updated bad words list. Total: ${sanitized.length} words.`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, count: sanitized.length, words: sanitized }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── SPONSOR: Submit prize pool request ──────────────────────────────────
  if (req.url === '/api/sponsor/request' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        if (!SPONSORSHIP_ENABLED) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SPONSORSHIP_DISABLED', message: 'Sponsorship feature is currently unavailable.' }));
          return;
        }
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
        const user = userRes.rows[0];
        const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.sponsorSections) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Sponsor sections are only available on Basic and Pro plans.' }));
          return;
        }
        const { tournamentId, prizePoolAmount, description } = JSON.parse(body);
        const id = 'SP-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO sponsor_requests (id, organizer_id, tournament_id, prize_pool_amount, description, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [id, user.id, tournamentId || null, prizePoolAmount || 0, description || '']
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, id }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── SPONSOR: List organizer's sponsor requests ───────────────────────────
  if (req.url === '/api/sponsor/requests' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const dbRes = await pool.query(
        'SELECT * FROM sponsor_requests WHERE organizer_id = $1 ORDER BY created_at DESC',
        [user.id]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, requests: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── ADMIN SPONSOR: List all sponsor requests ─────────────────────────────
  if (req.url.startsWith('/api/admin/sponsor/requests') && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      const statusFilter = req.url.includes('?status=') ? req.url.split('?status=')[1].split('&')[0] : null;
      let query = `
        SELECT sr.*, u.name as organizer_name, u.email as organizer_email
        FROM sponsor_requests sr
        JOIN users u ON u.id = sr.organizer_id
      `;
      const params = [];
      if (statusFilter) {
        query += ' WHERE sr.status = $1';
        params.push(statusFilter);
      }
      query += ' ORDER BY sr.created_at DESC';
      const dbRes = await pool.query(query, params);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, requests: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── ADMIN SPONSOR: Approve sponsor request ───────────────────────────────
  if (req.url === '/api/admin/sponsor/approve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const { requestId, adminNotes } = JSON.parse(body);
        if (!requestId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT' }));
          return;
        }
        const reqRes = await pool.query('SELECT * FROM sponsor_requests WHERE id = $1', [requestId]);
        if (reqRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const sponsorReq = reqRes.rows[0];
        await pool.query(
          `UPDATE sponsor_requests SET status = 'approved', admin_id = $1, admin_notes = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [authUser.id, adminNotes || '', requestId]
        );
        const alertId = 'ALT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO alerts (id, user_id, title, message, is_read)
           VALUES ($1, $2, $3, $4, false)`,
          [alertId, sponsorReq.organizer_id, 'Sponsorship Approved', 'Your prize pool sponsorship request has been approved!']
        );
        const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
           VALUES ($1, $2, 'sponsor_approve', 'sponsor_request', $3, $4)`,
          [logId, authUser.id, requestId, JSON.stringify({ adminNotes: adminNotes || '' })]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Sponsor request approved.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── ADMIN SPONSOR: Reject sponsor request ────────────────────────────────
  if (req.url === '/api/admin/sponsor/reject' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const { requestId, adminNotes } = JSON.parse(body);
        if (!requestId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT' }));
          return;
        }
        const reqRes = await pool.query('SELECT * FROM sponsor_requests WHERE id = $1', [requestId]);
        if (reqRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const sponsorReq = reqRes.rows[0];
        await pool.query(
          `UPDATE sponsor_requests SET status = 'rejected', admin_id = $1, admin_notes = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3`,
          [authUser.id, adminNotes || '', requestId]
        );
        const alertId = 'ALT-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO alerts (id, user_id, title, message, is_read)
           VALUES ($1, $2, $3, $4, false)`,
          [alertId, sponsorReq.organizer_id, 'Sponsorship Rejected', 'Your prize pool sponsorship request has been reviewed and was not approved at this time.']
        );
        const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
           VALUES ($1, $2, 'sponsor_reject', 'sponsor_request', $3, $4)`,
          [logId, authUser.id, requestId, JSON.stringify({ adminNotes: adminNotes || '' })]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Sponsor request rejected.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── ADMIN SPONSOR: Assign sponsor to a request ───────────────────────────
  if (req.url === '/api/admin/sponsor/assign' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const { sponsorRequestId, name, logoUrl, sponsorType, amountContributed } = JSON.parse(body);
        if (!name) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Sponsor name is required.' }));
          return;
        }
        const spId = 'SPN-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO sponsor_list (id, sponsor_request_id, name, logo_url, sponsor_type, amount_contributed, assigned_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [spId, sponsorRequestId || null, name, logoUrl || null, sponsorType || 'prize_pool', amountContributed || 0, authUser.id]
        );
        if (sponsorRequestId) {
          await pool.query(
            `UPDATE sponsor_requests SET status = 'approved', admin_id = $1, reviewed_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [authUser.id, sponsorRequestId]
          );
        }
        const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
           VALUES ($1, $2, 'sponsor_assign', 'sponsor_list', $3, $4)`,
          [logId, authUser.id, spId, JSON.stringify({ sponsorName: name })]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Sponsor assigned successfully.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── SPONSOR: Feature availability (public) ───────────────────────────────
  if (req.url === '/api/sponsorship/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, enabled: SPONSORSHIP_ENABLED }));
    return;
  }

  // ── SPONSOR: Submit public contribution ──────────────────────────────────
  const contribMatch = req.url.match(/^\/api\/tournament\/([^/]+)\/sponsor\/contribute$/);
  if (contribMatch && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        if (!SPONSORSHIP_ENABLED) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SPONSORSHIP_DISABLED', message: 'Sponsorship feature is currently unavailable.' }));
          return;
        }
        const tournamentId = contribMatch[1];
        // Server derives identity from the JWT when present — the client-supplied `userId`/`isGuest` is never trusted
        const authUser = getAuthUser(req);
        const payload = JSON.parse(body || '{}');
        const contributorName = typeof payload.contributor_name === 'string' ? payload.contributor_name.trim() : '';
        const contributorEmail = (typeof payload.contributor_email === 'string' ? payload.contributor_email.trim() : '') || null;
        const transactionId = (typeof payload.transaction_id === 'string' ? payload.transaction_id.trim() : '') || null;
        const paymentApp = typeof payload.payment_app === 'string' ? payload.payment_app.trim() : '';
        const screenshotUrl = typeof payload.screenshot_url === 'string' ? payload.screenshot_url.trim() : '';
        const message = (typeof payload.message === 'string' ? payload.message.trim() : '') || null;
        const amount = parseInt(payload.amount, 10);

        if (!contributorName || !(amount > 0)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Your name and a valid contribution amount are required.' }));
          return;
        }
        if (!transactionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TRANSACTION_ID_REQUIRED', message: 'UPI Transaction ID is required.' }));
          return;
        }
        if (!paymentApp || !['Google Pay', 'PhonePe', 'Paytm', 'BHIM', 'Other'].includes(paymentApp)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'PAYMENT_APP_INVALID', message: 'Please select a payment app.' }));
          return;
        }
        if (!screenshotUrl || !isAllowedStorageUrl(screenshotUrl)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SCREENSHOT_REQUIRED', message: 'A valid payment screenshot URL hosted on an approved storage domain (https) is required.' }));
          return;
        }
        // Tournament must exist. Public spot-sponsorships are platform-run: they are always accepted for review
        // (no `sponsors_enabled` hard-block — that flag only gates the organizer-managed sponsor sections).
        const tRes = await pool.query('SELECT id FROM tournaments WHERE id = $1', [tournamentId]);
        if (tRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
          return;
        }
        // Duplicate protection — one UPI transaction ID maps to one sponsorship submission
        const dupRes = await pool.query("SELECT id FROM sponsor_contributions WHERE transaction_id = $1 AND transaction_id <> '' LIMIT 1", [transactionId]);
        if (dupRes.rows.length > 0) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TRANSACTION_ALREADY_SUBMITTED', message: 'This transaction has already been submitted.' }));
          return;
        }
        const contribId = 'SC-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO sponsor_contributions (id, tournament_id, user_id, contributor_name, contributor_email, amount, message, screenshot_url, transaction_id, payment_app, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')`,
          [contribId, tournamentId, authUser ? authUser.id : null, contributorName, contributorEmail, amount, message, screenshotUrl, transactionId, paymentApp]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, id: contribId, status: 'pending', message: 'Contribution submitted! Awaiting admin verification.' }));
      } catch (err) {
        // Unique-index race (two simultaneous submits of the same txn id)
        if (String(err.code) === '23505') {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'TRANSACTION_ALREADY_SUBMITTED', message: 'This transaction has already been submitted.' }));
          return;
        }
        console.error('[SPONSOR CONTRIBUTE]', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'SUBMIT_FAILED', message: 'Unable to submit your contribution right now. Please try again.' }));
      }
    });
    return;
  }

  // ── SPONSOR: Current user's submissions for a tournament (authenticated) ─
  const mySponsorMatch = req.url.match(/^\/api\/tournament\/([^/]+)\/sponsor\/my$/);
  if (mySponsorMatch && req.method === 'GET') {
    (async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'You must be signed in.' }));
          return;
        }
        const tournamentId = mySponsorMatch[1];
        const dbRes = await pool.query(
          `SELECT id, amount, status, transaction_id, payment_app, admin_notes, created_at
           FROM sponsor_contributions
           WHERE tournament_id = $1 AND user_id = $2
           ORDER BY created_at DESC`, [tournamentId, authUser.id]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, contributions: dbRes.rows }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    })();
    return;
  }

  // ── SPONSOR: Get public sponsor list for a tournament ────────────────────
  const pubSponsorMatch = req.url.match(/^\/api\/tournament\/([^/]+)\/sponsors\/public$/);
  if (pubSponsorMatch && req.method === 'GET') {
    (async () => {
      try {
        const tournamentId = pubSponsorMatch[1];
        // Get approved contributions
        const contribRes = await pool.query(
          `SELECT id, contributor_name, amount, message, created_at FROM sponsor_contributions
           WHERE tournament_id = $1 AND status = 'approved' ORDER BY amount DESC, created_at DESC`,
          [tournamentId]
        );
        // Get organizer-added sponsors from sponsors_data
        const tRes = await pool.query('SELECT sponsors_data FROM tournaments WHERE id = $1', [tournamentId]);
        let organizerSponsors = [];
        if (tRes.rows.length > 0 && tRes.rows[0].sponsors_data) {
          try { organizerSponsors = JSON.parse(tRes.rows[0].sponsors_data).filter(s => s.status === 'approved' && s.type !== 'public'); } catch {}
        }
        const allSponsors = [
          ...organizerSponsors.map(s => ({ type: 'organizer', name: s.name, amount: s.amount, logo: s.logo, website: s.website })),
          ...contribRes.rows.map(r => ({ type: 'public', name: r.contributor_name, amount: r.amount, message: r.message, date: r.created_at }))
        ];
        const totalContributions = allSponsors.reduce((sum, s) => sum + (parseInt(s.amount) || 0), 0);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, sponsors: allSponsors, totalContributions }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    })();
    return;
  }

  // ── ADMIN SPONSOR: List sponsor contributions ────────────────────────────
  if (req.url.startsWith('/api/admin/sponsor/contributions') && req.method === 'GET') {
    (async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const urlObj = new URL(req.url, 'http://localhost');
        const statusFilter = urlObj.searchParams.get('status') || '';
        let query = `SELECT sc.*, t.title as tournament_title FROM sponsor_contributions sc LEFT JOIN tournaments t ON sc.tournament_id = t.id`;
        const params = [];
        if (statusFilter) {
          query += ` WHERE sc.status = $1`;
          params.push(statusFilter);
        }
        query += ` ORDER BY sc.created_at DESC`;
        const dbRes = await pool.query(query, params);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, contributions: dbRes.rows }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    })();
    return;
  }

  // ── ADMIN SPONSOR: Approve contribution (updates prize pool) ─────────────
  if (req.url === '/api/admin/sponsor/contribution/approve' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const { contributionId, adminNotes } = JSON.parse(body);
        if (!contributionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT' }));
          return;
        }
        // Get the contribution
        const cRes = await pool.query('SELECT * FROM sponsor_contributions WHERE id = $1', [contributionId]);
        if (cRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' }));
          return;
        }
        const contrib = cRes.rows[0];

      // Approve the contribution (pending → approved only; guards against double-click double-append)
      const upRes = await pool.query(
        `UPDATE sponsor_contributions SET status = 'approved', admin_id = $1, admin_notes = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3 AND status = 'pending'`,
        [authUser.id, adminNotes || null, contributionId]
      );
      if (upRes.rowCount === 0) {
        const cur = await pool.query('SELECT status FROM sponsor_contributions WHERE id = $1', [contributionId]);
        const already = cur.rows[0]?.status;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: already === 'approved' ? 'Contribution was already approved.' : 'This contribution has already been reviewed and cannot be approved.' }));
        return;
      }

      // Append approved contribution to sponsors_data JSON column
      // (prize_pool_amount stays as base — total is computed dynamically)
      const spRes = await pool.query('SELECT sponsors_data FROM tournaments WHERE id = $1', [contrib.tournament_id]);
      let existingSponsors = [];
      if (spRes.rows.length > 0 && spRes.rows[0].sponsors_data) {
        try { existingSponsors = JSON.parse(spRes.rows[0].sponsors_data); } catch { existingSponsors = []; }
      }
      existingSponsors.push({
        id: contributionId,
        name: contrib.contributor_name,
        amount: parseInt(contrib.amount),
        message: contrib.message || '',
        logo: '',
        status: 'approved',
        type: 'public',
        approved_at: new Date().toISOString()
      });
      await pool.query('UPDATE tournaments SET sponsors_data = $1 WHERE id = $2',
        [JSON.stringify(existingSponsors), contrib.tournament_id]);

        // Log the action
        const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
           VALUES ($1, $2, 'sponsor_contribution_approve', 'sponsor_contributions', $3, $4)`,
          [logId, authUser.id, contributionId, JSON.stringify({ amount: contrib.amount, contributor: contrib.contributor_name })]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Contribution approved! Prize pool updated.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── ADMIN SPONSOR: Reject contribution ───────────────────────────────────
  if (req.url === '/api/admin/sponsor/contribution/reject' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const { contributionId, adminNotes } = JSON.parse(body);
        if (!contributionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT' }));
          return;
        }
        const upRes = await pool.query(
          `UPDATE sponsor_contributions SET status = 'rejected', admin_id = $1, admin_notes = $2, reviewed_at = CURRENT_TIMESTAMP WHERE id = $3 AND status = 'pending'`,
          [authUser.id, adminNotes || null, contributionId]
        );
        if (upRes.rowCount === 0) {
          const cur = await pool.query('SELECT status FROM sponsor_contributions WHERE id = $1', [contributionId]);
          const already = cur.rows[0]?.status;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: already === 'rejected' ? 'Contribution was already rejected.' : 'This contribution has already been reviewed and cannot be rejected.' }));
          return;
        }

        const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
           VALUES ($1, $2, 'sponsor_contribution_reject', 'sponsor_contributions', $3, $4)`,
          [logId, authUser.id, contributionId, JSON.stringify({ adminNotes })]
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Contribution rejected.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── ADMIN: Early Access Management ──────────────────────────────────────
  if (req.url === '/api/admin/early-access' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      const dbRes = await pool.query(
        `SELECT u.id, u.name, u.email FROM users u WHERE u.early_access = true ORDER BY u.created_at DESC`
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, users: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (req.url === '/api/admin/early-access' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const { email } = JSON.parse(body);
        if (!email) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Email is required.' }));
          return;
        }
        const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'User not found with that email.' }));
          return;
        }
        const userId = userRes.rows[0].id;
        await pool.query(`UPDATE users SET early_access = true WHERE id = $1`, [userId]);
        const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
           VALUES ($1, $2, 'early_access_grant', 'user', $3, $4)`,
          [logId, authUser.id, userId, JSON.stringify({ email })]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Early access granted.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (req.url.startsWith('/api/admin/early-access') && req.method === 'DELETE') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      const urlParams = new URLSearchParams(req.url.split('?')[1] || '');
      const userId = urlParams.get('userId');
      if (!userId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'userId is required.' }));
        return;
      }
      await pool.query(`UPDATE users SET early_access = false WHERE id = $1`, [userId]);
      const logId = 'LOG-' + crypto.randomBytes(6).toString('hex').toUpperCase();
      await pool.query(
        `INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
         VALUES ($1, $2, 'early_access_revoke', 'user', $3, $4)`,
        [logId, authUser.id, userId, JSON.stringify({})]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Early access revoked.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── ADMIN: Organizer Usage Stats ──────────────────────────────────────
  if (req.url === '/api/admin/organizer-usage' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      const [tourneyRes, slotRes, orgRes, avgRes, staffRes, analyticsRes] = await Promise.all([
        pool.query('SELECT COUNT(*) as total FROM tournaments'),
        pool.query('SELECT COALESCE(SUM("slotsFilled"), 0) as total FROM tournaments'),
        pool.query(`SELECT COUNT(*) as total FROM users WHERE 'organiser' = ANY(roles)`),
        pool.query(`SELECT COALESCE(AVG(tournament_count), 0) as avg FROM (SELECT COUNT(*) as tournament_count FROM tournaments GROUP BY "orgId") sub`),
        pool.query('SELECT COUNT(*) as total FROM staff_members'),
        pool.query(`SELECT COALESCE(SUM(amount), 0) as total FROM billing_history WHERE status = 'completed'`),
      ]);

      // Growth rates (compare current month vs previous month)
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const firstOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

      const [currentTourneys, prevTourneys] = await Promise.all([
        pool.query(`SELECT COUNT(*) as c FROM tournaments WHERE "createdAt" >= $1`, [firstOfMonth]),
        pool.query(`SELECT COUNT(*) as c FROM tournaments WHERE "createdAt" >= $1 AND "createdAt" < $2`, [firstOfPrevMonth, firstOfMonth]),
      ]);

      const [currentParticipants, prevParticipants] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM("slotsFilled"), 0) as c FROM tournaments WHERE "createdAt" >= $1`, [firstOfMonth]),
        pool.query(`SELECT COALESCE(SUM("slotsFilled"), 0) as c FROM tournaments WHERE "createdAt" >= $1 AND "createdAt" < $2`, [firstOfPrevMonth, firstOfMonth]),
      ]);

      const tGrowth = prevTourneys.rows[0].c > 0 ? Math.round((currentTourneys.rows[0].c - prevTourneys.rows[0].c) / prevTourneys.rows[0].c * 100) : 0;
      const pGrowth = prevParticipants.rows[0].c > 0 ? Math.round((currentParticipants.rows[0].c - prevParticipants.rows[0].c) / prevParticipants.rows[0].c * 100) : 0;

      const stats = {
        totalTournaments: parseInt(tourneyRes.rows[0].total) || 0,
        totalParticipants: parseInt(slotRes.rows[0].total) || 0,
        activeOrganizers: parseInt(orgRes.rows[0].total) || 0,
        avgTournamentsPerOrganizer: parseFloat(avgRes.rows[0].avg) || 0,
        totalStaff: parseInt(staffRes.rows[0].total) || 0,
        totalRevenue: parseFloat(analyticsRes.rows[0].total) || 0,
        tournamentGrowth: tGrowth,
        participantGrowth: pGrowth,
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, stats }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── REGISTRATION FORM: Save custom form schema (PRO only) ────────────────
  if (req.url === '/api/registration-form' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;
        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
        const user = userRes.rows[0];
        const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.customRegistrationForms) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Custom registration forms are only available on the Pro plan.' }));
          return;
        }
        const { tournamentId, formSchema, isActive } = JSON.parse(body);
        if (!tournamentId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'tournamentId is required.' }));
          return;
        }
        const formId = 'FORM-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO custom_registration_forms (id, organizer_id, tournament_id, form_schema, is_active, updated_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
           ON CONFLICT (tournament_id)
           DO UPDATE SET form_schema = $4, is_active = $5, updated_at = CURRENT_TIMESTAMP`,
          [formId, user.id, tournamentId, JSON.stringify(formSchema || []), isActive !== undefined ? isActive : true]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, id: formId }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── REGISTRATION FORM: Get form schema for tournament ────────────────────
  const formGetMatch = req.url.match(/^\/api\/registration-form\/([^/]+)$/);
  if (formGetMatch && req.method === 'GET') {
    const tournamentId = formGetMatch[1];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const dbRes = await pool.query(
        'SELECT * FROM custom_registration_forms WHERE tournament_id = $1',
        [tournamentId]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, form: dbRes.rows[0] || null }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── REGISTRATION FORMS: List organizer's custom forms ────────────────────
  if (req.url === '/api/registration-forms' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const dbRes = await pool.query(
        'SELECT * FROM custom_registration_forms WHERE organizer_id = $1 ORDER BY created_at DESC',
        [user.id]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, forms: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── CUSTOM LINK: Create custom link ──────────────────────────────────────
  if (req.url === '/api/custom-link' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;
        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
        const user = userRes.rows[0];
        const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.customLinks) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Custom links are available on Basic and Pro plans.' }));
          return;
        }
        const { tournamentId, slug, linkType } = JSON.parse(body);
        if (!slug) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Slug is required.' }));
          return;
        }
        const linkTypeVal = linkType || 'tournament';
        if (linkTypeVal === 'dashboard') {
          if (user.tier !== 'Pro') {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Dashboard custom links are only available on the Pro plan.' }));
            return;
          }
        }
        if (!/^[a-z0-9-]{3,50}$/.test(slug)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_SLUG', message: 'Slug must be 3-50 characters, lowercase alphanumeric with hyphens only.' }));
          return;
        }
        const slugCheck = await pool.query('SELECT id FROM custom_links WHERE slug = $1', [slug]);
        if (slugCheck.rows.length > 0) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SLUG_TAKEN', message: 'This slug is already in use.' }));
          return;
        }
        const id = 'LINK-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        const dbRes = await pool.query(
          `INSERT INTO custom_links (id, organizer_id, tournament_id, slug, link_type)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [id, user.id, tournamentId || null, slug, linkTypeVal]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, link: dbRes.rows[0] }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── CUSTOM LINKS: List organizer's custom links ──────────────────────────
  if (req.url === '/api/custom-links' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const dbRes = await pool.query(
        'SELECT * FROM custom_links WHERE organizer_id = $1 ORDER BY created_at DESC',
        [user.id]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, links: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── CUSTOM LINK: Update/edit custom link ─────────────────────────────────
  const linkUpdateMatch = req.url.match(/^\/api\/custom-link\/([^/]+)$/);
  if (linkUpdateMatch && req.method === 'PUT') {
    const linkId = linkUpdateMatch[1];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
          return;
        }
        const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
        const user = userRes.rows[0];
        const linkRes = await pool.query('SELECT * FROM custom_links WHERE id = $1', [linkId]);
        if (linkRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Custom link not found.' }));
          return;
        }
        if (linkRes.rows[0].organizer_id !== user.id && !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not own this link.' }));
          return;
        }
        const data = JSON.parse(body);
        if (data.slug) {
          if (!/^[a-z0-9-]{3,50}$/.test(data.slug)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'INVALID_SLUG', message: 'Slug must be 3-50 characters, lowercase alphanumeric with hyphens only.' }));
            return;
          }
          const slugCheck = await pool.query('SELECT id FROM custom_links WHERE slug = $1 AND id != $2', [data.slug, linkId]);
          if (slugCheck.rows.length > 0) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'SLUG_TAKEN', message: 'This slug is already in use.' }));
            return;
          }
          await pool.query('UPDATE custom_links SET slug = $1 WHERE id = $2', [data.slug, linkId]);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Custom link updated.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── CUSTOM LINK: Delete custom link ──────────────────────────────────────
  const linkDeleteMatch = req.url.match(/^\/api\/custom-link\/([^/]+)$/);
  if (linkDeleteMatch && req.method === 'DELETE') {
    const linkId = linkDeleteMatch[1];
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const linkRes = await pool.query('SELECT * FROM custom_links WHERE id = $1', [linkId]);
      if (linkRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Custom link not found.' }));
        return;
      }
      if (linkRes.rows[0].organizer_id !== user.id && !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not own this link.' }));
        return;
      }
      await pool.query('DELETE FROM custom_links WHERE id = $1', [linkId]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Custom link deleted.' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── SLUG: Resolve slug (PUBLIC) ──────────────────────────────────────────
  const slugMatch = req.url.match(/^\/api\/slug\/([^/]+)$/);
  if (slugMatch && req.method === 'GET') {
    const slug = slugMatch[1];
    try {
      const dbRes = await pool.query(
        'SELECT * FROM custom_links WHERE slug = $1 AND is_active = true',
        [slug]
      );
      if (dbRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Slug not found.' }));
        return;
      }
      const link = dbRes.rows[0];
      await pool.query('UPDATE custom_links SET visit_count = visit_count + 1 WHERE id = $1', [link.id]);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        resolved: {
          linkType: link.link_type,
          tournamentId: link.tournament_id,
          organizerId: link.organizer_id,
          slug: link.slug
        }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── EXPORT: Export registrations as CSV ──────────────────────────────────
  const exportMatch = req.url.match(/^\/api\/tournament\/([^/]+)\/export\/(csv|xlsx)$/);
  if (exportMatch && req.method === 'GET') {
    const tournamentId = exportMatch[1];
    const format = exportMatch[2];
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
      if (!plan.csvExport) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'CSV/Excel export is available on Basic and Pro plans.' }));
        return;
      }
      const tRes = await pool.query('SELECT "orgId" FROM tournaments WHERE id = $1', [tournamentId]);
      if (tRes.rows.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Tournament not found.' }));
        return;
      }
      if (tRes.rows[0].orgId !== user.id && !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'You do not own this tournament.' }));
        return;
      }

      // Log export usage
      const logId = 'EXP-' + crypto.randomBytes(6).toString('hex').toUpperCase();
      await pool.query(
        'INSERT INTO export_usage_log (id, organizer_id, tournament_id, export_type, format) VALUES ($1, $2, $3, $4, $5)',
        [logId, user.id, tournamentId, 'registrations', format]
      );

      if (format === 'csv') {
        const regsRes = await pool.query(
          'SELECT team_name, captain, members, status, created_at FROM tournament_registrations WHERE tournament_id = $1 ORDER BY created_at ASC',
          [tournamentId]
        );
        const rows = regsRes.rows;
        const headers = ['Team Name', 'Captain', 'Members', 'Status', 'Registered At'];
        const csvRows = [headers.join(',')];
        for (const r of rows) {
          const members = r.members ? r.members.replace(/,/g, '; ') : '';
          csvRows.push([
            `"${(r.team_name || '').replace(/"/g, '""')}"`,
            `"${(r.captain || '').replace(/"/g, '""')}"`,
            `"${members.replace(/"/g, '""')}"`,
            r.status || '',
            r.created_at ? new Date(r.created_at).toISOString() : ''
          ].join(','));
        }
        const csvData = csvRows.join('\r\n');
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="registrations-${tournamentId}.csv"`
        });
        res.end(csvData);
      } else {
        const regsRes = await pool.query(
          'SELECT team_name, captain, members, status, created_at FROM tournament_registrations WHERE tournament_id = $1 ORDER BY created_at ASC',
          [tournamentId]
        );
        // Generate simple XLSX-compatible XML (Excel can open this)
        let xlsx = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>';
        xlsx += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
        xlsx += '<Worksheet ss:Name="Registrations"><Table>';
        xlsx += '<Row><Cell><Data ss:Type="String">Team Name</Data></Cell><Cell><Data ss:Type="String">Captain</Data></Cell><Cell><Data ss:Type="String">Members</Data></Cell><Cell><Data ss:Type="String">Status</Data></Cell><Cell><Data ss:Type="String">Registered At</Data></Cell></Row>';
        for (const r of regsRes.rows) {
          const members = r.members ? r.members.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '';
          xlsx += '<Row>';
          xlsx += `<Cell><Data ss:Type="String">${(r.team_name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Data></Cell>`;
          xlsx += `<Cell><Data ss:Type="String">${(r.captain || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Data></Cell>`;
          xlsx += `<Cell><Data ss:Type="String">${members}</Data></Cell>`;
          xlsx += `<Cell><Data ss:Type="String">${r.status || ''}</Data></Cell>`;
          xlsx += `<Cell><Data ss:Type="String">${r.created_at ? new Date(r.created_at).toISOString() : ''}</Data></Cell>`;
          xlsx += '</Row>';
        }
        xlsx += '</Table></Worksheet></Workbook>';
        res.writeHead(200, {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="registrations-${tournamentId}.xlsx"`
        });
        res.end(xlsx);
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── ANALYTICS: Get organizer analytics data ──────────────────────────────
  if (req.url === '/api/analytics/organizer' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
      if (plan.analytics === 'basic' || !plan.analytics) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Advanced analytics are available on Basic and Pro plans.' }));
        return;
      }
      const monthlyData = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const label = `${year}-${String(month).padStart(2, '0')}`;
        const countRes = await pool.query(
          `SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND EXTRACT(YEAR FROM created_at) = $2 AND EXTRACT(MONTH FROM created_at) = $3`,
          [user.id, year, month]
        );
        monthlyData.push({ month: label, count: parseInt(countRes.rows[0].cnt) });
      }
      const regCountRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM tournament_registrations tr JOIN tournaments t ON t.id = tr.tournament_id WHERE t."orgId" = $1`,
        [user.id]
      );
      const registrations = parseInt(regCountRes.rows[0].cnt);
      const slotRes = await pool.query(
        `SELECT SUM(CAST(t."slotsTotal" AS INTEGER)) as total, SUM(CAST(t."slotsFilled" AS INTEGER)) as filled FROM tournaments t WHERE t."orgId" = $1`,
        [user.id]
      );
      const totalSlots = parseInt(slotRes.rows[0]?.total) || 0;
      const filledSlots = parseInt(slotRes.rows[0]?.filled) || 0;
      const slotFillRate = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;
      const growthRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
        [user.id]
      );
      const prevGrowthRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days'`,
        [user.id]
      );
      const currentCount = parseInt(growthRes.rows[0].cnt);
      const prevCount = parseInt(prevGrowthRes.rows[0].cnt);
      const participantGrowth = prevCount > 0 ? Math.round(((currentCount - prevCount) / prevCount) * 100) : currentCount > 0 ? 100 : 0;
      const revenueRes = await pool.query(
        `SELECT COALESCE(SUM(CAST(COALESCE(t."slotsFilled", 0) AS INTEGER) * CAST(COALESCE(t.entry_fee_amount, 0) AS INTEGER)), 0) as revenue
         FROM tournaments t WHERE (t."orgId" = $1 OR t.org_id = $1)`,
        [user.id]
      );
      const revenue = parseInt(revenueRes.rows[0]?.revenue) || 0;
      const recentRes = await pool.query(
        'SELECT * FROM analytics_events WHERE organizer_id = $1 ORDER BY created_at DESC LIMIT 10',
        [user.id]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        monthlyTournaments: monthlyData,
        registrations,
        slotFillRate,
        participantGrowth,
        revenue,
        recentActivity: recentRes.rows
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── REVENUE ANALYTICS: Detailed revenue breakdown ─────────────────────────
  if (req.url === '/api/analytics/revenue' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
      if (plan.analytics === 'basic' || !plan.analytics) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Revenue analytics are available on Basic and Pro plans.' }));
        return;
      }

      // Total revenue from entry fees
      const tourneyRes = await pool.query(
        `SELECT id, title, entry_fee_amount, entry, "slotsFilled", prize_pool_amount, created_at 
         FROM tournaments WHERE ("orgId" = $1 OR org_id = $1) ORDER BY created_at DESC`,
        [user.id]
      );
      const tournaments = tourneyRes.rows;
      let totalRevenue = 0;
      let registrationRevenue = 0;
      const monthlyRevenue = {};
      for (const t of tournaments) {
        const entryFee = parseInt(t.entry_fee_amount) || parseInt(String(t.entry || '0').replace(/[^0-9]/g, '')) || 0;
        const filled = parseInt(t.slotsFilled) || 0;
        const rev = entryFee * filled;
        totalRevenue += rev;
        registrationRevenue += rev;
        const month = t.created_at ? t.created_at.slice(0, 7) : new Date().toISOString().slice(0, 7);
        monthlyRevenue[month] = (monthlyRevenue[month] || 0) + rev;
      }
      const revenueTrends = Object.entries(monthlyRevenue)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, amount]) => ({ month, amount }));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        totalRevenue,
        registrationRevenue,
        prizePoolCommitment: tournaments.reduce((sum, t) => sum + (parseInt(String(t.prize_pool || '0').replace(/[^0-9]/g, '')) || 0), 0),
        revenueTrends,
        tournamentCount: tournaments.length
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── GROWTH ANALYTICS: Tournament & participant growth metrics ────────────
  if (req.url === '/api/analytics/growth' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
      if (plan.analytics === 'basic' || !plan.analytics) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Growth analytics are available on Basic and Pro plans.' }));
        return;
      }

      // Monthly tournament growth (12 months)
      const monthlyTournaments = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const label = `${year}-${String(month).padStart(2, '0')}`;
        const countRes = await pool.query(
          `SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND EXTRACT(YEAR FROM created_at) = $2 AND EXTRACT(MONTH FROM created_at) = $3 AND "isDraft" = false`,
          [user.id, year, month]
        );
        monthlyTournaments.push({ month: label, count: parseInt(countRes.rows[0].cnt) });
      }

      // Registration growth (monthly for 6 months)
      const monthlyRegistrations = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const label = `${year}-${String(month).padStart(2, '0')}`;
        const countRes = await pool.query(
          `SELECT COUNT(*) as cnt FROM tournament_registrations tr 
           JOIN tournaments t ON t.id = tr.tournament_id 
           WHERE t."orgId" = $1 
             AND EXTRACT(YEAR FROM tr.created_at) = $2 
             AND EXTRACT(MONTH FROM tr.created_at) = $3`,
          [user.id, year, month]
        );
        monthlyRegistrations.push({ month: label, count: parseInt(countRes.rows[0].cnt) });
      }

      // Participant growth (unique participants over time)
      const participantGrowth = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const label = `${year}-${String(month).padStart(2, '0')}`;
        const countRes = await pool.query(
          `SELECT COUNT(DISTINCT tr.user_id) as cnt FROM tournament_registrations tr 
           JOIN tournaments t ON t.id = tr.tournament_id 
           WHERE t."orgId" = $1 
             AND EXTRACT(YEAR FROM tr.created_at) = $2 
             AND EXTRACT(MONTH FROM tr.created_at) = $3
             AND tr.status = 'approved'`,
          [user.id, year, month]
        );
        participantGrowth.push({ month: label, count: parseInt(countRes.rows[0].cnt) });
      }

      // 30-day growth rates
      const current30 = await pool.query(
        `SELECT COUNT(*) as tournaments, 
                (SELECT COUNT(*) FROM tournament_registrations tr JOIN tournaments t ON t.id = tr.tournament_id WHERE t."orgId" = $1 AND tr.created_at >= NOW() - INTERVAL '30 days') as registrations
         FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false AND created_at >= NOW() - INTERVAL '30 days'`,
        [user.id]
      );
      const prev30 = await pool.query(
        `SELECT COUNT(*) as tournaments,
                (SELECT COUNT(*) FROM tournament_registrations tr JOIN tournaments t ON t.id = tr.tournament_id WHERE t."orgId" = $1 AND tr.created_at >= NOW() - INTERVAL '60 days' AND tr.created_at < NOW() - INTERVAL '30 days') as registrations
         FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false AND created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days'`,
        [user.id]
      );

      const c = current30.rows[0];
      const p = prev30.rows[0];
      const calcGrowth = (curr, prev) => prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? 100 : 0;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        monthlyTournaments,
        monthlyRegistrations,
        participantGrowth,
        tournamentGrowth30d: calcGrowth(parseInt(c.tournaments), parseInt(p.tournaments)),
        registrationGrowth30d: calcGrowth(parseInt(c.registrations), parseInt(p.registrations)),
        currentPeriod: { tournaments: parseInt(c.tournaments), registrations: parseInt(c.registrations) },
        previousPeriod: { tournaments: parseInt(p.tournaments), registrations: parseInt(p.registrations) }
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── EARLY ACCESS: Check early access status ──────────────────────────────
  if (req.url === '/api/early-access' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED' }));
        return;
      }
      const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const user = userRes.rows[0];
      const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
      let enabled = plan.earlyAccess === true;
      if (!enabled) {
        const subRes = await pool.query(
          'SELECT early_access_enabled FROM subscriptions WHERE organizer_id = $1',
          [user.id]
        );
        if (subRes.rows.length > 0 && subRes.rows[0].early_access_enabled) {
          enabled = true;
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, enabled }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── ADMIN ACTION LOG: Get admin action log ───────────────────────────────
  if (req.url === '/api/admin/action-log' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
        return;
      }
      const dbRes = await pool.query(
        'SELECT * FROM admin_action_log ORDER BY created_at DESC LIMIT 50'
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, entries: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── REVENUE ANALYTICS: Detailed revenue breakdown ──────────────────────
  if (req.url === '/api/analytics/revenue' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const userId = userRes.rows[0].id;

      // Tournament revenue (entry fees * slots filled)
      const tRevRes = await pool.query(
        `SELECT COALESCE(SUM(CAST(COALESCE(t.entry_fee_amount, 0) AS INTEGER) * CAST(COALESCE(t."slotsFilled", 0) AS INTEGER)), 0) as revenue
         FROM tournaments t WHERE (t."orgId" = $1 OR t.org_id = $1) AND (t."isDraft" = false OR t."isDraft" IS NULL)`,
        [userId]
      );
      const tournamentRevenue = parseFloat(tRevRes.rows[0].revenue) || 0;

      // Registration revenue (from paid registrations)
      const regRevRes = await pool.query(
        `SELECT COALESCE(SUM(CAST(COALESCE(t.entry_fee_amount, 0) AS INTEGER)), 0) as revenue
         FROM tournament_registrations tr
         JOIN tournaments t ON t.id = tr.tournament_id
         WHERE (t."orgId" = $1 OR t.org_id = $1) AND tr.status = 'approved'`,
        [userId]
      );
      const registrationRevenue = parseFloat(regRevRes.rows[0].revenue) || 0;

      // Monthly revenue trend (last 6 months)
      const monthlyRevenue = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const label = `${year}-${String(month).padStart(2, '0')}`;
        const revRes = await pool.query(
          `SELECT COALESCE(SUM(CAST(COALESCE(t.entry_fee_amount, 0) AS INTEGER) * CAST(COALESCE(t."slotsFilled", 0) AS INTEGER)), 0) as rev
           FROM tournaments t WHERE (t."orgId" = $1 OR t.org_id = $1) AND (t."isDraft" = false OR t."isDraft" IS NULL)
           AND EXTRACT(YEAR FROM t.created_at) = $2 AND EXTRACT(MONTH FROM t.created_at) = $3`,
          [userId, year, month]
        );
        monthlyRevenue.push({ month: label, revenue: parseFloat(revRes.rows[0].rev) });
      }

      // Total prize pool managed
      const prizeRes = await pool.query(
        `SELECT COALESCE(SUM(CAST(COALESCE(NULLIF(t.prize, ''), '0') AS INTEGER)), 0) as total
         FROM tournaments t WHERE t."orgId" = $1 AND t."isDraft" = false`,
        [userId]
      );
      const totalPrizePool = parseFloat(prizeRes.rows[0].total) || 0;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        tournamentRevenue,
        registrationRevenue,
        totalRevenue: tournamentRevenue + registrationRevenue,
        totalPrizePool,
        monthlyRevenue
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── GROWTH ANALYTICS: Registration/participant/tournament growth ────────
  if (req.url === '/api/analytics/growth' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const userId = userRes.rows[0].id;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

      // Registration growth (current 30d vs previous 30d)
      const regCurRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM tournament_registrations tr
         JOIN tournaments t ON t.id = tr.tournament_id
         WHERE t."orgId" = $1 AND tr.created_at >= $2`,
        [userId, thirtyDaysAgo]
      );
      const regPrevRes = await pool.query(
        `SELECT COUNT(*) as cnt FROM tournament_registrations tr
         JOIN tournaments t ON t.id = tr.tournament_id
         WHERE t."orgId" = $1 AND tr.created_at >= $2 AND tr.created_at < $3`,
        [userId, sixtyDaysAgo, thirtyDaysAgo]
      );
      const currentRegs = parseInt(regCurRes.rows[0].cnt);
      const prevRegs = parseInt(regPrevRes.rows[0].cnt);
      const registrationGrowth = prevRegs > 0 ? Math.round(((currentRegs - prevRegs) / prevRegs) * 100) : currentRegs > 0 ? 100 : 0;

      // Participant growth (unique users registering)
      const partCurRes = await pool.query(
        `SELECT COUNT(DISTINCT tr.user_id) as cnt FROM tournament_registrations tr
         JOIN tournaments t ON t.id = tr.tournament_id
         WHERE t."orgId" = $1 AND tr.created_at >= $2`,
        [userId, thirtyDaysAgo]
      );
      const partPrevRes = await pool.query(
        `SELECT COUNT(DISTINCT tr.user_id) as cnt FROM tournament_registrations tr
         JOIN tournaments t ON t.id = tr.tournament_id
         WHERE t."orgId" = $1 AND tr.created_at >= $2 AND tr.created_at < $3`,
        [userId, sixtyDaysAgo, thirtyDaysAgo]
      );
      const currentParts = parseInt(partCurRes.rows[0].cnt);
      const prevParts = parseInt(partPrevRes.rows[0].cnt);
      const participantGrowth = prevParts > 0 ? Math.round(((currentParts - prevParts) / prevParts) * 100) : currentParts > 0 ? 100 : 0;

      // Tournament growth
      const tCurRes = await pool.query(
        'SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false AND created_at >= $2',
        [userId, thirtyDaysAgo]
      );
      const tPrevRes = await pool.query(
        'SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false AND created_at >= $2 AND created_at < $3',
        [userId, sixtyDaysAgo, thirtyDaysAgo]
      );
      const currentTours = parseInt(tCurRes.rows[0].cnt);
      const prevTours = parseInt(tPrevRes.rows[0].cnt);
      const tournamentGrowth = prevTours > 0 ? Math.round(((currentTours - prevTours) / prevTours) * 100) : currentTours > 0 ? 100 : 0;

      // Monthly performance (last 6 months - tournaments + regs)
      const monthlyPerformance = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const label = `${year}-${String(month).padStart(2, '0')}`;
        const tCountRes = await pool.query(
          'SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false AND EXTRACT(YEAR FROM created_at) = $2 AND EXTRACT(MONTH FROM created_at) = $3',
          [userId, year, month]
        );
        const rCountRes = await pool.query(
          `SELECT COUNT(*) as cnt FROM tournament_registrations tr
           JOIN tournaments t ON t.id = tr.tournament_id
           WHERE t."orgId" = $1 AND EXTRACT(YEAR FROM tr.created_at) = $2 AND EXTRACT(MONTH FROM tr.created_at) = $3`,
          [userId, year, month]
        );
        monthlyPerformance.push({
          month: label,
          tournaments: parseInt(tCountRes.rows[0].cnt),
          registrations: parseInt(rCountRes.rows[0].cnt)
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        registrationGrowth,
        participantGrowth,
        tournamentGrowth,
        monthlyPerformance
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── EXPORT USAGE: Log and get export usage ──────────────────────────────
  if (req.url === '/api/organizer/export-usage' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const userRes = await pool.query('SELECT id FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      const userId = userRes.rows[0].id;
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const logRes = await pool.query(
        'SELECT export_type, format, created_at FROM export_usage_log WHERE organizer_id = $1 AND created_at >= $2 ORDER BY created_at DESC',
        [userId, startOfMonth]
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, exports: logRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── FEATURE FLAGS: Get all feature flags (public) ───────────────────────
  if (req.url === '/api/feature-flags' && req.method === 'GET') {
    try {
      const dbRes = await pool.query(
        'SELECT flag_key, flag_label, description, enabled, target_tier FROM feature_flags ORDER BY created_at DESC'
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, flags: dbRes.rows }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── FEATURE FLAGS: Admin create/update feature flag ──────────────────────
  if (req.url === '/api/admin/feature-flags' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const { flagKey, flagLabel, description, enabled, targetTier } = JSON.parse(body);
        if (!flagKey || !flagLabel) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'flagKey and flagLabel are required.' }));
          return;
        }
        const flagId = 'FF-' + crypto.randomBytes(6).toString('hex').toUpperCase();
        await pool.query(
          `INSERT INTO feature_flags (id, flag_key, flag_label, description, enabled, target_tier)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (flag_key) DO UPDATE SET
             flag_label = $3, description = $4, enabled = $5, target_tier = $6, updated_at = CURRENT_TIMESTAMP`,
          [flagId, flagKey, flagLabel, description || '', enabled || false, targetTier || 'pro']
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Feature flag saved.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── FEATURE FLAGS: Admin toggle early access for a user ──────────────────
  if (req.url.startsWith('/api/admin/early-access/') && req.method === 'PUT') {
    const parts = req.url.split('/');
    const targetUserId = parts[4];
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasRole(authUser, ROLES.ADMIN)) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN' }));
          return;
        }
        const { enabled } = JSON.parse(body);
        await pool.query('UPDATE users SET early_access = $1 WHERE id = $2', [!!enabled, targetUserId]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Early access ${enabled ? 'enabled' : 'disabled'} for user.` }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── CUSTOM DASHBOARD LINK: Set custom org slug ──────────────────────────
  if (req.url === '/api/organizer/dashboard-slug' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;
        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
        const user = userRes.rows[0];
        const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.customLinks) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Custom dashboard links are available on Pro plan.' }));
          return;
        }
        const { slug } = JSON.parse(body);
        if (!slug || !/^[a-z0-9-]{3,50}$/.test(slug)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_SLUG', message: 'Slug must be 3-50 chars, lowercase alphanumeric with hyphens.' }));
          return;
        }
        const slugCheck = await pool.query('SELECT id FROM users WHERE "orgSlug" = $1', [slug]);
        if (slugCheck.rows.length > 0) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'SLUG_TAKEN', message: 'This dashboard slug is already in use.' }));
          return;
        }
        await pool.query('UPDATE users SET "orgSlug" = $1 WHERE id = $2', [slug, user.id]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, slug, message: 'Dashboard link set!' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── CUSTOM DASHBOARD LINK: Check slug availability ──────────────────────
  if (req.url === '/api/organizer/dashboard-slug/check' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { slug } = JSON.parse(body);
        if (!slug || !/^[a-z0-9-]{3,50}$/.test(slug)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_SLUG' }));
          return;
        }
        const slugCheck = await pool.query('SELECT id FROM users WHERE "orgSlug" = $1', [slug]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, available: slugCheck.rows.length === 0 }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ── CUSTOM DASHBOARD LINK: Get current slug ─────────────────────────────
  if (req.url === '/api/organizer/dashboard-slug' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!requireOrganizer(req, res, authUser)) return;
      const userRes = await pool.query('SELECT id, "orgSlug" FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
      if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, slug: userRes.rows[0].orgSlug || null }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // ── STAFF PERMISSIONS: Update staff permissions (PRO multi-admin) ────────
  if (req.url === '/api/organizer/staff/permissions' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!requireOrganizer(req, res, authUser)) return;
        const userRes = await pool.query('SELECT id, tier FROM users WHERE id = $1 OR uid = $1', [authUser.id]);
        if (userRes.rows.length === 0) { res.writeHead(404); res.end(JSON.stringify({ success: false, error: 'NOT_FOUND' })); return; }
        const user = userRes.rows[0];
        const plan = PLAN_FEATURES[user.tier || 'Free'] || PLAN_FEATURES.Free;
        if (!plan.multiAdmin) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FEATURE_LOCKED', message: 'Multi-admin staff management is only available on the Pro plan.' }));
          return;
        }
        const { staffId, adminRole, permissions } = JSON.parse(body);
        if (!staffId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'staffId is required.' }));
          return;
        }
        const staffRes = await pool.query(
          'SELECT * FROM staff_members WHERE id = $1 AND organizer_id = $2',
          [staffId, user.id]
        );
        if (staffRes.rows.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'Staff member not found.' }));
          return;
        }
        await pool.query(
          `UPDATE staff_members SET admin_role = $1, permissions = $2 WHERE id = $3`,
          [adminRole || 'admin', permissions ? JSON.stringify(permissions) : staffRes.rows[0].permissions, staffId]
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Staff permissions updated.' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // ADMIN TOTP AUTHENTICATION SYSTEM
  // ─────────────────────────────────────────────────────────────

  // Helper: Get admin user (the single admin account)
  async function getAdminUser() {
    const adminEmail = process.env.ADMIN_EMAIL || ROOT_ADMIN_EMAIL;
    const res = await pool.query('SELECT * FROM users WHERE email = $1', [adminEmail]);
    return res.rows[0] || null;
  }

  // Helper: Verify TOTP code against an encrypted or plaintext secret with opportunistic migration (SENS-003)
  async function verifyTOTP(secretOrCiphertext, token, adminUserId = null) {
    try {
      const decrypted = decryptSecret(secretOrCiphertext);
      if (!decrypted || !decrypted.secret) return false;
      const totp = new OTPAuth.TOTP({
        issuer: 'Match District',
        label: 'admin',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(decrypted.secret)
      });
      const delta = totp.validate({ token, window: 1 });
      const isValid = delta !== null;
      if (isValid && decrypted.isLegacy && adminUserId) {
        try {
          await pool.query(
            'UPDATE users SET admin_totp_secret = $1 WHERE id = $2',
            [encryptSecret(decrypted.secret), adminUserId]
          );
          console.log('🔐 [ADMIN TOTP] Opportunistically migrated legacy plaintext TOTP secret to AES-256-GCM.');
        } catch (migErr) {
          console.warn('⚠️ [ADMIN TOTP] Opportunistic migration failed:', migErr.message);
        }
      }
      return isValid;
    } catch {
      return false;
    }
  }

  // GET /api/admin/totp-status — Public: check if TOTP is activated (no auth needed)
  if (req.url === '/api/admin/totp-status' && req.method === 'GET') {
    try {
      const adminUser = await getAdminUser();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        totpActivated: !!(adminUser && adminUser.admin_totp_activated && adminUser.admin_totp_secret)
      }));
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, totpActivated: false }));
    }
    return;
  }

  // POST /api/admin/login — Admin TOTP login (with password fallback during initial setup)
  if (req.url === '/api/admin/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { username, otp, password } = JSON.parse(body);

        if (!username) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Username is required.' }));
          return;
        }

        const adminUser = await getAdminUser();
        if (!adminUser) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ADMIN_NOT_FOUND', message: 'Admin account not found.' }));
          return;
        }

        if (username.toLowerCase() !== 'admin' && username.toLowerCase() !== adminUser.email.toLowerCase()) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_CREDENTIALS', message: 'Invalid admin credentials.' }));
          return;
        }

        // TOTP is activated — require valid TOTP code
        if (adminUser.admin_totp_activated && adminUser.admin_totp_secret) {
          if (!otp || otp.length !== 6) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'OTP_REQUIRED', message: 'Google Authenticator code is required.' }));
            return;
          }

          const isValid = await verifyTOTP(adminUser.admin_totp_secret, otp.trim(), adminUser.id);
          if (!isValid) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'INVALID_OTP', message: 'Invalid verification code. Please use the latest code from Google Authenticator.' }));
            return;
          }
        } else {
          // TOTP NOT activated yet — fall back to password for initial setup
          if (!password) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'PASSWORD_REQUIRED', message: 'Enter your admin password to continue. Google Authenticator setup is required after login.' }));
            return;
          }

          if (!adminUser.password || !verifyPassword(password, adminUser.password)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'INVALID_PASSWORD', message: 'Incorrect password.' }));
            return;
          }
        }

        const token = signJwt({
          email: adminUser.email,
          role: adminUser.role,
          roles: adminUser.roles || [adminUser.role],
          id: adminUser.uid || adminUser.id
        });
        const encryptedSession = encryptSessionData(JSON.stringify({
          token,
          userId: adminUser.uid || adminUser.id,
          email: adminUser.email
        }));

        const totpActive = adminUser.admin_totp_activated && adminUser.admin_totp_secret;
        console.log(`\n🛡️ [MATCH DISTRICT ADMIN] Admin "${adminUser.name || adminUser.email}" logged in via ${totpActive ? 'TOTP' : 'password (TOTP setup pending)'}.\n`);

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': buildSessionCookie(token, req, { maxAge: 1800 })
        });
        res.end(JSON.stringify({
          success: true,
          token,
          encryptedSession,
          user: publicUserRow(adminUser),
          totpActivated: totpActive,
          message: totpActive
            ? 'Admin credentials verified! Accessing Platform Command Center...'
            : 'Admin login successful. Please set up Google Authenticator for secure access.',
          setupRequired: !totpActive
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/admin/logout — Admin logout
  if ((req.url === '/api/admin/logout' || urlPath === '/api/admin/logout') && (req.method === 'POST' || req.method === 'GET')) {
    const clearCookies = buildClearSessionCookies(req);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': clearCookies
    });
    res.end(JSON.stringify({ success: true, message: 'Logged out successfully.' }));
    return;
  }

  // GET /api/admin/session — Validate admin session
  if (req.url === '/api/admin/session' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasCapability(authUser, 'MANAGE_ROLES')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Not authenticated.' }));
        return;
      }
      const adminUser = await getAdminUser();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        authenticated: true,
        totpActivated: adminUser?.admin_totp_activated || false,
        user: adminUser ? { id: adminUser.id, name: adminUser.name, email: adminUser.email } : null
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // GET /api/admin/authenticator/setup — Get TOTP setup data (QR + secret)
  if (req.url === '/api/admin/authenticator/setup' && req.method === 'GET') {
    try {
      const authUser = getAuthUser(req);
      if (!authUser || !hasCapability(authUser, 'MANAGE_ROLES')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
        return;
      }

      const adminUser = await getAdminUser();
      if (!adminUser) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'ADMIN_NOT_FOUND' }));
        return;
      }

      // If TOTP is already activated, just return activated status
      if (adminUser.admin_totp_activated && adminUser.admin_totp_secret) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          activated: true,
          message: 'Google Authenticator is already active.'
        }));
        return;
      }

      // TOTP not activated — generate or reuse secret for initial setup
      let secret = null;
      if (!adminUser.admin_totp_secret) {
        const totp = new OTPAuth.TOTP({
          issuer: 'Match District',
          label: 'admin',
          algorithm: 'SHA1',
          digits: 6,
          period: 30
        });
        secret = totp.secret.base32;

        await pool.query(
          'UPDATE users SET admin_totp_secret = $1 WHERE id = $2',
          [encryptSecret(secret), adminUser.id]
        );
      } else {
        const decrypted = decryptSecret(adminUser.admin_totp_secret);
        secret = decrypted.secret;
        if (decrypted.isLegacy && secret) {
          await pool.query(
            'UPDATE users SET admin_totp_secret = $1 WHERE id = $2',
            [encryptSecret(secret), adminUser.id]
          );
        }
      }

      const totp = new OTPAuth.TOTP({
        issuer: 'Match District',
        label: 'admin',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret)
      });

      const otpauthUri = totp.toString();
      const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
        width: 300,
        margin: 2,
        color: { dark: '#0B1020', light: '#FFFFFF' }
      });

      const formattedSecret = secret.match(/.{1,4}/g).join(' ');

      console.log(`\n🔐 [ADMIN TOTP SETUP] Setup page accessed by admin ${adminUser.email}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        activated: false,
        qrCode: qrDataUrl,
        secret: formattedSecret,
        rawSecret: secret,
        otpauthUri
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // POST /api/admin/authenticator/verify — Verify OTP and activate TOTP
  if (req.url === '/api/admin/authenticator/verify' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasCapability(authUser, 'MANAGE_ROLES')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
          return;
        }

        const adminUser = await getAdminUser();
        if (!adminUser) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ADMIN_NOT_FOUND' }));
          return;
        }

        // If TOTP is already activated, block re-verification
        if (adminUser.admin_totp_activated && adminUser.admin_totp_secret) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ALREADY_ACTIVATED', message: 'Google Authenticator is already active. Reset to reconfigure.' }));
          return;
        }

        const { otp } = JSON.parse(body);
        if (!otp || otp.length !== 6) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_INPUT', message: 'Please enter a valid 6-digit code.' }));
          return;
        }

        if (!adminUser.admin_totp_secret) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'NO_SECRET', message: 'No TOTP secret found. Please refresh the setup page.' }));
          return;
        }

        const isValid = await verifyTOTP(adminUser.admin_totp_secret, otp.trim(), adminUser.id);
        if (!isValid) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'INVALID_OTP', message: 'Invalid verification code. Please use the latest code from Google Authenticator.' }));
          return;
        }

        await pool.query(
          'UPDATE users SET admin_totp_activated = true WHERE id = $1',
          [adminUser.id]
        );

        console.log(`\n🔐 [ADMIN TOTP] Google Authenticator successfully activated for admin ${adminUser.email}\n`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Google Authenticator successfully linked. Admin login now requires TOTP verification.'
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/admin/authenticator/reset — Reset TOTP (generate new secret)
  if (req.url === '/api/admin/authenticator/reset' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasCapability(authUser, 'MANAGE_ROLES')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
          return;
        }

        const { confirm } = JSON.parse(body);
        if (!confirm) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'CONFIRMATION_REQUIRED', message: 'Please confirm the reset.' }));
          return;
        }

        const adminUser = await getAdminUser();
        if (!adminUser) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ADMIN_NOT_FOUND' }));
          return;
        }

        const totp = new OTPAuth.TOTP({
          issuer: 'Match District',
          label: 'admin',
          algorithm: 'SHA1',
          digits: 6,
          period: 30
        });
        const newSecret = totp.secret.base32;

        await pool.query(
          'UPDATE users SET admin_totp_secret = $1, admin_totp_activated = false WHERE id = $2',
          [encryptSecret(newSecret), adminUser.id]
        );

        const otpauthUri = totp.toString();
        const qrDataUrl = await QRCode.toDataURL(otpauthUri, {
          width: 300,
          margin: 2,
          color: { dark: '#0B1020', light: '#FFFFFF' }
        });

        const formattedSecret = newSecret.match(/.{1,4}/g).join(' ');

        console.log(`\n🔐 [ADMIN TOTP RESET] TOTP reset for admin ${adminUser.email}. New secret generated.\n`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Google Authenticator has been reset. Please scan the new QR code.',
          qrCode: qrDataUrl,
          secret: formattedSecret,
          rawSecret: newSecret,
          otpauthUri,
          activated: false
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // POST /api/admin/authenticator/revoke — Fully disable TOTP (clear secret, back to password login)
  if (req.url === '/api/admin/authenticator/revoke' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const authUser = getAuthUser(req);
        if (!authUser || !hasCapability(authUser, 'MANAGE_ROLES')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'FORBIDDEN', message: 'Admin access required.' }));
          return;
        }

        const { confirm } = JSON.parse(body || '{}');
        if (!confirm) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'CONFIRMATION_REQUIRED', message: 'Please confirm the revocation.' }));
          return;
        }

        const adminUser = await getAdminUser();
        if (!adminUser) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'ADMIN_NOT_FOUND' }));
          return;
        }

        await pool.query(
          'UPDATE users SET admin_totp_secret = NULL, admin_totp_activated = false WHERE id = $1',
          [adminUser.id]
        );

        console.log(`\n🔐 [ADMIN TOTP REVOKE] TOTP fully revoked for admin ${adminUser.email}. Account reverts to password-only login.\n`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Google Authenticator has been removed. Admin login now uses password only.'
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Retired PGV and device pairing API paths must not fall through to the SPA HTML.
  if (urlPath === '/api/pair' || urlPath.startsWith('/api/pair/') || urlPath === '/api/v1' || urlPath.startsWith('/api/v1/')) {
    res.writeHead(410, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'GONE', message: 'This device integration has been removed.' }));
    return;
  }

  // All other unhandled /api/* paths must return JSON 404 (never the SPA HTML page).
  if (urlPath === '/api' || urlPath.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'NOT_FOUND', message: 'API endpoint not found.' }));
    return;
  }

  // 8. Serve Static Files from dist/ for all other requests (React SPA fallback)
  let filePath = path.join(__dirname, 'dist', req.url === '/' ? 'index.html' : req.url);

  try {
    let stat = await fs.promises.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = await fs.promises.stat(filePath);
    }
  } catch (err) {
    // SPA Fallback: If file not found, serve index.html for client-side React routing
    filePath = path.join(__dirname, 'dist', 'index.html');
  }

  try {
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
});

// ── AUTO LIFECYCLE: Auto live/complete based on round timings ─────────────
async function processTournamentLifecycle(now) {
  try {
    // Auto-live: tournaments whose first round starts within 5 min (or already started)
    const notLive = await pool.query(
      `SELECT id, timeline FROM tournaments
       WHERE ("isDraft" = false OR "isDraft" IS NULL)
         AND (status IS NULL OR status NOT IN ('live','completed','archived'))
         AND timeline IS NOT NULL AND timeline != '' AND timeline != '[]'`
    );
    for (const t of notLive.rows) {
      try {
        const parsed = typeof t.timeline === 'string' ? JSON.parse(t.timeline) : t.timeline;
        const rounds = parsed?.roadmap || (Array.isArray(parsed) ? parsed : []);
        const first = rounds[0];
        if (!first?.date || !first?.time) continue;
        const roundStart = new Date(`${first.date}T${first.time}+05:30`);
        if (isNaN(roundStart.getTime())) continue;
        if (now >= new Date(roundStart.getTime() - 5 * 60 * 1000)) {
          await pool.query('UPDATE tournaments SET status = $1 WHERE id = $2', ['live', t.id]);
          console.log(`🏆 [AUTO LIFECYCLE] Tournament ${t.id} set to live (round 1 at ${first.date}T${first.time} IST)`);
        }
      } catch (_) { /* skip malformed timeline */ }
    }

    // Live-state tournaments may revert before the first scheduled round begins.
    // Completion is reserved for the validated /finalize transaction.
    const liveOnes = await pool.query(
      `SELECT id, timeline FROM tournaments
       WHERE status = 'live'
         AND finalized_at IS NULL
         AND timeline IS NOT NULL AND timeline != '' AND timeline != '[]'`
    );
    for (const t of liveOnes.rows) {
      try {
        const parsed = typeof t.timeline === 'string' ? JSON.parse(t.timeline) : t.timeline;
        const rounds = parsed?.roadmap || (Array.isArray(parsed) ? parsed : []);
        if (!rounds.length) continue;
        const first = rounds[0];

        // Revert-live: first round hasn't started yet (now < roundStart - 5min)
        if (first?.date && first?.time) {
          const roundStart = new Date(`${first.date}T${first.time}+05:30`);
          if (!isNaN(roundStart.getTime()) && now < new Date(roundStart.getTime() - 5 * 60 * 1000)) {
            await pool.query('UPDATE tournaments SET status = NULL WHERE id = $1', [t.id]);
            console.log(`🔄 [AUTO LIFECYCLE] Tournament ${t.id} reverted from live (round 1 at ${first.date}T${first.time} IST, now is before -5min)`);
            continue; // skip complete check since status was reverted
          }
        }

      } catch (_) { /* skip malformed timeline */ }
    }
  } catch (err) {
    console.error('Auto lifecycle error:', err.message);
  }
}

// ── AUTOMATION PROCESSOR: In-process timer for tournament automations ─────
function startAutomationProcessor() {
  console.log('⏰ Automation processor started (interval: 60s)');
  setInterval(async () => {
    try {
      const now = new Date();
      await processTournamentLifecycle(now);
      const rulesRes = await pool.query(
        'SELECT * FROM automation_rules WHERE is_active = true'
      );
      for (const rule of rulesRes.rows) {
        try {
          const config = typeof rule.action_config === 'string' ? JSON.parse(rule.action_config) : (rule.action_config || {});
          const tournamentId = config.tournamentId || rule.tournament_id;
          if (!tournamentId) continue;
          const scheduledAt = config.scheduledAt ? new Date(config.scheduledAt) : null;
          if (scheduledAt && scheduledAt > now) continue;
          if (rule.trigger_event === 'auto_publish') {
            await pool.query(
              'UPDATE tournaments SET status = $1, "isDraft" = false WHERE id = $2',
              ['published', tournamentId]
            );
            await pool.query(
              'INSERT INTO admin_action_log (id, admin_id, action, target_type, target_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
              ['LOG-' + crypto.randomBytes(4).toString('hex').toUpperCase(), 'system', 'auto_publish', 'tournament', tournamentId, JSON.stringify({ rule_id: rule.id })]
            );
          } else if (rule.trigger_event === 'auto_open_registration') {
            await pool.query(
              "UPDATE tournaments SET status = 'registration_open' WHERE id = $1",
              [tournamentId]
            );
          } else if (rule.trigger_event === 'auto_close_registration') {
            await pool.query(
              "UPDATE tournaments SET status = 'upcoming' WHERE id = $1",
              [tournamentId]
            );
          } else if (rule.trigger_event === 'auto_reminder') {
            const tRes = await pool.query('SELECT "orgId", title FROM tournaments WHERE id = $1', [tournamentId]);
            if (tRes.rows.length > 0) {
              const orgId = tRes.rows[0].orgId;
              const tTitle = tRes.rows[0].title;
              const regs = await pool.query(
                'SELECT DISTINCT email FROM tournament_registrations WHERE tournament_id = $1 AND email IS NOT NULL',
                [tournamentId]
              );
              for (const reg of regs.rows) {
                await sendEmail({
                  to: reg.email,
                  subject: `Reminder: ${tTitle} starts soon!`,
                  html: `<p>Your tournament <strong>${tTitle}</strong> is starting soon. Please check in and join the lobby.</p>`,
                });
              }
            }
          } else if (rule.trigger_event === 'auto_notification') {
            const noticeText = config.message || 'Automated notification from Match District.';
            await pool.query(
              `INSERT INTO notices (id, tournament_id, title, content, created_at)
               VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
              ['NOTICE-' + crypto.randomBytes(6).toString('hex').toUpperCase(), tournamentId, 'Automated Notice', noticeText]
            );
          } else if (rule.trigger_event === 'auto_status_update') {
            const targetStatus = config.targetStatus || 'live';
            await pool.query(
              'UPDATE tournaments SET status = $1 WHERE id = $2',
              [targetStatus, tournamentId]
            );
          }
          await pool.query(
            'UPDATE automation_rules SET last_run_at = CURRENT_TIMESTAMP WHERE id = $1',
            [rule.id]
          );
        } catch (ruleErr) {
          console.error('Automation rule error:', rule.id, ruleErr.message);
        }
      }
    } catch (err) {
      console.error('Automation processor error:', err.message);
    }
  }, 60000);
}

// ── SYSTEM HEALTH MONITORING WORKER ─────
function startMonitoringWorker() {
  const intervalSeconds = parseInt(process.env.MONITORING_INTERVAL_SECONDS || '300', 10);
  console.log(`🛡️ System monitoring started (interval: ${intervalSeconds}s)`);
  
  setInterval(async () => {
    try {
      const services = await pool.query('SELECT * FROM system_services WHERE enabled = true');
      for (const srv of services.rows) {
        const start = Date.now();
        let isHealthy = false;
        let errorMessage = null;
        let statusCode = null;
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

          if (srv.slug === 'api') {
             const res = await fetch(`http://127.0.0.1:${PORT}/api/health`, { 
               signal: controller.signal, 
               redirect: 'manual' 
             });
             statusCode = res.status;
             isHealthy = res.ok;
          } else if (srv.slug === 'database') {
             const res = await pool.query('SELECT 1 as ok');
             isHealthy = res.rows.length > 0;
             statusCode = 200;
          } else if (srv.slug === 'supabase') {
             const res = await fetch(`${SUPABASE_URL}/rest/v1/`, { 
               headers: { apikey: SUPABASE_ANON_KEY },
               signal: controller.signal,
               redirect: 'manual'
             });
             statusCode = res.status;
             isHealthy = res.ok;
          } else if (srv.slug === 'imagekit') {
             if (IMAGEKIT_PRIVATE_KEY) {
               const imageKitAuth = Buffer.from(IMAGEKIT_PRIVATE_KEY + ':').toString('base64');
               const res = await fetch('https://api.imagekit.io/v1/files?limit=1', {
                 headers: { Authorization: 'Basic ' + imageKitAuth },
                 signal: controller.signal,
                 redirect: 'manual'
               });
               statusCode = res.status;
               isHealthy = res.ok;
             } else {
               isHealthy = false;
               errorMessage = 'Missing IMAGEKIT_PRIVATE_KEY';
             }
          }
          clearTimeout(timeoutId);
        } catch (err) {
          isHealthy = false;
          errorMessage = err.message;
        }

        const duration = Date.now() - start;
        const statusStr = isHealthy ? 'healthy' : 'down';
        
        await pool.query(
          `INSERT INTO service_health_checks (service_id, status, response_time_ms, status_code, error_message)
           VALUES ($1, $2, $3, $4, $5)`,
          [srv.id, statusStr, duration, statusCode, errorMessage]
        );

        const recentFailures = await pool.query(
          `SELECT status FROM service_health_checks WHERE service_id = $1 ORDER BY checked_at DESC LIMIT 3`,
          [srv.id]
        );
        const consecutiveFails = recentFailures.rows.filter(r => r.status === 'down').length;

        if (consecutiveFails >= 3) {
          await pool.query(
            `INSERT INTO system_incidents (id, service_id, severity, reason, status) 
             VALUES ($1, $2, $3, $4, 'active') 
             ON CONFLICT DO NOTHING`,
            [`INC-${srv.id}-${Date.now()}`, srv.id, srv.criticality === 'critical' ? 'critical' : 'warning', errorMessage || 'Service unavailable']
          );
        } else if (isHealthy) {
          await pool.query(
            `UPDATE system_incidents 
             SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, duration_seconds = EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - started_at))
             WHERE service_id = $1 AND status = 'active'`,
            [srv.id]
          );
        }
      }
    } catch (err) {
      console.error('Monitoring worker error:', err.message);
    }
  }, intervalSeconds * 1000);
}

(async () => {
  try {
    await initDb();
  } catch (startupError) {
    const code = startupError?.code || 'UNKNOWN';
    const constraint = startupError?.constraint ? ` constraint=${startupError.constraint}` : '';
    console.error(`❌ [STARTUP] Database schema initialization failed [code=${code}${constraint}]. Server startup aborted.`);
    process.exit(1);
  }
  startSlotManagerWorker(pool);
  startAutomationProcessor();
  startMonitoringWorker();
  accountSecurity.startNotificationCleanup();
  accountSecurity.startAbuseCleanup();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 [MATCH DISTRICT PRODUCTION SERVER] Running on http://localhost:${PORT}`);
    console.log(`🌐 Network: http://127.0.0.1:${PORT} (listening on all interfaces 0.0.0.0)`);
    console.log(`📦 Serving static frontend from ./dist`);
    console.log(`🔑 API Endpoints active (OTP, JWT Auth, Supabase DB)\n`);
  });
})();
