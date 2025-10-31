const path = require("path");
const fs = require("fs").promises;
const MediaServerService = require("./mediaServerService");
const PosterGenerator = require("./posterGenerator");

/**
 * 工作流服务
 * 协调整个海报生成流程
 */
class WorkflowService {
  constructor(config) {
    this.config = config;
    this.posterGenerator = new PosterGenerator();
    this.uploadsDir = path.join(__dirname, "../../uploads");
  }

  /**
   * 处理单个媒体库
   * @param {Object} MediaServerService - Jellyfin服务实例
   * @param {Object} library - 媒体库对象
   * @param {Object} options - 选项
   * @returns {Object} 处理结果
   */
  async processLibrary(MediaServerService, library, options = {}) {
    const {
      templateId,
      posterCount = 9,
      sortBy = "DateCreated",
      uploadEnabled = true,
    } = options;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`📚 开始处理媒体库: ${library.name} (${library.id})`);
    console.log(`${"=".repeat(60)}`);

    try {
      // 步骤 1: 获取媒体项
      console.log(`\n[步骤 1/4] 获取媒体项...`);
      const items = await MediaServerService.getMediaItems(library.id, {
        sortBy,
        limit: posterCount * 2, // 获取更多以防有些没有封面
      });

      if (items.length === 0) {
        console.log(`⚠️  媒体库 ${library.name} 中没有媒体项`);
        return { success: false, reason: "no_items" };
      }

      // 过滤有封面的项
      const itemsWithPosters = MediaServerService.filterItemsWithPosters(
        items,
        posterCount
      );

      if (itemsWithPosters.length === 0) {
        console.log(`⚠️  没有找到带封面的媒体项`);
        return { success: false, reason: "no_posters" };
      }

      // 步骤 2: 下载封面
      console.log(`\n[步骤 2/4] 下载封面图片...`);
      const downloadDir = path.join(
        this.uploadsDir,
        "temp",
        `library_${library.id}`
      );
      const downloadResult = await MediaServerService.downloadPosters(
        itemsWithPosters,
        downloadDir,
        posterCount
      );

      if (!downloadResult.success) {
        console.log(`❌ 下载封面失败`);
        return { success: false, reason: "download_failed" };
      }

      // 步骤 3: 生成海报
      console.log(`\n[步骤 3/4] 生成海报...`);
      if (!templateId) {
        console.log(`⚠️  未指定模板ID，跳过生成`);
        return { success: false, reason: "no_template" };
      }

      // 准备占位符数据
      const placeholderData = {};
      for (let i = 0; i < downloadResult.count; i++) {
        const posterFile = path.join(downloadDir, `${i + 1}.jpg`);
        placeholderData[`poster${i + 1}`] = posterFile;
      }

      // 添加文本占位符
      if (downloadResult.items.length > 0) {
        const firstItem = downloadResult.items[0];
        placeholderData.libraryName = library.name;
        placeholderData.itemName = firstItem.Name || "";
        placeholderData.year = firstItem.ProductionYear || "";
      }

      const outputPath = path.join(
        this.uploadsDir,
        "posters",
        `${library.id}_${Date.now()}.jpg`
      );

      const generatedPoster =
        await this.posterGenerator.generateWithPlaceholders(
          templateId,
          placeholderData,
          outputPath
        );

      if (!generatedPoster) {
        console.log(`❌ 生成海报失败`);
        return { success: false, reason: "generation_failed" };
      }

      console.log(`✅ 海报已生成: ${outputPath}`);

      // 步骤 4: 上传海报
      if (uploadEnabled) {
        console.log(`\n[步骤 4/4] 上传海报到媒体库...`);
        const uploadSuccess = await MediaServerService.uploadLibraryPoster(
          library.id,
          outputPath
        );

        if (!uploadSuccess) {
          console.log(`⚠️  上传失败，但海报已生成`);
          return {
            success: true,
            posterPath: outputPath,
            uploadFailed: true,
          };
        }
      } else {
        console.log(`\n[步骤 4/4] 跳过上传 (uploadEnabled=false)`);
      }

      // 清理临时文件
      try {
        await fs.rm(downloadDir, { recursive: true, force: true });
      } catch (error) {
        console.warn(`⚠️  清理临时文件失败:`, error.message);
      }

      console.log(`\n✅ 媒体库 ${library.name} 处理完成`);

      return {
        success: true,
        posterPath: outputPath,
        libraryId: library.id,
        libraryName: library.name,
      };
    } catch (error) {
      console.error(`❌ 处理媒体库失败:`, error);
      return { success: false, reason: "error", error: error.message };
    }
  }

  /**
   * 处理多个媒体库
   * @param {Object} serverConfig - 服务器配置
   * @param {Object} options - 选项
   * @returns {Array} 处理结果列表
   */
  async processLibraries(serverConfig, options = {}) {
    const {
      excludeLibraries = [],
      templateMapping = {},
      defaultTemplateId = null,
      posterCount = 9,
      uploadEnabled = true,
    } = options;

    console.log(`\n${"=".repeat(80)}`);
    console.log(
      `🚀 开始处理服务器: ${serverConfig.name || serverConfig.baseURL}`
    );
    console.log(`${"=".repeat(80)}`);

    const MediaServerService = new MediaServerService(serverConfig);

    try {
      // 获取媒体库列表
      const libraries = await MediaServerService.getLibraries(excludeLibraries);

      if (libraries.length === 0) {
        console.log(`⚠️  没有可处理的媒体库`);
        return [];
      }

      const results = [];

      // 处理每个媒体库
      for (const library of libraries) {
        // 确定使用的模板
        const templateId = templateMapping[library.name] || defaultTemplateId;

        if (!templateId) {
          console.log(`⚠️  媒体库 ${library.name} 没有配置模板，跳过`);
          continue;
        }

        const result = await this.processLibrary(MediaServerService, library, {
          templateId,
          posterCount,
          uploadEnabled,
        });

        results.push({
          library: library.name,
          ...result,
        });

        // 延迟避免过快请求
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      console.log(`\n${"=".repeat(80)}`);
      console.log(
        `📊 服务器处理完成，成功: ${results.filter((r) => r.success).length}/${results.length}`
      );
      console.log(`${"=".repeat(80)}\n`);

      return results;
    } catch (error) {
      console.error(`❌ 处理服务器失败:`, error);
      throw error;
    }
  }

  /**
   * 处理多个服务器
   * @param {Array} serverConfigs - 服务器配置列表
   * @param {Object} options - 选项
   * @returns {Object} 所有结果
   */
  async processAllServers(serverConfigs, options = {}) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`🌐 开始处理 ${serverConfigs.length} 个服务器`);
    console.log(`${"=".repeat(80)}\n`);

    const allResults = [];

    for (const serverConfig of serverConfigs) {
      try {
        const results = await this.processLibraries(serverConfig, options);
        allResults.push({
          server: serverConfig.name || serverConfig.baseURL,
          results,
        });
      } catch (error) {
        console.error(`❌ 服务器处理失败:`, error);
        allResults.push({
          server: serverConfig.name || serverConfig.baseURL,
          error: error.message,
        });
      }

      // 服务器之间延迟
      if (serverConfigs.length > 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    return allResults;
  }
}

module.exports = WorkflowService;
