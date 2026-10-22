// scripts/build-endpoints-doc.mjs
// Generates AUDIT_ENDPOINTS.md from extracted endpoints

import fs from 'fs';

const endpoints = JSON.parse(fs.readFileSync('scripts/endpoints-extracted.json', 'utf8'));

let doc = `# Match District — Full HTTP Endpoint Surface Audit (\`AUDIT_ENDPOINTS.md\`)

**Total Endpoints Identified:** ${endpoints.length}  
**Architecture:** Hand-rolled Node.js \`http.createServer\` router in \`server.js\` without framework/middleware abstraction.

---

## 1. Executive Summary & Structural Vulnerabilities

### Key Endpoint Findings
1. **Duplicate Handlers (EP-001)**:
   - \`GET /api/admin/subscriptions\` (\`server.js:13320\` & \`13522\`)
   - \`POST /api/admin/subscriptions/override\` (\`server.js:13346\` & \`13548\`)
   - \`GET /api/admin/subscriptions/stats\` (\`server.js:13399\` & \`13601\`)
   - \`GET /api/admin/pending-registrations\` (\`server.js:13437\` & \`13639\`)
   - \`GET /api/analytics/revenue\` (\`server.js:15592\` & \`15804\`)
   - \`GET /api/analytics/growth\` (\`server.js:15646\` & \`15872\`)
   - \`GET /api/health\` (\`server.js:1302\` & \`14365\`)
   *Because of sequential \`if (req.url === ...) return;\` dispatch, the second copy in each pair is completely unreachable dead code.*

2. **Dead / Blocked Endpoints (EP-006)**:
   - \`checkRateLimit\` declared twice at module scope (\`server.js:1175\` and \`server.js:7188\`).
   - The boolean version at 7188 hoists over the object version at 1175, permanently causing \`!rl.allowed\` to evaluate to \`true\` at:
     - \`POST /api/v1/payments/verify\` (\`server.js:16487\`)
     - \`GET /api/admin/monitoring/security/scan\` (\`server.js:10175\`)
     *Both endpoints unconditionally return 429 Too Many Requests to every caller.*

3. **Unauthenticated Mutating Routes**:
   - \`POST /api/media/upload\` (line 1249) — No authentication required, unbounded body buffer.
   - \`POST /api/auth/send-otp\` (line 1309) — No rate limiting, email-bombing vector.
   - \`POST /api/auth/register\` (line 1595) — Role parameter accepted from client body (AUTH-001).

4. **Missing Authentication / Over-Exposure on Read Routes**:
   - \`GET /api/users/:id\` (line 2670) — **Unauthenticated**. Returns full user row with email, phone, wallet balance.
   - \`GET /api/v1/payments/all\` (line 16275) — Requires only companion device key; dumps customer emails, phones, UTRs, and payment proofs.

---

## 2. Complete HTTP Endpoint Catalog

| Method | Route Path | Line | Auth Required? | Role Check | Ownership Check? | Tables Read / Written | Sensitive Fields Exposed? | Flags & Risks |
| :--- | :--- | :---: | :--- | :--- | :---: | :--- | :--- | :--- |
`;

for (const ep of endpoints) {
  let flags = [];
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(ep.method) && !ep.authRequired && !ep.path.includes('/api/auth/')) {
    flags.push('⚠️ Unauthenticated Mutation');
  }
  if (ep.path === '/api/users/:id' && !ep.authRequired) {
    flags.push('🚨 Unauthenticated Data Exposure');
  }
  if (ep.path.includes('/api/v1/payments/all')) {
    flags.push('🚨 Device Key Leaks Customer PII');
  }
  if (['/api/admin/subscriptions', '/api/admin/subscriptions/override', '/api/admin/subscriptions/stats', '/api/admin/pending-registrations', '/api/analytics/revenue', '/api/analytics/growth', '/api/health'].includes(ep.path)) {
    flags.push('🔁 Duplicate Route Handler');
  }
  if (['/api/v1/payments/verify', '/api/admin/monitoring/security/scan'].includes(ep.path)) {
    flags.push('⛔ Broken by Rate Limiter Hoisting');
  }
  
  const tablesStr = ep.tables.length > 0 ? ep.tables.join(', ') : 'None';
  const flagStr = flags.length > 0 ? flags.join('<br>') : 'Normal';
  
  doc += `| \`${ep.method}\` | \`${ep.path}\` | [${ep.line}](file:///e:/Projects/MatchDistrict/server.js#L${ep.line}) | ${ep.authType} | ${ep.roleCheck} | ${ep.ownershipCheck ? 'Yes' : 'No'} | ${tablesStr} | ${ep.sensitiveFields} | ${flagStr} |\n`;
}

fs.writeFileSync('AUDIT_ENDPOINTS.md', doc, 'utf8');
console.log('AUDIT_ENDPOINTS.md generated successfully.');
