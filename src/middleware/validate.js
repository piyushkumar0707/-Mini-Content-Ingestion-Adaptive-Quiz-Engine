const { validationResult } = require('express-validator');

module.exports = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error(errors.array().map(e => e.msg).join(', '));
    err.status = 400;
    return next(err);
  }
  next();
};
