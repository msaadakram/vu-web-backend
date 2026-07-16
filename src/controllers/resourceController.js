const { validationResult } = require('express-validator');
const Resource = require('../models/Resource');
const { RESOURCE_TYPES } = require('../models/Resource');
const BlogPost = require('../models/BlogPost');
const blogGenerator = require('../services/blogGenerator');
const { buildKey } = require('../config/multer');
const { uploadFile, getFile, getSignedDownloadUrl, deleteFile } = require('../config/r2');
const { pingSitemaps } = require('../utils/sitemapPing');

const upload = async (req, res, next) => {
  try {
    if (!req.file) {
      const err = new Error('No file uploaded');
      err.status = 400;
      throw err;
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const err = new Error('Validation failed');
      err.status = 400;
      err.errors = errors.array();
      throw err;
    }

    const { title, description, course, semester } = req.body;
    // Normalize type: trim whitespace and lowercase so 'Assignment' and ' notes ' work
    const rawType = (req.body.type || '').trim().toLowerCase();

    let resolvedType = rawType;
    if (!rawType || rawType === 'auto') {
      const { classifyResource } = require('../services/blogGenerator');
      resolvedType = await classifyResource({ title, description, originalName: req.file.originalname, course });

      if (!RESOURCE_TYPES.includes(resolvedType)) {
        resolvedType = 'other';
      }
    }

    if (!RESOURCE_TYPES.includes(resolvedType)) {
      const err = new Error(`Invalid type. Allowed: ${RESOURCE_TYPES.join(', ')}`);
      err.status = 400;
      throw err;
    }

    const key = buildKey(req.file);
    const url = await uploadFile({
      buffer: req.file.buffer,
      key,
      mimeType: req.file.mimetype,
      metadata: {
        title,
        type: resolvedType,
        uploadedBy: String(req.user._id),
        originalName: req.file.originalname,
      },
    });

    const resource = await Resource.create({
      title,
      description: description || '',
      type: resolvedType,
      course: course || '',
      semester: semester || '',
      file: {
        key,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url,
      },
      uploadedBy: req.user._id,
    });

    res.status(201).json({ status: 'success', data: { resource } });

    // Best-effort: refresh sitemaps so the new resource appears in listings
    pingSitemaps(['/resources', '/whats-new']).catch(() => {});
  } catch (err) {
    next(err);
  }
};

const getAll = async (req, res, next) => {
  try {
    const { type, course, semester, q, sort } = req.query;
    const filter = {};
    if (type) filter.type = type.trim().toLowerCase();
    if (course) filter.course = new RegExp(course, 'i');
    if (semester) filter.semester = new RegExp(semester, 'i');
    if (q) filter.$text = { $search: q };

    const sortBy = sort === 'oldest' ? { createdAt: 1 } : { createdAt: -1 };

    const resources = await Resource.find(filter)
      .sort(sortBy)
      .populate('uploadedBy', 'name email')
      .populate('blog', 'slug title')
      .lean();

    res.status(200).json({
      status: 'success',
      results: resources.length,
      data: { resources },
    });
  } catch (err) {
    next(err);
  }
};

const getOne = async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id)
      .populate('uploadedBy', 'name email')
      .populate('blog', 'slug title');
    if (!resource) {
      const err = new Error('Resource not found');
      err.status = 404;
      throw err;
    }
    res.status(200).json({ status: 'success', data: { resource } });
  } catch (err) {
    next(err);
  }
};

const download = async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      const err = new Error('Resource not found');
      err.status = 404;
      throw err;
    }

    const { buffer, mimeType } = await getFile(resource.file.key);
    res.setHeader('Content-Type', mimeType || resource.file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${resource.file.originalName}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.end(buffer);
  } catch (err) {
    next(err);
  }
};

const downloadLink = async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      const err = new Error('Resource not found');
      err.status = 404;
      throw err;
    }
    const url = await getSignedDownloadUrl(resource.file.key, 3600);
    res.status(200).json({ status: 'success', data: { url, expiresIn: 3600 } });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      const err = new Error('Resource not found');
      err.status = 404;
      throw err;
    }

    const isOwner = resource.uploadedBy.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      const err = new Error('Only the uploader or an admin can delete this resource');
      err.status = 403;
      throw err;
    }

    await deleteFile(resource.file.key).catch(() => {});
    await resource.deleteOne();

    res.status(204).json({ status: 'success', data: null });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/resources/:id/blog/generate
 * Creates a draft blog post from a resource and triggers AI generation.
 */
const generateBlog = async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) {
      const err = new Error('Resource not found');
      err.status = 404;
      throw err;
    }

    // Only the uploader or an admin can generate a blog from a resource
    if (resource.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      const err = new Error('Not authorized to generate blog from this resource');
      err.status = 403;
      throw err;
    }

    // Check if a blog post already exists for this resource
    if (resource.blog) {
      const existing = await BlogPost.findById(resource.blog);
      if (existing) {
        return res.status(200).json({ status: 'success', data: { blog: { _id: existing._id, status: existing.status } } });
      }
    }

    const blog = await BlogPost.create({
      title: resource.title,
      slug: `generating-${Date.now()}`,
      type: 'blog',
      category: 'General',
      tags: [],
      resource: resource._id,
      uploadedBy: req.user._id,
      status: 'generating',
    });

    // Link resource to blog post
    resource.blog = blog._id;
    await resource.save();

    res.status(201).json({ status: 'success', data: { blog: { _id: blog._id, status: blog.status } } });

    // Run AI generation in background
    const resourceObj = resource.toObject();
    blogGenerator
      .generate(blog._id, resourceObj)
      .then((slug) => {
        console.log(`[ResourceBlog] Published: /blog/${slug}`);
      })
      .catch((err) => {
        console.error(`[ResourceBlog] AI generation failed:`, err.message, err.stack || '');
      });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/resources/:id/blog
 * Returns the blog post associated with a resource (for polling).
 */
const getResourceBlog = async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id).populate('blog');
    if (!resource) {
      const err = new Error('Resource not found');
      err.status = 404;
      throw err;
    }

    if (!resource.blog) {
      const err = new Error('Blog post not yet created');
      err.status = 404;
      throw err;
    }

    res.status(200).json({ status: 'success', data: { blog: resource.blog } });
  } catch (err) {
    next(err);
  }
};

module.exports = { upload, getAll, getOne, download, downloadLink, remove, generateBlog, getResourceBlog };
