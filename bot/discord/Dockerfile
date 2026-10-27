# MatchDistrict Discord Bot Dockerfile (context: bot/discord)
FROM node:22-alpine

WORKDIR /app

# Update system packages for security and install tini for proper SIGINT/SIGTERM handling
RUN apk update && apk upgrade --no-cache && apk add --no-cache tini

# Copy package files first for efficient Docker layer caching
COPY package*.json ./

# Install only production dependencies
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

# Copy Discord Bot source code
COPY . ./

# Runtime environment
ENV NODE_ENV=production
ENV DISCORD_BOT_TOKEN=""

# Use tini as init process to properly forward signals
ENTRYPOINT ["/sbin/tini", "--"]

# Start the Discord bot
CMD ["node", "index.js"]
