# 元素占位参数功能使用说明

## 功能概述

元素占位参数功能允许你在模板中为**所有类型的元素**(图片、文字、形状等)设置占位符(poster1-poster10),然后在批量生成海报时,根据这些占位符动态替换内容。

- **图片元素**: 替换图片源路径
- **文字元素**: 替换文本内容
- **形状元素**: (预留,未来可扩展为图案填充)

## 使用步骤

### 1. 在设计器中设置占位符

1. 在设计器中添加任意元素(图片、文字、形状等)
2. 选中该元素
3. 在右侧属性面板的"位置与大小"中找到"占位符"下拉框
4. 选择一个占位参数,例如 `{{poster1}}`, `{{poster2}}` 等
5. 保存模板

**注意**: 
- 图片元素设置占位符后,生成时会替换图片源
- 文字元素设置占位符后,生成时会替换文本内容

### 2. 模板 JSON 结构

保存后的模板 JSON 中,元素会包含 `placeholder` 属性:

```json
{
  "objects": [
    {
      "type": "image",
      "left": 100,
      "top": 100,
      "src": "...",
      "placeholder": "poster1",
      ...其他属性
    },
    {
      "type": "i-text",
      "left": 200,
      "top": 50,
      "text": "默认文本",
      "placeholder": "poster2",
      ...其他属性
    }
  ]
}
```

### 3. 批量生成海报时替换占位符

在后端生成海报时,可以根据占位符替换内容:

#### 示例代码 (Node.js/Backend)

```javascript
// 加载模板
const template = await loadTemplate(templateId);

// 准备替换参数 (支持图片路径和文本内容)
const replacements = {
  poster1: '/path/to/book-cover.jpg',  // 图片元素: 图片路径
  poster2: '红楼梦',                    // 文字元素: 文本内容
  poster3: '曹雪芹',                    // 文字元素: 文本内容
  poster4: '/path/to/publisher-logo.png', // 图片元素: 图片路径
  // ... poster5-poster10
};

// 使用 PosterGenerator 的 replacePlaceholders 方法
const generator = new PosterGenerator();
const processedTemplate = generator.replacePlaceholders(template, replacements);

// 使用替换后的模板生成海报
await generatePoster(processedTemplate);
```

## 使用场景

### 场景 1: 图书海报批量生成

模板设置:
- `poster1` (图片): 图书封面图片位置
- `poster2` (文字): 书名
- `poster3` (文字): 作者名
- `poster4` (图片): 出版社Logo
- `poster5` (文字): 出版年份

批量生成时:
```javascript
const books = [
  { 
    poster1: '/covers/红楼梦.jpg',
    poster2: '红楼梦',
    poster3: '曹雪芹',
    poster4: '/logos/publisher1.png',
    poster5: '2024'
  },
  { 
    poster1: '/covers/三国演义.jpg',
    poster2: '三国演义',
    poster3: '罗贯中',
    poster4: '/logos/publisher2.png',
    poster5: '2024'
  }
  // ... 更多图书
];

for (const book of books) {
  await generatePosterWithReplacements(templateId, book);
}
```

### 场景 2: 社交媒体海报

模板设置:
- `poster1`: 产品图片
- `poster2`: Logo位置
- `poster3`: 二维码位置

### 场景 3: 证书生成

模板设置:
- `poster1`: 学员照片
- `poster2`: 签名图片
- `poster3`: 印章图片

## API 接口建议

建议在后端添加以下接口支持占位符替换:

### POST /api/posters/generate-with-placeholders

```json
{
  "templateId": "template-id-123",
  "replacements": {
    "poster1": "https://example.com/image1.jpg",
    "poster2": "https://example.com/image2.jpg",
    "poster3": "https://example.com/image3.jpg"
  },
  "outputPath": "/output/poster-001.jpg"
}
```

### POST /api/posters/batch-generate

```json
{
  "templateId": "template-id-123",
  "batch": [
    {
      "outputName": "poster-001.jpg",
      "replacements": {
        "poster1": "https://example.com/book1-cover.jpg",
        "poster2": "https://example.com/author1.jpg"
      }
    },
    {
      "outputName": "poster-002.jpg",
      "replacements": {
        "poster1": "https://example.com/book2-cover.jpg",
        "poster2": "https://example.com/author2.jpg"
      }
    }
  ]
}
```

## 注意事项

1. **占位符数量**: 目前支持 poster1-poster10 共10个占位符,可根据需要扩展
2. **图片格式**: 替换的图片应与原图片尺寸比例相近,以获得最佳效果
3. **性能优化**: 批量生成时建议使用队列处理,避免并发过高
4. **错误处理**: 如果占位符对应的图片不存在,应该有降级策略(使用默认图片或跳过)

## 扩展功能建议

1. **文本占位符**: 除了图片,还可以支持文本占位符(如 {{title}}, {{author}} 等)
2. **颜色占位符**: 支持动态替换颜色主题
3. **条件显示**: 根据参数决定某些元素是否显示
4. **尺寸适配**: 自动根据替换图片调整元素尺寸

## 完整示例

查看 `/backend/src/services/posterGenerator.js` 中的实现示例。
