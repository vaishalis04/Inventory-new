const jwt = require('jsonwebtoken');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

exports.protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new ApiError(401, 'Authentication required');
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret');
  } catch (e) {
    throw new ApiError(401, 'Invalid or expired token');
  }
  const user = await db.User.findByPk(payload.id);
  if (!user || !user.is_active) throw new ApiError(401, 'User not found or disabled');
  req.user = user; // always has company_id -> every query is tenant scoped
  next();
});

exports.authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return next(new ApiError(403, 'You do not have permission'));
  next();
};
