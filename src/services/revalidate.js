/**
 * Best-effort on-demand revalidation of the frontend sitemap + listing pages.
 *
 * Called after a blog or news post is published so the new URL shows up in
 * /sitemap.xml and /blog or /news immediately, instead of waiting up to the
 * sitemap's `revalidate` window.
 *
 * Configured via two env vars (both optional — if unset, the ping is skipped):
 *   FRONTEND_URL       — e.g. https://virtualupk.vercel.app (no trailing slash)
 *   REVALIDATE_SECRET  — shared secret matching the frontend's REVALIDATE_SECRET
 *
 * Failures are swallowed (this must never break publishing).
 *
 * SECURITY: the secret is sent only in the x-revalidate-secret request header.
 * It is NOT included in the URL query string to avoid it being captured in
 * server access logs, CDN logs, or browser history.
 */
async function pingFrontendRevalidate() {
  const frontendUrl = process.env.FRONTEND_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!frontendUrl || !secret) return;

  // Secret goes in header only — never in the URL
  const url = `${frontendUrl.replace(/\/$/, '')}/api/revalidate`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'x-revalidate-secret': secret },
    });
    clearTimeout(timeout);
    if (res.ok) {
      console.log(`[Revalidate] Frontend revalidated (${res.status})`);
    } else {
      console.log(`[Revalidate] Frontend responded ${res.status}`);
    }
  } catch (err) {
    console.log(`[Revalidate] Skipped: ${err.message}`);
  }
}

module.exports = { pingFrontendRevalidate };
