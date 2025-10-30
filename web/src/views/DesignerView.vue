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
        />
      </el-aside>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { fabric } from "fabric";
import PosterToolbar from "@/components/PosterToolbar.vue";
import PosterProperties from "@/components/PosterProperties.vue";
import { ElMessage } from "element-plus";

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

// 初始化 Fabric.js Canvas
onMounted(() => {
  if (canvasRef.value) {
    fabricCanvas = new fabric.Canvas(canvasRef.value, {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: "#ffffff",
    });

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

    // 添加键盘事件监听，支持Delete键删除
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedObject.value && fabricCanvas) {
          handlePropertiesAction("delete");
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // 在组件卸载时移除事件监听
    onUnmounted(() => {
      document.removeEventListener("keydown", handleKeyDown);
    });
  }
});

onUnmounted(() => {
  fabricCanvas?.dispose();
});

// 添加文本元素
const addTextElement = (text: string) => {
  if (!fabricCanvas) return;

  // 设置更安全的初始位置，避免溢出
  const safeLeft = 300;
  const safeTop = 300;

  const textObj = new fabric.Text(text, {
    left: safeLeft,
    top: safeTop,
    fontSize: 32,
    fill: "#000000",
    fontFamily: "Arial",
    fontWeight: "bold",
    editable: true,
  });

  fabricCanvas.add(textObj);
  fabricCanvas.setActiveObject(textObj);
  fabricCanvas.renderAll();
  console.log("添加文字元素:", textObj);
};

// 添加图片元素
const addImageElement = (imageUrl: string) => {
  if (!fabricCanvas) return;

  fabric.Image.fromURL(imageUrl, (img) => {
    img.set({
      left: 50,
      top: 50,
      scaleX: 0.5,
      scaleY: 0.5,
    });
    fabricCanvas?.add(img);
    fabricCanvas?.setActiveObject(img);
  });
};

// 添加形状元素
const addShapeElement = (type: string) => {
  if (!fabricCanvas) return;
  let shape: fabric.Object | null = null;

  // 设置一个安全的初始位置，确保在画布可视区域内
  const safeLeft = 300; // 避免太靠左边
  const safeTop = 300; // 避免太靠上边

  if (type === "rect") {
    shape = new fabric.Rect({
      left: safeLeft,
      top: safeTop,
      width: 200,
      height: 120,
      fill: "#4fd1c5",
      stroke: "#333",
      strokeWidth: 2,
      rx: 12,
      ry: 12,
    });
    console.log("Created rect:", shape);
  } else if (type === "circle") {
    shape = new fabric.Circle({
      left: safeLeft,
      top: safeTop,
      radius: 60,
      fill: "#667eea",
      stroke: "#333",
      strokeWidth: 2,
    });
    console.log("Created circle:", shape);
  }

  if (shape) {
    console.log("Adding shape to canvas:", shape);
    fabricCanvas.add(shape);
    fabricCanvas.setActiveObject(shape);
    fabricCanvas.renderAll(); // 强制重新渲染
    console.log("Canvas objects count:", fabricCanvas.size());
    ElMessage.success(type === "rect" ? "已添加矩形" : "已添加圆形");
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

  selectedObject.value.set(properties);
  fabricCanvas.renderAll();
};

// 保存模板
const saveTemplate = async () => {
  if (!fabricCanvas) return;
  const templateData = {
    canvas: fabricCanvas.toJSON(),
    preview: fabricCanvas.toDataURL({ format: "png", multiplier: 0.5 }),
  };
  localStorage.setItem("poster_template", JSON.stringify(templateData));
  ElMessage.success("模板已保存到本地");
};

// 加载模板
const loadTemplate = () => {
  if (!fabricCanvas) return;
  const data = localStorage.getItem("poster_template");
  if (!data) {
    ElMessage.warning("没有可用的模板");
    return;
  }
  try {
    const template = JSON.parse(data);
    fabricCanvas.loadFromJSON(template.canvas, () => {
      fabricCanvas.renderAll();
      ElMessage.success("模板已加载");
    });
  } catch (e) {
    ElMessage.error("模板数据解析失败");
  }
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
  background: linear-gradient(135deg, #e0e7ff 0%, #f8fafc 100%);
  display: flex;
  flex-direction: column;
}

.el-container {
  height: 100%;
  min-height: 100vh;
  background: transparent;
}

.tools-panel {
  background: #f8f9fa;
  border-right: 1px solid #e9ecef;
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
  align-items: center;
  justify-content: center;
  background: transparent;
  padding: 0;
  min-width: 0;
}

.canvas-wrapper {
  background: #fff;
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
  background: #f8f9fa;
  border-left: 1px solid #e9ecef;
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
