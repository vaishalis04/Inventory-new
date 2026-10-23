// Tests edit / delete cascading using SQLite (no MySQL needed):
//   node src/scripts/edit-delete-test.js
process.env.DB_DIALECT = 'sqlite';
process.env.DB_STORAGE = '/tmp/inventory-editdelete.sqlite';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test';
require('fs').rmSync(process.env.DB_STORAGE, { force: true });

const assert = require('assert');
const app = require('../../server');
const db = require('../models');

(async () => {
  await db.sequelize.sync();
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  let token;
  const call = async (method, path, body, tok = token) => {
    const r = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await r.json().catch(() => ({}));
    return { status: r.status, ...json };
  };
  const ok = (r, code = 200) => assert.equal(r.status, code, JSON.stringify(r));

  /** Every table that describes stock must agree with every other table. */
  async function invariants(label) {
    const stocks = await db.Stock.findAll();
    for (const s of stocks) {
      const w = { warehouse_id: s.warehouse_id, item_id: s.item_id };
      const avail = await db.InventoryUnit.count({ where: { ...w, status: 'AVAILABLE' } });
      assert.equal(avail, s.quantity, `${label}: stock ${s.quantity} != available units ${avail} (wh ${s.warehouse_id})`);
      const boxed = (await db.Box.sum('quantity', { where: { ...w, status: ['ACTIVE', 'EMPTY'] } })) || 0;
      assert(boxed <= s.quantity, `${label}: boxed ${boxed} > stock ${s.quantity}`);
      const chain = await db.StockMovement.findAll({ where: w, order: [['id', 'ASC']] });
      let run = null;
      for (const m of chain) {
        if (run !== null) assert.equal(m.balance_after, run + m.change, `${label}: ledger gap at movement ${m.id}`);
        assert(m.balance_after >= 0, `${label}: negative balance at ${m.id}`);
        run = m.balance_after;
      }
      if (chain.length) assert.equal(run, s.quantity, `${label}: last balance ${run} != stock ${s.quantity}`);
    }
    for (const b of await db.Box.findAll()) {
      const n = await db.InventoryUnit.count({ where: { box_id: b.id, status: 'AVAILABLE' } });
      assert.equal(n, b.quantity, `${label}: box ${b.code} qty ${b.quantity} != units ${n}`);
    }
    console.log(`  invariants OK: ${label}`);
  }

  let r = await call('POST', '/auth/register', { company_name: 'T Co', name: 'Admin', email: 'a@t.com', password: 'secret1' });
  ok(r, 201); token = r.data.token; const adminId = r.data.user.id; const wh1 = r.data.warehouse.id;
  r = await call('POST', '/warehouses', { name: 'WH2', code: 'W2' }); const wh2 = r.data.id;

  // ---- setup: 1 box of 50 + 10 loose
  r = await call('POST', '/inventory/receive', { warehouse_id: wh1, item: { name: 'Camera' }, boxes: [{ quantity: 50 }], loose_quantity: 10, print: { enabled: false } });
  ok(r, 201);
  const itemId = r.data.item.id; const boxCode = r.data.boxes[0].code; const itemQr = r.data.item_qr.code;
  await invariants('after receive');

  r = await call('POST', `/scan/${boxCode}/adjust`, { performed_by: 'T', action: 'OUT', quantity: 8 }); ok(r);
  r = await call('POST', `/scan/${boxCode}/adjust`, { performed_by: 'T', action: 'IN', quantity: 3 }); ok(r);
  r = await call('POST', `/scan/${itemQr}/adjust`, { performed_by: 'T', action: 'OUT', quantity: 4 }); ok(r); // loose first
  await invariants('after scans');
  let moves = (await call('GET', '/inventory/movements?limit=50')).data;
  const find = (type, q, src) => moves.find((m) => m.type === type && m.quantity === q && (!src || m.source === src));
  const box = async () => (await db.Box.findOne({ where: { code: boxCode } }));
  const stockQty = async (wh) => (await db.Stock.findOne({ where: { warehouse_id: wh, item_id: itemId } }))?.quantity;
  assert.equal(await stockQty(wh1), 51); // 60 -8 +3 -4
  assert.equal((await box()).quantity, 45);

  // ---- EDIT: box OUT 8 -> 5  => box 48, stock 54
  const out8 = find('OUT', 8);
  r = await call('PUT', `/inventory/movements/${out8.id}`, { quantity: 5, note: 'corrected' }); ok(r);
  assert.equal((await box()).quantity, 48); assert.equal(await stockQty(wh1), 54);
  assert.equal((await db.StockMovement.findByPk(out8.id)).change, -5);
  assert.equal((await db.StockMovement.findByPk(out8.id)).note, 'corrected');
  await invariants('edit OUT 8->5');
  console.log('edit movement -> box, stock, units and later balances follow');

  // EDIT too large => rejected, nothing changed
  r = await call('PUT', `/inventory/movements/${out8.id}`, { quantity: 9999 }); ok(r, 409);
  assert.equal((await box()).quantity, 48);
  await invariants('rejected edit leaves data intact');

  // EDIT an IN upward (creates units): IN 3 -> 6
  moves = (await call('GET', '/inventory/movements?limit=50')).data;
  r = await call('PUT', `/inventory/movements/${find('IN', 3).id}`, { quantity: 6 }); ok(r);
  assert.equal((await box()).quantity, 51); await invariants('edit IN 3->6');

  // ---- DELETE the IN movement => box back down
  moves = (await call('GET', '/inventory/movements?limit=50')).data;
  r = await call('DELETE', `/inventory/movements/${find('IN', 6, 'SCAN').id}`); ok(r);
  assert.equal((await box()).quantity, 45); await invariants('delete IN');

  // ---- DELETE the loose OUT 4 => loose restored
  moves = (await call('GET', '/inventory/movements?limit=50')).data;
  r = await call('DELETE', `/inventory/movements/${find('OUT', 4).id}`); ok(r);
  assert.equal(await stockQty(wh1), 55); await invariants('delete loose OUT');

  // ---- box transfer then delete (undo) it
  r = await call('POST', '/inventory/transfer', { box_code: boxCode, to_warehouse_id: wh2 }); ok(r);
  assert.equal((await box()).warehouse_id, wh2); assert.equal(await stockQty(wh2), 45);
  moves = (await call('GET', '/inventory/movements?limit=50')).data;
  const tin = moves.find((m) => m.type === 'TRANSFER_IN');
  r = await call('PUT', `/inventory/movements/${tin.id}`, { quantity: 3 }); ok(r, 422); // transfers not re-quantifiable
  r = await call('DELETE', `/inventory/movements/${tin.id}`); ok(r);
  assert.equal((await box()).warehouse_id, wh1); assert.equal(await stockQty(wh2), 0); assert.equal(await stockQty(wh1), 55);
  assert.equal(moves.filter((m) => m.type.startsWith('TRANSFER')).length, 2);
  assert.equal((await db.StockMovement.count({ where: { type: ['TRANSFER_IN', 'TRANSFER_OUT'] } })), 0);
  await invariants('undo box transfer');

  // ---- loose transfer 5 then delete OUT half
  r = await call('POST', '/inventory/transfer', { item_id: itemId, from_warehouse_id: wh1, to_warehouse_id: wh2, quantity: 5 }); ok(r);
  assert.equal(await stockQty(wh2), 5); assert.equal(await stockQty(wh1), 50);
  moves = (await call('GET', '/inventory/movements?limit=50')).data;
  r = await call('DELETE', `/inventory/movements/${moves.find((m) => m.type === 'TRANSFER_OUT').id}`); ok(r);
  assert.equal(await stockQty(wh2), 0); assert.equal(await stockQty(wh1), 55);
  await invariants('undo loose transfer');

  // ---- staff cannot edit/delete movements
  const keep = await db.StockMovement.findOne({ order: [['id', 'DESC']] });
  r = await call('POST', '/users', { name: 'Staffer', email: 's@t.com', password: 'secret1', role: 'staff' }); ok(r, 201);
  const staffId = r.data.id;
  const staffTok = (await call('POST', '/auth/login', { email: 's@t.com', password: 'secret1' }, null)).data.token;
  r = await call('DELETE', `/inventory/movements/${keep.id}`, null, staffTok); ok(r, 403);
  console.log('staff blocked from editing/deleting movements');

  // ---- user edit / delete rules
  r = await call('PUT', `/users/${staffId}`, { name: 'Staff Renamed', role: 'manager', password: 'newpass1' }); ok(r);
  assert.equal(r.data.role, 'manager');
  r = await call('POST', '/auth/login', { email: 's@t.com', password: 'newpass1' }, null); ok(r);
  r = await call('PUT', `/users/${staffId}`, { email: 'a@t.com' }); ok(r, 409); // duplicate email
  r = await call('PUT', `/users/${adminId}`, { role: 'staff' }); ok(r, 409); // cannot demote self
  r = await call('DELETE', `/users/${adminId}`); ok(r, 409); // cannot delete self
  r = await call('PUT', `/users/${staffId}`, { is_active: false }); ok(r);
  r = await call('POST', '/auth/login', { email: 's@t.com', password: 'newpass1' }, null); ok(r, 401);
  // make a movement attributed to the manager, then delete the manager -> movement stays, user_id cleared
  await db.StockMovement.update({ user_id: staffId }, { where: { id: keep.id } });
  r = await call('DELETE', `/users/${staffId}`); ok(r);
  assert.equal((await db.StockMovement.findByPk(keep.id)).user_id, null);
  assert.equal(await db.User.count({ where: { id: staffId } }), 0);
  console.log('user edit / deactivate / delete rules OK');

  // ---- box delete (separate box)
  r = await call('POST', '/inventory/receive', { warehouse_id: wh1, item_id: itemId, boxes: [{ quantity: 7 }], print: { enabled: false } }); ok(r, 201);
  const box2 = r.data.boxes[0].code;
  const before = await stockQty(wh1);
  r = await call('DELETE', `/boxes/${box2}`); ok(r);
  assert.equal(await stockQty(wh1), before - 7);
  assert.equal(await db.Box.count({ where: { code: box2 } }), 0);
  assert.equal(await db.StockMovement.count({ where: { reference: null, box_id: r.data?.id ?? -1 } }), 0);
  await invariants('delete box');

  // ---- deleting the RECEIVE movement of a box removes the whole box
  r = await call('POST', '/inventory/receive', { warehouse_id: wh1, item_id: itemId, boxes: [{ quantity: 9 }], print: { enabled: false } }); ok(r, 201);
  const box3 = r.data.boxes[0]; const unitsBefore = await db.InventoryUnit.count();
  const recv = await db.StockMovement.findOne({ where: { box_id: box3.id, source: 'RECEIVE' } });
  r = await call('DELETE', `/inventory/movements/${recv.id}`); ok(r);
  assert.equal(await db.Box.count({ where: { id: box3.id } }), 0);
  assert.equal(await db.InventoryUnit.count(), unitsBefore - 9);
  assert.equal(await db.StockMovement.count({ where: { box_id: box3.id } }), 0);
  await invariants('delete RECEIVE movement removes box');

  // ---- box edit (supplier / location / batch)
  r = await call('POST', '/suppliers', { name: 'Sup A' }); ok(r, 201); const supId = r.data.id;
  r = await call('PATCH', `/boxes/${boxCode}`, { location: 'Rack 9', batch_no: 'B1', supplier_id: supId }); ok(r);
  assert.equal(r.data.location, 'Rack 9'); assert.equal(r.data.supplier_id, supId);

  // ---- master data hard delete keeps related rows
  r = await call('DELETE', `/suppliers/${supId}`); ok(r);
  assert.equal(await db.Supplier.count({ where: { id: supId } }), 0);
  assert.equal((await box()).supplier_id, null);
  r = await call('POST', '/categories', { name: 'Cat A' }); const catId = r.data.id;
  await db.Item.update({ category_id: catId }, { where: { id: itemId } });
  r = await call('DELETE', `/categories/${catId}`); ok(r);
  assert.equal((await db.Item.findByPk(itemId)).category_id, null);
  r = await call('POST', '/printers', { name: 'P1', connection: 'BROWSER' }); ok(r, 201);
  r = await call('PUT', `/printers/${r.data.id}`, { name: 'P1 renamed' }); ok(r); assert.equal(r.data.name, 'P1 renamed');
  r = await call('DELETE', `/printers/${r.data.id}`); ok(r);
  console.log('suppliers / categories / printers edit + delete OK');

  // ---- stock record delete removes its movements too
  const stockRow = await db.Stock.findOne({ where: { warehouse_id: wh1, item_id: itemId } });
  assert((await db.StockMovement.count({ where: { warehouse_id: wh1, item_id: itemId } })) > 0);
  r = await call('DELETE', `/inventory/stock/${stockRow.id}`); ok(r);
  assert.equal(await db.Stock.count({ where: { id: stockRow.id } }), 0);
  assert.equal(await db.StockMovement.count({ where: { warehouse_id: wh1, item_id: itemId } }), 0);
  assert.equal(await db.Box.count({ where: { warehouse_id: wh1, item_id: itemId } }), 0);
  assert.equal(await db.InventoryUnit.count({ where: { warehouse_id: wh1, item_id: itemId } }), 0);
  await invariants('delete stock record');
  console.log('delete stock -> its boxes, units and movements deleted too');

  // ---- warehouse delete: refuses with data, cascade works
  r = await call('POST', '/inventory/receive', { warehouse_id: wh2, item_id: itemId, boxes: [{ quantity: 4 }], loose_quantity: 2, print: { enabled: false } }); ok(r, 201);
  r = await call('DELETE', `/warehouses/${wh2}`); ok(r, 409); assert(r.details.needs_cascade);
  r = await call('DELETE', `/warehouses/${wh2}?cascade=true`); ok(r);
  assert.equal(await db.Warehouse.count({ where: { id: wh2 } }), 0);
  assert.equal(await db.StockMovement.count({ where: { warehouse_id: wh2 } }), 0);
  assert.equal(await db.Box.count({ where: { warehouse_id: wh2 } }), 0);
  console.log('warehouse delete (refuse / cascade) OK');

  // ---- item delete cascades everything
  r = await call('POST', '/inventory/receive', { warehouse_id: wh1, item: { name: 'Temp item' }, boxes: [{ quantity: 3 }], loose_quantity: 2, print: { enabled: false } }); ok(r, 201);
  const tmp = r.data.item.id;
  r = await call('DELETE', `/items/${tmp}`); ok(r);
  for (const M of ['Item', 'Box', 'InventoryUnit', 'Stock', 'StockMovement']) {
    assert.equal(await db[M].count({ where: M === 'Item' ? { id: tmp } : { item_id: tmp } }), 0, `${M} not cleaned`);
  }
  await invariants('delete item');
  console.log('delete item -> stock, boxes, units, movements deleted too');

  server.close(); await db.sequelize.close();
  console.log('\nALL EDIT/DELETE TESTS PASSED');
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
