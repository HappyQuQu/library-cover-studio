<template>
  <div class="home-view">
    <div class="welcome-section">
      <div class="welcome-header">
        <h1>欢迎回来, {{ authStore.isAuthenticated ? authStore.username : '游客' }}! 👋</h1>
        <p v-if="authStore.isAuthenticated" class="welcome-subtitle">
          开始使用 Library Cover Studio 创建精美的媒体库海报
        </p>
        <div v-else class="login-prompt">
          <p>登录后即可使用完整功能</p>
          <el-button type="primary" size="large" @click="$router.push('/login')">
            立即登录
          </el-button>
        </div>
      </div>
      
      <el-row :gutter="24" class="feature-cards">
        <el-col :span="8">
          <el-card class="feature-card" shadow="hover" @click="handleCardClick('/designer')">
            <div class="card-icon">
              <el-icon size="48"><Edit /></el-icon>
            </div>
            <h3>海报设计器</h3>
            <p>使用强大的可视化编辑器设计自定义海报</p>
            <el-tag v-if="!authStore.isAuthenticated" type="warning" size="small">需要登录</el-tag>
          </el-card>
        </el-col>
        
        <el-col :span="8">
          <el-card class="feature-card" shadow="hover" @click="$router.push('/templates')">
            <div class="card-icon">
              <el-icon size="48"><Document /></el-icon>
            </div>
            <h3>模板管理</h3>
            <p>管理和使用预制模板，快速创建海报</p>
          </el-card>
        </el-col>
        
        <el-col :span="8">
          <el-card class="feature-card" shadow="hover" @click="handleCardClick('/settings')">
            <div class="card-icon">
              <el-icon size="48"><Setting /></el-icon>
            </div>
            <h3>系统设置</h3>
            <p>配置媒体库连接和定时任务</p>
            <el-tag v-if="!authStore.isAuthenticated" type="warning" size="small">需要登录</el-tag>
          </el-card>
        </el-col>
      </el-row>
      
      <div v-if="authStore.isAuthenticated" class="quick-stats">
        <el-card>
          <h3>快速统计</h3>
          <el-row :gutter="20">
            <el-col :span="8">
              <div class="stat-item">
                <div class="stat-value">0</div>
                <div class="stat-label">模板数量</div>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="stat-item">
                <div class="stat-value">0</div>
                <div class="stat-label">已生成海报</div>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="stat-item">
                <div class="stat-value">0</div>
                <div class="stat-label">定时任务</div>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Edit, Document, Setting } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const handleCardClick = (path: string) => {
  const routeConfig = router.getRoutes().find(route => route.path === path)
  const requiresAuth = routeConfig?.meta?.requiresAuth
  
  if (requiresAuth && !authStore.isAuthenticated) {
    ElMessage.warning('请先登录后使用该功能')
    router.push('/login')
    return
  }
  
  router.push(path)
}
</script>

<style scoped>
.home-view {
  padding: 40px;
  min-height: calc(100vh - 60px);
}

.welcome-section {
  max-width: 1200px;
  margin: 0 auto;
}

.welcome-header {
  text-align: center;
  margin-bottom: 50px;
}

.welcome-header h1 {
  font-size: 2.5rem;
  color: #333;
  margin-bottom: 10px;
}

.welcome-subtitle {
  font-size: 1.2rem;
  color: #666;
  margin: 0;
}

.login-prompt {
  margin-top: 20px;
}

.login-prompt p {
  color: #666;
  margin-bottom: 15px;
}

.feature-cards {
  margin-bottom: 40px;
}

.feature-card {
  cursor: pointer;
  transition: all 0.3s;
  height: 100%;
  text-align: center;
}

.feature-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
}

.card-icon {
  margin-bottom: 20px;
  color: #667eea;
}

.feature-card h3 {
  font-size: 1.5rem;
  margin: 15px 0;
  color: #333;
}

.feature-card p {
  color: #666;
  font-size: 14px;
  margin-bottom: 15px;
}

.quick-stats {
  margin-top: 40px;
}

.quick-stats h3 {
  margin-bottom: 20px;
  color: #333;
}

.stat-item {
  text-align: center;
  padding: 20px;
}

.stat-value {
  font-size: 2.5rem;
  font-weight: bold;
  color: #667eea;
  margin-bottom: 10px;
}

.stat-label {
  font-size: 14px;
  color: #666;
}
</style>