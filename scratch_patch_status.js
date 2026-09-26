const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let content = fs.readFileSync(serverPath, 'utf8');

const target1 = "tournamentId, t.title, t.game, 'live', 'bg-primary', 'LIVE', now.toISOString()";
const replace1 = "tournamentId, t.title, t.game, 'upcoming', 'bg-primary', 'UPCOMING', now.toISOString()";

if (content.includes(target1)) {
  content = content.replace(target1, replace1);
  console.log('Successfully updated Admin creation status in server.js');
} else {
  console.error('Target 1 not found in server.js');
}

const target2 = '"UPDATE tournaments SET status = \'live\' WHERE id = $1"';
const replace2 = '"UPDATE tournaments SET status = \'upcoming\' WHERE id = $1"';

if (content.includes(target2)) {
  content = content.replace(target2, replace2);
  console.log('Successfully updated auto_close_registration status in server.js');
} else {
  console.error('Target 2 not found in server.js');
}

fs.writeFileSync(serverPath, content, 'utf8');
