const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const inv = require('../services/inventory.service');
const qr = require('../services/qr.service');

const itemInclude = [{ model: db.Category, attributes: ['id', 'name'] }];

async function boxView(box, companyId) {
  const [item, warehouse, supplier, history] = await Promise.all([
    db.Item.findOne({ where: { id: box.item_id }, include: itemInclude }),
    db.Warehouse.findByPk(box.warehouse_id, { attributes: ['id', 'name', 'code'] }),
    box.supplier_id ? db.Supplier.findByPk(box.supplier_id, { attributes: ['id', 'name'] }) : null,
    db.StockMovement.findAll({
      where: { box_id: box.id, company_id: companyId }, order: [['id', 'DESC']], limit: 10,
      include: [{ model: db.User, attributes: ['id', 'name'] }],
    }),
  ]);
  return { type: 'BOX', box, item, warehouse, supplier, recent_movements: history };
}

async function itemView(item, companyId) {
  const stock = await db.Stock.findAll({
    where: { item_id: item.id, company_id: companyId },
    include: [{ model: db.Warehouse, attributes: ['id', 'name', 'code'] }],
  });
  const boxes = await db.Box.findAll({
    where: { item_id: item.id, company_id: companyId, status: 'ACTIVE' },
    attributes: ['id', 'code', 'warehouse_id', 'quantity', 'initial_quantity', 'location'],
  });
  return {
    type: 'ITEM', item, stock, boxes,
    total_quantity: stock.reduce((a, s) => a + s.quantity, 0),
  };
}

async function resolve(rawCode, companyId) {
  const code = qr.parseCode(rawCode);
  if (code.startsWith('BOX-')) {
    const box = await db.Box.findOne({ where: { code, company_id: companyId } });
    if (!box) throw new ApiError(404, 'Box not found');
    return { kind: 'BOX', row: box };
  }
  if (code.startsWith('UNT-')) {
    const unit = await db.InventoryUnit.findOne({ where: { code, company_id: companyId }, include: [{ model: db.Item }, { model: db.Box }, { model: db.Warehouse }] });
    if (!unit) throw new ApiError(404, 'Individual inventory item not found');
    return { kind: 'UNIT', row: unit };
  }
  if (code.startsWith('ITM-')) {
    const item = await db.Item.findOne({ where: { qr_code: code, company_id: companyId }, include: itemInclude });
    if (!item) throw new ApiError(404, 'Material not found');
    return { kind: 'ITEM', row: item };
  }
  throw new ApiError(400, 'Unrecognised QR code');
}

// Scan -> full details. Works for both box QR and material QR.
exports.scan = asyncHandler(async (req, res) => {
  const found = await resolve(req.params.code, req.user.company_id);
  let data;
  if (found.kind === 'BOX') {
    data = await boxView(found.row, req.user.company_id);
    data.units = await db.InventoryUnit.findAll({ where: { box_id: found.row.id, company_id: req.user.company_id }, attributes: ['id','code','status','received_at'], order: [['id','ASC']] });
  } else if (found.kind === 'UNIT') {
    data = { type: 'UNIT', unit: found.row, item: found.row.Item, box: found.row.Box, warehouse: found.row.Warehouse };
  } else data = await itemView(found.row, req.user.company_id);
  res.json({ success: true, data });
});

// Scan -> take out / add. Returns the refreshed view so the UI shows the new qty immediately.

exports.adjust = asyncHandler(async (req, res) => {
  const found = await resolve(req.params.code, req.user.company_id);
  const b = req.body;

  const quantity = Number(b.quantity);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ApiError(400, 'Quantity must be a positive integer');
  }

  const performedBy = String(b.performed_by || '').trim();

  if (!performedBy) {
    throw new ApiError(400, 'Please enter the name of the person performing this adjustment');
  }

  if (found.kind === 'UNIT') {
    if (quantity !== 1) throw new ApiError(400, 'An individual QR represents exactly one physical item; quantity must be 1');
    const unit = await db.InventoryUnit.findOne({ where: { id: found.row.id, company_id: req.user.company_id } });
    if (b.action === 'OUT') {
      if (unit.status !== 'AVAILABLE') throw new ApiError(409, `This unit is ${unit.status.toLowerCase()}`);
      await db.sequelize.transaction(async (t) => {
        const stock = await db.Stock.findOne({ where: { company_id: req.user.company_id, item_id: unit.item_id, warehouse_id: unit.warehouse_id }, transaction: t, lock: t.LOCK.UPDATE });
        if (!stock || Number(stock.quantity) < 1) throw new ApiError(409, 'No stock available for this unit');
        stock.quantity = Number(stock.quantity) - 1; await stock.save({ transaction: t });
        await db.StockMovement.create({ company_id: unit.company_id, item_id: unit.item_id, warehouse_id: unit.warehouse_id, box_id: unit.box_id, type: 'OUT', source: 'SCAN', change: -1, quantity: 1, balance_after: stock.quantity, reference: unit.code, note: b.note || null, user_id: req.user.id }, { transaction: t });
        unit.status = 'ISSUED'; await unit.save({ transaction: t });
        if (unit.box_id) { const box = await db.Box.findByPk(unit.box_id, { transaction: t, lock: t.LOCK.UPDATE }); box.quantity = Math.max(0, Number(box.quantity) - 1); box.status = box.quantity === 0 ? 'EMPTY' : 'ACTIVE'; await box.save({ transaction: t }); }
      });
    } else if (b.action === 'IN') {
      if (unit.status === 'AVAILABLE') throw new ApiError(409, 'This unit is already available');
      await db.sequelize.transaction(async (t) => {
        const stock = await db.Stock.findOne({ where: { company_id: unit.company_id, item_id: unit.item_id, warehouse_id: unit.warehouse_id }, transaction: t, lock: t.LOCK.UPDATE });
        if (!stock) throw new ApiError(409, 'Warehouse stock record not found');
        stock.quantity = Number(stock.quantity) + 1; await stock.save({ transaction: t });
        await db.StockMovement.create({ company_id: unit.company_id, item_id: unit.item_id, warehouse_id: unit.warehouse_id, box_id: unit.box_id, type: 'IN', source: 'SCAN', change: 1, quantity: 1, balance_after: stock.quantity, reference: unit.code, note: b.note || null, user_id: req.user.id }, { transaction: t });
        unit.status = 'AVAILABLE'; await unit.save({ transaction: t });
        if (unit.box_id) { const box = await db.Box.findByPk(unit.box_id, { transaction: t, lock: t.LOCK.UPDATE }); box.quantity = Number(box.quantity) + 1; box.status = 'ACTIVE'; await box.save({ transaction: t }); }
      });
    } else throw new ApiError(400, 'Action must be IN or OUT for an individual item');
    const fresh = await db.InventoryUnit.findByPk(unit.id, { include: [{ model: db.Item }, { model: db.Box }, { model: db.Warehouse }] });
    return res.json({ success: true, message: 'Individual item updated', data: { type: 'UNIT', unit: fresh, item: fresh.Item, box: fresh.Box, warehouse: fresh.Warehouse } });
  }

  const base = {
    companyId: req.user.company_id,
    userId: req.user.id,
    action: b.action,
    quantity,
    note: b.note || null,
    performedBy,
  };

  if (found.kind === 'BOX') {
    await inv.adjustBox({
      ...base,
      code: found.row.code,
    });

    const fresh = await db.Box.findOne({
      where: {
        id: found.row.id,
        company_id: req.user.company_id,
      },
    });

    return res.json({
      success: true,
      message: 'Box units adjusted successfully',
      data: await boxView(fresh, req.user.company_id),
    });
  }

  let warehouseId = b.warehouse_id;

  if (!warehouseId) {
    const stocks = await db.Stock.findAll({
      where: {
        item_id: found.row.id,
        company_id: req.user.company_id,
      },
    });

    if (stocks.length === 1) {
      warehouseId = stocks[0].warehouse_id;
    } else {
      throw new ApiError(
        422,
        'warehouse_id is required when the material exists in multiple warehouses'
      );
    }
  }

  await inv.adjustItem({
    ...base,
    item: found.row,
    warehouseId,
    boxCode: b.box_code ? qr.parseCode(b.box_code) : null,
    autoBox: b.auto_box,
  });

  return res.json({
    success: true,
    message: 'Material units adjusted successfully',
    data: await itemView(found.row, req.user.company_id),
  });
});

