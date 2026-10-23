const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const qr = require('../services/qr.service');
const printSvc = require('../services/print.service');
const edit = require('../services/inventoryEdit.service');
const { paginate } = require('../utils/helpers');

const findBox = async (req) => {
  const box = await db.Box.findOne({ where: { code: qr.parseCode(req.params.code), company_id: req.user.company_id } });
  if (!box) throw new ApiError(404, 'Box not found');
  return box;
};

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const where = { company_id: req.user.company_id };
  ['warehouse_id', 'item_id', 'status'].forEach((k) => { if (req.query[k]) where[k] = req.query[k]; });
  const { rows, count } = await db.Box.findAndCountAll({
    where, limit, offset, order: [['id', 'DESC']],
    include: [{ model: db.Item, attributes: ['id', 'name', 'sku', 'model'] }, { model: db.Warehouse, attributes: ['id', 'name'] }],
  });
  res.json({ success: true, data: rows, meta: { total: count, page, limit } });
});

exports.update = asyncHandler(async (req, res) => { // move rack/location, batch, supplier, archive
  const box = await findBox(req);
  const { location, batch_no, status, supplier_id } = req.body;
  if (status === 'ARCHIVED' && box.quantity > 0) throw new ApiError(409, 'Empty the box before archiving');
  const patch = {};
  if (location !== undefined) patch.location = location || null;
  if (batch_no !== undefined) patch.batch_no = batch_no || null;
  if (supplier_id !== undefined) {
    if (supplier_id !== null) {
      const supplier = await db.Supplier.findOne({ where: { id: supplier_id, company_id: req.user.company_id } });
      if (!supplier) throw new ApiError(404, 'Supplier not found');
    }
    patch.supplier_id = supplier_id;
  }
  if (status !== undefined) patch.status = status === 'ACTIVE' && Number(box.quantity) === 0 ? 'EMPTY' : status;
  await box.update(patch);
  res.json({ success: true, data: box });
});

// Delete a box with all of its pieces and movement history.
exports.remove = asyncHandler(async (req, res) => {
  const box = await findBox(req);
  const data = await edit.deleteBox(req.user, box);
  res.json({ success: true, message: 'Box deleted together with its units and movements', data });
});

exports.qrPng = asyncHandler(async (req, res) => {
  const box = await findBox(req);
  res.type('png').send(await qr.toPng(box.code));
});

// Reprint labels for an existing box (e.g. sticker damaged).
exports.reprint = asyncHandler(async (req, res) => {
  const box = await findBox(req);
  const item = await db.Item.findByPk(box.item_id);
  const job = await printSvc.createJob({
    user: req.user, printerId: req.body.printer_id, warehouseId: box.warehouse_id, box, item,
    includeBoxLabel: req.body.include_box_label,
    itemLabelCount: req.body.item_label_count === undefined ? 0 : req.body.item_label_count,
  });
  res.json({ success: true, data: { id: job.id, status: job.status, total_labels: job.total_labels, error: job.error,
    sheet_url: job.status === 'PRINTED' ? null : `/api/print/jobs/${job.id}/sheet` } });
});
