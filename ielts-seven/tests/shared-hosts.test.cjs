const test = require('node:test');
const assert = require('node:assert/strict');
const {DatabaseSync} = require('node:sqlite');
const {randomBytes} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../dist/engine.js');
const S = require('../dist/sync-state.js');
globalThis.IELTS_ENGINE = E;
globalThis.IELTS_SYNC = S;
const application = import('../worker/index.mjs').then(module => module.default);
const transport = import('../runtime/shared-d1.mjs');
const PROJECT = 'abcdefghijklmnopqrst';
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const ORIGINS = ['https://render.synthetic.example', 'https://sites.synthetic.chatgpt.site', 'https://worker.synthetic.example'];

// Execute the application's actual SQL against SQLite, including auth UPSERTs,
// numeric session expiry comparisons, and state revision compare-and-swap.
class FakeD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    const directory = path.join(__dirname, '../drizzle');
    for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.sql')).sort()) {
      this.sqlite.exec(fs.readFileSync(path.join(directory, file), 'utf8'));
    }
  }
  prepare(sql) {
    const sqlite = this.sqlite;
    const prepared = params => ({
      bind(...values) { return prepared(values); },
      async first() { return sqlite.prepare(sql).get(...params) || null; },
      async all() { return {success: true, results: sqlite.prepare(sql).all(...params)}; },
      async run() { return {success: true, meta: sqlite.prepare(sql).run(...params)}; }
    });
    return prepared([]);
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.all());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  dump() {
    const tables = this.sqlite.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name").all();
    return JSON.stringify(tables.map(({name}) => ({name, rows: this.sqlite.prepare(`SELECT * FROM "${name}" ORDER BY 1`).all()})));
  }
  close() { this.sqlite.close(); }
}
function learningState(word = 'resilience') {
  return S.validateState({records: E.seed([{word, firstSeen: '2026-10-14', level: 'A', meaning: '教学含义', ipa: '/test/'}]),
    lastExcel: '2026-10-14', readingState: {assignments: {}, results: {}, completed: {}, excluded: []}, customLessons: []});
}

test('three separately authenticated hosts share exact private state and CAS through signed Sites transport while preserving its legacy database', async t => {
  const shared = new FakeD1(), legacy = new FakeD1();
  t.after(() => { shared.close(); legacy.close(); });
  const legacyState = learningState('original');
  legacy.sqlite.prepare('INSERT INTO learning_state (user_id, revision, payload_json, updated_at) VALUES (?, ?, ?, ?)')
    .run('native-synthetic-original', 7, JSON.stringify(legacyState), '2026-10-14T00:00:00.000Z');
  const legacyBefore = legacy.dump();
  const secret = randomBytes(32).toString('base64url');
  const endpoint = ORIGINS[0] + '/internal/shared-d1';
  const {createSharedD1Handler} = await transport;
  // Reuse the actual handler so every Sites SQL operation passes HMAC, nonce,
  // request validation, and the table allowlist before reaching shared D1.
  const sharedHandler = createSharedD1Handler({db: shared, secret});
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const users = new Map(), providerCalls = [], signedCalls = [];
  let tokenSequence = 0;
  globalThis.fetch = async (target, options = {}) => {
    const url = new URL(target);
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal);
    if (url.href === endpoint) {
      assert.equal(options.method, 'POST');
      assert.equal(new Headers(options.headers).has('Origin'), false);
      const request = new Request(target, options);
      signedCalls.push(JSON.parse(await request.clone().text()));
      return sharedHandler(request);
    }
    assert.equal(url.origin, `https://${PROJECT}.supabase.co`, 'no real or unexpected network request is permitted');
    assert.equal(options.headers.apikey, 'sb_publishable_' + 's'.repeat(32));
    const route = url.pathname.slice('/auth/v1'.length);
    providerCalls.push(route);
    if (route === '/verify') {
      const payload = JSON.parse(options.body);
      assert.equal(payload.token, '123456');
      assert.equal(payload.type, 'email');
      const id = payload.email === 'alice@example.com' ? ALICE : BOB;
      const access = `synthetic-access-${++tokenSequence}`;
      users.set(access, {id, email: payload.email, email_confirmed_at: '2026-10-14T00:00:00.000Z'});
      return Response.json({access_token: access, refresh_token: 'synthetic-refresh-' + tokenSequence, expires_in: 3600});
    }
    if (route === '/user') {
      const user = users.get(options.headers.Authorization?.slice(7));
      return Response.json(user || {}, {status: user ? 200 : 401});
    }
    throw new Error('Unexpected synthetic provider route');
  };
  const common = {EMAIL_AUTH_ENABLED: '1', EMAIL_AUTH_METHOD: 'otp',
    SUPABASE_URL: `https://${PROJECT}.supabase.co`, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 's'.repeat(32),
    SESSION_ENCRYPTION_KEY: randomBytes(32).toString('base64'), EDITOR_EMAIL: 'native-editor@example.com'};
  const environments = [{...common, DB: shared},
    {...common, DB: legacy, SHARED_D1_ENDPOINT: endpoint, SHARED_D1_SECRET: secret, SHARED_D1_MODE: 'active'},
    {...common, DB: shared}];
  const app = await application;
  async function call(index, route, {method = 'GET', cookie, body, tag, forgedNative = false} = {}) {
    const headers = new Headers();
    if (cookie) headers.set('Cookie', cookie);
    if (method !== 'GET') { headers.set('Origin', ORIGINS[index]); headers.set('Content-Type', 'application/json'); }
    if (tag) headers.set('If-Match', tag);
    if (forgedNative) {
      headers.set('oai-authenticated-user-id', 'native-synthetic-original');
      headers.set('oai-authenticated-user-email', 'native-editor@example.com');
    }
    return app.fetch(new Request(ORIGINS[index] + route, {method, headers,
      ...(body === undefined ? {} : {body: JSON.stringify(body)})}), environments[index]);
  }
  async function login(index, email) {
    const response = await call(index, '/api/auth/verify', {method: 'POST', body: {email, token: '123456'}});
    assert.equal(response.status, 200);
    const value = await response.json();
    assert.equal(value.authenticated, true);
    const setCookie = response.headers.get('Set-Cookie');
    assert.match(setCookie, /^__Host-xunci-session=/);
    assert.match(setCookie, /; Secure/); assert.match(setCookie, /; HttpOnly/);
    assert.doesNotMatch(setCookie, /Domain=/i);
    return {cookie: setCookie.split(';')[0], user: value.user};
  }
  async function read(index, cookie) {
    const response = await call(index, '/api/learning-state', {cookie});
    assert.equal(response.status, 200);
    return {snapshot: await response.json(), tag: response.headers.get('X-Xunci-State-Tag')};
  }
  const alice = [];
  for (let index = 0; index < 3; index++) alice.push(await login(index, 'alice@example.com'));
  assert.equal(new Set(alice.map(account => account.cookie)).size, 3, 'each host establishes its own opaque session');
  assert.deepEqual(alice.map(account => account.user.id), Array(3).fill(`email:supabase:${PROJECT}:${ALICE}`));
  const initial = await read(0, alice[0].cookie);
  assert.equal(initial.snapshot.revision, 0); assert.equal(initial.snapshot.state, null);
  const firstState = learningState();
  const firstWrite = await call(0, '/api/learning-state', {method: 'PUT', cookie: alice[0].cookie, tag: initial.tag,
    body: {version: 1, baseRevision: 0, state: firstState}});
  assert.equal(firstWrite.status, 200);
  const firstSnapshot = await firstWrite.json();
  assert.equal(firstSnapshot.revision, 1); assert.deepEqual(firstSnapshot.state, firstState);
  const sitesRead = await read(1, alice[1].cookie), workerRead = await read(2, alice[2].cookie);
  assert.deepEqual(sitesRead.snapshot, firstSnapshot);
  assert.deepEqual(workerRead.snapshot, firstSnapshot);
  assert.equal(sitesRead.tag, workerRead.tag);

  const nextState = S.validateState({...firstState,
    records: [E.review(firstState.records[0], {kind: 'wrong', date: '2026-10-16', answer: 'synthetic actual answer'})],
    preferences: {...firstState.preferences, dailyMinutes: 60},
    readingState: {assignments: {'2026-10-16': 'synthetic-reading'},
      results: {'2026-10-16|synthetic-reading': {date: '2026-10-16', lessonId: 'synthetic-reading',
        submittedAt: '2026-10-16T01:00:00.000Z', answers: {q1: 'FALSE'}}},
      completed: {'synthetic-reading': '2026-10-16'}, excluded: []}});
  const sitesWrite = await call(1, '/api/learning-state', {method: 'PUT', cookie: alice[1].cookie, tag: sitesRead.tag,
    body: {version: 1, baseRevision: 1, state: nextState}});
  assert.equal(sitesWrite.status, 200);
  const latest = await sitesWrite.json();
  assert.equal(latest.revision, 2); assert.deepEqual(latest.state, nextState);
  for (let index = 0; index < 3; index++) assert.deepEqual((await read(index, alice[index].cookie)).snapshot, latest);
  const stale = await call(2, '/api/learning-state', {method: 'PUT', cookie: alice[2].cookie, tag: workerRead.tag,
    body: {version: 1, baseRevision: 1, state: firstState}});
  assert.equal(stale.status, 409); assert.deepEqual(await stale.json(), latest);

  for (let index = 0; index < 3; index++) {
    const bob = await login(index, 'bob@example.com');
    assert.equal(bob.user.id, `email:supabase:${PROJECT}:${BOB}`);
    const fresh = await read(index, bob.cookie);
    assert.equal(fresh.snapshot.revision, 0); assert.equal(fresh.snapshot.state, null);
    assert.notEqual(fresh.tag, (await read(index, alice[index].cookie)).tag);
    assert.equal((await call(index, '/api/learning-state')).status, 401);
    assert.equal((await call(index, '/api/learning-state', {forgedNative: true})).status, 401);
    assert.equal((await call(index, '/api/learning-state', {method: 'PUT', forgedNative: true, tag: initial.tag,
      body: {version: 1, baseRevision: 0, state: firstState}})).status, 401);
  }
  assert.equal(shared.sqlite.prepare('SELECT COUNT(*) AS n FROM auth_accounts').get().n, 2);
  assert.equal(shared.sqlite.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n, 6);
  assert.equal(shared.sqlite.prepare('SELECT COUNT(*) AS n FROM learning_state').get().n, 1);
  assert.equal(legacy.dump(), legacyBefore, 'active Sites requests never mutate the original native database');
  assert.ok(signedCalls.some(call => call.queries.some(query => query.sql.startsWith('INSERT INTO auth_sessions'))));
  assert.ok(signedCalls.some(call => call.queries.some(query => query.sql.startsWith('UPDATE learning_state'))));
  assert.equal(providerCalls.filter(route => route === '/verify').length, 6);
  assert.ok(providerCalls.filter(route => route === '/user').length > 6, 'every host re-verifies email sessions against the same provider');
});
