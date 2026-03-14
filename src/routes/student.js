const router = require('express').Router();
const { getStudentDifficulty } = require('../controllers/studentController');

router.get('/:student_id/difficulty', getStudentDifficulty);

module.exports = router;
