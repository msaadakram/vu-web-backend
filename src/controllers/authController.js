const { validationResult } = require('express-validator');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function userPayload(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar || null,
    authProvider: user.authProvider,
    referralCode: user.referralCode,
    referralCount: user.referralCount,
  };
}

// ─── Email / Password Register ────────────────────────────────────────────────
const register = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error('Validation failed');
    err.status = 400;
    err.errors = errors.array();
    return next(err);
  }

  const { name, email, password, ref } = req.body;

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      // If account exists via Google, tell the user to use Google login
      if (existing.authProvider === 'google') {
        const err = new Error(
          'An account with this email already exists via Google. Please sign in with Google.'
        );
        err.status = 409;
        return next(err);
      }
      const err = new Error('Email already registered');
      err.status = 409;
      return next(err);
    }

    let referredByUser = null;
    if (ref) {
      referredByUser = await User.findOne({ referralCode: ref.toUpperCase() });
    }

    const user = await User.create({
      name,
      email,
      password,
      authProvider: 'local',
      referredBy: referredByUser ? referredByUser._id : null,
    });

    if (referredByUser) {
      await User.findByIdAndUpdate(referredByUser._id, { $inc: { referralCount: 1 } });
    }

    const token = user.getSignedToken();
    res.status(201).json({ status: 'success', token, data: { user: userPayload(user) } });
  } catch (err) {
    next(err);
  }
};

// ─── Email / Password Login ───────────────────────────────────────────────────
const login = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error('Validation failed');
    err.status = 400;
    err.errors = errors.array();
    return next(err);
  }

  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');

    // Account exists but was created via Google only
    if (user && user.authProvider === 'google') {
      const err = new Error(
        'This account uses Google Sign-In. Please click "Continue with Google" to log in.'
      );
      err.status = 401;
      return next(err);
    }

    if (!user) {
      const err = new Error('Invalid email or password');
      err.status = 401;
      return next(err);
    }

    // Brute-force protection
    if (user.isLocked) {
      const waitMin = Math.ceil((user.lockUntil - Date.now()) / 60000);
      const err = new Error(`Account temporarily locked. Try again in ${waitMin} minute(s).`);
      err.status = 429;
      return next(err);
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      await user.incLoginAttempts();
      const err = new Error('Invalid email or password');
      err.status = 401;
      return next(err);
    }

    // Reset failed attempts on successful login
    if (user.loginAttempts > 0) {
      await user.updateOne({ $set: { loginAttempts: 0 }, $unset: { lockUntil: 1 } });
    }

    const token = user.getSignedToken();
    res.status(200).json({ status: 'success', token, data: { user: userPayload(user) } });
  } catch (err) {
    next(err);
  }
};

// ─── Google OAuth ─────────────────────────────────────────────────────────────
// POST /api/auth/google
// Body: { credential: "<google id_token>" }
// Flow:
//   1. Verify the Google ID token with Google's servers
//   2. If user exists (by googleId) → login
//   3. If email exists (local account) → link Google to existing account
//   4. Otherwise → create new account via Google
const googleAuth = async (req, res, next) => {
  const { credential, ref } = req.body;

  if (!credential) {
    const err = new Error('Google credential token is required');
    err.status = 400;
    return next(err);
  }

  try {
    // Verify the token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    // Guard: token must be issued to our app
    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) {
      const err = new Error('Invalid Google token audience');
      err.status = 401;
      return next(err);
    }

    // Guard: email must be verified by Google
    if (!payload.email_verified) {
      const err = new Error('Google email is not verified. Please verify your Google account.');
      err.status = 401;
      return next(err);
    }

    const { sub: googleId, email, name, picture } = payload;

    // Case 1: Existing Google user — just log in
    let user = await User.findOne({ googleId });
    if (user) {
      // Refresh avatar if it changed
      if (picture && user.avatar !== picture) {
        user.avatar = picture;
        await user.save();
      }
      const token = user.getSignedToken();
      return res.status(200).json({ status: 'success', token, data: { user: userPayload(user) } });
    }

    // Case 2: Email exists (local account) → link Google
    user = await User.findOne({ email });
    if (user) {
      user.googleId = googleId;
      user.googleEmail = email;
      user.avatar = picture || user.avatar;
      user.authProvider = 'both';
      await user.save();
      const token = user.getSignedToken();
      return res.status(200).json({
        status: 'success',
        token,
        linked: true,   // frontend can show "Google linked to your account"
        data: { user: userPayload(user) },
      });
    }

    // Case 3: Brand new user via Google
    let referredByUser = null;
    if (ref) {
      referredByUser = await User.findOne({ referralCode: ref.toUpperCase() });
    }

    user = await User.create({
      name,
      email,
      googleId,
      googleEmail: email,
      avatar: picture || null,
      authProvider: 'google',
      referredBy: referredByUser ? referredByUser._id : null,
    });

    if (referredByUser) {
      await User.findByIdAndUpdate(referredByUser._id, { $inc: { referralCount: 1 } });
    }

    const token = user.getSignedToken();
    return res.status(201).json({ status: 'success', token, data: { user: userPayload(user) } });
  } catch (err) {
    if (err.message?.includes('Token used too late')) {
      err.status = 401;
      err.message = 'Google token expired. Please try again.';
    }
    next(err);
  }
};

// ─── /me ──────────────────────────────────────────────────────────────────────
const me = (req, res) => {
  res.status(200).json({ status: 'success', data: { user: userPayload(req.user) } });
};

// ─── Referral link ────────────────────────────────────────────────────────────
const getReferral = (req, res) => {
  const clientUrl = (process.env.CLIENT_URL || '').split(',')[0].trim();
  const code = req.user.referralCode;
  const referralLink = code ? `${clientUrl}/register?ref=${code}` : null;
  res.status(200).json({
    status: 'success',
    data: {
      referralCode: code || null,
      referralLink,
      referralCount: req.user.referralCount || 0,
    },
  });
};

module.exports = { register, login, googleAuth, me, getReferral };
