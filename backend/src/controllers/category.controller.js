const db = require('../models');
const crud = require('./crud.controller');

module.exports = crud(db.Category, {
  label: 'Category',
  hardDelete: true,
  // items keep existing, they just lose the category
  beforeDelete: (row, req, t) =>
    db.Item.update({ category_id: null }, { where: { category_id: row.id, company_id: req.user.company_id }, transaction: t }),
});
