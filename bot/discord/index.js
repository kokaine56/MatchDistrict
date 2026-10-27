import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import process from 'node:process';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits, Events, Partials } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables across standard locations:
// 1. Current working directory .env (e.g. when run from project root)
// 2. bot/discord/.env (bot-local config)
// 3. Project root .env (two directories up)
const candidateEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '../../.env'),
];

for (const envPath of candidateEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

/**
 * Clean and retrieve the Discord Bot Token from environment variables.
 * Never prints or leaks the token to logs or errors.
 */
function getBotToken() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (typeof token !== 'string') return '';
  return token.trim().replace(/^["']|["']$/g, '').trim();
}

/**
 * Formats the official MatchDistrict welcome message for a new member.
 * @param {string} username - Personalized name of the member.
 * @returns {string} The formatted welcome message.
 */
export function buildWelcomeMessage(username) {
  return `Hey ${username}! Welcome to MatchDistrict!

We're glad to have you join our gaming community.

Discover tournaments, compete with other players, and stay updated with the latest esports events.

Visit our website: https://matchdistrict.in

Check out the server's rules, announcements, and tournament channels to get started.

Good luck, and have fun!

— Team MatchDistrict`;
}

/**
 * Initialize Discord Client with minimal required intents and partials.
 * Only GatewayIntentBits.Guilds and GatewayIntentBits.GuildMembers (Server Members Intent)
 * are requested. Administrator permission is NOT requested or required.
 */
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // Privileged Server Members Intent
  ],
  partials: [Partials.GuildMember, Partials.User],
});

/**
 * Application Slash Commands definition
 */
const COMMANDS = [
  {
    name: 'ping',
    description: 'Check MatchDistrict bot response time and WebSocket latency',
  },
];

// Bot ready event listener
client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[Discord Bot] 🚀 Logged in as ${readyClient.user.tag} (ID: ${readyClient.user.id})`);
  console.log(`[Discord Bot] 🎮 MatchDistrict Welcome Bot is active across ${readyClient.guilds.cache.size} server(s).`);

  try {
    // Automatically register /ping slash command with Discord API
    await readyClient.application.commands.set(COMMANDS);
    console.log('[Discord Bot] ⚡ Registered /ping slash command successfully.');
  } catch (error) {
    console.warn('[Discord Bot] ⚠️ Could not register /ping slash command:', error.message);
  }
});

// Handle Slash Commands (Interactions)
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    try {
      const sent = await interaction.reply({
        content: '🏓 Pinging...',
        fetchReply: true,
      });

      const roundtripLatency = sent.createdTimestamp - interaction.createdTimestamp;
      const wsLatency = Math.round(interaction.client.ws.ping);

      await interaction.editReply(
        `🏓 **Pong!**\n• Latency: **${roundtripLatency}ms**\n• WebSocket API: **${wsLatency >= 0 ? wsLatency : 0}ms**`
      );
    } catch (error) {
      console.warn('[Discord Bot] ⚠️ Error executing /ping command:', error.message);
    }
  }
});

// Listen for new members joining the server
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    // Ignore bot accounts to prevent loopbacks and spam
    if (!member || member.user?.bot) {
      return;
    }

    const username = member.user?.globalName || member.user?.username || member.displayName || 'Gamer';
    const userTag = member.user?.tag || member.user?.username || member.id;
    const guildName = member.guild?.name || 'MatchDistrict Server';

    console.log(`[Discord Bot] 👤 New member joined "${guildName}": ${userTag} (${member.id})`);

    const welcomeMessage = buildWelcomeMessage(username);

    // Attempt to deliver the welcome message via Direct Message (DM)
    await member.send(welcomeMessage);

    console.log(`[Discord Bot] ✅ Successfully sent welcome DM to ${userTag} (${member.id})`);
  } catch (error) {
    const userTag = member?.user?.tag || member?.user?.username || member?.id || 'Unknown';

    // Handle members with DMs disabled (Discord error code 50007: "Cannot send messages to this user")
    if (error?.code === 50007) {
      console.warn(`[Discord Bot] ⚠️ Could not send welcome DM to ${userTag} (${member?.id}): User has direct messages disabled or has blocked the bot (Error 50007).`);
    } else {
      console.warn(`[Discord Bot] ⚠️ Could not send welcome DM to ${userTag} (${member?.id}): ${error.message}`);
    }
    // Failed DM must never crash or stop the bot
  }
});

// Client connection and shard error handlers
client.on(Events.Error, (error) => {
  console.error('[Discord Bot] ❌ Discord client encountered an error:', error.message);
});

client.on(Events.ShardError, (error, shardId) => {
  console.error(`[Discord Bot] ❌ Connection error on shard ${shardId}:`, error.message);
});

/**
 * Start the Discord bot using the configured DISCORD_BOT_TOKEN.
 * @param {string} [tokenOverride] - Optional token override.
 * @returns {Promise<Client|null>}
 */
export async function startBot(tokenOverride) {
  const token = tokenOverride || getBotToken();

  if (!token) {
    console.error('[Discord Bot] ❌ DISCORD_BOT_TOKEN is not configured.');
    console.error('[Discord Bot] ℹ️ Please add DISCORD_BOT_TOKEN=your_token to your .env file.');
    console.error('[Discord Bot] ℹ️ Remember to enable "SERVER MEMBERS INTENT" in the Discord Developer Portal:');
    console.error('[Discord Bot]    https://discord.com/developers/applications -> [Your App] -> Bot -> Privileged Gateway Intents -> Server Members Intent.');
    return null;
  }

  try {
    console.log('[Discord Bot] 🔄 Connecting to Discord Gateway...');
    await client.login(token);
    return client;
  } catch (error) {
    console.error('[Discord Bot] ❌ Connection failed:');
    if (error.message?.includes('Privileged intent') || error.message?.includes('disallowed intent')) {
      console.error('[Discord Bot] 🚨 Privileged Gateway Intent missing! You MUST enable "SERVER MEMBERS INTENT" under Bot -> Privileged Gateway Intents in the Discord Developer Portal.');
    } else if (error.message?.includes('An invalid token')) {
      console.error('[Discord Bot] 🚨 The provided DISCORD_BOT_TOKEN is invalid. Please double-check your bot token.');
    } else {
      console.error(`[Discord Bot] 🚨 ${error.message}`);
    }
    throw error;
  }
}

// Graceful shutdown handling
let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Discord Bot] Received ${signal}. Shutting down bot gracefully...`);
  try {
    await client.destroy();
    console.log('[Discord Bot] Disconnected from Discord.');
  } catch {
    // Suppress destroy errors on exit
  }
  process.exit(0);
}

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Auto-start when executed as the main process script
const isMainModule = process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMainModule) {
  startBot().catch(() => {
    // If running as standalone script, exit on login error so supervisor knows it failed
    process.exit(1);
  });
}
