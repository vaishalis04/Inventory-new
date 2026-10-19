const Joi = require('joi');
const { text } = require('./common.validation');

exports.boxUpdate = Joi.object({
  location: text(100), batch_no: text(60),
  status: Joi.string().valid('ACTIVE', 'ARCHIVED'),
});
