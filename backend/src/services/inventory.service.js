
const { Op, QueryTypes } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const { genCode } = require('../utils/helpers');

const sequelize = db.sequelize;

/**
 * Inventory quantity rules:
 * - Box row = one physical box.
 * - Box.quantity = individual pieces currently inside that box.
 * - Box.initial_quantity = individual pieces originally inside that box.
 * - Stock.quantity = total individual pieces in a warehouse, including boxed
 *   and loose pieces.
 *
 * Example: 1 box containing 50 pieces means:
 * boxes.quantity = 50
 * stocks.quantity = 50
 */

function positiveInteger(value, label = 'Quantity') {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new ApiError(400, `${label} must be a positive integer`);
  }

  return number;
}

function nonNegativeInteger(value, label = 'Quantity') {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw new ApiError(400, `${label} must be a non-negative integer`);
  }

  return number;
}

async function lockStock(companyId, warehouseId, itemId, t) {
  const where = {
    company_id: companyId,
    warehouse_id: warehouseId,
    item_id: itemId,
  };

  let stock = await db.Stock.findOne({
    where,
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!stock) {
    stock = await db.Stock.create(
      { ...where, quantity: 0 },
      { transaction: t }
    );
  }

  return stock;
}

async function boxedQty(companyId, warehouseId, itemId, t) {
  const total = await db.Box.sum('quantity', {
    where: {
      company_id: companyId,
      warehouse_id: warehouseId,
      item_id: itemId,
      status: { [Op.in]: ['ACTIVE', 'EMPTY'] },
    },
    transaction: t,
  });

  return Number(total || 0);
}

async function looseQty(companyId, warehouseId, itemId, t) {
  const stock = await lockStock(companyId, warehouseId, itemId, t);
  const boxed = await boxedQty(companyId, warehouseId, itemId, t);

  const loose = Number(stock.quantity) - boxed;

  if (loose < 0) {
    throw new ApiError(
      409,
      `Inventory mismatch: boxed quantity (${boxed}) exceeds warehouse stock (${stock.quantity})`
    );
  }

  return loose;
}

async function applyStockChange(p, t) {
  const delta = Number(p.delta);

  if (!Number.isSafeInteger(delta) || delta === 0) {
    throw new ApiError(400, 'Stock change must be a non-zero integer');
  }

  const stock = await lockStock(
    p.companyId,
    p.warehouseId,
    p.itemId,
    t
  );

  const current = Number(stock.quantity);
  const newQty = current + delta;

  if (newQty < 0) {
    throw new ApiError(
      409,
      `Insufficient stock in warehouse (available ${current})`
    );
  }

  stock.quantity = newQty;
  await stock.save({ transaction: t });

  return db.StockMovement.create(
    {
      company_id: p.companyId,
      warehouse_id: p.warehouseId,
      item_id: p.itemId,
      box_id: p.boxId || null,
      type: p.type,
      source: p.source || 'MANUAL',
      change: delta,
      quantity: Math.abs(delta),
      balance_after: newQty,
      box_balance_after:
        p.boxBalanceAfter === undefined ? null : p.boxBalanceAfter,
      reference: p.reference || null,
      note: p.note || null,
      user_id: p.userId || null,
    },
    { transaction: t }
  );
}

async function mustFind(Model, where, t, label) {
  const row = await Model.findOne({
    where,
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!row) {
    throw new ApiError(404, `${label} not found`);
  }

  return row;
}

async function findBoxForUpdate(code, companyId, t) {
  const box = await db.Box.findOne({
    where: {
      code,
      company_id: companyId,
    },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!box) {
    throw new ApiError(404, 'Box not found');
  }

  if (box.status === 'ARCHIVED') {
    throw new ApiError(409, 'Box is archived');
  }

  return box;
}

/**
 * Receive stock.
 *
 * Supported request example:
 * {
 *   warehouse_id: 1,
 *   item_id: 1,
 *   boxes: [{ count: 1, quantity: 50 }],
 *   loose_quantity: 0
 * }
 *
 * Creates one physical box containing 50 pieces and adds 50 pieces
 * to warehouse stock.
 *
 * For an existing item, boxes[].quantity is the number of pieces
 * inside each physical box.
 */
exports.receive = async (user, body) => {
  const companyId = user.company_id;
  const warehouseId = Number(body.warehouse_id);
  if (!Number.isSafeInteger(warehouseId) || warehouseId <= 0) throw new ApiError(400, 'Valid warehouse_id is required');
  // Item-based receiving: each barcode becomes one individual item (no box).
  const barcodes = (Array.isArray(body.barcodes) ? body.barcodes : []).map((b) => String(b).trim().toUpperCase()).filter(Boolean);
  if (new Set(barcodes).size !== barcodes.length) throw new ApiError(422, 'Duplicate barcodes found. Every item must have a unique barcode');
  const loose = barcodes.length ? barcodes.length : nonNegativeInteger(body.loose_quantity ?? 0, 'Loose quantity');
  const boxPlan = (Array.isArray(body.boxes) ? body.boxes : []).map((entry) => positiveInteger(entry.quantity, 'Items in box'));
  if (boxPlan.length > 1000) throw new ApiError(400, 'A receipt can contain at most 1,000 boxes');
  const unitCount = boxPlan.reduce((sum, n) => sum + n, loose);
  if (unitCount < 1) throw new ApiError(422, 'Add at least one box with items or a positive loose quantity');
  if (unitCount > 20000) throw new ApiError(400, 'A single receipt is limited to 20,000 individual items to protect server resources');

  return sequelize.transaction(async (t) => {
    await mustFind(db.Warehouse, { id: warehouseId, company_id: companyId, is_active: true }, t, 'Warehouse');
    let item;
    if (body.item_id) {
      item = await mustFind(db.Item, { id: Number(body.item_id), company_id: companyId, is_active: true }, t, 'Item');
    } else {
      const details = body.item;
      if (!details || !String(details.name || '').trim()) throw new ApiError(400, 'Item name is required');
      item = await db.Item.create({ ...details, name: String(details.name).trim(), company_id: companyId, sku: details.sku || genCode('SKU'), qr_code: genCode('ITM') }, { transaction: t });
    }
    if (barcodes.length) {
      const taken = await db.InventoryUnit.findAll({ where: { code: { [Op.in]: barcodes } }, attributes: ['code'], transaction: t });
      if (taken.length) throw new ApiError(409, `Barcode already exists: ${taken.slice(0, 5).map((u) => u.code).join(', ')}${taken.length > 5 ? '…' : ''}`);
    }
    const boxes = [];
    for (const quantity of boxPlan) {
      const box = await db.Box.create({ company_id: companyId, warehouse_id: warehouseId, item_id: item.id, code: genCode('BOX'), initial_quantity: quantity, quantity, status: 'ACTIVE', supplier_id: body.supplier_id || null, batch_no: body.batch_no || null, location: body.location || null }, { transaction: t });
      const units = Array.from({ length: quantity }, () => ({ company_id: companyId, item_id: item.id, box_id: box.id, warehouse_id: warehouseId, code: genCode('UNT'), status: 'AVAILABLE' }));
      await db.InventoryUnit.bulkCreate(units, { transaction: t, validate: true });
      await applyStockChange({ companyId, warehouseId, itemId: item.id, boxId: box.id, delta: quantity, type: 'IN', source: 'RECEIVE', boxBalanceAfter: quantity, reference: body.reference, note: body.note, userId: user.id }, t);
      boxes.push(box);
    }
    let looseUnits = [];
    if (loose > 0) {
      looseUnits = Array.from({ length: loose }, (_, i) => ({ company_id: companyId, item_id: item.id, box_id: null, warehouse_id: warehouseId, code: barcodes[i] || genCode('UNT'), status: 'AVAILABLE' }));
      await db.InventoryUnit.bulkCreate(looseUnits, { transaction: t, validate: true });
      looseUnits = await db.InventoryUnit.findAll({ where: { code: { [Op.in]: looseUnits.map((u) => u.code) }, company_id: companyId }, transaction: t, order: [['id', 'ASC']] });
      await applyStockChange({ companyId, warehouseId, itemId: item.id, delta: loose, type: 'IN', source: 'RECEIVE', reference: body.reference, note: body.note, userId: user.id }, t);
    }
    const units = await db.InventoryUnit.findAll({ where: { company_id: companyId, item_id: item.id, warehouse_id: warehouseId, status: 'AVAILABLE', ...(boxes.length ? { box_id: { [Op.in]: boxes.map((b) => b.id) } } : { code: { [Op.in]: looseUnits.map((u) => u.code) } }) }, transaction: t, order: [['id','ASC']] });
    const unitsByBox = {};
    for (const unit of units) { const key = unit.box_id || 'loose'; (unitsByBox[key] ||= []).push(unit); }
    return { item, boxes, units_by_box: unitsByBox, loose_quantity: loose, loose_units: looseUnits };
  });
};

/**
 * Adjust a physical box.
 *
 * IN 49 on a box containing 1 piece => box quantity becomes 50
 * and warehouse stock increases by 49.
 *
 * OUT 5 on a box containing 50 pieces => box quantity becomes 45
 * and warehouse stock decreases by 5.
 */
async function adjustBoxTx(p, t) {
  const quantity = positiveInteger(p.quantity);

  if (!['IN', 'OUT'].includes(p.action)) {
    throw new ApiError(400, 'Action must be IN or OUT');
  }

  const box = await findBoxForUpdate(p.code, p.companyId, t);

  const currentQty = Number(box.quantity);
  const delta = p.action === 'OUT' ? -quantity : quantity;
  const newQty = currentQty + delta;

  if (newQty < 0) {
    throw new ApiError(
      409,
      `Box only has ${currentQty} piece(s) remaining`
    );
  }

  // Do not allow warehouse stock to fall below the amount assigned
  // to all other boxes or below zero.
  const stock = await lockStock(
    p.companyId,
    box.warehouse_id,
    box.item_id,
    t
  );

  const boxedBefore = await boxedQty(
    p.companyId,
    box.warehouse_id,
    box.item_id,
    t
  );

  const looseBefore = Number(stock.quantity) - boxedBefore;

  if (looseBefore < 0) {
    throw new ApiError(
      409,
      'Inventory mismatch: boxed pieces exceed warehouse stock'
    );
  }

  const movement = await applyStockChange(
    {
      companyId: p.companyId,
      warehouseId: box.warehouse_id,
      itemId: box.item_id,
      boxId: box.id,
      delta,
      type: p.action,
      source: p.source || 'SCAN',
      boxBalanceAfter: newQty,
      note: p.note,
      reference: p.reference,
      userId: p.userId,
    },
    t
  );

  if (p.action === 'OUT') {
    const units = await db.InventoryUnit.findAll({ where: { box_id: box.id, company_id: p.companyId, status: 'AVAILABLE' }, limit: quantity, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE });
    if (units.length < quantity) throw new ApiError(409, `Only ${units.length} individually tracked unit(s) remain in this box. Run the backfill migration first if this is legacy stock.`);
    await db.InventoryUnit.update({ status: 'ISSUED' }, { where: { id: { [Op.in]: units.map(u => u.id) } }, transaction: t });
  } else {
    const units = Array.from({ length: quantity }, () => ({ company_id: p.companyId, item_id: box.item_id, box_id: box.id, warehouse_id: box.warehouse_id, code: genCode('UNT'), status: 'AVAILABLE' }));
    await db.InventoryUnit.bulkCreate(units, { transaction: t, validate: true });
  }

  box.quantity = newQty;
  box.status = newQty === 0 ? 'EMPTY' : 'ACTIVE';
  await box.save({ transaction: t });

  return { box, movement };
}

exports.adjustBox = (p) =>
  sequelize.transaction((t) => adjustBoxTx(p, t));

/**
 * Adjust stock by item QR.
 *
 * OUT first consumes loose stock. If autoBox is enabled, it then
 * consumes individual pieces from active boxes in FIFO order.
 */
exports.adjustItem = (p) =>
  sequelize.transaction(async (t) => {
    const {
      companyId,
      userId,
      item,
      warehouseId,
      action,
      boxCode,
      autoBox,
      note,
      reference,
    } = p;

    const quantity = positiveInteger(p.quantity);

    if (!['IN', 'OUT'].includes(action)) {
      throw new ApiError(400, 'Action must be IN or OUT');
    }

    await mustFind(
      db.Warehouse,
      {
        id: warehouseId,
        company_id: companyId,
      },
      t,
      'Warehouse'
    );

    if (boxCode) {
      const box = await findBoxForUpdate(boxCode, companyId, t);

      if (Number(box.item_id) !== Number(item.id)) {
        throw new ApiError(
          422,
          'That box does not contain this material'
        );
      }

      return {
        results: [
          await adjustBoxTx(
            {
              companyId,
              userId,
              code: boxCode,
              action,
              quantity,
              note,
              reference,
            },
            t
          ),
        ],
      };
    }

    if (action === 'IN') {
      const newUnits = Array.from({ length: quantity }, () => ({ company_id: companyId, item_id: item.id, box_id: null, warehouse_id: warehouseId, code: genCode('UNT'), status: 'AVAILABLE' }));
      await db.InventoryUnit.bulkCreate(newUnits, { transaction: t, validate: true });
      const movement = await applyStockChange(
        {
          companyId,
          warehouseId,
          itemId: item.id,
          delta: quantity,
          type: 'IN',
          source: 'SCAN',
          note,
          reference,
          userId,
        },
        t
      );

      return { results: [{ movement }] };
    }

    let remaining = quantity;
    const results = [];

    const loose = await looseQty(
      companyId,
      warehouseId,
      item.id,
      t
    );

    const fromLoose = Math.min(loose, remaining);

    if (fromLoose > 0) {
      const looseUnits = await db.InventoryUnit.findAll({ where: { company_id: companyId, warehouse_id: warehouseId, item_id: item.id, box_id: null, status: 'AVAILABLE' }, limit: fromLoose, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE });
      if (looseUnits.length < fromLoose) throw new ApiError(409, 'Individually tracked loose stock is incomplete. Run src/scripts/backfill-inventory-units.js before adjusting legacy stock.');
      await db.InventoryUnit.update({ status: 'ISSUED' }, { where: { id: { [Op.in]: looseUnits.map(u => u.id) } }, transaction: t });
      const movement = await applyStockChange(
        {
          companyId,
          warehouseId,
          itemId: item.id,
          delta: -fromLoose,
          type: 'OUT',
          source: 'SCAN',
          note,
          reference,
          userId,
        },
        t
      );

      results.push({ movement });
      remaining -= fromLoose;
    }

    if (remaining > 0 && !autoBox) {
      const boxes = await db.Box.findAll({
        where: {
          company_id: companyId,
          warehouse_id: warehouseId,
          item_id: item.id,
          status: 'ACTIVE',
          quantity: { [Op.gt]: 0 },
        },
        attributes: ['code', 'quantity'],
        transaction: t,
      });

      throw new ApiError(
        409,
        `Only ${loose} loose piece(s) available. Scan a box QR, pass box_code, or enable auto_box=true`,
        boxes
      );
    }

    if (remaining > 0) {
      const boxes = await db.Box.findAll({
        where: {
          company_id: companyId,
          warehouse_id: warehouseId,
          item_id: item.id,
          status: 'ACTIVE',
          quantity: { [Op.gt]: 0 },
        },
        order: [
          ['received_at', 'ASC'],
          ['id', 'ASC'],
        ],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      for (const box of boxes) {
        if (remaining <= 0) break;

        const available = Number(box.quantity);
        const take = Math.min(available, remaining);

        const result = await adjustBoxTx(
          {
            companyId,
            userId,
            code: box.code,
            action: 'OUT',
            quantity: take,
            note,
            reference,
          },
          t
        );

        results.push(result);
        remaining -= take;
      }

      if (remaining > 0) {
        throw new ApiError(
          409,
          `Insufficient stock, short by ${remaining} piece(s)`
        );
      }
    }

    return { results };
  });

/**
 * Transfer a complete physical box, including all pieces inside it,
 * between warehouses. The box retains its individual piece balance.
 */
exports.transfer = (p) =>
  sequelize.transaction(async (t) => {
    const { companyId, userId, toWarehouseId, note } = p;

    const destinationId = Number(toWarehouseId);

    const to = await mustFind(
      db.Warehouse,
      {
        id: destinationId,
        company_id: companyId,
        is_active: true,
      },
      t,
      'Destination warehouse'
    );

    if (p.boxCode) {
      const box = await findBoxForUpdate(
        p.boxCode,
        companyId,
        t
      );

      if (Number(box.warehouse_id) === Number(to.id)) {
        throw new ApiError(
          422,
          'Box is already in that warehouse'
        );
      }

      const quantity = Number(box.quantity);
      const fromWarehouseId = box.warehouse_id;
      const reference = `TRANSFER ${fromWarehouseId}->${to.id}`;

      if (quantity > 0) {
        await applyStockChange(
          {
            companyId,
            warehouseId: fromWarehouseId,
            itemId: box.item_id,
            boxId: box.id,
            delta: -quantity,
            type: 'TRANSFER_OUT',
            source: 'TRANSFER',
            boxBalanceAfter: quantity,
            reference,
            note,
            userId,
          },
          t
        );

        await applyStockChange(
          {
            companyId,
            warehouseId: to.id,
            itemId: box.item_id,
            boxId: box.id,
            delta: quantity,
            type: 'TRANSFER_IN',
            source: 'TRANSFER',
            boxBalanceAfter: quantity,
            reference,
            note,
            userId,
          },
          t
        );
      }

      await db.InventoryUnit.update({ warehouse_id: to.id }, { where: { box_id: box.id, company_id: companyId }, transaction: t });
      box.warehouse_id = to.id;
      await box.save({ transaction: t });

      return { box };
    }

    const fromWarehouseId = Number(p.fromWarehouseId);
    const itemId = Number(p.itemId);
    const quantity = positiveInteger(p.quantity);

    if (fromWarehouseId === Number(to.id)) {
      throw new ApiError(
        422,
        'Source and destination warehouses are the same'
      );
    }

    await mustFind(
      db.Warehouse,
      {
        id: fromWarehouseId,
        company_id: companyId,
      },
      t,
      'Source warehouse'
    );

    await mustFind(
      db.Item,
      {
        id: itemId,
        company_id: companyId,
      },
      t,
      'Item'
    );

    const loose = await looseQty(
      companyId,
      fromWarehouseId,
      itemId,
      t
    );

    if (loose < quantity) {
      throw new ApiError(
        409,
        `Only ${loose} loose piece(s) in source warehouse. Transfer boxes using box_code.`
      );
    }

    const reference = `TRANSFER ${fromWarehouseId}->${to.id}`;

    await applyStockChange(
      {
        companyId,
        warehouseId: fromWarehouseId,
        itemId,
        delta: -quantity,
        type: 'TRANSFER_OUT',
        source: 'TRANSFER',
        reference,
        note,
        userId,
      },
      t
    );

    await applyStockChange(
      {
        companyId,
        warehouseId: to.id,
        itemId,
        delta: quantity,
        type: 'TRANSFER_IN',
        source: 'TRANSFER',
        reference,
        note,
        userId,
      },
      t
    );

    const looseUnits = await db.InventoryUnit.findAll({ where: { company_id: companyId, warehouse_id: fromWarehouseId, item_id: itemId, box_id: null, status: 'AVAILABLE' }, limit: quantity, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE });
    if (looseUnits.length < quantity) throw new ApiError(409, 'Individually tracked loose stock is incomplete. Run the backfill migration first.');
    await db.InventoryUnit.update({ warehouse_id: to.id }, { where: { id: { [Op.in]: looseUnits.map(u => u.id) } }, transaction: t });
    return { moved: quantity };
  });

/**
 * Set the total physical stock count.
 * The count is individual pieces, not number of boxes.
 * Existing boxed pieces cannot be removed from the total count
 * without adjusting those boxes first.
 */
exports.adjustCount = (p) =>
  sequelize.transaction(async (t) => {
    const {
      companyId,
      userId,
      warehouseId,
      itemId,
      countedQuantity,
      note,
    } = p;

    const counted = nonNegativeInteger(
      countedQuantity,
      'Counted quantity'
    );

    await mustFind(
      db.Warehouse,
      {
        id: warehouseId,
        company_id: companyId,
      },
      t,
      'Warehouse'
    );

    await mustFind(
      db.Item,
      {
        id: itemId,
        company_id: companyId,
      },
      t,
      'Item'
    );

    const stock = await lockStock(
      companyId,
      warehouseId,
      itemId,
      t
    );

    const inBoxes = await boxedQty(
      companyId,
      warehouseId,
      itemId,
      t
    );

    if (counted < inBoxes) {
      throw new ApiError(
        409,
        `${inBoxes} piece(s) are recorded inside boxes. Correct the box balances first.`
      );
    }

    const current = Number(stock.quantity);
    const delta = counted - current;

    if (delta === 0) {
      return { movement: null, quantity: current };
    }

    if (delta > 0) {
      const units = Array.from({ length: delta }, () => ({ company_id: companyId, item_id: itemId, box_id: null, warehouse_id: warehouseId, code: genCode('UNT'), status: 'AVAILABLE', note: note || 'Physical count adjustment' }));
      await db.InventoryUnit.bulkCreate(units, { transaction: t, validate: true });
    } else {
      const take = Math.abs(delta);
      const units = await db.InventoryUnit.findAll({ where: { company_id: companyId, warehouse_id: warehouseId, item_id: itemId, box_id: null, status: 'AVAILABLE' }, limit: take, order: [['id', 'ASC']], transaction: t, lock: t.LOCK.UPDATE });
      if (units.length < take) throw new ApiError(409, 'Individually tracked loose stock is incomplete. Run the backfill migration first.');
      await db.InventoryUnit.update({ status: 'LOST', note: note || 'Physical count adjustment' }, { where: { id: { [Op.in]: units.map(u => u.id) } }, transaction: t });
    }

    const movement = await applyStockChange(
      {
        companyId,
        warehouseId,
        itemId,
        delta,
        type: 'ADJUST',
        source: 'MANUAL',
        note: note || 'Physical count',
        userId,
      },
      t
    );

    return {
      movement,
      quantity: counted,
    };
  });

exports.lowStock = (companyId) =>
  sequelize.query(
    `SELECT
       i.id,
       i.sku,
       i.name,
       i.model,
       i.min_stock,
       COALESCE(SUM(s.quantity), 0) AS total_quantity
     FROM items i
     LEFT JOIN stocks s
       ON s.item_id = i.id
      AND s.company_id = i.company_id
     WHERE i.company_id = :companyId
       AND i.is_active = 1
       AND i.min_stock > 0
     GROUP BY i.id, i.sku, i.name, i.model, i.min_stock
     HAVING COALESCE(SUM(s.quantity), 0) < i.min_stock
     ORDER BY i.name`,
    {
      replacements: { companyId },
      type: QueryTypes.SELECT,
    }
  );

exports.looseQty = (companyId, warehouseId, itemId) =>
  sequelize.transaction((t) =>
    looseQty(companyId, warehouseId, itemId, t)
  );
