// End-to-end check using SQLite (no MySQL needed): node scripts/smoke-test.js
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = '/tmp/inventory-smoke.sqlite';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'smoke';
require('fs').rmSync(process.env.DB_STORAGE, { force: true });

const net = require('net');
const assert = require('assert');
const app = require('../src/app');
const db = require('../src/models');

(async () => {
  await db.sequelize.sync();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let token;
  const call = async (method, path, body) => {
    const r = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await r.json().catch(() => ({}));
    return { status: r.status, ...json };
  };

  // fake network label printer (captures ZPL)
  let zpl = '';
  const fake = net.createServer((s) => { s.on('data', (d) => { zpl += d; }); }).listen(0);
  const printerPort = fake.address().port;

  let r = await call('POST', '/auth/register', { company_name: 'Demo Co', industry: 'CCTV', name: 'Vaishali', email: 'v@demo.com', password: 'secret1' });
  assert.equal(r.status, 201); token = r.data.token; const wh1 = r.data.warehouse.id;
  r = await call('POST', '/warehouses', { name: 'Second WH', code: 'W2' }); const wh2 = r.data.id;
  r = await call('POST', '/printers', { name: 'Zebra', host: '127.0.0.1', port: printerPort, is_default: true });
  assert.equal(r.status, 201);

  // receive 1 box of 50
  r = await call('POST', '/inventory/receive', {
    warehouse_id: wh1, item: { name: 'Dome Camera', model: 'DS-2CE', brand: 'Hikvision', min_stock: 10, custom_fields: { resolution: '2MP' } },
    boxes: [{ quantity: 50 }], location: 'Rack A1',
  });
  assert.equal(r.status, 201, JSON.stringify(r));
  const boxCode = r.data.boxes[0].code; const itemQr = r.data.item_qr.code; const itemId = r.data.item.id;
  assert(r.data.boxes[0].qr.image.startsWith('data:image/png'));
  assert.equal(r.data.print_jobs[0].status, 'PRINTED');
  assert.equal(r.data.print_jobs[0].total_labels, 51);
  await new Promise((x) => setTimeout(x, 200));
  assert(zpl.includes('^PQ50') && zpl.includes('^PQ1'), 'ZPL missing quantities');
  console.log('receive OK ->', boxCode, itemQr, '| labels printed: 51');

  // scan box
  r = await call('GET', `/scan/${boxCode}`);
  assert.equal(r.data.type, 'BOX'); assert.equal(r.data.box.quantity, 50); assert.equal(r.data.item.name, 'Dome Camera');
  // take 8 out, rescan
  r = await call('POST', `/scan/${boxCode}/adjust`, { action: 'OUT', quantity: 8, note: 'Site install' });
  assert.equal(r.data.box.quantity, 42);
  r = await call('POST', `/scan/${boxCode}/adjust`, { action: 'IN', quantity: 3 });
  r = await call('GET', `/scan/${boxCode}`);
  assert.equal(r.data.box.quantity, 45); assert.equal(r.data.recent_movements.length, 3);
  r = await call('POST', `/scan/${boxCode}/adjust`, { action: 'OUT', quantity: 999 });
  assert.equal(r.status, 409);
  console.log('box scan / in / out OK -> qty 45');

  // material QR
  r = await call('GET', `/scan/${itemQr}`);
  assert.equal(r.data.type, 'ITEM'); assert.equal(r.data.total_quantity, 45);
  r = await call('POST', `/scan/${itemQr}/adjust`, { action: 'OUT', quantity: 5 });
  assert.equal(r.status, 409); // not loose
  r = await call('POST', `/scan/${itemQr}/adjust`, { action: 'OUT', quantity: 5, auto_box: true });
  assert.equal(r.data.total_quantity, 40);
  console.log('material scan OUT (FIFO from box) OK -> total 40');

  // transfer box, count, low stock, dashboard
  r = await call('POST', '/inventory/transfer', { box_code: boxCode, to_warehouse_id: wh2 });
  assert.equal(r.status, 200, JSON.stringify(r));
  r = await call('GET', `/inventory/stock?warehouse_id=${wh2}`);
  assert.equal(r.data[0].quantity, 40);
  r = await call('POST', '/inventory/receive', { warehouse_id: wh1, item_id: itemId, loose_quantity: 4, print: { enabled: false } });
  assert.equal(r.status, 201);
  r = await call('POST', '/inventory/count', { warehouse_id: wh1, item_id: itemId, counted_quantity: 6 });
  assert.equal(r.data.quantity, 6);
  r = await call('GET', '/dashboard');
  assert.equal(r.data.total_units, 46);
  r = await call('GET', '/inventory/movements?limit=5');
  assert(r.data.length > 0);
  r = await call('POST', `/boxes/${boxCode}/print`, { item_label_count: 0, printer_id: undefined });
  assert.equal(r.data.total_labels, 1);
  console.log('transfer / count / dashboard / reprint OK');

  server.close(); fake.close(); await db.sequelize.close();
  console.log('\nALL SMOKE TESTS PASSED');
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
