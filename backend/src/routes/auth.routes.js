const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { login: loginSchema, register: registerSchema } = require('../validations/auth.validation');
const auth = require('../controllers/auth.controller');

router.post('/register', validate(registerSchema), auth.register);
router.post('/login', validate(loginSchema), auth.login);
router.get('/me', protect, auth.me);

module.exports = router;
