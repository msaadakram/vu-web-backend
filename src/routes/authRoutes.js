const express = require('express');
const { body } = require('express-validator');
const { register, login, googleAuth, me, getReferral } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ── Email / Password ──────────────────────────────────────────────────────────
router.post(
  '/register',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  register
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  login
);

// ── Google OAuth (One Tap / Sign-In button) ───────────────────────────────────
// Accepts the credential (id_token) returned by Google Identity Services
router.post(
  '/google',
  [body('credential').notEmpty().withMessage('Google credential is required')],
  googleAuth
);

// ── Protected routes ──────────────────────────────────────────────────────────
router.get('/me', protect, me);
router.get('/referral', protect, getReferral);

module.exports = router;
