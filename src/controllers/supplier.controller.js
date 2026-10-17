const db = require('../models');
const crud = require('./crud.controller');

module.exports = crud(db.Supplier, { label: 'Supplier', searchFields: ['name', 'phone', 'email'] });
