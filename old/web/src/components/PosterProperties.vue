<template>
  <div class="poster-properties glass-panel-sm">
    <div class="panel-header">
      <el-icon><Setting /></el-icon>
      <span>属性</span>
    </div>

    <div class="panel-body">
      <el-scrollbar class="animate-fade-in">
        <div v-if="!selectedObject" class="no-selection">
          <el-empty :image-size="80" description="请选择画布上的元素进行编辑" />
        </div>

        <div v-else class="properties-content">
          <!-- 快速操作 -->
          <div class="property-group">
            <div class="group-header">快速操作</div>
            <div class="action-grid">
              <el-tooltip content="复制" placement="top">
                <el-button class="square-btn" @click="$emit('duplicate-object')">
                  <el-icon><CopyDocument /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="置顶" placement="top">
                <el-button class="square-btn" @click="$emit('bring-to-front')">
                  <el-icon><Top /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="置底" placement="top">
                <el-button class="square-btn" @click="$emit('send-to-back')">
                  <el-icon><Bottom /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <el-button class="square-btn delete-btn" @click="$emit('delete-object')">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-tooltip>
            </div>
          </div>

          <!-- 位置与大小 -->
          <div class="property-group">
            <div class="group-header">位置与大小</div>
            <div class="grid-form">
              <div class="form-item">
                <label>X轴</label>
                <el-input-number v-model="objectProperties.left" @change="updateProperties" :controls="false" size="small" />
              </div>
              <div class="form-item">
                <label>Y轴</label>
                <el-input-number v-model="objectProperties.top" @change="updateProperties" :controls="false" size="small" />
              </div>
              <div class="form-item">
                <label>宽度</label>
                <el-input-number v-model="objectProperties.width" @change="updateProperties" :controls="false" size="small" />
              </div>
              <div class="form-item">
                <label>高度</label>
                <el-input-number v-model="objectProperties.height" @change="updateProperties" :controls="false" size="small" />
              </div>
            </div>
            
            <div class="form-item full-width" style="margin-top: 12px">
              <div class="label-row">
                <label>旋转</label>
                <span class="value">{{ objectProperties.angle }}°</span>
              </div>
              <el-slider v-model="objectProperties.angle" @change="updateProperties" :min="-180" :max="180" />
            </div>

            <div class="form-item full-width" style="margin-top: 12px">
              <div class="label-row">
                <label>不透明度</label>
                <span class="value">{{ Math.round(objectProperties.opacity * 100) }}%</span>
              </div>
              <el-slider v-model="objectProperties.opacity" @change="updateProperties" :min="0" :max="1" :step="0.01" />
            </div>
          </div>

          <!-- 海报专属 -->
          <div v-if="selectedObject.posterType === 'poster'" class="property-group special-group">
            <div class="group-header">海报配置</div>
            
            <div class="form-item full-width">
              <label>快速换图</label>
              <div class="poster-mini-images">
                <div 
                  v-for="index in 6" 
                  :key="index"
                  class="poster-mini-img"
                  :class="{ active: selectedObject.posterIndex === index }"
                  @click="changePosterImage(index)"
                >
                  <img :src="`/template/poster/${index}.jpg`" />
                </div>
              </div>
            </div>
          </div>

          <!-- 文字专属 -->
          <div v-if="isTextObject" class="property-group special-group">
            <div class="group-header">文字样式</div>
            
            <div class="form-item full-width">
              <label>文本内容</label>
              <el-input 
                v-model="objectProperties.text" 
                @input="updateProperties" 
                type="textarea" 
                :rows="2"
                placeholder="在此输入文字..."
              />
            </div>

            <div class="form-row" style="margin-top: 12px">
              <div class="form-item" style="flex: 2">
                <label>字体</label>
                <el-select v-model="objectProperties.fontFamily" @change="updateProperties" size="small">
                  <el-option label="Arial" value="Arial" />
                  <el-option label="微软雅黑" value="Microsoft YaHei" />
                  <el-option label="华文楷体" value="STKaiti" />
                  <el-option label="思源黑体" value="Source Han Sans" />
                </el-select>
              </div>
              <div class="form-item" style="flex: 1">
                <label>字号</label>
                <el-input-number v-model="objectProperties.fontSize" @change="updateProperties" :controls="false" size="small" />
              </div>
            </div>

            <div class="style-actions" style="margin-top: 12px">
              <el-tooltip content="文字颜色" placement="top">
                <el-color-picker v-model="objectProperties.fill" @change="updateProperties" show-alpha size="small" />
              </el-tooltip>
              <div class="style-toggle-group">
                <div 
                  class="style-toggle" 
                  :class="{ active: objectProperties.fontWeight === 'bold' }"
                  @click="toggleTextWeight"
                  style="font-weight: bold"
                >
                  B
                </div>
                <div 
                  class="style-toggle" 
                  :class="{ active: objectProperties.fontStyle === 'italic' }"
                  @click="toggleTextStyle"
                  style="font-style: italic; font-family: serif"
                >
                  I
                </div>
              </div>
            </div>
          </div>

          <!-- 形状专属 -->
          <div v-if="isShapeObject && selectedObject.posterType !== 'poster'" class="property-group special-group">
            <div class="group-header shapes-style-header">形状样式</div>
            
            <div class="form-row">
              <div class="form-item">
                <label>填充色</label>
                <el-color-picker v-model="objectProperties.fill" @change="updateProperties" show-alpha />
              </div>
              <div class="form-item">
                <label>描边色</label>
                <el-color-picker v-model="objectProperties.stroke" @change="updateProperties" show-alpha />
              </div>
            </div>

            <div class="form-item full-width" style="margin-top: 12px">
              <div class="label-row">
                <label>描边宽度</label>
                <span class="value">{{ objectProperties.strokeWidth }}px</span>
              </div>
              <el-slider v-model="objectProperties.strokeWidth" @change="updateProperties" :min="0" :max="20" />
            </div>

            <div v-if="isRectObject" class="grid-form" style="margin-top: 12px">
              <div class="form-item">
                <label>圆角RX</label>
                <el-input-number v-model="objectProperties.rx" @change="updateProperties" :controls="false" size="small" />
              </div>
              <div class="form-item">
                <label>圆角RY</label>
                <el-input-number v-model="objectProperties.ry" @change="updateProperties" :controls="false" size="small" />
              </div>
            </div>
          </div>

          <!-- 占位符配置 -->
          <div class="property-group highlight-group" v-if="placeholderOptions.length > 0">
            <div class="group-header">动态占位符</div>
            <div class="form-item full-width">
              <el-select
                v-model="objectProperties.placeholder"
                @change="handlePlaceholderChange"
                placeholder="绑定动态数据"
                clearable
                class="placeholder-select"
              >
                <el-option label="不绑定 (静态内容)" :value="null" />
                <template v-for="group in placeholderOptions" :key="group.label">
                  <el-option-group :label="group.label">
                    <el-option 
                      v-for="opt in group.options" 
                      :key="opt.value" 
                      :label="opt.label" 
                      :value="opt.value" 
                    />
                  </el-option-group>
                </template>
              </el-select>
            </div>
          </div>

          <!-- 阴影装饰 -->
          <div class="property-group">
            <div class="group-header row">
              <span>外部阴影</span>
              <el-switch v-model="objectProperties.shadowEnabled" @change="updateProperties" size="small" />
            </div>
            
            <div v-if="objectProperties.shadowEnabled" class="animate-fade-in">
              <div class="form-item full-width">
                <div class="label-row">
                  <label>模糊距离</label>
                  <span class="value">{{ objectProperties.shadowBlur }}px</span>
                </div>
                <el-slider v-model="objectProperties.shadowBlur" @change="updateProperties" :min="0" :max="50" />
              </div>
              
              <div class="form-row">
                <div class="form-item">
                  <label>颜色</label>
                  <el-color-picker v-model="objectProperties.shadowColor" @change="updateProperties" show-alpha size="small" />
                </div>
                <div class="form-item" style="flex: 2">
                  <label>偏移距离</label>
                  <el-input-number v-model="objectProperties.shadowDistance" @change="updateProperties" :controls="false" size="small" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-scrollbar>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  Setting,
  Top,
  Bottom,
  Delete,
  CopyDocument,
} from "@element-plus/icons-vue";

// Props
interface Props {
  selectedObject: any;
  updateCounter?: number;
}

const props = defineProps<Props>();

// Events
const emit = defineEmits([
  "update-properties",
  "duplicate-object",
  "delete-object",
  "bring-to-front",
  "send-to-back",
  "change-poster-image",
]);

// 对象属性
const objectProperties = ref({
  left: 0,
  top: 0,
  width: 0,
  height: 0,
  angle: 0,
  text: "",
  fontFamily: "Arial",
  fontSize: 24,
  fill: "#000000",
  fontWeight: "normal",
  fontStyle: "normal",
  opacity: 1,
  stroke: "#000000",
  strokeWidth: 0,
  rx: 0,
  ry: 0,
  placeholder: null as string | null,
  shadowEnabled: false,
  shadowColor: "rgba(0,0,0,0.3)",
  shadowBlur: 10,
  shadowDistance: 5,
});

// 计算属性
const isTextObject = computed(() => {
  const t = props.selectedObject?.type;
  return t === "text" || t === "i-text" || t === "textbox";
});

const isRectObject = computed(() => props.selectedObject?.type === "rect");

const isShapeObject = computed(() => {
  const t = props.selectedObject?.type;
  return ["rect", "circle", "triangle", "line", "polygon", "path", "star"].includes(t);
});

// 占位符选项过滤
const placeholderOptions = computed(() => {
  if (props.selectedObject?.posterType === "poster") {
    return [
      {
        label: "海报插槽",
        options: Array.from({ length: 10 }, (_, i) => ({
          label: `海报插槽 {{poster${i + 1}}}`,
          value: `poster${i + 1}`,
        })),
      },
    ];
  } else if (isTextObject.value) {
    return [
      {
        label: "文本配置",
        options: [
          { label: "第一文字 {{primary_title}}", value: "primary_title" },
          { label: "第二文字 {{secondary_title}}", value: "secondary_title" },
        ],
      },
    ];
  }
  return [];
});

// 逻辑方法
const updateObjectProps = (obj: any) => {
  if (!obj) return;
  
  objectProperties.value = {
    left: Math.round(obj.left || 0),
    top: Math.round(obj.top || 0),
    width: Math.round((obj.width || 0) * (obj.scaleX || 1)),
    height: Math.round((obj.height || 0) * (obj.scaleY || 1)),
    angle: Math.round(obj.angle || 0),
    text: obj.text || "",
    fontFamily: obj.fontFamily || "Arial",
    fontSize: obj.fontSize || 24,
    fill: obj.fill || "#000000",
    fontWeight: obj.fontWeight || "normal",
    fontStyle: obj.fontStyle || "normal",
    opacity: obj.opacity || 1,
    stroke: obj.stroke || "#000000",
    strokeWidth: obj.strokeWidth || 0,
    rx: obj.rx || 0,
    ry: obj.ry || 0,
    placeholder: obj.placeholder || null,
    shadowEnabled: !!obj.shadow,
    shadowColor: obj.shadow?.color || "rgba(0,0,0,0.3)",
    shadowBlur: obj.shadow?.blur || 10,
    shadowDistance: obj.shadow?.offsetX || 5,
  };
};

const updateProperties = () => {
  const currentProps = { ...objectProperties.value };
  
  // 处理阴影
  if (currentProps.shadowEnabled) {
    (currentProps as any).shadow = {
      color: currentProps.shadowColor,
      blur: currentProps.shadowBlur,
      offsetX: currentProps.shadowDistance,
      offsetY: currentProps.shadowDistance,
    };
  } else {
    (currentProps as any).shadow = null;
  }
  
  emit("update-properties", currentProps);
};

const handlePlaceholderChange = (val: string | null) => {
  objectProperties.value.placeholder = val;
  updateProperties();
};

const toggleTextWeight = () => {
  objectProperties.value.fontWeight = 
    objectProperties.value.fontWeight === "bold" ? "normal" : "bold";
  updateProperties();
};

const toggleTextStyle = () => {
  objectProperties.value.fontStyle = 
    objectProperties.value.fontStyle === "italic" ? "normal" : "italic";
  updateProperties();
};

const changePosterImage = (index: number) => {
  emit("change-poster-image", index);
};

// 监听
watch(() => props.selectedObject, (newVal) => {
  updateObjectProps(newVal);
}, { immediate: true, deep: true });

watch(() => props.updateCounter, () => {
  updateObjectProps(props.selectedObject);
});
</script>

<style scoped>
.poster-properties {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.5);
}

.panel-header i {
  font-size: 18px;
  color: var(--primary);
}

.panel-header span {
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.5px;
}

.panel-body {
  flex: 1;
  overflow: hidden;
}

.properties-content {
  padding: 20px;
}

.no-selection {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.property-group {
  margin-bottom: 24px;
}

.group-header {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.group-header.row {
  margin-bottom: 8px;
}

.grid-form {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.form-item.full-width {
  grid-column: span 2;
}

.form-item label {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.form-item :deep(.el-input-number),
.form-item :deep(.el-select),
.form-item :deep(.el-color-picker) {
  width: 100% !important;
}

.form-item :deep(.el-color-picker__trigger) {
  width: 100% !important;
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label-row .value {
  font-size: 11px;
  color: var(--primary);
  font-weight: 600;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.square-btn {
  width: 100%;
  height: 36px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all var(--transition-fast);
}

.delete-btn:hover {
  color: var(--error) !important;
  border-color: var(--error) !important;
  background: var(--error-light) !important;
}

.poster-mini-images {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.poster-mini-img {
  aspect-ratio: 2/3;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all var(--transition-fast);
}

.poster-mini-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.poster-mini-img:hover {
  transform: scale(1.05);
}

.poster-mini-img.active {
  border-color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.style-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.style-toggle-group {
  display: flex;
  background: var(--bg-secondary);
  padding: 3px;
  border-radius: 6px;
  gap: 2px;
}

.style-toggle {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 4px;
  font-size: 14px;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.style-toggle:hover {
  background: rgba(255, 255, 255, 0.5);
  color: var(--primary);
}

.style-toggle.active {
  background: white;
  color: var(--primary);
  box-shadow: var(--shadow-xs);
}

.placeholder-select :deep(.el-input__wrapper) {
  background: var(--primary-light-9) !important;
  box-shadow: 0 0 0 1px var(--primary-light-8) inset !important;
}

.placeholder-select :deep(.el-input__inner) {
  color: var(--primary) !important;
  font-weight: 500;
}

.highlight-group {
  background: linear-gradient(to bottom, var(--primary-light-9), transparent);
  padding: 12px;
  margin: 0 -12px 24px -12px;
  border-radius: 12px;
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
