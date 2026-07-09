/**
 * Convert a string into a URL-friendly slug.
 * e.g. "Understanding Data Structures" → "understanding-data-structures"
 */
function slugify(str) {
  if (!str) return 'untitled';
  return str
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')   // remove non-word chars
    .replace(/\s+/g, '-')        // spaces to hyphens
    .replace(/-+/g, '-')         // collapse multiple hyphens
    .replace(/^-+|-+$/g, '');    // trim leading/trailing hyphens
}

module.exports = slugify;
