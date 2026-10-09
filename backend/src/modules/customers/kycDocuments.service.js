const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const kycDocumentsRepository = require('./kycDocuments.repository');

const ALLOWED_DOCUMENT_TYPES = new Set([
  'PASSPORT_PHOTO',
  'ID_FRONT',
  'ID_BACK',
  'PASSPORT',
  'ADDRESS_PROOF',
  'OTHER',
]);

function createError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function detectImage(buffer) {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    return { mimeType: 'image/png', extension: 'png' };
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }

  return null;
}

async function uploadMyKycDocument({
  userId,
  companyId,
  documentType,
  file,
}) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw createError(
      'Choose an image file to upload',
      400,
      'FILE_REQUIRED'
    );
  }

  if (!ALLOWED_DOCUMENT_TYPES.has(documentType)) {
    throw createError(
      'Unsupported documentType',
      400,
      'INVALID_DOCUMENT_TYPE'
    );
  }

  const detectedImage = detectImage(file.buffer);

  if (!detectedImage) {
    throw createError(
      'Unsupported image content. Upload a valid JPEG, PNG, or WebP image.',
      400,
      'INVALID_FILE_CONTENT'
    );
  }

  const storageRoot = path.resolve(
    process.env.KYC_STORAGE_DIR ||
    path.join(os.homedir(), 'jonima-private-kyc')
  );

  const documentId = crypto.randomUUID();
  const filename = `${documentId}.${detectedImage.extension}`;
  const userDirectory = path.join(storageRoot, userId);
  const absolutePath = path.join(userDirectory, filename);
  const storagePath = `${userId}/${filename}`;

  const originalFilename = path
    .basename(String(file.originalname || 'upload'))
    .replace(/[\r\n\0]/g, '')
    .slice(0, 255);

  const documentHash = crypto
    .createHash('sha256')
    .update(file.buffer)
    .digest('hex');

  let fileCreated = false;

  try {
    const document =
      await kycDocumentsRepository.createCustomerDocumentTransaction({
        companyId,
        userId,
        documentType,
        storagePath,
        originalFilename,
        mimeType: detectedImage.mimeType,
        fileSizeBytes: file.buffer.length,
        documentHash,
        persistFile: async () => {
          await fs.mkdir(userDirectory, {
            recursive: true,
            mode: 0o700,
          });

          const fileHandle = await fs.open(absolutePath, 'wx', 0o600);
          fileCreated = true;

          try {
            await fileHandle.writeFile(file.buffer);
          } finally {
            await fileHandle.close();
          }
        },
      });

    return {
      id: document.id,
      documentType: document.document_type,
      status: document.status,
      mimeType: document.mime_type,
      fileSizeBytes: Number(document.file_size_bytes),
      uploadedAt: document.uploaded_at,
    };
  } catch (error) {
    if (fileCreated) {
      try {
        await fs.unlink(absolutePath);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
          console.error(
            'KYC file cleanup failed:',
            cleanupError.message
          );
        }
      }
    }

    throw error;
  }
}

module.exports = {
  uploadMyKycDocument,
};
