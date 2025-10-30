import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as authApi from '../api/auth'
import type { UserInfo } from '../api/auth'

export const useAuthStore = defineStore('auth', () => {
  // State
  const token = ref<string | null>(localStorage.getItem('token'))
  const user = ref<UserInfo | null>(
    localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null
  )
  const loading = ref(false)

  // Getters
  const isAuthenticated = computed(() => !!token.value)
  const username = computed(() => user.value?.username || '')

  // Actions
  const login = async (username: string, password: string) => {
    loading.value = true
    try {
      const response = await authApi.login({ username, password })
      
      // 保存 token 和用户信息
      token.value = response.data.token
      user.value = response.data.user
      
      localStorage.setItem('token', response.data.token)
      localStorage.setItem('user', JSON.stringify(response.data.user))
      
      return { success: true }
    } catch (error: any) {
      console.error('Login failed:', error)
      return {
        success: false,
        message: error.response?.data?.message || '登录失败，请检查用户名和密码'
      }
    } finally {
      loading.value = false
    }
  }

  const logout = () => {
    token.value = null
    user.value = null
    authApi.logout()
  }

  const fetchUserInfo = async () => {
    try {
      const userInfo = await authApi.getCurrentUser()
      user.value = userInfo
      localStorage.setItem('user', JSON.stringify(userInfo))
    } catch (error) {
      console.error('Failed to fetch user info:', error)
      logout()
    }
  }

  const updateUsername = async (newUsername: string) => {
    try {
      const response = await authApi.updateUsername({ newUsername })
      
      // 更新 token 和用户信息
      if (response.data.token) {
        token.value = response.data.token
        localStorage.setItem('token', response.data.token)
      }
      
      if (response.data.user) {
        user.value = response.data.user
        localStorage.setItem('user', JSON.stringify(response.data.user))
      }
      
      return { success: true }
    } catch (error: any) {
      console.error('Failed to update username:', error)
      return {
        success: false,
        message: error.response?.data?.message || '修改用户名失败'
      }
    }
  }

  const updatePassword = async (currentPassword: string, newPassword: string) => {
    try {
      await authApi.updatePassword({ currentPassword, newPassword })
      return { success: true }
    } catch (error: any) {
      console.error('Failed to update password:', error)
      return {
        success: false,
        message: error.response?.data?.message || '修改密码失败'
      }
    }
  }

  return {
    token,
    user,
    loading,
    isAuthenticated,
    username,
    login,
    logout,
    fetchUserInfo,
    updateUsername,
    updatePassword,
  }
})
