const BlogPost = require('../models/BlogPost');
const blogGenerator = require('../services/blogGenerator');
const { buildKey } = require('../config/multer');
const { uploadFile, deleteFile } = require('../config/r2');
const { pingFrontendRevalidate } = require('../services/revalidate');
const { pingSitemaps } = require('../utils/sitemapPing');

/**
 * POST /api/news/draft  (admin)
 * Creates a draft news post with status 'generating'.
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
        metadata: { title: title.trim(), type: 'news-cover' },
      });
      coverImageKey = key;
    }

    const blog = await BlogPost.create({
      title: title.trim(),
      slug: `generating-${Date.now()}`,
      type: 'news',
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
 * POST /api/news/:id/generate  (admin)
 * Triggers AI generation for a draft news post.
 */
const generateContent = async (req, res, next) => {
  try {
    const blog = await BlogPost.findById(req.params.id);
    if (!blog) {
      const err = new Error('News post not found');
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

    // Run generation in background — pass type:'news' so correct AI prompt is used
    blogGenerator
      .generateFromFields(blog._id, {
        title: blog.title,
        description: req.body.description || '',
        category: blog.category,
        tags: blog.tags,
        type: 'news',
      })
      .then((slug) => {
        console.log(`[NewsGen] Published: /news/${slug}`);
        // Ping sitemap on successful publish (same as blogController)
        pingSitemaps([`/news/${slug}`, '/whats-new']).catch(() => {});
      })
      .catch((err) => console.error(`[NewsGen] Failed:`, err.message));
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/news  (public)
 * Lists published news posts.
 */
const getAll = async (req, res, next) => {
  try {
    const { category, q, page = '1', limit = '12' } = req.query;
    const filter = { status: 'published', type: 'news' };

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
        .lean(),
      BlogPost.countDocuments(filter),
    ]);

    const categories = await BlogPost.distinct('category', { status: 'published', type: 'news' });

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
 * GET /api/news/id/:id  (public — used for polling generation status)
 * Returns a single news post by ID.
 */
const getById = async (req, res, next) => {
  try {
    const blog = await BlogPost.findById(req.params.id).lean();
    if (!blog) {
      const err = new Error('News post not found');
      err.status = 404;
      throw err;
    }
    res.status(200).json({ status: 'success', data: { blog } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/news/:slug  (public)
 * Returns a single published news post by slug.
 */
const getBySlug = async (req, res, next) => {
  try {
    const blog = await BlogPost.findOne({ slug: req.params.slug, status: 'published', type: 'news' })
      .populate('uploadedBy', 'name email')
      .lean();

    if (!blog) {
      const err = new Error('News post not found');
      err.status = 404;
      throw err;
    }

    res.status(200).json({ status: 'success', data: { blog } });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/news/:id  (admin)
 * Updates a news post.
 */
const update = async (req, res, next) => {
  try {
    const blog = await BlogPost.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!blog) {
      const err = new Error('News post not found');
      err.status = 404;
      throw err;
    }

    res.status(200).json({ status: 'success', data: { blog } });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/news/:id  (admin)
 * Deletes a news post and removes its cover image from R2.
 */
const remove = async (req, res, next) => {
  try {
    const blog = await BlogPost.findById(req.params.id);
    if (!blog) {
      const err = new Error('News post not found');
      err.status = 404;
      throw err;
    }

    if (blog.coverImageKey) {
      await deleteFile(blog.coverImageKey).catch(() => {});
    }

    await BlogPost.findByIdAndDelete(req.params.id);

    res.status(200).json({ status: 'success', data: {} });
    await pingFrontendRevalidate().catch(() => {});
  } catch (err) {
    next(err);
  }
};

module.exports = { createDraft, generateContent, getAll, getBySlug, getById, update, remove };
