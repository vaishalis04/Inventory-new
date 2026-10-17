const router = require('express').Router();
const { authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');
const auth = require('../controllers/auth.controller');

router.get('/', authorize('admin'), auth.listUsers);
router.post('/', authorize('admin'), validate(v.createUser), auth.createUser);

module.exports = router;
