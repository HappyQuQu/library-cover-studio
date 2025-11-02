<template>
  <div class="poster-properties">
    <el-scrollbar>
      <div v-if="!selectedObject" class="no-selection">
        <el-empty description="请选择一个元素来编辑属性" />
      </div>

      <div v-else class="properties-content">
        <!-- 操作按钮 -->
        <div class="property-section">
          <h4>操作</h4>
          <div class="action-buttons">
            <el-button size="small" @click="$emit('duplicate-object')"
              >复制</el-button
            >
            <el-button
              size="small"
              @click="$emit('delete-object')"
              type="danger"
              >删除</el-button
            >
            <el-button size="small" @click="$emit('bring-to-front')"
              >置顶</el-button
            >
            <el-button size="small" @click="$emit('send-to-back')"
              >置底</el-button
            >
          </div>
        </div>

        <!-- 海报专属设置 -->
        <div v-if="selectedObject.posterType === 'poster'" class="property-section">
          <h4>海报形状</h4>
          <div class="poster-shape-selector">
            <el-button
              v-for="shape in posterShapes"
              :key="shape.value"
              :type="currentPosterShape === shape.value ? 'primary' : ''"
              size="small"
              @click="changePosterShape(shape.value)"
            >
              {{ shape.label }}
            </el-button>
          </div>

          <h4 style="margin-top: 20px">海报图片</h4>
          <div class="poster-image-selector">
            <div
              v-for="index in 9"
              :key="index"
              :class="['poster-thumbnail', { active: selectedObject.posterIndex === index }]"
              @click="changePosterImage(index)"
            >
              <img :src="`/template/poster/${index}.jpg`" :alt="`海报 ${index}`" />
            </div>
          </div>
        </div>

        <!-- 阴影设置 -->
        <el-collapse v-model="activeCollapse" class="property-collapse">
          <el-collapse-item name="shadow">
            <template #title>
              <h4 class="collapse-title">阴影</h4>
            </template>
            <el-form label-width="60px" size="small" label-position="left">
              <el-form-item label="启用">
                <el-switch
                  v-model="objectProperties.shadowEnabled"
                  @change="updateProperties"
                />
              </el-form-item>
              <template v-if="objectProperties.shadowEnabled">
                <el-form-item label="方向">
                  <el-slider
                    v-model="objectProperties.shadowAngle"
                    @change="updateProperties"
                    :min="0"
                    :max="360"
                    :step="1"
                  />
                  <el-input-number
                    v-model="objectProperties.shadowAngle"
                    @change="updateProperties"
                    :min="0"
                    :max="360"
                    :controls="false"
                    class="full-width-input"
                    style="margin-top: 8px"
                  />
                </el-form-item>
                <el-form-item label="大小">
                  <el-slider
                    v-model="objectProperties.shadowDistance"
                    @change="updateProperties"
                    :min="0"
                    :max="80"
                    :step="1"
                  />
                  <el-input-number
                    v-model="objectProperties.shadowDistance"
                    @change="updateProperties"
                    :min="0"
                    :max="80"
                    :controls="false"
                    class="full-width-input"
                    style="margin-top: 8px"
                  />
                </el-form-item>
                <el-form-item label="比例">
                  <el-slider
                    v-model="objectProperties.shadowOpacity"
                    @change="updateProperties"
                    :min="0"
                    :max="1"
                    :step="0.05"
                    :show-tooltip="true"
                    :format-tooltip="
                      (val: number) => `${Math.round(val * 100)}%`
                    "
                  />
                  <el-input-number
                    v-model="objectProperties.shadowOpacity"
                    @change="updateProperties"
                    :min="0"
                    :max="1"
                    :precision="2"
                    :step="0.05"
                    controls-position="right"
                    size="small"
                    class="full-width-input"
                    style="margin-top: 8px"
                  />
                </el-form-item>
                <el-form-item label="颜色">
                  <el-color-picker
                    v-model="objectProperties.shadowColor"
                    @change="updateProperties"
                    show-alpha
                  />
                </el-form-item>
                <el-form-item label="模糊">
                  <el-slider
                    v-model="objectProperties.shadowBlur"
                    @change="updateProperties"
                    :min="0"
                    :max="40"
                    :step="1"
                  />
                  <el-input-number
                    v-model="objectProperties.shadowBlur"
                    @change="updateProperties"
                    :min="0"
                    :max="40"
                    :controls="false"
                    class="full-width-input"
                    style="margin-top: 8px"
                  />
                </el-form-item>
              </template>
            </el-form>
          </el-collapse-item>
        </el-collapse>

        <!-- 位置与大小 -->
        <el-collapse v-model="activeCollapse" class="property-collapse">
          <el-collapse-item name="position">
            <template #title>
              <h4 class="collapse-title">位置与大小</h4>
            </template>
            <el-form label-width="50px" size="small" label-position="left">
              <el-form-item label="X">
                <el-input-number
                  v-model="objectProperties.left"
                  @change="updateProperties"
                  :precision="0"
                  :controls="false"
                  class="full-width-input"
                />
              </el-form-item>
              <el-form-item label="Y">
                <el-input-number
                  v-model="objectProperties.top"
                  @change="updateProperties"
                  :precision="0"
                  :controls="false"
                  class="full-width-input"
                />
              </el-form-item>
              <el-form-item label="宽度">
                <el-input-number
                  v-model="objectProperties.width"
                  @change="updateProperties"
                  :precision="0"
                  :controls="false"
                  class="full-width-input"
                />
              </el-form-item>
              <el-form-item label="高度">
                <el-input-number
                  v-model="objectProperties.height"
                  @change="updateProperties"
                  :precision="0"
                  :controls="false"
                  class="full-width-input"
                />
              </el-form-item>
              <el-form-item label="旋转">
                <el-slider
                  v-model="objectProperties.angle"
                  @change="updateProperties"
                  :min="-180"
                  :max="180"
                  :show-tooltip="true"
                />
                <el-input-number
                  v-model="objectProperties.angle"
                  @change="updateProperties"
                  :min="-180"
                  :max="180"
                  :precision="0"
                  controls-position="right"
                  size="small"
                  class="full-width-input"
                  style="margin-top: 8px"
                />
              </el-form-item>
              <el-form-item label="占位符">
                <el-select
                  v-model="objectProperties.placeholder"
                  @change="updateProperties"
                  placeholder="选择占位参数"
                  clearable
                  class="full-width-select"
                >
                  <el-option label="无占位" :value="null" />
                  <el-option
                    v-for="i in 10"
                    :key="i"
                    :label="`{{poster${i}}}`"
                    :value="`poster${i}`"
                  />
                </el-select>
                <div style="margin-top: 4px">
                  <el-text size="small" type="info">
                    图片元素: 替换图片源<br />
                    文字元素: 替换文本内容
                  </el-text>
                </div>
              </el-form-item>
            </el-form>
          </el-collapse-item>
        </el-collapse>

        <!-- 文字属性 -->
        <el-collapse
          v-if="isTextObject"
          v-model="activeCollapse"
          class="property-collapse"
        >
          <el-collapse-item name="text">
            <template #title>
              <h4 class="collapse-title">文字属性</h4>
            </template>
            <el-form label-width="50px" size="small" label-position="left">
              <el-form-item label="内容">
                <el-input
                  v-model="objectProperties.text"
                  @input="updateProperties"
                  type="textarea"
                  :rows="2"
                />
              </el-form-item>
              <el-form-item label="字体">
                <el-select
                  v-model="objectProperties.fontFamily"
                  @change="updateProperties"
                  class="full-width-select"
                >
                  <el-option label="Arial" value="Arial" />
                  <el-option label="微软雅黑" value="Microsoft YaHei" />
                  <el-option label="宋体" value="SimSun" />
                  <el-option label="楷体" value="KaiTi" />
                  <el-option label="黑体" value="SimHei" />
                </el-select>
              </el-form-item>
              <el-form-item label="大小">
                <el-input-number
                  v-model="objectProperties.fontSize"
                  @change="updateProperties"
                  :min="8"
                  :max="200"
                  :controls="false"
                  class="full-width-input"
                />
              </el-form-item>
              <el-form-item label="颜色">
                <el-color-picker
                  v-model="objectProperties.fill"
                  @change="updateProperties"
                  show-alpha
                />
              </el-form-item>
              <el-form-item label="粗体">
                <el-switch
                  v-model="objectProperties.fontWeight"
                  @change="updateProperties"
                  active-value="bold"
                  inactive-value="normal"
                />
              </el-form-item>
              <el-form-item label="斜体">
                <el-switch
                  v-model="objectProperties.fontStyle"
                  @change="updateProperties"
                  active-value="italic"
                  inactive-value="normal"
                />
              </el-form-item>
            </el-form>
          </el-collapse-item>
        </el-collapse>

        <!-- 图片属性 -->
        <el-collapse
          v-if="isImageObject"
          v-model="activeCollapse"
          class="property-collapse"
        >
          <el-collapse-item name="image">
            <template #title>
              <h4 class="collapse-title">图片属性</h4>
            </template>
            <el-form label-width="70px" size="small" label-position="left">
              <el-form-item label="透明度">
                <el-slider
                  v-model="objectProperties.opacity"
                  @change="updateProperties"
                  :min="0"
                  :max="1"
                  :step="0.1"
                  :show-tooltip="true"
                />
                <el-input-number
                  v-model="objectProperties.opacity"
                  @change="updateProperties"
                  :min="0"
                  :max="1"
                  :precision="1"
                  :step="0.1"
                  controls-position="right"
                  size="small"
                  class="full-width-input"
                  style="margin-top: 8px"
                />
              </el-form-item>
            </el-form>
          </el-collapse-item>
        </el-collapse>

        <!-- 形状样式 -->
        <el-collapse
          v-if="isShapeObject"
          v-model="activeCollapse"
          class="property-collapse"
        >
          <el-collapse-item name="shape">
            <template #title>
              <h4 class="collapse-title">形状样式</h4>
            </template>
            <el-form label-width="60px" size="small" label-position="left">
              <el-form-item v-if="!isLineObject" label="填充类型">
                <el-text
                  v-if="fillType === 'pattern'"
                  size="small"
                  type="success"
                >
                  当前使用图案填充
                </el-text>
                <el-text v-else size="small" type="info">
                  当前使用纯色填充
                </el-text>
              </el-form-item>
              <el-form-item
                v-if="!isLineObject && fillType === 'color'"
                label="填充色"
              >
                <el-color-picker
                  v-model="objectProperties.fill"
                  @change="updateProperties"
                  show-alpha
                />
              </el-form-item>
              <el-form-item
                v-if="!isLineObject && fillType === 'pattern'"
                label="提示"
              >
                <el-text size="small" type="info">
                  双击元素可编辑图案位置与缩放
                </el-text>
              </el-form-item>
              <el-form-item label="描边色">
                <el-color-picker
                  v-model="objectProperties.stroke"
                  @change="updateProperties"
                  show-alpha
                />
              </el-form-item>
              <el-form-item label="描边宽">
                <el-input-number
                  v-model="objectProperties.strokeWidth"
                  @change="updateProperties"
                  :min="0"
                  :max="30"
                  :controls="false"
                  class="full-width-input"
                />
              </el-form-item>
              <el-form-item v-if="isRectObject" label="圆角rx">
                <el-input-number
                  v-model="objectProperties.rx"
                  @change="updateProperties"
                  :min="0"
                  :max="120"
                  :controls="false"
                  class="full-width-input"
                />
              </el-form-item>
              <el-form-item v-if="isRectObject" label="圆角ry">
                <el-input-number
                  v-model="objectProperties.ry"
                  @change="updateProperties"
                  :min="0"
                  :max="120"
                  :controls="false"
                  class="full-width-input"
                />
              </el-form-item>
              <el-form-item label="透明度">
                <el-slider
                  v-model="objectProperties.opacity"
                  @change="updateProperties"
                  :min="0"
                  :max="1"
                  :step="0.05"
                  :show-tooltip="true"
                />
                <el-input-number
                  v-model="objectProperties.opacity"
                  @change="updateProperties"
                  :min="0"
                  :max="1"
                  :precision="2"
                  :step="0.05"
                  controls-position="right"
                  size="small"
                  class="full-width-input"
                  style="margin-top: 8px"
                />
              </el-form-item>
            </el-form>
          </el-collapse-item>
        </el-collapse>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";

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
  "toggle-pattern-edit-mode",
  "update-pattern-transform",
  "change-poster-shape",
  "change-poster-image",
]);

// 折叠面板激活项
const activeCollapse = ref(["shadow", "position", "text", "image", "shape"]);

// 图案填充相关
const fillType = ref<"color" | "pattern">("color");
const selectedPattern = ref<number>(1);
const patternMode = ref<"repeat" | "no-repeat">("repeat");
const patternEditMode = ref(false);
const patternTransform = ref({
  offsetX: 0,
  offsetY: 0,
  scale: 1,
});

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
  placeholder: null as string | null, // 占位参数 poster1-poster10
  // Shadow - 默认启用
  shadowEnabled: true,
  shadowAngle: 45,
  shadowDistance: 10,
  shadowOpacity: 0.4,
  shadowColor: "#000000",
  shadowBlur: 10,
});

// 计算属性
const isTextObject = computed(
  () =>
    props.selectedObject?.type === "text" ||
    props.selectedObject?.type === "i-text" ||
    props.selectedObject?.type === "textbox"
);
const isImageObject = computed(() => props.selectedObject?.type === "image");
const isRectObject = computed(() => props.selectedObject?.type === "rect");
const isLineObject = computed(() => props.selectedObject?.type === "line");
const isShapeObject = computed(() => {
  const t = props.selectedObject?.type;
  return ["rect", "circle", "triangle", "line", "polygon", "path"].includes(t);
});

// 海报形状选项
const posterShapes = ref([
  { label: "矩形", value: "rect" },
  { label: "圆形", value: "circle" },
  { label: "三角形", value: "triangle" },
  { label: "星形", value: "star" }
]);

// 当前海报形状
const currentPosterShape = ref("rect");

// 切换海报形状
const changePosterShape = (shape: string) => {
  currentPosterShape.value = shape;
  emit("change-poster-shape", shape);
};

// 切换海报图片
const changePosterImage = (index: number) => {
  emit("change-poster-image", index);
};


// 更新对象属性的函数
const updateObjectProps = (obj: any) => {
  if (obj) {
    // 检查 fill 是否是 Pattern 对象
    const fillValue = obj.fill;
    const isFillPattern =
      fillValue && typeof fillValue === "object" && "source" in fillValue;

    // 更新 fillType
    if (isFillPattern) {
      fillType.value = "pattern";
    } else {
      fillType.value = "color";
    }

    const currentProps = {
      left: Math.round(obj.left || 0),
      top: Math.round(obj.top || 0),
      width: Math.round(obj.getScaledWidth?.() || obj.width || 0),
      height: Math.round(obj.getScaledHeight?.() || obj.height || 0),
      angle: Math.round(obj.angle || 0),
      text: obj.text || "",
      fontFamily: obj.fontFamily || "Arial",
      fontSize: obj.fontSize || 24,
      // 如果是 Pattern,使用默认颜色,否则使用实际颜色
      fill: isFillPattern ? "#000000" : obj.fill || "#000000",
      fontWeight: obj.fontWeight || "normal",
      fontStyle: obj.fontStyle || "normal",
      opacity: obj.opacity ?? 1,
      stroke: obj.stroke || "#000000",
      strokeWidth: obj.strokeWidth ?? 0,
      rx: obj.rx ?? 0,
      ry: obj.ry ?? 0,
      placeholder: obj.placeholder || null, // 占位参数
      // Shadow - 默认开启,即使对象没有阴影属性
      shadowEnabled: obj.shadow ? true : true, // 默认开启
      shadowAngle: (() => {
        const s = obj.shadow;
        if (!s) return 45;
        const radToDeg = (r: number) => (r * 180) / Math.PI;
        const deg = radToDeg(Math.atan2(s.offsetY || 0, s.offsetX || 0));
        return deg < 0 ? deg + 360 : Math.round(deg);
      })(),
      shadowDistance: (() => {
        const s = obj.shadow;
        if (!s) return 10;
        const x = s.offsetX || 0;
        const y = s.offsetY || 0;
        return Math.round(Math.sqrt(x * x + y * y));
      })(),
      shadowOpacity: (() => {
        const s = obj.shadow;
        const color = s?.color as string | undefined;
        if (typeof color === "string") {
          const m = color.match(
            /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(\d*\.?\d+)\s*\)$/i
          );
          if (m) {
            const a = parseFloat(m[1]);
            if (!Number.isNaN(a)) return Math.max(0, Math.min(1, a));
          }
          if (/^rgb\(/i.test(color) || /^#/.test(color)) return 1;
        }
        return 0.4;
      })(),
      shadowColor: (() => {
        const s = obj.shadow;
        if (!s) return "#000000";
        const color = s.color as string | undefined;
        if (!color) return "#000000";
        const m = color.match(/^rgba?\((\d+),(\d+),(\d+)/);
        if (m) return `rgb(${m[1]},${m[2]},${m[3]})`;
        return color;
      })(),
      shadowBlur: obj.shadow?.blur ?? 10,
    };
    objectProperties.value = currentProps;
  } else {
    objectProperties.value = {
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
      placeholder: null,
      shadowEnabled: true,
      shadowAngle: 45,
      shadowDistance: 10,
      shadowOpacity: 0.4,
      shadowColor: "#000000",
      shadowBlur: 10,
    };
  }
};

// 监听选中对象变化
watch(() => props.selectedObject, updateObjectProps, { immediate: true });

// 监听更新计数器变化
watch(
  () => props.updateCounter,
  () => {
    if (props.selectedObject) {
      updateObjectProps(props.selectedObject);
    }
  }
);

// 更新属性
const updateProperties = () => {
  emit("update-properties", objectProperties.value);
};

// 选择图案
const selectPattern = (index: number) => {
  selectedPattern.value = index;
  updatePatternFill();
};

// 图片加载错误处理
const handleImageError = (e: Event) => {
  console.error("图案加载失败:", e);
  const img = e.target as HTMLImageElement;
  // 尝试使用绝对路径
  if (!img.src.includes("localhost")) {
    img.src = `http://localhost:3001${img.src}`;
  }
};

// 更新图案填充
const updatePatternFill = () => {
  emit("update-properties", {
    ...objectProperties.value,
    patternSrc: `/template/poster/${selectedPattern.value}.jpg`,
    patternMode: patternMode.value,
  });
};

// 切换图案编辑模式
const togglePatternEditMode = () => {
  patternEditMode.value = !patternEditMode.value;
  emit("toggle-pattern-edit-mode", patternEditMode.value);
};

// 更新图案变换
const updatePatternTransform = () => {
  emit("update-pattern-transform", patternTransform.value);
};
</script>

<style scoped>
.poster-properties {
  height: 100%;
  padding: 16px;
  overflow-y: auto;
}

.pattern-selector {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  width: 100%;
}

.pattern-item {
  aspect-ratio: 1;
  border: 2px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s;
}

.pattern-item:hover {
  border-color: #409eff;
  transform: scale(1.05);
}

.pattern-item.active {
  border-color: #409eff;
  border-width: 3px;
  box-shadow: 0 0 8px rgba(64, 158, 255, 0.4);
}

.pattern-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.pattern-position-controls {
  display: flex;
  gap: 8px;
}

.pattern-position-controls .el-input-number {
  flex: 1;
}

.no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
}

.property-section {
  margin-bottom: 12px;
  padding: 16px;
  background: var(--bg-primary);
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.property-section h4 {
  margin: 0 0 12px 0;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.action-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.property-collapse {
  margin-bottom: 12px;
  border: none;
  background: var(--bg-primary);
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.collapse-title {
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
}

:deep(.el-collapse-item__header) {
  padding: 12px 16px;
  background: var(--bg-primary);
  border: none;
  font-weight: 600;
}

:deep(.el-collapse-item__wrap) {
  border: none;
  background: var(--bg-primary);
}

:deep(.el-collapse-item__content) {
  padding: 0 16px 16px;
}

.el-form-item {
  margin-bottom: 16px;
}

.el-form-item:last-child {
  margin-bottom: 0;
}

.full-width-input {
  width: 100%;
}

.full-width-select {
  width: 100%;
}

.slider-with-input {
  display: flex;
  gap: 8px;
  align-items: center;
}

.slider-with-input .el-slider {
  flex: 1;
  min-width: 0;
}

.slider-with-input .slider-input {
  width: 60px;
  flex-shrink: 0;
}

:deep(.el-input-number) {
  width: 100%;
}

:deep(.el-input-number .el-input__inner) {
  text-align: left;
  padding-left: 8px;
  padding-right: 8px;
}

:deep(.el-slider) {
  padding: 0 4px;
}

.action-buttons .el-button {
  width: 100%;
  margin: 0;
}

:deep(.el-color-picker) {
  display: block;
}

/* 海报形状选择器 */
.poster-shape-selector {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.poster-shape-selector .el-button {
  width: 100%;
}

/* 海报图片选择器 */
.poster-image-selector {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.poster-thumbnail {
  aspect-ratio: 2/3;
  border: 2px solid transparent;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
}

.poster-thumbnail:hover {
  border-color: var(--el-color-primary);
  transform: scale(1.05);
}

.poster-thumbnail.active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 8px var(--el-color-primary);
}

.poster-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

</style>
