import type { StoreEntry } from './templateStore.service.js';

export function storeOrientation(entry: Pick<StoreEntry, 'width' | 'height'>) {
  return entry.width > entry.height ? 'landscape' : entry.width < entry.height ? 'portrait' : 'square';
}

export const normalizeStoreSearch = (value: string) => value.normalize('NFKC').toLocaleLowerCase().trim();

const useAliases = { library: '媒体库 分类 library', collection: '合集 系列 collection boxset' };
const artworkAliases = {
  poster: '海报 竖图 poster', backdrop: '横图 横向素材 横向剧照 背景图 backdrop landscape-artwork',
  mixed: '混合 海报 横图 横向剧照 mixed', none: '纯文字 无需图片 无图 text-only'
};
const orientationAliases = { landscape: '横版 横封 landscape horizontal', portrait: '竖版 竖封 portrait vertical', square: '方形 正方形 square' };

/** Search all keywords across readable fields and stable classification aliases. */
export function storeSearchScore(entry: Pick<StoreEntry, 'name' | 'description' | 'author' | 'width' | 'height' | 'classification'>, tokens: string[]): number | null {
  const classification = entry.classification;
  const name = normalizeStoreSearch(entry.name);
  const tags = normalizeStoreSearch(classification?.tags.join(' ') || '');
  const text = normalizeStoreSearch([
    entry.name, entry.description, entry.author?.name,
    orientationAliases[storeOrientation(entry)],
    classification?.recommendedUses.map(use => useAliases[use]).join(' '),
    classification && artworkAliases[classification.artworkType], tags
  ].filter(Boolean).join(' '));
  if (!tokens.every(token => text.includes(token))) return null;
  const phrase = tokens.join(' ');
  return tokens.reduce((score, token) => score + (name === token ? 20 : name.includes(token) ? 10 : tags.includes(token) ? 5 : 1),
    phrase && name === phrase ? 1000 : phrase && name.includes(phrase) ? 100 : 0);
}
