const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../public/js/analytics.js'), 'utf8');

function analytics() {
  const requests = [], charts = [], registered = new Map();
  const loading = { textContent: '', classList: { add() {}, remove() {} } };
  const range = { value: '7d', addEventListener(event, fn) { this.change = fn; } };
  const total = { textContent: '' };
  const nodes = { 'chart-loading': loading, 'time-range': range, 'total-views-stat': total, 'views-chart': { getContext() { return {}; } } };
  // Chart is an external CDN dependency. Capture the chart configuration and run
  // our real drawing hooks against a canvas boundary; no chart library internals.
  class Chart {
    constructor(ctx, config) {
      this.config = config;
      this.destroyed = false;
      charts.push(this);
    }
    destroy() { this.destroyed = true; }
    static register(plugin) { if (!registered.has(plugin.id)) registered.set(plugin.id, plugin); }
  }
  function draw(chart) {
    const lines = [];
    const canvas = {
      ctx: { save() {}, restore() {}, setLineDash() {}, beginPath() {}, moveTo(x) { lines.push(x); }, lineTo() {}, stroke() {} },
      scales: { x: { getPixelForValue(index) { return index * 100; } }, y: { top: 0, bottom: 200 } },
    };
    for (const plugin of [...registered.values(), ...(chart.config.plugins || [])]) plugin.afterDraw(canvas);
    return lines;
  }
  vm.runInNewContext(script, {
    window: { ARTICLE_ID: 'article', matchMedia: () => ({ matches: true }) },
    document: { getElementById: id => nodes[id] }, Chart, Date, AbortController,
    fetch: () => new Promise(resolve => requests.push(resolve)),
  });
  return { range, requests, charts, draw, loading, total };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const response = stats => ({ ok: true, json: async () => ({ stats }) });
function stats() {
  const old = new Date(Date.now() - 48 * 3600000).toISOString();
  const recent = new Date(Date.now() - 3600000).toISOString();
  return [{ hour: old, count: 5, publishEvents: [old] }, { hour: recent, count: 7, publishEvents: [recent] }];
}

test('publication markers use the currently selected range after a redraw', async () => {
  const ui = analytics();
  ui.requests.shift()(response(stats()));
  await settle();
  assert.deepEqual(ui.draw(ui.charts.at(-1)), [0, 100]);
  ui.range.value = '24h'; ui.range.change();
  ui.requests.shift()(response(stats()));
  await settle();
  assert.deepEqual(ui.draw(ui.charts.at(-1)), [0]);
  assert.equal(Number(ui.total.textContent), 12);
});

test('a late response cannot replace a newer chart', async () => {
  const ui = analytics();
  const older = ui.requests.shift();
  ui.range.value = '24h'; ui.range.change();
  ui.requests.shift()(response(stats()));
  await settle();
  older(response([]));
  await settle();
  assert.equal(ui.charts.at(-1).destroyed, false);
  assert.equal(Number(ui.total.textContent), 12);
});

test('a failed refresh removes the chart from the previous range', async () => {
  const ui = analytics();
  ui.requests.shift()(response(stats()));
  await settle();
  ui.range.value = '24h'; ui.range.change();
  ui.requests.shift()({ ok: false });
  await settle();
  assert.equal(ui.charts.at(-1).destroyed, true);
  assert.match(ui.loading.textContent, /Failed/);
});
