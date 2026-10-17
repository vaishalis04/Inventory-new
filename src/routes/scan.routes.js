const router = require('express').Router();
const validate = require('../middleware/validate');
const v = require('../validators');
const scan = require('../controllers/scan.controller');

// :code is the text inside either QR (box or material)
router.get('/:code', scan.scan);
router.post('/:code/adjust', validate(v.scanAdjust), scan.adjust);

module.exports = router;
