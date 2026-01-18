<template>
  <div class="layer-panel">
    <div class="layer-list-header">
      <span>图层列表</span>
      <span class="layer-count">{{ layers.length }}</span>
    </div>
    
    <el-scrollbar max-height="calc(100vh - 400px)">
      <div v-if="layers.length === 0" class="empty-layers">
        <el-empty :image-size="60" description="暂无图层" />
      </div>
      
      <div v-else class="layers-container">
        <div 
          v-for="(layer, index) in reversedLayers" 
          :key="layer.id"
          class="layer-item-wrapper"
        >
          <div 
            class="layer-item"
            :class="{ selected: selectedId === layer.id }"
            @click="selectLayer(layer.id)"
          >
            <!-- 缩略图/图标 -->
            <div class="layer-thumbnail">
              <el-icon v-if="layer.type === 'i-text' || layer.type === 'text' || layer.type === 'textbox'"><Edit /></el-icon>
              <el-icon v-else-if="layer.type === 'image'"><Picture /></el-icon>
              <el-icon v-else-if="layer.posterType === 'poster'"><Film /></el-icon>
              <el-icon v-else><Box /></el-icon>
            </div>
            
            <!-- 信息 -->
            <div class="layer-info">
              <div class="layer-name">
                {{ getLayerName(layer) }}
              </div>
              <div class="layer-meta">
                {{ getLayerTypeName(layer) }}
              </div>
            </div>
            
            <!-- 操作 -->
            <div class="layer-actions">
              <el-tooltip :content="layer.visible ? '隐藏' : '显示'" placement="top">
                <el-button 
                  link 
                  :type="layer.visible ? '' : 'info'"
                  @click.stop="toggleVisibility(layer.id)"
                >
                  <el-icon><component :is="layer.visible ? 'View' : 'Hide'" /></el-icon>
                </el-button>
              </el-tooltip>
              
              <el-tooltip :content="layer.locked ? '解锁' : '锁定'" placement="top">
                <el-button 
                  link
                  :type="layer.locked ? 'warning' : ''"
                  @click.stop="toggleLock(layer.id)"
                >
                  <el-icon><component :is="layer.locked ? 'Lock' : 'Unlock'" /></el-icon>
                </el-button>
              </el-tooltip>
              
              <el-dropdown trigger="click" @command="(cmd) => handleCommand(cmd, layer.id)">
                <el-button link>
                  <el-icon><MoreFilled /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="top">置顶</el-dropdown-item>
                    <el-dropdown-item command="bottom">置底</el-dropdown-item>
                    <el-dropdown-item command="duplicate">复制</el-dropdown-item>
                    <el-dropdown-item command="delete" divided style="color: var(--el-color-danger)">删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  Edit,
  Picture,
  Box,
  Film,
  View,
  Hide,
  Lock,
  Unlock,
  MoreFilled,
} from "@element-plus/icons-vue";

interface Layer {
  id: string;
  type: string;
  name?: string;
  visible: boolean;
  locked: boolean;
  posterType?: string;
  text?: string;
}

const props = defineProps<{
  layers: Layer[];
  selectedId: string | null;
}>();

const emit = defineEmits([
  "select",
  "toggle-visibility",
  "toggle-lock",
  "command",
]);

// 图层顺序反转（画布上层渲染的显示在列表顶部）
const reversedLayers = computed(() => {
  return [...props.layers].reverse();
});

const getLayerName = (layer: Layer) => {
  if (layer.name) return layer.name;
  if (layer.posterType === 'poster') return `海报元素`;
  if (layer.type === 'i-text' || layer.type === 'text' || layer.type === 'textbox') {
    return layer.text?.substring(0, 10) || '未命名文字';
  }
  return '未命名图层';
};

const getLayerTypeName = (layer: Layer) => {
  const types: Record<string, string> = {
    'i-text': '文字',
    'text': '文字',
    'textbox': '文本框',
    'image': '图片',
    'rect': '矩形',
    'circle': '圆形',
    'triangle': '三角形',
    'line': '直线',
    'polygon': '多边形',
  };
  return types[layer.type] || '形状';
};

const selectLayer = (id: string) => {
  emit("select", id);
};

const toggleVisibility = (id: string) => {
  emit("toggle-visibility", id);
};

const toggleLock = (id: string) => {
  emit("toggle-lock", id);
};

const handleCommand = (command: string, id: string) => {
  emit("command", { command, id });
};
</script>

<style scoped>
.layer-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.layer-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.layer-count {
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
}

.empty-layers {
  padding: 40px 0;
}

.layers-container {
  padding: 8px;
}

.layer-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all var(--transition-fast);
  border: 1px solid transparent;
  margin-bottom: 4px;
}

.layer-item:hover {
  background: rgba(102, 126, 234, 0.05);
}

.layer-item.selected {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1), rgba(118, 75, 162, 0.1));
  border-color: rgba(102, 126, 234, 0.2);
  box-shadow: inset 3px 0 0 var(--primary);
}

.layer-thumbnail {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 18px;
  flex-shrink: 0;
}

.selected .layer-thumbnail {
  background: white;
  color: var(--primary);
}

.layer-info {
  flex: 1;
  min-width: 0;
}

.layer-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.layer-meta {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 1px;
}

.layer-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.layer-item:hover .layer-actions,
.layer-item.selected .layer-actions {
  opacity: 1;
}

:deep(.el-button.is-link) {
  padding: 4px;
  height: auto;
}
</style>
