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
function harness({state = initial(), baseline, user = 'owner', fetch, pristine = false,
  storageEntries = [], expectedUserId, onAccountMismatch} = {}) {
  let local = copy(state), nextTimer = 1;
  const storage = new Map(storageEntries), timers = new Map(), events = new Map(), calls = [], statuses = [], conflicts = [];
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
    expectedUserId, onAccountMismatch,
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

test('a gateway-weakened ETag cannot replace the dedicated application revision token', async () => {
  const local = learned(initial());
  const h = harness({state: local, fetch: async (_, opts) => {
    const reply = opts.method === 'PUT'
      ? response(remote(JSON.parse(opts.body).state, 1)) : response(remote(null));
    const revision = opts.method === 'PUT' ? 1 : 0;
    reply.headers.get = name => name === 'X-Xunci-State-Tag' ? '"opaque-owner-' + revision + '"'
      : name === 'ETag' ? 'W/"opaque-owner-' + revision + '"' : null;
    return reply;
  }});
  await h.client.start();
  assert.equal(h.calls[1].headers['If-Match'], '"opaque-owner-0"');
  assert.equal(h.client.getStatus().status, 'synced');
  assert.deepEqual(h.state(), local);
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
  assert.equal(h.client.getStatus().status, 'pending');
  const acknowledgementStatuses = h.statuses.length;
  put.resolve(response(remote(first)));
  await task;
  assert.deepEqual(h.state(), second, 'PUT acknowledgement must not restore an older state');
  assert.deepEqual(JSON.parse(h.storage.get(META)).baseline, first);
  assert.equal(h.client.getStatus().status, 'pending', 'an older snapshot acknowledgement cannot claim the latest edit is synced');
  assert.equal(h.statuses.slice(acknowledgementStatuses).some(status => status.status === 'synced'), false);
  h.runDebounce();
  await h.client.sync();
  assert.deepEqual(cloud, second);
  assert.deepEqual(JSON.parse(h.storage.get(META)).baseline, second);
  assert.equal(h.client.getStatus().status, 'synced');
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

function emptyState() {return S.validateState({...initial(), records: []});}

test('account cache never reveals an earlier owner to guests or another email', () => {
  const original = learned(initial()), raw = JSON.stringify(original);
  const h = harness({storageEntries: [['xunci.ielts7.v1', raw],
    [META, JSON.stringify({userId: 'first-owner', revision: 3, baseline: original})]]});
  const cache = h.window.IELTS_CLOUD.createAccountCache({makeInitialState: emptyState});
  assert.deepEqual(cache.read(null), emptyState());
  assert.deepEqual(cache.read('second-owner'), emptyState());
  assert.deepEqual(cache.read('first-owner'), original);
  assert.equal(h.storage.get('xunci.ielts7.v1'), raw, 'retired cache remains available for recovery');
  assert.throws(() => cache.write(null, original), /登录/);
  cache.write('second-owner', emptyState());
  assert.deepEqual(cache.read('first-owner'), original);
  assert.deepEqual(cache.read('second-owner'), emptyState());
  assert.deepEqual(cache.read(null), emptyState());
});

test('unowned legacy state is quarantined and never assigned to the next login', async () => {
  const original = learned(initial()), raw = JSON.stringify(original);
  const h = harness({state: emptyState(), expectedUserId: 'new-owner',
    storageEntries: [['xunci.ielts7.v1', raw]], fetch: async (_, options) => options.method === 'PUT'
      ? response(remote(JSON.parse(options.body).state, 1, 'new-owner')) : response(remote(null, 0, 'new-owner'))});
  const cache = h.window.IELTS_CLOUD.createAccountCache({makeInitialState: emptyState});
  assert.deepEqual(cache.read('new-owner'), emptyState());
  assert.deepEqual(JSON.parse(h.storage.get(META + '.unassigned.v1')).state, original);
  await h.client.start();
  assert.deepEqual(JSON.parse(h.calls.find(call => call.method === 'PUT').body).state.records, []);
  assert.equal(h.storage.get('xunci.ielts7.v1'), raw);
  h.client.stop();
});

test('each account retains its own unsynced changes across logout and reload', () => {
  const h = harness(), cache = h.window.IELTS_CLOUD.createAccountCache({makeInitialState: emptyState});
  const first = learned(initial()), second = learned(initial(), 1);
  cache.write('first', first); cache.write('second', second);
  assert.deepEqual(cache.read(null), emptyState());
  const reloaded = h.window.IELTS_CLOUD.createAccountCache({makeInitialState: emptyState});
  assert.deepEqual(reloaded.read('first'), first);
  assert.deepEqual(reloaded.read('second'), second);
});

test('legacy owner migration preserves old account backups and prefers the current shared snapshot', () => {
  const older = initial(), current = learned(older);
  const oldBackup = JSON.stringify({version: 1, userId: 'owner', state: older});
  const h = harness({baseline: older, storageEntries: [['xunci.ielts7.v1', JSON.stringify(current)],
    [META + '.account.owner', oldBackup]]});
  const cache = h.window.IELTS_CLOUD.createAccountCache({makeInitialState: emptyState});
  assert.deepEqual(cache.read('owner'), current);
  assert.equal(h.storage.get(META + '.account.owner'), oldBackup);
  cache.write('owner', learned(current, 1));
  const secondCache = h.window.IELTS_CLOUD.createAccountCache({makeInitialState: emptyState});
  assert.deepEqual(secondCache.read('owner'), learned(current, 1), 'retired cache cannot roll back a newer account cache');
});

test('archive or corrupt account cache failure stops activation without replacing saved records', () => {
  const raw = JSON.stringify(learned(initial()));
  const h = harness({baseline: initial(), storageEntries: [['xunci.ielts7.v1', raw]]});
  h.window.localStorage.setItem = () => {throw new Error('quota');};
  assert.throws(() => h.window.IELTS_CLOUD.createAccountCache({makeInitialState: emptyState}), /暂停/);
  assert.equal(h.storage.get('xunci.ielts7.v1'), raw);
  const other = harness({storageEntries: [[META + '.state.owner', '{broken']]});
  const cache = other.window.IELTS_CLOUD.createAccountCache({makeInitialState: emptyState});
  assert.throws(() => cache.read('owner'), /暂停/);
  assert.equal(other.storage.get(META + '.state.owner'), '{broken');
  assert.deepEqual(cache.read(null), emptyState());
});

test('authenticated sync isolates metadata and ignores a different legacy owner baseline', async () => {
  const empty = emptyState();
  const h = harness({state: empty, baseline: learned(initial()), user: 'previous', expectedUserId: 'current',
    fetch: async (_, options) => options.method === 'PUT'
      ? response(remote(JSON.parse(options.body).state, 1, 'current')) : response(remote(null, 0, 'current'))});
  await h.client.start();
  assert.equal(h.client.getStatus().status, 'synced');
  assert.equal(JSON.parse(h.storage.get(META)).userId, 'previous');
  assert.deepEqual(JSON.parse(h.storage.get(META + '.metadata.current')).baseline.records, []);
  assert.equal(JSON.parse(h.calls.find(call => call.method === 'PUT').body).state.records.length, 0);
  h.client.stop();
});

test('a different authenticated response stops before upload and asks the app to hide the previous account', async () => {
  let mismatches = 0;
  const local = learned(initial());
  const h = harness({state: local, baseline: initial(), expectedUserId: 'owner',
    onAccountMismatch: () => {mismatches++;}, fetch: async () => response(remote(null, 0, 'other'))});
  await h.client.start();
  assert.equal(h.client.getStatus().status, 'account-changed');
  assert.equal(mismatches, 1);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.state(), local, 'the app decides when to hide saved state; sync must never adopt another owner');
  h.client.stop();
});

test('account switches during PUT acknowledgement cannot adopt or synchronize another owner state', async () => {
  let mismatches = 0;
  const local = learned(initial());
  const h = harness({state: local, expectedUserId: 'owner',
    onAccountMismatch: () => {mismatches++;}, fetch: async (_, options) => options.method === 'PUT'
      ? response(remote(initial(), 4, 'other')) : response(remote(null))});
  await h.client.start();
  assert.equal(h.client.getStatus().status, 'account-changed');
  assert.equal(mismatches, 1);
  assert.deepEqual(h.state(), local);
  assert.equal(h.storage.has(META + '.metadata.owner'), true);
  assert.equal(JSON.parse(h.storage.get(META + '.metadata.owner')).baseline, null);
  h.client.stop();
});

test('a newly saved local edit stops showing synced before the debounce or a network response', async () => {
  const base = initial();
  let cloud = base, revision = 1;
  const h = harness({baseline: base, fetch: async (_, options) => {
    if (options.method !== 'PUT') return response(remote(cloud, revision));
    cloud = JSON.parse(options.body).state; revision++;
    return response(remote(cloud, revision));
  }});
  await h.client.start();
  assert.equal(h.client.getStatus().status, 'synced');
  h.change(learned(base)); h.client.queue();
  assert.equal(h.client.getStatus().status, 'pending');
  assert.match(h.client.getStatus().message, /本机.*等待云端确认/);
  assert.equal(h.calls.length, 1, 'the status changes immediately, before the debounced upload starts');
  h.runDebounce(); await h.client.sync();
  assert.equal(h.client.getStatus().status, 'synced');
  assert.deepEqual(cloud, learned(base));
  h.client.stop();
});

test('switching away preserves today\'s new words and earlier immutable owner backups', async () => {
  const older = initial(), current = copy(older);
  current.records = E.confirmIntake([{word: 'private today word', confirmed: true, level: 'A'}], current.records,
    {date: '2026-10-15', batch: 'own explicit intake'});
  const originalBackup = JSON.stringify({version: 1, userId: 'owner', state: older, savedAt: '2026-10-14T00:00:00Z'});
  const h = harness({state: current, baseline: older, storageEntries: [[META + '.account.owner', originalBackup]],
    fetch: async () => response(remote(null, 0, 'second-owner'))});
  await h.client.start();
  assert.equal(h.storage.get(META + '.account.owner'), originalBackup, 'an earlier snapshot remains byte-for-byte unchanged');
  const recovery = [...h.storage.entries()].filter(([key]) => key.startsWith(META + '.account.owner.recovery.'));
  assert.equal(recovery.length, 1);
  assert.deepEqual(JSON.parse(recovery[0][1]).state, current);
  const cache = h.window.IELTS_CLOUD.createAccountCache({makeInitialState: emptyState});
  assert.deepEqual(cache.read('owner'), current, 'returning to the known owner restores its latest unsynced new word');
  assert.deepEqual(cache.read('second-owner'), emptyState());
  assert.equal(h.storage.get(META + '.account.owner'), originalBackup);
  assert.equal(h.calls.filter(call => call.method === 'PUT').length, 0, 'no previous-owner words are uploaded into the new account');
  h.client.stop();
});

test('legacy account backups without a new scoped cache remain recoverable by their exact owner', () => {
  const today = copy(initial());
  today.records = E.confirmIntake([{word: 'today entry', confirmed: true, level: 'B'}], today.records,
    {date: '2026-10-15'});
  const raw = JSON.stringify({version: 1, userId: 'first', state: today, savedAt: '2026-10-15T01:00:00Z'});
  const h = harness({storageEntries: [[META + '.account.first', raw]]});
  const cache = h.window.IELTS_CLOUD.createAccountCache({makeInitialState: emptyState});
  assert.deepEqual(cache.read('second'), emptyState());
  assert.deepEqual(cache.read('first'), today);
  assert.equal(h.storage.get(META + '.account.first'), raw);
  assert.deepEqual(cache.read('first'), today);
  assert.equal(h.storage.get(META + '.account.first'), raw, 'reading and switching never rewrites the recovery source');
});

test('returning owner can synchronize unsent intake using its own archived baseline after another login', async () => {
  const base = initial(), local = learned(base);
  const archived = JSON.stringify({version: 1, userId: 'owner', revision: 1, baseline: base, state: local});
  let cloud = base;
  const h = harness({state: local, expectedUserId: 'owner', storageEntries: [
    [META, JSON.stringify({userId: 'other', revision: 9, baseline: initial()})],
    [META + '.account.owner', archived]
  ], fetch: async (_, options) => {
    if (options.method === 'PUT') cloud = JSON.parse(options.body).state;
    return response(remote(cloud, options.method === 'PUT' ? 2 : 1));
  }});
  await h.client.start();
  assert.equal(h.client.getStatus().status, 'synced');
  assert.deepEqual(cloud, local);
  assert.equal(h.storage.get(META + '.account.owner'), archived);
  h.client.stop();
});
