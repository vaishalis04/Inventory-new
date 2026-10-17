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
  const data = found.kind === 'BOX' ? await boxView(found.row, req.user.company_id) : await itemView(found.row, req.user.company_id);
  res.json({ success: true, data });
});

// Scan -> take out / add. Returns the refreshed view so the UI shows the new qty immediately.
exports.adjust = asyncHandler(async (req, res) => {
  const found = await resolve(req.params.code, req.user.company_id);
  const b = req.body;
  const base = { companyId: req.user.company_id, userId: req.user.id, action: b.action, quantity: b.quantity, note: b.note };

  if (found.kind === 'BOX') {
    await inv.adjustBox({ ...base, code: found.row.code });
    const fresh = await db.Box.findByPk(found.row.id);
    return res.json({ success: true, data: await boxView(fresh, req.user.company_id) });
  }

  let warehouseId = b.warehouse_id;
  if (!warehouseId) {
    const stocks = await db.Stock.findAll({ where: { item_id: found.row.id, company_id: req.user.company_id } });
    if (stocks.length === 1) warehouseId = stocks[0].warehouse_id;
    else throw new ApiError(422, 'warehouse_id is required for material QR scans (item is in several warehouses)');
  }
  await inv.adjustItem({ ...base, item: found.row, warehouseId, boxCode: b.box_code ? qr.parseCode(b.box_code) : null, autoBox: b.auto_box });
  res.json({ success: true, data: await itemView(found.row, req.user.company_id) });
});
