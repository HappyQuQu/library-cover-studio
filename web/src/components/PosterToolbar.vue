<template>
  <div class="poster-toolbar">
    <el-scrollbar>
      <!-- 背景设置 -->
      <div class="toolbar-section">
        <div class="section-header" @click="toggleSection('background')">
          <div class="section-header-left">
            <el-icon class="section-icon"><Picture /></el-icon>
            <span>背景设置</span>
          </div>
          <el-icon class="section-arrow" :class="{ expanded: expandedSections.background }">
            <ArrowDown />
          </el-icon>
        </div>
        
        <div v-show="expandedSections.background" class="section-content animate-fade-in">
          <!-- 背景类型选择 -->
          <div class="bg-type-tabs">
            <div 
              class="bg-type-tab" 
              :class="{ active: backgroundType === 'color' }"
              @click="backgroundType = 'color'"
            >
              <el-icon><Brush /></el-icon>
              <span>纯色</span>
            </div>
            <div 
              class="bg-type-tab" 
              :class="{ active: backgroundType === 'gradient' }"
              @click="backgroundType = 'gradient'"
            >
              <el-icon><Sunset /></el-icon>
              <span>渐变</span>
            </div>
            <div 
              class="bg-type-tab" 
              :class="{ active: backgroundType === 'random' }"
              @click="backgroundType = 'random'"
            >
              <el-icon><MagicStick /></el-icon>
              <span>随机</span>
            </div>
          </div>

          <!-- 纯色模式 -->
          <div v-if="backgroundType === 'color'" class="bg-color-picker">
            <div class="color-picker-label">选择颜色</div>
            <el-color-picker
              v-model="backgroundColor"
              @change="handleBackgroundColorChange"
              show-alpha
              size="large"
            />
          </div>

          <!-- 渐变模式 -->
          <div v-if="backgroundType === 'gradient'" class="bg-gradient-controls">
            <div class="gradient-presets-label">预设渐变</div>
            <div class="gradient-presets">
              <div 
                v-for="(preset, idx) in gradientPresets" 
                :key="idx"
                class="gradient-preset"
                :class="{ selected: selectedPreset === idx }"
                :style="{ background: preset.css }"
                @click="applyPreset(idx)"
              ></div>
            </div>

            <div class="gradient-custom">
              <div class="gradient-colors">
                <div class="color-item">
                  <span class="color-label">起始色</span>
                  <el-color-picker v-model="gradientColor1" show-alpha />
                </div>
                <el-icon class="gradient-arrow"><Right /></el-icon>
                <div class="color-item">
                  <span class="color-label">结束色</span>
                  <el-color-picker v-model="gradientColor2" show-alpha />
                </div>
              </div>

              <div class="gradient-direction">
                <span class="direction-label">方向</span>
                <div class="direction-buttons">
                  <div 
                    v-for="dir in directions" 
                    :key="dir.value"
                    class="direction-btn"
                    :class="{ active: gradientDirection === dir.value }"
                    :title="dir.label"
                    @click="gradientDirection = dir.value"
                  >
                    <el-icon><component :is="dir.icon" /></el-icon>
                  </div>
                </div>
              </div>

              <div class="gradient-ratio">
                <span class="ratio-label">比例 {{ Math.round(gradientRatio * 100) }}%</span>
                <el-slider
                  v-model="gradientRatio"
                  :min="0"
                  :max="1"
                  :step="0.01"
                  :show-tooltip="false"
                />
              </div>

              <el-button type="primary" class="apply-btn" @click="emitGradientBackground">
                <el-icon><Check /></el-icon>
                应用渐变
              </el-button>
            </div>
          </div>

          <!-- 随机渐变模式 -->
          <div v-if="backgroundType === 'random'" class="bg-random-controls">
            <div class="random-hint">
              <el-icon><InfoFilled /></el-icon>
              <span>每次点击生成随机渐变色</span>
            </div>

            <div class="gradient-direction">
              <span class="direction-label">方向</span>
              <div class="direction-buttons">
                <div 
                  v-for="dir in directions" 
                  :key="dir.value"
                  class="direction-btn"
                  :class="{ active: gradientDirection === dir.value }"
                  :title="dir.label"
                  @click="gradientDirection = dir.value"
                >
                  <el-icon><component :is="dir.icon" /></el-icon>
                </div>
              </div>
            </div>

            <el-button type="warning" class="apply-btn random-btn" @click="emitRandomBackground">
              <el-icon><Refresh /></el-icon>
              随机渐变背景
            </el-button>
          </div>
        </div>
      </div>

      <!-- 添加元素 -->
      <div class="toolbar-section">
        <div class="section-header" @click="toggleSection('elements')">
          <div class="section-header-left">
            <el-icon class="section-icon"><Plus /></el-icon>
            <span>添加元素</span>
          </div>
          <el-icon class="section-arrow" :class="{ expanded: expandedSections.elements }">
            <ArrowDown />
          </el-icon>
        </div>

        <div v-show="expandedSections.elements" class="section-content animate-fade-in">
          <div class="element-grid">
            <div class="element-item" @click="handleAddText">
              <div class="element-icon text-icon">
                <el-icon><Edit /></el-icon>
              </div>
              <span class="element-label">文字</span>
            </div>
            <div class="element-item" @click="showImageUpload = true">
              <div class="element-icon image-icon">
                <el-icon><Picture /></el-icon>
              </div>
              <span class="element-label">图片</span>
            </div>
            <div class="element-item poster-element" @click="handleAddPoster">
              <div class="element-icon poster-icon">
                <el-icon><Film /></el-icon>
              </div>
              <span class="element-label">海报</span>
            </div>
          </div>

          <div class="shapes-divider">
            <span>形状</span>
          </div>

          <div class="shapes-grid">
            <div 
              v-for="shape in shapes" 
              :key="shape.type"
              class="shape-item"
              :title="shape.label"
              @click="addShape(shape.type)"
            >
              <div class="shape-preview" v-html="shape.svg"></div>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>

    <!-- 图片上传对话框 -->
    <el-dialog v-model="showImageUpload" title="上传图片" width="500px" class="upload-dialog">
      <el-upload
        class="upload-area"
        drag
        accept="image/*"
        :auto-upload="false"
        :on-change="handleImageUpload"
      >
        <div class="upload-content">
          <el-icon class="upload-icon"><Upload /></el-icon>
          <div class="upload-text">
            <p>将图片拖拽到此处</p>
            <p class="upload-hint">或 <em>点击上传</em></p>
          </div>
        </div>
      </el-upload>
    </el-dialog>

    <!-- 添加海报对话框 -->
    <el-dialog v-model="showPosterDialog" title="添加海报" width="600px" class="poster-dialog">
      <div class="poster-dialog-content">
        <!-- 形状选择 -->
        <div class="dialog-section">
          <h4>选择形状</h4>
          <div class="shape-selector">
            <div
              v-for="shape in posterShapes"
              :key="shape.value"
              :class="['shape-option', { active: selectedShape === shape.value }]"
              @click="selectedShape = shape.value"
            >
              <div class="shape-preview-box" v-html="shape.svg"></div>
              <span>{{ shape.label }}</span>
            </div>
          </div>
        </div>

        <!-- 海报图片选择 -->
        <div class="dialog-section">
          <h4>选择海报图片</h4>
          <div class="poster-image-grid">
            <div
              v-for="index in 9"
              :key="index"
              :class="['poster-image-item', { active: selectedPosterIndex === index }]"
              @click="selectedPosterIndex = index"
            >
              <img :src="`/template/poster/${index}.jpg`" :alt="`海报 ${index}`" />
              <div class="poster-check" v-if="selectedPosterIndex === index">
                <el-icon><Check /></el-icon>
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="showPosterDialog = false">取消</el-button>
        <el-button type="primary" @click="confirmAddPoster">
          <el-icon><Check /></el-icon>
          确认添加
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, markRaw } from "vue";
import { useI18n } from "vue-i18n";
import {
  Edit,
  Picture,
  Plus,
  Upload,
  Check,
  ArrowDown,
  Right,
  Brush,
  Sunrise,
  Sunset,
  MagicStick,
  Refresh,
  InfoFilled,
  Film,
  TopRight,
  Bottom,
  BottomRight,
  BottomLeft,
} from "@element-plus/icons-vue";

const { t } = useI18n();

// 事件定义
const emit = defineEmits([
  "add-text",
  "add-image",
  "change-background",
  "add-shape",
  "add-poster",
]);

// 折叠状态
const expandedSections = reactive<Record<string, boolean>>({
  background: true,
  elements: true,
});

const toggleSection = (section: string) => {
  expandedSections[section] = !expandedSections[section];
};

// 响应式数据
const backgroundType = ref<"color" | "gradient" | "random">("gradient");
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
const selectedPreset = ref(-1);

// 预设渐变
const gradientPresets = [
  { css: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color1: '#667eea', color2: '#764ba2' },
  { css: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color1: '#f093fb', color2: '#f5576c' },
  { css: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color1: '#4facfe', color2: '#00f2fe' },
  { css: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', color1: '#43e97b', color2: '#38f9d7' },
  { css: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)', color1: '#fa709a', color2: '#fee140' },
  { css: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)', color1: '#a8edea', color2: '#fed6e3' },
  { css: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', color1: '#ff9a9e', color2: '#fecfef' },
  { css: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', color1: '#ffecd2', color2: '#fcb69f' },
  { css: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', color1: '#a18cd1', color2: '#fbc2eb' },
  { css: 'linear-gradient(135deg, #fad0c4 0%, #ffd1ff 100%)', color1: '#fad0c4', color2: '#ffd1ff' },
  { css: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', color1: '#1e3c72', color2: '#2a5298' },
  { css: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)', color1: '#0f0c29', color2: '#24243e' },
];

type DirectionType = "leftToRight" | "topToBottom" | "leftTopToRightBottom" | "rightTopToLeftBottom";

// 方向选项
const directions: Array<{ value: DirectionType; label: string; icon: any }> = [
  { value: 'leftToRight', label: '左→右', icon: markRaw(Right) },
  { value: 'topToBottom', label: '上→下', icon: markRaw(Bottom) },
  { value: 'leftTopToRightBottom', label: '左上→右下', icon: markRaw(BottomRight) },
  { value: 'rightTopToLeftBottom', label: '右上→左下', icon: markRaw(BottomLeft) },
];

// 形状列表
const shapes = [
  { type: 'rect', label: '矩形', svg: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" fill="currentColor"/></svg>' },
  { type: 'circle', label: '圆形', svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor"/></svg>' },
  { type: 'triangle', label: '三角形', svg: '<svg viewBox="0 0 24 24"><polygon points="12,3 22,21 2,21" fill="currentColor"/></svg>' },
  { type: 'line', label: '直线', svg: '<svg viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>' },
  { type: 'star', label: '五角星', svg: '<svg viewBox="0 0 24 24"><polygon points="12,2 15,9 22,9 16,14 18,22 12,17 6,22 8,14 2,9 9,9" fill="currentColor"/></svg>' },
  { type: 'arrow', label: '箭头', svg: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
];

// 应用预设
const applyPreset = (idx: number) => {
  selectedPreset.value = idx;
  const preset = gradientPresets[idx];
  gradientColor1.value = preset.color1;
  gradientColor2.value = preset.color2;
  emitGradientBackground();
};

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

// 海报形状选项
const posterShapes = [
  { label: "矩形", value: "rect", svg: '<svg viewBox="0 0 30 40"><rect x="2" y="2" width="26" height="36" rx="3" fill="currentColor"/></svg>' },
  { label: "正方形", value: "square", svg: '<svg viewBox="0 0 40 40"><rect x="4" y="4" width="32" height="32" rx="3" fill="currentColor"/></svg>' },
  { label: "圆形", value: "circle", svg: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="currentColor"/></svg>' },
  { label: "三角形", value: "triangle", svg: '<svg viewBox="0 0 40 40"><polygon points="20,4 36,36 4,36" fill="currentColor"/></svg>' },
  { label: "五角星", value: "star", svg: '<svg viewBox="0 0 40 40"><polygon points="20,2 25,15 38,15 28,24 32,38 20,30 8,38 12,24 2,15 15,15" fill="currentColor"/></svg>' },
];

// 海报对话框状态
const showPosterDialog = ref(false);
const selectedShape = ref("rect");
const selectedPosterIndex = ref(1);

// 添加海报 - 打开对话框
const handleAddPoster = () => {
  selectedShape.value = "rect";
  selectedPosterIndex.value = 1;
  showPosterDialog.value = true;
};

// 确认添加海报
const confirmAddPoster = () => {
  emit("add-poster", {
    shape: selectedShape.value,
    posterIndex: selectedPosterIndex.value,
  });
  showPosterDialog.value = false;
};
</script>

<style scoped>
.poster-toolbar {
  height: 100%;
  padding: 12px;
  background: transparent;
}

/* 分组样式 */
.toolbar-section {
  margin-bottom: 12px;
  background: var(--bg-primary);
  border-radius: 14px;
  border: 1px solid var(--border-color);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  cursor: pointer;
  transition: all var(--transition-fast);
  user-select: none;
}

.section-header:hover {
  background: var(--bg-tertiary);
}

.section-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-icon {
  font-size: 18px;
  color: var(--primary);
}

.section-arrow {
  font-size: 14px;
  color: var(--text-tertiary);
  transition: transform var(--transition-fast);
}

.section-arrow.expanded {
  transform: rotate(180deg);
}

.section-content {
  padding: 0 16px 16px;
}

/* 背景类型标签 */
.bg-type-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.bg-type-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: all var(--transition-fast);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
}

.bg-type-tab:hover {
  background: rgba(102, 126, 234, 0.1);
  color: var(--primary);
}

.bg-type-tab.active {
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.bg-type-tab .el-icon {
  font-size: 20px;
}

/* 纯色选择器 */
.bg-color-picker {
  text-align: center;
}

.color-picker-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

/* 渐变控制 */
.gradient-presets-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.gradient-presets {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.gradient-preset {
  aspect-ratio: 1;
  border-radius: 8px;
  cursor: pointer;
  transition: all var(--transition-fast);
  border: 2px solid transparent;
}

.gradient-preset:hover {
  transform: scale(1.08);
  box-shadow: var(--shadow-md);
}

.gradient-preset.selected {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.3), var(--shadow-md);
}

.gradient-custom {
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.gradient-colors {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
}

.color-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.color-label {
  font-size: 11px;
  color: var(--text-tertiary);
}

.gradient-arrow {
  color: var(--text-tertiary);
  font-size: 16px;
}

.gradient-direction {
  margin-bottom: 16px;
}

.direction-label,
.ratio-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.direction-buttons {
  display: flex;
  gap: 8px;
}

.direction-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  cursor: pointer;
  transition: all var(--transition-fast);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.direction-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.direction-btn.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.gradient-ratio {
  margin-bottom: 16px;
}

.apply-btn {
  width: 100%;
  height: 40px;
  font-weight: 500;
  border-radius: 10px;
}

.random-btn {
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  border: none;
}

.random-btn:hover {
  background: linear-gradient(135deg, #d97706, #dc2626);
}

/* 随机模式提示 */
.random-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(245, 158, 11, 0.1);
  border-radius: 8px;
  color: #d97706;
  font-size: 12px;
  margin-bottom: 16px;
}

/* 元素网格 */
.element-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.element-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 8px;
  border-radius: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
  background: var(--bg-tertiary);
  border: 1px solid transparent;
}

.element-item:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--border-color);
}

.element-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  font-size: 22px;
}

.text-icon {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.image-icon {
  background: linear-gradient(135deg, #4facfe, #00f2fe);
  color: white;
}

.poster-icon {
  background: linear-gradient(135deg, #43e97b, #38f9d7);
  color: white;
}

.element-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

/* 形状分隔线 */
.shapes-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--text-tertiary);
  font-size: 12px;
}

.shapes-divider::before,
.shapes-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

/* 形状网格 */
.shapes-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.shape-item {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  cursor: pointer;
  transition: all var(--transition-fast);
  background: var(--bg-tertiary);
  border: 1px solid transparent;
  color: var(--text-secondary);
}

.shape-item:hover {
  transform: scale(1.05);
  box-shadow: var(--shadow-md);
  border-color: var(--primary);
  color: var(--primary);
}

.shape-preview {
  width: 28px;
  height: 28px;
}

.shape-preview svg {
  width: 100%;
  height: 100%;
}

/* 海报对话框 */
.poster-dialog-content {
  padding: 0 8px;
}

.dialog-section {
  margin-bottom: 24px;
}

.dialog-section h4 {
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.shape-selector {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.shape-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border: 2px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
  color: var(--text-secondary);
  min-width: 72px;
}

.shape-option:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.shape-option.active {
  border-color: var(--primary);
  background: rgba(102, 126, 234, 0.1);
  color: var(--primary);
}

.shape-preview-box {
  width: 40px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.shape-preview-box svg {
  width: 100%;
  height: 100%;
}

.shape-option span {
  font-size: 12px;
  font-weight: 500;
}

.poster-image-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}

.poster-image-item {
  aspect-ratio: 2/3;
  border: 2px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
}

.poster-image-item:hover {
  border-color: var(--primary);
  transform: scale(1.03);
}

.poster-image-item.active {
  border-color: var(--primary);
  border-width: 3px;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
}

.poster-image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.poster-check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  background: var(--primary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 12px;
}

/* 上传对话框 */
.upload-area {
  width: 100%;
}

.upload-area :deep(.el-upload-dragger) {
  border: 2px dashed var(--border-color);
  border-radius: 12px;
  background: var(--bg-tertiary);
  transition: all var(--transition-fast);
}

.upload-area :deep(.el-upload-dragger:hover) {
  border-color: var(--primary);
  background: rgba(102, 126, 234, 0.05);
}

.upload-content {
  padding: 40px 20px;
  text-align: center;
}

.upload-icon {
  font-size: 48px;
  color: var(--primary);
  margin-bottom: 16px;
}

.upload-text p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.upload-hint {
  margin-top: 8px !important;
  font-size: 13px !important;
}

.upload-hint em {
  color: var(--primary);
  font-style: normal;
  font-weight: 500;
}

/* 动画 */
.animate-fade-in {
  animation: fadeIn 0.25s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
