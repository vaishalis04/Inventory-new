const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

// Immutable ledger: every change to stock is recorded here.

class StockMovement extends Model {}

StockMovement.init(
  {
    company_id: { type: DataTypes.INTEGER, allowNull: false },
    warehouse_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    box_id: DataTypes.INTEGER,
    type: { type: DataTypes.ENUM('IN', 'OUT', 'ADJUST', 'TRANSFER_IN', 'TRANSFER_OUT'), allowNull: false },
    source: { type: DataTypes.ENUM('RECEIVE', 'SCAN', 'MANUAL', 'TRANSFER'), defaultValue: 'MANUAL' },
    change: { type: DataTypes.INTEGER, allowNull: false }, // signed
    quantity: { type: DataTypes.INTEGER, allowNull: false }, // absolute
    balance_after: { type: DataTypes.INTEGER, allowNull: false }, // warehouse stock after this movement
    box_balance_after: DataTypes.INTEGER,
    reference: DataTypes.STRING(100),
    note: DataTypes.STRING(255),
    user_id: DataTypes.INTEGER,
  },
  {
    sequelize,
    modelName: 'StockMovement',
    tableName: 'stock_movements',
  }
);

module.exports = StockMovement;
