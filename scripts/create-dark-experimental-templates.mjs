import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { renderLibraryCover } from '../backend/src/services/renderer.service.ts';
import { requiredPosterCount } from '../backend/src/services/libraryCover.service.ts';

// Builds editable designs and review assets; never seeds the database or uploads covers.
// Optional LCS_DARK_ARTWORK_DIR contains Anime/TV/post1.bin ... post9.bin and backdrop.bin.
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'backend/src/template/dark-experiments');
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const sharp = require('sharp'), AdmZip = require('adm-zip');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const manifest = path.join(root, 'backend/src/template/defaults/manifest.json');
const before = createHash('sha256').update(await fs.readFile(manifest)).digest('hex');
const artwork = await Promise.all(Array.from({ length: 9 }, (_, i) => fs.readFile(path.join(root, `backend/src/template/poster/${i + 1}.jpg`))));
const dimensions = await Promise.all(artwork.map(buffer => sharp(buffer).metadata()));
const sampleBackdrop = await fs.readFile(path.join(root, 'backend/src/template/poster/backdrop.jpg'));
const base = { version: '6.0.0', opacity: 1, visible: true, scaleX: 1, scaleY: 1,
  angle: 0, strokeWidth: 0, originX: 'left', originY: 'top' };
let sequence = 0;
const object = (type, name, values) => ({ ...base, type, id: `dark-layer-${++sequence}`, name, ...values });
const rect = (name, x, y, w, h, fill, extra = {}) => object('Rect', name, { left: x, top: y, width: w, height: h, fill, ...extra });
const polygon = (name, x, y, w, h, points, fill, extra = {}) => object('Polygon', name, {
  left: x, top: y, width: w, height: h, points: points.map(([px, py]) => ({ x: px * w, y: py * h })),
  pathOffset: { x: w / 2, y: h / 2 }, fill, ...extra });
const gradient = (w, h, stops, vertical = false) => ({ type: 'linear', gradientUnits: 'pixels',
  coords: { x1: 0, y1: 0, x2: vertical ? 0 : w, y2: vertical ? h : 0 },
  colorStops: stops.map(([offset, color]) => ({ offset, color })) });
const text = (name, value, x, y, w, size, fill, extra = {}) => object('Textbox', name, {
  left: x, top: y, width: w, height: Math.ceil(size * 1.2), text: value,
  fontFamily: 'sans-serif', fontSize: size, fontWeight: 'normal', fill,
  textAlign: 'left', lineHeight: 1.16, fitText: true, ...extra });
const primary = (x, y, w, size, fill, extra = {}) => text('主标题 · 媒体库变量', '电影', x, y, w, size, fill,
  { id: 'primary-title', fontWeight: 'bold', textVar: '{{primary_title}}', ...extra });
const secondary = (x, y, w, size, fill, extra = {}) => text('副标题 · 媒体库变量', 'MOVIES', x, y, w, size, fill,
  { id: 'secondary-title', fontWeight: '500', textVar: '{{secondary_title}}', charSpacing: 100, ...extra });
const stroke = (name, x, y, w, h, color, extra = {}) => rect(name, x, y, w, h, null, { stroke: color, strokeWidth: 3, ...extra });
function poster(slot, x, y, w, h, { radius = 0, mask } = {}) {
  const source = dimensions[slot - 1], ratio = w / h;
  const cw = Math.min(source.width, source.height * ratio), ch = cw / ratio;
  const image = object('Image', `海报 ${slot}`, { id: `poster-${slot}`, posterVar: `post${slot}`, isPoster: true,
    src: `/api/templates/posters/${slot}.jpg`, crossOrigin: 'anonymous',
    left: x + w / 2, top: y + h / 2, originX: 'center', originY: 'center', width: cw, height: ch,
    cropX: (source.width - cw) / 2, cropY: (source.height - ch) / 2, scaleX: w / cw, scaleY: h / ch });
  if (mask) image.clipPath = { ...base, type: 'Polygon', originX: 'center', originY: 'center', left: 0, top: 0,
    width: cw, height: ch, points: mask.map(([px, py]) => ({ x: px * cw, y: py * ch })),
    pathOffset: { x: cw / 2, y: ch / 2 }, fill: '#000000' };
  else if (radius) image.clipPath = { ...base, type: 'Rect', originX: 'center', originY: 'center', left: 0, top: 0,
    width: cw, height: ch, rx: radius / image.scaleX, ry: radius / image.scaleY, fill: '#000000' };
  return image;
}

function plinths() {
  const objects = [rect('展台环境光', 0, 0, 1920, 1080, gradient(1920, 1080, [[0, '#090b0d'], [.6, '#191812'], [1, '#11110f']])),
    text('展览眉题', 'CURATED / AFTER DARK', 120, 108, 1100, 32, '#ac9167', { charSpacing: 160 }),
    primary(120, 360, 560, 182, '#f3e6cd'), secondary(126, 580, 560, 62, '#cdb083'),
    rect('标题金线', 126, 706, 210, 5, '#cdb083'),
    text('展览序号', '01 — THE COLLECTION', 120, 940, 800, 28, '#887c68', { charSpacing: 80 })];
  const cards = [[760, 280, 286, 430, 220], [1094, 168, 286, 430, 332], [1428, 380, 286, 430, 120]];
  cards.forEach(([x, y, w, h, pedestal], i) => {
    objects.push(rect(`展台侧面 ${i + 1}`, x - 22, y + h + 12, w + 44, pedestal, gradient(w + 44, pedestal, [[0, '#34302b'], [1, '#121311']], true)),
      rect(`展台顶面 ${i + 1}`, x - 22, y + h + 12, w + 44, 14, '#76664b'),
      stroke(`海报细金框 ${i + 1}`, x - 5, y - 5, w + 10, h + 10, '#887553'),
      poster(i + 1, x, y, w, h));
  });
  return { background: '#10110f', objects };
}
function staircase() {
  const objects = [rect('午夜蓝渐变', 0, 0, 1920, 1080, gradient(1920, 1080, [[0, '#0b1221'], [1, '#14283d']])),
    text('阶梯眉题', 'MIDNIGHT / SELECTION', 112, 62, 1350, 30, '#6d97b4', { charSpacing: 150 }),
    primary(112, 137, 940, 166, '#eff7ff'), secondary(120, 338, 840, 56, '#98b8ce'),
    text('阶梯编号装饰', '05', 1490, 784, 330, 198, '#294159', { fontWeight: 'bold', textAlign: 'right' })];
  for (let i = 0; i < 5; i++) {
    const x = 112 + i * 340, y = 606 - i * 132;
    objects.push(rect(`阶梯底座 ${i + 1}`, x, y + 344, 260, 20, '#37526a'),
      stroke(`阶梯边框 ${i + 1}`, x - 3, y - 3, 260, 348, '#4d7590'),
      poster(i + 1, x, y, 254, 342, { radius: 5 }),
      text(`阶梯图号 ${i + 1}`, `0${i + 1}`, x + 2, y + 382, 250, 30, '#88a9c3', { charSpacing: 120 }));
  }
  return { background: '#0b1221', objects };
}
function shutters() {
  const mask = [[.2, 0], [1, 0], [.8, 1], [0, 1]];
  const objects = [rect('暗红底光', 0, 0, 1920, 1080, gradient(1920, 1080, [[0, '#130b0e'], [1, '#401b22']])),
    rect('红色封面签', 116, 128, 114, 10, '#f47761'),
    text('快门眉题', 'TRIPLE EXPOSURE', 116, 170, 650, 32, '#d08683', { charSpacing: 130 }),
    primary(112, 420, 620, 190, '#fff0e7'), secondary(122, 644, 610, 64, '#efa69b'),
    text('快门底注', 'THREE VIEWS / ONE LIBRARY', 116, 963, 900, 27, '#a97477', { charSpacing: 60 })];
  for (let i = 0; i < 3; i++) {
    const x = 778 + i * 350, y = 112 + [64, 0, 100][i];
    objects.push(polygon(`快门光边 ${i + 1}`, x - 8, y - 8, 348, 790, mask, '#ae625b'),
      poster(i + 1, x, y, 332, 774, { mask }));
  }
  return { background: '#130b0e', objects };
}
function cinemascope() {
  return { background: '#090b10', posterBackground: { source: 'backdrop', blur: 0, dim: .3 }, objects: [
    rect('上方银幕黑边', 0, 0, 1920, 170, '#090b10'), rect('下方银幕黑边', 0, 870, 1920, 210, '#090b10'),
    rect('画面左侧暗幕', 0, 170, 1550, 700, gradient(1550, 700, [[0, 'rgba(5,8,14,.96)'], [.5, 'rgba(5,8,14,.63)'], [1, 'rgba(5,8,14,0)']])),
    text('宽银幕眉题', 'NIGHT SCREEN / CINEMASCOPE', 116, 70, 1600, 34, '#98a4b5', { charSpacing: 140 }),
    primary(116, 375, 1150, 204, '#f7f3ec'), secondary(124, 621, 1030, 68, '#e2cab0'),
    rect('银幕上金线', 116, 167, 1688, 3, '#6d5b45'), rect('银幕下金线', 116, 870, 1688, 3, '#6d5b45'),
    text('银幕底注', 'A WIDER VIEW OF YOUR COLLECTION', 116, 961, 1640, 34, '#7d8899', { charSpacing: 120 }),
  ] };
}
function neonWindow() {
  const objects = [rect('橱窗底光', 0, 0, 1920, 1080, gradient(1920, 1080, [[0, '#061416'], [.55, '#0a1826'], [1, '#141325']])),
    stroke('主橱窗错位光框', 126, 214, 630, 674, '#328f92', { rx: 22, ry: 22 }),
    stroke('主橱窗边框', 96, 184, 630, 674, '#80c8c8', { rx: 20, ry: 20 }),
    poster(1, 108, 196, 606, 650, { radius: 12 }),
    text('橱窗眉题', 'NOCTURNE / DISPLAY', 832, 106, 990, 32, '#6f9aa9', { charSpacing: 140 }),
    primary(824, 230, 980, 176, '#e9f3ef'), secondary(834, 442, 950, 62, '#85d9d2'),
    rect('橱窗标题分隔', 834, 572, 934, 2, '#314e5b'),
    text('橱窗底注', 'SELECTED FOR YOUR SCREEN', 108, 976, 1550, 28, '#607e8c', { charSpacing: 100 })];
  for (let i = 0; i < 3; i++) {
    const x = 834 + i * 324;
    objects.push(stroke(`橱窗小光框 ${i + 1}`, x + 8, 687, 284, 222, '#326274', { rx: 8, ry: 8 }),
      poster(i + 2, x, 679, 284, 222, { radius: 8 }));
  }
  return { background: '#061416', objects };
}
function foldedScreen() {
  const left = [[0, 0], [1, .13], [1, .87], [0, 1]], right = [[0, .13], [1, 0], [1, 1], [0, .87]];
  return { background: '#101215', objects: [
    rect('折页环境底光', 0, 0, 1920, 1080, gradient(1920, 1080, [[0, '#101215'], [.5, '#272d33'], [1, '#101215']])),
    primary(960, 60, 1640, 146, '#f0f0e9', { originX: 'center', textAlign: 'center' }),
    polygon('左折页衬底', 144, 242, 812, 638, left, '#4c555b'),
    polygon('右折页衬底', 964, 242, 812, 638, right, '#4c555b'),
    poster(1, 158, 256, 782, 610, { mask: left }), poster(2, 980, 256, 782, 610, { mask: right }),
    rect('书脊暗面', 940, 334, 40, 454, '#101215'),
    rect('左页书脊阴影', 700, 334, 240, 454, gradient(240, 454, [[0, 'rgba(9,12,16,0)'], [1, 'rgba(9,12,16,.72)']])),
    rect('右页书脊阴影', 980, 334, 240, 454, gradient(240, 454, [[0, 'rgba(9,12,16,.72)'], [1, 'rgba(9,12,16,0)']])),
    secondary(960, 940, 1640, 61, '#a5b7bd', { originX: 'center', textAlign: 'center', charSpacing: 220 }),
  ] };
}
function prisms() {
  const mask = [[.5, 0], [1, .5], [.5, 1], [0, .5]];
  const centers = [[1140, 204], [1410, 204], [870, 474], [1140, 474], [1410, 474], [1680, 474], [1005, 744], [1275, 744], [1545, 744]];
  const objects = [rect('棱镜底光', 0, 0, 1920, 1080, gradient(1920, 1080, [[0, '#0e111b'], [1, '#1c2037']])),
    text('棱镜眉题', 'NINE FRAGMENTS / ONE COLLECTION', 112, 69, 1700, 30, '#778ba8', { charSpacing: 110 }),
    primary(112, 383, 580, 180, '#e8edf5'), secondary(124, 595, 570, 59, '#abbed8'),
    rect('棱镜标题点缀', 124, 728, 102, 6, '#c4ab74'),
    text('棱镜底注', 'REFRACT YOUR LIBRARY', 112, 983, 1640, 28, '#6f839d', { charSpacing: 140 })];
  centers.forEach(([cx, cy], i) => {
    objects.push(polygon(`棱镜镶边 ${i + 1}`, cx - 132, cy - 132, 264, 264, mask, '#657890'),
      poster(i + 1, cx - 126, cy - 126, 252, 252, { mask }));
  });
  return { background: '#0e111b', objects };
}
const concepts = [
  ['black-gold-plinths', '黑金展台', '炭黑与香槟金，三张海报陈列在高低展台上，左侧大标题。', plinths],
  ['midnight-staircase', '午夜阶梯', '五张直立海报沿阶梯逐级上升，午夜蓝底色与独立图号。', staircase],
  ['ember-shutters', '赤焰快门', '三幅长条海报裁成斜向快门，暗红背景、珊瑚色细边。', shutters],
  ['night-cinemascope', '全景夜航', '首部影片背景作为宽银幕画面，上下黑边、左侧大标题与暗幕。', cinemascope],
  ['neon-window', '霓虹橱窗', '一幅大图与三幅横向小图组成橱窗，细青色边框与错位光框。', neonWindow],
  ['folded-screen', '银幕折页', '两幅画面组成向中央收拢的折页银幕，带书脊阴影。', foldedScreen],
  ['prismatic-fragments', '碎片棱镜', '九张海报裁成菱形碎片，错落排列在右侧，左侧大标题。', prisms],
];
await fs.mkdir(path.join(directory, 'packages'), { recursive: true });
const realSets = [];
if (process.env.LCS_DARK_ARTWORK_DIR) {
  for (const name of ['Anime', 'TV']) {
    const folder = path.join(process.env.LCS_DARK_ARTWORK_DIR, name);
    const info = JSON.parse(await fs.readFile(path.join(folder, 'info.json'), 'utf8'));
    const posters = await Promise.all(Array.from({ length: 9 }, (_, i) => fs.readFile(path.join(folder, `post${i + 1}.bin`))));
    let backdrop; try { backdrop = await fs.readFile(path.join(folder, 'backdrop.bin')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    realSets.push({ name, info, posters, backdrop });
    await fs.mkdir(path.join(directory, 'real', name), { recursive: true });
  }
}
const metadata = { version: '1.0.0', author: { name: 'HappyQuQu', url: 'https://github.com/HappyQuQu' }, changelog: '深色试作首版，独立构图，可编辑图层与媒体库变量。' };
const gallery = [];
for (const [index, [slug, name, description, make]] of concepts.entries()) {
  sequence = 0;
  const id = `d13c7001-6ea1-4c89-a5ba-${String(index + 1).padStart(12, '0')}`;
  const canvas = { version: '6.0.0', width: 1920, height: 1080, randomOnGeneration: false, randomBackgroundStyle: 'cinema-mesh', ...make() };
  const definition = { ...metadata, id, name, description, primaryTitle: '电影', secondaryTitle: 'MOVIES', previewFile: `${slug}.jpg`, samplePosters: [1,2,3,4,5,6,7,8,9], canvas };
  assert.equal(new Set(canvas.objects.map(o => o.id)).size, canvas.objects.length);
  assert.ok(canvas.objects.some(o => o.textVar === '{{primary_title}}'));
  assert.ok(canvas.objects.some(o => o.textVar === '{{secondary_title}}'));
  const count = requiredPosterCount(JSON.stringify(canvas)); assert.ok(count >= 1 && count <= 9);
  const rendered = await renderLibraryCover(JSON.stringify(canvas), { title: '电影', primaryTitle: '电影', secondaryTitle: 'MOVIES' }, artwork,
    { width: 1920, height: 1080, format: 'jpeg', quality: 93, backdropBuffer: sampleBackdrop });
  const info = await sharp(rendered).metadata(); assert.equal(info.width, 1920); assert.equal(info.height, 1080);
  await fs.writeFile(path.join(directory, `${slug}.json`), JSON.stringify(definition, null, 2) + '\n');
  await fs.writeFile(path.join(directory, `${slug}.jpg`), rendered);
  const zip = new AdmZip();
  zip.addFile('template.json', Buffer.from(JSON.stringify({ ...metadata, name: `深色试作 · ${name}`, description, width: 1920, height: 1080, isPublic: false, canvasJson: JSON.stringify(canvas) }, null, 2)));
  zip.addFile('preview.jpg', await sharp(rendered).resize(480, 270).jpeg({ quality: 90 }).toBuffer());
  await fs.writeFile(path.join(directory, 'packages', `${slug}.zip`), zip.toBuffer());
  for (const real of realSets) {
    const output = await renderLibraryCover(JSON.stringify(canvas), { title: real.name, primaryTitle: real.info.primaryTitle, secondaryTitle: real.info.secondaryTitle }, real.posters,
      { width: 1920, height: 1080, format: 'jpeg', quality: 94, backdropBuffer: real.backdrop });
    await fs.writeFile(path.join(directory, 'real', real.name, `${slug}.jpg`), output);
  }
  gallery.push({ id, slug, name, description, posterCount: count });
}
await fs.writeFile(path.join(directory, 'catalog.json'), JSON.stringify({ version: 1, initialize: false, templates: gallery }, null, 2) + '\n');
const font = ['PingFang SC', 'Noto Sans CJK SC', 'Noto Sans CJK JP', 'Arial Unicode MS'].find(f => GlobalFonts.has(f)) || 'sans-serif';
async function overview(file, imageDirectory, subtitle) {
  const board = createCanvas(1920, 2536), ctx = board.getContext('2d');
  ctx.fillStyle = '#0b1017'; ctx.fillRect(0, 0, 1920, 2536);
  ctx.font = `bold 54px "${font}"`; ctx.fillStyle = '#f0f1ec'; ctx.fillText('七套深色模板', 64, 88);
  ctx.font = `26px "${font}"`; ctx.fillStyle = '#93a3b5'; ctx.fillText(subtitle, 64, 140);
  const composites = [];
  for (const [index, item] of gallery.entries()) {
    const x = 64 + index % 2 * 922, y = 200 + Math.floor(index / 2) * 570;
    ctx.font = `bold 31px "${font}"`; ctx.fillStyle = '#e7edf2'; ctx.fillText(`${String(index + 1).padStart(2, '0')}  ${item.name}`, x, y + 38);
    composites.push({ input: await sharp(path.join(imageDirectory, `${item.slug}.jpg`)).resize(884, 497).png().toBuffer(), left: x, top: y + 60 });
  }
  ctx.font = `bold 46px "${font}"`; ctx.fillStyle = '#d4e0ed'; ctx.fillText('小屏也能读清标题', 1014, 2150);
  ctx.font = `28px "${font}"`; ctx.fillStyle = '#91a4b8'; ctx.fillText('1–9 张海报 · 可编辑图层', 1014, 2212);
  ctx.fillText('未加入默认初始化', 1014, 2274);
  await fs.writeFile(file, await sharp(board.toBuffer('image/png')).composite(composites).jpeg({ quality: 94 }).toBuffer());
}
await overview(path.join(directory, 'overview.jpg'), directory, '1920 × 1080 · 七种新构图 · 可编辑 · 可导入分享');
for (const real of realSets) await overview(path.join(directory, `overview-${real.name}.jpg`), path.join(directory, 'real', real.name),
  `Jellyfin ${real.name} 真实素材预览 · ${real.info.uniqueCount} 张可用海报${real.backdrop ? ' · 含影片背景' : ''}`);
const bundle = new AdmZip();
for (const item of gallery) bundle.addFile(`${item.slug}.zip`, await fs.readFile(path.join(directory, 'packages', `${item.slug}.zip`)));
await fs.writeFile(path.join(directory, 'seven-dark-templates.zip'), bundle.toBuffer());
const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
await fs.writeFile(path.join(directory, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>七套深色模板 · CoverStudio</title><style>body{margin:0;background:#0b1017;color:#e7edf2;font:16px/1.6 system-ui}main{max-width:1600px;margin:auto;padding:40px 24px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,540px),1fr));gap:28px}article{background:#151e2a;border:1px solid #2c3d50;border-radius:16px;overflow:hidden}img{width:100%;display:block;aspect-ratio:16/9}article div{padding:16px 20px}h2{margin:0}p{color:#91a4b8}a{color:#9dd5d3}summary{cursor:pointer}details{margin-top:14px}header{margin-bottom:30px}</style><main><header><h1>七套深色模板</h1><p>七种独立构图 · 1920 × 1080 · 可编辑 · 未加入初始化</p><a href="seven-dark-templates.zip" download>下载七套模板合集（解压后分别导入）</a>${realSets.map(r => ` · <a href="overview-${r.name}.jpg">${r.name} 真实素材总览</a>`).join('')}</header><section>${gallery.map((t,i) => `<article><a href="${t.slug}.jpg"><img src="${t.slug}.jpg" alt="${escape(t.name)}"></a><div><h2>${i+1}. ${escape(t.name)}</h2><p>${escape(t.description)}</p><a href="packages/${t.slug}.zip" download>导入包</a> · <a href="${t.slug}.json" download>设计源文件</a>${realSets.map(r => `<details><summary>查看 ${r.name} 真实素材效果</summary><a href="real/${r.name}/${t.slug}.jpg"><img src="real/${r.name}/${t.slug}.jpg" alt="${escape(t.name)} ${r.name}"></a></details>`).join('')}</div></article>`).join('')}</section></main></html>`);
assert.equal(createHash('sha256').update(await fs.readFile(manifest)).digest('hex'), before, 'Default initialization is unchanged');
console.log(JSON.stringify({ templates: gallery.length, realLibraries: realSets.map(r => r.name), initialize: false }));
