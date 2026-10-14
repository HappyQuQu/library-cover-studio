import { copyFileSync } from 'node:fs';

copyFileSync(new URL('../../CHANGELOG.md', import.meta.url), new URL('../dist/CHANGELOG.md', import.meta.url));
