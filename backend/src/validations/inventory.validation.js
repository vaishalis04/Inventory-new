const Joi = require('joi');
const { id, text } = require('./common.validation');
const { item } = require('./item.validation');

exports.receive = Joi.object({
  warehouse_id: id.required(), item_id: id, item,
  // Each row is one physical box. quantity means pieces inside this box.
  boxes: Joi.array().items(Joi.object({ quantity: Joi.number().integer().min(1).max(10000).required() })).min(1).max(1000).required(),
  loose_quantity: Joi.number().integer().min(0).default(0), supplier_id: id.allow(null),
  batch_no: text(60), location: text(100), reference: text(100), note: text(255),
  print: Joi.object({ enabled: Joi.boolean().default(true), printer_id: id, print_item_labels: Joi.boolean().default(true) }).default({}),
}).or('item_id', 'item');
exports.transfer = Joi.object({ to_warehouse_id: id.required(), box_code: Joi.string(), item_id: id, from_warehouse_id: id, quantity: Joi.number().integer().min(1), note: text(255) }).or('box_code', 'item_id');
exports.count = Joi.object({ warehouse_id: id.required(), item_id: id.required(), counted_quantity: Joi.number().integer().min(0).required(), note: text(255) });
exports.movementUpdate = Joi.object({
  quantity: Joi.number().integer().min(1),
  note: text(255),
  reference: text(100),
}).min(1);
