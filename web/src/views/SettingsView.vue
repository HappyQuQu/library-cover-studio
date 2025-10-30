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
            <span>账户设置</span>
          </el-menu-item>
          <el-menu-item index="media-libs">
            <el-icon><Connection /></el-icon>
            <span>媒体库连接</span>
          </el-menu-item>
          <el-menu-item index="schedules">
            <el-icon><Timer /></el-icon>
            <span>定时任务</span>
          </el-menu-item>
          <el-menu-item index="system">
            <el-icon><Setting /></el-icon>
            <span>系统设置</span>
          </el-menu-item>
        </el-menu>
      </el-aside>
      
      <el-main class="settings-content">
        <!-- 账户设置 -->
        <div v-show="activeMenu === 'account'" class="settings-section">
          <div class="section-header">
            <h3>账户设置</h3>
          </div>
          
          <el-card class="account-card">
            <div class="account-info">
              <div class="info-item">
                <label>当前用户名:</label>
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
              <h4>修改用户名</h4>
              <el-form-item label="新用户名" prop="username">
                <el-input
                  v-model="usernameForm.username"
                  placeholder="请输入新用户名"
                  clearable
                />
              </el-form-item>
              <el-form-item>
                <el-button
                  type="primary"
                  :loading="usernameLoading"
                  @click="handleUpdateUsername"
                >
                  更新用户名
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
              <h4>修改密码</h4>
              <el-form-item label="当前密码" prop="currentPassword">
                <el-input
                  v-model="passwordForm.currentPassword"
                  type="password"
                  placeholder="请输入当前密码"
                  show-password
                  clearable
                />
              </el-form-item>
              <el-form-item label="新密码" prop="newPassword">
                <el-input
                  v-model="passwordForm.newPassword"
                  type="password"
                  placeholder="请输入新密码"
                  show-password
                  clearable
                />
              </el-form-item>
              <el-form-item label="确认新密码" prop="confirmPassword">
                <el-input
                  v-model="passwordForm.confirmPassword"
                  type="password"
                  placeholder="请再次输入新密码"
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
                  更新密码
                </el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </div>
        
        <!-- 媒体库连接 -->
        <div v-show="activeMenu === 'media-libs'" class="settings-section">
          <div class="section-header">
            <h3>媒体库连接</h3>
            <el-button type="primary" @click="showAddMediaLibDialog = true">
              <el-icon><Plus /></el-icon>
              添加媒体库
            </el-button>
          </div>
          
          <div class="media-libs-list">
            <el-card
              v-for="mediaLib in mediaLibraries"
              :key="mediaLib.id"
              class="media-lib-card"
              shadow="hover"
            >
              <div class="media-lib-info">
                <div class="media-lib-header">
                  <h4>{{ mediaLib.name }}</h4>
                  <el-tag :type="mediaLib.is_active ? 'success' : 'info'">
                    {{ mediaLib.is_active ? '已启用' : '已禁用' }}
                  </el-tag>
                </div>
                
                <div class="media-lib-details">
                  <p><strong>类型:</strong> {{ mediaLib.type.toUpperCase() }}</p>
                  <p><strong>地址:</strong> {{ mediaLib.base_url }}</p>
                  <p><strong>最后同步:</strong> {{ formatDate(mediaLib.last_sync) || '从未' }}</p>
                </div>
                
                <div class="media-lib-actions">
                  <el-button size="small" @click="testConnection(mediaLib)">
                    测试连接
                  </el-button>
                  <el-button size="small" @click="editMediaLib(mediaLib)">
                    编辑
                  </el-button>
                  <el-button 
                    size="small" 
                    type="danger" 
                    @click="deleteMediaLib(mediaLib)"
                  >
                    删除
                  </el-button>
                </div>
              </div>
            </el-card>
          </div>
        </div>
        
        <!-- 定时任务 -->
        <div v-show="activeMenu === 'schedules'" class="settings-section">
          <div class="section-header">
            <h3>定时任务</h3>
            <el-button type="primary" @click="showAddTaskDialog = true">
              <el-icon><Plus /></el-icon>
              创建任务
            </el-button>
          </div>
          
          <el-table :data="scheduleTasks" style="width: 100%">
            <el-table-column prop="name" label="任务名称" />
            <el-table-column prop="template_name" label="使用模板" />
            <el-table-column prop="media_lib_name" label="目标媒体库" />
            <el-table-column prop="cron_expression" label="执行时间" />
            <el-table-column label="状态">
              <template #default="scope">
                <el-switch
                  v-model="scope.row.is_active"
                  @change="toggleTask(scope.row)"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="200">
              <template #default="scope">
                <el-button size="small" @click="triggerTask(scope.row)">
                  立即执行
                </el-button>
                <el-button size="small" @click="editTask(scope.row)">
                  编辑
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
        
        <!-- 系统设置 -->
        <div v-show="activeMenu === 'system'" class="settings-section">
          <h3>系统设置</h3>
          
          <el-form :model="systemSettings" label-width="150px">
            <el-form-item label="最大并发生成数">
              <el-input-number
                v-model="systemSettings.maxConcurrentGenerations"
                :min="1"
                :max="20"
              />
            </el-form-item>
            
            <el-form-item label="海报缓存时间(小时)">
              <el-input-number
                v-model="systemSettings.posterCacheHours"
                :min="1"
                :max="168"
              />
            </el-form-item>
            
            <el-form-item label="默认海报质量">
              <el-slider
                v-model="systemSettings.defaultPosterQuality"
                :min="50"
                :max="100"
                show-input
              />
            </el-form-item>
            
            <el-form-item label="启用通知">
              <el-switch v-model="systemSettings.notificationsEnabled" />
            </el-form-item>
            
            <el-form-item>
              <el-button type="primary" @click="saveSystemSettings">
                保存设置
              </el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-main>
    </el-container>
    
    <!-- 添加媒体库对话框 -->
    <el-dialog v-model="showAddMediaLibDialog" title="添加媒体库" width="600px">
      <el-form :model="newMediaLib" :rules="mediaLibRules" ref="mediaLibForm">
        <el-form-item label="名称" prop="name">
          <el-input v-model="newMediaLib.name" />
        </el-form-item>
        
        <el-form-item label="类型" prop="type">
          <el-select v-model="newMediaLib.type" style="width: 100%">
            <el-option label="Jellyfin" value="jellyfin" />
            <el-option label="Emby" value="emby" />
            <el-option label="Plex" value="plex" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="服务器地址" prop="baseUrl">
          <el-input 
            v-model="newMediaLib.baseUrl" 
            placeholder="http://localhost:8096"
          />
        </el-form-item>
        
        <el-form-item label="API密钥" prop="apiKey">
          <el-input 
            v-model="newMediaLib.apiKey" 
            type="password"
            show-password
          />
        </el-form-item>
        
        <el-form-item label="用户名">
          <el-input v-model="newMediaLib.username" />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="showAddMediaLibDialog = false">取消</el-button>
        <el-button type="primary" @click="addMediaLibrary">添加</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { 
  Connection, Timer, Setting, Plus, User 
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { useAuthStore } from '../stores/auth'

// Store
const authStore = useAuthStore()

// 响应式数据
const activeMenu = ref('account')
const mediaLibraries = ref([])
const scheduleTasks = ref([])
const showAddMediaLibDialog = ref(false)
const showAddTaskDialog = ref(false)

// 账户设置表单
const usernameFormRef = ref<FormInstance>()
const passwordFormRef = ref<FormInstance>()
const usernameLoading = ref(false)
const passwordLoading = ref(false)

const usernameForm = ref({
  username: ''
})

const passwordForm = ref({
  currentPassword: '',
  newPassword: '',
  confirmPassword: ''
})

// 表单验证规则
const usernameRules: FormRules = {
  username: [
    { required: true, message: '请输入新用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度在 3 到 20 个字符', trigger: 'blur' }
  ]
}

const passwordRules: FormRules = {
  currentPassword: [
    { required: true, message: '请输入当前密码', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度不能少于 6 个字符', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (rule: any, value: string, callback: any) => {
        if (value !== passwordForm.value.newPassword) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

const newMediaLib = ref({
  name: '',
  type: 'jellyfin',
  baseUrl: '',
  apiKey: '',
  username: ''
})

const systemSettings = ref({
  maxConcurrentGenerations: 5,
  posterCacheHours: 24,
  defaultPosterQuality: 90,
  notificationsEnabled: true
})

// 表单验证规则
const mediaLibRules = {
  name: [
    { required: true, message: '请输入媒体库名称', trigger: 'blur' }
  ],
  type: [
    { required: true, message: '请选择媒体库类型', trigger: 'change' }
  ],
  baseUrl: [
    { required: true, message: '请输入服务器地址', trigger: 'blur' },
    { type: 'url', message: '请输入正确的URL格式', trigger: 'blur' }
  ],
  apiKey: [
    { required: true, message: '请输入API密钥', trigger: 'blur' }
  ]
}

// 生命周期
onMounted(() => {
  loadMediaLibraries()
  loadScheduleTasks()
  loadSystemSettings()
})

// 方法
const handleMenuSelect = (key: string) => {
  activeMenu.value = key
}

// 账户设置方法
const handleUpdateUsername = async () => {
  if (!usernameFormRef.value) return
  
  await usernameFormRef.value.validate(async (valid) => {
    if (!valid) return
    
    usernameLoading.value = true
    try {
      await authStore.updateUsername(usernameForm.value.username)
      ElMessage.success('用户名更新成功')
      usernameForm.value.username = ''
      usernameFormRef.value?.resetFields()
    } catch (error: any) {
      ElMessage.error(error.response?.data?.error || '更新用户名失败')
    } finally {
      usernameLoading.value = false
    }
  })
}

const handleUpdatePassword = async () => {
  if (!passwordFormRef.value) return
  
  await passwordFormRef.value.validate(async (valid) => {
    if (!valid) return
    
    passwordLoading.value = true
    try {
      await authStore.updatePassword(
        passwordForm.value.currentPassword,
        passwordForm.value.newPassword
      )
      ElMessage.success('密码更新成功')
      passwordForm.value = {
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }
      passwordFormRef.value?.resetFields()
    } catch (error: any) {
      ElMessage.error(error.response?.data?.error || '更新密码失败')
    } finally {
      passwordLoading.value = false
    }
  })
}

const loadMediaLibraries = async () => {
  try {
    // 模拟数据
    mediaLibraries.value = [
      {
        id: '1',
        name: '本地 Jellyfin 服务器',
        type: 'jellyfin',
        base_url: 'http://localhost:8096',
        is_active: true,
        last_sync: new Date().toISOString()
      }
    ]
  } catch (error) {
    ElMessage.error('加载媒体库失败')
  }
}

const loadScheduleTasks = async () => {
  try {
    // 模拟数据
    scheduleTasks.value = [
      {
        id: '1',
        name: '每日电影海报更新',
        template_name: '经典电影海报',
        media_lib_name: '本地 Jellyfin 服务器',
        cron_expression: '0 2 * * *',
        is_active: false
      }
    ]
  } catch (error) {
    ElMessage.error('加载定时任务失败')
  }
}

const loadSystemSettings = async () => {
  try {
    // 加载系统设置
  } catch (error) {
    ElMessage.error('加载系统设置失败')
  }
}

const testConnection = async (mediaLib: any) => {
  try {
    ElMessage.info('正在测试连接...')
    // 调用测试连接API
    ElMessage.success('连接测试成功')
  } catch (error) {
    ElMessage.error('连接测试失败')
  }
}

const editMediaLib = (mediaLib: any) => {
  // 编辑媒体库
}

const deleteMediaLib = async (mediaLib: any) => {
  try {
    await ElMessageBox.confirm(`确定删除媒体库"${mediaLib.name}"吗？`, '确认删除', {
      type: 'warning'
    })
    
    ElMessage.success('媒体库删除成功')
    loadMediaLibraries()
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('媒体库删除失败')
    }
  }
}

const addMediaLibrary = async () => {
  try {
    // 验证并添加媒体库
    ElMessage.success('媒体库添加成功')
    showAddMediaLibDialog.value = false
    loadMediaLibraries()
  } catch (error) {
    ElMessage.error('媒体库添加失败')
  }
}

const toggleTask = async (task: any) => {
  try {
    ElMessage.success(`任务已${task.is_active ? '启用' : '禁用'}`)
  } catch (error) {
    ElMessage.error('任务状态更新失败')
  }
}

const triggerTask = async (task: any) => {
  try {
    ElMessage.success('任务触发成功')
  } catch (error) {
    ElMessage.error('任务触发失败')
  }
}

const editTask = (task: any) => {
  // 编辑任务
}

const saveSystemSettings = async () => {
  try {
    ElMessage.success('系统设置保存成功')
  } catch (error) {
    ElMessage.error('系统设置保存失败')
  }
}

const formatDate = (dateString: string | null) => {
  if (!dateString) return null
  return new Date(dateString).toLocaleString('zh-CN')
}
</script>

<style scoped>
.settings-view {
  height: 100vh;
}

.settings-sidebar {
  background: #f8f9fa;
  border-right: 1px solid #e9ecef;
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
  color: #333;
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
  color: #666;
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
  color: #666;
}

.info-item span {
  color: #333;
  font-size: 16px;
}

.account-form h4 {
  margin-bottom: 20px;
  color: #333;
}
</style>