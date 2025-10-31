<template>
  <div class="media-sources-view">
    <div class="header">
      <h2>媒体源管理</h2>
      <el-button type="primary" @click="showAddDialog">
        <el-icon><Plus /></el-icon>
        添加媒体源
      </el-button>
    </div>

    <el-table :data="mediaSources" v-loading="loading" style="width: 100%">
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
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="testConnection(row)">测试</el-button>
          <el-button size="small" @click="viewLibraries(row)">媒体库</el-button>
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

    <!-- 媒体库列表对话框 -->
    <el-dialog
      v-model="librariesDialogVisible"
      title="媒体库列表"
      width="600px"
    >
      <el-table :data="libraries" v-loading="librariesLoading">
        <el-table-column prop="name" label="名称" />
        <el-table-column prop="type" label="类型" />
        <el-table-column prop="id" label="ID" />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Plus } from "@element-plus/icons-vue";
import axios from "axios";
import { API_ENDPOINTS } from "@/config/api";

// 数据
const loading = ref(false);
const submitting = ref(false);
const mediaSources = ref([]);
const dialogVisible = ref(false);
const dialogTitle = ref("添加媒体源");
const editingId = ref(null);
const formRef = ref(null);

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

// 媒体库列表
const librariesDialogVisible = ref(false);
const librariesLoading = ref(false);
const libraries = ref([]);

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

// 显示添加对话框
const showAddDialog = () => {
  dialogTitle.value = "添加媒体源";
  editingId.value = null;
  resetForm();
  dialogVisible.value = true;
};

// 编辑媒体源
const editSource = async (row) => {
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
  } catch (error) {
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

// 测试连接
const testConnection = async (row) => {
  const loading = ElMessage.info({
    message: "正在测试连接...",
    duration: 0,
  });

  try {
    const response = await axios.post(API_ENDPOINTS.mediaSources.test(row.id));
    loading.close();

    ElMessageBox.alert(
      `服务器名称: ${response.data.serverInfo.serverName}<br>
       版本: ${response.data.serverInfo.version}<br>
       系统: ${response.data.serverInfo.operatingSystem}`,
      "连接成功",
      {
        dangerouslyUseHTMLString: true,
        type: "success",
      }
    );
  } catch (error) {
    loading.close();
    ElMessage.error(
      "连接失败: " + (error.response?.data?.message || error.message)
    );
  }
};

// 查看媒体库
const viewLibraries = async (row) => {
  librariesDialogVisible.value = true;
  librariesLoading.value = true;
  libraries.value = [];

  try {
    const response = await axios.get(
      API_ENDPOINTS.mediaSources.libraries(row.id)
    );
    libraries.value = response.data.data || [];
  } catch (error) {
    ElMessage.error("加载媒体库失败: " + error.message);
  } finally {
    librariesLoading.value = false;
  }
};

// 删除媒体源
const deleteSource = async (row) => {
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
  } catch (error) {
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
const getTypeColor = (type) => {
  const colors = {
    jellyfin: "primary",
    emby: "success",
    plex: "warning",
  };
  return colors[type] || "info";
};

// 格式化日期
const formatDate = (date) => {
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
</style>
