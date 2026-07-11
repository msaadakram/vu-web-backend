/**
 * sitemapPing.js
 *
 * Call `pingSitemaps(extraPaths)` after any blog / news / resource is
 * created or updated.  It does two things:
 *
 *  1. Pings the Google Search Console sitemap submission API so Google
 *     schedules a re-crawl immediately (best-effort, no auth required).
 *
 *  2. Calls the frontend /api/revalidate endpoint to trigger on-demand
 *     ISR so /whats-new, /blog, /news, /resources and all sitemap routes
 *     are refreshed without waiting for the 1-hour revalidate window.
 *
 * Environment variables required (set in Vercel / .env):
 *   FRONTEND_URL        e.g. https://virtualupk.vercel.app
 *   REVALIDATE_TOKEN    must match the frontend REVALIDATE_TOKEN env var
 */

const BASE_SITEMAP_INDEX = `${process.env.FRONTEND_URL || 'https://virtualupk.vercel.app'}/sitemap_index.xml`;
const BASE_SITEMAP       = `${process.env.FRONTEND_URL || 'https://virtualupk.vercel.app'}/sitemap.xml`;
const REVALIDATE_URL     = `${process.env.FRONTEND_URL || 'https://virtualupk.vercel.app'}/api/revalidate`;
const REVALIDATE_TOKEN   = process.env.REVALIDATE_TOKEN || '';

/**
 * Ping Google to re-crawl our sitemaps.
 * Google deprecated the ping endpoint in 2023 for new indexing but it
 * still helps for Bing/other crawlers.  Kept for completeness.
 */
async function pingGoogle() {
  const urls = [
    `https://www.google.com/ping?sitemap=${encodeURIComponent(BASE_SITEMAP_INDEX)}`,
    `https://www.bing.com/ping?sitemap=${encodeURIComponent(BASE_SITEMAP_INDEX)}`,
  ];
  await Promise.allSettled(
    urls.map((u) =>
      fetch(u, { method: 'GET' }).then((r) =>
        console.log(`[SitemapPing] ${u.split('//')[1].split('/')[0]} → ${r.status}`)
      )
    )
  );
}

/**
 * Trigger Next.js on-demand ISR on the frontend.
 * @param {string[]} extraPaths  Specific paths to revalidate, e.g. ['/blog/my-slug']
 */
async function revalidateFrontend(extraPaths = []) {
  if (!REVALIDATE_TOKEN) {
    console.warn('[SitemapPing] REVALIDATE_TOKEN not set — skipping frontend revalidation.');
    return;
  }
  try {
    const res = await fetch(REVALIDATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-revalidate-token': REVALIDATE_TOKEN,
      },
      body: JSON.stringify({ paths: extraPaths }),
    });
    const data = await res.json();
    console.log('[SitemapPing] Frontend revalidated:', data.paths?.join(', '));
  } catch (err) {
    console.warn('[SitemapPing] Revalidation failed:', err.message);
  }
}

/**
 * Main export.  Call this after creating / updating any crawlable content.
 *
 * @param {string[]} extraPaths  Optional extra frontend paths to revalidate.
 *                               e.g. ['/blog/my-new-slug', '/news/another-slug']
 */
async function pingSitemaps(extraPaths = []) {
  await Promise.allSettled([
    pingGoogle(),
    revalidateFrontend(extraPaths),
  ]);
}

module.exports = { pingSitemaps };
