const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      const err = new Error('Not authorized, no token provided');
      err.status = 401;
      throw err;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      const err = new Error('User no longer exists');
      err.status = 401;
      throw err;
    }

    req.user = user;
    return next();
  } catch (err) {
    const e = new Error('Not authorized, token failed');
    e.status = 401;
    return next(e);
  }
};

const restrictTo =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      const err = new Error('You do not have permission to perform this action');
      err.status = 403;
      return next(err);
    }
    return next();
  };

module.exports = { protect, restrictTo };
