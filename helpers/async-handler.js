// Express 4 does not catch rejected async handlers; unhandled, they stop the process.
const asyncHandler = (handler) => (req, res, next) =>
  handler(req, res, next).catch(next);

module.exports = asyncHandler;
