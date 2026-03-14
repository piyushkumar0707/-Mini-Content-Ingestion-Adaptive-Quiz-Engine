const router = require('express').Router();
const multer = require('multer');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { ingest } = require('../controllers/ingestController');

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are accepted'));
  }
});

router.post('/', upload.single('file'), [
  body('grade').notEmpty().isInt({ min: 1, max: 12 }).withMessage('grade must be an integer between 1 and 12'),
  body('subject').notEmpty().withMessage('subject is required'),
  body('topic').notEmpty().withMessage('topic is required')
], validate, ingest);

module.exports = router;
