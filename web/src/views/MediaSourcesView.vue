<template>
  <div class="media-sources-view">
    <div class="header">
      <h2>媒体源管理</h2>
      <el-button type="primary" @click="showAddDialog">
        <el-icon><Plus /></el-icon>
        添加媒体源
      </el-button>
    </div>

    <el-table
      :data="mediaSources"
      v-loading="loading"
      style="width: 100%"
      @expand-change="handleExpandChange"
      :expand-row-keys="expandedRows"
      row-key="id"
    >
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="libraries-expand">
            <div class="libraries-header">
              <h3>媒体库列表</h3>
              <el-button
                size="small"
                @click="refreshLibraries(row)"
                :loading="librariesLoading[row.id]"
              >
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
            </div>

            <div
              v-if="librariesData[row.id] && librariesData[row.id].length > 0"
              class="libraries-grid"
            >
              <div
                v-for="lib in librariesData[row.id]"
                :key="lib.id"
                class="library-card"
              >
                <div class="library-cover">
                  <img
                    v-if="lib.coverUrl"
                    :src="lib.coverUrl"
                    :alt="lib.name"
                    @error="handleImageError"
                  />
                  <div v-else class="no-cover">
                    <el-icon><Picture /></el-icon>
                    <span>暂无封面</span>
                  </div>
                </div>
                <div class="library-info">
                  <h4>{{ lib.name }}</h4>
                  <div class="library-meta">
                    <el-tag size="small">{{ lib.type }}</el-tag>
                    <span class="library-count"
                      >{{ lib.itemCount || 0 }} 项</span
                    >
                  </div>
                </div>
              </div>
            </div>

            <el-empty
              v-else-if="!librariesLoading[row.id]"
              description="暂无媒体库数据"
            />

            <div v-if="librariesLoading[row.id]" class="libraries-loading">
              <el-icon class="is-loading"><Loading /></el-icon>
              <span>加载中...</span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" width="200" />
      <el-table-column prop="type" label="类型" width="120">
        <template #default="{ row }">
          <el-tag :type="getTypeColor(row.type)">
            {{ row.type.toUpperCase() }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="base_url" label="服务器地址" />
      <el-table-column prop="is_active" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'">
            {{ row.is_active ? "激活" : "禁用" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="last_sync" label="最后同步" width="180">
        <template #default="{ row }">
          {{ formatDate(row.last_sync) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="testConnection(row)">测试</el-button>
          <el-button size="small" @click="editSource(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteSource(row)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="600px"
      @close="resetForm"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="名称" prop="name">
          <el-input
            v-model="form.name"
            placeholder="例如: 我的 Jellyfin 服务器"
          />
        </el-form-item>

        <el-form-item label="类型" prop="type">
          <el-select v-model="form.type" placeholder="选择媒体服务器类型">
            <el-option label="Jellyfin" value="jellyfin" />
            <el-option label="Emby" value="emby" />
          </el-select>
        </el-form-item>

        <el-form-item label="服务器地址" prop="baseURL">
          <el-input
            v-model="form.baseURL"
            placeholder="http://localhost:8096"
          />
        </el-form-item>

        <el-form-item label="API密钥" prop="apiKey">
          <el-input
            v-model="form.apiKey"
            type="password"
            show-password
            placeholder="输入API密钥"
          />
        </el-form-item>

        <el-form-item label="用户ID" prop="userId">
          <el-input v-model="form.userId" placeholder="输入用户ID (可选)" />
        </el-form-item>

        <el-form-item label="状态">
          <el-switch
            v-model="form.isActive"
            active-text="激活"
            inactive-text="禁用"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Plus, Refresh, Picture, Loading } from "@element-plus/icons-vue";
import axios from "axios";
import { API_ENDPOINTS } from "../config/api";

// 类型定义
interface MediaSource {
  id: string;
  name: string;
  type: string;
  base_url: string;
  api_key: string;
  user_id?: string;
  is_active: boolean;
  last_sync?: string;
}

interface Library {
  id: string;
  name: string;
  type: string;
  itemCount?: number;
  coverUrl?: string;
}

// 数据
const loading = ref(false);
const submitting = ref(false);
const mediaSources = ref<MediaSource[]>([]);
const dialogVisible = ref(false);
const dialogTitle = ref("添加媒体源");
const editingId = ref<string | null>(null);
const formRef = ref<any>(null);

// 展开行相关
const expandedRows = ref<string[]>([]);
const librariesData = ref<Record<string, Library[]>>({});
const librariesLoading = ref<Record<string, boolean>>({});

// 表单
const form = reactive({
  name: "",
  type: "jellyfin",
  baseURL: "",
  apiKey: "",
  userId: "",
  isActive: true,
});

// 验证规则
const rules = {
  name: [{ required: true, message: "请输入名称", trigger: "blur" }],
  type: [{ required: true, message: "请选择类型", trigger: "change" }],
  baseURL: [{ required: true, message: "请输入服务器地址", trigger: "blur" }],
  apiKey: [{ required: true, message: "请输入API密钥", trigger: "blur" }],
};

// 加载媒体源列表
const loadSources = async () => {
  loading.value = true;
  try {
    const response = await axios.get(API_ENDPOINTS.mediaSources.base);
    mediaSources.value = response.data.data || [];
  } catch (error: any) {
    ElMessage.error("加载媒体源列表失败: " + error.message);
  } finally {
    loading.value = false;
  }
};

// 处理表格展开
const handleExpandChange = (
  row: MediaSource,
  expandedRowsList: MediaSource[]
) => {
  if (expandedRowsList.find((r) => r.id === row.id)) {
    // 展开了,加载媒体库数据
    loadLibraries(row);
  }
};

// 加载媒体库列表
const loadLibraries = async (source: MediaSource) => {
  librariesLoading.value[source.id] = true;
  try {
    const response = await axios.get(
      API_ENDPOINTS.mediaSources.libraries(source.id)
    );
    const libs = response.data.data || response.data.libraries || [];

    // 处理封面URL
    librariesData.value[source.id] = libs.map((lib: any) => {
      let coverUrl = null;
      if (lib.primaryImageTag) {
        // Jellyfin/Emby 封面 URL (需要 API Key)
        coverUrl = `${source.base_url}/Items/${lib.id}/Images/Primary?tag=${lib.primaryImageTag}&maxWidth=400&api_key=${source.api_key}`;
      }

      return {
        id: lib.id,
        name: lib.name,
        type: lib.type || lib.collectionType || "未知",
        itemCount: lib.itemCount || lib.totalItemCount || 0,
        coverUrl: coverUrl,
      };
    });
  } catch (error: any) {
    ElMessage.error("加载媒体库失败: " + error.message);
    librariesData.value[source.id] = [];
  } finally {
    librariesLoading.value[source.id] = false;
  }
};

// 刷新媒体库
const refreshLibraries = async (source: MediaSource) => {
  await loadLibraries(source);
  ElMessage.success("刷新成功");
};

// 图片加载失败处理
const handleImageError = (e: Event) => {
  const target = e.target as HTMLImageElement;
  target.style.display = "none";
};

// 显示添加对话框
const showAddDialog = () => {
  dialogTitle.value = "添加媒体源";
  editingId.value = null;
  resetForm();
  dialogVisible.value = true;
};

// 编辑媒体源
const editSource = async (row: MediaSource) => {
  try {
    const response = await axios.get(API_ENDPOINTS.mediaSources.byId(row.id));
    const data = response.data.data;

    dialogTitle.value = "编辑媒体源";
    editingId.value = row.id;
    form.name = data.name;
    form.type = data.type;
    form.baseURL = data.base_url;
    form.apiKey = data.api_key;
    form.userId = data.user_id || "";
    form.isActive = data.is_active;
    dialogVisible.value = true;
  } catch (error: any) {
    ElMessage.error("加载媒体源详情失败: " + error.message);
  }
};

// 提交表单
const submitForm = async () => {
  try {
    await formRef.value.validate();

    submitting.value = true;
    const data = {
      name: form.name,
      type: form.type,
      baseURL: form.baseURL,
      apiKey: form.apiKey,
      userId: form.userId || undefined,
      isActive: form.isActive,
    };

    if (editingId.value) {
      // 更新
      await axios.put(API_ENDPOINTS.mediaSources.byId(editingId.value), data);
      ElMessage.success("更新成功");
    } else {
      // 创建
      await axios.post(API_ENDPOINTS.mediaSources.base, data);
      ElMessage.success("创建成功");
    }

    dialogVisible.value = false;
    loadSources();
  } catch (error: any) {
    if (error.response) {
      ElMessage.error(error.response.data.message || "操作失败");
    } else if (error.message) {
      ElMessage.error("表单验证失败");
    } else {
      ElMessage.error("操作失败: " + error.message);
    }
  } finally {
    submitting.value = false;
  }
};

// 测试连接
const testConnection = async (row: MediaSource) => {
  const loading = ElMessage.info({
    message: "正在测试连接...",
    duration: 0,
  });

  try {
    const response = await axios.post(API_ENDPOINTS.mediaSources.test(row.id));
    loading.close();

    const info = response.data.serverInfo || {};
    const server = info.serverName || "-";
    const version = info.version || "-";
    const typeLabel = row.type === 'jellyfin' ? 'Jellyfin' : row.type === 'emby' ? 'Emby' : row.type || '-';

    ElMessageBox.alert(
      `类型: ${typeLabel}<br>
       服务器名称: ${server}<br>
       版本: ${version}`,
      "连接成功",
      {
        dangerouslyUseHTMLString: true,
        type: "success",
      }
    );
  } catch (error: any) {
    loading.close();
    ElMessage.error(
      "连接失败: " + (error.response?.data?.message || error.message)
    );
  }
};

// 删除媒体源
const deleteSource = async (row: MediaSource) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除媒体源 "${row.name}" 吗?`,
      "确认删除",
      {
        type: "warning",
      }
    );

    await axios.delete(API_ENDPOINTS.mediaSources.byId(row.id));
    ElMessage.success("删除成功");
    loadSources();
  } catch (error: any) {
    if (error !== "cancel") {
      ElMessage.error("删除失败: " + error.message);
    }
  }
};

// 重置表单
const resetForm = () => {
  form.name = "";
  form.type = "jellyfin";
  form.baseURL = "";
  form.apiKey = "";
  form.userId = "";
  form.isActive = true;
  formRef.value?.clearValidate();
};

// 获取类型颜色
const getTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    jellyfin: "primary",
    emby: "success",
    plex: "warning",
  };
  return colors[type] || "info";
};

// 格式化日期
const formatDate = (date: string) => {
  if (!date) return "-";
  return new Date(date).toLocaleString("zh-CN");
};

// 初始化
onMounted(() => {
  loadSources();
});
</script>

<style scoped>
.media-sources-view {
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

/* 媒体库展开区域样式 */
.libraries-expand {
  padding: 20px;
  background-color: var(--bg-secondary);
}

.libraries-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.libraries-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.libraries-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.library-card {
  background: var(--bg-primary);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  cursor: pointer;
  display: flex;
  flex-direction: column;
}

.library-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.library-cover {
  width: 100%;
  aspect-ratio: 16 / 9; /* 横向比例，适合媒体库封面 */
  overflow: hidden;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.library-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-cover {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: white;
}

.no-cover .el-icon {
  font-size: 48px;
}

.library-info {
  padding: 12px;
}

.library-info h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.library-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.library-count {
  font-size: 12px;
  color: #909399;
}

.libraries-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  color: #909399;
}

.libraries-loading .el-icon {
  font-size: 24px;
}
</style>
