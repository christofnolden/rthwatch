import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
export async function git(args, options = {}) {
  try {
    const result = await execute('git', ['-c', 'credential.helper=', ...args], { cwd: options.cwd, env: options.env, maxBuffer: 8 * 1024 * 1024 });
    return { code: 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  } catch (error) {
    return { code: error.code, stdout: String(error.stdout || '').trim(), stderr: String(error.stderr || '').trim() };
  }
}
export function assertGit(result, action) {
  if (result.code !== 0) throw new Error(`${action} failed (Git exit ${result.code}): ${result.stderr || result.stdout}`);
  return result.stdout;
}
export async function branchHead(remote, branch, options = {}) {
  const result = await git(['ls-remote', '--exit-code', remote, `refs/heads/${branch}`], options);
  if (result.code === 2 && !result.stdout) return null;
  const output = assertGit(result, `Reading ${branch}`);
  const match = /^([a-f0-9]{40,64})\s+refs\/heads\//.exec(output);
  if (!match) throw new Error(`Unexpected Git response while reading ${branch}`);
  return match[1];
}
export function forgejoRemote(sourceRemote, serverUrl) {
  if (!serverUrl) throw new Error('FORGEJO_SERVER_URL is required');
  const remote = new URL(sourceRemote);
  const server = new URL(serverUrl);
  if (remote.protocol !== 'https:' || remote.origin !== server.origin ||
      remote.username || remote.password || !remote.pathname.startsWith(server.pathname.replace(/\/$/, '') + '/')) {
    throw new Error('origin must be an uncredentialed HTTPS URL on the Forgejo server');
  }
  return sourceRemote;
}
export async function gitAuthEnvironment(token, baseEnv = process.env) {
  if (!token) throw new Error('FORGEJO_TOKEN or RTH_WATCH_DEPLOY_TOKEN is required for Git access');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rth-watch-auth-'));
  const askpass = path.join(directory, 'askpass.sh');
  await fs.writeFile(askpass, '#!/bin/sh\ncase "$1" in *Username*) printf "oauth2";; *) printf "%s" "$RTH_WATCH_GIT_TOKEN";; esac\n', { mode: 0o700 });
  return {
    env: { ...baseEnv, GIT_ASKPASS: askpass, GIT_TERMINAL_PROMPT: '0', RTH_WATCH_GIT_TOKEN: token },
    async cleanup() { await fs.rm(directory, { recursive: true, force: true }); }
  };
}
