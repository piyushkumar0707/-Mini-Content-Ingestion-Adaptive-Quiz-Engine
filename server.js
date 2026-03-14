require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();
app.use(express.json());

// Routes
app.use('/ingest', require('./src/routes/ingest'));
app.use('/generate-quiz', require('./src/routes/quiz'));
app.use('/quiz', require('./src/routes/quizRetrieval'));
app.use('/submit-answer', require('./src/routes/answer'));
app.use('/student', require('./src/routes/student'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => { console.error('DB connection failed:', err); process.exit(1); });
