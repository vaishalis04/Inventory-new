module.exports = (s, D) => s.define('Warehouse', {
  company_id: { type: D.INTEGER, allowNull: false },
  name: { type: D.STRING(100), allowNull: false },
  code: D.STRING(30),
  address: D.TEXT,
  is_active: { type: D.BOOLEAN, defaultValue: true },
}, { tableName: 'warehouses' });
