const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { ROLES } = require('../config/constants');
const { validate } = require('../middleware/validate.middleware');
const { createUser: createUserSchema } = require('../validations/auth.validation');
const auth = require('../controllers/auth.controller');

router.use(protect);

router.get('/', authorize(ROLES.ADMIN), auth.listUsers);
router.post('/', authorize(ROLES.ADMIN), validate(createUserSchema), auth.createUser);

module.exports = router;
