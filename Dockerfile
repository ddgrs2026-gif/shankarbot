# ─── Stage 1: Build admin panel ───────────────────────────────────────────
FROM node:20-alpine AS admin-builder

WORKDIR /app/admin-panel
COPY admin-panel/package*.json ./
RUN npm ci --frozen-lockfile

COPY admin-panel/ ./

# Build args for Vite env vars
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_SERVICE_KEY
ARG VITE_BOT_URL

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_SERVICE_KEY=$VITE_SUPABASE_SERVICE_KEY
ENV VITE_BOT_URL=$VITE_BOT_URL

RUN npm run build

# ─── Stage 2: Bot backend ─────────────────────────────────────────────────
FROM node:20-alpine AS bot

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --frozen-lockfile --omit=dev

# Copy source files
COPY bot-meta-aiy.js ./
COPY database-supabase.js ./
COPY services/ ./services/

# Copy built admin panel static files to serve
COPY --from=admin-builder /app/admin-panel/dist ./public

# Serve admin panel as static files from the bot
EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "bot-meta-aiy.js"]
