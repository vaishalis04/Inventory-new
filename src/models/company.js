module.exports = (s, D) => s.define('Company', {
  name: { type: D.STRING(150), allowNull: false },
  industry: D.STRING(100), // e.g. CCTV, pharma, garments, electronics
}, { tableName: 'companies' });
