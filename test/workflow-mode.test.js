import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validateWorkflowMode } from '../src/workflow-mode.js';

const exec = promisify(execFile);
const workflowDir = new URL('../.forgejo/workflows/', import.meta.url);
const script = fileURLToPath(new URL('../scripts/select-mode.mjs', import.meta.url));
const main = 'refs/heads/main';
const modes = ['full', 'stations', 'aircraft', 'publish', 'reconcile'];
const schedules = {
  aircraft: '30 9 * * *',
  stations: '0 10,14,18 * * *',
  reconcile: '30 11-22 * * *'
};
const readWorkflow = name => fs.readFile(new URL(name + '.yml', workflowDir), 'utf8');

test('scheduled callers each declare one Berlin timetable and pass a fixed mode', async () => {
  for (const [mode, cron] of Object.entries(schedules)) {
    const workflow = await readWorkflow(mode);
    assert.ok(workflow.includes(`on:\n  schedule:\n    - cron: '${cron}'\n      timezone: Europe/Berlin\n`), mode);
    assert.equal(workflow.match(/^\s*- cron:/gm)?.length, 1, mode);
    assert.match(workflow, new RegExp(`^      mode: ${mode}$`, 'm'));
  }
  const files = (await fs.readdir(workflowDir)).filter(file => /\.ya?ml$/.test(file));
  const scheduled = await Promise.all(files.map(async file => {
    const content = await fs.readFile(new URL(file, workflowDir), 'utf8');
    return /^\s+schedule:/m.test(content) ? file : null;
  }));
  assert.deepEqual(scheduled.filter(Boolean).sort(), Object.keys(schedules).map(mode => mode + '.yml').sort());
});

test('main pushes publish, manual callers forward all choices, and all callers serialize', async () => {
  const pages = await readWorkflow('pages');
  assert.match(pages, /^  push:\n    branches: \[main\]$/m);
  assert.match(pages, /^  workflow_dispatch:$/m);
  assert.ok(pages.includes("mode: ${{ forgejo.event_name == 'push' && 'publish' || inputs.mode }}"));
  const options = [...pages.matchAll(/^          - (\w+)$/gm)].map(match => match[1]);
  assert.deepEqual(options, modes);
  for (const name of ['pages', ...Object.keys(schedules)]) {
    const workflow = await readWorkflow(name);
    assert.match(workflow, /^concurrency:\n  group: rth-watch-pages\n  cancel-in-progress: false$/m);
    assert.match(workflow, /^    uses: \.\/\.forgejo\/workflows\/publish-reusable\.yml$/m);
    assert.match(workflow, /^    secrets: inherit$/m);
  }
  const reusable = await readWorkflow('publish-reusable');
  assert.doesNotMatch(reusable, /^\s*concurrency:/m);
  assert.ok(reusable.includes("if: ${{ forgejo.ref == 'refs/heads/main' }}"));
  assert.ok(reusable.includes('REQUESTED_MODE: ${{ inputs.mode }}'));
});

test('scheduled mode validation accepts empty or missing schedule fields, even on a delayed rerun', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rth-watch-mode-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const payloadFile = path.join(dir, 'event.json');
  const outputFile = path.join(dir, 'output');
  for (const [payload, event] of [
    [{ schedule: '' }, 'schedule'],
    [{ scheduled_at: '2026-01-15T08:30:00Z' }, 'workflow_call']
  ]) {
    await fs.writeFile(payloadFile, JSON.stringify(payload));
    for (const mode of Object.keys(schedules)) {
      await fs.writeFile(outputFile, '');
      await exec(process.execPath, [script], {
        env: {
          ...process.env, FORGEJO_EVENT_NAME: event, FORGEJO_EVENT_PATH: payloadFile,
          FORGEJO_REF: main, FORGEJO_RUN_ATTEMPT: '2', FORGEJO_OUTPUT: outputFile,
          REQUESTED_MODE: mode
        }
      });
      assert.equal(await fs.readFile(outputFile, 'utf8'), `mode=${mode}\n`);
    }
  }
});

test('explicit workflow modes require main and reject unknown or missing values', () => {
  for (const mode of modes) assert.equal(validateWorkflowMode(main, mode), mode);
  for (const mode of [undefined, '', 'evil', ' STATIONS ']) {
    assert.throws(() => validateWorkflowMode(main, mode), /Invalid workflow mode/);
  }
  for (const ref of ['refs/heads/gh-pages', 'refs/tags/main', 'refs/heads/feature', undefined]) {
    assert.throws(() => validateWorkflowMode(ref, 'publish'), /Only refs\/heads\/main/);
  }
});
