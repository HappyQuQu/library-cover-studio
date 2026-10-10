import express, { type Express, type Request } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { createError } from './errorHandler.js';

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

function originVariants(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) return [];
    const origins = [url.origin];
    // Local frontends may use any loopback spelling, but must keep scheme and port.
    if (LOOPBACK_HOSTS.includes(url.hostname)) {
      for (const hostname of LOOPBACK_HOSTS) {
        url.hostname = hostname;
        origins.push(url.origin);
      }
    }
    return origins;
  } catch {
    return [];
  }
}

export function createCorsMiddleware(webHosted: boolean) {
  return cors<Request>((req, done) => {
    const allowedOrigins = new Set([
      'http://localhost:5173', 'http://localhost:5174',
      'http://localhost:5175', 'http://localhost:5176',
      process.env.FRONTEND_URL,
      ...(webHosted ? [`${req.protocol}://${req.get('host')}`] : [])
    ].flatMap(originVariants));
    done(null, {
      credentials: true,
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) callback(null, true);
        else callback(createError('Not allowed by CORS', 403, 'CORS_ORIGIN_DENIED'));
      }
    });
  });
}

export function mountWebApp(app: Express, directory: string) {
  const root = path.resolve(directory);
  const index = path.join(root, 'index.html');
  if (!fs.existsSync(index)) throw new Error(`Frontend build missing: ${index}`);
  const serveStatic = express.static(root, {
    index: false,
    setHeaders: (response, filename) => {
      response.setHeader('Cache-Control', filename.startsWith(path.join(root, 'assets') + path.sep)
        ? 'public, max-age=31536000, immutable' : 'no-cache');
    }
  });
  app.use((req, res, next) => {
    // Unknown API routes must remain JSON 404s, never return the SPA.
    if (req.path === '/api' || req.path.startsWith('/api/')) return next();
    return serveStatic(req, res, next);
  });
  app.use((req, res, next) => {
    let pathname: string;
    try { pathname = decodeURIComponent(req.path); }
    catch { return next(); }
    if (!['GET', 'HEAD'].includes(req.method) || !req.accepts('html') ||
      pathname === '/api' || pathname.startsWith('/api/') ||
      pathname === '/assets' || pathname.startsWith('/assets/') ||
      pathname.split('/').some(segment => segment.startsWith('.')) || path.extname(pathname)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
