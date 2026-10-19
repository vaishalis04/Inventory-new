const Joi = require('joi');
const { id, text } = require('./common.validation');

const item = Joi.object({
  category_id: id.allow(null),
  sku: Joi.string().max(60),
  name: Joi.string().max(200).required(),
  model: text(100),
  brand: text(100),
  description: Joi.string().allow('', null),
  unit: Joi.string().max(20).default('pcs'),
  // purchase_price: Joi.number().min(0),
  // sale_price: Joi.number().min(0),
  min_stock: Joi.number().integer().min(0),
  custom_fields: Joi.object().unknown(true).allow(null),
});

exports.item = item;
exports.itemUpdate = item.fork(['name'], (s) => s.optional());
