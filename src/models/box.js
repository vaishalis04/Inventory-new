module.exports = (s, D) => s.define('Box', {
  company_id: { type: D.INTEGER, allowNull: false },
  warehouse_id: { type: D.INTEGER, allowNull: false },
  item_id: { type: D.INTEGER, allowNull: false },
  code: { type: D.STRING(30), allowNull: false, unique: true }, // BOX-XXXXXXXXXX (what the QR holds)
  initial_quantity: { type: D.INTEGER, allowNull: false },
  quantity: { type: D.INTEGER, allowNull: false }, // current qty, changes on every in/out
  status: { type: D.ENUM('ACTIVE', 'EMPTY', 'ARCHIVED'), defaultValue: 'ACTIVE' },
  supplier_id: D.INTEGER,
  batch_no: D.STRING(60),
  location: D.STRING(100), // rack / shelf
  received_at: { type: D.DATE, defaultValue: D.NOW },
}, { tableName: 'boxes' });
