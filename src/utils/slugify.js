/**
 * Convert a string into a URL-friendly slug.
 *
 * Handles:
 *  - ASCII titles:  "Understanding Data Structures" → "understanding-data-structures"
 *  - Mixed content: strips non-ASCII after lowercasing so Urdu/Arabic words in
 *    titles don't silently collapse the whole slug to 'untitled'.
 *  - Ensures the result is never an empty string.
 *
 * @param {string} str
 * @returns {string}
 */
function slugify(str) {
  if (!str) return 'untitled';

  const result = str
    .toString()
    .toLowerCase()
    .trim()
    // Replace common non-ASCII punctuation with hyphens before stripping
    .replace(/[\u2013\u2014\u2012]/g, '-')   // em/en dashes
    .replace(/[^\x00-\x7F]+/g, '-')           // strip non-ASCII (Urdu, Arabic, etc.) → hyphen
    .replace(/[^\w\s-]/g, '')                  // remove remaining non-word chars
    .replace(/\s+/g, '-')                      // spaces to hyphens
    .replace(/-+/g, '-')                       // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '');                  // trim leading/trailing hyphens

  // Guard: if the whole string was non-ASCII the result may be empty
  return result || 'untitled';
}

module.exports = slugify;
