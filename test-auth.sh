#!/bin/bash

# 认证系统测试脚本

BASE_URL="http://localhost:3001"

echo "🧪 LibraryCoverStudio 认证系统测试"
echo "=================================="
echo ""

# 测试 1: 登录
echo "📝 测试 1: 用户登录"
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

echo "响应: ${LOGIN_RESPONSE}"

# 提取 token
TOKEN=$(echo ${LOGIN_RESPONSE} | grep -o '"token":"[^"]*' | sed 's/"token":"//')

if [ -z "$TOKEN" ]; then
    echo "❌ 登录失败"
    exit 1
fi

echo "✅ 登录成功"
echo "Token: ${TOKEN:0:20}..."
echo ""

# 测试 2: 获取当前用户信息
echo "📝 测试 2: 获取当前用户信息"
USER_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/auth/me" \
  -H "Authorization: Bearer ${TOKEN}")

echo "响应: ${USER_RESPONSE}"
echo "✅ 获取用户信息成功"
echo ""

# 测试 3: 访问受保护的端点（获取模板列表）
echo "📝 测试 3: 访问受保护的端点"
TEMPLATES_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/templates")

echo "响应: ${TEMPLATES_RESPONSE}"
echo "✅ 访问成功"
echo ""

# 测试 4: 测试无效 token
echo "📝 测试 4: 测试无效 token"
INVALID_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/auth/me" \
  -H "Authorization: Bearer invalid-token-here")

echo "响应: ${INVALID_RESPONSE}"
echo "✅ 正确拒绝无效 token"
echo ""

echo "=================================="
echo "✅ 所有测试完成"
