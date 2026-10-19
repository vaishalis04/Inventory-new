const Joi = require('joi');
const { id, text } = require('./common.validation');

exports.printer = Joi.object({
  name: Joi.string().max(100).required(), warehouse_id: id.allow(null),
  connection: Joi.string().valid('NETWORK', 'BROWSER').default('NETWORK'),
  host: text(100), port: Joi.number().integer().min(1).max(65535).default(9100),
  label_width_mm: Joi.number().integer().min(10).max(200).default(50),
  label_height_mm: Joi.number().integer().min(10).max(200).default(30),
  is_default: Joi.boolean().default(false),
});
exports.printerUpdate = Joi.object({
  name: Joi.string().max(100), warehouse_id: id.allow(null),
  connection: Joi.string().valid('NETWORK', 'BROWSER'),
  host: text(100), port: Joi.number().integer().min(1).max(65535),
  label_width_mm: Joi.number().integer().min(10).max(200),
  label_height_mm: Joi.number().integer().min(10).max(200),
  is_default: Joi.boolean(),
});
