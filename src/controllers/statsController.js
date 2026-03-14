const SourceDocument = require('../models/SourceDocument');
const ContentChunk = require('../models/ContentChunk');
const QuizQuestion = require('../models/QuizQuestion');
const StudentAnswer = require('../models/StudentAnswer');
const StudentSession = require('../models/StudentSession');

async function getStats(req, res, next) {
  try {
    const [documents, chunks, questions, answers, students] = await Promise.all([
      SourceDocument.countDocuments(),
      ContentChunk.countDocuments(),
      QuizQuestion.countDocuments(),
      StudentAnswer.countDocuments(),
      StudentSession.countDocuments()
    ]);

    // Breakdown of questions by difficulty
    const [easy, medium, hard] = await Promise.all([
      QuizQuestion.countDocuments({ difficulty: 'easy' }),
      QuizQuestion.countDocuments({ difficulty: 'medium' }),
      QuizQuestion.countDocuments({ difficulty: 'hard' })
    ]);

    // Correct vs incorrect answer rate
    const [correct, incorrect] = await Promise.all([
      StudentAnswer.countDocuments({ is_correct: true }),
      StudentAnswer.countDocuments({ is_correct: false })
    ]);

    res.json({
      documents_ingested: documents,
      chunks_stored: chunks,
      questions_generated: questions,
      questions_by_difficulty: { easy, medium, hard },
      answers_submitted: answers,
      answers_correct: correct,
      answers_incorrect: incorrect,
      accuracy_rate: answers > 0 ? `${((correct / answers) * 100).toFixed(1)}%` : 'N/A',
      active_students: students
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getStats };
