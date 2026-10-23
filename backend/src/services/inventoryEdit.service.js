const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const { genCode } = require('../utils/helpers');

const sequelize = db.sequelize;

/**
 * Edit / delete operations that keep every related table consistent.
 *
 * Tables that describe the same stock and must always agree:
 *   stocks            total pieces per warehouse + item
 *   boxes             pieces inside each physical box
 *   inventory_units   one row per physical piece
 *   stock_movements   the ledger (each row stores a running balance_after)
 *
 * Every function here runs inside ONE transaction. If any rule is violated
 * (for example the change would make stock negative) an ApiError is thrown and
 * the whole operation is rolled back, so nothing is ever half-applied.
 */

const isTransfer = (m) => m.type === 'TRANSFER_IN' || m.type === 'TRANSFER_OUT';
const isSingleUnitScan = (m) =>
  m.source === 'SCAN' && Number(m.quantity) === 1 && typeof m.reference === 'string' && m.reference.startsWith('UNT-');

const positiveInteger = (value, label = 'Quantity') => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new ApiError(400, `${label} must be a positive integer`);
  return n;
};

/* ------------------------------ small helpers ----------------------------- */

async function lockMovement(id, companyId, t) {
  const m = await db.StockMovement.findOne({
    where: { id, company_id: companyId },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!m) throw new ApiError(404, 'Stock movement not found');
  return m;
}

async function lockStockRow(companyId, warehouseId, itemId, t) {
  const where = { company_id: companyId, warehouse_id: warehouseId, item_id: itemId };
  let stock = await db.Stock.findOne({ where, transaction: t, lock: t.LOCK.UPDATE });
  if (!stock) stock = await db.Stock.create({ ...where, quantity: 0 }, { transaction: t });
  return stock;
}

async function boxedQty(companyId, warehouseId, itemId, t) {
  const total = await db.Box.sum('quantity', {
    where: { company_id: companyId, warehouse_id: warehouseId, item_id: itemId, status: { [Op.in]: ['ACTIVE', 'EMPTY'] } },
    transaction: t,
  });
  return Number(total || 0);
}

/** Make sure no running balance in one warehouse+item ledger is negative. */
async function verifyChain(companyId, warehouseId, itemId, t) {
  const bad = await db.StockMovement.count({
    where: { company_id: companyId, warehouse_id: warehouseId, item_id: itemId, balance_after: { [Op.lt]: 0 } },
    transaction: t,
  });
  if (bad) {
    throw new ApiError(
      409,
      'This change would make the running balance of a later movement negative. Edit or delete the later movements first.'
    );
  }
}

/**
 * Shift the running balance of every LATER movement in the same
 * warehouse + item ledger by `delta`.
 */
async function shiftChain({ companyId, warehouseId, itemId, afterId, delta, t, check = true }) {
  if (!delta) return;
  await db.StockMovement.increment('balance_after', {
    by: delta,
    where: { company_id: companyId, warehouse_id: warehouseId, item_id: itemId, id: { [Op.gt]: afterId } },
    transaction: t,
  });
  if (check && delta < 0) await verifyChain(companyId, warehouseId, itemId, t);
}

/* --------------------------- inventory unit upkeep ------------------------- */

async function adjustUnits(m, delta, t) {
  const companyId = m.company_id;
  const make = (n) =>
    Array.from({ length: n }, () => ({
      company_id: companyId,
      item_id: m.item_id,
      box_id: m.box_id || null,
      warehouse_id: m.warehouse_id,
      code: genCode('UNT'),
      status: 'AVAILABLE',
    }));

  // A scan of ONE specific QR piece: flip exactly that piece.
  if (isSingleUnitScan(m)) {
    const unit = await db.InventoryUnit.findOne({
      where: { code: m.reference, company_id: companyId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (unit) {
      if (delta > 0) {
        if (unit.status === 'AVAILABLE') throw new ApiError(409, 'That piece is already available (a later movement changed it)');
        unit.status = 'AVAILABLE';
      } else {
        if (unit.status !== 'AVAILABLE') throw new ApiError(409, `That piece is currently ${unit.status.toLowerCase()} and cannot be issued again`);
        unit.status = 'ISSUED';
      }
      await unit.save({ transaction: t });
      return;
    }
  }

  const scope = m.box_id
    ? { company_id: companyId, box_id: m.box_id }
    : { company_id: companyId, box_id: null, warehouse_id: m.warehouse_id, item_id: m.item_id };

  const stockWentIn = Number(m.change) > 0; // original movement added pieces

  if (stockWentIn) {
    if (delta > 0) {
      await db.InventoryUnit.bulkCreate(make(delta), { transaction: t, validate: true });
    } else {
      const need = -delta;
      const units = await db.InventoryUnit.findAll({
        where: { ...scope, status: 'AVAILABLE' },
        order: [['id', 'DESC']],
        limit: need,
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (units.length < need) {
        throw new ApiError(409, `Only ${units.length} of those pieces are still available; the rest were issued by later movements`);
      }
      await db.InventoryUnit.destroy({ where: { id: { [Op.in]: units.map((u) => u.id) } }, transaction: t });
    }
    return;
  }

  // original movement removed pieces (OUT / negative ADJUST)
  if (delta > 0) {
    const gone = await db.InventoryUnit.findAll({
      where: { ...scope, status: { [Op.in]: ['ISSUED', 'LOST'] } },
      order: [['id', 'DESC']],
      limit: delta,
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (gone.length) {
      await db.InventoryUnit.update(
        { status: 'AVAILABLE' },
        { where: { id: { [Op.in]: gone.map((u) => u.id) } }, transaction: t }
      );
    }
    if (gone.length < delta) await db.InventoryUnit.bulkCreate(make(delta - gone.length), { transaction: t, validate: true });
  } else {
    const need = -delta;
    const avail = await db.InventoryUnit.findAll({
      where: { ...scope, status: 'AVAILABLE' },
      order: [['id', 'ASC']],
      limit: need,
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (avail.length < need) throw new ApiError(409, `Only ${avail.length} piece(s) are available to take out`);
    await db.InventoryUnit.update(
      { status: m.type === 'ADJUST' ? 'LOST' : 'ISSUED' },
      { where: { id: { [Op.in]: avail.map((u) => u.id) } }, transaction: t }
    );
  }
}

/* --------------------- apply / undo the effect of a movement --------------- */

/**
 * Apply `delta` pieces (positive = more stock) on behalf of movement `m` to
 * the stock row, the box, the individual units and every later ledger row.
 * The movement row itself is NOT modified here.
 */
async function applyEffect(m, delta, t) {
  if (!delta) return;
  const companyId = m.company_id;

  let box = null;
  if (m.box_id) {
    box = await db.Box.findOne({ where: { id: m.box_id, company_id: companyId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!box) throw new ApiError(404, 'The box for this movement no longer exists');
    if (box.status === 'ARCHIVED') throw new ApiError(409, 'Box is archived');
    if (Number(box.warehouse_id) !== Number(m.warehouse_id)) {
      throw new ApiError(409, 'This box has since been moved to another warehouse. Undo the later transfer first.');
    }
    const nextBox = Number(box.quantity) + delta;
    if (nextBox < 0) throw new ApiError(409, `Box only holds ${box.quantity} piece(s); the change would make it negative`);
    if (m.source === 'RECEIVE') {
      const nextInitial = Number(box.initial_quantity) + delta;
      if (nextInitial < 1) throw new ApiError(409, 'Box received quantity must stay at least 1');
      box.initial_quantity = nextInitial;
    }
    box.quantity = nextBox;
    box.status = nextBox === 0 ? 'EMPTY' : 'ACTIVE';
    await box.save({ transaction: t });

    await db.StockMovement.increment('box_balance_after', {
      by: delta,
      where: { company_id: companyId, box_id: box.id, id: { [Op.gt]: m.id }, box_balance_after: { [Op.ne]: null } },
      transaction: t,
    });
  }

  const stock = await lockStockRow(companyId, m.warehouse_id, m.item_id, t);
  const next = Number(stock.quantity) + delta;
  if (next < 0) throw new ApiError(409, `Warehouse stock is ${stock.quantity}; the change would make it negative`);
  if (!box) {
    const boxed = await boxedQty(companyId, m.warehouse_id, m.item_id, t);
    if (next < boxed) {
      throw new ApiError(409, `${boxed} piece(s) are recorded inside boxes in this warehouse; loose stock cannot go below zero`);
    }
  }
  stock.quantity = next;
  await stock.save({ transaction: t });

  await shiftChain({ companyId, warehouseId: m.warehouse_id, itemId: m.item_id, afterId: m.id, delta, t });
  await adjustUnits(m, delta, t);
}

/* ------------------------------- remove a box ------------------------------ */

/**
 * Delete a box: its pieces leave the stock total, its units and its whole
 * movement history are removed, and later balances in affected ledgers shift.
 */
async function removeBox(box, t, { skipChecks = false } = {}) {
  const companyId = box.company_id;

  const moves = await db.StockMovement.findAll({
    where: { company_id: companyId, box_id: box.id },
    order: [['id', 'ASC']],
    transaction: t,
  });
  await db.StockMovement.destroy({ where: { company_id: companyId, box_id: box.id }, transaction: t });

  const chains = new Map();
  for (const m of moves) {
    await shiftChain({
      companyId, warehouseId: m.warehouse_id, itemId: m.item_id, afterId: m.id, delta: -Number(m.change), t, check: false,
    });
    chains.set(`${m.warehouse_id}:${m.item_id}`, [m.warehouse_id, m.item_id]);
  }

  const stock = await lockStockRow(companyId, box.warehouse_id, box.item_id, t);
  const next = Number(stock.quantity) - Number(box.quantity);
  if (next < 0 && !skipChecks) throw new ApiError(409, 'Inventory mismatch: stock total is lower than the box contents');
  stock.quantity = Math.max(0, next);
  await stock.save({ transaction: t });

  if (!skipChecks) {
    for (const [wh, item] of chains.values()) await verifyChain(companyId, wh, item, t);
  }

  const units = await db.InventoryUnit.destroy({ where: { company_id: companyId, box_id: box.id }, transaction: t });
  await db.PrintJob.update({ box_id: null }, { where: { company_id: companyId, box_id: box.id }, transaction: t });
  await box.destroy({ transaction: t });

  return { deleted_movements: moves.length, deleted_units: units, removed_pieces: Number(box.quantity) };
}

/* ------------------------------ undo a transfer ---------------------------- */

async function reverseTransfer(m, t) {
  const companyId = m.company_id;
  const wantType = m.type === 'TRANSFER_OUT' ? 'TRANSFER_IN' : 'TRANSFER_OUT';
  const idCond = m.type === 'TRANSFER_OUT' ? { [Op.gt]: m.id } : { [Op.lt]: m.id };

  const other = await db.StockMovement.findOne({
    where: {
      company_id: companyId, item_id: m.item_id, type: wantType, reference: m.reference,
      quantity: m.quantity, box_id: m.box_id ?? null, id: idCond,
    },
    order: [['id', m.type === 'TRANSFER_OUT' ? 'ASC' : 'DESC']],
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!other) throw new ApiError(409, 'The matching other half of this transfer was not found');

  const out = m.type === 'TRANSFER_OUT' ? m : other;
  const inn = m.type === 'TRANSFER_IN' ? m : other;
  const q = Number(out.quantity);

  if (m.box_id) {
    const box = await db.Box.findOne({ where: { id: m.box_id, company_id: companyId }, transaction: t, lock: t.LOCK.UPDATE });
    if (!box) throw new ApiError(404, 'The box for this transfer no longer exists');
    if (Number(box.warehouse_id) !== Number(inn.warehouse_id)) {
      throw new ApiError(409, 'This box has been moved again. Undo the later transfer first.');
    }
    const later = await db.StockMovement.count({
      where: { company_id: companyId, box_id: box.id, id: { [Op.gt]: Math.max(out.id, inn.id) } },
      transaction: t,
    });
    if (later) throw new ApiError(409, 'This box has later movements. Delete or undo those first.');
  }

  // source warehouse gets the pieces back
  const from = await lockStockRow(companyId, out.warehouse_id, out.item_id, t);
  from.quantity = Number(from.quantity) + q;
  await from.save({ transaction: t });
  await shiftChain({ companyId, warehouseId: out.warehouse_id, itemId: out.item_id, afterId: out.id, delta: q, t });

  // destination warehouse loses them
  const to = await lockStockRow(companyId, inn.warehouse_id, inn.item_id, t);
  const toNext = Number(to.quantity) - q;
  if (toNext < 0) throw new ApiError(409, 'Destination warehouse no longer holds enough stock to undo this transfer');
  if (!m.box_id) {
    const boxed = await boxedQty(companyId, inn.warehouse_id, inn.item_id, t);
    if (toNext < boxed) throw new ApiError(409, 'Destination warehouse no longer holds enough loose stock to undo this transfer');
  }
  to.quantity = toNext;
  await to.save({ transaction: t });
  await shiftChain({ companyId, warehouseId: inn.warehouse_id, itemId: inn.item_id, afterId: inn.id, delta: -q, t });

  if (m.box_id) {
    await db.InventoryUnit.update(
      { warehouse_id: out.warehouse_id },
      { where: { company_id: companyId, box_id: m.box_id }, transaction: t }
    );
    await db.Box.update({ warehouse_id: out.warehouse_id }, { where: { id: m.box_id, company_id: companyId }, transaction: t });
  } else {
    const units = await db.InventoryUnit.findAll({
      where: { company_id: companyId, warehouse_id: inn.warehouse_id, item_id: inn.item_id, box_id: null, status: 'AVAILABLE' },
      order: [['id', 'DESC']],
      limit: q,
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (units.length < q) throw new ApiError(409, 'Some transferred pieces have since been issued, so the transfer cannot be undone');
    await db.InventoryUnit.update(
      { warehouse_id: out.warehouse_id },
      { where: { id: { [Op.in]: units.map((u) => u.id) } }, transaction: t }
    );
  }

  await db.StockMovement.destroy({ where: { id: { [Op.in]: [out.id, inn.id] } }, transaction: t });
  return { deleted_movements: 2, undone_transfer: true };
}

/* ================================ public API =============================== */

/** Edit a movement's quantity / note / reference and propagate everywhere. */
exports.editMovement = (user, id, body) =>
  sequelize.transaction(async (t) => {
    const m = await lockMovement(id, user.company_id, t);
    const patch = {};

    if (body.note !== undefined) patch.note = body.note || null;
    if (body.reference !== undefined) {
      if (isTransfer(m)) throw new ApiError(422, 'The reference of a transfer cannot be changed');
      patch.reference = body.reference || null;
    }

    if (body.quantity !== undefined && Number(body.quantity) !== Number(m.quantity)) {
      if (isTransfer(m)) throw new ApiError(422, 'Transfers cannot be re-quantified. Delete the transfer and create a new one.');
      if (isSingleUnitScan(m)) throw new ApiError(422, 'A single-piece scan always has quantity 1');
      const q = positiveInteger(body.quantity);
      const newChange = Math.sign(Number(m.change)) * q;
      const diff = newChange - Number(m.change);

      await applyEffect(m, diff, t);

      patch.change = newChange;
      patch.quantity = q;
      patch.balance_after = Number(m.balance_after) + diff;
      if (m.box_id && m.box_balance_after !== null && m.box_balance_after !== undefined) {
        patch.box_balance_after = Number(m.box_balance_after) + diff;
      }
    }

    if (!Object.keys(patch).length) return { movement: m, changed: false };

    await m.update(patch, { transaction: t });

    // keep both halves of a transfer in sync for the note
    if (isTransfer(m) && patch.note !== undefined) {
      const wantType = m.type === 'TRANSFER_OUT' ? 'TRANSFER_IN' : 'TRANSFER_OUT';
      const other = await db.StockMovement.findOne({
        where: {
          company_id: m.company_id, item_id: m.item_id, reference: m.reference, quantity: m.quantity,
          box_id: m.box_id ?? null, type: wantType,
          id: m.type === 'TRANSFER_OUT' ? { [Op.gt]: m.id } : { [Op.lt]: m.id },
        },
        order: [['id', m.type === 'TRANSFER_OUT' ? 'ASC' : 'DESC']],
        transaction: t,
      });
      if (other) await other.update({ note: patch.note }, { transaction: t });
    }

    return { movement: m, changed: true };
  });

/** Delete a movement and undo everything it did. */
exports.deleteMovement = (user, id) =>
  sequelize.transaction(async (t) => {
    const m = await lockMovement(id, user.company_id, t);

    if (isTransfer(m)) return reverseTransfer(m, t);

    // The receipt of a box IS the box: deleting it removes the whole box.
    if (m.box_id && m.source === 'RECEIVE') {
      const box = await db.Box.findOne({ where: { id: m.box_id, company_id: m.company_id }, transaction: t, lock: t.LOCK.UPDATE });
      if (box) return { ...(await removeBox(box, t)), deleted_box: box.code };
    }

    await applyEffect(m, -Number(m.change), t);
    await m.destroy({ transaction: t });
    return { deleted_movements: 1 };
  });

/** Delete a box (by code) together with its units and movements. */
exports.deleteBox = (user, box) =>
  sequelize.transaction(async (t) => {
    const locked = await db.Box.findOne({ where: { id: box.id, company_id: user.company_id }, transaction: t, lock: t.LOCK.UPDATE });
    if (!locked) throw new ApiError(404, 'Box not found');
    return removeBox(locked, t);
  });

async function removeStock(stock, t) {
  const companyId = stock.company_id;
  const { warehouse_id: warehouseId, item_id: itemId } = stock;

  const boxes = await db.Box.findAll({
    where: { company_id: companyId, warehouse_id: warehouseId, item_id: itemId },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  const totals = { deleted_boxes: 0, deleted_units: 0, deleted_movements: 0 };
  for (const box of boxes) {
    const r = await removeBox(box, t, { skipChecks: true });
    totals.deleted_boxes += 1;
    totals.deleted_units += r.deleted_units;
    totals.deleted_movements += r.deleted_movements;
  }

  totals.deleted_units += await db.InventoryUnit.destroy({
    where: { company_id: companyId, warehouse_id: warehouseId, item_id: itemId, box_id: null },
    transaction: t,
  });
  totals.deleted_movements += await db.StockMovement.destroy({
    where: { company_id: companyId, warehouse_id: warehouseId, item_id: itemId },
    transaction: t,
  });
  await db.Stock.destroy({ where: { id: stock.id }, transaction: t });
  return totals;
}

/** Delete a stock record: its boxes, units and every movement of that item in that warehouse. */
exports.deleteStock = (user, id) =>
  sequelize.transaction(async (t) => {
    const stock = await db.Stock.findOne({ where: { id, company_id: user.company_id }, transaction: t, lock: t.LOCK.UPDATE });
    if (!stock) throw new ApiError(404, 'Stock record not found');
    return removeStock(stock, t);
  });

/** Permanently delete an item with all of its stock, boxes, units, movements and print jobs. */
exports.deleteItem = (user, item) =>
  sequelize.transaction(async (t) => {
    const where = { company_id: user.company_id, item_id: item.id };
    const result = {
      deleted_movements: await db.StockMovement.destroy({ where, transaction: t }),
      deleted_units: await db.InventoryUnit.destroy({ where, transaction: t }),
      deleted_boxes: await db.Box.destroy({ where, transaction: t }),
      deleted_stock_records: await db.Stock.destroy({ where, transaction: t }),
      deleted_print_jobs: await db.PrintJob.destroy({ where, transaction: t }),
    };
    await db.Item.destroy({ where: { id: item.id, company_id: user.company_id }, transaction: t });
    return result;
  });

/** Permanently delete a warehouse. Without `cascade` it refuses when it holds data. */
exports.deleteWarehouse = (user, warehouse, cascade = false) =>
  sequelize.transaction(async (t) => {
    const companyId = user.company_id;
    const where = { company_id: companyId, warehouse_id: warehouse.id };

    const summary = {
      stock_records: await db.Stock.count({ where, transaction: t }),
      boxes: await db.Box.count({ where, transaction: t }),
      movements: await db.StockMovement.count({ where, transaction: t }),
    };
    const hasData = summary.stock_records || summary.boxes || summary.movements;
    if (hasData && !cascade) {
      throw new ApiError(
        409,
        `This warehouse still has ${summary.stock_records} stock record(s), ${summary.boxes} box(es) and ${summary.movements} movement(s). Deleting it will remove all of them.`,
        { needs_cascade: true, ...summary }
      );
    }

    const result = { deleted_boxes: 0, deleted_units: 0, deleted_movements: 0, deleted_stock_records: 0 };
    const stocks = await db.Stock.findAll({ where, transaction: t, lock: t.LOCK.UPDATE });
    for (const stock of stocks) {
      const r = await removeStock(stock, t);
      result.deleted_boxes += r.deleted_boxes;
      result.deleted_units += r.deleted_units;
      result.deleted_movements += r.deleted_movements;
      result.deleted_stock_records += 1;
    }
    const leftoverBoxes = await db.Box.findAll({ where, transaction: t, lock: t.LOCK.UPDATE });
    for (const box of leftoverBoxes) {
      const r = await removeBox(box, t, { skipChecks: true });
      result.deleted_boxes += 1;
      result.deleted_units += r.deleted_units;
      result.deleted_movements += r.deleted_movements;
    }
    result.deleted_units += await db.InventoryUnit.destroy({ where, transaction: t });
    result.deleted_movements += await db.StockMovement.destroy({ where, transaction: t });
    await db.Printer.update({ warehouse_id: null }, { where, transaction: t });
    await db.Warehouse.destroy({ where: { id: warehouse.id, company_id: companyId }, transaction: t });
    return result;
  });
