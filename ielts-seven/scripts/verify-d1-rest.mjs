// This must run against the real D1 REST API during a Render build. Local mocks
// cannot prove REST parameter types, RETURNING behavior, or batch rollback.
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {configFromEnv, createD1Rest, D1RestError} from '../runtime/d1-rest.mjs';

const APPLICATION_SCHEMA = Object.freeze({
  learning_state: 'user_id, revision, payload_json, updated_at',
  lessons: 'id, learning_date, payload_json, created_at',
  word_cards: 'word, payload_json, updated_at',
  auth_accounts: 'provider_subject, user_id, email, legacy_link_decided, created_at, updated_at',
  auth_rate_limits: 'rate_key, window_started_at, attempts, blocked_until',
  auth_sessions: 'session_hash, provider_subject, tokens_ciphertext, expires_at, provider_expires_at, version, refresh_lock_until, created_at',
  auth_pending_logins: 'login_hash, verifier_ciphertext, expected_email, expires_at, claimed_at, created_at'
});

export class D1VerificationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'D1VerificationError';
    this.code = 'D1_PREFLIGHT';
  }
}

function ensure(condition) {
  if (!condition) throw new Error('Unsupported D1 REST semantics.');
}

function bindingDiagnostics(row) {
  // Only describe outputs of the constant synthetic SELECT. In particular, do
  // not stringify an unexpected provider value, which could contain raw data.
  const sqlType = value => ['integer', 'real', 'text', 'blob', 'null'].includes(value)
    ? value : value === undefined ? 'missing' : 'unexpected';
  const flag = value => value === 0 || value === 1 ? value
    : value === '0' || value === '1' ? `text-${value}`
    : value === null ? 'null'
    : value === undefined ? 'missing'
    : typeof value === 'boolean' ? `boolean-${value}` : 'unexpected';
  return {integer_type: sqlType(row?.integer_type), real_type: sqlType(row?.real_type),
    null_value: flag(row?.null_value), ordered: flag(row?.ordered)};
}

export async function verifyD1Rest({env = process.env, db, log = console.log} = {}) {
  db ??= createD1Rest(configFromEnv(env));
  const table = '__xunci_render_probe_' + randomUUID().replaceAll('-', '');
  const quoted = `"${table}"`;
  let phase = 'application schema', cleanupNeeded = false, failure;
  try {
    // Compile the exact required columns without selecting a user's data.
    await db.batch(Object.entries(APPLICATION_SCHEMA).map(([name, columns]) =>
      db.prepare(`SELECT ${columns} FROM ${name} WHERE 0`)));
    log('D1 REST preflight: required application schema verified.');

    phase = 'numeric bindings';
    const types = await db.prepare('SELECT typeof(?) AS integer_type, typeof(?) AS real_type, ? IS NULL AS null_value, ? < ? AS ordered')
      .bind(7, 2.5, null, 2, 10).first();
    const numericBindingsValid = types?.integer_type === 'integer' && types.real_type === 'real' && types.null_value === 1 && types.ordered === 1;
    if (!numericBindingsValid) {
      log(`D1 REST preflight: synthetic numeric binding diagnostics ${JSON.stringify(bindingDiagnostics(types))}`);
    }
    ensure(numericBindingsValid);

    phase = 'isolated probe table creation';
    cleanupNeeded = true; // A timed-out CREATE might still have reached D1.
    await db.prepare(`CREATE TABLE ${quoted} (id INTEGER PRIMARY KEY, amount REAL NOT NULL, optional TEXT, label TEXT NOT NULL UNIQUE)`).run();
    phase = 'numeric comparisons and RETURNING';
    const inserted = await db.prepare(`INSERT INTO ${quoted} (id, amount, optional, label) VALUES (?, ?, ?, ?) RETURNING id, amount, optional, label`)
      .bind(1, 2.5, null, 'first').first();
    ensure(inserted?.id === 1 && inserted.amount === 2.5 && inserted.optional === null && inserted.label === 'first');
    const updated = await db.prepare(`UPDATE ${quoted} SET amount = amount + ? WHERE id = ? AND amount < ? RETURNING amount`)
      .bind(1.25, 1, 3).first();
    ensure(updated?.amount === 3.75);
    log('D1 REST preflight: numeric bindings, comparisons, and RETURNING verified.');

    phase = 'successful transactional batch';
    const successful = await db.batch([
      db.prepare(`INSERT INTO ${quoted} (id, amount, optional, label) VALUES (?, ?, ?, ?)`).bind(2, 8, null, 'second'),
      db.prepare(`UPDATE ${quoted} SET amount = ? WHERE id = ? RETURNING id, amount`).bind(4.5, 1),
      db.prepare(`SELECT COUNT(*) AS count FROM ${quoted}`)
    ]);
    ensure(successful.length === 3 && successful[1].results[0]?.id === 1 && successful[1].results[0]?.amount === 4.5
      && successful[2].results[0]?.count === 2);

    phase = 'failed transactional batch rollback';
    let rejected = false;
    try {
      await db.batch([
        db.prepare(`INSERT INTO ${quoted} (id, amount, optional, label) VALUES (?, ?, ?, ?)`).bind(3, 9, null, 'must-roll-back'),
        db.prepare(`INSERT INTO ${quoted} (id, amount, optional, label) VALUES (?, ?, ?, ?)`).bind(4, 10, null, 'first')
      ]);
    } catch (error) {
      // Network/permission/protocol failures are not proof of transactional SQL
      // rejection and must fail this preflight instead of being accepted.
      if (!(error instanceof D1RestError) || error.code !== 'D1_QUERY') throw error;
      rejected = true;
    }
    ensure(rejected);
    const remaining = await db.prepare(`SELECT COUNT(*) AS count, SUM(CASE WHEN id = 3 THEN 1 ELSE 0 END) AS uncommitted FROM ${quoted}`).first();
    ensure(remaining?.count === 2 && remaining.uncommitted === 0);
    log('D1 REST preflight: ordered batch execution and failed-batch rollback verified.');
  } catch (error) {
    const detail = error instanceof D1RestError ? ` ${error.message}` : '';
    failure = new D1VerificationError(`D1 REST preflight failed during ${phase}.${detail}`);
  } finally {
    if (cleanupNeeded) {
      try {
        await db.prepare(`DROP TABLE IF EXISTS ${quoted}`).run();
        log('D1 REST preflight: isolated probe table removed.');
      } catch (_) {
        failure = new D1VerificationError('D1 REST preflight failed: cleanup of its isolated probe table could not be confirmed. Check the D1 connection before retrying.');
      }
    }
  }
  if (failure) throw failure;
  log('D1 REST preflight passed against the real remote database.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await verifyD1Rest();
  } catch (error) {
    // All verifier errors are constructed above or by the safe configuration
    // validator. Never forward provider bodies, tokens, SQL, or bound values.
    console.error(error instanceof D1RestError || error instanceof D1VerificationError
      ? error.message : 'D1 REST preflight failed.');
    process.exitCode = 1;
  }
}
