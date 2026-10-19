const db = require('../models');
const crud = require('./crud.controller');

module.exports = crud(db.Printer, {
  label: 'Printer',
  filters: ['warehouse_id'],
  // only one default printer per warehouse scope
  beforeSave: async (data, req) => {
    if (data.is_default) {
      await db.Printer.update({ is_default: false }, {
        where: { company_id: req.user.company_id, warehouse_id: data.warehouse_id || null },
      });
    }
  },
});
