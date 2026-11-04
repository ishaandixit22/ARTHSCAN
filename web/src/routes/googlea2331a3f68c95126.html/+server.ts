// Google Search Console's ownership file. Served from here because Cloudflare's asset handling
// redirects a static .html file to the address without .html, and Google needs this exact one.
export function GET() {
  return new Response("google-site-verification: googlea2331a3f68c95126.html", { headers: { "content-type": "text/html; charset=utf-8" } });
}
