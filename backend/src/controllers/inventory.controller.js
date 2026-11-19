const { Op, fn, col } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const inv = require('../services/inventory.service');
const edit = require('../services/inventoryEdit.service');
const qr = require('../services/qr.service');
const printSvc = require('../services/print.service');
const { paginate } = require('../utils/helpers');

// "Generate" button: save material + box(es), return both QR codes, auto print if a printer exists.
exports.receive = asyncHandler(async (req, res) => {
  const result = await inv.receive(req.user, req.body);
  const opt = req.body.print || {};
  const doPrint = opt.enabled !== false;
  const boxes = [];
  const jobs = [];
  for (const box of result.boxes) {
    const units = result.units_by_box[box.id] || [];
    boxes.push({ ...box.toJSON(), qr: { code: box.code, image: await qr.toDataUrl(box.code) }, units: units.map((u) => ({ ...u.toJSON(), qr: { code: u.code, image: null } })) });
    if (doPrint) jobs.push(await printSvc.createJob({ user: req.user, printerId: opt.printer_id, warehouseId: Number(req.body.warehouse_id), box, item: result.item, units: opt.print_item_labels === false ? [] : units, itemLabelCount: opt.print_item_labels === false ? 0 : units.length }));
  }
  const looseUnits = result.loose_units || [];
  const looseOut = await Promise.all(looseUnits.map(async (u) => ({ ...u.toJSON(), qr: { code: u.code, image: await qr.toDataUrl(u.code) } })));
  if (doPrint && looseUnits.length && opt.print_item_labels !== false) jobs.push(await printSvc.createJob({ user: req.user, printerId: opt.printer_id, warehouseId: Number(req.body.warehouse_id), item: result.item, units: looseUnits, itemLabelCount: looseUnits.length, includeBoxLabel: false }));
  res.status(201).json({ success: true, data: { item: result.item, item_qr: { code: result.item.qr_code, image: await qr.toDataUrl(result.item.qr_code) }, boxes, units: [...Object.values(result.units_by_box).flat().map((u) => ({ ...u.toJSON(), qr: { code: u.code, image: null } })), ...looseOut], loose_quantity: result.loose_quantity, print_jobs: jobs.map((j) => ({ id: j.id, status: j.status, total_labels: j.total_labels, error: j.error, sheet_url: j.status === 'PRINTED' ? null : `/api/print/jobs/${j.id}/sheet` })) } });
});

exports.stock = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const where = { company_id: req.user.company_id };
  if (req.query.warehouse_id) where.warehouse_id = req.query.warehouse_id;
  if (req.query.item_id) where.item_id = req.query.item_id;
  const itemWhere = {};
  if (req.query.q) {
    const like = { [Op.like]: `%${req.query.q}%` };
    itemWhere[Op.or] = [{ name: like }, { sku: like }, { model: like }, { brand: like }];
  }
  if (req.query.from || req.query.to) {
    where.updatedAt = {};
    if (req.query.from) where.updatedAt[Op.gte] = new Date(req.query.from);
    if (req.query.to) where.updatedAt[Op.lte] = new Date(req.query.to);
  }
  const { rows, count } = await db.Stock.findAndCountAll({
    where, limit, offset, order: [['id', 'DESC']],
    include: [
      { model: db.Item, where: itemWhere, attributes: ['id', 'sku', 'name', 'model', 'brand', 'unit', 'min_stock', 'qr_code'] },
      { model: db.Warehouse, attributes: ['id', 'name', 'code'] },
    ],
  });
  res.json({ success: true, data: rows, meta: { total: count, page, limit } });
});

exports.movements = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const q = req.query;
  const where = { company_id: req.user.company_id };
  ['warehouse_id', 'item_id', 'type', 'source'].forEach((k) => { if (q[k]) where[k] = q[k]; });
  if (q.box_code) {
    const box = await db.Box.findOne({ where: { code: qr.parseCode(q.box_code), company_id: req.user.company_id } });
    where.box_id = box ? box.id : -1;
  }
  if (q.q && String(q.q).trim()) {
    const like = { [Op.like]: `%${String(q.q).trim()}%` };
    where[Op.or] = [
      { reference: like }, { note: like },
      { '$Item.name$': like }, { '$Item.sku$': like }, { '$Item.model$': like }, { '$Item.brand$': like },
      { '$Box.code$': like },
    ];
  }
  if (q.from || q.to) {
    where.createdAt = {};
    if (q.from) where.createdAt[Op.gte] = new Date(q.from);
    if (q.to) where.createdAt[Op.lte] = new Date(q.to);
  }
  const { rows, count } = await db.StockMovement.findAndCountAll({
    where, limit, offset, order: [['id', 'DESC']],
    include: [
      { model: db.Item, attributes: ['id', 'name', 'sku'] },
      { model: db.Warehouse, attributes: ['id', 'name'] },
      { model: db.Box, attributes: ['id', 'code'] },
      { model: db.User, attributes: ['id', 'name'] },
    ],
  });
  res.json({ success: true, data: rows, meta: { total: count, page, limit } });
});

/**
 * Item history: every IN (received), OUT and RE-IN (scanned back in, with the reason) plus adjustments and
 * transfers, with filters, search and totals for the whole filtered result.
 *   IN    = received stock            (type IN, source RECEIVE)
 *   RE-IN = put back in / returned    (type IN, any other source, e.g. scanned back in)
 */
const EVENT_WHERE = {
  IN: { type: 'IN', source: 'RECEIVE' },
  REIN: { type: 'IN', source: { [Op.ne]: 'RECEIVE' } },
  OUT: { type: 'OUT' },
  ADJUST: { type: 'ADJUST' },
  TRANSFER: { type: { [Op.in]: ['TRANSFER_IN', 'TRANSFER_OUT'] } },
};
const eventOf = (m) => {
  if (m.type === 'IN') return m.source === 'RECEIVE' ? 'IN' : 'REIN';
  if (m.type === 'OUT') return 'OUT';
  if (m.type === 'ADJUST') return 'ADJUST';
  return 'TRANSFER';
};

exports.history = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const q = req.query;
  const companyId = req.user.company_id;
  const where = { company_id: companyId };
  ['warehouse_id', 'item_id'].forEach((k) => { if (q[k]) where[k] = q[k]; });
  const and = [];
  if (q.event && EVENT_WHERE[q.event]) and.push(EVENT_WHERE[q.event]);
  if (q.q && String(q.q).trim()) {
    const like = { [Op.like]: `%${String(q.q).trim()}%` };
    and.push({
      [Op.or]: [
        { reference: like }, { note: like },
        { '$Item.name$': like }, { '$Item.sku$': like }, { '$Item.model$': like }, { '$Item.brand$': like },
        { '$Box.code$': like }, { '$User.name$': like },
      ],
    });
  }
  if (and.length) where[Op.and] = and;
  if (q.from || q.to) {
    where.createdAt = {};
    if (q.from) where.createdAt[Op.gte] = new Date(q.from);
    if (q.to) where.createdAt[Op.lte] = new Date(q.to);
  }
  const include = [
    { model: db.Item, attributes: ['id', 'name', 'sku', 'model', 'brand'] },
    { model: db.Warehouse, attributes: ['id', 'name'] },
    { model: db.Box, attributes: ['id', 'code'] },
    { model: db.User, attributes: ['id', 'name'] },
  ];
  const { rows, count } = await db.StockMovement.findAndCountAll({
    where, limit, offset, include, order: [['createdAt', 'DESC'], ['id', 'DESC']],
  });

  // totals for the WHOLE filtered history (not just this page)
  const grouped = await db.StockMovement.findAll({
    where,
    attributes: ['type', 'source', [fn('COUNT', col('StockMovement.id')), 'entries'], [fn('SUM', col('StockMovement.change')), 'qty']],
    include: include.map((i) => ({ model: i.model, attributes: [] })),
    group: ['StockMovement.type', 'StockMovement.source'],
    raw: true,
  });
  const summary = { entries: 0, received: 0, issued: 0, returned: 0, adjusted: 0, transferred_in: 0, transferred_out: 0, current_stock: null };
  grouped.forEach((g) => {
    const qty = Number(g.qty) || 0;
    summary.entries += Number(g.entries) || 0;
    if (g.type === 'IN') { if (g.source === 'RECEIVE') summary.received += qty; else summary.returned += qty; }
    else if (g.type === 'OUT') summary.issued += -qty;
    else if (g.type === 'ADJUST') summary.adjusted += qty;
    else if (g.type === 'TRANSFER_IN') summary.transferred_in += qty;
    else if (g.type === 'TRANSFER_OUT') summary.transferred_out += -qty;
  });
  if (q.item_id) {
    const stockWhere = { company_id: companyId, item_id: q.item_id };
    if (q.warehouse_id) stockWhere.warehouse_id = q.warehouse_id;
    summary.current_stock = Number(await db.Stock.sum('quantity', { where: stockWhere })) || 0;
  }

  res.json({
    success: true,
    data: rows.map((m) => ({ ...m.toJSON(), event: eventOf(m) })),
    meta: { total: count, page, limit },
    summary,
  });
});

exports.transfer = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.box_code && (!b.from_warehouse_id || !b.quantity || !b.item_id)) {
    throw new ApiError(422, 'Provide box_code, or item_id + from_warehouse_id + quantity');
  }
  const data = await inv.transfer({
    companyId: req.user.company_id, userId: req.user.id, toWarehouseId: b.to_warehouse_id,
    boxCode: b.box_code ? qr.parseCode(b.box_code) : null,
    itemId: b.item_id, fromWarehouseId: b.from_warehouse_id, quantity: b.quantity, note: b.note,
  });
  res.json({ success: true, data });
});

exports.count = asyncHandler(async (req, res) => {
  const b = req.body;
  const data = await inv.adjustCount({
    companyId: req.user.company_id, userId: req.user.id, warehouseId: b.warehouse_id, itemId: b.item_id,
    countedQuantity: b.counted_quantity, note: b.note,
  });
  res.json({ success: true, data });
});

exports.lowStock = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await inv.lowStock(req.user.company_id) });
});

// Edit a movement: quantity / note / reference. Stock, box, units and later balances follow automatically.
exports.updateMovement = asyncHandler(async (req, res) => {
  const data = await edit.editMovement(req.user, Number(req.params.id), req.body);
  res.json({ success: true, message: data.changed ? 'Movement updated' : 'Nothing to change', data });
});

// Delete a movement and reverse its effect everywhere.
exports.removeMovement = asyncHandler(async (req, res) => {
  const data = await edit.deleteMovement(req.user, Number(req.params.id));
  res.json({ success: true, message: 'Movement deleted and its effect reversed', data });
});

// Delete a stock record together with its boxes, units and movements.
exports.removeStock = asyncHandler(async (req, res) => {
  const data = await edit.deleteStock(req.user, Number(req.params.id));
  res.json({ success: true, message: 'Stock record deleted together with its movements', data });
});
