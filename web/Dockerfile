FROM node:24.22.1-bookworm-slim AS builder

WORKDIR /app
RUN npm install -g pnpm@10.28.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY web/package.json ./web/package.json
RUN pnpm install --frozen-lockfile --filter ./web...
COPY web ./web
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

# 构建
RUN pnpm --filter ./web build

# 生产镜像
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/web/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY web/nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
