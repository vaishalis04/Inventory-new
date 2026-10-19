const Joi = require('joi');
const { id } = require('./common.validation');

exports.reprint = Joi.object({
  printer_id: id,
  include_box_label: Joi.boolean().default(true),
  item_label_count: Joi.number().integer().min(0).max(2000),
});
