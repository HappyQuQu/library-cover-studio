<template>
  <div class="templates-view">
    <el-container>
      <el-header class="page-header">
        <div class="header-content">
          <h2>模板管理</h2>
          <el-button type="primary" @click="showCreateDialog = true">
            <el-icon><Plus /></el-icon>
            新建模板
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
                placeholder="搜索模板名称或描述"
                @input="handleSearch"
                clearable
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
              </el-input>
            </el-col>
            <el-col :span="6">
              <el-select v-model="filterTag" placeholder="按标签过滤" clearable>
                <el-option
                  v-for="tag in availableTags"
                  :key="tag"
                  :label="tag"
                  :value="tag"
                />
              </el-select>
            </el-col>
            <el-col :span="6">
              <el-select v-model="sortBy" placeholder="排序方式">
                <el-option label="最近创建" value="created_at" />
                <el-option label="最近更新" value="updated_at" />
                <el-option label="名称" value="name" />
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
                :src="template.preview_url"
                :alt="template.name"
                @error="handleImageError"
              />
              <div v-else class="no-preview">
                <el-icon size="40"><Picture /></el-icon>
                <p>无预览</p>
              </div>
            </div>

            <div class="template-info">
              <h3>{{ template.name }}</h3>
              <p class="description">
                {{ template.description || "暂无描述" }}
              </p>

              <div
                class="template-tags"
                v-if="template.tags && template.tags.length"
              >
                <el-tag
                  v-for="tag in template.tags"
                  :key="tag"
                  size="small"
                  type="info"
                >
                  {{ tag }}
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

        <!-- 分页 -->
        <div class="pagination-wrapper">
          <el-pagination
            v-model:current-page="currentPage"
            v-model:page-size="pageSize"
            :page-sizes="[12, 24, 48]"
            :total="total"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="handleSizeChange"
            @current-change="handleCurrentChange"
          />
        </div>
      </el-main>
    </el-container>

    <!-- 创建模板对话框 -->
    <el-dialog v-model="showCreateDialog" title="创建新模板" width="500px">
      <el-form :model="newTemplate" :rules="templateRules" ref="templateForm">
        <el-form-item label="模板名称" prop="name">
          <el-input v-model="newTemplate.name" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="newTemplate.description"
            type="textarea"
            :rows="3"
          />
        </el-form-item>
        <el-form-item label="标签">
          <el-input
            v-model="tagInput"
            placeholder="输入标签，按回车添加"
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
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" @click="createTemplate">创建并设计</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import {
  Plus,
  Search,
  Picture,
  Edit,
  CopyDocument,
  Delete,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { API_ENDPOINTS } from "../config/api";

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

const router = useRouter();

// 响应式数据
const loading = ref(false);
const templates = ref<Template[]>([]);
const searchQuery = ref("");
const filterTag = ref("");
const sortBy = ref("updated_at");
const currentPage = ref(1);
const pageSize = ref(12);
const total = ref(0);

const showCreateDialog = ref(false);
const newTemplate = ref({
  name: "",
  description: "",
  tags: [] as string[],
});
const tagInput = ref("");

// 表单规则
const templateRules = {
  name: [{ required: true, message: "请输入模板名称", trigger: "blur" }],
};

// 计算属性
const availableTags = computed(() => {
  const tags = new Set<string>();
  templates.value.forEach((template) => {
    if (template.tags) {
      template.tags.forEach((tag) => tags.add(tag));
    }
  });
  return Array.from(tags);
});

// 生命周期
onMounted(() => {
  loadTemplates();
});

// 方法
const loadTemplates = async () => {
  try {
    loading.value = true;

    const params = {
      page: currentPage.value,
      limit: pageSize.value,
      search: searchQuery.value || undefined,
      tag: filterTag.value || undefined,
      sortBy: sortBy.value || undefined,
    };

    // 构建查询字符串
    const queryString = new URLSearchParams(
      Object.entries(params)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    ).toString();

    // 调用API
    const response = await fetch(
      `${API_ENDPOINTS.templates.base}?${queryString}`
    );
    if (!response.ok) throw new Error("加载模板失败");

    const data = await response.json();

    // 后端返回格式: { templates: [...], pagination: {...} }
    if (data.templates) {
      templates.value = data.templates || [];
      total.value = data.pagination?.total || 0;
    } else {
      throw new Error("数据格式错误");
    }
  } catch (error) {
    console.error("加载模板失败:", error);
    ElMessage.error("加载模板失败");
  } finally {
    loading.value = false;
  }
};

const handleSearch = () => {
  currentPage.value = 1;
  loadTemplates();
};

const handleSizeChange = () => {
  currentPage.value = 1;
  loadTemplates();
};

const handleCurrentChange = () => {
  loadTemplates();
};

const selectTemplate = (template: Template) => {
  // 跳转到设计器并加载模板
  router.push(`/designer?templateId=${template.id}`);
};

const editTemplate = (template: Template) => {
  // 跳转到设计器编辑模式
  router.push(`/designer?templateId=${template.id}&mode=edit`);
};

const duplicateTemplate = async (template: Template) => {
  try {
    const response = await fetch(
      API_ENDPOINTS.templates.duplicate(template.id),
      {
        method: "POST",
      }
    );

    if (!response.ok) throw new Error("复制模板失败");

    // 后端直接返回新模板对象
    const data = await response.json();
    if (data.id) {
      ElMessage.success("模板复制成功");
      loadTemplates();
    } else {
      throw new Error("复制模板失败");
    }
  } catch (error) {
    console.error("复制模板失败:", error);
    ElMessage.error("模板复制失败");
  }
};

const deleteTemplate = async (template: Template) => {
  try {
    await ElMessageBox.confirm(
      `确定删除模板"${template.name}"吗？`,
      "确认删除",
      {
        type: "warning",
      }
    );

    const response = await fetch(API_ENDPOINTS.templates.byId(template.id), {
      method: "DELETE",
    });

    if (!response.ok) throw new Error("删除模板失败");

    // 后端返回 { message: "模板已删除" }
    const data = await response.json();
    if (data.message) {
      ElMessage.success("模板删除成功");
      loadTemplates();
    } else {
      throw new Error("删除模板失败");
    }
    loadTemplates();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error("模板删除失败");
    }
  }
};

const createTemplate = async () => {
  try {
    // 验证表单
    // await templateForm.value.validate()

    // 创建模板并跳转到设计器
    router.push("/designer?mode=new");
    showCreateDialog.value = false;
  } catch (error) {
    ElMessage.error("创建模板失败");
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
  background: white;
  border-bottom: 1px solid #e9ecef;
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
  color: #333;
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
  background: white;
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
  background: #f5f5f5;
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
  color: #999;
}

.template-info {
  padding: 15px;
}

.template-info h3 {
  margin: 0 0 8px 0;
  font-size: 16px;
  color: #333;
}

.description {
  color: #666;
  font-size: 14px;
  line-height: 1.4;
  margin: 0 0 12px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.template-tags {
  margin: 8px 0;
}

.template-tags .el-tag {
  margin-right: 5px;
}

.template-meta {
  font-size: 12px;
  color: #999;
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
