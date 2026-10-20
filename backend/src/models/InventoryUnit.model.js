const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class InventoryUnit extends Model {}
InventoryUnit.init({
  company_id: { type: DataTypes.INTEGER, allowNull: false },
  item_id: { type: DataTypes.INTEGER, allowNull: false },
  box_id: { type: DataTypes.INTEGER, allowNull: true },
  warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
  code: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  status: { type: DataTypes.ENUM('AVAILABLE', 'ISSUED', 'DAMAGED', 'LOST'), allowNull: false, defaultValue: 'AVAILABLE' },
  received_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  note: DataTypes.STRING(255),
}, { sequelize, modelName: 'InventoryUnit', tableName: 'inventory_units', indexes: [{ fields: ['company_id','item_id'] }, { fields: ['box_id'] }, { fields: ['warehouse_id','status'] }] });
module.exports = InventoryUnit;
