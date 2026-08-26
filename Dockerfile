FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci
COPY client client
COPY server server
RUN npm run build -w client
RUN npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5174
# codeforcesClient.js shells out to curl to get past Cloudflare (Node's own
# fetch and headless Chromium are both blocked there) — node:22-slim doesn't
# ship it by default.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/server server
COPY --from=build /app/client/dist client/dist
COPY package.json package-lock.json ./

EXPOSE 5174
CMD ["node", "server/src/index.js"]
