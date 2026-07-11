const BlogPost = require('../models/BlogPost');
const Resource = require('../models/Resource');
const User = require('../models/User');

/**
 * GET /api/stats  (public)
 * Lightweight aggregate counts + latest published blog posts for the homepage.
 * No auth, cached-friendly. Counts skip on error so the homepage still renders.
 */
const getStats = async (req, res, next) => {
  try {
    const [resources, blogs, news, students] = await Promise.all([
      Resource.countDocuments({}).catch(() => 0),
      BlogPost.countDocuments({ status: 'published', type: 'resource' }).catch(() => 0),
      BlogPost.countDocuments({ status: 'published', type: 'news' }).catch(() => 0),
      User.countDocuments({ role: 'student' }).catch(() => 0),
    ]);

    // Latest 4 published posts (mix of blog + news), newest first
    const latest = await BlogPost.find({ status: 'published' })
      .select('title slug excerpt category tags readTime createdAt updatedAt type uploadedBy coverImage')
      .sort({ createdAt: -1 })
      .limit(4)
      .populate('uploadedBy', 'name')
      .lean()
      .catch(() => []);

    res.status(200).json({
      status: 'success',
      data: {
        counts: { resources, blogs, news, students },
        latest,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getStats };
