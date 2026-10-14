import test from 'node:test';
import assert from 'node:assert/strict';
import i18n, { i18nReady } from '../web/src/lib/i18n.ts';
import { displayMessage } from '../web/src/lib/displayMessage.ts';
import { feedbackForStatus, type AIStreamEvent } from '../web/src/lib/aiFeedback.ts';
import { buildDesignPrompt, DEFAULT_REFERENCE_PROMPT } from '../web/src/lib/aiPrompt.ts';
import { constrainDesign, describeChangeKeys } from '../web/src/lib/aiDesign.ts';
import { modelCatalogWarning } from '../web/src/lib/modelCatalogDisplay.ts';
import { getApiErrorDetails, getLocalizedApiError } from '../web/src/lib/apiError.ts';
import { prepareReferenceImage } from '../web/src/lib/referenceImages.ts';
import { readSSE } from '../web/src/lib/sse.ts';
import { aiFailureCode } from '../backend/src/services/ai/utils/feedback.ts';

test('AI interface labels retranslate without changing model text, reference analysis or design data', async () => {
  await i18nReady;
  const original = { objects: [{ id: 'title', type: 'IText', text: '画布原文', fontSize: 30, textVar: '{{primary_title}}' }] };
  const generated = { objects: [{ id: 'title', type: 'IText', text: '模型生成内容 · keep', fontSize: 50 }] };
  const result = constrainDesign(generated, original, 'canvas', []);
  const message = { role: 'assistant', content: '模型返回的原始内容', referenceAnalysis: '模型分析原文', canvasJson: result, changeKeys: describeChangeKeys(original, result, 'canvas') };
  const snapshot = JSON.stringify({ original, generated, message });
  const progress = feedbackForStatus({ type: 'status', code: 'AI_RETRY_FORMAT', content: '正在校正设计格式并重新生成完整方案…' });
  await i18n.changeLanguage('en-US');
  assert.match(displayMessage(progress), /^Correcting the format/);
  assert.equal(i18n.t(message.changeKeys[0]), 'Refine text and title typography');
  await i18n.changeLanguage('zh-CN');
  assert.match(displayMessage(progress), /正在校正/);
  assert.equal(JSON.stringify({ original, generated, message }), snapshot);
  assert.equal(message.canvasJson.objects[0].textVar, '{{primary_title}}');
});

test('interface language never becomes an implicit model instruction or rewrites system/user prompts', async () => {
  await i18nReady;
  const prompt = '请保留我输入的中文与 English';
  const values = ['canvas', 'new', 'selection'] as const;
  const before = values.map(scope => buildDesignPrompt(prompt, scope, ['原始图层-id']));
  await i18n.changeLanguage('en-US');
  assert.deepEqual(values.map(scope => buildDesignPrompt(prompt, scope, ['原始图层-id'])), before);
  assert.match(before[2], /原始图层-id/);
  assert.match(DEFAULT_REFERENCE_PROMPT, /^分析参考图/);
  assert.equal(i18n.t('aiChat.shortcutTitle'), 'Refine the title layout');
  assert.match(i18n.t('settings.cacheClearedCount', { count: 1 }), /1 file\./);
  assert.match(i18n.t('settings.cacheClearedCount', { count: 2 }), /2 files\./);
  assert.equal(i18n.t('aiChat.selectedCount', { count: 1 }), 'Edit only the 1 selected layer');
  await i18n.changeLanguage('zh-CN');
});

test('known and legacy AI failures show localized feedback with original diagnostics available', async () => {
  await i18nReady;
  const legacy = { error: '旧版服务返回的原始错误' };
  await i18n.changeLanguage('en-US');
  for (const code of ['AI_RESPONSE_TRUNCATED', 'AI_INVALID_CANVAS', 'AI_INVALID_JSON', 'AI_STREAM_INCOMPLETE', 'AI_UPSTREAM_UNAUTHORIZED', 'AI_RATE_LIMIT', 'SSE_INVALID_EVENT', 'REFERENCE_TOO_LARGE', 'AI_IMAGE_UNSUPPORTED', 'INVALID_SETTING', 'INVALID_PROXY_URL', 'FONT_REQUIRED']) {
    const error = { response: { data: { error: '服务返回原始诊断', code } } };
    assert.doesNotMatch(getLocalizedApiError(error, 'ai'), /[\u4e00-\u9fff]/);
    assert.equal(getApiErrorDetails(error), '服务返回原始诊断');
  }
  assert.equal(getLocalizedApiError(legacy, 'ai'), 'The AI request failed. Check the service configuration and try again.');
  assert.equal(getApiErrorDetails(legacy), '旧版服务返回的原始错误');
  assert.equal(displayMessage(feedbackForStatus({ type: 'status', content: '旧版进度文案' })), 'Correcting the design format…');
  assert.match(modelCatalogWarning({ warningCode: 'AI_UPSTREAM_UNAUTHORIZED' }), /API key/);
  assert.match(modelCatalogWarning({ warningCode: 'AI_CATALOG_EMPTY' }), /no design models/);
  assert.match(modelCatalogWarning({ warningCode: 'FUTURE_CODE' }), /Configured models are retained/);
  await i18n.changeLanguage('zh-CN');
  assert.match(getLocalizedApiError({ code: 'AI_RATE_LIMIT' }, 'ai'), /过于频繁/);
});

test('SSE frames survive locale changes mid-stream without restarting or rewriting source payloads', async () => {
  await i18nReady;
  const source: AIStreamEvent[] = [{ type: 'status', code: 'AI_RETRY_TRUNCATED', content: '设计输出被截断，正在重新生成更紧凑的完整方案…' }, { type: 'chunk', content: '中文模型输出 · English' }, { type: 'error', code: 'AI_RESPONSE_TRUNCATED', error: '原始错误诊断' }];
  const bytes = new TextEncoder().encode(source.map(frame => `data: ${JSON.stringify(frame)}\r\n\r\n`).join(''));
  let reads = 0, cancelled = 0;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { reads++; if (reads === 1) controller.enqueue(bytes); else controller.close(); }, cancel() { cancelled++; } });
  const iterator = readSSE<AIStreamEvent>(body);
  const status = (await iterator.next()).value!;
  await i18n.changeLanguage('en-US');
  assert.match(displayMessage(feedbackForStatus(status)), /truncated/);
  assert.deepEqual((await iterator.next()).value, source[1]);
  await i18n.changeLanguage('zh-CN');
  assert.deepEqual((await iterator.next()).value, source[2]);
  assert.equal((await iterator.next()).done, true);
  assert.equal(reads, 2);
  assert.equal(cancelled, 0);
});

test('malformed SSE and invalid reference images fail with semantic codes rather than frozen interface strings', async () => {
  let cancelled = false;
  const broken = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {broken}\n\n')); }, cancel() { cancelled = true; } });
  await assert.rejects(async () => { for await (const _frame of readSSE(broken)) { /* Parser must reject before yielding. */ } }, { code: 'SSE_INVALID_EVENT' });
  assert.equal(cancelled, true);
  await assert.rejects(prepareReferenceImage({ type: 'text/plain', size: 1 } as File), { code: 'REFERENCE_FORMAT' });
  await assert.rejects(prepareReferenceImage({ type: 'image/png', size: 11 * 1024 * 1024 } as File), { code: 'REFERENCE_TOO_LARGE' });
});

test('upstream error classification preserves original messages and existing semantic error codes', () => {
  for (const [error, code] of [
    [{ status: 401, message: 'Original diagnosis' }, 'AI_UPSTREAM_UNAUTHORIZED'],
    [{ response: { status: 429 }, message: 'Original quota failure' }, 'AI_RATE_LIMIT'],
    [{ code: 'ERR_CANCELED', message: 'Timeout' }, 'AI_TIMEOUT'],
    [{ code: 'AI_INVALID_JSON', message: '原始 JSON 错误' }, 'AI_INVALID_JSON'],
    [{ message: 'This endpoint does not support image input' }, 'AI_IMAGE_UNSUPPORTED'],
    [{ message: '任意服务错误' }, 'AI_REQUEST_FAILED'],
  ] as const) {
    const original = JSON.stringify(error);
    assert.equal(aiFailureCode(error, true), code);
    assert.equal(JSON.stringify(error), original);
  }
});
