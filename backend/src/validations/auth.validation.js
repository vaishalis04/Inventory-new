const Joi = require('joi');
const { text } = require('./common.validation');

exports.register = Joi.object({
  company_name: Joi.string().max(150).required(),
  industry: text(100),
  name: Joi.string().max(100).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});
exports.login = Joi.object({ email: Joi.string().email().required(), password: Joi.string().required() });
exports.createUser = Joi.object({
  name: Joi.string().max(100).required(), email: Joi.string().email().required(),
  password: Joi.string().min(6).required(), role: Joi.string().valid('admin', 'manager', 'staff').default('staff'),
});
