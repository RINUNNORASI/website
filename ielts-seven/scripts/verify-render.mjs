// Build-time connectivity checks. This never sends a login email or starts HTTP.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {resolvedRenderConfiguration} from './serve-render.mjs';
import {verifyD1Rest, D1VerificationError} from './verify-d1-rest.mjs';
import {D1RestError} from '../runtime/d1-rest.mjs';

export class RenderVerificationError extends Error {}

export async function verifyRender({env = process.env, fetchImpl = globalThis.fetch,
  verifyDatabase = verifyD1Rest, log = console.log} = {}) {
  let config;
  try { config = await resolvedRenderConfiguration(env, {fetchImpl}); }
  catch (error) {
    if (error instanceof D1RestError) throw error;
    throw new RenderVerificationError('Render settings are missing or invalid. Check the five required variables and the public HTTPS origin.');
  }
  log('Checking the email authentication service without sending email.');
  let response;
  try {
    response = await fetchImpl(new URL('/auth/v1/settings', config.workerEnv.SUPABASE_URL), {
      method: 'GET', headers: {apikey: config.workerEnv.SUPABASE_PUBLISHABLE_KEY, Accept:'application/json'},
      redirect:'manual', signal:AbortSignal.timeout(8000),
    });
  } catch (_) { throw new RenderVerificationError('The email authentication service could not be reached.'); }
  if (!response || !response.ok || response.redirected) {
    await response?.body?.cancel().catch(() => {});
    const status = Number.isInteger(response?.status) ? ` (HTTP ${response.status})` : '';
    throw new RenderVerificationError(`The email authentication service check failed${status}. Check SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.`);
  }
  let settings;
  try {
    const reader = response.body.getReader();
    let bytes = 0, text = '';
    const decoder = new TextDecoder('utf-8', {fatal:true});
    try {
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        bytes += item.value.byteLength;
        if (bytes > 65536) { await reader.cancel(); throw new Error(); }
        text += decoder.decode(item.value, {stream:true});
      }
      settings = JSON.parse(text + decoder.decode());
    } finally { reader.releaseLock(); }
  } catch (_) { throw new RenderVerificationError('The email authentication service returned an invalid settings response.'); }
  if (settings?.external?.email !== true) {
    throw new RenderVerificationError('Enable the Email provider in the configured Supabase project.');
  }
  log('Email authentication service is reachable and Email is enabled.');
  await verifyDatabase({env: {...env, D1_DATABASE_ID: config.database.databaseId}, log});
  log('Render build checks passed. No login email was sent.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyRender().catch(error => {
    console.error(error instanceof RenderVerificationError || error instanceof D1RestError || error instanceof D1VerificationError
      ? error.message : 'Render build checks failed. No secret values were logged.');
    process.exitCode = 1;
  });
}
