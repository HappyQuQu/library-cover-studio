# 图案填充功能测试指南

## 已修复的问题

### 1. ✅ 图案预览图加载失败
**原因分析：**
- 使用了硬编码的绝对 URL `http://localhost:3001`
- 跨域问题可能导致加载失败

**解决方案：**
- 改用相对路径 `/template/poster/${i}.jpg`
- 添加图片加载错误处理
- 自动回退到完整 URL

### 2. ✅ 填充方式优化
**问题：**
- 图片太大，元素太小，只显示局部
- 缺少等比例缩放选项

**解决方案：**
新增三种填充模式：

1. **平铺 (Repeat)**
   - 保持图片原始大小
   - 重复平铺填满形状
   - 适合小图案、纹理

2. **适应 (Fit)** ⭐ 推荐
   - 等比例缩放图片
   - 完整显示图片不变形
   - 可能有留白
   - 适合图标、logo

3. **拉伸 (Stretch)**
   - 拉伸图片填满整个形状
   - 可能变形
   - 适合背景

## 测试步骤

### 1. 启动后端服务
```bash
cd backend
node src/server.js
```

### 2. 访问测试页面
打开浏览器访问：
- 图案预览测试: http://localhost:3001/test/pattern-test.html
- 主应用: http://localhost:3000

### 3. 测试图案加载
1. 打开测试页面，查看 9 张图片是否正常加载
2. 打开浏览器控制台查看加载日志
3. 如有失败，检查 `backend/template/poster/` 目录中是否有对应的 jpg 文件

### 4. 测试填充功能
1. 在设计器中添加一个形状（如矩形）
2. 在右侧属性面板选择"填充类型" → "图案"
3. 选择任意图案
4. 测试三种填充模式的效果

## 核心代码改进

### PosterProperties.vue
```typescript
// 使用相对路径
<img :src="`/template/poster/${i}.jpg`" />

// 三种填充模式
<el-option label="平铺 (Repeat)" value="repeat" />
<el-option label="适应 (Fit)" value="fit" />
<el-option label="拉伸 (Stretch)" value="stretch" />
```

### DesignerView.vue
```typescript
// 适应模式：等比例缩放
if (patternMode === "fit") {
  const imgRatio = img.width / img.height;
  const objRatio = objWidth / objHeight;
  let scale = 1;
  
  if (imgRatio > objRatio) {
    scale = objWidth / img.width;
  } else {
    scale = objHeight / img.height;
  }
  // 缩放图片到合适尺寸
}
```

## 故障排除

### 问题：图案预览图不显示
**检查清单：**
1. ✅ 后端服务是否已启动
2. ✅ `backend/template/poster/` 目录是否存在
3. ✅ 该目录下是否有 1.jpg ~ 9.jpg 文件
4. ✅ 文件权限是否正确
5. ✅ 浏览器控制台是否有 CORS 错误

**快速验证：**
```bash
# 检查文件是否存在
ls backend/template/poster/*.jpg

# 直接访问图片
curl http://localhost:3001/template/poster/1.jpg
```

### 问题：填充后只显示图片一部分
**解决方案：**
- 切换到"适应 (Fit)"模式
- 这会等比例缩放图片以完整显示在形状内

### 问题：图片变形
**原因：** 使用了"拉伸"模式
**解决方案：** 切换到"适应"或"平铺"模式

## 性能优化建议

1. **图片尺寸**
   - 建议：800x800 像素以内
   - 文件大小：< 500KB

2. **缓存策略**
   - 图片会被浏览器缓存
   - 如需更新，清除缓存或更改文件名

3. **加载优化**
   - 使用懒加载
   - 压缩图片文件
   - 考虑使用 WebP 格式

## 下一步改进

- [ ] 支持上传自定义图案
- [ ] 图案旋转和偏移
- [ ] 图案透明度调节
- [ ] 多图案组合
- [ ] 图案库管理界面
