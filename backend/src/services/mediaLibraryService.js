const axios = require("axios");
// const { Pool } = require("pg"); // 不需要PostgreSQL，使用SQLite
const database = require("./database");

class MediaLibraryService {
  constructor() {
    // 使用SQLite database服务
    this.getDb = () => database.getDb();
  }

  // 获取媒体项目
  async getMediaItems(mediaLibraryId, filters = {}) {
    try {
      // 获取媒体库配置
      const db = this.getDb();
      const mediaLib = await db.get(
        `SELECT * FROM media_libraries WHERE id = ? AND is_active = 1`,
        [mediaLibraryId]
      );

      if (!mediaLib) {
        throw new Error("媒体库不存在或未激活");
      }

      // 根据类型获取媒体项目
      switch (mediaLib.type) {
        case "jellyfin":
          return await this.getJellyfinItems(mediaLib, filters);
        case "emby":
          return await this.getEmbyItems(mediaLib, filters);
        case "plex":
          return await this.getPlexItems(mediaLib, filters);
        default:
          throw new Error("不支持的媒体库类型");
      }
    } catch (error) {
      console.error("获取媒体项目失败:", error);
      throw error;
    }
  }

  // 获取Jellyfin媒体项目
  async getJellyfinItems(mediaLib, filters) {
    try {
      const params = {
        IncludeItemTypes: "Movie,Series",
        Recursive: true,
        Fields: "Overview,Genres,ProductionYear,CommunityRating",
        limit: filters.limit || 100,
      };

      if (filters.mediaType) {
        if (filters.mediaType === "movie") {
          params.IncludeItemTypes = "Movie";
        } else if (filters.mediaType === "tv") {
          params.IncludeItemTypes = "Series";
        }
      }

      if (filters.minRating) {
        params.MinCommunityRating = filters.minRating;
      }

      const response = await axios.get(`${mediaLib.base_url}/Items`, {
        headers: {
          "X-Emby-Token": mediaLib.api_key,
        },
        params,
        timeout: 30000,
      });

      return response.data.Items.map((item) => ({
        id: item.Id,
        title: item.Name,
        type: item.Type === "Movie" ? "movie" : "tv",
        year: item.ProductionYear,
        rating: item.CommunityRating,
        overview: item.Overview,
        genres: item.Genres || [],
      }));
    } catch (error) {
      console.error("获取Jellyfin项目失败:", error);
      throw error;
    }
  }

  // 获取Emby媒体项目
  async getEmbyItems(mediaLib, filters) {
    try {
      const params = {
        IncludeItemTypes: "Movie,Series",
        Recursive: true,
        Fields: "Overview,Genres,ProductionYear,CommunityRating",
        limit: filters.limit || 100,
      };

      if (filters.mediaType) {
        if (filters.mediaType === "movie") {
          params.IncludeItemTypes = "Movie";
        } else if (filters.mediaType === "tv") {
          params.IncludeItemTypes = "Series";
        }
      }

      const response = await axios.get(`${mediaLib.base_url}/emby/Items`, {
        headers: {
          "X-Emby-Token": mediaLib.api_key,
        },
        params,
        timeout: 30000,
      });

      return response.data.Items.map((item) => ({
        id: item.Id,
        title: item.Name,
        type: item.Type === "Movie" ? "movie" : "tv",
        year: item.ProductionYear,
        rating: item.CommunityRating,
        overview: item.Overview,
        genres: item.Genres || [],
      }));
    } catch (error) {
      console.error("获取Emby项目失败:", error);
      throw error;
    }
  }

  // 获取Plex媒体项目
  async getPlexItems(mediaLib, filters) {
    try {
      // Plex API 实现
      // 这里是简化版本，实际需要根据Plex API文档实现
      const response = await axios.get(
        `${mediaLib.base_url}/library/sections`,
        {
          headers: {
            "X-Plex-Token": mediaLib.api_key,
          },
          timeout: 30000,
        }
      );

      // 返回模拟数据
      return [
        {
          id: "plex_1",
          title: "Plex示例电影",
          type: "movie",
          year: 2023,
          rating: 8.0,
        },
      ];
    } catch (error) {
      console.error("获取Plex项目失败:", error);
      throw error;
    }
  }

  // 上传海报到媒体库
  async uploadPoster(mediaLibraryId, mediaItemId, posterUrl) {
    try {
      // 获取媒体库配置
      const db = this.getDb();
      const mediaLib = await db.get(
        `SELECT * FROM media_libraries WHERE id = ?`,
        [mediaLibraryId]
      );

      if (!mediaLib) {
        throw new Error("媒体库不存在");
      }

      // 根据类型上传海报
      switch (mediaLib.type) {
        case "jellyfin":
          return await this.uploadJellyfinPoster(
            mediaLib,
            mediaItemId,
            posterUrl
          );
        case "emby":
          return await this.uploadEmbyPoster(mediaLib, mediaItemId, posterUrl);
        case "plex":
          return await this.uploadPlexPoster(mediaLib, mediaItemId, posterUrl);
        default:
          throw new Error("不支持的媒体库类型");
      }
    } catch (error) {
      console.error("上传海报失败:", error);
      throw error;
    }
  }

  // 上传海报到Jellyfin
  async uploadJellyfinPoster(mediaLib, itemId, posterUrl) {
    try {
      // 这里应该实现实际的海报上传逻辑
      console.log(`上传海报到Jellyfin: ${itemId} -> ${posterUrl}`);
      return true;
    } catch (error) {
      console.error("上传Jellyfin海报失败:", error);
      throw error;
    }
  }

  // 上传海报到Emby
  async uploadEmbyPoster(mediaLib, itemId, posterUrl) {
    try {
      // 这里应该实现实际的海报上传逻辑
      console.log(`上传海报到Emby: ${itemId} -> ${posterUrl}`);
      return true;
    } catch (error) {
      console.error("上传Emby海报失败:", error);
      throw error;
    }
  }

  // 上传海报到Plex
  async uploadPlexPoster(mediaLib, itemId, posterUrl) {
    try {
      // 这里应该实现实际的海报上传逻辑
      console.log(`上传海报到Plex: ${itemId} -> ${posterUrl}`);
      return true;
    } catch (error) {
      console.error("上传Plex海报失败:", error);
      throw error;
    }
  }
}

module.exports = new MediaLibraryService();
