const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const E = require('../dist/engine.js');
const S = require('../dist/sync-state.js');
const handler = import('../worker/index.mjs').then(module => module.default);
globalThis.IELTS_ENGINE = E; globalThis.IELTS_SYNC = S;
const ORIGIN = 'https://learner.chatgpt.site';
const PROJECT = 'abcdefghijklmnopqrst';
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
class FakeD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    const dir = path.join(__dirname, '../drizzle');
    for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) this.sqlite.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
  prepare(sql) {
    const db = this; const statement = this.sqlite.prepare(sql); let params = [];
    return {bind(...values) { params = values; return this; },
      async first() { if (db.beforeStatement) await db.beforeStatement(sql, params); return statement.get(...params) || null; },
      async all() { return {results: statement.all(...params), success: true}; },
      async run() { return {success: true, meta: statement.run(...params)}; }};
  }
  close() { this.sqlite.close(); }
}
function environment(db, overrides = {}) {
  return {DB: db, EMAIL_AUTH_ENABLED: '1', SUPABASE_URL: 'https://' + PROJECT + '.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'a'.repeat(32), SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    EDITOR_EMAIL: 'editor@example.com', ...overrides};
}
function request(endpoint, method = 'GET', data, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.cookie) headers.set('Cookie', options.cookie);
  if (options.legacy) { headers.set('oai-authenticated-user-id', options.legacy); headers.set('oai-authenticated-user-email', 'old-gpt@example.com'); }
  if (method !== 'GET') { if (!headers.has('Origin')) headers.set('Origin', ORIGIN); if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json'); }
  return new Request(ORIGIN + (endpoint.startsWith('/') ? endpoint : '/api/auth/' + endpoint), {method, headers,
    ...(data === undefined ? {} : {body: typeof data === 'string' ? data : JSON.stringify(data)})});
}
async function run(env, endpoint, method = 'GET', data, options) { return (await handler).fetch(request(endpoint, method, data, options), env); }
function provider(t, override) {
  const previous = globalThis.fetch; const calls = []; const users = new Map();
  globalThis.fetch = async (url, options = {}) => {
    assert.ok(url.startsWith('https://' + PROJECT + '.supabase.co/auth/v1/'));
    assert.equal(options.headers.apikey, 'sb_publishable_' + 'a'.repeat(32));
    assert.equal(options.redirect, 'manual'); assert.ok(options.signal);
    const endpoint = new URL(url).pathname.slice('/auth/v1'.length) + new URL(url).search;
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({endpoint, method: options.method, body, headers: options.headers});
    if (override) { const result = await override(endpoint, body, options); if (result) return result; }
    if (endpoint === '/otp' || endpoint.startsWith('/otp?')) return Response.json({});
    if (endpoint === '/verify') {
      if (body.token !== '123456') return Response.json({message: 'provider sensitive error'}, {status: 422});
      const access = 'access-' + body.email;
      users.set(access, {id: body.email.startsWith('bob') ? BOB : ALICE, email: body.email, email_confirmed_at: '2026-10-15T00:00:00.000Z'});
      return Response.json({access_token: access, refresh_token: 'refresh-' + body.email, expires_in: 3600});
    }
    if (endpoint === '/token?grant_type=refresh_token') {
      const email = body.refresh_token.slice('refresh-'.length); const access = 'renewed-' + email;
      users.set(access, {id: email.startsWith('bob') ? BOB : ALICE, email, email_confirmed_at: '2026-10-15T00:00:00.000Z'});
      return Response.json({access_token: access, refresh_token: 'refresh-' + email, expires_in: 3600});
    }
    if (endpoint === '/user') { const user = users.get(options.headers.Authorization?.slice(7)); return Response.json(user || {}, {status: user ? 200 : 401}); }
    if (endpoint === '/logout?scope=local') return new Response(null, {status: 204});
    throw new Error('Unexpected provider request: ' + endpoint);
  };
  t.after(() => { globalThis.fetch = previous; });
  return {calls, users};
}
async function login(env, email = 'alice@example.com', options) {
  const result = await run(env, 'verify', 'POST', {email, token: '123456'}, options);
  assert.equal(result.status, 200);
  return {cookie: result.headers.get('Set-Cookie').split(';')[0], body: await result.json(), response: result};
}
function learningState(name = 'resilience') {
  return S.validateState({records: E.seed([{word: name, level: 'A', firstSeen: '2026-10-14', meaning: '恢复力', ipa: '/rɪˈzɪliəns/', pos: 'n.'}]),
    lastExcel: '2026-10-11', readingState: {assignments: {}, results: {}, completed: {}, excluded: []}, customLessons: []});
}
function seedState(db, user, value = learningState()) {
  db.sqlite.prepare('INSERT INTO learning_state VALUES (?, 1, ?, ?)').run(user, JSON.stringify(value), '2026-10-15T00:00:00.000Z');
}

test('disabled email auth retains native login; enabled misconfiguration fails closed without GPT fallback', async t => {
  const db = new FakeD1(); t.after(() => db.close());
  const env = environment(db);
  for (const disabled of [{DB: db}, {...env, EMAIL_AUTH_ENABLED: '0', SUPABASE_URL: undefined}]) {
    const config = await run(disabled, 'config');
    assert.deepEqual(await config.json(), {enabled: false, authMode: 'chatgpt', loginMethod: 'otp', signInPath: '/signin-with-chatgpt?return_to=%2F'});
    const native = await run(disabled, '/api/learning-state', 'GET', undefined, {legacy: 'old-account'});
    assert.equal(native.status, 200); assert.equal((await native.json()).user.id, 'old-account');
  }
  for (const overrides of [{SUPABASE_URL: undefined}, {SUPABASE_URL: 'https://evil.example'},
    {SUPABASE_URL: 'https://' + PROJECT + '.supabase.co/other'}, {SUPABASE_URL: 'https://user:secret@' + PROJECT + '.supabase.co'},
    {SUPABASE_PUBLISHABLE_KEY: 'sb_secret_' + 'x'.repeat(32)}, {SESSION_ENCRYPTION_KEY: Buffer.alloc(31).toString('base64')}]) {
    for (const endpoint of ['config', 'session', '/api/learning-state']) {
      const failed = await run({...env, ...overrides}, endpoint, 'GET', undefined, {legacy: 'old-account'});
      assert.equal(failed.status, 503); assert.deepEqual(await failed.json(), {error: 'email_auth_misconfigured'});
    }
  }
  const configured = await run(env, 'config'); const config = await configured.json();
  assert.deepEqual(config, {enabled: true, authMode: 'email', loginMethod: 'otp', signInPath: '/#settings'});
  assert.equal(configured.headers.get('Cache-Control'), 'private, no-store');
});

test('every email write requires exact Origin, JSON, and bounded valid payloads before provider work', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db); const stub = provider(t);
  for (const endpoint of ['otp', 'verify', 'logout', 'link-legacy', 'skip-legacy']) {
    const wrongOrigin = await run(env, endpoint, 'POST', {}, {headers: {Origin: 'https://attacker.example'}});
    assert.equal(wrongOrigin.status, 403);
    const missingOrigin = request(endpoint, 'POST', {}); missingOrigin.headers.delete('Origin');
    assert.equal((await (await handler).fetch(missingOrigin, env)).status, 403);
    assert.equal((await run(env, endpoint, 'POST', {}, {headers: {'Content-Type': 'text/plain'}})).status, 415);
  }
  for (const invalid of ['a@localhost', 'a..b@example.com', 'a\n@example.com', 'a@-bad.example', 'x'.repeat(65) + '@example.com']) {
    assert.equal((await run(env, 'otp', 'POST', {email: invalid})).status, 400);
  }
  assert.equal((await run(env, 'otp', 'POST', {email: 'valid@example.com', access_token: 'injected'})).status, 400);
  assert.equal((await run(env, 'otp', 'POST', '{')).status, 400);
  assert.equal((await run(env, 'otp', 'POST', 'x'.repeat(4097))).status, 413);
  assert.equal((await run(env, 'verify', 'POST', {email: 'valid@example.com', token: '12'})).status, 400);
  assert.equal(stub.calls.length, 0);
});

test('OTP normalizes email, reserves server cooldown before provider, and limits attempts durably', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db); const stub = provider(t);
  const first = await run(env, 'otp', 'POST', {email: '  Alice@Example.com  '});
  assert.equal(first.status, 200); assert.deepEqual(await first.json(), {sent: true, retryAfterSeconds: 60});
  assert.deepEqual(stub.calls[0].body, {email: 'alice@example.com', create_user: true});
  const repeat = await run(env, 'otp', 'POST', {email: 'alice@example.com'});
  assert.equal(repeat.status, 429); assert.ok((await repeat.json()).retryAfterSeconds > 0); assert.equal(stub.calls.length, 1);
  const counters = db.sqlite.prepare('SELECT rate_key FROM auth_rate_limits').all();
  assert.ok(counters.every(row => /^[a-f0-9]{64}$/.test(row.rate_key)));
  for (let i = 0; i < 8; i++) assert.equal((await run(env, 'verify', 'POST', {email: 'alice@example.com', token: '000000'})).status, 400);
  const blocked = await run(env, 'verify', 'POST', {email: 'alice@example.com', token: '123456'});
  assert.equal(blocked.status, 429); assert.equal(stub.calls.filter(call => call.endpoint === '/verify').length, 8);
});

test('failed email delivery still consumes cooldown and never leaks provider messages', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db);
  const stub = provider(t, endpoint => endpoint === '/otp' ? Response.json({message: 'private provider key details'}, {status: 500}) : null);
  const failed = await run(env, 'otp', 'POST', {email: 'alice@example.com'});
  assert.equal(failed.status, 503); assert.equal(await failed.text(), '{"error":"email_delivery_unavailable"}');
  assert.equal((await run(env, 'otp', 'POST', {email: 'alice@example.com'})).status, 429); assert.equal(stub.calls.length, 1);
});

test('provider redirects fail closed before consuming their body or forwarding credentials', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db);
  let bodyReads = 0;
  const stub = provider(t, () => ({status: 302, ok: false,
    async json() { bodyReads++; throw new Error('redirect body must not be read'); }}));
  const failed = await run(env, 'otp', 'POST', {email: 'alice@example.com'});
  assert.equal(failed.status, 503); assert.deepEqual(await failed.json(), {error: 'auth_provider_unavailable'});
  assert.equal(stub.calls.length, 1); assert.equal(bodyReads, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 0);
});

test('read-only provider health reports only transport status without mail or provider details', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db);
  let status = 200;
  const stub = provider(t, endpoint => {
    assert.equal(endpoint, '/settings');
    return Response.json({private_provider_details: 'never return this'}, {status});
  });
  await handler;
  assert.deepEqual(await globalThis.XUNCI_EMAIL_AUTH.connectionStatus(env), {status: 'reachable', httpStatus: 200});
  status = 401;
  assert.deepEqual(await globalThis.XUNCI_EMAIL_AUTH.connectionStatus(env), {status: 'unavailable', httpStatus: 401});
  status = 302;
  assert.deepEqual(await globalThis.XUNCI_EMAIL_AUTH.connectionStatus(env), {status: 'unavailable'});
  assert.ok(stub.calls.every(call => call.method === 'GET' && call.body === null && !call.headers.Authorization));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_rate_limits').get().n, 0);
});

test('verification validates trusted confirmed /user identity and only returns an opaque secure cookie', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db); const stub = provider(t);
  const wrong = await run(env, 'verify', 'POST', {email: 'alice@example.com', token: '000000'});
  assert.equal(wrong.status, 400); assert.equal(await wrong.text(), '{"error":"invalid_or_expired_otp"}');
  assert.equal(wrong.headers.get('Set-Cookie'), null);
  const signed = await login(env); const cookie = signed.response.headers.get('Set-Cookie');
  assert.match(cookie, /^__Host-xunci-session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000$/);
  assert.equal(signed.body.user.id, 'email:supabase:' + PROJECT + ':' + ALICE);
  assert.ok(stub.calls.some(call => call.endpoint === '/user'));
  const row = db.sqlite.prepare('SELECT * FROM auth_sessions').get();
  assert.match(row.session_hash, /^[a-f0-9]{64}$/); assert.ok(!row.tokens_ciphertext.includes('access-'));
  assert.ok(!row.tokens_ciphertext.includes('refresh-')); assert.ok(!JSON.stringify(signed.body).includes('token'));
  assert.ok(!JSON.stringify(signed.body).includes(env.SUPABASE_PUBLISHABLE_KEY));
  const read = await run(env, 'session', 'GET', undefined, {cookie: signed.cookie});
  assert.deepEqual(await read.json(), signed.body);
  assert.equal((await run(env, '/api/learning-state', 'GET', undefined, {legacy: 'old-account'})).status, 401);
});

test('unconfirmed users and provider-substituted emails cannot establish accounts', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db);
  let mode = 'unconfirmed'; provider(t, endpoint => endpoint === '/user' ? Response.json({id: ALICE,
    email: mode === 'unconfirmed' ? 'alice@example.com' : 'different@example.com',
    email_confirmed_at: mode === 'unconfirmed' ? null : '2026-10-15T00:00:00Z'}) : null);
  assert.equal((await run(env, 'verify', 'POST', {email: 'alice@example.com', token: '123456'})).status, 401);
  mode = 'different'; assert.equal((await run(env, 'verify', 'POST', {email: 'alice@example.com', token: '123456'})).status, 401);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_accounts').get().n, 0);
});

test('cookie expiry, duplicates and encrypted-token tampering fail closed without native fallback', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db); provider(t);
  const signed = await login(env);
  const duplicate = await run(env, 'session', 'GET', undefined, {cookie: signed.cookie + '; ' + signed.cookie});
  assert.equal((await duplicate.json()).authenticated, false);
  db.sqlite.prepare('UPDATE auth_sessions SET tokens_ciphertext = ?').run(Buffer.alloc(40).toString('base64'));
  assert.equal((await run(env, '/api/learning-state', 'GET', undefined, {cookie: signed.cookie, legacy: 'old-account'})).status, 401);
  db.sqlite.prepare('UPDATE auth_sessions SET expires_at = ?').run(Date.now() - 1);
  const expired = await run(env, 'session', 'GET', undefined, {cookie: signed.cookie});
  assert.equal((await expired.json()).authenticated, false); assert.match(expired.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 0);
});

test('independent verified email accounts have isolated learning records and account-bound save tags', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db); provider(t);
  const alice = await login(env); const bob = await login(env, 'bob@example.com');
  const aliceState = await run(env, '/api/learning-state', 'GET', undefined, {cookie: alice.cookie});
  const bobState = await run(env, '/api/learning-state', 'GET', undefined, {cookie: bob.cookie});
  const aliceTag = aliceState.headers.get('ETag'); const bobTag = bobState.headers.get('ETag'); assert.notEqual(aliceTag, bobTag);
  assert.equal((await run(env, '/api/learning-state', 'PUT', {version: 1, baseRevision: 0, state: learningState()},
    {cookie: alice.cookie, headers: {'If-Match': aliceTag}})).status, 200);
  assert.equal((await run(env, '/api/learning-state', 'PUT', {version: 1, baseRevision: 0, state: learningState()},
    {cookie: bob.cookie, headers: {'If-Match': aliceTag}})).status, 412);
  const bobEmpty = await run(env, '/api/learning-state', 'GET', undefined, {cookie: bob.cookie}); assert.equal((await bobEmpty.json()).state, null);
});

test('expired provider tokens refresh encrypted credentials using CAS without exposing refreshed tokens', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db); const stub = provider(t);
  const signed = await login(env); const before = db.sqlite.prepare('SELECT * FROM auth_sessions').get();
  db.sqlite.prepare('UPDATE auth_sessions SET provider_expires_at = 0').run();
  const session = await run(env, 'session', 'GET', undefined, {cookie: signed.cookie});
  assert.equal(session.status, 200); assert.equal((await session.json()).authenticated, true);
  assert.equal(stub.calls.filter(call => call.endpoint.startsWith('/token')).length, 1);
  const after = db.sqlite.prepare('SELECT * FROM auth_sessions').get();
  assert.equal(after.version, before.version + 2); assert.equal(after.refresh_lock_until, 0); assert.notEqual(after.tokens_ciphertext, before.tokens_ciphertext);
});

test('logout revokes local cookie even during provider outage and prevents refresh resurrection', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db);
  let release; let refreshStarted; const started = new Promise(resolve => {refreshStarted = resolve;});
  provider(t, async endpoint => {
    if (endpoint.startsWith('/token')) { refreshStarted(); await new Promise(resolve => {release = resolve;}); return null; }
    if (endpoint.startsWith('/logout')) throw new Error('provider unavailable');
    return null;
  });
  const signed = await login(env); db.sqlite.prepare('UPDATE auth_sessions SET provider_expires_at = 0').run();
  const refreshing = run(env, '/api/learning-state', 'GET', undefined, {cookie: signed.cookie}); await started;
  const loggedOut = await run(env, 'logout', 'POST', {}, {cookie: signed.cookie});
  assert.equal(loggedOut.status, 200); assert.equal((await loggedOut.json()).authenticated, false);
  assert.match(loggedOut.headers.get('Set-Cookie'), /Max-Age=0/); release();
  assert.equal((await refreshing).status, 401); assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 0);
  assert.equal((await run(env, '/api/learning-state', 'GET', undefined, {cookie: signed.cookie})).status, 401);
});

test('legacy linking requires both verified session and native identity plus explicit confirmation; snapshots remain', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db); provider(t);
  seedState(db, 'old-account'); const signed = await login(env, 'alice@example.com', {legacy: 'old-account'});
  assert.equal(signed.body.migration.pending, true); assert.equal(signed.body.migration.legacyRecordCount, 1);
  assert.equal((await run(env, 'link-legacy', 'POST', {confirm: true}, {legacy: 'old-account'})).status, 401);
  assert.equal((await run(env, 'link-legacy', 'POST', {confirm: true}, {cookie: signed.cookie})).status, 401);
  assert.equal((await run(env, 'link-legacy', 'POST', {}, {cookie: signed.cookie, legacy: 'old-account'})).status, 400);
  const backups = await run(env, 'migration-backups', 'GET', undefined, {cookie: signed.cookie, legacy: 'old-account'});
  const saved = await backups.json(); assert.equal(saved.legacy.state.records[0].word, 'resilience'); assert.equal(saved.email.state, null);
  const linked = await run(env, 'link-legacy', 'POST', {confirm: true}, {cookie: signed.cookie, legacy: 'old-account'});
  assert.equal(linked.status, 200); const result = await linked.json(); assert.equal(result.user.id, 'old-account'); assert.equal(result.migration.pending, false);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM learning_state WHERE user_id = ?').get('old-account').n, 1);
  const cloud = await run(env, '/api/learning-state', 'GET', undefined, {cookie: signed.cookie}); assert.equal((await cloud.json()).state.records[0].word, 'resilience');
});

test('existing email snapshots or another linked account block legacy linking without merging or deleting data', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db); provider(t);
  seedState(db, 'old-account'); const alice = await login(env); seedState(db, alice.body.user.id, learningState('manage'));
  const conflict = await run(env, 'link-legacy', 'POST', {confirm: true}, {cookie: alice.cookie, legacy: 'old-account'});
  assert.equal(conflict.status, 409); assert.equal((await conflict.json()).migration.emailRecordCount, 1);
  const backup = await (await run(env, 'migration-backups', 'GET', undefined, {cookie: alice.cookie, legacy: 'old-account'})).json();
  assert.equal(backup.legacy.state.records[0].word, 'resilience'); assert.equal(backup.email.state.records[0].word, 'manage');
  const bob = await login(env, 'bob@example.com'); assert.equal((await run(env, 'link-legacy', 'POST', {confirm: true}, {cookie: bob.cookie, legacy: 'old-account'})).status, 200);
  db.sqlite.prepare('DELETE FROM learning_state WHERE user_id = ?').run(alice.body.user.id);
  assert.equal((await run(env, 'link-legacy', 'POST', {confirm: true}, {cookie: alice.cookie, legacy: 'old-account'})).status, 409);
});

test('skip-legacy records an explicit independent account decision and blocks later silent linking', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db); provider(t);
  seedState(db, 'old-account'); const signed = await login(env, 'alice@example.com', {legacy: 'old-account'});
  const skipped = await run(env, 'skip-legacy', 'POST', {}, {cookie: signed.cookie, legacy: 'old-account'});
  assert.equal(skipped.status, 200); assert.equal((await skipped.json()).migration.pending, false);
  assert.equal((await run(env, 'link-legacy', 'POST', {confirm: true}, {cookie: signed.cookie, legacy: 'old-account'})).status, 409);
  const cloud = await run(env, '/api/learning-state', 'GET', undefined, {cookie: signed.cookie}); assert.equal((await cloud.json()).state, null);
});

test('guarded learning insert cannot create a stale email snapshot when linking wins a concurrent first save', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db); provider(t);
  seedState(db, 'old-account'); const signed = await login(env);
  const initial = await run(env, '/api/learning-state', 'GET', undefined, {cookie: signed.cookie});
  let intercepted = false;
  db.beforeStatement = async sql => {
    if (!intercepted && sql.startsWith('INSERT INTO learning_state')) {
      intercepted = true;
      const linked = await run(env, 'link-legacy', 'POST', {confirm: true}, {cookie: signed.cookie, legacy: 'old-account'});
      assert.equal(linked.status, 200);
    }
  };
  const saved = await run(env, '/api/learning-state', 'PUT', {version: 1, baseRevision: 0, state: learningState('manage')},
    {cookie: signed.cookie, headers: {'If-Match': initial.headers.get('ETag')}});
  assert.equal(saved.status, 401);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM learning_state WHERE user_id = ?').get(signed.body.user.id).n, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM learning_state').get().n, 1);
});

test('parallel refresh uses one provider request; transient failure unlocks rather than dropping a valid local session', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db);
  let release; let startedResolve; const started = new Promise(resolve => {startedResolve = resolve;});
  let transient = false;
  const stub = provider(t, async endpoint => {
    if (endpoint.startsWith('/token')) {
      if (transient) return Response.json({message: 'temporary'}, {status: 500});
      startedResolve(); await new Promise(resolve => {release = resolve;}); return null;
    }
    return null;
  });
  const signed = await login(env); db.sqlite.prepare('UPDATE auth_sessions SET provider_expires_at = 0').run();
  const first = run(env, 'session', 'GET', undefined, {cookie: signed.cookie}); await started;
  const second = await run(env, 'session', 'GET', undefined, {cookie: signed.cookie});
  assert.equal(second.status, 503); assert.equal((await second.json()).error, 'session_refresh_in_progress');
  assert.equal(stub.calls.filter(call => call.endpoint.startsWith('/token')).length, 1);
  release(); assert.equal((await first).status, 200);
  transient = true; db.sqlite.prepare('UPDATE auth_sessions SET provider_expires_at = 0').run();
  const unavailable = await run(env, 'session', 'GET', undefined, {cookie: signed.cookie});
  assert.equal(unavailable.status, 503);
  const row = db.sqlite.prepare('SELECT * FROM auth_sessions').get(); assert.equal(row.refresh_lock_until, 0);
  assert.equal(unavailable.headers.get('Set-Cookie'), null);
});

test('refresh token rejection removes the old session and cannot fall back to a native account', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db);
  provider(t, endpoint => endpoint.startsWith('/token') ? Response.json({message: 'invalid refresh secret'}, {status: 400}) : null);
  const signed = await login(env); db.sqlite.prepare('UPDATE auth_sessions SET provider_expires_at = 0').run();
  const rejected = await run(env, '/api/learning-state', 'GET', undefined, {cookie: signed.cookie, legacy: 'old-account'});
  assert.equal(rejected.status, 401); assert.equal((await rejected.json()).error, 'session_invalid');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 0);
});

test('IP throttling precedes email counters, preventing new-address counter growth after an IP is blocked', async t => {
  provider(t);
  for (const [purpose, maximum] of [['otp', 20], ['verify', 30]]) {
    const db = new FakeD1(); t.after(() => db.close()); const env = environment(db);
    for (let index = 0; index < maximum; index++) {
      const payload = {email: 'address' + index + '@example.com', ...(purpose === 'verify' ? {token: '000000'} : {})};
      assert.equal((await run(env, purpose, 'POST', payload)).status, purpose === 'otp' ? 200 : 400);
    }
    const before = db.sqlite.prepare('SELECT COUNT(*) n FROM auth_rate_limits').get().n;
    for (let index = 0; index < 3; index++) {
      const blocked = await run(env, purpose, 'POST', {email: 'brand-new' + index + '@example.com', ...(purpose === 'verify' ? {token: '000000'} : {})});
      assert.equal(blocked.status, 429);
    }
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_rate_limits').get().n, before);
  }
});

test('refresh lock covers both provider timeouts; a newer CAS winner leaves the browser cookie intact', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db);
  const stub = provider(t); const signed = await login(env);
  db.sqlite.prepare('UPDATE auth_sessions SET provider_expires_at = 0').run();
  let intercepted = false;
  db.beforeStatement = async sql => {
    if (!intercepted && sql.startsWith('UPDATE auth_sessions SET tokens_ciphertext')) {
      intercepted = true;
      const locked = db.sqlite.prepare('SELECT refresh_lock_until FROM auth_sessions').get();
      assert.ok(locked.refresh_lock_until > Date.now() + 25000);
      db.sqlite.prepare('UPDATE auth_sessions SET version = version + 1, refresh_lock_until = 0').run();
    }
  };
  const loser = await run(env, 'session', 'GET', undefined, {cookie: signed.cookie});
  assert.equal(loser.status, 503); assert.equal((await loser.json()).error, 'session_refresh_in_progress');
  assert.equal(loser.headers.get('Set-Cookie'), null); assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 1);
  assert.equal(stub.calls.filter(call => call.endpoint.startsWith('/token')).length, 1);
});

function magicProvider(t, options = {}) {
  let challenge; let address; const exchanges = [];
  const stub = provider(t, async (endpoint, body) => {
    if (endpoint.startsWith('/otp?')) {
      challenge = body.code_challenge; address = body.email;
      if (options.deliveryFailure) return Response.json({message: 'private mail failure'}, {status: 500});
      return Response.json({});
    }
    if (endpoint === '/token?grant_type=pkce') {
      exchanges.push(body);
      const expected = require('node:crypto').createHash('sha256').update(body.code_verifier).digest('base64url');
      if (options.exchangeFailure || body.auth_code !== 'magic-auth-code-abcdef0123456789' || expected !== challenge) {
        return Response.json({message: 'private invalid PKCE data'}, {status: 400});
      }
      const authenticatedEmail = options.wrongEmail ? 'wrong@example.com' : address;
      const access = 'magic-access-' + authenticatedEmail;
      stub.users.set(access, {id: ALICE, email: authenticatedEmail, email_confirmed_at: '2026-10-15T00:00:00.000Z'});
      return Response.json({access_token: access, refresh_token: 'refresh-' + authenticatedEmail, expires_in: 3600});
    }
    return null;
  });
  return {...stub, exchanges};
}
async function beginMagic(env, options = {}) {
  const result = await run(env, 'otp', 'POST', {email: '  Alice@Example.com  '}, options);
  assert.equal(result.status, 200);
  return {cookie: result.headers.get('Set-Cookie').split(';')[0], state: result.headers.get('Set-Cookie').split(';')[0].split('=')[1], result};
}
const MAGIC_CALLBACK = '/?code=magic-auth-code-abcdef0123456789';
function failedMagicLocation(reason) { return '/?email-login=expired&email-login-reason=' + reason + '#settings'; }
function callbackLogs(t) {
  const previous = console.warn; const entries = [];
  console.warn = (...args) => { entries.push(args); };
  t.after(() => { console.warn = previous; });
  return entries;
}

async function receiveMagic(env, begun, options = {}) {
  return run(env, 'magic-callback', 'POST', {code: 'magic-auth-code-abcdef0123456789', ...(options.legacy ? {} : {state: begun.state})},
    {...options, ...(options.legacy ? {cookie: begun.cookie} : {})});
}
async function confirmationForm(env, received, options = {}) {
  const cookie = received.headers.get('Set-Cookie').split(';')[0];
  const page = await run(env, 'magic-confirm', 'GET', undefined, {...options, cookie: [cookie, options.cookie].filter(Boolean).join('; ')});
  const source = await page.text();
  return {cookie: [cookie, options.cookie].filter(Boolean).join('; '), csrf: /name="csrf" value="([A-Za-z0-9_-]{43})"/.exec(source)?.[1], source, page};
}
async function decideMagic(env, form, decision = 'confirm', options = {}) {
  return run(env, 'magic-confirm', 'POST', new URLSearchParams({csrf: form.csrf || '', decision}).toString(),
    {cookie: form.cookie, ...options, headers: {'Content-Type': 'application/x-www-form-urlencoded', ...options.headers}});
}

test('magic links keep their PKCE verifier encrypted and correlate across browsers through a fragment without changing allowed root URLs', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'}); const stub = magicProvider(t);
  assert.equal((await (await run(env, 'config')).json()).loginMethod, 'magic-link');
  const begun = await beginMagic(env);
  assert.deepEqual(await begun.result.json(), {sent: true, retryAfterSeconds: 60, method: 'magic-link'});
  assert.match(begun.result.headers.get('Set-Cookie'), /^__Host-xunci-login=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=900$/);
  const call = stub.calls.find(call => call.endpoint.startsWith('/otp?'));
  const redirect = new URL(new URL('https://provider.example' + call.endpoint).searchParams.get('redirect_to'));
  assert.equal(redirect.origin + redirect.pathname, ORIGIN + '/'); assert.equal(redirect.search, '');
  assert.equal(redirect.hash, '#email-login-state=' + begun.state);
  assert.equal(call.body.code_challenge_method, 's256'); assert.match(call.body.code_challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(call.body.email, 'alice@example.com'); assert.equal(call.body.code_verifier, undefined);
  const pending = db.sqlite.prepare('SELECT * FROM auth_pending_logins').get();
  assert.match(pending.login_hash, /^[a-f0-9]{64}$/); assert.equal(pending.expected_email, 'alice@example.com'); assert.equal(pending.claimed_at, 0);
  assert.ok(!pending.verifier_ciphertext.includes(call.body.code_challenge));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 0);
  assert.equal((await run(env, 'verify', 'POST', {email: 'alice@example.com', token: '123456'})).status, 405);
});

test('callback bootstrap scrubs code and fragment before fetch, uses nonce CSP, and never creates a session on GET', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'}); const stub = magicProvider(t);
  const begun = await beginMagic(env); const page = await run(env, MAGIC_CALLBACK); const source = await page.text();
  assert.equal(page.status, 200); assert.equal(page.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(page.headers.get('Cache-Control'), 'private, no-store'); assert.equal(page.headers.get('X-Frame-Options'), 'DENY');
  assert.match(page.headers.get('Content-Security-Policy'), /default-src 'none';.*frame-ancestors 'none'.*script-src 'nonce-[A-Za-z0-9_-]{43}'/);
  const nonce = /<script nonce="([A-Za-z0-9_-]{43})">/.exec(source)[1];
  assert.ok(page.headers.get('Content-Security-Policy').includes("'nonce-" + nonce + "'"));
  assert.equal(source.includes('magic-auth-code-abcdef0123456789'), false); assert.equal(source.includes(begun.state), false);
  assert.equal(stub.exchanges.length, 0); assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 0);
  const script = /<script nonce="[^"]+">([\s\S]*)<\/script>/.exec(source)[1]; const events = [];
  await require('node:vm').runInNewContext(script, {URL, URLSearchParams,
    location: {href: ORIGIN + MAGIC_CALLBACK + '#email-login-state=' + begun.state, replace: url => events.push(['navigate', url])},
    history: {replaceState: (...args) => events.push(['scrub', args[2]])},
    fetch: async (url, options) => { events.push(['fetch', url, options]); return {ok: true, json: async () => ({ready: true})}; }});
  assert.deepEqual(events.map(event => event[0]), ['scrub', 'fetch', 'navigate']);
  assert.equal(events[0][1], '/?email-login=confirming#settings');
  assert.equal(events[1][1], '/api/auth/magic-callback');
  assert.deepEqual(JSON.parse(events[1][2].body), {code: 'magic-auth-code-abcdef0123456789', state: begun.state});
  assert.equal(events[2][1], '/api/auth/magic-confirm');
});

test('a different browser can exchange the email link but gets no account/session until its verified-email confirmation', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'}); const stub = magicProvider(t);
  const begun = await beginMagic(env); const received = await receiveMagic(env, begun);
  assert.equal(received.status, 200); assert.deepEqual(await received.json(), {ready: true});
  assert.match(received.headers.get('Set-Cookie'), /^__Host-xunci-confirm=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=300$/);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_accounts').get().n, 0);
  assert.equal((await (await run(env, 'session')).json()).authenticated, false);
  const form = await confirmationForm(env, received); assert.equal(form.page.status, 200); assert.ok(form.csrf);
  assert.ok(form.source.includes('alice@example.com')); assert.ok(form.source.includes('确认登录')); assert.ok(!form.source.includes('magic-access-'));
  const candidate = db.sqlite.prepare('SELECT * FROM auth_pending_logins WHERE claimed_at = 0').get();
  assert.ok(!candidate.verifier_ciphertext.includes('magic-access-')); assert.ok(!candidate.verifier_ciphertext.includes(form.csrf));
  const signed = await decideMagic(env, form); assert.equal(signed.status, 303); assert.equal(signed.headers.get('Location'), '/?email-login=success#settings');
  const cookies = signed.headers.getSetCookie(); assert.equal(cookies.length, 2);
  assert.ok(cookies.some(cookie => cookie.startsWith('__Host-xunci-confirm=;') && cookie.includes('Max-Age=0')));
  const sessionCookie = cookies.find(cookie => cookie.startsWith('__Host-xunci-session=')); assert.ok(sessionCookie.includes('HttpOnly; Secure; SameSite=Lax'));
  assert.equal((await (await run(env, 'session', 'GET', undefined, {cookie: sessionCookie.split(';')[0]})).json()).user.email, 'alice@example.com');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_pending_logins').get().n, 0);
  assert.equal((await receiveMagic(env, begun)).status, 400); assert.equal(stub.exchanges.length, 1);
  assert.equal((await decideMagic(env, form)).headers.get('Location'), failedMagicLocation('confirmation_expired'));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 1);
});

test('confirmation form preserves the same-origin POST Origin while credential callbacks suppress referrers', async t => {
  const db=new FakeD1();t.after(()=>db.close());const env=environment(db,{EMAIL_AUTH_METHOD:'magic-link'});magicProvider(t);
  const begun=await beginMagic(env),received=await receiveMagic(env,begun),form=await confirmationForm(env,received);
  // A no-referrer policy makes the browser serialize Origin as null for a
  // native form navigation. The credential-free confirmation page must permit
  // its own origin; the code-bearing callback keeps the stricter policy.
  assert.equal(form.page.headers.get('Referrer-Policy'),'same-origin');
  assert.match(form.page.headers.get('Content-Security-Policy'),/form-action 'self'/);
  assert.equal((await run(env,MAGIC_CALLBACK)).headers.get('Referrer-Policy'),'no-referrer');
  for(const origin of ['null','https://attacker.example']){
    const denied=await decideMagic(env,form,'confirm',{headers:{Origin:origin}});
    assert.equal(denied.status,403);assert.equal((await denied.json()).error,'same_origin_required');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n,0);
  }
  const noOrigin=request('magic-confirm','POST',new URLSearchParams({csrf:form.csrf,decision:'confirm'}).toString(),
    {cookie:form.cookie,headers:{'Content-Type':'application/x-www-form-urlencoded'}});
  noOrigin.headers.delete('Origin');
  assert.equal((await (await handler).fetch(noOrigin,env)).status,403);
  const accepted=await decideMagic(env,form);
  assert.equal(accepted.headers.get('Location'),'/?email-login=success#settings');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n,1);
});

test('old email links retain cookie-based same-browser fallback and still require explicit account confirmation', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'}); magicProvider(t);
  const begun = await beginMagic(env); const received = await receiveMagic(env, begun, {legacy: true});
  assert.equal(received.status, 200); assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 0);
  const form = await confirmationForm(env, received); assert.equal((await decideMagic(env, form)).headers.get('Location'), '/?email-login=success#settings');
});

test('confirmation cancellation, missing/wrong CSRF, and a changed current account never replace a browser session', async t => {
  for (const scenario of ['cancel', 'wrong-csrf', 'no-cookie', 'cross-origin', 'changed-session']) await t.test(scenario, async subtest => {
    const db = new FakeD1(); subtest.after(() => db.close()); const otpEnv = environment(db); const stub = magicProvider(subtest);
    const signed = await login(otpEnv, 'bob@example.com'); const env = {...otpEnv, EMAIL_AUTH_METHOD: 'magic-link'};
    const begun = await beginMagic(env); const received = await receiveMagic(env, begun, {cookie: signed.cookie});
    const form = await confirmationForm(env, received, {cookie: signed.cookie});
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 1);
    const options = scenario === 'no-cookie' ? {cookie: signed.cookie} : scenario === 'cross-origin' ? {headers: {Origin: 'https://attacker.example'}}
      : scenario === 'changed-session' ? {cookie: form.cookie.split('; ')[0]} : {};
    const decision = await decideMagic(env, scenario === 'wrong-csrf' ? {...form, csrf: 'z'.repeat(43)} : form, scenario === 'cancel' ? 'cancel' : 'confirm', options);
    if (scenario === 'cancel') assert.equal(decision.headers.get('Location'), '/?email-login=cancelled#settings');
    if (['wrong-csrf', 'cross-origin'].includes(scenario)) assert.equal(decision.status, 403);
    if (scenario === 'changed-session') assert.equal(decision.headers.get('Location'), failedMagicLocation('login_context_changed'));
    assert.equal((await (await run(env, 'session', 'GET', undefined, {cookie: signed.cookie})).json()).user.email, 'bob@example.com');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 1);
    assert.equal(stub.exchanges.length, 1);
  });
});

test('explicit confirmation rotates the receiving browser account only after the displayed email is accepted', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const otpEnv = environment(db); magicProvider(t);
  const signed = await login(otpEnv, 'bob@example.com'); const env = {...otpEnv, EMAIL_AUTH_METHOD: 'magic-link'};
  const begun = await beginMagic(env); const received = await receiveMagic(env, begun, {cookie: signed.cookie});
  const form = await confirmationForm(env, received, {cookie: signed.cookie}); const confirmed = await decideMagic(env, form);
  assert.equal(confirmed.headers.get('Location'), '/?email-login=success#settings');
  assert.equal((await (await run(env, 'session', 'GET', undefined, {cookie: signed.cookie})).json()).authenticated, false);
  const newCookie = confirmed.headers.getSetCookie().find(value => value.startsWith('__Host-xunci-session=')).split(';')[0];
  assert.equal((await (await run(env, 'session', 'GET', undefined, {cookie: newCookie})).json()).user.email, 'alice@example.com');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 1);
});

test('missing, expired, duplicate or tampered login verifiers reject callback POSTs before provider exchange', async t => {
  for (const scenario of ['missing', 'expired', 'duplicate-cookie', 'tampered', 'invalid-state']) await t.test(scenario, async subtest => {
    const db = new FakeD1(); subtest.after(() => db.close()); const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'});
    const stub = magicProvider(subtest); const begun = await beginMagic(env); let options = {cookie: begun.cookie};
    if (scenario === 'missing') options = {};
    if (scenario === 'expired') db.sqlite.prepare('UPDATE auth_pending_logins SET expires_at = 0').run();
    if (scenario === 'duplicate-cookie') options.cookie += '; ' + begun.cookie;
    if (scenario === 'tampered') db.sqlite.prepare('UPDATE auth_pending_logins SET verifier_ciphertext = ?').run(Buffer.alloc(40).toString('base64'));
    const callback = await run(env, 'magic-callback', 'POST', {code: 'magic-auth-code-abcdef0123456789', ...(scenario === 'invalid-state' ? {state: 'invalid'} : {})}, options);
    const reason = ['missing', 'duplicate-cookie', 'invalid-state'].includes(scenario) ? 'browser_cookie_missing'
      : scenario === 'expired' ? 'pending_unavailable' : 'verifier_invalid';
    assert.equal(callback.status, 400); assert.equal((await callback.json()).reason, reason);
    assert.equal(stub.exchanges.length, 0); assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 0);
    assert.equal(callback.headers.get('Set-Cookie'), null);
  });
  for (const endpoint of [MAGIC_CALLBACK + '&code=another-code-abcdef0123456789', MAGIC_CALLBACK + '&redirect_to=https://evil.example']) {
    const db = new FakeD1(); t.after(() => db.close()); const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'});
    assert.equal((await run(env, endpoint)).headers.get('Location'), failedMagicLocation('invalid_callback'));
  }
});

test('PKCE mismatch and provider-substituted email consume the pending link without establishing a session', async t => {
  for (const scenario of ['exchangeFailure', 'wrongEmail']) await t.test(scenario, async subtest => {
    const db = new FakeD1(); subtest.after(() => db.close()); const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'});
    const stub = magicProvider(subtest, {[scenario]: true}); const begun = await beginMagic(env);
    const callback = await receiveMagic(env, begun);
    assert.equal((await callback.json()).reason, scenario === 'exchangeFailure' ? 'provider_exchange_error' : 'identity_verification_failed');
    assert.equal(stub.exchanges.length, 1); assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 0);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_pending_logins').get().n, 0);
  });
});

test('magic callback diagnostics contain only fixed reasons and optional HTTP status', async t => {
  const privateMarker = 'private-provider-code-cookie-email-sql@example.com';
  for (const scenario of [
    {name: 'claim-storage', expected: 'session_storage_failed', failSQL: /^UPDATE auth_pending_logins SET claimed_at/},
    {name: 'missing-pending', expected: 'pending_unavailable', missingPending: true},
    {name: 'invalid-verifier', expected: 'verifier_invalid', invalidVerifier: true},
    {name: 'provider-exchange', expected: 'provider_exchange_error', exchangeFailure: true, httpStatus: 400},
    {name: 'identity', expected: 'identity_verification_failed', wrongEmail: true},
    {name: 'confirmation-storage', expected: 'session_storage_failed', failSQL: /^INSERT INTO auth_pending_logins/},
  ]) await t.test(scenario.name, async subtest => {
    const db = new FakeD1(); subtest.after(() => db.close()); const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'});
    magicProvider(subtest, scenario); const begun = await beginMagic(env);
    if (scenario.missingPending) db.sqlite.exec('DELETE FROM auth_pending_logins');
    if (scenario.invalidVerifier) db.sqlite.prepare('UPDATE auth_pending_logins SET verifier_ciphertext = ?').run(privateMarker);
    const originalPrepare = db.prepare.bind(db);
    if (scenario.failSQL) db.prepare = sql => { if (scenario.failSQL.test(sql)) throw new Error(privateMarker + ' SELECT secret_sql'); return originalPrepare(sql); };
    const logs = callbackLogs(subtest); const callback = await receiveMagic(env, begun);
    assert.equal((await callback.json()).reason, scenario.expected);
    assert.deepEqual(logs, [[JSON.stringify({event: 'email_magic_callback', outcome: 'failed', reason: scenario.expected,
      ...(scenario.httpStatus ? {httpStatus: scenario.httpStatus} : {})})]]);
    for (const value of [privateMarker, MAGIC_CALLBACK, begun.cookie, begun.state]) assert.ok(!JSON.stringify(logs).includes(value));
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 0);
  });
});

test('cleanup outages still deliver confirmation and verified session, while atomic claims prevent replay', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'}); const stub = magicProvider(t);
  const begun = await beginMagic(env); const logs = callbackLogs(t); const originalPrepare = db.prepare.bind(db);
  db.prepare = sql => { if (sql === 'DELETE FROM auth_pending_logins WHERE login_hash = ?') throw new Error('private cleanup alice@example.com'); return originalPrepare(sql); };
  const received = await receiveMagic(env, begun); assert.equal(received.status, 200);
  const form = await confirmationForm(env, received); const signed = await decideMagic(env, form);
  assert.equal(signed.headers.get('Location'), '/?email-login=success#settings');
  assert.deepEqual(logs, [['email_magic_callback pending_cleanup_deferred'], ['email_magic_callback pending_cleanup_deferred']]);
  const replay = await receiveMagic(env, begun); assert.equal((await replay.json()).reason, 'pending_unavailable');
  assert.equal((await decideMagic(env, form)).headers.get('Location'), failedMagicLocation('confirmation_expired'));
  assert.equal(stub.exchanges.length, 1); assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 1);
});

test('failed magic delivery keeps the existing authenticated session and removes incomplete pending login', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const otpEnv = environment(db); const stub = magicProvider(t, {deliveryFailure: true});
  const signed = await login(otpEnv); const magicEnv = {...otpEnv, EMAIL_AUTH_METHOD: 'magic-link'};
  const failed = await run(magicEnv, 'otp', 'POST', {email: 'alice@example.com'}, {cookie: signed.cookie});
  assert.equal(failed.status, 503); assert.equal(failed.headers.get('Set-Cookie'), null);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_pending_logins').get().n, 0);
  const old = await run(magicEnv, 'session', 'GET', undefined, {cookie: signed.cookie}); assert.equal((await old.json()).authenticated, true);
});

test('legacy migration barrier blocks other tabs from reading or uploading before an explicit choice', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db); provider(t);
  seedState(db, 'old-account'); const signed = await login(env, 'alice@example.com', {legacy: 'old-account'});
  const get = await run(env, '/api/learning-state', 'GET', undefined, {cookie: signed.cookie, legacy: 'old-account'});
  assert.equal(get.status, 428); assert.equal((await get.json()).error, 'legacy_choice_required');
  const save = await run(env, '/api/learning-state', 'PUT', {version: 1, baseRevision: 0, state: learningState('manage')},
    {cookie: signed.cookie, legacy: 'old-account', headers: {'If-Match': 'irrelevant-stale-tag'}});
  assert.equal(save.status, 428); assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM learning_state').get().n, 1);
  const prompt = await run(env, 'session', 'GET', undefined, {cookie: signed.cookie, legacy: 'old-account'});
  assert.equal(prompt.status, 200); assert.equal((await prompt.json()).migration.pending, true);
  assert.equal((await run(env, 'skip-legacy', 'POST', {}, {cookie: signed.cookie, legacy: 'old-account'})).status, 200);
  assert.equal((await run(env, '/api/learning-state', 'GET', undefined, {cookie: signed.cookie, legacy: 'old-account'})).status, 200);
});

test('native MCP summary safely reports configured email method without credentials, provider calls or progress changes', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const stub = provider(t);
  seedState(db, 'old-account'); const before = db.sqlite.prepare('SELECT * FROM learning_state').get();
  const call = {jsonrpc: '2.0', id: 'auth-status', method: 'tools/call', params: {name: 'get_learning_summary', arguments: {}}};
  const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'});
  const result = await run(env, '/mcp', 'POST', call, {legacy: 'old-account'});
  const rpc = await result.json(); assert.equal(rpc.result.isError, false);
  const summary = JSON.parse(rpc.result.content[0].text);
  assert.deepEqual(summary.authentication, {enabled: true, loginMethod: 'magic-link'});
  assert.equal(summary.vocabulary.total, 1); assert.equal(summary.revision, 1);
  assert.equal(stub.calls.length, 0); assert.ok(!JSON.stringify(summary).includes(env.SUPABASE_PUBLISHABLE_KEY));
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM learning_state').get(), before);
  const disabled = await run({...env, EMAIL_AUTH_ENABLED: '0'}, '/mcp', 'POST', call, {legacy: 'old-account'});
  const disabledRpc = await disabled.json(); assert.deepEqual(JSON.parse(disabledRpc.result.content[0].text).authentication, {enabled: false, loginMethod: 'otp'});
  const invalid = await run({...env, SESSION_ENCRYPTION_KEY: undefined}, '/mcp', 'POST', call, {legacy: 'old-account'});
  const invalidRpc = await invalid.json(); assert.equal(invalidRpc.result.isError, true);
  assert.deepEqual(JSON.parse(invalidRpc.result.content[0].text), {error: 'email_auth_misconfigured', status: 503});
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM learning_state').get(), before);
});

test('only the native editor summary probes real provider connectivity and never changes learning records', async t => {
  const db = new FakeD1(); t.after(() => db.close());
  const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'});
  const stub = provider(t, endpoint => endpoint === '/settings' ? Response.json({external: {email: true}}) : null);
  seedState(db, 'old-account'); const before = db.sqlite.prepare('SELECT * FROM learning_state').get();
  const call = {jsonrpc: '2.0', id: 'owner-connection', method: 'tools/call', params: {name: 'get_learning_summary', arguments: {}}};
  const ownerRequest = request('/mcp', 'POST', call, {legacy: 'old-account'});
  ownerRequest.headers.set('oai-authenticated-user-email', 'editor@example.com');
  const result = await (await handler).fetch(ownerRequest, env);
  const rpc = await result.json(); assert.equal(rpc.result.isError, false);
  const summary = JSON.parse(rpc.result.content[0].text);
  assert.deepEqual(summary.authentication, {enabled: true, loginMethod: 'magic-link', connection: {status: 'reachable', httpStatus: 200}});
  assert.equal(stub.calls.length, 1); assert.equal(stub.calls[0].endpoint, '/settings');
  assert.ok(!JSON.stringify(summary).includes(env.SUPABASE_PUBLISHABLE_KEY));
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM learning_state').get(), before);
  ownerRequest.headers.delete('oai-authenticated-user-email');
  const noEditor = await (await handler).fetch(new Request(ownerRequest, {body: JSON.stringify(call)}), {...env, EDITOR_EMAIL: undefined});
  const noEditorRpc = await noEditor.json();
  assert.equal(JSON.parse(noEditorRpc.result.content[0].text).authentication.connection, undefined);
  assert.equal(stub.calls.length, 1);
});

test('cross-browser callback Origin and payload guards cannot claim pending state or touch an existing session', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const otpEnv = environment(db); const stub = magicProvider(t);
  const signed = await login(otpEnv, 'bob@example.com'); const env = {...otpEnv, EMAIL_AUTH_METHOD: 'magic-link'};
  const begun = await beginMagic(env);
  for (const headers of [{Origin: 'https://attacker.example'}, {'Content-Type': 'text/plain'}]) {
    const rejected = await receiveMagic(env, begun, {cookie: signed.cookie, headers});
    assert.ok([403, 415].includes(rejected.status)); assert.equal(rejected.headers.get('Set-Cookie'), null);
  }
  const missingOrigin = request('magic-callback', 'POST', {code: 'magic-auth-code-abcdef0123456789', state: begun.state}, {cookie: signed.cookie});
  missingOrigin.headers.delete('Origin'); assert.equal((await (await handler).fetch(missingOrigin, env)).status, 403);
  const injected = await run(env, 'magic-callback', 'POST', {code: 'magic-auth-code-abcdef0123456789', state: begun.state, access_token: 'injected'}, {cookie: signed.cookie});
  assert.equal(injected.status, 400); assert.equal(stub.exchanges.length, 0);
  assert.equal(db.sqlite.prepare('SELECT claimed_at FROM auth_pending_logins').get().claimed_at, 0);
  assert.equal((await (await run(env, 'session', 'GET', undefined, {cookie: signed.cookie})).json()).user.email, 'bob@example.com');
});

test('expired and duplicate receiving cookies never create or switch sessions', async t => {
  for (const scenario of ['expired', 'duplicate', 'tampered']) await t.test(scenario, async subtest => {
    const db = new FakeD1(); subtest.after(() => db.close()); const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'}); magicProvider(subtest);
    const begun = await beginMagic(env); const received = await receiveMagic(env, begun); const form = await confirmationForm(env, received);
    if (scenario === 'expired') db.sqlite.exec('UPDATE auth_pending_logins SET expires_at = 0');
    if (scenario === 'duplicate') form.cookie += '; ' + form.cookie;
    if (scenario === 'tampered') db.sqlite.prepare('UPDATE auth_pending_logins SET verifier_ciphertext = ?').run(Buffer.alloc(40).toString('base64'));
    const rejected = await decideMagic(env, form); assert.equal(rejected.headers.get('Location'), failedMagicLocation('confirmation_expired'));
    assert.ok(rejected.headers.getSetCookie().every(cookie => !cookie.startsWith('__Host-xunci-session=')));
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 0);
  });
});

test('concurrent callback and confirmation replays have exactly one atomic winner', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'}); const stub = magicProvider(t);
  const begun = await beginMagic(env);
  const received = await Promise.all([receiveMagic(env, begun), receiveMagic(env, begun)]);
  assert.deepEqual(received.map(result => result.status).sort(), [200, 400]); assert.equal(stub.exchanges.length, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_pending_logins WHERE claimed_at = 0').get().n, 1);
  const form = await confirmationForm(env, received.find(result => result.status === 200));
  const confirmed = await Promise.all([decideMagic(env, form), decideMagic(env, form)]);
  assert.equal(confirmed.filter(result => result.headers.get('Location') === '/?email-login=success#settings').length, 1);
  assert.equal(confirmed.filter(result => result.headers.getSetCookie().some(cookie => cookie.startsWith('__Host-xunci-session='))).length, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 1);
});

test('a concurrent cancel and confirm cannot both report success or reverse the winning decision', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'}); magicProvider(t);
  const begun = await beginMagic(env); const received = await receiveMagic(env, begun); const form = await confirmationForm(env, received);
  const results = await Promise.all([decideMagic(env, form, 'cancel'), decideMagic(env, form)]);
  const locations = results.map(result => result.headers.get('Location'));
  const confirmed = locations.includes('/?email-login=success#settings'); const cancelled = locations.includes('/?email-login=cancelled#settings');
  assert.notEqual(confirmed, cancelled); assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, confirmed ? 1 : 0);
});

test('provider and storage failures during confirmation preserve the browser previous account and never emit a replacement cookie', async t => {
  for (const scenario of ['provider-identity', 'session-insert', 'account-read']) await t.test(scenario, async subtest => {
    const db = new FakeD1(); subtest.after(() => db.close()); const otpEnv = environment(db); const stub = magicProvider(subtest);
    const signed = await login(otpEnv, 'bob@example.com'); const env = {...otpEnv, EMAIL_AUTH_METHOD: 'magic-link'};
    const begun = await beginMagic(env); const received = await receiveMagic(env, begun, {cookie: signed.cookie});
    const form = await confirmationForm(env, received, {cookie: signed.cookie}); const originalPrepare = db.prepare.bind(db);
    if (scenario === 'provider-identity') stub.users.get('magic-access-alice@example.com').email = 'wrong@example.com';
    if (scenario !== 'provider-identity') db.prepare = sql => {
      if ((scenario === 'session-insert' && sql.startsWith('INSERT INTO auth_sessions'))
        || (scenario === 'account-read' && sql.startsWith('SELECT * FROM auth_accounts'))) throw new Error('synthetic storage unavailable');
      return originalPrepare(sql);
    };
    const failed = await decideMagic(env, form); db.prepare = originalPrepare;
    assert.equal(failed.headers.get('Location'), failedMagicLocation('confirmation_expired'));
    assert.ok(failed.headers.getSetCookie().every(cookie => !cookie.startsWith('__Host-xunci-session=')));
    assert.equal((await (await run(env, 'session', 'GET', undefined, {cookie: signed.cookie})).json()).user.email, 'bob@example.com');
  });
});
