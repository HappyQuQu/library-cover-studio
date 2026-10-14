import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import zhCN from '../web/src/locales/zh-CN/index.ts';
import enUS from '../web/src/locales/en-US/index.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
// Source content is deliberately independent of interface language. Exceptions are
// exact literals in one file; adding UI text to the same file is still rejected.
export const sourceTextExceptions = [
  { file: 'components/LanguageSelect.tsx', reason: 'Language names use their own language so users can find the switch.', values: ['简体中文'] },
  { file: 'lib/editorEffects.ts', reason: 'Persisted effect names identify existing canvas objects and must remain compatible.', values: ['暗角效果', '噪点效果'] },
  { file: 'lib/aiPrompt.ts', reason: 'Model instructions are source content; interface switches must not rewrite AI requests.', values: [
    '分析参考图的配色、构图和文字层级，参考其风格设计一张媒体库海报，保留主副标题变量。',
    '仅修改这些图层 ID：', '。保留这些 ID，返回完整画布 JSON。其他图层和背景必须原样保留。',
    '生成新的封面设计，保留上下文中的锁定图层。', '在当前设计上优化，保留所有现有图层 ID、图片素材和变量绑定。',
    '\n\n设计约束：', '\n所有锁定图层保持原样。',
  ] },
] as const;

export function checkUntranslatedText(text: string, filename: string): string[] {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const errors: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateHead(node)
      || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && /[\u4e00-\u9fff]/.test(node.text)) {
      const excepted = sourceTextExceptions.some(exception => exception.file === filename.replace(/^web\/src\//, '')
        && (exception.values as readonly string[]).includes(node.text));
      if (!excepted) {
        const location = source.getLineAndCharacterOfPosition(node.getStart(source));
        errors.push(`${filename}:${location.line + 1}: Move interface text into the translation dictionary`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return errors;
}

export function flattenResources(resource: unknown, prefix = ''): Record<string, string> {
  if (!resource || typeof resource !== 'object' || Array.isArray(resource)) {
    throw new Error(`Invalid translation object at ${prefix || '<root>'}`);
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(resource)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      if (!value.trim()) throw new Error(`Empty translation: ${path}`);
      result[path] = value;
    } else {
      Object.assign(result, flattenResources(value, path));
    }
  }
  return result;
}

const interpolationNames = (value: string) => [...new Set(
  [...value.matchAll(/{{\s*-?\s*([^},\s]+)(?:\s*,[^}]+)?\s*}}/g)].map(match => match[1])
)].sort();

export function checkResources(chinese: unknown, english: unknown): string[] {
  const zh = flattenResources(chinese);
  const en = flattenResources(english);
  const errors: string[] = [];
  for (const key of new Set([...Object.keys(zh), ...Object.keys(en)])) {
    if (!(key in zh) || !(key in en)) {
      errors.push(`Translation missing: ${key} (${key in zh ? 'en-US' : 'zh-CN'})`);
      continue;
    }
    if (/[\u4e00-\u9fff]/.test(en[key])) errors.push(`Untranslated English resource: ${key}`);
    if (JSON.stringify(interpolationNames(zh[key])) !== JSON.stringify(interpolationNames(en[key]))) {
      errors.push(`Interpolation parameters differ: ${key}`);
    }
    if (key.endsWith('_one') && !(key.slice(0, -4) + '_other' in zh)) {
      errors.push(`Plural _other missing: ${key}`);
    }
    if (key.endsWith('_other') && !(key.slice(0, -6) + '_one' in zh)) {
      errors.push(`Plural _one missing: ${key}`);
    }
  }
  return errors;
}

function literalKeys(expression: ts.Expression): string[] | undefined {
  if (ts.isStringLiteralLike(expression)) return [expression.text];
  if (ts.isParenthesizedExpression(expression)) return literalKeys(expression.expression);
  if (ts.isConditionalExpression(expression)) {
    const yes = literalKeys(expression.whenTrue);
    const no = literalKeys(expression.whenFalse);
    if (yes && no) return [...yes, ...no];
  }
  return undefined;
}

function stringLiteralTypes(type: ts.Type): string[] | undefined {
  if (type.isStringLiteral()) return [type.value];
  if (type.isUnion()) {
    const variants = type.types.map(stringLiteralTypes);
    if (variants.every(value => value !== undefined)) return variants.flat() as string[];
  }
  return undefined;
}

export function checkTranslationCalls(text: string, filename: string, keys: Set<string>, program?: ts.Program): string[] {
  const source = program?.getSourceFile(join(root, filename)) || ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const errors: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'toast') {
      const findBoundTranslation = (child: ts.Node): boolean =>
        (ts.isCallExpression(child) && child.expression.getText(source) === 't')
        || Boolean(ts.forEachChild(child, findBoundTranslation));
      if (findBoundTranslation(node)) {
        const location = source.getLineAndCharacterOfPosition(node.getStart(source));
        errors.push(`${filename}:${location.line + 1}: Use i18n.t in notifications so async completions follow the current language`);
      }
    }
    if (ts.isCallExpression(node) && (node.expression.getText(source) === 't'
      || node.expression.getText(source) === 'i18n.t')) {
      const location = source.getLineAndCharacterOfPosition(node.getStart(source));
      const label = `${filename}:${location.line + 1}`;
      const usedKeys = node.arguments[0] && (literalKeys(node.arguments[0])
        || (program && stringLiteralTypes(program.getTypeChecker().getTypeAtLocation(node.arguments[0]))));
      if (!usedKeys) errors.push(`${label}: Use explicit translation keys or an audited mapping`);
      for (const key of usedKeys || []) {
        if (!keys.has(key) && !(keys.has(key + '_one') && keys.has(key + '_other'))) errors.push(`${label}: Unknown translation key ${key}`);
      }
      if (node.arguments[1] && (ts.isStringLiteralLike(node.arguments[1])
        || (ts.isObjectLiteralExpression(node.arguments[1]) && node.arguments[1].properties.some(property =>
          ts.isPropertyAssignment(property) && property.name.getText(source).replace(/['\"]/g, '') === 'defaultValue')))) {
        errors.push(`${label}: Put the default text in the dictionary`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return errors;
}

const walk = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)]);

export function checkI18n(): { errors: string[]; keyCount: number } {
  const errors = checkResources(zhCN, enUS);
  const keys = new Set(Object.keys(flattenResources(zhCN)));
  const config = ts.readConfigFile(join(root, 'web/tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, join(root, 'web'));
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  for (const file of walk(join(root, 'web/src')).filter(path => /\.tsx?$/.test(path) && !path.includes('/locales/'))) {
    const text = readFileSync(file, 'utf8');
    errors.push(...checkUntranslatedText(text, relative(root, file)));
    if (text.includes('useTranslation') || text.includes('i18n.t(')) {
      errors.push(...checkTranslationCalls(text, relative(root, file), keys, program));
    }
  }
  return { errors, keyCount: keys.size };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = checkI18n();
    if (result.errors.length) throw new Error(result.errors.join('\n'));
    console.log(`i18n checks passed: ${result.keyCount} keys in each language; calls and interpolation parameters match.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
