const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const printSvc = require('../services/print.service');
const { paginate } = require('../utils/helpers');
const { Op } = require('sequelize');

exports.sheet = asyncHandler(async (req, res) => {
  const job = await db.PrintJob.findOne({ where: { id: req.params.id, company_id: req.user.company_id } });
  if (!job) throw new ApiError(404, 'Print job not found');
  res.type('html').send(await printSvc.buildSheet(job));
});

exports.jobs = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paginate(req.query);
  const where = { company_id: req.user.company_id };
  if (req.query.item_id) where.item_id = req.query.item_id;
  if (['SHEET', 'PRINTED', 'FAILED'].includes(req.query.status)) where.status = req.query.status;
  const include = [
    { model: db.Item, attributes: ['id', 'name', 'sku', 'model'] },
    { model: db.Box, attributes: ['id', 'code'] },
  ];
  const term = String(req.query.q || '').trim();
  if (term) {
    const like = { [Op.like]: `%${term}%` };
    where[Op.or] = [
      { error: like },
      { '$Item.name$': like },
      { '$Item.sku$': like },
      { '$Item.model$': like },
      { '$Box.code$': like },
    ];
  }
  const { rows, count } = await db.PrintJob.findAndCountAll({
    where, include, distinct: true, limit, offset, order: [['id', 'DESC']],
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
