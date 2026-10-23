const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const edit = require('../services/inventoryEdit.service');
const crud = require('./crud.controller');

const base = crud(db.Warehouse, { label: 'Warehouse', searchFields: ['name', 'code'] });

// DELETE /warehouses/:id                -> refuses (409 + counts) when the warehouse still holds data
// DELETE /warehouses/:id?cascade=true   -> deletes it with all its stock, boxes, units and movements
// DELETE /warehouses/:id?soft=true      -> only deactivates it
base.remove = asyncHandler(async (req, res) => {
  const row = await db.Warehouse.findOne({ where: { id: req.params.id, company_id: req.user.company_id } });
  if (!row) throw new ApiError(404, 'Warehouse not found');
  if (req.query.soft === 'true') {
    await row.update({ is_active: false });
    return res.json({ success: true, message: 'Warehouse deactivated' });
  }
  const data = await edit.deleteWarehouse(req.user, row, req.query.cascade === 'true');
  res.json({ success: true, message: 'Warehouse deleted', data });
});

module.exports = base;
