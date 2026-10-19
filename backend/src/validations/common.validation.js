const Joi = require('joi');

const id = Joi.number().integer().positive();
const text = (max = 255) => Joi.string().max(max).allow('', null);

module.exports = { id, text };
