// scripts/build-audit-docs.mjs
// Read-only audit generator for MatchDistrict
import fs from 'fs';
import path from 'path';

// 1. Read AUDIT_FULL.md
const auditFullContent = fs.readFileSync('AUDIT_FULL.md', 'utf8');

// Parse all findings matching '### (SCH|EP|AUTH|SENS|PAY|LIFE|TEAM|SEC|FE|APP|PERF|CODE)-\d{3} \| (critical|high|medium|low) \| (.+)'
const findingRegex = /###\s+([A-Z]+-\d{3})\s*\|\s*(critical|high|medium|low)\s*\|\s*(.+)/g;
const findings = [];
let fMatch;
while ((fMatch = findingRegex.exec(auditFullContent)) !== null) {
  findings.push({
    id: fMatch[1],
    severity: fMatch[2],
    title: fMatch[3].trim()
  });
}

console.log(`Parsed ${findings.length} findings from AUDIT_FULL.md`);

const severityCounts = {
  critical: findings.filter(f => f.severity === 'critical').length,
  high: findings.filter(f => f.severity === 'high').length,
  medium: findings.filter(f => f.severity === 'medium').length,
  low: findings.filter(f => f.severity === 'low').length,
  total: findings.length
};

console.log('Severity counts:', severityCounts);

// Build markdown table for Section 13
const indexRows = findings.map(f => `| \`${f.id}\` | \`${f.severity}\` | ${f.title} |`).join('\n');
const updatedAuditFull = auditFullContent.replace('<!--INDEXROWS-->', indexRows);
fs.writeFileSync('AUDIT_FULL.md', updatedAuditFull, 'utf8');
console.log('Updated AUDIT_FULL.md with master finding index.');
