// scripts/extract-endpoints.mjs
// Read-only offline script to parse all HTTP route handlers in server.js

import fs from 'fs';
import path from 'path';

const serverCode = fs.readFileSync('server.js', 'utf8');
const lines = serverCode.split('\n');

const routes = [];

// Regexes to capture routing blocks
// if ((urlPath === '...' || req.url === '...' || req.url.startsWith(...) || urlPath.match(...)) && req.method === '...')
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Pattern 1: match / urlPath / req.url with method
  const routeMatch = line.match(/(?:if\s*\((?:const\s+\w+\s*=\s*)?|\s+const\s+(\w+Match)\s*=\s*(?:urlPath|req\.url)\.match\(([^)]+)\);)/);
  
  if (line.includes('req.method') || line.includes('urlPath ===') || line.includes("req.url === '") || line.includes('req.url.startsWith(') || line.includes('.match(')) {
    // Check if this line or next few lines define a route
    let block = lines.slice(i, Math.min(lines.length, i + 8)).join(' ');
    
    // Method detection
    const methodMatch = block.match(/req\.method\s*===?\s*['"]([A-Z]+)['"]/);
    const method = methodMatch ? methodMatch[1] : (block.includes('req.method') ? 'ANY' : null);
    
    // Path detection
    let pathPattern = null;
    const exactMatch = block.match(/(?:urlPath|req\.url)\s*===?\s*['"]([^'"]+)['"]/);
    const startsWithMatch = block.match(/(?:urlPath|req\.url)\.startsWith\(['"]([^'"]+)['"]\)/);
    const regexMatch = block.match(/(?:urlPath|req\.url)\.match\(\/([^/]+(?:\/[^/]+)*)\/[a-z]*\)/);
    
    if (exactMatch) pathPattern = exactMatch[1];
    else if (regexMatch) pathPattern = '/' + regexMatch[1].replace(/\\\//g, '/').replace(/\^|\$/g, '');
    else if (startsWithMatch) pathPattern = startsWithMatch[1] + '*';
    
    if (method && pathPattern) {
      // Look forward up to 80 lines for auth, roles, ownership, tables
      const handlerLines = lines.slice(i, Math.min(lines.length, i + 100));
      const handlerText = handlerLines.join('\n');
      
      const hasAuth = /getAuthUser|authenticateDevice|requireAdmin|requireOrganizer|resolveAuthUser|verifyToken/i.test(handlerText);
      const authType = /authenticateDevice/.test(handlerText) ? 'Device API Key' :
                       /resolveAuthUser/.test(handlerText) ? 'JWT or Device Key' :
                       /getAuthUser|requireAdmin|requireOrganizer/.test(handlerText) ? 'JWT Bearer' : 'None';
                       
      const roleCheck = /hasRole\(.*ADMIN\)|requireAdmin|hasRoleClearance\(.*ADMIN\)/i.test(handlerText) ? 'Admin' :
                        /requireApprovedOrganizer|requireOrganizer|'organiser' = ANY/i.test(handlerText) ? 'Organizer' :
                        hasAuth ? 'Authenticated User' : 'Public / None';
                        
      const ownershipCheck = /isTournamentOrganizer|t\.orgId ===|user_id ===|leader_user_id|m\.user_id ===/i.test(handlerText);
      
      // Tables accessed
      const tableMatches = [...handlerText.matchAll(/(?:FROM|INTO|UPDATE|JOIN)\s+([a-zA-Z0-9_]+)/gi)].map(m => m[1].toLowerCase());
      const tables = [...new Set(tableMatches.filter(t => !['select', 'where', 'set', 'values', 'limit', 'order', 'left', 'right', 'inner', 'outer', 'on', 'as', 'and', 'or'].includes(t)))];
      
      // Sensitive fields
      const sensitiveFields = [];
      if (/roomID|roomPassword|room_identifier|room_password/i.test(handlerText)) sensitiveFields.push('Room ID/Password');
      if (/\.email\b/i.test(handlerText) && !/maskUserEmail/i.test(handlerText)) sensitiveFields.push('Email');
      if (/\.phone\b/i.test(handlerText)) sensitiveFields.push('Phone');
      if (/password_hash|admin_totp_secret|api_key_hash/i.test(handlerText)) sensitiveFields.push('Hashes/Secrets');
      if (/payment_screenshot_url|screenshot_url/i.test(handlerText)) sensitiveFields.push('Payment Screenshot');
      
      routes.push({
        line: i + 1,
        method,
        path: pathPattern,
        authRequired: hasAuth,
        authType,
        roleCheck,
        ownershipCheck,
        tables,
        sensitiveFields: sensitiveFields.length > 0 ? sensitiveFields.join(', ') : 'None'
      });
    }
  }
}

// Deduplicate by line
const uniqueRoutes = [];
const seenLines = new Set();
for (const r of routes) {
  if (!seenLines.has(r.line)) {
    seenLines.add(r.line);
    uniqueRoutes.push(r);
  }
}

fs.writeFileSync('scripts/endpoints-extracted.json', JSON.stringify(uniqueRoutes, null, 2));
console.log(`Extracted ${uniqueRoutes.length} route definitions from server.js`);
