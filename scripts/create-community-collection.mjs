import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { renderLibraryCover } from '../backend/src/services/renderer.service.ts';
import { requiredPosterCount } from '../backend/src/services/libraryCover.service.ts';

// Review/export only. No seeding, database writes, or media-server uploads.
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'backend/src/template/community-collection');
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const sharp = require('sharp'), AdmZip = require('adm-zip');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const manifest = path.join(root, 'backend/src/template/defaults/manifest.json');
const initialHash = createHash('sha256').update(await fs.readFile(manifest)).digest('hex');
const samples = await Promise.all(Array.from({ length: 9 }, (_, i) => fs.readFile(path.join(root, `backend/src/template/poster/${i + 1}.jpg`))));
const sizes = await Promise.all(samples.map(b => sharp(b).metadata()));
const backdrop = await fs.readFile(path.join(root, 'backend/src/template/poster/backdrop.jpg'));
let n = 0;
const base = { version: '6.0.0', opacity: 1, visible: true, scaleX: 1, scaleY: 1, angle: 0, strokeWidth: 0, originX: 'left', originY: 'top' };
const obj = (type, name, attrs) => ({ ...base, type, name, id: `collection-${++n}`, ...attrs });
const rect = (x,y,w,h,fill,attrs={}) => obj('Rect','装饰矩形',{left:x,top:y,width:w,height:h,fill,...attrs});
const ellipse = (x,y,w,h,fill,attrs={}) => obj('Ellipse','装饰椭圆',{left:x,top:y,width:w,height:h,rx:w/2,ry:h/2,fill,...attrs});
const poly = (x,y,w,h,points,fill,attrs={}) => obj('Polygon','几何装饰',{left:x,top:y,width:w,height:h,points:points.map(([a,b])=>({x:a*w,y:b*h})),pathOffset:{x:w/2,y:h/2},fill,...attrs});
const grad = (w,h,a,b,vertical=false) => ({type:'linear',gradientUnits:'pixels',coords:{x1:0,y1:0,x2:vertical?0:w,y2:vertical?h:0},colorStops:[{offset:0,color:a},{offset:1,color:b}]});
const text = (value,x,y,w,size,fill,attrs={}) => obj('Textbox','装饰文字',{left:x,top:y,width:w,height:Math.ceil(size*1.2),text:value,fontFamily:'sans-serif',fontSize:size,fontWeight:'normal',fill,textAlign:'left',fitText:true,lineHeight:1.16,...attrs});
const title = (x,y,w=800,size=170,color='#f1f0e7',attrs={}) => text('电影',x,y,w,size,color,{id:'primary-title',fontWeight:'bold',textVar:'{{primary_title}}',...attrs});
const sub = (x,y,w=800,size=56,color='#a8b8ba',attrs={}) => text('MOVIES',x,y,w,size,color,{id:'secondary-title',textVar:'{{secondary_title}}',charSpacing:100,...attrs});
const edge = (x,y,w,h,color,attrs={}) => rect(x,y,w,h,null,{stroke:color,strokeWidth:3,...attrs});
const caption = (value,x,y,w=800,color='#798b91') => text(value,x,y,w,30,color,{charSpacing:100});
const arch = [[0,1],[0,.32],...Array.from({length:17},(_,i)=>{const a=Math.PI+i*Math.PI/16;return[.5+.5*Math.cos(a),.32+.32*Math.sin(a)];}),[1,1]];
const starRaw = Array.from({length:10},(_,i)=>{const a=-Math.PI/2+i*Math.PI/5,r=i%2?.23:.5;return[.5+r*Math.cos(a),.5+r*Math.sin(a)];});
const starBounds = { x0:Math.min(...starRaw.map(p=>p[0])),x1:Math.max(...starRaw.map(p=>p[0])),y0:Math.min(...starRaw.map(p=>p[1])),y1:Math.max(...starRaw.map(p=>p[1])) };
const star = starRaw.map(([x,y])=>[(x-starBounds.x0)/(starBounds.x1-starBounds.x0),(y-starBounds.y0)/(starBounds.y1-starBounds.y0)]);
function image(slot,x,y,w,h,{radius=0,mask,angle=0,opacity=1}={}) {
  const s=sizes[slot-1],cw=Math.min(s.width,s.height*w/h),ch=cw*h/w;
  const im=obj('Image',`海报 ${slot}`,{posterVar:`post${slot}`,isPoster:true,src:`/api/templates/posters/${slot}.jpg`,crossOrigin:'anonymous',originX:'center',originY:'center',left:x+w/2,top:y+h/2,width:cw,height:ch,cropX:(s.width-cw)/2,cropY:(s.height-ch)/2,scaleX:w/cw,scaleY:h/ch,angle,opacity});
  const c={...base,originX:'center',originY:'center',left:0,top:0,width:cw,height:ch,fill:'#000000'};
  if(mask==='ellipse') im.clipPath={...c,type:'Ellipse',rx:cw/2,ry:ch/2};
  else if(mask) im.clipPath={...c,type:'Polygon',points:mask.map(([a,b])=>({x:a*cw,y:b*ch})),pathOffset:{x:cw/2,y:ch/2}};
  else if(radius) im.clipPath={...c,type:'Rect',rx:radius/im.scaleX,ry:radius/im.scaleY};
  return im;
}
function framed(slot,x,y,w,h,color='#eee8dc',margin=14,attrs={}) {
  const angle=attrs.angle||0;
  return [rect(x+w/2,y+h/2,w+margin*2,h+margin*2,color,{originX:'center',originY:'center',angle}),image(slot,x,y,w,h,attrs)];
}
const layout = (background,objects,extra={}) => ({background,objects,...extra});
const heading = (label,x=144,y=82,color='#8b9b9c') => caption(label,x,y,1600,color);
const centered = (y,size=156,color='#f0f1ea') => title(960,y,1600,size,color,{originX:'center',textAlign:'center'});
const centeredSub = (y,size=54,color='#97adb6') => sub(960,y,1600,size,color,{originX:'center',textAlign:'center',charSpacing:170});

const concepts = [
 ['layered-mats','层叠画框','纸面与展览',3,'暖纸色双重卡纸画框，大幅主图与两张右侧小图，右下标题。',()=>layout('#e7decb',[
  rect(86,92,792,886,'#53615d'),rect(112,118,740,834,'#f4eddd'),image(1,168,174,628,720),
  ...framed(2,1010,130,284,350,'#f5eee0',18),...framed(3,1434,130,284,350,'#f5eee0',18),
  caption('CURATED / PAPER & FRAME',1010,572,770,'#74694f'),title(1002,656,790,170,'#303c37'),sub(1014,864,780,58,'#74694f')])],
 ['cloud-bookmark','云端书签','纸面与展览',3,'粉蓝留白与中央书签长条，主图居中，两张圆形图片分居标题两侧。',()=>layout('#dbe8ed',[
  rect(778,0,364,1080,'#bdd4dc'),rect(766,0,12,1080,'#f5e5cb'),image(1,818,130,284,426,{radius:12}),
  image(2,166,434,280,280,{mask:'ellipse'}),image(3,1474,434,280,280,{mask:'ellipse'}),
  centered(652,164,'#253e4b'),centeredSub(852,56,'#526e7a'),heading('CLOUD / BOOKMARK',144,74,'#617d8a')])],
 ['capsule-views','胶囊视窗','纸面与展览',3,'三幅横向胶囊视窗按不同宽度上下展开，左側大标题与暖白背景。',()=>layout('#ecece1',[
  heading('SOFT WINDOWS',144,102,'#738273'),title(144,376,640,186,'#33463a'),sub(154,600,600,61,'#728674'),
  image(1,864,122,842,212,{radius:106}),image(2,970,430,770,212,{radius:106}),image(3,810,738,900,212,{radius:106}),
  rect(154,758,130,6,'#b59668')])],
 ['gallery-label','展签留白','纸面与展览',1,'右侧独立画作与下方展签，左侧大标题和细线，宽阔暖灰留白。',()=>layout('#e5e3da',[
  heading('THE PRIVATE GALLERY',144,102,'#7f8274'),...framed(1,1170,112,450,676,'#faf9f2',26),
  rect(1218,872,354,72,'#f7f5ec'),caption('WORK / 01',1244,889,300,'#777867'),
  title(144,326,860,196,'#293833'),sub(152,561,820,68,'#7c8274'),rect(154,730,746,2,'#adb4a7'),caption('COLLECT. WATCH. REPEAT.',154,782,780,'#7a8070')])],
 ['postage-trip','邮票旅行','纸面与展览',4,'四幅海报装入邮票齿孔边框，错落分布在蓝灰纸面，左上标题。',()=>{
  const o=[heading('POSTCARDS FROM YOUR LIBRARY',144,70,'#697d86'),title(144,176,900,160,'#294450'),sub(154,375,830,58,'#637d86')];
  [[1,140,580,274,342],[2,590,500,300,420],[3,1108,140,276,380],[4,1450,550,274,342]].forEach(([s,x,y,w,h])=>{
   o.push(rect(x-20,y-20,w+40,h+40,'#f7f2e7'),image(s,x,y,w,h));
   for(let a=0;a<8;a++)for(const yy of[y-26,y+h+14])o.push(ellipse(x-12+a*(w+24)/7,yy,14,14,'#cbd8de'));
   for(let a=1;a<8;a++)for(const xx of[x-26,x+w+14])o.push(ellipse(xx,y+a*h/8-7,14,14,'#cbd8de'));
  });return layout('#cbd8de',o);
 }],
 ['collage-notes','拼贴便笺','纸面与展览',3,'三张白边照片轻微交叠，便笺色标题区与手账式线条，照片均留在画布内。',()=>layout('#b6c8c2',[
  rect(112,550,760,432,'#ede1b8'),...framed(1,200,130,332,402,'#f6f0df',18,{angle:-7}),
  ...framed(2,660,176,390,468,'#f6f0df',22,{angle:6}),...framed(3,1226,168,430,590,'#f6f0df',22,{angle:-4}),
  title(170,674,640,158,'#38473b'),sub(180,864,600,52,'#6f755a'),caption('COLLAGE / 03',1200,889,650,'#546f65')])],
 ['aurora-tunnel','极光隧道','光影与电影',1,'重叠的青紫色矩形光门围绕单张海报，左侧大标题与暗蓝背景。',()=>{
  const o=[heading('INTO THE AURORA',144,94,'#6084a2'),title(144,366,650,184,'#eaf5f1'),sub(154,588,610,63,'#a2caca')];
  for(let i=0;i<7;i++)o.push(edge(822+i*34,94+i*35,1000-i*68,892-i*70,['#24515f','#35546d','#3e586f','#60649a','#498389','#5ca0a3','#8dc5bd'][i],{strokeWidth:5}));
  o.push(image(1,1060,290,524,552,{radius:5}));return layout('#091422',o);
 }],
 ['horizon-screen','地平银幕','光影与电影',1,'上方深蓝标题区域与下方宽幅影片背景，地平线亮色细带连接两部分。',()=>layout('#0c1827',[
  rect(0,0,1920,430,'#0c1827'),heading('HORIZON / SCREEN',144,62,'#91a9b9'),title(144,136,1250,182,'#f1f0df'),
  sub(1340,250,420,59,'#94bdbb',{textAlign:'right'}),rect(0,424,1920,10,'#a5c9c0'),
  rect(0,980,1920,100,'#0c1827'),caption('BEYOND THE FRAME',144,1008,1500,'#829dad')],{posterBackground:{source:'backdrop',blur:0,dim:.2}})],
 ['darkroom-diptych','摄影暗房','光影与电影',2,'两侧各一幅高对比大海报，中间窄幅标题区，暗房红色标识与黑色底面。',()=>layout('#121213',[
  image(1,120,156,476,714),image(2,1324,156,476,714),rect(672,198,576,686,'#232324'),
  title(960,398,552,177,'#f0ebe1',{originX:'center',textAlign:'center'}),sub(960,618,540,56,'#c18b82',{originX:'center',textAlign:'center'}),
  rect(834,754,252,5,'#a1453a'),heading('DARKROOM / TWO FRAMES',144,68,'#ad7770'),caption('01',124,929,400,'#8d8d88'),caption('02',1328,929,400,'#8d8d88')])],
 ['iris-lens','镜头光圈','光影与电影',1,'单张圆形海报置于十二瓣镜头光圈中，左侧大标题，石墨灰与铜色细线。',()=>{
  const o=[heading('FOCUS / THE COLLECTION',144,84,'#8c8980'),title(144,357,650,184,'#f2ede2'),sub(154,580,620,62,'#c7b089')];
  for(let i=0;i<12;i++){const a=i*Math.PI/6,cx=1320,cy=560;
   const pts=[[cx+370*Math.cos(a),cy+370*Math.sin(a)],[cx+470*Math.cos(a+.36),cy+470*Math.sin(a+.36)],[cx+300*Math.cos(a+.8),cy+300*Math.sin(a+.8)]];
   const minX=Math.min(...pts.map(p=>p[0])),minY=Math.min(...pts.map(p=>p[1])),w=Math.max(...pts.map(p=>p[0]))-minX,h=Math.max(...pts.map(p=>p[1]))-minY;
   o.push(poly(minX,minY,w,h,pts.map(p=>[(p[0]-minX)/w,(p[1]-minY)/h]),i%2?'#383b3c':'#272c2e',{stroke:'#5e625c',strokeWidth:2}));
  }
  o.push(ellipse(1000,240,640,640,'#a49172'),image(1,1018,258,604,604,{mask:'ellipse'}));return layout('#161c20',o);
 }],
 ['archive-drawers','档案抽屉','光影与电影',4,'四幅横向海报置于垂直叠放的抽屉中，左侧编号与大标题，深绿档案柜风格。',()=>{
  const o=[heading('ARCHIVE / FOUR DRAWERS',144,90,'#889d83'),title(144,337,680,186,'#e3e4cf'),sub(154,560,620,64,'#a9bea0'),text('04',144,782,360,160,'#4a5e4d',{fontWeight:'bold'})];
  for(let i=0;i<4;i++){const y=108+i*231;o.push(rect(912,y,880,190,'#384a3e',{rx:6,ry:6}),image(i+1,940,y+18,714,154,{radius:3}),rect(1708,y+42,44,106,'#9ea889'),text(`0${i+1}`,1712,y+78,36,25,'#293d30',{textAlign:'center'}));}return layout('#182a22',o);
 }],
 ['magazine-night','夜刊封面','光影与电影',4,'影片背景铺满封面，上方大刊名、右侧三张竖排选片，底部红色索引条。',()=>layout('#12161e',[
  rect(0,0,1920,1080,grad(1920,1080,'rgba(4,9,16,.8)','rgba(4,9,16,.16)')),
  title(144,92,1150,204,'#f3ebe0'),sub(154,336,1100,64,'#d6c7b7'),heading('THE NIGHT EDITION',144,22,'#9caaa9'),
  ...framed(2,1570,128,202,270,'#ede7db',6),...framed(3,1570,448,202,270,'#ede7db',6),...framed(4,1570,768,202,220,'#ede7db',6),
  rect(144,900,1190,98,'#9a4339'),caption('SCREEN / SCENE / SELECTION',172,930,1130,'#f4e7d6')],{posterBackground:{source:'backdrop',blur:0,dim:.16}})],
 ['triangular-quilt','三角拼版','几何与空间',6,'六张三角海报拼成三组上下呼应的图形，底部居中标题，浅杏色背景。',()=>{
  const o=[heading('TRIANGLES / SIX PIECES',144,66,'#937562')];
  for(let i=0;i<3;i++){const x=154+i*552;o.push(image(i*2+1,x,188,508,492,{mask:[[0,0],[1,0],[.5,1]]}),image(i*2+2,x,202,508,492,{mask:[[.5,0],[1,1],[0,1]]}));}
  o.push(centered(788,170,'#4b493d'),centeredSub(986,54,'#8d7d65'));return layout('#efddc4',o);
 }],
 ['arched-corridor','弧线长廊','几何与空间',4,'四扇等距拱形视窗组成长廊，上方大标题与细线，深墨绿底色。',()=>layout('#153b36',[
  title(144,74,1280,150,'#f3e7cb'),sub(1420,171,350,53,'#b5c6ae',{textAlign:'right'}),rect(144,282,1632,2,'#657e63'),
  ...Array.from({length:4},(_,i)=>image(i+1,154+i*424,386,330,574,{mask:arch})),
  ...Array.from({length:4},(_,i)=>caption(`WINDOW / 0${i+1}`,154+i*424,1001,330,'#829d80'))])],
 ['arch-courtyard','拱门广场','几何与空间',4,'右侧一扇巨大的拱门主图，左侧三扇小窗，暖白标题与砖红庭院。',()=>layout('#864d40',[
  heading('COURTYARD / COLLECTION',144,78,'#dcbba7'),title(144,197,880,172,'#f6e9d6'),sub(154,406,820,59,'#d7bca4'),
  image(1,1164,120,594,864,{mask:arch}),image(2,144,678,240,286,{mask:arch}),image(3,452,602,240,362,{mask:arch}),image(4,760,678,240,286,{mask:arch}),
  rect(144,546,860,3,'#af7865')])],
 ['gem-facets','宝石切面','几何与空间',4,'四幅三角切面组成一枚大菱形宝石，左侧标题，深紫色与香槟色线条。',()=>layout('#241b35',[
  heading('FACETS / CUT & CURATE',144,94,'#a592ae'),title(144,382,650,185,'#efe7df'),sub(154,606,610,62,'#c1aecd'),
  image(1,824,174,492,700,{mask:[[1,0],[1,1],[0,.5]]}),image(2,1322,174,492,700,{mask:[[0,0],[1,.5],[0,1]]}),
  image(3,1070,174,492,350,{mask:[[.5,0],[1,1],[0,1]]}),image(4,1070,530,492,350,{mask:[[0,0],[1,0],[.5,1]]}),
  caption('FOUR FACETS',1030,956,690,'#8e7f9d')])],
 ['pulse-grid','网格脉冲','几何与空间',6,'六幅小海报落在细线网格的不同节点，错落分布，左下紫色标题区域。',()=>{
  const o=[];for(let x=110;x<1820;x+=170)o.push(rect(x,80,1,910,'#29334a'));for(let y=80;y<1030;y+=130)o.push(rect(110,y,1700,1,'#29334a'));
  o.push(rect(100,620,720,330,'#30263f'),title(144,692,630,170,'#eee3ef'),sub(154,896,610,50,'#bc9cbe'));
  [[1,148,150,256,368],[2,528,112,252,378],[3,924,260,252,378],[4,1450,106,286,390],[5,1026,720,280,236],[6,1510,632,250,320]].forEach(([s,x,y,w,h])=>o.push(edge(x-5,y-5,w+10,h+10,'#987bba'),image(s,x,y,w,h)));
  return layout('#0e1727',o);
 }],
 ['checker-gallery','黑白棋盘','几何与空间',4,'两侧交错的黑白方格嵌入四幅海报，中央标题穿过棋盘留白。',()=>{
  const o=[];for(let i=0;i<3;i++)for(let j=0;j<3;j++){o.push(rect(0+i*250,165+j*250,250,250,(i+j)%2?'#252b2c':'#e9e5d8'));o.push(rect(1170+i*250,165+j*250,250,250,(i+j)%2?'#e9e5d8':'#252b2c'));}
  o.push(image(1,10,175,230,230),image(2,510,675,230,230),image(3,1180,175,230,230),image(4,1680,675,230,230),
   title(960,391,460,165,'#eee9db',{originX:'center',textAlign:'center'}),sub(960,612,446,52,'#b8c5c5',{originX:'center',textAlign:'center'}),heading('CHECK / UNCHECK',144,58,'#a5b5b6'));return layout('#16272a',o);
 }],
 ['interleaved-spines','交错书脊','编排与收藏',6,'六张高窄海报组成书脊序列，海报顶边参差，底部大标题与暖木色。',()=>{
  const o=[heading('SHELF / SIX SPINES',144,69,'#997e5e')];
  [[1,164,266,208,414],[2,420,170,208,510],[3,676,218,208,462],[4,932,124,208,556],[5,1188,250,208,430],[6,1444,194,208,486]].forEach(([s,x,y,w,h])=>o.push(image(s,x,y,w,h),rect(x,y+h+12,w,8,'#79634a')));
  o.push(rect(144,718,1632,12,'#b18b55'),title(144,785,1190,170,'#3a4134'),sub(1420,889,340,53,'#7a7158',{textAlign:'right'}));return layout('#e6d1af',o);
 }],
 ['screen-calendar','电影日历','编排与收藏',7,'一张大海报与六格选片日历并排，绿色章节标签，标题位于上方。',()=>{
  const o=[title(144,78,1270,160,'#f1efdb'),sub(1420,180,350,50,'#a1c2b4',{textAlign:'right'}),image(1,144,330,418,628,{radius:6})];
  for(let i=0;i<6;i++){const x=690+(i%3)*362,y=330+Math.floor(i/3)*352;o.push(rect(x,y,318,44,'#456052'),caption(`SELECT / 0${i+2}`,x+16,y+6,285,'#d6ddc3'),image(i+2,x,y+44,318,246,{radius:3}));}
  return layout('#183f33',o);
 }],
 ['numbered-poster','编号海报','编排与收藏',1,'大号章节数字与主副标题组成左侧字版，单张海报压住数字末端，深蓝与铜色。',()=>layout('#142739',[
  heading('INDEX / PRIVATE CINEMA',144,83,'#94a7b0'),title(144,224,1020,192,'#eee6d5'),sub(154,454,940,68,'#c1a37c'),
  text('01',130,594,1010,330,'#314d60',{fontWeight:'bold'}),...framed(1,1214,148,470,706,'#967d5e',10),
  rect(1182,914,530,3,'#a59473'),caption('CHAPTER ONE',1220,956,470,'#acaf9a')])],
 ['parallel-pages','双页对照','编排与收藏',2,'两幅等宽方形画面并列，双色页底，顶部主标题与下方对应图注。',()=>layout('#ebe3d6',[
  rect(960,0,960,1080,'#c6d2c8'),title(144,58,1120,168,'#324337'),sub(1320,155,458,54,'#677b69',{textAlign:'right'}),
  image(1,144,350,726,540),image(2,1050,350,726,540),caption('LEFT / 01',144,948,700,'#8b795f'),caption('RIGHT / 02',1050,948,700,'#657c6d'),rect(958,330,4,650,'#f5f0e4')])],
 ['modular-board','模块仪表','编排与收藏',4,'大幅纵向主图与右側三幅小图组成模块面板，标题与编号有独立的边框区域。',()=>layout('#1c2930',[
  ...framed(1,144,170,474,710,'#435761',10),edge(712,132,1064,330,'#50636b'),title(754,186,970,150,'#e9e7d8'),sub(764,366,936,57,'#a7b9b1'),
  image(2,726,550,310,338),image(3,1096,550,310,338),image(4,1466,550,310,338),
  ...[726,1096,1466].map((x,i)=>caption(`MODULE / 0${i+2}`,x,940,310,'#8ea4a3')),heading('MODULAR / SCREEN',144,66,'#79979e')])],
 ['vertical-scroll','竖幅画卷','编排与收藏',4,'右侧长幅海报装入画卷，左侧标题与三幅横向小图，深棕与旧纸色边框。',()=>layout('#382e28',[
  rect(1160,94,574,914,'#d8bd8f'),rect(1124,70,646,44,'#8f7657',{rx:20,ry:20}),rect(1124,968,646,44,'#8f7657',{rx:20,ry:20}),image(1,1204,140,486,810),
  title(144,190,870,181,'#ead7af'),sub(154,408,830,64,'#bda880'),rect(154,546,758,2,'#7d684d'),
  image(2,154,684,224,238,{radius:5}),image(3,426,684,224,238,{radius:5}),image(4,698,684,224,238,{radius:5}),heading('SCROLL / THE COLLECTION',144,84,'#a99272')])],
 ['porthole-pair','星际舷窗','柔光与想象',2,'两扇大圆舷窗和金属环组成双视野，标题位于底部，深蓝背景与银灰色边框。',()=>layout('#101c2a',[
  heading('TWO WINDOWS / DEEP SPACE',144,78,'#8092a2'),ellipse(248,184,572,572,'#6c7b8b'),ellipse(1100,184,572,572,'#6c7b8b'),
  ellipse(266,202,536,536,'#263b4d'),ellipse(1118,202,536,536,'#263b4d'),image(1,282,218,504,504,{mask:'ellipse'}),image(2,1134,218,504,504,{mask:'ellipse'}),
  title(144,846,1140,154,'#e2e6e4'),sub(1430,940,340,52,'#8eb7c0',{textAlign:'right'})])],
 ['ripple-space','涟漪留白','柔光与想象',1,'小圆形主图置于大幅涟漪线条中，底部居中标题，浅绿留白。',()=>{
  const o=[];for(let i=0;i<6;i++)o.push(ellipse(960-(194+i*74),408-(194+i*35),388+i*148,388+i*70,null,{stroke:'#a6c0b6',strokeWidth:2,opacity:.65}));
  o.push(image(1,806,254,308,308,{mask:'ellipse'}),centered(755,176,'#315e53'),centeredSub(965,54,'#6f9785'),heading('RIPPLE / A QUIET SCREEN',144,76,'#749689'));return layout('#dde8d6',o);
 }],
 ['floating-islands','银色浮岛','柔光与想象',3,'一幅宽椭圆主图悬浮在上方，两幅小椭圆分列底部标题两侧，浅灰银色底光。',()=>layout('#cbd0d4',[
  heading('FLOATING / THREE ISLANDS',144,65,'#758288'),ellipse(334,166,1252,422,'#97a6ac'),image(1,350,182,1220,390,{mask:'ellipse'}),
  image(2,150,710,340,216,{mask:'ellipse'}),image(3,1430,710,340,216,{mask:'ellipse'}),
  title(960,710,860,169,'#263c44',{originX:'center',textAlign:'center'}),centeredSub(922,54,'#6a838b')])],
 ['retro-console','复古终端','柔光与想象',3,'终端式标题窗口与底部三幅宽图，灰黑背景、绿色状态线和简洁坐标装饰。',()=>layout('#182120',[
  edge(110,104,1700,836,'#647b67'),rect(110,104,1700,58,'#314d3c'),caption('SCREEN / COLLECTION / READY',142,119,1630,'#b5d2af'),
  text('>',144,284,100,156,'#82b378',{fontWeight:'bold'}),title(300,258,1410,188,'#dce8cc'),sub(310,484,1390,58,'#98b99d'),
  ...Array.from({length:3},(_,i)=>image(i+1,154+i*555,650,502,230,{radius:2})),caption('END OF SELECTION',144,985,1600,'#7b9a7c')])],
 ['starlight-badge','星光徽章','柔光与想象',5,'主海报裁成五角星徽章，四张小图点缀两侧，上方大标题，深绿与浅金色。',()=>layout('#15322e',[
  centered(72,163,'#f1e6bf'),centeredSub(273,54,'#a0b29a'),poly(612,366,696,660,star,'#b59b65'),image(1,636,390,648,612,{mask:star}),
  image(2,156,398,236,260,{radius:18}),image(3,268,750,236,246,{radius:18}),image(4,1528,398,236,260,{radius:18}),image(5,1416,750,236,246,{radius:18})])],
];
assert.equal(concepts.length,29);
assert.equal(new Set(concepts.map(t=>t[1])).size,29);
await fs.mkdir(path.join(out,'packages'),{recursive:true});
const real=[];
if(process.env.LCS_COLLECTION_ARTWORK_DIR)for(const name of ['Anime','TV']){
  const dir=path.join(process.env.LCS_COLLECTION_ARTWORK_DIR,name),info=JSON.parse(await fs.readFile(path.join(dir,'info.json'),'utf8'));
  const posters=await Promise.all(Array.from({length:9},(_,i)=>fs.readFile(path.join(dir,`post${i+1}.bin`))));
  let bg;try{bg=await fs.readFile(path.join(dir,'backdrop.bin'));}catch(e){if(e.code!=='ENOENT')throw e;}
  real.push({name,info,posters,bg});await fs.mkdir(path.join(out,'real',name),{recursive:true});
}
const metadata={version:'1.0.0',author:{name:'HappyQuQu',url:'https://github.com/HappyQuQu'},minAppVersion:'1.5.0',changelog:'首次发布；可编辑的画布图层、媒体库标题变量与海报变量。'};
const catalog=[];
for(const[index,[slug,name,group,count,description,make]]of concepts.entries()){
  n=0;const id=`d13c7002-6ea1-4c89-a5ba-${String(index+1).padStart(12,'0')}`;
  const canvas={version:'6.0.0',width:1920,height:1080,randomOnGeneration:false,randomBackgroundStyle:'cinema-mesh',...make()};
  assert.equal(new Set(canvas.objects.map(o=>o.id)).size,canvas.objects.length);
  assert.equal(requiredPosterCount(JSON.stringify(canvas)),count);
  for(const variable of ['{{primary_title}}','{{secondary_title}}'])assert.equal(canvas.objects.filter(o=>o.textVar===variable).length,1);
  for(const o of canvas.objects.filter(o=>o.type==='Image')){
    const w=o.width*o.scaleX,h=o.height*o.scaleY,a=o.angle*Math.PI/180,bw=Math.abs(w*Math.cos(a))+Math.abs(h*Math.sin(a)),bh=Math.abs(h*Math.cos(a))+Math.abs(w*Math.sin(a));
    assert.ok(o.left-bw/2>=0&&o.left+bw/2<=1920&&o.top-bh/2>=0&&o.top+bh/2<=1080,`${name}: image outside canvas`);
  }
  const data={...metadata,name:`精选 · ${name}`,description,width:1920,height:1080,isPublic:false,canvasJson:JSON.stringify(canvas)};
  const def={...metadata,id,name,group,description,primaryTitle:'电影',secondaryTitle:'MOVIES',previewFile:`${slug}.jpg`,samplePosters:[1,2,3,4,5,6,7,8,9],canvas};
  const preview=await renderLibraryCover(data.canvasJson,{title:'电影',primaryTitle:'电影',secondaryTitle:'MOVIES'},samples,{width:1920,height:1080,format:'jpeg',quality:93,backdropBuffer:backdrop});
  const previewInfo=await sharp(preview).metadata();assert.deepEqual([previewInfo.width,previewInfo.height],[1920,1080]);
  await fs.writeFile(path.join(out,`${slug}.json`),JSON.stringify(def,null,2)+'\n');await fs.writeFile(path.join(out,`${slug}.jpg`),preview);
  const zip=new AdmZip();zip.addFile('template.json',Buffer.from(JSON.stringify(data,null,2)));zip.addFile('preview.jpg',await sharp(preview).resize(480,270).jpeg({quality:90}).toBuffer());
  await fs.writeFile(path.join(out,'packages',`${slug}.zip`),zip.toBuffer());
  for(const r of real){const rendered=await renderLibraryCover(data.canvasJson,{title:r.name,primaryTitle:r.info.primaryTitle,secondaryTitle:r.info.secondaryTitle},r.posters,{width:1920,height:1080,format:'jpeg',quality:93,backdropBuffer:r.bg});await fs.writeFile(path.join(out,'real',r.name,`${slug}.jpg`),rendered);}
  catalog.push({id,slug,name,group,description,posterCount:count});
}
await fs.writeFile(path.join(out,'catalog.json'),JSON.stringify({version:1,initialize:false,templates:catalog},null,2)+'\n');
const font=['PingFang SC','Noto Sans CJK SC','Noto Sans CJK JP','Arial Unicode MS'].find(f=>GlobalFonts.has(f))||'sans-serif';
const groups=[...new Set(catalog.map(t=>t.group))];
for(const[groupIndex,group]of groups.entries()){
  const items=catalog.filter(t=>t.group===group),h=200+Math.ceil(items.length/2)*568;
  for(const set of ['sample',...(real.some(r=>r.name==='Anime')?['Anime']:[])]){
    const board=createCanvas(1920,h),ctx=board.getContext('2d');ctx.fillStyle='#10151d';ctx.fillRect(0,0,1920,h);ctx.font=`bold 50px "${font}"`;ctx.fillStyle='#e9ece8';ctx.fillText(group,64,82);
    ctx.font=`26px "${font}"`;ctx.fillStyle='#8d9dab';ctx.fillText(set==='sample'?'新增 29 套系列 · 可编辑图层 · 1920 × 1080':`Jellyfin Anime 真实素材 · 新增 29 套系列`,64,132);
    const layers=[];for(const[i,t]of items.entries()){const x=64+i%2*922,y=178+Math.floor(i/2)*568;ctx.font=`bold 30px "${font}"`;ctx.fillStyle='#e9ece8';ctx.fillText(`${String(catalog.indexOf(t)+22).padStart(2,'0')}  ${t.name}`,x,y+34);const dir=set==='sample'?out:path.join(out,'real',set);layers.push({input:await sharp(path.join(dir,`${t.slug}.jpg`)).resize(884,497).png().toBuffer(),left:x,top:y+54});}
    await fs.writeFile(path.join(out,`group-${groupIndex+1}-${set}.jpg`),await sharp(board.toBuffer('image/png')).composite(layers).jpeg({quality:94}).toBuffer());
  }
}
const overview=createCanvas(2400,3550),oc=overview.getContext('2d');oc.fillStyle='#10151d';oc.fillRect(0,0,2400,3550);oc.fillStyle='#edf0e9';oc.font=`bold 62px "${font}"`;oc.fillText('新增 29 套 · 模板商店 50 套',72,96);oc.font=`30px "${font}"`;oc.fillStyle='#90a4b7';oc.fillText('五组风格 · 1–7 张海报 · 可编辑 · 按需下载',72,153);const tiles=[];
for(const[i,t]of catalog.entries()){const x=72+i%4*576,y=220+Math.floor(i/4)*409;oc.font=`bold 27px "${font}"`;oc.fillStyle='#edf0e9';oc.fillText(`${i+22}  ${t.name}`,x,y+31);tiles.push({input:await sharp(path.join(out,`${t.slug}.jpg`)).resize(528,297).png().toBuffer(),left:x,top:y+51});}
await fs.writeFile(path.join(out,'overview.jpg'),await sharp(overview.toBuffer('image/png')).composite(tiles).jpeg({quality:94}).toBuffer());
const all=new AdmZip();for(const t of catalog)all.addFile(`${t.slug}.zip`,await fs.readFile(path.join(out,'packages',`${t.slug}.zip`)));await fs.writeFile(path.join(out,'collection-29.zip'),all.toBuffer());
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
await fs.writeFile(path.join(out,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>新增29套模板</title><style>body{margin:0;background:#10151d;color:#edf0e9;font:16px/1.6 system-ui}main{max-width:1600px;margin:auto;padding:40px 24px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,490px),1fr));gap:26px}article{background:#1b2632;border:1px solid #324452;border-radius:14px;overflow:hidden}img{display:block;width:100%;aspect-ratio:16/9}article div{padding:18px}a{color:#a3d6cd}p{color:#95a9b9}h2{margin:0}header{margin-bottom:30px}</style><main><header><h1>新增 29 套模板</h1><p>五组风格 · 可编辑 · 不参与默认初始化</p><a href="collection-29.zip">下载合集（解压后分别导入）</a></header>${groups.map((g,i)=>`<h2>${esc(g)}</h2><p><a href="group-${i+1}-sample.jpg">查看本组总览</a>${real.length?` · <a href="group-${i+1}-Anime.jpg">真实素材效果</a>`:''}</p><section>${catalog.filter(t=>t.group===g).map(t=>`<article><a href="${t.slug}.jpg"><img src="${t.slug}.jpg" alt="${esc(t.name)}"></a><div><h2>${esc(t.name)}</h2><p>${esc(t.description)}</p><a href="packages/${t.slug}.zip">下载模板</a>${real.map(r=>` · <a href="real/${r.name}/${t.slug}.jpg">${r.name} 实景</a>`).join('')}</div></article>`).join('')}</section>`).join('')}</main></html>`);
assert.equal(createHash('sha256').update(await fs.readFile(manifest)).digest('hex'),initialHash);
console.log(JSON.stringify({created:catalog.length,groups:groups.length,previewCount:catalog.length*(1+real.length),initialize:false}));
