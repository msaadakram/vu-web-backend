const { validationResult } = require('express-validator');
const Resource = require('../models/Resource');
const { RESOURCE_TYPES } = require('../models/Resource');
const { buildKey } = require('../config/multer');
const { uploadFile, getFile, getSignedDownloadUrl, deleteFile } = require('../config/r2');

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

    const { title, description, type, course, semester } = req.body;

    let resolvedType = type;
    if (!type || type === 'auto') {
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
        type,
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
  } catch (err) {
    next(err);
  }
};

const getAll = async (req, res, next) => {
  try {
    const { type, course, semester, q, sort } = req.query;
    const filter = {};
    if (type) filter.type = type;
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

module.exports = { upload, getAll, getOne, download, downloadLink, remove };
