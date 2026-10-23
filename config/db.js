const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Connects Mongoose to MongoDB (MONGO_URI or the local default). Exits the
// process on failure, because the app cannot work without its database.
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/the-daily-web');
    logger.info(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    logger.error(`MongoDB connection error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
