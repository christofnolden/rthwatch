import fs from 'node:fs/promises';
import { branchHead, git, assertGit } from './git-pages.js';
import { validateSnapshot } from './validation.js';

const PUBLIC_SNAPSHOT = 'https://rthwatch.nolden.cloud/data/stations.json';
const MAX_BYTES = 8 * 1024 * 1024;
function validated(bytes, minStations) {
  if (Buffer.byteLength(bytes) > MAX_BYTES) throw new Error('Snapshot exceeds size limit');
  return validateSnapshot(JSON.parse(bytes.toString()), minStations);
}
export async function restoreSnapshot({ remote, cwd, env, minStations, fetchImpl = fetch,
  publicUrl = PUBLIC_SNAPSHOT, backupPath } = {}) {
  const head = await branchHead(remote, 'gh-pages', { cwd, env });
  if (head) {
    const fetched = await git(['fetch', '--no-tags', '--depth=1', remote, 'refs/heads/gh-pages'], { cwd, env });
    assertGit(fetched, 'Fetching gh-pages');
    const shown = await git(['show', 'FETCH_HEAD:data/stations.json'], { cwd, env });
    const raw = assertGit(shown, 'Reading gh-pages snapshot');
    const data = validated(Buffer.from(raw), minStations);
    return { data, source: 'gh-pages', head };
  }
  try {
    const response = await fetchImpl(publicUrl, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Snapshot exceeds size limit');
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > MAX_BYTES) throw new Error('Snapshot exceeds size limit');
      chunks.push(chunk);
    }
    const data = validated(Buffer.concat(chunks), minStations);
    return { data, source: 'legacy public website', head: null };
  } catch (error) {
    console.warn(`[restore] Initial website snapshot unavailable: ${error.message}`);
  }
  if (backupPath) {
    if ((await fs.stat(backupPath)).size > MAX_BYTES) throw new Error('Migration backup exceeds size limit');
    const data = validated(await fs.readFile(backupPath), minStations);
    return { data, source: 'local migration backup', head: null };
  }
  return { data: null, source: 'fresh bootstrap', head: null };
}
