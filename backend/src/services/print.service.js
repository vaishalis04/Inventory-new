
const net = require('net');
const db = require('../models');
const qr = require('./qr.service');

const dots = (mm) => Math.round(mm * 8); // 203 DPI label printers

const clean = (s, max = 28) =>
  String(s == null ? '' : s)
    .replace(/[\^~\\]/g, ' ')
    .slice(0, max);

const DEFAULT_PRINTER = {
  label_width_mm: 50,
  label_height_mm: 30,
};

// A4 sheet dimensions.
const SHEET = {
  width: 210,
  height: 297,
  margin: 5,
};

const LABEL_GAP = 0;

/* --------------------------------- ZPL ----------------------------------- */

function zplLabel({ code, lines, copies, printer }) {
  const w = dots(printer.label_width_mm);
  const h = dots(printer.label_height_mm);

  // Print QR at the top, followed by all text underneath.
  const qrSize = Math.max(8, Math.min(33, Math.floor(w * 0.65)));
  const qrX = Math.floor((w - qrSize) / 2);
  const qrY = 8;
  const textHeight = Math.max(12, Math.min(22, Math.floor(h / 10)));
  const textStartY = qrY + qrSize + 5;
  const lineGap = textHeight + 3;

  let zpl = `^XA^CI28^PW${w}^LL${h}^LH0,0\n`;

  zpl += `^FO${qrX},${qrY}^BQN,2,${Math.max(
    2,
    Math.min(8, Math.floor(qrSize / 33))
  )}^FDMA,${qr.payload(code)}^FS\n`;

  lines.filter(Boolean).forEach((line, i) => {
    const text = clean(line, 40);
    zpl += `^FO5,${textStartY + i * lineGap}^A0N,${textHeight},${textHeight}^FB${w - 10},1,0,C,0^FD${text}^FS\n`;
  });

  zpl += `^PQ${copies}^XZ\n`;

  return zpl;
}

function buildZpl({
  box,
  item,
  includeBoxLabel,
  itemLabelCount,
  printer,
  units = [],
}) {
  let out = '';

  if (includeBoxLabel && box) {
    out += zplLabel({
      code: box.code,
      copies: 1,
      printer,
      lines: [
        `Box No: ${box.code}`,
        `Item: ${item.name}`,
        item.model || item.sku ? `Model/SKU: ${item.model || item.sku}` : '',
        `Qty: ${box.initial_quantity} ${item.unit || ''}`.trim(),
      ],
    });
  }

  for (const unit of units.slice(0, itemLabelCount)) {
    out += zplLabel({
      code: unit.code,
      copies: 1,
      printer,
      lines: [
        `Unit No: ${unit.code}`,
        `Item: ${item.name}`,
        item.model ? `Model: ${item.model}` : '',
        item.brand ? `Brand: ${item.brand}` : '',
      ],
    });
  }

  return out;
}

function sendRaw(host, port, data, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(
      { host, port },
      () => socket.end(data, 'utf8')
    );

    socket.setTimeout(timeoutMs, () => {
      socket.destroy();
      reject(new Error('Printer connection timed out'));
    });

    socket.on('error', (error) => {
      reject(new Error(`Printer error: ${error.message}`));
    });

    socket.on('close', (hadError) => {
      if (!hadError) resolve();
    });
  });
}

/* --------------------------- printer resolution -------------------------- */

async function resolvePrinter(companyId, printerId, warehouseId) {
  if (printerId) {
    return db.Printer.findOne({
      where: {
        id: printerId,
        company_id: companyId,
        is_active: true,
      },
    });
  }

  const printers = await db.Printer.findAll({
    where: {
      company_id: companyId,
      is_active: true,
      is_default: true,
    },
  });

  return (
    printers.find((printer) => printer.warehouse_id === warehouseId) ||
    printers.find((printer) => !printer.warehouse_id) ||
    null
  );
}

/* ------------------------------- print job ------------------------------- */

// itemLabelCount = number of individual material labels.
// Box label, when enabled, is always one additional label.
exports.createJob = async ({
  user,
  printerId,
  warehouseId,
  box,
  item,
  itemLabelCount = 0,
  includeBoxLabel = true,
  units = null,
}) => {
  if (!units && itemLabelCount > 0) {
    units = await db.InventoryUnit.findAll({
      where: {
        company_id: user.company_id,
        item_id: item.id,
        ...(box ? { box_id: box.id } : { box_id: null }),
        warehouse_id: warehouseId,
        status: 'AVAILABLE',
      },
      limit: itemLabelCount,
      order: [['id', 'ASC']],
    });
  }

  units = units || [];

  const printer = await resolvePrinter(
    user.company_id,
    printerId,
    warehouseId
  );

  const include = Boolean(box) && includeBoxLabel;
  const total = (include ? 1 : 0) + itemLabelCount;

  const job = await db.PrintJob.create({
    company_id: user.company_id,
    printer_id: printer ? printer.id : null,
    box_id: box ? box.id : null,
    item_id: item.id,
    include_box_label: include,
    item_label_count: itemLabelCount,
    total_labels: total,
    status: 'SHEET',
    created_by: user.id,
  });

  if (
    printer &&
    printer.connection === 'NETWORK' &&
    printer.host &&
    total > 0
  ) {
    try {
      await sendRaw(
        printer.host,
        printer.port || 9100,
        buildZpl({
          box,
          item,
          includeBoxLabel: include,
          itemLabelCount,
          printer,
          units,
        })
      );

      job.status = 'PRINTED';
    } catch (error) {
      job.status = 'FAILED';
      job.error = error.message.slice(0, 250);
    }

    await job.save();
  }

  return job;
};

/* ----------------------- A4 printable HTML sheet ------------------------- */

function getSheetLayout(labelWidth, labelHeight) {
  const usableWidth = SHEET.width - SHEET.margin * 2;
  const usableHeight = SHEET.height - SHEET.margin * 2;

  const columns = Math.max(
    1,
    Math.floor(
      (usableWidth + LABEL_GAP) / (labelWidth + LABEL_GAP)
    )
  );

  const rows = Math.max(
    1,
    Math.floor(
      (usableHeight + LABEL_GAP) / (labelHeight + LABEL_GAP)
    )
  );

  return {
    columns,
    rows,
    perPage: columns * rows,
    usableWidth,
    usableHeight,
  };
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(
    /[&<>"']/g,
    (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character]
  );
}

function makeLabel({ image, lines }) {
  const visibleLines = lines.filter(
    (line) =>
      line !== null &&
      line !== undefined &&
      String(line).trim() !== ''
  );

  return `
    <article class="label">
      <div class="qr-wrap">
        <img class="qr" src="${image}" alt="Scannable QR code" />
      </div>

      <div class="label-text">
        ${visibleLines
          .map(
            (line, index) => `
              <div class="${index === 0 ? 'label-title' : 'label-detail'}">
                ${escapeHtml(line)}
              </div>
            `
          )
          .join('')}
      </div>
    </article>
  `;
}

exports.buildSheet = async (job) => {
  const item = await db.Item.findOne({
    where: {
      id: job.item_id,
      company_id: job.company_id,
    },
  });

  if (!item) {
    throw new Error('Item not found for print job');
  }

  const box = job.box_id
    ? await db.Box.findOne({
        where: {
          id: job.box_id,
          company_id: job.company_id,
        },
      })
    : null;

  const printer = job.printer_id
    ? await db.Printer.findByPk(job.printer_id)
    : null;

  const width = Math.max(
    10,
    Number(printer?.label_width_mm) || DEFAULT_PRINTER.label_width_mm
  );

  const height = Math.max(
    10,
    Number(printer?.label_height_mm) || DEFAULT_PRINTER.label_height_mm
  );

  const layout = getSheetLayout(width, height);
  const labels = [];

  // Box label: QR first, then Box No. and all box/item details.
  if (job.include_box_label && box) {
    labels.push(
      makeLabel({
        image: await qr.toDataUrl(box.code),
        lines: [
          `Box No: ${box.code}`,
          `Item: ${item.name}`,
          item.model ? `Model: ${item.model}` : '',
          !item.model && item.sku ? `SKU: ${item.sku}` : '',
          item.brand ? `Brand: ${item.brand}` : '',
          `Qty: ${box.initial_quantity} ${item.unit || ''}`.trim(),
        ],
      })
    );
  }

  // Individual unit labels: QR first, then unit and item details.
  if (job.item_label_count > 0) {
    const units = await db.InventoryUnit.findAll({
      where: {
        company_id: job.company_id,
        item_id: item.id,
        ...(box ? { box_id: box.id } : { box_id: null }),
        status: 'AVAILABLE',
      },
      limit: job.item_label_count,
      order: [['id', 'ASC']],
    });

    for (const unit of units) {
      labels.push(
        makeLabel({
          image: await qr.toDataUrl(unit.code),
          lines: [
            `Unit No: ${unit.code}`,
            `Item: ${item.name}`,
            item.model ? `Model: ${item.model}` : '',
            item.brand ? `Brand: ${item.brand}` : '',
          ],
        })
      );
    }
  }

  // Split labels into complete pages.
  const pages = [];

  for (let i = 0; i < labels.length; i += layout.perPage) {
    pages.push(labels.slice(i, i + layout.perPage));
  }

  const pageHtml = pages
    .map(
      (pageLabels) => `
        <section class="sheet-page">
          <div class="label-grid">
            ${pageLabels.join('')}
          </div>
        </section>
      `
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Inventory Labels</title>

<style>
  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    background: #fff;
  }

  .sheet-page {
    width: ${SHEET.width}mm;
    min-height: ${SHEET.height}mm;
    padding: ${SHEET.margin}mm;
    margin: 0 auto;
    background: #fff;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
  }

  .sheet-page:last-child {
    page-break-after: auto;
    break-after: auto;
  }

  .label-grid {
    display: grid;
    grid-template-columns: repeat(${layout.columns}, ${width}mm);
    grid-auto-rows: ${height}mm;
    column-gap: ${LABEL_GAP}mm;
    row-gap: ${LABEL_GAP}mm;
    align-content: start;
    justify-content: start;
  }

  /* Stack QR code first and all text below it. */
  .label {
    width: ${width}mm;
    height: ${height}mm;
    min-width: 0;
    min-height: 0;
    padding: 1mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 0.5mm;
    overflow: hidden;
    border: 0.15mm dashed #b8b8b8;
    background: #fff;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .qr-wrap {
    flex: 0 0 ${Math.max(
      8,
      Math.min(height * 0.52, width * 0.48)
    )}mm;
    width: ${Math.max(
      8,
      Math.min(height * 0.52, width * 0.48)
    )}mm;
    height: ${Math.max(
      8,
      Math.min(height * 0.52, width * 0.48)
    )}mm;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .qr {
    display: block;
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .label-text {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 0.4mm;
    text-align: center;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  .label-title {
    max-width: 100%;
    max-height: 2.2em;
    overflow: hidden;
    font-size: ${Math.max(5, Math.min(8, height * 0.23))}pt;
    font-weight: 700;
    line-height: 1.1;
  }

  .label-detail {
    max-width: 100%;
    max-height: 2.2em;
    overflow: hidden;
    font-size: ${Math.max(4.5, Math.min(6.5, height * 0.19))}pt;
    line-height: 1.1;
  }

  @page {
    size: A4 portrait;
    margin: 0;
  }

  @media screen {
    body {
      padding: 18px 0;
      background: #e6e9ef;
    }

    .sheet-page {
      margin: 0 auto 18px;
      box-shadow: 0 2px 18px rgba(0, 0, 0, 0.13);
    }
  }

  @media print {
    html,
    body {
      width: ${SHEET.width}mm;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .sheet-page {
      width: ${SHEET.width}mm;
      height: ${SHEET.height}mm;
      min-height: ${SHEET.height}mm;
      margin: 0 !important;
      padding: ${SHEET.margin}mm;
      overflow: hidden;
      box-shadow: none;
    }

    .label {
      border-color: #b8b8b8;
    }
  }
</style>
</head>

<body>
${pageHtml}
</body>
</html>`;
};
