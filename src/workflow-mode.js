const AIRCRAFT = '30 9 * * *';
const STATIONS = '0 10,14,18 * * *';
const RECONCILE = '30 11-22 * * *';
const MODES = new Set(['full', 'stations', 'aircraft', 'publish', 'reconcile']);
export function selectWorkflowMode(event, ref, schedule, requested) {
  if (ref !== 'refs/heads/main') throw new Error(`Only refs/heads/main can publish (received ${ref || 'empty ref'})`);
  if (event === 'push') return 'publish';
  if (event === 'workflow_dispatch') {
    if (!MODES.has(requested)) throw new Error(`Invalid manual mode: ${requested || 'empty'}`);
    return requested;
  }
  if (event === 'schedule') {
    if (schedule === AIRCRAFT) return 'aircraft';
    if (schedule === STATIONS) return 'stations';
    if (schedule === RECONCILE) return 'reconcile';
    throw new Error(`Unexpected schedule: ${schedule || 'empty'}`);
  }
  throw new Error(`Unsupported event: ${event || 'empty'}`);
}
