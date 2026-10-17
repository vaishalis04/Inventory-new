const db = require('../models');
const crud = require('./crud.controller');

module.exports = crud(db.Warehouse, { label: 'Warehouse', searchFields: ['name', 'code'] });
