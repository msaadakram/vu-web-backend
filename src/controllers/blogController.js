// NOTE: This file re-exports the existing controller with sitemap ping injected.
// It wraps the original so we never break existing logic.
// If your blogController is at a different path, update the require below.

const originalController = require('./blogController.original');
const { pingSitemaps } = require('../utils/sitemapPing');

// Wrap the generate/create action to auto-ping after a new blog is published
const wrappedGenerate = async (req, res, next) => {
  // Store original json method to intercept successful response
  const originalJson = res.json.bind(res);
  res.json = function (data) {
    // Fire-and-forget ping after 201/200 creation
    if (res.statusCode < 300 && data?.data?.blog?.slug) {
      pingSitemaps([`/blog/${data.data.blog.slug}`, '/whats-new']).catch(() => {});
    }
    return originalJson(data);
  };
  return originalController.generate(req, res, next);
};

module.exports = {
  ...originalController,
  generate: wrappedGenerate,
};
