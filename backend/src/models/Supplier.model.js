const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Supplier extends Model {}

Supplier.init(
  {
    company_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    phone: DataTypes.STRING(30),
    email: DataTypes.STRING(150),
    address: DataTypes.TEXT,
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'Supplier',
    tableName: 'suppliers',
  }
);

module.exports = Supplier;
