const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../dist/engine.js');
const date = '2026-10-14';
const prefs = {dailyNewLimit: 5, dailyReviewLimit: 20};
const initial = () => E.seed(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta'].map(word =>
  ({word, level: 'A', firstSeen: '2026-10-12', meaning: '教学义'})));

test('new-word cap uses confirmed first practice and elapsed dates cannot consume it', () => {
  const records = initial();
  assert.equal(E.studyQueue(records, date, prefs).length, 5);
  const first = E.studyQueue(records, date, prefs)[0];
  const changed = records.map(r => r.id === first.id ? E.review(r, {kind: 'studied', date}) : r);
  assert.equal(E.studyQueue(changed, date, prefs).length, 4);
  assert.equal(records.every(r => r.reviewHistory.length === 0), true);
});

test('new-word cap leaves due established words and errors available after the cap is reached', () => {
  const records = initial();
  const started = records.slice(0, 5).map(r => E.review(r, {kind: 'studied', date}));
  const repeated = E.review(records[5], {kind: 'wrong', date: '2026-10-13', answer: 'wrong meaning'});
  const queue = E.studyQueue([...started, repeated, records[6]], date, prefs);
  assert.deepEqual(queue.map(r => r.word), [repeated.word]);
  assert.equal(queue[0].forceTeaching, true);
});

test('selected batches and configured session size preserve the global new-word cap', () => {
  const records = initial(), selected = records.slice(2).map(r => r.id);
  const queue = E.studyQueue(records, date, {...prefs, dailyReviewLimit: 3}, selected);
  assert.equal(queue.length, 3);
  assert.equal(queue.every(r => selected.includes(r.id)), true);
});
