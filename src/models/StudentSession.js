const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  student_id: { type: String, required: true, unique: true },
  current_difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'easy' },
  correct_streak: { type: Number, default: 0 },
  incorrect_streak: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('StudentSession', schema);
