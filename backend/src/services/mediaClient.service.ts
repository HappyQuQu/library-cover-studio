import axios from 'axios';

interface MediaLibrary {
  id: string;
  name: string;
  type: string;
  itemCount?: number;
  imageUrl?: string;
}

interface MediaItem {
  id: string;
  name: string;
  year?: number;
  type: string;
  imageUrl?: string;
  genres?: string[];
  rating?: number;
  imageTags?: Record<string, string>; // Add ImageTags support
}

// 测试媒体服务器连接
export async function testConnection(
  serverType: string,
  url: string,
  apiKey: string
): Promise<boolean> {
  try {
    const endpoint = serverType === 'jellyfin'
      ? `${url}/System/Info`
      : `${url}/emby/System/Info`;

    const response = await axios.get(endpoint, {
      headers: getAuthHeaders(serverType, apiKey),
      timeout: 10000
    });

    return response.status === 200;
  } catch (error) {
    console.error('Connection test failed:', error);
    return false;
  }
}

// 获取媒体库列表
export async function getLibraries(
  serverType: string,
  url: string,
  apiKey: string
): Promise<MediaLibrary[]> {
  try {
    const endpoint = serverType === 'jellyfin'
      ? `${url}/Library/VirtualFolders`
      : `${url}/emby/Library/VirtualFolders`;

    const response = await axios.get(endpoint, {
      headers: getAuthHeaders(serverType, apiKey),
      timeout: 10000
    });

    return response.data.map((lib: any) => {
      const id = lib.ItemId || lib.Id;
      return {
        id,
        name: lib.Name,
        type: lib.CollectionType || 'unknown',
        itemCount: lib.ItemCount,
        imageUrl: `${url}/Items/${id}/Images/Primary?maxWidth=1000&quality=90`
      };
    });
  } catch (error) {
    console.error('Failed to get libraries:', error);
    return [];
  }
}

// 获取媒体库中的项目
export async function getLibraryItems(
  serverType: string,
  url: string,
  apiKey: string,
  libraryId: string,
  options: {
    limit?: number;
    startIndex?: number;
    sortBy?: string;
    sortOrder?: string;
    filter?: string;
  } = {}
): Promise<{ items: MediaItem[]; totalCount: number }> {
  try {
    const params = new URLSearchParams({
      ParentId: libraryId,
      Limit: String(options.limit || 50),
      StartIndex: String(options.startIndex || 0),
      SortBy: options.sortBy || 'DateCreated',
      SortOrder: options.sortOrder || 'Descending',
      Fields: 'Genres,Overview,Rating,Year,ImageTags',
      Recursive: 'true',
      IncludeItemTypes: 'Movie,Series'
    });

    if (options.filter) {
      params.append('Filters', options.filter);
    }

    const endpoint = serverType === 'jellyfin'
      ? `${url}/Items?${params}`
      : `${url}/emby/Items?${params}`;

    const response = await axios.get(endpoint, {
      headers: getAuthHeaders(serverType, apiKey),
      timeout: 30000
    });

    const items = response.data.Items?.map((item: any) => ({
      id: item.Id,
      name: item.Name,
      year: item.ProductionYear,
      type: item.Type,
      imageUrl: item.ImageTags?.Primary
        ? `${url}/Items/${item.Id}/Images/Primary`
        : undefined,
      genres: item.Genres,
      rating: item.CommunityRating,
      imageTags: item.ImageTags
    })) || [];

    return {
      items,
      totalCount: response.data.TotalRecordCount || items.length
    };
  } catch (error) {
    console.error('Failed to get library items:', error);
    return { items: [], totalCount: 0 };
  }
}

// 上传封面图片
export async function uploadCover(
  serverType: string,
  url: string,
  apiKey: string,
  itemId: string,
  imageBuffer: Buffer
): Promise<boolean> {
  try {
    const endpoint = serverType === 'jellyfin'
      ? `${url}/Items/${itemId}/Images/Primary?maxWidth=1000&quality=90`
      : `${url}/emby/Items/${itemId}/Images/Primary?maxWidth=1000&quality=90`;

    // Emby/Jellyfin API requires Base64 encoded image data
    const base64Image = imageBuffer.toString('base64');

    const response = await axios.post(endpoint, base64Image, {
      headers: {
        ...getAuthHeaders(serverType, apiKey),
        'Content-Type': 'image/png'
      },
      timeout: 30000
    });

    return response.status === 200 || response.status === 204;
  } catch (error) {
    console.error('Failed to upload cover:', error);
    return false;
  }
}

// 下载原始封面
export async function downloadCover(
  serverType: string,
  url: string,
  apiKey: string,
  itemId: string,
  type: string = 'Primary'
): Promise<Buffer | null> {
  try {
    const endpoint = serverType === 'jellyfin'
      ? `${url}/Items/${itemId}/Images/${type}`
      : `${url}/emby/Items/${itemId}/Images/${type}`;

    console.log(`  📡 Downloading from: ${endpoint}`);

    const response = await axios.get(endpoint, {
      headers: getAuthHeaders(serverType, apiKey),
      responseType: 'arraybuffer',
      timeout: 30000
    });

    console.log(`  📡 Response status: ${response.status}, content-type: ${response.headers['content-type']}, size: ${response.data?.length || 0}`);

    return Buffer.from(response.data);
  } catch (error: any) {
    console.error('Failed to download cover:', error.message);
    if (error.response) {
      console.error(`  Status: ${error.response.status}, Data: ${Buffer.from(error.response.data || '').toString().slice(0, 200)}`);
    }
    return null;
  }
}

// 获取认证头
export function getAuthHeaders(serverType: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'X-Emby-Token': apiKey,
  };

  if (serverType === 'jellyfin') {
    return {
      'Authorization': `MediaBrowser Token="${apiKey}"`
    };
  }

  return headers;
}
