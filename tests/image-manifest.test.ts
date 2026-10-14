import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const image = 'example/library-cover-studio', source = 'a'.repeat(40);
const digest = (arch: string) => `sha256:${(arch === 'amd64' ? '1' : '2').repeat(64)}`;

function fixture(t: any) {
  const directory = mkdtempSync(join(tmpdir(), 'lcs-image-manifest-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const digests = join(directory, 'digests'), log = join(directory, 'docker-call.json');
  mkdirSync(digests);
  writeFileSync(join(directory, 'docker'), '#!/usr/bin/env python3\nimport json,os,sys\njson.dump(sys.argv[1:],open(os.environ["DOCKER_CALL_LOG"],"w"))\nsys.exit(int(os.environ.get("DOCKER_EXIT", "0")))\n', { mode: 0o755 });
  const record = (arch: string, changes = {}) => ({ image, source, version, arch, digest: digest(arch), ...changes });
  const write = (arch: string, changes = {}) => writeFileSync(join(digests, arch + '.json'), JSON.stringify(record(arch, changes)));
  write('amd64'); write('arm64');
  const metadata = { tags: [image + ':latest', image + ':1.8.1', image + ':sha-aaaaaaa'], labels: { 'org.opencontainers.image.revision': source } };
  const run = (changes = {}, environment = {}) => {
    const path = join(directory, 'metadata.json'); writeFileSync(path, JSON.stringify({ ...metadata, ...changes }));
    return spawnSync('python3', [join(root, 'scripts/publish-manifest.py'), '--image', image, '--source', source, '--digests', digests, '--metadata', path], {
      cwd: root, encoding: 'utf8', env: { ...process.env, PATH: directory + delimiter + process.env.PATH, DOCKER_CALL_LOG: log, ...environment }
    });
  };
  return { directory, digests, log, write, metadata, run };
}

test('publication promotes the exact two verified image digests to all requested tags without rebuilding', t => {
  const f = fixture(t), result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(f.log, 'utf8')), ['buildx', 'imagetools', 'create',
    ...f.metadata.tags.flatMap(tag => ['--tag', tag]), image + '@' + digest('amd64'), image + '@' + digest('arm64')]);
});

test('publication fails before contacting the registry when an architecture, source, version or metadata is invalid', async t => {
  const cases = [
    { name: 'missing architecture', change: (f: ReturnType<typeof fixture>) => rmSync(join(f.digests, 'arm64.json')) },
    { name: 'wrong source commit', change: (f: ReturnType<typeof fixture>) => f.write('arm64', { source: 'b'.repeat(40) }) },
    { name: 'wrong source version', change: (f: ReturnType<typeof fixture>) => f.write('arm64', { version: '0.0.0' }) },
    { name: 'wrong architecture', change: (f: ReturnType<typeof fixture>) => f.write('arm64', { arch: 'amd64' }) },
    { name: 'wrong registry repository', change: (f: ReturnType<typeof fixture>) => f.write('arm64', { image: 'other/image' }) },
    { name: 'invalid digest', change: (f: ReturnType<typeof fixture>) => f.write('arm64', { digest: 'latest' }) },
    { name: 'duplicate platform digest', change: (f: ReturnType<typeof fixture>) => f.write('arm64', { digest: digest('amd64') }) },
    { name: 'unrelated record', change: (f: ReturnType<typeof fixture>) => f.write('extra') }
  ];
  for (const c of cases) await t.test(c.name, t => {
    const f = fixture(t); c.change(f);
    assert.notEqual(f.run().status, 0);
    assert.equal(existsSync(f.log), false);
  });
  for (const metadata of [{ tags: [] }, { tags: ['other/image:latest'] }, { tags: [image + ':bad tag'] }, { labels: { 'org.opencontainers.image.revision': 'b'.repeat(40) } }]) {
    const f = fixture(t);
    assert.notEqual(f.run(metadata).status, 0);
    assert.equal(existsSync(f.log), false);
  }
});

test('registry publication failures propagate to the workflow', t => {
  const f = fixture(t), result = f.run({}, { DOCKER_EXIT: '1' });
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(f.log), true);
});
