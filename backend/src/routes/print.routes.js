const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const print = require('../controllers/print.controller');

router.use(protect);

router.get('/jobs', print.jobs);
router.get('/jobs/:id/sheet', print.sheet);

module.exports = router;
