import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRANGLER_VERSION = '4.151.0';
export const REQUIRED_SECRETS = Object.freeze([
  'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SESSION_ENCRYPTION_KEY'
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class DeploymentError extends Error {}

function suppliedSecrets(env) {
  const names = REQUIRED_SECRETS.filter(name => env[name] !== undefined);
  if (!names.length) return null; // Redeploys can keep the Worker's existing secrets.
  if (names.length !== REQUIRED_SECRETS.length || names.some(name => typeof env[name] !== 'string' || !env[name].trim())) {
    throw new DeploymentError('Set all three required build secrets, or remove all three to keep existing Worker secrets.');
  }
  const secrets = Object.fromEntries(REQUIRED_SECRETS.map(name => [name, env[name]]));
  let url;
  try { url = new URL(secrets.SUPABASE_URL); } catch { /* Validated below without echoing input. */ }
  if (!url || url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname)
    || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new DeploymentError('SUPABASE_URL must be the HTTPS URL of your Supabase project.');
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]{20,200}$/.test(secrets.SUPABASE_PUBLISHABLE_KEY)) {
    throw new DeploymentError('SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key.');
  }
  const encryptionKey = secrets.SESSION_ENCRYPTION_KEY;
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encryptionKey) || Buffer.from(encryptionKey, 'base64').length !== 32) {
    throw new DeploymentError('SESSION_ENCRYPTION_KEY must contain 32 random bytes encoded as Base64.');
  }
  return secrets;
}

// Capture CLI output rather than forwarding it: errors must never echo build secrets.
export async function runWrangler(args, {cwd, env}) {
  let installed;
  try { installed = JSON.parse(await readFile(path.join(cwd, 'node_modules/wrangler/package.json'), 'utf8')); }
  catch { throw new DeploymentError('Install the project dependencies before deploying to Cloudflare.'); }
  if (installed.version !== WRANGLER_VERSION) {
    throw new DeploymentError('Use the Wrangler version pinned in this project by running npm ci.');
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(cwd, 'node_modules/wrangler/bin/wrangler.js'), ...args], {
      cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '', stderr = '', size = 0, overflow = false;
    const collect = target => chunk => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) { overflow = true; child.kill(); return; }
      if (target === 'stdout') stdout += chunk.toString(); else stderr += chunk.toString();
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    child.once('error', () => reject(new DeploymentError('Unable to start the local Wrangler CLI.')));
    child.once('close', code => resolve({code: overflow ? 1 : code, stdout, stderr}));
  });
}

export async function deployCloudflare({cwd = PROJECT_ROOT, env = process.env, run = runWrangler,
  log = console.log, secretTempRoot = tmpdir()} = {}) {
  // Validate supplied credentials before even looking up, creating, or migrating a database.
  const secrets = suppliedSecrets(env);
  const configPath = path.join(cwd, 'wrangler.jsonc');
  let config;
  try { config = JSON.parse(await readFile(configPath, 'utf8')); }
  catch { throw new DeploymentError('Unable to read the project Cloudflare configuration.'); }
  const bindings = config.d1_databases?.filter(binding => binding.binding === 'DB');
  if (bindings?.length !== 1 || !/^[A-Za-z0-9_-]{1,255}$/.test(bindings[0].database_name || '')) {
    throw new DeploymentError('Configure one DB binding with an explicit database_name before deploying.');
  }
  const databaseName = bindings[0].database_name;
  const command = async (args, label) => {
    let result;
    try { result = await run(args, {cwd, env}); }
    catch { throw new DeploymentError(`Cloudflare ${label} failed. Check the account access and deployment configuration.`); }
    if (!result || result.code !== 0) {
      const status = Number.isInteger(result?.code) ? ` (Wrangler exit code ${result.code})` : '';
      throw new DeploymentError(`Cloudflare ${label} failed${status}. Check the account access and deployment configuration.`);
    }
    return result.stdout;
  };
  const findDatabase = async () => {
    const output = await command(['d1', 'list', '--json', '--config', configPath], 'database lookup');
    let databases;
    try { databases = JSON.parse(output); } catch { /* Invalid output must not cause database creation. */ }
    if (!Array.isArray(databases)) throw new DeploymentError('Cloudflare returned an invalid database list; no database was created.');
    const matches = databases.filter(database => database?.name === databaseName);
    if (matches.length > 1) throw new DeploymentError('More than one database matches the configured name; deployment stopped.');
    if (matches.length === 1 && !UUID.test(matches[0].uuid || '')) {
      throw new DeploymentError('Cloudflare returned an invalid database ID; deployment stopped.');
    }
    return matches[0] || null;
  };

  log('Checking the Cloudflare learning database.');
  let database = await findDatabase();
  if (!database) {
    log('Creating the Cloudflare learning database.');
    await command(['d1', 'create', databaseName, '--update-config=false', '--config', configPath], 'database creation');
    database = await findDatabase();
    if (!database) throw new DeploymentError('The created database could not be found; deployment stopped before migrations.');
  }

  // Keep this beside wrangler.jsonc so main/build/migrations paths retain their meaning.
  const temporaryConfig = path.join(cwd, `.wrangler-cloudflare-${randomUUID()}.json`);
  let configCreated = false, secretDirectory;
  try {
    const deploymentConfig = {...config, d1_databases: config.d1_databases.map(binding => binding.binding === 'DB'
      ? {...binding, database_id: database.uuid} : {...binding})};
    delete deploymentConfig.account_id;
    await writeFile(temporaryConfig, JSON.stringify(deploymentConfig, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
    configCreated = true;
    let secretFile;
    if (secrets) {
      secretDirectory = await mkdtemp(path.join(secretTempRoot, 'xunci-cloudflare-secrets-'));
      secretFile = path.join(secretDirectory, 'secrets.json');
      await writeFile(secretFile, JSON.stringify(secrets), {mode: 0o600, flag: 'wx'});
    }
    log('Applying database migrations before publishing the Worker.');
    await command(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', temporaryConfig], 'database migration');
    log('Publishing the Cloudflare Worker.');
    const args = ['deploy', '--config', temporaryConfig];
    if (secretFile) args.push('--secrets-file', secretFile);
    const output = await command(args, 'Worker deployment');
    const url = output?.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev\b/gi)
      ?.find(candidate => new URL(candidate).hostname.startsWith(config.name + '.'));
    log(url ? `Cloudflare deployment completed: ${url}`
      : 'Cloudflare deployment completed. Open the Worker URL from your Cloudflare dashboard.');
    return {databaseId: database.uuid, ...(url ? {url} : {})};
  } finally {
    if (configCreated) await rm(temporaryConfig, {force: true});
    if (secretDirectory) await rm(secretDirectory, {recursive: true, force: true});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  deployCloudflare().catch(error => {
    console.error(error instanceof DeploymentError ? error.message : 'Cloudflare deployment failed. No secret values were logged.');
    process.exitCode = 1;
  });
}
