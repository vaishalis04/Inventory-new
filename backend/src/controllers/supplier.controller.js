const db = require('../models');
const crud = require('./crud.controller');

module.exports = crud(db.Supplier, {
  label: 'Supplier',
  searchFields: ['name', 'phone', 'email'],
  hardDelete: true,
  // boxes keep existing, they just lose the supplier
  beforeDelete: (row, req, t) =>
    db.Box.update({ supplier_id: null }, { where: { supplier_id: row.id, company_id: req.user.company_id }, transaction: t }),
});
