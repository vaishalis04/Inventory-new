const Joi = require('joi');
const { id, text } = require('./common.validation');

exports.boxUpdate = Joi.object({
  location: text(100), batch_no: text(60),
  supplier_id: id.allow(null),
  status: Joi.string().valid('ACTIVE', 'ARCHIVED'),
});
