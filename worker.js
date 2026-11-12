// OPTIONAL RSS proxy for feeds whose servers block browser (CORS) requests.
// Configure an environment variable ALLOWED_HOSTS containing comma-separated hostnames,
// e.g. "feeds.example.com,podcast.example.org". Do not leave this as an unrestricted proxy.
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";
    const headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers });
    const target = new URL(request.url).searchParams.get("url");
    if (!target) return new Response("Missing url parameter", { status: 400, headers });
    let parsed;
    try { parsed = new URL(target); } catch { return new Response("Invalid URL", { status: 400, headers }); }
    if (parsed.protocol !== "https:") return new Response("HTTPS only", { status: 400, headers });
    const allowed = (env.ALLOWED_HOSTS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    if (!allowed.includes(parsed.hostname.toLowerCase())) return new Response("Host not on ALLOWED_HOSTS allowlist", { status: 403, headers });
    try {
      const upstream = await fetch(parsed.toString(), { headers: { "User-Agent": "RussCast/1.0 podcast RSS reader", "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
      if (!upstream.ok) return new Response(`Upstream returned ${upstream.status}`, { status: 502, headers });
      const body = await upstream.text();
      if (body.length > 5_000_000) return new Response("Feed too large", { status: 413, headers });
      return new Response(body, { headers: { ...headers, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300" } });
    } catch { return new Response("Could not retrieve feed", { status: 502, headers }); }
  }
};