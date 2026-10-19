const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { ROLES } = require('../config/constants');
const { validate } = require('../middleware/validate.middleware');
const { category: categorySchema, categoryUpdate: categoryUpdateSchema } = require('../validations/category.validation');
const ctrl = require('../controllers/category.controller');

const adminMgr = authorize(ROLES.ADMIN, ROLES.MANAGER);

router.use(protect);

router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', adminMgr, validate(categorySchema), ctrl.create);
router.put('/:id', adminMgr, validate(categoryUpdateSchema), ctrl.update);
router.delete('/:id', adminMgr, ctrl.remove);

module.exports = router;
