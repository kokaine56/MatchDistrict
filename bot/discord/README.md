# MatchDistrict Discord Bot

Production-ready Discord Bot for the MatchDistrict gaming community.
- Automatically sends a personalized welcome direct message (DM) to every new member who joins the Discord server.
- Supports the `/ping` slash command to check bot health and latency.

---

## Features

- **Automated Welcome DM**: Listens for the `guildMemberAdd` event and welcomes every new player instantly.
- **Personalized Messaging**: Mentions the player by their display name or username.
- **Fail-Safe & Non-Blocking**: If a member has direct messages disabled or blocks bots (Discord error `50007`), the error is logged without crashing or disrupting the bot.
- **Bot Filtering**: Ignores bot accounts to avoid messaging loops and spam.
- **Slash Commands**:
  - `/ping`: Check roundtrip latency and WebSocket API response time.
- **Minimal Permissions & Privileges**: Requires only `Guilds` and `GuildMembers` intents. **Zero Administrator permissions required.**
- **Dual Execution Modes**:
  1. **Integrated with MatchDistrict Server**: Automatically launched by `server.js` when the website starts.
  2. **Standalone Mode**: Can run independently as a standalone background service.

---

## Slash Commands

| Command | Description | Response |
|---|---|---|
| `/ping` | Measures bot roundtrip response time and Discord WebSocket API latency. | `🏓 Pong! • Latency: 42ms • WebSocket API: 25ms` |

---

## Setup & Discord Developer Portal Configuration

### 1. Create Bot & Copy Token

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and name it (e.g. `MatchDistrict Bot`).
3. Navigate to the **Bot** tab on the left sidebar.
4. Click **Reset Token** and copy your bot token securely.

### 2. Enable Privileged Gateway Intents (CRITICAL)

To receive the `guildMemberAdd` event, Discord requires the **Server Members Intent**:

1. Under the **Bot** tab, scroll down to the **Privileged Gateway Intents** section.
2. Toggle **ON** the switch for **SERVER MEMBERS INTENT**.
3. Click **Save Changes** at the bottom of the page.

> ⚠️ **Warning**: If this intent is not enabled, the bot will fail to start or cannot detect when new members join.

### 3. Generate Invite Link

1. Go to **OAuth2** -> **OAuth2 URL Generator**.
2. Under **Scopes**, select:
   - `bot`
   - `applications.commands` (required for `/ping` slash command)
3. Under **Bot Permissions**, select:
   - `Send Messages`
   - `Read Message History`
   - *(Note: Do NOT select Administrator)*
4. Copy the generated URL at the bottom and open it in your browser to invite the bot to your MatchDistrict Discord server.

---

## Configuration

Add your bot token to the main project `.env` file (or `bot/discord/.env`):

```env
DISCORD_BOT_TOKEN=your_copied_bot_token_here
```

---

## Running the Bot

### Running Automatically with MatchDistrict Website

When MatchDistrict's server runs (`npm start` or `node server.js`), it will automatically detect `DISCORD_BOT_TOKEN` in `.env` and start the Discord bot process alongside the web server and background workers.

```bash
npm start
```

### Running Standalone

To run the bot independently:

```bash
# From project root:
npm run bot

# Or inside bot/discord:
cd bot/discord
npm install
npm start
```

During development with auto-reload:
```bash
npm run dev
```

### Running with Docker

The Discord bot can be built and deployed independently using its dedicated Dockerfile (`Dockerfile.discord` or `discord.dockerfile`):

#### Build and run from repository root:
```bash
# Build the image using Dockerfile.discord (or discord.dockerfile)
docker build -f Dockerfile.discord -t matchdistrict-discord-bot .

# Run the container with your bot token
docker run -d \
  --name matchdistrict-discord-bot \
  -e DISCORD_BOT_TOKEN="your_bot_token_here" \
  --restart unless-stopped \
  matchdistrict-discord-bot
```

#### Build and run from `bot/discord/`:
```bash
cd bot/discord
docker build -t matchdistrict-discord-bot .
docker run -d \
  --name matchdistrict-discord-bot \
  -e DISCORD_BOT_TOKEN="your_bot_token_here" \
  --restart unless-stopped \
  matchdistrict-discord-bot
```

---

## Troubleshooting

| Issue | Cause | Solution |
|---|---|---|
| `DISCORD_BOT_TOKEN is not configured` | Environment variable missing | Set `DISCORD_BOT_TOKEN` in the root `.env` file. |
| `[Discord Bot] 🚨 Privileged Gateway Intent missing` | Server Members Intent not enabled | Enable **Server Members Intent** under Privileged Gateway Intents in the Discord Developer Portal. |
| `[Discord Bot] 🚨 The provided DISCORD_BOT_TOKEN is invalid` | Bad token | Re-generate or copy the token from the Developer Portal. |
| `Could not send welcome DM (Error 50007)` | User has DMs disabled | Normal Discord behavior. The user's privacy settings block DMs from server members. The bot logs this and continues running. |
| `/ping` command does not show up in Discord | Missing `applications.commands` scope | Re-invite the bot using the URL generator with both `bot` and `applications.commands` scopes checked. |
