import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { renderLibraryCover } from '../backend/src/services/renderer.service.ts';

// Run from backend: node --import tsx ../scripts/create-experimental-templates.mjs
// This builds review assets only. It never writes a database or the default manifest.
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'backend/src/template/experiments');
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const sharp = require('sharp');
const AdmZip = require('adm-zip');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const defaultManifest = path.join(root, 'backend/src/template/defaults/manifest.json');
const defaultBefore = await fs.readFile(defaultManifest);
const artwork = await Promise.all(Array.from({ length: 9 }, (_, i) => fs.readFile(path.join(root, `backend/src/template/poster/${i + 1}.jpg`))));
const dimensions = await Promise.all(artwork.map(buffer => sharp(buffer).metadata()));
const base = { version: '6.0.0', opacity: 1, visible: true, scaleX: 1, scaleY: 1,
  angle: 0, strokeWidth: 0, originX: 'left', originY: 'top' };
let sequence = 0;
const object = (type, name, values) => ({ ...base, type, id: `experiment-${++sequence}`, name, ...values });
const rect = (name, x, y, w, h, fill, extra = {}) => object('Rect', name, { left: x, top: y, width: w, height: h, fill, ...extra });
const ellipse = (name, x, y, w, h, fill, extra = {}) => object('Ellipse', name, { left: x, top: y, width: w, height: h, rx: w / 2, ry: h / 2, fill, ...extra });
const text = (name, value, x, y, w, size, fill, extra = {}) => object('Textbox', name, {
  left: x, top: y, width: w, height: Math.ceil(size * 1.2), text: value,
  fontFamily: 'sans-serif', fontSize: size, fontWeight: 'normal', fill,
  textAlign: 'left', lineHeight: 1.16, fitText: true, ...extra,
});
const primary = (x, y, w, size, fill, extra = {}) => text('主标题 · 媒体库变量', '电影', x, y, w, size, fill,
  { id: 'primary-title', fontWeight: 'bold', textVar: '{{primary_title}}', ...extra });
const secondary = (x, y, w, size, fill, extra = {}) => text('副标题 · 媒体库变量', 'MOVIES', x, y, w, size, fill,
  { id: 'secondary-title', fontWeight: '500', textVar: '{{secondary_title}}', ...extra });

function polygonClip(w, h, points) {
  return { ...base, type: 'Polygon', originX: 'center', originY: 'center', left: 0, top: 0,
    width: w, height: h, points, pathOffset: { x: w / 2, y: h / 2 }, fill: '#000000' };
}
function poster(slot, x, y, w, h, { radius = 0, mask } = {}) {
  const source = dimensions[slot - 1];
  const ratio = w / h;
  const cropWidth = Math.min(source.width, source.height * ratio);
  const cropHeight = cropWidth / ratio;
  const image = object('Image', `海报 ${slot}`, { id: `poster-${slot}`, posterVar: `post${slot}`, isPoster: true,
    src: `/api/templates/posters/${slot}.jpg`, crossOrigin: 'anonymous',
    left: x + w / 2, top: y + h / 2, originX: 'center', originY: 'center', width: cropWidth, height: cropHeight,
    cropX: (source.width - cropWidth) / 2, cropY: (source.height - cropHeight) / 2,
    scaleX: w / cropWidth, scaleY: h / cropHeight });
  if (mask === 'circle') {
    image.clipPath = { ...base, type: 'Circle', originX: 'center', originY: 'center',
      left: 0, top: 0, width: cropWidth, height: cropHeight, radius: cropWidth / 2, fill: '#000000' };
  } else if (mask === 'hexagon') {
    image.clipPath = polygonClip(cropWidth, cropHeight, [
      { x: cropWidth / 4, y: 0 }, { x: cropWidth * .75, y: 0 }, { x: cropWidth, y: cropHeight / 2 },
      { x: cropWidth * .75, y: cropHeight }, { x: cropWidth / 4, y: cropHeight }, { x: 0, y: cropHeight / 2 },
    ]);
  } else if (radius) {
    image.clipPath = { ...base, type: 'Rect', originX: 'center', originY: 'center', left: 0, top: 0,
      width: cropWidth, height: cropHeight, rx: radius / image.scaleX, ry: radius / image.scaleY, fill: '#000000' };
  }
  return image;
}

function ticket() {
  const o = [rect('票根纸面', 84, 100, 1752, 880, '#f5efdf', { rx: 28, ry: 28 }),
    poster(1, 128, 146, 510, 764, { radius: 14 }),
    rect('票根分隔虚线', 736, 146, 1, 786, null, { stroke: '#b6ae97', strokeWidth: 3, strokeDashArray: [12, 12] }),
    ellipse('上方票根缺口', 707, 74, 58, 58, '#173b37'), ellipse('下方票根缺口', 707, 952, 58, 58, '#173b37'),
    text('票根眉题', 'PRIVATE SCREENING', 824, 172, 820, 34, '#56645b', { charSpacing: 160 }),
    primary(820, 318, 920, 192, '#18352f'), secondary(828, 562, 870, 66, '#18352f', { charSpacing: 90 }),
    rect('票根信息分隔', 828, 742, 868, 2, '#ccc4ac'),
    text('票根编号', 'ADMIT ONE / 001', 828, 780, 760, 40, '#596456', { charSpacing: 30 }),
    text('票根版本', 'LIBRARY EDITION', 828, 920, 680, 26, '#78816b', { charSpacing: 100 }),
    ellipse('票根圆章', 1570, 786, 122, 122, null, { stroke: '#7f8e76', strokeWidth: 3 }),
    text('圆章文字', '01', 1590, 812, 82, 54, '#5f705b', { textAlign: 'center' }),
  ];
  let x = 830;
  for (let i = 0; i < 63; i++) { const w = [3, 2, 6, 2, 4, 1, 5][i % 7]; o.push(rect(`条码装饰 ${i + 1}`, x, 850, w, 48 + i % 3 * 8, '#18352f')); x += w + 4; }
  return { background: '#173b37', objects: o };
}

function filmstrip() {
  const o = [text('胶片眉题', '01 / CINEMA ARCHIVE', 124, 90, 1200, 38, '#cbb278', { charSpacing: 110 }),
    rect('胶片边框', 0, 216, 1920, 480, '#252525')];
  for (let i = 0; i < 4; i++) o.push(poster(i + 1, 64 + i * 450, 276, 426, 352));
  for (let i = 0; i < 29; i++) for (const y of [235, 650]) o.push(rect(`胶片齿孔 ${i}-${y}`, 40 + i * 64, y, 31, 25, '#101010', { rx: 5, ry: 5 }));
  o.push(primary(124, 744, 1280, 176, '#f2efe5'), secondary(130, 950, 1230, 58, '#cbb278', { charSpacing: 130 }),
    text('胶片规格装饰', '35', 1500, 752, 320, 210, '#353535', { fontWeight: 'bold', textAlign: 'right' }));
  return { background: '#101010', objects: o };
}

function vinyl() {
  const o = [ellipse('黑胶唱片', 112, 160, 720, 720, '#171919')];
  for (let diameter = 680; diameter >= 490; diameter -= 24) {
    o.push(ellipse(`唱片刻纹 ${diameter}`, 472 - diameter / 2, 520 - diameter / 2, diameter, diameter, null,
      { stroke: '#4d5451', strokeWidth: 2, opacity: .5 }));
  }
  o.push(poster(1, 262, 310, 420, 420, { mask: 'circle' }), ellipse('唱片中心孔', 462, 510, 20, 20, '#f0e6d7'),
    text('唱片眉题', 'SIDE A / COLLECTION 01', 910, 152, 860, 34, '#776b55', { charSpacing: 100 }),
    primary(904, 266, 850, 174, '#282d29'), secondary(914, 480, 820, 64, '#665a48', { charSpacing: 100 }),
    rect('唱片信息分隔', 914, 598, 836, 2, '#c5b79e'),
    poster(2, 930, 660, 218, 218, { mask: 'circle' }), poster(3, 1276, 660, 218, 218, { mask: 'circle' }),
    text('唱片序号 1', '01', 998, 918, 80, 36, '#665a48', { textAlign: 'center' }),
    text('唱片序号 2', '02', 1345, 918, 80, 36, '#665a48', { textAlign: 'center' }),
    text('唱片底注', 'PLAY YOUR COLLECTION', 128, 963, 640, 28, '#7e725f', { charSpacing: 90 }));
  return { background: '#f0e6d7', objects: o };
}

function editorial() {
  return { background: '#f7f5ef', objects: [
    text('画册刊名', 'SCREEN JOURNAL / 01', 88, 57, 1550, 32, '#67675e', { charSpacing: 130 }),
    primary(88, 127, 1120, 156, '#252722'), secondary(1300, 182, 520, 54, '#393c34', { textAlign: 'right', charSpacing: 80 }),
    rect('画册页眉线', 88, 304, 1744, 2, '#b3b6a7'),
    poster(1, 88, 350, 1080, 608), poster(2, 1220, 350, 248, 372), poster(3, 1526, 350, 248, 372),
    text('画册图注 1', 'STILL 01', 88, 986, 700, 28, '#67675e', { charSpacing: 90 }),
    text('画册图注 2', 'STILL 02', 1220, 749, 250, 28, '#67675e', { charSpacing: 60 }),
    text('画册图注 3', 'STILL 03', 1526, 749, 250, 28, '#67675e', { charSpacing: 60 }),
    text('画册编排装饰', 'CURATED\nFRAME BY FRAME', 1220, 828, 574, 56, '#31362e', { fontFamily: 'serif', lineHeight: 1.4 }),
  ] };
}

function orbital() {
  const o = [ellipse('主轨道', 172, 226, 1580, 608, null, { stroke: '#54707b', strokeWidth: 2, opacity: .55 }),
    ellipse('内轨道', 510, 124, 910, 836, null, { stroke: '#67878a', strokeWidth: 2, opacity: .3, strokeDashArray: [9, 17] }),
    text('星图眉题', 'ORBITAL COLLECTION', 104, 62, 1350, 30, '#8da6b9', { charSpacing: 160 })];
  const cards = [[440, 295, 270], [1060, 205, 250], [1510, 400, 340], [1280, 820, 300], [520, 820, 280]];
  cards.forEach(([cx, cy, d], i) => {
    o.push(ellipse(`卫星边框 ${i + 1}`, cx - d / 2 - 10, cy - d / 2 - 10, d + 20, d + 20, '#0d1833', { stroke: '#8faeac', strokeWidth: 2 }),
      poster(i + 1, cx - d / 2, cy - d / 2, d, d, { mask: 'circle' }));
  });
  for (const [x, y] of [[260, 660], [720, 360], [810, 140], [1430, 650], [1680, 765], [900, 898]])
    o.push(ellipse(`星图节点 ${x}`, x, y, 10, 10, '#acc5c1'));
  o.push(primary(960, 452, 660, 160, '#edf2ed', { originX: 'center', textAlign: 'center' }),
    secondary(960, 635, 660, 55, '#a8c6c4', { originX: 'center', textAlign: 'center', charSpacing: 120 }));
  return { background: '#0d1833', objects: o };
}

function montage() {
  return { background: '#101511', objects: [
    poster(1, 12, 12, 936, 516), poster(2, 972, 12, 936, 516),
    poster(3, 12, 552, 936, 516), poster(4, 972, 552, 936, 516),
    rect('四幕标题带', 0, 416, 1920, 248, '#15382d'),
    primary(960, 435, 1680, 146, '#faf6e8', { originX: 'center', textAlign: 'center' }),
    secondary(960, 606, 1660, 48, '#b8d0b6', { originX: 'center', textAlign: 'center', charSpacing: 190 }),
    rect('四幕章节签底', 46, 40, 454, 64, '#101511', { opacity: .86 }),
    text('四幕章节签', 'FOUR FRAMES / 01', 70, 57, 400, 29, '#faf6e8', { charSpacing: 90 }),
  ] };
}

function honeycomb() {
  const w = 320, h = Math.sqrt(3) * 160, cx = 1080, cy = 448;
  const centers = [[cx, cy], [cx - 240, cy - h / 2], [cx, cy - h], [cx + 240, cy - h / 2],
    [cx + 240, cy + h / 2], [cx, cy + h], [cx - 240, cy + h / 2]];
  const o = [text('蜂巢眉题', 'SEVEN FRAGMENTS / COLLECTION', 100, 60, 1560, 32, '#777258', { charSpacing: 100 }),
    text('蜂巢编号装饰', '07', 110, 272, 570, 330, '#e0d9bd', { fontWeight: 'bold' })];
  centers.forEach(([x, y], i) => {
    const pw = w - 12, ph = h - 12;
    o.push(poster(i + 1, x - pw / 2, y - ph / 2, pw, ph, { mask: 'hexagon' }));
  });
  o.push(rect('蜂巢底部分隔', 100, 897, 1720, 2, '#c4bba0'),
    primary(100, 920, 950, 124, '#31382d'), secondary(1170, 968, 650, 46, '#6b715d', { textAlign: 'right', charSpacing: 90 }));
  return { background: '#f5efda', objects: o };
}

const concepts = [
  ['ticket-stub', '票根收藏', '大幅票根纸面、左侧单张海报、右侧主副标题，带齿孔与编号装饰。', ticket],
  ['filmstrip', '胶片放映', '横贯画面的四格胶片与上下齿孔，底部大标题；四张图片按横向画幅裁切。', filmstrip],
  ['vinyl-sleeve', '黑胶唱片', '左侧唱片刻纹与圆形海报唱片标签，右侧标题和两枚独立圆形封面。', vinyl],
  ['editorial-spread', '影像画册', '上方刊物式大标题、左下横向主视觉、右侧双图与图注的杂志编排。', editorial],
  ['orbital-gallery', '轨道星图', '五枚圆形海报沿椭圆轨道分布，标题位于中央留白，带细线与星图节点。', orbital],
  ['four-frame-montage', '四幕蒙太奇', '四幅横向裁切画面铺满四角，中央横贯标题带，适合强调多部影片的分类封面。', montage],
  ['honeycomb', '蜂巢拼图', '七张六边形海报组成蜂巢，底部主副标题与浅色画册背景。', honeycomb],
];
await fs.mkdir(directory, { recursive: true });
await fs.mkdir(path.join(directory, 'packages'), { recursive: true });
const gallery = [];
for (const [index, [slug, name, description, make]] of concepts.entries()) {
  sequence = 0;
  const id = `d13c7000-6ea1-4c89-a5ba-${String(index + 1).padStart(12, '0')}`;
  const canvas = { version: '6.0.0', width: 1920, height: 1080,
    randomOnGeneration: false, randomBackgroundStyle: 'cinema-mesh', ...make() };
  const definition = { id, name, description, primaryTitle: '电影', secondaryTitle: 'MOVIES',
    previewFile: `${slug}.jpg`, samplePosters: [1, 2, 3, 4, 5, 6, 7, 8, 9], canvas };
  const objects = canvas.objects;
  assert.equal(new Set(objects.map(o => o.id)).size, objects.length, 'Layer IDs are unique');
  assert.ok(objects.some(o => o.textVar === '{{primary_title}}'));
  assert.ok(objects.some(o => o.textVar === '{{secondary_title}}'));
  assert.ok(objects.filter(o => o.posterVar).every(o => /^post[1-9]$/.test(o.posterVar)));
  const rendered = await renderLibraryCover(JSON.stringify(canvas), { title: '电影', primaryTitle: '电影', secondaryTitle: 'MOVIES' },
    artwork, { width: 1920, height: 1080, format: 'jpeg', quality: 93 });
  const info = await sharp(rendered).metadata();
  assert.equal(info.width, 1920); assert.equal(info.height, 1080);
  await fs.writeFile(path.join(directory, `${slug}.json`), JSON.stringify(definition, null, 2) + '\n');
  await fs.writeFile(path.join(directory, `${slug}.jpg`), rendered);
  const zip = new AdmZip();
  zip.addFile('template.json', Buffer.from(JSON.stringify({ name: `试作 · ${name}`, description, width: 1920, height: 1080,
    isPublic: false, canvasJson: JSON.stringify(canvas) }, null, 2)));
  zip.addFile('preview.jpg', await sharp(rendered).resize(480, 270).jpeg({ quality: 90 }).toBuffer());
  await fs.writeFile(path.join(directory, 'packages', `${slug}.zip`), zip.toBuffer());
  gallery.push({ id, slug, name, description, posterCount: objects.filter(o => o.posterVar).length });
}
await fs.writeFile(path.join(directory, 'catalog.json'), JSON.stringify({ version: 1, initialize: false, templates: gallery }, null, 2) + '\n');
const font = ['PingFang SC', 'Noto Sans CJK SC', 'Noto Sans CJK JP', 'Arial Unicode MS'].find(f => GlobalFonts.has(f)) || 'sans-serif';
const board = createCanvas(1920, 2536), ctx = board.getContext('2d');
ctx.fillStyle = '#101419'; ctx.fillRect(0, 0, 1920, 2536);
ctx.font = `bold 54px "${font}"`; ctx.fillStyle = '#f2f4ed'; ctx.fillText('七套实验模板', 64, 88);
ctx.font = `26px "${font}"`; ctx.fillStyle = '#a9b2ba'; ctx.fillText('1920 × 1080 · 可编辑 · 可导入导出 · 未加入默认初始化', 64, 140);
const composites = [];
for (const [index, item] of gallery.entries()) {
  const x = 64 + index % 2 * 922, y = 200 + Math.floor(index / 2) * 570;
  ctx.font = `bold 31px "${font}"`; ctx.fillStyle = '#edf0eb'; ctx.fillText(`${String(index + 1).padStart(2, '0')}  ${item.name}`, x, y + 38);
  const image = await sharp(path.join(directory, `${item.slug}.jpg`)).resize(884, 497).png().toBuffer();
  composites.push({ input: image, left: x, top: y + 60 });
}
ctx.font = `bold 48px "${font}"`; ctx.fillStyle = '#e1e7de'; ctx.fillText('选择你喜欢的风格', 1014, 2150);
ctx.font = `28px "${font}"`; ctx.fillStyle = '#9ba5a9'; ctx.fillText('七种独立构图与素材裁切', 1014, 2210);
ctx.fillText('在模板库打开“试作”系列继续编辑', 1014, 2270);
await fs.writeFile(path.join(directory, 'overview.jpg'), await sharp(board.toBuffer('image/png')).composite(composites).jpeg({ quality: 92 }).toBuffer());
const all = new AdmZip();
for (const item of gallery) all.addFile(`${item.slug}.zip`, await fs.readFile(path.join(directory, 'packages', `${item.slug}.zip`)));
await fs.writeFile(path.join(directory, 'seven-experimental-templates.zip'), all.toBuffer());
const escape = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
await fs.writeFile(path.join(directory, 'index.html'), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>七套实验模板 · CoverStudio</title><style>body{margin:0;background:#101419;color:#edf0eb;font:16px/1.6 system-ui}main{max-width:1600px;margin:auto;padding:40px 24px}h1{font-size:32px;margin:0 0 8px}p{color:#a9b2ba}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,540px),1fr));gap:28px}article{background:#1b2128;border:1px solid #333d45;border-radius:16px;overflow:hidden}img{width:100%;display:block;aspect-ratio:16/9}article div{padding:16px 20px}h2{margin:0}a{color:#a3d6b1}header{margin-bottom:30px}summary{cursor:pointer}details{margin-top:10px}</style><main><header><h1>七套实验模板</h1><p>1920 × 1080 · 可编辑 · 可导入导出 · 未加入默认初始化</p><a href="seven-experimental-templates.zip" download>下载七套模板包（解压后分别导入 ZIP）</a></header><section>${gallery.map((t, i) => `<article><a href="${t.slug}.jpg" target="_blank"><img src="${t.slug}.jpg" alt="${escape(t.name)}" loading="lazy"></a><div><h2>${i + 1}. ${escape(t.name)}</h2><p>${escape(t.description)}</p><a href="packages/${t.slug}.zip" download>下载可导入模板</a> · <a href="${t.slug}.json" download>设计源文件</a></div></article>`).join('')}</section></main></html>`);
assert.equal(createHash('sha256').update(await fs.readFile(defaultManifest)).digest('hex'), createHash('sha256').update(defaultBefore).digest('hex'));
console.log('Generated seven experimental designs; the default initialization manifest is unchanged.');
