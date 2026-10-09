const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 1,
    parts: 2,
  },
});

function kycUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        message: 'File exceeds the 5 MB upload limit',
      });
    }

    if (
      error.code === 'LIMIT_FILE_COUNT' ||
      error.code === 'LIMIT_FIELD_COUNT' ||
      error.code === 'LIMIT_PART_COUNT' ||
      error.code === 'LIMIT_UNEXPECTED_FILE'
    ) {
      return res.status(400).json({
        success: false,
        message: 'Upload must contain one file in the "file" field and one documentType field',
      });
    }

    return next(error);
  });
}

module.exports = { kycUpload };
