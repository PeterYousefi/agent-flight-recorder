# Shared Linux image for API, worker and migration jobs. No Azure provisioning.
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build
ENV COREPACK_HOME=/opt/corepack
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# Same-origin frontend when served behind the public API's HTTPS ingress.
ENV VITE_API_BASE_URL=""
ARG VITE_PUBLIC_DEMO=false
ENV VITE_PUBLIC_DEMO=$VITE_PUBLIC_DEMO
ARG VITE_GRAFANA_URL=""
ARG VITE_PROMETHEUS_URL=""
ENV VITE_GRAFANA_URL=$VITE_GRAFANA_URL
ENV VITE_PROMETHEUS_URL=$VITE_PROMETHEUS_URL
ARG BUILD_NODE_OPTIONS="--max-old-space-size=4096"
RUN NODE_OPTIONS="$BUILD_NODE_OPTIONS" pnpm --workspace-concurrency=1 --recursive run build

FROM node:22-bookworm-slim AS runtime
ENV COREPACK_HOME=/opt/corepack
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
COPY --from=build --chown=node:node /app /app
# Generate the database engine for the runtime architecture after native compilation.
RUN pnpm --filter @afr/persistence exec prisma generate
USER node
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
