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
