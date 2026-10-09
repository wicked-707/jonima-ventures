const kycDocumentsService = require('./kycDocuments.service');

async function uploadMyKycDocument(req, res, next) {
  try {
    if (!req.auth?.userId || !req.auth?.companyId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const documentType =
      typeof req.body?.documentType === 'string'
        ? req.body.documentType.trim().toUpperCase()
        : '';

    const document =
      await kycDocumentsService.uploadMyKycDocument({
        userId: req.auth.userId,
        companyId: req.auth.companyId,
        documentType,
        file: req.file,
      });

    return res.status(201).json({
      success: true,
      message: 'KYC document uploaded successfully',
      data: document,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  uploadMyKycDocument,
};
