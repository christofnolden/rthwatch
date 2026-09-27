import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../public/', import.meta.url);
test('public assets use repository-relative links (GitHub Project Pages)', () => {
  const html = fs.readFileSync(new URL('index.html', root), 'utf8');
  assert.match(html, /\.\/assets\/style\.css/);
  assert.match(html, /\.\/assets\/app\.js/);
  assert.doesNotMatch(html, /(?:href|src)="\/assets\//);
  assert.match(html, /RTH Watch v2\.0\.0/);
  const javascript = fs.readFileSync(new URL('assets/app.js', root), 'utf8');
  assert.match(javascript, /\.\/data\/stations\.json/);
  assert.match(javascript, /localStorage/);
  assert.doesNotMatch(javascript, /fetch\('\/api\/stations'/);
});
