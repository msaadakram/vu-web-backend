const express = require('express');
const blogController = require('../controllers/blogController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Resource-scoped routes
router.post('/resources/:id/blog/generate', protect, blogController.generate);
router.get('/resources/:id/blog', blogController.getByResource);

// Public blog routes
router.get('/blog', blogController.getAll);
router.get('/blog/:slug', blogController.getBySlug);

// Retry failed blog generation
router.post('/blog/:id/retry', protect, blogController.retry);

// Delete a blog post (admin only)
router.delete('/blog/:id/delete', protect, blogController.remove);

module.exports = router;
