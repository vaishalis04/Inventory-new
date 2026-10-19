# Inventory Management Backend

Multi-industry, multi-warehouse inventory backend (Node.js, Express, Sequelize, MySQL) with box + material QR codes, scan-to-update, and label printing.

## Setup
```bash
npm install
cp .env.example .env      # set DB_* and JWT_SECRET
npm start                 # tables are auto-created on first start (DB_SYNC=alter in dev to alter)
npm run smoke             # end-to-end test on SQLite, no MySQL needed
```

## Folder layout
```
server.js           app setup, route mounting, health check, error handler, DB sync + listen
sync-db.js          one-off script: sync all models in alter mode
src/
  config/       db.js (Sequelize connection), constants.js (roles, movement types)
  models/       *.model.js (class-based Sequelize models) + index.js (associations, exports)
  routes/       one *.routes.js per module (auth, user, warehouse, category, supplier, printer,
                item, inventory, box, scan, print, dashboard); each applies `protect` itself
  controllers/  request handlers, one per module (+ crud.controller.js factory)
  services/     business logic (inventory, qr, print)
  validations/  Joi schemas, one *.validation.js per module (+ common.validation.js)
  middleware/   auth.middleware, role.middleware, validate.middleware, error.middleware
  utils/        ApiError, asyncHandler, helpers (genCode, paginate)
  scripts/      smoke-test.js
```

## Core concepts
- **Company** (tenant): every row is scoped by `company_id`; `POST /auth/register` creates company + admin + "Main Warehouse".
- **Item** (material): sku, name, model, brand, description, unit, prices, `min_stock`, `custom_fields` (any industry), one permanent material QR (`ITM-...`).
- **Box**: holds one item, has a permanent QR (`BOX-...`), `initial_quantity` and live `quantity`.
- **Stock**: total qty of an item per warehouse (boxed + loose). **Stock movement**: immutable ledger of every IN/OUT/ADJUST/TRANSFER.
- QR codes contain only the code, never the qty, so stickers never go stale; qty is read live on scan.

## Main flow
1. `POST /api/inventory/receive` (the "Generate" button)
```json
{
  "warehouse_id": 1,
  "item": { "name": "Dome Camera", "model": "DS-2CE", "brand": "Hikvision", "custom_fields": { "resolution": "2MP" } },
  "boxes": [ { "quantity": 50 } ],
  "location": "Rack A1",
  "print": { "enabled": true }
}
```
Use `"item_id": 5` instead of `item` for existing material; `boxes: [{quantity: 50, count: 3}]` = 3 boxes of 50; `loose_quantity` for unboxed units.
Response: item + material QR image, every box + box QR image (base64 PNG), print jobs. A default printer receives 1 box label + 50 material labels (51 total). With no printer, `sheet_url` returns a printable HTML label sheet.
2. `GET /api/scan/:code` -> box QR shows box qty + full material details + last movements; material QR shows details + stock per warehouse + boxes.
3. `POST /api/scan/:code/adjust` `{ "action": "OUT" | "IN", "quantity": 3, "note": "Site install" }` -> returns the refreshed view (rescan shows the new qty).
   - Material QR: also send `warehouse_id` (if in several), optional `box_code`, or `auto_box: true` to take oldest boxes first.

## Other endpoints (all under /api, Bearer token)
| Area | Endpoints |
|---|---|
| Auth/users | POST /auth/register, /auth/login, GET /auth/me, GET/POST /users (admin) |
| Master data | CRUD: /warehouses, /categories, /suppliers, /printers, /items (soft delete) |
| Items | GET /items/:id (with stock per warehouse), GET /items/:id/qr (PNG), POST /items/:id/print |
| Boxes | GET /boxes, PATCH /boxes/:code, GET /boxes/:code/qr, POST /boxes/:code/print |
| Stock | GET /inventory/stock, /inventory/movements, /inventory/low-stock |
| Actions | POST /inventory/transfer (box or loose), POST /inventory/count (physical count) |
| Reports | GET /dashboard |
| Printing | GET /print/jobs, GET /print/jobs/:id/sheet |

Roles: `admin`, `manager` (master data, transfers, counts), `staff` (receive, scan, in/out).

## Printing
- `connection: "NETWORK"` printers get ZPL over raw TCP (default port 9100): Zebra and compatible label printers. Material labels use `^PQ` so 50 copies are one job.
- `connection: "BROWSER"` or no printer: open `sheet_url` and print from the browser (label size comes from the printer record, default 50x30 mm).
- Other languages (TSPL, EPL) can be added in `src/services/print.service.js` (`buildZpl`).

## Notes
- Quantities are integers. For metres/kg change the `quantity` columns to DECIMAL.
- Stock changes run inside DB transactions with row locks, so two people scanning the same box can't oversell it.
- For production use migrations instead of `sync()`.
- Set `SCAN_BASE_URL` if you want QR codes to open your web/mobile app URL (`https://app/scan/BOX-...`); the API accepts both forms.
