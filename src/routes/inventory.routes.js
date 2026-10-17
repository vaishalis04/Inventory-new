const router = require('express').Router();
const { authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');
const inventory = require('../controllers/inventory.controller');

const adminMgr = authorize('admin', 'manager');

router.post('/receive', validate(v.receive), inventory.receive);
router.get('/stock', inventory.stock);
router.get('/movements', inventory.movements);
router.get('/low-stock', inventory.lowStock);
router.post('/transfer', adminMgr, validate(v.transfer), inventory.transfer);
router.post('/count', adminMgr, validate(v.count), inventory.count);

module.exports = router;
