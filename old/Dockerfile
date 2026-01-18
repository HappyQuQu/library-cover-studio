# LibraryCoverStudio - 多阶段构建 Dockerfile

# 安装 pnpm
FROM node:18-alpine AS base
RUN npm install -g pnpm@8.15.0

# 多阶段构建 - 前端
FROM base AS frontend-builder

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY web/package.json ./web/

RUN pnpm install --frozen-lockfile

COPY web/ ./web/
RUN pnpm --filter web build

# 多阶段构建 - 后端
FROM base AS backend-builder

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY backend/package.json ./backend/

RUN pnpm install --frozen-lockfile --prod

COPY backend/ ./backend/

# 生产环境镜像
FROM node:18-alpine

# 安装系统依赖和 pnpm
RUN apk add --no-cache \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev && \
    npm install -g pnpm@8.15.0

WORKDIR /app

# 复制后端文件和依赖
COPY --from=backend-builder /app/backend ./
COPY --from=backend-builder /app/node_modules ./node_modules

# 复制前端构建文件
COPY --from=frontend-builder /app/web/dist ./public

# 创建必要的目录
RUN mkdir -p uploads/posters uploads/previews logs

# 设置权限
RUN chmod -R 755 uploads logs

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node healthcheck.js

# 启动应用
CMD ["node", "src/server.js"]
