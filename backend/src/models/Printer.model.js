const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Printer extends Model {}

Printer.init(
  {
    company_id: { type: DataTypes.INTEGER, allowNull: false },
    warehouse_id: DataTypes.INTEGER,
    name: { type: DataTypes.STRING(100), allowNull: false },
    // NETWORK = raw TCP (port 9100) label printer speaking ZPL (Zebra and compatibles)
    // BROWSER = no direct printer; API returns a printable HTML label sheet
    connection: { type: DataTypes.ENUM('NETWORK', 'BROWSER'), defaultValue: 'NETWORK' },
    host: DataTypes.STRING(100),
    port: { type: DataTypes.INTEGER, defaultValue: 9100 },
    label_width_mm: { type: DataTypes.INTEGER, defaultValue: 50 },
    label_height_mm: { type: DataTypes.INTEGER, defaultValue: 30 },
    is_default: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'Printer',
    tableName: 'printers',
  }
);

module.exports = Printer;
