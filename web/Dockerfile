# syntax=docker/dockerfile:1.7
# Production image for the Lesson Plan web app (Next.js standalone output).
# Build:  docker build -t lessonplan-web ./web
# Run:    see ../docker-compose.prod.yml

FROM node:26-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ---- dependencies ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY scripts/copy-pdf-worker.mjs ./scripts/copy-pdf-worker.mjs
# postinstall runs "prisma generate" and copies the pdf.js worker into public/
RUN npm ci

# ---- build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The pdf.js worker is git-ignored (postinstall copies it), so the repository's public/
# folder copied above does not contain it. Copy it again here or the book viewer 404s.
RUN node scripts/copy-pdf-worker.mjs
ENV NEXT_TELEMETRY_DISABLED=1
# A placeholder is enough for the build; real values come from the runtime environment.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV AUTH_SECRET="build-time-placeholder-secret-not-used-at-runtime"
RUN npm run build

# ---- prisma tooling (CLI + tsx for the seed), kept separate so the runtime stays small ----
FROM base AS tooling
COPY prisma ./prisma
# Pinned to the versions in package-lock.json; bump together with the app.
RUN printf "{\"name\":\"tools\",\"private\":true,\"type\":\"commonjs\"}" > package.json  && npm install --no-audit --no-fund --omit=dev prisma@6.19.3 @prisma/client@6.19.3 tsx@4.23.15 bcryptjs@3.0.3  && npx prisma generate

# ---- runtime ----
FROM base AS runner
# pg_dump for nightly backups. Must be at least the server's major version (Railway runs
# PostgreSQL 18); a newer client dumps older servers fine. Bump when the database is upgraded.
RUN apk add --no-cache postgresql18-client
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/content ./content
# Prisma schema + migrations + seed, and a self-contained tool install under /app/tools
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=tooling --chown=nextjs:nodejs /app/node_modules ./tools/node_modules
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
