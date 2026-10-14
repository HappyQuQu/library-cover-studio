import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import i18n, { i18nReady } from '../web/src/lib/i18n.ts';
import { displayMessage, type DisplayMessage } from '../web/src/lib/displayMessage.ts';
import { getPreviewNote, getPreviewNoteDetails } from '../web/src/lib/coverPreview.ts';
import { getApiErrorDetails, getLocalizedApiError } from '../web/src/lib/apiError.ts';
import { buildSchedule, describeSchedule, parseLibraryConfigs, readSchedule, reconcileLibraries, SORT_OPTIONS, WEEKDAYS } from '../web/src/lib/taskConfig.ts';
import { runStatus, coverStatus, duration } from '../web/src/lib/taskHistoryDisplay.ts';
import { EDITOR_EFFECT_NAMES } from '../web/src/lib/editorEffects.ts';
import { checkTranslationCalls } from '../scripts/i18n-check.ts';

test('switching languages changes derived workflow labels without rewriting task data or schedules', async () => {
  await i18nReady;
  const configs = parseLibraryConfigs(JSON.stringify([{ libraryId: 'movies', libraryName: '电影库', libraryType: 'movies', templateId: '自定义模板', primaryTitle: '未保存主标题', secondaryTitle: 'Unsaved subtitle', sortBy: 'DateCreated', enabled: true }]));
  const expression = '7 4 * * 1';
  const schedule = readSchedule(expression)!;
  const original = JSON.stringify({ configs, schedule });
  for (const language of ['zh-CN', 'en-US', 'zh-CN']) {
    await i18n.changeLanguage(language);
    assert.equal(buildSchedule(schedule), expression);
    assert.equal(JSON.stringify({ configs, schedule }), original);
    assert.equal(reconcileLibraries(configs, [{ id: 'movies', name: '媒体库', type: 'movies' }], 'different')[0], configs[0]);
    assert.equal(SORT_OPTIONS[0][0], 'DateCreated');
    assert.equal(WEEKDAYS.length, 7);
    assert.equal(i18n.t(SORT_OPTIONS[0][1]), language === 'zh-CN' ? '最近加入' : 'Recently added');
    assert.equal(describeSchedule(expression), language === 'zh-CN' ? '每周一 04:07' : 'Every Monday at 04:07');
  }
  await i18n.changeLanguage('en-US');
  assert.equal(describeSchedule('15 * * * *'), 'Every hour at minute 15');
  assert.equal(describeSchedule('30 23 31 * *'), 'On day 31 of each month at 23:30');
  assert.equal(describeSchedule('0 */6 * * *'), 'Custom schedule');
  for (const expression of ['99 4 * * 1', '0 24 * * *', '0 4 0 * *', '0 4 32 * *']) {
    assert.equal(readSchedule(expression), null);
    assert.equal(describeSchedule(expression), 'Custom schedule');
  }
  assert.deepEqual(EDITOR_EFFECT_NAMES, { vignette: '暗角效果', noise: '噪点效果' });
  await i18n.changeLanguage('zh-CN');
});

test('open validation messages and cached previews retranslate from identity while retaining API compatibility', async () => {
  await i18nReady;
  const message: DisplayMessage = { key: 'taskWizard.nameRequired' };
  const error: DisplayMessage = { error: { response: { status: 400, data: { code: 'INVALID_SCHEDULE', error: '原始 Cron 校验诊断' } } } };
  const preview = { image: 'data:image/png;base64,fixture', note: '旧版中文说明', noteCode: 'POSTERS_REUSED' as const, noteParams: { count: 1 } };
  const snapshot = JSON.stringify({ message, error, preview });
  await i18n.changeLanguage('en-US');
  assert.equal(displayMessage(message), 'Enter a task name.');
  assert.match(displayMessage(error), /Cron fields/);
  assert.equal(getPreviewNote(preview), 'Using 1 available poster, repeated to fill remaining positions.');
  assert.equal(getPreviewNote({ image: preview.image, noteCode: 'NO_POSTERS_REQUIRED' }), 'Text-only template; no posters needed.');
  assert.equal(getPreviewNote({ image: preview.image, noteCode: 'LIBRARY_POSTERS' }), 'Uses real posters from the media library.');
  assert.equal(getPreviewNote({ image: preview.image, note: '旧 API 未升级' }), 'Real cover preview generated.');
  assert.equal(getPreviewNoteDetails({ image: preview.image, note: '旧 API 未升级' }), '旧 API 未升级');
  assert.equal(getPreviewNoteDetails(preview), null);
  await i18n.changeLanguage('zh-CN');
  assert.equal(displayMessage(message), '请填写任务名称');
  assert.match(displayMessage(error), /Cron 字段/);
  assert.equal(getPreviewNote(preview), '使用 1 张可用海报，重复填充其余位置');
  assert.equal(JSON.stringify({ message, error, preview }), snapshot);
  assert.equal(displayMessage(null), '');
});

test('workflow failures localize codes while keeping backend diagnostics intact', async () => {
  await i18nReady;
  await i18n.changeLanguage('en-US');
  for (const [code, pattern] of [
    ['NO_POSTERS', /no available posters/], ['LIBRARY_UNAVAILABLE', /library is unavailable/],
    ['TASK_RUNNING', /task is running/], ['MEDIA_UNSUPPORTED_SORT', /sort order/],
    ['STORE_VERSION_CHANGED', /Refresh the catalog/], ['STORE_APP_UPGRADE_REQUIRED', /newer app version/],
    ['STORE_PACKAGE_INVALID', /verification failed/], ['HISTORY_IMAGE_NOT_FOUND', /no longer available/],
  ] as const) {
    const error = { response: { data: { error: { code, message: '后端原始诊断' } } } };
    assert.match(getLocalizedApiError(error), pattern);
    assert.equal(getApiErrorDetails(error), '后端原始诊断');
  }
  await i18n.changeLanguage('zh-CN');
});

test('history labels translate independently of original names, errors, dates and duration rounding', async () => {
  await i18nReady;
  const log = { id: 'run', taskId: 'task', status: 'completed' as const, itemsFailed: 1, startedAt: '2026-10-14T04:00:00+08:00', completedAt: '2026-10-14T04:00:59.600+08:00', errorMessage: '媒体服务器原始诊断' };
  const cover = { id: 'cover', libraryId: 'movies', libraryName: '未翻译的名称', status: 'failed' as const, imageUrl: '/image.png', errorMessage: '原始上传失败诊断' };
  const original = JSON.stringify({ log, cover });
  await i18n.changeLanguage('en-US');
  assert.deepEqual(runStatus(log), { text: 'Partially failed', tone: 'warning' });
  assert.equal(coverStatus(cover), 'Upload failed · Image retained');
  assert.equal(duration(log), '1 min 0 sec');
  assert.equal(duration({ ...log, completedAt: 'invalid' }), null);
  assert.equal(duration({ ...log, completedAt: undefined }), null);
  assert.equal(duration({ ...log, completedAt: '2026-10-14T03:59:00+08:00' }), '0 sec');
  assert.equal(i18n.t('templateStore.downloads', { count: 0 }), '0 downloads');
  assert.equal(i18n.t('templateStore.downloads', { count: 1 }), '1 download');
  assert.equal(i18n.t('taskWizard.scopeSummary', { count: 1 }), '1 library · 1 cover');
  await i18n.changeLanguage('zh-CN');
  assert.equal(coverStatus(cover), '上传失败 · 图片已保留');
  assert.equal(duration(log), '1 分 0 秒');
  assert.equal(JSON.stringify({ log, cover }), original);
});

test('translation checker audits every member of typed key mappings and rejects wide string keys', () => {
  const filename = fileURLToPath(new URL('../temp/i18n-checker-fixture.ts', import.meta.url));
  const source = "declare function t(key: string): string; const valid = '' as 'common.save' | 'common.cancel'; t(valid); const invalid = '' as 'common.save' | 'missing.key'; t(invalid); const wide: string = ''; t(wide);";
  const host = ts.createCompilerHost({});
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (path, language, ...args) => path === filename ? ts.createSourceFile(filename, source, language, true) : original(path, language, ...args);
  const program = ts.createProgram([filename], {}, host);
  const errors = checkTranslationCalls(source, 'temp/i18n-checker-fixture.ts', new Set(['common.save', 'common.cancel']), program);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /Unknown translation key missing.key/);
  assert.match(errors[1], /explicit translation keys/);
});
