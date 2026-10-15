const test = require('node:test');
const assert = require('node:assert/strict');
const api = import('../runtime/d1-rest.mjs');
const verifier = import('../scripts/verify-d1-rest.mjs');
const config = {accountId: 'a'.repeat(32), databaseId: '12345678-1234-4123-8123-123456789abc', apiToken: 'private-d1-api-token'};
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
const result = (rows = [], meta = {changes: 0}) => ({success: true, results: rows, meta});
const response = (results, status = 200) => Response.json({success: true, result: results}, {status});

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

function preflightFetch({rollback = true, networkOnFailure = false, cleanupFails = false, returningValid = true} = {}) {
  const calls = [], messages = [];
  let rows = 0;
  const fetchImpl = async (_, options) => {
    const body = JSON.parse(options.body); calls.push(body);
    if (body.batch?.length === 7) return response(body.batch.map(() => result()));
    if (body.sql?.startsWith('SELECT typeof')) return response([result([{integer_type: 'integer', real_type: 'real', null_value: 1, ordered: 1}])]);
    if (body.sql?.startsWith('CREATE TABLE')) return response([result()]);
    if (body.sql?.startsWith('INSERT INTO')) { rows = 1; return response([result([{id: 1, amount: returningValid ? 2.5 : '2.5', optional: null, label: 'first'}])]); }
    if (body.sql?.startsWith('UPDATE ')) return response([result([{amount: 3.75}])]);
    if (body.batch?.length === 3) { rows = 2; return response([result(), result([{id: 1, amount: 4.5}]), result([{count: 2}])]); }
    if (body.batch?.length === 2) {
      if (networkOnFailure) throw new Error(config.apiToken);
      if (!rollback) rows = 3;
      return Response.json({success: false, errors: [{message: 'private SQL constraint details'}]}, {status: 400});
    }
    if (body.sql?.startsWith('SELECT COUNT')) return response([result([{count: rows, uncommitted: rows === 2 ? 0 : 1}])]);
    if (body.sql?.startsWith('DROP TABLE')) {
      if (cleanupFails) throw new Error('private cleanup failure');
      return response([result()]);
    }
    throw new Error('Unexpected request');
  };
  return {fetchImpl, calls, messages};
}

test('remote preflight uses only a random isolated table and read-only application-schema checks', async () => {
  const {createD1Rest} = await api; const {verifyD1Rest} = await verifier;
  const fixture = preflightFetch();
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

test('preflight fails deployment on partial batch execution, invalid RETURNING, or network errors and always attempts cleanup', async () => {
  const {createD1Rest} = await api; const {verifyD1Rest, D1VerificationError} = await verifier;
  for (const options of [{rollback: false}, {returningValid: false}, {networkOnFailure: true}, {cleanupFails: true}]) {
    const fixture = preflightFetch(options);
    await assert.rejects(verifyD1Rest({db: createD1Rest({...config, fetchImpl: fixture.fetchImpl}), log: value => fixture.messages.push(value)}), error =>
      error instanceof D1VerificationError && error.code === 'D1_PREFLIGHT' && error.message.startsWith('D1 REST preflight failed')
      && !error.message.includes(config.apiToken) && !error.message.includes('private'));
    assert.ok(fixture.calls.at(-1).sql.startsWith('DROP TABLE IF EXISTS '));
    assert.equal(fixture.messages.some(value => value.includes('preflight passed')), false);
  }
});
