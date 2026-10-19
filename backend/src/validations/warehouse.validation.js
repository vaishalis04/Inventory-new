const Joi = require('joi');
const { text } = require('./common.validation');

exports.warehouse = Joi.object({ name: Joi.string().max(100).required(), code: text(30), address: Joi.string().allow('', null) });
exports.warehouseUpdate = exports.warehouse.fork(['name'], (s) => s.optional());
