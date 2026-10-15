const {test, before} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {once} = require('node:events');
let createNodeServer, canonicalOriginFromEnv;
before(async () => ({createNodeServer, canonicalOriginFromEnv} = await import('../runtime/node-http.mjs')));

async function serverFor(t, handler, options = {}) {
  const server = createNodeServer({worker: {fetch: handler}, publicOrigin: 'https://xunci-example.onrender.com', ...options});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return server.address().port;
}
function request(port, {path = '/', method = 'GET', headers = {}, body} = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({host: '127.0.0.1', port, path, method, headers}, res => {
      const parts = [];
      res.on('data', chunk => parts.push(chunk));
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: Buffer.concat(parts).toString()}));
      res.on('error', reject);
    });
    req.on('error', reject); req.end(body);
  });
}

test('HTTPS public origin comes only from trusted environment configuration', () => {
  assert.equal(canonicalOriginFromEnv({RENDER_EXTERNAL_URL: 'https://example.onrender.com/'}), 'https://example.onrender.com');
  assert.equal(canonicalOriginFromEnv({RENDER_EXTERNAL_URL: 'https://other.test', PUBLIC_ORIGIN: 'https://custom.test'}), 'https://custom.test');
  for (const value of ['', 'http://example.test', 'https://example.test/path', 'https://u:p@example.test/',
    'https://example.test/?key=hidden', 'https://example.test/#part', ' https://example.test/']) {
    assert.throws(() => canonicalOriginFromEnv({RENDER_EXTERNAL_URL: value}), /valid HTTPS/);
  }
});

test('real HTTP canonical URL ignores forged authority and preserves browser Origin/cookies/body', async t => {
  let seen;
  const port = await serverFor(t, async req => {
    seen = {url: req.url, origin: req.headers.get('origin'), host: req.headers.get('host'),
      cookie: req.headers.get('cookie'), body: await req.text()};
    return Response.json({okay: true});
  });
  const result = await request(port, {path: '/api/learning-state?version=1', method: 'POST',
    headers: {Host: 'attacker.invalid', 'X-Forwarded-Host': 'attacker.invalid', 'X-Forwarded-Proto': 'http',
      Origin: 'https://hostile.invalid', Cookie: '__Host-xunci-session=opaque', 'Content-Type': 'application/json'}, body: '{"version":1}'});
  assert.equal(result.status, 200);
  assert.deepEqual(seen, {url: 'https://xunci-example.onrender.com/api/learning-state?version=1',
    origin: 'https://hostile.invalid', host: 'xunci-example.onrender.com', cookie: '__Host-xunci-session=opaque', body: '{"version":1}'});
});

test('all spoofed Sites identities and client IP forwarding headers are removed', async t => {
  let seen;
  const port = await serverFor(t, req => { seen = Object.fromEntries(req.headers); return new Response('okay'); });
  const result = await request(port, {headers: {'oai-authenticated-user-id': 'victim', 'OAI-Authenticated-User-Email': 'private@example.test',
    'CF-Connecting-IP': '1.2.3.4', 'CF-Connecting-IPv6': '::1', 'True-Client-IP': '1.2.3.4', 'X-Real-IP': '1.2.3.4',
    'X-Forwarded-For': '1.2.3.4', 'X-Forwarded-Custom': 'spoof', Forwarded: 'for=1.2.3.4',
    'Fastly-Client-IP': '1.2.3.4', 'X-Original-Forwarded-For': '1.2.3.4', 'X-Client-IP': '1.2.3.4',
    'X-Cluster-Client-IP': '1.2.3.4'}});
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(seen).filter(name => name !== 'host'), []);
});

test('actual worker CSRF logic receives browser Origin without rewriting it', async t => {
  const port = await serverFor(t, req => new Response(null, {status:
    req.headers.get('origin') === new URL(req.url).origin ? 204 : 403}));
  for (const origin of ['https://hostile.invalid', 'http://xunci-example.onrender.com']) {
    assert.equal((await request(port, {method: 'POST', headers: {Origin: origin}, body: 'test'})).status, 403);
  }
  assert.equal((await request(port, {method: 'POST', headers: {Origin: 'https://xunci-example.onrender.com'}, body: 'test'})).status, 204);
});

test('health is GET/HEAD only and does not run Worker or expose environment', async t => {
  const port = await serverFor(t, () => { throw new Error('must not call'); }, {env: {secret: 'never-expose'}});
  const health = await request(port, {path: '/health'});
  assert.equal(health.status, 200); assert.equal(health.body, '{"ok":true}');
  assert.equal(health.headers['cache-control'], 'no-store');
  assert.equal((await request(port, {path: '/health', method: 'HEAD'})).body, '');
  const post = await request(port, {path: '/health', method: 'POST'});
  assert.equal(post.status, 405); assert.equal(post.headers.allow, 'GET, HEAD');
});

test('separate Set-Cookie values survive without splitting Expires commas', async t => {
  const headers = new Headers();
  headers.append('Set-Cookie', 'first=one; Path=/; Expires=Thu, 15 Oct 2026 00:00:00 GMT; Secure; HttpOnly');
  headers.append('Set-Cookie', 'second=two; Path=/; Secure; HttpOnly');
  const port = await serverFor(t, () => new Response('okay', {headers}));
  const result = await request(port);
  assert.deepEqual(result.headers['set-cookie'], headers.getSetCookie());
});

test('HEAD suppresses Worker response bodies and regular responses stream completely', async t => {
  const contents = 'word'.repeat(500000);
  const port = await serverFor(t, () => new Response(contents, {headers: {'Content-Type': 'text/plain'}}));
  assert.equal((await request(port, {method: 'HEAD'})).body, '');
  const result = await request(port);
  assert.equal(result.body.length, contents.length); assert.equal(result.body, contents);
});

test('buffering enforces limits for declared and chunked bodies, including stricter auth limit', async t => {
  let calls = 0;
  const port = await serverFor(t, () => { calls++; return new Response('okay'); });
  const large = Buffer.alloc(1024 * 1024 + 1);
  assert.equal((await request(port, {method: 'POST', headers: {'Content-Length': large.length}, body: large})).status, 413);
  assert.equal((await request(port, {method: 'POST', headers: {'Transfer-Encoding': 'chunked'}, body: large})).status, 413);
  assert.equal((await request(port, {path: '/api/auth/login', method: 'POST', body: 'x'.repeat(4097)})).status, 413);
  assert.equal(calls, 0);
  assert.equal((await request(port, {method: 'POST', body: 'x'.repeat(4096)})).status, 200);
});

test('absolute-form, network authority, backslashes and GET payloads are rejected', async t => {
  let calls = 0;
  const port = await serverFor(t, () => { calls++; return new Response('okay'); });
  for (const path of ['https://attacker.invalid/api/auth/login', '//attacker.invalid/', '/\\attacker.invalid/', '/#fragment']) {
    assert.equal((await request(port, {path})).status, 400, path);
  }
  assert.equal((await request(port, {headers: {'Content-Length': '4'}, body: 'test'})).status, 400);
  assert.equal(calls, 0);
});

test('Worker errors and deadlines return generic errors with no exception details', async t => {
  const port = await serverFor(t, () => { throw new Error('secret-token-and-private-SQL'); });
  const failed = await request(port);
  assert.equal(failed.status, 500); assert.equal(failed.body, '{"error":"internal_error"}');
  const slow = await serverFor(t, () => new Promise(() => {}), {requestTimeoutMs: 30});
  const timed = await request(slow);
  assert.equal(timed.status, 504); assert.equal(timed.body, '{"error":"request_timeout"}');
});

test('a stalled upload times out before any Worker call', async t => {
  let calls = 0;
  const port = await serverFor(t, () => { calls++; return new Response('okay'); }, {requestTimeoutMs: 30});
  const result = await request(port, {method: 'POST', headers: {'Content-Length': '100'}, body: 'short'});
  assert.equal(result.status, 408); assert.equal(calls, 0);
});

test('a disconnected upload aborts safely and the HTTP service remains available', async t => {
  const net = require('node:net');
  let calls = 0;
  const port = await serverFor(t, () => { calls++; return new Response('okay'); });
  const socket = net.connect(port, '127.0.0.1');
  await once(socket, 'connect');
  socket.write('POST /api/learning-state HTTP/1.1\r\nHost: ignored.test\r\nContent-Length: 100\r\n\r\nshort');
  await new Promise(resolve => setTimeout(resolve, 10));
  socket.destroy();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal((await request(port, {path: '/health'})).status, 200);
  assert.equal(calls, 0);
});

function renderEnvironment() {
  return {RENDER_EXTERNAL_URL: 'https://xunci-example.onrender.com', PORT: '10000',
    SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'p'.repeat(32),
    SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'), CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
    D1_DATABASE_ID: '12345678-1234-1234-1234-123456789012', CLOUDFLARE_D1_API_TOKEN: 'private-api-token'};
}

test('Render startup configuration validates required settings before listening and keeps D1 credentials server only', async () => {
  const {renderConfiguration} = await import('../scripts/serve-render.mjs');
  const env = renderEnvironment();
  const config = renderConfiguration(env);
  assert.equal(config.publicOrigin, 'https://xunci-example.onrender.com');
  assert.equal(config.port, 10000); assert.equal(config.database.apiToken, env.CLOUDFLARE_D1_API_TOKEN);
  assert.equal(config.workerEnv.EMAIL_AUTH_ENABLED, '1'); assert.equal(config.workerEnv.EMAIL_AUTH_METHOD, 'magic-link');
  assert.equal(config.workerEnv.CLOUDFLARE_D1_API_TOKEN, undefined);
  for (const key of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SESSION_ENCRYPTION_KEY', 'CLOUDFLARE_ACCOUNT_ID',
    'D1_DATABASE_ID', 'CLOUDFLARE_D1_API_TOKEN', 'RENDER_EXTERNAL_URL']) {
    const invalid = {...env}; delete invalid[key];
    assert.throws(() => renderConfiguration(invalid));
  }
  for (const port of ['0', '65536', '-1', '1.5', 'bad']) assert.throws(() => renderConfiguration({...env, PORT: port}), /PORT/);
  for (const key of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SESSION_ENCRYPTION_KEY']) {
    assert.throws(() => renderConfiguration({...env, [key]: 'secret-invalid-value'}), error =>
      error.message === 'Invalid Render email authentication settings.');
  }
});

test('Render resolves the existing database when no ID is supplied and validates auth before lookup', async () => {
  const {resolvedRenderConfiguration} = await import('../scripts/serve-render.mjs');
  const env = renderEnvironment();
  delete env.D1_DATABASE_ID;
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls++;
    assert.equal(new URL(url).pathname, `/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database`);
    assert.equal(options.method, 'GET');
    return Response.json({success: true, result: [{uuid: '12345678-1234-1234-1234-123456789012', name: 'xunci-ielts-db'}],
      result_info: {page: 1, per_page: 100, count: 1, total_count: 1, total_pages: 1}});
  };
  const config = await resolvedRenderConfiguration(env, {fetchImpl});
  assert.equal(config.database.databaseId, '12345678-1234-1234-1234-123456789012');
  assert.equal(config.workerEnv.CLOUDFLARE_D1_API_TOKEN, undefined);
  assert.equal(calls, 1);
  await assert.rejects(resolvedRenderConfiguration({...env, SUPABASE_URL: 'invalid'}, {fetchImpl}), /authentication settings/);
  assert.equal(calls, 1);
});

test('existing standalone Worker through Node enforces authentication and CSRF without querying D1', async t => {
  const [{default: application}, {createCloudflareWorker}] = await Promise.all([
    import('../worker/index.mjs'), import('../worker/cloudflare-boundary.mjs')]);
  let queries = 0;
  const env = {...renderEnvironment(), EMAIL_AUTH_ENABLED: '1', EMAIL_AUTH_METHOD: 'magic-link',
    DB: {prepare() { queries++; throw new Error('unexpected database access'); }}};
  const port = await serverFor(t, createCloudflareWorker(application).fetch, {env});
  const progress = await request(port, {path: '/api/learning-state', headers: {'oai-authenticated-user-id': 'victim'}});
  assert.equal(progress.status, 401); assert.equal(JSON.parse(progress.body).error, 'authentication_required');
  const csrf = await request(port, {path: '/api/auth/otp', method: 'POST',
    headers: {Origin: 'https://hostile.invalid', 'Content-Type': 'application/json'}, body: '{"email":"user@example.test"}'});
  assert.equal(csrf.status, 403); assert.equal(JSON.parse(csrf.body).error, 'same_origin_required');
  assert.equal((await request(port, {path: '/mcp'})).status, 404);
  const config = await request(port, {path: '/api/auth/config'});
  assert.equal(config.status, 200); assert.equal(JSON.parse(config.body).loginMethod, 'magic-link');
  assert.equal(queries, 0);
});
