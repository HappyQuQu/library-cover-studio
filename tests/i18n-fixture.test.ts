import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('disposable browser fixture keeps schedules, legacy feedback and source fields consistent', async t => {
  const child = spawn(process.execPath, ['tests/fixtures/i18n-server.cjs'], { cwd: fileURLToPath(new URL('../', import.meta.url)), env: { ...process.env, I18N_FIXTURE_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { child.kill(); });
  const base = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Fixture failed to start')), 10000);
    child.once('error', reject);
    child.stdout.on('data', chunk => { const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timeout); resolve(match[0]); } });
    child.once('exit', code => { clearTimeout(timeout); if (code) reject(new Error(`Fixture exited with ${code}`)); });
  });
  const post = async (path: string, body: unknown) => (await fetch(base + '/api' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json() as Promise<any>;
  const cronExpression = '0 4 * * 1';
  const schedule = await post('/tasks/preview-schedule', { cronExpression });
  assert.equal(schedule.executions[0], '2026-10-18T20:00:00.000Z');
  const task = await post('/tasks', { name: '中文任务 · Keep', type: 'scheduled', cronExpression, libraryConfigs: '[]' });
  assert.equal(task.name, '中文任务 · Keep');
  assert.equal(task.nextRunAt, schedule.executions[0]);
  const preview = await post('/tasks/preview-cover', { primaryTitle: '保留原始标题' });
  assert.equal(preview.noteCode, 'POSTERS_REUSED');
  assert.match(preview.note, /可用海报/);
  const login = await post('/auth/login', { username: 'bad-fixture', password: 'fixture-only' });
  assert.equal(login.error.code, 'INVALID_CREDENTIALS');
  const requests = await (await fetch(base + '/__i18n/requests')).json() as any[];
  assert.equal(requests.find(request => request.path === '/api/auth/login').body.password, '[redacted]');
});
