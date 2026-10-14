const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const E = require('../dist/engine.js');
const S = require('../dist/sync-state.js');
const code = fs.readFileSync(require.resolve('../dist/cloud-client.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const META = 'xunci.cloud.v1';

function initial() {
  return S.validateState({records: E.seed(['resilience', 'alternative'].map(word => ({
    word, firstSeen: '2026-09-24', level: 'A', ipa: '/rɪˈzɪliəns/', meaning: '恢复力', pos: 'n.',
    collocations: [{en: 'build resilience', zh: '提高恢复力'}],
    example: {en: 'Trees build resilience.', zh: '树木提高恢复力。'}
  }))), lastExcel: '2026-10-11', readingState: {assignments: {}, results: {}, completed: {}, excluded: []}, customLessons: []});
}
function learned(input, index = 0, kind = 'studied') {
  const output = copy(input);
  output.records[index] = E.review(output.records[index], {date: '2026-10-14', kind, answer: kind === 'wrong' ? '错误' : undefined});
  return output;
}
function remote(state, revision = state ? 1 : 0, user = 'owner') {
  return {version: 1, user: {id: user, email: user + '@example.com'}, revision,
    updatedAt: revision ? '2026-10-14T04:00:00Z' : null, state: copy(state)};
}
function response(body, status = 200, etag) {
  const tag = etag === undefined && body.user ? '"opaque-' + body.user.id + '-' + body.revision + '"' : etag;
  return {status, ok: status >= 200 && status < 300, json: async () => copy(body),
    headers: {get: name => name === 'ETag' ? tag : null}};
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
function harness({state = initial(), baseline, user = 'owner', fetch, pristine = false} = {}) {
  let local = copy(state), nextTimer = 1;
  const storage = new Map(), timers = new Map(), events = new Map(), calls = [], statuses = [], conflicts = [];
  if (baseline !== undefined) storage.set(META, JSON.stringify({userId: user, revision: 1, baseline}));
  const window = {
    IELTS_SYNC: S, AbortController, document: {hidden: false, addEventListener() {}, removeEventListener() {}},
    localStorage: {getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value)},
    setTimeout(fn, delay) {const id = nextTimer++; timers.set(id, {fn, delay}); return id;},
    clearTimeout: id => timers.delete(id), setInterval: () => 100000, clearInterval() {},
    addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name),
    fetch: async (url, opts) => {calls.push({url, ...opts}); return fetch(url, opts, calls.length);}
  };
  new Function('window', code)(window);
  const client = window.IELTS_CLOUD.create({getState: () => local,
    setState: state => {local = copy(state);}, makeInitialState: initial,
    isPristine: typeof pristine === 'function' ? pristine : () => pristine,
    onStatus: status => statuses.push(status), onConflict: conflict => conflicts.push(conflict)});
  return {window, client, calls, storage, statuses, conflicts, timers,
    state: () => copy(local), change: next => {local = copy(next);},
    runDebounce() {const item = [...timers.entries()].find(([, timer]) => timer.delay === 1000);
      assert.ok(item, 'a follow-up synchronization was scheduled'); timers.delete(item[0]); item[1].fn();}}
}
const settle = async () => {for (let i = 0; i < 12; i++) await Promise.resolve();};

test('legacy owner records upload to empty cloud with same-origin cookies and opaque If-Match', async () => {
  const local = learned(initial());
  const h = harness({state: local, fetch: async (_, opts) => opts.method === 'PUT'
    ? response(remote(JSON.parse(opts.body).state, 1)) : response(remote(null))});
  await h.client.start();
  assert.equal(h.client.getStatus().status, 'synced');
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].headers['If-Match'], '"opaque-owner-0"');
  assert.equal(h.calls[1].credentials, 'same-origin');
  assert.equal(JSON.parse(h.calls[1].body).baseRevision, 0);
  assert.deepEqual(h.state(), local);
  assert.deepEqual(JSON.parse(h.storage.get(META)).baseline, local);
  h.client.stop();
});

test('initial cloud records download only when local state is explicitly pristine', async () => {
  const cloud = learned(initial());
  const h = harness({pristine: true, fetch: async () => response(remote(cloud, 4))});
  await h.client.start();
  assert.deepEqual(h.state(), cloud);
  assert.equal(h.calls.length, 1);
  assert.equal(h.client.getStatus().revision, 4);
  h.client.stop();
});

test('different existing records without a baseline require explicit conflict resolution', async () => {
  const cloud = learned(initial(), 1), local = learned(initial(), 0);
  const h = harness({state: local, fetch: async () => response(remote(cloud))});
  await h.client.start();
  assert.equal(h.client.getStatus().status, 'conflict');
  assert.deepEqual(h.client.getConflict().remote, cloud);
  assert.deepEqual(h.state(), local);
  assert.equal(h.calls.length, 1, 'no overwrite occurred');
  h.client.stop();
});

test('edits made during GET are captured after GET before the upload decision', async () => {
  const base = initial(), get = deferred();
  const h = harness({baseline: base, fetch: async (_, opts) => opts.method === 'PUT'
    ? response(remote(JSON.parse(opts.body).state, 2)) : get.promise});
  const task = h.client.start();
  await settle();
  const changed = learned(base);
  h.change(changed);
  get.resolve(response(remote(base)));
  await task;
  assert.deepEqual(JSON.parse(h.calls[1].body).state, changed);
  assert.deepEqual(h.state(), changed);
  h.client.stop();
});

test('edits made during PUT survive and only the uploaded snapshot becomes the baseline', async () => {
  const first = learned(initial()), put = deferred();
  let cloud = null, revision = 0, puts = 0;
  const h = harness({state: first, fetch: async (_, opts) => {
    if (opts.method !== 'PUT') return response(remote(cloud, revision));
    const snapshot = JSON.parse(opts.body).state;
    if (++puts === 1) {cloud = snapshot; revision = 1; return put.promise;}
    cloud = snapshot; revision = 2; return response(remote(cloud, revision));
  }});
  const task = h.client.start();
  await settle();
  assert.equal(puts, 1);
  const second = learned(first, 1);
  h.change(second); h.client.queue();
  put.resolve(response(remote(first)));
  await task;
  assert.deepEqual(h.state(), second, 'PUT acknowledgement must not restore an older state');
  assert.deepEqual(JSON.parse(h.storage.get(META)).baseline, first);
  h.runDebounce();
  await h.client.sync();
  assert.deepEqual(cloud, second);
  assert.deepEqual(JSON.parse(h.storage.get(META)).baseline, second);
  h.client.stop();
});

test('independent whole-word edits merge without replaying or synthesizing answers', async () => {
  const base = initial(), local = learned(base, 0), cloud = learned(base, 1);
  const h = harness({state: local, baseline: base, fetch: async (_, opts) => opts.method === 'PUT'
    ? response(remote(JSON.parse(opts.body).state, 3)) : response(remote(cloud, 2))});
  await h.client.start();
  assert.equal(h.client.getStatus().status, 'synced');
  assert.equal(h.state().records[0].contacts, 2);
  assert.equal(h.state().records[1].contacts, 2);
  assert.equal(h.state().records[0].reviewHistory.length, 1);
  assert.equal(h.state().records[1].reviewHistory.length, 1);
  h.client.stop();
});

test('concurrent changes to the same whole word stop with a conflict', async () => {
  const base = initial(), local = learned(base), cloud = learned(base, 0, 'wrong');
  const h = harness({state: local, baseline: base, fetch: async () => response(remote(cloud, 2))});
  await h.client.start();
  assert.equal(h.client.getStatus().status, 'conflict');
  assert.ok(h.client.getConflict().conflicts[0].path.startsWith('records.'));
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.state(), local);
  h.client.stop();
});

test('a stale CAS retries a safe independent merge with the newest revision and ETag', async () => {
  const base = initial(), local = learned(base), cloud = learned(base, 1);
  let puts = 0;
  const h = harness({state: local, baseline: base, fetch: async (_, opts) => {
    if (opts.method !== 'PUT') return response(remote(base));
    if (++puts === 1) return response(remote(cloud, 2), 409);
    return response(remote(JSON.parse(opts.body).state, 3));
  }});
  await h.client.start();
  assert.equal(h.client.getStatus().status, 'synced');
  assert.equal(JSON.parse(h.calls[2].body).baseRevision, 2);
  assert.equal(h.calls[2].headers['If-Match'], '"opaque-owner-2"');
  assert.equal(h.state().records[0].contacts, 2);
  assert.equal(h.state().records[1].contacts, 2);
  h.client.stop();
});

test('local conflict resolution fetches the latest version and preserves changes made during its PUT', async () => {
  const local = learned(initial()), cloud = learned(initial(), 1), latestCloud = learned(cloud, 0, 'wrong');
  const pendingPut = deferred();
  let gets = 0;
  const h = harness({state: local, fetch: async (_, opts) => opts.method === 'PUT'
    ? pendingPut.promise : response(remote(++gets === 1 ? cloud : latestCloud, gets === 1 ? 1 : 6))});
  await h.client.start();
  const resolving = h.client.resolveConflict('local');
  await settle();
  assert.equal(JSON.parse(h.calls[2].body).baseRevision, 6);
  assert.equal(h.calls[2].headers['If-Match'], '"opaque-owner-6"');
  const newer = learned(local, 1);
  h.change(newer); h.client.queue();
  pendingPut.resolve(response(remote(local, 7)));
  await resolving;
  assert.deepEqual(h.state(), newer);
  assert.deepEqual(JSON.parse(h.storage.get(META)).baseline, local);
  h.client.stop();
});

test('412 account guard refetches and switches accounts without uploading previous-owner state', async () => {
  const oldLocal = learned(initial()), newCloud = learned(initial(), 1);
  let gets = 0;
  const h = harness({state: oldLocal, baseline: initial(), fetch: async (_, opts) => {
    if (opts.method === 'PUT') return response({error: 'account_or_revision_tag_mismatch'}, 412, null);
    return response(++gets === 1 ? remote(initial()) : remote(newCloud, 3, 'second-owner'));
  }});
  await h.client.start();
  assert.deepEqual(h.state(), newCloud);
  assert.equal(h.client.getStatus().user.id, 'second-owner');
  assert.equal(h.calls.filter(x => x.method === 'PUT').length, 1);
  const archived = JSON.parse(h.storage.get(META + '.account.owner'));
  assert.deepEqual(archived.state, oldLocal);
  assert.equal(JSON.parse(h.storage.get(META)).userId, 'second-owner');
  h.client.stop();
});

test('missing API, unauthorized, offline and missing ETag never erase or upload local state', async () => {
  for (const scenario of [
    {status: 'unavailable', reply: () => response({}, 404)},
    {status: 'unauthorized', reply: () => response({}, 401)},
    {status: 'offline', reply: () => {throw new Error('offline');}},
    {status: 'unavailable', reply: () => response(remote(null), 200, null)}
  ]) {
    const local = learned(initial());
    const h = harness({state: local, fetch: async () => scenario.reply()});
    await h.client.start();
    assert.equal(h.client.getStatus().status, scenario.status);
    assert.deepEqual(h.state(), local);
    assert.equal(h.calls.length, 1);
    h.client.stop();
  }
});

test('stopped client ignores late GET responses', async () => {
  const get = deferred(), cloud = learned(initial());
  const h = harness({pristine: true, fetch: async () => get.promise});
  const task = h.client.start();
  await settle(); h.client.stop();
  const count = h.statuses.length;
  get.resolve(response(remote(cloud)));
  await task;
  assert.deepEqual(h.state(), initial());
  assert.equal(h.statuses.length, count);
});

test('cloud lessons are validated and returned separately from user learning state', async () => {
  const h = harness({fetch: async url => {assert.equal(url, '/api/lessons'); return response({version: 1, lessons: []});}});
  assert.deepEqual(await h.window.IELTS_CLOUD.loadLessons(), []);
  assert.deepEqual(h.state(), initial());
});
