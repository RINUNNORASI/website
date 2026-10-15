import http from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

export const MAX_REQUEST_BYTES = 1024 * 1024;
const HOP_HEADERS = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
const IP_HEADERS = new Set(['cf-connecting-ip', 'cf-connecting-ipv6', 'true-client-ip', 'x-real-ip',
  'x-client-ip', 'x-cluster-client-ip', 'fastly-client-ip', 'x-original-forwarded-for', 'forwarded']);

class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

export function canonicalOriginFromEnv(env) {
  const value = env?.PUBLIC_ORIGIN || env?.RENDER_EXTERNAL_URL;
  let url;
  try {
    if (typeof value !== 'string' || value !== value.trim()) throw new Error();
    url = new URL(value);
  } catch (_) { throw new Error('Set a valid HTTPS PUBLIC_ORIGIN or RENDER_EXTERNAL_URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Set a valid HTTPS PUBLIC_ORIGIN or RENDER_EXTERNAL_URL.');
  }
  return url.origin;
}

function requestUrl(target, origin) {
  // Accept only HTTP origin-form targets. Never derive authority from client headers.
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')
    || /[\\\x00-\x20\x7f#]/.test(target)) throw new HttpError(400, 'invalid_request');
  let url;
  try { url = new URL(target, origin); } catch (_) { throw new HttpError(400, 'invalid_request'); }
  if (url.origin !== origin) throw new HttpError(400, 'invalid_request');
  return url;
}

function requestHeaders(incoming, origin) {
  const headers = new Headers();
  const connectionHeaders = new Set((incoming.headers.connection || '').toLowerCase().split(',').map(v => v.trim()));
  for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
    const name = incoming.rawHeaders[index].toLowerCase();
    if (HOP_HEADERS.has(name) || connectionHeaders.has(name) || IP_HEADERS.has(name)
      || name.startsWith('oai-') || name.startsWith('x-forwarded-') || name === 'host') continue;
    headers.append(name, incoming.rawHeaders[index + 1]);
  }
  headers.set('host', new URL(origin).host);
  return headers;
}

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, {once: true});
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

function requestBody(incoming, maximum, signal) {
  const length = incoming.headers['content-length'];
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > maximum)) {
    throw new HttpError(413, 'request_too_large');
  }
  if (['GET', 'HEAD'].includes(incoming.method) && (Number(length) > 0 || incoming.headers['transfer-encoding'])) {
    throw new HttpError(400, 'invalid_request');
  }
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    function cleanup() {
      incoming.off('data', data); incoming.off('end', end); incoming.off('error', error);
      signal.removeEventListener('abort', aborted);
    }
    function fail(value) { cleanup(); incoming.pause(); reject(value); }
    function data(chunk) {
      size += chunk.length;
      if (size > maximum) return fail(new HttpError(413, 'request_too_large'));
      chunks.push(chunk);
    }
    function end() { cleanup(); resolve(size ? Buffer.concat(chunks, size) : undefined); }
    function error() { fail(new HttpError(400, 'invalid_request')); }
    function aborted() { fail(signal.reason); }
    if (signal.aborted) return aborted();
    incoming.on('data', data); incoming.once('end', end); incoming.once('error', error);
    signal.addEventListener('abort', aborted, {once: true});
  });
}

function errorResponse(outgoing, status, code) {
  if (outgoing.destroyed || outgoing.writableEnded) return;
  if (outgoing.headersSent) { outgoing.destroy(); return; }
  // No exception, upstream body, SQL, credential, request target, or headers reach logs or clients.
  for (const name of outgoing.getHeaderNames()) outgoing.removeHeader(name);
  outgoing.writeHead(status, {'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Connection: 'close'});
  outgoing.end(JSON.stringify({error: code}));
}

async function sendResponse(response, outgoing, method, signal) {
  if (!(response instanceof Response)) throw new Error('Invalid application response');
  outgoing.statusCode = response.status;
  for (const [name, value] of response.headers) {
    if (!HOP_HEADERS.has(name) && name !== 'set-cookie') outgoing.setHeader(name, value);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length) outgoing.setHeader('Set-Cookie', cookies);
  if (method === 'HEAD' || !response.body || [204, 304].includes(response.status)) {
    if (response.body) await response.body.cancel();
    outgoing.end();
    return;
  }
  // Node's pipeline applies socket backpressure instead of buffering the full response.
  await pipeline(Readable.fromWeb(response.body), outgoing, {signal});
}

export function createNodeServer({worker, env = {}, publicOrigin, maxRequestBytes = MAX_REQUEST_BYTES,
  requestTimeoutMs = 30000} = {}) {
  if (!worker || typeof worker.fetch !== 'function') throw new Error('A Worker fetch handler is required.');
  const origin = canonicalOriginFromEnv({PUBLIC_ORIGIN: publicOrigin || canonicalOriginFromEnv(env)});
  if (!Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 1 || maxRequestBytes > MAX_REQUEST_BYTES
    || !Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1) throw new Error('Invalid HTTP server limits.');
  const server = http.createServer({maxHeaderSize: 16384}, async (incoming, outgoing) => {
    const controller = new AbortController(); let applicationStarted = false;
    const timer = setTimeout(() => controller.abort(new HttpError(applicationStarted ? 504 : 408,
      'request_timeout')), requestTimeoutMs);
    timer.unref();
    const disconnected = () => controller.abort(new HttpError(400, 'request_aborted'));
    const closed = () => { if (!outgoing.writableFinished) disconnected(); };
    incoming.once('aborted', disconnected); outgoing.once('close', closed);
    // A reset socket can emit error after aborted and after the body listener was removed.
    incoming.once('error', disconnected);
    try {
      const url = requestUrl(incoming.url, origin);
      if (url.pathname === '/health') {
        if (!['GET', 'HEAD'].includes(incoming.method)) {
          outgoing.setHeader('Allow', 'GET, HEAD');
          outgoing.writeHead(405, {'Cache-Control': 'no-store', Connection: 'close'}); outgoing.end(); return;
        }
        if (Number(incoming.headers['content-length']) > 0 || incoming.headers['transfer-encoding']) {
          throw new HttpError(400, 'invalid_request');
        }
        outgoing.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
        outgoing.end(incoming.method === 'HEAD' ? undefined : '{"ok":true}'); return;
      }
      if (['CONNECT', 'TRACE', 'TRACK'].includes(incoming.method)) throw new HttpError(405, 'method_not_allowed');
      const headers = requestHeaders(incoming, origin);
      const maximum = url.pathname.startsWith('/api/auth/') ? Math.min(maxRequestBytes, 4096) : maxRequestBytes;
      const body = await requestBody(incoming, maximum, controller.signal);
      const request = new Request(url, {method: incoming.method, headers, body, signal: controller.signal});
      const context = {waitUntil(promise) { Promise.resolve(promise).catch(() => {}); }};
      applicationStarted = true;
      const pendingResponse = Promise.resolve().then(() => worker.fetch(request, env, context));
      pendingResponse.then(response => {
        if (controller.signal.aborted && response?.body) response.body.cancel().catch(() => {});
      }, () => {});
      const response = await abortable(pendingResponse, controller.signal);
      await sendResponse(response, outgoing, incoming.method, controller.signal);
    } catch (error) {
      if (incoming.aborted) return;
      errorResponse(outgoing, error instanceof HttpError ? error.status : 500,
        error instanceof HttpError ? error.code : 'internal_error');
    } finally {
      clearTimeout(timer); incoming.off('aborted', disconnected); outgoing.off('close', closed);
    }
  });
  server.requestTimeout = requestTimeoutMs;
  server.headersTimeout = Math.min(15000, requestTimeoutMs);
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 100;
  server.maxRequestsPerSocket = 1000;
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  server.on('connect', (_request, socket) => socket.end('HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
  server.on('upgrade', (_request, socket) => socket.end('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'));
  return server;
}
