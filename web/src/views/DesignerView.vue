<template>
  <div class="poster-designer">
    <el-container>
      <el-aside width="300px" class="tools-panel">
        <PosterToolbar 
          @add-text="addTextElement"
          @add-image="addImageElement"
          @change-background="changeBackground"
          @save-template="saveTemplate"
        />
      </el-aside>
      
      <el-main class="canvas-container">
        <div class="canvas-wrapper">
          <canvas ref="canvasRef" :width="canvasWidth" :height="canvasHeight"></canvas>
        </div>
      </el-main>
      
      <el-aside width="280px" class="properties-panel">
        <PosterProperties 
          :selected-object="selectedObject"
          @update-properties="updateObjectProperties"
        />
      </el-aside>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { fabric } from 'fabric'
import PosterToolbar from '@/components/PosterToolbar.vue'
import PosterProperties from '@/components/PosterProperties.vue'

// Canvas 配置
const canvasRef = ref<HTMLCanvasElement>()
const canvasWidth = 400
const canvasHeight = 600
let fabricCanvas: fabric.Canvas | null = null
const selectedObject = ref<fabric.Object | null>(null)

// 初始化 Fabric.js Canvas
onMounted(() => {
  if (canvasRef.value) {
    fabricCanvas = new fabric.Canvas(canvasRef.value, {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: '#ffffff'
    })
    
    // 监听对象选择
    fabricCanvas.on('selection:created', (e) => {
      selectedObject.value = e.selected?.[0] || null
    })
    
    fabricCanvas.on('selection:updated', (e) => {
      selectedObject.value = e.selected?.[0] || null
    })
    
    fabricCanvas.on('selection:cleared', () => {
      selectedObject.value = null
    })
  }
})

onUnmounted(() => {
  fabricCanvas?.dispose()
})

// 添加文本元素
const addTextElement = (text: string) => {
  if (!fabricCanvas) return
  
  const textObj = new fabric.Text(text, {
    left: 100,
    top: 100,
    fontSize: 24,
    fill: '#000000',
    fontFamily: 'Arial'
  })
  
  fabricCanvas.add(textObj)
  fabricCanvas.setActiveObject(textObj)
}

// 添加图片元素
const addImageElement = (imageUrl: string) => {
  if (!fabricCanvas) return
  
  fabric.Image.fromURL(imageUrl, (img) => {
    img.set({
      left: 50,
      top: 50,
      scaleX: 0.5,
      scaleY: 0.5
    })
    fabricCanvas?.add(img)
    fabricCanvas?.setActiveObject(img)
  })
}

// 更改背景
const changeBackground = (background: string | object) => {
  if (!fabricCanvas) return
  
  if (typeof background === 'string') {
    fabricCanvas.setBackgroundColor(background, fabricCanvas.renderAll.bind(fabricCanvas))
  }
}

// 更新对象属性
const updateObjectProperties = (properties: any) => {
  if (!fabricCanvas || !selectedObject.value) return
  
  selectedObject.value.set(properties)
  fabricCanvas.renderAll()
}

// 保存模板
const saveTemplate = async () => {
  if (!fabricCanvas) return
  
  const templateData = {
    canvas: fabricCanvas.toJSON(),
    preview: fabricCanvas.toDataURL('image/png')
  }
  
  // 这里调用 API 保存模板
  console.log('保存模板:', templateData)
}
</script>

<style scoped>
.poster-designer {
  height: 100vh;
}

.tools-panel {
  background: #f8f9fa;
  border-right: 1px solid #e9ecef;
}

.canvas-container {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;
  padding: 20px;
}

.canvas-wrapper {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.properties-panel {
  background: #f8f9fa;
  border-left: 1px solid #e9ecef;
}
</style>