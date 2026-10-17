// Immutable ledger: every change to stock is recorded here.
module.exports = (s, D) => s.define('StockMovement', {
  company_id: { type: D.INTEGER, allowNull: false },
  warehouse_id: { type: D.INTEGER, allowNull: false },
  item_id: { type: D.INTEGER, allowNull: false },
  box_id: D.INTEGER,
  type: { type: D.ENUM('IN', 'OUT', 'ADJUST', 'TRANSFER_IN', 'TRANSFER_OUT'), allowNull: false },
  source: { type: D.ENUM('RECEIVE', 'SCAN', 'MANUAL', 'TRANSFER'), defaultValue: 'MANUAL' },
  change: { type: D.INTEGER, allowNull: false }, // signed
  quantity: { type: D.INTEGER, allowNull: false }, // absolute
  balance_after: { type: D.INTEGER, allowNull: false }, // warehouse stock after this movement
  box_balance_after: D.INTEGER,
  reference: D.STRING(100),
  note: D.STRING(255),
  user_id: D.INTEGER,
}, { tableName: 'stock_movements' });
