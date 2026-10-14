import test from 'node:test';
import assert from 'node:assert/strict';
import i18n, { i18nReady } from '../web/src/lib/i18n.ts';
import { getApiErrorDetails, getLocalizedApiError } from '../web/src/lib/apiError.ts';
import { formatDisplayDate, formatDisplayNumber } from '../web/src/lib/displayFormat.ts';
import { checkI18n, checkTranslationCalls, checkUntranslatedText } from '../scripts/i18n-check.ts';

test('page translations pluralize item counts and preserve user-supplied names', async () => {
  await i18nReady;
  await i18n.changeLanguage('en-US');
  assert.equal(i18n.t('servers.itemCount', { count: 0 }), '0 items');
  assert.equal(i18n.t('servers.itemCount', { count: 1 }), '1 item');
  assert.equal(i18n.t('servers.itemCount', { count: 1000 }), '1,000 items');
  assert.match(i18n.t('templates.fontsInstalled', { count: 1 }), /1 font /);
  assert.match(i18n.t('templates.fontsInstalled', { count: 2 }), /2 fonts /);
  assert.equal(i18n.t('templates.deleteConfirm', { name: '我的中文模板' }), 'Delete template “我的中文模板”?');
  await i18n.changeLanguage('zh-CN');
  assert.equal(i18n.t('servers.itemCount', { count: 1 }), '1 项');
  assert.equal(i18n.t('servers.itemCount', { count: 1000 }), '1,000 项');
});

test('display locale changes formatting without changing the timestamp or explicit timezone', () => {
  const timestamp = '2026-10-14T04:00:00+08:00';
  const original = Date.parse(timestamp);
  for (const language of ['zh-CN', 'en-US']) {
    const displayed = formatDisplayDate(timestamp, language, { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    assert.equal(displayed, '04:00');
    assert.equal(Date.parse(timestamp), original);
  }
  assert.notEqual(formatDisplayDate(timestamp, 'zh-CN', { timeZone: 'UTC', dateStyle: 'long' }), formatDisplayDate(timestamp, 'en-US', { timeZone: 'UTC', dateStyle: 'long' }));
  assert.equal(formatDisplayDate('invalid', 'en-US'), null);
  assert.equal(formatDisplayDate(null, 'zh-CN'), null);
  assert.equal(formatDisplayDate(timestamp, 'en-US', { timeZone: 'Invalid/Timezone' }), null);
  assert.equal(formatDisplayNumber(12345, 'en-US'), '12,345');
  assert.equal(formatDisplayNumber(NaN, 'zh-CN'), '—');
});

test('business errors translate stable codes and keep original diagnostics separate', async () => {
  await i18nReady;
  const source = { response: { status: 400, data: { error: { code: 'INVALID_TEMPLATE', message: 'ZIP 根目录缺少 template.json' } } } };
  await i18n.changeLanguage('en-US');
  assert.match(getLocalizedApiError(source, 'import'), /^Invalid template package/);
  assert.doesNotMatch(getLocalizedApiError(source, 'import'), /根目录/);
  assert.equal(getApiErrorDetails(source), 'ZIP 根目录缺少 template.json');
  assert.match(getLocalizedApiError({ code: 'MEDIA_AUTH_FAILED', error: 'upstream text' }, 'connection'), /API key/);
  assert.match(getLocalizedApiError({ response: { data: { error: { code: 'TEMPLATE_IN_USE' } } } }), /used by a task/);
  assert.match(getLocalizedApiError({ code: 'ECONNABORTED' }, 'import'), /timed out/);
  assert.match(getLocalizedApiError({ response: { status: 413 } }, 'import'), /64 MB/);
  assert.match(getLocalizedApiError({ isAxiosError: true }, 'connection'), /reach the server/);
  assert.match(getLocalizedApiError({ response: { status: 403 } }), /permission/);
  assert.match(getLocalizedApiError({ code: 'UNKNOWN_CODE', error: '原始错误' }), /operation failed/);
  assert.equal(getApiErrorDetails({ error: '原始错误' }), '原始错误');
  assert.equal(getApiErrorDetails(null), null);
  await i18n.changeLanguage('zh-CN');
  assert.match(getLocalizedApiError(source, 'import'), /模板包无效/);
  assert.equal(getApiErrorDetails(source), 'ZIP 根目录缺少 template.json');
});

test('translated surfaces reject new hardcoded text and allow complete plural base keys', () => {
  assert.deepEqual(checkUntranslatedText('// 中文注释\nconst data = t("nav.dashboard");', 'page.tsx'), []);
  for (const source of ['<button>删除</button>', '<input placeholder="请输入" />', 'confirm("确定删除？")', 'toast({title: "失败"})', 'const label = `共 ${count} 项`;']) {
    assert.equal(checkUntranslatedText(source, 'page.tsx').length > 0, true);
  }
  const keys = new Set(['items_one', 'items_other']);
  assert.deepEqual(checkTranslationCalls("t('items', {count: 2})", 'page.tsx', keys), []);
  assert.match(checkTranslationCalls("t('items', {count: 2})", 'page.tsx', new Set(['items_one'])).join(), /Unknown translation key/);
  assert.deepEqual(checkI18n().errors, []);
});
