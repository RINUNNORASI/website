/* Loopback-only cloud integration audit: real UI confirmations in isolated browser contexts. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

const BASE = 'http://127.0.0.1:4173';
const KEY = 'xunci.ielts7.v1';
const unique = String(Date.now()).replace(/[0-9]/g, digit => 'abcdefghij'[+digit]);
const OWNER = 'local-syncqa' + unique;
const OTHER = 'local-isolationqa' + unique;
const errors = [];
const readState = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
const cloud = page => page.evaluate(async () => {
  const response = await fetch('/api/learning-state', {credentials: 'same-origin', cache: 'no-store'});
  if (!response.ok) throw Error('Cloud returned ' + response.status);
  return response.json();
});

(async () => {
  const browser = await chromium.launch({headless: true, args: ['--no-sandbox']});
  const contexts = [];
  async function device(user) {
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
    contexts.push(context);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(BASE + '/signin-with-chatgpt?dev_user=' + user, {waitUntil: 'networkidle'});
    await page.waitForFunction(() => document.querySelector('#sync-label')?.textContent === '已同步', null, {timeout: 20000});
    return page;
  }
  try {
    const first = await device(OWNER);
    const firstInitial = await readState(first);
    const initialCloud = await cloud(first);
    assert.equal(initialCloud.user.id, OWNER);
    assert.equal(firstInitial.records.length, 157);
    assert.ok(firstInitial.records.every(record => record.contacts === 1 && record.reviewHistory.length === 0));
    const second = await device(OWNER);
    assert.deepEqual((await readState(second)).records, firstInitial.records);
    await second.bringToFront();
    console.log('PASS: second private browser receives the initial same-account cloud state');

    await first.evaluate(() => { location.hash = 'review'; });
    await first.locator('[data-action="start-review"]').click();
    const displayedWord = await first.locator('.study-card h2').innerText();
    await first.locator('[data-action="confirm-study"]').click();
    const learned = await readState(first);
    const changed = learned.records.filter(record => record.reviewHistory.length > 0);
    assert.equal(changed.length, 1);
    assert.equal(changed[0].word, displayedWord.toLowerCase());
    assert.equal(changed[0].contacts, 2);
    assert.equal(changed[0].reviewHistory[0].kind, 'studied');
    assert.equal(changed[0].status, 'studied');
    const id = changed[0].id;
    await first.waitForFunction(id => {
      const meta = JSON.parse(localStorage.getItem('xunci.cloud.v1') || 'null');
      return meta?.baseline?.records.find(record => record.id === id)?.reviewHistory.length === 1;
    }, id, {timeout: 20000});
    const saved = await cloud(first);
    assert.ok(saved.revision > initialCloud.revision);
    assert.deepEqual(saved.state.records.find(record => record.id === id), changed[0]);
    console.log('PASS: actual teaching completion uploads exact evidence and advances cloud revision');

    // Exercise the normal 30-second refresh, not a forced state injection or a manual reload.
    assert.equal(await second.evaluate(() => document.hidden), false);
    await second.waitForFunction(({key, id}) => {
      const record = JSON.parse(localStorage.getItem(key) || 'null')?.records.find(record => record.id === id);
      return record?.contacts === 2 && record.reviewHistory.length === 1;
    }, {key: KEY, id}, {timeout: 45000});
    const received = (await readState(second)).records.find(record => record.id === id);
    assert.deepEqual(received, changed[0]);
    console.log('PASS: another device refreshes the same word evidence, contact count and next-review date');

    const third = await device(OTHER);
    const isolated = await readState(third);
    assert.ok(isolated.records.every(record => record.contacts === 1 && record.reviewHistory.length === 0));
    assert.equal(Object.keys(isolated.readingState.results).length, 0);
    const otherCloud = await cloud(third);
    assert.equal(otherCloud.user.id, OTHER);
    assert.ok(otherCloud.state.records.every(record => record.reviewHistory.length === 0));
    console.log('PASS: a different account has a fresh independent vocabulary and no prior study evidence');

    await first.reload({waitUntil: 'networkidle'});
    await first.waitForFunction(() => document.querySelector('#sync-label')?.textContent === '已同步', null, {timeout: 20000});
    assert.deepEqual((await readState(first)).records.find(record => record.id === id), changed[0]);
    assert.deepEqual(errors, []);
    console.log('PASS: reload preserves synced evidence; no browser JavaScript errors');
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
