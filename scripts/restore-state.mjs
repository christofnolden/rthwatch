import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config.js';
import { git, assertGit, forgejoRemote, gitAuthEnvironment } from '../src/git-pages.js';
import { restoreSnapshot } from '../src/restore.js';

const origin = assertGit(await git(['remote', 'get-url', 'origin']), 'Reading origin URL');
const remote = forgejoRemote(origin, process.env.FORGEJO_SERVER_URL);
const auth = await gitAuthEnvironment(process.env.RTH_WATCH_DEPLOY_TOKEN || process.env.FORGEJO_TOKEN);
try {
  const result = await restoreSnapshot({ remote, env: auth.env, minStations: config.minStations,
    backupPath: process.env.RTH_WATCH_MIGRATION_BACKUP });
  console.info(`[restore] Source: ${result.source}; previous deployment: ${result.head || 'none'}; stations: ${result.data?.sourceStations.length || 0}`);
  await fs.mkdir(path.dirname(config.stateFile), { recursive: true });
  await fs.writeFile(path.join(path.dirname(config.stateFile), 'restore-meta.json'),
    JSON.stringify({ head: result.head, source: result.source }), { mode: 0o600 });
  if (result.data) {
    await fs.writeFile(config.stateFile, JSON.stringify(result.data, null, 2) + '\n', { mode: 0o600 });
  } else {
    await fs.rm(config.stateFile, { force: true });
  }
} finally { await auth.cleanup(); }
