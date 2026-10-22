import fs from 'fs';

const p = 'E:/Projects/MatchDistrict/server.js';
let s = fs.readFileSync(p, 'utf8');
const origLen = s.length;
const nl = s.includes('\r\n') ? '\r\n' : '\n';
console.log('newline', JSON.stringify(nl));

const authStart = s.indexOf('// Authenticate a paired device by its raw API key');
const iamStart = s.indexOf('// IAM Role Hierarchy Engine');
if (authStart < 0 || iamStart < 0 || authStart > iamStart) {
  console.error('AUTH BLOCK MARKERS BAD', authStart, iamStart);
  process.exit(1);
}
s = s.slice(0, authStart) +
  '// JWT-only auth resolver. Companion/device API keys have been removed.\n' +
  'function resolveAuthUser(req) {\n' +
  '  return getAuthUser(req);\n' +
  '}\n\n' +
  s.slice(iamStart);

const cfgOld = `// ── v1.1 CONFIGURATION ─────────────────────────────────────────────────────
const MIN_SUPPORTED_APP_VERSION = '1.1.0';
const PAYMENT_VERIFY_RATE_LIMIT = 60;          // requests per minute per device
const PAYMENT_VERIFY_RATE_WINDOW_MS = 60_000;  // 1 minute window
const UNIQUE_AMOUNT_SUFFIX_RANGE = 99;         // max paisa suffix (0.01–0.99)

// ── v1.1 IN-MEMORY RATE LIMITER ────────────────────────────────────────────
// Keyed by device_id. Each entry = { count, windowStart }.
`;
const cfgNew = `const PAYMENT_VERIFY_RATE_LIMIT = 60;
const PAYMENT_VERIFY_RATE_WINDOW_MS = 60_000;
const UNIQUE_AMOUNT_SUFFIX_RANGE = 99;         // max paisa suffix (0.01–0.99)

// In-memory rate limiter. Each entry = { count, windowStart }.
`;
if (!s.includes(cfgOld)) {
  console.error('CFG BLOCK NOT FOUND');
  process.exit(1);
}
s = s.replace(cfgOld, cfgNew);

const fuzzyStart = s.indexOf('// ── v1.1 HELPER: fuzzy name/UTR match');
const serverStart = s.indexOf('const server = http.createServer');
if (fuzzyStart < 0 || serverStart < 0 || fuzzyStart > serverStart) {
  console.error('FUZZY BLOCK MARKERS BAD', fuzzyStart, serverStart);
  process.exit(1);
}
s = s.slice(0, fuzzyStart) + s.slice(serverStart);

const opts = `  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
`;
const optsNew = `  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Companion/device API removed. Return 410 Gone with no payload data.
  if (urlPath === '/api/v1' || urlPath.startsWith('/api/v1/') || urlPath === '/api/pair' || urlPath.startsWith('/api/pair/')) {
    res.writeHead(410, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'GONE' }));
    return;
  }
`;
if (!s.includes(opts)) {
  console.error('OPTIONS BLOCK NOT FOUND');
  process.exit(1);
}
s = s.replace(opts, optsNew);

const pairStart = s.indexOf('  // ── PAIRING & AUTO-VERIFY ENDPOINTS');
const totpStart = s.indexOf('  // ADMIN TOTP AUTHENTICATION SYSTEM');
if (pairStart < 0 || totpStart < 0 || pairStart > totpStart) {
  console.error('PAIR BLOCK MARKERS BAD', pairStart, totpStart);
  process.exit(1);
}
s = s.slice(0, pairStart) + s.slice(totpStart);

const smsNeedle = `        // 3. Record verification sync for mobile app history
        try {
          await pool.query(
            \`INSERT INTO payment_sms_verifications (id, utr, amount, device_id, matched_registration_id, match_type, status, created_at) VALUES ($1, $2, $3, $4, $5, 'registration', 'verified', NOW()) ON CONFLICT (utr) DO NOTHING\`,
            ['WEB-VER-' + crypto.randomBytes(6).toString('hex').toUpperCase(), currentReg.transaction_id || 'WEB_MANUAL', 0, 'WEB-VERIFIER', regId]
          );
        } catch (verErr) { /* ignore */ }
`;
if (!s.includes(smsNeedle)) {
  console.error('SMS INSERT BLOCK NOT FOUND');
  process.exit(1);
}
s = s.replace(smsNeedle, '');

const leftovers = ['authenticateDevice', 'paired_devices', '/api/v1/auth/device', 'MIN_SUPPORTED_APP_VERSION', 'fuzzyNameMatch'];
for (const token of leftovers) {
  const idx = s.indexOf(token);
  if (idx >= 0) {
    console.error('LEFTOVER', token, 'at', idx);
    console.error(s.slice(Math.max(0, idx - 80), idx + 120));
    process.exit(1);
  }
}

fs.writeFileSync(p, s);
console.log('OK bytes', origLen, '->', s.length);
