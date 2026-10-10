import cron from 'node-cron';
import { CronExpressionParser } from 'cron-parser';

/** Preview the same numeric step and day-intersection rules used by node-cron 3. */
export function getUpcomingExecutions(expression: string, timezone: string, count = 3, now = new Date()): string[] {
  const parts = expression.trim().split(/\s+/);
  if (![5, 6].includes(parts.length) || !cron.validate(expression.trim())) throw new Error('无效的 Cron 表达式，请检查字段和数值范围');
  const six = parts.length === 5 ? ['0', ...parts] : parts;
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const weekNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const bounds = [[0, 59], [0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  const normalized = six.map((field, index) => {
    let text = field.toLowerCase();
    if (index === 5) text = text.replace('7', '0');
    const names = index === 4 ? monthNames : index === 5 ? weekNames : [];
    names.forEach((name, value) => { text = text.replace(new RegExp(`${name}|${name.slice(0, 3)}`, 'g'), String(index === 4 ? value + 1 : value)); });
    const [range, stepText] = text.split('/');
    const step = stepText ? Number(stepText) : 1;
    const values: number[] = [];
    for (const part of range.split(',')) {
      const [min, max] = part === '*' ? bounds[index]
        : part.includes('-') ? part.split('-').map(Number).sort((a, b) => a - b) : [Number(part), Number(part)];
      for (let value = min; value <= max; value++) if (value % step === 0) values.push(value);
    }
    return [...new Set(values)].sort((a, b) => a - b).join(',');
  });
  const full = CronExpressionParser.parse(normalized.join(' '), { tz: timezone, currentDate: now });
  // node-cron combines day of month AND day of week; standard cron parsers use OR.
  normalized[5] = '*';
  const iterator = CronExpressionParser.parse(normalized.join(' '), { tz: timezone, currentDate: now });
  const result: string[] = [];
  for (let attempts = 0; attempts < 2000 && result.length < count; attempts++) {
    const date = iterator.next();
    if (full.fields.dayOfWeek.values.some(value => value === date.getDay()) && full.fields.hour.values.some(value => value === date.getHours())) {
      result.push(date.toDate().toISOString());
    } else {
      // Skip a nonmatching local day without iterating through every minute.
      date.setHours(23); date.setMinutes(59); date.setSeconds(59);
      iterator.reset(date);
    }
  }
  if (result.length !== count) throw new Error('此表达式无法计算后续执行时间，请调整日期或星期条件');
  return result;
}
