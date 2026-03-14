const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  chunk_id: { type: String, required: true, unique: true },
  source_id: { type: String, required: true },
  text: String,
  subject: String,
  grade: Number,
  topic: String
});
module.exports = mongoose.model('ContentChunk', schema);
