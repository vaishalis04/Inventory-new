const ApiError = require('../utils/ApiError');

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new ApiError(403, 'You do not have permission'));
  }
  next();
};

module.exports = { authorize };
