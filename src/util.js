export function cleanText(value) {
  return (value || '').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeRegistration(value) {
  const cleaned = cleanText(value).toUpperCase();
  return cleaned ? cleaned.replace(/[^A-Z0-9]/g, '') : null;
}

export function cleanIcao(value) {
  return typeof value === 'string' && /^[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

export function isoDateFromGerman(input) {
  const found = cleanText(input).match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
  if (!found) return null;
  const [, day, month, year] = found;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

export function timeInBerlin(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const o = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return { day: `${o.year}-${o.month}-${o.day}`, hm: `${o.hour}:${o.minute}` };
}

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason || new Error('Aborted'));
    const timeout = setTimeout(() => { cleanup(); resolve(); }, ms);
    function abort() { clearTimeout(timeout); cleanup(); reject(signal.reason || new Error('Aborted')); }
    function cleanup() { signal?.removeEventListener('abort', abort); }
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export function safeStationUrl(id) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid station ID');
  return `https://www.rth.info/stationen.db/station.php?id=${id}&show=1`;
}
