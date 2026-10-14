import test from 'node:test';
import assert from 'node:assert/strict';
import { createLanguagePreferences, LANGUAGE_STORAGE_KEY, normalizeLanguage } from '../web/src/lib/language.ts';
import { checkI18n, checkResources, checkTranslationCalls } from '../scripts/i18n-check.ts';

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const writes: [string, string][] = [];
  return {
    values, writes,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); writes.push([key, value]); },
  };
}

test('Chinese is the default; explicit language aliases normalize to supported resources', () => {
  for (const value of [undefined, null, '', 'fr-FR', 'zh', 'zh-Hans', 'zh-TW', 'zh-HK', 'english', 'en--GB', 1]) {
    assert.equal(normalizeLanguage(value), 'zh-CN');
  }
  for (const value of ['en', 'en-GB', 'en-US', ' EN_us ', 'en-AU']) assert.equal(normalizeLanguage(value), 'en-US');
  const cache = storage({ i18nextLng: 'en-US' });
  const prefs = createLanguagePreferences({ getStorage: () => cache, changeLanguage: async () => {}, onLanguageChange: () => {} });
  assert.equal(prefs.initialLanguage, 'zh-CN');
  assert.equal(cache.writes.length, 0);
  assert.equal(cache.values.get('i18nextLng'), 'en-US');
});

test('explicit preferences survive a new page instance without rewriting legacy storage', async () => {
  const cache = storage();
  const applied: string[] = [];
  const options = { getStorage: () => cache, changeLanguage: async () => {}, onLanguageChange: (language: string) => applied.push(language) };
  const prefs = createLanguagePreferences(options);
  assert.deepEqual(await prefs.setLanguage('en-GB'), { language: 'en-US', persisted: true });
  assert.equal(prefs.getLanguage(), 'en-US');
  assert.deepEqual(applied, ['en-US']);
  assert.equal(createLanguagePreferences(options).initialLanguage, 'en-US');
  assert.deepEqual(cache.writes, [[LANGUAGE_STORAGE_KEY, 'en-US']]);
});

test('blocked storage preserves a language in memory and falls back to Chinese on reload', async () => {
  const options = { getStorage: () => { throw new Error('Storage disabled'); }, changeLanguage: async () => {}, onLanguageChange: () => {} };
  const prefs = createLanguagePreferences(options);
  assert.equal(prefs.initialLanguage, 'zh-CN');
  assert.deepEqual(await prefs.setLanguage('en'), { language: 'en-US', persisted: false });
  assert.equal(prefs.getLanguage(), 'en-US');
  assert.equal(createLanguagePreferences(options).initialLanguage, 'zh-CN');
  const writeBlocked = createLanguagePreferences({ ...options, getStorage: () => ({ getItem: () => null, setItem: () => { throw new Error('Quota exceeded'); } }) });
  assert.equal((await writeBlocked.setLanguage('en')).persisted, false);
  assert.equal(writeBlocked.getLanguage(), 'en-US');
});

test('cross-tab changes read the latest preference and do not write feedback events', async () => {
  const cache = storage({ [LANGUAGE_STORAGE_KEY]: 'en-US' });
  const applied: string[] = [];
  const prefs = createLanguagePreferences({ getStorage: () => cache, changeLanguage: async () => {}, onLanguageChange: language => applied.push(language) });
  cache.values.set(LANGUAGE_STORAGE_KEY, 'zh-CN');
  await prefs.syncStoredLanguage();
  assert.equal(prefs.getLanguage(), 'zh-CN');
  cache.values.set(LANGUAGE_STORAGE_KEY, 'en-GB');
  await prefs.syncStoredLanguage();
  assert.equal(prefs.getLanguage(), 'en-US');
  cache.values.clear();
  await prefs.syncStoredLanguage();
  assert.equal(prefs.getLanguage(), 'zh-CN');
  assert.deepEqual(applied, ['zh-CN', 'en-US', 'zh-CN']);
  assert.equal(cache.writes.length, 0);
});

test('failed language changes keep preferences and later attempts still work', async () => {
  const cache = storage();
  let fail = true;
  const applied: string[] = [];
  const prefs = createLanguagePreferences({
    getStorage: () => cache,
    changeLanguage: async () => { if (fail) throw new Error('Change failed'); },
    onLanguageChange: language => applied.push(language),
  });
  await assert.rejects(prefs.setLanguage('en'), /Change failed/);
  assert.equal(prefs.getLanguage(), 'zh-CN');
  assert.equal(cache.writes.length, 0);
  assert.deepEqual(applied, []);
  fail = false;
  await prefs.setLanguage('en');
  assert.equal(prefs.getLanguage(), 'en-US');
});

test('rapid language changes complete in order and retain the final selection', async () => {
  const cache = storage();
  const applied: string[] = [];
  const prefs = createLanguagePreferences({
    getStorage: () => cache,
    changeLanguage: async language => { await new Promise(resolve => setTimeout(resolve, language === 'en-US' ? 10 : 0)); },
    onLanguageChange: language => applied.push(language),
  });
  await Promise.all([prefs.setLanguage('en'), prefs.setLanguage('zh')]);
  assert.deepEqual(applied, ['en-US', 'zh-CN']);
  assert.equal(prefs.getLanguage(), 'zh-CN');
  assert.equal(cache.values.get(LANGUAGE_STORAGE_KEY), 'zh-CN');
});

test('translation checks reject missing, blank, mismatched, and incomplete plural resources', () => {
  assert.match(checkResources({ title: '标题' }, {}).join(), /missing/);
  assert.throws(() => checkResources({ title: '标题' }, { title: '' }), /Empty/);
  assert.match(checkResources({ title: '{{name}}' }, { title: '{{username}}' }).join(), /parameters differ/);
  assert.match(checkResources({ item_one: '一项' }, { item_one: 'One item' }).join(), /Plural _other missing/);
  assert.deepEqual(checkResources({ item_one: '{{count}} 项', item_other: '{{count}} 项' }, { item_one: '{{count}} item', item_other: '{{count}} items' }), []);
  const keys = new Set(['common.save', 'common.cancel']);
  assert.deepEqual(checkTranslationCalls("t(flag ? 'common.save' : 'common.cancel')", 'sample.tsx', keys), []);
  assert.match(checkTranslationCalls("t('missing.key', '默认')", 'sample.tsx', keys).join(), /Unknown translation key/);
  assert.match(checkTranslationCalls("t('common.save', '保存')", 'sample.tsx', keys).join(), /dictionary/);
  assert.match(checkTranslationCalls('t(dynamicKey)', 'sample.tsx', keys).join(), /explicit translation keys/);
  assert.deepEqual(checkI18n().errors, []);
});

test('application initialization updates document metadata and storage events use the dedicated preference', async t => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const cache = storage({ [LANGUAGE_STORAGE_KEY]: 'en-GB', i18nextLng: 'zh-CN' });
  const fixtureWindow = Object.assign(new EventTarget(), { localStorage: cache });
  const root = { lang: 'zh-CN' };
  const meta = { content: '', setAttribute: (_name: string, content: string) => { meta.content = content; } };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fixtureWindow });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: root, querySelector: () => meta } });
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });

  const { default: i18n, i18nReady, languagePreferences } = await import('../web/src/lib/i18n.ts');
  await i18nReady;
  assert.equal(root.lang, 'en-US');
  assert.equal(i18n.t('common.save'), 'Save');
  assert.equal(i18n.t('designer.noSelection'), 'No object selected');
  assert.match(meta.content, /Media library/);
  assert.equal(cache.writes.length, 0);

  await languagePreferences.setLanguage('zh-CN');
  assert.equal(root.lang, 'zh-CN');
  assert.match(meta.content, /媒体库/);
  assert.equal(i18n.t('common.save'), '保存');
  const beforeEvents = cache.writes.length;
  cache.values.set(LANGUAGE_STORAGE_KEY, 'en-US');
  const ignored = new Event('storage');
  Object.assign(ignored, { key: 'theme-storage', storageArea: cache });
  fixtureWindow.dispatchEvent(ignored);
  assert.equal(root.lang, 'zh-CN');

  const event = new Event('storage');
  Object.assign(event, { key: LANGUAGE_STORAGE_KEY, storageArea: cache });
  fixtureWindow.dispatchEvent(event);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(root.lang, 'en-US');
  assert.equal(i18n.resolvedLanguage, 'en-US');
  assert.equal(cache.writes.length, beforeEvents);

  cache.values.clear();
  const clear = new Event('storage');
  Object.assign(clear, { key: null, storageArea: cache });
  fixtureWindow.dispatchEvent(clear);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(root.lang, 'zh-CN');
  assert.equal(cache.writes.length, beforeEvents);
});
