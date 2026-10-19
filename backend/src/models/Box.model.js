const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Box extends Model {}

Box.init(
  {
    company_id: { type: DataTypes.INTEGER, allowNull: false },
    warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    code: { type: DataTypes.STRING(30), allowNull: false, unique: true }, // BOX-XXXXXXXXXX (what the QR holds)
    initial_quantity: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false }, // current qty, changes on every in/out
    status: { type: DataTypes.ENUM('ACTIVE', 'EMPTY', 'ARCHIVED'), defaultValue: 'ACTIVE' },
    supplier_id: DataTypes.INTEGER,
    batch_no: DataTypes.STRING(60),
    location: DataTypes.STRING(100), // rack / shelf
    received_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'Box',
    tableName: 'boxes',
  }
);

module.exports = Box;
