const router = require('express').Router();
const print = require('../controllers/print.controller');

router.get('/jobs', print.jobs);
router.get('/jobs/:id/sheet', print.sheet);

module.exports = router;
