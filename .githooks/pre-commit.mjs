import { spawnSync, execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
process.chdir(root);

const paths = execFileSync('git', ['diff', '--cached', '--name-only', '--no-renames', '-z'], {
  encoding: 'buffer',
}).toString('utf8').split('\0').filter(Boolean);
const obwPaths = paths.filter((path) => path.startsWith('obw/')).map((path) => path.slice(4));
const isObwDocs = (path) => path === 'README.md' || ((path.startsWith('docs/') || path.startsWith('skills/')) && path.endsWith('.md'));

function manifestOnlyUpstream() {
  let head;
  let index;
  try {
    head = execFileSync('git', ['show', 'HEAD:obw/package.json'], { encoding: 'utf8' });
  } catch {
    return false;
  }
  try {
    index = execFileSync('git', ['show', ':obw/package.json'], { encoding: 'utf8' });
  } catch {
    return false;
  }
  try {
    const before = JSON.parse(head);
    const after = JSON.parse(index);
    if (!before || !after || typeof before !== 'object' || typeof after !== 'object' || Array.isArray(before) || Array.isArray(after)) return false;
    const beforeOmp = before.omp;
    const afterOmp = after.omp;
    if (!beforeOmp || !afterOmp || typeof beforeOmp !== 'object' || typeof afterOmp !== 'object' || Array.isArray(beforeOmp) || Array.isArray(afterOmp)) return false;
    const { upstream: _beforeUpstream, ...beforeRest } = beforeOmp;
    const { upstream: _afterUpstream, ...afterRest } = afterOmp;
    return isDeepStrictEqual({ ...before, omp: beforeRest }, { ...after, omp: afterRest });
  } catch {
    return false;
  }
}

const relevant = obwPaths.filter((path) => !isObwDocs(path) && !(path === 'package.json' && manifestOnlyUpstream()));
if (relevant.length === 0) process.exit(0);
const result = spawnSync('bun', ['run', '--cwd', 'obw', 'check'], { stdio: 'inherit' });
process.exit(result.status ?? 1);
