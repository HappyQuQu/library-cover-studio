<template>
  <div class="scheduled-tasks-view">
    <div class="header">
      <h2>{{ t('scheduledTasks.title') }}</h2>
      <el-button type="primary" @click="showAddDialog">
        <el-icon><Plus /></el-icon>
        {{ t('scheduledTasks.createTask') }}
      </el-button>
    </div>

    <el-table :data="tasks" v-loading="loading" style="width: 100%">
      <el-table-column prop="name" :label="t('scheduledTasks.taskName')" width="200" />
      <el-table-column prop="media_source_name" :label="t('scheduledTasks.mediaSource')" width="150" />
      <el-table-column prop="cron_expression" :label="t('scheduledTasks.schedule')" width="150" />
      <el-table-column prop="is_active" :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'">
            {{ row.is_active ? t('scheduledTasks.running') : t('scheduledTasks.stopped') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="last_run" :label="t('scheduledTasks.lastRun')" width="180">
        <template #default="{ row }">
          {{ formatDate(row.last_run) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('scheduledTasks.statistics')" width="150">
        <template #default="{ row }">
          <span style="color: #67c23a">{{ row.success_count }}</span> /
          <span style="color: #f56c6c">{{ row.error_count }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="380" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="triggerTask(row)">{{ t('scheduledTasks.runNow') }}</el-button>
          <el-button size="small" @click="toggleTask(row)">
            {{ row.is_active ? t('scheduledTasks.stop') : t('scheduledTasks.start') }}
          </el-button>
          <el-button size="small" @click="viewHistory(row)">{{ t('scheduledTasks.viewHistory') || '历史' }}</el-button>
          <el-button size="small" @click="editTask(row)">{{ t('common.edit') }}</el-button>
          <el-button size="small" type="danger" @click="deleteTask(row)"
            >{{ t('common.delete') }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <!-- 执行历史对话框 -->
    <el-dialog
      v-model="historyVisible"
      :title="t('scheduledTasks.executionHistory') || '任务执行历史'"
      width="900px"
    >
      <el-table :data="historyList" v-loading="historyLoading" height="400px">
        <el-table-column prop="started_at" :label="t('scheduledTasks.startTime') || '开始时间'" width="180">
          <template #default="{ row }">
            {{ formatDate(row.started_at) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" :label="t('common.status')" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'completed' ? 'success' : (row.status === 'failed' ? 'danger' : 'info')">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="processed_items" :label="t('scheduledTasks.processed') || '已处理'" width="100" />
        <el-table-column prop="failed_items" :label="t('scheduledTasks.failed') || '失败'" width="100" />
        <el-table-column prop="error_message" :label="t('common.error') || '错误信息'" show-overflow-tooltip />
      </el-table>
    </el-dialog>

    <!-- 创建/编辑任务对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="1100px"
      top="5vh"
      @close="resetForm"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="120px">
        <el-form-item :label="t('scheduledTasks.taskName')" prop="name">
          <el-input v-model="form.name" :placeholder="t('scheduledTasks.taskNamePlaceholder')" />
        </el-form-item>

        <el-form-item :label="t('scheduledTasks.mediaSource')" prop="mediaSourceId">
          <el-select
            v-model="form.mediaSourceId"
            :placeholder="t('scheduledTasks.selectMediaSource')"
            @change="onMediaSourceChange"
            style="width: 100%"
          >
            <el-option
              v-for="source in mediaSources"
              :key="source.id"
              :label="source.name"
              :value="source.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="媒体库配置" v-if="libraries.length > 0" class="full-width-item">
          <div class="library-grid">
            <el-card
              v-for="lib in libraries"
              :key="lib.id"
              class="library-config-card"
              :class="{ 'active': form.libraryConfigs[lib.id]?.templateId }"
              shadow="hover"
            >
              <template #header>
                <div class="lib-header">
                  <div class="lib-info">
                    <el-icon class="lib-icon"><Folder /></el-icon>
                    <span class="lib-name">{{ lib.name }}</span>
                  </div>
                  <el-tag size="small" type="info">未配置</el-tag>
                </div>
              </template>
              
              <div class="lib-content">
                <div class="config-section">
                  <span class="section-label">选择模板</span>
                  <el-select
                    v-model="form.libraryConfigs[lib.id].templateId"
                    :placeholder="t('scheduledTasks.selectTemplate')"
                    clearable
                    style="width: 100%"
                  >
                    <el-option
                      v-for="tpl in templates"
                      :key="tpl.id"
                      :label="tpl.name"
                      :value="tpl.id"
                    />
                  </el-select>
                </div>

                <div v-if="form.libraryConfigs[lib.id].templateId && getTemplatePreview(form.libraryConfigs[lib.id].templateId)" class="template-preview">
                  <el-image 
                    :src="getTemplatePreview(form.libraryConfigs[lib.id].templateId)" 
                    fit="cover" 
                    class="preview-image"
                  >
                    <template #error>
                      <div class="image-slot">
                        <el-icon><Picture /></el-icon>
                      </div>
                    </template>
                  </el-image>
                </div>

                <template v-if="form.libraryConfigs[lib.id].templateId">
                  <div class="config-divider"></div>
                  
                  <div class="config-section">
                    <span class="section-label">文字替换 (可选)</span>
                    <div class="text-inputs">
                      <el-input 
                        v-model="form.libraryConfigs[lib.id].primary" 
                        placeholder="第一文字 ({{primary_title}})" 
                        size="small"
                      >
                        <template #prefix>主</template>
                      </el-input>
                      <el-input 
                        v-model="form.libraryConfigs[lib.id].secondary" 
                        placeholder="第二文字 ({{secondary_title}})" 
                        size="small"
                        style="margin-top: 8px"
                      >
                        <template #prefix>副</template>
                      </el-input>
                    </div>
                  </div>
                </template>
              </div>
            </el-card>
          </div>
        </el-form-item>

        <el-form-item label="Cron表达式" prop="cronExpression">
          <el-input v-model="form.cronExpression" placeholder="0 0 * * *">
            <template #append>
              <el-select v-model="form.cronExpression" style="width: 150px">
                <el-option label="每天午夜" value="0 0 * * *" />
                <el-option label="每天2点" value="0 2 * * *" />
                <el-option label="每6小时" value="0 */6 * * *" />
                <el-option label="每周日" value="0 0 * * 0" />
                <el-option label="每月1号" value="0 0 1 * *" />
              </el-select>
            </template>
          </el-input>
          <div class="form-tip">分 时 日 月 周 (例: 0 0 * * * = 每天午夜)</div>
        </el-form-item>

        <el-form-item label="下载封面数量">
          <el-input-number v-model="form.posterCount" :min="1" :max="20" />
          <div class="form-tip">
            每个媒体库下载的封面图片数量,需与模板占位符数量匹配
          </div>
        </el-form-item>

        <el-form-item label="排序方式">
          <el-select v-model="form.sortBy">
            <el-option label="最新添加" value="DateCreated" />
            <el-option label="按名称" value="SortName" />
            <el-option label="随机" value="Random" />
          </el-select>
        </el-form-item>

        <el-form-item label="上传海报">
          <el-switch
            v-model="form.uploadEnabled"
            active-text="自动上传到媒体服务器"
            inactive-text="仅生成不上传"
          />
        </el-form-item>

        <!-- Removed global text replacement section -->

        <el-form-item label="任务状态">
          <el-switch
            v-model="form.isActive"
            active-text="启用"
            inactive-text="禁用"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Plus, Folder, Picture } from "@element-plus/icons-vue";
import axios from "axios";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "../stores/auth";

const { t } = useI18n();
const authStore = useAuthStore();

const API_BASE = "http://localhost:3001/api";

// 带有认证头的 Axios 辅助函数
const authAxios = {
  get: (url) => axios.get(url, { headers: { Authorization: `Bearer ${authStore.token}` } }),
  post: (url, data) => axios.post(url, data, { headers: { Authorization: `Bearer ${authStore.token}` } }),
  put: (url, data) => axios.put(url, data, { headers: { Authorization: `Bearer ${authStore.token}` } }),
  delete: (url) => axios.delete(url, { headers: { Authorization: `Bearer ${authStore.token}` } }),
};

// 数据
const loading = ref(false);
const submitting = ref(false);
const tasks = ref([]);
const mediaSources = ref([]);
const templates = ref([]);
const libraries = ref([]);
const dialogVisible = ref(false);
const dialogTitle = ref(t('scheduledTasks.createTask'));
const editingId = ref(null);
const formRef = ref(null);

// 历史数据
const historyVisible = ref(false);
const historyLoading = ref(false);
const historyList = ref([]);

// 表单
const form = reactive({
  name: "",
  mediaSourceId: "",
  mediaSourceId: "",
  libraryConfigs: {}, // { libId: { templateId, primary, secondary } }
  cronExpression: "0 0 * * *",
  posterCount: 9,
  sortBy: "DateCreated",
  uploadEnabled: true,
  isActive: true,
});

// 验证规则
const rules = {
  name: [{ required: true, message: "请输入任务名称", trigger: "blur" }],
  mediaSourceId: [
    { required: true, message: "请选择媒体源", trigger: "change" },
  ],
  cronExpression: [
    { required: true, message: "请输入Cron表达式", trigger: "blur" },
  ],
};

// 加载任务列表
const loadTasks = async () => {
  loading.value = true;
  try {
    const response = await authAxios.get(`${API_BASE}/scheduled-tasks`);
    // API returns array directly
    tasks.value = Array.isArray(response.data) ? response.data : (response.data.data || []);
  } catch (error) {
    ElMessage.error("加载任务列表失败: " + error.message);
  } finally {
    loading.value = false;
  }
};

// 加载媒体源列表
const loadMediaSources = async () => {
  try {
    const response = await authAxios.get(`${API_BASE}/media-sources`);
    mediaSources.value = response.data.data.filter((s) => s.is_active) || [];
  } catch (error) {
    ElMessage.error("加载媒体源列表失败: " + error.message);
  }
};

// 加载模板列表
const loadTemplates = async () => {
  try {
    const response = await authAxios.get(`${API_BASE}/templates`);
    // API returns { templates: [...] }
    templates.value = response.data.templates || response.data.data || [];
  } catch (error) {
    ElMessage.error("加载模板列表失败: " + error.message);
  }
};

// 媒体源变更时加载媒体库
const onMediaSourceChange = async (sourceId) => {
  if (!sourceId) {
    libraries.value = [];
    return;
  }

  try {
    const response = await authAxios.get(
      `${API_BASE}/media-sources/${sourceId}/libraries`
    );
    libraries.value = response.data.data || [];

    // 初始化库配置
    form.libraryConfigs = {};
    libraries.value.forEach(lib => {
      form.libraryConfigs[lib.id] = { templateId: "", primary: "", secondary: "" };
    });
  } catch (error) {
    ElMessage.error("加载媒体库失败: " + error.message);
    libraries.value = [];
  }
};

// 显示添加对话框
const showAddDialog = async () => {
  dialogTitle.value = t('scheduledTasks.createTask');
  editingId.value = null;
  resetForm();
  await loadMediaSources();
  await loadTemplates();
  dialogVisible.value = true;
};

// 编辑任务
const editTask = async (row) => {
  try {
    const response = await authAxios.get(`${API_BASE}/scheduled-tasks/${row.id}`);
    const data = response.data.data;

    await loadMediaSources();
    await loadTemplates();

    dialogTitle.value = t('scheduledTasks.editTask');
    editingId.value = row.id;
    form.name = data.name;
    form.mediaSourceId = data.media_source_id;
    form.cronExpression = data.cron_expression;
    form.posterCount = data.poster_count;
    form.sortBy = data.sort_by;
    form.uploadEnabled = data.upload_enabled;
    form.isActive = data.is_active;

    // 加载媒体库
    await onMediaSourceChange(data.media_source_id);

    // 解析映射和配置
    try {
      const mapping = typeof data.library_template_mapping === 'string' 
        ? JSON.parse(data.library_template_mapping || "{}")
        : (data.library_template_mapping || {});
        
      const replacements = typeof data.text_replacements === 'string'
        ? JSON.parse(data.text_replacements || "{}")
        : (data.text_replacements || {});

      // 填充 libraryConfigs
      form.libraryConfigs = {};
      libraries.value.forEach(lib => {
        const libId = lib.id;
        // Check if replacements is per-library (new format) or global (old format support)
        let primary = "";
        let secondary = "";
        
        if (replacements[libId]) {
           primary = replacements[libId].primary || "";
           secondary = replacements[libId].secondary || "";
        } else if (replacements.primary_title || replacements.secondary_title) {
           // Fallback to old global format if present and per-library not found
           // But mostly we just init empty
        }

        form.libraryConfigs[libId] = {
          templateId: mapping[libId] || "",
          primary: primary,
          secondary: secondary
        };
      });
    } catch (e) {
      console.error("解析配置失败", e);
      form.libraryConfigs = {};
    }

    dialogVisible.value = true;
  } catch (error) {
    ElMessage.error("加载任务详情失败: " + error.message);
  }
};

// 提交表单
const submitForm = async () => {
  try {
    await formRef.value.validate();

    // 转换 libraryConfigs 为后端需要的格式
    const libraryTemplateMapping = {};
    const textReplacements = {};
    const mappedLibraries = [];

    // 遍历所有库配置
    for (const [libId, config] of Object.entries(form.libraryConfigs)) {
      if (config.templateId) {
        libraryTemplateMapping[libId] = config.templateId;
        textReplacements[libId] = {
          primary: config.primary,
          secondary: config.secondary
        };
        mappedLibraries.push(libId);
      }
    }

    if (mappedLibraries.length === 0) {
      ElMessage.warning("请至少为一个媒体库选择模板");
      return;
    }

    submitting.value = true;
    const data = {
      name: form.name,
      mediaSourceId: form.mediaSourceId,
      libraryTemplateMapping,
      textReplacements,
      cronExpression: form.cronExpression,
      posterCount: form.posterCount,
      sortBy: form.sortBy,
      uploadEnabled: form.uploadEnabled,
      isActive: form.isActive,
    };

    if (editingId.value) {
      // 更新
      await authAxios.put(`${API_BASE}/scheduled-tasks/${editingId.value}`, data);
      ElMessage.success("更新成功");
    } else {
      // 创建
      await authAxios.post(`${API_BASE}/scheduled-tasks`, data);
      ElMessage.success("创建成功");
    }

    dialogVisible.value = false;
    loadTasks();
  } catch (error) {
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

// 手动触发任务
const triggerTask = async (row) => {
  try {
    await authAxios.post(`${API_BASE}/scheduled-tasks/${row.id}/trigger`);
    ElMessage.success("任务已触发,正在后台执行");
  } catch (error) {
    ElMessage.error("触发任务失败: " + error.message);
  }
};

// 查看执行历史
const viewHistory = async (row) => {
  historyVisible.value = true;
  historyLoading.value = true;
  try {
    const response = await authAxios.get(`${API_BASE}/scheduled-tasks/${row.id}/executions`);
    historyList.value = response.data.data || [];
  } catch (error) {
    ElMessage.error("加载执行历史失败: " + error.message);
  } finally {
    historyLoading.value = false;
  }
};

// 启用/禁用任务
const toggleTask = async (row) => {
  try {
    const response = await authAxios.post(
      `${API_BASE}/scheduled-tasks/${row.id}/toggle`
    );
    ElMessage.success(response.data.message);
    loadTasks();
  } catch (error) {
    ElMessage.error("操作失败: " + error.message);
  }
};

// 删除任务
const deleteTask = async (row) => {
  try {
    await ElMessageBox.confirm(`确定要删除任务 "${row.name}" 吗?`, "确认删除", {
      type: "warning",
    });

    await authAxios.delete(`${API_BASE}/scheduled-tasks/${row.id}`);
    ElMessage.success("删除成功");
    loadTasks();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error("删除失败: " + error.message);
    }
  }
};

// 重置表单
const resetForm = () => {
  form.name = "";
  form.mediaSourceId = "";
  form.libraryConfigs = {};
  form.cronExpression = "0 0 * * *";
  form.posterCount = 9;
  form.sortBy = "DateCreated";
  form.uploadEnabled = true;
  form.isActive = true;
  libraries.value = [];
  formRef.value?.clearValidate();
};

// 获取模板预览图
const getTemplatePreview = (templateId) => {
  if (!templateId) return null;
  const tpl = templates.value.find(t => t.id === templateId);
  if (!tpl || !tpl.preview_url) return null;
  
  const baseUrl = API_BASE.replace('/api', '');
  const previewPath = tpl.preview_url.startsWith('/') ? tpl.preview_url : `/${tpl.preview_url}`;
  return `${baseUrl}${previewPath}`;
};

// 格式化日期
const formatDate = (date) => {
  if (!date) return "-";
  return new Date(date).toLocaleString("zh-CN");
};

// 初始化
onMounted(() => {
  loadTasks();
});
</script>

<style scoped>
.scheduled-tasks-view {
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

.library-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  width: 100%;
  max-height: 50vh;
  overflow-y: auto;
  padding: 4px; /* Prevent shadow cutout */
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background-color: var(--el-fill-color-extra-light);
}

.library-config-card {
  transition: all 0.3s;
  border: 1px solid var(--el-border-color-lighter);
  /* Remove individual card border since container has one, or keep for card definition */
}

.library-config-card.active {
  border-color: var(--el-color-primary-light-5);
  background-color: var(--el-color-primary-light-9);
}

.lib-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lib-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.lib-content {
  padding-top: 10px;
}

.config-section {
  margin-bottom: 12px;
}

.section-label {
  display: block;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.config-divider {
  height: 1px;
  background-color: var(--el-border-color-lighter);
  margin: 12px 0;
}

.full-width-item :deep(.el-form-item__content) {
  display: block;
}

.template-preview {
  margin: 10px 0;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  height: 120px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--el-fill-color-light);
}

.preview-image {
  width: 100%;
  height: 100%;
}

.image-slot {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 20px;
}
</style>
