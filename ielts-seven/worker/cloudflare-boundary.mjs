// Standalone Workers do not have the Sites gateway that authenticates oai-* headers.
export function createCloudflareWorker(app) {
  return {
    async fetch(request, env, context) {
      const pathname = new URL(request.url).pathname;
      if (pathname === '/mcp' || pathname.startsWith('/mcp/')) {
        return new Response('Not found', {status: 404, headers: {'Cache-Control': 'no-store'}});
      }
      if (pathname === '/signin-with-chatgpt' || pathname.startsWith('/signin-with-chatgpt/')) {
        return new Response(null, {status: 303, headers: {Location: '/#settings', 'Cache-Control': 'no-store'}});
      }
      if ((request.method === 'GET' || request.method === 'HEAD') && (pathname === '/zh' || pathname === '/zh/')) {
        // The previous site cached a root-to-/zh redirect. A fresh root URL avoids
        // sending that browser straight back to the retired locale entry point.
        return new Response(null, {status: 303, headers: {Location: '/?app=ielts#today', 'Cache-Control': 'no-store'}});
      }

      const headers = new Headers(request.headers);
      for (const name of [...headers.keys()]) {
        if (name.toLowerCase().startsWith('oai-')) headers.delete(name);
      }
      // Preserve the real origin for CSRF checks and PKCE callbacks. Clone first so
      // consuming the forwarded body does not consume the caller's Request.
      const forwarded = new Request(request.clone(), {headers});
      return app.fetch(forwarded, {...env, EMAIL_AUTH_ENABLED: '1', EMAIL_AUTH_METHOD: 'magic-link'}, context);
    },
  };
}
