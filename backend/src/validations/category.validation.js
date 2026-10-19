const Joi = require('joi');

exports.category = Joi.object({ name: Joi.string().max(100).required(), field_schema: Joi.array().items(Joi.object().unknown(true)).allow(null) });
exports.categoryUpdate = exports.category.fork(['name'], (s) => s.optional());
