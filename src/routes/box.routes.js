const router = require('express').Router();
const { authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');
const box = require('../controllers/box.controller');

const adminMgr = authorize('admin', 'manager');

router.get('/', box.list);
router.get('/:code/qr', box.qrPng);
router.patch('/:code', adminMgr, validate(v.boxUpdate), box.update);
router.post('/:code/print', validate(v.reprint), box.reprint);

module.exports = router;
