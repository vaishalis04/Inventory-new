const router = require('express').Router();
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators');
const auth = require('../controllers/auth.controller');

router.post('/register', validate(v.register), auth.register);
router.post('/login', validate(v.login), auth.login);
router.get('/me', protect, auth.me);

module.exports = router;
