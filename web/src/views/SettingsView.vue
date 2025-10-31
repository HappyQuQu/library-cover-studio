<template>
  <div class="settings-view">
    <el-container>
      <el-aside width="250px" class="settings-sidebar">
        <el-menu
          v-model="activeMenu"
          mode="vertical"
          @select="handleMenuSelect"
        >
          <el-menu-item index="account">
            <el-icon><User /></el-icon>
            <span>{{ t('settings.account') }}</span>
          </el-menu-item>
          <el-menu-item index="system">
            <el-icon><Setting /></el-icon>
            <span>{{ t('settings.system') }}</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <el-main class="settings-content">
        <!-- 账户设置 -->
        <div v-show="activeMenu === 'account'" class="settings-section">
          <div class="section-header">
            <h3>{{ t('settings.account') }}</h3>
          </div>

          <el-card class="account-card">
            <div class="account-info">
              <div class="info-item">
                <label>{{ t('settings.currentUsername') }}:</label>
                <span>{{ authStore.username }}</span>
              </div>
            </div>

            <el-divider />

            <el-form
              ref="usernameFormRef"
              :model="usernameForm"
              :rules="usernameRules"
              label-width="120px"
              class="account-form"
            >
              <h4>{{ t('settings.changeUsername') }}</h4>
              <el-form-item :label="t('settings.newUsername')" prop="username">
                <el-input
                  v-model="usernameForm.username"
                  :placeholder="t('settings.usernamePlaceholder')"
                  clearable
                />
              </el-form-item>
              <el-form-item>
                <el-button
                  type="primary"
                  :loading="usernameLoading"
                  @click="handleUpdateUsername"
                >
                  {{ t('settings.updateUsername') }}
                </el-button>
              </el-form-item>
            </el-form>

            <el-divider />

            <el-form
              ref="passwordFormRef"
              :model="passwordForm"
              :rules="passwordRules"
              label-width="120px"
              class="account-form"
            >
              <h4>{{ t('settings.changePassword') }}</h4>
              <el-form-item :label="t('settings.currentPassword')" prop="currentPassword">
                <el-input
                  v-model="passwordForm.currentPassword"
                  type="password"
                  :placeholder="t('settings.currentPasswordPlaceholder')"
                  show-password
                  clearable
                />
              </el-form-item>
              <el-form-item :label="t('settings.newPassword')" prop="newPassword">
                <el-input
                  v-model="passwordForm.newPassword"
                  type="password"
                  :placeholder="t('settings.newPasswordPlaceholder')"
                  show-password
                  clearable
                />
              </el-form-item>
              <el-form-item :label="t('settings.confirmPassword')" prop="confirmPassword">
                <el-input
                  v-model="passwordForm.confirmPassword"
                  type="password"
                  :placeholder="t('settings.confirmPasswordPlaceholder')"
                  show-password
                  clearable
                />
              </el-form-item>
              <el-form-item>
                <el-button
                  type="primary"
                  :loading="passwordLoading"
                  @click="handleUpdatePassword"
                >
                  {{ t('settings.updatePassword') }}
                </el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </div>

        

        <!-- 系统设置 -->
        <div v-show="activeMenu === 'system'" class="settings-section">
          <h3>{{ t('settings.system') }}</h3>

          <el-form :model="systemSettings" label-width="150px">
            <el-form-item :label="t('settings.maxConcurrentGenerations')">
              <el-input-number
                v-model="systemSettings.maxConcurrentGenerations"
                :min="1"
                :max="20"
              />
            </el-form-item>

            <el-form-item :label="t('settings.posterCacheHours')">
              <el-input-number
                v-model="systemSettings.posterCacheHours"
                :min="1"
                :max="168"
              />
            </el-form-item>

            <el-form-item :label="t('settings.defaultPosterQuality')">
              <el-slider
                v-model="systemSettings.defaultPosterQuality"
                :min="50"
                :max="100"
                show-input
              />
            </el-form-item>

            <el-form-item :label="t('settings.notificationsEnabled')">
              <el-switch v-model="systemSettings.notificationsEnabled" />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="saveSystemSettings">
                {{ t('settings.saveSettings') }}
              </el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-main>
    </el-container>

    
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import {
  Setting,
  User,
} from "@element-plus/icons-vue";
import {
  ElMessage,
  type FormInstance,
  type FormRules,
} from "element-plus";
import { useAuthStore } from "../stores/auth";
import { useLocale } from "../composables/useLocale";

// Store
const authStore = useAuthStore();
const { t } = useLocale();

// 响应式数据
const activeMenu = ref("account");
// 已移除：媒体库和定时任务在独立页面管理

// 账户设置表单
const usernameFormRef = ref<FormInstance>();
const passwordFormRef = ref<FormInstance>();
const usernameLoading = ref(false);
const passwordLoading = ref(false);

const usernameForm = ref({
  username: "",
});

const passwordForm = ref({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

// 表单验证规则
const usernameRules: FormRules = {
  username: [
    { required: true, message: () => t('settings.usernamePlaceholder'), trigger: "blur" },
    {
      min: 3,
      max: 20,
      message: () => t('settings.usernameMinLength'),
      trigger: "blur",
    },
  ],
};

const passwordRules: FormRules = {
  currentPassword: [
    { required: true, message: () => t('settings.currentPasswordPlaceholder'), trigger: "blur" },
  ],
  newPassword: [
    { required: true, message: () => t('settings.newPasswordPlaceholder'), trigger: "blur" },
    { min: 6, message: () => t('settings.passwordMinLength'), trigger: "blur" },
  ],
  confirmPassword: [
    { required: true, message: () => t('settings.confirmPasswordPlaceholder'), trigger: "blur" },
    {
      validator: (rule: any, value: string, callback: any) => {
        if (value !== passwordForm.value.newPassword) {
          callback(new Error(t('settings.passwordMismatch')));
        } else {
          callback();
        }
      },
      trigger: "blur",
    },
  ],
};

const systemSettings = ref({
  maxConcurrentGenerations: 5,
  posterCacheHours: 24,
  defaultPosterQuality: 90,
  notificationsEnabled: true,
});

// 生命周期
onMounted(() => {
  loadSystemSettings();
});

// 方法
const handleMenuSelect = (key: string) => {
  activeMenu.value = key;
};

// 账户设置方法
const handleUpdateUsername = async () => {
  if (!usernameFormRef.value) return;

  await usernameFormRef.value.validate(async (valid) => {
    if (!valid) return;

    usernameLoading.value = true;
    try {
      await authStore.updateUsername(usernameForm.value.username);
      ElMessage.success(t('settings.usernameUpdateSuccess'));
      usernameForm.value.username = "";
      usernameFormRef.value?.resetFields();
    } catch (error: any) {
      ElMessage.error(error.response?.data?.error || t('settings.usernameUpdateFailed'));
    } finally {
      usernameLoading.value = false;
    }
  });
};

const handleUpdatePassword = async () => {
  if (!passwordFormRef.value) return;

  await passwordFormRef.value.validate(async (valid) => {
    if (!valid) return;

    passwordLoading.value = true;
    try {
      await authStore.updatePassword(
        passwordForm.value.currentPassword,
        passwordForm.value.newPassword
      );
      ElMessage.success(t('settings.passwordUpdateSuccess'));
      passwordForm.value = {
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      };
      passwordFormRef.value?.resetFields();
    } catch (error: any) {
      ElMessage.error(error.response?.data?.error || t('settings.passwordUpdateFailed'));
    } finally {
      passwordLoading.value = false;
    }
  });
};

const loadSystemSettings = async () => {
  try {
    // 加载系统设置
  } catch (error) {
    ElMessage.error(t('settings.settingsSaveFailed'));
  }
};

const saveSystemSettings = async () => {
  try {
    ElMessage.success(t('settings.settingsSaved'));
  } catch (error) {
    ElMessage.error(t('settings.settingsSaveFailed'));
  }
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return null;
  return new Date(dateString).toLocaleString("zh-CN");
};
</script>

<style scoped>
.settings-view {
  height: 100vh;
}

.settings-sidebar {
  background: var(--sidebar-bg);
  border-right: 1px solid var(--border-color);
}

.settings-content {
  padding: 30px;
}

.settings-section {
  max-width: 1000px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
}

.section-header h3 {
  margin: 0;
  color: var(--text-primary);
}

.media-libs-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 20px;
}

.media-lib-card {
  cursor: pointer;
}

.media-lib-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.media-lib-header h4 {
  margin: 0;
}

.media-lib-details {
  margin-bottom: 20px;
}

.media-lib-details p {
  margin: 5px 0;
  color: var(--text-secondary);
}

.media-lib-actions {
  display: flex;
  gap: 10px;
}

/* 账户设置样式 */
.account-card {
  max-width: 600px;
}

.account-info {
  margin-bottom: 20px;
}

.info-item {
  display: flex;
  align-items: center;
  padding: 10px 0;
}

.info-item label {
  font-weight: bold;
  margin-right: 10px;
  color: var(--text-secondary);
}

.info-item span {
  color: var(--text-primary);
  font-size: 16px;
}

.account-form h4 {
  margin-bottom: 20px;
  color: var(--text-primary);
}
</style>
