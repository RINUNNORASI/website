// Supabase email OTP is a server-side boundary: only an opaque cookie reaches the browser.
// This file is imported in Node development and embedded verbatim by the Worker build.
(() => {
  'use strict';
  const COOKIE = '__Host-xunci-session';
  const LOGIN_COOKIE = '__Host-xunci-login';
  const CONFIRM_COOKIE = '__Host-xunci-confirm';
  const CONFIRM_LIFE = 5 * 60 * 1000;
  const LOGIN_LIFE = 15 * 60 * 1000;
  const LIFE = 30 * 24 * 60 * 60 * 1000;
  const encoder = new TextEncoder();
  const HEADERS = {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', Vary: 'Cookie, oai-authenticated-user-id'};
  class AuthError extends Error {
    constructor(status, code, details = {}) { super(code); this.status = status; this.code = code; this.details = details; }
  }
  function response(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {status, headers: {...HEADERS, ...headers}});
  }
  function bytes64(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
    try { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); } catch (_) { return null; }
  }
  function b64(value) { return btoa(Array.from(value, n => String.fromCharCode(n)).join('')); }
  function config(env) {
    if (env?.EMAIL_AUTH_ENABLED !== '1') return null;
    let url;
    try { url = new URL(env.SUPABASE_URL); } catch (_) { throw new AuthError(503, 'email_auth_misconfigured'); }
    const project = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
    const key = env.SUPABASE_PUBLISHABLE_KEY;
    const encryptionKey = bytes64(env.SESSION_ENCRYPTION_KEY);
    if (!project || url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash
      || url.pathname !== '/' || typeof key !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]{20,200}$/.test(key)
      || !encryptionKey || encryptionKey.length !== 32) throw new AuthError(503, 'email_auth_misconfigured');
    const loginMethod = env.EMAIL_AUTH_METHOD === undefined || env.EMAIL_AUTH_METHOD === 'otp' ? 'otp' : env.EMAIL_AUTH_METHOD;
    if (loginMethod !== 'otp' && loginMethod !== 'magic-link') throw new AuthError(503, 'email_auth_misconfigured');
    return {url: url.origin, project: project[1], key, encryptionKey, loginMethod};
  }
  function dbFor(env) {
    if (!env?.DB || typeof env.DB.prepare !== 'function') throw new AuthError(503, 'storage_unavailable');
    return env.DB;
  }
  async function digest(value) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))),
      n => n.toString(16).padStart(2, '0')).join('');
  }
  async function rateHash(cfg, value) {
    const key = await crypto.subtle.importKey('raw', cfg.encryptionKey, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
    return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))),
      n => n.toString(16).padStart(2, '0')).join('');
  }
  async function encrypt(cfg, value, associated) {
    const key = await crypto.subtle.importKey('raw', cfg.encryptionKey, 'AES-GCM', false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: encoder.encode(associated)},
      key, encoder.encode(JSON.stringify(value))));
    const joined = new Uint8Array(iv.length + data.length); joined.set(iv); joined.set(data, iv.length);
    return b64(joined);
  }
  async function decrypt(cfg, value, associated) {
    try {
      const bytes = bytes64(value); if (!bytes || bytes.length < 29) throw new Error('cipher');
      const key = await crypto.subtle.importKey('raw', cfg.encryptionKey, 'AES-GCM', false, ['decrypt']);
      const clear = await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: encoder.encode(associated)},
        key, bytes.slice(12));
      const tokens = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(clear));
      if (!tokens || typeof tokens.access !== 'string' || !tokens.access || tokens.access.length > 16384
        || typeof tokens.refresh !== 'string' || !tokens.refresh || tokens.refresh.length > 4096) throw new Error('tokens');
      return tokens;
    } catch (_) { throw new AuthError(401, 'session_invalid'); }
  }
  function email(value) {
    if (typeof value !== 'string' || value.length > 254) throw new AuthError(400, 'invalid_email');
    const normalized = value.trim().toLowerCase();
    const parts = normalized.split('@');
    if (parts.length !== 2 || !parts[0] || parts[0].length > 64 || parts[0].startsWith('.') || parts[0].endsWith('.')
      || parts[0].includes('..') || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0])
      || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(parts[1])
      || parts[1].split('.').some(label => label.length > 63)) throw new AuthError(400, 'invalid_email');
    return normalized;
  }
  function native(request) {
    const id = request.headers.get('oai-authenticated-user-id');
    if (!id || !id.trim() || id.length > 512) return null;
    return {id, email: request.headers.get('oai-authenticated-user-email') || null};
  }
  function cookieToken(request, name = COOKIE) {
    const values = (request.headers.get('Cookie') || '').split(';').map(value => value.trim()).filter(value => value.startsWith(name + '='));
    if (values.length !== 1) return null;
    const token = values[0].slice(name.length + 1);
    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  }
  function cookie(token, remove = false, name = COOKIE, maxAge = LIFE / 1000) {
    return name + '=' + (remove ? '' : token) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + (remove ? '0' : maxAge);
  }
  async function postPayload(request, keys, form = false) {
    if (request.headers.get('Origin') !== new URL(request.url).origin) throw new AuthError(403, 'same_origin_required');
    if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== (form ? 'application/x-www-form-urlencoded' : 'application/json')) {
      throw new AuthError(415, 'json_content_type_required');
    }
    const length = request.headers.get('Content-Length');
    if (length && (!/^\d+$/.test(length) || Number(length) > 4096)) throw new AuthError(413, 'request_too_large');
    if (!request.body) throw new AuthError(400, 'invalid_json');
    const reader = request.body.getReader(); const chunks = []; let size = 0;
    try {
      while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
        if (size > 4096) { await reader.cancel(); throw new AuthError(413, 'request_too_large'); } chunks.push(part.value); }
    } catch (error) { if (error instanceof AuthError) throw error; throw new AuthError(400, 'invalid_json'); }
    finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let payload;
    try {
      const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
      if (form) {
        const params = new URLSearchParams(text);
        if (Array.from(params.keys()).some(key => params.getAll(key).length !== 1)) throw new Error('duplicate');
        payload = Object.fromEntries(params);
      } else payload = JSON.parse(text);
    } catch (_) { throw new AuthError(400, 'invalid_json'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.keys(payload).some(key => !keys.includes(key))) {
      throw new AuthError(400, 'invalid_payload');
    }
    return payload;
  }
  async function provider(cfg, path, method = 'GET', payload, token) {
    let result;
    const headers = {apikey: cfg.key, Accept: 'application/json'};
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    try { result = await fetch(cfg.url + '/auth/v1' + path, {method, headers,
      ...(payload === undefined ? {} : {body: JSON.stringify(payload)}), signal: AbortSignal.timeout(8000), redirect: 'manual'}); }
    catch (_) { throw new AuthError(503, 'auth_provider_unavailable'); }
    // Workers only supports follow/manual. Never forward API keys or user tokens through a redirect.
    if (result.status >= 300 && result.status < 400) throw new AuthError(503, 'auth_provider_unavailable');
    let body = null;
    if (result.status !== 204) try { body = await result.json(); } catch (_) { /* Provider text is never forwarded. */ }
    return {status: result.status, ok: result.ok, body};
  }
  async function connectionStatus(env) {
    const cfg = config(env);
    if (!cfg) return {status: 'disabled'};
    try {
      // A read-only settings request verifies the deployed transport/key without sending email.
      const result = await provider(cfg, '/settings');
      return {status: result.ok ? 'reachable' : 'unavailable', httpStatus: result.status};
    } catch (_) { return {status: 'unavailable'}; }
  }
  async function verifiedUser(cfg, access, expectedEmail) {
    const result = await provider(cfg, '/user', 'GET', undefined, access);
    if (!result.ok) {
      if ([401, 403].includes(result.status)) throw new AuthError(401, 'session_invalid');
      throw new AuthError(503, 'auth_provider_unavailable');
    }
    const user = result.body;
    if (!user || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(user.id)
      || typeof user.email_confirmed_at !== 'string' || !Number.isFinite(Date.parse(user.email_confirmed_at))) {
      throw new AuthError(401, 'email_not_verified');
    }
    let normalized; try { normalized = email(user.email); } catch (_) { throw new AuthError(401, 'email_not_verified'); }
    if (expectedEmail && normalized !== expectedEmail) throw new AuthError(401, 'email_not_verified');
    return {subject: 'supabase:' + cfg.project + ':' + user.id.toLowerCase(), email: normalized};
  }
  function tokenPair(body) {
    if (!body || typeof body.access_token !== 'string' || !body.access_token || body.access_token.length > 16384
      || typeof body.refresh_token !== 'string' || !body.refresh_token || body.refresh_token.length > 4096
      || !Number.isFinite(body.expires_in) || body.expires_in <= 0 || body.expires_in > 86400) {
      throw new AuthError(503, 'auth_provider_unavailable');
    }
    return {access: body.access_token, refresh: body.refresh_token, expires: Date.now() + body.expires_in * 1000};
  }
  async function limit(db, cfg, label, value, windowMs, max, cooldown = 0) {
    const key = await rateHash(cfg, label + ':' + value); const now = Date.now();
    const result = await db.prepare(`INSERT INTO auth_rate_limits (rate_key, window_started_at, attempts, blocked_until)
      VALUES (?, ?, 1, ?) ON CONFLICT(rate_key) DO UPDATE SET
      window_started_at = CASE WHEN window_started_at <= ? THEN excluded.window_started_at ELSE window_started_at END,
      attempts = CASE WHEN window_started_at <= ? THEN 1 ELSE attempts + 1 END,
      blocked_until = excluded.blocked_until
      WHERE blocked_until <= ? AND (window_started_at <= ? OR attempts < ?) RETURNING attempts`)
      .bind(key, now, now + cooldown, now - windowMs, now - windowMs, now, now - windowMs, max).first();
    if (!result) {
      const row = await db.prepare('SELECT window_started_at, blocked_until FROM auth_rate_limits WHERE rate_key = ?').bind(key).first();
      const remaining = Math.max(1000, (row?.blocked_until || 0) - now,
        (row?.blocked_until || 0) <= now ? (row?.window_started_at || now) + windowMs - now : 0);
      throw new AuthError(429, 'rate_limited', {retryAfterSeconds: Math.ceil(remaining / 1000)});
    }
  }
  async function limits(db, cfg, request, address, purpose) {
    // CF-Connecting-IP is gateway supplied; never accept an arbitrary X-Forwarded-For.
    const ip = request.headers.get('CF-Connecting-IP') || 'gateway-unknown';
    if (purpose === 'otp') {
      await limit(db, cfg, 'otp-ip', ip, 3600000, 20);
      await limit(db, cfg, 'otp-cooldown', address, 60000, 1, 60000);
      await limit(db, cfg, 'otp-email', address, 3600000, 6);
    } else {
      await limit(db, cfg, 'verify-ip', ip, 900000, 30);
      await limit(db, cfg, 'verify-email', address, 900000, 8);
    }
  }
  async function readSession(request, env, cfg, required = true) {
    const token = cookieToken(request); if (!token) { if (required) throw new AuthError(401, 'authentication_required'); return null; }
    const db = dbFor(env); const hash = await digest(token);
    let row = await db.prepare('SELECT * FROM auth_sessions WHERE session_hash = ?').bind(hash).first();
    if (!row || !Number.isSafeInteger(row.expires_at) || row.expires_at <= Date.now()) {
      if (row) await db.prepare('DELETE FROM auth_sessions WHERE session_hash = ?').bind(hash).run();
      if (required) throw new AuthError(401, 'authentication_required'); return null;
    }
    let tokens = await decrypt(cfg, row.tokens_ciphertext, hash); let proof;
    const refresh = async () => {
      const now = Date.now(); const lockUntil = now + 30000;
      const locked = await db.prepare(`UPDATE auth_sessions SET version = version + 1, refresh_lock_until = ?
        WHERE session_hash = ? AND version = ? AND expires_at > ? AND refresh_lock_until <= ? RETURNING version`)
        .bind(lockUntil, hash, row.version, now, now).first();
      if (!locked) throw new AuthError(503, 'session_refresh_in_progress');
      try {
        const renewed = await provider(cfg, '/token?grant_type=refresh_token', 'POST', {refresh_token: tokens.refresh});
        if (!renewed.ok) {
          if ([400, 401, 403].includes(renewed.status)) throw new AuthError(401, 'session_invalid');
          throw new AuthError(503, 'auth_provider_unavailable');
        }
        const pair = tokenPair(renewed.body); const verified = await verifiedUser(cfg, pair.access);
        if (verified.subject !== row.provider_subject) throw new AuthError(401, 'session_invalid');
        const ciphertext = await encrypt(cfg, pair, hash);
        const saved = await db.prepare(`UPDATE auth_sessions SET tokens_ciphertext = ?, provider_expires_at = ?,
          refresh_lock_until = 0, version = version + 1 WHERE session_hash = ? AND version = ?
          AND refresh_lock_until = ? AND expires_at > ? RETURNING version`)
          .bind(ciphertext, pair.expires, hash, locked.version, lockUntil, Date.now()).first();
        // A concurrent logout deletes the row. An UPDATE cannot recreate that session.
        if (!saved) {
          const newer = await db.prepare('SELECT session_hash FROM auth_sessions WHERE session_hash = ? AND expires_at > ?')
            .bind(hash, Date.now()).first();
          if (newer) throw new AuthError(503, 'session_refresh_in_progress');
          throw new AuthError(401, 'session_invalid');
        }
        row.version = saved.version; tokens = pair; return verified;
      } catch (error) {
        if (error instanceof AuthError && error.status === 401) {
          await db.prepare('DELETE FROM auth_sessions WHERE session_hash = ? AND version = ?').bind(hash, locked.version).run();
        } else {
          await db.prepare('UPDATE auth_sessions SET refresh_lock_until = 0 WHERE session_hash = ? AND version = ?')
            .bind(hash, locked.version).run();
        }
        throw error;
      }
    };
    try {
      if (row.provider_expires_at <= Date.now() + 30000) proof = await refresh();
      else {
        try { proof = await verifiedUser(cfg, tokens.access); }
        catch (error) { if (error instanceof AuthError && error.status === 401) proof = await refresh(); else throw error; }
      }
      if (proof.subject !== row.provider_subject) throw new AuthError(401, 'session_invalid');
      // Validate existence again after network work, including concurrent sign-out.
      const live = await db.prepare('SELECT session_hash FROM auth_sessions WHERE session_hash = ? AND expires_at > ?')
        .bind(hash, Date.now()).first();
      if (!live) throw new AuthError(401, 'session_invalid');
      const account = await db.prepare('SELECT * FROM auth_accounts WHERE provider_subject = ?').bind(proof.subject).first();
      if (!account) throw new AuthError(401, 'session_invalid');
      return {hash, account, createdAt: row.created_at, user: {id: account.user_id, email: proof.email}};
    } catch (error) {
      if (!required && error instanceof AuthError && error.status === 401) return null;
      throw error;
    }
  }
  function snapshot(row, user) {
    if (!row) return {version: 1, user, revision: 0, updatedAt: null, state: null};
    try {
      if (!Number.isSafeInteger(row.revision) || row.revision < 1 || !Number.isFinite(Date.parse(row.updated_at))) throw new Error('row');
      return {version: 1, user, revision: row.revision, updatedAt: row.updated_at,
        state: globalThis.IELTS_SYNC.validateState(JSON.parse(row.payload_json))};
    } catch (_) { throw new AuthError(500, 'stored_state_invalid'); }
  }
  async function migration(db, request, session) {
    const old = native(request);
    const [legacyRow, emailRow] = await Promise.all([
      old && old.id !== session.user.id ? db.prepare('SELECT revision, payload_json, updated_at FROM learning_state WHERE user_id = ?').bind(old.id).first() : null,
      db.prepare('SELECT revision, payload_json, updated_at FROM learning_state WHERE user_id = ?').bind(session.user.id).first(),
    ]);
    const legacy = snapshot(legacyRow, old);
    const current = snapshot(emailRow, session.user);
    return {pending: !session.account.legacy_link_decided && !!legacyRow,
      legacyAvailable: !!legacyRow, legacyRecordCount: legacy.state?.records.length || 0,
      emailRecordCount: current.state?.records.length || 0};
  }
  async function sessionResponse(request, env, cfg, session) {
    return {enabled: !!cfg, authenticated: !!session, user: session?.user || null, sessionStartedAt: session?.createdAt || null,
      migration: session ? await migration(dbFor(env), request, session)
        : {pending: false, legacyAvailable: false, legacyRecordCount: 0, emailRecordCount: 0}};
  }
  async function identity(request, env) {
    const cfg = config(env); if (!cfg) return null;
    const session = await readSession(request, env, cfg);
    const decision = await migration(dbFor(env), request, session);
    if (decision.pending) throw new AuthError(428, 'legacy_choice_required', {signInPath: '/#settings'});
    return {user: session.user, providerSubject: session.account.provider_subject, sessionHash: session.hash};
  }
  function randomToken() {
    return b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function createSession(request, env, cfg, tokens, proof) {
    const db = dbFor(env); const now = Date.now(); const iso = new Date(now).toISOString();
    await db.prepare(`INSERT INTO auth_accounts (provider_subject, user_id, email, legacy_link_decided, created_at, updated_at)
      VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(provider_subject) DO UPDATE SET email = excluded.email, updated_at = excluded.updated_at`)
      .bind(proof.subject, 'email:' + proof.subject, proof.email, iso, iso).run();
    const token = randomToken(); const hash = await digest(token); const encrypted = await encrypt(cfg, tokens, hash);
    await db.prepare(`INSERT INTO auth_sessions (session_hash, provider_subject, tokens_ciphertext, expires_at,
      provider_expires_at, version, refresh_lock_until, created_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?)`)
      .bind(hash, proof.subject, encrypted, now + LIFE, tokens.expires, iso).run();
    // Complete every fallible read before revoking the browser's old session.
    // A failed confirmation must not sign out an existing account.
    const account = await db.prepare('SELECT * FROM auth_accounts WHERE provider_subject = ?').bind(proof.subject).first();
    if (!account) throw new AuthError(503, 'storage_unavailable');
    const oldToken = cookieToken(request);
    if (oldToken) await db.prepare('DELETE FROM auth_sessions WHERE session_hash = ?').bind(await digest(oldToken)).run();
    return {token, session: {hash, account, createdAt: iso, user: {id: account.user_id, email: proof.email}}};
  }
  async function openPending(cfg, ciphertext, hash) {
    try {
      const bytes = bytes64(ciphertext); if (!bytes || bytes.length < 29) throw new Error('cipher');
      const key = await crypto.subtle.importKey('raw', cfg.encryptionKey, 'AES-GCM', false, ['decrypt']);
      const clear = await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes.slice(0, 12),
        additionalData: encoder.encode('pending:' + hash)}, key, bytes.slice(12));
      const pending = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(clear));
      if (!pending || typeof pending !== 'object' || Array.isArray(pending)) throw new Error('pending');
      return pending;
    } catch (_) { throw new AuthError(400, 'magic_link_expired'); }
  }
  async function beginMagicLogin(request, env, cfg, address) {
    const db = dbFor(env); const token = randomToken(); const hash = await digest(token); const verifier = randomToken();
    const challenge = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const now = Date.now(); const ciphertext = await encrypt(cfg, {stage: 'pkce', verifier}, 'pending:' + hash);
    await db.prepare('DELETE FROM auth_pending_logins WHERE expires_at <= ?').bind(now).run();
    await db.prepare(`INSERT INTO auth_pending_logins (login_hash, verifier_ciphertext, expected_email, expires_at, claimed_at, created_at)
      VALUES (?, ?, ?, ?, 0, ?)`).bind(hash, ciphertext, address, now + LOGIN_LIFE, new Date(now).toISOString()).run();
    let sent;
    try {
      // Supabase matches redirect allowlists without the fragment and preserves it
      // when adding its one-use PKCE code. No broader redirect allowlist is needed.
      const redirect = new URL('/', request.url); redirect.hash = 'email-login-state=' + token;
      sent = await provider(cfg, '/otp?redirect_to=' + encodeURIComponent(redirect.href), 'POST',
        {email: address, create_user: true, code_challenge: challenge, code_challenge_method: 's256'});
      if (!sent.ok) {
        if (sent.status === 429) throw new AuthError(429, 'rate_limited', {retryAfterSeconds: 60});
        throw new AuthError(503, 'email_delivery_unavailable');
      }
    } catch (error) {
      await db.prepare('DELETE FROM auth_pending_logins WHERE login_hash = ?').bind(hash).run(); throw error;
    }
    const prior = cookieToken(request, LOGIN_COOKIE);
    if (prior) await db.prepare('DELETE FROM auth_pending_logins WHERE login_hash = ?').bind(await digest(prior)).run();
    return response({sent: true, retryAfterSeconds: 60, method: 'magic-link'}, 200,
      {'Set-Cookie': cookie(token, false, LOGIN_COOKIE, LOGIN_LIFE / 1000)});
  }
  const CALLBACK_REASONS = new Set(['invalid_callback', 'browser_cookie_missing', 'pending_unavailable', 'verifier_invalid',
    'provider_exchange_error', 'identity_verification_failed', 'session_storage_failed', 'auth_configuration_error',
    'confirmation_expired', 'login_context_changed']);
  function callbackReason(value) { return CALLBACK_REASONS.has(value) ? value : 'invalid_callback'; }
  function callbackDiagnostic(reason, providerStatus) {
    // These fixed categories are the only callback data permitted in logs. Never
    // attach an exception, request URL, login code, email, cookie, or provider body.
    const entry = {event: 'email_magic_callback', outcome: 'failed', reason: callbackReason(reason)};
    if (Number.isInteger(providerStatus) && providerStatus >= 100 && providerStatus <= 599) entry.httpStatus = providerStatus;
    try { console.warn(JSON.stringify(entry)); } catch (_) { /* Logging cannot change authentication. */ }
  }
  function callbackResponse(success, sessionToken, reason) {
    const headers = new Headers({'Location': '/?email-login=' + (success ? 'success'
      : 'expired&email-login-reason=' + callbackReason(reason)) + '#settings',
      'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff'});
    headers.append('Set-Cookie', cookie('', true, LOGIN_COOKIE));
    if (sessionToken) headers.append('Set-Cookie', cookie(sessionToken));
    return new Response(null, {status: 303, headers});
  }
  function html(body, script) {
    const nonce = randomToken();
    const styles = 'body{margin:0;background:#f5f7f1;color:#193d37;font:17px/1.7 system-ui,sans-serif}main{max-width:32rem;margin:12vh auto;padding:2rem;background:white;border:1px solid #dce5d8;border-radius:18px}h1{font-size:1.5rem}p{overflow-wrap:anywhere}button,a{font:inherit}button{padding:.7rem 1rem;border:1px solid #1e5048;border-radius:8px;background:#1e5048;color:white;cursor:pointer}button[value=cancel]{background:white;color:#1e5048;margin-left:.5rem}small{color:#66776c}';
    const headers = {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; connect-src 'self'; style-src 'nonce-" + nonce + "'; script-src 'nonce-" + nonce + "'"};
    return new Response('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>确认邮箱登录 · 循词</title><style nonce="' + nonce + '">' + styles + '</style></head><body><main>' + body + '</main>' + (script ? '<script nonce="' + nonce + '">' + script + '</script>' : '') + '</body></html>', {headers});
  }
  function escapeHTML(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  async function handleMagicCallback(request, env) {
    let reason = 'auth_configuration_error';
    try {
      const cfg = config(env); if (!cfg || cfg.loginMethod !== 'magic-link') throw new Error('configuration');
      reason = 'invalid_callback';
      const url = new URL(request.url); const codes = url.searchParams.getAll('code');
      if (request.method !== 'GET' || url.pathname !== '/' || codes.length !== 1
        || Array.from(url.searchParams.keys()).some(key => key !== 'code')
        || !/^[A-Za-z0-9._~-]{16,1024}$/.test(codes[0])) throw new Error('callback');
      // The fragment never reaches HTTP servers or their access logs. Scrub both
      // it and the provider code before any fetch, navigation, or external asset.
      const script = `(async()=>{const url=new URL(location.href);const code=url.searchParams.get('code');const fragments=new URLSearchParams(url.hash.slice(1));const states=fragments.getAll('email-login-state');const state=states.length===1&&Array.from(fragments.keys()).every(key=>key==='email-login-state')?states[0]:fragments.toString()?'invalid':null;history.replaceState(null,'','/?email-login=confirming#settings');try{const result=await fetch('/api/auth/magic-callback',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,...(state===null?{}:{state})})});const body=await result.json();location.replace(result.ok&&body.ready===true?'/api/auth/magic-confirm':'/?email-login=expired&email-login-reason='+encodeURIComponent(body.reason||'invalid_callback')+'#settings')}catch(_){location.replace('/?email-login=expired&email-login-reason=provider_exchange_error#settings')}})();`;
      return html('<h1>正在核对登录邮件</h1><p>核对完成后，请确认要在此浏览器登录的邮箱。</p><noscript>请启用 JavaScript 后重新打开最新邮件链接。</noscript>', script);
    } catch (_) { callbackDiagnostic(reason); return callbackResponse(false, undefined, reason); }
  }
  async function pendingCleanup(db, hash) {
    try { await db.prepare('DELETE FROM auth_pending_logins WHERE login_hash = ?').bind(hash).run(); }
    catch (_) { try { console.warn('email_magic_callback pending_cleanup_deferred'); } catch (_) {} }
  }
  async function receiveMagicLogin(request, env, cfg, payload) {
    let pendingHash; let claimed = false; let reason = 'invalid_callback'; let providerStatus;
    try {
      if (cfg.loginMethod !== 'magic-link' || typeof payload.code !== 'string'
        || !/^[A-Za-z0-9._~-]{16,1024}$/.test(payload.code)) throw new Error('callback');
      reason = 'browser_cookie_missing';
      // New links carry a random lookup state in their fragment. Old links retain
      // the previous same-browser cookie fallback, without trying other verifiers.
      const token = payload.state === undefined ? cookieToken(request, LOGIN_COOKIE) : payload.state;
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('state');
      reason = 'session_storage_failed';
      pendingHash = await digest(token); const db = dbFor(env);
      const pending = await db.prepare(`UPDATE auth_pending_logins SET claimed_at = ? WHERE login_hash = ?
        AND claimed_at = 0 AND expires_at > ? RETURNING verifier_ciphertext, expected_email`)
        .bind(Date.now(), pendingHash, Date.now()).first();
      if (!pending) { reason = 'pending_unavailable'; throw new Error('pending'); }
      claimed = true; reason = 'verifier_invalid';
      const opened = await openPending(cfg, pending.verifier_ciphertext, pendingHash);
      if ((opened.stage !== undefined && opened.stage !== 'pkce') || typeof opened.verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(opened.verifier)) throw new Error('verifier');
      await limits(db, cfg, request, pending.expected_email, 'verify');
      reason = 'provider_exchange_error';
      const exchanged = await provider(cfg, '/token?grant_type=pkce', 'POST', {auth_code: payload.code, code_verifier: opened.verifier});
      providerStatus = exchanged.status;
      if (!exchanged.ok) throw new Error('exchange');
      const tokens = tokenPair(exchanged.body); providerStatus = undefined;
      reason = 'identity_verification_failed';
      const proof = await verifiedUser(cfg, tokens.access, pending.expected_email);
      reason = 'session_storage_failed';
      const receivingToken = randomToken(); const receivingHash = await digest(receivingToken); const now = Date.now();
      const prior = cookieToken(request);
      const ciphertext = await encrypt(cfg, {stage: 'confirm', tokens, proof, csrf: randomToken(),
        priorSessionHash: prior ? await digest(prior) : null}, 'pending:' + receivingHash);
      await db.prepare(`INSERT INTO auth_pending_logins (login_hash, verifier_ciphertext, expected_email, expires_at, claimed_at, created_at)
        VALUES (?, ?, ?, ?, 0, ?)`).bind(receivingHash, ciphertext, proof.email, now + CONFIRM_LIFE, new Date(now).toISOString()).run();
      await pendingCleanup(db, pendingHash);
      // No account or session is created, rotated or revoked until the person
      // explicitly confirms the verified email in this receiving browser.
      return response({ready: true}, 200, {'Set-Cookie': cookie(receivingToken, false, CONFIRM_COOKIE, CONFIRM_LIFE / 1000)});
    } catch (_) {
      callbackDiagnostic(reason, providerStatus);
      if (claimed && pendingHash && env?.DB) await pendingCleanup(env.DB, pendingHash);
      return response({error: 'magic_link_expired', reason: callbackReason(reason)}, 400);
    }
  }
  async function readConfirmation(request, env, cfg) {
    const token = cookieToken(request, CONFIRM_COOKIE);
    if (!token) throw new AuthError(400, 'confirmation_expired');
    const hash = await digest(token); const db = dbFor(env);
    const row = await db.prepare(`SELECT verifier_ciphertext, expected_email FROM auth_pending_logins
      WHERE login_hash = ? AND claimed_at = 0 AND expires_at > ?`).bind(hash, Date.now()).first();
    if (!row) throw new AuthError(400, 'confirmation_expired');
    const opened = await openPending(cfg, row.verifier_ciphertext, hash);
    if (opened.stage !== 'confirm' || !/^[A-Za-z0-9_-]{43}$/.test(opened.csrf)
      || typeof opened.tokens?.access !== 'string' || typeof opened.tokens?.refresh !== 'string'
      || !Number.isSafeInteger(opened.tokens?.expires) || opened.tokens.expires <= Date.now()
      || typeof opened.proof?.subject !== 'string' || opened.proof.email !== row.expected_email
      || !new RegExp('^supabase:' + cfg.project + ':[a-f0-9-]{36}$').test(opened.proof.subject)
      || email(opened.proof.email) !== row.expected_email
      || (opened.priorSessionHash !== null && !/^[a-f0-9]{64}$/.test(opened.priorSessionHash))) {
      throw new AuthError(400, 'confirmation_expired');
    }
    return {hash, ...opened};
  }
  function confirmationRedirect(status, sessionToken) {
    const headers = new Headers({'Location': '/?email-login=' + status + '#settings', 'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff'});
    headers.append('Set-Cookie', cookie('', true, CONFIRM_COOKIE));
    if (sessionToken) headers.append('Set-Cookie', cookie(sessionToken));
    return new Response(null, {status: 303, headers});
  }
  async function confirmation(request, env, cfg) {
    let candidate; let claimed = false;
    try {
      if (cfg.loginMethod !== 'magic-link') throw new AuthError(400, 'confirmation_expired');
      const payload = request.method === 'POST' ? await postPayload(request, ['csrf', 'decision'], true) : null;
      candidate = await readConfirmation(request, env, cfg);
      if (request.method === 'GET') return html('<h1>确认在此浏览器登录</h1><p>邮箱：<strong>' + escapeHTML(candidate.proof.email) + '</strong></p><p>请确认这是你要使用的账号。如本浏览器已登录其他账号，确认后将切换到这个邮箱。</p><form method="post" action="/api/auth/magic-confirm"><input type="hidden" name="csrf" value="' + escapeHTML(candidate.csrf) + '"><button name="decision" value="confirm" type="submit">确认登录</button><button name="decision" value="cancel" type="submit">取消</button></form><p><small>此确认在 5 分钟后失效。取消会保留当前账号。</small></p>');
      if (!payload || payload.csrf !== candidate.csrf || !['confirm', 'cancel'].includes(payload.decision)) throw new AuthError(403, 'explicit_confirmation_required');
      const db = dbFor(env);
      const current = cookieToken(request);
      if (payload.decision === 'confirm' && (current ? await digest(current) : null) !== candidate.priorSessionHash) throw new AuthError(409, 'login_context_changed');
      const locked = await db.prepare(`UPDATE auth_pending_logins SET claimed_at = ? WHERE login_hash = ?
        AND claimed_at = 0 AND expires_at > ? RETURNING login_hash`).bind(Date.now(), candidate.hash, Date.now()).first();
      if (!locked) throw new AuthError(400, 'confirmation_expired');
      claimed = true;
      if (payload.decision === 'cancel') { await pendingCleanup(db, candidate.hash); return confirmationRedirect('cancelled'); }
      const proof = await verifiedUser(cfg, candidate.tokens.access, candidate.proof.email);
      if (proof.subject !== candidate.proof.subject) throw new AuthError(400, 'confirmation_expired');
      const created = await createSession(request, env, cfg, candidate.tokens, proof);
      await pendingCleanup(db, candidate.hash);
      return confirmationRedirect('success', created.token);
    } catch (error) {
      if (claimed && candidate) await pendingCleanup(dbFor(env), candidate.hash);
      // CSRF/invalid payload failures leave a legitimate pending confirmation and
      // every existing session untouched, and retain their ordinary HTTP error.
      if (error instanceof AuthError && [403, 413, 415].includes(error.status)) throw error;
      const reason = error instanceof AuthError && error.code === 'login_context_changed' ? 'login_context_changed' : 'confirmation_expired';
      return confirmationRedirect('expired&email-login-reason=' + reason);
    }
  }
  async function handle(request, env) {
    const path = new URL(request.url).pathname.slice('/api/auth/'.length);
    try {
      const cfg = config(env);
      if (path === 'magic-confirm') {
        if (!['GET', 'POST'].includes(request.method)) return response({error: 'method_not_allowed'}, 405, {Allow: 'GET, POST'});
        if (!cfg) throw new AuthError(503, 'email_auth_not_configured');
        return await confirmation(request, env, cfg);
      }
      const isGet = ['config', 'session', 'migration-backups'].includes(path);
      const isPost = ['otp', 'verify', 'logout', 'link-legacy', 'skip-legacy', 'magic-callback'].includes(path);
      if (!isGet && !isPost) return response({error: 'not_found'}, 404);
      if (request.method !== (isGet ? 'GET' : 'POST')) return response({error: 'method_not_allowed'}, 405, {Allow: isGet ? 'GET' : 'POST'});
      if (path === 'config') return response({enabled: !!cfg, authMode: cfg ? 'email' : 'chatgpt', loginMethod: cfg?.loginMethod || 'otp',
        signInPath: cfg ? '/#settings' : '/signin-with-chatgpt?return_to=%2F'});
      if (path === 'session') {
        if (!cfg) return response(await sessionResponse(request, env, cfg, null));
        const session = await readSession(request, env, cfg, false);
        return response(await sessionResponse(request, env, cfg, session), 200,
          !session && cookieToken(request) ? {'Set-Cookie': cookie('', true)} : {});
      }
      let payload;
      if (isPost) payload = await postPayload(request, path === 'otp' ? ['email'] : path === 'verify' ? ['email', 'token'] : path === 'link-legacy' ? ['confirm'] : path === 'magic-callback' ? ['code', 'state'] : []);
      if (!cfg) throw new AuthError(503, 'email_auth_not_configured');
      const db = dbFor(env);
      if (path === 'magic-callback') return await receiveMagicLogin(request, env, cfg, payload);
      if (path === 'otp') {
        const address = email(payload.email); await limits(db, cfg, request, address, 'otp');
        if (cfg.loginMethod === 'magic-link') return await beginMagicLogin(request, env, cfg, address);
        const sent = await provider(cfg, '/otp', 'POST', {email: address, create_user: true});
        if (!sent.ok) {
          if (sent.status === 429) throw new AuthError(429, 'rate_limited', {retryAfterSeconds: 60});
          throw new AuthError(503, 'email_delivery_unavailable');
        }
        return response({sent: true, retryAfterSeconds: 60});
      }
      if (path === 'verify') {
        if (cfg.loginMethod !== 'otp') throw new AuthError(405, 'magic_link_required');
        const address = email(payload.email);
        if (typeof payload.token !== 'string' || !/^\d{6}$/.test(payload.token)) throw new AuthError(400, 'invalid_otp');
        await limits(db, cfg, request, address, 'verify');
        const verified = await provider(cfg, '/verify', 'POST', {email: address, token: payload.token, type: 'email'});
        if (!verified.ok) {
          if (verified.status === 429) throw new AuthError(429, 'rate_limited', {retryAfterSeconds: 60});
          if ([400, 401, 403, 422].includes(verified.status)) throw new AuthError(400, 'invalid_or_expired_otp');
          throw new AuthError(503, 'auth_provider_unavailable');
        }
        const tokens = tokenPair(verified.body); const proof = await verifiedUser(cfg, tokens.access, address);
        const created = await createSession(request, env, cfg, tokens, proof);
        return response(await sessionResponse(request, env, cfg, created.session),
          200, {'Set-Cookie': cookie(created.token)});
      }
      if (path === 'logout') {
        const token = cookieToken(request); let tokens = null;
        if (token) {
          const hash = await digest(token); const row = await db.prepare('SELECT tokens_ciphertext FROM auth_sessions WHERE session_hash = ?').bind(hash).first();
          // Revoke locally before any network request: provider outage cannot preserve a local login.
          await db.prepare('DELETE FROM auth_sessions WHERE session_hash = ?').bind(hash).run();
          if (row) try { tokens = await decrypt(cfg, row.tokens_ciphertext, hash); } catch (_) { /* Still clear the cookie. */ }
        }
        if (tokens) try { await provider(cfg, '/logout?scope=local', 'POST', undefined, tokens.access); } catch (_) { /* Local revocation already succeeded. */ }
        return response({enabled: true, authenticated: false, user: null, sessionStartedAt: null,
          migration: {pending: false, legacyAvailable: false, legacyRecordCount: 0, emailRecordCount: 0}},
          200, {'Set-Cookie': cookie('', true)});
      }
      const session = await readSession(request, env, cfg);
      if (path === 'migration-backups') {
        const old = native(request);
        if (!old) throw new AuthError(401, 'legacy_authentication_required', {legacySignInPath: '/signin-with-chatgpt?return_to=%2F%23settings'});
        const legacyRow = await db.prepare('SELECT revision, payload_json, updated_at FROM learning_state WHERE user_id = ?').bind(old.id).first();
        const emailRow = await db.prepare('SELECT revision, payload_json, updated_at FROM learning_state WHERE user_id = ?').bind(session.user.id).first();
        return response({version: 1, legacy: snapshot(legacyRow, old), email: snapshot(emailRow, session.user)});
      }
      if (path === 'skip-legacy') {
        await db.prepare('UPDATE auth_accounts SET legacy_link_decided = 1, updated_at = ? WHERE provider_subject = ?')
          .bind(new Date().toISOString(), session.account.provider_subject).run();
        session.account.legacy_link_decided = 1;
        return response(await sessionResponse(request, env, cfg, session));
      }
      if (payload.confirm !== true) throw new AuthError(400, 'explicit_confirmation_required');
      const old = native(request);
      if (!old) throw new AuthError(401, 'legacy_authentication_required', {legacySignInPath: '/signin-with-chatgpt?return_to=%2F%23settings'});
      if (session.user.id === old.id && session.account.legacy_link_decided) return response(await sessionResponse(request, env, cfg, session));
      let linked;
      try {
        linked = await db.prepare(`UPDATE auth_accounts SET user_id = ?, legacy_link_decided = 1, updated_at = ?
          WHERE provider_subject = ? AND user_id = ? AND legacy_link_decided = 0
          AND NOT EXISTS (SELECT 1 FROM learning_state WHERE user_id = auth_accounts.user_id)
          AND EXISTS (SELECT 1 FROM learning_state WHERE user_id = ?) RETURNING user_id`)
          .bind(old.id, new Date().toISOString(), session.account.provider_subject,
            'email:' + session.account.provider_subject, old.id).first();
      } catch (_) { throw new AuthError(409, 'legacy_link_conflict', {migration: await migration(db, request, session)}); }
      if (!linked) throw new AuthError(409, 'legacy_link_conflict', {migration: await migration(db, request, session)});
      session.user.id = linked.user_id; session.account.user_id = linked.user_id; session.account.legacy_link_decided = 1;
      return response(await sessionResponse(request, env, cfg, session));
    } catch (error) {
      if (error instanceof AuthError) return response({error: error.code, ...error.details,
        ...(error.status === 401 ? {signInPath: '/#settings'} : {})}, error.status,
        {...(error.status === 429 ? {'Retry-After': String(error.details.retryAfterSeconds || 60)} : {}),
          ...(error.status === 401 && error.code !== 'legacy_authentication_required' ? {'Set-Cookie': cookie('', true)} : {})});
      return response({error: 'storage_error'}, 500);
    }
  }
  globalThis.XUNCI_EMAIL_AUTH = {config, connectionStatus, handle, handleMagicCallback, identity, AuthError};
})();
