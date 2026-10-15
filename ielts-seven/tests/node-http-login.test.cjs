const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {once} = require('node:events');
const {createHash} = require('node:crypto');
const {DatabaseSync} = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

globalThis.IELTS_ENGINE = require('../dist/engine.js');
globalThis.IELTS_SYNC = require('../dist/sync-state.js');

const PUBLIC_ORIGIN = 'https://xunci-example.onrender.com';
const PROJECT = 'abcdefghijklmnopqrst';
const EMAIL = 'alice@example.com';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const AUTH_CODE = 'node-http-magic-code-abcdef0123456789';
const ACCESS_TOKEN = 'synthetic-provider-access-token';

class SqliteD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    const directory = path.join(__dirname, '../drizzle');
    for (const file of fs.readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
      this.sqlite.exec(fs.readFileSync(path.join(directory, file), 'utf8'));
    }
  }
  prepare(sql) {
    const statement = this.sqlite.prepare(sql);
    const prepared = (values = []) => ({
      bind(...params) { return prepared(params); },
      async first() { return statement.get(...values) || null; },
      async all() { return {success: true, results: statement.all(...values)}; },
      async run() { return {success: true, meta: statement.run(...values)}; }
    });
    return prepared();
  }
}

function request(port, {path = '/', method = 'GET', headers = {}, body} = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({host: '127.0.0.1', port, path, method, headers}, incoming => {
      const chunks = [];
      incoming.on('data', chunk => chunks.push(chunk));
      incoming.on('end', () => resolve({status: incoming.statusCode, headers: incoming.headers,
        body: Buffer.concat(chunks).toString('utf8')}));
      incoming.on('error', reject);
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

test('magic-link PKCE callback hands separate cookies through the real Node HTTP bridge and authenticates the next request', async t => {
  const [{createNodeServer}, {createCloudflareWorker}, {default: application}] = await Promise.all([
    import('../runtime/node-http.mjs'), import('../worker/cloudflare-boundary.mjs'), import('../worker/index.mjs')
  ]);
  const db = new SqliteD1();
  t.after(() => db.sqlite.close());
  const env = {DB: db, SUPABASE_URL: `https://${PROJECT}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'a'.repeat(32),
    SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64')};
  const providerCalls = [];
  let challenge;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const address = new URL(url);
    assert.equal(address.origin, env.SUPABASE_URL);
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
    const payload = options.body === undefined ? undefined : JSON.parse(options.body);
    providerCalls.push(address.pathname);
    if (address.pathname === '/auth/v1/otp') {
      assert.equal(options.method, 'POST');
      assert.equal(address.searchParams.get('redirect_to'), PUBLIC_ORIGIN + '/');
      assert.equal(payload.email, EMAIL);
      assert.equal(payload.code_challenge_method, 's256');
      assert.match(payload.code_challenge, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(payload.code_verifier, undefined);
      challenge = payload.code_challenge;
      return Response.json({});
    }
    if (address.pathname === '/auth/v1/token') {
      assert.equal(options.method, 'POST');
      assert.equal(address.searchParams.get('grant_type'), 'pkce');
      assert.equal(payload.auth_code, AUTH_CODE);
      assert.match(payload.code_verifier, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(createHash('sha256').update(payload.code_verifier).digest('base64url'), challenge);
      return Response.json({access_token: ACCESS_TOKEN, refresh_token: 'synthetic-provider-refresh-token', expires_in: 3600});
    }
    assert.equal(address.pathname, '/auth/v1/user');
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, `Bearer ${ACCESS_TOKEN}`);
    return Response.json({id: USER_ID, email: EMAIL, email_confirmed_at: '2026-10-15T00:00:00.000Z'});
  });
  const warnings = [];
  t.mock.method(console, 'warn', (...values) => warnings.push(values));

  // Local HTTP models Render's connection to Node after HTTPS terminates at the
  // trusted public origin; cookie handling is inspected on the actual wire.
  const server = createNodeServer({worker: createCloudflareWorker(application), env, publicOrigin: PUBLIC_ORIGIN});
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;

  const begun = await request(port, {path: '/api/auth/otp', method: 'POST',
    headers: {Origin: PUBLIC_ORIGIN, 'Content-Type': 'application/json'}, body: JSON.stringify({email: EMAIL})});
  assert.equal(begun.status, 200);
  assert.deepEqual(JSON.parse(begun.body), {sent: true, retryAfterSeconds: 60, method: 'magic-link'});
  assert.equal(begun.headers['set-cookie'].length, 1);
  const loginHeader = begun.headers['set-cookie'][0];
  assert.match(loginHeader, /^__Host-xunci-login=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=900$/);
  const loginCookie = loginHeader.split(';')[0];

  const callback = await request(port, {path: '/?code=' + AUTH_CODE, headers: {Cookie: loginCookie}});
  assert.equal(callback.status, 303);
  assert.equal(callback.headers.location, '/?email-login=success#settings');
  assert.equal(callback.headers['cache-control'], 'private, no-store');
  assert.equal(callback.headers['referrer-policy'], 'no-referrer');
  assert.equal(callback.body, '');
  const cookies = callback.headers['set-cookie'];
  assert.ok(Array.isArray(cookies));
  assert.equal(cookies.length, 2);
  assert.ok(cookies.some(value => /^__Host-xunci-login=; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=0$/.test(value)));
  const sessionHeader = cookies.find(value => value.startsWith('__Host-xunci-session='));
  assert.match(sessionHeader, /^__Host-xunci-session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
  const sessionCookie = sessionHeader.split(';')[0];

  const session = await request(port, {path: '/api/auth/session', headers: {Cookie: sessionCookie}});
  assert.equal(session.status, 200);
  const state = JSON.parse(session.body);
  assert.equal(state.authenticated, true);
  assert.deepEqual(state.user, {id: `email:supabase:${PROJECT}:${USER_ID}`, email: EMAIL});
  assert.equal(session.headers['set-cookie'], undefined);
  assert.deepEqual(providerCalls, ['/auth/v1/otp', '/auth/v1/token', '/auth/v1/user', '/auth/v1/user']);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM auth_pending_logins').get().count, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 1);

  const replay = await request(port, {path: '/?code=' + AUTH_CODE, headers: {Cookie: loginCookie}});
  assert.equal(replay.status, 303);
  assert.equal(replay.headers.location, '/?email-login=expired&email-login-reason=pending_unavailable#settings');
  assert.equal(replay.headers['set-cookie'].length, 1);
  assert.ok(replay.headers['set-cookie'][0].startsWith('__Host-xunci-login=;'));
  assert.equal(providerCalls.filter(value => value === '/auth/v1/token').length, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM auth_sessions').get().count, 1);
  assert.equal(warnings.length, 1);
  assert.deepEqual(JSON.parse(warnings[0][0]), {event: 'email_magic_callback', outcome: 'failed', reason: 'pending_unavailable'});
  for (const value of [AUTH_CODE, ACCESS_TOKEN, EMAIL, loginCookie, sessionCookie, challenge]) {
    assert.equal(JSON.stringify(warnings).includes(value), false);
  }
});
