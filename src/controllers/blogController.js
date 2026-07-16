const BlogPost = require('../models/BlogPost');
const blogGenerator = require('../services/blogGenerator');
const { buildKey } = require('../config/multer');
const { uploadFile, deleteFile } = require('../config/r2');
const { pingSitemaps } = require('../utils/sitemapPing');

/**
 * POST /api/blog/draft  (admin)
 * Creates a draft blog post with status 'generating'.
 */
const createDraft = async (req, res, next) => {
  try {
    const { title, description, category, tags } = req.body;

    if (!title || !title.trim()) {
      const err = new Error('Title is required');
      err.status = 400;
      throw err;
    }

    let coverImage = '';
    let coverImageKey = '';

    if (req.file) {
      const key = buildKey(req.file);
      coverImage = await uploadFile({
        buffer: req.file.buffer,
        key,
        mimeType: req.file.mimetype,
        metadata: { title: title.trim(), type: 'blog-cover' },
      });
      coverImageKey = key;
    }

    const blog = await BlogPost.create({
      title: title.trim(),
      slug: `generating-${Date.now()}`,
      type: 'blog',
      category: category || 'General',
      tags: tags || [],
      uploadedBy: req.user._id,
      status: 'generating',
      coverImage,
      coverImageKey,
    });

    res.status(201).json({ status: 'success', data: { blog } });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/blog/:id/generate  (admin)
 * Triggers AI generation for a draft blog post.
 */
const generate = async (req, res, next) => {
  try {
    const blog = await BlogPost.findById(req.params.id);
    if (!blog) {
      const err = new Error('Blog post not found');
      err.status = 404;
      throw err;
    }

    if (blog.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      const err = new Error('Not authorized');
      err.status = 403;
      throw err;
    }

    if (blog.status === 'published') {
      return res.status(200).json({ status: 'success', data: { blog } });
    }

    blog.status = 'generating';
    blog.errorMessage = '';
    await blog.save();

    res.status(200).json({ status: 'success', data: { blog } });

    // Run generation in background and ping sitemap on success
    blogGenerator
      .generateFromFields(blog._id, {
        title: blog.title,
        description: req.body.description || '',
        category: blog.category,
        tags: blog.tags,
      })
      .then((slug) => {
        console.log(`[BlogGen] Published: /blog/${slug}`);
        pingSitemaps([`/blog/${slug}`, '/whats-new']).catch(() => {});
      })
      .catch((err) => console.error(`[BlogGen] Failed:`, err.message));
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/blog  (public)
 * Lists published blog posts.
 */
const getAll = async (req, res, next) => {
  try {
    const { category, q, page = '1', limit = '12' } = req.query;
    const filter = { status: 'published', type: 'blog' };

    if (category && category !== 'All') {
      filter.category = category;
    }
    if (q) {
      filter.$text = { $search: q };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 12));
    const skip = (pageNum - 1) * limitNum;

    const [blogs, total] = await Promise.all([
      BlogPost.find(filter)
        .select('-sections -faq -keywords -errorMessage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('uploadedBy', 'name email')
        .lean(),
      BlogPost.countDocuments(filter),
    ]);

    const categories = await BlogPost.distinct('category', { status: 'published', type: 'blog' });

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
    const blog = await BlogPost.findOne({ slug: req.params.slug, status: 'published', type: 'blog' })
      .populate('uploadedBy', 'name email')
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
 * GET /api/blog/:id  (public/authenticated)
 * Returns a single blog post by ID (used for polling).
 */
const getById = async (req, res, next) => {
  try {
    const blog = await BlogPost.findById(req.params.id).lean();
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
 * PUT /api/blog/:id  (admin)
 * Updates a blog post.
 */
const update = async (req, res, next) => {
  try {
    const blog = await BlogPost.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

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
 * DELETE /api/blog/:id  (admin)
 * Deletes a blog post.
 */
const remove = async (req, res, next) => {
  try {
    const blog = await BlogPost.findById(req.params.id);
    if (!blog) {
      const err = new Error('Blog post not found');
      err.status = 404;
      throw err;
    }

    if (blog.coverImageKey) {
      await deleteFile(blog.coverImageKey).catch(() => {});
    }

    await BlogPost.findByIdAndDelete(req.params.id);

    res.status(200).json({ status: 'success', data: {} });
  } catch (err) {
    next(err);
  }
};

module.exports = { createDraft, generate, getAll, getBySlug, getById, update, remove };
