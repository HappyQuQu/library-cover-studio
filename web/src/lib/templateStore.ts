export const orientationOptions = [
  { value: 'landscape', label: 'templateStore.landscape' },
  { value: 'portrait', label: 'templateStore.portrait' },
  { value: 'square', label: 'templateStore.square' }
] as const;
export const artworkOptions = [
  { value: 'poster', label: 'templateStore.artworkPoster' },
  { value: 'backdrop', label: 'templateStore.artworkBackdrop' },
  { value: 'mixed', label: 'templateStore.artworkMixed' },
  { value: 'none', label: 'templateStore.artworkNone' }
] as const;
export const useOptions = [
  { value: 'library', label: 'templateStore.useLibrary' },
  { value: 'collection', label: 'templateStore.useCollection' }
] as const;
export const statusOptions = [
  { value: 'not-installed', label: 'templateStore.statusNotInstalled' },
  { value: 'installed', label: 'templateStore.statusInstalled' },
  { value: 'updates', label: 'templateStore.statusUpdates' }
] as const;
export const storePageSizes = [12, 24, 48, 96];

export function readStoreFilters(params: URLSearchParams, defaultSize = 24) {
  const choice = (key: string, values: readonly string[]) => values.includes(params.get(key) || '') ? params.get(key)! : 'all';
  const q = (params.get('q') || '').slice(0, 200);
  const sort = params.get('sort');
  const size = Number(params.get('pageSize'));
  const page = Number(params.get('page'));
  return {
    q, orientation: choice('orientation', orientationOptions.map(option => option.value)),
    artwork: choice('artwork', artworkOptions.map(option => option.value)),
    use: choice('use', useOptions.map(option => option.value)),
    status: choice('status', statusOptions.map(option => option.value)),
    sort: sort && ['popular', 'name', 'newest', 'oldest', ...(q.trim() ? ['relevance'] : [])].includes(sort) ? sort : q.trim() ? 'relevance' : 'popular',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: storePageSizes.includes(size) ? size : storePageSizes.includes(defaultSize) ? defaultSize : 24
  };
}

export function coverRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => b ? gcd(b, a % b) : a;
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}
