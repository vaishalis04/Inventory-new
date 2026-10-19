const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Warehouse extends Model {}

Warehouse.init(
  {
    company_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    code: DataTypes.STRING(30),
    address: DataTypes.TEXT,
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'Warehouse',
    tableName: 'warehouses',
  }
);

module.exports = Warehouse;
