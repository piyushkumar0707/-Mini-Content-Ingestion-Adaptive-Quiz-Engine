const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { submitAnswer } = require('../controllers/answerController');

router.post('/', [
  body('student_id').notEmpty().withMessage('student_id is required'),
  body('question_id').notEmpty().withMessage('question_id is required'),
  body('selected_answer').notEmpty().withMessage('selected_answer is required')
], validate, submitAnswer);

module.exports = router;
