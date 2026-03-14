const router = require('express').Router();
const { getStats } = require('../controllers/statsController');

router.get('/', getStats);

module.exports = router;
