const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { ROLES } = require('../config/constants');
const { validate } = require('../middleware/validate.middleware');
const { boxUpdate: boxUpdateSchema } = require('../validations/box.validation');
const { reprint: reprintSchema } = require('../validations/print.validation');
const box = require('../controllers/box.controller');

const adminMgr = authorize(ROLES.ADMIN, ROLES.MANAGER);

router.use(protect);

router.get('/', box.list);
router.get('/:code/qr', box.qrPng);
router.patch('/:code', adminMgr, validate(boxUpdateSchema), box.update);
router.delete('/:code', adminMgr, box.remove);
router.post('/:code/print', validate(reprintSchema), box.reprint);

module.exports = router;
