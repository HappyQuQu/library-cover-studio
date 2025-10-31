<template>
  <div class="scheduled-tasks-view">
    <div class="header">
      <h2>定时任务</h2>
      <el-button type="primary" @click="showAddDialog">
        <el-icon><Plus /></el-icon>
        创建任务
      </el-button>
    </div>

    <el-table :data="tasks" v-loading="loading" style="width: 100%">
      <el-table-column prop="name" label="任务名称" width="200" />
      <el-table-column prop="media_source_name" label="媒体源" width="150" />
      <el-table-column prop="cron_expression" label="执行计划" width="150" />
      <el-table-column prop="is_active" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'">
            {{ row.is_active ? "运行中" : "已停止" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="last_run" label="最后执行" width="180">
        <template #default="{ row }">
          {{ formatDate(row.last_run) }}
        </template>
      </el-table-column>
      <el-table-column label="统计" width="150">
        <template #default="{ row }">
          <span style="color: #67c23a">{{ row.success_count }}</span> /
          <span style="color: #f56c6c">{{ row.error_count }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="300" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="triggerTask(row)">执行</el-button>
          <el-button size="small" @click="toggleTask(row)">
            {{ row.is_active ? "停止" : "启动" }}
          </el-button>
          <el-button size="small" @click="editTask(row)">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteTask(row)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建/编辑任务对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="800px"
      @close="resetForm"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="120px">
        <el-form-item label="任务名称" prop="name">
          <el-input v-model="form.name" placeholder="例如: 每日更新电影海报" />
        </el-form-item>

        <el-form-item label="媒体源" prop="mediaSourceId">
          <el-select
            v-model="form.mediaSourceId"
            placeholder="选择媒体源"
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

        <el-form-item label="媒体库配置" v-if="libraries.length > 0">
          <el-card
            v-for="lib in libraries"
            :key="lib.id"
            class="library-card"
            shadow="hover"
          >
            <div class="library-item">
              <div class="library-name">
                <el-icon><Folder /></el-icon>
                {{ lib.name }}
              </div>
              <el-select
                v-model="form.libraryTemplateMapping[lib.id]"
                placeholder="选择模板"
                clearable
                style="width: 300px"
              >
                <el-option
                  v-for="tpl in templates"
                  :key="tpl.id"
                  :label="tpl.name"
                  :value="tpl.id"
                />
              </el-select>
            </div>
          </el-card>
          <el-alert
            v-if="libraries.length > 0"
            type="info"
            :closable="false"
            style="margin-top: 10px"
          >
            为每个媒体库选择对应的模板。未选择模板的媒体库将被跳过。
          </el-alert>
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

        <el-form-item label="任务状态">
          <el-switch
            v-model="form.isActive"
            active-text="启用"
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

<script setup>
import { ref, reactive, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Plus, Folder } from "@element-plus/icons-vue";
import axios from "axios";

const API_BASE = "http://localhost:3001/api";

// 数据
const loading = ref(false);
const submitting = ref(false);
const tasks = ref([]);
const mediaSources = ref([]);
const templates = ref([]);
const libraries = ref([]);
const dialogVisible = ref(false);
const dialogTitle = ref("创建任务");
const editingId = ref(null);
const formRef = ref(null);

// 表单
const form = reactive({
  name: "",
  mediaSourceId: "",
  libraryTemplateMapping: {},
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
    const response = await axios.get(`${API_BASE}/scheduled-tasks`);
    tasks.value = response.data.data || [];
  } catch (error) {
    ElMessage.error("加载任务列表失败: " + error.message);
  } finally {
    loading.value = false;
  }
};

// 加载媒体源列表
const loadMediaSources = async () => {
  try {
    const response = await axios.get(`${API_BASE}/media-sources`);
    mediaSources.value = response.data.data.filter((s) => s.is_active) || [];
  } catch (error) {
    ElMessage.error("加载媒体源列表失败: " + error.message);
  }
};

// 加载模板列表
const loadTemplates = async () => {
  try {
    const response = await axios.get(`${API_BASE}/templates`);
    templates.value = response.data.data || [];
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
    const response = await axios.get(
      `${API_BASE}/media-sources/${sourceId}/libraries`
    );
    libraries.value = response.data.data || [];

    // 重置媒体库模板映射
    form.libraryTemplateMapping = {};
  } catch (error) {
    ElMessage.error("加载媒体库失败: " + error.message);
    libraries.value = [];
  }
};

// 显示添加对话框
const showAddDialog = async () => {
  dialogTitle.value = "创建任务";
  editingId.value = null;
  resetForm();
  await loadMediaSources();
  await loadTemplates();
  dialogVisible.value = true;
};

// 编辑任务
const editTask = async (row) => {
  try {
    const response = await axios.get(`${API_BASE}/scheduled-tasks/${row.id}`);
    const data = response.data.data;

    await loadMediaSources();
    await loadTemplates();

    dialogTitle.value = "编辑任务";
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

    // 解析映射
    try {
      form.libraryTemplateMapping = JSON.parse(
        data.library_template_mapping || "{}"
      );
    } catch (e) {
      form.libraryTemplateMapping = {};
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

    // 检查是否至少配置了一个媒体库
    const mappedLibraries = Object.values(form.libraryTemplateMapping).filter(
      Boolean
    );
    if (mappedLibraries.length === 0) {
      ElMessage.warning("请至少为一个媒体库选择模板");
      return;
    }

    submitting.value = true;
    const data = {
      name: form.name,
      mediaSourceId: form.mediaSourceId,
      libraryTemplateMapping: form.libraryTemplateMapping,
      cronExpression: form.cronExpression,
      posterCount: form.posterCount,
      sortBy: form.sortBy,
      uploadEnabled: form.uploadEnabled,
      isActive: form.isActive,
    };

    if (editingId.value) {
      // 更新
      await axios.put(`${API_BASE}/scheduled-tasks/${editingId.value}`, data);
      ElMessage.success("更新成功");
    } else {
      // 创建
      await axios.post(`${API_BASE}/scheduled-tasks`, data);
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
    await axios.post(`${API_BASE}/scheduled-tasks/${row.id}/trigger`);
    ElMessage.success("任务已触发,正在后台执行");
  } catch (error) {
    ElMessage.error("触发任务失败: " + error.message);
  }
};

// 启用/禁用任务
const toggleTask = async (row) => {
  try {
    const response = await axios.post(
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

    await axios.delete(`${API_BASE}/scheduled-tasks/${row.id}`);
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
  form.libraryTemplateMapping = {};
  form.cronExpression = "0 0 * * *";
  form.posterCount = 9;
  form.sortBy = "DateCreated";
  form.uploadEnabled = true;
  form.isActive = true;
  libraries.value = [];
  formRef.value?.clearValidate();
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

.library-card {
  margin-bottom: 10px;
}

.library-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.library-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
</style>
