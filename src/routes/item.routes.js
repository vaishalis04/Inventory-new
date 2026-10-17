const router = require('express').Router();
const { authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');
const item = require('../controllers/item.controller');
const print = require('../controllers/print.controller');

const adminMgr = authorize('admin', 'manager');

router.get('/', item.list);
router.get('/:id', item.get);
router.get('/:id/qr', item.qrPng);
router.post('/', adminMgr, validate(v.item), item.create);
router.put('/:id', adminMgr, validate(v.itemUpdate), item.update);
router.delete('/:id', adminMgr, item.remove);
router.post('/:id/print', validate(v.reprint), print.itemLabels);

module.exports = router;
