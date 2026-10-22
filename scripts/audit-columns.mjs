// scripts/audit-columns.mjs
// Offline read-only audit of server SQL queries against schema definitions and live schema.

import fs from 'fs';
import path from 'path';

// 1. Build authoritative column dictionary from schemaMigrations.js & initDb() & schema_live.csv
const schemaTables = new Map();

function addColumn(table, col, isQuoted = false) {
  table = table.toLowerCase().trim();
  if (!schemaTables.has(table)) {
    schemaTables.set(table, new Map());
  }
  const colKey = col.replace(/"/g, '').trim();
  schemaTables.get(table).set(colKey, {
    name: colKey,
    raw: col,
    isQuoted: isQuoted || col.startsWith('"'),
  });
}

// Read schema_live.csv if present
if (fs.existsSync('schema_live.csv')) {
  const content = fs.readFileSync('schema_live.csv', 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('table_name')) continue;
    const parts = trimmed.split(',');
    if (parts.length >= 2) {
      const table = parts[0].trim();
      const col = parts[1].trim();
      addColumn(table, col);
    }
  }
}

// Read server/schemaMigrations.js
const migrationsContent = fs.readFileSync('server/schemaMigrations.js', 'utf8');

// Parse CREATE TABLE and ALTER TABLE ADD COLUMN
const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
let match;
while ((match = createTableRegex.exec(migrationsContent)) !== null) {
  const tableName = match[1].toLowerCase();
  const body = match[2];
  const colLines = body.split('\n');
  for (const colLine of colLines) {
    const trimmed = colLine.trim();
    if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('UNIQUE') || trimmed.startsWith('CONSTRAINT') || trimmed.startsWith('PRIMARY KEY') || trimmed.startsWith('CHECK')) continue;
    const colMatch = trimmed.match(/^("?[a-zA-Z0-9_]+"?)/);
    if (colMatch) {
      const rawCol = colMatch[1];
      addColumn(tableName, rawCol, rawCol.startsWith('"'));
    }
  }
}

const alterTableRegex = /ALTER\s+TABLE\s+(?:public\.)?([a-zA-Z0-9_]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[a-zA-Z0-9_]+"?)/gi;
while ((match = alterTableRegex.exec(migrationsContent)) !== null) {
  const tableName = match[1].toLowerCase();
  const rawCol = match[2];
  addColumn(tableName, rawCol, rawCol.startsWith('"'));
}

// Add columns from initDb() in server.js
const serverContent = fs.readFileSync('server.js', 'utf8');
while ((match = alterTableRegex.exec(serverContent)) !== null) {
  const tableName = match[1].toLowerCase();
  const rawCol = match[2];
  addColumn(tableName, rawCol, rawCol.startsWith('"'));
}

console.log(`Loaded ${schemaTables.size} tables for schema auditing.`);

// Files to scan
const filesToScan = ['server.js'];
const serverDir = 'server';
if (fs.existsSync(serverDir)) {
  for (const f of fs.readdirSync(serverDir)) {
    if (f.endsWith('.js') && f !== 'schemaMigrations.js') {
      filesToScan.push(path.join(serverDir, f));
    }
  }
}

// Extract SQL query blocks from JS files
function extractQueries(content) {
  const queries = [];
  // Match template literals, single-quoted or double-quoted strings containing SQL keywords
  // Typically: client.query(`...`), pool.query('...'), or const sql = `SELECT ...`
  const regex = /(?:client|pool|clientOrPool|dbClient)\.query\s*\(\s*([`'"])([\s\S]*?)\1/g;
  let m;
  while ((m = regex.exec(content)) !== null) {
    queries.push({
      sql: m[2],
      index: m.index,
    });
  }

  // Also match standalone template strings that start with SELECT/INSERT/UPDATE/DELETE
  const standaloneSqlRegex = /`\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b([\s\S]*?)`/gi;
  while ((m = standaloneSqlRegex.exec(content)) !== null) {
    queries.push({
      sql: m[1] + m[2],
      index: m.index,
    });
  }

  return queries;
}

const findings = [];

// Tables with known quoted/mixed-case columns
const mixedCaseColumns = new Map();
for (const [table, cols] of schemaTables.entries()) {
  for (const [colName, colInfo] of cols.entries()) {
    if (colInfo.isQuoted || /[A-Z]/.test(colInfo.raw)) {
      if (!mixedCaseColumns.has(table)) mixedCaseColumns.set(table, new Map());
      mixedCaseColumns.get(table).set(colName.toLowerCase(), colInfo.raw);
    }
  }
}

for (const filePath of filesToScan) {
  const content = fs.readFileSync(filePath, 'utf8');
  const queries = extractQueries(content);

  for (const q of queries) {
    // Determine line number
    const lineNum = content.slice(0, q.index).split('\n').length;
    const sql = q.sql;

    // Detect FROM/JOIN table aliases
    // e.g. FROM users u, JOIN tournament_teams t ON ...
    const aliasMap = new Map();
    const fromJoinRegex = /\b(?:FROM|JOIN)\s+([a-zA-Z0-9_]+)\s+(?:AS\s+)?([a-zA-Z0-9_]+)\b/gi;
    let fjm;
    while ((fjm = fromJoinRegex.exec(sql)) !== null) {
      const tbl = fjm[1].toLowerCase();
      const alias = fjm[2].toLowerCase();
      // Don't map SQL keywords as aliases
      if (!['on', 'where', 'left', 'right', 'inner', 'outer', 'join', 'group', 'order', 'limit', 'set'].includes(alias)) {
        aliasMap.set(alias, tbl);
      }
    }

    // Also single table FROM/UPDATE: FROM users WHERE ..., UPDATE tournaments SET ...
    const singleTableMatch = sql.match(/\b(?:FROM|UPDATE|INTO)\s+([a-zA-Z0-9_]+)\b/i);
    const defaultTable = singleTableMatch ? singleTableMatch[1].toLowerCase() : null;

    // 1. Check aliased columns: alias.col or alias."col"
    const aliasColRegex = /\b([a-zA-Z0-9_]+)\.("?[a-zA-Z0-9_]+"?)/g;
    let acm;
    while ((acm = aliasColRegex.exec(sql)) !== null) {
      const alias = acm[1].toLowerCase();
      const rawCol = acm[2];
      const unquotedCol = rawCol.replace(/"/g, '');
      const table = aliasMap.get(alias);

      if (table && schemaTables.has(table)) {
        const tableCols = schemaTables.get(table);
        const colInfo = tableCols.get(unquotedCol);

        if (!colInfo) {
          findings.push({
            file: filePath,
            line: lineNum,
            table,
            column: rawCol,
            issue: `Column '${rawCol}' does not exist on table '${table}'`,
            type: 'MISSING_COLUMN',
            snippet: acm[0],
          });
        } else {
          // Check if column is mixed-case in DB and used unquoted
          const mixedCol = mixedCaseColumns.get(table)?.get(unquotedCol.toLowerCase());
          if (mixedCol && !rawCol.startsWith('"')) {
            findings.push({
              file: filePath,
              line: lineNum,
              table,
              column: rawCol,
              issue: `Column '${rawCol}' has capital letters in schema (${mixedCol}) but is referenced unquoted '${rawCol}'`,
              type: 'UNQUOTED_IDENTIFIER',
              snippet: acm[0],
            });
          }
        }
      }
    }

    // 2. Check unquoted mixed-case identifiers in the SQL query
    // e.g. slotsTotal, orgId, roomID, roomPassword, etc.
    const allMixedCaseNames = [
      'slotsTotal', 'slotsFilled', 'roomID', 'roomPassword',
      'bannerUrl', 'logoUrl', 'isDraft', 'orgId', 'orgName',
      'orgLogo', 'orgHandle', 'orgMotto', 'gamerTag', 'riotId',
      'bgmiId', 'steamId', 'discordTag', 'kycDoc', 'socialLinks',
      'orgApplicationStatus', 'customDashboardSlug', 'orgBanner', 'orgBio',
      'registrationCloseDate', 'registrationOpenDate', 'startDate'
    ];

    // Strip single-quoted string literals from SQL before checking identifiers
    const sqlWithoutLiterals = sql.replace(/'(?:[^'\\]|\\.)*'/g, "''");

    for (const kw of allMixedCaseNames) {
      // Find occurrences of kw in sql when not inside double quotes
      const unquotedKwRegex = new RegExp(`(?<!["'])\\b${kw}\\b(?!["'])`, 'g');
      if (unquotedKwRegex.test(sqlWithoutLiterals)) {
        findings.push({
          file: filePath,
          line: lineNum,
          table: defaultTable || 'tournaments/users',
          column: kw,
          issue: `PostgreSQL identifier with capital letters '${kw}' must be double-quoted ("${kw}") in SQL`,
          type: 'UNQUOTED_IDENTIFIER',
          snippet: kw,
        });
      }
    }

    // 3. Check for specific known missing columns
    if (/\bdisplay_name\b/i.test(sql)) {
      findings.push({
        file: filePath,
        line: lineNum,
        table: 'users',
        column: 'display_name',
        issue: `users.display_name does not exist in schema`,
        type: 'MISSING_COLUMN',
        snippet: 'display_name',
      });
    }

    if (/\bplayers_per_team\b/i.test(sql) && /\btournaments\b/i.test(sql) && !/\btournament_planning_config\b/i.test(sql)) {
      findings.push({
        file: filePath,
        line: lineNum,
        table: 'tournaments',
        column: 'players_per_team',
        issue: `tournaments.players_per_team does not exist in schema`,
        type: 'MISSING_COLUMN',
        snippet: 'players_per_team',
      });
    }

    // 4. Check for unquoted orgid or orgname
    if (/\b(?:t\.|tournaments\.)orgid\b/i.test(sql)) {
      findings.push({
        file: filePath,
        line: lineNum,
        table: 'tournaments',
        column: 'orgid',
        issue: `tournaments.orgid referenced in lower case without quotes`,
        type: 'WRONG_CASE_OR_UNQUOTED',
        snippet: 't.orgid',
      });
    }
    if (/\b(?:t\.|tournaments\.)orgname\b/i.test(sql)) {
      findings.push({
        file: filePath,
        line: lineNum,
        table: 'tournaments',
        column: 'orgname',
        issue: `tournaments.orgname referenced in lower case without quotes`,
        type: 'WRONG_CASE_OR_UNQUOTED',
        snippet: 't.orgname',
      });
    }
  }
}

// Deduplicate findings by file + line + issue
const uniqueFindings = [];
const seen = new Set();
for (const f of findings) {
  const key = `${f.file}:${f.line}:${f.column}:${f.type}`;
  if (!seen.has(key)) {
    seen.add(key);
    uniqueFindings.push(f);
  }
}

fs.writeFileSync(path.resolve('scripts', 'audit-results.json'), JSON.stringify(uniqueFindings, null, 2));
console.log(`\n================ AUDIT SUMMARY: ${uniqueFindings.length} ISSUES FOUND ================`);
console.table(uniqueFindings.map(f => ({
  file: f.file,
  line: f.line,
  table: f.table,
  column: f.column,
  type: f.type,
  issue: f.issue
})));
