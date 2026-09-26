const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

// 1. Update /api/tournaments/:id/roadmap/generate
const generateTarget = `        for (const m of (matches || [])) {
          await dbClient.query(\`
            INSERT INTO tournament_matches (id, room_id, group_id, day_id, tournament_id, match_number, start_time, end_time, status, round_id, map, id_pwd_release_time, next_match_id, next_round_id, teams_advancing)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          \`, [m.id, m.room_id || null, m.group_id || null, m.day_id || null, m.tournament_id, m.match_number, m.start_time, m.end_time || '', m.status || 'PENDING', m.round_id || null, m.map || 'Erangel', m.id_pwd_release_time || null, m.next_match_id || null, m.next_round_id || null, m.teams_advancing || null]);
        }`;

const generateReplacement = `        // Phase 1: Insert all matches with next_match_id = NULL
        for (const m of (matches || [])) {
          await dbClient.query(\`
            INSERT INTO tournament_matches (id, room_id, group_id, day_id, tournament_id, match_number, start_time, end_time, status, round_id, map, id_pwd_release_time, next_round_id, teams_advancing)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          \`, [m.id, m.room_id || null, m.group_id || null, m.day_id || null, m.tournament_id, m.match_number, m.start_time, m.end_time || '', m.status || 'PENDING', m.round_id || null, m.map || 'Erangel', m.id_pwd_release_time || null, m.next_round_id || null, m.teams_advancing || null]);
        }

        // Phase 2: Populate progression links (next_match_id) now that destination matches exist
        for (const m of (matches || [])) {
          if (m.next_match_id) {
            await dbClient.query(\`
              UPDATE tournament_matches
              SET next_match_id = $1
              WHERE id = $2
            \`, [m.next_match_id, m.id]);
          }
        }`;

// Standardize CRLF before checking
content = content.replace(/\r\n/g, '\n');
const normalizedGenerateTarget = generateTarget.replace(/\r\n/g, '\n');

if (content.includes(normalizedGenerateTarget)) {
  content = content.replace(normalizedGenerateTarget, generateReplacement);
  console.log('✅ Successfully updated /roadmap/generate match insertion in server.js');
} else {
  console.error('❌ Could not find /roadmap/generate target in server.js');
}

// 2. Update /api/tournaments/:id/roadmap/save
const saveTarget = `          for (const m of matches) {
            await dbClient.query(\`
              INSERT INTO tournament_matches (id, room_id, group_id, day_id, tournament_id, match_number, start_time, end_time, status, round_id, map, id_pwd_release_time)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            \`, [
              m.id || \`MAT-\${crypto.randomBytes(8).toString('hex')}\`,
              m.room_id,
              m.group_id || null,
              m.day_id,
              tId,
              m.match_number || 1,
              m.start_time || '10:00',
              m.end_time || '10:30',
              m.status || 'PENDING',
              m.round_id || null,
              m.map || 'Erangel',
              m.id_pwd_release_time || null
            ]);
          }`;

const saveReplacement = `          // Phase 1: Insert all matches with next_match_id = NULL
          for (const m of matches) {
            await dbClient.query(\`
              INSERT INTO tournament_matches (id, room_id, group_id, day_id, tournament_id, match_number, start_time, end_time, status, round_id, map, id_pwd_release_time, next_round_id, teams_advancing)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            \`, [
              m.id || \`MAT-\${crypto.randomBytes(8).toString('hex')}\`,
              m.room_id || null,
              m.group_id || null,
              m.day_id || null,
              tId,
              m.match_number || 1,
              m.start_time || '10:00',
              m.end_time || '10:30',
              m.status || 'PENDING',
              m.round_id || null,
              m.map || 'Erangel',
              m.id_pwd_release_time || null,
              m.next_round_id || null,
              m.teams_advancing || null
            ]);
          }

          // Phase 2: Populate progression links (next_match_id)
          for (const m of matches) {
            if (m.next_match_id) {
              await dbClient.query(\`
                UPDATE tournament_matches
                SET next_match_id = $1
                WHERE id = $2
              \`, [m.next_match_id, m.id]);
            }
          }`;

const normalizedSaveTarget = saveTarget.replace(/\r\n/g, '\n');
if (content.includes(normalizedSaveTarget)) {
  content = content.replace(normalizedSaveTarget, saveReplacement);
  console.log('✅ Successfully updated /roadmap/save match insertion in server.js');
} else {
  console.error('❌ Could not find /roadmap/save target in server.js');
}

// Convert back to CRLF
content = content.replace(/\n/g, '\r\n');
fs.writeFileSync(serverPath, content, 'utf8');
