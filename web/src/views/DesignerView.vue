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
              size="small"
              text
              @click="router.push('/app/templates')"
              style="margin-right: 12px"
            >
              <el-icon><ArrowLeft /></el-icon>
              {{ t('designer.backToList') }}
            </el-button>
            <span class="toolbar-title">{{
              templateInfo.name || t('designer.newTemplate')
            }}</span>
          </div>
          <div class="toolbar-actions">
            <el-button size="small" @click="showTemplateInfoDialog = true">
              <el-icon><Edit /></el-icon>
              {{ t('designer.templateInfo') }}
            </el-button>
            <el-button size="small" type="success" @click="saveTemplate">
              <el-icon><Check /></el-icon>
              {{ t('designer.saveTemplate') }}
            </el-button>
            <el-button size="small" type="primary" @click="exportPoster">
              <el-icon><Download /></el-icon>
              {{ t('designer.exportPoster') }}
            </el-button>
          </div>
        </div>

        <!-- 画布区域 -->
        <div class="canvas-content">
          <div
            class="canvas-wrapper"
            style="width: 960px; height: 540px; overflow: hidden; padding: 0"
          >
            <canvas
              ref="canvasRef"
              :width="canvasWidth"
              :height="canvasHeight"
              style="width: 100%; height: 100%; display: block; margin: 0"
            ></canvas>
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
          @toggle-pattern-edit-mode="togglePatternEditMode"
          @update-pattern-transform="updatePatternTransform"
          @change-poster-shape="changePosterShape"
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
} from "@element-plus/icons-vue";
import { API_ENDPOINTS } from "../config/api";

const { t } = useI18n();

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
    });
    fabricCanvas.on("selection:updated", (e) => {
      selectedObject.value = e.selected?.[0] || null;
    });
    fabricCanvas.on("selection:cleared", () => {
      selectedObject.value = null;
    });
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

// 添加海报元素
const addPosterElement = (posterIndex: number = 1) => {
  if (!fabricCanvas) return;
  
  const posterSrc = `/template/poster/${posterIndex}.jpg`;
  const safeLeft = 300;
  const safeTop = 300;

  fabric.Image.fromURL(
    posterSrc,
    (img) => {
      // 设置海报尺寸（与矩形元素相同）
      const targetWidth = 150;
      const targetHeight = 220;
      
      const scaleX = targetWidth / (img.width || 1);
      const scaleY = targetHeight / (img.height || 1);
      
      img.set({
        left: safeLeft,
        top: safeTop,
        scaleX: scaleX,
        scaleY: scaleY,
        // 添加自定义属性标记这是海报元素
        posterIndex: posterIndex,
        posterType: 'poster'
      } as any);
      
      fabricCanvas?.add(img);
      fabricCanvas?.setActiveObject(img);
      ElMessage.success(t('designer.posterAdded'));
    },
    { crossOrigin: "anonymous" }
  );
};

// 切换海报形状
const changePosterShape = (shape: string) => {
  if (!fabricCanvas || !selectedObject.value || selectedObject.value.posterType !== 'poster') return;
  
  const poster = selectedObject.value as any;
  const width = poster.width * poster.scaleX;
  const height = poster.height * poster.scaleY;
  
  let clipPath: fabric.Object | null = null;
  
  switch (shape) {
    case 'circle':
      clipPath = new fabric.Circle({
        radius: Math.min(width, height) / 2,
        originX: 'center',
        originY: 'center',
        left: width / 2,
        top: height / 2
      });
      break;
    case 'triangle':
      clipPath = new fabric.Triangle({
        width: width,
        height: height,
        originX: 'center',
        originY: 'center',
        left: width / 2,
        top: height / 2
      });
      break;
    case 'star':
      // 创建星形路径
      const points = 5;
      const outerRadius = Math.min(width, height) / 2;
      const innerRadius = outerRadius * 0.4;
      const centerX = width / 2;
      const centerY = height / 2;
      
      let pathData = '';
      for (let i = 0; i < points * 2; i++) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = (Math.PI / points) * i - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        pathData += `${i === 0 ? 'M' : 'L'} ${x} ${y} `;
      }
      pathData += 'Z';
      
      clipPath = new fabric.Path(pathData, {
        originX: 'left',
        originY: 'top',
        left: 0,
        top: 0
      });
      break;
    default: // rect
      clipPath = null;
  }
  
  poster.set({ clipPath: clipPath as any });
  fabricCanvas.renderAll();
  ElMessage.success(`已切换为${shape === 'rect' ? '矩形' : shape === 'circle' ? '圆形' : shape === 'triangle' ? '三角形' : '星形'}形状`);
};

// 切换海报图片
const changePosterImage = (index: number) => {
  if (!fabricCanvas || !selectedObject.value || selectedObject.value.posterType !== 'poster') return;
  
  const poster = selectedObject.value as fabric.Image;
  const newSrc = `/template/poster/${index}.jpg`;
  
  fabric.Image.fromURL(
    newSrc,
    (newImg) => {
      // 保持原有的缩放比例
      const scaleX = poster.scaleX || 1;
      const scaleY = poster.scaleY || 1;
      
      // 更新图片源和属性
      poster.setElement(newImg.getElement());
      poster.set({
        posterIndex: index,
        scaleX: scaleX,
        scaleY: scaleY
      } as any);
      
      fabricCanvas?.renderAll();
      ElMessage.success(`已切换为海报 ${index}`);
    },
    { crossOrigin: "anonymous" }
  );
};

// 更新对象属性
const updateObjectProperties = (properties: any) => {
  if (!fabricCanvas || !selectedObject.value) return;

  console.log("🔧 Updating object properties:", properties);

  // 拆分阴影和其他参数(移除图案相关参数)
  const {
    shadowEnabled,
    shadowAngle,
    shadowDistance,
    shadowOpacity,
    shadowColor,
    shadowBlur,
    // 移除这些,图案只能通过双击编辑器修改
    // patternSrc,
    // patternMode,
    ...rest
  } = properties || {};

  // 检查当前对象是否使用图案填充
  const currentFill = selectedObject.value.fill;
  const isPatternFill =
    currentFill && typeof currentFill === "object" && "source" in currentFill;

  // 图案填充已移除,只能通过双击编辑器修改
  // 常规属性直接设置
  // 处理描边宽度为0的情况：设置为透明描边而不是移除填充
  const propsToSet = { ...rest };

  // 如果当前是图案填充,从属性中移除 fill,避免覆盖图案
  if (isPatternFill && "fill" in propsToSet) {
    delete propsToSet.fill;
  }

  if (propsToSet.strokeWidth === 0) {
    propsToSet.stroke = "transparent";
  }
  selectedObject.value.set(propsToSet);

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
      // 组装 RGBA 色值
      let rgbaColor = color;
      if (/^#/.test(color)) {
        // hex 转 rgb
        const hex = color.replace(/^#/, "");
        const bigint = parseInt(hex, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        rgbaColor = `rgba(${r},${g},${b},${opacity})`;
      } else if (/^rgb\(/i.test(color)) {
        rgbaColor = color.replace(
          /^rgb\(([^)]+)\)/i,
          (_m: string, rgb: string) => `rgba(${rgb},${opacity})`
        );
      } else if (/^rgba\(/i.test(color)) {
        // 替换 alpha
        rgbaColor = color.replace(
          /rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/i,
          (_m: string, r: string, g: string, b: string) =>
            `rgba(${r},${g},${b},${opacity})`
        );
      }
      const shadow = new fabric.Shadow({
        color: rgbaColor,
        blur,
        offsetX,
        offsetY,
      });
      selectedObject.value.set("shadow", shadow);
    } else {
      // 关闭阴影
      selectedObject.value.set("shadow", null as any);
    }
  }

  fabricCanvas?.renderAll();
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
    const response = await fetch(API_ENDPOINTS.templates.byId(id));
    if (!response.ok) throw new Error("加载模板失败");

    const template = await response.json();

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
      response = await fetch(API_ENDPOINTS.templates.byId(templateId.value), {
        method: "PUT",
        body: formData,
      });
    } else {
      // 创建新模板
      response = await fetch(API_ENDPOINTS.templates.base, {
        method: "POST",
        body: formData,
      });
    }

    if (!response.ok) throw new Error("保存模板失败");

    const result = await response.json();

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
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
}

.toolbar-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.dialog-label {
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 8px;
}

.canvas-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
}

.canvas-wrapper {
  background: var(--bg-primary);
  border-radius: 16px;
  box-shadow:
    0 8px 32px rgba(102, 126, 234, 0.08),
    0 2px 8px rgba(0, 0, 0, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  width: 960px;
  height: 540px;
  overflow: hidden;
  padding: 0;
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
