const { validationResult } = require('express-validator');
const User = require('../models/User');

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
      const err = new Error('Email already registered');
      err.status = 409;
      throw err;
    }

    let referredByUser = null;
    if (ref) {
      referredByUser = await User.findOne({ referralCode: ref.toUpperCase() });
    }

    const user = await User.create({
      name,
      email,
      password,
      referredBy: referredByUser ? referredByUser._id : null,
    });

    // Increment referral count for the referrer
    if (referredByUser) {
      await User.findByIdAndUpdate(referredByUser._id, { $inc: { referralCount: 1 } });
    }

    const token = user.getSignedToken();

    res.status(201).json({
      status: 'success',
      token,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          referralCode: user.referralCode,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

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
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.matchPassword(password))) {
      const err = new Error('Invalid email or password');
      err.status = 401;
      throw err;
    }

    const token = user.getSignedToken();

    res.status(200).json({
      status: 'success',
      token,
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          referralCode: user.referralCode,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

const me = (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        referralCode: req.user.referralCode,
        referralCount: req.user.referralCount,
      },
    },
  });
};

// GET /api/auth/referral  — returns the current user's referral link
const getReferral = (req, res) => {
  const clientUrl = (process.env.CLIENT_URL || '').split(',')[0].trim();
  const code = req.user.referralCode;
  const referralLink = code
    ? `${clientUrl}/register?ref=${code}`
    : null;

  res.status(200).json({
    status: 'success',
    data: {
      referralCode: code || null,
      referralLink: referralLink,
      referralCount: req.user.referralCount || 0,
    },
  });
};

module.exports = { register, login, me, getReferral };
