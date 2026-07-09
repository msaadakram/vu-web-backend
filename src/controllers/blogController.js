const BlogPost = require('../models/BlogPost');
const Resource = require('../models/Resource');
const blogGenerator = require('../services/blogGenerator');

/**
 * POST /api/resources/:id/blog/generate  (protected)
 * Creates a BlogPost with status 'generating', responds immediately,
 * then runs the AI generation in the background.
 */
const generate = async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      const err = new Error('Resource not found');
      err.status = 404;
      throw err;
    }

    // Check ownership
    const isOwner = resource.uploadedBy.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      const err = new Error('Not authorized to generate blog for this resource');
      err.status = 403;
      throw err;
    }

    // If a published blog already exists, return it
    const existing = await BlogPost.findOne({ resource: resource._id, status: 'published' }).lean();
    if (existing) {
      return res.status(200).json({ status: 'success', data: { blog: existing } });
    }

    // If a generating blog exists, return it (don't double-create)
    const inProgress = await BlogPost.findOne({ resource: resource._id, status: 'generating' }).lean();
    if (inProgress) {
      return res.status(200).json({ status: 'success', data: { blog: inProgress } });
    }

    // Create generating blog doc
    const blog = await BlogPost.create({
      title: `Blog for ${resource.title}`,
      slug: `generating-${resource._id}`,
      resource: resource._id,
      uploadedBy: req.user._id,
      status: 'generating',
    });

    // Respond immediately
    res.status(201).json({ status: 'success', data: { blog } });

    // Run generation in background (fire-and-catch)
    blogGenerator
      .generate(blog._id, resource)
      .then(async (slug) => {
        // update the Resource doc with the blog ref (done inside generate already)
        console.log(`[BlogGen] Published blog for resource ${resource._id}: /blog/${slug}`);
      })
      .catch((err) => {
        console.error(`[BlogGen] Failed for resource ${resource._id}:`, err.message);
      });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/resources/:id/blog  (public)
 * Returns the blog post associated with a resource.
 */
const getByResource = async (req, res, next) => {
  try {
    const blog = await BlogPost.findOne({ resource: req.params.id })
      .populate('uploadedBy', 'name email')
      .lean();

    if (!blog) {
      const err = new Error('No blog found for this resource');
      err.status = 404;
      throw err;
    }

    res.status(200).json({ status: 'success', data: { blog } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/blog  (public)
 * List published blog posts with optional category and search filtering.
 */
const getAll = async (req, res, next) => {
  try {
    const { category, q, page = '1', limit = '12' } = req.query;
    const filter = { status: 'published' };

    if (category && category !== 'All') {
      filter.category = category;
    }
    if (q) {
      filter.$text = { $search: q };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    const [blogs, total] = await Promise.all([
      BlogPost.find(filter)
        .select('-sections -faq -keywords -errorMessage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('uploadedBy', 'name email')
        .populate('resource', 'title course type file.key file.originalName')
        .lean(),
      BlogPost.countDocuments(filter),
    ]);

    // Extract unique categories from all published blogs (for the filter chips)
    const categories = await BlogPost.distinct('category', { status: 'published' });

    res.status(200).json({
      status: 'success',
      results: blogs.length,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      data: { blogs, categories },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/blog/:slug  (public)
 * Returns a single published blog post by slug.
 */
const getBySlug = async (req, res, next) => {
  try {
    const blog = await BlogPost.findOne({ slug: req.params.slug, status: 'published' })
      .populate('uploadedBy', 'name email')
      .populate('resource', 'title course type file.url file.originalName file.size')
      .lean();

    if (!blog) {
      const err = new Error('Blog post not found');
      err.status = 404;
      throw err;
    }

    res.status(200).json({ status: 'success', data: { blog } });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/blog/:id/retry  (protected)
 * Retry generating a failed blog post.
 */
const retry = async (req, res, next) => {
  try {
    const blog = await BlogPost.findById(req.params.id);
    if (!blog) {
      const err = new Error('Blog post not found');
      err.status = 404;
      throw err;
    }

    // Check ownership
    if (blog.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      const err = new Error('Not authorized');
      err.status = 403;
      throw err;
    }

    if (blog.status === 'published') {
      return res.status(200).json({ status: 'success', data: { blog } });
    }

    // Reset to generating
    blog.status = 'generating';
    blog.errorMessage = '';
    await blog.save();

    res.status(200).json({ status: 'success', data: { blog } });

    // Run generation
    const resource = await Resource.findById(blog.resource);
    if (resource) {
      blogGenerator
        .generate(blog._id, resource)
        .then((slug) => console.log(`[BlogGen] Retry published: /blog/${slug}`))
        .catch((err) => console.error(`[BlogGen] Retry failed:`, err.message));
    }
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const blog = await BlogPost.findById(req.params.id);
    if (!blog) {
      const err = new Error('Blog post not found');
      err.status = 404;
      throw err;
    }

    // Delete cover image from R2 if it exists
    const { deleteFile } = require('../config/r2');
    if (blog.coverImageKey) {
      await deleteFile(blog.coverImageKey).catch(() => {});
    }

    await BlogPost.findByIdAndDelete(req.params.id);
    res.status(200).json({ status: 'success', data: {} });
  } catch (err) {
    next(err);
  }
};

module.exports = { generate, getByResource, getAll, getBySlug, retry, remove };
