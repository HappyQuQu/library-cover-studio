const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");

/**
 * Jellyfin/Emby 媒体库服务
 * 负责与 Jellyfin/Emby 服务器交互
 */
class JellyfinService {
  constructor(config) {
    this.config = config;
    this.authInfo = null;
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.userId = config.userId;
  }

  /**
   * 获取认证信息
   */
  async getAuthInfo() {
    if (this.authInfo) return this.authInfo;

    try {
      const response = await axios.get(`${this.baseURL}/System/Info`, {
        headers: {
          Authorization: `MediaBrowser Token="${this.apiKey}"`,
        },
      });

      this.authInfo = response.data;
      console.log(`✅ 成功连接到服务器: ${this.authInfo.ServerName}`);
      return this.authInfo;
    } catch (error) {
      console.error("❌ 认证失败:", error.message);
      throw error;
    }
  }

  /**
   * 获取所有媒体库列表
   * @param {Array} excludeLibraries - 要排除的媒体库名称列表
   * @returns {Array} 媒体库列表
   */
  async getLibraries(excludeLibraries = []) {
    await this.getAuthInfo();

    try {
      const response = await axios.get(`${this.baseURL}/Library/MediaFolders`, {
        headers: {
          Authorization: `MediaBrowser Token="${this.apiKey}"`,
        },
      });

      const libraries = [];
      if (response.data.Items) {
        for (const item of response.data.Items) {
          if (item.Id && item.Name && !excludeLibraries.includes(item.Name)) {
            libraries.push({
              id: item.Id,
              name: item.Name,
              type: item.CollectionType || "unknown",
            });
          } else if (excludeLibraries.includes(item.Name)) {
            console.log(`⏭️  已排除媒体库: ${item.Name}`);
          }
        }
      }

      console.log(`📚 成功获取 ${libraries.length} 个媒体库`);
      return libraries;
    } catch (error) {
      console.error("❌ 获取媒体库列表失败:", error.message);
      return [];
    }
  }

  /**
   * 获取媒体库中的媒体项
   * @param {string} parentId - 媒体库ID
   * @param {Object} options - 选项
   * @returns {Array} 媒体项列表
   */
  async getMediaItems(parentId, options = {}) {
    const {
      sortBy = "DateCreated",
      sortOrder = "Descending",
      limit = null,
      includeTypes = "Movie,Series,Audio,Music,Game,Book,MusicVideo",
    } = options;

    try {
      const params = {
        ParentId: parentId,
        Recursive: true,
        SortBy: `${sortBy},SortName`,
        SortOrder: sortOrder,
        IncludeItemTypes: includeTypes,
      };

      if (limit) {
        params.Limit = limit;
      }

      const response = await axios.get(
        `${this.baseURL}/Users/${this.userId}/Items`,
        {
          headers: {
            Authorization: `MediaBrowser Token="${this.apiKey}"`,
          },
          params,
        }
      );

      const items = response.data.Items || [];
      console.log(`📝 获取到 ${items.length} 个媒体项`);
      return items;
    } catch (error) {
      console.error("❌ 获取媒体项失败:", error.message);
      return [];
    }
  }

  /**
   * 过滤有封面的媒体项
   * @param {Array} items - 媒体项列表
   * @param {number} count - 需要的数量
   * @returns {Array} 过滤后的媒体项
   */
  filterItemsWithPosters(items, count = 9) {
    const filtered = items.filter(
      (item) => item.ImageTags && item.ImageTags.Primary
    );

    console.log(
      `🔍 过滤后剩余 ${filtered.length}/${items.length} 个有封面的媒体项`
    );

    return filtered.slice(0, count);
  }

  /**
   * 下载媒体项的封面图片
   * @param {string} itemId - 媒体项ID
   * @param {string} outputPath - 输出路径
   * @param {string} imageType - 图片类型 (Primary, Backdrop, etc.)
   * @returns {boolean} 是否成功
   */
  async downloadPoster(itemId, outputPath, imageType = "Primary") {
    try {
      const response = await axios.get(
        `${this.baseURL}/Items/${itemId}/Images/${imageType}`,
        {
          headers: {
            Authorization: `MediaBrowser Token="${this.apiKey}"`,
          },
          responseType: "arraybuffer",
          timeout: 30000,
        }
      );

      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, response.data);
      return true;
    } catch (error) {
      console.error(`❌ 下载封面失败 (${itemId}):`, error.message);
      return false;
    }
  }

  /**
   * 批量下载封面
   * @param {Array} items - 媒体项列表
   * @param {string} outputDir - 输出目录
   * @param {number} targetCount - 目标数量
   * @returns {Object} 下载结果
   */
  async downloadPosters(items, outputDir, targetCount = 9) {
    // 确保输出目录存在并清空
    await fs.mkdir(outputDir, { recursive: true });
    const existingFiles = await fs.readdir(outputDir);
    for (const file of existingFiles) {
      if (file.match(/\.(jpg|jpeg|png)$/i)) {
        await fs.unlink(path.join(outputDir, file));
      }
    }

    console.log(`📥 开始下载 ${targetCount} 张封面...`);

    const downloadedItems = [];
    let successCount = 0;

    // 下载可用的封面
    for (const item of items) {
      if (successCount >= targetCount) break;

      const outputPath = path.join(outputDir, `${successCount + 1}.jpg`);
      const success = await this.downloadPoster(item.Id, outputPath);

      if (success) {
        successCount++;
        downloadedItems.push(item);
      }
    }

    // 如果数量不足,重复下载已有的
    if (successCount > 0 && successCount < targetCount) {
      console.log(
        `⚠️  下载的图片数量(${successCount})不足${targetCount}张，将重复下载`
      );

      let repeatIndex = 0;
      while (successCount < targetCount) {
        const repeatItem =
          downloadedItems[repeatIndex % downloadedItems.length];
        const outputPath = path.join(outputDir, `${successCount + 1}.jpg`);

        const success = await this.downloadPoster(repeatItem.Id, outputPath);
        if (success) {
          successCount++;
        }
        repeatIndex++;
      }
    }

    console.log(`✅ 成功下载 ${successCount}/${targetCount} 张封面`);

    return {
      success: successCount > 0,
      count: successCount,
      items: downloadedItems,
    };
  }

  /**
   * 上传海报到媒体库
   * @param {string} libraryId - 媒体库ID
   * @param {string} posterPath - 海报文件路径
   * @returns {boolean} 是否成功
   */
  async uploadLibraryPoster(libraryId, posterPath) {
    try {
      const posterData = await fs.readFile(posterPath);

      await axios.post(
        `${this.baseURL}/Items/${libraryId}/Images/Primary`,
        posterData,
        {
          headers: {
            Authorization: `MediaBrowser Token="${this.apiKey}"`,
            "Content-Type": "image/jpeg",
          },
        }
      );

      console.log(`✅ 成功上传海报到媒体库: ${libraryId}`);
      return true;
    } catch (error) {
      console.error(`❌ 上传海报失败:`, error.message);
      return false;
    }
  }

  /**
   * 获取媒体项的详细信息
   * @param {string} itemId - 媒体项ID
   * @returns {Object} 媒体项详情
   */
  async getItemDetails(itemId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/Users/${this.userId}/Items/${itemId}`,
        {
          headers: {
            Authorization: `MediaBrowser Token="${this.apiKey}"`,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error(`❌ 获取媒体项详情失败 (${itemId}):`, error.message);
      return null;
    }
  }
}

module.exports = JellyfinService;
