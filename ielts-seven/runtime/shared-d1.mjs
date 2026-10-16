// Server-to-server binding only. The browser never receives this HMAC key or a
// SQL endpoint credential. Render retains its existing Cloudflare API token.
const PATH = '/internal/shared-d1';
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const TABLES = new Set(['learning_state', 'lessons', 'word_cards', 'auth_accounts',
  'auth_rate_limits', 'auth_sessions', 'auth_pending_logins', 'sync_legacy_backups', 'sync_account_links']);
const FORBIDDEN = new Set(['attach', 'detach', 'pragma', 'create', 'drop', 'alter', 'vacuum',
  'reindex', 'analyze', 'begin', 'commit', 'rollback', 'savepoint', 'release', 'replace']);
const FUNCTIONS = new Set(['count', 'max', 'min', 'sum', 'total', 'avg', 'coalesce', 'ifnull',
  'nullif', 'iif', 'typeof', 'length', 'lower', 'upper', 'abs', 'round', 'json_extract',
  'json_valid', 'json_type', 'group_concat']);
const PAREN_KEYWORDS = new Set(['exists', 'in', 'values', 'conflict', 'not', 'and', 'or', 'where', 'select', 'when']);
const FROM_END = new Set(['where', 'group', 'having', 'order', 'limit', 'returning', 'union', 'intersect', 'except', 'window', 'set', 'values']);
const statements = new WeakMap();
const encoder = new TextEncoder();

export class SharedD1Error extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'SharedD1Error';
    this.code = code;
    if (Number.isInteger(status)) this.status = status;
  }
}
const fail = (code = 'SHARED_D1_INPUT', message = 'Shared database input is invalid.', status = 400) => {
  throw new SharedD1Error(code, message, status);
};
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const keys = (value, names) => object(value) && Object.keys(value).length === names.length
  && names.every(name => Object.hasOwn(value, name));

function secretBytes(secret) {
  if (typeof secret !== 'string') fail('SHARED_D1_CONFIG', 'Shared database signing configuration is invalid.');
  let bytes;
  if (/^[a-f0-9]{64,128}$/i.test(secret) && secret.length % 2 === 0) {
    bytes = Uint8Array.from(secret.match(/../g), pair => parseInt(pair, 16));
  } else if (/^[A-Za-z0-9_-]{43,86}$/.test(secret)) {
    try {
      const binary = atob(secret.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - secret.length % 4) % 4));
      bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      const canonical = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      if (canonical !== secret) bytes = null;
    } catch (_) { bytes = null; }
  }
  if (!bytes || bytes.length < 32 || bytes.length > 64) fail('SHARED_D1_CONFIG', 'Shared database signing configuration is invalid.');
  return bytes;
}

function options({secret, timeoutMs = 15000, now = Date.now, cryptoImpl = globalThis.crypto} = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000 || typeof now !== 'function'
      || !cryptoImpl?.subtle || typeof cryptoImpl.getRandomValues !== 'function') {
    fail('SHARED_D1_CONFIG', 'Shared database transport configuration is invalid.');
  }
  const bytes = secretBytes(secret);
  // Import synchronously validated material once, without ever serializing it.
  const key = cryptoImpl.subtle.importKey('raw', bytes, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
  return {timeoutMs, now, cryptoImpl, key};
}
function timestamp(now) {
  const value = now();
  if (!Number.isSafeInteger(value) || value < 0) fail('SHARED_D1_CONFIG', 'Shared database clock is invalid.');
  return value;
}
const hex = bytes => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
const signedBytes = (time, nonce, raw) => encoder.encode(`xunci-shared-d1-v1\nPOST\n${PATH}\n${time}\n${nonce}\n${raw}`);

// A deliberately narrow SQL lexer. Strings are not interpreted as identifiers;
// comments, schema qualifiers, table functions, CTEs, and DDL are rejected.
function sqlTokens(sql) {
  if (typeof sql !== 'string' || !sql.trim() || encoder.encode(sql).byteLength > 256 * 1024) fail();
  const tokens = [];
  for (let i = 0; i < sql.length;) {
    const char = sql[i];
    if (/\s/.test(char)) { i++; continue; }
    if ((char === '-' && sql[i + 1] === '-') || (char === '/' && sql[i + 1] === '*')) fail();
    if (char === "'") {
      let closed = false; i++;
      while (i < sql.length) {
        if (sql[i++] !== "'") continue;
        if (sql[i] === "'") { i++; continue; }
        closed = true; break;
      }
      if (!closed) fail();
      tokens.push({type: 'literal', value: ''}); continue;
    }
    if (char === '"' || char === '`' || char === '[') {
      const end = char === '[' ? ']' : char;
      let name = '', closed = false; i++;
      while (i < sql.length) {
        const current = sql[i++];
        if (current !== end) { name += current; continue; }
        if (end !== ']' && sql[i] === end) { name += end; i++; continue; }
        closed = true; break;
      }
      if (!closed || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) fail();
      tokens.push({type: 'identifier', value: name.toLowerCase()}); continue;
    }
    const word = sql.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (word) { tokens.push({type: 'word', value: word[0].toLowerCase()}); i += word[0].length; continue; }
    const number = sql.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) { tokens.push({type: 'number', value: number[0]}); i += number[0].length; continue; }
    if (!/[().,;=<>!+\-*\/%|&~?]/.test(char)) fail();
    tokens.push({type: 'symbol', value: char}); i++;
  }
  return tokens;
}

function validateSql(sql) {
  const tokens = sqlTokens(sql);
  if (tokens.at(-1)?.value === ';') tokens.pop();
  if (!tokens.length || tokens[0].type !== 'word' || !['select', 'insert', 'update', 'delete'].includes(tokens[0].value)
      || tokens.some(token => token.value === ';' || (token.type === 'word' && FORBIDDEN.has(token.value)))) fail();
  const tablePositions = new Set();
  const tableAt = (index, subquery = false) => {
    const token = tokens[index];
    if (subquery && token?.value === '(' && tokens[index + 1]?.type === 'word' && tokens[index + 1].value === 'select') return;
    if (!token || !['word', 'identifier'].includes(token.type) || !TABLES.has(token.value)
        || tokens[index + 1]?.value === '.') fail();
    tablePositions.add(index);
    if (subquery && tokens[index + 1]?.value === '(') fail();
  };
  let depth = 0;
  const from = new Map();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i], value = token.value;
    if (value === '(') { depth++; continue; }
    if (value === ')') { from.delete(depth); if (--depth < 0) fail(); continue; }
    if (token.type === 'word') {
      if (FROM_END.has(value)) from.delete(depth);
      if (value === 'from' || value === 'join') { tableAt(i + 1, true); from.set(depth, true); }
      if (value === 'into' || (value === 'update' && tokens[i - 1]?.value !== 'do')) tableAt(i + 1);
    }
    if (value === ',' && from.get(depth)) tableAt(i + 1, true);
  }
  if (depth !== 0) fail();
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    if (['word', 'identifier'].includes(token.type) && tokens[i + 1].value === '(' && !tablePositions.has(i)
        && !FUNCTIONS.has(token.value) && !(token.type === 'word' && PAREN_KEYWORDS.has(token.value))) fail();
  }
  return sql;
}

function params(values) {
  if (!Array.isArray(values) || values.length > 100 || values.some(value => value !== null
      && typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value)))) fail();
  return Object.freeze([...values]);
}
function queriesEnvelope(value) {
  if (!keys(value, ['version', 'batch', 'queries']) || value.version !== 1 || typeof value.batch !== 'boolean'
      || !Array.isArray(value.queries) || value.queries.length < 1 || value.queries.length > 100
      || (!value.batch && value.queries.length !== 1)) fail();
  return value.queries.map(query => {
    if (!keys(query, ['sql', 'params'])) fail();
    return {sql: validateSql(query.sql), params: params(query.params)};
  });
}

async function boundedText(message, maxBytes, signal, kind = 'SHARED_D1_RESPONSE') {
  const length = message.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    await message.body?.cancel().catch(() => {});
    fail(kind, 'Shared database message exceeds its supported size.', kind === 'SHARED_D1_INPUT' ? 413 : 502);
  }
  if (!message.body) fail(kind, 'Shared database message is invalid.', 400);
  const reader = message.body.getReader();
  const abort = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, {once: true});
  const decoder = new TextDecoder('utf-8', {fatal: true});
  let text = '', bytes = 0;
  try {
    if (signal?.aborted) abort();
    while (true) {
      const chunk = await reader.read();
      if (signal?.aborted) fail('SHARED_D1_TIMEOUT', 'Shared database request timed out.', 503);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {});
        fail(kind, 'Shared database message exceeds its supported size.', kind === 'SHARED_D1_INPUT' ? 413 : 502);
      }
      text += decoder.decode(chunk.value, {stream: true});
    }
    return text + decoder.decode();
  } catch (error) {
    if (error instanceof SharedD1Error) throw error;
    fail(kind, 'Shared database message is invalid.', kind === 'SHARED_D1_INPUT' ? 400 : 502);
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

async function deadline(timeoutMs, operation) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new SharedD1Error('SHARED_D1_TIMEOUT', 'Shared database request timed out; no automatic retry was attempted.', 503));
    }, timeoutMs);
  });
  try { return await Promise.race([operation(controller.signal), timeout]); }
  finally { clearTimeout(timer); }
}

function results(value, expected) {
  if (!Array.isArray(value) || value.length !== expected) fail('SHARED_D1_RESPONSE', 'Shared database results are invalid.', 502);
  return value.map(result => {
    if (!object(result) || result.success !== true || (result.results !== undefined
        && (!Array.isArray(result.results) || result.results.some(row => !object(row))))
        || (result.meta !== undefined && !object(result.meta))) {
      fail('SHARED_D1_QUERY', 'Shared database operation was rejected.', 502);
    }
    return {success: true, results: result.results || [], ...(result.meta === undefined ? {} : {meta: result.meta})};
  });
}
function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'
  }});
}

export function createSharedD1Client({endpoint, secret, fetchImpl = globalThis.fetch, ...settings} = {}) {
  const config = options({secret, ...settings});
  let url;
  try { url = new URL(endpoint); } catch (_) { fail('SHARED_D1_CONFIG', 'Shared database endpoint configuration is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['/', PATH].includes(url.pathname)
      || typeof fetchImpl !== 'function') fail('SHARED_D1_CONFIG', 'Shared database endpoint configuration is invalid.');
  url.pathname = PATH;
  const target = url.href, owner = {};

  async function query(queries, batch) {
    const raw = JSON.stringify({version: 1, batch, queries});
    if (encoder.encode(raw).byteLength > MAX_REQUEST_BYTES) fail();
    return deadline(config.timeoutMs, async signal => {
      const time = String(timestamp(config.now));
      const nonce = hex(config.cryptoImpl.getRandomValues(new Uint8Array(16)));
      const signature = hex(new Uint8Array(await config.cryptoImpl.subtle.sign('HMAC', await config.key, signedBytes(time, nonce, raw))));
      if (signal.aborted) fail('SHARED_D1_TIMEOUT', 'Shared database request timed out.', 503);
      let received;
      try {
        received = await fetchImpl(target, {method: 'POST', redirect: 'manual', signal, body: raw, headers: {
          'Content-Type': 'application/json', 'Accept': 'application/json',
          'X-Xunci-D1-Timestamp': time, 'X-Xunci-D1-Nonce': nonce, 'X-Xunci-D1-Signature': signature
        }});
      } catch (_) { fail('SHARED_D1_NETWORK', 'Shared database connection failed; no automatic retry was attempted.', 503); }
      if (!received || !Number.isInteger(received.status) || !received.headers || !received.body) {
        fail('SHARED_D1_RESPONSE', 'Shared database returned an invalid HTTP response.', 502);
      }
      if (received.redirected || (received.url && received.url !== target) || (received.status >= 300 && received.status < 400)) {
        await received.body.cancel().catch(() => {});
        fail('SHARED_D1_HTTP', 'Shared database redirects are not permitted.', received.status);
      }
      if (received.status < 200 || received.status >= 300) {
        await received.body.cancel().catch(() => {});
        fail('SHARED_D1_HTTP', 'Shared database request was rejected.', received.status);
      }
      let parsed;
      try { parsed = JSON.parse(await boundedText(received, MAX_RESPONSE_BYTES, signal)); }
      catch (error) { if (error instanceof SharedD1Error) throw error; fail('SHARED_D1_RESPONSE', 'Shared database response is invalid.', 502); }
      if (!keys(parsed, ['version', 'success', 'result']) || parsed.version !== 1 || parsed.success !== true) {
        fail('SHARED_D1_RESPONSE', 'Shared database response is invalid.', 502);
      }
      return results(parsed.result, queries.length);
    });
  }
  function prepared(sql, values = []) {
    const statement = Object.freeze({
      bind(...input) { return prepared(sql, params(input)); },
      async first(column) {
        if (column !== undefined && typeof column !== 'string') fail();
        const row = (await query([{sql, params: values}], false))[0].results[0];
        if (!row) return null;
        if (column === undefined) return row;
        if (!Object.hasOwn(row, column)) fail();
        return row[column];
      },
      async all() { return (await query([{sql, params: values}], false))[0]; },
      async run() { return (await query([{sql, params: values}], false))[0]; }
    });
    statements.set(statement, {owner, sql, params: values});
    return statement;
  }
  return Object.freeze({
    prepare(sql) { return prepared(validateSql(sql)); },
    async batch(input) {
      if (!Array.isArray(input) || !input.length || input.length > 100) fail();
      const queries = input.map(statement => {
        const value = statements.get(statement);
        if (!value || value.owner !== owner) fail();
        return {sql: value.sql, params: value.params};
      });
      return query(queries, true);
    }
  });
}

// Construct once per server/Worker isolate. Do not reconstruct this handler on
// each request: its replay cache deliberately retains every live nonce.
export function createSharedD1Handler({db, secret, windowMs = 60000, maxNonces = 10000, ...settings} = {}) {
  const config = options({secret, ...settings});
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function'
      || !Number.isInteger(windowMs) || windowMs < 1 || windowMs > 300000
      || !Number.isInteger(maxNonces) || maxNonces < 1 || maxNonces > 100000) {
    fail('SHARED_D1_CONFIG', 'Shared database handler configuration is invalid.');
  }
  const nonces = new Map();
  return async function sharedD1Handler(request) {
    let url;
    try { url = new URL(request.url); } catch (_) { return null; }
    if (url.pathname !== PATH) return null;
    if (request.method !== 'POST') return response({error: 'shared_d1_method_not_allowed'}, 405);
    try {
      if (url.search || request.headers.has('origin') || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
          || (request.headers.has('content-encoding') && request.headers.get('content-encoding') !== 'identity')) fail();
      const time = request.headers.get('X-Xunci-D1-Timestamp');
      const nonce = request.headers.get('X-Xunci-D1-Nonce');
      const signature = request.headers.get('X-Xunci-D1-Signature');
      if (!/^\d{1,16}$/.test(time || '') || !/^[a-f0-9]{32}$/.test(nonce || '') || !/^[a-f0-9]{64}$/.test(signature || '')
          || !Number.isSafeInteger(Number(time)) || Math.abs(timestamp(config.now) - Number(time)) > windowMs) {
        fail('SHARED_D1_AUTH', 'Shared database authentication failed.', 401);
      }
      return await deadline(config.timeoutMs, async signal => {
        const raw = await boundedText(request, MAX_REQUEST_BYTES, signal, 'SHARED_D1_INPUT');
        const verified = await config.cryptoImpl.subtle.verify('HMAC', await config.key,
          Uint8Array.from(signature.match(/../g), pair => parseInt(pair, 16)), signedBytes(time, nonce, raw));
        if (signal.aborted) fail('SHARED_D1_TIMEOUT', 'Shared database request timed out.', 503);
        const current = timestamp(config.now);
        if (!verified || Math.abs(current - Number(time)) > windowMs) fail('SHARED_D1_AUTH', 'Shared database authentication failed.', 401);
        for (const [key, expires] of nonces) if (expires < current) nonces.delete(key);
        if (nonces.has(nonce)) fail('SHARED_D1_REPLAY', 'Shared database request was already received.', 409);
        // Refuse excess traffic instead of evicting live nonces and admitting replays.
        if (nonces.size >= maxNonces) fail('SHARED_D1_CAPACITY', 'Shared database request capacity is temporarily exhausted.', 503);
        nonces.set(nonce, Number(time) + windowMs);
        let payload;
        try { payload = JSON.parse(raw); } catch (_) { fail(); }
        const queries = queriesEnvelope(payload);
        const prepared = queries.map(query => db.prepare(query.sql).bind(...query.params));
        let values;
        try { values = payload.batch ? await db.batch(prepared) : [await prepared[0].all()]; }
        catch (_) { fail('SHARED_D1_QUERY', 'Shared database operation was rejected.', 502); }
        if (signal.aborted) fail('SHARED_D1_TIMEOUT', 'Shared database request timed out.', 503);
        const normalized = results(values, queries.length);
        let text;
        try { text = JSON.stringify({version: 1, success: true, result: normalized}); }
        catch (_) { fail('SHARED_D1_RESPONSE', 'Shared database results are invalid.', 502); }
        if (encoder.encode(text).byteLength > MAX_RESPONSE_BYTES) fail('SHARED_D1_RESPONSE', 'Shared database results exceed their supported size.', 502);
        return new Response(text, {headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'}});
      });
    } catch (error) {
      if (error instanceof SharedD1Error) {
        const codes = {SHARED_D1_AUTH: 'shared_d1_authentication_failed', SHARED_D1_REPLAY: 'shared_d1_replay',
          SHARED_D1_TIMEOUT: 'shared_d1_timeout', SHARED_D1_CAPACITY: 'shared_d1_capacity', SHARED_D1_INPUT: 'shared_d1_invalid_input'};
        return response({error: codes[error.code] || 'shared_d1_operation_failed'}, error.status || 500);
      }
      return response({error: 'shared_d1_operation_failed'}, 500);
    }
  };
}
