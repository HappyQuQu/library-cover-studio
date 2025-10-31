<template>
  <div class="app-layout">
    <el-container>
      <!-- 顶部导航栏 -->
      <el-header class="app-header">
        <div class="header-left">
          <router-link to="/" class="logo">
            <h2>📚 Library Cover Studio</h2>
          </router-link>
        </div>

        <div class="header-nav">
          <router-link to="/" class="nav-item">
            <el-icon><HomeFilled /></el-icon>
            <span>首页</span>
          </router-link>
          <router-link to="/app/templates" class="nav-item">
            <el-icon><Document /></el-icon>
            <span>模板</span>
          </router-link>
          <router-link to="/app/media-sources" class="nav-item">
            <el-icon><Connection /></el-icon>
            <span>媒体源</span>
          </router-link>
          <router-link to="/app/scheduled-tasks" class="nav-item">
            <el-icon><Clock /></el-icon>
            <span>定时任务</span>
          </router-link>
          <router-link to="/app/settings" class="nav-item">
            <el-icon><Setting /></el-icon>
            <span>设置</span>
          </router-link>
        </div>

        <div class="header-right">
          <el-dropdown @command="handleCommand">
            <div class="user-dropdown">
              <el-icon><User /></el-icon>
              <span>{{ authStore.username }}</span>
              <el-icon><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><User /></el-icon>
                  <span>账户设置</span>
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  <span>退出登录</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 主内容区 -->
      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import {
  HomeFilled,
  Edit,
  Document,
  Setting,
  User,
  ArrowDown,
  SwitchButton,
  Connection,
  Clock,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useAuthStore } from "../stores/auth";

const router = useRouter();
const authStore = useAuthStore();

const handleCommand = async (command: string) => {
  if (command === "profile") {
    router.push("/app/settings");
  } else if (command === "logout") {
    try {
      await ElMessageBox.confirm("确定要退出登录吗?", "提示", {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      });

      await authStore.logout();
      ElMessage.success("已退出登录");
      router.push("/login");
    } catch (error) {
      // 用户取消操作
    }
  }
};
</script>

<style scoped>
.app-layout {
  height: 100vh;
  overflow: hidden;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  padding: 0 30px;
  height: 60px !important;
}

.header-left .logo {
  text-decoration: none;
  color: white;
  display: flex;
  align-items: center;
}

.header-left .logo h2 {
  margin: 0;
  font-size: 20px;
}

.header-nav {
  display: flex;
  gap: 30px;
  flex: 1;
  justify-content: center;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  padding: 8px 16px;
  border-radius: 6px;
  transition: all 0.3s;
  font-size: 14px;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.15);
  color: white;
}

.nav-item.router-link-active {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  font-weight: 500;
}

.header-right {
  display: flex;
  align-items: center;
}

.user-dropdown {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  color: white;
}

.user-dropdown:hover {
  background: rgba(255, 255, 255, 0.15);
}

.app-main {
  height: calc(100vh - 60px);
  overflow-y: auto;
  padding: 0;
  background: #f5f7fa;
}

:deep(.el-dropdown-menu__item) {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
