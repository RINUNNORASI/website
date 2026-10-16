const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {DatabaseSync} = require('node:sqlite');
const E = require('../dist/engine.js');
const S = require('../dist/sync-state.js');
const handler = import('../worker/index.mjs').then(module => module.default);
const ORIGIN = 'https://example.chatgpt.site';

// Emulate D1's prepared/bound API with SQLite itself, so SQL/CAS behavior is real.
class FakeD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    const migrations = fs.readdirSync(path.join(__dirname, '../drizzle')).filter(file => file.endsWith('.sql')).sort();
    for (const migration of migrations) this.sqlite.exec(fs.readFileSync(path.join(__dirname, '../drizzle', migration), 'utf8'));
  }
  prepare(sql) {
    const statement = this.sqlite.prepare(sql);
    let values = [];
    return {
      bind(...params) { values = params; return this; },
      async first() { return statement.get(...values) || null; },
      async all() { return {results: statement.all(...values), success: true}; },
      async run() { return {success: true, meta: statement.run(...values)}; },
    };
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  close() { this.sqlite.close(); }
}

function word(name = 'resilience') {
  return E.seed([{word: name, firstSeen: '2026-09-24', level: 'A', ipa: '/rɪˈzɪliəns/',
    meaning: '恢复力', pos: 'n.', batch: '第一批', family: 'resilient', memory: '词族记忆',
    collocations: [{en: 'build resilience', zh: '提高恢复力'}],
    example: {en: 'Trees build resilience.', zh: '树木提高恢复力。'}}])[0];
}
function state(records = [word()]) {
  return {records, lastExcel: '2026-10-11', readingState: {assignments: {}, results: {}, completed: {}, excluded: []},
    customLessons: []};
}
function request(method = 'GET', body, options = {}) {
  const headers = new Headers({'oai-authenticated-user-id': options.user || 'account-one',
    'oai-authenticated-user-email': 'learner@example.com'});
  if (method !== 'GET') { headers.set('Content-Type', 'application/json'); headers.set('Origin', ORIGIN); }
  if (options.headers) for (const [key, value] of Object.entries(options.headers)) {
    if (value === null) headers.delete(key); else headers.set(key, value);
  }
  return new Request(ORIGIN + (options.path || '/api/learning-state'), {method, headers,
    ...(body === undefined ? {} : {body: typeof body === 'string' ? body : JSON.stringify(body)})});
}
async function run(db, req) { return (await handler).fetch(req, db ? {DB: db, EDITOR_EMAIL: 'learner@example.com'} : {}); }

test('public readers and anonymous callers cannot publish shared lessons or word cards', async t => {
  const db = new FakeD1(); t.after(() => db.close());
  for (const path of ['/api/lessons', '/api/word-cards']) {
    const writer = {'X-Xunci-Lesson-Writer': '1'};
    const anonymous = await run(db, request('POST', {}, {path,
      headers: {...writer, 'oai-authenticated-user-id': null}}));
    assert.equal(anonymous.status, 401);
    const reader = await run(db, request('POST', {}, {path, user: 'another-reader',
      headers: {...writer, 'oai-authenticated-user-email': 'reader@example.com'}}));
    assert.equal(reader.status, 403);
    assert.deepEqual(await reader.json(), {error: 'editor_required'});
    const unconfigured = await (await handler).fetch(request('POST', {}, {path, headers: writer}), {DB: db});
    assert.equal(unconfigured.status, 503);
  }
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM lessons').get().n, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM word_cards').get().n, 0);
});
async function tag(db, user = 'account-one', revision = 0) {
  const response = await run(db, request('GET', undefined, {user}));
  const snapshot = await response.json();
  assert.equal(snapshot.revision, revision);
  return response.headers.get('ETag');
}
function put(baseRevision, snapshot, etag, options = {}) {
  return request('PUT', {version: 1, baseRevision, state: snapshot},
    {...options, headers: {'If-Match': etag, ...(options.headers || {})}});
}

test('unauthenticated requests never get identity or database data; DB errors fail closed', async () => {
  const response = await run(null, request('GET', undefined, {headers: {'oai-authenticated-user-id': null}}));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {error: 'authentication_required', signInPath: '/signin-with-chatgpt?return_to=%2F'});
  const unavailable = await run(null, request());
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get('Cache-Control'), 'private, no-store');
  const throwing = {prepare() { throw new Error('private sql/payload details'); }};
  const failed = await run(throwing, request());
  assert.equal(failed.status, 500);
  assert.equal(await failed.text(), '{"error":"storage_error"}');
});

test('first save stores canonical full state and changes the revision without inventing progress', async t => {
  const db = new FakeD1(); t.after(() => db.close());
  const etag = await tag(db);
  assert.match(etag, /^"xunci-[a-f0-9]{24}-0"$/);
  const initial = await run(db, request());
  assert.equal(initial.headers.get('X-Xunci-State-Tag'), etag);
  const snapshot = state();
  const response = await run(db, put(0, snapshot, etag));
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.revision, 1);
  assert.equal(saved.user.id, 'account-one');
  assert.deepEqual(saved.state, S.validateState(snapshot));
  assert.equal(saved.state.records[0].contacts, 1);
  assert.equal(saved.state.records[0].reviewHistory.length, 0);
  assert.deepEqual(saved.state.preferences, S.DEFAULT_PREFERENCES);
  assert.match(saved.updatedAt, /^\d{4}-/);
  const latest = await run(db, request());
  assert.deepEqual(await latest.json(), saved);
  assert.equal(latest.headers.get('ETag'), response.headers.get('ETag'));
  assert.equal(response.headers.get('X-Xunci-State-Tag'), response.headers.get('ETag'));
  assert.equal(latest.headers.get('X-Xunci-State-Tag'), response.headers.get('X-Xunci-State-Tag'));
  assert.notEqual(latest.headers.get('ETag'), etag);
});

test('account isolation and account-bound If-Match prevent cross-account overwrite', async t => {
  const db = new FakeD1(); t.after(() => db.close());
  const aliceTag = await tag(db);
  const bobTag = await tag(db, 'account-two');
  assert.notEqual(aliceTag, bobTag);
  const wrongAccount = await run(db, put(0, state([word('manage')]), aliceTag, {user: 'account-two'}));
  assert.equal(wrongAccount.status, 412);
  assert.equal((await run(db, request('GET', undefined, {user: 'account-two'}))).status, 200);
  const bobEmpty = await (await run(db, request('GET', undefined, {user: 'account-two'}))).json();
  assert.equal(bobEmpty.state, null);
  assert.equal((await run(db, put(0, state(), aliceTag))).status, 200);
  assert.equal((await run(db, put(0, state([word('manage')]), bobTag, {user: 'account-two'}))).status, 200);
  const alice = await (await run(db, request())).json();
  const bob = await (await run(db, request('GET', undefined, {user: 'account-two'}))).json();
  assert.equal(alice.state.records[0].word, 'resilience');
  assert.equal(bob.state.records[0].word, 'manage');
});

test('gateway-weakened transport ETags save while exact account/revision and atomic CAS remain enforced', async t => {
  const db = new FakeD1(); t.after(() => db.close());
  const zeroTag = await tag(db);
  const otherAccountTag = await tag(db, 'account-two');
  const crossAccount = await run(db, put(0, state(), 'W/' + otherAccountTag));
  assert.equal(crossAccount.status, 412);
  for (const invalid of ['*', 'w/' + zeroTag, 'W/ ' + zeroTag, zeroTag + ', W/' + zeroTag]) {
    assert.equal((await run(db, put(0, state(), invalid))).status, 412);
  }
  const saved = await run(db, put(0, state(), 'W/' + zeroTag));
  assert.equal(saved.status, 200, 'the exact production gateway W/ wrapper is compatible');
  const oneTag = saved.headers.get('X-Xunci-State-Tag');
  assert.match(oneTag, /^"xunci-[a-f0-9]{24}-1"$/);
  assert.equal(oneTag, saved.headers.get('ETag'));
  const wrongRevision = await run(db, put(1, state(), 'W/' + zeroTag));
  assert.equal(wrongRevision.status, 412, 'the token revision must match the request baseRevision');
  const stale = await run(db, put(0, state([word('manage')]), 'W/' + zeroTag));
  assert.equal(stale.status, 409, 'a valid old token is still rejected by revision CAS');
  assert.equal(stale.headers.get('X-Xunci-State-Tag'), oneTag);
  const staleSnapshot = await stale.json();
  assert.equal(staleSnapshot.revision, 1);
  assert.equal(staleSnapshot.state.records[0].word, 'resilience');
  const updated = await run(db, put(1, state([word('manage')]), 'W/' + oneTag));
  assert.equal(updated.status, 200);
  assert.ok(updated.headers.get('X-Xunci-State-Tag').endsWith('-2"'));
  const otherEmpty = await (await run(db, request('GET', undefined, {user: 'account-two'}))).json();
  assert.equal(otherEmpty.revision, 0);
  assert.equal(otherEmpty.state, null);
});

test('concurrent insert and revision CAS reject stale writers and return only their account remote state', async t => {
  const db = new FakeD1(); t.after(() => db.close());
  const zeroTag = await tag(db);
  const [first, second] = await Promise.all([run(db, put(0, state(), zeroTag)),
    run(db, put(0, state([word('manage')]), zeroTag))]);
  assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  const current = await (await run(db, request())).json();
  const oneTag = await tag(db, 'account-one', 1);
  const realAnswer = E.review(current.state.records[0], {kind: 'wrong', date: '2026-10-14', answer: '危险'});
  const committed = await run(db, put(1, state([realAnswer]), oneTag));
  assert.equal(committed.status, 200);
  const stale = await run(db, put(1, state(), oneTag));
  assert.equal(stale.status, 409);
  const latest = await stale.json();
  assert.equal(latest.revision, 2);
  assert.equal(latest.state.records[0].errors.length, 1);
  assert.equal(latest.state.records[0].reviewHistory[0].answer, '危险');
  assert.equal(stale.headers.get('ETag'), committed.headers.get('ETag'));
  const badTag = await run(db, put(2, state(), oneTag));
  assert.equal(badTag.status, 412);
});

test('state PUT requires same-origin JSON, account revision tag, strict payload and bounded bytes', async t => {
  const db = new FakeD1(); t.after(() => db.close());
  const etag = await tag(db);
  const cases = [
    [put(0, state(), etag, {headers: {Origin: null}}), 403],
    [put(0, state(), etag, {headers: {Origin: 'https://other.example'}}), 403],
    [put(0, state(), etag, {headers: {'Content-Type': 'text/plain'}}), 415],
    [put(0, state(), null), 428],
    [request('PUT', '{oops', {headers: {'If-Match': etag}}), 400],
    [request('PUT', {version: 1, baseRevision: 0, state: state(), userId: 'account-two'}, {headers: {'If-Match': etag}}), 400],
    [put(-1, state(), etag), 400],
    [put(0, {...state(), fabricatedScore: 100}, etag), 400],
    [request('PUT', ' '.repeat(1024 * 1024 + 1), {headers: {'If-Match': etag}}), 413],
    [request('PUT', '中'.repeat(400000), {headers: {'If-Match': etag}}), 413],
    [put(0, state(), etag, {headers: {'Content-Length': '1048577'}}), 413],
  ];
  for (const [req, expected] of cases) assert.equal((await run(db, req)).status, expected);
  const fabricated = state(); fabricated.records[0].contacts = 10;
  assert.equal((await run(db, put(0, fabricated, etag))).status, 400);
  const dangerous = JSON.stringify({version: 1, baseRevision: 0, state: state()}).replace('"state":{', '"state":{"__proto__":{},');
  assert.equal((await run(db, request('PUT', dangerous, {headers: {'If-Match': etag}}))).status, 400);
  assert.equal((await (await run(db, request())).json()).revision, 0);
});

test('corrupt stored state is rejected without exposing unvalidated JSON', async t => {
  const db = new FakeD1(); t.after(() => db.close());
  const etag = await tag(db);
  await run(db, put(0, state(), etag));
  db.sqlite.exec("UPDATE learning_state SET payload_json = '{\"privateBrokenPayload\":true}'");
  const response = await run(db, request());
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {error: 'stored_state_invalid'});
});

function fixtureLesson() {
  const context = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/reading-data.js'), 'utf8'), context);
  const lesson = JSON.parse(JSON.stringify(context.window.READING_LESSONS[0]));
  lesson.learningDate = '2026-10-14';
  lesson.article = {paragraphs: [
    {id: 'p1', text: 'Test-only paragraph one for validating the publishing structure.'},
    {id: 'p2', text: 'Test-only paragraph two for validating the publishing structure.'},
    {id: 'p3', text: 'Test-only paragraph three for validating the publishing structure.'}],
    license: {name: 'Public domain test fixture', url: 'https://example.com/license', permission: 'public-domain'}};
  for (const question of lesson.questions) {
    if (question.evidenceParagraphIds !== undefined) question.evidenceParagraphIds = ['p1'];
    if (question.locator !== undefined) question.locator = [{paragraphId: 'p1'}];
    if (Array.isArray(question.location)) question.location = [{paragraphId: 'p1'}];
  }
  return lesson;
}

test('shared daily lessons validate full passage, have one immutable date, and reject cross-origin writes', async t => {
  const db = new FakeD1(); t.after(() => db.close());
  const lesson = fixtureLesson();
  const publish = (value, headers = {}) => request('POST', {lesson: value}, {path: '/api/lessons',
    headers: {'X-Xunci-Lesson-Writer': '1', Origin: null, ...headers}});
  assert.equal((await run(db, publish(lesson, {'X-Xunci-Lesson-Writer': null}))).status, 403);
  assert.equal((await run(db, publish(lesson, {Origin: 'https://other.example'}))).status, 403);
  assert.equal((await run(db, publish({...lesson, article: undefined}))).status, 400);
  assert.equal((await run(db, publish({...lesson, learningDate: '2026-02-30'}))).status, 400);
  const missingParagraph = structuredClone(lesson);
  missingParagraph.questions[0].evidenceParagraphIds = ['missing-p'];
  assert.equal((await run(db, publish(missingParagraph))).status, 400);
  const noLicense = structuredClone(lesson); noLicense.article.license.permission = 'unknown';
  assert.equal((await run(db, publish(noLicense))).status, 400);
  const response = await run(db, publish(lesson));
  assert.equal(response.status, 201);
  assert.equal((await run(db, publish({...lesson, id: 'another-id'}))).status, 409);
  const saved = await run(db, request('GET', undefined, {path: '/api/lessons'}));
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).lessons, [lesson]);
  assert.equal((await (await run(db, request())).json()).revision, 0, 'editorial publishing cannot mutate personal progress');
});

test('pronunciation fetches only fixed dictionary entries and accepts explicitly UK audio only', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let fetched;
  global.fetch = async url => { fetched = url; return new Response(JSON.stringify([{word: 'resilience', phonetics: [
    {text: '/US-only/', audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/resilience-us.mp3'},
    {text: '/rɪˈzɪliəns/', audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/resilience-uk.mp3'}]}])); };
  const pronounce = word => run(null, request('GET', undefined, {path: '/api/pronunciation?word=' + encodeURIComponent(word)}));
  const valid = await (await pronounce('Resilience')).json();
  assert.equal(fetched, 'https://api.dictionaryapi.dev/api/v2/entries/en/resilience');
  assert.equal(valid.available, true);
  assert.equal(valid.accent, 'UK');
  assert.equal(valid.ipa, '/rɪˈzɪliəns/');
  assert.ok(valid.audioUrl.endsWith('-uk.mp3'));
  assert.equal((await pronounce('https://other.example')).status, 400);
  global.fetch = async () => new Response(JSON.stringify([{word: 'resilience', phonetics: [
    {audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/resilience-us.mp3'},
    {audio: 'https://other.example/resilience-uk.mp3'},
    {accent: 'UK', audio: 'https://api.dictionaryapi.dev/media/pronunciations/en/resilience-us.mp3'}]}]));
  const unavailable = await (await pronounce('resilience')).json();
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.reason, 'verified_uk_audio_unavailable');
  global.fetch = async () => { throw new Error('network unavailable'); };
  assert.equal((await (await pronounce('resilience')).json()).reason, 'dictionary_unavailable');
});

test('embedded static assets and instructions work without DB or identity and honor HEAD', async t => {
  global.SITE_ASSETS = {'/index.html': {body: '<h1>循词</h1>', type: 'text/html; charset=utf-8'},
    '/docs/DAILY_REQUIREMENTS.md': {body: 'Daily verified reading rules', type: 'text/markdown'}};
  t.after(() => { delete global.SITE_ASSETS; });
  const home = await run(null, request('GET', undefined, {path: '/'}));
  assert.equal(home.status, 200);
  assert.equal(await home.text(), '<h1>循词</h1>');
  assert.equal(home.headers.get('X-Content-Type-Options'), 'nosniff');
  const head = await run(null, request('HEAD', undefined, {path: '/'}));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const instructions = await run(null, request('GET', undefined, {path: '/api/daily-instructions'}));
  assert.equal(await instructions.text(), 'Daily verified reading rules');
  assert.equal((await run(null, request('GET', undefined, {path: '/unknown'}))).status, 404);
  assert.equal((await run(null, request('GET', undefined, {path: '/api/unknown'}))).status, 404);
});

function mcpRequest(method, params = {}, options = {}) {
  return request('POST', {jsonrpc: '2.0', id: 123, method, params}, {path: '/mcp',
    headers: {Origin: null, ...(options.headers || {})}, ...options});
}
async function mcpCall(db, name, args = {}, options = {}) {
  const response = await run(db, mcpRequest('tools/call', {name, arguments: args}, options));
  const rpc = await response.json();
  assert.equal(rpc.jsonrpc, '2.0');
  assert.equal(rpc.id, 123);
  return {response, rpc, data: rpc.result ? JSON.parse(rpc.result.content[0].text) : null};
}
function card(word = 'resilience') {
  return {word, ipa: '/rɪˈzɪliəns/', meaning: '恢复力；适应能力', pos: 'n.', family: 'resilient adj.',
    memory: '将名词 resilience 和形容词 resilient 放在同一词族学习。',
    collocations: [{en: 'build resilience', zh: '增强恢复力'}, {en: 'urban resilience', zh: '城市韧性'}],
    synonyms: 'adaptability 强调适应变化，resilience 强调受挫后的恢复。',
    example: {en: 'The city needs greater resilience.', zh: '这座城市需要更强的恢复能力。'}, level: 'A',
    source: {title: 'Teaching card source', url: 'https://example.com/dictionary/resilience'},
    senses: [{meaning: '受挫后恢复的能力', en: 'The team showed resilience.', zh: '这个团队展现了恢复能力。'}]};
}

test('MCP discovery and tools listing use stateless JSON-RPC and require identity for tool access', async t => {
  const db = new FakeD1(); t.after(() => db.close());
  const discovery = await (await run(db, mcpRequest('server/discover'))).json();
  assert.deepEqual(discovery.result.supportedVersions, ['2026-07-28']);
  assert.deepEqual(discovery.result.capabilities, {tools: {}});
  const listing = await (await run(db, mcpRequest('tools/list'))).json();
  assert.deepEqual(listing.result.tools.map(tool => tool.name), ['get_daily_learning_instructions',
    'list_reading_lessons', 'get_learning_summary', 'publish_reading_lesson', 'get_word_cards', 'publish_word_cards']);
  for (const tool of listing.result.tools) {
    assert.equal(tool.inputSchema.type, 'object');
    assert.ok(tool.title && tool.description);
  }
  const unauthenticated = await mcpCall(db, 'get_learning_summary', {}, {headers: {'oai-authenticated-user-id': null}});
  assert.equal(unauthenticated.rpc.result.isError, true);
  assert.deepEqual(unauthenticated.data, {error: 'authentication_required'});
  const missingIdentityListing = await (await run(db, mcpRequest('tools/list', {}, {headers: {'oai-authenticated-user-id': null}}))).json();
  assert.equal(missingIdentityListing.error.code, -32001);
  const invalid = await run(db, request('POST', '{invalid json', {path: '/mcp'}));
  assert.equal((await invalid.json()).error.code, -32700);
  const unknown = await mcpCall(db, 'unknown_tool');
  assert.equal(unknown.rpc.result.isError, true);
  assert.equal(unknown.data.error, 'unknown_tool');
  const crossOrigin = await mcpCall(db, 'get_learning_summary', {}, {headers: {Origin: 'https://other.example'}});
  assert.equal(crossOrigin.rpc.result.isError, true);
  assert.equal(crossOrigin.data.error, 'same_origin_required');
});

test('MCP can publish/read daily lessons and cards while keeping personal learning state unchanged', async t => {
  const db = new FakeD1(); t.after(() => db.close());
  global.SITE_ASSETS = {'/docs/DAILY_REQUIREMENTS.md': {body: 'Verified daily IELTS rules', type: 'text/markdown'}};
  global.SITE_SEED_LESSONS = [{id: 'seed', title: 'Seed reading', url: 'https://example.com/article', source: 'Seed source', published: '2026-10-01'}];
  t.after(() => { delete global.SITE_ASSETS; delete global.SITE_SEED_LESSONS; });
  const instructions = await mcpCall(db, 'get_daily_learning_instructions');
  assert.deepEqual(instructions.data, {instructions: 'Verified daily IELTS rules'});
  const published = await mcpCall(db, 'publish_reading_lesson', {lesson: fixtureLesson()});
  assert.equal(published.rpc.result.isError, false);
  const duplicate = await mcpCall(db, 'publish_reading_lesson', {lesson: fixtureLesson()});
  assert.equal(duplicate.rpc.result.isError, true);
  assert.equal(duplicate.data.error, 'lesson_already_exists');
  const listed = await mcpCall(db, 'list_reading_lessons');
  assert.equal(listed.data.lessons.length, 2);
  assert.ok(listed.data.lessons.every(lesson => !('questions' in lesson) && !('article' in lesson)));
  assert.equal(listed.data.lessons.find(lesson => lesson.id === fixtureLesson().id).license.permission, 'public-domain');
  const posted = await mcpCall(db, 'publish_word_cards', {cards: [card()]});
  assert.equal(posted.rpc.result.isError, false);
  assert.equal(posted.data.publishedCount, 1);
  const get = await mcpCall(db, 'get_word_cards');
  assert.deepEqual(get.data.cards, [card()]);
  const api = await (await run(db, request('GET', undefined, {path: '/api/word-cards'}))).json();
  assert.deepEqual(api.cards, []);
  const empty = await mcpCall(db, 'get_learning_summary');
  assert.equal(empty.data.hasCloudState, false);
  assert.equal(empty.data.vocabulary.total, 0);
  assert.equal(empty.data.reading.latestActualAnswers, null);
  assert.equal((await (await run(db, request())).json()).revision, 0);
});

test('word card reads disclose only the current account vocabulary and leave every saved state intact', async t => {
  const db = new FakeD1(); t.after(() => db.close());
  await mcpCall(db, 'publish_word_cards', {cards: [card(), card('manage'), card('resident')]});
  const original = S.validateState(state([E.review(word(), {kind: 'studied', date: '2026-10-15'})]));
  const second = S.validateState(state([word('manage')]));
  const insert = db.sqlite.prepare('INSERT INTO learning_state (user_id, revision, payload_json, updated_at) VALUES (?, ?, ?, ?)');
  insert.run('account-one', 7, JSON.stringify(original), '2026-10-15T00:00:00.000Z');
  insert.run('account-two', 3, JSON.stringify(second), '2026-10-15T00:00:00.000Z');
  const before = db.sqlite.prepare('SELECT * FROM learning_state ORDER BY user_id').all();
  for (const [user, expected] of [['account-one', [card()]], ['account-two', [card('manage')]], ['new-account', []]]) {
    const response = await run(db, request('GET', undefined, {path: '/api/word-cards', user}));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.deepEqual(await response.json(), {version: 1, cards: expected});
  }
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM learning_state ORDER BY user_id').all(), before);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM word_cards').get().n, 3);
});

test('anonymous word card reads reject before querying a vocabulary or learning-state table', async () => {
  let queries = 0;
  const db = {prepare() { queries++; throw new Error('should not query private records'); }};
  const response = await run(db, request('GET', undefined, {path: '/api/word-cards',
    headers: {'oai-authenticated-user-id': null}}));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'authentication_required');
  assert.equal(queries, 0);
});

test('only the configured editor can read the complete word-card catalog through MCP', async t => {
  const db = new FakeD1(); t.after(() => db.close());
  await mcpCall(db, 'publish_word_cards', {cards: [card(), card('manage')]});
  const editor = await mcpCall(db, 'get_word_cards');
  assert.equal(editor.rpc.result.isError, false);
  assert.deepEqual(editor.data.cards, [card('manage'), card()]);
  const reader = await mcpCall(db, 'get_word_cards', {}, {user: 'account-two',
    headers: {'oai-authenticated-user-email': 'reader@example.com'}});
  assert.equal(reader.rpc.result.isError, true);
  assert.deepEqual(reader.data, {error: 'editor_required'});
});

test('word cards reject personal states, missing content, unsafe sources and canonical duplicates atomically', async t => {
  const db = new FakeD1(); t.after(() => db.close());
  const invalid = [
    {...card(), contacts: 10}, {...card(), status: 'mastered'}, {...card(), firstSeen: '2026-10-14'},
    {...card(), ipa: ''}, {...card(), collocations: [card().collocations[0]]},
    {...card(), source: {title: 'Unsafe', url: 'javascript:alert(1)'}},
    {...card(), example: {en: 'English 中文 mixed', zh: '中文'}},
  ];
  for (const value of invalid) {
    const failed = await mcpCall(db, 'publish_word_cards', {cards: [card('manage'), value]});
    assert.equal(failed.rpc.result.isError, true);
    assert.equal(failed.data.error, 'invalid_word_cards');
  }
  const duplicate = await mcpCall(db, 'publish_word_cards', {cards: [card('resident'), card('Residents')]});
  assert.equal(duplicate.rpc.result.isError, true);
  assert.equal((await mcpCall(db, 'get_word_cards')).data.cards.length, 0);
  const saved = await mcpCall(db, 'publish_word_cards', {cards: [card('Residents')]});
  assert.equal(saved.data.cards[0].word, 'resident');
  const changed = card('resident'); changed.meaning = '居民；居住者';
  const updated = await mcpCall(db, 'publish_word_cards', {cards: [changed]});
  assert.equal(updated.rpc.result.isError, false);
  const stored = await mcpCall(db, 'get_word_cards');
  assert.equal(stored.data.cards.length, 1);
  assert.equal(stored.data.cards[0].meaning, '居民；居住者');
  assert.equal((await (await run(db, request())).json()).state, null);
});

test('MCP personal summary includes only its own real evidence and orders answers by instant', async t => {
  const db = new FakeD1(); t.after(() => db.close());
  const today = E.today();
  const records = E.confirmIntake(E.stageIntake('unknownterm', [word()]).items, [word()], {date: today, batch: '主动提交'});
  records[0] = E.review(records[0], {kind: 'wrong', date: today, answer: '危险'});
  const snapshot = state(records);
  snapshot.readingState.results['2026-10-13|old'] = {date: '2026-10-13', lessonId: 'old',
    submittedAt: '2026-10-14T01:00:00+08:00', answers: {q1: 'FALSE'}};
  snapshot.readingState.results['2026-10-14|latest'] = {date: '2026-10-14', lessonId: 'latest',
    submittedAt: '2026-10-13T20:00:00Z', answers: {q2: 'NOT GIVEN'}};
  const etag = await tag(db);
  assert.equal((await run(db, put(0, snapshot, etag))).status, 200);
  const summary = await mcpCall(db, 'get_learning_summary');
  assert.deepEqual(summary.data.pendingWords, [{word: 'unknownterm', level: 'A', source: '主动提交', firstSeen: today}]);
  assert.equal(summary.data.vocabulary.total, 2);
  assert.equal(summary.data.review.unresolvedErrorWords, 1);
  assert.equal(summary.data.review.recordedWordsToday, 1);
  assert.equal(summary.data.reading.submittedSessions, 2);
  assert.equal(summary.data.reading.confirmedCompletedLessons, 0);
  assert.deepEqual(summary.data.reading.latestActualAnswers.answers, {q2: 'NOT GIVEN'});
  assert.equal(summary.data.reading.latestActualAnswers.lessonId, 'latest');
  assert.ok(!('mastered' in summary.data.vocabulary));
  assert.ok(!('score' in summary.data.reading));
  const another = await mcpCall(db, 'get_learning_summary', {}, {user: 'account-two'});
  assert.equal(another.data.hasCloudState, false);
  assert.equal(another.data.pendingWords.length, 0);
  assert.equal(another.data.reading.latestActualAnswers, null);
});
