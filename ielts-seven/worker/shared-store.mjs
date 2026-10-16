import {previewAccountRecovery} from './account-recovery.mjs';

// These tables belong to the shared store. The original Sites database remains
// available separately as LEGACY_DB and is never updated by this module.
export const SHARED_SCHEMA = Object.freeze([
  `CREATE TABLE IF NOT EXISTS sync_legacy_backups (
    id TEXT PRIMARY KEY NOT NULL,
    source_origin TEXT NOT NULL,
    source_user_id TEXT NOT NULL,
    target_user_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_account_links (
    source_origin TEXT NOT NULL,
    source_user_id TEXT NOT NULL,
    target_user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (source_origin, source_user_id)
  )`,
]);

export class SharedStoreError extends Error {
  constructor(status, code) {
    super(code);
    this.name = 'SharedStoreError';
    this.status = status;
    this.code = code;
  }
}

const fail = (status, code) => { throw new SharedStoreError(status, code); };
const validId = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 512;
const normalizedEmail = value => {
  if (typeof value !== 'string' || value.length > 254) return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};
const validTime = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value));

function context(request, env, user) {
  if (!env?.LEGACY_DB) return null;
  if (!env.DB || typeof env.DB.prepare !== 'function' || typeof env.LEGACY_DB.prepare !== 'function') {
    fail(503, 'shared_storage_unavailable');
  }
  if (!validId(user?.id)) fail(401, 'authentication_required');
  let origin;
  try {
    const url = new URL(request.url);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('origin');
    origin = url.origin;
  } catch (_) { fail(400, 'invalid_site_origin'); }
  const sync = globalThis.IELTS_SYNC;
  if (!sync || typeof sync.validateState !== 'function' || typeof sync.fingerprint !== 'function') {
    fail(503, 'shared_sync_unavailable');
  }
  return {db: env.DB, legacy: env.LEGACY_DB, origin, sync};
}

async function execute(operation) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof SharedStoreError) throw error;
    // Provider errors may contain SQL or private payloads. Keep those server-side
    // details out of both the caller response and this module's diagnostics.
    fail(503, 'shared_storage_unavailable');
  }
}

function checkedAccount(row, expectedEmail) {
  if (!row || !validId(row.user_id) || !validId(row.provider_subject)
    || !normalizedEmail(row.email) || (expectedEmail && normalizedEmail(row.email) !== expectedEmail)
    || !validTime(row.created_at) || !validTime(row.updated_at)) fail(409, 'shared_account_invalid');
  return {id: row.user_id, email: normalizedEmail(row.email)};
}

async function targetAccount(db, email) {
  // auth_accounts is only created from a verified Supabase identity. An exact
  // existing row is required; this migration never creates or changes accounts.
  const response = await db.prepare(`SELECT provider_subject, user_id, email, created_at, updated_at
    FROM auth_accounts WHERE lower(email) = ? LIMIT 2`).bind(email).all();
  const rows = response?.results;
  if (!Array.isArray(rows) || rows.length !== 1) fail(409, rows?.length ? 'shared_account_ambiguous' : 'shared_account_missing');
  checkedAccount(rows[0], email);
  return rows[0];
}

async function linkedUser(ctx, user) {
  const link = await ctx.db.prepare(`SELECT target_user_id FROM sync_account_links
    WHERE source_origin = ? AND source_user_id = ?`).bind(ctx.origin, user.id).first();
  if (!link) return null;
  if (!validId(link.target_user_id)) fail(409, 'shared_link_invalid');
  const row = await ctx.db.prepare(`SELECT provider_subject, user_id, email, created_at, updated_at
    FROM auth_accounts WHERE user_id = ?`).bind(link.target_user_id).first();
  return checkedAccount(row);
}

export async function resolveSharedIdentity(request, env, user) {
  return execute(async () => {
    const ctx = context(request, env, user);
    if (!ctx) return user;
    return await linkedUser(ctx, user) || user;
  });
}

async function snapshot(db, id, sync) {
  const row = await db.prepare('SELECT revision, payload_json, updated_at FROM learning_state WHERE user_id = ?').bind(id).first();
  if (!row) return {revision: 0, updatedAt: null, state: null, payload: 'null', rawPayload: null};
  if (!Number.isSafeInteger(row.revision) || row.revision < 1 || row.revision >= Number.MAX_SAFE_INTEGER
    || !validTime(row.updated_at) || typeof row.payload_json !== 'string') fail(500, 'stored_state_invalid');
  let state;
  try { state = sync.validateState(JSON.parse(row.payload_json)); }
  catch (_) { fail(500, 'stored_state_invalid'); }
  return {revision: row.revision, updatedAt: row.updated_at, state,
    payload: JSON.stringify(state), rawPayload: row.payload_json};
}

function sameSnapshot(left, right, sync) {
  return left.revision === right.revision && left.updatedAt === right.updatedAt
    && (left.state === null ? right.state === null
      : right.state !== null && sync.fingerprint(left.state) === sync.fingerprint(right.state));
}

async function digest(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function saveBackup(db, origin, sourceId, targetId, current, createdAt) {
  const id = await digest(JSON.stringify([origin, sourceId, current.revision, current.payload]));
  await db.prepare(`INSERT INTO sync_legacy_backups
    (id, source_origin, source_user_id, target_user_id, revision, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
    .bind(id, origin, sourceId, targetId, current.revision, current.payload, createdAt).run();
  const stored = await db.prepare(`SELECT source_origin, source_user_id, target_user_id, revision, payload_json
    FROM sync_legacy_backups WHERE id = ?`).bind(id).first();
  if (!stored || stored.source_origin !== origin || stored.source_user_id !== sourceId
    || stored.target_user_id !== targetId || stored.revision !== current.revision || stored.payload_json !== current.payload) {
    fail(500, 'migration_backup_unverified');
  }
  return id;
}

function previewReport(legacy, remote, preview, backups) {
  const conflicts = Array.isArray(preview.conflicts) ? preview.conflicts : [];
  return {phase: 'preview', sourceRevision: legacy.revision, targetRevision: remote.revision,
    sourceWords: legacy.state?.records.map(record => record.word) || [],
    targetWords: remote.state?.records.map(record => record.word) || [],
    counts: {source: legacy.state?.records.length || 0, target: remote.state?.records.length || 0,
      combined: preview.state?.records.length || 0},
    summary: preview.summary, changed: preview.changed, conflictCount: conflicts.length,
    conflicts, backupIds: backups};
}

async function verifySource(ctx, id, expected) {
  if (!sameSnapshot(await snapshot(ctx.legacy, id, ctx.sync), expected, ctx.sync)) fail(409, 'migration_source_changed');
}

async function applyState(ctx, target, remote, candidate, updatedAt) {
  if (candidate === null) {
    const latest = await snapshot(ctx.db, target.user_id, ctx.sync);
    if (remote.state !== null || latest.state !== null) fail(409, 'migration_target_changed');
    return latest;
  }
  const payload = JSON.stringify(ctx.sync.validateState(candidate));
  const verifiedEmail = normalizedEmail(target.email);
  const authGuard = 'EXISTS (SELECT 1 FROM auth_accounts WHERE provider_subject = ? AND user_id = ? AND lower(email) = ?)';
  const written = remote.revision === 0
    ? await ctx.db.prepare(`INSERT INTO learning_state (user_id, revision, payload_json, updated_at)
      SELECT ?, 1, ?, ? WHERE ${authGuard} ON CONFLICT(user_id) DO NOTHING RETURNING revision`)
      .bind(target.user_id, payload, updatedAt, target.provider_subject, target.user_id, verifiedEmail).first()
    : await ctx.db.prepare(`UPDATE learning_state SET revision = revision + 1, payload_json = ?, updated_at = ?
      WHERE user_id = ? AND revision = ? AND payload_json = ? AND updated_at = ? AND ${authGuard} RETURNING revision`)
      .bind(payload, updatedAt, target.user_id, remote.revision, remote.rawPayload, remote.updatedAt,
        target.provider_subject, target.user_id, verifiedEmail).first();
  if (!written || written.revision !== remote.revision + 1) fail(409, 'migration_target_changed');
  const latest = await snapshot(ctx.db, target.user_id, ctx.sync);
  if (latest.revision !== written.revision || latest.payload !== payload || latest.updatedAt !== updatedAt) {
    fail(409, 'migration_target_changed');
  }
  return latest;
}

async function createLink(ctx, user, target, written, createdAt) {
  // Keep the identity link separate from the state CAS. This conditional INSERT
  // cannot claim an identity after a stale/failed write or a concurrent edit.
  const stateGuard = written.state === null
    ? 'NOT EXISTS (SELECT 1 FROM learning_state WHERE user_id = ?)'
    : 'EXISTS (SELECT 1 FROM learning_state WHERE user_id = ? AND revision = ? AND payload_json = ? AND updated_at = ?)';
  const stateParams = written.state === null ? [target.user_id]
    : [target.user_id, written.revision, written.rawPayload, written.updatedAt];
  const linked = await ctx.db.prepare(`INSERT INTO sync_account_links
    (source_origin, source_user_id, target_user_id, created_at)
    SELECT ?, ?, ?, ? WHERE ${stateGuard}
    AND EXISTS (SELECT 1 FROM auth_accounts WHERE provider_subject = ? AND user_id = ? AND lower(email) = ?)
    ON CONFLICT(source_origin, source_user_id) DO NOTHING RETURNING target_user_id`)
    .bind(ctx.origin, user.id, target.user_id, createdAt, ...stateParams,
      target.provider_subject, target.user_id, normalizedEmail(target.email)).first();
  if (!linked || linked.target_user_id !== target.user_id) fail(409, 'migration_link_changed');
  const resolved = await linkedUser(ctx, user);
  if (!resolved || resolved.id !== target.user_id) fail(409, 'migration_link_invalid');
  return resolved;
}

async function catalog(db) {
  const [lessonResult, cardResult] = await Promise.all([
    db.prepare('SELECT id, learning_date, payload_json, created_at FROM lessons ORDER BY id').all(),
    db.prepare('SELECT word, payload_json, updated_at FROM word_cards ORDER BY word').all(),
  ]);
  const lessons = lessonResult?.results;
  const wordCards = cardResult?.results;
  if (!Array.isArray(lessons) || !Array.isArray(wordCards)) fail(500, 'stored_catalog_invalid');
  for (const row of lessons) {
    let payload;
    try { payload = JSON.parse(row.payload_json); } catch (_) { fail(500, 'stored_catalog_invalid'); }
    if (!payload || payload.id !== row.id || payload.learningDate !== row.learning_date || !validTime(row.created_at)) {
      fail(500, 'stored_catalog_invalid');
    }
  }
  for (const row of wordCards) {
    let payload;
    try { payload = JSON.parse(row.payload_json); } catch (_) { fail(500, 'stored_catalog_invalid'); }
    if (!payload || payload.word !== row.word || !validTime(row.updated_at)) fail(500, 'stored_catalog_invalid');
  }
  return {lessons, wordCards};
}

function catalogPreview(source, target) {
  const lessonConflicts = [];
  const cardConflicts = [];
  let addedLessons = 0;
  let addedWordCards = 0;
  for (const row of source.lessons) {
    const match = target.lessons.find(item => item.id === row.id || item.learning_date === row.learning_date);
    if (!match) addedLessons++;
    else if (match.id !== row.id || match.learning_date !== row.learning_date || match.payload_json !== row.payload_json) {
      lessonConflicts.push({sourceId: row.id, targetId: match.id, learningDate: row.learning_date});
    }
  }
  const cards = new Map(target.wordCards.map(row => [row.word, row]));
  for (const row of source.wordCards) {
    const match = cards.get(row.word);
    if (!match) addedWordCards++;
    else if (match.payload_json !== row.payload_json) cardConflicts.push(row.word);
  }
  return {sourceLessons: source.lessons.length, targetLessons: target.lessons.length,
    sourceWordCards: source.wordCards.length, targetWordCards: target.wordCards.length,
    addedLessons, addedWordCards, lessonConflicts, cardConflicts};
}

async function copyCatalog(db, source, target) {
  const lessonIds = new Set(target.lessons.map(row => row.id));
  const lessonDates = new Set(target.lessons.map(row => row.learning_date));
  const words = new Set(target.wordCards.map(row => row.word));
  const statements = [];
  for (const row of source.lessons) {
    if (lessonIds.has(row.id) || lessonDates.has(row.learning_date)) continue;
    statements.push(db.prepare(`INSERT INTO lessons (id, learning_date, payload_json, created_at)
      VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`).bind(row.id, row.learning_date, row.payload_json, row.created_at));
  }
  for (const row of source.wordCards) {
    if (words.has(row.word)) continue;
    statements.push(db.prepare(`INSERT INTO word_cards (word, payload_json, updated_at)
      VALUES (?, ?, ?) ON CONFLICT(word) DO NOTHING`).bind(row.word, row.payload_json, row.updated_at));
  }
  // Avoid one network round-trip for every shared teaching card. Keep chunks
  // small enough for both native D1 and the shared store's REST transport.
  for (let offset = 0; offset < statements.length; offset += 20) {
    const chunk = statements.slice(offset, offset + 20);
    if (typeof db.batch === 'function') await db.batch(chunk);
    else for (const statement of chunk) await statement.run();
  }
}

export async function prepareSharedIdentity(request, env, user) {
  return execute(async () => {
    const ctx = context(request, env, user);
    if (!ctx) return {user, report: {phase: 'disabled'}};
    const existing = await linkedUser(ctx, user);
    if (existing) return {user: existing, report: {phase: 'linked'}};
    const editor = normalizedEmail(env.EDITOR_EMAIL);
    const ownerEmail = normalizedEmail(env.SHARED_MIGRATION_OWNER_EMAIL);
    // A caller may only use its own established mapping. Initial owner mapping
    // is restricted to the authenticated Sites editor plus private configuration.
    if (!editor || normalizedEmail(user.email) !== editor || !ownerEmail) {
      return {user, report: {phase: 'unlinked'}};
    }
    const target = await targetAccount(ctx.db, ownerEmail);
    const [legacy, remote, sourceCatalog, targetCatalog] = await Promise.all([
      snapshot(ctx.legacy, user.id, ctx.sync), snapshot(ctx.db, target.user_id, ctx.sync),
      catalog(ctx.legacy), catalog(ctx.db),
    ]);
    const createdAt = new Date().toISOString();
    const backupIds = [
      await saveBackup(ctx.db, ctx.origin, user.id, target.user_id, legacy, createdAt),
      await saveBackup(ctx.db, 'shared-cloud', target.user_id, target.user_id, remote, createdAt),
      await saveBackup(ctx.db, ctx.origin + '#catalog', user.id, target.user_id,
        {revision: 0, payload: JSON.stringify({catalog: sourceCatalog})}, createdAt),
      await saveBackup(ctx.db, 'shared-cloud#catalog', target.user_id, target.user_id,
        {revision: 0, payload: JSON.stringify({catalog: targetCatalog})}, createdAt),
    ];
    const preview = previewAccountRecovery(legacy.state, remote.state, {sync: ctx.sync, engine: globalThis.IELTS_ENGINE});
    const report = previewReport(legacy, remote, preview, backupIds);
    report.catalog = catalogPreview(sourceCatalog, targetCatalog);
    if (env.SHARED_MIGRATION_APPLY !== '1') return {user, report};
    // The wrapper must stop legacy writes during apply: two different databases
    // cannot share a transaction. These checks additionally catch stale readers
    // and preserve both snapshots if any concurrent source change is observed.
    await verifySource(ctx, user.id, legacy);
    if (JSON.stringify(await catalog(ctx.legacy)) !== JSON.stringify(sourceCatalog)) fail(409, 'migration_source_changed');
    const written = await applyState(ctx, target, remote, preview.state, new Date().toISOString());
    await copyCatalog(ctx.db, sourceCatalog, targetCatalog);
    await verifySource(ctx, user.id, legacy);
    if (JSON.stringify(await catalog(ctx.legacy)) !== JSON.stringify(sourceCatalog)) fail(409, 'migration_source_changed');
    const canonicalUser = await createLink(ctx, user, target, written, new Date().toISOString());
    return {user: canonicalUser, report: {...report, phase: 'applied', targetRevision: written.revision}};
  });
}

globalThis.XUNCI_SHARED_STORE = Object.freeze({SHARED_SCHEMA, SharedStoreError,
  prepareSharedIdentity, resolveSharedIdentity});
