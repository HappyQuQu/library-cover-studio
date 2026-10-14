/** Preserve provider diagnostics while giving clients a stable, language-independent code. */
export function aiFailureCode(error: unknown, hasImages = false): string {
  const value = error as { code?: unknown; status?: number; statusCode?: number; response?: { status?: number }; message?: string } | null;
  if (typeof value?.code === 'string' && /^(?:AI_|REFERENCE_|SSE_|UNAUTHORIZED$)/.test(value.code)) return value.code;
  if (hasImages && /(?:not support|unsupported|does not|cannot).*(?:image|vision|multimodal)|(?:image|vision).*(?:not support|unsupported)/i.test(value?.message || '')) return 'AI_IMAGE_UNSUPPORTED';
  const status = value?.status ?? value?.statusCode ?? value?.response?.status;
  if (status === 401 || status === 403) return 'AI_UPSTREAM_UNAUTHORIZED';
  if (status === 429) return 'AI_RATE_LIMIT';
  if (status === 408 || status === 504 || ['ETIMEDOUT', 'ECONNABORTED', 'ERR_CANCELED'].includes(String(value?.code))) return 'AI_TIMEOUT';
  return 'AI_REQUEST_FAILED';
}
