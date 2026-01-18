<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <h1>LibraryCoverStudio</h1>
        <p>{{ t('login.subtitle') }}</p>
      </div>

      <el-form
        ref="loginFormRef"
        :model="loginForm"
        :rules="rules"
        class="login-form"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="loginForm.username"
            :placeholder="t('login.usernamePlaceholder')"
            prefix-icon="User"
            size="large"
            clearable
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="loginForm.password"
            type="password"
            :placeholder="t('login.passwordPlaceholder')"
            prefix-icon="Lock"
            size="large"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="authStore.loading"
            class="login-button"
            @click="handleLogin"
          >
            {{ authStore.loading ? t('login.loggingIn') : t('login.login') }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="login-footer">
        <p>{{ t('login.defaultAccount') }}</p>
        <p class="tip">{{ t('login.changePasswordTip') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, type FormInstance, type FormRules } from "element-plus";
import { useAuthStore } from "../stores/auth";
import { useLocale } from "../composables/useLocale";

const router = useRouter();
const authStore = useAuthStore();
const { t } = useLocale();

const loginFormRef = ref<FormInstance>();
const loginForm = reactive({
  username: "",
  password: "",
});

const rules: FormRules = {
  username: [
    { required: true, message: () => t('login.usernameRequired'), trigger: "blur" },
    {
      min: 3,
      max: 20,
      message: () => t('login.usernameLength'),
      trigger: "blur",
    },
  ],
  password: [
    { required: true, message: () => t('login.passwordRequired'), trigger: "blur" },
    { min: 6, message: () => t('login.passwordLength'), trigger: "blur" },
  ],
};

const handleLogin = async () => {
  if (!loginFormRef.value) return;

  await loginFormRef.value.validate(async (valid) => {
    if (valid) {
      const result = await authStore.login(
        loginForm.username,
        loginForm.password
      );

      if (result.success) {
        ElMessage.success(t('login.loginSuccess'));
        router.push("/");
      } else {
        ElMessage.error(result.message || t('login.loginFailed'));
      }
    }
  });
};
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-box {
  width: 400px;
  padding: 40px;
  background: white;
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.login-header h1 {
  margin: 0;
  font-size: 28px;
  color: #333;
  font-weight: bold;
}

.login-header p {
  margin: 10px 0 0;
  font-size: 14px;
  color: #666;
}

.login-form {
  margin-top: 20px;
}

.login-button {
  width: 100%;
  margin-top: 10px;
}

.login-footer {
  margin-top: 20px;
  text-align: center;
}

.login-footer p {
  margin: 5px 0;
  font-size: 13px;
  color: #666;
}

.login-footer .tip {
  color: #f56c6c;
  font-weight: 500;
}
</style>
