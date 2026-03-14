const QuizQuestion = require('../models/QuizQuestion');
const StudentAnswer = require('../models/StudentAnswer');
const { updateDifficulty } = require('./studentController');

async function submitAnswer(req, res, next) {
  try {
    const { student_id, question_id, selected_answer } = req.body;

    const question = await QuizQuestion.findOne({ question_id });
    if (!question) {
      const err = new Error(`Question not found: ${question_id}`);
      err.status = 404;
      return next(err);
    }

    const is_correct =
      question.answer.trim().toLowerCase() === selected_answer.trim().toLowerCase();

    await StudentAnswer.create({ student_id, question_id, selected_answer, is_correct });

    const updated_difficulty = await updateDifficulty(student_id, is_correct);

    res.json({ is_correct, correct_answer: question.answer, updated_difficulty });
  } catch (err) {
    next(err);
  }
}

module.exports = { submitAnswer };
