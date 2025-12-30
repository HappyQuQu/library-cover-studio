#!/bin/bash

# LibraryCoverStudio 快速启动脚本

echo "🚀 启动 LibraryCoverStudio..."
echo ""

# 检查 .env 文件
if [ ! -f "backend/.env" ]; then
    echo "📝 创建 .env 文件..."
    cp backend/.env.example backend/.env
    echo "✅ .env 文件已创建"
fi

# 确保数据目录存在
mkdir -p backend/data
mkdir -p backend/uploads/posters
mkdir -p backend/uploads/previews

echo ""
echo "🔧 安装依赖..."
pnpm install

echo ""
echo "🎯 启动后端服务..."
cd backend && pnpm run dev
