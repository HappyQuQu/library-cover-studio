# 29 套精选封面模板

29 套独立构图，分为纸面与展览、光影与电影、几何与空间、编排与收藏、柔光与想象五组。画布为 1920 × 1080，保留可编辑图层、`{{primary_title}}` / `{{secondary_title}}` 标题变量及海报变量，固定配色便于继续编辑。

打开 [预览页](index.html) 或 [全部总览](overview.jpg) 比较。分组大图为 `group-1-sample.jpg` 至 `group-5-sample.jpg`；`group-1-Anime.jpg` 至 `group-5-Anime.jpg` 展示 Jellyfin 动漫库真实素材。`real/Anime/`、`real/TV/` 是分别生成的高清预览，未上传至媒体服务器。

每个模板的源文件、标准预览、单套 ZIP 位于此目录及 `packages/`。`collection-29.zip` 是单套 ZIP 的集合，先解压，再在模板库分别导入。最低应用版本为 1.5.0，使用系统字体，无需额外字体安装。

本机模板名称以「精选 · 」开头。它们作为社区模板按需使用，不参与默认初始化或默认模板还原。

重新生成源文件、标准预览和导入包：

```sh
pnpm --filter ./backend exec node --import tsx ../scripts/create-community-collection.mjs
```

可选设置 `LCS_COLLECTION_ARTWORK_DIR`，结构与深色模板生成器的真实素材目录相同：`Anime/`、`TV/` 内包含 `post1.bin` 至 `post9.bin`、可选 `backdrop.bin`、记录标题及素材数量的 `info.json`。生成器不修改数据库、初始化清单或媒体库封面。
