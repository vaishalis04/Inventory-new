const QRCode = require('qrcode');

// The QR holds ONLY the code (never the quantity) so the same printed sticker
// stays valid forever; quantity is always read live from the database on scan.
const payload = (code) => {
  const base = (process.env.SCAN_BASE_URL || '').replace(/\/$/, '');
  return base ? `${base}/${code}` : code;
};

const opts = { margin: 1, width: 300, errorCorrectionLevel: 'M' };

exports.payload = payload;
exports.toDataUrl = (code) => QRCode.toDataURL(payload(code), opts);
exports.toPng = (code) => QRCode.toBuffer(payload(code), opts);

// Accepts "BOX-ABC", "https://app/scan/BOX-ABC?x=1" etc.
exports.parseCode = (raw) => {
  const s = String(raw || '').trim().split(/[?#]/)[0];
  const last = s.split('/').filter(Boolean).pop() || '';
  return last.toUpperCase();
};
