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

    // Topic filter: search within chunk_id or use a separate lookup
    // We store topic per chunk but not on QuizQuestion directly.
    // We'll do a lookup via ContentChunk if topic is requested.
    if (topic) {
      const ContentChunk = require('../models/ContentChunk');
      const matchingChunks = await ContentChunk.find({
        topic: { $regex: topic, $options: 'i' }
      }).select('chunk_id');
      const chunkIds = matchingChunks.map(c => c.chunk_id);
      filter.source_chunk_id = { $in: chunkIds };
    }

    const maxResults = Math.min(parseInt(limit) || 10, 100);
    const questions = await QuizQuestion.find(filter).limit(maxResults);

    if (!questions.length) {
      const err = new Error('No questions found matching the given filters');
      err.status = 404;
      return next(err);
    }

    res.json({ count: questions.length, questions });
  } catch (err) {
    next(err);
  }
}

module.exports = { getQuiz };
