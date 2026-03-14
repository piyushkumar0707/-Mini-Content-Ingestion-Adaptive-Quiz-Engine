const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  source_id: { type: String, required: true, unique: true },
  title: String,
  subject: String,
  grade: Number,
  topic: String,
  uploadedAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('SourceDocument', schema);
