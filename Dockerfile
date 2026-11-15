FROM oven/bun:1.4.2 AS build
WORKDIR /app
ENV HUSKY=0
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
FROM oven/bun:1.4.2 AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3210 HUSKY=0
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile --ignore-scripts
COPY --from=build /app/dist ./dist
COPY server/production.ts ./server/production.ts
USER bun
EXPOSE 3210
CMD ["bun", "server/production.ts"]
