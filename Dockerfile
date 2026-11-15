ARG BUN_IMAGE=oven/bun:1.4.4@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d
FROM ${BUN_IMAGE} AS build
WORKDIR /app
# Do not install the Git pre-commit hook in image builds.
ENV HUSKY=0
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run typecheck && bun run build

FROM ${BUN_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3210 HUSKY=0
ARG SORTARR_REVISION=development
ENV SORTARR_REVISION=$SORTARR_REVISION
LABEL org.opencontainers.image.source="https://github.com/kylescudder/sortarr"
LABEL org.opencontainers.image.revision=$SORTARR_REVISION
COPY package.json bun.lock ./
# Skip lifecycle scripts: the Husky prepare script needs a devDependency.
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
# Owner-only migrations run from this image as a one-shot before the app starts.
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/src/server/env.ts ./src/server/env.ts
USER 501:20
EXPOSE 3210
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 CMD bun -e "const r = await fetch('http://127.0.0.1:3210/api/health'); process.exit(r.ok ? 0 : 1)"
CMD ["bun", "server/production.ts"]
