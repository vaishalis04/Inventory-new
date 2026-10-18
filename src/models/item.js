module.exports = (s, D) => s.define('Item', {
  company_id: { type: D.INTEGER, allowNull: false },
  sku: { type: D.STRING(60), allowNull: false },
  name: { type: D.STRING(200), allowNull: false },
  model: D.STRING(100),
  brand: D.STRING(100),
  description: D.TEXT,
  unit: { type: D.STRING(20), defaultValue: 'pcs' },
  // purchase_price: { type: D.DECIMAL(12, 2), defaultValue: 0 },
  // sale_price: { type: D.DECIMAL(12, 2), defaultValue: 0 },
  min_stock: { type: D.INTEGER, defaultValue: 0 }, // low-stock alert threshold
  custom_fields: { type: D.JSON }, // any industry specific details
  qr_code: { type: D.STRING(30), allowNull: false, unique: true }, // ITM-XXXXXXXXXX
  is_active: { type: D.BOOLEAN, defaultValue: true },
}, { tableName: 'items', indexes: [{ unique: true, fields: ['company_id', 'sku'] }] });
