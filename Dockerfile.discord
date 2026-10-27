# MatchDistrict Discord Bot Dockerfile
# Production-ready container image for the MatchDistrict Discord Welcome Bot
FROM node:22-alpine

WORKDIR /app

# Update system packages for security and install tini for proper SIGINT/SIGTERM handling
RUN apk update && apk upgrade --no-cache && apk add --no-cache tini

# Copy package files first for efficient Docker layer caching
COPY bot/discord/package*.json ./

# Install only production dependencies
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

# Copy Discord Bot source code
COPY bot/discord/ ./

# Runtime environment
ENV NODE_ENV=production

# The bot token should be passed at runtime:
# e.g.: docker run -d -e DISCORD_BOT_TOKEN="your_token" matchdistrict-discord
ENV DISCORD_BOT_TOKEN=""

# Use tini as init process to properly forward signals
ENTRYPOINT ["/sbin/tini", "--"]

# Start the Discord bot
CMD ["node", "index.js"]
