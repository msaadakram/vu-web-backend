/**
 * Best-effort on-demand revalidation of the frontend sitemap + listing pages.
 *
 * Called after a blog or news post is published so the new URL shows up in
 * /sitemap.xml and /blog or /news immediately, instead of waiting up to the
 * sitemap's `revalidate` window.
 *
 * Configured via two env vars (both optional — if unset, the ping is skipped):
 *   FRONTEND_URL       — e.g. https://vu-web-front.herokuapp.com (no trailing slash)
 *   REVALIDATE_SECRET  — shared secret matching the frontend's REVALIDATE_SECRET
 *
 * Failures are swallowed (this must never break publishing).
 */
async function pingFrontendRevalidate() {
  const frontendUrl = process.env.FRONTEND_URL;
  const secret = process.env.REVALIDATE_SECRET;
  if (!frontendUrl || !secret) return;

  const url = `${frontendUrl.replace(/\/$/, "")}/api/revalidate?secret=${encodeURIComponent(secret)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "x-revalidate-secret": secret },
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
