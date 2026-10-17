const router = require('express').Router();
const { protect } = require('../middleware/auth');

// public
router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.use('/auth', require('./auth.routes'));

// everything below needs a valid token
router.use(protect);
router.use('/users', require('./user.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/warehouses', require('./warehouse.routes'));
router.use('/categories', require('./category.routes'));
router.use('/suppliers', require('./supplier.routes'));
router.use('/printers', require('./printer.routes'));
router.use('/items', require('./item.routes'));
router.use('/inventory', require('./inventory.routes'));
router.use('/boxes', require('./box.routes'));
router.use('/scan', require('./scan.routes'));
router.use('/print', require('./print.routes'));

module.exports = router;
