let cached = global._mongoose;

if (!cached) {
  cached = global._mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) return cached.conn;

  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn('[DB] MONGO_URI not set — skipping DB connection. Some features will be unavailable.');
    return null;
  }

  const mongoose = require('mongoose');
  mongoose.set('strictQuery', true);

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri).then((m) => m);
  }

  try {
    cached.conn = await cached.promise;
    console.log('[DB] MongoDB connected');
  } catch (err) {
    console.error('[DB] MongoDB connection error:', err.message);
    cached.promise = null;
    throw err;
  }

  return cached.conn;
};

module.exports = connectDB;
