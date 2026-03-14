const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { generateQuiz } = require('../controllers/quizGenerationController');

router.post('/', [
  body('source_id').notEmpty().withMessage('source_id is required')
], validate, generateQuiz);

module.exports = router;
