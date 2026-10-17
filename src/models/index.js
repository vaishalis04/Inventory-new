const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const db = { sequelize };
[
  ['Company', 'company'], ['User', 'user'], ['Warehouse', 'warehouse'], ['Category', 'category'],
  ['Supplier', 'supplier'], ['Item', 'item'], ['Box', 'box'], ['Stock', 'stock'],
  ['StockMovement', 'stockMovement'], ['Printer', 'printer'], ['PrintJob', 'printJob'],
].forEach(([name, file]) => { db[name] = require(`./${file}`)(sequelize, DataTypes); });

const fk = (name, allowNull = true) => ({ foreignKey: { name, allowNull }, constraints: false });

db.Company.hasMany(db.User, fk('company_id', false));
db.User.belongsTo(db.Company, fk('company_id', false));

db.Category.hasMany(db.Item, fk('category_id'));
db.Item.belongsTo(db.Category, fk('category_id'));

db.Item.hasMany(db.Box, fk('item_id', false));
db.Box.belongsTo(db.Item, fk('item_id', false));
db.Warehouse.hasMany(db.Box, fk('warehouse_id', false));
db.Box.belongsTo(db.Warehouse, fk('warehouse_id', false));
db.Supplier.hasMany(db.Box, fk('supplier_id'));
db.Box.belongsTo(db.Supplier, fk('supplier_id'));

db.Item.hasMany(db.Stock, fk('item_id', false));
db.Stock.belongsTo(db.Item, fk('item_id', false));
db.Warehouse.hasMany(db.Stock, fk('warehouse_id', false));
db.Stock.belongsTo(db.Warehouse, fk('warehouse_id', false));

db.StockMovement.belongsTo(db.Item, fk('item_id', false));
db.StockMovement.belongsTo(db.Warehouse, fk('warehouse_id', false));
db.StockMovement.belongsTo(db.Box, fk('box_id'));
db.StockMovement.belongsTo(db.User, fk('user_id'));

db.PrintJob.belongsTo(db.Printer, fk('printer_id'));
db.PrintJob.belongsTo(db.Box, fk('box_id'));
db.PrintJob.belongsTo(db.Item, fk('item_id', false));

module.exports = db;
