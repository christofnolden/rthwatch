const ZONE = 'Europe/Berlin';
const HOUR = 60 * 60 * 1000;
function berlinParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, Number(value)]));
}
function latestSlot(now, hours, minute) {
  // Search actual UTC instants, so both DST transitions are handled by the same rule.
  for (let t = Math.floor(now.getTime() / 60000) * 60000; t >= now.getTime() - 48 * HOUR; t -= 60000) {
    const p = berlinParts(new Date(t));
    if (hours.includes(p.hour) && p.minute === minute) return new Date(t).toISOString();
  }
  throw new Error('No scheduled slot found');
}
function goodTime(value, slot) { return Number.isFinite(Date.parse(value)) && Date.parse(value) >= Date.parse(slot); }
export function reconcileDecision(snapshot, now = new Date()) {
  if (!snapshot) return { mode: null, sources: [], reason: 'no snapshot; initial full or publish run required', slots: {} };
  const slots = { stations: latestSlot(now, [10, 14, 18], 0), aircraft: latestSlot(now, [9], 30) };
  const status = snapshot.status;
  const complete = status.lastStationsCompleteSync ||
    (status.lastResult && status.lastResult.errors === 0 ? status.lastStationsSync : null);
  const latest = { stations: complete, aircraft: status.lastAircraftSync };
  const pending = [];
  const reasons = [];
  for (const source of ['stations', 'aircraft']) {
    if (goodTime(latest[source], slots[source])) continue;
    const retry = status.reconcile?.[source];
    if (retry?.slot === slots[source]) {
      if (retry.attempts >= 2) { reasons.push(`${source}: retry limit reached`); continue; }
      if (Date.parse(retry.lastAttempt) > now.getTime() - HOUR) {
        reasons.push(`${source}: waiting for 60-minute interval`); continue;
      }
    }
    pending.push(source);
  }
  const mode = pending.length === 2 ? 'full' : pending[0] || null;
  return { mode, sources: pending, slots, reason: pending.length ? `missed ${pending.join(' and ')}` : reasons.join('; ') || 'all scheduled imports complete' };
}
export function recordReconcile(snapshot, previous, decision, now = new Date()) {
  const prior = previous?.status?.reconcile || {};
  const next = { ...prior };
  for (const source of decision.sources) {
    const slot = decision.slots[source];
    const old = prior[source];
    next[source] = { slot, attempts: (old?.slot === slot ? old.attempts : 0) + 1, lastAttempt: now.toISOString() };
  }
  snapshot.status.reconcile = next;
  return snapshot;
}
