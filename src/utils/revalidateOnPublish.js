/**
 * revalidateOnPublish.js
 *
 * Express middleware factory.
 * Wrap any create/update route handler to auto-call pingSitemaps after
 * a successful 2xx response.
 *
 * Usage in route file:
 *   const { onPublish } = require('../utils/revalidateOnPublish');
 *   router.post('/', protect, onPublish(['/news', '/whats-new']), controller.create);
 *
 * Or call pingSitemaps() directly inside a controller:
 *   const { pingSitemaps } = require('../utils/sitemapPing');
 *   await pingSitemaps([`/blog/${slug}`, '/whats-new']);
 */

const { pingSitemaps } = require('./sitemapPing');

/**
 * @param {string[]} extraPaths  Frontend paths to revalidate after publish
 */
function onPublish(extraPaths = []) {
  return function publishMiddleware(req, res, next) {
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        // Build dynamic path if slug is in response
        const slug = data?.data?.blog?.slug || data?.data?.news?.slug || data?.data?.resource?._id;
        const dynamicPaths = slug
          ? extraPaths.map((p) => (p.includes(':slug') ? p.replace(':slug', slug) : p))
          : extraPaths;
        pingSitemaps([...dynamicPaths, '/whats-new']).catch(() => {});
      }
      return originalJson(data);
    };
    next();
  };
}

module.exports = { onPublish, pingSitemaps };
