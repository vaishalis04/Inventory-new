const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Company extends Model {}

Company.init(
  {
    name: { type: DataTypes.STRING(150), allowNull: false },
    industry: DataTypes.STRING(100), // e.g. CCTV, pharma, garments, electronics
  },
  {
    sequelize,
    modelName: 'Company',
    tableName: 'companies',
  }
);

module.exports = Company;
