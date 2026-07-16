const FRONTEND_URL = process.env.FRONTEND_URL;
const REVALIDATE_TOKEN = process.env.REVALIDATE_TOKEN;

async function pingFrontendRevalidate(extraPaths = []) {
  if (!FRONTEND_URL || !REVALIDATE_TOKEN) return;

  const url = `${FRONTEND_URL.replace(/\/$/, '')}/api/revalidate`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-revalidate-token': REVALIDATE_TOKEN,
      },
      body: JSON.stringify({ paths: extraPaths }),
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      console.log(`[Revalidate] Frontend revalidated: ${(data.paths || []).join(', ')}`);
    } else {
      console.log(`[Revalidate] Frontend responded ${res.status}`);
    }
  } catch (err) {
    console.log(`[Revalidate] Skipped: ${err.message}`);
  }
}

module.exports = { pingFrontendRevalidate };
