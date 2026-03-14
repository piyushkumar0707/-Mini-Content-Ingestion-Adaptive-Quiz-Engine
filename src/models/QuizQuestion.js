const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  question_id: { type: String, required: true, unique: true },
  question: { type: String, required: true },
  type: { type: String, enum: ['MCQ', 'TrueFalse', 'FillBlank'], required: true },
  options: [String],
  answer: { type: String, required: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'easy' },
  source_chunk_id: String,
  topic: String,
  subject: String,
  grade: Number
});

// Compound unique index — prevents duplicate questions per chunk (ISSUE-02)
schema.index({ question: 1, source_chunk_id: 1 }, { unique: true });

module.exports = mongoose.model('QuizQuestion', schema);
