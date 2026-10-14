import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { extractJSON, parseTemplateResponse } from '../backend/src/services/ai/utils/jsonParser.ts';
import { OpenAIProvider } from '../backend/src/services/ai/providers/openai.provider.ts';

const canvas = { version: '6.9.1', objects: [{ id: 'poster01', type: 'Image', left: 100, top: 200, angle: -30, posterVar: 'post1' }] };
test('JSON extraction finds the canvas among multiple blocks and braces inside text', () => {
  const value = { ...canvas, objects: [...canvas.objects, { id: 'title001', type: 'IText', text: '{{primary_title}} · } { · "quote"' }] };
  assert.deepEqual(extractJSON(`示例：{"note":"ignore"}\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n完成`), value);
  assert.deepEqual(extractJSON(JSON.stringify(value)), value);
  const literal = { objects: [{ id: 'text', type: 'IText', text: '<think>literal title</think>' }] };
  assert.deepEqual(extractJSON(JSON.stringify(literal)), literal);
  assert.deepEqual(extractJSON('<think>internal note</think>\n' + JSON.stringify(value)), value);
});
test('safe syntax repair handles comments, single quotes and trailing commas without executing code', () => {
  const result = extractJSON("{version:'6.9.1',/* design */objects:[{id:'poster01',type:'Image',left:100,top:200,angle:-30,posterVar:'post1',},],}");
  assert.deepEqual(result, canvas);
  assert.throws(() => extractJSON('{"objects":[{"id":"a","type":"Image","left":Math.sin(2)}]}'));
});
test('truncated objects are never auto-completed or extracted as a partial canvas', () => {
  for (const text of ['{"objects":[{"id":"a","type":"Rect"}', '{"objects":[{"id":"a","type":"IText","text":"unfinished', '{"objects":[{"id":"a","type":"Rect"}],']) {
    assert.throws(() => extractJSON(text), { code: 'AI_INVALID_JSON' });
  }
  assert.throws(() => parseTemplateResponse(JSON.stringify(canvas), 'length'), { code: 'AI_RESPONSE_TRUNCATED' });
  assert.throws(() => parseTemplateResponse(JSON.stringify(canvas), 'max_tokens'), { code: 'AI_RESPONSE_TRUNCATED' });
  assert.throws(() => parseTemplateResponse(JSON.stringify(canvas)), { code: 'AI_STREAM_INCOMPLETE' });
});
test('canvas validation rejects wrong roots, duplicate IDs and non-numeric geometry', () => {
  assert.throws(() => extractJSON('{"message":"done"}'), { code: 'AI_INVALID_CANVAS' });
  assert.throws(() => extractJSON('{"objects":[]}'), { code: 'AI_INVALID_CANVAS' });
  assert.throws(() => extractJSON(JSON.stringify({ objects: [canvas.objects[0], canvas.objects[0]] })), { code: 'AI_INVALID_CANVAS' });
  assert.throws(() => extractJSON('{"objects":[{"id":"x","type":"Rect","left":"300 * 2"}]}'), { code: 'AI_INVALID_CANVAS' });
});

const brokenSVG = '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop offset="100% stop-color="#150e22"/></linearGradient></defs></svg>';
const brokenImage = { ...canvas, backgroundImage: { type: 'Image', src: `data:image/svg+xml,${encodeURIComponent(brokenSVG)}` } };
test('image validation catches malformed SVG inside valid JSON, including encoded and nested images', () => {
  assert.throws(() => extractJSON(JSON.stringify(brokenImage)), { code: 'AI_INVALID_CANVAS' });
  assert.throws(() => extractJSON(JSON.stringify({ ...canvas, objects: [{ ...canvas.objects[0], src: `data:image/svg+xml;base64,${Buffer.from(brokenSVG).toString('base64')}` }] })), { code: 'AI_INVALID_CANVAS' });
  const valid = { ...brokenImage, backgroundImage: { type: 'Image', src: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="#123"/></svg>') } };
  assert.deepEqual(extractJSON(JSON.stringify(valid)), valid);
  assert.deepEqual(extractJSON(JSON.stringify({ ...canvas, backgroundImage: { type:'Image', src:'[original-asset]' } })).backgroundImage.src, '[original-asset]');
});

async function gateway(t: TestContext, reply: (body: any, index: number) => { status?: number; content?: string; finish?: string | null; error?: string }) {
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()); requests.push(body);
    const result = reply(body, requests.length);
    res.statusCode = result.status || 200;
    if (result.status) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({error:{message:result.error}})); return; }
    res.setHeader('Content-Type', 'text/event-stream');
    const content = result.content || '';
    // Fragment the body so stream joining, not whole-response parsing, is exercised.
    for (let index = 0; index < content.length; index += 7) {
      res.write(`data: ${JSON.stringify({id:'local',object:'chat.completion.chunk',choices:[{index:0,delta:{content:content.slice(index,index+7)},finish_reason:null}]})}\n\n`);
    }
    if (result.finish) res.write(`data: ${JSON.stringify({id:'local',choices:[{index:0,delta:{},finish_reason:result.finish}]})}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  return { requests, provider: new OpenAIProvider({type:'custom',model:'mimo-v2.6-flash',apiKey:'local-key',apiUrl:`http://127.0.0.1:${(server.address() as any).port}/v1`}) };
}
async function collect(provider: OpenAIProvider) {
  const chunks = [];
  for await (const chunk of provider.generateTemplate('帮我设计一个扇形的海报', { canvasSize:{width:1920,height:1080} })) chunks.push(chunk);
  return chunks;
}
test('truncated generation retries once with more space and emits only one complete canvas', async t => {
  const fixture = await gateway(t, (_, index) => index === 1 ? {content:'{"objects":[',finish:'length'} : {content:JSON.stringify(canvas),finish:'stop'});
  const result = await collect(fixture.provider);
  assert.equal(fixture.requests.length, 2);
  assert.deepEqual(fixture.requests[0].response_format, {type:'json_object'});
  assert.ok(fixture.requests[0].max_tokens > 4096);
  assert.ok(fixture.requests[1].max_tokens > fixture.requests[0].max_tokens);
  assert.ok(result.some(chunk => chunk.type === 'status' && chunk.code === 'AI_RETRY_TRUNCATED'));
  assert.equal(result.filter(chunk => chunk.type === 'complete').length, 1);
  assert.deepEqual(result.at(-1)?.canvasJson, canvas);
});
test('persistent invalid responses stop after one regeneration with a useful error', async t => {
  const fixture = await gateway(t, () => ({content:'{"objects":[',finish:'length'}));
  const result = await collect(fixture.provider);
  assert.equal(fixture.requests.length, 2);
  assert.equal(result.at(-1)?.type, 'error');
  assert.match(result.at(-1)?.error || '', /长度限制/);
  assert.equal(result.at(-1)?.code, 'AI_RESPONSE_TRUNCATED');
  assert.ok(!result.some(chunk => chunk.type === 'complete'));
});
test('invalid SVG triggers one retry before any complete design is emitted', async t => {
  const fixture = await gateway(t, (_, index) => ({ content: JSON.stringify(index === 1 ? brokenImage : { ...canvas, background:'#150e22' }), finish:'stop' }));
  const result = await collect(fixture.provider);
  assert.equal(fixture.requests.length, 2);
  assert.equal(result.filter(chunk => chunk.type === 'complete').length, 1);
  assert.equal(result.at(-1)?.canvasJson.background, '#150e22');
  assert.match(fixture.requests[1].messages.at(-1).content, /不要生成 SVG/);
});
test('compatible endpoints can opt out of unsupported JSON mode, but auth errors do not retry', async t => {
  const fixture = await gateway(t, body => body.response_format ? {status:400,error:'response_format json_object is unsupported'} : {content:JSON.stringify(canvas),finish:'stop'});
  assert.equal((await collect(fixture.provider)).at(-1)?.type, 'complete');
  assert.equal(fixture.requests.length, 2);
  assert.equal(fixture.requests[1].response_format, undefined);
  const denied = await gateway(t, () => ({status:401,error:'Invalid authentication'}));
  const rejected = (await collect(denied.provider)).at(-1);
  assert.equal(rejected?.type, 'error');
  assert.equal(rejected?.code, 'AI_UPSTREAM_UNAUTHORIZED');
  assert.equal(denied.requests.length, 1);
});
test('prematurely closed streams never emit a success or save a partial design', async t => {
  const fixture = await gateway(t, () => ({content:JSON.stringify(canvas),finish:null}));
  const result = await collect(fixture.provider);
  assert.equal(fixture.requests.length, 1);
  assert.equal(result.at(-1)?.type, 'error');
  assert.match(result.at(-1)?.error || '', /连接提前结束/);
  assert.equal(result.at(-1)?.code, 'AI_STREAM_INCOMPLETE');
});
