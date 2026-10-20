const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Item extends Model {}

Item.init(
  {
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    sku: {
      type: DataTypes.STRING(60),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    model: DataTypes.STRING(100),
    brand: DataTypes.STRING(100),
    description: DataTypes.TEXT,

    // Base measurement unit: pcs, kg, litre, etc.
    unit: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pcs',
    },

    min_stock: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    custom_fields: {
      type: DataTypes.JSON,
    },
    qr_code: {
      type: DataTypes.STRING(30),
      allowNull: false,
      unique: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'Item',
    tableName: 'items',
    indexes: [{ unique: true, fields: ['company_id', 'sku'] }],
  }
);

module.exports = Item;