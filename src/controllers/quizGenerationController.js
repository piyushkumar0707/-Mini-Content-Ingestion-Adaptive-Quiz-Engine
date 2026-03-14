const ContentChunk = require('../models/ContentChunk');
const QuizQuestion = require('../models/QuizQuestion');
const { generateQuestionsForChunk } = require('../services/llmService');
const { generateQuestionId } = require('../utils/helpers');

// In-memory cache of source_ids that have already been processed
const generatedCache = new Set();

async function generateQuiz(req, res, next) {
  try {
    const { source_id } = req.body;

    // Cache hit: skip LLM, return existing question count from DB
    if (generatedCache.has(source_id)) {
      const count = await QuizQuestion.countDocuments({ source_chunk_id: { $regex: `^${source_id}` } });
      return res.json({ source_id, questions_generated: count, duplicates_skipped: 0, from_cache: true });
    }

    const chunks = await ContentChunk.find({ source_id });

    if (!chunks.length) {
      const err = new Error(`No chunks found for source_id: ${source_id}`);
      err.status = 404;
      return next(err);
    }

    // Process chunks in batches of 3 to avoid Groq rate limits
    const BATCH_SIZE = 3;
    const results = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(chunk =>
          generateQuestionsForChunk(chunk.text)
            .then(questions => ({ chunk, questions }))
            .catch(() => ({ chunk, questions: [] }))
        )
      );
      results.push(...batchResults);
    }

    let totalGenerated = 0;
    let totalDuplicates = 0;

    for (const { chunk, questions } of results) {
      const valid = questions
        .filter(q => q.question && q.type && q.answer)
        .map(q => ({
          question_id: generateQuestionId(),
          question: q.question,
          type: q.type,
          options: q.options || [],
          answer: q.answer,
          difficulty: q.difficulty || 'easy',
          source_chunk_id: chunk.chunk_id,
          topic: chunk.topic,
          subject: chunk.subject,
          grade: chunk.grade
        }));

      if (!valid.length) continue;

      try {
        const inserted = await QuizQuestion.insertMany(valid, { ordered: false });
        totalGenerated += inserted.length;
        totalDuplicates += valid.length - inserted.length;
      } catch (err) {
        if (err.code === 11000) {
          const insertedCount = err.insertedDocs?.length || 0;
          totalGenerated += insertedCount;
          totalDuplicates += valid.length - insertedCount;
        } else {
          throw err;
        }
      }
    }

    // Mark this source_id as processed
    generatedCache.add(source_id);

    res.json({ source_id, questions_generated: totalGenerated, duplicates_skipped: totalDuplicates, from_cache: false });
  } catch (err) {
    next(err);
  }
}

module.exports = { generateQuiz };
