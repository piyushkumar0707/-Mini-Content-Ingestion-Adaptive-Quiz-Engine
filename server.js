require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();
app.use(morgan('dev'));
app.use(express.json());

// Rate limiter — only on the expensive LLM endpoint
const quizLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10,
  message: { error: 'Too many quiz generation requests, try again later.' }
});

// Routes
app.use('/ingest', require('./src/routes/ingest'));
app.use('/generate-quiz', quizLimiter, require('./src/routes/quiz'));
app.use('/quiz', require('./src/routes/quizRetrieval'));
app.use('/submit-answer', require('./src/routes/answer'));
app.use('/student', require('./src/routes/student'));
app.use('/stats', require('./src/routes/stats'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => { console.error('DB connection failed:', err); process.exit(1); });
