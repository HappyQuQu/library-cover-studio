FROM node:22-alpine

# 安装中文字体 (解决海报文字乱码问题)
RUN apk add --no-cache \
    font-noto-cjk \
    fontconfig \
    python3 \
    make \
    g++ \
    && fc-cache -fv

WORKDIR /app

# 复制 package 文件
COPY package.json pnpm-lock.yaml* ./

# 安装 pnpm 和依赖
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# 复制源码
COPY . .

# 构建
RUN pnpm build

# 创建数据目录
RUN mkdir -p /app/data /app/uploads

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "dist/server.js"]
