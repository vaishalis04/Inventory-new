const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

// Total quantity of an item in a warehouse (boxed + loose).

class Stock extends Model {}

Stock.init(
  {
    company_id: { type: DataTypes.INTEGER, allowNull: false },
    warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    modelName: 'Stock',
    tableName: 'stocks',
    indexes: [{ unique: true, fields: ['warehouse_id', 'item_id'] }],
  }
);

module.exports = Stock;
