# Stage 1: Build the React application
FROM node:22-alpine AS build
WORKDIR /app

# Update system packages for security
RUN apk update && apk upgrade --no-cache

# Copy package files first for Docker layer caching
COPY package*.json ./

# Install ALL dependencies (devDeps required for Vite build)
RUN npm install --ignore-scripts

# Build-time ARGs (injected by Render's environment variables with defaults)
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ARG ADMIN_EMAIL
ARG ADMIN_PASSWORD

# Vite requires these at build time to embed them in the bundle
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
ENV ADMIN_EMAIL=$ADMIN_EMAIL
ENV ADMIN_PASSWORD=$ADMIN_PASSWORD
ENV NODE_ENV=production

# Copy application source
COPY . .

RUN npm run build

# Stage 2: Production runtime
FROM node:22-alpine
WORKDIR /app

# Update system packages and install tini for proper SIGTERM/SIGINT handling
RUN apk update && apk upgrade --no-cache && apk add --no-cache tini

# Install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts && npm cache clean --force

# Copy build artifacts from stage 1
COPY --from=build /app/dist ./dist
COPY --from=build /app/workers ./workers
COPY --from=build /app/server ./server
COPY --from=build /app/src/utils/iamRoles.js ./src/utils/iamRoles.js
COPY --from=build /app/server.js ./server.js

# Runtime environment (website only)
ENV NODE_ENV=production
ENV PORT=10000
ENV DISABLE_DISCORD_BOT=true

ENV RESEND_API_KEY=""
ENV RESEND_FROM_EMAIL="Match District <auth@matchdistrict.in>"

EXPOSE 10000

# Use tini as init for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the website server
CMD ["node", "server.js"]


