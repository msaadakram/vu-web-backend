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

// Public: get a single news post by ID (used for status polling)
// MUST be before /:slug to prevent 'id' being matched as a slug
router.get('/news/id/:id', newsController.getById);

// Public: get a single news post by slug
router.get('/news/:slug', newsController.getBySlug);

module.exports = router;
