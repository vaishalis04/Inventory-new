const db = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const inv = require('../services/inventory.service');

exports.summary = asyncHandler(async (req, res) => {
  const cid = req.user.company_id;
  const [items, warehouses, activeBoxes, totalUnits, low, recent] = await Promise.all([
    db.Item.count({ where: { company_id: cid, is_active: true } }),
    db.Warehouse.count({ where: { company_id: cid, is_active: true } }),
    db.Box.count({ where: { company_id: cid, status: 'ACTIVE' } }),
    db.Stock.sum('quantity', { where: { company_id: cid } }),
    inv.lowStock(cid),
    db.StockMovement.findAll({
      where: { company_id: cid }, order: [['id', 'DESC']], limit: 10,
      include: [{ model: db.Item, attributes: ['id', 'name'] }, { model: db.Warehouse, attributes: ['id', 'name'] }],
    }),
  ]);
  res.json({ success: true, data: {
    items, warehouses, active_boxes: activeBoxes, total_units: totalUnits || 0,
    low_stock_count: low.length, low_stock: low.slice(0, 10), recent_movements: recent,
  } });
});
