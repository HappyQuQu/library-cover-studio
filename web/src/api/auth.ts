import apiClient from './client'

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  success: boolean
  data: {
    token: string
    user: {
      id: string
      username: string
      created_at: string
    }
  }
}

export interface UserInfo {
  id: string
  username: string
  created_at: string
  updated_at: string
}

export interface UpdateUsernameRequest {
  newUsername: string
}

export interface UpdatePasswordRequest {
  currentPassword: string
  newPassword: string
}

// 用户登录
export const login = async (data: LoginRequest): Promise<LoginResponse> => {
  const response = await apiClient.post<LoginResponse>('/auth/login', data)
  return response.data
}

// 获取当前用户信息
export const getCurrentUser = async (): Promise<UserInfo> => {
  const response = await apiClient.get<{ success: boolean; data: UserInfo }>('/auth/me')
  return response.data.data
}

// 修改用户名
export const updateUsername = async (data: UpdateUsernameRequest) => {
  const response = await apiClient.put('/auth/username', data)
  return response.data
}

// 修改密码
export const updatePassword = async (data: UpdatePasswordRequest) => {
  const response = await apiClient.put('/auth/password', data)
  return response.data
}

// 退出登录（客户端操作）
export const logout = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
}
