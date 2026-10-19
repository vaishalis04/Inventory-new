const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/db');

class Category extends Model {}

Category.init(
  {
    company_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    // Optional per-industry custom fields, e.g. [{"key":"resolution","label":"Resolution"}]
    field_schema: { type: DataTypes.JSON },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'Category',
    tableName: 'categories',
  }
);

module.exports = Category;
