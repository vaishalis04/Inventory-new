const { Op, QueryTypes } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const { genCode } = require('../utils/code');

const sequelize = db.sequelize;

/* ---------- low level helpers (always call inside a transaction) ---------- */

async function lockStock(companyId, warehouseId, itemId, t) {
  const where = { company_id: companyId, warehouse_id: warehouseId, item_id: itemId };
  let row = await db.Stock.findOne({ where, transaction: t, lock: t.LOCK.UPDATE });
  if (!row) row = await db.Stock.create({ ...where, quantity: 0 }, { transaction: t });
  return row;
}

async function boxedQty(companyId, warehouseId, itemId, t) {
  const sum = await db.Box.sum('quantity', {
    where: { company_id: companyId, warehouse_id: warehouseId, item_id: itemId, status: 'ACTIVE' },
    transaction: t,
  });
  return sum || 0;
}

// Quantity of an item that is NOT inside any active box.
async function looseQty(companyId, warehouseId, itemId, t) {
  const stock = await lockStock(companyId, warehouseId, itemId, t);
  return stock.quantity - (await boxedQty(companyId, warehouseId, itemId, t));
}

async function applyStockChange(p, t) {
  const stock = await lockStock(p.companyId, p.warehouseId, p.itemId, t);
  const newQty = stock.quantity + p.delta;
  if (newQty < 0) throw new ApiError(409, `Insufficient stock in warehouse (available ${stock.quantity})`);
  stock.quantity = newQty;
  await stock.save({ transaction: t });
  return db.StockMovement.create({
    company_id: p.companyId,
    warehouse_id: p.warehouseId,
    item_id: p.itemId,
    box_id: p.boxId || null,
    type: p.type,
    source: p.source || 'MANUAL',
    change: p.delta,
    quantity: Math.abs(p.delta),
    balance_after: newQty,
    box_balance_after: p.boxBalanceAfter === undefined ? null : p.boxBalanceAfter,
    reference: p.reference || null,
    note: p.note || null,
    user_id: p.userId || null,
  }, { transaction: t });
}

async function mustFind(Model, where, t, label) {
  const row = await Model.findOne({ where, transaction: t });
  if (!row) throw new ApiError(404, `${label} not found`);
  return row;
}

/* ---------------------------- receive material --------------------------- */

exports.receive = async (user, body) => {
  const companyId = user.company_id;
  const loose = body.loose_quantity || 0;
  const boxPlan = [];
  (body.boxes || []).forEach((b) => { for (let i = 0; i < (b.count || 1); i += 1) boxPlan.push(b.quantity); });
  if (!boxPlan.length && !loose) throw new ApiError(422, 'Provide boxes or loose_quantity to receive');

  return sequelize.transaction(async (t) => {
    await mustFind(db.Warehouse, { id: body.warehouse_id, company_id: companyId, is_active: true }, t, 'Warehouse');

    let item;
    if (body.item_id) {
      item = await mustFind(db.Item, { id: body.item_id, company_id: companyId }, t, 'Item');
    } else {
      const d = body.item;
      item = await db.Item.create({
        ...d,
        company_id: companyId,
        sku: d.sku || genCode('SKU'),
        qr_code: genCode('ITM'),
      }, { transaction: t });
    }

    const boxes = [];
    for (const qty of boxPlan) {
      const box = await db.Box.create({
        company_id: companyId,
        warehouse_id: body.warehouse_id,
        item_id: item.id,
        code: genCode('BOX'),
        initial_quantity: qty,
        quantity: qty,
        supplier_id: body.supplier_id || null,
        batch_no: body.batch_no || null,
        location: body.location || null,
      }, { transaction: t });
      await applyStockChange({
        companyId, warehouseId: body.warehouse_id, itemId: item.id, boxId: box.id, delta: qty,
        type: 'IN', source: 'RECEIVE', boxBalanceAfter: qty, reference: body.reference, note: body.note, userId: user.id,
      }, t);
      boxes.push(box);
    }
    if (loose) {
      await applyStockChange({
        companyId, warehouseId: body.warehouse_id, itemId: item.id, delta: loose,
        type: 'IN', source: 'RECEIVE', reference: body.reference, note: body.note, userId: user.id,
      }, t);
    }
    return { item, boxes, loose_quantity: loose };
  });
};

/* ------------------------ box in / out (scan flow) ----------------------- */

async function adjustBoxTx(p, t) {
  const box = await db.Box.findOne({ where: { code: p.code, company_id: p.companyId }, transaction: t, lock: t.LOCK.UPDATE });
  if (!box) throw new ApiError(404, 'Box not found');
  if (box.status === 'ARCHIVED') throw new ApiError(409, 'Box is archived');
  const delta = p.action === 'OUT' ? -p.quantity : p.quantity;
  const newQty = box.quantity + delta;
  if (newQty < 0) throw new ApiError(409, `Box only has ${box.quantity} left`);
  const movement = await applyStockChange({
    companyId: p.companyId, warehouseId: box.warehouse_id, itemId: box.item_id, boxId: box.id, delta,
    type: p.action, source: p.source || 'SCAN', boxBalanceAfter: newQty, note: p.note, reference: p.reference, userId: p.userId,
  }, t);
  box.quantity = newQty;
  box.status = newQty === 0 ? 'EMPTY' : 'ACTIVE';
  await box.save({ transaction: t });
  return { box, movement };
}

exports.adjustBox = (p) => sequelize.transaction((t) => adjustBoxTx(p, t));

// Scan of the MATERIAL qr: take out / add units of an item in a warehouse.
exports.adjustItem = (p) => sequelize.transaction(async (t) => {
  const { companyId, userId, item, warehouseId, action, quantity, boxCode, autoBox, note } = p;
  await mustFind(db.Warehouse, { id: warehouseId, company_id: companyId }, t, 'Warehouse');

  if (boxCode) {
    const box = await mustFind(db.Box, { code: boxCode, company_id: companyId }, t, 'Box');
    if (box.item_id !== item.id) throw new ApiError(422, 'That box does not contain this material');
    return { results: [await adjustBoxTx({ companyId, userId, code: boxCode, action, quantity, note }, t)] };
  }

  if (action === 'IN') {
    const movement = await applyStockChange({
      companyId, warehouseId, itemId: item.id, delta: quantity, type: 'IN', source: 'SCAN', note, userId,
    }, t);
    return { results: [{ movement }] };
  }

  // OUT: loose stock first, then (optionally) oldest boxes first
  let remaining = quantity;
  const results = [];
  const loose = Math.max(await looseQty(companyId, warehouseId, item.id, t), 0);
  const fromLoose = Math.min(loose, remaining);
  if (fromLoose > 0) {
    results.push({ movement: await applyStockChange({
      companyId, warehouseId, itemId: item.id, delta: -fromLoose, type: 'OUT', source: 'SCAN', note, userId,
    }, t) });
    remaining -= fromLoose;
  }
  if (remaining > 0) {
    if (!autoBox) {
      const boxes = await db.Box.findAll({
        where: { company_id: companyId, warehouse_id: warehouseId, item_id: item.id, status: 'ACTIVE' },
        attributes: ['code', 'quantity'], transaction: t,
      });
      throw new ApiError(409, `Only ${loose} loose unit(s) available. Scan the box QR, pass box_code, or set auto_box=true`, boxes);
    }
    const boxes = await db.Box.findAll({
      where: { company_id: companyId, warehouse_id: warehouseId, item_id: item.id, status: 'ACTIVE', quantity: { [Op.gt]: 0 } },
      order: [['received_at', 'ASC'], ['id', 'ASC']], transaction: t,
    });
    for (const b of boxes) {
      if (remaining <= 0) break;
      const take = Math.min(b.quantity, remaining);
      results.push(await adjustBoxTx({ companyId, userId, code: b.code, action: 'OUT', quantity: take, note }, t));
      remaining -= take;
    }
    if (remaining > 0) throw new ApiError(409, `Insufficient stock, short by ${remaining}`);
  }
  return { results };
});

/* ------------------------------ transfers -------------------------------- */

exports.transfer = (p) => sequelize.transaction(async (t) => {
  const { companyId, userId, toWarehouseId, note } = p;
  const to = await mustFind(db.Warehouse, { id: toWarehouseId, company_id: companyId, is_active: true }, t, 'Destination warehouse');

  if (p.boxCode) {
    const box = await db.Box.findOne({ where: { code: p.boxCode, company_id: companyId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!box) throw new ApiError(404, 'Box not found');
    if (box.warehouse_id === to.id) throw new ApiError(422, 'Box is already in that warehouse');
    const from = box.warehouse_id;
    const ref = `TRANSFER ${from}->${to.id}`;
    await applyStockChange({ companyId, warehouseId: from, itemId: box.item_id, boxId: box.id, delta: -box.quantity,
      type: 'TRANSFER_OUT', source: 'TRANSFER', boxBalanceAfter: box.quantity, reference: ref, note, userId }, t);
    await applyStockChange({ companyId, warehouseId: to.id, itemId: box.item_id, boxId: box.id, delta: box.quantity,
      type: 'TRANSFER_IN', source: 'TRANSFER', boxBalanceAfter: box.quantity, reference: ref, note, userId }, t);
    box.warehouse_id = to.id;
    await box.save({ transaction: t });
    return { box };
  }

  // loose units
  if (p.fromWarehouseId === to.id) throw new ApiError(422, 'Source and destination are the same');
  await mustFind(db.Warehouse, { id: p.fromWarehouseId, company_id: companyId }, t, 'Source warehouse');
  await mustFind(db.Item, { id: p.itemId, company_id: companyId }, t, 'Item');
  const loose = await looseQty(companyId, p.fromWarehouseId, p.itemId, t);
  if (loose < p.quantity) throw new ApiError(409, `Only ${loose} loose unit(s) in source warehouse (move boxes by box_code)`);
  const ref = `TRANSFER ${p.fromWarehouseId}->${to.id}`;
  await applyStockChange({ companyId, warehouseId: p.fromWarehouseId, itemId: p.itemId, delta: -p.quantity,
    type: 'TRANSFER_OUT', source: 'TRANSFER', reference: ref, note, userId }, t);
  await applyStockChange({ companyId, warehouseId: to.id, itemId: p.itemId, delta: p.quantity,
    type: 'TRANSFER_IN', source: 'TRANSFER', reference: ref, note, userId }, t);
  return { moved: p.quantity };
});

/* ------------------- physical count / stock correction ------------------- */

exports.adjustCount = (p) => sequelize.transaction(async (t) => {
  const { companyId, userId, warehouseId, itemId, countedQuantity, note } = p;
  await mustFind(db.Warehouse, { id: warehouseId, company_id: companyId }, t, 'Warehouse');
  await mustFind(db.Item, { id: itemId, company_id: companyId }, t, 'Item');
  const stock = await lockStock(companyId, warehouseId, itemId, t);
  const inBoxes = await boxedQty(companyId, warehouseId, itemId, t);
  if (countedQuantity < inBoxes) {
    throw new ApiError(409, `${inBoxes} unit(s) are recorded inside boxes; correct those boxes first`);
  }
  const delta = countedQuantity - stock.quantity;
  if (delta === 0) return { movement: null, quantity: stock.quantity };
  const movement = await applyStockChange({
    companyId, warehouseId, itemId, delta, type: 'ADJUST', source: 'MANUAL', note: note || 'Physical count', userId,
  }, t);
  return { movement, quantity: countedQuantity };
});

/* -------------------------------- reports -------------------------------- */

exports.lowStock = (companyId) => sequelize.query(
  `SELECT i.id, i.sku, i.name, i.model, i.min_stock, COALESCE(SUM(s.quantity),0) AS total_quantity
   FROM items i LEFT JOIN stocks s ON s.item_id = i.id
   WHERE i.company_id = :companyId AND i.is_active = 1 AND i.min_stock > 0
   GROUP BY i.id, i.sku, i.name, i.model, i.min_stock
   HAVING COALESCE(SUM(s.quantity),0) < i.min_stock
   ORDER BY i.name`,
  { replacements: { companyId }, type: QueryTypes.SELECT },
);

exports.looseQty = (companyId, warehouseId, itemId) =>
  sequelize.transaction((t) => looseQty(companyId, warehouseId, itemId, t));
