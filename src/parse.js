import { load } from 'cheerio';
import { cleanText, isoDateFromGerman, normalizeRegistration, safeStationUrl } from './util.js';

const CATEGORY_MAP = [
  [/^rettungshubschrauber\s*\(rth\)/i, 'RTH'],
  [/^dual-use-hubschrauber/i, 'Dual-Use'],
  [/^intensivtransport[-\s]*hubschrauber/i, 'ITH'],
  [/^sar-hubschrauber/i, 'SAR'],
  [/^ambulanzhubschrauber/i, 'Sonstige'],
  [/^standorte im angrenzenden ausland/i, 'Ausland']
];
const ALLOWED = new Set(['RTH', 'Dual-Use', 'ITH']);
// Explicitly exclude "Christophorus", even in the neighboring-country section.
export const SPECIAL_CALLSIGN = /^(?:Christoph\s+|Lifeliner(?:\s+|\d)|Air\s+Rescue(?:\s+|$))/i;

function categoryFor(text) {
  for (const [matcher, category] of CATEGORY_MAP) if (matcher.test(text)) return category;
  return undefined;
}

export function parseOverview(html, baseUrl = 'https://www.rth.info/stationen.db/stationen.php') {
  const $ = load(html);
  let section = null;
  const stations = new Map();
  $('h1,h2,h3,h4,h5,h6,a[href*="station.php"]').each((_, el) => {
    if (/^h[1-6]$/i.test(el.tagName || '')) {
      const category = categoryFor(cleanText($(el).text()));
      if (category) section = category;
      return;
    }
    const anchor = $(el);
    // Genuine overview rows, not unrelated navigation/news links.
    const row = anchor.closest('tr');
    if (row.length === 0 || row.children('td').length < 2) return;
    const callsign = cleanText(anchor.text());
    // Christophorus is excluded unconditionally (even if the site's category changes).
    if (/^Christophorus(?:\s|$)/i.test(callsign)) return;
    if (!(ALLOWED.has(section) || SPECIAL_CALLSIGN.test(callsign))) return;
    let parsed;
    try { parsed = new URL(anchor.attr('href'), baseUrl); } catch { return; }
    if (!['www.rth.info', 'rth.info'].includes(parsed.hostname.toLowerCase()) ||
        !parsed.pathname.endsWith('/stationen.db/station.php')) return;
    const idText = parsed.searchParams.get('id');
    if (!idText || !/^\d+$/.test(idText)) return;
    const id = Number(idText);
    if (!Number.isSafeInteger(id) || id <= 0 || !callsign) return;
    const cells = row.children('td');
    const cellText = i => cleanText(cells.eq(i).text());
    const category = ALLOWED.has(section) ? section : 'Ausland';
    if (!stations.has(id)) {
      stations.set(id, {
        id, callsign, category,
        // These are fallbacks only; the detail page is authoritative.
        overviewLocation: cellText(1) || null,
        url: safeStationUrl(id)
      });
    }
  });
  return [...stations.values()];
}

const LABELS = new Map([
  ['rufname', 'callsign'],
  ['ort', 'location'],
  ['betreiber', 'operator'],
  ['standard-hubschraubertyp', 'helicopterType'],
  ['zuletzt gesichtete maschine', 'sighting'],
  ['stationierungsort', 'base']
]);

export function parseStationDetail(html, expected = {}) {
  const $ = load(html);
  const values = {};
  // The "Daten des Luftrettungszentrums" table contains the CURRENT station;
  // historical panels above it are deliberately ignored.
  $('tr').each((_, tr) => {
    const cells = $(tr).children('th,td');
    if (cells.length < 2) return;
    const rawLabel = cleanText(cells.eq(0).text())
      .replace(/[:：]\s*$/, '').replace(/\*$/, '').trim().toLowerCase();
    const key = LABELS.get(rawLabel);
    if (!key || Object.hasOwn(values, key)) return;
    const valueCell = cells.eq(1);
    values[key] = cleanText(valueCell.text());
    if (key === 'sighting') {
      values.sightingLinkText = cleanText(valueCell.find('a').first().text());
    }
  });
  if (!values.callsign || !values.location || !values.operator) {
    throw new Error(`Station detail layout missing required labeled fields for station ID ${expected.id ?? '?'}`);
  }
  if (expected.callsign && cleanText(expected.callsign) !== values.callsign) {
    // An unexpected reassignment is valid only if the overview has also changed;
    // we trust the current detail callsign and keep the stable station ID.
    console.warn(`[parse] Callsign differs at ID ${expected.id}: overview=${expected.callsign}, detail=${values.callsign}`);
  }
  const registrationSource = values.sightingLinkText || values.sighting || '';
  const registrationMatch = registrationSource.match(/\b([A-Z]{1,3}-[A-Z0-9]{2,6})\b/i);
  const registration = registrationMatch ? registrationMatch[1].toUpperCase() : null;
  const date = isoDateFromGerman(values.sighting || '');
  return {
    id: expected.id,
    category: expected.category || 'Sonstige',
    callsign: values.callsign,
    registration,
    regKey: normalizeRegistration(registration),
    location: values.location,
    base: values.base || null,
    operator: values.operator,
    helicopterType: values.helicopterType || null,
    sightingDate: date,
    rthUrl: expected.url || safeStationUrl(expected.id)
  };
}
