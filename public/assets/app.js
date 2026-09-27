const FAVORITES_KEY = 'rth-watch:favorites:v2';
const LEGACY_FAVORITES_KEY = 'rotorwatch:favorites:v1';
const $ = id => document.getElementById(id);
const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
let stations = [];
let status = {};
let favorites = readFavorites();

function readFavorites() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAVORITES_KEY) || localStorage.getItem(LEGACY_FAVORITES_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw.filter(Number.isSafeInteger) : []);
  } catch { return new Set(); }
}
function saveFavorites() {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites])); }
  catch { notice('Favoriten können in diesem Browser nicht dauerhaft gespeichert werden.', 'warning'); }
}
function toggleFavorite(id) {
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  saveFavorites();
  render();
}
function el(tag, className, content) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (content !== undefined && content !== null) item.textContent = String(content);
  return item;
}
function safeUrl(value, source) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (source === 'rth') return ['www.rth.info', 'rth.info'].includes(url.hostname) &&
      url.pathname === '/stationen.db/station.php' && /^\d+$/.test(url.searchParams.get('id') || '') ? url.href : null;
    return url.hostname === 'globe.adsbexchange.com' && /^\?icao=[0-9a-f]{6}$/i.test(url.search) ? url.href : null;
  } catch { return null; }
}
function external(label, href, className) {
  const link = el('a', className, label);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.addEventListener('click', e => e.stopPropagation());
  return link;
}
function formatDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '—';
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${iso}T12:00:00Z`));
}
function sightingAge(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(`${iso}T12:00:00Z`).getTime();
  return Number.isFinite(diff) ? Math.max(0, Math.floor(diff / 86400000)) : null;
}
function formatUpdated(iso) {
  if (!iso) return 'Noch nicht erfolgt';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Unbekannt';
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(parsed).replace(',', ' ·');
}
function sortStations(input) { return [...input].sort((a, b) => collator.compare(a.callsign, b.callsign)); }
function normalized(text) { return String(text || '').toLocaleLowerCase('de').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function matchFilters(items) {
  const needle = normalized($('search').value.trim());
  const category = $('category').value;
  const operator = $('operator').value;
  return items.filter(item => (!category || item.category === category) && (!operator || item.operator === operator) &&
    (!needle || normalized([item.callsign, item.registration, item.location, item.base, item.operator, item.helicopterType, item.category].join(' ')).includes(needle)));
}
function notice(message, severity = 'warning') {
  const target = $('notification');
  target.hidden = !message;
  target.textContent = message || '';
  target.dataset.severity = severity;
}
function populateFilters() {
  for (const [id, field] of [['category', 'category'], ['operator', 'operator']]) {
    const select = $(id);
    const current = select.value;
    while (select.options.length > 1) select.remove(1);
    const values = [...new Set(stations.map(s => s[field]).filter(Boolean))].sort((a,b) => collator.compare(a,b));
    for (const value of values) { const opt = document.createElement('option'); opt.value = value; opt.textContent = value; select.append(opt); }
    select.value = values.includes(current) ? current : '';
  }
}
function renderMetrics() {
  $('metric-total').textContent = status.total ?? stations.length;
  $('metric-mapped').textContent = status.mapped ?? stations.filter(s => s.adsbUrl).length;
  $('metric-favorites').textContent = stations.filter(s => favorites.has(s.id)).length;
  const updated = status.lastStationsSync;
  const target = $('metric-updated');
  target.textContent = updated ? new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit'
  }).format(new Date(updated)) + ' Uhr' : '—';
  $('metric-update-detail').textContent = updated ? formatUpdated(updated) : 'Warte auf Erstimport';
  let message = '';
  if (!stations.length) message = status.currentlyUpdating ?
    'Erstimport läuft. Der Stationsabgleich kann einige Minuten benötigen. Die Ansicht wird automatisch aktualisiert.' :
    'Noch keine Stationsdaten veröffentlicht. Prüfe den letzten GitHub-Actions-Lauf.';
  else if (status.lastStationsError) message = `Letzter Stationsabruf mit Hinweis: ${status.lastStationsError}`;
  else if (updated && Number.isFinite(Date.parse(updated)) && Date.now() - Date.parse(updated) > 30 * 60 * 60 * 1000)
    message = 'Achtung: Der letzte erfolgreiche Stationsabgleich liegt mehr als 30 Stunden zurück. GitHub Actions prüfen.';
  else if (status.lastAircraftError) message = `Letzter ICAO-Datenabruf mit Hinweis: ${status.lastAircraftError}`;
  notice(message);
}
function starButton(station) {
  const selected = favorites.has(station.id);
  const button = el('button', `star-button${selected ? ' selected' : ''}`, selected ? '★' : '☆');
  button.type = 'button';
  button.title = selected ? `${station.callsign} aus Favoriten entfernen` : `${station.callsign} zu Favoriten hinzufügen`;
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-pressed', String(selected));
  button.addEventListener('click', event => { event.stopPropagation(); toggleFavorite(station.id); });
  return button;
}
function renderFavorites() {
  const grid = $('favorites-grid');
  grid.replaceChildren();
  const visible = matchFilters(sortStations(stations.filter(s => favorites.has(s.id))));
  if (!visible.length) {
    const box = el('div', 'empty-favorites');
    box.append(el('div', 'empty-favorites-star', favorites.size ? '⌕' : '☆'));
    box.append(el('strong', '', favorites.size ? 'Keine Favoriten im aktuellen Filter' : 'Noch keine Favoriten'));
    box.append(el('span', '', favorites.size ? 'Entferne die Filter, um deine markierten Stationen zu sehen.' : 'Markiere eine Station mit ☆, um sie hier dauerhaft in diesem Browser zu speichern.'));
    grid.append(box);
    return;
  }
  for (const item of visible) {
    const card = el('article', 'fav-card');
    const top = el('div', 'fav-card-top');
    const info = el('div');
    info.append(el('div', 'fav-card-label', `${item.category}  /  ${item.registration || 'KENNUNG OFFEN'}${item.assignmentSource === 'manual' ? '  ·  MANUELL' : ''}`));
    info.append(el('h3', '', item.callsign));
    info.append(el('div', 'fav-card-location', `${item.location || 'Ort unbekannt'}${item.helicopterType ? ' · ' + item.helicopterType : ''}`));
    top.append(info, starButton(item));
    const actions = el('div', 'fav-card-actions');
    const adsb = safeUrl(item.adsbUrl, 'adsb');
    const rth = safeUrl(item.rthUrl, 'rth');
    if (adsb) actions.append(external('ADS-B ÖFFNEN ↗', adsb, 'fav-action primary'));
    else actions.append(el('span', 'fav-action disabled', 'KEIN HEXCODE'));
    if (rth) actions.append(external('RTH.INFO ↗', rth, 'fav-action'));
    card.append(top, actions);
    grid.append(card);
  }
}
function cell(label, cls = '', content = '') {
  const td = el('td', cls);
  td.dataset.label = label;
  if (typeof content === 'string') td.textContent = content;
  else if (content) td.append(content);
  return td;
}
function renderTable() {
  const body = $('table-body');
  body.replaceChildren();
  const visible = matchFilters(sortStations(stations));
  $('section-count').textContent = stations.length;
  $('table-count').textContent = `${visible.length} von ${stations.length} Stationen angezeigt`;
  if (!visible.length) {
    const row = el('tr');
    const td = cell('', 'table-empty', stations.length ? 'Keine passenden Stationen gefunden. Bitte Filter anpassen.' : 'Noch keine Stationsdaten vorhanden.');
    td.colSpan = 9;
    row.append(td); body.append(row);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const item of visible) {
    const row = el('tr');
    const adsb = safeUrl(item.adsbUrl, 'adsb');
    const rth = safeUrl(item.rthUrl, 'rth');
    if (adsb) {
      row.classList.add('clickable');
      row.title = `${item.callsign} bei ADS-B Exchange öffnen`;
      row.tabIndex = 0;
      row.addEventListener('click', () => window.open(adsb, '_blank', 'noopener,noreferrer'));
      row.addEventListener('keydown', event => {
        if (event.target !== row) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); window.open(adsb, '_blank', 'noopener,noreferrer'); }
      });
    }
    row.append(cell('', '', starButton(item)));
    row.append(cell('RUFNAME', 'table-callsign', item.callsign));
    row.append(cell('MASCHINE', `reg-code${item.registration ? '' : ' empty'}`, item.registration || 'Nicht gemeldet'));
    const loc = el('span', 'cell-ellipsis', item.location || '—'); loc.title = [item.location, item.base].filter(Boolean).join(' · ');
    row.append(cell('ORT', 'location-cell', loc));
    const op = el('span', 'cell-ellipsis', item.operator || '—'); op.title = item.operator || '';
    row.append(cell('BETREIBER', 'operator-cell', op));
    const type = el('span', 'cell-ellipsis', item.helicopterType || '—'); type.title = item.helicopterType || '';
    row.append(cell('TYP', '', type));
    const age = sightingAge(item.sightingDate);
    const manuallyAssigned = item.assignmentSource === 'manual';
    const seen = cell('SICHTUNG', 'last-seen', manuallyAssigned ? 'MANUELL' : formatDate(item.sightingDate));
    if (manuallyAssigned) seen.classList.add('manual-assignment');
    if (age !== null && age > 30) seen.classList.add('very-old');
    else if (age !== null && age > 14) seen.classList.add('old');
    seen.title = manuallyAssigned ? 'Manuelle Stationszuordnung über config/station-overrides.json' : (age === null ? 'Keine Sichtung gemeldet' : `Zuletzt auf rth.info gemeldet vor ca. ${age} Tagen`);
    row.append(seen);
    row.append(cell('RTH.INFO', '', rth ? external('Quelle ↗', rth, 'source-link') : '—'));
    if (adsb) {
      const link = external('', adsb, 'track-link');
      link.append(el('span', 'track-dot'), document.createTextNode('TRACKEN ↗'));
      row.append(cell('TRACKING', '', link));
    } else {
      const unavailable = el('span', 'track-link disabled');
      unavailable.append(el('span', 'disabled-dot'), document.createTextNode('KEIN ICAO'));
      row.append(cell('TRACKING', '', unavailable));
    }
    fragment.append(row);
  }
  body.append(fragment);
}
function render() { renderMetrics(); renderFavorites(); renderTable(); }
async function loadStations() {
  const button = $('refresh-btn');
  button.disabled = true;
  try {
    const url = new URL('./data/stations.json', document.baseURI);
    url.searchParams.set('_', String(Date.now()));
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.stations) || !payload.status) throw new Error('Ungültige API-Antwort');
    stations = payload.stations;
    status = payload.status;
    populateFilters();
    render();
  } catch (error) {
    notice(`Veröffentlichte Stationsdaten momentan nicht erreichbar: ${error.message}. Bestehende Ansicht bleibt erhalten.`);
  } finally { button.disabled = false; }
}
function updateClock() {
  $('top-clock').textContent = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(new Date()).replace(',', ' ·');
}
for (const id of ['search', 'category', 'operator']) {
  $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { renderFavorites(); renderTable(); });
}
$('refresh-btn').addEventListener('click', () => void loadStations());
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault(); $('search').focus();
  }
});
window.addEventListener('storage', event => { if (event.key === FAVORITES_KEY) { favorites = readFavorites(); render(); } });
updateClock();
setInterval(updateClock, 30000);
setInterval(() => void loadStations(), 60000);
void loadStations();
