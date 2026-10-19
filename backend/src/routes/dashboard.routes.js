const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const dashboard = require('../controllers/dashboard.controller');

router.use(protect);

router.get('/', dashboard.summary);

module.exports = router;
