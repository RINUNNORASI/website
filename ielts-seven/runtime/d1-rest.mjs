// Server-only D1 binding for the independent Node host. Credentials never reach
// the Worker assets or a browser; all queries use Cloudflare's fixed API origin.
const ACCOUNT_ID = /^[a-f0-9]{32}$/i;
const DATABASE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DATABASE_NAME = /^[a-z0-9][a-z0-9_-]{0,62}$/i;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_DISCOVERY_BYTES = 1024 * 1024;
const MAX_DISCOVERY_PAGES = 100;
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const statements = new WeakMap();

export class D1RestError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'D1RestError';
    this.code = code;
    if (Number.isInteger(status)) this.status = status;
  }
}

function credentials({accountId, apiToken} = {}) {
  if (typeof accountId !== 'string' || !ACCOUNT_ID.test(accountId)) {
    throw new D1RestError('D1_CONFIG', 'D1 requires CLOUDFLARE_ACCOUNT_ID containing 32 hexadecimal characters.');
  }
  if (typeof apiToken !== 'string' || !apiToken || apiToken.length > 4096 || /[\s\x00-\x1f\x7f]/.test(apiToken)) {
    throw new D1RestError('D1_CONFIG', 'D1 requires a nonempty CLOUDFLARE_D1_API_TOKEN without whitespace.');
  }
  return {accountId: accountId.toLowerCase(), apiToken};
}

function configuration({accountId, databaseId, apiToken} = {}) {
  const normalized = credentials({accountId, apiToken});
  if (typeof databaseId !== 'string' || !DATABASE_ID.test(databaseId)) {
    throw new D1RestError('D1_CONFIG', 'D1 requires D1_DATABASE_ID containing the database UUID.');
  }
  return {...normalized, databaseId: databaseId.toLowerCase()};
}

export function configFromEnv(env = {}) {
  return configuration({accountId: env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: env.D1_DATABASE_ID, apiToken: env.CLOUDFLARE_D1_API_TOKEN});
}

function transportOptions(fetchImpl, timeoutMs) {
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) {
    throw new D1RestError('D1_CONFIG', 'D1 requires a fetch implementation and a timeout between 1 and 120000 milliseconds.');
  }
}

// Discovery reads account metadata only. It never creates a database or falls
// back to whichever database Cloudflare happens to return first.
export async function resolveD1ConfigFromEnv(env = {}, {fetchImpl = globalThis.fetch, timeoutMs = 15000} = {}) {
  if (env.D1_DATABASE_ID !== undefined && env.D1_DATABASE_ID !== '') return configFromEnv(env);
  const config = credentials({accountId: env.CLOUDFLARE_ACCOUNT_ID, apiToken: env.CLOUDFLARE_D1_API_TOKEN});
  const name = env.D1_DATABASE_NAME === undefined ? 'xunci-ielts-db' : env.D1_DATABASE_NAME;
  if (typeof name !== 'string' || !DATABASE_NAME.test(name)) {
    throw new D1RestError('D1_CONFIG', 'D1_DATABASE_NAME must contain 1 to 63 letters, numbers, underscores, or hyphens and start with a letter or number.');
  }
  transportOptions(fetchImpl, timeoutMs);
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new D1RestError('D1_TIMEOUT', 'D1 database discovery timed out.'));
    }, timeoutMs);
  });
  const operation = async () => {
    let match;
    for (let page = 1; page <= MAX_DISCOVERY_PAGES; page++) {
      if (controller.signal.aborted) throw new D1RestError('D1_TIMEOUT', 'D1 database discovery timed out.');
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database?${new URLSearchParams({name, per_page: '100', page: String(page)})}`;
      let response;
      try {
        response = await fetchImpl(endpoint, {method: 'GET', redirect: 'manual',
          headers: {'Authorization': `Bearer ${config.apiToken}`, 'Accept': 'application/json'}, signal: controller.signal});
      } catch (_) {
        throw new D1RestError('D1_NETWORK', 'D1 database discovery connection failed.');
      }
      if (!response || !Number.isInteger(response.status) || !response.headers || !response.body) {
        throw new D1RestError('D1_RESPONSE', 'D1 database discovery returned an invalid HTTP response.');
      }
      if (response.redirected || (response.url && response.url !== endpoint) || (response.status >= 300 && response.status < 400)) {
        await response.body.cancel().catch(() => {});
        throw new D1RestError('D1_HTTP', 'D1 database discovery redirects are not permitted.', response.status);
      }
      if (response.status < 200 || response.status >= 300) {
        await response.body.cancel().catch(() => {});
        throw new D1RestError('D1_HTTP', `D1 database discovery failed with HTTP ${response.status}.`, response.status);
      }
      const envelope = await boundedJson(response, MAX_DISCOVERY_BYTES);
      if (controller.signal.aborted) throw new D1RestError('D1_TIMEOUT', 'D1 database discovery timed out.');
      if (!resultObject(envelope) || typeof envelope.success !== 'boolean') {
        throw new D1RestError('D1_RESPONSE', 'D1 database discovery returned an invalid API response.');
      }
      if (!envelope.success) throw new D1RestError('D1_DISCOVERY', 'D1 database discovery was rejected. Check the account and D1 API token permissions.');
      if (!Array.isArray(envelope.result)
          || envelope.result.length > 100 || envelope.result.some(row => !resultObject(row) || typeof row.name !== 'string')) {
        throw new D1RestError('D1_RESPONSE', 'D1 database discovery returned an invalid API response.');
      }
      for (const row of envelope.result) {
        if (row.name !== name) continue;
        if (typeof row.uuid !== 'string' || !DATABASE_ID.test(row.uuid)) {
          throw new D1RestError('D1_RESPONSE', 'D1 database discovery returned an invalid database UUID.');
        }
        if (match !== undefined) throw new D1RestError('D1_DISCOVERY', 'D1 database discovery found more than one exact name match. Set D1_DATABASE_ID explicitly.');
        match = row.uuid.toLowerCase();
      }
      const info = envelope.result_info;
      if (info !== undefined && (!resultObject(info)
          || (info.page !== undefined && info.page !== page)
          || (info.per_page !== undefined && (!Number.isInteger(info.per_page) || info.per_page < 1 || info.per_page > 100))
          || (info.count !== undefined && info.count !== envelope.result.length)
          || (info.total_pages !== undefined && (!Number.isInteger(info.total_pages) || info.total_pages < 0))
          || (info.total_count !== undefined && (!Number.isInteger(info.total_count) || info.total_count < 0)))) {
        throw new D1RestError('D1_RESPONSE', 'D1 database discovery returned invalid pagination metadata.');
      }
      // Follow explicit pagination even if a filtered page contains fewer rows.
      // Without metadata, a full page requires checking the following page.
      const hasNext = info?.total_pages !== undefined ? page < info.total_pages
        : info?.total_count !== undefined ? page * (info.per_page || 100) < info.total_count
        : envelope.result.length === (info?.per_page || 100);
      if (hasNext) continue;
      if (match === undefined) throw new D1RestError('D1_DISCOVERY', 'D1 database discovery found no exact name match. Check D1_DATABASE_NAME and the account.');
      return {...config, databaseId: match};
    }
    throw new D1RestError('D1_DISCOVERY', 'D1 database discovery exceeded the supported number of pages. Set D1_DATABASE_ID explicitly.');
  };
  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function validParams(params) {
  if (params.length > 100 || params.some(value => value !== null && typeof value !== 'string'
      && !(typeof value === 'number' && Number.isFinite(value)))) {
    throw new D1RestError('D1_INPUT', 'D1 bind parameters must be strings, finite numbers, or null, with at most 100 parameters.');
  }
  return Object.freeze([...params]);
}

function resultObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function boundedJson(response, maxBytes = MAX_RESPONSE_BYTES) {
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    await response.body?.cancel().catch(() => {});
    throw new D1RestError('D1_RESPONSE', 'D1 returned an oversized or invalid response.');
  }
  if (!response.body) throw new D1RestError('D1_RESPONSE', 'D1 returned an empty response.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  let bytes = 0, text = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new D1RestError('D1_RESPONSE', 'D1 returned an oversized response.');
      }
      text += decoder.decode(part.value, {stream: true});
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof D1RestError) throw error;
    throw new D1RestError('D1_RESPONSE', 'D1 returned invalid JSON.');
  } finally {
    reader.releaseLock();
  }
}

export function createD1Rest({accountId, databaseId, apiToken, fetchImpl = globalThis.fetch, timeoutMs = 15000} = {}) {
  const config = configuration({accountId, databaseId, apiToken});
  transportOptions(fetchImpl, timeoutMs);
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
  const owner = {};

  async function query(queries, batch) {
    // A batch is one Cloudflare request. Splitting it would lose D1's transaction
    // boundary and could publish only part of a set of word cards.
    const body = JSON.stringify(batch ? {batch: queries} : queries[0]);
    if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
      throw new D1RestError('D1_INPUT', 'D1 request exceeds the supported size.');
    }
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new D1RestError('D1_TIMEOUT', 'D1 request timed out; no automatic retry was attempted.'));
      }, timeoutMs);
    });
    const operation = async () => {
      let response;
      try {
        response = await fetchImpl(endpoint, {method: 'POST', redirect: 'manual',
          headers: {'Authorization': `Bearer ${config.apiToken}`, 'Content-Type': 'application/json', 'Accept': 'application/json'},
          body, signal: controller.signal});
      } catch (_) {
        throw new D1RestError('D1_NETWORK', 'D1 connection failed; no automatic retry was attempted.');
      }
      if (!response || !Number.isInteger(response.status) || !response.headers || !response.body) {
        throw new D1RestError('D1_RESPONSE', 'D1 returned an invalid HTTP response.');
      }
      if (response.redirected || (response.url && response.url !== endpoint) || (response.status >= 300 && response.status < 400)) {
        await response.body.cancel().catch(() => {});
        throw new D1RestError('D1_HTTP', 'D1 redirects are not permitted.', response.status);
      }
      const successStatus = response.status >= 200 && response.status < 300;
      if (!successStatus && response.status !== 400) {
        await response.body.cancel().catch(() => {});
        throw new D1RestError('D1_HTTP', `D1 API request failed with HTTP ${response.status}.`, response.status);
      }
      const envelope = await boundedJson(response);
      if (!successStatus) {
        if (response.status === 400 && resultObject(envelope) && envelope.success === false) {
          throw new D1RestError('D1_QUERY', 'D1 rejected the database operation.', response.status);
        }
        throw new D1RestError('D1_HTTP', `D1 API request failed with HTTP ${response.status}.`, response.status);
      }
      if (!resultObject(envelope) || typeof envelope.success !== 'boolean') {
        throw new D1RestError('D1_RESPONSE', 'D1 returned an invalid API response.');
      }
      if (!envelope.success) throw new D1RestError('D1_QUERY', 'D1 rejected the database operation.');
      if (!Array.isArray(envelope.result)) {
        throw new D1RestError('D1_RESPONSE', 'D1 returned invalid statement results.');
      }
      // A rejected batch may contain only the failing statement. Its failure
      // must stay a query error; complete ordered results are required only for
      // a batch that the provider reports as successful.
      for (const result of envelope.result) {
        if (!resultObject(result) || typeof result.success !== 'boolean') {
          throw new D1RestError('D1_RESPONSE', 'D1 returned an invalid statement result.');
        }
        if (!result.success) throw new D1RestError('D1_QUERY', 'D1 rejected a database statement.');
      }
      if (envelope.result.length !== queries.length) {
        throw new D1RestError('D1_RESPONSE', 'D1 returned an unexpected number of statement results.');
      }
      return envelope.result.map(result => {
        if (!Array.isArray(result.results) || result.results.some(row => !resultObject(row))
            || (result.meta !== undefined && !resultObject(result.meta))) {
          throw new D1RestError('D1_RESPONSE', 'D1 returned invalid result rows or metadata.');
        }
        return {success: true, results: result.results, ...(result.meta === undefined ? {} : {meta: result.meta})};
      });
    };
    try {
      return await Promise.race([operation(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  function prepared(sql, params = []) {
    const statement = Object.freeze({
      bind(...values) { return prepared(sql, validParams(values)); },
      async first(column) {
        if (column !== undefined && typeof column !== 'string') {
          throw new D1RestError('D1_INPUT', 'D1 first column must be a string.');
        }
        const row = (await query([{sql, params}], false))[0].results[0];
        if (!row) return null;
        if (column === undefined) return row;
        if (!Object.hasOwn(row, column)) throw new D1RestError('D1_INPUT', 'D1 first column was not returned.');
        return row[column];
      },
      async all() { return (await query([{sql, params}], false))[0]; },
      async run() { return (await query([{sql, params}], false))[0]; }
    });
    statements.set(statement, {owner, sql, params});
    return statement;
  }

  return Object.freeze({
    prepare(sql) {
      if (typeof sql !== 'string' || !sql.trim() || sql.length > 1024 * 1024) {
        throw new D1RestError('D1_INPUT', 'D1 prepare requires a nonempty SQL string within the supported size.');
      }
      return prepared(sql);
    },
    async batch(input) {
      if (!Array.isArray(input) || !input.length || input.length > 100) {
        throw new D1RestError('D1_INPUT', 'D1 batch requires between 1 and 100 prepared statements.');
      }
      const queries = input.map(statement => {
        const value = statements.get(statement);
        if (!value || value.owner !== owner) throw new D1RestError('D1_INPUT', 'D1 batch requires statements from this database binding.');
        return {sql: value.sql, params: value.params};
      });
      return query(queries, true);
    }
  });
}
