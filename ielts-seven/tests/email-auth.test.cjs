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
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
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
  return {cookie: result.headers.get('Set-Cookie').split(';')[0], result};
}
const MAGIC_CALLBACK = '/?code=magic-auth-code-abcdef0123456789';

test('magic links send a hashed PKCE challenge and retain only an encrypted browser-bound verifier', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'}); const stub = magicProvider(t);
  assert.equal((await (await run(env, 'config')).json()).loginMethod, 'magic-link');
  const begun = await beginMagic(env);
  assert.deepEqual(await begun.result.json(), {sent: true, retryAfterSeconds: 60, method: 'magic-link'});
  assert.match(begun.result.headers.get('Set-Cookie'), /^__Host-xunci-login=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=900$/);
  const call = stub.calls.find(call => call.endpoint.startsWith('/otp?'));
  assert.equal(new URL('https://provider.example' + call.endpoint).searchParams.get('redirect_to'), ORIGIN + '/');
  assert.equal(call.body.code_challenge_method, 's256'); assert.match(call.body.code_challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(call.body.email, 'alice@example.com'); assert.equal(call.body.code_verifier, undefined);
  const pending = db.sqlite.prepare('SELECT * FROM auth_pending_logins').get();
  assert.match(pending.login_hash, /^[a-f0-9]{64}$/); assert.equal(pending.expected_email, 'alice@example.com'); assert.equal(pending.claimed_at, 0);
  assert.ok(!pending.verifier_ciphertext.includes(call.body.code_challenge));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 0);
  assert.equal((await run(env, 'verify', 'POST', {email: 'alice@example.com', token: '123456'})).status, 405);
});

test('root magic callback exchanges PKCE on the server, validates /user, issues cookie and strips provider code', async t => {
  const db = new FakeD1(); t.after(() => db.close()); const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'}); const stub = magicProvider(t);
  const begun = await beginMagic(env);
  const callback = await run(env, MAGIC_CALLBACK, 'GET', undefined, {cookie: begun.cookie});
  assert.equal(callback.status, 303); assert.equal(callback.headers.get('Location'), '/?email-login=success#settings');
  assert.equal(callback.headers.get('Cache-Control'), 'private, no-store'); assert.equal(callback.headers.get('Referrer-Policy'), 'no-referrer');
  const cookies = callback.headers.getSetCookie(); assert.equal(cookies.length, 2);
  assert.ok(cookies.some(cookie => cookie.startsWith('__Host-xunci-login=;') && cookie.includes('Max-Age=0')));
  const sessionCookie = cookies.find(cookie => cookie.startsWith('__Host-xunci-session=')); assert.ok(sessionCookie.includes('HttpOnly; Secure; SameSite=Lax'));
  assert.equal(await callback.text(), ''); assert.equal(stub.exchanges.length, 1);
  assert.match(stub.exchanges[0].code_verifier, /^[A-Za-z0-9_-]{43}$/);
  const session = await run(env, 'session', 'GET', undefined, {cookie: sessionCookie.split(';')[0]});
  assert.equal((await session.json()).user.email, 'alice@example.com');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_pending_logins').get().n, 0);
  const repeated = await run(env, MAGIC_CALLBACK, 'GET', undefined, {cookie: begun.cookie});
  assert.equal(repeated.headers.get('Location'), '/?email-login=expired#settings'); assert.equal(stub.exchanges.length, 1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 1);
});

test('missing, expired, duplicate or tampered login verifiers reject callbacks before provider exchange', async t => {
  const scenarios = ['missing', 'expired', 'duplicate-cookie', 'tampered', 'duplicate-code', 'extra-param'];
  for (const scenario of scenarios) {
    const db = new FakeD1(); t.after(() => db.close()); const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'});
    const sub = await t.test(scenario, async subtest => {
      const stub = magicProvider(subtest); const begun = await beginMagic(env); let options = {cookie: begun.cookie}; let endpoint = MAGIC_CALLBACK;
      if (scenario === 'missing') options = {};
      if (scenario === 'expired') db.sqlite.prepare('UPDATE auth_pending_logins SET expires_at = 0').run();
      if (scenario === 'duplicate-cookie') options.cookie += '; ' + begun.cookie;
      if (scenario === 'tampered') db.sqlite.prepare('UPDATE auth_pending_logins SET verifier_ciphertext = ?').run(Buffer.alloc(40).toString('base64'));
      if (scenario === 'duplicate-code') endpoint += '&code=magic-auth-code-abcdef0123456789';
      if (scenario === 'extra-param') endpoint += '&redirect_to=https://evil.example';
      const callback = await run(env, endpoint, 'GET', undefined, options);
      assert.equal(callback.status, 303); assert.equal(callback.headers.get('Location'), '/?email-login=expired#settings');
      assert.equal(stub.exchanges.length, 0); assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 0);
      assert.equal(callback.headers.getSetCookie().length, 1);
    });
  }
});

test('PKCE mismatch and provider-substituted email consume the pending link without establishing a session', async t => {
  for (const scenario of ['exchangeFailure', 'wrongEmail']) {
    const db = new FakeD1(); t.after(() => db.close()); const env = environment(db, {EMAIL_AUTH_METHOD: 'magic-link'});
    await t.test(scenario, async subtest => {
      const stub = magicProvider(subtest, {[scenario]: true}); const begun = await beginMagic(env);
      const callback = await run(env, MAGIC_CALLBACK, 'GET', undefined, {cookie: begun.cookie});
      assert.equal(callback.headers.get('Location'), '/?email-login=expired#settings'); assert.equal(stub.exchanges.length, 1);
      assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_sessions').get().n, 0);
      assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM auth_pending_logins').get().n, 0);
    });
  }
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
