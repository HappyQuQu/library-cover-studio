import test from 'node:test';
import assert from 'node:assert/strict';
import { checkResources, checkTranslationCalls, checkUntranslatedText, sourceTextExceptions, flattenResources } from '../scripts/i18n-check.ts';
import zh from '../web/src/locales/zh-CN/index.ts';
import en from '../web/src/locales/en-US/index.ts';
import i18n, { i18nReady } from '../web/src/lib/i18n.ts';
import { parseLibraryConfigs } from '../web/src/lib/taskConfig.ts';
import { getLocalizedApiError } from '../web/src/lib/apiError.ts';

test('all frontend files are eligible for the gate; source-content exceptions are exact and documented', () => {
  for (const file of ['web/src/pages/NewPage.tsx', 'web/src/stores/newStore.ts', 'web/src/components/LanguageSelect.tsx', 'web/src/lib/aiPrompt.ts']) {
    assert.match(checkUntranslatedText('const label = "新增界面文案";', file).join(), /Move interface text/);
  }
  for (const exception of sourceTextExceptions) {
    assert.ok(exception.reason.length > 20);
    for (const value of exception.values) {
      assert.deepEqual(checkUntranslatedText(`const source = ${JSON.stringify(value)};`, `web/src/${exception.file}`), []);
      assert.equal(checkUntranslatedText(`const source = ${JSON.stringify(value)};`, 'web/src/pages/NewPage.tsx').length, 1);
    }
  }
});

test('English resources reject untranslated Chinese and translation calls cannot hide missing text in defaults', () => {
  assert.match(checkResources({ title: '标题' }, { title: '标题' }).join(), /Untranslated English/);
  assert.match(checkTranslationCalls("toast({title: t('title')})", 'new.tsx', new Set(['title'])).join(), /Use i18n.t in notifications/);
  assert.deepEqual(checkTranslationCalls("toast({title: i18n.t('title')})", 'new.tsx', new Set(['title'])), []);
  assert.match(checkTranslationCalls("t('title', {defaultValue: 'Fallback'})", 'new.tsx', new Set(['title'])).join(), /Put the default text/);
  assert.match(checkTranslationCalls("i18n.t('title', {'defaultValue': 'Fallback'})", 'new.tsx', new Set(['title'])).join(), /Put the default text/);
});

test('every translated leaf renders in both languages without raw keys or unresolved placeholders', async () => {
  await i18nReady;
  const sample: Record<string, string | number> = { count: 2 };
  for (const language of ['zh-CN', 'en-US']) {
    await i18n.changeLanguage(language);
    const resources = flattenResources(language === 'zh-CN' ? zh : en);
    for (const [key, text] of Object.entries(resources)) {
      const values = { ...sample };
      for (const match of text.matchAll(/{{\s*([^},\s]+)/g)) values[match[1]] ??= `source-${match[1]}`;
      const output = i18n.t(key as never, values as never) as string;
      assert.notEqual(output, key, key);
      assert.doesNotMatch(output, /{{[^}]+}}/, key);
      if (language === 'en-US') assert.doesNotMatch(output, /[\u4e00-\u9fff]/, key);
    }
  }
  assert.equal(i18n.t('taskWizard.selectionCount', { count: 1, total: 1 }), '1 / 1 target selected');
  assert.equal(i18n.t('taskWizard.selectionCount', { count: 2, total: 3 }), '2 / 3 targets selected');
  await i18n.changeLanguage('zh-CN');
});

test('invalid stored library configurations have a locale-neutral code and localized recovery guidance', async () => {
  await i18nReady;
  let failure: unknown;
  try { parseLibraryConfigs('{}'); } catch (error) { failure = error; }
  assert.equal((failure as {code: string}).code, 'INVALID_LIBRARY_CONFIG');
  await i18n.changeLanguage('en-US');
  assert.match(getLocalizedApiError(failure), /Select libraries or collections again/);
  await i18n.changeLanguage('zh-CN');
  assert.match(getLocalizedApiError(failure), /重新选择/);
});


test('font and template upload errors use their own limits and prefer semantic codes', async () => {
  await i18nReady;
  await i18n.changeLanguage('en-US');
  assert.match(getLocalizedApiError({ response: { status: 413 } }, 'font'), /50 MB/);
  assert.match(getLocalizedApiError({ response: { status: 413 } }, 'import'), /64 MB/);
  assert.match(getLocalizedApiError({ response: { status: 413, data: { code: 'REFERENCE_TOO_LARGE' } } }), /reference image/);
  await i18n.changeLanguage('zh-CN');
  assert.match(getLocalizedApiError({ response: { status: 413 } }, 'font'), /字体.*50 MB/);
});
