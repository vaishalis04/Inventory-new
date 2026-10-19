const Joi = require('joi');
const { text } = require('./common.validation');

exports.supplier = Joi.object({ name: Joi.string().max(150).required(), phone: text(30), email: text(150), address: Joi.string().allow('', null) });
exports.supplierUpdate = exports.supplier.fork(['name'], (s) => s.optional());
