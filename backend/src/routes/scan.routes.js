const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { scanAdjust: scanAdjustSchema } = require('../validations/scan.validation');
const scan = require('../controllers/scan.controller');

router.use(protect);

// :code is the text inside either QR (box or material)
router.get('/:code', scan.scan);
router.post('/:code/adjust', validate(scanAdjustSchema), scan.adjust);

module.exports = router;
