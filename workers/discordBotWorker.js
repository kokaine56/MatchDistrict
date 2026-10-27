import { spawn } from 'child_process';
import process from 'node:process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FALLBACK_DISCORD_TOKEN = 'MTU2NDYyNTc0OTU2NTI1MTcxNQ.G0RI3J.gV4ZgTH7vqhek8lEMmp3lQY57JXgAY82N-qY24';

let botProcess = null;
let restartTimeout = null;
let restartAttempts = 0;
let isShuttingDown = false;
const MAX_RESTART_ATTEMPTS = 10;

/**
 * Resolves the Discord Bot Token from environment, candidate .env files, or fallback.
 * @returns {string}
 */
function resolveDiscordToken() {
  let token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (token && token !== 'undefined' && token !== 'null') {
    return token.replace(/^["']|["']$/g, '').trim();
  }

  // Check candidate .env file locations
  const candidateEnvPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../bot/discord/.env'),
  ];

  for (const envPath of candidateEnvPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/^DISCORD_BOT_TOKEN=(.*)$/m);
        if (match && match[1]) {
          token = match[1].trim().replace(/^["']|["']$/g, '').trim();
          if (token) {
            process.env.DISCORD_BOT_TOKEN = token;
            return token;
          }
        }
      } catch {
        // Continue to next candidate
      }
    }
  }

  if (FALLBACK_DISCORD_TOKEN) {
    process.env.DISCORD_BOT_TOKEN = FALLBACK_DISCORD_TOKEN;
    return FALLBACK_DISCORD_TOKEN;
  }

  return '';
}

/**
 * Starts the MatchDistrict Discord Welcome Bot as an isolated background worker.
 * Runs concurrently alongside MatchDistrict server and background workers.
 *
 * @returns {import('child_process').ChildProcess|null}
 */
export function startDiscordBotWorker() {
  if (botProcess && !botProcess.killed) {
    return botProcess;
  }

  const token = resolveDiscordToken();
  if (!token) {
    console.log('🤖 [DISCORD BOT] DISCORD_BOT_TOKEN not configured in environment. Discord Welcome Bot is disabled.');
    return null;
  }

  const botScriptPath = path.resolve(__dirname, '../bot/discord/index.js');
  const botDir = path.resolve(__dirname, '../bot/discord');

  if (!fs.existsSync(botScriptPath)) {
    console.warn(`⚠️ [DISCORD BOT] Bot entry file not found at: ${botScriptPath}`);
    return null;
  }

  console.log('🤖 [DISCORD BOT] Starting MatchDistrict Discord Welcome Bot process...');

  try {
    const child = spawn(process.execPath, [botScriptPath], {
      cwd: botDir,
      env: {
        ...process.env,
        DISCORD_BOT_TOKEN: token,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    botProcess = child;

    child.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    child.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    child.on('error', (err) => {
      console.error('❌ [DISCORD BOT] Worker process failed to spawn:', err.message);
      botProcess = null;
    });

    child.on('exit', (code, signal) => {
      botProcess = null;
      if (signal) {
        console.log(`🤖 [DISCORD BOT] Worker stopped via signal: ${signal}`);
        return;
      }

      if (code !== 0 && code !== null) {
        console.warn(`⚠️ [DISCORD BOT] Worker exited with code: ${code}.`);
        if (!isShuttingDown && restartAttempts < MAX_RESTART_ATTEMPTS) {
          restartAttempts++;
          const delay = Math.min(30000, 2000 * Math.pow(1.5, restartAttempts));
          console.log(`🔄 [DISCORD BOT] Scheduling auto-restart attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS} in ${Math.round(delay / 1000)}s...`);
          clearTimeout(restartTimeout);
          restartTimeout = setTimeout(() => {
            startDiscordBotWorker();
          }, delay);
        }
      } else {
        console.log('🤖 [DISCORD BOT] Worker exited cleanly.');
      }
    });

    // Gracefully clean up child process when parent server terminates
    const cleanup = () => {
      isShuttingDown = true;
      clearTimeout(restartTimeout);
      if (botProcess && !botProcess.killed) {
        try {
          botProcess.kill('SIGTERM');
        } catch {
          // Ignore kill failures during exit
        }
      }
    };

    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
    process.once('exit', cleanup);

    return child;
  } catch (err) {
    console.error('❌ [DISCORD BOT] Failed to start Discord bot worker:', err.message);
    return null;
  }
}
