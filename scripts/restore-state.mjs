/**
 * Retrieve latest valid runtime data WITHOUT committing generated files to Git.
 * Order: same-repository Actions backup artifact, then already published Pages JSON.
 * If none exists, let the importer bootstrap from source rather than publish an empty site.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../src/config.js';
import { validateSnapshot } from '../src/validation.js';

const exec = promisify(execFile);
const maxDownload = 8 * 1024 * 1024;

async function limitedBody(res) {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get('content-length')) > maxDownload) throw new Error('Backup exceeds size limit');
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > maxDownload) throw new Error('Backup exceeds size limit');
  return bytes;
}

async function fromArtifacts() {
  const token = process.env.GH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repository || '')) return null;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'RTH-Watch/2.0'
  };
  const listingUrl = `https://api.github.com/repos/${repository}/actions/artifacts?name=rth-watch-state&per_page=20`;
  const list = await fetch(listingUrl, { headers, signal: AbortSignal.timeout(15000) });
  if (!list.ok) throw new Error(`Backup API HTTP ${list.status}`);
  const artifacts = (await list.json()).artifacts || [];
  const ordered = artifacts.filter(item => item.name === 'rth-watch-state' && !item.expired)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  for (const artifact of ordered.slice(0, 5)) {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'rth-watch-restore-'));
    try {
      const response = await fetch(artifact.archive_download_url, { headers, signal: AbortSignal.timeout(20000) });
      const zip = path.join(folder, 'archive.zip');
      await fs.writeFile(zip, await limitedBody(response), { mode: 0o600 });
      // GitHub's upload-artifact stores the single file at the archive root.
      const { stdout } = await exec('unzip', ['-p', zip, 'stations.json'], { maxBuffer: 5 * 1024 * 1024 });
      const data = validateSnapshot(JSON.parse(stdout), config.minStations);
      console.info(`[restore] Backup artifact #${artifact.id} loaded (${data.sourceStations.length} stations)`);
      return data;
    } catch (error) {
      console.warn(`[restore] Skipping artifact #${artifact.id}: ${error.message}`);
    } finally {
      await fs.rm(folder, { recursive: true, force: true });
    }
  }
  return null;
}

async function fromPublishedPages() {
  const base = process.env.PAGES_BASE_URL;
  if (!base || !/^https:\/\//.test(base)) return null;
  const url = new URL(`${base.replace(/\/+$/, '')}/data/stations.json`);
  url.searchParams.set('_restore', String(Date.now()));
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'follow'
  });
  const buffer = await limitedBody(response);
  const data = validateSnapshot(JSON.parse(buffer.toString('utf-8')), config.minStations);
  console.info(`[restore] Published Pages snapshot loaded (${data.sourceStations.length} stations)`);
  return data;
}

let snapshot = null;
try { snapshot = await fromArtifacts(); }
catch (error) { console.warn(`[restore] Actions backups unavailable: ${error.message}`); }
if (!snapshot) {
  try { snapshot = await fromPublishedPages(); }
  catch (error) { console.warn(`[restore] Published site unavailable: ${error.message}`); }
}
if (snapshot) {
  await fs.mkdir(path.dirname(config.stateFile), { recursive: true });
  await fs.writeFile(config.stateFile, JSON.stringify(snapshot, null, 2) + '\n', { mode: 0o600 });
  console.info('[restore] Existing dataset restored to ephemeral runner directory.');
} else {
  console.info('[restore] No previous dataset found. First run requires a successful live import.');
}
