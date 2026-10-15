import {pathToFileURL} from 'node:url';
import {canonicalOriginFromEnv, createNodeServer} from '../runtime/node-http.mjs';
import {configFromEnv, createD1Rest, resolveD1ConfigFromEnv} from '../runtime/d1-rest.mjs';

function coreRenderConfiguration(env) {
  const publicOrigin = canonicalOriginFromEnv(env);
  const required = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SESSION_ENCRYPTION_KEY'];
  const missing = required.filter(name => typeof env[name] !== 'string' || !env[name]);
  if (missing.length) throw new Error('Missing required Render settings: ' + missing.join(', '));
  let url;
  try { url = new URL(env.SUPABASE_URL); } catch (_) {}
  if (!url || url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)
    || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !/^sb_publishable_[A-Za-z0-9_-]{20,200}$/.test(env.SUPABASE_PUBLISHABLE_KEY)
    || !/^[A-Za-z0-9+/]{43}=$/.test(env.SESSION_ENCRYPTION_KEY)
    || Buffer.from(env.SESSION_ENCRYPTION_KEY, 'base64').length !== 32) {
    throw new Error('Invalid Render email authentication settings.');
  }
  const portValue = env.PORT || '10000';
  if (!/^\d+$/.test(portValue) || Number(portValue) < 1 || Number(portValue) > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535.');
  }
  return {publicOrigin, port: Number(portValue),
    workerEnv: {SUPABASE_URL: env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
      SESSION_ENCRYPTION_KEY: env.SESSION_ENCRYPTION_KEY,
      ...(env.EDITOR_EMAIL ? {EDITOR_EMAIL: env.EDITOR_EMAIL} : {}),
      EMAIL_AUTH_ENABLED: '1', EMAIL_AUTH_METHOD: 'magic-link'}};
}

export function renderConfiguration(env) {
  return {...coreRenderConfiguration(env), database: configFromEnv(env)};
}

export async function resolvedRenderConfiguration(env, {fetchImpl = globalThis.fetch} = {}) {
  // Validate the public origin and email settings before sending any credentialed lookup.
  const core = coreRenderConfiguration(env);
  return {...core, database: await resolveD1ConfigFromEnv(env, {fetchImpl})};
}

export async function startRenderServer({env = process.env, worker, createDB = createD1Rest,
  fetchImpl = globalThis.fetch} = {}) {
  const config = await resolvedRenderConfiguration(env, {fetchImpl});
  const application = worker || (await import('../.cloudflare/worker.mjs')).default;
  const server = createNodeServer({worker: application, publicOrigin: config.publicOrigin,
    env: {...config.workerEnv, DB: createDB(config.database)}});
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, '0.0.0.0', () => { server.off('error', reject); resolve(); });
  });
  return server;
}

async function main() {
  const server = await startRenderServer();
  console.info('IELTS web service is listening.');
  let stopping = false;
  function stop() {
    if (stopping) return;
    stopping = true;
    server.close(() => process.exit(0));
    const deadline = setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 10000);
    deadline.unref();
  }
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('IELTS service startup failed. Check the required Render settings.'); process.exitCode = 1; });
}
