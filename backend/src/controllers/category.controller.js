const db = require('../models');
const crud = require('./crud.controller');

module.exports = crud(db.Category, { label: 'Category' });
