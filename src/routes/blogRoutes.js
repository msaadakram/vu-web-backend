const express = require('express');
const blogController = require('../controllers/blogController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// Admin: create a draft blog post
router.post('/blog/draft', protect, restrictTo('admin'), blogController.createDraft);

// Admin: trigger AI generation for a draft (also serves as retry)
router.post('/blog/:id/generate', protect, blogController.generate);

// Admin: update a blog post
router.put('/blog/:id', protect, restrictTo('admin'), blogController.update);

// Admin: delete a blog post
router.delete('/blog/:id/delete', protect, restrictTo('admin'), blogController.remove);

// Public: list all published blog posts
router.get('/blog', blogController.getAll);

// Public: get a single blog post by ID (used for status polling)
router.get('/blog/id/:id', blogController.getById);

// Public: get a single blog post by slug
router.get('/blog/:slug', blogController.getBySlug);

module.exports = router;
