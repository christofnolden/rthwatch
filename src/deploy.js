import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { branchHead, git, assertGit } from './git-pages.js';
import { validateSnapshot } from './validation.js';

const ALLOWED = /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:html|css|js|mjs|json|svg|png|jpg|jpeg|webp|avif|gif|bmp|ico|txt|xml|webmanifest|woff2?|ttf|otf|eot|map|wasm|pdf|csv|mp4|webm)$/;
export async function validateDist(dist, minStations = 3) {
  const files = [];
  async function visit(folder, prefix = '') {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) await visit(path.join(folder, entry.name), `${relative}/`);
      else if (entry.isFile() && (relative === '.nojekyll' || relative === 'CNAME' || ALLOWED.test(relative))) files.push(relative);
      else throw new Error(`Unsafe output path or file type: ${relative}`);
    }
  }
  await visit(dist);
  const cname = await fs.readFile(path.join(dist, 'CNAME'), 'utf8');
  if (cname.trim() !== 'rthwatch.nolden.cloud') throw new Error('CNAME must contain rthwatch.nolden.cloud');
  if (!files.includes('.nojekyll') || !files.includes('index.html') || !files.includes('data/stations.json')) {
    throw new Error('Build missing .nojekyll, index.html or data/stations.json');
  }
  const data = validateSnapshot(JSON.parse(await fs.readFile(path.join(dist, 'data/stations.json'), 'utf8')), minStations);
  return { files, data };
}
export async function deployPages({ remote, sourceSha, dist, env = process.env, authorEmail = 'ci@rth-watch.invalid',
  minStations = 3, expectedHead, beforePush = async () => {} }) {
  if (!/^[a-f0-9]{40,64}$/.test(sourceSha)) throw new Error('Invalid source commit');
  const { files, data } = await validateDist(dist, minStations);
  const currentMain = await branchHead(remote, 'main', { env });
  if (currentMain !== sourceSha) throw new Error(`Stale source commit ${sourceSha}; current main is ${currentMain || 'missing'}. Deployment skipped.`);
  const oldHead = await branchHead(remote, 'gh-pages', { env });
  if (expectedHead !== undefined && oldHead !== expectedHead) {
    throw new Error('gh-pages changed since snapshot restoration; refusing to deploy older data');
  }
  console.info(`[deploy] Previous deployment commit: ${oldHead || 'none (new orphan branch)'}`);
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'rth-watch-deploy-'));
  try {
    assertGit(await git(['init', '-q', temp], { env }), 'Initializing isolated deployment repository');
    if (oldHead) {
      assertGit(await git(['fetch', '--no-tags', remote, 'refs/heads/gh-pages'], { cwd: temp, env }), 'Fetching deployment history');
      const fetched = assertGit(await git(['rev-parse', 'FETCH_HEAD'], { cwd: temp, env }), 'Checking fetched deployment commit');
      if (fetched !== oldHead) throw new Error('gh-pages changed during fetch; deployment aborted');
      assertGit(await git(['checkout', '-q', '-b', 'gh-pages', 'FETCH_HEAD'], { cwd: temp, env }), 'Checking out deployment branch');
      for (const entry of await fs.readdir(temp)) if (entry !== '.git') await fs.rm(path.join(temp, entry), { recursive: true, force: true });
    } else {
      assertGit(await git(['checkout', '-q', '--orphan', 'gh-pages'], { cwd: temp, env }), 'Creating orphan branch');
    }
    for (const file of files) {
      const target = path.join(temp, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(path.join(dist, file), target);
    }
    assertGit(await git(['add', '--all'], { cwd: temp, env }), 'Staging website');
    const changes = await git(['diff', '--cached', '--quiet'], { cwd: temp, env });
    if (changes.code === 0) {
      console.info('[deploy] Website unchanged; no commit or push.');
      return { outcome: 'unchanged', oldHead, files: files.length, stations: data.sourceStations.length };
    }
    if (changes.code !== 1) assertGit(changes, 'Checking deployment changes');
    const email = /^[^\s@]+@[^\s@]+$/.test(authorEmail) ? authorEmail : 'ci@rth-watch.invalid';
    assertGit(await git(['-c', 'user.name=RTH Watch CI', '-c', `user.email=${email}`, 'commit', '-q', '-m', `deploy: publish RTH Watch v2.2.0 (source ${sourceSha.slice(0, 12)})`], { cwd: temp, env }), 'Committing website');
    const newHead = assertGit(await git(['rev-parse', 'HEAD'], { cwd: temp, env }), 'Reading deployment commit');
    await beforePush();
    const mainBeforePush = await branchHead(remote, 'main', { env });
    if (mainBeforePush !== sourceSha) throw new Error('main changed before push; refusing to publish stale source');
    const branchBeforePush = await branchHead(remote, 'gh-pages', { env });
    if (branchBeforePush !== oldHead) throw new Error('gh-pages changed concurrently; refusing to overwrite remote changes');
    const pushed = await git(['push', '--porcelain', remote, 'HEAD:refs/heads/gh-pages'], { cwd: temp, env });
    if (pushed.code !== 0) throw new Error(`Deployment push rejected, possibly due to a concurrent update: ${pushed.stderr || pushed.stdout}`);
    console.info(`[deploy] Forgejo push successful: ${newHead}; public GitHub Pages publication is separate.`);
    return { outcome: 'pushed', oldHead, newHead, files: files.length, stations: data.sourceStations.length };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
