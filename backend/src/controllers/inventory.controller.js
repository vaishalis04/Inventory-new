const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const inv = require('../services/inventory.service');
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
  if (doPrint && looseUnits.length && opt.print_item_labels !== false) jobs.push(await printSvc.createJob({ user: req.user, printerId: opt.printer_id, warehouseId: Number(req.body.warehouse_id), item: result.item, units: looseUnits, itemLabelCount: looseUnits.length, includeBoxLabel: false }));
  res.status(201).json({ success: true, data: { item: result.item, item_qr: { code: result.item.qr_code, image: await qr.toDataUrl(result.item.qr_code) }, boxes, units: [...Object.values(result.units_by_box).flat(), ...looseUnits].map((u) => ({ ...u.toJSON(), qr: { code: u.code, image: null } })), loose_quantity: result.loose_quantity, print_jobs: jobs.map((j) => ({ id: j.id, status: j.status, total_labels: j.total_labels, error: j.error, sheet_url: j.status === 'PRINTED' ? null : `/api/print/jobs/${j.id}/sheet` })) } });
});

exports.stock = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const where = { company_id: req.user.company_id };
  if (req.query.warehouse_id) where.warehouse_id = req.query.warehouse_id;
  if (req.query.item_id) where.item_id = req.query.item_id;
  const itemWhere = {};
  if (req.query.q) {
    const like = { [Op.like]: `%${req.query.q}%` };
    itemWhere[Op.or] = [{ name: like }, { sku: like }, { model: like }];
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
  if (q.from || q.to) {
    where.created_at = {};
    if (q.from) where.created_at[Op.gte] = new Date(q.from);
    if (q.to) where.created_at[Op.lte] = new Date(q.to);
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
