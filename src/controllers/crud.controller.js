const { Op } = require('sequelize');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { paginate } = require('../utils/code');

// Generic tenant-scoped CRUD with soft delete (is_active=false).
module.exports = (Model, { label, searchFields = ['name'], filters = [], beforeSave } = {}) => ({
  list: asyncHandler(async (req, res) => {
    const { page, limit, offset } = paginate(req.query);
    const where = { company_id: req.user.company_id };
    if (req.query.include_inactive !== 'true') where.is_active = true;
    filters.forEach((f) => { if (req.query[f] !== undefined) where[f] = req.query[f]; });
    if (req.query.q) where[Op.or] = searchFields.map((f) => ({ [f]: { [Op.like]: `%${req.query.q}%` } }));
    const { rows, count } = await Model.findAndCountAll({ where, limit, offset, order: [['id', 'DESC']] });
    res.json({ success: true, data: rows, meta: { total: count, page, limit } });
  }),

  get: asyncHandler(async (req, res) => {
    const row = await Model.findOne({ where: { id: req.params.id, company_id: req.user.company_id } });
    if (!row) throw new ApiError(404, `${label} not found`);
    res.json({ success: true, data: row });
  }),

  create: asyncHandler(async (req, res) => {
    const data = { ...req.body, company_id: req.user.company_id };
    if (beforeSave) await beforeSave(data, req);
    const row = await Model.create(data);
    res.status(201).json({ success: true, data: row });
  }),

  update: asyncHandler(async (req, res) => {
    const row = await Model.findOne({ where: { id: req.params.id, company_id: req.user.company_id } });
    if (!row) throw new ApiError(404, `${label} not found`);
    const data = { ...req.body };
    if (beforeSave) await beforeSave(data, req, row);
    await row.update(data);
    res.json({ success: true, data: row });
  }),

  remove: asyncHandler(async (req, res) => {
    const row = await Model.findOne({ where: { id: req.params.id, company_id: req.user.company_id } });
    if (!row) throw new ApiError(404, `${label} not found`);
    await row.update({ is_active: false });
    res.json({ success: true, message: `${label} deactivated` });
  }),
});
