/**
 * One-time migration for existing inventory.
 * Run AFTER the application has created the inventory_units table:
 *   node src/scripts/backfill-inventory-units.js
 * Creates unique unit IDs for current on-hand pieces in existing boxes and loose stock.
 * Existing item and box QR codes are preserved. Existing historical movements are untouched.
 */
const db = require('../models');
const { genCode } = require('../utils/helpers');

async function run() {
  await db.sequelize.authenticate();
  await db.InventoryUnit.sync();
  const boxes = await db.Box.findAll({ where: { status: ['ACTIVE', 'EMPTY'] }, order: [['id', 'ASC']] });
  let created = 0;
  for (const box of boxes) {
    const existing = await db.InventoryUnit.count({ where: { box_id: box.id } });
    const target = Math.max(0, Number(box.quantity) || 0);
    if (existing >= target) continue;
    const rows = Array.from({ length: target - existing }, () => ({ company_id: box.company_id, item_id: box.item_id, box_id: box.id, warehouse_id: box.warehouse_id, code: genCode('UNT'), status: 'AVAILABLE' }));
    await db.InventoryUnit.bulkCreate(rows, { validate: true });
    created += rows.length;
  }
  const stocks = await db.Stock.findAll({ order: [['id', 'ASC']] });
  for (const stock of stocks) {
    const boxed = Number(await db.Box.sum('quantity', { where: { company_id: stock.company_id, warehouse_id: stock.warehouse_id, item_id: stock.item_id, status: ['ACTIVE', 'EMPTY'] } })) || 0;
    const targetLoose = Math.max(0, Number(stock.quantity) - boxed);
    const existingLoose = await db.InventoryUnit.count({ where: { company_id: stock.company_id, warehouse_id: stock.warehouse_id, item_id: stock.item_id, box_id: null } });
    if (existingLoose >= targetLoose) continue;
    const rows = Array.from({ length: targetLoose - existingLoose }, () => ({ company_id: stock.company_id, item_id: stock.item_id, box_id: null, warehouse_id: stock.warehouse_id, code: genCode('UNT'), status: 'AVAILABLE' }));
    await db.InventoryUnit.bulkCreate(rows, { validate: true });
    created += rows.length;
  }
  console.log(`Backfill complete. Created ${created} individual-unit records. Existing box/product QR codes were not changed.`);
}
run().catch((e) => { console.error('Inventory unit backfill failed:', e); process.exitCode = 1; }).finally(async () => db.sequelize.close());
