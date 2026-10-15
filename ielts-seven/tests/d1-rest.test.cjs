const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const api = import('../runtime/d1-rest.mjs');
const verifier = import('../scripts/verify-d1-rest.mjs');
const config = {accountId: 'a'.repeat(32), databaseId: '12345678-1234-4123-8123-123456789abc', apiToken: 'private-d1-api-token'};
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
const result = (rows = [], meta = {changes: 0}) => ({success: true, results: rows, meta});
const response = (results, status = 200) => Response.json({success: true, result: results}, {status});
const discoveryEnv = {CLOUDFLARE_ACCOUNT_ID: config.accountId, CLOUDFLARE_D1_API_TOKEN: config.apiToken};
const database = (name = 'xunci-ielts-db', uuid = config.databaseId) => ({name, uuid});
const discoveryResponse = (rows, info) => Response.json({success: true, result: rows, ...(info === undefined ? {} : {result_info: info})});

test('an explicit database UUID is validated without discovery and an invalid UUID never falls back', async () => {
  const {resolveD1ConfigFromEnv} = await api;
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('must not be called'); };
  assert.deepEqual(await resolveD1ConfigFromEnv({...discoveryEnv, D1_DATABASE_ID: config.databaseId.toUpperCase()}, {fetchImpl}), config);
  for (const id of [' ', '../other', null, 7]) {
    await assert.rejects(resolveD1ConfigFromEnv({...discoveryEnv, D1_DATABASE_ID: id}, {fetchImpl}), {code: 'D1_CONFIG'});
  }
  assert.equal(calls, 0);
});

test('discovery performs a fixed-origin GET and chooses only an exact default or configured database name', async () => {
  const {resolveD1ConfigFromEnv} = await api;
  for (const name of ['xunci-ielts-db', 'My_other-db']) {
    const calls = [];
    const resolved = await resolveD1ConfigFromEnv({...discoveryEnv, D1_DATABASE_ID: '', ...(name === 'xunci-ielts-db' ? {} : {D1_DATABASE_NAME: name})}, {
      fetchImpl: async (url, options) => {
        calls.push({url, options});
        return discoveryResponse([database(`${name}-backup`), database(name, config.databaseId.toUpperCase()), database(name.toUpperCase() + '_other')]);
      }
    });
    assert.deepEqual(resolved, config);
    assert.equal(calls.length, 1);
    const url = new URL(calls[0].url);
    assert.equal(url.origin, 'https://api.cloudflare.com');
    assert.equal(url.pathname, `/client/v4/accounts/${config.accountId}/d1/database`);
    assert.equal(url.searchParams.get('name'), name);
    assert.equal(url.searchParams.get('per_page'), '100');
    assert.equal(url.searchParams.get('page'), '1');
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[0].options.redirect, 'manual');
    assert.equal(calls[0].options.headers.Authorization, `Bearer ${config.apiToken}`);
    assert.equal(calls[0].options.body, undefined);
  }
});

test('discovery refuses missing or ambiguous names and invalid matched UUIDs', async () => {
  const {resolveD1ConfigFromEnv} = await api;
  for (const [rows, code] of [[[], 'D1_DISCOVERY'], [[database('xunci-ielts-db-backup')], 'D1_DISCOVERY'],
    [[database(), database()], 'D1_DISCOVERY'], [[database('xunci-ielts-db', '../not-a-uuid')], 'D1_RESPONSE']]) {
    await assert.rejects(resolveD1ConfigFromEnv(discoveryEnv, {fetchImpl: async () => discoveryResponse(rows)}), {code});
  }
});

test('discovery exhausts explicit pagination before accepting a unique match and catches later duplicates', async () => {
  const {resolveD1ConfigFromEnv} = await api;
  for (const duplicate of [false, true]) {
    const pages = [];
    const fetchImpl = async url => {
      const page = Number(new URL(url).searchParams.get('page')); pages.push(page);
      return discoveryResponse([page === 1 || duplicate ? database() : database('other')], {page, per_page: 100, count: 1, total_pages: 2});
    };
    if (duplicate) await assert.rejects(resolveD1ConfigFromEnv(discoveryEnv, {fetchImpl}), {code: 'D1_DISCOVERY'});
    else assert.deepEqual(await resolveD1ConfigFromEnv(discoveryEnv, {fetchImpl}), config);
    assert.deepEqual(pages, [1, 2]);
  }
  const pages = [];
  assert.deepEqual(await resolveD1ConfigFromEnv(discoveryEnv, {fetchImpl: async url => {
    const page = Number(new URL(url).searchParams.get('page')); pages.push(page);
    return discoveryResponse([page === 1 ? database('other') : database()], {page, per_page: 1, count: 1, total_count: 2});
  }}), config);
  assert.deepEqual(pages, [1, 2]);
});

test('discovery checks an additional page when a metadata-free page is full and bounds pagination', async () => {
  const {resolveD1ConfigFromEnv} = await api;
  let calls = 0;
  assert.deepEqual(await resolveD1ConfigFromEnv(discoveryEnv, {fetchImpl: async () => {
    calls++;
    return discoveryResponse(calls === 1 ? [database(), ...Array.from({length: 99}, (_, i) => database(`other-${i}`))] : []);
  }}), config);
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(resolveD1ConfigFromEnv(discoveryEnv, {fetchImpl: async () => {
    calls++; return discoveryResponse([], {page: calls, per_page: 100, count: 0, total_pages: 101});
  }}), {code: 'D1_DISCOVERY'});
  assert.equal(calls, 100);
});

test('discovery validates credentials, names, transport options, and pagination without leaking values', async () => {
  const {resolveD1ConfigFromEnv} = await api;
  let calls = 0;
  const fetchImpl = async () => { calls++; return discoveryResponse([]); };
  for (const env of [{}, {...discoveryEnv, CLOUDFLARE_ACCOUNT_ID: 'invalid'}, {...discoveryEnv, CLOUDFLARE_D1_API_TOKEN: 'token\nvalue'},
    {...discoveryEnv, D1_DATABASE_NAME: ''}, {...discoveryEnv, D1_DATABASE_NAME: 'wrong name'}, {...discoveryEnv, D1_DATABASE_NAME: null}]) {
    await assert.rejects(resolveD1ConfigFromEnv(env, {fetchImpl}), {code: 'D1_CONFIG'});
  }
  await assert.rejects(resolveD1ConfigFromEnv(discoveryEnv, {fetchImpl, timeoutMs: 0}), {code: 'D1_CONFIG'});
  assert.equal(calls, 0);
  for (const info of [null, {page: 2}, {per_page: 0}, {count: 2}, {total_count: -1}, {total_pages: 1.5}]) {
    await assert.rejects(resolveD1ConfigFromEnv(discoveryEnv, {fetchImpl: async () => discoveryResponse([database()], info)}), {code: 'D1_RESPONSE'});
  }
});

test('discovery rejects redirects, transport and provider failures with sanitized errors', async () => {
  const {resolveD1ConfigFromEnv} = await api;
  const cases = [
    [async () => new Response(config.apiToken, {status: 302, headers: {Location: 'https://other.example'}}), 'D1_HTTP'],
    [async () => new Response(config.apiToken, {status: 403}), 'D1_HTTP'],
    [async () => Response.json({success: false, errors: [{message: config.apiToken}]}), 'D1_DISCOVERY'],
    [async () => new Response(config.apiToken), 'D1_RESPONSE'],
    [async () => { throw new Error(config.apiToken); }, 'D1_NETWORK']
  ];
  for (const [fetchImpl, code] of cases) {
    await assert.rejects(resolveD1ConfigFromEnv(discoveryEnv, {fetchImpl}), error => error.code === code && !error.message.includes(config.apiToken) && !error.cause);
  }
});

test('discovery bounds response size and applies a deadline to both fetch and response streaming', async () => {
  const {resolveD1ConfigFromEnv} = await api;
  let cancelled = false;
  await assert.rejects(resolveD1ConfigFromEnv(discoveryEnv, {fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(1024 * 1024 + 1)); }, cancel() { cancelled = true; }
  }))}), {code: 'D1_RESPONSE'});
  assert.equal(cancelled, true);
  for (const bodyStalls of [false, true]) {
    let signal;
    await assert.rejects(resolveD1ConfigFromEnv(discoveryEnv, {timeoutMs: 15, fetchImpl: async (_, options) => {
      signal = options.signal;
      return bodyStalls ? new Response(new ReadableStream({start() {}})) : new Promise(() => {});
    }}), {code: 'D1_TIMEOUT'});
    assert.equal(signal.aborted, true);
  }
});

test('fixed-origin prepared statements preserve primitive values and support first/all/run', async () => {
  const {createD1Rest} = await api;
  const calls = [];
  const db = createD1Rest({...config, fetchImpl: async (url, options) => {
    calls.push({url, options, body: JSON.parse(options.body)});
    return response([result([{id: 7, optional: null, value: 'visible'}], {changes: 1})]);
  }});
  const unbound = db.prepare('SELECT ?, ?, ?');
  const bound = unbound.bind(7, 2.5, null);
  assert.notEqual(bound, unbound);
  assert.deepEqual(await bound.first(), {id: 7, optional: null, value: 'visible'});
  assert.equal(await bound.first('optional'), null);
  assert.equal(await bound.first('id'), 7);
  assert.deepEqual(await bound.all(), result([{id: 7, optional: null, value: 'visible'}], {changes: 1}));
  assert.deepEqual(await bound.run(), result([{id: 7, optional: null, value: 'visible'}], {changes: 1}));
  await unbound.run();
  for (const call of calls) {
    assert.equal(call.url, endpoint);
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.redirect, 'manual');
    assert.equal(call.options.headers.Authorization, `Bearer ${config.apiToken}`);
    assert.equal(call.options.headers['Content-Type'], 'application/json');
  }
  assert.deepEqual(calls[0].body, {sql: 'SELECT ?, ?, ?', params: [7, 2.5, null]});
  assert.deepEqual(calls.at(-1).body.params, []);
});

test('first returns null for no row and rejects absent columns without exposing row values', async () => {
  const {createD1Rest} = await api;
  let rows = [];
  const db = createD1Rest({...config, fetchImpl: async () => response([result(rows)])});
  assert.equal(await db.prepare('SELECT 1').first(), null);
  rows = [{secret: config.apiToken}];
  await assert.rejects(db.prepare('SELECT 1').first(config.apiToken), error => error.code === 'D1_INPUT' && !error.message.includes(config.apiToken));
});

test('batch preserves statement order in one HTTP request and rejects foreign or fake statements before sending', async () => {
  const {createD1Rest} = await api;
  const calls = [];
  const db = createD1Rest({...config, fetchImpl: async (_, options) => {
    calls.push(JSON.parse(options.body)); return response([result([], {changes: 1}), result([{id: 2}])]);
  }});
  const values = await db.batch([db.prepare('INSERT INTO example VALUES (?)').bind(2), db.prepare('SELECT id FROM example')]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {batch: [{sql: 'INSERT INTO example VALUES (?)', params: [2]}, {sql: 'SELECT id FROM example', params: []}]});
  assert.deepEqual(values, [result([], {changes: 1}), result([{id: 2}])]);
  const other = createD1Rest({...config, fetchImpl: async () => { throw new Error('not called'); }});
  for (const input of [[], [{sql: 'SELECT 1', params: []}], [other.prepare('SELECT 1')], Array(101).fill(db.prepare('SELECT 1'))]) {
    await assert.rejects(db.batch(input), {code: 'D1_INPUT'});
  }
  assert.equal(calls.length, 1);
});

test('invalid configurations and unsupported binds fail locally without leaking supplied values', async () => {
  const {createD1Rest, configFromEnv} = await api;
  for (const settings of [{...config, accountId: 'https://attacker.example'}, {...config, databaseId: '../outside'}, {...config, apiToken: ''},
    {...config, apiToken: 'token\nexfiltrate'}, {...config, timeoutMs: 0}]) {
    assert.throws(() => createD1Rest(settings), {code: 'D1_CONFIG'});
  }
  assert.deepEqual(configFromEnv({CLOUDFLARE_ACCOUNT_ID: config.accountId.toUpperCase(), D1_DATABASE_ID: config.databaseId.toUpperCase(), CLOUDFLARE_D1_API_TOKEN: config.apiToken}), config);
  assert.throws(() => configFromEnv({}), {code: 'D1_CONFIG'});
  let requests = 0;
  const db = createD1Rest({...config, fetchImpl: async () => { requests++; return response([result()]); }});
  for (const value of [undefined, true, false, NaN, Infinity, -Infinity, 1n, [], {}, new Uint8Array([1])]) {
    assert.throws(() => db.prepare('SELECT ?').bind(value), {code: 'D1_INPUT'});
  }
  assert.throws(() => db.prepare('SELECT ?').bind(...Array(101).fill(1)), {code: 'D1_INPUT'});
  assert.throws(() => db.prepare(''), {code: 'D1_INPUT'});
  assert.equal(requests, 0);
});

test('HTTP, top-level, per-statement, and result-count failures reject without exposing provider text', async () => {
  const {createD1Rest} = await api;
  const privateText = config.apiToken + ' SELECT private_sql private_bound_value';
  const cases = [
    [() => Response.json({success: false, errors: [{message: privateText}]}, {status: 403}), 'D1_HTTP'],
    [() => new Response(privateText, {status: 503}), 'D1_HTTP'],
    [() => Response.json({success: false, errors: [{message: privateText}]}, {status: 400}), 'D1_QUERY'],
    [() => Response.json({success: false, errors: [{message: privateText}]}), 'D1_QUERY'],
    [() => Response.json({success: true, result: [{success: false, error: privateText}]}), 'D1_QUERY'],
    [() => response([]), 'D1_RESPONSE'], [() => response([result(), result()]), 'D1_RESPONSE'],
    [() => Response.json({result: [result()]}), 'D1_RESPONSE'],
    [() => Response.json({success: true, result: [{success: true, results: [null]}]}), 'D1_RESPONSE'],
    [() => Response.json({success: true, result: [{success: true, results: [], meta: privateText}]}), 'D1_RESPONSE'],
    [() => new Response(privateText), 'D1_RESPONSE']
  ];
  for (const [makeResponse, code] of cases) {
    let requests = 0;
    const db = createD1Rest({...config, fetchImpl: async () => { requests++; return makeResponse(); }});
    await assert.rejects(db.prepare('SELECT private_sql').bind('private_bound_value').run(), error =>
      error.code === code && !error.message.includes(config.apiToken) && !error.message.includes('private_sql') && !error.message.includes('private_bound_value') && !error.cause);
    assert.equal(requests, 1);
  }
});

test('redirects never forward credentials, and transport failures never retry a potentially committed write', async () => {
  const {createD1Rest} = await api;
  let requests = 0;
  const db = createD1Rest({...config, fetchImpl: async (_, options) => {
    requests++; assert.equal(options.redirect, 'manual');
    return new Response('private provider output', {status: 302, headers: {Location: 'https://attacker.example'}});
  }});
  await assert.rejects(db.prepare('UPDATE example SET value = ?').bind('private-value').run(), {code: 'D1_HTTP'});
  assert.equal(requests, 1);
  const failing = createD1Rest({...config, fetchImpl: async () => { requests++; throw new Error(config.apiToken); }});
  await assert.rejects(failing.prepare('INSERT INTO example VALUES (?)').bind('private-value').run(), error => error.code === 'D1_NETWORK' && !error.message.includes(config.apiToken));
  assert.equal(requests, 2);
});

test('a failed batch never returns earlier successful results, including an abbreviated failure response', async () => {
  const {createD1Rest} = await api;
  for (const results of [[result(), {success: false, error: config.apiToken}], [{success: false, error: config.apiToken}]]) {
    let requests = 0;
    const db = createD1Rest({...config, fetchImpl: async () => { requests++; return response(results); }});
    await assert.rejects(db.batch([db.prepare('INSERT INTO example VALUES (1)'), db.prepare('INSERT INTO example VALUES (1)')]),
      error => error.code === 'D1_QUERY' && !error.message.includes(config.apiToken));
    assert.equal(requests, 1);
  }
});

test('whole-request timeout aborts both a stuck fetch and a stuck response body without retry', async () => {
  const {createD1Rest} = await api;
  for (const bodyStalls of [false, true]) {
    let signal, requests = 0;
    const db = createD1Rest({...config, timeoutMs: 15, fetchImpl: async (_, options) => {
      requests++; signal = options.signal;
      if (!bodyStalls) return new Promise(() => {});
      return new Response(new ReadableStream({start() {}}));
    }});
    await assert.rejects(db.prepare('INSERT INTO example VALUES (1)').run(), {code: 'D1_TIMEOUT'});
    assert.equal(signal.aborted, true);
    assert.equal(requests, 1);
  }
});

test('response and request sizes are bounded, including chunked responses', async () => {
  const {createD1Rest} = await api;
  for (const chunked of [false, true]) {
    let cancelled = false;
    const db = createD1Rest({...config, fetchImpl: async () => new Response(new ReadableStream({
      start(controller) { if (chunked) controller.enqueue(new Uint8Array(16 * 1024 * 1024 + 1)); },
      cancel() { cancelled = true; }
    }), chunked ? {} : {headers: {'content-length': String(16 * 1024 * 1024 + 1)}})});
    await assert.rejects(db.prepare('SELECT 1').run(), {code: 'D1_RESPONSE'});
    assert.equal(cancelled, true);
  }
  let sent = false;
  const db = createD1Rest({...config, fetchImpl: async () => { sent = true; return response([result()]); }});
  await assert.rejects(db.prepare('SELECT ?').bind('x'.repeat(4 * 1024 * 1024)).run(), {code: 'D1_INPUT'});
  assert.equal(sent, false);
});

function preflightFetch({rollback = true, networkOnFailure = false, cleanupFails = false, returningValid = true,
  bindingTypes, integerAffinityValid = true, timestampOrderingValid = true, casIncrementValid = true, staleCasValid = true} = {}) {
  const calls = [], messages = [];
  const sqlite = new DatabaseSync(':memory:');
  const migrations = path.join(__dirname, '../drizzle');
  for (const file of fs.readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(migrations, file), 'utf8'));
  }
  const execute = ({sql, params}) => {
    if (!integerAffinityValid && sql.startsWith('CREATE TABLE')) sql = sql.replace('checked_at INTEGER', 'checked_at TEXT');
    if (!timestampOrderingValid && sql.startsWith('SELECT checked_at')) sql = sql.replace('AND checked_at > ?', 'AND checked_at < ?');
    if (sql.startsWith('UPDATE ') && sql.includes('SET revision = revision + 1')) {
      if (!casIncrementValid) sql = sql.replace('revision = revision + 1', 'revision = revision');
      if (!staleCasValid) sql = sql.replace('AND revision = ?', 'AND revision <= ? + 1');
    }
    let rows = sqlite.prepare(sql).all(...params);
    if (bindingTypes !== undefined && sql.startsWith('SELECT typeof')) rows = [bindingTypes];
    if (!returningValid && sql.startsWith('INSERT INTO') && rows[0]) rows[0].amount = '2.5';
    return result(rows);
  };
  const fetchImpl = async (_, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    if (networkOnFailure && body.batch?.length === 2) throw new Error(config.apiToken);
    if (cleanupFails && body.sql?.startsWith('DROP TABLE')) throw new Error('private cleanup failure');
    const batch = Array.isArray(body.batch);
    if (batch) sqlite.exec('BEGIN');
    try {
      const results = (batch ? body.batch : [body]).map(execute);
      if (batch) sqlite.exec('COMMIT');
      return response(results);
    } catch (_) {
      if (batch) sqlite.exec(rollback ? 'ROLLBACK' : 'COMMIT');
      return Response.json({success: false, errors: [{message: 'private SQL details'}]}, {status: 400});
    }
  };
  return {fetchImpl, calls, messages, close: () => sqlite.close()};
}

test('remote preflight uses only a random isolated table and read-only application-schema checks', async t => {
  const {createD1Rest} = await api; const {verifyD1Rest} = await verifier;
  const fixture = preflightFetch();
  t.after(fixture.close);
  await verifyD1Rest({db: createD1Rest({...config, fetchImpl: fixture.fetchImpl}), log: value => fixture.messages.push(value)});
  assert.equal(fixture.calls[0].batch.length, 7);
  assert.ok(fixture.calls[0].batch.every(query => /^SELECT .+ FROM [a-z_]+ WHERE 0$/.test(query.sql)));
  const create = fixture.calls.find(query => query.sql?.startsWith('CREATE TABLE'));
  const table = create.sql.match(/"(__xunci_render_probe_[a-f0-9]{32})"/)[1];
  const mutations = fixture.calls.flatMap(query => query.batch || [query]).filter(query => !query.sql.startsWith('SELECT '));
  assert.ok(mutations.every(query => query.sql.includes(`"${table}"`)));
  assert.equal(fixture.calls.at(-1).sql, `DROP TABLE IF EXISTS "${table}"`);
  assert.ok(fixture.messages.at(-1).includes('passed'));
});

test('preflight fails deployment on partial batch execution, invalid RETURNING, or network errors and always attempts cleanup', async t => {
  const {createD1Rest} = await api; const {verifyD1Rest, D1VerificationError} = await verifier;
  for (const options of [{rollback: false}, {returningValid: false}, {networkOnFailure: true}, {cleanupFails: true}]) {
    const fixture = preflightFetch(options);
    t.after(fixture.close);
    await assert.rejects(verifyD1Rest({db: createD1Rest({...config, fetchImpl: fixture.fetchImpl}), log: value => fixture.messages.push(value)}), error =>
      error instanceof D1VerificationError && error.code === 'D1_PREFLIGHT' && error.message.startsWith('D1 REST preflight failed')
      && !error.message.includes(config.apiToken) && !error.message.includes('private'));
    assert.ok(fixture.calls.at(-1).sql.startsWith('DROP TABLE IF EXISTS '));
    assert.equal(fixture.messages.some(value => value.includes('preflight passed')), false);
  }
});

test('numeric preflight failure logs only allowlisted synthetic diagnostics and never reaches table creation', async t => {
  const {createD1Rest} = await api; const {verifyD1Rest} = await verifier;
  const cases = [
    [{integer_type: 'text', real_type: 'real', null_value: 1, ordered: 1},
      {integer_type: 'text', real_type: 'real', null_value: 1, ordered: 1}],
    [{integer_type: config.apiToken, real_type: 'text', null_value: config.apiToken, ordered: '1'},
      {integer_type: 'unexpected', real_type: 'text', null_value: 'unexpected', ordered: 'text-1'}],
    [{integer_type: 'integer', real_type: 'real', null_value: null, ordered: true},
      {integer_type: 'integer', real_type: 'real', null_value: 'null', ordered: 'boolean-true'}],
    [{}, {integer_type: 'missing', real_type: 'missing', null_value: 'missing', ordered: 'missing'}]
  ];
  for (const [bindingTypes, expected] of cases) {
    const fixture = preflightFetch({bindingTypes});
    t.after(fixture.close);
    await assert.rejects(verifyD1Rest({db: createD1Rest({...config, fetchImpl: fixture.fetchImpl}), log: value => fixture.messages.push(value)}),
      error => error.code === 'D1_PREFLIGHT' && error.message === 'D1 REST preflight failed during numeric bindings.');
    const diagnostics = fixture.messages.find(value => value.startsWith('D1 REST preflight: synthetic numeric binding diagnostics '));
    assert.deepEqual(JSON.parse(diagnostics.slice(diagnostics.indexOf('{'))), expected);
    assert.ok(fixture.messages.every(value => !value.includes(config.apiToken)));
    assert.equal(fixture.calls.some(query => query.sql?.startsWith('CREATE TABLE') || query.sql?.startsWith('DROP TABLE')), false);
    assert.equal(fixture.calls.length, 2);
  }
});

test('both INTEGER and REAL integer bindings must pass actual SQLite affinity, ordering, large-revision CAS, and rollback', async t => {
  const {createD1Rest} = await api; const {verifyD1Rest} = await verifier;
  for (const integer_type of ['integer', 'real']) {
    const fixture = preflightFetch({bindingTypes: {integer_type, real_type: 'real', null_value: 1, ordered: 1}});
    t.after(fixture.close);
    await verifyD1Rest({db: createD1Rest({...config, fetchImpl: fixture.fetchImpl}), log: value => fixture.messages.push(value)});
    const insert = fixture.calls.find(query => query.sql?.startsWith('INSERT INTO'));
    assert.equal(insert.params[4], 1800000000123);
    assert.equal(insert.params[5], Number.MAX_SAFE_INTEGER - 2);
    const cas = fixture.calls.filter(query => query.sql?.includes('SET revision = revision + 1'));
    assert.equal(cas.length, 2);
    assert.deepEqual(cas[0], cas[1]);
    assert.ok(fixture.messages.some(value => value.includes('stale-write rejection verified')));
  }
});

test('integer affinity, timestamp ordering, revision increment, and stale CAS failures all block deployment and clean up', async t => {
  const {createD1Rest} = await api; const {verifyD1Rest} = await verifier;
  const cases = [
    [{integerAffinityValid: false}, 'integer timestamp and revision affinity'],
    [{timestampOrderingValid: false}, 'integer timestamp and revision comparisons'],
    [{casIncrementValid: false}, 'integer revision compare-and-swap'],
    [{staleCasValid: false}, 'integer revision compare-and-swap']
  ];
  for (const [options, phase] of cases) {
    const fixture = preflightFetch(options);
    t.after(fixture.close);
    await assert.rejects(verifyD1Rest({db: createD1Rest({...config, fetchImpl: fixture.fetchImpl}), log: value => fixture.messages.push(value)}),
      error => error.code === 'D1_PREFLIGHT' && error.message === `D1 REST preflight failed during ${phase}.`);
    assert.ok(fixture.calls.at(-1).sql.startsWith('DROP TABLE IF EXISTS '));
    assert.equal(fixture.messages.some(value => value.includes('preflight passed')), false);
  }
});
