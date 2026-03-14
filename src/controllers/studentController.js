const StudentSession = require('../models/StudentSession');

const LEVELS = ['easy', 'medium', 'hard'];

/**
 * Update student's difficulty based on correct/incorrect answer.
 * Uses streak: 3 correct in a row → increase; 2 incorrect in a row → decrease.
 */
async function updateDifficulty(student_id, is_correct) {
  let session = await StudentSession.findOne({ student_id });
  if (!session) {
    session = new StudentSession({ student_id, current_difficulty: 'easy', correct_streak: 0, incorrect_streak: 0 });
  }

  if (is_correct) {
    session.correct_streak += 1;
    session.incorrect_streak = 0;
    if (session.correct_streak >= 3) {
      const idx = LEVELS.indexOf(session.current_difficulty);
      if (idx < LEVELS.length - 1) session.current_difficulty = LEVELS[idx + 1];
      session.correct_streak = 0;
    }
  } else {
    session.incorrect_streak += 1;
    session.correct_streak = 0;
    if (session.incorrect_streak >= 2) {
      const idx = LEVELS.indexOf(session.current_difficulty);
      if (idx > 0) session.current_difficulty = LEVELS[idx - 1];
      session.incorrect_streak = 0;
    }
  }

  session.updatedAt = new Date();
  await session.save();
  return session.current_difficulty;
}

async function getStudentDifficulty(req, res, next) {
  try {
    const session = await StudentSession.findOne({ student_id: req.params.student_id });
    if (!session) {
      const err = new Error('Student session not found');
      err.status = 404;
      return next(err);
    }
    res.json({
      student_id: session.student_id,
      current_difficulty: session.current_difficulty,
      correct_streak: session.correct_streak,
      incorrect_streak: session.incorrect_streak,
      updatedAt: session.updatedAt
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { updateDifficulty, getStudentDifficulty };
