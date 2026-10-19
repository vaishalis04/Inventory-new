const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { ROLES } = require('../config/constants');
const { validate } = require('../middleware/validate.middleware');
const { printer: printerSchema, printerUpdate: printerUpdateSchema } = require('../validations/printer.validation');
const ctrl = require('../controllers/printer.controller');

const adminMgr = authorize(ROLES.ADMIN, ROLES.MANAGER);

router.use(protect);

router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', adminMgr, validate(printerSchema), ctrl.create);
router.put('/:id', adminMgr, validate(printerUpdateSchema), ctrl.update);
router.delete('/:id', adminMgr, ctrl.remove);

module.exports = router;
