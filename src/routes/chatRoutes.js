const express = require('express');
const { rateLimit } = require('express-rate-limit');
const chatController = require('../controllers/chatController');

const router = express.Router();

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { status: 'error', message: 'Too many chat requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/chat', chatLimiter, chatController.sendMessage);

module.exports = router;
