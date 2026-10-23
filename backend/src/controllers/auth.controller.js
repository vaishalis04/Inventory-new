const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const sign = (u) => jwt.sign({ id: u.id, company_id: u.company_id, role: u.role },
  process.env.JWT_SECRET || 'dev_secret', { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
const safe = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, company_id: u.company_id });

// Creates a new company (tenant), its admin user and a first warehouse.
exports.register = asyncHandler(async (req, res) => {
  const b = req.body;
  if (await db.User.findOne({ where: { email: b.email } })) throw new ApiError(409, 'Email already registered');
  const result = await db.sequelize.transaction(async (t) => {
    const company = await db.Company.create({ name: b.company_name, industry: b.industry }, { transaction: t });
    const user = await db.User.create({
      company_id: company.id, name: b.name, email: b.email, role: 'admin',
      password: await bcrypt.hash(b.password, 10),
    }, { transaction: t });
    const warehouse = await db.Warehouse.create({ company_id: company.id, name: 'Main Warehouse', code: 'MAIN' }, { transaction: t });
    return { company, user, warehouse };
  });
  res.status(201).json({ success: true, data: { token: sign(result.user), user: safe(result.user), company: result.company, warehouse: result.warehouse } });
});

exports.login = asyncHandler(async (req, res) => {
  const user = await db.User.findOne({ where: { email: req.body.email } });
  if (!user || !user.is_active || !(await bcrypt.compare(req.body.password, user.password))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  res.json({ success: true, data: { token: sign(user), user: safe(user) } });
});

exports.me = asyncHandler(async (req, res) => {
  const company = await db.Company.findByPk(req.user.company_id);
  res.json({ success: true, data: { user: safe(req.user), company } });
});

exports.createUser = asyncHandler(async (req, res) => {
  if (await db.User.findOne({ where: { email: req.body.email } })) throw new ApiError(409, 'Email already registered');
  const u = await db.User.create({ ...req.body, company_id: req.user.company_id, password: await bcrypt.hash(req.body.password, 10) });
  res.status(201).json({ success: true, data: safe(u) });
});

exports.listUsers = asyncHandler(async (req, res) => {
  const users = await db.User.findAll({ where: { company_id: req.user.company_id }, attributes: { exclude: ['password'] } });
  res.json({ success: true, data: users });
});

const findUser = async (req) => {
  const user = await db.User.findOne({ where: { id: req.params.id, company_id: req.user.company_id } });
  if (!user) throw new ApiError(404, 'User not found');
  return user;
};

const activeAdminCount = (companyId, exceptId) =>
  db.User.count({
    where: { company_id: companyId, role: 'admin', is_active: true, id: { [db.Sequelize.Op.ne]: exceptId } },
  });

// Admin edits a user: name, email, role, active flag, optional new password.
exports.updateUser = asyncHandler(async (req, res) => {
  const user = await findUser(req);
  const b = req.body;
  const isSelf = Number(user.id) === Number(req.user.id);
  const patch = {};

  if (b.email !== undefined && b.email !== user.email) {
    if (await db.User.findOne({ where: { email: b.email } })) throw new ApiError(409, 'Email already registered');
    patch.email = b.email;
  }
  if (b.name !== undefined) patch.name = b.name;
  if (b.password) patch.password = await bcrypt.hash(b.password, 10);

  const losesAdmin =
    (b.role !== undefined && b.role !== 'admin' && user.role === 'admin') ||
    (b.is_active === false && user.role === 'admin' && user.is_active);
  if (losesAdmin) {
    if (isSelf) throw new ApiError(409, 'You cannot remove your own admin access or deactivate yourself');
    if ((await activeAdminCount(user.company_id, user.id)) < 1) throw new ApiError(409, 'At least one active admin is required');
  }
  if (b.role !== undefined) patch.role = b.role;
  if (b.is_active !== undefined) patch.is_active = b.is_active;

  await user.update(patch);
  res.json({ success: true, data: safe(user), message: 'User updated' });
});

// Admin deletes a user. Their past stock movements and print jobs are kept but no longer point at them.
exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await findUser(req);
  if (Number(user.id) === Number(req.user.id)) throw new ApiError(409, 'You cannot delete your own account');
  if (user.role === 'admin' && user.is_active && (await activeAdminCount(user.company_id, user.id)) < 1) {
    throw new ApiError(409, 'At least one active admin is required');
  }
  await db.sequelize.transaction(async (t) => {
    await db.StockMovement.update({ user_id: null }, { where: { user_id: user.id, company_id: user.company_id }, transaction: t });
    await db.PrintJob.update({ created_by: null }, { where: { created_by: user.id, company_id: user.company_id }, transaction: t });
    await user.destroy({ transaction: t });
  });
  res.json({ success: true, message: 'User deleted' });
});
