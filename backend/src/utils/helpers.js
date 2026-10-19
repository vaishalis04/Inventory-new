const crypto = require('crypto');

// Short, unguessable, scan-friendly codes: BOX-3F9A1C22AB / ITM-91BC02D4E7
const genCode = (prefix) => `${prefix}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

const paginate = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 200);
  return { page, limit, offset: (page - 1) * limit };
};

module.exports = { genCode, paginate };
