import axios from 'axios';
import { createHash } from 'node:crypto';
import { retry } from '../utils/retry.js';
import { APP_VERSION } from '../config/version.js';

export interface MediaLibrary {
  id: string; name: string; type: string; itemCount?: number; imageUrl?: string; imageItemId?: string;
}
export interface MediaItem {
  id: string; name: string; year?: number; type: string; imageUrl?: string;
  genres?: string[]; rating?: number; imageTags?: Record<string, string>;
}
export interface MediaServerInfo {
  version: string; name: string; product: string; apiBaseUrl: string;
}

/** Expose actionable errors, without retaining Axios requests or upstream credentials. */
export class MediaServerError extends Error {
  readonly statusCode = 502;
  constructor(message: string, readonly code: string, readonly upstreamStatus?: number) {
    super(message); this.name = 'MediaServerError';
  }
}
function mediaError(error: any, operation: string): MediaServerError {
  if (error instanceof MediaServerError) return error;
  const status = error?.response?.status;
  if (status === 401) return new MediaServerError(`${operation}失败：API 密钥无效或已过期`, 'MEDIA_AUTH_FAILED', status);
  if (status === 403) return new MediaServerError(`${operation}失败：权限不足，请使用有管理权限的 API 密钥`, 'MEDIA_FORBIDDEN', status);
  if (status === 404) return new MediaServerError(`${operation}失败：接口或媒体项目不存在，请检查服务器地址`, 'MEDIA_NOT_FOUND', status);
  if (['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)) return new MediaServerError(`${operation}超时，请检查媒体服务器连接`, 'MEDIA_TIMEOUT');
  if (!error?.response) return new MediaServerError(`${operation}失败：无法连接媒体服务器，请检查地址、网络或证书`, 'MEDIA_UNREACHABLE');
  return new MediaServerError(`${operation}失败：媒体服务器返回 HTTP ${status}`, 'MEDIA_REQUEST_FAILED', status);
}

export function normalizeServerUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new MediaServerError('服务器地址无效，请填写完整的 HTTP 或 HTTPS 地址', 'MEDIA_INVALID_URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new MediaServerError('请使用不含账号密码的 HTTP 或 HTTPS 服务器地址', 'MEDIA_INVALID_URL');
  }
  url.search = ''; url.hash = '';
  url.pathname = url.pathname.replace(/\/web(?:\/.*)?$/i, '').replace(/\/+$/, '');
  return url.toString().replace(/\/+$/, '');
}
export function getAuthHeaders(serverType: string, apiKey: string): Record<string, string> {
  if (serverType === 'jellyfin') return {
    Accept: 'application/json',
    Authorization: `MediaBrowser Client="LibraryCoverStudio", Device="Server", DeviceId="library-cover-studio", Version="${APP_VERSION}", Token=${JSON.stringify(apiKey)}`
  };
  return { Accept: 'application/json', 'X-Emby-Token': apiKey };
}

const connections = new Map<string, { expires: number; info: MediaServerInfo }>();
const pendingConnections = new Map<string, Promise<MediaServerInfo>>();

/** Emby accepts /emby, while reverse proxies may expose its API at their configured root. */
export async function getServerInfo(serverType: string, input: string, apiKey: string, force = false): Promise<MediaServerInfo> {
  const url = normalizeServerUrl(input);
  const key = createHash('sha256').update(`${serverType}\0${url}\0${apiKey}`).digest('hex');
  const cached = connections.get(key);
  if (!force && cached && cached.expires > Date.now()) return cached.info;
  if (pendingConnections.has(key)) return pendingConnections.get(key)!;
  const request = (async () => {
    const bases = serverType === 'emby' && !/\/emby$/i.test(url) ? [`${url}/emby`, url] : [url];
    for (let index = 0; index < bases.length; index++) {
      try {
        const response = await axios.get(`${bases[index]}/System/Info`, { headers: getAuthHeaders(serverType, apiKey), timeout: 10000 });
        if (!response.data || typeof response.data.Version !== 'string') {
          if (index < bases.length - 1) continue;
          throw new MediaServerError('服务器返回的不是有效的 Jellyfin / Emby API，请检查地址', 'MEDIA_INVALID_RESPONSE');
        }
        const info = { version: response.data.Version, name: response.data.ServerName || '',
          product: response.data.ProductName || (serverType === 'emby' ? 'Emby Server' : 'Jellyfin Server'), apiBaseUrl: bases[index] };
        if (connections.size >= 100) connections.delete(connections.keys().next().value!);
        connections.set(key, { info, expires: Date.now() + 60000 });
        return info;
      } catch (error: any) {
        // Authentication failures must not trigger a second request to a different path.
        if ([404, 405].includes(error.response?.status) && index < bases.length - 1) continue;
        throw mediaError(error, '连接媒体服务器');
      }
    }
    throw new MediaServerError('未找到媒体服务器接口', 'MEDIA_NOT_FOUND');
  })();
  pendingConnections.set(key, request);
  try { return await request; } finally { pendingConnections.delete(key); }
}
export async function testConnection(serverType: string, url: string, apiKey: string): Promise<boolean> {
  try { await getServerInfo(serverType, url, apiKey, true); return true; } catch { return false; }
}

async function getJSON(serverType: string, url: string, apiKey: string, path: string, operation: string, params?: Record<string, string | number | boolean>) {
  try {
    const info = await getServerInfo(serverType, url, apiKey);
    const response = await retry(() => axios.get(`${info.apiBaseUrl}${path}`, {
      params, headers: getAuthHeaders(serverType, apiKey), timeout: 30000
    }), { label: operation });
    return response.data;
  } catch (error) { throw mediaError(error, operation); }
}
export async function getLibraries(serverType: string, url: string, apiKey: string): Promise<MediaLibrary[]> {
  const data = await getJSON(serverType, url, apiKey, '/Library/VirtualFolders', '读取媒体库');
  if (!Array.isArray(data)) throw new MediaServerError('媒体库接口返回格式无效', 'MEDIA_INVALID_RESPONSE');
  return data.filter(lib => lib && (lib.ItemId || lib.Id)).map(lib => ({
    id: String(lib.ItemId || lib.Id), name: lib.Name || '未命名媒体库', type: lib.CollectionType || 'mixed',
    itemCount: typeof lib.ItemCount === 'number' ? lib.ItemCount : undefined,
    imageItemId: lib.PrimaryImageItemId ? String(lib.PrimaryImageItemId) : undefined
  }));
}
export function normalizeSortBy(sort = 'DateCreated'): string {
  return sort === 'Name' ? 'SortName' : sort === 'DateLastPlayed' ? 'DatePlayed' : sort;
}
export function itemTypesForLibrary(type?: string): string {
  switch (type?.toLowerCase()) {
    case 'movies': return 'Movie';
    case 'tvshows': return 'Series';
    case 'music': return 'MusicAlbum';
    case 'musicvideos': return 'MusicVideo';
    case 'books': return 'Book,AudioBook';
    case 'photos': return 'Photo,PhotoAlbum';
    case 'homevideos': return 'Video';
    case 'boxsets': return 'BoxSet';
    default: return 'Movie,Series,Video,MusicAlbum,MusicVideo,Book,AudioBook';
  }
}
export async function getLibraryItems(serverType: string, url: string, apiKey: string, libraryId: string,
  options: { limit?: number; startIndex?: number; sortBy?: string; sortOrder?: string; filter?: string; libraryType?: string } = {}
): Promise<{ items: MediaItem[]; totalCount: number }> {
  const sortBy = normalizeSortBy(options.sortBy);
  if (serverType === 'emby' && sortBy === 'OfficialRating') throw new MediaServerError('Emby 不支持按家长分级排序，请选择其他排序方式', 'MEDIA_UNSUPPORTED_SORT');
  const params: Record<string, string | number | boolean> = {
    ParentId: libraryId, Limit: options.limit ?? 50, StartIndex: options.startIndex ?? 0,
    SortBy: sortBy, SortOrder: options.sortOrder || 'Descending',
    Fields: 'Genres', Recursive: true, IncludeItemTypes: itemTypesForLibrary(options.libraryType),
    EnableImages: true, EnableImageTypes: 'Primary,Art,Backdrop,Thumb,Banner,Logo', ImageTypeLimit: 1,
    EnableUserData: false, EnableTotalRecordCount: true
  };
  if (options.filter) params.Filters = options.filter;
  const data = await getJSON(serverType, url, apiKey, '/Items', '读取媒体项目', params);
  if (!data || !Array.isArray(data.Items)) throw new MediaServerError('媒体项目接口返回格式无效', 'MEDIA_INVALID_RESPONSE');
  const items = data.Items.filter((item: any) => item?.Id).map((item: any) => ({
    id: String(item.Id), name: item.Name || '', year: item.ProductionYear, type: item.Type || '',
    genres: item.Genres, rating: item.CommunityRating,
    imageTags: { ...item.ImageTags, ...(item.BackdropImageTags?.[0] ? { Backdrop: item.BackdropImageTags[0] } : {}) }
  }));
  return { items, totalCount: data.TotalRecordCount ?? items.length };
}

export interface ImageOptions { maxWidth?: number; quality?: number; tag?: string; index?: number; signal?: AbortSignal; }
export async function downloadCover(serverType: string, url: string, apiKey: string, itemId: string,
  type = 'Primary', options: ImageOptions = {}): Promise<Buffer | null> {
  try {
    const info = await getServerInfo(serverType, url, apiKey);
    const index = options.index ?? (['Backdrop', 'Screenshot', 'Chapter'].includes(type) ? 0 : undefined);
    const path = `/Items/${encodeURIComponent(itemId)}/Images/${encodeURIComponent(type)}${index === undefined ? '' : `/${index}`}`;
    const response = await retry(() => axios.get(`${info.apiBaseUrl}${path}`, {
      params: { MaxWidth: options.maxWidth ?? 1000, Quality: options.quality ?? 90, Tag: options.tag },
      headers: { ...getAuthHeaders(serverType, apiKey), Accept: 'image/*' }, responseType: 'arraybuffer',
      timeout: 30000, signal: options.signal,
      maxContentLength: 30 * 1024 * 1024
    }), { label: '下载媒体图片', shouldRetry: error => !axios.isCancel(error) && (error.response?.status === 429 || error.response?.status >= 500 || !error.response) });
    const buffer = Buffer.from(response.data);
    if (!buffer.length || !imageMimeType(buffer)) throw new MediaServerError('图片接口返回的不是支持的图片文件', 'MEDIA_INVALID_IMAGE');
    return buffer;
  } catch (error: any) {
    if (axios.isCancel(error)) throw error;
    if (error.response?.status === 404) return null;
    throw mediaError(error, '下载媒体图片');
  }
}
export function imageMimeType(buffer: Buffer): string | undefined {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString())) return 'image/gif';
  return undefined;
}
export async function uploadCover(serverType: string, url: string, apiKey: string, itemId: string, imageBuffer: Buffer): Promise<boolean> {
  const contentType = imageMimeType(imageBuffer);
  if (!contentType) throw new MediaServerError('封面图片格式无效，请使用 PNG、JPEG、WebP 或 GIF', 'MEDIA_INVALID_IMAGE');
  try {
    const info = await getServerInfo(serverType, url, apiKey);
    // Both APIs expect a Base64 body, including Jellyfin 12.x despite the OpenAPI binary schema.
    const response = await retry(() => axios.post(`${info.apiBaseUrl}/Items/${encodeURIComponent(itemId)}/Images/Primary`, imageBuffer.toString('base64'), {
      headers: { ...getAuthHeaders(serverType, apiKey), 'Content-Type': contentType }, timeout: 30000,
      maxBodyLength: 40 * 1024 * 1024
    }), { label: '上传媒体库封面' });
    return response.status === 200 || response.status === 204;
  } catch (error) { throw mediaError(error, '上传媒体库封面'); }
}
