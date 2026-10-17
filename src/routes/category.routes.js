const router = require('express').Router();
const { authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');
const ctrl = require('../controllers/category.controller');

const adminMgr = authorize('admin', 'manager');

router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', adminMgr, validate(v.category), ctrl.create);
router.put('/:id', adminMgr, validate(v.categoryUpdate), ctrl.update);
router.delete('/:id', adminMgr, ctrl.remove);

module.exports = router;
