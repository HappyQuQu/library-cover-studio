import { logger } from './logger.js';

interface RetryOptions {
  attempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (err: any) => boolean;
  label?: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry transient failures with exponential backoff. Only retries when
 * `shouldRetry(err)` is true — by default: network errors, 5xx, timeouts.
 * Does NOT retry 4xx (e.g. 404 missing image) — those are deterministic.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const initial = opts.initialDelayMs ?? 500;
  const max = opts.maxDelayMs ?? 4000;
  const label = opts.label || 'operation';
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;

  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !shouldRetry(err)) throw err;
      const delay = Math.min(initial * Math.pow(2, i), max);
      logger.warn(`↻ ${label} failed (attempt ${i + 1}/${attempts}), retrying in ${delay}ms: ${(err as any)?.message || err}`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

function defaultShouldRetry(err: any): boolean {
  // Axios timeout / network errors
  if (err?.code === 'ECONNABORTED' || err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT') return true;
  if (err?.code === 'ENOTFOUND' || err?.code === 'EAI_AGAIN') return true;
  // No response = network unreachable
  if (err?.request && !err?.response) return true;
  // 5xx server errors
  const status = err?.response?.status;
  if (typeof status === 'number' && status >= 500 && status < 600) return true;
  // 429 rate limited
  if (status === 429) return true;
  return false;
}
