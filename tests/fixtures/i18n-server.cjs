/** Disposable i18n browser fixture. Binds loopback, uses in-memory data and bundled
 * artwork, and never calls media servers, GitHub or AI providers. See doc/I18n_QA.md. */
const {createRequire}=require('node:module');
const req=createRequire(process.cwd()+'/backend/package.json');
const express=req('express'), AdmZip=req('adm-zip'), CronExpressionParser=req('cron-parser').CronExpressionParser;
const app=express();app.use(express.json({limit:'12mb'}));
const requests=[];
// Inspect request counts and user-entered fields without storing credentials or image bodies.
const redact=(key,value)=>/password|apiKey|authorization|token/i.test(key)?'[redacted]':key==='dataUrl'?'[image]':value;
app.get('/__i18n/requests',(req,res)=>res.json(JSON.parse(JSON.stringify(requests,redact))));
app.get('/__i18n/template.zip',(req,res)=>res.type('application/zip').send(zip.toBuffer()));

app.use((req,res,next)=>{if(req.path.startsWith('/api/')){requests.push({method:req.method,path:req.path,body:req.body});}next();});
const now='2026-10-14T04:00:00+08:00';
let servers=[{id:'server-fixture',name:'家庭影院 · Demo',type:'jellyfin',url:'http://192.0.2.10:8096',isActive:true,createdAt:now}];
let templates=[{id:'template-fixture',name:'柔彩扇形 · Demo',description:'保留模板原始说明',width:1920,height:1080,isDefault:true,isLocked:true,canManage:true,version:'1.0.0',createdAt:now,updatedAt:now}];
const nextRun=expression=>expression?CronExpressionParser.parse(expression,{tz:'Asia/Shanghai',currentDate:now}).next().toISOString():null;
const tasks=[{id:'task-fixture',name:'每周封面更新 · Demo',serverId:'server-fixture',isEnabled:true,lastRunAt:now}];
const zip=new AdmZip();zip.addFile('template.json',Buffer.from(JSON.stringify({name:'导入设计 · Demo',width:1920,height:1080,canvasJson:JSON.stringify({objects:[]})})));zip.addFile('preview.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64'));

const error=(res,code,message,status=400)=>res.status(status).json({error:{code,message}});
app.post('/api/auth/login',(req,res)=>req.body.username==='bad-fixture'?error(res,'INVALID_CREDENTIALS','Invalid credentials',401):res.json({user:{id:'fixture-user',username:req.body.username,role:req.body.username==='admin-fixture'?'admin':'user'},token:'fixture-only',refreshToken:'fixture-only-refresh'}));
app.post('/api/auth/register',(req,res)=>res.json({user:{id:'fixture-user',username:req.body.username,role:'user'},token:'fixture-only',refreshToken:'fixture-only-refresh'}));
app.get('/api/servers',(req,res)=>res.json(servers));
app.post('/api/servers',(req,res)=>{if(req.body.name.includes('fail'))return error(res,'MEDIA_AUTH_FAILED','媒体服务器拒绝访问');const server={...req.body,id:'server-'+Date.now(),createdAt:now,isActive:true};delete server.apiKey;servers.push(server);res.status(201).json(server);});
app.delete('/api/servers/:id',(req,res)=>{servers=servers.filter(s=>s.id!==req.params.id);res.json({});});
app.post('/api/servers/:id/test',(req,res)=>res.json({connected:true,version:'10.11.0',serverName:'Demo'}));
app.get('/api/servers/:id/libraries',(req,res)=>res.json([{id:'movies',name:'电影库 · Demo',type:'movies',itemCount:1000},{id:'series',name:'剧集库 · Demo',type:'tvshows',itemCount:1}]));
app.get('/api/templates',(req,res)=>res.json(templates));
app.post('/api/templates/:id/duplicate',(req,res)=>{const base=templates.find(t=>t.id===req.params.id);const copy={...base,id:'copy-'+Date.now(),name:base.name+' · 副本',isLocked:false,isDefault:false};templates.push(copy);res.json(copy);});
app.post('/api/templates/:id/lock',(req,res)=>{Object.assign(templates.find(t=>t.id===req.params.id),req.body);res.json({});});
app.delete('/api/templates/:id',(req,res)=>{templates=templates.filter(t=>t.id!==req.params.id);res.json({});});
app.get('/api/templates/:id/export',(req,res)=>res.set({'Content-Type':'application/zip','Content-Disposition':'attachment; filename="template.zip"'}).send(zip.toBuffer()));
app.post('/api/templates/import',express.raw({type:()=>true,limit:'64mb'}),(req,res)=>{if(req.body.includes(Buffer.from('i18n-broken.zip')))return error(res,'INVALID_TEMPLATE','ZIP 根目录缺少 template.json');const template={...templates[0],id:'import-'+Date.now(),name:'导入设计 · Demo',isDefault:false,isLocked:false};templates.push(template);res.json({...template,fonts:[{name:'FixtureFont',action:'installed'}]});});

app.get('/api/stats',(req,res)=>res.json({monthlyGenerated:1234}));

app.get('/api/fonts',(req,res)=>res.json({fonts:[]}));
app.get('/api/logs',(req,res)=>res.json([]));
app.get('/api/users',(req,res)=>res.json([{id:'fixture-user',username:'admin-fixture',role:'admin',createdAt:now}]));
app.post('/api/auth/stream-ticket',(req,res)=>res.json({ticket:'fixture-ticket'}));

app.get('/api/system/releases',(req,res)=>res.json({currentVersion:'1.8.1',latestVersion:'1.8.2',updateAvailable:true,checkedAt:now,stale:false,checkSource:'github-api',releases:[{version:'1.8.2',name:'Release',publishedAt:now,notes:'## 更新内容\n- 保留发布说明原文',url:'https://github.com/HappyQuQu/library-cover-studio/releases'}]}));


const fs=require('node:fs'),path=require('node:path');
const root=process.cwd();
const design=JSON.parse(fs.readFileSync(path.join(root,'backend/src/template/defaults/tilted-wall.json'),'utf8'));
const previewPath=path.join(root,'backend/src/template/defaults',design.previewFile);
Object.assign(templates[0],{name:design.name+' · 测试设计',canvasJson:JSON.stringify(design.canvas),isLocked:false,isDefault:false,isPublic:false,width:1920,height:1080,thumbnailPath:'preview.jpg',author:{name:'原始作者'},changelog:'保留原始更新说明'});
Object.assign(tasks[0],{type:'scheduled',cronExpression:'7 4 * * 1',timezone:'Asia/Shanghai',nextRunAt:'2026-10-18T20:07:00.000Z',libraryConfigs:JSON.stringify([{libraryId:'movies',libraryName:'电影库 · Demo',libraryType:'movies',templateId:templates[0].id,primaryTitle:'电影精选',secondaryTitle:'MOVIES',sortBy:'DateCreated',enabled:true}])});
app.use('/api/templates/posters',express.static(path.join(root,'backend/src/template/poster')));
const image=(req,res)=>res.type('image/jpeg').sendFile(previewPath);
app.get('/api/templates/:id', (req,res)=>res.json(templates.find(t=>t.id===req.params.id)));
app.get(['/api/templates/:id/thumbnail','/api/templates/:id/history/:revision/thumbnail'],image);
app.get('/api/templates/:id/history',(req,res)=>res.json({limit:50,revisions:[{id:'rev-new',name:'保存的中文设计',width:1920,height:1080,createdAt:now,kind:'save',previewUrl:'/api/templates/template-fixture/history/rev-new/thumbnail',version:'1.0.0'},{id:'rev-old',name:'初始设计',width:1920,height:1080,createdAt:'2026-10-12T20:00:00Z',kind:'baseline',previewUrl:'/api/templates/template-fixture/history/rev-old/thumbnail',version:'1.0.0'}]}));
app.post('/api/templates/:id/history/:revision/restore',(req,res)=>res.json({template:templates.find(t=>t.id===req.params.id)}));
app.put('/api/templates/:id',(req,res)=>{const template=templates.find(t=>t.id===req.params.id);Object.assign(template,req.body,{updatedAt:new Date().toISOString()});res.json(template);});
app.get('/api/tasks',(req,res)=>res.json(tasks));
app.post('/api/tasks/preview-schedule',(req,res)=>{
 try {
  const schedule=CronExpressionParser.parse(req.body.cronExpression,{tz:'Asia/Shanghai',currentDate:'2026-10-14T04:00:00+08:00'});
  res.json({timezone:'Asia/Shanghai',executions:Array.from({length:3},()=>schedule.next().toISOString())});
 } catch { res.status(400).json({error:'原始 Cron 校验诊断',code:'INVALID_SCHEDULE',timezone:'Asia/Shanghai'}); }
});
app.post('/api/tasks/preview-cover',(req,res)=>{if(req.body.primaryTitle==='FAIL')return error(res,'NO_POSTERS','原始错误：媒体库中没有可用海报');res.json({image:'data:image/jpeg;base64,'+fs.readFileSync(previewPath).toString('base64'),posterCount:2,noteCode:'POSTERS_REUSED',noteParams:{count:2},note:'使用 2 张可用海报，重复填充其余位置'});});
app.post('/api/tasks',(req,res)=>{const task={...req.body,id:'task-'+Date.now(),timezone:'Asia/Shanghai',nextRunAt:nextRun(req.body.cronExpression)};tasks.push(task);res.status(201).json(task);});
app.put('/api/tasks/:id',(req,res)=>{const task=tasks.find(t=>t.id===req.params.id);Object.assign(task,req.body,{nextRunAt:nextRun(req.body.cronExpression)});res.json(task);});
app.post('/api/tasks/:id/run',(req,res)=>res.json({message:'started'}));
app.post('/api/tasks/:id/toggle',(req,res)=>{const task=tasks.find(t=>t.id===req.params.id);task.isEnabled=!task.isEnabled;res.json(task);});
app.get('/api/tasks/:id/logs',(req,res)=>res.json([{id:'run-1',taskId:req.params.id,status:'completed',itemsProcessed:1,itemsFailed:1,startedAt:now,completedAt:'2026-10-14T04:00:59.600+08:00',errorMessage:'这是保留的原始诊断',covers:[{id:'cover-1',libraryId:'movies',libraryName:'电影库 · Demo',templateName:design.name,status:'uploaded',width:1920,height:1080,imageUrl:'/tasks/task-fixture/logs/run-1/covers/cover-1/image',thumbnailUrl:'/tasks/task-fixture/logs/run-1/covers/cover-1/image'},{id:'cover-2',libraryId:'series',libraryName:'剧集库 · Demo',templateName:design.name,status:'failed',errorMessage:'保留的上传错误原文',imageUrl:null}]}]));
app.get('/api/tasks/:task/logs/:log/covers/:cover/image',image);
app.get('/api/template-store',(req,res)=>{const count=13,pageSize=Number(req.query.pageSize)||24,page=Number(req.query.page)||1;let rows=Array.from({length:count},(_,index)=>({id:'store-'+index,revision:'rev-fixture',name:'社区设计 '+(index+1),description:'保留社区模板说明原文',width:1920,height:1080,downloadCount:index+1,installedTemplateId:null,version:'2.0.0',author:{name:'作者原名'},changelog:'社区更新记录原文',compatible:true,updateAvailable:index===0,previousTemplateId:index===0?'template-fixture':null,installedVersion:'1.0.0',updateMode:'replace',localMatch:false,localLocked:false,localModified:true,countPending:false,countLive:true}));if(req.query.q)rows=rows.filter(t=>t.name.includes(String(req.query.q)));res.json({repositoryUrl:'https://github.com/HappyQuQu/library-cover-store',generatedAt:now,stale:false,setupRequired:false,pendingCount:1,total:rows.length,page,pageSize,totalPages:Math.max(1,Math.ceil(rows.length/pageSize)),templates:rows.slice((page-1)*pageSize,page*pageSize)});});
app.get('/api/template-store/:id/preview',image);
app.post(['/api/template-store/:id/install','/api/template-store/:id/update'],(req,res)=>res.json({id:'template-fixture',action:req.path.endsWith('update')?'updated':'installed',alreadyInstalled:false,backupId:req.body.strategy==='backup'?'backup':undefined,fonts:[{action:'installed'}]}));

const settingsState={'rendering.outputFormat':'PNG','rendering.outputQuality':'90','rendering.concurrency':'3','history.maxRuns':'50','history.maxDays':'30','storage.savePosters':'false','storage.saveCovers':'false','ai.systemPrompt':'保留的系统提示词 · do not translate'};
let networkState={mode:'environment',proxyUrl:'',hasCredentials:false};
let providers=[{id:'provider-fixture',name:'测试 AI 服务 · 原名',type:'custom',apiUrl:'http://127.0.0.1:3199/fixture-ai',model:'vision-model-1',modelCapabilities:{'vision-model-1':true},isActive:true,isDefault:true,createdAt:now,updatedAt:now}];
app.get('/api/settings',(req,res)=>res.json(settingsState));
app.post('/api/settings',(req,res)=>{if(Object.values(req.body).some(v=>String(v)==='999'))return error(res,'INVALID_SETTING','设置值无效：原始校验诊断');Object.assign(settingsState,req.body);res.json({message:'Settings updated successfully'});});
app.get('/api/settings/default-prompt',(req,res)=>res.json({defaultPrompt:'内置系统指令原文：请生成完整画布 JSON。禁止改写用户内容。'}));
app.get('/api/settings/cache',(req,res)=>res.json({files:3,bytes:1234567}));
app.post('/api/settings/cache/clear',(req,res)=>res.json({files:3,bytes:1234567}));
app.get('/api/settings/default-templates',(req,res)=>res.json({total:1,modified:1,missing:0,templates:[{id:'default-fixture',name:'内置模板中文原名',state:'modified'}]}));
app.post('/api/settings/default-templates/restore',(req,res)=>res.json({total:1,restored:1,recreated:0}));
app.get('/api/settings/network',(req,res)=>res.json(networkState));
app.post('/api/settings/network',(req,res)=>{networkState={...networkState,...req.body};res.json(networkState);});
app.post('/api/settings/network/test',(req,res)=>res.json({storeReady:false,results:[{id:'catalog',label:'商店目录',host:'raw.githubusercontent.com',ok:true,code:'CONNECTED',message:'连接成功'},{id:'releases',label:'GitHub 发布页',host:'github.com',ok:false,code:'CONNECTION_FAILED',message:'原始网络诊断：代理连接失败'}]}));
app.get('/api/logs/stream',(req,res)=>{res.set('Content-Type','text/event-stream');res.flushHeaders();res.write('data: '+JSON.stringify({level:'info',message:'服务端日志原文 · Keep logs unchanged'})+'\n\n');const timer=setTimeout(()=>res.end(),7000);res.on('close',()=>clearTimeout(timer));});
app.get('/api/ai-providers',(req,res)=>res.json(providers));
app.get('/api/ai-providers/:id/models',(req,res)=>res.json({source:'api',models:Array.from({length:12},(_,i)=>({id:'vision-model-'+(i+1),name:'Original model '+i,imageInput:true,capabilitySource:'api'}))}));
app.post('/api/ai-providers/models-config',(req,res)=>res.json({source:'configured',warning:'模型列表认证失败，请检查 API Key 和访问权限',warningCode:'AI_UPSTREAM_UNAUTHORIZED',models:[{id:req.body.model||'vision-model-1',name:'原始模型名',imageInput:true,capabilitySource:'manual'}]}));
app.post('/api/ai-providers/test-config',(req,res)=>req.body.apiUrl.includes('fail')?error(res,'AI_UPSTREAM_UNAUTHORIZED','服务原始鉴权失败诊断'):res.json({success:true}));
app.post('/api/ai-providers',(req,res)=>{const p={...req.body,id:'provider-new',createdAt:now,updatedAt:now,isActive:true};delete p.apiKey;providers.push(p);res.json(p);});
app.put('/api/ai-providers/:id',(req,res)=>{const p=providers.find(p=>p.id===req.params.id);const next={...req.body};delete next.apiKey;Object.assign(p,next,{updatedAt:new Date().toISOString()});res.json(p);});
app.get('/api/ai-chat/conversations',(req,res)=>res.json([]));
app.post('/api/ai-chat/generate',(req,res)=>{
 res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache'});res.flushHeaders();
 const timers=[];const send=event=>{if(!res.destroyed)res.write('data: '+JSON.stringify(event)+'\n\n');};
 const prompt=req.body.prompt||'';
 if(prompt.includes('MALFORMED')){res.write('data: {broken}\n\n');res.end();return;}
 send({type:'status',code:'AI_RETRY_FORMAT',content:'正在校正设计格式并重新生成完整方案…'});
 timers.push(setTimeout(()=>send({type:'chunk',content:'模型返回文本原文 · do not translate'}),600));
 if(prompt.includes('FAIL'))timers.push(setTimeout(()=>{send({type:'error',code:'AI_RATE_LIMIT',error:'原始服务错误：额度不足'});res.end();},1000));
 else if(prompt.includes('LEGACY'))timers.push(setTimeout(()=>{send({type:'error',error:'旧版服务错误原文'});res.end();},1000));
 else if(!prompt.includes('STOP'))timers.push(setTimeout(()=>{
 const canvas=structuredClone(req.body.currentCanvas);canvas.background='#171c37';
 const text=canvas.objects.find(o=>o.type?.toLowerCase().includes('text'));if(text)text.fontSize=(text.fontSize||40)+5;
 canvas.referenceAnalysis='模型分析原文：保留中文、构图与标题层级。';
 send({type:'complete',content:'模型生成结果原文 · Keep reply content',canvasJson:canvas});send({type:'conversation_id',id:'phase4-conversation'});res.end();
 },12000));
 res.on('close',()=>timers.forEach(clearTimeout));
});
const listener=app.listen(Number(process.env.I18N_FIXTURE_PORT || 3199),'127.0.0.1',()=>console.log('Disposable i18n fixture API: http://127.0.0.1:'+listener.address().port));
