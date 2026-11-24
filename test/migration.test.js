import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { branchHead } from '../src/git-pages.js';
import { restoreSnapshot } from '../src/restore.js';
import { deployPages, validateDist } from '../src/deploy.js';
import { reconcileDecision, recordReconcile } from '../src/reconcile.js';
import { selectWorkflowMode } from '../src/workflow-mode.js';

const exec = promisify(execFile);
async function command(cwd, ...args) { return (await exec('git', args, { cwd })).stdout.trim(); }
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rth-watch-test-'));
  const remote = path.join(root, 'remote.git');
  const source = path.join(root, 'source');
  const dist = path.join(root, 'dist');
  await command(root, 'init', '--bare', '-q', remote);
  await fs.mkdir(source);
  await command(source, 'init', '-q');
  await command(source, 'checkout', '-q', '-b', 'main');
  await fs.writeFile(path.join(source, 'README.md'), 'source only\n');
  await command(source, 'add', '.');
  await command(source, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '-m', 'source');
  const sha = await command(source, 'rev-parse', 'HEAD');
  await command(source, 'push', '-q', remote, 'HEAD:refs/heads/main');
  await fs.mkdir(path.join(dist, 'data'), { recursive: true });
  await fs.mkdir(path.join(dist, 'assets'));
  const station = { id: 1, callsign: 'Christoph 1', rthUrl: 'https://www.rth.info/stationen.db/station.php?id=1&show=1' };
  const data = { schemaVersion: 2, generatedAt: '2026-11-24T09:00:00Z',
    sourceStations: [station], registrations: {}, stations: [station],
    status: { lastStationsSync: '2026-11-24T09:00:00Z', lastAircraftSync: '2026-11-24T08:30:00Z', lastResult: { errors: 0 }, total: 1, mapped: 0 } };
  await fs.writeFile(path.join(dist, 'data/stations.json'), JSON.stringify(data));
  await fs.writeFile(path.join(dist, 'index.html'), '<h1>test</h1>');
  await fs.writeFile(path.join(dist, 'assets/app.js'), 'void 0;');
  await fs.writeFile(path.join(dist, '.nojekyll'), '');
  await fs.writeFile(path.join(dist, 'CNAME'), 'rthwatch.nolden.cloud\n');
  return { root, remote, source, dist, sha, data, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}
test('orphan initialization, clean website, history preserving update and unchanged build', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const first = await deployPages({ remote: f.remote, sourceSha: f.sha, dist: f.dist, minStations: 1, expectedHead: null });
  assert.equal(first.outcome, 'pushed');
  await assert.rejects(deployPages({ remote: f.remote, sourceSha: f.sha, dist: f.dist, minStations: 1, expectedHead: null }),
    /changed since snapshot restoration/);
  const rootCommitParents = await command(f.remote, 'rev-list', '--parents', first.newHead);
  assert.equal(rootCommitParents, first.newHead);
  const tree = (await command(f.remote, 'ls-tree', '-r', '--name-only', first.newHead)).split('\n').sort();
  assert.deepEqual(tree, ['.nojekyll', 'CNAME', 'assets/app.js', 'data/stations.json', 'index.html']);
  assert.equal(await branchHead(f.remote, 'main'), f.sha);
  const unchanged = await deployPages({ remote: f.remote, sourceSha: f.sha, dist: f.dist, minStations: 1 });
  assert.equal(unchanged.outcome, 'unchanged');
  await fs.writeFile(path.join(f.dist, 'index.html'), '<h1>updated</h1>');
  const second = await deployPages({ remote: f.remote, sourceSha: f.sha, dist: f.dist, minStations: 1 });
  assert.equal(second.outcome, 'pushed');
  assert.equal(await command(f.remote, 'show', '-s', '--format=%P', second.newHead), first.newHead);
  assert.equal(await branchHead(f.remote, 'main'), f.sha);
  assert.match(await command(f.remote, 'log', '-1', '--format=%an <%ae>', second.newHead), /RTH Watch CI/);
});
test('restore valid gh-pages and reject corrupt published branch without fallback', async t => {
  const f = await fixture(); t.after(f.cleanup);
  await deployPages({ remote: f.remote, sourceSha: f.sha, dist: f.dist, minStations: 1 });
  let network = 0;
  const restored = await restoreSnapshot({ remote: f.remote, cwd: f.source, minStations: 1,
    fetchImpl: () => { network++; throw new Error('no network'); } });
  assert.equal(restored.source, 'gh-pages');
  assert.equal(restored.data.sourceStations.length, 1);
  assert.equal(network, 0);
  const bad = path.join(f.root, 'bad');
  await command(f.root, 'clone', '-q', '-b', 'gh-pages', f.remote, bad);
  await fs.writeFile(path.join(bad, 'data/stations.json'), '{}');
  await command(bad, 'add', '.');
  await command(bad, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '-m', 'damage');
  await command(bad, 'push', '-q', 'origin', 'gh-pages');
  await assert.rejects(restoreSnapshot({ remote: f.remote, cwd: f.source, minStations: 1,
    fetchImpl: () => { network++; throw new Error('no network'); } }), /Invalid RTH Watch/);
  assert.equal(network, 0);
});
test('initial public fallback, backup and bootstrap are only used without gh-pages', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const fromWeb = await restoreSnapshot({ remote: f.remote, cwd: f.source, minStations: 1,
    fetchImpl: async () => new Response(JSON.stringify(f.data), { status: 200 }) });
  assert.equal(fromWeb.source, 'legacy public website');
  const backup = path.join(f.root, 'backup.json');
  await fs.writeFile(backup, JSON.stringify(f.data));
  const fromBackup = await restoreSnapshot({ remote: f.remote, cwd: f.source, minStations: 1, backupPath: backup,
    fetchImpl: async () => new Response('unavailable', { status: 503 }) });
  assert.equal(fromBackup.source, 'local migration backup');
  const bootstrap = await restoreSnapshot({ remote: f.remote, cwd: f.source, minStations: 1,
    fetchImpl: async () => new Response('unavailable', { status: 503 }) });
  assert.equal(bootstrap.data, null);
  await fs.writeFile(backup, '{}');
  await assert.rejects(restoreSnapshot({ remote: f.remote, cwd: f.source, minStations: 1, backupPath: backup,
    fetchImpl: async () => new Response('unavailable', { status: 503 }) }), /Invalid RTH Watch/);
});
test('invalid build, stale source and concurrent update never publish', async t => {
  const f = await fixture(); t.after(f.cleanup);
  await fs.writeFile(path.join(f.dist, 'CNAME'), 'wrong.example\n');
  await assert.rejects(deployPages({ remote: f.remote, sourceSha: f.sha, dist: f.dist, minStations: 1 }), /CNAME/);
  await fs.writeFile(path.join(f.dist, 'CNAME'), 'rthwatch.nolden.cloud\n');
  await assert.rejects(deployPages({ remote: f.remote, sourceSha: '0'.repeat(40), dist: f.dist, minStations: 1 }), /Stale source/);
  const first = await deployPages({ remote: f.remote, sourceSha: f.sha, dist: f.dist, minStations: 1 });
  await fs.writeFile(path.join(f.dist, 'index.html'), 'new');
  const beforePush = async () => {
    const other = path.join(f.root, 'other');
    await command(f.root, 'clone', '-q', '-b', 'gh-pages', f.remote, other);
    await fs.writeFile(path.join(other, 'index.html'), 'concurrent');
    await command(other, 'add', '.');
    await command(other, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '-m', 'other');
    await command(other, 'push', '-q', 'origin', 'gh-pages');
  };
  await assert.rejects(deployPages({ remote: f.remote, sourceSha: f.sha, dist: f.dist, minStations: 1, beforePush }), /changed concurrently/);
  assert.notEqual(await branchHead(f.remote, 'gh-pages'), first.newHead);
  assert.equal(await branchHead(f.remote, 'main'), f.sha);
  await fs.writeFile(path.join(f.dist, 'data/stations.json'), '{}');
  await assert.rejects(validateDist(f.dist, 1), /Invalid RTH Watch/);
});
test('branch lookup distinguishes missing branch from remote failure', async t => {
  const f = await fixture(); t.after(f.cleanup);
  assert.equal(await branchHead(f.remote, 'gh-pages'), null);
  await assert.rejects(branchHead(path.join(f.root, 'missing.git'), 'gh-pages'), /Reading gh-pages failed/);
});
test('workflow mode selection rejects unknown events, schedules and branches', () => {
  const ref = 'refs/heads/main';
  for (const mode of ['full', 'stations', 'aircraft', 'publish', 'reconcile'])
    assert.equal(selectWorkflowMode('workflow_dispatch', ref, null, mode), mode);
  assert.equal(selectWorkflowMode('push', ref), 'publish');
  assert.equal(selectWorkflowMode('schedule', ref, '30 9 * * *'), 'aircraft');
  assert.equal(selectWorkflowMode('schedule', ref, '0 10,14,18 * * *'), 'stations');
  assert.equal(selectWorkflowMode('schedule', ref, '30 11-22 * * *'), 'reconcile');
  assert.throws(() => selectWorkflowMode('schedule', ref, '0 0 * * *'), /Unexpected schedule/);
  assert.throws(() => selectWorkflowMode('push', 'refs/heads/gh-pages'), /Only refs/);
  assert.throws(() => selectWorkflowMode('workflow_dispatch', ref, null, 'evil'), /Invalid manual/);
});
test('reconcile honors Berlin DST, partial imports, retry limits and persistence', () => {
  assert.equal(reconcileDecision(null).mode, null);
  const base = { status: { lastStationsSync: '2026-03-29T08:05:00Z',
    lastStationsCompleteSync: '2026-03-28T17:05:00Z', lastAircraftSync: '2026-03-29T07:35:00Z',
    lastResult: { errors: 1 } } };
  const now = new Date('2026-03-29T09:30:00Z'); // 11:30 CEST
  const due = reconcileDecision(base, now);
  assert.equal(due.mode, 'stations');
  assert.equal(due.slots.stations, '2026-03-29T08:00:00.000Z');
  const first = structuredClone(base);
  recordReconcile(first, base, due, now);
  assert.equal(first.status.reconcile.stations.attempts, 1);
  assert.equal(reconcileDecision(first, new Date(now.getTime() + 30 * 60000)).mode, null);
  const secondAt = new Date(now.getTime() + 60 * 60000);
  const secondDue = reconcileDecision(first, secondAt);
  assert.equal(secondDue.mode, 'stations');
  const second = structuredClone(first);
  recordReconcile(second, first, secondDue, secondAt);
  assert.equal(reconcileDecision(second, new Date(secondAt.getTime() + 61 * 60000)).mode, null);
  assert.equal(reconcileDecision(second, new Date('2026-03-29T14:30:00Z')).mode, 'stations'); // next 14:00 CEST slot
  const winter = reconcileDecision({ status: { lastStationsSync: '2026-11-23T17:05:00Z', lastResult: { errors: 0 },
    lastAircraftSync: '2026-11-23T08:35:00Z' } }, new Date('2026-11-24T10:30:00Z'));
  assert.equal(winter.slots.stations, '2026-11-24T09:00:00.000Z');
  assert.equal(winter.slots.aircraft, '2026-11-24T08:30:00.000Z');
  assert.equal(winter.mode, 'full');
  const complete = { status: { lastStationsCompleteSync: '2026-11-24T09:05:00Z', lastAircraftSync: '2026-11-24T08:35:00Z' } };
  assert.equal(reconcileDecision(complete, new Date('2026-11-24T10:30:00Z')).mode, null);
});
test('reconcile with no pending import exits before network, build and deployment', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const temp = path.join(f.root, 'no-due');
  await fs.mkdir(path.join(temp, '.state'), { recursive: true });
  const snapshot = structuredClone(f.data);
  snapshot.sourceStations = [1, 2, 3].map(id => ({ id, callsign: `Christoph ${id}`,
    rthUrl: `https://www.rth.info/stationen.db/station.php?id=${id}&show=1` }));
  snapshot.stations = snapshot.sourceStations;
  snapshot.status.lastStationsCompleteSync = new Date().toISOString();
  snapshot.status.lastAircraftSync = new Date().toISOString();
  await fs.writeFile(path.join(temp, '.state/stations.json'), JSON.stringify(snapshot));
  const result = await exec('node', [new URL('../scripts/generate.mjs', import.meta.url).pathname, '--mode=reconcile'],
    { cwd: temp, env: { ...process.env, RTH_MIN_STATIONS: '3' } });
  assert.match(result.stdout, /No import due; no build or deployment/);
  await assert.rejects(fs.stat(path.join(temp, 'dist')), { code: 'ENOENT' });
});
test('two restored publish builds produce byte-identical website files', async t => {
  const f = await fixture(); t.after(f.cleanup);
  const work = path.join(f.root, 'repeat-build');
  await fs.mkdir(path.join(work, '.state'), { recursive: true });
  await fs.cp(new URL('../public/', import.meta.url), path.join(work, 'public'), { recursive: true });
  await fs.cp(new URL('../config/', import.meta.url), path.join(work, 'config'), { recursive: true });
  const snapshot = structuredClone(f.data);
  snapshot.sourceStations = [3, 1, 2].map(id => ({ id, callsign: `Christoph ${id}`,
    registration: id === 2 ? 'D-HXAD' : 'D-HUTH',
    rthUrl: `https://www.rth.info/stationen.db/station.php?id=${id}&show=1` }));
  snapshot.stations = [...snapshot.sourceStations].sort((a, b) => a.id - b.id);
  snapshot.registrations = { DHXAD: '3e0f5f', DHUTH: '3e0965' };
  snapshot.status.total = 3;
  snapshot.status.mapped = 3;
  snapshot.status.noRegistration = 0;
  snapshot.status.timezone = 'Europe/Berlin';
  snapshot.status.lastStationsCompleteSync = snapshot.status.lastStationsSync;
  await fs.writeFile(path.join(work, '.state/stations.json'), JSON.stringify(snapshot));
  const script = new URL('../scripts/generate.mjs', import.meta.url).pathname;
  const run = () => exec('node', [script, '--mode=publish'],
    { cwd: work, env: { ...process.env, RTH_MIN_STATIONS: '3' } });
  await run();
  const files = ['index.html', 'assets/app.js', 'data/stations.json', 'CNAME', '.nojekyll'];
  const before = await Promise.all(files.map(file => fs.readFile(path.join(work, 'dist', file))));
  await fs.copyFile(path.join(work, 'dist/data/stations.json'), path.join(work, '.state/stations.json'));
  await run();
  const after = await Promise.all(files.map(file => fs.readFile(path.join(work, 'dist', file))));
  before.forEach((bytes, i) => assert.equal(after[i].toString(), bytes.toString(), files[i]));
});
