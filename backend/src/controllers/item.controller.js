const { Op, literal } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const qr = require('../services/qr.service');
const { genCode, paginate } = require('../utils/helpers');

// "Popular" = units issued (stock movements of type OUT) in the last N days.
const DEFAULT_POPULAR_DAYS = Number(process.env.POPULAR_DAYS) || 90;

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const where = { company_id: req.user.company_id };
  if (req.query.include_inactive !== 'true') where.is_active = true;
  if (req.query.category_id) where.category_id = req.query.category_id;
  if (req.query.q) {
    const like = { [Op.like]: `%${req.query.q}%` };
    where[Op.or] = [{ name: like }, { sku: like }, { model: like }, { brand: like }, { qr_code: like }];
  }

  const days = Math.min(Math.max(parseInt(req.query.popular_days, 10) || DEFAULT_POPULAR_DAYS, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const esc = (v) => db.sequelize.escape(v);
  const popularity = literal(
    `(SELECT COALESCE(SUM(sm.quantity), 0) FROM stock_movements AS sm ` +
    `WHERE sm.item_id = Item.id AND sm.company_id = ${esc(req.user.company_id)} ` +
    `AND sm.type = 'OUT' AND sm.created_at >= ${esc(since)})`
  );

  // Default: most popular first, then newest. Use ?sort=newest for the old order.
  const order = req.query.sort === 'newest'
    ? [['id', 'DESC']]
    : [[literal('popularity'), 'DESC'], ['id', 'DESC']];

  const { rows, count } = await db.Item.findAndCountAll({
    where,
    limit,
    offset,
    order,
    attributes: { include: [[popularity, 'popularity']] },
    include: [{ model: db.Category, attributes: ['id', 'name'] }],
  });

  const data = rows.map((r) => ({ ...r.toJSON(), popularity: Number(r.get('popularity')) || 0 }));
  res.json({ success: true, data, meta: { total: count, page, limit, popular_days: days } });
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