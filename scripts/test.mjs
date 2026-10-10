import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const backend = fileURLToPath(new URL('../backend/', import.meta.url));
const tests = new URL('../tests/', import.meta.url);
// Direct node:test execution avoids Node 22's stdout deserialization bug
// (nodejs/node#65934). Keep a fresh process for each file's database and env.
let failures = 0;
for (const name of readdirSync(tests).filter(name => name.endsWith('.test.ts')).sort()) {
  console.log(`Running ${name}`);
  const result = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL(name, tests))], {
    cwd: backend, stdio: 'inherit'
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) failures++;
}
process.exitCode = failures ? 1 : 0;
