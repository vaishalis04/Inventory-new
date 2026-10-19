const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { ROLES } = require('../config/constants');
const { validate } = require('../middleware/validate.middleware');
const { item: itemSchema, itemUpdate: itemUpdateSchema } = require('../validations/item.validation');
const { reprint: reprintSchema } = require('../validations/print.validation');
const item = require('../controllers/item.controller');
const print = require('../controllers/print.controller');

const adminMgr = authorize(ROLES.ADMIN, ROLES.MANAGER);

router.use(protect);

router.get('/', item.list);
router.get('/:id', item.get);
router.get('/:id/qr', item.qrPng);
router.post('/', adminMgr, validate(itemSchema), item.create);
router.put('/:id', adminMgr, validate(itemUpdateSchema), item.update);
router.delete('/:id', adminMgr, item.remove);
router.post('/:id/print', validate(reprintSchema), print.itemLabels);

module.exports = router;
