const net = require('net');
const db = require('../models');
const qr = require('./qr.service');

const dots = (mm) => Math.round(mm * 8); // 203 dpi label printers
const clean = (s, max = 28) => String(s == null ? '' : s).replace(/[\^~\\]/g, ' ').slice(0, max);

const DEFAULT_PRINTER = { label_width_mm: 50, label_height_mm: 30 };

/* --------------------------------- ZPL ----------------------------------- */

function zplLabel({ code, lines, copies, printer }) {
  const w = dots(printer.label_width_mm);
  const h = dots(printer.label_height_mm);
  const mag = Math.max(2, Math.min(8, Math.floor((h - 20) / 33)));
  const textX = 20 + 33 * mag + 15;
  const textHeight = Math.max(18, Math.min(30, Math.floor(h / 8)));
  let zpl = `^XA^CI28^PW${w}^LL${h}^LH0,0\n`;
  zpl += `^FO20,20^BQN,2,${mag}^FDMA,${qr.payload(code)}^FS\n`;
  lines.forEach((line, i) => {
    zpl += `^FO${textX},${25 + i * (textHeight + 8)}^A0N,${textHeight},${textHeight}^FD${clean(line)}^FS\n`;
  });
  zpl += `^PQ${copies}^XZ\n`;
  return zpl;
}

function buildZpl({ box, item, includeBoxLabel, itemLabelCount, printer }) {
  let out = '';
  if (includeBoxLabel && box) {
    out += zplLabel({
      code: box.code, copies: 1, printer,
      lines: ['BOX ' + box.code, item.name, item.model || item.sku, `Qty: ${box.initial_quantity} ${item.unit || ''}`],
    });
  }
  if (itemLabelCount > 0) {
    out += zplLabel({
      code: item.qr_code, copies: itemLabelCount, printer,
      lines: [item.name, item.model || '', item.brand || '', item.sku],
    });
  }
  return out;
}

function sendRaw(host, port, data, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => socket.end(data, 'utf8'));
    socket.setTimeout(timeoutMs, () => { socket.destroy(); reject(new Error('Printer connection timed out')); });
    socket.on('error', (e) => reject(new Error(`Printer error: ${e.message}`)));
    socket.on('close', (hadError) => { if (!hadError) resolve(); });
  });
}

/* --------------------------- printer resolution -------------------------- */

async function resolvePrinter(companyId, printerId, warehouseId) {
  if (printerId) return db.Printer.findOne({ where: { id: printerId, company_id: companyId, is_active: true } });
  const printers = await db.Printer.findAll({ where: { company_id: companyId, is_active: true, is_default: true } });
  return printers.find((p) => p.warehouse_id === warehouseId) || printers.find((p) => !p.warehouse_id) || null;
}

/* ------------------------------- print job ------------------------------- */
// itemLabelCount = how many material labels (e.g. 50). Box label is always 1.
exports.createJob = async ({ user, printerId, warehouseId, box, item, itemLabelCount = 0, includeBoxLabel = true }) => {
  const printer = await resolvePrinter(user.company_id, printerId, warehouseId);
  const include = Boolean(box) && includeBoxLabel;
  const total = (include ? 1 : 0) + itemLabelCount;

  const job = await db.PrintJob.create({
    company_id: user.company_id, printer_id: printer ? printer.id : null, box_id: box ? box.id : null,
    item_id: item.id, include_box_label: include, item_label_count: itemLabelCount,
    total_labels: total, status: 'SHEET', created_by: user.id,
  });

  if (printer && printer.connection === 'NETWORK' && printer.host && total > 0) {
    try {
      await sendRaw(printer.host, printer.port || 9100,
        buildZpl({ box, item, includeBoxLabel: include, itemLabelCount, printer }));
      job.status = 'PRINTED';
    } catch (e) {
      job.status = 'FAILED';
      job.error = e.message.slice(0, 250);
    }
    await job.save();
  }
  return job;
};

/* ----------------------- printable HTML sheet (fallback) ----------------- */

exports.buildSheet = async (job) => {
  const item = await db.Item.findByPk(job.item_id);
  const box = job.box_id ? await db.Box.findByPk(job.box_id) : null;
  const printer = job.printer_id ? await db.Printer.findByPk(job.printer_id) : null;
  const p = printer || DEFAULT_PRINTER;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const cell = (img, lines) =>
    `<div class="label"><img src="${img}"/><div class="t">${lines.filter(Boolean).map((l, i) => `<div${i === 0 ? ' class="b"' : ''}>${esc(l)}</div>`).join('')}</div></div>`;

  let html = '';
  if (job.include_box_label && box) {
    html += cell(await qr.toDataUrl(box.code), ['BOX ' + box.code, item.name, item.model || item.sku, `Qty: ${box.initial_quantity} ${item.unit || ''}`]);
  }
  if (job.item_label_count > 0) {
    const img = await qr.toDataUrl(item.qr_code);
    const one = cell(img, [item.name, item.model, item.brand, item.sku]);
    html += one.repeat(job.item_label_count);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>
@page{size:${p.label_width_mm}mm ${p.label_height_mm}mm;margin:0}
body{margin:0;font-family:Arial,sans-serif}
.label{width:${p.label_width_mm}mm;height:${p.label_height_mm}mm;box-sizing:border-box;padding:1.5mm;display:flex;align-items:center;gap:1.5mm;page-break-after:always;overflow:hidden}
.label img{height:${p.label_height_mm - 4}mm;width:${p.label_height_mm - 4}mm}
.t{font-size:7pt;line-height:1.2;overflow:hidden}.b{font-weight:bold}
</style></head><body>${html}</body></html>`;
};
