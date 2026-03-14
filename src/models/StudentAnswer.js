const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  student_id: { type: String, required: true },
  question_id: { type: String, required: true },
  selected_answer: String,
  is_correct: Boolean,
  submittedAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('StudentAnswer', schema);
