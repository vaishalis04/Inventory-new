const Joi = require('joi');
const { id, text } = require('./common.validation');

exports.scanAdjust = Joi.object({
  action: Joi.string().valid('IN', 'OUT').required(),
  performed_by: Joi.string().max(100).required(),
  quantity: Joi.number().integer().min(1).default(1),
  note: text(255),
  warehouse_id: id,      // required when scanning a MATERIAL qr
  box_code: Joi.string(),// optional when scanning a MATERIAL qr
  auto_box: Joi.boolean().default(false),
});
