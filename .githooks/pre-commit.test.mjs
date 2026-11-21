import assert from 'node:assert/strict';
import { afterEach, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('./pre-commit', import.meta.url));
const helper = fileURLToPath(new URL('./pre-commit.mjs', import.meta.url));
const baseManifest = { name: 'obw', omp: { extensions: ['./index.ts'], upstream: 'abc' }, scripts: { check: 'node verify.cjs' }, dependencies: { x: '1' } };

const fixtures = [];
afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(initial = true) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pre-commit-test-'));
  fixtures.push(dir);
  const hooks = path.join(dir, '.githooks');
  mkdirSync(hooks);
  copyFileSync(hook, path.join(hooks, 'pre-commit'));
  copyFileSync(helper, path.join(hooks, 'pre-commit.mjs'));
  mkdirSync(path.join(dir, 'obw'));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
  env.GIT_CONFIG_GLOBAL = path.join(dir, 'global-config');
  env.GIT_CONFIG_NOSYSTEM = '1';
  const git = (...args) => execFileSync('git', args, { cwd: dir, env, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'hook@example.test');
  git('config', 'user.name', 'Hook Test');
  writeFileSync(path.join(dir, 'obw/package.json'), JSON.stringify(baseManifest));
  writeFileSync(path.join(dir, 'obw/index.ts'), 'export {};\n');
  writeFileSync(path.join(dir, 'obw/verify.cjs'), "require('node:fs').writeFileSync(process.env.MARKER, 'ran'); process.exit(Number(process.env.CHECK_RC || 0));\n");
  if (initial) { git('add', '.'); git('commit', '-qm', 'initial'); }
  return { dir, env, git };
}

function run(f, stagePaths = [], options = {}) {
  for (const file of stagePaths) f.git('add', '--', file);
  const marker = path.join(f.dir, 'check-marker');
  const env = { ...f.env, MARKER: marker, ...options.env };
  if (options.index) env.GIT_INDEX_FILE = options.index;
  const result = spawnSync('sh', [path.join(f.dir, '.githooks/pre-commit')], { cwd: f.dir, env, encoding: 'utf8' });
  let ran = false;
  try { readFileSync(marker); ran = true; } catch {}
  return { result, ran };
}

const it = (name, fn) => test(name, fn);

it('skips nested documentation without an SDK or check script', () => {
  const f = fixture();
  rmSync(path.join(f.dir, 'obw/verify.cjs'));
  mkdirSync(path.join(f.dir, 'obw/docs/nested'), { recursive: true });
  writeFileSync(path.join(f.dir, 'obw/README.md'), 'docs');
  writeFileSync(path.join(f.dir, 'obw/docs/nested/page.md'), 'docs');
  const { result, ran } = run(f, ['obw/README.md', 'obw/docs/nested/page.md']);
  assert.equal(result.status, 0); assert.equal(ran, false);
});
it('skips an upstream-only manifest edit with reordered keys', () => {
  const f = fixture();
  writeFileSync(path.join(f.dir, 'obw/package.json'), JSON.stringify({ dependencies: baseManifest.dependencies, omp: { upstream: 'def', extensions: ['./index.ts'] }, scripts: baseManifest.scripts, name: baseManifest.name }, null, 2));
  const { result, ran } = run(f, ['obw/package.json']);
  assert.equal(result.status, 0); assert.equal(ran, false);
});

for (const [name, file, contents] of [
  ['source changes invoke check', 'obw/index.ts', 'changed'],
  ['dependency changes invoke check', 'obw/package.json', JSON.stringify({ ...baseManifest, dependencies: { x: '2' } })],
]) it(name, () => {
  const f = fixture();
  writeFileSync(path.join(f.dir, file), contents);
  const { result, ran } = run(f, [file]);
  assert.equal(result.status, 0); assert.equal(ran, true);
});

it('propagates the check command exit status', () => {
  const f = fixture();
  writeFileSync(path.join(f.dir, 'obw/index.ts'), 'changed');
  const { result, ran } = run(f, ['obw/index.ts'], { env: { CHECK_RC: '23' } });
  assert.equal(result.status, 23); assert.equal(ran, true);
});

it('uses staged rather than unstaged content', () => {
  const f = fixture();
  writeFileSync(path.join(f.dir, 'obw/README.md'), 'staged docs');
  f.git('add', '--', 'obw/README.md');
  writeFileSync(path.join(f.dir, 'obw/index.ts'), 'unstaged runtime');
  const { result, ran } = run(f);
  assert.equal(result.status, 0); assert.equal(ran, false);
});

it('requires checks when a rename moves a source out of obw', () => {
  const f = fixture();
  f.git('mv', 'obw/index.ts', 'outside.ts');
  const { result, ran } = run(f);
  assert.equal(result.status, 0); assert.equal(ran, true);
});
it('handles an initial repository without HEAD', () => {
  const f = fixture(false);
  mkdirSync(path.join(f.dir, 'obw/docs'), { recursive: true });
  writeFileSync(path.join(f.dir, 'obw/docs/first.md'), 'docs');
  const { result, ran } = run(f, ['obw/docs/first.md']);
  assert.equal(result.status, 0); assert.equal(ran, false);
});

it('skips nested documentation paths containing newlines', () => {
  const f = fixture();
  const file = 'obw/docs/line\nbreak.md';
  mkdirSync(path.dirname(path.join(f.dir, file)), { recursive: true });
  writeFileSync(path.join(f.dir, file), 'docs');
  const { result, ran } = run(f, [file]);
  assert.equal(result.status, 0); assert.equal(ran, false);
});

it('handles unusual staged paths', () => {
  const f = fixture();
  const file = 'obw/space\nand tab\tname.ts';
  writeFileSync(path.join(f.dir, file), 'x');
  const { result, ran } = run(f, [file]);
  assert.equal(result.status, 0); assert.equal(ran, true);
});

for (const [name, contents] of [['malformed manifest fails closed', '{'], ['deleted manifest fails closed', null]]) it(name, () => {
  const f = fixture();
  if (contents === null) f.git('rm', '-q', 'obw/package.json');
  else writeFileSync(path.join(f.dir, 'obw/package.json'), contents);
  const { result } = run(f, contents === null ? [] : ['obw/package.json']);
  assert.notEqual(result.status, 0);
});

it('honors a private index for selective commits', () => {
  const f = fixture();
  const index = path.join(f.dir, 'private-index');
  const env = { ...f.env, GIT_INDEX_FILE: index };
  execFileSync('git', ['read-tree', 'HEAD'], { cwd: f.dir, env });
  mkdirSync(path.join(f.dir, 'obw/docs'), { recursive: true });
  writeFileSync(path.join(f.dir, 'obw/docs/private.md'), 'docs');
  execFileSync('git', ['add', '--', 'obw/docs/private.md'], { cwd: f.dir, env });
  writeFileSync(path.join(f.dir, 'obw/index.ts'), 'staged runtime');
  f.git('add', '--', 'obw/index.ts');
  writeFileSync(path.join(f.dir, 'obw/index.ts'), 'export {};\n');
  const { result, ran } = run(f, [], { index });
  assert.equal(result.status, 0); assert.equal(ran, false);
});
