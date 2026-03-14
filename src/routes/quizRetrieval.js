const router = require('express').Router();
const { query } = require('express-validator');
const validate = require('../middleware/validate');
const { getQuiz } = require('../controllers/quizRetrievalController');

router.get('/', [
  query('difficulty').optional().isIn(['easy', 'medium', 'hard']).withMessage('difficulty must be easy, medium, or hard'),
  query('limit').optional().isInt({ min: 1 }).withMessage('limit must be a positive integer')
], validate, getQuiz);

module.exports = router;
