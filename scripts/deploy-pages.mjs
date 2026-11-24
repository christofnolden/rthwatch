import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.js';
import { git, assertGit, forgejoRemote, gitAuthEnvironment } from '../src/git-pages.js';
import { deployPages } from '../src/deploy.js';

const origin = assertGit(await git(['remote', 'get-url', 'origin']), 'Reading origin URL');
const remote = forgejoRemote(origin, process.env.FORGEJO_SERVER_URL);
const restoreMeta = JSON.parse(await fs.readFile(path.join(path.dirname(config.stateFile), 'restore-meta.json'), 'utf8'));
if (!Object.hasOwn(restoreMeta, 'head')) throw new Error('Restore metadata missing previous deployment head');
const auth = await gitAuthEnvironment(process.env.RTH_WATCH_DEPLOY_TOKEN || process.env.FORGEJO_TOKEN);
try {
  const result = await deployPages({ remote, sourceSha: process.env.FORGEJO_SHA,
    dist: config.distDir, env: auth.env, minStations: config.minStations,
    expectedHead: restoreMeta.head,
    authorEmail: process.env.RTH_WATCH_CI_EMAIL });
  console.info(`[deploy] Result: ${result.outcome}; files: ${result.files}; stations: ${result.stations}`);
} finally { await auth.cleanup(); }
