# Frontend image (PROJECT_SPEC.md section 10): multi-stage node:20-alpine.
#
# NEXT_PUBLIC_API_URL must be a BUILD ARG, not a runtime env var: Next.js inlines
# NEXT_PUBLIC_* into the client bundle at build time, so it has to be known when
# `next build` runs. It also must be a URL the *browser* can reach (the client
# fetches run on the user's host), so in compose it is http://localhost:8000 —
# NOT the http://backend:8000 compose service name, which only resolves inside the
# compose network, not from the browser.

# ---- build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Production-only deps (drops typescript/eslint/@types), keeping the runtime slim.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Built app + config.
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 3000
CMD ["npm", "run", "start"]
