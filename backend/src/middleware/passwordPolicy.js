function requirePasswordChangeCompleted(req, res, next) {
  if (req.auth?.mustChangePassword === true) {
    return res.status(403).json({
      success: false,
      message: 'Password change required before continuing',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }

  next();
}

module.exports = {
  requirePasswordChangeCompleted,
};
