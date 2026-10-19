const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class PrintJob extends Model {}

PrintJob.init(
  {
    company_id: { type: DataTypes.INTEGER, allowNull: false },
    printer_id: DataTypes.INTEGER,
    box_id: DataTypes.INTEGER,
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    include_box_label: { type: DataTypes.BOOLEAN, defaultValue: true },
    item_label_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    total_labels: { type: DataTypes.INTEGER, defaultValue: 0 },
    status: { type: DataTypes.ENUM('PRINTED', 'FAILED', 'SHEET'), defaultValue: 'SHEET' },
    error: DataTypes.STRING(255),
    created_by: DataTypes.INTEGER,
  },
  {
    sequelize,
    modelName: 'PrintJob',
    tableName: 'print_jobs',
  }
);

module.exports = PrintJob;
