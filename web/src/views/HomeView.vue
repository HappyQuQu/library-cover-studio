<template>
  <div class="home-view">
    <el-container>
      <el-header class="header">
        <div class="header-content">
          <h1>LibraryCoverStudio</h1>
          <p>专业的媒体库海报设计工具</p>
        </div>
      </el-header>
      
      <el-main>
        <div class="welcome-section">
          <el-row :gutter="20">
            <el-col :span="8">
              <el-card class="feature-card" shadow="hover" @click="$router.push('/designer')">
                <template #header>
                  <el-icon size="40"><Edit /></el-icon>
                </template>
                <h3>海报设计器</h3>
                <p>使用强大的可视化编辑器设计自定义海报</p>
              </el-card>
            </el-col>
            
            <el-col :span="8">
              <el-card class="feature-card" shadow="hover" @click="$router.push('/templates')">
                <template #header>
                  <el-icon size="40"><Document /></el-icon>
                </template>
                <h3>模板管理</h3>
                <p>管理和使用预制模板，快速创建海报</p>
              </el-card>
            </el-col>
            
            <el-col :span="8">
              <el-card class="feature-card" shadow="hover" @click="$router.push('/settings')">
                <template #header>
                  <el-icon size="40"><Setting /></el-icon>
                </template>
                <h3>自动化设置</h3>
                <p>配置媒体库连接和自动更新任务</p>
              </el-card>
            </el-col>
          </el-row>
        </div>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { Edit, Document, Setting } from '@element-plus/icons-vue'
</script>

<style scoped>
.home-view {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.header {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  text-align: center;
  padding: 40px 0;
}

.header-content h1 {
  color: white;
  font-size: 3rem;
  margin: 0;
  font-weight: bold;
}

.header-content p {
  color: rgba(255, 255, 255, 0.8);
  font-size: 1.2rem;
  margin: 10px 0 0 0;
}

.welcome-section {
  padding: 60px 20px;
}

.feature-card {
  text-align: center;
  cursor: pointer;
  transition: transform 0.3s ease;
  border-radius: 15px;
}

.feature-card:hover {
  transform: translateY(-10px);
}

.feature-card .el-icon {
  color: #667eea;
  margin-bottom: 20px;
}

.feature-card h3 {
  color: #333;
  margin: 15px 0 10px 0;
  font-size: 1.4rem;
}

.feature-card p {
  color: #666;
  line-height: 1.6;
}
</style>