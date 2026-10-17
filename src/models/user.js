module.exports = (s, D) => s.define('User', {
  company_id: { type: D.INTEGER, allowNull: false },
  name: { type: D.STRING(100), allowNull: false },
  email: { type: D.STRING(150), allowNull: false, unique: true, validate: { isEmail: true } },
  password: { type: D.STRING, allowNull: false },
  role: { type: D.ENUM('admin', 'manager', 'staff'), defaultValue: 'staff' },
  is_active: { type: D.BOOLEAN, defaultValue: true },
}, { tableName: 'users' });
