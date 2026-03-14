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
          // ISSUE-05: denormalize chunk metadata onto each question
          topic: chunk.topic,
          subject: chunk.subject,
          grade: chunk.grade
        }));

      if (!valid.length) continue;

      // ISSUE-02: bulk insert; unique index handles deduplication natively
      try {
        const inserted = await QuizQuestion.insertMany(valid, { ordered: false });
        totalGenerated += inserted.length;
        totalDuplicates += valid.length - inserted.length;
      } catch (err) {
        if (err.code === 11000) {
          // Some were duplicates — count what actually inserted
          const insertedCount = err.insertedDocs?.length || 0;
          totalGenerated += insertedCount;
          totalDuplicates += valid.length - insertedCount;
        } else {
          throw err;
        }
      }
    }

    res.json({ source_id, questions_generated: totalGenerated, duplicates_skipped: totalDuplicates });
  } catch (err) {
    next(err);
  }
}

module.exports = { generateQuiz };
