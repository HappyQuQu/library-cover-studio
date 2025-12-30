<template>
  <div class="templates-view">
    <el-container>
      <el-header class="page-header">
        <div class="header-content">
          <h2>{{ t('templates.title') }}</h2>
          <el-button type="primary" @click="showCreateDialog = true">
            <el-icon><Plus /></el-icon>
            {{ t('templates.newTemplate') }}
          </el-button>
        </div>
      </el-header>

      <el-main>
        <!-- 搜索和过滤 -->
        <div class="search-bar">
          <el-row :gutter="20">
            <el-col :span="8">
              <el-input
                v-model="searchQuery"
                :placeholder="t('templates.searchPlaceholder')"
                @input="handleSearch"
                clearable
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
            </el-col>
            <el-col :span="6">
              <el-select v-model="filterTag" :placeholder="t('templates.filterByTag')" clearable>
                <el-option
                  v-for="tag in availableTags"
                  :key="tag"
                  :label="tag"
                  :value="tag"
                />
              </el-select>
            </el-col>
            <el-col :span="6">
              <el-select v-model="sortBy" :placeholder="t('templates.sortBy')">
                <el-option :label="t('templates.sortByCreated')" value="created_at" />
                <el-option :label="t('templates.sortByUpdated')" value="updated_at" />
                <el-option :label="t('templates.sortByName')" value="name" />
              </el-select>
            </el-col>
          </el-row>
        </div>

        <!-- 模板网格 -->
        <div class="templates-grid" v-loading="loading">
          <div
            v-for="template in templates"
            :key="template.id"
            class="template-card"
            @click="selectTemplate(template)"
          >
            <div class="template-preview">
              <img
                v-if="template.preview_url"
                :src="getPreviewUrl(template.preview_url)"
                :alt="template.name"
                @error="handleImageError"
              />
              <div v-else class="no-preview">
                <el-icon size="40"><Picture /></el-icon>
                <p>{{ t('templates.noPreview') }}</p>
              </div>
            </div>

            <div class="template-info">
              <h3>{{ template.name }}</h3>
              <p class="description">
                {{ template.description || t('templates.descriptionPlaceholder') }}
              </p>

              <div
                class="template-tags"
                v-if="parseTags(template.tags).length > 0"
              >
                <el-tag
                  v-for="tag in parseTags(template.tags)"
                  :key="tag"
                  size="small"
                  type="info"
                >
                  {{ tag }}
                </el-tag>
              </div>
              <div
                class="template-match-tags"
                v-if="
                  template.match_tags &&
                  (Array.isArray(template.match_tags)
                    ? template.match_tags.length
                    : true)
                "
              >
                <span style="font-size: 12px; color: #909399; margin-right: 4px"
                  >{{ t('templates.matchTags') }}:</span
                >
                <el-tag
                  v-for="mtag in parseMatchTags(template.match_tags)"
                  :key="mtag"
                  size="small"
                  type="success"
                  effect="dark"
                  style="margin-right: 4px"
                >
                  {{ mtag }}
                </el-tag>
              </div>

              <div class="template-meta">
                <span class="create-time">
                  {{ formatDate(template.created_at) }}
                </span>
              </div>
            </div>

            <div class="template-actions">
              <el-button-group>
                <el-button size="small" @click.stop="editTemplate(template)">
                  <el-icon><Edit /></el-icon>
                </el-button>
                <el-button
                  size="small"
                  @click.stop="duplicateTemplate(template)"
                >
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
                <el-button
                  size="small"
                  type="danger"
                  @click.stop="deleteTemplate(template)"
                >
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-button-group>
            </div>
          </div>
        </div>
      </el-main>
    </el-container>

    <!-- 创建模板对话框 -->
    <el-dialog v-model="showCreateDialog" :title="t('templates.createNew')" width="500px">
      <el-form :model="newTemplate" :rules="templateRules" ref="templateForm">
        <el-form-item :label="t('templates.templateName')" prop="name">
          <el-input v-model="newTemplate.name" />
        </el-form-item>
        <el-form-item :label="t('templates.description')" prop="description">
          <el-input
            v-model="newTemplate.description"
            type="textarea"
            :rows="3"
          />
        </el-form-item>
        <el-form-item :label="t('templates.tags')">
          <el-input
            v-model="tagInput"
            :placeholder="t('templates.addTag')"
            @keyup.enter="addTag"
          />
          <div class="tag-list">
            <el-tag
              v-for="tag in newTemplate.tags"
              :key="tag"
              closable
              @close="removeTag(tag)"
            >
              {{ tag }}
            </el-tag>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showCreateDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="createTemplate">{{ t('templates.saveAndDesign') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  Plus,
  Search,
  Picture,
  Edit,
  CopyDocument,
  Delete,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { API_ENDPOINTS, API_BASE_URL } from "../config/api";
import axios from "axios";
import { useAuthStore } from "../stores/auth";

const { t } = useI18n();
const authStore = useAuthStore();

// 带有认证头的 Axios 辅助函数
const authAxios = {
  get: (url, config = {}) => axios.get(url, { ...config, headers: { ...config.headers, Authorization: `Bearer ${authStore.token}` } }),
  post: (url, data, config = {}) => axios.post(url, data, { ...config, headers: { ...config.headers, Authorization: `Bearer ${authStore.token}` } }),
  put: (url, data, config = {}) => axios.put(url, data, { ...config, headers: { ...config.headers, Authorization: `Bearer ${authStore.token}` } }),
  delete: (url, config = {}) => axios.delete(url, { ...config, headers: { ...config.headers, Authorization: `Bearer ${authStore.token}` } }),
};

// 模板类型定义
interface Template {
  id: string;
  name: string;
  description?: string;
  preview_url?: string;
  tags?: string[];
  created_at: string;
  updated_at?: string;
}

// 解析 match_tags 字段（兼容字符串/数组）
function parseMatchTags(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const arr = JSON.parse(val);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return [];
}

// 解析 tags 字段（兼容字符串/数组）
function parseTags(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const arr = JSON.parse(val);
      return Array.isArray(arr) ? arr : [];
    } catch {
      // 如果 JSON 解析失败，尝试按逗号分割
      return val.split(",").filter(Boolean);
    }
  }
  return [];
}

const router = useRouter();

// 响应式数据
const loading = ref(false);
const templates = ref<Template[]>([]);
const searchQuery = ref("");
const filterTag = ref("");
const sortBy = ref("updated_at");
const showCreateDialog = ref(false);
const newTemplate = ref({
  name: "",
  description: "",
  tags: [] as string[],
});
const tagInput = ref("");

// 表单规则
const templateRules = {
  name: [{ required: true, message: t('templates.templateNamePlaceholder'), trigger: "blur" }],
};

// 计算属性
const availableTags = computed(() => {
  const tags = new Set<string>();
  templates.value.forEach((template) => {
    if (template.tags) {
      // 解析 tags（可能是字符串或数组）
      let tagList: string[] = [];
      if (typeof template.tags === "string") {
        try {
          tagList = JSON.parse(template.tags);
        } catch {
          // 如果解析失败，尝试按逗号分割
          tagList = (template.tags as string).split(",").filter(Boolean);
        }
      } else if (Array.isArray(template.tags)) {
        tagList = template.tags;
      }
      tagList.forEach((tag) => tags.add(tag));
    }
  });
  return Array.from(tags);
});

// 生命周期
onMounted(() => {
  loadTemplates();
});

// 方法
// 构建预览图完整URL
const getPreviewUrl = (previewUrl: string) => {
  if (!previewUrl) return "";
  // 如果已经是完整URL（http/https开头），直接返回
  if (previewUrl.startsWith("http://") || previewUrl.startsWith("https://")) {
    return previewUrl;
  }
  // 否则拼接API基础URL
  // 开发环境下，由于使用了Vite代理，直接使用相对路径即可
  // 生产环境下，需要拼接完整的API基础URL
  return `${API_BASE_URL}${previewUrl}`;
};

const loadTemplates = async () => {
  try {
    loading.value = true;

    const params = {
      search: searchQuery.value || undefined,
      tag: filterTag.value || undefined,
      sortBy: sortBy.value || undefined,
    };

    // 调用API
    const response = await authAxios.get(API_ENDPOINTS.templates.base, { params });
    const data = response.data;

    // 后端返回格式: { templates: [...] }
    if (data.templates) {
      templates.value = data.templates || [];
    } else {
      throw new Error(t('templates.loadFailed'));
    }
  } catch (error) {
    console.error(t('templates.loadFailed'), error);
    ElMessage.error(t('templates.loadFailed'));
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  loadTemplates();
};

// 当标签过滤或排序方式变化时，重新加载数据
watch(filterTag, () => {
  loadTemplates();
});

watch(sortBy, () => {
  loadTemplates();
});

const selectTemplate = (template: Template) => {
  // 跳转到设计器并加载模板
  router.push(`/app/designer?templateId=${template.id}`);
};

const editTemplate = (template: Template) => {
  // 跳转到设计器编辑模式
  router.push(`/app/designer?templateId=${template.id}&mode=edit`);
};

const duplicateTemplate = async (template: Template) => {
  try {
    const response = await authAxios.post(
      API_ENDPOINTS.templates.duplicate(template.id),
      {}
    );

    // 后端直接返回新模板对象
    const data = response.data;
    if (data.id) {
      ElMessage.success(t('templates.duplicateSuccess'));
      loadTemplates();
    } else {
      throw new Error(t('templates.duplicateFailed'));
    }
  } catch (error) {
    console.error(t('templates.duplicateFailed'), error);
    ElMessage.error(t('templates.duplicateFailed'));
  }
};

const deleteTemplate = async (template: Template) => {
  try {
    await ElMessageBox.confirm(
      t('templates.deleteConfirm', { name: template.name }),
      t('common.confirmDelete'),
      {
        type: "warning",
      }
    );

    const response = await authAxios.delete(API_ENDPOINTS.templates.byId(template.id));

    // 后端返回 { message: "模板已删除" }
    const data = response.data;
    if (data.message) {
      ElMessage.success(t('templates.deleteSuccess'));
      loadTemplates();
    } else {
      throw new Error(t('templates.deleteFailed'));
    }
    loadTemplates();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error(t('templates.deleteFailed'));
    }
  }
};

const createTemplate = async () => {
  try {
    // 验证表单
    // await templateForm.value.validate()

    // 创建模板并跳转到设计器
    router.push("/app/designer?mode=new");
    showCreateDialog.value = false;
  } catch (error) {
    ElMessage.error(t('templates.saveFailed'));
  }
};

const addTag = () => {
  const tag = tagInput.value.trim();
  if (tag && !newTemplate.value.tags.includes(tag)) {
    newTemplate.value.tags.push(tag);
    tagInput.value = "";
  }
};

const removeTag = (tag: string) => {
  const index = newTemplate.value.tags.indexOf(tag);
  if (index > -1) {
    newTemplate.value.tags.splice(index, 1);
  }
};

const handleImageError = (event: Event) => {
  const target = event.target as HTMLImageElement;
  target.style.display = "none";
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("zh-CN");
};
</script>

<style scoped>
.templates-view {
  height: 100vh;
}

.page-header {
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.header-content h2 {
  margin: 0;
  color: var(--text-primary);
}

.search-bar {
  margin-bottom: 30px;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.template-card {
  background: var(--bg-primary);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.template-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

.template-preview {
  height: 200px;
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.template-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.no-preview {
  text-align: center;
  color: var(--text-tertiary);
}

.template-info {
  padding: 15px;
}

.template-info h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: var(--text-primary);
}

.description {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.4;
  margin: 0 0 12px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.template-tags {
  margin: 8px 0;
}

.template-tags .el-tag {
  margin-right: 5px;
}

.template-match-tags {
  margin: 8px 0;
}

.template-match-tags .el-tag {
  margin-right: 5px;
}

.template-meta {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 10px;
}

.template-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.template-card:hover .template-actions {
  opacity: 1;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 30px;
}

.tag-list {
  margin-top: 10px;
}

.tag-list .el-tag {
  margin-right: 8px;
  margin-bottom: 8px;
}
</style>
