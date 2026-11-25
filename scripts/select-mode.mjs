import fs from 'node:fs/promises';
import { validateWorkflowMode } from '../src/workflow-mode.js';

const { FORGEJO_EVENT_NAME, FORGEJO_REF, FORGEJO_SHA, FORGEJO_OUTPUT, REQUESTED_MODE } = process.env;
const mode = validateWorkflowMode(FORGEJO_REF, REQUESTED_MODE);
console.info(`[workflow] Event: ${FORGEJO_EVENT_NAME}; ref: ${FORGEJO_REF}; mode: ${mode}; source: ${FORGEJO_SHA}`);
await fs.appendFile(FORGEJO_OUTPUT, `mode=${mode}\n`);
