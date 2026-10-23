const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { ROLES } = require('../config/constants');
const { validate } = require('../middleware/validate.middleware');
const { createUser: createUserSchema, updateUser: updateUserSchema } = require('../validations/auth.validation');
const auth = require('../controllers/auth.controller');

router.use(protect);

router.get('/', authorize(ROLES.ADMIN), auth.listUsers);
router.post('/', authorize(ROLES.ADMIN), validate(createUserSchema), auth.createUser);
router.put('/:id', authorize(ROLES.ADMIN), validate(updateUserSchema), auth.updateUser);
router.delete('/:id', authorize(ROLES.ADMIN), auth.deleteUser);

module.exports = router;
