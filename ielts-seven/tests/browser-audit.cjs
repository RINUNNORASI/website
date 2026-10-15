/* Independent browser integration audit; all state changes stay in fresh contexts. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');

const BASE = process.env.IELTS_QA_URL || 'http://127.0.0.1:4173';
const KEY = 'xunci.ielts7.v1';
const outcomes = [];
const failures = [];
const browserErrors = [];
let browser;

async function fresh(viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.locator('#main h1').waitFor();
  return { context, page };
}
async function route(page, name) {
  await page.evaluate(name => { location.hash = name; }, name);
  await page.waitForFunction(name => location.hash === '#' + name, name);
  await page.locator('#main h1').waitFor();
}
async function state(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
}
async function check(name, operation) {
  if (process.env.IELTS_QA_FILTER && !name.includes(process.env.IELTS_QA_FILTER)) return;
  try { await operation(); outcomes.push(name); }
  catch (error) { failures.push({ name, error: error.stack || error.message }); }
}

(async () => {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

  await check('Fresh seed, all desktop routes, English-only questions and spoiler gate', async () => {
    const { context, page } = await fresh();
    try {
      assert.equal((await state(page)).records.length, 157);
      for (const name of ['review', 'library', 'reading', 'plan', 'settings', 'today']) await route(page, name);
      await route(page, 'reading');
      assert.equal(await page.locator('#answer-start').count(), 0);
      assert.equal(await page.locator('#candidate-export').count(), 0);
      assert.equal(/[\u3400-\u9fff]/.test(await page.locator('#reading-form').innerText()), false);
      const before = await state(page);
      assert.equal(Object.keys(before.readingState.results).length, 0);
      await page.locator('[data-action="reveal-reading"]').click();
      await page.locator('#answer-start').waitFor();
      const after = await state(page);
      assert.equal(Object.keys(after.readingState.results).length, 0);
      assert.equal(after.records.length, 157);
      assert.match(await page.locator('#answer-start').innerText(), /未记录成绩/);
      assert.equal(await page.locator('.candidate-check:checked').count(), 0);
    } finally { await context.close(); }
  });

  await check('Intake splits, corrects, deduplicates, preserves unknown confirmation and contacts', async () => {
    const { context, page } = await fresh();
    try {
      const before = await state(page);
      await page.locator('[data-action="intake"]').click();
      await page.locator('#intake-text').fill('Stratosphenic\nExacerbate Swelter\nDrought(s)\nspearheaded\nfacilitated\nAsphalt\nasphalt\nAffordable\nAffordable\nunlisted-test-token\nurban heat island');
      await page.locator('[data-action="analyse-intake"]').click();
      const expected = ['stratospheric', 'exacerbate', 'swelter', 'drought', 'spearhead', 'facilitate', 'asphalt', 'affordable', 'unlisted-test-token', 'urban heat island'];
      assert.deepEqual(await page.locator('.intake-row .term strong').allTextContents(), expected);
      assert.equal(await page.locator('.intake-row input:checked').count(), 8);
      assert.equal(await page.locator('#intake-check-8').isChecked(), false);
      assert.equal(await page.locator('#intake-check-9').isChecked(), false);
      assert.match(await page.locator('#modal-content').innerText(), /2 个批内重复/);
      await page.locator('[data-action="confirm-intake"]').click();
      const after = await state(page);
      assert.equal(after.records.length, 157);
      for (const word of expected.slice(0, 8)) {
        const old = before.records.find(r => r.word === word);
        const current = after.records.find(r => r.word === word);
        assert.equal(current.repeatCount, old.repeatCount + 1, word + ' repeat');
        assert.equal(current.contacts, old.contacts, word + ' contacts');
        assert.equal(current.reviewHistory.length, old.reviewHistory.length, word + ' reviews');
      }
      assert.equal(after.records.some(r => r.word === 'unlisted-test-token'), false);
      assert.equal(after.records.some(r => r.word === 'urban heat island'), false);
      await page.locator('[data-action="intake"]').click();
      await page.locator('#intake-text').fill('unlisted-test-token');
      await page.locator('[data-action="analyse-intake"]').click();
      await page.locator('[data-action="confirm-intake"]').click();
      assert.equal((await state(page)).records.length, 157);
      assert.match(await page.locator('#toast').innerText(), /请勾选/);
      await page.locator('#intake-check-0').check();
      await page.locator('[data-action="confirm-intake"]').click();
      const added = (await state(page)).records.find(r => r.word === 'unlisted-test-token');
      assert.equal(added.status, 'unconfirmed');
      assert.equal(added.contacts, 1);
      assert.equal(added.needsContent, true);
    } finally { await context.close(); }
  });

  await check('Saving C and restoring A recomputes dates; downloaded backup validates', async () => {
    const { context, page } = await fresh();
    try {
      await route(page, 'library');
      await page.locator('#word-search').fill('integrity');
      await page.locator('.word[data-action="word-detail"]').click();
      await page.locator('#detail-level').selectOption('C');
      await page.locator('[data-action="change-level"]').click();
      const c = (await state(page)).records.find(r => r.word === 'integrity');
      assert.equal(c.level, 'C');
      assert.equal(c.nextReview, null);
      await route(page, 'settings');
      const downloadEvent = page.waitForEvent('download');
      await page.locator('[data-action="backup"]').click();
      const download = await downloadEvent;
      const data = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
      assert.equal(data.records.find(r => r.word === 'integrity').level, 'C');
      assert.ok(Array.isArray(data.customLessons));
      assert.equal(await page.evaluate(data => window.IELTS_ENGINE.validateBackup(data).records.length, data), 157);
      await route(page, 'library');
      await page.locator('.word[data-action="word-detail"]').click();
      await page.locator('#detail-level').selectOption('A');
      await page.locator('[data-action="change-level"]').click();
      const a = (await state(page)).records.find(r => r.word === 'integrity');
      assert.equal(a.level, 'A');
      assert.equal(a.nextReview, '2026-09-25');
    } finally { await context.close(); }
  });

  await check('B fourth contact stays teaching and records learning without a score', async () => {
    const { context, page } = await fresh();
    try {
      await page.evaluate(key => {
        const state = JSON.parse(localStorage.getItem(key)), E = window.IELTS_ENGINE, today = E.today();
        const first = E.addDays(today, -7), batch = 'QA B 认读';
        const source = state.records.find(r => r.word === 'lineage');
        let record = E.seed([{ ...source, firstSeen: first, batch, repeatCount: 1, origins: [{ date: first, batch, original: 'lineage' }] }], [])[0];
        record = E.review(record, { kind: 'studied', date: E.addDays(first, 1) });
        record = E.review(record, { kind: 'studied', date: E.addDays(first, 3) });
        state.records = [record]; localStorage.setItem(key, JSON.stringify(state));
      }, KEY);
      await page.goto(BASE + '#review', { waitUntil: 'networkidle' });
      await page.reload({ waitUntil: 'networkidle' });
      await page.locator('[data-action="start-review"]').click();
      assert.match(await page.locator('#main').innerText(), /第 4 次接触 · 认读与理解/);
      assert.equal(await page.locator('#review-answer').count(), 0);
      assert.equal(await page.locator('[data-action="correct-review"]').count(), 0);
      await page.locator('[data-action="confirm-study"]').click();
      const result = (await state(page)).records[0];
      assert.equal(result.contacts, 4);
      assert.equal(result.status, 'studied');
      assert.equal(result.reviewHistory.at(-1).kind, 'studied');
      assert.equal(result.errors.length, 0);
    } finally { await context.close(); }
  });

  await check('390 px mobile routes and revealed reading remain within viewport', async () => {
    const { context, page } = await fresh({ width: 390, height: 844 });
    try {
      async function fits(name) {
        const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
        assert.ok(dimensions.document <= dimensions.viewport, name + ': ' + JSON.stringify(dimensions));
      }
      for (const name of ['today', 'review', 'library', 'reading', 'plan', 'settings']) { await route(page, name); await fits(name); }
      await route(page, 'reading');
      await page.locator('[data-action="reveal-reading"]').click();
      await fits('reading answers and 18 vocabulary cards');
      await route(page, 'today');
      await page.locator('[data-action="intake"]').click();
      await page.locator('#intake-text').fill('Stratosphenic\nExacerbate Swelter\nmultidisciplinary\nunlisted-test-token');
      await page.locator('[data-action="analyse-intake"]').click();
      await fits('intake confirmation dialog');
    } finally { await context.close(); }
  });

  await check('Imported course and progress survive backup restore into fresh context', async () => {
    const { context, page } = await fresh();
    let backup;
    try {
      const lesson = await page.evaluate(() => ({ ...window.READING_LESSONS[0], id: 'qa-backup-course', title: 'QA backup course', url: 'https://example.com/qa-backup-article' }));
      const before = await state(page);
      await route(page, 'settings');
      await page.locator('#lesson-file').setInputFiles({ name: 'qa-course.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([lesson])) });
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).customLessons.length === 1, KEY);
      assert.equal((await state(page)).records.length, before.records.length);
      const downloadEvent = page.waitForEvent('download');
      await page.locator('[data-action="backup"]').click();
      backup = await fs.readFile(await (await downloadEvent).path());
      assert.equal(JSON.parse(backup.toString()).customLessons.length, 1);
    } finally { await context.close(); }
    const restored = await fresh();
    try {
      await route(restored.page, 'settings');
      await restored.page.locator('#backup-file').setInputFiles({ name: 'qa-backup.json', mimeType: 'application/json', buffer: backup });
      await restored.page.locator('#restore-confirm').waitFor();
      await restored.page.locator('#restore-confirm').click();
      assert.equal((await state(restored.page)).customLessons[0].id, 'qa-backup-course');
      await route(restored.page, 'reading');
      assert.equal(await restored.page.locator('#answer-start').count(), 0);
      await restored.page.locator('[data-action="reading-archive"]').click();
      assert.match(await restored.page.locator('#modal-content').innerText(), /QA backup course/);
    } finally { await restored.context.close(); }
  });

  if (browserErrors.length) failures.push({ name: 'Browser uncaught errors', error: browserErrors });
  await browser.close();
  console.log(JSON.stringify({ passed: outcomes, failures, browserErrors }, null, 2));
  if (failures.length) process.exitCode = 1;
})().catch(async error => { if (browser) await browser.close(); console.error(error); process.exitCode = 1; });
