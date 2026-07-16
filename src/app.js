const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const connectDB = require('./config/db');
const healthRoute = require('./routes/health');
const authRoutes = require('./routes/authRoutes');
const resourceRoutes = require('./routes/resourceRoutes');
const blogRoutes = require('./routes/blogRoutes');
const newsRoutes = require('./routes/newsRoutes');
const statsRoutes = require('./routes/statsRoutes');
const newsletterRoutes = require('./routes/newsletterRoutes');
const chatRoutes = require('./routes/chatRoutes');

const app = express();

// Trust Vercel reverse-proxy so express-rate-limit reads real client IP
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin / server-to-server requests (no Origin header)
      if (!origin) return callback(null, true);

      const raw = process.env.CLIENT_URL || '';
      const allowed = raw
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);

      // SECURITY: if CLIENT_URL is not configured, deny all cross-origin
      // requests rather than defaulting to allow-all.
      if (allowed.length === 0) {
        console.warn('[CORS] CLIENT_URL not set — blocking cross-origin request from:', origin);
        return callback(null, false);
      }

      if (allowed.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);
app.use(compression());
// Reduced from 50mb to 10mb — file uploads go through multer (multipart), not JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// Only log HTTP requests in development — skip in production and test
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  // Use the built-in ipKeyGenerator helper so IPv6 addresses are handled
  // correctly and the ERR_ERL_KEY_GEN_IPV6 warning is suppressed.
  keyGenerator: ipKeyGenerator,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false,
  },
});
app.use('/api', limiter);

// Serverless DB middleware — connect on every cold-start/request
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

// ── Root health / info route ──────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    name: 'VirtualUPK API',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString(),
    endpoints: {
      health:     '/api/health',
      auth:       '/api/auth',
      blog:       '/api/blog',
      news:       '/api/news',
      resources:  '/api/resources',
      newsletter: '/api/newsletter',
      stats:      '/api/stats',
      chat:       '/api/chat',
    },
  });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/health', healthRoute);
app.use('/api/auth', authRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api', blogRoutes);
app.use('/api', newsRoutes);
app.use('/api', statsRoutes);
app.use('/api', chatRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const err = new Error(`Not found: ${req.originalUrl}`);
  err.status = 404;
  next(err);
});

// ── Global error handler ──────────────────────────────────────────────────────
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
