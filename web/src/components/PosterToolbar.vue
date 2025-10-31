<template>
  <div class="poster-toolbar">
    <el-scrollbar>
      <div class="toolbar-section">
        <h4>背景设置</h4>
        <div class="background-controls">
          <el-radio-group v-model="backgroundType" size="small">
            <el-radio label="color">纯色</el-radio>
            <el-radio label="gradient">渐变</el-radio>
            <el-radio label="random">随机渐变</el-radio>
          </el-radio-group>
          <div v-if="backgroundType === 'color'" style="margin-top: 10px">
            <el-color-picker
              v-model="backgroundColor"
              @change="handleBackgroundColorChange"
              show-alpha
            />
          </div>
          <div
            v-if="backgroundType === 'gradient'"
            class="gradient-controls"
            style="margin-top: 10px"
          >
            <div style="margin-bottom: 8px">
              <el-color-picker v-model="gradientColor1" show-alpha />
              <span style="margin: 0 4px">→</span>
              <el-color-picker v-model="gradientColor2" show-alpha />
            </div>
            <div style="margin-bottom: 8px; width: 100%">
              <el-select
                v-model="gradientDirection"
                placeholder="选择渐变方向"
                class="wide-select"
                :teleported="true"
              >
                <el-option label="左→右" value="leftToRight" />
                <el-option label="上→下" value="topToBottom" />
                <el-option label="左上→右下" value="leftTopToRightBottom" />
                <el-option label="右上→左下" value="rightTopToLeftBottom" />
              </el-select>
            </div>
            <div style="margin-bottom: 8px; width: 100%">
              <span style="font-size: 12px; color: #666">渐变比例</span>
              <el-slider
                v-model="gradientRatio"
                :min="0"
                :max="1"
                :step="0.01"
                style="margin-top: 4px"
              />
            </div>
            <el-button
              size="small"
              type="primary"
              style="width: 100%"
              @click="emitGradientBackground"
            >
              应用渐变
            </el-button>
          </div>
          <div
            v-if="backgroundType === 'random'"
            class="gradient-controls"
            style="margin-top: 10px"
          >
            <div style="margin-bottom: 8px; width: 100%">
              <el-select
                v-model="gradientDirection"
                placeholder="选择渐变方向"
                class="wide-select"
                :teleported="true"
              >
                <el-option label="左→右" value="leftToRight" />
                <el-option label="上→下" value="topToBottom" />
                <el-option label="左上→右下" value="leftTopToRightBottom" />
                <el-option label="右上→左下" value="rightTopToLeftBottom" />
              </el-select>
            </div>
            <div style="margin-bottom: 8px; width: 100%">
              <span style="font-size: 12px; color: #666">渐变比例</span>
              <el-slider
                v-model="gradientRatio"
                :min="0"
                :max="1"
                :step="0.01"
                style="margin-top: 4px"
              />
            </div>
            <el-button
              size="small"
              type="warning"
              style="width: 100%"
              @click="emitRandomBackground"
            >
              随机渐变背景
            </el-button>
          </div>
          <el-button
            size="small"
            @click="showImageUpload = true"
            style="margin-top: 10px"
          >
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
          <el-button @click="addShape('triangle')">
            <el-icon><Grid /></el-icon>
            三角形
          </el-button>
          <el-button @click="addShape('line')">
            <el-icon><Minus /></el-icon>
            直线
          </el-button>
          <el-button @click="addShape('star')">
            <el-icon><Star /></el-icon>
            五角星
          </el-button>
          <el-button @click="addShape('arrow')">
            <el-icon><Right /></el-icon>
            箭头
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
        <div class="el-upload__text">将图片拖拽到此处，或<em>点击上传</em></div>
      </el-upload>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
  Edit,
  Picture,
  Grid,
  CirclePlus,
  Minus,
  Star,
  Right,
  Check,
  Folder,
  Download,
  Upload,
} from "@element-plus/icons-vue";

// 事件定义
const emit = defineEmits([
  "add-text",
  "add-image",
  "change-background",
  "save-template",
  "load-template",
  "add-shape",
  "export-poster",
]);

// 响应式数据
const backgroundType = ref<"color" | "gradient" | "random">("color");
const backgroundColor = ref("#ffffff");
const gradientColor1 = ref("#667eea");
const gradientColor2 = ref("#764ba2");
const gradientDirection = ref<
  | "leftToRight"
  | "topToBottom"
  | "leftTopToRightBottom"
  | "rightTopToLeftBottom"
>("leftToRight");
const gradientRatio = ref(0.5);
const showImageUpload = ref(false);

// 背景颜色改变
const handleBackgroundColorChange = (color: string) => {
  emit("change-background", {
    type: "color",
    color,
  });
};

// 应用渐变背景
const emitGradientBackground = () => {
  emit("change-background", {
    type: "gradient",
    color1: gradientColor1.value,
    color2: gradientColor2.value,
    direction: gradientDirection.value,
    ratio: gradientRatio.value,
  });
};

// 随机渐变背景色
const emitRandomBackground = () => {
  emit("change-background", {
    type: "random-gradient",
    direction: gradientDirection.value,
    ratio: gradientRatio.value,
  });
};

// 添加文字
const handleAddText = () => {
  emit("add-text", "双击编辑文字");
};

// 图片上传
const handleImageUpload = (file: any) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    if (e.target?.result) {
      emit("add-image", e.target.result as string);
      showImageUpload.value = false;
    }
  };
  reader.readAsDataURL(file.raw);
};

// 添加形状
const addShape = (type: string) => {
  emit("add-shape", type);
};

// 加载模板
const loadTemplate = () => {
  emit("load-template");
};

// 导出海报
const exportPoster = () => {
  emit("export-poster");
};
</script>

<style scoped>
.poster-toolbar {
  height: 100%;
  padding: 16px 8px 16px 8px;
  background: transparent;
}

.toolbar-section {
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid #e9ecef;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.04);
  padding: 16px;
}

.toolbar-section:last-child {
  border-bottom: none;
}

.toolbar-section h4 {
  margin: 0 0 12px 0;
  color: #333;
  font-size: 15px;
  font-weight: 600;
}

.background-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.gradient-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  flex-wrap: wrap;
  width: 100%;
}

.gradient-controls > div {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
}

.el-radio-group {
  flex-wrap: wrap;
}

.el-button {
  min-width: 90px;
  margin-right: 8px;
  margin-bottom: 4px;
}

.upload-demo {
  width: 100%;
}

@media (max-width: 900px) {
  .toolbar-section {
    padding: 8px;
    margin-bottom: 12px;
  }
}

/* 放大选择框输入高度，确保文字显示完整 */
.wide-select :deep(.el-input__wrapper) {
  min-height: 52px;
}
.wide-select :deep(.el-input__inner) {
  height: 52px;
  line-height: 52px;
  font-size: 14px;
}
</style>
