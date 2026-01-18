<template>
  <div class="poster-designer">
    <el-container>
      <el-aside width="300px" class="tools-panel">
        <PosterToolbar
          @add-text="addTextElement"
          @add-image="addImageElement"
          @change-background="changeBackground"
          @add-shape="addShapeElement"
          @add-poster="addPosterElement"
        />
      </el-aside>
      <el-main class="canvas-container">
        <!-- 顶部工具栏 -->
        <div class="top-toolbar">
          <div class="toolbar-left">
            <el-button
              class="back-btn"
              @click="router.push('/app/templates')"
            >
              <el-icon><ArrowLeft /></el-icon>
            </el-button>
            <div class="template-info">
              <span class="toolbar-title">{{ templateInfo.name || t('designer.newTemplate') }}</span>
              <el-button class="edit-name-btn" @click="showTemplateInfoDialog = true">
                <el-icon><Edit /></el-icon>
              </el-button>
            </div>
          </div>
          
          <div class="toolbar-center">
            <div class="quick-actions-bar">
              <el-tooltip content="撤销" placement="bottom">
                <el-button class="action-icon-btn" disabled>
                  <el-icon><RefreshLeft /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="重做" placement="bottom">
                <el-button class="action-icon-btn" disabled>
                  <el-icon><RefreshRight /></el-icon>
                </el-button>
              </el-tooltip>
              <div class="action-divider"></div>
              <el-tooltip content="缩放" placement="bottom">
                <div class="zoom-control">
                  <el-button class="zoom-btn" @click="zoomOut">
                    <el-icon><Minus /></el-icon>
                  </el-button>
                  <span class="zoom-value">{{ Math.round(zoomLevel * 100) }}%</span>
                  <el-button class="zoom-btn" @click="zoomIn">
                    <el-icon><Plus /></el-icon>
                  </el-button>
                </div>
              </el-tooltip>
            </div>
          </div>
          
          <div class="toolbar-actions">
            <el-button class="toolbar-btn" @click="showTemplateInfoDialog = true">
              <el-icon><Setting /></el-icon>
              {{ t('designer.templateInfo') }}
            </el-button>
            <el-button class="toolbar-btn save-btn" @click="saveTemplate">
              <el-icon><Check /></el-icon>
              {{ t('designer.saveTemplate') }}
            </el-button>
            <el-button class="toolbar-btn export-btn" @click="exportPoster">
              <el-icon><Download /></el-icon>
              {{ t('designer.exportPoster') }}
            </el-button>
          </div>
        </div>

        <!-- 画布区域 -->
        <div class="canvas-content">
          <div
            class="canvas-wrapper"
            :style="{
              width: 960 * zoomLevel + 'px',
              height: 540 * zoomLevel + 'px',
              overflow: 'hidden',
              padding: 0
            }"
          >
            <canvas
              ref="canvasRef"
              :width="canvasWidth"
              :height="canvasHeight"
              :style="{
                width: '100%',
                height: '100%',
                display: 'block',
                margin: 0
              }"
            ></canvas>
          </div>
          
          <!-- 底部操作栏 -->
          <div class="bottom-bar">
            <span class="canvas-size">{{ canvasWidth }} × {{ canvasHeight }}px</span>
          </div>
        </div>
      </el-main>
      <el-aside width="280px" class="properties-panel">
        <PosterProperties
          :selected-object="selectedObject"
          :update-counter="updateCounter"
          @update-properties="updateObjectProperties"
          @duplicate-object="() => handlePropertiesAction('duplicate')"
          @delete-object="() => handlePropertiesAction('delete')"
          @bring-to-front="() => handlePropertiesAction('bringToFront')"
          @send-to-back="() => handlePropertiesAction('sendToBack')"
          @change-poster-image="changePosterImage"
        />
      </el-aside>
    </el-container>

    <!-- 模板信息编辑对话框 -->
    <el-dialog v-model="showTemplateInfoDialog" :title="t('designer.templateInfo')" width="500px">
      <el-form :model="templateInfo" label-width="80px">
        <el-form-item :label="t('templates.templateName')" required>
          <el-input
            v-model="templateInfo.name"
            :placeholder="t('templates.templateNamePlaceholder')"
            maxlength="100"
          />
        </el-form-item>
        <el-form-item :label="t('templates.description')">
          <el-input
            v-model="templateInfo.description"
            type="textarea"
            :rows="3"
            :placeholder="t('templates.descriptionPlaceholder')"
            maxlength="500"
          />
        </el-form-item>
        <el-form-item :label="t('templates.tags')">
          <div class="tags-input">
            <el-tag
              v-for="tag in templateInfo.tags"
              :key="tag"
              closable
              @close="removeTag(tag)"
              style="margin-right: 8px; margin-bottom: 8px"
            >
              {{ tag }}
            </el-tag>
            <el-input
              v-model="newTag"
              size="small"
              :placeholder="t('templates.addTag')"
              style="width: 150px"
              @keyup.enter="addTag"
            />
          </div>
        </el-form-item>
        <el-form-item :label="t('templates.matchTags')">
          <div class="tags-input">
            <el-tag
              v-for="matchTag in templateInfo.matchTags"
              :key="matchTag"
              closable
              @close="removeMatchTag(matchTag)"
              type="success"
              style="margin-right: 8px; margin-bottom: 8px"
            >
              {{ matchTag }}
            </el-tag>
            <el-input
              v-model="newMatchTag"
              size="small"
              :placeholder="t('templates.addMatchTag')"
              style="width: 150px"
              @keyup.enter="addMatchTag"
            />
          </div>
          <div style="color: #909399; font-size: 12px; margin-top: 4px">
            {{ t('templates.matchTagsHint') }}
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTemplateInfoDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveTemplateInfo">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- 图案编辑弹窗（双击元素打开） -->
    <el-dialog
      v-model="patternEditorVisible"
      :title="t('designer.editFill')"
      class="pattern-editor-dialog"
      width="720px"
    >
      <!-- 模式切换 -->
      <div style="margin-bottom: 16px">
        <el-radio-group v-model="patternEditorState.fillMode" size="small">
          <el-radio label="color">{{ t('designer.colorFill') }}</el-radio>
          <el-radio label="pattern">{{ t('designer.patternFill') }}</el-radio>
        </el-radio-group>
      </div>

      <!-- 纯色模式 -->
      <div
        v-if="patternEditorState.fillMode === 'color'"
        style="margin-bottom: 16px"
      >
        <el-form-item :label="t('designer.fillColor')" label-width="80px">
          <el-color-picker v-model="patternEditorState.fillColor" show-alpha />
        </el-form-item>
      </div>

      <!-- 图案模式 -->
      <div v-if="patternEditorState.fillMode === 'pattern'">
        <!-- 图片选择器 -->
        <div style="margin-bottom: 12px">
          <div class="dialog-label">
            {{ t('designer.selectPattern') }}：
          </div>
          <div
            style="
              display: grid;
              grid-template-columns: repeat(9, 1fr);
              gap: 8px;
              margin-bottom: 12px;
            "
          >
            <div
              v-for="(imgPath, index) in patternImages"
              :key="index"
              :style="{
                cursor: 'pointer',
                border: patternEditorState.imgSrc.endsWith(imgPath)
                  ? '2px solid #409eff'
                  : '2px solid transparent',
                borderRadius: '4px',
                overflow: 'hidden',
                aspectRatio: '1',
                background: '#f5f5f5',
              }"
              @click="selectPatternImage(imgPath)"
            >
              <img
                :src="imgPath"
                :style="{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }"
                :alt="`pattern-${index + 1}`"
              />
            </div>
          </div>
        </div>
        <div class="dialog-label">
          {{ t('designer.patternHint') }}
        </div>
        <div
          class="pattern-editor-viewport"
          :style="{
            width: editorViewportWidth + 'px',
            height: editorViewportHeight + 'px',
            overflow: 'hidden',
            position: 'relative',
            background: '#f5f5f5',
            border: '2px solid #ddd',
            borderRadius: '4px',
          }"
          @mousedown="onEditorMouseDown"
          @mousemove="onEditorMouseMove"
          @mouseup="onEditorMouseUp"
          @mouseleave="onEditorMouseUp"
          @wheel="onEditorWheel"
        >
          <img
            v-if="patternEditorState.imgSrc"
            class="pattern-editor-img"
            :src="patternEditorState.imgSrc"
            :style="{
              position: 'absolute',
              top: '0',
              left: '0',
              transformOrigin: '0 0',
              transform: `translate(${patternEditorState.panX * editorViewportScale}px, ${patternEditorState.panY * editorViewportScale}px) scale(${patternEditorState.scale * editorViewportScale})`,
              imageRendering: 'high-quality',
            }"
            alt="pattern"
            draggable="false"
          />
        </div>
      </div>

      <template #footer>
        <div style="display: flex; justify-content: space-between; width: 100%">
          <el-button
            v-if="patternEditorState.fillMode === 'pattern'"
            @click="resetPatternToFit"
            size="small"
          >
            {{ t('designer.resetToFit') }}
          </el-button>
          <span v-else></span>
          <div>
            <el-button @click="cancelPatternEditor">{{ t('common.cancel') }}</el-button>
            <el-button type="primary" @click="applyPatternEditor"
              >{{ t('designer.applyFill') }}</el-button
            >
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { fabric } from "fabric";
import PosterToolbar from "../components/PosterToolbar.vue";
import PosterProperties from "../components/PosterProperties.vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Check,
  Folder,
  Download,
  ArrowLeft,
  Edit,
  Setting,
  RefreshLeft,
  RefreshRight,
  Minus,
  Plus,
} from "@element-plus/icons-vue";
import { API_ENDPOINTS } from "../config/api";
import axios, { AxiosRequestConfig } from "axios";
import { useAuthStore } from "../stores/auth";

const { t } = useI18n();
const authStore = useAuthStore();

// 缩放级别
const zoomLevel = ref(1);

const zoomIn = () => {
  zoomLevel.value = Math.min(2, zoomLevel.value + 0.1);
};

const zoomOut = () => {
  zoomLevel.value = Math.max(0.5, zoomLevel.value - 0.1);
};

// 带有认证头的 Axios 辅助函数
const authAxios = {
  get: (url: string, config: AxiosRequestConfig = {}) => 
    axios.get(url, { ...config, headers: { ...config.headers, Authorization: `Bearer ${authStore.token}` } }),
  post: (url: string, data: any, config: AxiosRequestConfig = {}) => 
    axios.post(url, data, { ...config, headers: { ...config.headers, Authorization: `Bearer ${authStore.token}` } }),
  put: (url: string, data: any, config: AxiosRequestConfig = {}) => 
    axios.put(url, data, { ...config, headers: { ...config.headers, Authorization: `Bearer ${authStore.token}` } }),
  delete: (url: string, config: AxiosRequestConfig = {}) => 
    axios.delete(url, { ...config, headers: { ...config.headers, Authorization: `Bearer ${authStore.token}` } }),
};

// 路由
const route = useRoute();
const router = useRouter();

// 模板信息
const templateId = ref<string | null>(null);
const templateInfo = ref({
  name: "",
  description: "",
  tags: [] as string[],
  matchTags: [] as string[],
});
const isEditMode = ref(false);
const showTemplateInfoDialog = ref(false);
const newTag = ref("");
const newMatchTag = ref("");

// Canvas 配置
const canvasRef = ref<HTMLCanvasElement>();
const canvasWidth = 1920;
const canvasHeight = 1080;
const displayWidth = 960;
const displayHeight = 540;
let fabricCanvas: fabric.Canvas | null = null;
const selectedObject = ref<fabric.Object | null>(null);
// 添加一个计数器来强制刷新
const updateCounter = ref(0);
// 图层列表数据
const canvasObjects = ref<any[]>([]);

const syncCanvasObjects = () => {
  if (!fabricCanvas) return;
  canvasObjects.value = [...fabricCanvas.getObjects()];
};
// 图案编辑模式
const patternEditMode = ref(false);
const patternDragging = ref(false);
const patternStartPos = ref({ x: 0, y: 0 });

// 弹窗图案编辑（双击进入,支持纯色和图案两种模式）
const patternEditorVisible = ref(false);
const patternEditorEl = ref<HTMLDivElement | null>(null);
const patternEditorState = ref({
  imgSrc: "",
  imgNaturalWidth: 0,
  imgNaturalHeight: 0,
  objWidth: 0,
  objHeight: 0,
  // 在对象坐标系中的平移与缩放
  panX: 0,
  panY: 0,
  scale: 1,
  // 填充模式: color 或 pattern (默认 pattern)
  fillMode: "pattern" as "color" | "pattern",
  // 纯色填充的颜色
  fillColor: "#000000",
});

// 可选的图案图片列表
const patternImages = [
  "/template/poster/1.jpg",
  "/template/poster/2.jpg",
  "/template/poster/3.jpg",
  "/template/poster/4.jpg",
  "/template/poster/5.jpg",
  "/template/poster/6.jpg",
  "/template/poster/7.jpg",
  "/template/poster/8.jpg",
  "/template/poster/9.jpg",
];

const patternEditorDragging = ref(false);
const patternEditorLast = ref({ x: 0, y: 0 });
// 弹窗视图的展示尺寸（按实际元素尺寸1:1显示,如果太大则按比例缩小到最大640px宽）
const editorViewportWidth = computed(() => {
  const actualWidth = patternEditorState.value.objWidth || 640;
  const actualHeight = patternEditorState.value.objHeight || 480;
  const maxWidth = 640;
  const maxHeight = 480;

  // 如果实际尺寸小于最大尺寸,则1:1显示
  if (actualWidth <= maxWidth && actualHeight <= maxHeight) {
    return actualWidth;
  }

  // 否则按比例缩小
  const scaleByWidth = maxWidth / actualWidth;
  const scaleByHeight = maxHeight / actualHeight;
  const scale = Math.min(scaleByWidth, scaleByHeight);

  return Math.round(actualWidth * scale);
});
const editorViewportHeight = computed(() => {
  const actualWidth = patternEditorState.value.objWidth || 640;
  const actualHeight = patternEditorState.value.objHeight || 480;
  const maxWidth = 640;
  const maxHeight = 480;

  // 如果实际尺寸小于最大尺寸,则1:1显示
  if (actualWidth <= maxWidth && actualHeight <= maxHeight) {
    return actualHeight;
  }

  // 否则按比例缩小
  const scaleByWidth = maxWidth / actualWidth;
  const scaleByHeight = maxHeight / actualHeight;
  const scale = Math.min(scaleByWidth, scaleByHeight);

  return Math.round(actualHeight * scale);
});

// 计算视口相对于实际元素的缩放比例(用于调整拖拽和缩放的灵敏度)
const editorViewportScale = computed(() => {
  const actualWidth = patternEditorState.value.objWidth || 640;
  return editorViewportWidth.value / actualWidth;
});

// 初始化 Fabric.js Canvas
onMounted(() => {
  if (canvasRef.value) {
    fabricCanvas = new fabric.Canvas(canvasRef.value, {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: "#ffffff",
    });

    // 设置默认随机渐变背景
    const h1 = Math.floor(Math.random() * 360);
    const s1 = Math.floor(40 + Math.random() * 40);
    const l1 = Math.floor(35 + Math.random() * 30);
    const h2 = Math.floor(Math.random() * 360);
    const s2 = Math.floor(40 + Math.random() * 40);
    const l2 = Math.floor(35 + Math.random() * 30);
    const color1 = `hsl(${h1},${s1}%,${l1}%)`;
    const color2 = `hsl(${h2},${s2}%,${l2}%)`;
    const defaultGradient = new fabric.Gradient({
      type: "linear",
      coords: { x1: 0, y1: 0, x2: canvasWidth, y2: 0 },
      colorStops: [
        { offset: 0, color: color1 },
        { offset: 0.5, color: color2 },
      ],
    });
    fabricCanvas.setBackgroundColor(
      defaultGradient,
      fabricCanvas.renderAll.bind(fabricCanvas)
    );

    // 监听对象选择
    fabricCanvas.on("selection:created", (e) => {
      selectedObject.value = e.selected?.[0] || null;
      syncCanvasObjects();
    });
    fabricCanvas.on("selection:updated", (e) => {
      selectedObject.value = e.selected?.[0] || null;
      syncCanvasObjects();
    });
    fabricCanvas.on("selection:cleared", () => {
      selectedObject.value = null;
      syncCanvasObjects();
    });
    fabricCanvas.on("object:added", syncCanvasObjects);
    fabricCanvas.on("object:removed", syncCanvasObjects);
    // 监听对象变动，实时刷新属性面板
    const syncProperties = () => {
      if (!fabricCanvas) return;
      const obj = fabricCanvas.getActiveObject();
      selectedObject.value = obj || null;
      // 强制触发属性面板更新
      updateCounter.value++;
      console.log(
        "syncProperties called, obj:",
        obj,
        "updateCounter:",
        updateCounter.value
      );
    };

    // 监听所有可能改变对象属性的事件
    const events = [
      "object:modified",
      "object:scaling",
      "object:moving",
      "object:rotating",
      "object:skewing",
    ];
    events.forEach((event) => {
      fabricCanvas?.on(event, syncProperties);
    });

    // 监听对象修改完成事件,处理图案填充的自适应
    fabricCanvas.on("object:modified", (e) => {
      const obj = e.target;
      if (!obj) return;

      // 检查对象是否使用图案填充
      const fill = (obj as any).fill;
      if (!fill || typeof fill !== "object" || !("source" in fill)) return;

      const pattern = fill as fabric.Pattern;
      const source = pattern.source as HTMLImageElement;
      if (!source || !source.width) return;

      // 获取对象当前的实际尺寸
      const objWidth = obj.getScaledWidth?.() || (obj as any).width || 100;
      const objHeight = obj.getScaledHeight?.() || (obj as any).height || 100;

      // 如果对象尺寸改变了,需要重新计算图案的缩放以保持 fit 模式
      // 注意:这里我们保持用户在编辑器中设置的缩放比例,只是记录新的对象尺寸
      // 实际上,如果想要图案始终保持 fit 模式,可以在这里重新计算 scale

      console.log(
        "🔄 Object modified, current size:",
        objWidth,
        "x",
        objHeight
      );
      console.log("🎨 Pattern info:", {
        transform: pattern.patternTransform,
        offsetX: pattern.offsetX,
        offsetY: pattern.offsetY,
      });
    });

    // 添加键盘事件监听，支持 Delete/Backspace 删除
    // 但当文本正在编辑或有输入框聚焦时，不执行删除
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const isInputFocused = !!(
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable)
      );

      const obj = fabricCanvas?.getActiveObject() as any;
      const isTextObject =
        obj && ["i-text", "textbox", "text"].includes(obj?.type);
      const isTextEditing = !!(isTextObject && obj.isEditing);

      if (isInputFocused || isTextEditing) {
        return; // 正在输入文本时，放行按键，不做删除
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedObject.value && fabricCanvas) {
          handlePropertiesAction("delete");
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // 监听 Fabric.js 的鼠标双击事件
    fabricCanvas.on("mouse:dblclick", (options) => {
      const target = options.target;
      if (!target) return;

      // 对文本：进入编辑模式
      const t = (target as any).type;
      if (["i-text", "textbox", "text"].includes(t)) {
        const txt = target as any;
        if (typeof txt.enterEditing === "function") {
          fabricCanvas?.setActiveObject(target);
          txt.enterEditing();
          // 聚焦到隐藏的 textarea，便于立即输入
          try {
            txt.hiddenTextarea &&
              txt.hiddenTextarea.focus &&
              txt.hiddenTextarea.focus();
          } catch {}
          fabricCanvas?.requestRenderAll();
        }
      }
      // 其他元素的双击编辑功能已移除
    });

    // 在组件卸载时移除事件监听
    onUnmounted(() => {
      document.removeEventListener("keydown", handleKeyDown);
    });

    // 检查 URL 参数,如果有模板 ID 则加载
    const queryTemplateId = route.query.templateId as string;
    const mode = route.query.mode as string;

    if (queryTemplateId) {
      templateId.value = queryTemplateId;
      isEditMode.value = mode === "edit";
      loadTemplateFromServer(queryTemplateId);
    } else {
      // 新建模板
      templateInfo.value.name = t('designer.newTemplate');
    }
  }
});

onUnmounted(() => {
  fabricCanvas?.dispose();
});

// 添加文本元素
const addTextElement = (text: string) => {
  if (!fabricCanvas) return;
  const safeLeft = 300;
  const safeTop = 300;

  // 使用 IText 支持文本编辑
  const textObj = new fabric.IText(text, {
    left: safeLeft,
    top: safeTop,
    fontSize: 32,
    fill: "#000000",
    fontFamily: "Arial",
    fontWeight: "normal",
  });

  fabricCanvas.add(textObj);
  fabricCanvas.setActiveObject(textObj);
  fabricCanvas.renderAll();
};

// 添加图片元素
const addImageElement = (imageUrl: string) => {
  if (!fabricCanvas) return;

  fabric.Image.fromURL(
    imageUrl,
    (img) => {
      img.set({
        left: 50,
        top: 50,
        scaleX: 0.5,
        scaleY: 0.5,
      });
      fabricCanvas?.add(img);
      fabricCanvas?.setActiveObject(img);
    },
    { crossOrigin: "anonymous" }
  );
};

// 添加形状元素
const addShapeElement = (type: string) => {
  if (!fabricCanvas) return;
  let shape: fabric.Object | null = null;

  const safeLeft = 300;
  const safeTop = 300;

  if (type === "rect") {
    shape = new fabric.Rect({
      left: safeLeft,
      top: safeTop,
      width: 150,
      height: 220,
      fill: "#4fd1c5",
      rx: 12,
      ry: 12,
    });
  } else if (type === "circle") {
    shape = new fabric.Circle({
      left: safeLeft,
      top: safeTop,
      radius: 75,
      fill: "#667eea",
    });
  } else if (type === "triangle") {
    shape = new fabric.Triangle({
      left: safeLeft,
      top: safeTop,
      width: 150,
      height: 225,
      fill: "#f59e0b",
    });
  } else if (type === "line") {
    shape = new fabric.Line([safeLeft, safeTop, safeLeft + 150, safeTop], {
      stroke: "#111827",
      strokeWidth: 6,
      selectable: true,
    });
  } else if (type === "star") {
    const createStarPoints = (
      spikes: number,
      outerRadius: number,
      innerRadius: number
    ) => {
      const points: { x: number; y: number }[] = [];
      const step = Math.PI / spikes;
      for (let i = 0; i < 2 * spikes; i++) {
        const r = i % 2 === 0 ? outerRadius : innerRadius;
        const a = i * step - Math.PI / 2;
        points.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      return points;
    };
    const points = createStarPoints(5, 75, 35);
    shape = new fabric.Polygon(points, {
      left: safeLeft,
      top: safeTop,
      fill: "#ec4899",
      originX: "center",
      originY: "center",
    });
  } else if (type === "arrow") {
    const pathData = "M 0 0 L 110 0 L 110 -20 L 150 0 L 110 20 L 110 0 Z";
    shape = new fabric.Path(pathData, {
      left: safeLeft,
      top: safeTop,
      fill: "#10b981",
      originX: "left",
      originY: "center",
    });
  }

  if (shape) {
    fabricCanvas.add(shape);
    fabricCanvas.setActiveObject(shape);
    fabricCanvas.renderAll();
    ElMessage.success(t('designer.addedShape'));
  } else {
    ElMessage.error(t('common.failed'));
  }
};

// 更改背景
const changeBackground = (bg: any) => {
  if (!fabricCanvas) return;
  // 随机渐变色
  if (bg.type === "random-gradient") {
    // 生成两组 HSL 色
    const h1 = Math.floor(Math.random() * 360);
    const s1 = Math.floor(40 + Math.random() * 40);
    const l1 = Math.floor(35 + Math.random() * 30);
    const h2 = Math.floor(Math.random() * 360);
    const s2 = Math.floor(40 + Math.random() * 40);
    const l2 = Math.floor(35 + Math.random() * 30);
    const color1 = `hsl(${h1},${s1}%,${l1}%)`;
    const color2 = `hsl(${h2},${s2}%,${l2}%)`;
    let coords = { x1: 0, y1: 0, x2: canvasWidth, y2: 0 };
    if (bg.direction === "leftToRight") {
      coords = { x1: 0, y1: 0, x2: canvasWidth, y2: 0 };
    } else if (bg.direction === "topToBottom") {
      coords = { x1: 0, y1: 0, x2: 0, y2: canvasHeight };
    } else if (bg.direction === "leftTopToRightBottom") {
      coords = { x1: 0, y1: 0, x2: canvasWidth, y2: canvasHeight };
    } else if (bg.direction === "rightTopToLeftBottom") {
      coords = { x1: canvasWidth, y1: 0, x2: 0, y2: canvasHeight };
    }
    const gradient = new fabric.Gradient({
      type: "linear",
      coords,
      colorStops: [
        { offset: 0, color: color1 },
        { offset: bg.ratio, color: color2 },
      ],
    });
    fabricCanvas.setBackgroundColor(
      gradient,
      fabricCanvas.renderAll.bind(fabricCanvas)
    );
    return;
  }
  if (typeof bg === "string") {
    fabricCanvas.setBackgroundColor(
      bg,
      fabricCanvas.renderAll.bind(fabricCanvas)
    );
    return;
  }
  if (bg.type === "color") {
    fabricCanvas.setBackgroundColor(
      bg.color,
      fabricCanvas.renderAll.bind(fabricCanvas)
    );
  } else if (bg.type === "gradient") {
    // 渊变方向
    let coords = { x1: 0, y1: 0, x2: canvasWidth, y2: 0 };
    if (bg.direction === "leftToRight") {
      coords = { x1: 0, y1: 0, x2: canvasWidth, y2: 0 };
    } else if (bg.direction === "topToBottom") {
      coords = { x1: 0, y1: 0, x2: 0, y2: canvasHeight };
    } else if (bg.direction === "leftTopToRightBottom") {
      coords = { x1: 0, y1: 0, x2: canvasWidth, y2: canvasHeight };
    } else if (bg.direction === "rightTopToLeftBottom") {
      coords = { x1: canvasWidth, y1: 0, x2: 0, y2: canvasHeight };
    }
    const gradient = new fabric.Gradient({
      type: "linear",
      coords,
      colorStops: [
        { offset: 0, color: bg.color1 },
        { offset: bg.ratio, color: bg.color2 },
      ],
    });
    fabricCanvas.setBackgroundColor(
      gradient,
      fabricCanvas.renderAll.bind(fabricCanvas)
    );
  }
};

// 添加海报元素 - 创建带海报填充的形状
const addPosterElement = (options: { shape: string; posterIndex: number } | number = { shape: 'rect', posterIndex: 1 }) => {
  if (!fabricCanvas) return;
  
  // 兼容旧的调用方式
  let shape = 'rect';
  let posterIndex = 1;
  
  if (typeof options === 'number') {
    posterIndex = options;
  } else {
    shape = options.shape;
    posterIndex = options.posterIndex;
  }
  
  const posterSrc = `/template/poster/${posterIndex}.jpg`;
  const safeLeft = 300;
  const safeTop = 300;

  fabric.Image.fromURL(
    posterSrc,
    (img) => {
      const imgElement = img.getElement() as HTMLImageElement;
      const imgWidth = img.width || 300;
      const imgHeight = img.height || 450;
      
      // 定义形状尺寸
      let shapeWidth = 150;
      let shapeHeight = 220;
      
      if (shape === 'square') {
        shapeWidth = 150;
        shapeHeight = 150;
      } else if (shape === 'circle') {
        shapeWidth = 150;
        shapeHeight = 150;
      }
      
      // 计算 pattern 的缩放比例以适应形状
      const scaleX = shapeWidth / imgWidth;
      const scaleY = shapeHeight / imgHeight;
      const patternScale = Math.max(scaleX, scaleY);
      
      // 创建 pattern
      const pattern = new fabric.Pattern({
        source: imgElement,
        repeat: 'no-repeat',
        patternTransform: [patternScale, 0, 0, patternScale, 0, 0],
      });
      
      let fabricShape: fabric.Object | null = null;
      
      switch (shape) {
        case 'rect':
          fabricShape = new fabric.Rect({
            left: safeLeft,
            top: safeTop,
            width: shapeWidth,
            height: shapeHeight,
            fill: pattern,
            rx: 8,
            ry: 8,
          });
          break;
          
        case 'square':
          fabricShape = new fabric.Rect({
            left: safeLeft,
            top: safeTop,
            width: shapeWidth,
            height: shapeHeight,
            fill: pattern,
            rx: 8,
            ry: 8,
          });
          break;
          
        case 'circle':
          fabricShape = new fabric.Circle({
            left: safeLeft,
            top: safeTop,
            radius: shapeWidth / 2,
            fill: pattern,
          });
          break;
          
        case 'triangle':
          fabricShape = new fabric.Triangle({
            left: safeLeft,
            top: safeTop,
            width: shapeWidth,
            height: shapeHeight,
            fill: pattern,
          });
          break;
          
        case 'star':
          // 创建五角星
          const createStarPoints = (
            spikes: number,
            outerRadius: number,
            innerRadius: number
          ) => {
            const points: { x: number; y: number }[] = [];
            const step = Math.PI / spikes;
            for (let i = 0; i < 2 * spikes; i++) {
              const r = i % 2 === 0 ? outerRadius : innerRadius;
              const a = i * step - Math.PI / 2;
              points.push({ x: Math.cos(a) * r + outerRadius, y: Math.sin(a) * r + outerRadius });
            }
            return points;
          };
          const outerRadius = shapeWidth / 2;
          const starPoints = createStarPoints(5, outerRadius, outerRadius * 0.4);
          fabricShape = new fabric.Polygon(starPoints, {
            left: safeLeft,
            top: safeTop,
            fill: pattern,
          });
          break;
          
        default:
          fabricShape = new fabric.Rect({
            left: safeLeft,
            top: safeTop,
            width: shapeWidth,
            height: shapeHeight,
            fill: pattern,
            rx: 8,
            ry: 8,
          });
      }
      
      if (fabricShape) {
        // 添加自定义属性标记这是海报元素
        (fabricShape as any).posterIndex = posterIndex;
        (fabricShape as any).posterType = 'poster';
        (fabricShape as any).posterShape = shape;
        
        fabricCanvas?.add(fabricShape);
        fabricCanvas?.setActiveObject(fabricShape);
        ElMessage.success(t('designer.posterAdded'));
      }
    },
    { crossOrigin: "anonymous" }
  );
};

// changePosterShape removed as requested - shape is now chosen only when adding the poster


// 切换海报图片
const changePosterImage = (index: number) => {
  if (!fabricCanvas || !selectedObject.value || (selectedObject.value as any).posterType !== 'poster') return;
  
  const currentObj = selectedObject.value as any;
  const currentShape = currentObj.posterShape || 'rect';
  const currentLeft = currentObj.left || 300;
  const currentTop = currentObj.top || 300;
  const posterSrc = `/template/poster/${index}.jpg`;
  
  fabric.Image.fromURL(
    posterSrc,
    (img) => {
      const imgElement = img.getElement() as HTMLImageElement;
      const imgWidth = img.width || 300;
      const imgHeight = img.height || 450;
      
      // 获取当前形状尺寸
      let shapeWidth = currentObj.width || 150;
      let shapeHeight = currentObj.height || 220;
      
      if (currentObj.type === 'circle') {
        shapeWidth = (currentObj.radius || 75) * 2;
        shapeHeight = shapeWidth;
      }
      
      // 计算新 pattern 的缩放比例
      const scaleX = shapeWidth / imgWidth;
      const scaleY = shapeHeight / imgHeight;
      const patternScale = Math.max(scaleX, scaleY);
      
      // 创建新 pattern
      const pattern = new fabric.Pattern({
        source: imgElement,
        repeat: 'no-repeat',
        patternTransform: [patternScale, 0, 0, patternScale, 0, 0],
      });
      
      // 更新填充
      currentObj.set({ fill: pattern });
      (currentObj as any).posterIndex = index;
      
      fabricCanvas?.renderAll();
      ElMessage.success(`已切换为海报 ${index}`);
    },
    { crossOrigin: "anonymous" }
  );
};

// 更新对象属性
const updateObjectProperties = (properties: any) => {
  if (!fabricCanvas || !selectedObject.value) return;

  // 拆分参数
  const {
    shadowEnabled,
    shadowAngle,
    shadowDistance,
    shadowOpacity,
    shadowColor,
    shadowBlur,
    ...rest
  } = properties || {};

  const currentFill = selectedObject.value.fill;
  const isPatternFill = currentFill && typeof currentFill === "object" && "source" in currentFill;

  const propsToSet = { ...rest };
  delete propsToSet.id; // 移除 id，不作为属性设置

  if (isPatternFill && "fill" in propsToSet) {
    delete propsToSet.fill;
  }

  if (propsToSet.strokeWidth === 0) {
    propsToSet.stroke = "transparent";
  }

  // 设置属性并同步坐标
  selectedObject.value.set(propsToSet);
  selectedObject.value.setCoords();

  // 处理阴影
  if (typeof shadowEnabled !== "undefined") {
    if (shadowEnabled) {
      const angle = Number(shadowAngle ?? 45);
      const dist = Number(shadowDistance ?? 10);
      const opacity = Number(shadowOpacity ?? 0.4);
      const color = shadowColor || "#000000";
      const blur = Number(shadowBlur ?? 10);
      const rad = (angle * Math.PI) / 180;
      const offsetX = Math.round(Math.cos(rad) * dist);
      const offsetY = Math.round(Math.sin(rad) * dist);
      
      let rgbaColor = color;
      if (/^#/.test(color)) {
        const hex = color.replace(/^#/, "");
        const bigint = parseInt(hex, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        rgbaColor = `rgba(${r},${g},${b},${opacity})`;
      }

      const shadow = new fabric.Shadow({
        color: rgbaColor,
        blur,
        offsetX,
        offsetY,
      });
      selectedObject.value.set("shadow", shadow);
    } else {
      selectedObject.value.set("shadow", null as any);
    }
  }

  fabricCanvas?.renderAll();
  syncCanvasObjects();
};

// 图层管理方法
const selectObjectById = (id: string) => {
  if (!fabricCanvas) return;
  const obj = fabricCanvas.getObjects().find((o: any) => o.id === id);
  if (obj) {
    fabricCanvas.setActiveObject(obj);
    fabricCanvas.renderAll();
  }
};

const toggleObjectVisibility = (id: string) => {
  if (!fabricCanvas) return;
  const obj = fabricCanvas.getObjects().find((o: any) => o.id === id);
  if (obj) {
    obj.set("visible", !obj.visible);
    fabricCanvas.renderAll();
    syncCanvasObjects();
  }
};

const toggleObjectLock = (id: string) => {
  if (!fabricCanvas) return;
  const obj = fabricCanvas.getObjects().find((o: any) => o.id === id);
  if (obj) {
    const isLocked = obj.lockMovementX;
    obj.set({
      lockMovementX: !isLocked,
      lockMovementY: !isLocked,
      lockScalingX: !isLocked,
      lockScalingY: !isLocked,
      lockRotation: !isLocked,
      hasControls: isLocked,
    });
    fabricCanvas.renderAll();
    syncCanvasObjects();
  }
};

const handleLayerCommand = (data: { command: string; id: string }) => {
  if (!fabricCanvas) return;
  const obj = fabricCanvas.getObjects().find((o: any) => o.id === data.id);
  if (!obj) return;

  switch (data.command) {
    case 'top': fabricCanvas.bringToFront(obj); break;
    case 'bottom': fabricCanvas.sendToBack(obj); break;
    case 'duplicate':
      obj.clone((cloned: any) => {
        fabricCanvas?.discardActiveObject();
        cloned.set({
          left: (obj.left || 0) + 20,
          top: (obj.top || 0) + 20,
          id: `obj_${Date.now()}`
        });
        fabricCanvas?.add(cloned);
        fabricCanvas?.setActiveObject(cloned);
      });
      break;
    case 'delete': fabricCanvas.remove(obj); break;
  }
  fabricCanvas.renderAll();
  syncCanvasObjects();
};

// 切换图案编辑模式
const togglePatternEditMode = (enabled: boolean) => {
  patternEditMode.value = enabled;

  if (!fabricCanvas || !selectedObject.value) return;

  if (enabled) {
    // 进入编辑模式：禁用对象的移动和缩放，启用图案内部操作
    selectedObject.value.set({
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
      lockRotation: true,
    });

    // 添加鼠标事件监听
    fabricCanvas.on("mouse:down", handlePatternMouseDown);
    fabricCanvas.on("mouse:move", handlePatternMouseMove);
    fabricCanvas.on("mouse:up", handlePatternMouseUp);
    fabricCanvas.on("mouse:wheel", handlePatternMouseWheel);

    ElMessage.info(t('designer.patternEditEnabled'));
  } else {
    // 退出编辑模式：恢复对象的交互
    selectedObject.value.set({
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: false,
    });

    // 移除鼠标事件监听
    fabricCanvas.off("mouse:down", handlePatternMouseDown);
    fabricCanvas.off("mouse:move", handlePatternMouseMove);
    fabricCanvas.off("mouse:up", handlePatternMouseUp);
    fabricCanvas.off("mouse:wheel", handlePatternMouseWheel);

    ElMessage.info(t('designer.patternEditDisabled'));
  }

  fabricCanvas.renderAll();
};

// 更新图案变换
const updatePatternTransform = (transform: {
  offsetX: number;
  offsetY: number;
  scale: number;
}) => {
  if (!fabricCanvas || !selectedObject.value) return;

  const obj = selectedObject.value;
  const fill = obj.fill;

  if (fill && typeof fill === "object" && "source" in fill) {
    const pattern = fill as fabric.Pattern;

    // 更新位置
    pattern.offsetX = transform.offsetX;
    pattern.offsetY = transform.offsetY;
    // 使用 patternTransform 统一缩放，保持原图
    pattern.patternTransform = [transform.scale, 0, 0, transform.scale, 0, 0];

    fabricCanvas.renderAll();
  }
};

// 处理图案拖动 - 鼠标按下
const handlePatternMouseDown = (e: fabric.IEvent) => {
  if (!patternEditMode.value || !selectedObject.value) return;

  const pointer = fabricCanvas?.getPointer(e.e as MouseEvent);
  if (
    pointer &&
    selectedObject.value.containsPoint(new fabric.Point(pointer.x, pointer.y))
  ) {
    patternDragging.value = true;
    patternStartPos.value = { x: pointer.x, y: pointer.y };
  }
};

// 处理图案拖动 - 鼠标移动
const handlePatternMouseMove = (e: fabric.IEvent) => {
  if (!patternDragging.value || !fabricCanvas || !selectedObject.value) return;

  const pointer = fabricCanvas.getPointer(e.e as MouseEvent);
  if (!pointer) return;

  const deltaX = pointer.x - patternStartPos.value.x;
  const deltaY = pointer.y - patternStartPos.value.y;

  const obj = selectedObject.value;
  const fill = obj.fill;

  if (fill && typeof fill === "object" && "source" in fill) {
    const pattern = fill as fabric.Pattern;
    pattern.offsetX = (pattern.offsetX || 0) + deltaX;
    pattern.offsetY = (pattern.offsetY || 0) + deltaY;

    patternStartPos.value = { x: pointer.x, y: pointer.y };
    fabricCanvas.renderAll();
  }
};

// 处理图案拖动 - 鼠标释放
const handlePatternMouseUp = () => {
  patternDragging.value = false;
};

// 处理图案缩放 - 鼠标滚轮
const handlePatternMouseWheel = (e: fabric.IEvent) => {
  if (!patternEditMode.value || !fabricCanvas || !selectedObject.value) return;

  const mouseEvent = e.e as WheelEvent;
  const pointer = fabricCanvas.getPointer(mouseEvent);

  if (
    !pointer ||
    !selectedObject.value.containsPoint(new fabric.Point(pointer.x, pointer.y))
  ) {
    return;
  }

  mouseEvent.preventDefault();
  mouseEvent.stopPropagation();

  const obj = selectedObject.value;
  const fill = obj.fill;

  if (fill && typeof fill === "object" && "source" in fill) {
    const pattern = fill as fabric.Pattern;
    const delta = mouseEvent.deltaY;
    const scaleFactor = delta > 0 ? 0.95 : 1.05;

    // 直接通过 patternTransform 缩放
    const current = pattern.patternTransform || [1, 0, 0, 1, 0, 0];
    const newScaleX = (current[0] || 1) * scaleFactor;
    const newScaleY = (current[3] || 1) * scaleFactor;
    pattern.patternTransform = [
      newScaleX,
      0,
      0,
      newScaleY,
      current[4] || 0,
      current[5] || 0,
    ];
    obj.set("fill", pattern);
    fabricCanvas.renderAll();
  }
};

// 弹窗内部拖拽(考虑视口缩放比例)
const onEditorMouseDown = (e: MouseEvent) => {
  patternEditorDragging.value = true;
  patternEditorLast.value = { x: e.clientX, y: e.clientY };
};
const onEditorMouseMove = (e: MouseEvent) => {
  if (!patternEditorDragging.value) return;
  const dx = e.clientX - patternEditorLast.value.x;
  const dy = e.clientY - patternEditorLast.value.y;
  // 根据视口缩放调整拖拽距离
  const scale = editorViewportScale.value;
  patternEditorState.value.panX += dx / scale;
  patternEditorState.value.panY += dy / scale;
  patternEditorLast.value = { x: e.clientX, y: e.clientY };
};
const onEditorMouseUp = () => {
  patternEditorDragging.value = false;
};
const onEditorWheel = (e: WheelEvent) => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.95 : 1.05;
  patternEditorState.value.scale = Math.max(
    0.05,
    Math.min(10, patternEditorState.value.scale * factor)
  );
};

// 选择图案图片
const selectPatternImage = (imgPath: string) => {
  const imgSrc = `${window.location.origin}${imgPath}`;

  // 加载新图片
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    // 更新状态
    patternEditorState.value.imgSrc = imgSrc;
    patternEditorState.value.imgNaturalWidth = img.naturalWidth;
    patternEditorState.value.imgNaturalHeight = img.naturalHeight;

    // 自动重置为适配模式
    if (selectedObject.value) {
      const target = selectedObject.value;
      const objWidth =
        target.getScaledWidth?.() || (target as any).width || 200;
      const objHeight =
        target.getScaledHeight?.() || (target as any).height || 200;

      patternEditorState.value.objWidth = objWidth;
      patternEditorState.value.objHeight = objHeight;

      const scaleX = objWidth / img.naturalWidth;
      const scaleY = objHeight / img.naturalHeight;
      const fitScale = Math.min(scaleX, scaleY);

      const scaledImgWidth = img.naturalWidth * fitScale;
      const scaledImgHeight = img.naturalHeight * fitScale;
      const offsetX = (objWidth - scaledImgWidth) / 2;
      const offsetY = (objHeight - scaledImgHeight) / 2;

      patternEditorState.value.scale = fitScale;
      patternEditorState.value.panX = offsetX;
      patternEditorState.value.panY = offsetY;
    }

    ElMessage.success(t('designer.patternChanged'));
  };
  img.onerror = () => {
    ElMessage.error(t('designer.imageLoadFailed'));
  };
  img.src = imgSrc;
};

// 重置图案为适配模式(Fit)
const resetPatternToFit = () => {
  const s = patternEditorState.value;
  if (!s.imgNaturalWidth || !s.imgNaturalHeight || !selectedObject.value) {
    ElMessage.warning(t('designer.cannotGetImageSize'));
    return;
  }

  // 重新获取当前元素的实际尺寸(可能已被用户调整过)
  const target = selectedObject.value;
  const objWidth = target.getScaledWidth?.() || (target as any).width || 200;
  const objHeight = target.getScaledHeight?.() || (target as any).height || 200;

  // 同时更新state中的尺寸
  patternEditorState.value.objWidth = objWidth;
  patternEditorState.value.objHeight = objHeight;

  // 计算 fit 模式的缩放: 让图片完整显示在元素内,保持宽高比
  const scaleX = objWidth / s.imgNaturalWidth;
  const scaleY = objHeight / s.imgNaturalHeight;
  const fitScale = Math.min(scaleX, scaleY);

  // 计算居中偏移
  const scaledImgWidth = s.imgNaturalWidth * fitScale;
  const scaledImgHeight = s.imgNaturalHeight * fitScale;
  const offsetX = (objWidth - scaledImgWidth) / 2;
  const offsetY = (objHeight - scaledImgHeight) / 2;

  // 更新状态
  patternEditorState.value.scale = fitScale;
  patternEditorState.value.panX = offsetX;
  patternEditorState.value.panY = offsetY;

  console.log("🔄 Reset to fit mode:", {
    fitScale,
    offsetX,
    offsetY,
    imgSize: [s.imgNaturalWidth, s.imgNaturalHeight],
    objSize: [objWidth, objHeight],
  });

  ElMessage.success(t('designer.resetToFitSuccess'));
};

const applyPatternEditor = () => {
  if (!fabricCanvas || !selectedObject.value) return;
  const obj = selectedObject.value;
  const s = patternEditorState.value;

  // 重新获取当前元素的实际尺寸(可能已被用户调整过)
  const currentObjWidth = obj.getScaledWidth?.() || (obj as any).width || 200;
  const currentObjHeight =
    obj.getScaledHeight?.() || (obj as any).height || 200;

  console.log("🎨 Applying editor changes:", {
    fillMode: s.fillMode,
    fillColor: s.fillColor,
    panX: s.panX,
    panY: s.panY,
    scale: s.scale,
    objSizeInState: [s.objWidth, s.objHeight],
    currentObjSize: [currentObjWidth, currentObjHeight],
  });

  if (s.fillMode === "color") {
    // 应用纯色填充
    obj.set("fill", s.fillColor);
    obj.set("dirty", true);
    fabricCanvas.requestRenderAll();
    updateCounter.value++;
    patternEditorVisible.value = false;
    ElMessage.success(t('designer.colorUpdated'));
    return;
  }

  // 应用图案填充
  const fill = (obj as any).fill as any;

  // 如果用户选择了新的图片,需要重新加载
  if (s.imgSrc) {
    fabric.util.loadImage(
      s.imgSrc,
      (img: HTMLImageElement | null) => {
        if (img && fabricCanvas) {
          // 创建新的 pattern 对象
          const newPattern = new fabric.Pattern({
            source: img,
            repeat: "no-repeat",
          });

          // 设置变换参数
          newPattern.patternTransform = [s.scale, 0, 0, s.scale, 0, 0];
          newPattern.offsetX = s.panX;
          newPattern.offsetY = s.panY;

          console.log("🔧 New pattern created with new image:", {
            imgSrc: s.imgSrc,
            transform: newPattern.patternTransform,
            offsetX: newPattern.offsetX,
            offsetY: newPattern.offsetY,
          });

          // 强制更新对象填充并重新渲染
          obj.set("fill", newPattern);
          obj.set("dirty", true);
          fabricCanvas.requestRenderAll();

          console.log("✅ Pattern applied with new image and canvas rendered");

          // 触发属性面板刷新
          updateCounter.value++;

          patternEditorVisible.value = false;
          ElMessage.success(t('designer.patternUpdated'));
        } else {
          ElMessage.error(t('designer.imageLoadFailed'));
        }
      },
      null,
      "anonymous"
    );
    return;
  }

  // 如果没有新图片,使用原有图片但更新变换参数
  if (!fill || typeof fill !== "object" || !("source" in fill)) {
    ElMessage.error(t('designer.notPatternFill'));
    return;
  }

  const pattern = fill as fabric.Pattern;

  // 创建新的 pattern 对象,使用原有图片
  const newPattern = new fabric.Pattern({
    source: pattern.source,
    repeat: "no-repeat",
  });

  // 分别设置变换参数(和创建形状时的方式一致)
  newPattern.patternTransform = [s.scale, 0, 0, s.scale, 0, 0];
  newPattern.offsetX = s.panX;
  newPattern.offsetY = s.panY;

  console.log("🔧 New pattern created:", {
    transform: newPattern.patternTransform,
    offsetX: newPattern.offsetX,
    offsetY: newPattern.offsetY,
  });

  // 强制更新对象填充并重新渲染
  obj.set("fill", newPattern);
  obj.set("dirty", true);
  fabricCanvas.requestRenderAll();

  console.log("✅ Pattern applied and canvas rendered");

  // 触发属性面板刷新
  updateCounter.value++;

  patternEditorVisible.value = false;
  ElMessage.success(t('designer.patternUpdated'));
};

const cancelPatternEditor = () => {
  patternEditorVisible.value = false;
};

// 标签管理
const addTag = () => {
  const tag = newTag.value.trim();
  if (tag && !templateInfo.value.tags.includes(tag)) {
    templateInfo.value.tags.push(tag);
    newTag.value = "";
  }
};

const removeTag = (tag: string) => {
  const index = templateInfo.value.tags.indexOf(tag);
  if (index > -1) {
    templateInfo.value.tags.splice(index, 1);
  }
};

const addMatchTag = () => {
  const matchTag = newMatchTag.value.trim();
  if (matchTag && !templateInfo.value.matchTags.includes(matchTag)) {
    templateInfo.value.matchTags.push(matchTag);
    newMatchTag.value = "";
  }
};

const removeMatchTag = (matchTag: string) => {
  const index = templateInfo.value.matchTags.indexOf(matchTag);
  if (index > -1) {
    templateInfo.value.matchTags.splice(index, 1);
  }
};

// 保存模板信息
const saveTemplateInfo = () => {
  if (!templateInfo.value.name.trim()) {
    ElMessage.warning(t('designer.templateNameRequired'));
    return;
  }
  showTemplateInfoDialog.value = false;
  ElMessage.success(t('designer.templateInfoUpdated'));
};

// 从服务器加载模板
const loadTemplateFromServer = async (id: string) => {
  try {
    const response = await authAxios.get(API_ENDPOINTS.templates.byId(id));
    const template = response.data;

    // 加载模板信息
    templateInfo.value.name = template.name || "";
    templateInfo.value.description = template.description || "";
    templateInfo.value.tags = template.tags
      ? typeof template.tags === "string"
        ? template.tags.split(",").filter(Boolean)
        : template.tags
      : [];
    templateInfo.value.matchTags = template.match_tags
      ? typeof template.match_tags === "string"
        ? JSON.parse(template.match_tags)
        : template.match_tags
      : [];

    // 加载画布数据
    if (template.canvas_data && fabricCanvas) {
      const canvasData =
        typeof template.canvas_data === "string"
          ? JSON.parse(template.canvas_data)
          : template.canvas_data;

      fabricCanvas.loadFromJSON(canvasData, () => {
        fabricCanvas?.renderAll();
        ElMessage.success(t('designer.templateLoadSuccess'));
      });
    }
  } catch (error) {
    console.error("加载模板失败:", error);
    ElMessage.error(t('designer.loadFailed'));
  }
};

// 保存模板
const saveTemplate = async () => {
  if (!fabricCanvas) return;

  // 如果没有模板名称,提示用户输入
  if (!templateInfo.value.name.trim()) {
    showTemplateInfoDialog.value = true;
    ElMessage.warning(t('designer.fillTemplateInfoFirst'));
    return;
  }

  try {
    const canvasData = fabricCanvas.toJSON();
    const previewDataUrl = fabricCanvas.toDataURL({
      format: "png",
      multiplier: 0.5,
    });

    // 将预览图 DataURL 转换为 Blob
    const previewBlob = await (await fetch(previewDataUrl)).blob();

    // 使用 FormData 上传
    const formData = new FormData();
    formData.append("name", templateInfo.value.name);
    formData.append("description", templateInfo.value.description || "");
    formData.append("canvasData", JSON.stringify(canvasData));
    formData.append("tags", JSON.stringify(templateInfo.value.tags || []));
    formData.append(
      "matchTags",
      JSON.stringify(templateInfo.value.matchTags || [])
    );
    formData.append("preview", previewBlob, "preview.png");

    let response;
    if (templateId.value) {
      // 更新现有模板
      response = await authAxios.put(API_ENDPOINTS.templates.byId(templateId.value), formData);
    } else {
      // 创建新模板
      response = await authAxios.post(API_ENDPOINTS.templates.base, formData);
    }

    const result = response.data;

    // 如果是新建,保存返回的 ID
    if (!templateId.value && result.id) {
      templateId.value = result.id;
      isEditMode.value = true;
    }

    ElMessage.success(t('templates.saveSuccess'));
  } catch (error) {
    console.error("保存模板失败:", error);
    ElMessage.error(t('templates.saveFailed'));
  }
};

// 加载模板(废弃,仅用于兼容)
const loadTemplate = () => {
  ElMessage.info(t('designer.selectTemplateToEdit'));
};

// 导出海报
const exportPoster = () => {
  if (!fabricCanvas) return;
  const dataUrl = fabricCanvas.toDataURL({ format: "png", multiplier: 1 });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = "poster.png";
  link.click();
  ElMessage.success(t('designer.exportSuccess'));
};

// 删除当前选中的对象
const deleteSelectedObject = () => {
  if (!fabricCanvas) return false;

  const activeObj = fabricCanvas.getActiveObject();
  if (!activeObj) return false;

  console.log("Deleting active object:", activeObj);

  // 直接删除当前激活的对象
  fabricCanvas.remove(activeObj);
  fabricCanvas.discardActiveObject();
  selectedObject.value = null;
  updateCounter.value++;
  fabricCanvas.renderAll();

  return true;
};

// 属性面板操作事件
const handlePropertiesAction = (action: string) => {
  console.log("handlePropertiesAction called with action:", action);
  if (!fabricCanvas || !selectedObject.value) {
    console.log("No canvas or selected object");
    return;
  }
  const obj = selectedObject.value;
  switch (action) {
    case "duplicate": {
      obj.clone((cloned: fabric.Object) => {
        if (!fabricCanvas) return;
        cloned.set({
          left: (obj.left ?? 0) + 30,
          top: (obj.top ?? 0) + 30,
        });
        fabricCanvas.add(cloned);
        fabricCanvas.setActiveObject(cloned);
        fabricCanvas.renderAll();
        ElMessage.success(t('designer.duplicatedElement'));
      });
      break;
    }
    case "delete": {
      const success = deleteSelectedObject();
      if (success) {
        ElMessage.success(t('designer.deletedElement'));
      } else {
        ElMessage.error(t('designer.deleteFailed'));
      }
      break;
    }
    case "bringToFront": {
      obj.bringToFront();
      fabricCanvas.renderAll();
      ElMessage.success(t('designer.broughtToFront'));
      break;
    }
    case "sendToBack": {
      obj.sendToBack();
      fabricCanvas.renderAll();
      ElMessage.success(t('designer.sentToBack'));
      break;
    }
  }
};
</script>

<style scoped>
.poster-designer {
  height: 100vh;
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
}

.el-container {
  height: 100%;
  min-height: 100vh;
  background: transparent;
}

.tools-panel {
  background: var(--bg-tertiary);
  border-right: 1px solid var(--border-color);
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.04);
  padding: 0;
  min-width: 300px;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.canvas-container {
  display: flex;
  flex-direction: column;
  background: transparent;
  padding: 0;
  min-width: 0;
}

.top-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: var(--bg-glass);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border-color);
  box-shadow: var(--shadow-md);
  flex-shrink: 0;
  gap: 16px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.back-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
  transform: translateX(-2px);
}

.template-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.edit-name-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all var(--transition-fast);
}

.edit-name-btn:hover {
  background: var(--bg-tertiary);
  color: var(--primary);
}

.toolbar-center {
  flex: 1;
  display: flex;
  justify-content: center;
}

.quick-actions-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-tertiary);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.action-icon-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.action-icon-btn:hover:not(:disabled) {
  background: var(--bg-primary);
  color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.action-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-divider {
  width: 1px;
  height: 20px;
  background: var(--border-color);
  margin: 0 6px;
}

.zoom-control {
  display: flex;
  align-items: center;
  gap: 6px;
}

.zoom-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
}

.zoom-btn:hover {
  background: var(--bg-primary);
  color: var(--primary);
}

.zoom-value {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  min-width: 45px;
  text-align: center;
}

.toolbar-actions {
  display: flex;
  gap: 10px;
}

.toolbar-btn {
  height: 36px;
  padding: 0 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all var(--transition-fast);
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
}

.toolbar-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.toolbar-btn.save-btn {
  background: linear-gradient(135deg, #10b981, #059669);
  border: none;
  color: white;
}

.toolbar-btn.save-btn:hover {
  background: linear-gradient(135deg, #059669, #047857);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.toolbar-btn.export-btn {
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  border: none;
  color: white;
}

.toolbar-btn.export-btn:hover {
  background: linear-gradient(135deg, var(--primary-dark), #6b4190);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.dialog-label {
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 8px;
}

.canvas-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 24px;
  background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%);
}

.canvas-wrapper {
  background: var(--bg-primary);
  border-radius: 16px;
  box-shadow:
    0 20px 50px rgba(0, 0, 0, 0.1),
    0 8px 20px rgba(102, 126, 234, 0.08),
    0 0 0 1px rgba(255, 255, 255, 0.5) inset;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 0;
  transition: all var(--transition-normal);
}

.bottom-bar {
  margin-top: 16px;
  padding: 8px 16px;
  background: var(--bg-glass);
  backdrop-filter: blur(12px);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.canvas-size {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 500;
}

.properties-panel {
  background: var(--bg-tertiary);
  border-left: 1px solid var(--border-color);
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.04);
  min-width: 280px;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

@media (max-width: 1200px) {
  .canvas-wrapper {
    padding: 8px;
  }
  .tools-panel,
  .properties-panel {
    min-width: 220px;
    max-width: 240px;
  }
}

@media (max-width: 900px) {
  .canvas-wrapper {
    width: 100vw !important;
    height: auto !important;
    padding: 0;
  }
  .tools-panel,
  .properties-panel {
    display: none;
  }
}
</style>

<!-- 图案编辑弹窗样式（非 scoped 以便弹层内可覆盖） -->
<style>
.pattern-editor-dialog .el-dialog__body {
  padding: 0 16px 16px 16px;
}
.pattern-editor-viewport {
  border: 1px dashed #999;
  background: var(--bg-tertiary);
  margin-top: 8px;
  user-select: none;
  overflow: hidden;
  position: relative;
}
.pattern-editor-stage {
  width: 100%;
  height: 100%;
  position: relative;
  cursor: grab;
}
.pattern-editor-stage:active {
  cursor: grabbing;
}
.pattern-editor-img {
  position: absolute;
  left: 0;
  top: 0;
  will-change: transform;
  transform-origin: top left;
}

.tags-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
</style>
