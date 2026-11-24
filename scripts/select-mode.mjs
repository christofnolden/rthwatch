import fs from 'node:fs/promises';
import { selectWorkflowMode } from '../src/workflow-mode.js';
const event = process.env.FORGEJO_EVENT_NAME;
const payload = JSON.parse(await fs.readFile(process.env.FORGEJO_EVENT_PATH, 'utf8'));
const schedule = process.env.SCHEDULE || payload.schedule;
const requested = process.env.REQUESTED || payload.inputs?.mode;
const mode = selectWorkflowMode(event, process.env.FORGEJO_REF, schedule, requested);
console.info(`[workflow] Event: ${event}; ref: ${process.env.FORGEJO_REF}; cron: ${schedule || 'none'}; mode: ${mode}; source: ${process.env.FORGEJO_SHA}`);
await fs.appendFile(process.env.FORGEJO_OUTPUT, `mode=${mode}\n`);
