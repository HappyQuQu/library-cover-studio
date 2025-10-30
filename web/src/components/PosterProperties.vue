<template>
  <div class="poster-properties">
    <el-scrollbar>
      <div v-if="!selectedObject" class="no-selection">
        <el-empty description="请选择一个元素来编辑属性" />
      </div>

      <div v-else class="properties-content">
        <!-- 通用属性 -->
        <div class="property-section">
          <h4>位置与大小</h4>
          <el-form label-width="60px" size="small">
            <el-form-item label="X:">
              <el-input-number
                v-model="objectProperties.left"
                @change="updateProperties"
                :precision="0"
              />
            </el-form-item>
            <el-form-item label="Y:">
              <el-input-number
                v-model="objectProperties.top"
                @change="updateProperties"
                :precision="0"
              />
            </el-form-item>
            <el-form-item label="宽度:">
              <el-input-number
                v-model="objectProperties.width"
                @change="updateProperties"
                :precision="0"
              />
            </el-form-item>
            <el-form-item label="高度:">
              <el-input-number
                v-model="objectProperties.height"
                @change="updateProperties"
                :precision="0"
              />
            </el-form-item>
            <el-form-item label="旋转:">
              <el-slider
                v-model="objectProperties.angle"
                @change="updateProperties"
                :min="-180"
                :max="180"
              />
            </el-form-item>
          </el-form>
        </div>

        <!-- 文字特有属性 -->
        <div v-if="isTextObject" class="property-section">
          <h4>文字属性</h4>
          <el-form label-width="60px" size="small">
            <el-form-item label="内容:">
              <el-input
                v-model="objectProperties.text"
                @input="updateProperties"
                type="textarea"
                :rows="2"
              />
            </el-form-item>
            <el-form-item label="字体:">
              <el-select
                v-model="objectProperties.fontFamily"
                @change="updateProperties"
              >
                <el-option label="Arial" value="Arial" />
                <el-option label="微软雅黑" value="Microsoft YaHei" />
                <el-option label="宋体" value="SimSun" />
                <el-option label="楷体" value="KaiTi" />
                <el-option label="黑体" value="SimHei" />
              </el-select>
            </el-form-item>
            <el-form-item label="大小:">
              <el-input-number
                v-model="objectProperties.fontSize"
                @change="updateProperties"
                :min="8"
                :max="200"
              />
            </el-form-item>
            <el-form-item label="颜色:">
              <el-color-picker
                v-model="objectProperties.fill"
                @change="updateProperties"
                show-alpha
              />
            </el-form-item>
            <el-form-item label="粗体:">
              <el-switch
                v-model="objectProperties.fontWeight"
                @change="updateProperties"
                active-value="bold"
                inactive-value="normal"
              />
            </el-form-item>
            <el-form-item label="斜体:">
              <el-switch
                v-model="objectProperties.fontStyle"
                @change="updateProperties"
                active-value="italic"
                inactive-value="normal"
              />
            </el-form-item>
          </el-form>
        </div>

        <!-- 图片特有属性 -->
        <div v-if="isImageObject" class="property-section">
          <h4>图片属性</h4>
          <el-form label-width="60px" size="small">
            <el-form-item label="透明度:">
              <el-slider
                v-model="objectProperties.opacity"
                @change="updateProperties"
                :min="0"
                :max="1"
                :step="0.1"
              />
            </el-form-item>
          </el-form>
        </div>

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
});

// 计算属性
const isTextObject = computed(() => {
  return props.selectedObject?.type === "text";
});

const isImageObject = computed(() => {
  return props.selectedObject?.type === "image";
});

// 更新对象属性的函数
const updateObjectProps = (obj: any) => {
  if (obj) {
    // 实时获取对象的当前属性
    const currentProps = {
      left: Math.round(obj.left || 0),
      top: Math.round(obj.top || 0),
      width: Math.round(obj.getScaledWidth?.() || obj.width || 0),
      height: Math.round(obj.getScaledHeight?.() || obj.height || 0),
      angle: Math.round(obj.angle || 0),
      text: obj.text || "",
      fontFamily: obj.fontFamily || "Arial",
      fontSize: obj.fontSize || 24,
      fill: obj.fill || "#000000",
      fontWeight: obj.fontWeight || "normal",
      fontStyle: obj.fontStyle || "normal",
      opacity: obj.opacity || 1,
    };
    objectProperties.value = currentProps;
  } else {
    // 清空属性
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
    };
  }
};

// 监听选中对象变化
watch(() => props.selectedObject, updateObjectProps, { immediate: true });

// 监听更新计数器变化，强制刷新属性
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

// 复制对象
const duplicateObject = () => {
  // 实现复制逻辑
  console.log("复制对象");
};

// 删除对象
const deleteObject = () => {
  // 实现删除逻辑
  console.log("删除对象");
};

// 置顶
const bringToFront = () => {
  // 实现置顶逻辑
  console.log("置顶");
};

// 置底
const sendToBack = () => {
  // 实现置底逻辑
  console.log("置底");
};
</script>

<style scoped>
.poster-properties {
  height: 100%;
  padding: 20px;
}

.no-selection {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
}

.property-section {
  margin-bottom: 25px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e9ecef;
}

.property-section:last-child {
  border-bottom: none;
}

.property-section h4 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 14px;
  font-weight: 600;
}

.action-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.el-form-item {
  margin-bottom: 15px;
}

.el-input-number {
  width: 100%;
}

.el-select {
  width: 100%;
}
</style>
