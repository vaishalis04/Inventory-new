const { Op } = require('sequelize');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const printSvc = require('../services/print.service');
const { paginate } = require('../utils/helpers');

exports.sheet = asyncHandler(async (req, res) => {
  const job = await db.PrintJob.findOne({ where: { id: req.params.id, company_id: req.user.company_id } });
  if (!job) throw new ApiError(404, 'Print job not found');
  res.type('html').send(await printSvc.buildSheet(job));
});

exports.jobs = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const q = req.query;
  const companyId = req.user.company_id;
  const where = { company_id: companyId };
  if (q.status) where.status = q.status;
  if (q.item_id) where.item_id = q.item_id;
  if (q.from || q.to) {
    where.createdAt = {};
    if (q.from) where.createdAt[Op.gte] = new Date(q.from);
    if (q.to) where.createdAt[Op.lte] = new Date(q.to);
  }
  // Free-text search: item name / SKU / model / brand, the creator's name, or the job number.
  const search = String(q.q || '').trim();
  if (search) {
    const like = { [Op.like]: `%${search}%` };
    const users = await db.User.findAll({ where: { company_id: companyId, name: like }, attributes: ['id'] });
    const or = [{ '$Item.name$': like }, { '$Item.sku$': like }, { '$Item.model$': like }, { '$Item.brand$': like }];
    if (users.length) or.push({ created_by: { [Op.in]: users.map((u) => u.id) } });
    if (/^\d+$/.test(search)) or.push({ id: Number(search) });
    where[Op.and] = [{ [Op.or]: or }];
  }
  const { rows, count } = await db.PrintJob.findAndCountAll({
    where, limit, offset, order: [['id', 'DESC']],
    include: [{ model: db.Item, attributes: ['id', 'name', 'sku', 'model', 'brand'], required: false }],
  });
  res.json({ success: true, data: rows, meta: { total: count, page, limit } });
});

// Reprint N material labels for an item (no box)
exports.itemLabels = asyncHandler(async (req, res) => {
  const item = await db.Item.findOne({ where: { id: req.params.id, company_id: req.user.company_id } });
  if (!item) throw new ApiError(404, 'Item not found');
  const job = await printSvc.createJob({
    user: req.user, printerId: req.body.printer_id, item, includeBoxLabel: false,
    itemLabelCount: req.body.item_label_count || 1,
  });
  res.json({ success: true, data: { id: job.id, status: job.status, total_labels: job.total_labels, error: job.error,
    sheet_url: job.status === 'PRINTED' ? null : `/api/print/jobs/${job.id}/sheet` } });
});