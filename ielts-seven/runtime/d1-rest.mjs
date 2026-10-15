// Server-only D1 binding for the independent Node host. Credentials never reach
// the Worker assets or a browser; all queries use Cloudflare's fixed API origin.
const ACCOUNT_ID = /^[a-f0-9]{32}$/i;
const DATABASE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
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

function configuration({accountId, databaseId, apiToken} = {}) {
  if (typeof accountId !== 'string' || !ACCOUNT_ID.test(accountId)) {
    throw new D1RestError('D1_CONFIG', 'D1 requires CLOUDFLARE_ACCOUNT_ID containing 32 hexadecimal characters.');
  }
  if (typeof databaseId !== 'string' || !DATABASE_ID.test(databaseId)) {
    throw new D1RestError('D1_CONFIG', 'D1 requires D1_DATABASE_ID containing the database UUID.');
  }
  if (typeof apiToken !== 'string' || !apiToken || apiToken.length > 4096 || /[\s\x00-\x1f\x7f]/.test(apiToken)) {
    throw new D1RestError('D1_CONFIG', 'D1 requires a nonempty CLOUDFLARE_D1_API_TOKEN without whitespace.');
  }
  return {accountId: accountId.toLowerCase(), databaseId: databaseId.toLowerCase(), apiToken};
}

export function configFromEnv(env = {}) {
  return configuration({accountId: env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: env.D1_DATABASE_ID, apiToken: env.CLOUDFLARE_D1_API_TOKEN});
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

async function boundedJson(response) {
  const length = response.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) {
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
      if (bytes > MAX_RESPONSE_BYTES) {
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
  if (typeof fetchImpl !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) {
    throw new D1RestError('D1_CONFIG', 'D1 requires a fetch implementation and a timeout between 1 and 120000 milliseconds.');
  }
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
