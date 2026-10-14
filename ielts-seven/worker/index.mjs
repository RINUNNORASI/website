import './email-auth.mjs';
// The build embeds engine.js, sync-state.js, and SITE_ASSETS before this module.
// Identity headers below are supplied by the Sites gateway, never the client UI.
const MAX_REQUEST_BYTES = 1024 * 1024;
const API_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Vary': 'Cookie, oai-authenticated-user-id',
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {status, headers: {...API_HEADERS, ...extraHeaders}});
}

class RequestError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

function identity(request) {
  const id = request.headers.get('oai-authenticated-user-id');
  if (!id || !id.trim() || id.length > 512) throw new RequestError(401, 'authentication_required');
  const email = request.headers.get('oai-authenticated-user-email');
  return {id, email: email && email.length <= 512 ? email : null};
}

function requireEditor(request, env) {
  const user = identity(request);
  const allowed = typeof env?.EDITOR_EMAIL === 'string' ? env.EDITOR_EMAIL.trim().toLowerCase() : '';
  if (!allowed) throw new RequestError(503, 'editor_not_configured');
  if (!user.email || user.email.trim().toLowerCase() !== allowed) throw new RequestError(403, 'editor_required');
  return user;
}

function sameOrigin(request, required = true) {
  const origin = request.headers.get('Origin');
  if ((!origin && required) || (origin && origin !== new URL(request.url).origin)) {
    throw new RequestError(403, 'same_origin_required');
  }
}

async function bodyJSON(request) {
  if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw new RequestError(415, 'json_content_type_required');
  }
  const statedLength = request.headers.get('Content-Length');
  if (statedLength && (!/^\d+$/.test(statedLength) || Number(statedLength) > MAX_REQUEST_BYTES)) {
    throw new RequestError(413, 'request_too_large');
  }
  if (!request.body) throw new RequestError(400, 'invalid_json');
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  let size = 0;
  let contents = '';
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new RequestError(413, 'request_too_large');
      }
      contents += decoder.decode(value, {stream: true});
    }
    contents += decoder.decode();
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, 'invalid_json');
  } finally { reader.releaseLock(); }
  try { return JSON.parse(contents); }
  catch (_) { throw new RequestError(400, 'invalid_json'); }
}

function envelope(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !keys.includes(key))) throw new RequestError(400, 'invalid_payload');
}

function database(env) {
  if (!env?.DB || typeof env.DB.prepare !== 'function') throw new RequestError(503, 'storage_unavailable');
  return env.DB;
}

function canonicalState(value, code = 'invalid_learning_state') {
  try { return globalThis.IELTS_SYNC.validateState(value); }
  catch (_) { throw new RequestError(code === 'stored_state_invalid' ? 500 : 400, code); }
}

function validTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

async function stateTag(user, revision) {
  const bytes = new TextEncoder().encode(user.id);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const account = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 24);
  return '"xunci-' + account + '-' + revision + '"';
}

async function stateHeaders(user, revision) {
  const tag = await stateTag(user, revision);
  // Gateways may weaken HTTP ETags when compressing JSON. The application CAS
  // token stays stable in this dedicated header because it identifies account
  // and revision, rather than a byte-for-byte response representation.
  return {ETag: tag, 'X-Xunci-State-Tag': tag};
}

async function readState(db, user) {
  const row = await db.prepare('SELECT revision, payload_json, updated_at FROM learning_state WHERE user_id = ?')
    .bind(user.id).first();
  if (!row) return {version: 1, user, revision: 0, updatedAt: null, state: null};
  if (!Number.isSafeInteger(row.revision) || row.revision < 1 || !validTimestamp(row.updated_at)) {
    throw new RequestError(500, 'stored_state_invalid');
  }
  let parsed;
  try { parsed = JSON.parse(row.payload_json); }
  catch (_) { throw new RequestError(500, 'stored_state_invalid'); }
  return {version: 1, user, revision: row.revision, updatedAt: row.updated_at,
    state: canonicalState(parsed, 'stored_state_invalid')};
}

async function learningState(request, env) {
  const emailAuth = globalThis.XUNCI_EMAIL_AUTH.config(env)
    ? await globalThis.XUNCI_EMAIL_AUTH.identity(request, env) : null;
  const user = emailAuth ? emailAuth.user : identity(request);
  if (!['GET', 'PUT'].includes(request.method)) return json({error: 'method_not_allowed'}, 405, {Allow: 'GET, PUT'});
  if (request.method === 'PUT') sameOrigin(request);
  const db = database(env);
  if (request.method === 'GET') {
    const snapshot = await readState(db, user);
    return json(snapshot, 200, await stateHeaders(user, snapshot.revision));
  }

  const payload = await bodyJSON(request);
  envelope(payload, ['version', 'baseRevision', 'state']);
  if (payload.version !== 1 || !Number.isSafeInteger(payload.baseRevision) || payload.baseRevision < 0
    || payload.baseRevision >= Number.MAX_SAFE_INTEGER) throw new RequestError(400, 'invalid_payload');
  const matchedTag = request.headers.get('If-Match');
  if (!matchedTag) throw new RequestError(428, 'revision_tag_required');
  const expectedTag = await stateTag(user, payload.baseRevision);
  // Compatibility with browsers that saved a transport-weakened ETag. Only
  // this exact account/revision token, optionally prefixed by W/, is accepted;
  // wildcards, token lists, other accounts, and other revisions remain invalid.
  if (matchedTag !== expectedTag && matchedTag !== 'W/' + expectedTag) {
    throw new RequestError(412, 'account_or_revision_tag_mismatch');
  }
  const state = canonicalState(payload.state);
  const serialized = JSON.stringify(state);
  const updatedAt = new Date().toISOString();
  let written;
  if (payload.baseRevision === 0) {
    written = emailAuth
      ? await db.prepare(`INSERT INTO learning_state (user_id, revision, payload_json, updated_at)
        SELECT ?, 1, ?, ? WHERE EXISTS (SELECT 1 FROM auth_accounts WHERE provider_subject = ? AND user_id = ?)
        AND EXISTS (SELECT 1 FROM auth_sessions WHERE session_hash = ? AND expires_at > ?)
        ON CONFLICT(user_id) DO NOTHING RETURNING revision`)
        .bind(user.id, serialized, updatedAt, emailAuth.providerSubject, user.id, emailAuth.sessionHash, Date.now()).first()
      : await db.prepare('INSERT INTO learning_state (user_id, revision, payload_json, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(user_id) DO NOTHING RETURNING revision')
        .bind(user.id, serialized, updatedAt).first();
  } else {
    written = emailAuth
      ? await db.prepare(`UPDATE learning_state SET revision = revision + 1, payload_json = ?, updated_at = ?
        WHERE user_id = ? AND revision = ?
        AND EXISTS (SELECT 1 FROM auth_accounts WHERE provider_subject = ? AND user_id = ?)
        AND EXISTS (SELECT 1 FROM auth_sessions WHERE session_hash = ? AND expires_at > ?) RETURNING revision`)
        .bind(serialized, updatedAt, user.id, payload.baseRevision, emailAuth.providerSubject, user.id, emailAuth.sessionHash, Date.now()).first()
      : await db.prepare('UPDATE learning_state SET revision = revision + 1, payload_json = ?, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING revision')
        .bind(serialized, updatedAt, user.id, payload.baseRevision).first();
  }
  // Insert/update is one atomic SQL statement; a stale writer never overwrites another device.
  if (!written) {
    if (emailAuth) {
      const stillAuthorized = await db.prepare(`SELECT user_id FROM auth_accounts WHERE provider_subject = ? AND user_id = ?
        AND EXISTS (SELECT 1 FROM auth_sessions WHERE session_hash = ? AND expires_at > ?)` )
        .bind(emailAuth.providerSubject, user.id, emailAuth.sessionHash, Date.now()).first();
      if (!stillAuthorized) throw new globalThis.XUNCI_EMAIL_AUTH.AuthError(401, 'authentication_required');
    }
    const snapshot = await readState(db, user);
    return json(snapshot, 409, await stateHeaders(user, snapshot.revision));
  }
  if (written.revision !== payload.baseRevision + 1) throw new RequestError(500, 'storage_error');
  return json({version: 1, user, revision: written.revision, updatedAt, state}, 200,
    await stateHeaders(user, written.revision));
}

function canonicalLesson(value, code = 'invalid_lesson') {
  try {
    // validateState first rejects dangerous keys/non-JSON data before the shared lesson validator.
    const sanitized = globalThis.IELTS_SYNC.validateState({records: [], lastExcel: globalThis.IELTS_ENGINE.today(),
      readingState: {assignments: {}, results: {}, completed: {}, excluded: []}, customLessons: [value]});
    const lesson = sanitized.customLessons[0];
    if (!globalThis.IELTS_ENGINE.isDate(lesson.learningDate) || !lesson.article) throw new Error('date or passage');
    return lesson;
  } catch (_) { throw new RequestError(code === 'stored_lesson_invalid' ? 500 : 400, code); }
}

async function dailyLessons(request, env) {
  if (!['GET', 'POST'].includes(request.method)) return json({error: 'method_not_allowed'}, 405, {Allow: 'GET, POST'});
  const db = database(env);
  if (request.method === 'GET') {
    const result = await db.prepare('SELECT id, learning_date, payload_json, created_at FROM lessons ORDER BY learning_date DESC').all();
    const rows = result.results || [];
    const lessons = rows.map(row => {
      let value;
      try { value = JSON.parse(row.payload_json); }
      catch (_) { throw new RequestError(500, 'stored_lesson_invalid'); }
      const lesson = canonicalLesson(value, 'stored_lesson_invalid');
      if (lesson.id !== row.id || lesson.learningDate !== row.learning_date || !validTimestamp(row.created_at)) {
        throw new RequestError(500, 'stored_lesson_invalid');
      }
      return lesson;
    });
    return json({version: 1, lessons});
  }
  // Public readers keep their own progress; shared editorial writes require the
  // configured owner identity, independently of the Site's audience setting.
  requireEditor(request, env);
  sameOrigin(request, false);
  if (request.headers.get('X-Xunci-Lesson-Writer') !== '1') throw new RequestError(403, 'lesson_writer_required');
  const payload = await bodyJSON(request);
  envelope(payload, ['lesson']);
  const lesson = canonicalLesson(payload.lesson);
  const createdAt = new Date().toISOString();
  const written = await db.prepare('INSERT INTO lessons (id, learning_date, payload_json, created_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING RETURNING id')
    .bind(lesson.id, lesson.learningDate, JSON.stringify(lesson), createdAt).first();
  if (!written) return json({error: 'lesson_already_exists'}, 409);
  return json({version: 1, lesson, createdAt}, 201);
}

function embeddedAsset(path) {
  const assets = typeof SITE_ASSETS === 'undefined' ? globalThis.SITE_ASSETS : SITE_ASSETS;
  return assets && Object.prototype.hasOwnProperty.call(assets, path) ? assets[path] : null;
}

function validateWordCards(input, code = 'invalid_word_cards') {
  try {
    if (!Array.isArray(input) || !input.length || input.length > 100) throw new Error('cards');
    const seen = new Set();
    const requiredText = (value, max = 3000, english = false) => {
      if (typeof value !== 'string' || !value.trim() || value.length > max
        || (english && /[\u3400-\u9fff\uf900-\ufaff]/.test(value))) throw new Error('text');
      return value.trim();
    };
    const bilingual = value => {
      envelope(value, ['en', 'zh']);
      return {en: requiredText(value.en, 3000, true), zh: requiredText(value.zh)};
    };
    return input.map(value => {
      envelope(value, ['word', 'ipa', 'meaning', 'pos', 'family', 'memory', 'collocations', 'synonyms', 'example', 'level', 'senses', 'source']);
      const word = globalThis.IELTS_ENGINE.normalizeWord(requiredText(value.word, 200, true));
      if (!/^[a-z]+(?:[ '\-.]+[a-z]+)*$/.test(word) || seen.has(word)) throw new Error('word');
      seen.add(word);
      const ipa = requiredText(value.ipa, 200, true);
      if (!/^\/[^/]+\/$/.test(ipa) || !['A', 'B', 'C'].includes(value.level)) throw new Error('ipa or level');
      if (!Array.isArray(value.collocations) || value.collocations.length < 2 || value.collocations.length > 10) throw new Error('collocations');
      const collocations = value.collocations.map(bilingual);
      if (new Set(collocations.map(item => globalThis.IELTS_ENGINE.normalizeWord(item.en))).size !== collocations.length) throw new Error('duplicate collocations');
      const card = {word, ipa, meaning: requiredText(value.meaning), pos: requiredText(value.pos, 200),
        family: requiredText(value.family), memory: requiredText(value.memory), collocations,
        synonyms: requiredText(value.synonyms), example: bilingual(value.example), level: value.level};
      if (value.senses !== undefined) {
        if (!Array.isArray(value.senses) || !value.senses.length || value.senses.length > 10) throw new Error('senses');
        card.senses = value.senses.map(sense => {
          envelope(sense, ['meaning', 'en', 'zh']);
          return {meaning: requiredText(sense.meaning), en: requiredText(sense.en, 3000, true), zh: requiredText(sense.zh)};
        });
      }
      if (value.source !== undefined) {
        envelope(value.source, ['title', 'url']);
        const url = new URL(requiredText(value.source.url, 2000));
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error('source');
        card.source = {title: requiredText(value.source.title), url: url.href};
      }
      return card;
    });
  } catch (_) { throw new RequestError(code === 'stored_word_cards_invalid' ? 500 : 400, code); }
}

async function readWordCards(db) {
  const result = await db.prepare('SELECT word, payload_json, updated_at FROM word_cards ORDER BY word').all();
  const cards = [];
  for (const row of result.results || []) {
    let value;
    try { value = JSON.parse(row.payload_json); }
    catch (_) { throw new RequestError(500, 'stored_word_cards_invalid'); }
    const card = validateWordCards([value], 'stored_word_cards_invalid')[0];
    if (card.word !== row.word || !validTimestamp(row.updated_at)) throw new RequestError(500, 'stored_word_cards_invalid');
    cards.push(card);
  }
  return {version: 1, cards};
}

async function wordCards(request, env) {
  if (!['GET', 'POST'].includes(request.method)) return json({error: 'method_not_allowed'}, 405, {Allow: 'GET, POST'});
  const db = database(env);
  if (request.method === 'GET') return json(await readWordCards(db));
  requireEditor(request, env);
  sameOrigin(request, false);
  if (request.headers.get('X-Xunci-Lesson-Writer') !== '1') throw new RequestError(403, 'lesson_writer_required');
  const payload = await bodyJSON(request);
  envelope(payload, ['cards']);
  const cards = validateWordCards(payload.cards);
  const updatedAt = new Date().toISOString();
  if (typeof db.batch !== 'function') throw new RequestError(503, 'storage_unavailable');
  const statements = cards.map(card => db.prepare('INSERT INTO word_cards (word, payload_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(word) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at')
    .bind(card.word, JSON.stringify(card), updatedAt));
  await db.batch(statements);
  return json({version: 1, cards, updatedAt, publishedCount: cards.length}, 201);
}

function seedLessons() {
  const seed = typeof SITE_SEED_LESSONS === 'undefined' ? globalThis.SITE_SEED_LESSONS : SITE_SEED_LESSONS;
  if (Array.isArray(seed)) return seed;
  const asset = embeddedAsset('/seed-lessons.json');
  if (!asset) return [];
  try { const lessons = JSON.parse(asset.body); return Array.isArray(lessons) ? lessons : []; }
  catch (_) { throw new RequestError(500, 'seed_lessons_invalid'); }
}

async function listLessons(db) {
  const result = await db.prepare('SELECT id, learning_date, payload_json, created_at FROM lessons ORDER BY learning_date DESC').all();
  const merged = new Map();
  for (const lesson of seedLessons()) merged.set(lesson.id, lesson);
  for (const row of result.results || []) {
    let value;
    try { value = JSON.parse(row.payload_json); }
    catch (_) { throw new RequestError(500, 'stored_lesson_invalid'); }
    const lesson = canonicalLesson(value, 'stored_lesson_invalid');
    if (lesson.id !== row.id || lesson.learningDate !== row.learning_date || !validTimestamp(row.created_at)) throw new RequestError(500, 'stored_lesson_invalid');
    merged.set(lesson.id, lesson);
  }
  return {version: 1, lessons: Array.from(merged.values()).map(lesson => ({id: lesson.id, title: lesson.title,
    url: lesson.url, learningDate: lesson.learningDate || null, source: lesson.source,
    published: lesson.published, license: lesson.article?.license || null}))};
}

async function learningSummary(db, user, env) {
  const auth = globalThis.XUNCI_EMAIL_AUTH.config(env);
  const authentication = {enabled: !!auth, loginMethod: auth?.loginMethod || 'otp'};
  const editorEmail = typeof env?.EDITOR_EMAIL === 'string' ? env.EDITOR_EMAIL.trim().toLowerCase() : '';
  if (auth && editorEmail && user.email?.trim().toLowerCase() === editorEmail) {
    authentication.connection = await globalThis.XUNCI_EMAIL_AUTH.connectionStatus(env);
  }
  const snapshot = await readState(db, user);
  const E = globalThis.IELTS_ENGINE;
  const state = snapshot.state;
  const asOfDate = E.today();
  const records = state?.records || [];
  const due = E.due(records, asOfDate);
  const byLevel = {A: 0, B: 0, C: 0};
  const byStatus = {unconfirmed: 0, studied: 0, 'correct-once': 0, 'needs-review': 0};
  const dueByMode = {teaching: 0, hinted: 0, context: 0};
  for (const record of records) { byLevel[record.level]++; byStatus[record.status]++; }
  for (const record of due) dueByMode[E.mode(record)]++;
  const reading = state?.readingState || {results: {}, completed: {}};
  const answers = Object.values(reading.results).sort((left, right) => Date.parse(right.submittedAt) - Date.parse(left.submittedAt));
  const latest = answers[0];
  return {version: 1, authentication, hasCloudState: state !== null, revision: snapshot.revision, updatedAt: snapshot.updatedAt, asOfDate,
    pendingWords: records.filter(record => record.needsContent === true).map(record => ({word: record.word,
      level: record.level, source: record.batch || '自主提交', firstSeen: record.firstSeen})),
    vocabulary: {total: records.length, byLevel, byStatus},
    review: {due: due.length, dueToday: due.filter(record => E.dueDate(record) === asOfDate).length,
      overdue: due.filter(record => E.dueDate(record) < asOfDate).length,
      unresolvedErrorWords: records.filter(record => E.hasError(record)).length,
      recordedWordsToday: records.filter(record => record.reviewHistory.some(event => event.date === asOfDate)).length, dueByMode},
    reading: {submittedSessions: answers.length, confirmedCompletedLessons: Object.keys(reading.completed).length,
      latestActualAnswers: latest ? {date: latest.date, lessonId: latest.lessonId, submittedAt: latest.submittedAt, answers: latest.answers} : null}};
}

const EMPTY_INPUT = {type: 'object', properties: {}, additionalProperties: false};
const MCP_TOOLS = [
  {name: 'get_daily_learning_instructions', title: '读取每日学习要求',
    description: 'Read the owner’s editorial rules before preparing a daily IELTS lesson or enriching unknown words.', inputSchema: EMPTY_INPUT},
  {name: 'list_reading_lessons', title: '列出已推荐阅读',
    description: 'List compact metadata of seed and cloud reading lessons to avoid repeating previous articles.', inputSchema: EMPTY_INPUT},
  {name: 'get_learning_summary', title: '读取本人真实学习摘要',
    description: 'Read the authenticated account’s missing word explanations, due review counts, and latest explicitly submitted reading answers. Never infer mastery or scores.', inputSchema: EMPTY_INPUT},
  {name: 'publish_reading_lesson', title: '发布每日雅思精读',
    description: 'Validate and publish one verified IELTS reading lesson including a permitted full passage. Existing learning dates cannot be overwritten.',
    inputSchema: {type: 'object', properties: {lesson: {type: 'object'}}, required: ['lesson'], additionalProperties: false}},
  {name: 'get_word_cards', title: '读取词汇教学卡',
    description: 'Read shared educational word explanations. These contain no personal mastery, answers, or review dates.', inputSchema: EMPTY_INPUT},
  {name: 'publish_word_cards', title: '补全词汇教学内容',
    description: 'Validate and publish 1–100 educational word cards with British IPA, Chinese meaning, reliable memory notes, at least two bilingual collocations, synonyms, and bilingual examples. Personal progress is never changed.',
    inputSchema: {type: 'object', properties: {cards: {type: 'array', minItems: 1, maxItems: 100, items: {type: 'object',
      properties: {word: {type: 'string'}, ipa: {type: 'string'}, meaning: {type: 'string'}, pos: {type: 'string'},
        family: {type: 'string'}, memory: {type: 'string'}, synonyms: {type: 'string'}, level: {enum: ['A', 'B', 'C']},
        collocations: {type: 'array', minItems: 2, items: {type: 'object', properties: {en: {type: 'string'}, zh: {type: 'string'}}, required: ['en', 'zh'], additionalProperties: false}},
        example: {type: 'object', properties: {en: {type: 'string'}, zh: {type: 'string'}}, required: ['en', 'zh'], additionalProperties: false},
        senses: {type: 'array', items: {type: 'object', properties: {meaning: {type: 'string'}, en: {type: 'string'}, zh: {type: 'string'}}, required: ['meaning', 'en', 'zh'], additionalProperties: false}},
        source: {type: 'object', properties: {title: {type: 'string'}, url: {type: 'string'}}, required: ['title', 'url'], additionalProperties: false}},
      required: ['word', 'ipa', 'meaning', 'pos', 'family', 'memory', 'collocations', 'synonyms', 'example', 'level'], additionalProperties: false}}},
      required: ['cards'], additionalProperties: false}},
];

function rpcResult(id, result) { return json({jsonrpc: '2.0', id, result}); }
function rpcError(id, code, message, status = 200) { return json({jsonrpc: '2.0', id, error: {code, message}}, status); }
function editorRequest(request, path, payload) {
  const headers = new Headers(request.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type', 'application/json');
  headers.set('X-Xunci-Lesson-Writer', '1');
  return new Request(new URL(path, request.url), {method: 'POST', headers, body: JSON.stringify(payload)});
}

async function mcp(request, env) {
  if (request.method !== 'POST') return json({error: 'method_not_allowed'}, 405, {Allow: 'POST'});
  let rpc;
  try { rpc = await bodyJSON(request); }
  catch (error) { return rpcError(null, error.code === 'invalid_json' ? -32700 : -32600, error.code,
    error.status === 413 ? 413 : 200); }
  const id = rpc?.id ?? null;
  if (!rpc || typeof rpc !== 'object' || Array.isArray(rpc) || rpc.jsonrpc !== '2.0'
    || typeof rpc.method !== 'string' || (!['string', 'number'].includes(typeof id) && id !== null)
    || (typeof id === 'number' && !Number.isFinite(id))) return rpcError(null, -32600, 'Invalid Request');
  if (rpc.method === 'server/discover') return rpcResult(id, {supportedVersions: ['2026-07-28'],
    capabilities: {tools: {}}, serverInfo: {name: 'xunci-ielts-seven', version: '1.1.0'}});
  if (rpc.method === 'notifications/initialized') return new Response(null, {status: 202, headers: API_HEADERS});
  if (!['tools/list', 'tools/call'].includes(rpc.method)) return rpcError(id, -32601, 'Method not found');
  let user;
  try { user = identity(request); sameOrigin(request, false); }
  catch (error) {
    if (rpc.method === 'tools/call') return rpcResult(id, {content: [{type: 'text', text: JSON.stringify({error: error.code})}], isError: true});
    return rpcError(id, -32001, error.code);
  }
  if (rpc.method === 'tools/list') return rpcResult(id, {tools: MCP_TOOLS});
  if (!rpc.params || typeof rpc.params !== 'object' || Array.isArray(rpc.params)
    || typeof rpc.params.name !== 'string') return rpcError(id, -32602, 'Invalid params');
  const args = rpc.params.arguments === undefined ? {} : rpc.params.arguments;
  let result;
  let isError = false;
  try {
    if (rpc.params.name === 'get_daily_learning_instructions') {
      envelope(args, []);
      const asset = embeddedAsset('/docs/DAILY_REQUIREMENTS.md');
      if (!asset) throw new RequestError(503, 'daily_instructions_unavailable');
      result = {instructions: asset.body};
    } else if (rpc.params.name === 'list_reading_lessons') {
      envelope(args, []); result = await listLessons(database(env));
    } else if (rpc.params.name === 'get_learning_summary') {
      envelope(args, []); result = await learningSummary(database(env), user, env);
    } else if (rpc.params.name === 'get_word_cards') {
      envelope(args, []); result = await readWordCards(database(env));
    } else if (rpc.params.name === 'publish_reading_lesson') {
      envelope(args, ['lesson']);
      const response = await dailyLessons(editorRequest(request, '/api/lessons', args), env);
      result = await response.json(); isError = !response.ok;
    } else if (rpc.params.name === 'publish_word_cards') {
      envelope(args, ['cards']);
      const response = await wordCards(editorRequest(request, '/api/word-cards', args), env);
      result = await response.json(); isError = !response.ok;
    } else throw new RequestError(400, 'unknown_tool');
  } catch (error) { isError = true; result = error instanceof globalThis.XUNCI_EMAIL_AUTH.AuthError
    ? {error: error.code, status: error.status} : {error: error instanceof RequestError ? error.code : 'storage_error'}; }
  return rpcResult(id, {content: [{type: 'text', text: JSON.stringify(result)}], isError});
}

function instructions(request) {
  if (request.method !== 'GET') return json({error: 'method_not_allowed'}, 405, {Allow: 'GET'});
  const asset = embeddedAsset('/docs/DAILY_REQUIREMENTS.md');
  if (!asset) throw new RequestError(503, 'daily_instructions_unavailable');
  return new Response(asset.body, {headers: {'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
}

const DICTIONARY_ORIGIN = 'https://api.dictionaryapi.dev';
function ukAudio(phonetic) {
  if (!phonetic || typeof phonetic.audio !== 'string' || !phonetic.audio) return null;
  let url;
  try { url = new URL(phonetic.audio.startsWith('//') ? 'https:' + phonetic.audio : phonetic.audio); }
  catch (_) { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'api.dictionaryapi.dev' || url.username || url.password) return null;
  const accent = String(phonetic.accent || phonetic.region || '').toLowerCase();
  if (['us', 'american', 'american english'].includes(accent)
    || /(?:^|[-_.\/])us(?:[-_.\/]|$)/i.test(url.pathname)) return null;
  const isUK = ['uk', 'gb', 'british', 'british english', 'uk english'].includes(accent)
    || /(?:^|[-_.\/])(?:uk|gb)(?:[-_.\/]|$)/i.test(url.pathname);
  if (!isUK) return null;
  return {audioUrl: url.href, ipa: typeof phonetic.text === 'string' ? phonetic.text : null};
}

async function pronunciation(request) {
  if (request.method !== 'GET') return json({error: 'method_not_allowed'}, 405, {Allow: 'GET'});
  const word = new URL(request.url).searchParams.get('word');
  if (!word || word.length > 80 || !/^[A-Za-z]+(?:[-'][A-Za-z]+)*$/.test(word)) {
    throw new RequestError(400, 'invalid_dictionary_word');
  }
  const normalized = word.toLowerCase();
  const sourceUrl = DICTIONARY_ORIGIN + '/api/v2/entries/en/' + encodeURIComponent(normalized);
  let response;
  try { response = await fetch(sourceUrl, {headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(8000)}); }
  catch (_) { return json({available: false, word: normalized, reason: 'dictionary_unavailable', sourceUrl}, 200); }
  if (!response.ok) return json({available: false, word: normalized,
    reason: response.status === 404 ? 'entry_not_found' : 'dictionary_unavailable', sourceUrl});
  let entries;
  try { entries = await response.json(); }
  catch (_) { return json({available: false, word: normalized, reason: 'dictionary_unavailable', sourceUrl}); }
  const entriesForWord = Array.isArray(entries) ? entries.filter(entry => entry && typeof entry.word === 'string'
    && entry.word.toLowerCase() === normalized) : [];
  for (const entry of entriesForWord) {
    for (const phonetic of Array.isArray(entry.phonetics) ? entry.phonetics : []) {
      const audio = ukAudio(phonetic);
      if (audio) return json({available: true, word: normalized, ...audio, accent: 'UK',
        source: 'Free Dictionary API', sourceUrl});
    }
  }
  return json({available: false, word: normalized, reason: 'verified_uk_audio_unavailable', sourceUrl});
}

function staticAsset(request, pathname) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status: 405, headers: {Allow: 'GET, HEAD'}});
  const asset = embeddedAsset(pathname === '/' ? '/index.html' : pathname);
  if (!asset) return new Response('Not found', {status: 404});
  return new Response(request.method === 'HEAD' ? null : asset.base64 ? Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)) : asset.body, {headers: {
    'Content-Type': asset.type,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
  }});
}

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    try {
      if (pathname === '/' && request.method === 'GET' && new URL(request.url).searchParams.has('code')) {
        return await globalThis.XUNCI_EMAIL_AUTH.handleMagicCallback(request, env);
      }
      if (pathname.startsWith('/api/auth/')) return await globalThis.XUNCI_EMAIL_AUTH.handle(request, env);
      if (pathname === '/mcp') return await mcp(request, env);
      if (pathname === '/api/learning-state') return await learningState(request, env);
      if (pathname === '/api/lessons') return await dailyLessons(request, env);
      if (pathname === '/api/word-cards') return await wordCards(request, env);
      if (pathname === '/api/daily-instructions') return instructions(request);
      if (pathname === '/api/pronunciation') return await pronunciation(request);
      if (pathname.startsWith('/api/')) return json({error: 'not_found'}, 404);
      return staticAsset(request, pathname);
    } catch (error) {
      if (error instanceof globalThis.XUNCI_EMAIL_AUTH.AuthError) return json({error: error.code, ...error.details,
        ...(error.status === 401 ? {signInPath: '/#settings'} : {})}, error.status);
      if (error instanceof RequestError) return json({error: error.code,
        ...(error.status === 401 ? {signInPath: '/signin-with-chatgpt?return_to=%2F'} : {})}, error.status);
      // Do not log user identity, payloads, SQL contents, or learning answers.
      return json({error: 'storage_error'}, 500);
    }
  },
};
