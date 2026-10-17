const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const qr = require('../services/qr.service');
const { genCode, paginate } = require('../utils/code');

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const where = { company_id: req.user.company_id };
  if (req.query.include_inactive !== 'true') where.is_active = true;
  if (req.query.category_id) where.category_id = req.query.category_id;
  if (req.query.q) {
    const like = { [Op.like]: `%${req.query.q}%` };
    where[Op.or] = [{ name: like }, { sku: like }, { model: like }, { brand: like }, { qr_code: like }];
  }
  const { rows, count } = await db.Item.findAndCountAll({
    where, limit, offset, order: [['id', 'DESC']], include: [{ model: db.Category, attributes: ['id', 'name'] }],
  });
  res.json({ success: true, data: rows, meta: { total: count, page, limit } });
});

const load = async (req) => {
  const item = await db.Item.findOne({
    where: { id: req.params.id, company_id: req.user.company_id },
    include: [{ model: db.Category, attributes: ['id', 'name', 'field_schema'] }],
  });
  if (!item) throw new ApiError(404, 'Item not found');
  return item;
};

exports.get = asyncHandler(async (req, res) => {
  const item = await load(req);
  const stock = await db.Stock.findAll({
    where: { item_id: item.id, company_id: req.user.company_id },
    include: [{ model: db.Warehouse, attributes: ['id', 'name', 'code'] }],
  });
  res.json({ success: true, data: { ...item.toJSON(), stock, total_quantity: stock.reduce((a, s) => a + s.quantity, 0) } });
});

exports.create = asyncHandler(async (req, res) => {
  const item = await db.Item.create({
    ...req.body, company_id: req.user.company_id, sku: req.body.sku || genCode('SKU'), qr_code: genCode('ITM'),
  });
  res.status(201).json({ success: true, data: item, qr: { code: item.qr_code, image: await qr.toDataUrl(item.qr_code) } });
});

exports.update = asyncHandler(async (req, res) => {
  const item = await load(req);
  await item.update(req.body);
  res.json({ success: true, data: item });
});

exports.remove = asyncHandler(async (req, res) => {
  const item = await load(req);
  await item.update({ is_active: false });
  res.json({ success: true, message: 'Item deactivated' });
});

exports.qrPng = asyncHandler(async (req, res) => {
  const item = await load(req);
  res.type('png').send(await qr.toPng(item.qr_code));
});
