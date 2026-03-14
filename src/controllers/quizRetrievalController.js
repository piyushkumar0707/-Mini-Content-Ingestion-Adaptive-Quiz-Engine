const QuizQuestion = require('../models/QuizQuestion');
const StudentSession = require('../models/StudentSession');

async function getQuiz(req, res, next) {
  try {
    const { topic, difficulty, student_id, limit } = req.query;
    const filter = {};

    // Resolve difficulty: explicit param wins over student session
    let resolvedDifficulty = difficulty;
    if (!resolvedDifficulty && student_id) {
      const session = await StudentSession.findOne({ student_id });
      if (session) resolvedDifficulty = session.current_difficulty;
    }

    if (resolvedDifficulty) filter.difficulty = resolvedDifficulty;

    // ISSUE-05: topic is now stored directly on QuizQuestion — single query, no join
    if (topic) {
      filter.topic = { $regex: topic, $options: 'i' };
    }

    const maxResults = Math.min(parseInt(limit) || 10, 100);
    const questions = await QuizQuestion.find(filter).limit(maxResults);

    // ISSUE-07: empty results = 200 with empty array, not 404
    if (!questions.length) {
      return res.json({ count: 0, questions: [] });
    }

    res.json({ count: questions.length, questions });
  } catch (err) {
    next(err);
  }
}

module.exports = { getQuiz };
