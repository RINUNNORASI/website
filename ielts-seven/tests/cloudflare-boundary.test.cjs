const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
globalThis.IELTS_ENGINE = require('../dist/engine.js');
globalThis.IELTS_SYNC = require('../dist/sync-state.js');
const modules = Promise.all([import('../worker/cloudflare-boundary.mjs'), import('../worker/index.mjs')]);
const ORIGIN = 'https://xunci.example.workers.dev';
const PROJECT = 'abcdefghijklmnopqrst';
const ALICE = '11111111-1111-4111-8111-111111111111';
const forged = {'OAI-Authenticated-User-Id': 'victim-native-id', 'oAi-Authenticated-User-Email': 'editor@example.com'};
function environment(overrides = {}) {
  return {EMAIL_AUTH_ENABLED: '0', EMAIL_AUTH_METHOD: 'otp', SUPABASE_URL: 'https://' + PROJECT + '.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'a'.repeat(32), SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    EDITOR_EMAIL: 'editor@example.com', ...overrides};
}
function request(endpoint, method = 'GET', payload, headers = {}) {
  return new Request(ORIGIN + endpoint, {method, headers: {...forged, ...headers,
    ...(payload === undefined ? {} : {'Content-Type': 'application/json', Origin: ORIGIN})},
    ...(payload === undefined ? {} : {body: JSON.stringify(payload)})});
}
async function worker() {
  const [{createCloudflareWorker}, app] = await modules;
  return createCloudflareWorker(app.default);
}

test('standalone routing blocks MCP discovery and keeps old sign-in links on the email settings page', async () => {
  const app = await worker();
  for (const endpoint of ['/mcp', '/mcp/', '/mcp/tools/call']) {
    const result = await app.fetch(request(endpoint, 'POST', {jsonrpc: '2.0', id: 1, method: 'server/discover'}), {});
    assert.equal(result.status, 404);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
  }
  const result = await app.fetch(request('/signin-with-chatgpt?return_to=https%3A%2F%2Fevil.example'), {});
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('Location'), '/#settings');
});

test('standalone boundary preserves request content and bindings without accepting gateway identities', async () => {
  const [{createCloudflareWorker}] = await modules;
  const binding = {};
  const env = Object.freeze(environment({DB: binding}));
  const context = {};
  const incoming = request('/api/learning-state?test=one', 'PUT', {answer: 'actual response'},
    {Cookie: '__Host-xunci-session=' + 'a'.repeat(43), 'OAI-Extra-Claim': 'forged', 'X-Custom': 'keep'});
  const app = createCloudflareWorker({async fetch(forwarded, secured, forwardedContext) {
    assert.equal(forwarded.url, incoming.url);
    assert.equal(forwarded.method, 'PUT');
    assert.equal(forwarded.headers.get('Origin'), ORIGIN);
    assert.equal(forwarded.headers.get('Cookie'), incoming.headers.get('Cookie'));
    assert.equal(forwarded.headers.get('X-Custom'), 'keep');
    assert.equal([...forwarded.headers.keys()].some(name => name.startsWith('oai-')), false);
    assert.deepEqual(await forwarded.json(), {answer: 'actual response'});
    assert.equal(secured.DB, binding);
    assert.equal(secured.EMAIL_AUTH_ENABLED, '1');
    assert.equal(secured.EMAIL_AUTH_METHOD, 'magic-link');
    assert.equal(forwardedContext, context);
    return new Response('forwarded');
  }});
  assert.equal(await (await app.fetch(incoming, env, context)).text(), 'forwarded');
  assert.deepEqual(await incoming.json(), {answer: 'actual response'});
  assert.equal(incoming.headers.get('oai-authenticated-user-id'), 'victim-native-id');
  assert.equal(env.EMAIL_AUTH_ENABLED, '0');
  assert.equal(env.EMAIL_AUTH_METHOD, 'otp');
});

test('forged gateway headers cannot read progress or publish cards and lessons on standalone Workers', async () => {
  const app = await worker();
  let queries = 0;
  const env = environment({DB: {prepare() { queries++; throw new Error('Unexpected database access'); }}});
  const progress = await app.fetch(request('/api/learning-state'), env);
  assert.equal(progress.status, 401);
  assert.equal((await progress.json()).error, 'authentication_required');
  for (const endpoint of ['/api/word-cards', '/api/lessons']) {
    const result = await app.fetch(request(endpoint, 'POST', {}, {'X-Xunci-Lesson-Writer': '1'}), env);
    assert.equal(result.status, 401);
    assert.equal((await result.json()).error, 'authentication_required');
  }
  assert.equal(queries, 0);
  const config = await app.fetch(request('/api/auth/config'), env);
  assert.equal(config.status, 200);
  assert.deepEqual(await config.json(), {enabled: true, authMode: 'email', loginMethod: 'magic-link', signInPath: '/#settings'});
});

test('missing standalone authentication configuration fails closed instead of using a forged native account', async () => {
  const app = await worker();
  for (const endpoint of ['/api/learning-state', '/api/auth/config', '/api/auth/session']) {
    const result = await app.fetch(request(endpoint), {EMAIL_AUTH_ENABLED: '0'});
    assert.equal(result.status, 503);
    assert.equal((await result.json()).error, 'email_auth_misconfigured');
  }
});

class FakeD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    const dir = path.join(__dirname, '../drizzle');
    for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) {
      this.sqlite.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
    }
  }
  prepare(sql) {
    const statement = this.sqlite.prepare(sql); let values = [];
    return {bind(...params) { values = params; return this; },
      async first() { return statement.get(...values) || null; },
      async run() { return {success: true, meta: statement.run(...values)}; }};
  }
}

test('email PKCE flow stays on the standalone origin and an authenticated email user cannot forge legacy ownership', async t => {
  const app = await worker();
  const db = new FakeD1(); t.after(() => db.sqlite.close());
  const env = environment({DB: db});
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const address = new URL(url); const body = options.body && JSON.parse(options.body);
    calls.push(address.pathname);
    assert.equal(address.origin, 'https://' + PROJECT + '.supabase.co');
    if (address.pathname === '/auth/v1/otp') {
      assert.equal(address.searchParams.get('redirect_to'), ORIGIN + '/');
      assert.equal(body.code_challenge_method, 's256');
      return Response.json({});
    }
    if (address.pathname === '/auth/v1/token') {
      assert.equal(address.searchParams.get('grant_type'), 'pkce');
      assert.equal(body.auth_code, 'standalone-authorization-code');
      assert.match(body.code_verifier, /^[A-Za-z0-9_-]{43}$/);
      return Response.json({access_token: 'verified-alice-token', refresh_token: 'alice-refresh-token', expires_in: 3600});
    }
    assert.equal(address.pathname, '/auth/v1/user');
    assert.equal(options.headers.Authorization, 'Bearer verified-alice-token');
    return Response.json({id: ALICE, email: 'alice@example.com', email_confirmed_at: '2026-10-15T00:00:00.000Z'});
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  const sent = await app.fetch(request('/api/auth/otp', 'POST', {email: 'alice@example.com'}), env);
  assert.equal(sent.status, 200);
  const loginCookie = sent.headers.get('Set-Cookie').split(';')[0];
  const signedIn = await app.fetch(request('/?code=standalone-authorization-code', 'GET', undefined, {Cookie: loginCookie}), env);
  assert.equal(signedIn.status, 303);
  assert.equal(signedIn.headers.get('Location'), '/?email-login=success#settings');
  const sessionHeader = signedIn.headers.getSetCookie().find(value => value.startsWith('__Host-xunci-session='));
  assert.ok(sessionHeader);
  assert.match(sessionHeader, /; HttpOnly; Secure; SameSite=Lax;/);
  const sessionCookie = sessionHeader.split(';')[0];
  const subject = 'supabase:' + PROJECT + ':' + ALICE;
  const nativeState = {records: globalThis.IELTS_ENGINE.seed([{word: 'resilience', level: 'A', firstSeen: '2026-10-14'}]),
    lastExcel: '2026-10-11', readingState: {assignments: {}, results: {}, completed: {}, excluded: []}, customLessons: []};
  db.sqlite.prepare('INSERT INTO learning_state VALUES (?, 1, ?, ?)')
    .run('victim-native-id', JSON.stringify(nativeState), new Date().toISOString());
  const progress = await app.fetch(request('/api/learning-state', 'GET', undefined, {Cookie: sessionCookie}), env);
  assert.equal(progress.status, 200);
  const snapshot = await progress.json();
  assert.equal(snapshot.user.id, 'email:' + subject);
  assert.equal(snapshot.state, null);
  const linked = await app.fetch(request('/api/auth/link-legacy', 'POST', {confirm: true}, {Cookie: sessionCookie}), env);
  assert.equal(linked.status, 401);
  assert.equal((await linked.json()).error, 'legacy_authentication_required');
  assert.equal(db.sqlite.prepare('SELECT user_id FROM auth_accounts WHERE provider_subject = ?').get(subject).user_id, 'email:' + subject);
  assert.deepEqual(calls.slice(0, 3), ['/auth/v1/otp', '/auth/v1/token', '/auth/v1/user']);
});
