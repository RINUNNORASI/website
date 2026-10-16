const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const dist = path.join(__dirname, '..', 'dist');
const context = vm.createContext({window: {}});
for (const name of ['engine.js', 'vocab-history.js', 'vocab-new.js', 'frequency-data.js', 'classifier.js']) {
  vm.runInContext(fs.readFileSync(path.join(dist, name), 'utf8'), context, {filename: name});
}
const C = context.window.IELTS_CLASSIFY;
const F = context.window.IELTS_FREQUENCY;

test('public bootstrap contains no personal vocabulary or confirmed history', () => {
  const rows = [...context.window.VOCAB_HISTORY, ...context.window.VOCAB_NEW];
  assert.equal(rows.length, 0);
});

test('a signed-in learner\'s explicit classifications survive suggestions without mutating records', () => {
  const rows = [{word: 'architecture', level: 'B'}, {word: 'illustrate', level: 'C'}];
  const before = JSON.stringify(rows);
  for (const record of rows) assert.equal(C.suggest(record.word, {records: rows}).level, record.level, record.word);
  assert.equal(C.suggest('Stratosphenic').level, 'B');
  assert.equal(C.suggest('drought(s)').level, 'A');
  assert.equal(JSON.stringify(rows), before);
});

test('saved classification and explicit manual choice outrank corpus suggestions without modifying state', () => {
  const existing = {word: 'architecture', level: 'B', contacts: 4, status: 'needs-review',
    answerHistory: [{date: '2026-10-14', correct: false}], nextReview: '2026-10-15'};
  const initial = JSON.stringify(existing);
  assert.equal(C.suggest('architecture', {existing}).level, 'B');
  assert.equal(C.suggest('architecture', {records: [existing]}).level, 'B');
  assert.equal(C.suggest('architecture', {existing, manualLevel: 'C'}).level, 'C');
  assert.equal(JSON.stringify(existing), initial);
});

test('common unknown words remain teachable while absent words are explicitly unverified', () => {
  assert.equal(C.suggest('the').level, 'A');
  const unverified = C.suggest('epistemologicallyyyy');
  assert.equal(unverified.level, 'B');
  assert.ok(unverified.confidence < 0.5);
  assert.match(unverified.reason, /待词典核实/);
  assert.match(unverified.reason, /不能据此断言无用/);
  for (const key of ['meaning', 'ipa', 'mastered', 'status', 'score']) assert.equal(key in unverified, false);
  assert.equal(C.suggest('1234 !!!').level, 'C');
});

test('academic British/American forms and target phrases receive useful suggestions', () => {
  for (const word of ['analyse', 'analysis', 'analytical', 'analyze', 'analyzed', 'analysing']) {
    assert.equal(C.suggest(word).level, 'A', word);
  }
  assert.equal(C.suggest('urban heat island').level, 'A');
  assert.equal(C.suggest('low carbon emissions').level, 'A');
  assert.equal(C.suggest('photosynthesis').level, 'B');
  assert.equal(C.suggest('London').level, 'B');
  assert.equal(C.suggest('NASA').level, 'B');
  assert.equal(C.suggest('!!!').level, 'C');
});

test('frequency snapshot has actual counts, honest bounds, attribution, and stays below 200KB', () => {
  assert.equal(Object.keys(F.entries).length, 17000);
  assert.equal(F.entries.you.count, 28787591);
  assert.equal(F.entries.the.rank, 3);
  const entries = Object.values(F.entries);
  assert.equal(entries[9999].count, F.metadata.aMinCount);
  assert.equal(entries.at(-1).count, F.metadata.minRetainedCount);
  assert.equal(F.metadata.license, 'CC-BY-SA-4.0');
  assert.equal(F.metadata.sourceRows, 50000);
  assert.equal(F.metadata.validSourceTokens, 48412);
  assert.match(F.metadata.sourceSha256, /^[a-f0-9]{64}$/);
  assert.ok(fs.statSync(path.join(dist, 'frequency-data.js')).size < 200000);
  assert.equal(C.metadata.academicHeadwords, 570);
});
