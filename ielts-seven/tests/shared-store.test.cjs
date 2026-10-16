const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {DatabaseSync} = require('node:sqlite');
const E = require('../dist/engine.js');
const S = require('../dist/sync-state.js');
globalThis.IELTS_ENGINE = E;
globalThis.IELTS_SYNC = S;
const shared = import('../worker/shared-store.mjs');
const ORIGIN = 'https://learner.example.chatgpt.site';
const NOW = '2026-10-01T10:00:00.000Z';
const USER = {id: 'native-owner', email: 'editor@example.test'};

class D1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    for (const filename of fs.readdirSync(path.join(__dirname, '../drizzle')).filter(name => name.endsWith('.sql')).sort()) {
      this.sqlite.exec(fs.readFileSync(path.join(__dirname, '../drizzle', filename), 'utf8'));
    }
    this.calls = [];
  }
  prepare(sql) {
    const owner = this;
    const statement = this.sqlite.prepare(sql);
    let params = [];
    const run = async (method, action) => {
      owner.calls.push({sql, params: [...params], method});
      if (owner.before) await owner.before(sql, params, method);
      const value = action();
      if (owner.after) await owner.after(sql, params, method);
      return value;
    };
    return {
      bind(...values) { params = values; return this; },
      first() { return run('first', () => statement.get(...params) || null); },
      all() { return run('all', () => ({results: statement.all(...params), success: true})); },
      run() { return run('run', () => ({meta: statement.run(...params), success: true})); },
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

function state(words = ['resilience']) {
  return S.validateState({records: E.seed(words.map(word => ({word, firstSeen: '2026-10-01', level: 'A',
    ipa: '/test/', meaning: '测试', pos: 'n.', batch: '测试批次'}))), lastExcel: '2026-10-01',
    readingState: {assignments: {}, results: {}, completed: {}, excluded: []}, customLessons: []});
}
function save(db, id, value, revision = 1) {
  db.sqlite.prepare(`INSERT INTO learning_state VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET revision = excluded.revision, payload_json = excluded.payload_json,
    updated_at = excluded.updated_at`).run(id, revision, JSON.stringify(value), NOW);
}
function account(db, id = 'email-owner', email = 'learner@example.test', subject = 'verified-subject') {
  db.sqlite.prepare('INSERT INTO auth_accounts (provider_subject, user_id, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(subject, id, email, NOW, NOW);
}
function request(origin = ORIGIN) { return new Request(origin + '/mcp'); }
function rows(db, table) { return JSON.parse(JSON.stringify(db.sqlite.prepare('SELECT * FROM ' + table).all())); }
async function setup(t) {
  const module = await shared;
  const legacy = new D1(); const db = new D1();
  t.after(() => { legacy.close(); db.close(); });
  for (const sql of module.SHARED_SCHEMA) db.sqlite.exec(sql);
  account(db);
  const env = {DB: db, LEGACY_DB: legacy, EDITOR_EMAIL: USER.email,
    SHARED_MIGRATION_OWNER_EMAIL: 'learner@example.test'};
  return {module, legacy, db, env};
}

test('disabled helper leaves ordinary runtime identities and storage untouched', async () => {
  const module = await shared;
  assert.strictEqual(await module.resolveSharedIdentity(request(), {}, USER), USER);
  assert.deepEqual(await module.prepareSharedIdentity(request(), {}, USER), {user: USER, report: {phase: 'disabled'}});
});

test('preview saves immutable complete snapshots and leaves learning records, accounts and links unchanged', async t => {
  const {module, legacy, db, env} = await setup(t);
  save(legacy, USER.id, state(['resilience', 'balance']), 4);
  save(db, 'email-owner', state(['resilience', 'renewal']), 8);
  const sourceBefore = rows(legacy, 'learning_state'); const targetBefore = rows(db, 'learning_state');
  const accountBefore = rows(db, 'auth_accounts');
  const result = await module.prepareSharedIdentity(request(), env, USER);
  assert.strictEqual(result.user, USER);
  assert.equal(result.report.phase, 'preview');
  assert.deepEqual(result.report.counts, {source: 2, target: 2, combined: 3});
  assert.deepEqual(result.report.sourceWords, ['resilience', 'balance']);
  assert.deepEqual(result.report.targetWords, ['resilience', 'renewal']);
  assert.equal(result.report.sourceRevision, 4); assert.equal(result.report.targetRevision, 8);
  assert.equal(rows(db, 'sync_legacy_backups').length, 4);
  assert.deepEqual(rows(legacy, 'learning_state'), sourceBefore);
  assert.deepEqual(rows(db, 'learning_state'), targetBefore);
  assert.deepEqual(rows(db, 'auth_accounts'), accountBefore);
  assert.equal(rows(db, 'sync_account_links').length, 0);
  const backupsBefore = rows(db, 'sync_legacy_backups');
  await module.prepareSharedIdentity(request(), env, USER);
  assert.deepEqual(rows(db, 'sync_legacy_backups'), backupsBefore, 'a retry cannot overwrite any backup');
});

test('a non-editor cannot claim the configured owner or inspect its state during staging', async t => {
  const {module, legacy, db, env} = await setup(t);
  save(legacy, USER.id, state()); save(db, 'email-owner', state());
  const outsider = {id: 'different-native-account', email: 'stranger@example.test'};
  const result = await module.prepareSharedIdentity(request(), {...env, SHARED_MIGRATION_APPLY: '1'}, outsider);
  assert.deepEqual(result, {user: outsider, report: {phase: 'unlinked'}});
  assert.equal(db.calls.length, 1, 'only the caller’s existing mapping may be queried');
  assert.match(db.calls[0].sql, /sync_account_links/);
  assert.equal(legacy.calls.length, 0);
  assert.equal(rows(db, 'sync_account_links').length, 0);
  assert.equal(rows(db, 'sync_legacy_backups').length, 0);
});

test('initial mapping requires one exact existing verified account, rejecting missing or duplicate email rows', async t => {
  const {module, db, env} = await setup(t);
  const rejected = expectedCode => error => error.code === expectedCode;
  await assert.rejects(module.prepareSharedIdentity(request(), {...env, SHARED_MIGRATION_OWNER_EMAIL: 'missing@example.test'}, USER),
    rejected('shared_account_missing'));
  account(db, 'email-other', 'LEARNER@example.test', 'other-subject');
  await assert.rejects(module.prepareSharedIdentity(request(), env, USER), rejected('shared_account_ambiguous'));
  assert.equal(rows(db, 'sync_legacy_backups').length, 0);
  assert.equal(rows(db, 'sync_account_links').length, 0);
});

test('apply unions disjoint words, preserves the whole remote conflicting record and links only the verified owner', async t => {
  const {module, legacy, db, env} = await setup(t);
  const source = state(['resilience', 'balance']); source.records[0].meaning = '原站个人解释';
  const remote = state(['resilience', 'renewal']); remote.records[0].meaning = '邮箱个人解释';
  save(legacy, USER.id, source, 4); save(db, 'email-owner', remote, 8);
  const sourceBefore = rows(legacy, 'learning_state'); const accountsBefore = rows(db, 'auth_accounts');
  const result = await module.prepareSharedIdentity(request(), {...env, SHARED_MIGRATION_APPLY: '1'}, USER);
  assert.deepEqual(result.user, {id: 'email-owner', email: 'learner@example.test'});
  assert.equal(result.report.phase, 'applied'); assert.equal(result.report.targetRevision, 9);
  assert.equal(result.report.conflictCount, 1);
  const written = rows(db, 'learning_state')[0]; const combined = JSON.parse(written.payload_json);
  assert.equal(written.revision, 9);
  assert.deepEqual(combined.records.map(record => record.word), ['resilience', 'renewal', 'balance']);
  assert.deepEqual(combined.records[0], remote.records[0]);
  assert.deepEqual(rows(legacy, 'learning_state'), sourceBefore);
  assert.deepEqual(rows(db, 'auth_accounts'), accountsBefore);
  const backups = rows(db, 'sync_legacy_backups');
  assert.deepEqual(JSON.parse(backups.find(row => row.source_origin === ORIGIN).payload_json), source);
  assert.deepEqual(JSON.parse(backups.find(row => row.source_origin === 'shared-cloud').payload_json), remote);
  assert.equal(rows(db, 'auth_sessions').length, 0);
  assert.equal(rows(db, 'sync_account_links').length, 1);
  const second = await module.prepareSharedIdentity(request(), {...env, SHARED_MIGRATION_APPLY: '1'}, USER);
  assert.equal(second.report.phase, 'linked');
  assert.equal(rows(db, 'learning_state')[0].revision, 9, 'an established link never reruns migration');
  assert.deepEqual(rows(db, 'sync_legacy_backups'), backups);
});

test('existing mappings resolve only their exact source identity and origin without any first-claim privileges', async t => {
  const {module, db, env} = await setup(t);
  db.sqlite.prepare('INSERT INTO sync_account_links VALUES (?, ?, ?, ?)').run(ORIGIN, 'linked-user', 'email-owner', NOW);
  const user = {id: 'linked-user', email: 'old-address@example.test'};
  assert.deepEqual(await module.resolveSharedIdentity(request(), env, user), {id: 'email-owner', email: 'learner@example.test'});
  assert.strictEqual(await module.resolveSharedIdentity(request('https://other.example'), env, user), user);
  assert.strictEqual(await module.resolveSharedIdentity(request(), env, USER), USER);
  assert.equal(rows(db, 'sync_account_links').length, 1);
});

test('a target revision race fails CAS and leaves verified backups with no mapping', async t => {
  const {module, legacy, db, env} = await setup(t);
  save(legacy, USER.id, state(['balance'])); save(db, 'email-owner', state(['renewal']), 8);
  let raced = false;
  db.before = sql => {
    if (!raced && sql.startsWith('UPDATE learning_state')) {
      raced = true; save(db, 'email-owner', state(['renewal', 'stability']), 9);
    }
  };
  await assert.rejects(module.prepareSharedIdentity(request(), {...env, SHARED_MIGRATION_APPLY: '1'}, USER),
    error => error.code === 'migration_target_changed');
  assert.equal(rows(db, 'sync_account_links').length, 0);
  assert.equal(rows(db, 'sync_legacy_backups').length, 4);
  assert.deepEqual(JSON.parse(rows(db, 'learning_state')[0].payload_json).records.map(record => record.word), ['renewal', 'stability']);
});

test('a competing first save prevents migration from claiming or overwriting a newly created remote row', async t => {
  const {module, legacy, db, env} = await setup(t);
  save(legacy, USER.id, state(['balance']));
  let raced = false;
  db.before = sql => {
    if (!raced && sql.startsWith('INSERT INTO learning_state')) {
      raced = true; save(db, 'email-owner', state(['stability']), 1);
    }
  };
  await assert.rejects(module.prepareSharedIdentity(request(), {...env, SHARED_MIGRATION_APPLY: '1'}, USER),
    error => error.code === 'migration_target_changed');
  assert.deepEqual(JSON.parse(rows(db, 'learning_state')[0].payload_json), state(['stability']));
  assert.equal(rows(db, 'sync_account_links').length, 0);
  assert.equal(rows(db, 'sync_legacy_backups').length, 4);
});

test('source changes before a target write abort and never link an obsolete native snapshot', async t => {
  const {module, legacy, db, env} = await setup(t);
  save(legacy, USER.id, state(['balance'])); save(db, 'email-owner', state(['renewal']), 8);
  let reads = 0;
  legacy.before = sql => {
    if (sql.startsWith('SELECT revision') && ++reads === 2) save(legacy, USER.id, state(['balance', 'stability']), 2);
  };
  await assert.rejects(module.prepareSharedIdentity(request(), {...env, SHARED_MIGRATION_APPLY: '1'}, USER),
    error => error.code === 'migration_source_changed');
  assert.equal(rows(db, 'sync_account_links').length, 0);
  assert.equal(rows(db, 'learning_state')[0].revision, 8);
  assert.equal(rows(db, 'sync_legacy_backups').length, 4);
});

test('source changes after a target CAS leave a recoverable candidate and never publish a mapping', async t => {
  const {module, legacy, db, env} = await setup(t);
  save(legacy, USER.id, state(['balance'])); save(db, 'email-owner', state(['renewal']), 8);
  db.after = sql => {
    if (sql.startsWith('UPDATE learning_state')) save(legacy, USER.id, state(['balance', 'stability']), 2);
  };
  await assert.rejects(module.prepareSharedIdentity(request(), {...env, SHARED_MIGRATION_APPLY: '1'}, USER),
    error => error.code === 'migration_source_changed');
  assert.equal(rows(db, 'sync_account_links').length, 0);
  assert.equal(rows(db, 'learning_state')[0].revision, 9);
  assert.equal(rows(db, 'sync_legacy_backups').length, 4);
  assert.deepEqual(JSON.parse(rows(db, 'learning_state')[0].payload_json).records.map(record => record.word), ['renewal', 'balance']);
});

test('a concurrent target edit after CAS prevents the conditional mapping INSERT', async t => {
  const {module, legacy, db, env} = await setup(t);
  save(legacy, USER.id, state(['balance'])); save(db, 'email-owner', state(['renewal']), 8);
  db.before = sql => {
    if (sql.startsWith('INSERT INTO sync_account_links')) save(db, 'email-owner', state(['renewal', 'stability']), 10);
  };
  await assert.rejects(module.prepareSharedIdentity(request(), {...env, SHARED_MIGRATION_APPLY: '1'}, USER),
    error => error.code === 'migration_link_changed');
  assert.equal(rows(db, 'sync_account_links').length, 0);
  assert.equal(rows(db, 'learning_state')[0].revision, 10);
});

test('missing remote state imports the complete native state; missing both states creates no learning history', async t => {
  const {module, legacy, db, env} = await setup(t);
  save(legacy, USER.id, state(['balance']), 3);
  await module.prepareSharedIdentity(request(), {...env, SHARED_MIGRATION_APPLY: '1'}, USER);
  assert.equal(rows(db, 'learning_state')[0].revision, 1);
  assert.deepEqual(JSON.parse(rows(db, 'learning_state')[0].payload_json), state(['balance']));
  account(db, 'empty-email', 'empty@example.test', 'empty-subject');
  const emptyUser = {id: 'empty-native', email: USER.email};
  const emptyResult = await module.prepareSharedIdentity(request(), {...env, SHARED_MIGRATION_OWNER_EMAIL: 'empty@example.test',
    SHARED_MIGRATION_APPLY: '1'}, emptyUser);
  assert.equal(emptyResult.report.phase, 'applied');
  assert.equal(rows(db, 'learning_state').length, 1, 'no fabricated empty state or dates');
  assert.equal(rows(db, 'sync_account_links').length, 2);
});

function lesson(db, id, date, title = id) {
  db.sqlite.prepare('INSERT INTO lessons VALUES (?, ?, ?, ?)').run(id, date, JSON.stringify({id, learningDate: date, title}), NOW);
}
function card(db, word, meaning = word) {
  db.sqlite.prepare('INSERT INTO word_cards VALUES (?, ?, ?)').run(word, JSON.stringify({word, meaning}), NOW);
}

test('catalog preview backs up both full stores and apply copies only absent lessons and cards', async t => {
  const {module, legacy, db, env} = await setup(t);
  save(legacy, USER.id, state(['balance']));
  lesson(legacy, 'shared', '2026-10-01', 'source'); lesson(db, 'shared', '2026-10-01', 'remote');
  lesson(legacy, 'new-lesson', '2026-10-02'); lesson(legacy, 'same-date', '2026-10-03');
  lesson(db, 'existing-date', '2026-10-03');
  card(legacy, 'balance', 'source'); card(db, 'balance', 'remote'); card(legacy, 'renewal');
  const preview = await module.prepareSharedIdentity(request(), env, USER);
  assert.equal(preview.report.catalog.addedLessons, 1); assert.equal(preview.report.catalog.addedWordCards, 1);
  assert.equal(preview.report.catalog.lessonConflicts.length, 2);
  assert.deepEqual(preview.report.catalog.cardConflicts, ['balance']);
  const catalogBackup = rows(db, 'sync_legacy_backups').find(row => row.source_origin === ORIGIN + '#catalog');
  assert.equal(JSON.parse(catalogBackup.payload_json).catalog.lessons.length, 3);
  const existingLessons = rows(db, 'lessons'); const existingCards = rows(db, 'word_cards');
  await module.prepareSharedIdentity(request(), {...env, SHARED_MIGRATION_APPLY: '1'}, USER);
  const afterLessons = rows(db, 'lessons'); const afterCards = rows(db, 'word_cards');
  assert.equal(afterLessons.length, 3); assert.equal(afterCards.length, 2);
  for (const row of existingLessons) assert.deepEqual(afterLessons.find(item => item.id === row.id), row);
  for (const row of existingCards) assert.deepEqual(afterCards.find(item => item.word === row.word), row);
  assert.equal(afterLessons.some(row => row.id === 'same-date'), false);
});

test('a concurrent source catalog change stops migration before linking or modifying the target state', async t => {
  const {module, legacy, db, env} = await setup(t);
  save(legacy, USER.id, state(['balance']));
  lesson(legacy, 'source-lesson', '2026-10-01');
  let reads = 0;
  legacy.before = sql => {
    if (sql.startsWith('SELECT id, learning_date') && ++reads === 2) lesson(legacy, 'concurrent-lesson', '2026-10-02');
  };
  await assert.rejects(module.prepareSharedIdentity(request(), {...env, SHARED_MIGRATION_APPLY: '1'}, USER),
    error => error.code === 'migration_source_changed');
  assert.equal(rows(db, 'learning_state').length, 0);
  assert.equal(rows(db, 'sync_account_links').length, 0);
  assert.equal(rows(db, 'sync_legacy_backups').length, 4);
});

test('a backup must round-trip exactly before any target learning state may be written', async t => {
  const {module, legacy, db, env} = await setup(t);
  save(legacy, USER.id, state(['balance']));
  db.after = sql => {
    if (sql.startsWith('INSERT INTO sync_legacy_backups')) {
      db.sqlite.prepare('UPDATE sync_legacy_backups SET target_user_id = ?').run('wrong-owner');
    }
  };
  await assert.rejects(module.prepareSharedIdentity(request(), {...env, SHARED_MIGRATION_APPLY: '1'}, USER),
    error => error.code === 'migration_backup_unverified');
  assert.equal(rows(db, 'learning_state').length, 0);
  assert.equal(rows(db, 'sync_account_links').length, 0);
});

test('backup failures and provider SQL errors fail closed without exposing raw details', async t => {
  const {module, legacy, db, env} = await setup(t);
  save(legacy, USER.id, state(['balance']));
  db.before = sql => { if (sql.startsWith('INSERT INTO sync_legacy_backups')) throw new Error('private SQL payload and credential'); };
  await assert.rejects(module.prepareSharedIdentity(request(), {...env, SHARED_MIGRATION_APPLY: '1'}, USER), error => {
    assert.equal(error.message, 'shared_storage_unavailable'); return true;
  });
  assert.equal(rows(db, 'learning_state').length, 0);
  assert.equal(rows(db, 'sync_account_links').length, 0);
});
