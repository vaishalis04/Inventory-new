
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
 * - Item.units_per_box = default capacity of a full box.
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
 * For a new item, provide item.units_per_box.
 * For an existing item, boxes[].quantity is the number of pieces
 * inside each physical box.
 */
exports.receive = async (user, body) => {
  const companyId = user.company_id;
  const warehouseId = Number(body.warehouse_id);

  if (!Number.isSafeInteger(warehouseId) || warehouseId <= 0) {
    throw new ApiError(400, 'Valid warehouse_id is required');
  }

  const loose = nonNegativeInteger(
    body.loose_quantity ?? 0,
    'Loose quantity'
  );

  const requestedBoxes = Array.isArray(body.boxes) ? body.boxes : [];
  const boxPlan = [];

  for (const entry of requestedBoxes) {
    const count = positiveInteger(entry.count ?? 1, 'Box count');
    const quantity = positiveInteger(entry.quantity, 'Pieces per box');

    if (count > 10000 || boxPlan.length + count > 10000) {
      throw new ApiError(400, 'Too many boxes in one receipt');
    }

    for (let i = 0; i < count; i += 1) {
      boxPlan.push(quantity);
    }
  }

  if (boxPlan.length === 0 && loose === 0) {
    throw new ApiError(
      422,
      'Provide at least one box or a positive loose_quantity'
    );
  }

  return sequelize.transaction(async (t) => {
    await mustFind(
      db.Warehouse,
      {
        id: warehouseId,
        company_id: companyId,
        is_active: true,
      },
      t,
      'Warehouse'
    );

    let item;

    if (body.item_id) {
      item = await mustFind(
        db.Item,
        {
          id: Number(body.item_id),
          company_id: companyId,
        },
        t,
        'Item'
      );
    } else {
      const details = body.item;

      if (!details || !String(details.name || '').trim()) {
        throw new ApiError(400, 'Item name is required');
      }

      const unitsPerBox = positiveInteger(
        details.units_per_box ?? 1,
        'Units per box'
      );

      item = await db.Item.create(
        {
          ...details,
          name: String(details.name).trim(),
          company_id: companyId,
          units_per_box: unitsPerBox,
          sku: details.sku || genCode('SKU'),
          qr_code: genCode('ITM'),
        },
        { transaction: t }
      );
    }

    const boxes = [];

    for (const quantity of boxPlan) {
      const box = await db.Box.create(
        {
          company_id: companyId,
          warehouse_id: warehouseId,
          item_id: item.id,
          code: genCode('BOX'),
          initial_quantity: quantity,
          quantity,
          status: quantity === 0 ? 'EMPTY' : 'ACTIVE',
          supplier_id: body.supplier_id || null,
          batch_no: body.batch_no || null,
          location: body.location || null,
        },
        { transaction: t }
      );

      await applyStockChange(
        {
          companyId,
          warehouseId,
          itemId: item.id,
          boxId: box.id,
          delta: quantity,
          type: 'IN',
          source: 'RECEIVE',
          boxBalanceAfter: quantity,
          reference: body.reference,
          note: body.note,
          userId: user.id,
        },
        t
      );

      boxes.push(box);
    }

    if (loose > 0) {
      await applyStockChange(
        {
          companyId,
          warehouseId,
          itemId: item.id,
          delta: loose,
          type: 'IN',
          source: 'RECEIVE',
          reference: body.reference,
          note: body.note,
          userId: user.id,
        },
        t
      );
    }

    return {
      item,
      boxes,
      loose_quantity: loose,
    };
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
