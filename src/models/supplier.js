module.exports = (s, D) => s.define('Supplier', {
  company_id: { type: D.INTEGER, allowNull: false },
  name: { type: D.STRING(150), allowNull: false },
  phone: D.STRING(30),
  email: D.STRING(150),
  address: D.TEXT,
  is_active: { type: D.BOOLEAN, defaultValue: true },
}, { tableName: 'suppliers' });
