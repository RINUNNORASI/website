const {test} = require('node:test');
const assert = require('node:assert/strict');

function environment() {
  return {RENDER_EXTERNAL_URL: 'https://xunci-example.onrender.com',
    SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'p'.repeat(32),
    SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_D1_API_TOKEN: 'private-api-token'};
}
const databaseId = '12345678-1234-1234-1234-123456789012';
function discovery() {
  return Response.json({success: true, result: [{uuid: databaseId, name: 'xunci-ielts-db'}],
    result_info: {page: 1, per_page: 100, count: 1, total_count: 1, total_pages: 1}});
}

test('Render preflight discovers D1 and passes its exact ID to the existing verifier without sending email', async () => {
  const {verifyRender} = await import('../scripts/verify-render.mjs');
  const env = environment(), calls = [], logs = [];
  let verified = 0;
  await verifyRender({env, log: line => logs.push(line), fetchImpl: async (url, options) => {
    url = new URL(url);
    calls.push(url);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'manual');
    if (url.hostname === 'api.cloudflare.com') return discovery();
    assert.equal(url.href, `${env.SUPABASE_URL}/auth/v1/settings`);
    assert.equal(options.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
    return Response.json({external: {email: true}});
  }, verifyDatabase: async ({env: resolved}) => {
    verified++;
    assert.equal(resolved.D1_DATABASE_ID, databaseId);
    assert.equal(resolved.CLOUDFLARE_D1_API_TOKEN, env.CLOUDFLARE_D1_API_TOKEN);
    assert.equal(env.D1_DATABASE_ID, undefined);
  }});
  assert.equal(calls.length, 2);
  assert.equal(verified, 1);
  assert.ok(logs.some(line => line.includes('checks passed')));
  assert.ok(!logs.join('\n').includes(env.CLOUDFLARE_D1_API_TOKEN));
});

test('authentication check failures stop before database verification and redact provider bodies', async () => {
  const {verifyRender} = await import('../scripts/verify-render.mjs');
  for (const response of [new Response('private-provider-details', {status: 403}),
    Response.json({external: {email: false}}), new Response('not-json')]) {
    const env = {...environment(), D1_DATABASE_ID: databaseId};
    let verified = false;
    await assert.rejects(verifyRender({env, log() {}, fetchImpl: async () => response,
      verifyDatabase: async () => { verified = true; }}), error =>
      !error.message.includes('private-provider-details') && /authentication|Email provider/.test(error.message));
    assert.equal(verified, false);
  }
});

test('invalid required settings fail before credentialed discovery or database writes', async () => {
  const {verifyRender} = await import('../scripts/verify-render.mjs');
  let called = false;
  await assert.rejects(verifyRender({env: {...environment(), SESSION_ENCRYPTION_KEY: 'secret-invalid'},
    fetchImpl: async () => { called = true; }, verifyDatabase: async () => { called = true; }, log() {}}), /five required variables/);
  assert.equal(called, false);
});
