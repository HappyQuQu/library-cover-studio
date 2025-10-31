<template>
  <div class="home-view">
    <div class="welcome-section">
      <div class="welcome-header">
        <h1>
          {{ t('home.welcomeBack') }},
          {{ authStore.isAuthenticated ? authStore.username : t('home.guest') }}! 👋
        </h1>
        <p v-if="authStore.isAuthenticated" class="welcome-subtitle">
          {{ t('home.subtitle') }}
        </p>
        <div v-else class="login-prompt">
          <p>{{ t('home.loginPrompt') }}</p>
          <el-button
            type="primary"
            size="large"
            @click="$router.push('/login')"
          >
            {{ t('home.loginNow') }}
          </el-button>
        </div>
      </div>

      <el-row :gutter="24" class="feature-cards">
        <el-col :span="8">
          <el-card
            class="feature-card"
            shadow="hover"
            @click="handleCardClick('/app/designer')"
          >
            <div class="card-icon">
              <el-icon size="48"><Edit /></el-icon>
            </div>
            <h3>{{ t('home.posterDesigner') }}</h3>
            <p>{{ t('home.posterDesignerDesc') }}</p>
            <el-tag
              v-if="!authStore.isAuthenticated"
              type="warning"
              size="small"
              >{{ t('home.loginRequired') }}</el-tag
            >
          </el-card>
        </el-col>

        <el-col :span="8">
          <el-card
            class="feature-card"
            shadow="hover"
            @click="$router.push('/app/templates')"
          >
            <div class="card-icon">
              <el-icon size="48"><Document /></el-icon>
            </div>
            <h3>{{ t('home.templateManagement') }}</h3>
            <p>{{ t('home.templateManagementDesc') }}</p>
          </el-card>
        </el-col>

        <el-col :span="8">
          <el-card
            class="feature-card"
            shadow="hover"
            @click="$router.push('/app/schedule')"
          >
            <div class="card-icon">
              <el-icon size="48"><Clock /></el-icon>
            </div>
            <h3>{{ t('home.scheduledTasks') }}</h3>
            <p>{{ t('home.scheduledTasksDesc') }}</p>
            <el-tag
              v-if="!authStore.isAuthenticated"
              type="warning"
              size="small"
              >{{ t('home.loginRequired') }}</el-tag
            >
          </el-card>
        </el-col>
      </el-row>

      <div v-if="authStore.isAuthenticated" class="quick-stats">
        <el-card>
          <h3>{{ t('home.quickStats') }}</h3>
          <el-row :gutter="20">
            <el-col :span="8">
              <div class="stat-item">
                <div class="stat-value">0</div>
                <div class="stat-label">{{ t('home.templateCount') }}</div>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="stat-item">
                <div class="stat-value">0</div>
                <div class="stat-label">{{ t('home.generatedPosters') }}</div>
              </div>
            </el-col>
            <el-col :span="8">
              <div class="stat-item">
                <div class="stat-value">0</div>
                <div class="stat-label">{{ t('home.scheduledTasksCount') }}</div>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import { Edit, Document, Setting, Clock } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import { useAuthStore } from "../stores/auth";
import { useLocale } from "../composables/useLocale";

const router = useRouter();
const authStore = useAuthStore();
const { t } = useLocale();

const handleCardClick = (path: string) => {
  const routeConfig = router.getRoutes().find((route) => route.path === path);
  const requiresAuth = routeConfig?.meta?.requiresAuth;

  if (requiresAuth && !authStore.isAuthenticated) {
    ElMessage.warning(t('home.loginRequired'));
    router.push("/login");
    return;
  }

  router.push(path);
};
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
