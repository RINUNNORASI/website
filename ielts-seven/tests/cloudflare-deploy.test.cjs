const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const api = import('../scripts/deploy-cloudflare.mjs');
const DATABASE_ID = '12345678-1234-4123-8123-123456789abc';
const otherDatabase = {name: 'another-database', uuid: '87654321-1234-4123-8123-123456789abc'};
const database = {name: 'xunci-ielts-db', uuid: DATABASE_ID};
const secrets = {
  SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'a'.repeat(32),
  SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64')
};
const config = {name: 'xunci-ielts', main: '.cloudflare/worker.mjs', no_bundle: true,
  compatibility_date: '2026-10-15', build: {command: 'npm run build:cloudflare'},
  vars: {EMAIL_AUTH_ENABLED: '1', EMAIL_AUTH_METHOD: 'magic-link'},
  secrets: {required: Object.keys(secrets)},
  d1_databases: [{binding: 'DB', database_name: 'xunci-ielts-db', migrations_dir: 'drizzle'}]};

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'xunci-deploy-test-'));
  const cwd = path.join(base, 'project'), secretTempRoot = path.join(base, 'private');
  await fs.mkdir(cwd); await fs.mkdir(secretTempRoot);
  await fs.writeFile(path.join(cwd, 'wrangler.jsonc'), JSON.stringify(config));
  t.after(() => fs.rm(base, {recursive: true, force: true}));
  return {cwd, secretTempRoot};
}
function success(stdout = '') { return {code: 0, stdout, stderr: ''}; }
function atFlag(args, flag) { return args[args.indexOf(flag) + 1]; }

test('first deployment creates only the configured database, migrates it, then publishes with private runtime secrets', async t => {
  const options = await fixture(t);
  const {deployCloudflare} = await api;
  const calls = [], messages = [], temporaryFiles = [];
  const env = {...secrets, HTTPS_PROXY: 'https://proxy.example', CLOUDFLARE_API_TOKEN: 'keep-this-auth-token'};
  let lookups = 0;
  const result = await deployCloudflare({...options, env, log: message => messages.push(message), run: async (args, runOptions) => {
    calls.push(args);
    assert.equal(runOptions.cwd, options.cwd);
    assert.equal(runOptions.env, env);
    if (args[1] === 'list') return success(JSON.stringify(++lookups === 1 ? [otherDatabase] : [otherDatabase, database]));
    if (args[1] === 'create') {
      assert.equal(args[2], database.name);
      assert.ok(args.includes('--update-config=false'));
      return success();
    }
    const file = atFlag(args, '--config'); temporaryFiles.push(file);
    assert.equal(path.dirname(file), options.cwd);
    const snapshot = JSON.parse(await fs.readFile(file, 'utf8'));
    assert.deepEqual(snapshot, {...config, d1_databases: [{...config.d1_databases[0], database_id: DATABASE_ID}]});
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    if (args[0] === 'deploy') {
      const secretFile = atFlag(args, '--secrets-file'); temporaryFiles.push(secretFile);
      assert.ok(secretFile.startsWith(options.secretTempRoot + path.sep));
      assert.equal((await fs.stat(secretFile)).mode & 0o777, 0o600);
      assert.deepEqual(JSON.parse(await fs.readFile(secretFile, 'utf8')), secrets);
      // Even accidental secret-bearing Wrangler output is never forwarded into build logs.
      return success(Object.values(secrets).join('\n'));
    }
    assert.deepEqual(args.slice(0, 5), ['d1', 'migrations', 'apply', 'DB', '--remote']);
    return success();
  }});
  assert.deepEqual(result, {databaseId: DATABASE_ID});
  assert.deepEqual(calls.map(args => args[0] === 'deploy' ? 'deploy' : args[1]), ['list', 'create', 'list', 'migrations', 'deploy']);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(options.cwd, 'wrangler.jsonc'), 'utf8')), config);
  for (const file of temporaryFiles) await assert.rejects(fs.access(file));
  assert.deepEqual(await fs.readdir(options.secretTempRoot), []);
  for (const value of Object.values(env)) assert.ok(!messages.join('\n').includes(value));
});

test('redeployment reuses the exact database and keeps existing runtime secrets when no build secrets are supplied', async t => {
  const options = await fixture(t); const {deployCloudflare} = await api;
  const calls = [];
  await deployCloudflare({...options, env: {}, log() {}, run: async args => {
    calls.push(args);
    if (args[1] === 'list') return success(JSON.stringify([otherDatabase, database]));
    assert.ok(!args.includes('--secrets-file'));
    return success();
  }});
  assert.deepEqual(calls.map(args => args[0] === 'deploy' ? 'deploy' : args[1]), ['list', 'migrations', 'deploy']);
  assert.deepEqual(await fs.readdir(options.cwd), ['wrangler.jsonc']);
  assert.deepEqual(await fs.readdir(options.secretTempRoot), []);
});

test('failed, malformed, or ambiguous database lookups never create a database or deploy', async t => {
  const {deployCloudflare} = await api;
  for (const output of [{code: 1, stdout: '[]', stderr: 'authentication failed'}, success('not-json'),
    success(JSON.stringify({result: []})), success(JSON.stringify([database, database])),
    success(JSON.stringify([{...database, uuid: 'invalid-id'}]))]) {
    const options = await fixture(t); const calls = [];
    await assert.rejects(deployCloudflare({...options, env: {}, log() {}, run: async args => {
      calls.push(args); return output;
    }}));
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1], 'list');
    assert.deepEqual(await fs.readdir(options.cwd), ['wrangler.jsonc']);
  }
});

test('a thrown lookup failure is sanitized and cannot trigger database creation', async t => {
  const options = await fixture(t); const {deployCloudflare} = await api; const calls = [];
  await assert.rejects(deployCloudflare({...options, env: {}, log() {}, run: async args => {
    calls.push(args); throw new Error(secrets.SESSION_ENCRYPTION_KEY);
  }}), error => !error.message.includes(secrets.SESSION_ENCRYPTION_KEY) && /database lookup failed/.test(error.message));
  assert.equal(calls.length, 1);
});

test('partial, blank, and invalid supplied secrets fail before database commands', async t => {
  const {deployCloudflare} = await api;
  for (const env of [{SUPABASE_URL: secrets.SUPABASE_URL}, {...secrets, SESSION_ENCRYPTION_KEY: ''},
    {...secrets, SESSION_ENCRYPTION_KEY: 'not-base64'}, {...secrets, SUPABASE_URL: 'https://attacker.example'},
    {...secrets, SUPABASE_PUBLISHABLE_KEY: 'service_role_key'}]) {
    const options = await fixture(t); let commands = 0;
    await assert.rejects(deployCloudflare({...options, env, log() {}, run: async () => { commands++; return success('[]'); }}));
    assert.equal(commands, 0);
    assert.deepEqual(await fs.readdir(options.cwd), ['wrangler.jsonc']);
    assert.deepEqual(await fs.readdir(options.secretTempRoot), []);
  }
});

test('migration failure prevents publishing and removes all temporary configuration and secret files', async t => {
  const options = await fixture(t); const {deployCloudflare} = await api; const calls = [];
  await assert.rejects(deployCloudflare({...options, env: secrets, log() {}, run: async args => {
    calls.push(args);
    return args[1] === 'list' ? success(JSON.stringify([database])) : {code: 1, stdout: '', stderr: secrets.SESSION_ENCRYPTION_KEY};
  }}), /database migration failed/);
  assert.equal(calls.some(args => args[0] === 'deploy'), false);
  assert.deepEqual(await fs.readdir(options.cwd), ['wrangler.jsonc']);
  assert.deepEqual(await fs.readdir(options.secretTempRoot), []);
});

test('creation failure and missing post-creation lookup stop before migrations', async t => {
  const {deployCloudflare} = await api;
  for (const creationSucceeds of [false, true]) {
    const options = await fixture(t); const calls = [];
    await assert.rejects(deployCloudflare({...options, env: {}, log() {}, run: async args => {
      calls.push(args);
      return args[1] === 'list' ? success('[]') : {code: creationSucceeds ? 0 : 1, stdout: '', stderr: ''};
    }}));
    assert.deepEqual(calls.map(args => args[1]), creationSucceeds ? ['list', 'create', 'list'] : ['list', 'create']);
    assert.deepEqual(await fs.readdir(options.cwd), ['wrangler.jsonc']);
  }
});

test('publishing failure also removes temporary files and never reveals Wrangler output', async t => {
  const options = await fixture(t); const {deployCloudflare} = await api; const messages = [];
  await assert.rejects(deployCloudflare({...options, env: secrets, log: message => messages.push(message), run: async args => {
    if (args[1] === 'list') return success(JSON.stringify([database]));
    if (args[0] === 'deploy') return {code: 1, stdout: Object.values(secrets).join('\n'), stderr: secrets.SUPABASE_PUBLISHABLE_KEY};
    return success();
  }}), error => /Worker deployment failed/.test(error.message) && !Object.values(secrets).some(value => error.message.includes(value)));
  assert.deepEqual(await fs.readdir(options.cwd), ['wrangler.jsonc']);
  assert.deepEqual(await fs.readdir(options.secretTempRoot), []);
  assert.equal(Object.values(secrets).some(value => messages.join('\n').includes(value)), false);
});

test('successful deployment reports only the matching workers.dev URL from captured output', async t => {
  const options = await fixture(t); const {deployCloudflare} = await api; const messages = [];
  const url = 'https://xunci-ielts.learning-account.workers.dev';
  const result = await deployCloudflare({...options, env: {}, log: message => messages.push(message), run: async args => {
    if (args[1] === 'list') return success(JSON.stringify([database]));
    if (args[0] === 'deploy') return success('Ignore https://different-worker.account.workers.dev\n' + secrets.SUPABASE_PUBLISHABLE_KEY + '\n' + url);
    return success();
  }});
  assert.equal(result.url, url);
  assert.ok(messages.at(-1).includes(url));
  assert.ok(!messages.join('\n').includes(secrets.SUPABASE_PUBLISHABLE_KEY));
  assert.ok(!messages.join('\n').includes('different-worker'));
});
