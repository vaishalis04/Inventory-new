// Total quantity of an item in a warehouse (boxed + loose).
module.exports = (s, D) => s.define('Stock', {
  company_id: { type: D.INTEGER, allowNull: false },
  warehouse_id: { type: D.INTEGER, allowNull: false },
  item_id: { type: D.INTEGER, allowNull: false },
  quantity: { type: D.INTEGER, allowNull: false, defaultValue: 0 },
}, { tableName: 'stocks', indexes: [{ unique: true, fields: ['warehouse_id', 'item_id'] }] });
