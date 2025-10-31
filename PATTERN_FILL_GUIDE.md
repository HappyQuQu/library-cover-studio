# 图案填充功能使用指南

## 功能概述

在海报设计器中，为矩形、圆形、三角形等形状元素添加了图案填充功能，可以使用预设的 9 张海报图片作为填充图案。

## 使用步骤

### 1. 添加形状元素
- 在左侧工具栏点击"添加元素"
- 选择矩形、圆形、三角形等形状

### 2. 选择填充类型
- 在右侧属性面板的"形状样式"部分
- 切换"填充类型"为"图案"（默认为"纯色"）

### 3. 选择图案
- 在图案选择器中，点击任意一张图片
- 图案选择器显示 3x3 网格，共 9 张图片（1.jpg ~ 9.jpg）

### 4. 设置填充模式
- **平铺 (Repeat)**: 图案会重复平铺填满整个形状
- **拉伸 (No-Repeat)**: 图案拉伸以填满整个形状（不重复）

## 图案资源位置

- **后端目录**: `backend/template/poster/`
- **图片文件**: `1.jpg`, `2.jpg`, `3.jpg`, `4.jpg`, `5.jpg`, `6.jpg`, `7.jpg`, `8.jpg`, `9.jpg`
- **访问路径**: `http://localhost:3001/template/poster/{1-9}.jpg`

## 技术实现

### 后端配置
在 `backend/src/server.js` 中添加了静态资源路由：
```javascript
app.use("/template/poster", express.static(path.join(__dirname, "../template/poster")));
```

### 前端组件

#### PosterProperties.vue
- 添加"填充类型"单选框（纯色/图案）
- 图案选择器：3x3 网格显示 9 张图片
- 填充模式下拉菜单（平铺/拉伸）

#### DesignerView.vue
- 使用 `fabric.Pattern` 实现图案填充
- 通过 `fabric.util.loadImage` 加载图案图片
- 支持 `repeat` 和 `no-repeat` 两种模式

## 样式特性

- 选中的图案有蓝色边框高亮
- 鼠标悬停时图案略微放大
- 响应式网格布局，适配不同屏幕尺寸

## 扩展建议

如需添加更多图案：
1. 将图片放入 `backend/template/poster/` 目录
2. 命名为 `10.jpg`, `11.jpg`, 等
3. 修改 `PosterProperties.vue` 中的循环范围：`v-for="i in 12"` (例如扩展到 12 张)

## 注意事项

- 图片格式建议：JPG、PNG
- 图片尺寸建议：不超过 2MB，以确保加载速度
- 跨域问题：如使用远程图片，需配置 CORS
- 平铺模式下，图案会保持原始尺寸重复填充
- 拉伸模式下，单张图片会变形以适应形状尺寸
