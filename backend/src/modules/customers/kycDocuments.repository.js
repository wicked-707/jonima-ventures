const { pool } = require('../../config/database');

async function createCustomerDocumentTransaction({
  companyId,
  userId,
  documentType,
  storagePath,
  originalFilename,
  mimeType,
  fileSizeBytes,
  documentHash,
  persistFile,
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const customerResult = await client.query(
      `
        SELECT c.id
        FROM customers c
        INNER JOIN users u
          ON u.id = c.user_id
        WHERE c.company_id = $1
          AND c.user_id = $2
        LIMIT 1
        FOR UPDATE OF u
      `,
      [companyId, userId]
    );

    if (customerResult.rowCount === 0) {
      const error = new Error('Customer profile not found');
      error.statusCode = 404;
      error.code = 'CUSTOMER_NOT_FOUND';
      throw error;
    }

    const existingResult = await client.query(
      `
        SELECT id
        FROM user_documents
        WHERE user_id = $1
          AND document_type = $2
          AND status <> 'REPLACED'
        LIMIT 1
        FOR UPDATE
      `,
      [userId, documentType]
    );

    if (existingResult.rowCount > 0) {
      const error = new Error(
        'A document of this type already exists. Document replacement is not yet enabled.'
      );
      error.statusCode = 409;
      error.code = 'DOCUMENT_ALREADY_EXISTS';
      throw error;
    }

    await persistFile();

    const result = await client.query(
      `
        INSERT INTO user_documents (
          user_id,
          document_type,
          storage_bucket,
          storage_path,
          original_filename,
          mime_type,
          file_size_bytes,
          document_hash,
          status,
          uploaded_by
        )
        VALUES (
          $1, $2, 'local-private', $3, $4,
          $5, $6, $7, 'PENDING', $1
        )
        RETURNING
          id,
          document_type,
          status,
          file_size_bytes,
          mime_type,
          uploaded_at
      `,
      [
        userId,
        documentType,
        storagePath,
        originalFilename,
        mimeType,
        fileSizeBytes,
        documentHash,
      ]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('KYC upload rollback failed:', rollbackError.message);
    }

    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createCustomerDocumentTransaction,
};
