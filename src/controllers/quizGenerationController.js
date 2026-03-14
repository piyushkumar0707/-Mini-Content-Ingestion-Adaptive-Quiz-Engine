const ContentChunk = require('../models/ContentChunk');
const QuizQuestion = require('../models/QuizQuestion');
const { generateQuestionsForChunk } = require('../services/llmService');
const { generateQuestionId } = require('../utils/helpers');

async function generateQuiz(req, res, next) {
  try {
    const { source_id } = req.body;
    const chunks = await ContentChunk.find({ source_id });

    if (!chunks.length) {
      const err = new Error(`No chunks found for source_id: ${source_id}`);
      err.status = 404;
      return next(err);
    }

    let totalGenerated = 0;
    let totalDuplicates = 0;

    for (const chunk of chunks) {
      const questions = await generateQuestionsForChunk(chunk.text);

      for (const q of questions) {
        if (!q.question || !q.type || !q.answer) continue;

        // Deduplication: skip if exact question text already exists for this chunk
        const exists = await QuizQuestion.findOne({
          question: q.question,
          source_chunk_id: chunk.chunk_id
        });

        if (exists) {
          totalDuplicates++;
          continue;
        }

        await QuizQuestion.create({
          question_id: generateQuestionId(),
          question: q.question,
          type: q.type,
          options: q.options || [],
          answer: q.answer,
          difficulty: q.difficulty || 'easy',
          source_chunk_id: chunk.chunk_id
        });

        totalGenerated++;
      }
    }

    res.json({
      source_id,
      questions_generated: totalGenerated,
      duplicates_skipped: totalDuplicates
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { generateQuiz };
