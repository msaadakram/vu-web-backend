const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const healthRoute = require('./routes/health');
const authRoutes = require('./routes/authRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const blogRoutes = require('./routes/blogRoutes');
const newsRoutes = require('./routes/newsRoutes');
const statsRoutes = require('./routes/statsRoutes');

const app = express();

// IMPORTANT: trust Vercel's reverse-proxy so express-rate-limit
// can read the real client IP from X-Forwarded-For
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = (process.env.CLIENT_URL || '')
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);
      if (allowed.length === 0) return callback(null, true);
      if (allowed.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // Required when trust proxy is enabled — use the first IP in the chain
  keyGenerator: (req) => req.ip,
});
app.use('/api', limiter);

// Serverless DB middleware — connect on every cold-start/request
// because Vercel functions don't keep a persistent process alive
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('[DB] Failed to connect:', err.message);
    return res.status(503).json({
      status: 'error',
      message: 'Database connection failed. Please try again later.',
    });
  }
});

app.use('/api/health', healthRoute);
app.use('/api/auth', authRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api', blogRoutes);
app.use('/api', newsRoutes);
app.use('/api', statsRoutes);

app.use((req, res, next) => {
  const err = new Error(`Not found: ${req.originalUrl}`);
  err.status = 404;
  next(err);
});

app.use((err, req, res, next) => {
  if (err.name === 'MulterError') {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File too large (max 50 MB)'
        : `Upload error: ${err.message}`;
    return res.status(400).json({ status: 'error', message });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ status: 'error', message: err.message });
  }
  const status = err.status || 500;
  res.status(status).json({
    status: 'error',
    message: err.message,
    ...(err.errors && { errors: err.errors }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

module.exports = app;
