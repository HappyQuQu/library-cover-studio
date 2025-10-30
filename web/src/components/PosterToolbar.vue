<template>
  <div class="poster-toolbar">
    <el-scrollbar>
      <div class="toolbar-section">
        <h4>背景设置</h4>
        <div class="background-controls">
          <el-color-picker 
            v-model="backgroundColor" 
            @change="handleBackgroundColorChange"
            show-alpha
          />
          <el-button size="small" @click="showImageUpload = true">
            <el-icon><Picture /></el-icon>
            背景图片
          </el-button>
        </div>
      </div>
      
      <div class="toolbar-section">
        <h4>添加元素</h4>
        <div class="element-buttons">
          <el-button type="primary" @click="handleAddText">
            <el-icon><Edit /></el-icon>
            添加文字
          </el-button>
          <el-button @click="showImageUpload = true">
            <el-icon><Picture /></el-icon>
            添加图片
          </el-button>
          <el-button @click="addShape('rect')">
            <el-icon><Grid /></el-icon>
            矩形
          </el-button>
          <el-button @click="addShape('circle')">
            <el-icon><CirclePlus /></el-icon>
            圆形
          </el-button>
        </div>
      </div>
      
      <div class="toolbar-section">
        <h4>模板操作</h4>
        <div class="template-buttons">
          <el-button type="success" @click="$emit('save-template')">
            <el-icon><Check /></el-icon>
            保存模板
          </el-button>
          <el-button @click="loadTemplate">
            <el-icon><Folder /></el-icon>
            加载模板
          </el-button>
          <el-button @click="exportPoster">
            <el-icon><Download /></el-icon>
            导出海报
          </el-button>
        </div>
      </div>
    </el-scrollbar>
    
    <!-- 图片上传对话框 -->
    <el-dialog v-model="showImageUpload" title="上传图片" width="500px">
      <el-upload
        class="upload-demo"
        drag
        accept="image/*"
        :auto-upload="false"
        :on-change="handleImageUpload"
      >
        <el-icon class="el-icon--upload"><Upload /></el-icon>
        <div class="el-upload__text">
          将图片拖拽到此处，或<em>点击上传</em>
        </div>
      </el-upload>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { 
  Edit, Picture, Grid, CirclePlus, Check, 
  Folder, Download, Upload 
} from '@element-plus/icons-vue'

// 事件定义
const emit = defineEmits([
  'add-text',
  'add-image', 
  'change-background',
  'save-template'
])

// 响应式数据
const backgroundColor = ref('#ffffff')
const showImageUpload = ref(false)

// 背景颜色改变
const handleBackgroundColorChange = (color: string) => {
  emit('change-background', color)
}

// 添加文字
const handleAddText = () => {
  emit('add-text', '双击编辑文字')
}

// 图片上传
const handleImageUpload = (file: any) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    if (e.target?.result) {
      emit('add-image', e.target.result as string)
      showImageUpload.value = false
    }
  }
  reader.readAsDataURL(file.raw)
}

// 添加形状
const addShape = (type: string) => {
  // 这里可以扩展形状类型
  console.log('添加形状:', type)
}

// 加载模板
const loadTemplate = () => {
  // 实现模板加载逻辑
  console.log('加载模板')
}

// 导出海报
const exportPoster = () => {
  // 实现海报导出逻辑
  console.log('导出海报')
}
</script>

<style scoped>
.poster-toolbar {
  height: 100%;
  padding: 20px;
}

.toolbar-section {
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e9ecef;
}

.toolbar-section:last-child {
  border-bottom: none;
}

.toolbar-section h4 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 14px;
  font-weight: 600;
}

.background-controls {
  display: flex;
  gap: 10px;
  align-items: center;
}

.element-buttons,
.template-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.element-buttons .el-button,
.template-buttons .el-button {
  justify-content: flex-start;
}

.upload-demo {
  width: 100%;
}
</style>