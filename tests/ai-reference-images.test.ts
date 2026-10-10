import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {parseReferenceImages, referenceImageError} from '../backend/src/services/ai/utils/referenceImages.ts';
import {OpenAIProvider} from '../backend/src/services/ai/providers/openai.provider.ts';
import {ClaudeProvider} from '../backend/src/services/ai/providers/claude.provider.ts';
import {OllamaProvider} from '../backend/src/services/ai/providers/ollama.provider.ts';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const sharp = require('sharp');
const canvas = {objects:[{id:'title001', type:'IText', text:'{{primary_title}}'}],referenceAnalysis:'参考图使用紫蓝渐变和扇形排列，底部留白放置标题。'};

test('reference uploads decode real images, resize, and reject invalid, oversized or remote inputs', async () => {
  const png = await sharp({create:{width:2400,height:1200,channels:4,background:'#aa33bb'}}).png().toBuffer();
  const result = await parseReferenceImages([{dataUrl:`data:image/png;base64,${png.toString('base64')}`}]);
  const metadata = await sharp(Buffer.from(result[0].dataUrl.split(',')[1], 'base64')).metadata();
  assert.equal(metadata.format,'jpeg'); assert.equal(metadata.width,1536); assert.equal(metadata.height,768);
  assert.deepEqual(await parseReferenceImages(undefined), []);
  assert.deepEqual(await parseReferenceImages([]), []);
  await assert.rejects(parseReferenceImages(new Array(4).fill({dataUrl:result[0].dataUrl})), {statusCode:400});
  for (const dataUrl of ['https://example.com/private.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,YWJjZA==', `data:image/jpeg;base64,${png.toString('base64')}`]) {
    await assert.rejects(parseReferenceImages([{dataUrl}]), {statusCode:400});
  }
  await assert.rejects(parseReferenceImages([{dataUrl:'data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024)}]),{statusCode:413});
});

async function fixture(t:TestContext, kind:'openai'|'claude'|'ollama', firstInvalid = false) {
  const requests:any[] = [];
  const server=createServer(async (req,res) => {
    const buffers=[]; for await (const chunk of req) buffers.push(Buffer.from(chunk));
    const body=JSON.parse(Buffer.concat(buffers).toString()); requests.push(body);
    const content=JSON.stringify(firstInvalid && requests.length === 1 ? {objects:[]} : canvas);
    if (kind==='ollama') { res.setHeader('Content-Type','application/x-ndjson'); res.end(JSON.stringify({message:{content},done:true,done_reason:'stop'})+'\n'); return; }
    res.setHeader('Content-Type','text/event-stream');
    if (kind==='openai') {
      res.end(`data: ${JSON.stringify({choices:[{delta:{content},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`);
    } else {
      const events=[
        {type:'message_start',message:{id:'msg_test',type:'message',role:'assistant',content:[],model:'claude-test',stop_reason:null,stop_sequence:null,usage:{input_tokens:1,output_tokens:0}}},
        {type:'content_block_start',index:0,content_block:{type:'text',text:''}},
        {type:'content_block_delta',index:0,delta:{type:'text_delta',text:content}},
        {type:'content_block_stop',index:0},
        {type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:1}},
        {type:'message_stop'}
      ];
      res.end(events.map(event=>`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
    }
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
  return {requests, url:`http://127.0.0.1:${(server.address() as any).port}`};
}

for (const kind of ['openai','claude','ollama'] as const) test(`${kind} sends real reference image blocks and retains analysis in the generated result`, async t => {
  const {requests,url}=await fixture(t,kind);
  const options={type:kind,apiUrl:url,apiKey:'local-test-key',model:'vision-test'};
  const provider=kind==='openai'?new OpenAIProvider(options):kind==='claude'?new ClaudeProvider(options):new OllamaProvider(options);
  const references=await parseReferenceImages([{dataUrl:`data:image/png;base64,${(await sharp({create:{width:20,height:20,channels:3,background:'#554499'}}).png().toBuffer()).toString('base64')}`}]);
  const results=[];
  for await (const chunk of provider.generateTemplate('参考这张图设计海报',{referenceImages:references,conversationHistory:[{role:'user',content:'之前的文字需求'}],canvasSize:{width:1920,height:1080}})) results.push(chunk);
  assert.equal(results.at(-1)?.type,'complete');
  assert.equal(results.at(-1)?.canvasJson.referenceAnalysis,canvas.referenceAnalysis);
  assert.equal(requests.length,1);
  const current=requests[0].messages.at(-1);
  if (kind==='openai') {
    assert.equal(current.content[0].type,'image_url'); assert.equal(current.content[0].image_url.url,references[0].dataUrl);
    assert.match(current.content[1].text,/referenceAnalysis/);
  } else if (kind==='claude') {
    assert.equal(current.content[0].type,'image'); assert.equal(current.content[0].source.media_type,'image/jpeg');
    assert.equal(current.content[0].source.data,references[0].dataUrl.split(',')[1]);
    assert.match(current.content[1].text,/referenceAnalysis/);
  } else {
    assert.deepEqual(current.images,[references[0].dataUrl.split(',')[1]]); assert.match(current.content,/referenceAnalysis/);
  }
  assert.equal(requests[0].messages.find((message:any)=>message.content==='之前的文字需求')?.images,undefined);
});

test('vision capability errors are actionable without silently dropping references', () => {
  assert.match(referenceImageError(new Error('model does not support images'),true),/不支持图片输入/);
  assert.equal(referenceImageError(new Error('401 Unauthorized'),true),'401 Unauthorized');
});
test('a format retry retains image content and emits only the corrected design', async t => {
  const {requests,url}=await fixture(t,'openai',true);
  const provider=new OpenAIProvider({type:'custom',apiUrl:url,apiKey:'local-test-key',model:'vision-test'});
  const reference={dataUrl:'data:image/jpeg;base64,test-fixture'};
  const results=[];
  for await (const chunk of provider.generateTemplate('参考图片排版',{referenceImages:[reference]})) results.push(chunk);
  assert.equal(requests.length,2);
  assert.deepEqual(requests[0].messages[1].content[0],requests[1].messages[1].content[0]);
  assert.equal(requests[1].messages[1].content[0].image_url.url,reference.dataUrl);
  assert.equal(results.filter(chunk=>chunk.type==='complete').length,1);
  assert.ok(results.some(chunk=>chunk.type==='status'));
});
