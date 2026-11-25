const MODES = new Set(['full', 'stations', 'aircraft', 'publish', 'reconcile']);

export function validateWorkflowMode(ref, mode) {
  if (ref !== 'refs/heads/main') throw new Error('Only refs/heads/main can publish');
  if (!MODES.has(mode)) throw new Error(`Invalid workflow mode: ${JSON.stringify(mode ?? '')}`);
  return mode;
}
