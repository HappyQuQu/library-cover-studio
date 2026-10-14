FROM node:22.22.0-bookworm-slim AS builder
RUN apt-get update -o Acquire::Retries=3 \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm install -g pnpm@10.28.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY web/package.json ./web/package.json
RUN pnpm install --frozen-lockfile
COPY backend ./backend
COPY web ./web
COPY CHANGELOG.md ./CHANGELOG.md
ENV VITE_API_URL=/api
RUN pnpm build
RUN pnpm --filter ./backend deploy --prod --legacy /runtime

FROM node:22.22.0-bookworm-slim
RUN apt-get update -o Acquire::Retries=3 \
    && apt-get install -y --no-install-recommends fonts-noto-cjk fontconfig \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
ENV NODE_ENV=production PORT=8080 LCS_DATA_DIR=/app/data LCS_WEB_DIR=/app/web
COPY --from=builder /runtime/node_modules ./node_modules
COPY --from=builder /runtime/package.json ./package.json
COPY --from=builder /runtime/dist ./dist
COPY --from=builder /runtime/src/template ./src/template
COPY --from=builder /app/web/dist /app/web
RUN mkdir -p /app/data
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
