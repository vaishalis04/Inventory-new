module.exports = (err, req, res, next) => { // eslint-disable-line
  let status = err.status || 500;
  let message = err.message || 'Server error';
  let details = err.details;

  if (err.name === 'SequelizeUniqueConstraintError') {
    status = 409;
    message = 'Duplicate value: ' + err.errors.map((e) => e.path).join(', ') + ' already exists';
  } else if (err.name === 'SequelizeValidationError') {
    status = 422;
    details = err.errors.map((e) => e.message);
  } else if (err.name === 'SequelizeForeignKeyConstraintError') {
    status = 409;
    message = 'Related record not found or still in use';
  }
  if (status >= 500) console.error(err);
  res.status(status).json({ success: false, message, details });
};
