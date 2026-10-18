const Joi = require('joi');

const id = Joi.number().integer().positive();
const text = (max = 255) => Joi.string().max(max).allow('', null);

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

exports.item = item;
exports.itemUpdate = item.fork(['name'], (s) => s.optional());

exports.warehouse = Joi.object({ name: Joi.string().max(100).required(), code: text(30), address: Joi.string().allow('', null) });
exports.warehouseUpdate = exports.warehouse.fork(['name'], (s) => s.optional());
exports.category = Joi.object({ name: Joi.string().max(100).required(), field_schema: Joi.array().items(Joi.object().unknown(true)).allow(null) });
exports.categoryUpdate = exports.category.fork(['name'], (s) => s.optional());
exports.supplier = Joi.object({ name: Joi.string().max(150).required(), phone: text(30), email: text(150), address: Joi.string().allow('', null) });
exports.supplierUpdate = exports.supplier.fork(['name'], (s) => s.optional());
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

exports.receive = Joi.object({
  warehouse_id: id.required(),
  item_id: id,
  item,
  boxes: Joi.array().items(Joi.object({
    quantity: Joi.number().integer().min(1).required(),
    count: Joi.number().integer().min(1).max(500).default(1),
  })).default([]),
  loose_quantity: Joi.number().integer().min(0).default(0),
  supplier_id: id.allow(null),
  batch_no: text(60), location: text(100), reference: text(100), note: text(255),
  print: Joi.object({
    enabled: Joi.boolean().default(true),
    printer_id: id,
    print_item_labels: Joi.boolean().default(true),
  }).default({}),
}).or('item_id', 'item');

exports.scanAdjust = Joi.object({
  action: Joi.string().valid('IN', 'OUT').required(),
  quantity: Joi.number().integer().min(1).default(1),
  note: text(255),
  warehouse_id: id,      // required when scanning a MATERIAL qr
  box_code: Joi.string(),// optional when scanning a MATERIAL qr
  auto_box: Joi.boolean().default(false),
});

exports.transfer = Joi.object({
  to_warehouse_id: id.required(),
  box_code: Joi.string(),
  item_id: id, from_warehouse_id: id, quantity: Joi.number().integer().min(1),
  note: text(255),
}).or('box_code', 'item_id');

exports.count = Joi.object({
  warehouse_id: id.required(), item_id: id.required(),
  counted_quantity: Joi.number().integer().min(0).required(), note: text(255),
});

exports.reprint = Joi.object({
  printer_id: id,
  include_box_label: Joi.boolean().default(true),
  item_label_count: Joi.number().integer().min(0).max(2000),
});

exports.boxUpdate = Joi.object({
  location: text(100), batch_no: text(60),
  status: Joi.string().valid('ACTIVE', 'ARCHIVED'),
});
