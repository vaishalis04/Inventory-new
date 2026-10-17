module.exports = (s, D) => s.define('Printer', {
  company_id: { type: D.INTEGER, allowNull: false },
  warehouse_id: D.INTEGER,
  name: { type: D.STRING(100), allowNull: false },
  // NETWORK = raw TCP (port 9100) label printer speaking ZPL (Zebra and compatibles)
  // BROWSER = no direct printer; API returns a printable HTML label sheet
  connection: { type: D.ENUM('NETWORK', 'BROWSER'), defaultValue: 'NETWORK' },
  host: D.STRING(100),
  port: { type: D.INTEGER, defaultValue: 9100 },
  label_width_mm: { type: D.INTEGER, defaultValue: 50 },
  label_height_mm: { type: D.INTEGER, defaultValue: 30 },
  is_default: { type: D.BOOLEAN, defaultValue: false },
  is_active: { type: D.BOOLEAN, defaultValue: true },
}, { tableName: 'printers' });
