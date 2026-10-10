import { readFileSync } from 'node:fs';

// This relative location is identical under src/config and dist/config.
export const APP_VERSION: string = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
