function errorHandler(err, req, res, next) {
  console.error('API Error:', err.message);

  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      message: 'A record with the supplied unique value already exists',
    });
  }

  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      message: 'Referenced record does not exist',
    });
  }

  if (err.code === '23514') {
    return res.status(400).json({
      success: false,
      message: 'Request violates a database constraint',
    });
  }

  const statusCode =
    Number.isInteger(err.statusCode)
      ? err.statusCode
      : 500;

  return res.status(statusCode).json({
    success: false,
    message:
      statusCode === 500
        ? 'Internal server error'
        : err.message,
  });
}

module.exports = {
  errorHandler,
};