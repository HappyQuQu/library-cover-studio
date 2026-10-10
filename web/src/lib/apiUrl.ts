/** Resolve API-owned static files against the same base as the API client. */
export function resolveApiUrl(resource: string, base = '/api'): string {
  if (/^(?:https?:|data:|blob:)/i.test(resource)) return resource;
  const relative = resource.replace(/^\/api(?=\/|$)/, '').replace(/^\/+/, '');
  return `${base.replace(/\/+$/, '')}/${relative}`;
}
