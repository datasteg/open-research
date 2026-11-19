# syntax=docker/dockerfile:1
# datasteg open-research: the Next.js standalone server (app/), the Oliveto design system (design/) and the built atlas
# (data/atlas.sqlite, written by scripts/build.py from the research archive's atlas export). The image holds titles, authors, links
# and the model's summaries and placements only: no document text, no PDFs (rule O2). Every page renders on request from
# the read-only SQLite file through node:sqlite (Node 24), so the build stage needs no data.
FROM --platform=$BUILDPLATFORM node:24.22.0-alpine AS build
WORKDIR /repo/app
RUN npm install -g pnpm@11.18.0 >/dev/null
COPY app/package.json app/pnpm-lock.yaml ./
RUN pnpm fetch
COPY design /repo/design
COPY app /repo/app
RUN pnpm install --offline --frozen-lockfile
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION NEXT_TELEMETRY_DISABLED=1
RUN BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) pnpm build

FROM node:24.22.0-alpine
WORKDIR /srv
ARG APP_VERSION=dev
ENV NODE_ENV=production PORT=8080 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1 APP_VERSION=$APP_VERSION NODE_NO_WARNINGS=1
# outputFileTracingRoot is open-research/, so the standalone server lands at app/server.js.
COPY --from=build /repo/app/.next/standalone ./
COPY --from=build /repo/app/.next/static ./app/.next/static
COPY --from=build /repo/app/public ./app/public
# The atlas: one read-only SQLite file (FTS5 search inside), read by app/lib/db.ts from DATA_DIR.
COPY data/atlas.sqlite data/meta.json ./data/
ENV DATA_DIR=/srv/data
# One uid per datasteg app: trade-flow 10070, money-flow 10071, (retired) 10072, global-network 10073, open-research 10074.
USER 10074:10074
EXPOSE 8080
CMD ["node", "app/server.js"]
