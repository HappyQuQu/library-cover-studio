FROM node:22.22.0-bookworm-slim AS builder
RUN apt-get update -o Acquire::Retries=3 \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm install -g pnpm@10.28.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY web/package.json ./web/package.json
RUN pnpm install --frozen-lockfile --filter ./backend...
COPY backend ./backend
COPY CHANGELOG.md ./CHANGELOG.md
RUN pnpm --filter ./backend build

FROM node:22.22.0-bookworm-slim
RUN apt-get update -o Acquire::Retries=3 \
    && apt-get install -y --no-install-recommends fonts-noto-cjk fontconfig \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
ENV NODE_ENV=production
# Preserve pnpm workspace symlinks and built-in poster assets.
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/backend/node_modules ./node_modules
COPY --from=builder /app/backend/package.json ./package.json
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/src/template ./src/template
RUN mkdir -p data uploads
EXPOSE 3000
CMD ["node", "dist/server.js"]
