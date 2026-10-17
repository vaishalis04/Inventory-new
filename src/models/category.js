module.exports = (s, D) => s.define('Category', {
  company_id: { type: D.INTEGER, allowNull: false },
  name: { type: D.STRING(100), allowNull: false },
  // Optional per-industry custom fields, e.g. [{"key":"resolution","label":"Resolution"}]
  field_schema: { type: D.JSON },
  is_active: { type: D.BOOLEAN, defaultValue: true },
}, { tableName: 'categories' });
