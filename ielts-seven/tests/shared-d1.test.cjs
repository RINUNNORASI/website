const test = require('node:test');
const assert = require('node:assert/strict');
const {DatabaseSync} = require('node:sqlite');
const {randomBytes, createHmac} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const api = import('../runtime/shared-d1.mjs');
const SECRET = randomBytes(32).toString('hex');
const ORIGIN = 'https://shared.example.com';
const ENDPOINT = ORIGIN + '/internal/shared-d1';
const NOW = 1800000000123;
const result = (rows = [], meta = {changes: 0}) => ({success: true, results: rows, meta});
const envelope = (queries = [{sql: 'SELECT 1 AS value', params: []}], batch = false) => ({version: 1, batch, queries});
function signedRequest(body = envelope(), {time = NOW, nonce = randomBytes(16).toString('hex'), secret = SECRET, method = 'POST', url = ENDPOINT, headers = {}} = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const signature = createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`xunci-shared-d1-v1\nPOST\n/internal/shared-d1\n${time}\n${nonce}\n${raw}`).digest('hex');
  return new Request(url, {method, headers: {'Content-Type': 'application/json',
    'X-Xunci-D1-Timestamp': String(time), 'X-Xunci-D1-Nonce': nonce, 'X-Xunci-D1-Signature': signature, ...headers},
    ...(method === 'GET' ? {} : {body: raw})});
}
class FakeD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:'); this.calls = 0; this.batches = 0;
    const migrations = path.join(__dirname, '../drizzle');
    for (const file of fs.readdirSync(migrations).filter(file => file.endsWith('.sql')).sort()) this.sqlite.exec(fs.readFileSync(path.join(migrations, file), 'utf8'));
  }
  prepare(sql) {
    this.calls++;
    const sqlite = this.sqlite;
    const prepared = values => ({
      bind(...params) { return prepared(params); },
      async all() { return result(sqlite.prepare(sql).all(...values), {changes: Number(sqlite.prepare('SELECT changes() AS n').get().n)}); },
      async run() { return this.all(); }
    });
    return prepared([]);
  }
  async batch(statements) {
    this.batches++;
    this.sqlite.exec('BEGIN');
    try { const rows = []; for (const statement of statements) rows.push(await statement.all()); this.sqlite.exec('COMMIT'); return rows; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  close() { this.sqlite.close(); }
}
async function fixture(t, settings = {}) {
  const {createSharedD1Client, createSharedD1Handler} = await api;
  const db = new FakeD1(); t.after(() => db.close());
  const handler = createSharedD1Handler({db, secret: SECRET, now: () => NOW, ...settings});
  const requests = [];
  const fetchImpl = async (url, options) => {
    const request = new Request(url, options); requests.push(request.clone()); return handler(request);
  };
  const client = createSharedD1Client({endpoint: ORIGIN, secret: SECRET, now: () => NOW, fetchImpl});
  return {db, client, handler, requests, fetchImpl};
}

test('real signed client preserves numeric/null binds, standard D1 results, and immutable prepare/bind statements', async t => {
  const {client, requests} = await fixture(t);
  const unbound = client.prepare('SELECT 7 AS id, 2.5 AS amount, NULL AS optional');
  assert.deepEqual(await unbound.first(), {id: 7, amount: 2.5, optional: null});
  assert.equal(await unbound.first('optional'), null);
  const query = client.prepare('SELECT ? AS id, ? AS amount, ? AS optional');
  const bound = query.bind(7, 2.5, null);
  assert.notEqual(bound, query);
  assert.deepEqual((await bound.all()).results, [{id: 7, amount: 2.5, optional: null}]);
  assert.equal((await bound.run()).success, true);
  assert.equal(await client.prepare('SELECT user_id FROM learning_state WHERE 0').first(), null);
  await assert.rejects(unbound.first('not_a_column'), {code: 'SHARED_D1_INPUT'});
  const first = requests[0];
  assert.equal(first.url, ENDPOINT);
  assert.equal(first.headers.get('authorization'), null);
  assert.equal(first.headers.get('origin'), null);
  assert.equal(first.headers.get('X-Xunci-D1-Signature').length, 64);
});

test('batch is one signed call to atomic D1 batch and a failed second statement rolls back the first', async t => {
  const {client, db, requests} = await fixture(t);
  const insert = client.prepare('INSERT INTO word_cards (word, payload_json, updated_at) VALUES (?, ?, ?) RETURNING word');
  const rows = await client.batch([insert.bind('synthetic-one', '{}', 'now'), insert.bind('synthetic-two', '{}', 'now')]);
  assert.deepEqual(rows.map(row => row.results[0].word), ['synthetic-one', 'synthetic-two']);
  assert.equal(db.batches, 1); assert.equal(requests.length, 1);
  await assert.rejects(client.batch([insert.bind('synthetic-three', '{}', 'now'), insert.bind('synthetic-one', '{}', 'now')]), {code: 'SHARED_D1_HTTP', status: 502});
  assert.equal(db.batches, 2); assert.equal(requests.length, 2);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM word_cards WHERE word = ?').get('synthetic-three').n, 0);
});

test('existing auth UPSERTs, CAS, nested ownership checks, aliases, and quoted allowlisted tables are accepted', async t => {
  const {client} = await fixture(t);
  const auth = 'synthetic-subject';
  await client.prepare(`INSERT INTO auth_accounts (provider_subject, user_id, email, legacy_link_decided, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(provider_subject) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at`)
    .bind(auth, 'synthetic-user', 'synthetic@example.com', 'now', 'now').run();
  const inserted = await client.prepare(`INSERT INTO learning_state (user_id, revision, payload_json, updated_at)
    SELECT ?, 1, ?, ? WHERE EXISTS (SELECT 1 FROM auth_accounts WHERE provider_subject = ? AND user_id = ?)
    ON CONFLICT(user_id) DO NOTHING RETURNING revision`).bind('synthetic-user', '{}', 'now', auth, 'synthetic-user').first();
  assert.equal(inserted.revision, 1);
  assert.equal((await client.prepare('UPDATE learning_state SET revision = revision + 1 WHERE user_id = ? AND revision = ? RETURNING revision')
    .bind('synthetic-user', 1).first()).revision, 2);
  assert.equal(await client.prepare('UPDATE learning_state SET revision = revision + 1 WHERE user_id = ? AND revision = ? RETURNING revision')
    .bind('synthetic-user', 1).first(), null);
  assert.equal((await client.prepare('SELECT a.user_id FROM "learning_state" AS a JOIN `auth_accounts` AS b ON b.user_id = a.user_id WHERE a.revision = ?')
    .bind(2).first()).user_id, 'synthetic-user');
  await client.prepare('DELETE FROM learning_state WHERE user_id = ?').bind('synthetic-user').run();
});

test('SQL restrictions block schemas, hidden tables, comma/nested/UNION escapes, DDL, extensions, comments, and multiple statements before transport', async t => {
  const {client, requests} = await fixture(t);
  const rejected = [
    'DROP TABLE learning_state', 'PRAGMA table_info(learning_state)', 'ATTACH DATABASE ? AS outside',
    'SELECT * FROM sqlite_master', 'SELECT * FROM learning_state, sqlite_master',
    'SELECT * FROM learning_state AS a JOIN sqlite_master AS b ON 1 = 1',
    'SELECT * FROM (SELECT * FROM sqlite_master)', 'SELECT * FROM learning_state UNION SELECT * FROM sqlite_master',
    'SELECT * FROM learning_state, (SELECT * FROM sqlite_master)', 'SELECT * FROM (learning_state, sqlite_master)',
    'SELECT * FROM main.learning_state', 'SELECT * FROM "main"."learning_state"',
    'SELECT * FROM learning_state WHERE EXISTS (SELECT 1 FROM sqlite_master)',
    'SELECT * FROM learning_state; DELETE FROM learning_state', 'SELECT 1;;', 'SELECT 1 -- hidden',
    'SELECT /* comment */ 1', "SELECT load_extension('private')", "SELECT writefile('private', 'value')",
    'SELECT * FROM learning_state(1)', 'WITH x AS (SELECT * FROM learning_state) SELECT * FROM x',
    'UPDATE sqlite_master SET sql = ?', 'INSERT INTO sqlite_master VALUES (?)', 'DELETE FROM sqlite_master',
    'SELECT * FROM learning_state a JOIN auth_accounts b ON a.user_id = b.user_id, sqlite_master'
  ];
  for (const sql of rejected) assert.throws(() => client.prepare(sql), {code: 'SHARED_D1_INPUT'}, sql);
  assert.equal(requests.length, 0);
  assert.equal((await client.prepare("SELECT '; -- private literal' AS value;").first()).value, '; -- private literal');
});

test('parameter, statement ownership, batch size, and secret/endpoint checks reject invalid values locally', async t => {
  const {createSharedD1Client, createSharedD1Handler} = await api;
  const {client, requests, db} = await fixture(t);
  for (const value of [undefined, true, false, NaN, Infinity, -Infinity, 1n, [], {}, new Uint8Array([1])]) {
    assert.throws(() => client.prepare('SELECT ?').bind(value), {code: 'SHARED_D1_INPUT'});
  }
  assert.throws(() => client.prepare('SELECT ?').bind(...Array(101).fill(1)), {code: 'SHARED_D1_INPUT'});
  const other = createSharedD1Client({endpoint: ENDPOINT, secret: SECRET});
  for (const value of [[], [{}], [other.prepare('SELECT 1')], Array(101).fill(client.prepare('SELECT 1'))]) {
    await assert.rejects(client.batch(value), {code: 'SHARED_D1_INPUT'});
  }
  for (const secret of ['', 'private-short-key', randomBytes(31).toString('base64url'), SECRET + '00'.repeat(33), ' '.repeat(64)]) {
    assert.throws(() => createSharedD1Client({endpoint: ENDPOINT, secret}), {code: 'SHARED_D1_CONFIG'});
    assert.throws(() => createSharedD1Handler({db, secret}), {code: 'SHARED_D1_CONFIG'});
  }
  for (const endpoint of ['http://example.com', 'https://example.com/other', 'https://name:secret@example.com/', ENDPOINT + '?key=private', ENDPOINT + '#private']) {
    assert.throws(() => createSharedD1Client({endpoint, secret: SECRET}), {code: 'SHARED_D1_CONFIG'});
  }
  assert.ok(createSharedD1Client({endpoint: ENDPOINT, secret: randomBytes(32).toString('base64url')}));
  assert.equal(requests.length, 0);
});

test('handler leaves normal routes alone, requires server-only POST JSON, and discloses no SQL in errors', async t => {
  const {handler, db} = await fixture(t);
  assert.equal(await handler(new Request(ORIGIN + '/api/learning-state')), null);
  assert.equal((await handler(new Request(ENDPOINT))).status, 405);
  for (const options of [{headers: {Origin: ORIGIN}}, {url: ENDPOINT + '?private=1'},
    {headers: {'Content-Type': 'text/plain'}}, {headers: {'Content-Encoding': 'gzip'}}]) {
    const response = await handler(signedRequest(envelope(), options));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(db.calls, 0);
  const response = await handler(signedRequest(envelope([{sql: 'SELECT private_column FROM word_cards', params: ['private_value']}])))
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), {error: 'shared_d1_operation_failed'});
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('wrong HMAC, modified exact body/timestamp/nonce, and expired/future timestamps fail before any database call', async t => {
  const {handler, db} = await fixture(t);
  for (const options of [{secret: randomBytes(32).toString('hex')}, {time: NOW - 60001}, {time: NOW + 60001},
    {headers: {'X-Xunci-D1-Timestamp': String(NOW + 1)}}, {headers: {'X-Xunci-D1-Nonce': randomBytes(16).toString('hex')}},
    {headers: {'X-Xunci-D1-Signature': 'x'.repeat(64)}}]) {
    assert.equal((await handler(signedRequest(envelope(), options))).status, 401);
  }
  const request = signedRequest(envelope());
  const tampered = new Request(ENDPOINT, {method: 'POST', headers: request.headers, body: await request.text() + ' '});
  assert.equal((await handler(tampered)).status, 401);
  assert.equal(db.calls, 0);
});

test('verified nonces are one-use even for failed writes; invalid HMAC does not reserve a nonce', async t => {
  const {handler, db} = await fixture(t);
  const nonce = randomBytes(16).toString('hex');
  assert.equal((await handler(signedRequest(envelope(), {nonce, secret: randomBytes(32).toString('hex')}))).status, 401);
  assert.equal((await handler(signedRequest(envelope(), {nonce}))).status, 200);
  assert.equal((await handler(signedRequest(envelope(), {nonce}))).status, 409);
  const failed = signedRequest(envelope([{sql: 'SELECT missing_column FROM learning_state', params: []}]));
  assert.equal((await handler(failed.clone())).status, 502);
  assert.equal((await handler(failed)).status, 409);
  assert.equal(db.calls, 2);
});

test('simultaneous copies of one signed request execute at most once', async t => {
  const {handler, db} = await fixture(t);
  const request = signedRequest();
  const statuses = (await Promise.all([handler(request.clone()), handler(request.clone()), handler(request)]))
    .map(response => response.status).sort();
  assert.deepEqual(statuses, [200, 409, 409]);
  assert.equal(db.calls, 1);
});

test('bounded replay cache refuses new requests at capacity instead of evicting active nonces, then expires safely', async t => {
  let now = NOW;
  const {handler, db} = await fixture(t, {maxNonces: 1, now: () => now});
  const first = signedRequest();
  assert.equal((await handler(first.clone())).status, 200);
  assert.equal((await handler(signedRequest())).status, 503);
  assert.equal((await handler(first.clone())).status, 409);
  now += 60001;
  assert.equal((await handler(signedRequest(envelope(), {time: now}))).status, 200);
  assert.equal((await handler(first)).status, 401);
  assert.equal(db.calls, 2);
});

test('handler revalidates signed envelope types, finite params, SQL, and table allowlist without trusting client validation', async t => {
  const {handler, db} = await fixture(t);
  const bodies = ['invalid private JSON', {}, {...envelope(), extra: true}, {...envelope(), version: 2},
    {...envelope(), queries: []}, envelope([{sql: 'SELECT 1', params: [true]}]),
    envelope([{sql: 'SELECT 1', params: [{}]}]), envelope([{sql: 'SELECT 1', params: [], extra: 1}]),
    envelope([{sql: 'SELECT * FROM sqlite_master', params: []}]),
    envelope([{sql: 'SELECT 1', params: []}, {sql: 'SELECT 2', params: []}])];
  for (const body of bodies) assert.equal((await handler(signedRequest(body))).status, 400);
  assert.equal(db.calls, 0);
});

test('both new migration tables are allowed, but no unrelated table is exposed', async () => {
  const {createSharedD1Client} = await api;
  const client = createSharedD1Client({endpoint: ENDPOINT, secret: SECRET});
  assert.ok(client.prepare('SELECT * FROM sync_legacy_backups WHERE legacy_user_id = ?'));
  assert.ok(client.prepare('INSERT INTO sync_account_links (native_user_id, email_user_id) VALUES (?, ?)'));
  assert.throws(() => client.prepare('SELECT * FROM unrelated_private_table'), {code: 'SHARED_D1_INPUT'});
});

test('client rejects redirects, network/HTTP/provider errors, bad result counts, and private error bodies without retries', async () => {
  const {createSharedD1Client} = await api;
  const privateText = 'private SQL private-bound-value ' + SECRET;
  const cases = [
    [() => new Response(privateText, {status: 302, headers: {Location: 'https://other.example'}}), 'SHARED_D1_HTTP'],
    [() => new Response(privateText, {status: 503}), 'SHARED_D1_HTTP'],
    [() => { throw new Error(privateText); }, 'SHARED_D1_NETWORK'],
    [() => new Response(privateText), 'SHARED_D1_RESPONSE'],
    [() => Response.json({version: 1, success: true, result: []}), 'SHARED_D1_RESPONSE'],
    [() => Response.json({version: 1, success: true, result: [{success: false, error: privateText}]}), 'SHARED_D1_QUERY'],
    [() => Response.json({version: 1, success: true, result: [{success: true, results: [null]}]}), 'SHARED_D1_QUERY']
  ];
  for (const [response, code] of cases) {
    let calls = 0;
    const client = createSharedD1Client({endpoint: ENDPOINT, secret: SECRET, fetchImpl: async (_, options) => {
      calls++; assert.equal(options.redirect, 'manual'); return response();
    }});
    await assert.rejects(client.prepare('UPDATE learning_state SET payload_json = ?').bind(privateText).run(),
      error => error.code === code && !error.message.includes(SECRET) && !error.message.includes('SQL') && !error.message.includes('bound') && !error.cause);
    assert.equal(calls, 1);
  }
});

test('client times out both fetch and response streaming, aborts, and never retries potentially committed writes', async () => {
  const {createSharedD1Client} = await api;
  for (const stream of [false, true]) {
    let signal, calls = 0, cancelled = false;
    const client = createSharedD1Client({endpoint: ENDPOINT, secret: SECRET, timeoutMs: 15, fetchImpl: async (_, options) => {
      signal = options.signal; calls++;
      return stream ? new Response(new ReadableStream({start() {}, cancel() { cancelled = true; }})) : new Promise(() => {});
    }});
    await assert.rejects(client.prepare('DELETE FROM learning_state WHERE user_id = ?').bind('synthetic').run(), {code: 'SHARED_D1_TIMEOUT'});
    assert.equal(signal.aborted, true); assert.equal(calls, 1);
    if (stream) assert.equal(cancelled, true);
  }
});

test('request size limit applies locally and to streamed signed/unsigned handler input', async t => {
  const {client, requests, handler, db} = await fixture(t);
  await assert.rejects(client.prepare('SELECT ? AS value').bind('x'.repeat(1024 * 1024)).run(), {code: 'SHARED_D1_INPUT'});
  assert.equal(requests.length, 0);
  const tooLarge = signedRequest(envelope([{sql: 'SELECT ? AS value', params: ['x'.repeat(1024 * 1024)]}]));
  assert.equal((await handler(tooLarge)).status, 413);
  const signed = signedRequest();
  let cancelled = false;
  const streamed = new Request(ENDPOINT, {method: 'POST', headers: signed.headers, duplex: 'half', body: new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)); }, cancel() { cancelled = true; }
  })});
  assert.equal((await handler(streamed)).status, 413);
  assert.equal(cancelled, true); assert.equal(db.calls, 0);
});

test('response size limit applies to declared/chunked HTTP and to handler database results', async t => {
  const {createSharedD1Client, createSharedD1Handler} = await api;
  for (const chunked of [false, true]) {
    let cancelled = false;
    const client = createSharedD1Client({endpoint: ENDPOINT, secret: SECRET, fetchImpl: async () => new Response(new ReadableStream({
      start(controller) { if (chunked) controller.enqueue(new Uint8Array(16 * 1024 * 1024 + 1)); }, cancel() { cancelled = true; }
    }), chunked ? {} : {headers: {'Content-Length': String(16 * 1024 * 1024 + 1)}})});
    await assert.rejects(client.prepare('SELECT 1').run(), {code: 'SHARED_D1_RESPONSE'});
    assert.equal(cancelled, true);
  }
  const db = {prepare() { return {bind() { return this; }, async all() { return result([{value: 'x'.repeat(16 * 1024 * 1024)}]); }}; }, async batch() {}};
  const handler = createSharedD1Handler({db, secret: SECRET, now: () => NOW});
  const received = await handler(signedRequest());
  assert.equal(received.status, 502); assert.deepEqual(await received.json(), {error: 'shared_d1_operation_failed'});
});

test('handler deadline bounds stuck request streams and stuck database operations without retry', async () => {
  const {createSharedD1Handler} = await api;
  let calls = 0;
  const db = {prepare() { calls++; return {bind() { return this; }, async all() { return new Promise(() => {}); }}; }, async batch() {}};
  const handler = createSharedD1Handler({db, secret: SECRET, now: () => NOW, timeoutMs: 15});
  let cancelled = false;
  const original = signedRequest();
  const stalled = new Request(ENDPOINT, {method: 'POST', headers: original.headers, duplex: 'half', body: new ReadableStream({start() {}, cancel() { cancelled = true; }})});
  assert.equal((await handler(stalled)).status, 503); assert.equal(cancelled, true); assert.equal(calls, 0);
  const request = signedRequest();
  assert.equal((await handler(request.clone())).status, 503); assert.equal(calls, 1);
  assert.equal((await handler(request)).status, 409); assert.equal(calls, 1);
});

test('cryptographic work finishing after the deadline cannot start a database operation or network request', async () => {
  const {createSharedD1Client, createSharedD1Handler} = await api;
  let releaseSign, releaseVerify, networkCalls = 0, dbCalls = 0;
  const real = globalThis.crypto;
  const cryptoImpl = {getRandomValues: real.getRandomValues.bind(real), subtle: {
    importKey: real.subtle.importKey.bind(real.subtle),
    async sign(...args) { await new Promise(resolve => { releaseSign = resolve; }); return real.subtle.sign(...args); },
    async verify(...args) { await new Promise(resolve => { releaseVerify = resolve; }); return real.subtle.verify(...args); }
  }};
  const client = createSharedD1Client({endpoint: ENDPOINT, secret: SECRET, timeoutMs: 15, cryptoImpl,
    fetchImpl: async () => { networkCalls++; return Response.json({version: 1, success: true, result: [result()]}); }});
  await assert.rejects(client.prepare('SELECT 1').run(), {code: 'SHARED_D1_TIMEOUT'});
  releaseSign();
  const db = {prepare() { dbCalls++; return {bind() { return this; }, async all() { return result(); }}; }, async batch() {}};
  const handler = createSharedD1Handler({db, secret: SECRET, timeoutMs: 15, now: () => NOW, cryptoImpl});
  assert.equal((await handler(signedRequest())).status, 503);
  releaseVerify();
  // Finish native crypto and its continuation before checking for late effects.
  await real.subtle.digest('SHA-256', new Uint8Array(1));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(networkCalls, 0); assert.equal(dbCalls, 0);
});
