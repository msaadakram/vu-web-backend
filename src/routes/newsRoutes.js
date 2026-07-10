const express = require('express');
const newsController = require('../controllers/newsController');
const { protect, restrictTo } = require('../middleware/auth');
const upload = require('../config/multer');

const router = express.Router();

// Admin routes
router.post('/news/draft', protect, restrictTo('admin'), upload.single('coverImage'), newsController.createDraft);
router.post('/news/:id/generate', protect, restrictTo('admin'), newsController.generateContent);
router.put('/news/:id', protect, restrictTo('admin'), newsController.update);
router.delete('/news/:id', protect, restrictTo('admin'), newsController.remove);

// Public routes
router.get('/news', newsController.getAll);
router.get('/news/:slug', newsController.getBySlug);

// Polling route (by ID)
router.get('/news/id/:id', protect, newsController.getById);

module.exports = router;
