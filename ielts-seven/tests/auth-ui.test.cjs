const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync(require.resolve('../dist/auth-ui.js'), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const decode = value => String(value || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const signedOut = () => ({enabled: true, authenticated: false, user: null,
  migration: {pending: false, legacyAvailable: false, legacyRecordCount: 0, emailRecordCount: 0}});
const signedIn = (pending = false, extra = {}) => ({enabled: true, authenticated: true,
  user: {id: 'email-account', email: 'learner@example.test'},
  migration: {pending, legacyAvailable: true, legacyRecordCount: 157, emailRecordCount: 0, ...extra}});
const reply = (data, status = 200) => ({ok: status >= 200 && status < 300, status, json: async () => copy(data)});
const settle = async () => {for (let i = 0; i < 50; i++) await Promise.resolve();};

class Node {
  constructor(tag = 'button', attributes = '') {
    this.tagName = tag;
    this.attrs = {};
    for (const attr of attributes.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) this.attrs[attr[1]] = decode(attr[2]);
    this.id = this.attrs.id;
    this.value = this.attrs.value || '';
    this.disabled = Object.hasOwn(this.attrs, 'disabled');
    this.checked = Object.hasOwn(this.attrs, 'checked');
    this.dataset = {authAction: this.attrs['data-auth-action'], authForm: this.attrs['data-auth-form']};
  }
  closest(selector) {
    if (selector === '[data-auth-action]' && this.dataset.authAction) return this;
    if (selector === '[data-auth-form]' && this.dataset.authForm) return this;
    return null;
  }
  focus() {}
}
class Dialog extends Node {
  constructor() {
    super('dialog');
    this.events = new Map();
    this.open = false;
    this.classList = {add() {}};
  }
  setAttribute() {}
  addEventListener(name, callback) {this.events.set(name, callback);}
  set innerHTML(value) {
    this.html = value;
    this.nodes = [];
    for (const match of value.matchAll(/<(input|button|form)\b([^>]*)>/g)) this.nodes.push(new Node(match[1], match[2]));
  }
  get innerHTML() {return this.html;}
  querySelector(selector) {return this.nodes.find(node => '#' + node.id === selector) || null;}
  showModal() {this.open = true;}
  close() {this.open = false;}
}
function harness(fetch, hooks = {}) {
  const nodes = [], calls = [], before = [], changed = [], statuses = [], backups = [], timers = new Map();
  let nextTimer = 1, cloudRunning = true;
  const document = {
    getElementById: id => nodes.find(node => node.id === id),
    createElement: () => new Dialog(),
    body: {appendChild: node => nodes.push(node)}
  };
  const window = {document, AbortController,
    fetch: async (url, opts) => {calls.push({url, ...opts}); return fetch(url.replace('/api/auth/', ''), opts, calls);},
    setTimeout: (fn, delay) => {const id = nextTimer++; timers.set(id, {fn, delay}); return id;},
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => {const id = nextTimer++; timers.set(id, {fn, delay}); return id;},
    clearInterval: id => timers.delete(id)
  };
  vm.runInNewContext(code, {window, globalThis: window, Date, Map, Promise, Error, TypeError});
  const ui = window.IELTS_AUTH.create({
    onBeforeChange: data => {cloudRunning = false; before.push(copy(data)); hooks.onBeforeChange?.(data);},
    onChange: data => {cloudRunning = true; changed.push(copy(data)); hooks.onChange?.(data);},
    onStatus: data => {statuses.push(copy(data));},
    onBackup: data => {backups.push(copy(data)); hooks.onBackup?.(data);}
  });
  const dialog = () => nodes.find(node => node.id === 'email-auth-dialog');
  return {ui, calls, before, changed, statuses, backups, timers, dialog, cloudRunning: () => cloudRunning,
    input(id, value) {
      const element = dialog().querySelector('#' + id); assert.ok(element, id + ' input exists'); element.value = value;
      dialog().events.get('input')({target: element});
    },
    confirm() {
      const element = dialog().querySelector('#email-auth-confirm'); assert.ok(element); element.checked = true;
      dialog().events.get('change')({target: element});
    },
    async click(action) {
      const element = dialog().nodes.find(node => node.dataset.authAction === action); assert.ok(element, action + ' action exists');
      await dialog().events.get('click')({target: element, preventDefault() {}});
    },
    async submit(form) {
      const element = dialog().nodes.find(node => node.dataset.authForm === form); assert.ok(element, form + ' form exists');
      await dialog().events.get('submit')({target: element, preventDefault() {}});
    },
    async runTimer(delay) {
      const entry = [...timers.entries()].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, delay + ' timer exists'); timers.delete(entry[0]);
      await entry[1].fn();
    },
    async escape() {dialog().events.get('cancel')({preventDefault() {}}); await settle();}
  };
}

test('unconfigured email auth leaves native account sync running and sends no OTP', async () => {
  const h = harness(async path => {assert.equal(path, 'config'); return reply({enabled: false});});
  const state = await h.ui.init();
  assert.equal(state.enabled, false);
  assert.equal(state.status, 'disabled');
  await h.ui.open();
  assert.match(h.dialog().innerHTML, /邮箱登录尚未启用/);
  assert.equal(h.dialog().nodes.some(node => node.dataset.authForm), false);
  await h.click('close');
  assert.equal(h.calls.length, 1);
  assert.equal(h.before.length, 0);
  assert.equal(h.changed.length, 0);
  assert.equal(h.cloudRunning(), true);
});

test('failed six digit verification pauses sync; cancelling explicitly resumes the unchanged session', async () => {
  const h = harness(async path => {
    if (path === 'config') return reply({enabled: true});
    if (path === 'session') return reply(signedOut());
    if (path === 'otp') return reply({sent: true, retryAfterSeconds: 60});
    if (path === 'verify') return reply({error: 'invalid_or_expired_otp'}, 400);
    assert.fail(path);
  });
  await h.ui.init(); await h.ui.open();
  h.input('email-auth-email', 'learner@example.test'); await h.submit('email');
  assert.equal(h.dialog().querySelector('#email-auth-verify').disabled, true);
  h.input('email-auth-code', '12AB56'); await h.submit('code');
  assert.equal(h.calls.some(call => call.url.endsWith('/verify')), false);
  h.input('email-auth-code', '123456'); await h.submit('code');
  assert.equal(h.before.length, 1);
  assert.equal(h.cloudRunning(), false);
  assert.equal(h.changed.length, 0);
  assert.match(h.dialog().innerHTML, /验证码不正确或已过期/);
  assert.equal(h.ui.getStatus().busy, false);
  await h.escape();
  assert.equal(h.cloudRunning(), true);
  assert.deepEqual(h.changed, [{reason: 'cancel', user: null}]);
  const sent = h.calls.find(call => call.url.endsWith('/verify'));
  assert.equal(sent.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(sent.body), {email: 'learner@example.test', token: '123456'});
});

test('existing pending migration holds init and Escape until explicitly confirmed linking finishes', async () => {
  let pending = true, initialized = false;
  const h = harness(async path => {
    if (path === 'config') return reply({enabled: true});
    if (path === 'session') return reply(signedIn(pending));
    if (path === 'link-legacy') {pending = false; return reply({linked: true});}
    assert.fail(path);
  });
  const task = h.ui.init().then(value => {initialized = true; return value;});
  await settle();
  assert.equal(initialized, false);
  assert.equal(h.cloudRunning(), false);
  assert.match(h.dialog().innerHTML, /157/);
  assert.equal(h.dialog().querySelector('#email-auth-link').disabled, true);
  await h.click('link');
  assert.equal(h.calls.some(call => call.url.endsWith('/link-legacy')), false);
  await h.escape();
  assert.equal(h.dialog().open, true);
  assert.equal(h.changed.length, 0);
  h.confirm(); await h.click('link');
  const state = await task;
  assert.equal(initialized, true);
  assert.equal(state.migration.pending, false);
  assert.equal(h.dialog().open, false);
  assert.equal(h.cloudRunning(), true);
  assert.deepEqual(h.changed.map(change => change.reason), ['migration']);
  assert.deepEqual(JSON.parse(h.calls.find(call => call.url.endsWith('/link-legacy')).body), {confirm: true});
});

test('new verified session waits for migration choice and skip requires a separate confirmation', async () => {
  let current = signedOut();
  const h = harness(async path => {
    if (path === 'config') return reply({enabled: true});
    if (path === 'session') return reply(current);
    if (path === 'otp') return reply({sent: true, retryAfterSeconds: 60});
    if (path === 'verify') {current = signedIn(true); return reply(current);}
    if (path === 'skip-legacy') {current = signedIn(false); return reply({skipped: true});}
    assert.fail(path);
  });
  await h.ui.init(); await h.ui.open();
  h.input('email-auth-email', 'learner@example.test'); await h.submit('email');
  h.input('email-auth-code', '123456'); await h.submit('code');
  assert.equal(h.ui.getStatus().authenticated, true);
  assert.equal(h.ui.getStatus().migration.pending, true);
  assert.equal(h.changed.length, 0);
  assert.equal(h.cloudRunning(), false);
  await h.click('skip');
  assert.equal(h.calls.some(call => call.url.endsWith('/skip-legacy')), false);
  assert.match(h.dialog().innerHTML, /确认使用邮箱账号/);
  await h.click('confirm-skip');
  assert.equal(h.ui.getStatus().migration.pending, false);
  assert.equal(h.cloudRunning(), true);
  assert.deepEqual(h.changed.map(change => change.reason), ['migration']);
});

test('conflicting legacy migration retains both backups and prevents an automatic overwrite', async () => {
  let current = signedIn(true, {emailRecordCount: 20});
  const snapshots = {version: 1, legacy: {state: {records: [{word: 'legacy'}]}}, email: {state: {records: [{word: 'email'}]}}};
  const h = harness(async path => {
    if (path === 'config') return reply({enabled: true});
    if (path === 'session') return reply(current);
    if (path === 'link-legacy') return reply({error: 'legacy_link_conflict', migration: current.migration}, 409);
    if (path === 'migration-backups') return reply(snapshots);
    if (path === 'skip-legacy') {current = signedIn(false); return reply({skipped: true});}
    assert.fail(path);
  });
  const task = h.ui.init(); await settle();
  h.confirm(); await h.click('link');
  assert.equal(h.cloudRunning(), false);
  assert.equal(h.dialog().querySelector('#email-auth-link').disabled, true);
  assert.match(h.dialog().innerHTML, /两个账号都有学习记录/);
  await h.click('link');
  assert.equal(h.calls.filter(call => call.url.endsWith('/link-legacy')).length, 1);
  await h.click('backups');
  assert.deepEqual(h.backups, [snapshots]);
  assert.equal(h.changed.length, 0);
  await h.click('skip'); await h.click('confirm-skip'); await task;
  assert.equal(h.cloudRunning(), true);
});

test('logout pauses sync before request and resumes only after a signed out session is confirmed', async () => {
  let current = signedIn();
  const h = harness(async path => {
    if (path === 'config') return reply({enabled: true});
    if (path === 'session') return reply(current);
    if (path === 'logout') {assert.equal(h.cloudRunning(), false); current = signedOut(); return reply({ok: true});}
    assert.fail(path);
  });
  await h.ui.init(); await h.ui.logout();
  assert.equal(h.before[0].reason, 'logout');
  assert.deepEqual(h.changed, [{reason: 'logout', user: null}]);
  assert.equal(h.ui.getStatus().authenticated, false);
  assert.equal(h.cloudRunning(), true);
});

test('resend is disabled during the supplied cooldown and server messages are never inserted as HTML', async () => {
  const h = harness(async path => {
    if (path === 'config') return reply({enabled: true});
    if (path === 'session') return reply(signedOut());
    if (path === 'otp') return reply({sent: true, retryAfterSeconds: 60});
    if (path === 'verify') return reply({error: '<img src=x onerror=alert(1)>', message: '<script>bad()</script>'}, 500);
    assert.fail(path);
  });
  await h.ui.init(); await h.ui.open();
  h.input('email-auth-email', 'learner@example.test'); await h.submit('email');
  const resend = h.dialog().querySelector('#email-auth-resend');
  assert.equal(resend.disabled, true);
  assert.match(resend.textContent, /秒后重新获取/);
  await h.click('resend');
  assert.equal(h.calls.filter(call => call.url.endsWith('/otp')).length, 1);
  h.input('email-auth-code', '123456'); await h.submit('code');
  assert.doesNotMatch(h.dialog().innerHTML, /<img|<script>/);
  assert.match(h.dialog().innerHTML, /这次操作未完成/);
  assert.equal(h.calls.every(call => call.credentials === 'same-origin'), true);
});

test('lost verify response cannot resume old sync when the server already requires migration', async () => {
  let current = signedOut();
  const h = harness(async path => {
    if (path === 'config') return reply({enabled: true});
    if (path === 'session') return reply(current);
    if (path === 'otp') return reply({sent: true, retryAfterSeconds: 60});
    if (path === 'verify') {current = signedIn(true); throw new TypeError('Connection lost after cookie commit');}
    if (path === 'skip-legacy') {current = signedIn(false); return reply({skipped: true});}
    assert.fail(path);
  });
  await h.ui.init(); await h.ui.open();
  h.input('email-auth-email', 'learner@example.test'); await h.submit('email');
  h.input('email-auth-code', '123456'); await h.submit('code');
  assert.equal(h.ui.getStatus().migration.pending, false, 'the interrupted response has not supplied migration yet');
  await h.click('close');
  assert.equal(h.ui.getStatus().migration.pending, true, 'cancellation checks the current server session');
  assert.equal(h.dialog().open, true);
  assert.equal(h.cloudRunning(), false);
  assert.equal(h.changed.length, 0);
  await h.click('skip'); await h.click('confirm-skip');
  assert.equal(h.cloudRunning(), true);
  assert.deepEqual(h.changed.map(change => change.reason), ['migration']);
});

test('retry after initialization failure resumes an existing email session without sending another OTP', async () => {
  let connected = false;
  const h = harness(async path => {
    if (!connected) throw new TypeError('Network unavailable');
    if (path === 'config') return reply({enabled: true});
    if (path === 'session') return reply(signedIn());
    assert.fail('No OTP or verification is needed to recover an existing session: ' + path);
  });
  await assert.rejects(h.ui.init(), /无法连接/);
  await h.ui.open();
  assert.match(h.dialog().innerHTML, /重新连接/);
  assert.equal(h.changed.length, 0);
  connected = true;
  await h.click('retry');
  assert.equal(h.ui.getStatus().authenticated, true);
  assert.deepEqual(h.changed, [{reason: 'retry', user: {id: 'email-account', email: 'learner@example.test'}}]);
  assert.match(h.dialog().innerHTML, /你的账号/);
  assert.equal(h.calls.some(call => call.url.endsWith('/otp')), false);
});

test('failed retry never resumes sync, while confirmed disabled configuration can resume native sync', async () => {
  let connected = false;
  const h = harness(async path => {
    if (!connected) return reply({error: 'email_auth_misconfigured'}, 503);
    assert.equal(path, 'config'); return reply({enabled: false});
  });
  await assert.rejects(h.ui.init(), /配置尚未完成/);
  await h.ui.open();
  await h.click('retry');
  assert.equal(h.changed.length, 0);
  assert.equal(h.ui.getStatus().status, 'error');
  connected = true;
  await h.click('retry');
  assert.equal(h.ui.getStatus().enabled, false);
  assert.deepEqual(h.changed, [{reason: 'retry', user: null}]);
  assert.match(h.dialog().innerHTML, /邮箱登录尚未启用/);
});

test('retry discovers pending migration and waits for a choice without a duplicate sync restart', async () => {
  let connected = false, current = signedIn(true);
  const h = harness(async path => {
    if (!connected) throw new TypeError('Network unavailable');
    if (path === 'config') return reply({enabled: true});
    if (path === 'session') return reply(current);
    if (path === 'skip-legacy') {current = signedIn(false); return reply({skipped: true});}
    assert.fail(path);
  });
  await assert.rejects(h.ui.init()); await h.ui.open();
  connected = true;
  const retry = h.click('retry'); await settle();
  assert.equal(h.ui.getStatus().migration.pending, true);
  assert.equal(h.changed.length, 0);
  assert.equal(h.cloudRunning(), false);
  await h.click('skip'); await h.click('confirm-skip'); await retry;
  assert.deepEqual(h.changed.map(change => change.reason), ['migration']);
  assert.equal(h.ui.getStatus().migration.pending, false);
});

test('magic link login pauses before sending and shows an email link instead of a code field', async () => {
  const h = harness(async path => {
    if (path === 'config') return reply({enabled: true, loginMethod: 'magic-link'});
    if (path === 'session') return reply(signedOut());
    if (path === 'otp') {
      assert.equal(h.cloudRunning(), false, 'sync stopped before a link could alter the cookie');
      return reply({sent: true, retryAfterSeconds: 60, method: 'magic-link'});
    }
    assert.fail(path);
  });
  await h.ui.init(); await h.ui.open();
  h.input('email-auth-email', 'learner@example.test');
  assert.equal(h.dialog().querySelector('#email-auth-send').textContent, '发送登录链接');
  await h.submit('email');
  assert.equal(h.ui.getStatus().loginMethod, 'magic-link');
  assert.equal(h.ui.getStatus().status, 'link-sent');
  assert.equal(h.dialog().querySelector('#email-auth-code'), null);
  assert.equal(h.dialog().querySelector('#email-auth-verify'), null);
  assert.match(h.dialog().innerHTML, /点击邮件中的登录链接/);
  assert.match(h.dialog().innerHTML, /发起登录的浏览器/);
  assert.equal(h.dialog().querySelector('#email-auth-resend').disabled, true);
  await h.click('close');
  assert.deepEqual(h.changed, [{reason: 'cancel', user: null}]);
  assert.equal(h.cloudRunning(), true);
  assert.equal([...h.timers.values()].some(timer => timer.delay === 3000), false);
});

test('magic link callback status check requires migration choice before restoring cloud sync', async () => {
  let current = signedOut();
  const h = harness(async path => {
    if (path === 'config') return reply({enabled: true, loginMethod: 'magic-link'});
    if (path === 'session') return reply(current);
    if (path === 'otp') return reply({sent: true, retryAfterSeconds: 60, method: 'magic-link'});
    if (path === 'skip-legacy') {current = signedIn(false); return reply({skipped: true});}
    assert.fail(path);
  });
  await h.ui.init(); await h.ui.open();
  h.input('email-auth-email', 'learner@example.test'); await h.submit('email');
  current = signedIn(true);
  await h.runTimer(3000);
  assert.equal(h.ui.getStatus().migration.pending, true);
  assert.match(h.dialog().innerHTML, /带上你的学习记录/);
  assert.equal(h.changed.length, 0);
  assert.equal(h.cloudRunning(), false);
  assert.equal([...h.timers.values()].some(timer => timer.delay === 3000), false);
  await h.click('skip'); await h.click('confirm-skip');
  assert.deepEqual(h.changed.map(change => change.reason), ['migration']);
  assert.equal(h.cloudRunning(), true);
  assert.equal(h.calls.some(call => call.url.endsWith('/verify')), false);
});

test('magic link status polling ignores the current account when waiting for a different email', async () => {
  const existing = signedIn(); existing.user.email = 'other@example.test';
  const h = harness(async path => {
    if (path === 'config') return reply({enabled: true, loginMethod: 'magic-link'});
    if (path === 'session') return reply(existing);
    if (path === 'otp') return reply({sent: true, retryAfterSeconds: 60, method: 'magic-link'});
    assert.fail(path);
  });
  await h.ui.init(); await h.ui.open(); await h.click('switch');
  h.input('email-auth-email', 'learner@example.test'); await h.submit('email');
  await h.runTimer(3000);
  assert.equal(h.ui.getStatus().status, 'link-sent');
  assert.equal(h.ui.getStatus().user.email, 'other@example.test');
  assert.equal(h.changed.length, 0);
  assert.equal(h.cloudRunning(), false);
  await h.click('close');
});

test('magic link callback resumes once; a late status response cannot change a cancelled login', async () => {
  let current = signedOut(), deferPoll = false, resolvePoll;
  const h = harness(async path => {
    if (path === 'config') return reply({enabled: true, loginMethod: 'magic-link'});
    if (path === 'session') {
      if (deferPoll) return new Promise(resolve => {resolvePoll = resolve;});
      return reply(current);
    }
    if (path === 'otp') return reply({sent: true, retryAfterSeconds: 60, method: 'magic-link'});
    assert.fail(path);
  });
  await h.ui.init(); await h.ui.open();
  h.input('email-auth-email', 'learner@example.test'); await h.submit('email');
  deferPoll = true;
  const polling = h.runTimer(3000); await settle();
  await h.click('change-email');
  resolvePoll(reply(signedIn(true))); await polling;
  assert.equal(h.ui.getStatus().migration.pending, false);
  assert.equal(h.changed.length, 0);
  assert.equal(h.dialog().querySelector('#email-auth-email') !== null, true);
  deferPoll = false;
  h.input('email-auth-email', 'another@example.test'); await h.submit('email');
  current = signedIn(false); current.user.email = 'another@example.test';
  await h.runTimer(3000);
  assert.equal(h.dialog().open, false);
  assert.equal(h.cloudRunning(), true);
  assert.deepEqual(h.changed.map(change => change.reason), ['login']);
  assert.equal([...h.timers.values()].some(timer => timer.delay === 3000), false);
});

test('same email reauthentication waits for a new server session instead of trusting the old cookie', async () => {
  let current = {...signedIn(), sessionStartedAt: '2026-10-15T04:00:00.000Z'};
  const h = harness(async path => {
    if (path === 'config') return reply({enabled: true, loginMethod: 'magic-link'});
    if (path === 'session') return reply(current);
    if (path === 'otp') return reply({sent: true, retryAfterSeconds: 60, method: 'magic-link'});
    assert.fail(path);
  });
  await h.ui.init(); await h.ui.open(); await h.click('switch');
  h.input('email-auth-email', 'learner@example.test'); await h.submit('email');
  await h.runTimer(3000);
  assert.equal(h.changed.length, 0);
  assert.equal(h.ui.getStatus().status, 'link-sent');
  assert.equal(h.cloudRunning(), false);
  current = {...current, sessionStartedAt: '2026-10-15T04:02:00.000Z'};
  await h.runTimer(3000);
  assert.deepEqual(h.changed.map(change => change.reason), ['login']);
  assert.equal(h.dialog().open, false);
  assert.equal(h.cloudRunning(), true);
});

test('opening the account after session expiry refreshes identity and offers a new email sign in', async () => {
  let current = signedIn();
  const h = harness(async path => {
    if (path === 'config') return reply({enabled: true, loginMethod: 'magic-link'});
    if (path === 'session') return reply(current);
    assert.fail(path);
  });
  await h.ui.init();
  current = signedOut();
  await h.ui.open();
  assert.equal(h.ui.getStatus().authenticated, false);
  assert.equal(h.dialog().querySelector('#email-auth-email') !== null, true);
  assert.match(h.dialog().querySelector('#email-auth-send').textContent, /发送登录链接/);
  assert.deepEqual(h.changed, [{reason: 'logout', user: null}]);
  assert.equal(h.before[0].reason, 'logout');
});
