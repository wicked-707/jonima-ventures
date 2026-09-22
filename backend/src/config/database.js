const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

async function testDatabaseConnection() {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT
        current_database() AS database,
        current_user AS user,
        version() AS version
    `);

    console.log('✅ PostgreSQL connection successful');
    console.log('Database:', result.rows[0].database);
    console.log('User:', result.rows[0].user);
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  testDatabaseConnection,
};