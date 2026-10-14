import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { OpenAIProvider } from '../backend/src/services/ai/providers/openai.provider.ts';
import { ClaudeProvider } from '../backend/src/services/ai/providers/claude.provider.ts';
import { OllamaProvider } from '../backend/src/services/ai/providers/ollama.provider.ts';

test('all AI adapters attach semantic SSE errors while retaining legacy error text and source prompts', async t => {
  const bodies: any[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    bodies.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.statusCode = 401; res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'Original upstream diagnosis' } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const providers = [new OpenAIProvider({ type: 'custom', apiUrl: base + '/v1', apiKey: 'fixture', model: 'fixture' }), new ClaudeProvider({ type: 'claude', apiUrl: base, apiKey: 'fixture', model: 'fixture' }), new OllamaProvider({ type: 'ollama', apiUrl: base, model: 'fixture' })];
  const prompt = '用户的原始需求 · Keep source content';
  for (const provider of providers) {
    const frames = [];
    for await (const frame of provider.generateTemplate(prompt, { systemPrompt: '原始自定义系统指令', canvasSize: { width: 320, height: 180 } })) frames.push(frame);
    assert.equal(frames.at(-1)?.type, 'error');
    assert.equal(frames.at(-1)?.code, 'AI_UPSTREAM_UNAUTHORIZED');
    assert.equal(typeof frames.at(-1)?.error, 'string');
    assert.ok(frames.at(-1)!.error!.length > 0);
    assert.equal(frames.filter(frame => frame.type === 'complete').length, 0);
  }
  assert.equal(bodies.length, 3);
  for (const body of bodies) {
    assert.match(JSON.stringify(body.messages), /用户的原始需求 · Keep source content/);
    assert.equal(body.language, undefined);
    assert.equal(body.locale, undefined);
  }
});
