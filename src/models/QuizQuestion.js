const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  question_id: { type: String, required: true, unique: true },
  question: { type: String, required: true },
  type: { type: String, enum: ['MCQ', 'TrueFalse', 'FillBlank'], required: true },
  options: [String],
  answer: { type: String, required: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'easy' },
  source_chunk_id: String
});
module.exports = mongoose.model('QuizQuestion', schema);
