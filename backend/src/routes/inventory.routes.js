const router = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { ROLES } = require('../config/constants');
const { validate } = require('../middleware/validate.middleware');
const { count: countSchema, receive: receiveSchema, transfer: transferSchema, movementUpdate: movementUpdateSchema } = require('../validations/inventory.validation');
const inventory = require('../controllers/inventory.controller');

const adminMgr = authorize(ROLES.ADMIN, ROLES.MANAGER);

router.use(protect);

router.post('/receive', validate(receiveSchema), inventory.receive);
router.get('/stock', inventory.stock);
router.get('/movements', inventory.movements);
router.put('/movements/:id', adminMgr, validate(movementUpdateSchema), inventory.updateMovement);
router.delete('/movements/:id', adminMgr, inventory.removeMovement);
router.delete('/stock/:id', adminMgr, inventory.removeStock);
router.get('/low-stock', inventory.lowStock);
router.post('/transfer', adminMgr, validate(transferSchema), inventory.transfer);
router.post('/count', adminMgr, validate(countSchema), inventory.count);

module.exports = router;
