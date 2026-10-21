import { execFileSync } from 'node:child_process';
import { getRelease, resolveFiles, syncFiles, SYNC_MESSAGE } from '@pfxamd/release-core';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
}).trim();

function current() {
  const { config, history, release } = getRelease(root);
  const files = resolveFiles(root, config, release, history.commits);
  return { config, release, files };
}

function publish() {
  const expectedHead = git('rev-parse', 'HEAD');
  git('fetch', 'origin', 'main');
  if (git('rev-parse', 'origin/main') !== expectedHead) {
    console.log('Main advanced; the new commit will synchronize its metadata.');
    return;
  }
  const { release, files } = current();
  syncFiles(root, files);
  git('add', '--', ...files.keys());
  if (!git('diff', '--cached', '--name-only')) {
    console.log('Release metadata already synchronized:', release.version);
    return;
  }
  git('-c', 'user.name=github-actions[bot]',
    '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit', '-m', SYNC_MESSAGE);
  try {
    git('push', 'origin', 'HEAD:main');
  } catch (error) {
    git('fetch', 'origin', 'main');
    if (git('rev-parse', 'origin/main') !== expectedHead) {
      console.log('Main changed while publishing; its own build will update metadata.');
      return;
    }
    throw error;
  }
}

const mode = process.argv[2] || '--resolve';
if (mode === '--publish') publish();
else {
  const { config, release, files } = current();
  if (mode === '--sync') {
    console.log(JSON.stringify({ ...release, changed: syncFiles(root, files) }, null, 2));
  } else if (mode === '--check') {
    const changed = syncFiles(root, files, true);
    if (changed.length) { console.error('Outdated release files: ' + changed.join(', ')); process.exitCode = 1; }
    else console.log(JSON.stringify(release, null, 2));
  } else if (mode === '--resolve') console.log(JSON.stringify(release, null, 2));
  else { console.error('Unsupported option: ' + mode); process.exitCode = 2; }
}
