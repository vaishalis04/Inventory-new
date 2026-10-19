const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { ROLES } = require('../config/constants');
const { validate } = require('../middleware/validate.middleware');
const { supplier: supplierSchema, supplierUpdate: supplierUpdateSchema } = require('../validations/supplier.validation');
const ctrl = require('../controllers/supplier.controller');

const adminMgr = authorize(ROLES.ADMIN, ROLES.MANAGER);

router.use(protect);

router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', adminMgr, validate(supplierSchema), ctrl.create);
router.put('/:id', adminMgr, validate(supplierUpdateSchema), ctrl.update);
router.delete('/:id', adminMgr, ctrl.remove);

module.exports = router;
