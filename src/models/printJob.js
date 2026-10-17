module.exports = (s, D) => s.define('PrintJob', {
  company_id: { type: D.INTEGER, allowNull: false },
  printer_id: D.INTEGER,
  box_id: D.INTEGER,
  item_id: { type: D.INTEGER, allowNull: false },
  include_box_label: { type: D.BOOLEAN, defaultValue: true },
  item_label_count: { type: D.INTEGER, defaultValue: 0 },
  total_labels: { type: D.INTEGER, defaultValue: 0 },
  status: { type: D.ENUM('PRINTED', 'FAILED', 'SHEET'), defaultValue: 'SHEET' },
  error: D.STRING(255),
  created_by: D.INTEGER,
}, { tableName: 'print_jobs' });
