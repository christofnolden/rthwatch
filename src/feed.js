/** Shared HTTP client and aircraft decoder, migrated from the original Docker edition. */
import { gunzipSync } from 'node:zlib';
import { normalizeRegistration, cleanIcao, sleep } from './util.js';

const MAX_AIRCRAFT_BYTES = 32 * 1024 * 1024;
const MAX_INFLATED_BYTES = 80 * 1024 * 1024;
const MAX_HTML_BYTES = 2 * 1024 * 1024;

export async function fetchBytes(url, { config, signal, maxBytes = MAX_AIRCRAFT_BYTES }) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const timeout = AbortSignal.timeout(config.fetchTimeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await fetch(url, {
        signal: combined,
        headers: {
          'User-Agent': config.userAgent,
          'Accept': 'text/html,application/json,application/octet-stream;q=0.9,*/*;q=0.5'
        }
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status} while fetching ${new URL(url).hostname}`);
        error.retryable = [408, 429].includes(response.status) || response.status >= 500;
        await response.body?.cancel();
        throw error;
      }
      const headerLength = Number(response.headers.get('content-length'));
      if (headerLength > maxBytes) {
        await response.body?.cancel();
        const error = new Error('Response exceeds allowed size');
        error.retryable = false;
        throw error;
      }
      const chunks = [];
      let total = 0;
      for await (const chunk of response.body) {
        total += chunk.length;
        if (total > maxBytes) {
          await response.body?.cancel().catch(() => {});
          const error = new Error('Downloaded response exceeds size limit');
          error.retryable = false;
          throw error;
        }
        chunks.push(chunk);
      }
      return { bytes: Buffer.concat(chunks), contentType: response.headers.get('content-type') || '' };
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
      if (attempt === 1 || error.retryable === false) break;
      console.warn(`[fetch] Retry ${new URL(url).hostname} in 2s: ${error.message}`);
      await sleep(2000, signal);
    }
  }
  throw lastError;
}

export async function fetchHtml(url, config, signal) {
  const { bytes, contentType } = await fetchBytes(url, { config, signal, maxBytes: MAX_HTML_BYTES });
  const charset = /charset\s*=\s*([\w-]+)/i.exec(contentType)?.[1] || 'utf-8';
  let decoder;
  try { decoder = new TextDecoder(charset); }
  catch { decoder = new TextDecoder('utf-8'); }
  return decoder.decode(bytes);
}

export function decodeAircraftDatabase(raw) {
  if (!Buffer.isBuffer(raw)) throw new Error('Aircraft database must be a Buffer');
  const text = raw[0] === 0x1f && raw[1] === 0x8b
    ? gunzipSync(raw, { maxOutputLength: MAX_INFLATED_BYTES }).toString('utf8')
    : raw.toString('utf8');
  if (Buffer.byteLength(text) > MAX_INFLATED_BYTES) throw new Error('Aircraft mapping exceeds size limit');
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Aircraft mapping must be an object');
  return parsed;
}

export function validateAircraftDatabase(db) {
  const keys = Object.keys(db);
  if (keys.length < 10000) throw new Error(`Suspicious aircraft mapping size: ${keys.length}`);
  let valid = 0;
  for (let i = 0; i < Math.min(keys.length, 200); i++) {
    if (normalizeRegistration(keys[i]) && cleanIcao(db[keys[i]])) valid++;
  }
  if (valid < 170) throw new Error('Unexpected aircraft mapping format');
  return keys.length;
}

export function selectAircraftMappings(db, registrations) {
  const selected = {};
  for (const registration of registrations) {
    const key = normalizeRegistration(registration);
    if (!key) continue;
    const hex = cleanIcao(db[key] ?? db[key.toLowerCase()]);
    if (hex) selected[key] = hex;
  }
  return selected;
}

export async function downloadAircraftDatabase(config, signal) {
  const { bytes } = await fetchBytes(config.registrationDbUrl, { config, signal });
  const db = decodeAircraftDatabase(bytes);
  const count = validateAircraftDatabase(db);
  console.info(`[aircraft] Mapping downloaded and checked: ${count} registrations`);
  return db;
}
