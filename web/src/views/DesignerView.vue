<template>
  <div class="poster-designer">
    <el-container>
      <el-aside width="300px" class="tools-panel">
        <PosterToolbar
          @add-text="addTextElement"
          @add-image="addImageElement"
          @change-background="changeBackground"
          @save-template="saveTemplate"
          @load-template="loadTemplate"
          @add-shape="addShapeElement"
          @export-poster="exportPoster"
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
              返回模板列表
            </el-button>
            <span class="toolbar-title">{{
              templateInfo.name || "新建模板"
            }}</span>
          </div>
          <div class="toolbar-actions">
            <el-button size="small" @click="showTemplateInfoDialog = true">
              <el-icon><Edit /></el-icon>
              模板信息
            </el-button>
            <el-button size="small" type="success" @click="saveTemplate">
              <el-icon><Check /></el-icon>
              保存模板
            </el-button>
            <el-button size="small" type="primary" @click="exportPoster">
              <el-icon><Download /></el-icon>
              导出海报
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
        />
      </el-aside>
    </el-container>

    <!-- 模板信息编辑对话框 -->
    <el-dialog v-model="showTemplateInfoDialog" title="模板信息" width="500px">
      <el-form :model="templateInfo" label-width="80px">
        <el-form-item label="模板名称" required>
          <el-input
            v-model="templateInfo.name"
            placeholder="请输入模板名称"
            maxlength="100"
          />
        </el-form-item>
        <el-form-item label="模板描述">
          <el-input
            v-model="templateInfo.description"
            type="textarea"
            :rows="3"
            placeholder="请输入模板描述"
            maxlength="500"
          />
        </el-form-item>
        <el-form-item label="标签">
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
              placeholder="输入标签后按回车"
              style="width: 150px"
              @keyup.enter="addTag"
            />
          </div>
        </el-form-item>
        <el-form-item label="匹配字符">
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
              placeholder="输入匹配字符后按回车"
              style="width: 150px"
              @keyup.enter="addMatchTag"
            />
          </div>
          <div style="color: #909399; font-size: 12px; margin-top: 4px">
            用于自动匹配媒体库，支持模糊匹配（例如：电影、Movies）
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showTemplateInfoDialog = false">取消</el-button>
        <el-button type="primary" @click="saveTemplateInfo">确定</el-button>
      </template>
    </el-dialog>

    <!-- 图案编辑弹窗（双击元素打开） -->
    <el-dialog
      v-model="patternEditorVisible"
      title="编辑填充"
      class="pattern-editor-dialog"
      width="720px"
    >
      <!-- 模式切换 -->
      <div style="margin-bottom: 16px">
        <el-radio-group v-model="patternEditorState.fillMode" size="small">
          <el-radio label="color">纯色填充</el-radio>
          <el-radio label="pattern">图案填充</el-radio>
        </el-radio-group>
      </div>

      <!-- 纯色模式 -->
      <div
        v-if="patternEditorState.fillMode === 'color'"
        style="margin-bottom: 16px"
      >
        <el-form-item label="填充颜色" label-width="80px">
          <el-color-picker v-model="patternEditorState.fillColor" show-alpha />
        </el-form-item>
      </div>

      <!-- 图案模式 -->
      <div v-if="patternEditorState.fillMode === 'pattern'">
        <!-- 图片选择器 -->
        <div style="margin-bottom: 12px">
          <div class="dialog-label">
            选择图案：
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
          提示：按住拖动可移动图案，滚轮缩放可放大/缩小；确认后将使用原图渲染，确保清晰度。
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
            重置为适配模式
          </el-button>
          <span v-else></span>
          <div>
            <el-button @click="cancelPatternEditor">取消</el-button>
            <el-button type="primary" @click="applyPatternEditor"
              >应用</el-button
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
      console.log("🖱️ Fabric mouse:dblclick event", options);
      const target = options.target;
      if (!target) {
        console.log("❌ No target in dblclick event");
        return;
      }

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
        return; // 文本双击不打开填充编辑器
      }

      // 检查是否是形状对象
      const objType = (target as any).type;
      const isShape = [
        "rect",
        "circle",
        "triangle",
        "polygon",
        "path",
      ].includes(objType);
      if (!isShape) {
        console.log("❌ Not a shape object, type:", objType);
        return;
      }

      selectedObject.value = target;

      // 获取元素当前的实际尺寸
      const objWidth =
        target.getScaledWidth?.() || (target as any).width || 200;
      const objHeight =
        target.getScaledHeight?.() || (target as any).height || 200;

      // 检查填充类型
      const fill = (target as any).fill as any;
      const isPatternFill =
        fill && typeof fill === "object" && "source" in fill;

      console.log("🎨 Fill type:", isPatternFill ? "pattern" : "color", fill);
      console.log("📐 Object size:", objWidth, "x", objHeight);

      if (isPatternFill) {
        // 图案填充模式
        const pattern = fill as fabric.Pattern;
        const source = pattern.source as HTMLImageElement | string;
        const imgSrc = typeof source === "string" ? source : source?.src;

        if (!imgSrc) {
          console.log("❌ No image source in pattern");
          return;
        }

        // 获取当前的pattern transform
        const currentTransform = (pattern.patternTransform as
          | number[]
          | undefined) || [1, 0, 0, 1, 0, 0];
        const currentScale = currentTransform[0] || 1;

        console.log(" Current pattern transform:", currentTransform);
        console.log("📏 Current scale:", currentScale);

        // 加载图片获取原始尺寸
        const tmpImg = new Image();
        tmpImg.crossOrigin = "anonymous";
        tmpImg.onload = () => {
          patternEditorState.value = {
            imgSrc,
            imgNaturalWidth: tmpImg.naturalWidth,
            imgNaturalHeight: tmpImg.naturalHeight,
            objWidth,
            objHeight,
            panX: pattern.offsetX || 0,
            panY: pattern.offsetY || 0,
            scale: currentScale,
            fillMode: "pattern",
            fillColor: "#000000",
          };
          patternEditorVisible.value = true;
        };
        tmpImg.src = imgSrc;
      } else {
        // 纯色填充模式
        const currentColor = typeof fill === "string" ? fill : "#000000";

        patternEditorState.value = {
          imgSrc: "",
          imgNaturalWidth: 0,
          imgNaturalHeight: 0,
          objWidth,
          objHeight,
          panX: 0,
          panY: 0,
          scale: 1,
          fillMode: "color",
          fillColor: currentColor,
        };
        patternEditorVisible.value = true;
      }
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
      templateInfo.value.name = "新建模板";
    }
  }
});

onUnmounted(() => {
  fabricCanvas?.dispose();
});

// 添加文本元素（可编辑）
const addTextElement = (text: string) => {
  if (!fabricCanvas) return;
  // 设置更安全的初始位置，避免溢出
  const safeLeft = 300;
  const safeTop = 300;

  // 创建默认阴影
  const defaultShadow = new fabric.Shadow({
    color: "rgba(0,0,0,0.4)",
    blur: 10,
    offsetX: 7,
    offsetY: 7,
  });

  // 使用 IText 以支持双击/编辑/光标
  const textObj = new fabric.IText(text, {
    left: safeLeft,
    top: safeTop,
    fontSize: 32,
    fill: "#000000",
    fontFamily: "Arial",
    fontWeight: "bold",
    shadow: defaultShadow,
    stroke: "transparent", // 文字默认无描边
    strokeWidth: 0,
  });

  fabricCanvas.add(textObj);
  fabricCanvas.setActiveObject(textObj);
  // 新增文本后直接进入编辑，提升效率
  try {
    (textObj as any).enterEditing();
    (textObj as any).hiddenTextarea &&
      (textObj as any).hiddenTextarea.focus &&
      (textObj as any).hiddenTextarea.focus();
  } catch {}
  fabricCanvas.renderAll();
  console.log("添加文字元素:", textObj);
};

// 添加图片元素
const addImageElement = (imageUrl: string) => {
  if (!fabricCanvas) return;

  fabric.Image.fromURL(
    imageUrl,
    (img) => {
      // 创建默认阴影
      const defaultShadow = new fabric.Shadow({
        color: "rgba(0,0,0,0.4)",
        blur: 10,
        offsetX: 7,
        offsetY: 7,
      });

      img.set({
        left: 50,
        top: 50,
        scaleX: 0.5,
        scaleY: 0.5,
        objectCaching: false, // 禁用对象缓存以使阴影等效果正常工作
        shadow: defaultShadow, // 添加默认阴影
      });
      fabricCanvas?.add(img);
      fabricCanvas?.setActiveObject(img);
    },
    { crossOrigin: "anonymous" } // 设置跨域属性以支持阴影等效果
  );
};

// 添加形状元素
const addShapeElement = (type: string) => {
  if (!fabricCanvas) return;
  let shape: fabric.Object | null = null;

  // 设置一个安全的初始位置，确保在画布可视区域内
  const safeLeft = 300; // 避免太靠左边
  const safeTop = 300; // 避免太靠上边

  // 默认使用图案填充（第一个图案）
  const defaultPatternSrc = "/template/poster/1.jpg";

  if (type === "rect") {
    shape = new fabric.Rect({
      left: safeLeft,
      top: safeTop,
      width: 150,
      height: 220,
      fill: "#4fd1c5", // 临时填充,稍后替换为图案
      stroke: "transparent",
      strokeWidth: 0,
      rx: 12,
      ry: 12,
    });
    console.log("Created rect:", shape);
  } else if (type === "circle") {
    shape = new fabric.Circle({
      left: safeLeft,
      top: safeTop,
      radius: 75, // 直径150,接近矩形宽度
      fill: "#667eea",
      stroke: "transparent",
      strokeWidth: 0,
    });
    console.log("Created circle:", shape);
  } else if (type === "triangle") {
    shape = new fabric.Triangle({
      left: safeLeft,
      top: safeTop,
      width: 150,
      height: 225,
      fill: "#f59e0b",
      stroke: "transparent",
      strokeWidth: 0,
    });
    console.log("Created triangle:", shape);
  } else if (type === "line") {
    // 通过坐标创建一条水平直线
    shape = new fabric.Line([safeLeft, safeTop, safeLeft + 150, safeTop], {
      stroke: "#111827",
      strokeWidth: 6,
      selectable: true,
    });
    console.log("Created line:", shape);
  } else if (type === "star") {
    // 生成五角星顶点,按照150宽度的比例
    const createStarPoints = (
      spikes: number,
      outerRadius: number,
      innerRadius: number
    ) => {
      const points: { x: number; y: number }[] = [];
      const step = Math.PI / spikes;
      for (let i = 0; i < 2 * spikes; i++) {
        const r = i % 2 === 0 ? outerRadius : innerRadius;
        const a = i * step - Math.PI / 2; // 让一角朝上
        points.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      return points;
    };
    const points = createStarPoints(5, 75, 35); // 调整为接近150的尺寸
    shape = new fabric.Polygon(points, {
      left: safeLeft,
      top: safeTop,
      fill: "#ec4899",
      stroke: "transparent",
      strokeWidth: 0,
      originX: "center",
      originY: "center",
    });
    console.log("Created star:", shape);
  } else if (type === "arrow") {
    // 使用 Path 绘制一个指向右侧的箭头,按照150宽度的比例
    const pathData = "M 0 0 L 110 0 L 110 -20 L 150 0 L 110 20 L 110 0 Z";
    shape = new fabric.Path(pathData, {
      left: safeLeft,
      top: safeTop,
      fill: "#10b981",
      stroke: "transparent",
      strokeWidth: 0,
      originX: "left",
      originY: "center",
    });
    console.log("Created arrow:", shape);
  }

  if (shape) {
    console.log("Adding shape to canvas:", shape);

    // 添加默认阴影
    const defaultShadow = new fabric.Shadow({
      color: "rgba(0,0,0,0.4)",
      blur: 10,
      offsetX: 7,
      offsetY: 7,
    });
    shape.set("shadow", defaultShadow);

    fabricCanvas.add(shape);
    fabricCanvas.setActiveObject(shape);

    // 如果不是直线，应用默认图案填充
    if (type !== "line") {
      const imgSrc = `${window.location.origin}${defaultPatternSrc}`;
      fabric.util.loadImage(
        imgSrc,
        (img: HTMLImageElement | null) => {
          if (img && shape) {
            const objWidth =
              shape.getScaledWidth?.() || (shape as any).width || 100;
            const objHeight =
              shape.getScaledHeight?.() || (shape as any).height || 100;
            const scale = Math.min(
              objWidth / img.width,
              objHeight / img.height
            );

            const pattern = new fabric.Pattern({
              source: img,
              repeat: "no-repeat",
            });
            pattern.patternTransform = [scale, 0, 0, scale, 0, 0];
            const offsetX = (objWidth - img.width * scale) / 2;
            const offsetY = (objHeight - img.height * scale) / 2;
            pattern.offsetX = offsetX;
            pattern.offsetY = offsetY;

            shape.set("fill", pattern);
            fabricCanvas?.renderAll();
          }
        },
        null,
        "anonymous"
      );
    }

    fabricCanvas.renderAll(); // 强制重新渲染
    console.log("Canvas objects count:", fabricCanvas.size());
    const typeToMsg: Record<string, string> = {
      rect: "已添加矩形",
      circle: "已添加圆形",
      triangle: "已添加三角形",
      line: "已添加直线",
      star: "已添加五角星",
      arrow: "已添加箭头",
    };
    ElMessage.success(typeToMsg[type] || "已添加形状");
  } else {
    console.error("Failed to create shape of type:", type);
    ElMessage.error("添加形状失败");
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

    ElMessage.info("图案编辑模式已启用，可以拖动和缩放图案");
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

    ElMessage.info("图案编辑模式已退出");
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

    ElMessage.success("图案已更换");
  };
  img.onerror = () => {
    ElMessage.error("图片加载失败");
  };
  img.src = imgSrc;
};

// 重置图案为适配模式(Fit)
const resetPatternToFit = () => {
  const s = patternEditorState.value;
  if (!s.imgNaturalWidth || !s.imgNaturalHeight || !selectedObject.value) {
    ElMessage.warning("无法获取图片或对象尺寸");
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

  ElMessage.success("已重置为适配模式");
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
    ElMessage.success("颜色已更新");
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
          ElMessage.success("图案已更新");
        } else {
          ElMessage.error("图片加载失败");
        }
      },
      null,
      "anonymous"
    );
    return;
  }

  // 如果没有新图片,使用原有图片但更新变换参数
  if (!fill || typeof fill !== "object" || !("source" in fill)) {
    ElMessage.error("当前对象不是图案填充");
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
  ElMessage.success("图案已更新");
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
    ElMessage.warning("请输入模板名称");
    return;
  }
  showTemplateInfoDialog.value = false;
  ElMessage.success("模板信息已更新");
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
        ElMessage.success("模板加载成功");
      });
    }
  } catch (error) {
    console.error("加载模板失败:", error);
    ElMessage.error("加载模板失败");
  }
};

// 保存模板
const saveTemplate = async () => {
  if (!fabricCanvas) return;

  // 如果没有模板名称,提示用户输入
  if (!templateInfo.value.name.trim()) {
    showTemplateInfoDialog.value = true;
    ElMessage.warning("请先填写模板信息");
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

    ElMessage.success("模板保存成功");
  } catch (error) {
    console.error("保存模板失败:", error);
    ElMessage.error("保存模板失败");
  }
};

// 加载模板(废弃,仅用于兼容)
const loadTemplate = () => {
  ElMessage.info("请从模板列表中选择模板进行编辑");
};

// 导出海报
const exportPoster = () => {
  if (!fabricCanvas) return;
  const dataUrl = fabricCanvas.toDataURL({ format: "png", multiplier: 1 });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = "poster.png";
  link.click();
  ElMessage.success("海报已导出");
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
        ElMessage.success("已复制元素");
      });
      break;
    }
    case "delete": {
      const success = deleteSelectedObject();
      if (success) {
        ElMessage.success("已删除元素");
      } else {
        ElMessage.error("删除失败，请重试");
      }
      break;
    }
    case "bringToFront": {
      obj.bringToFront();
      fabricCanvas.renderAll();
      ElMessage.success("已置顶");
      break;
    }
    case "sendToBack": {
      obj.sendToBack();
      fabricCanvas.renderAll();
      ElMessage.success("已置底");
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
