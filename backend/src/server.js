const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const {
  errorHandler,
} = require('./middleware/errorHandler');

const {
  notFound,
} = require('./middleware/notFound');

const { testDatabaseConnection } = require('./config/database');
const apiRoutes = require('./routes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api', apiRoutes);
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await testDatabaseConnection();

    app.listen(PORT, () => {
      console.log(`🚀 Jonima Ventures API running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server');
    console.error(error.message);
    process.exit(1);
  }
}

startServer();



