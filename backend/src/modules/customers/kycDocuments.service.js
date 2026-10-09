const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

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


async function normalizeImage(buffer) {
  const supportedFormats = new Set(['jpeg', 'png', 'webp']);

  try {
    const image = sharp(buffer, {
      limitInputPixels: 40_000_000,
      failOn: 'error',
    });

    const metadata = await image.metadata();

    if (
      !supportedFormats.has(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > 40_000_000
    ) {
      throw new Error('Unsupported image format or dimensions');
    }

    const normalizedBuffer = await image
      .rotate()
      .resize({
        width: 3000,
        height: 3000,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 85,
        mozjpeg: true,
      })
      .toBuffer();

    if (normalizedBuffer.length > 5 * 1024 * 1024) {
      const error = new Error(
        'Processed image exceeds the 5 MB storage limit'
      );
      error.statusCode = 413;
      error.code = 'PROCESSED_FILE_TOO_LARGE';
      throw error;
    }

    return {
      buffer: normalizedBuffer,
      mimeType: 'image/jpeg',
      extension: 'jpg',
    };
  } catch (error) {
    if (error.statusCode === 413) {
      throw error;
    }

    const validationError = new Error(
      'Invalid or unsupported image. Upload a valid JPEG, PNG, or WebP image.'
    );
    validationError.statusCode = 400;
    validationError.code = 'INVALID_FILE_CONTENT';
    throw validationError;
  }
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

  const normalizedImage = await normalizeImage(file.buffer);

  const storageRoot = path.resolve(
    process.env.KYC_STORAGE_DIR ||
    path.join(os.homedir(), 'jonima-private-kyc')
  );

  const documentId = crypto.randomUUID();
  const filename = `${documentId}.${normalizedImage.extension}`;
  const userDirectory = path.join(storageRoot, userId);
  const absolutePath = path.join(userDirectory, filename);
  const storagePath = `${userId}/${filename}`;

  const originalFilename = path
    .basename(String(file.originalname || 'upload'))
    .replace(/[\r\n\0]/g, '')
    .slice(0, 255);

  const documentHash = crypto
    .createHash('sha256')
    .update(normalizedImage.buffer)
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
        mimeType: normalizedImage.mimeType,
        fileSizeBytes: normalizedImage.buffer.length,
        documentHash,
        persistFile: async () => {
          await fs.mkdir(userDirectory, {
            recursive: true,
            mode: 0o700,
          });

          const fileHandle = await fs.open(absolutePath, 'wx', 0o600);
          fileCreated = true;

          try {
            await fileHandle.writeFile(normalizedImage.buffer);
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
