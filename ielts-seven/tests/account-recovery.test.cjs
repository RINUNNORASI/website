const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('../dist/engine.js');
const S = require('../dist/sync-state.js');
const modulePromise = import('../worker/account-recovery.mjs');
const copy = value => JSON.parse(JSON.stringify(value));
const emptyReading = () => ({assignments: {}, results: {}, completed: {}, excluded: []});
function record(word, firstSeen = '2026-09-28') {
  return E.seed([{word, firstSeen, level: 'A', meaning: '教学含义', ipa: '/test/'}])[0];
}
function state(records = []) {
  return {records, lastExcel: '2026-10-11', readingState: emptyReading(), customLessons: [],
    preferences: {...S.DEFAULT_PREFERENCES}};
}
function result(lessonId, date, answer = 'FALSE') {
  return {date, lessonId, submittedAt: date + 'T04:00:00.000Z', answers: {q1: answer},
    feedback: {checked: true, score: 1}};
}
async function recover(legacy, remote, options = {}) {
  const {previewAccountRecovery} = await modulePromise;
  return previewAccountRecovery(legacy, remote, {sync: S, engine: E, ...options});
}

test('recovery copies missing words with exact genuine events and leaves both inputs intact', async () => {
  const studied = E.review(record('restoration'), {kind: 'wrong', date: '2026-10-02', answer: 'actual answer'});
  const legacy = state([studied]);
  const remote = state([record('threshold')]);
  const before = copy({legacy, remote});
  const preview = await recover(legacy, remote);
  assert.deepEqual(preview.state.records, [remote.records[0], studied]);
  assert.deepEqual(preview.state.records[1].reviewHistory, studied.reviewHistory);
  assert.deepEqual(preview.state.records[1].contactDates, ['2026-09-28', '2026-10-02']);
  assert.equal(preview.state.records[1].contacts, 2);
  assert.equal(preview.state.records[1].status, 'needs-review');
  assert.deepEqual(preview.state.records[1].errors, studied.errors);
  assert.deepEqual({legacy, remote}, before);
  assert.equal(preview.summary.addedWords, 1);
  assert.equal(preview.summary.conflictCount, 0);
  assert.equal(preview.changed, true);
  preview.state.records[1].meaning = 'changed detached preview';
  assert.equal(legacy.records[0].meaning, '教学含义');
});

test('conflicting same-word evidence never combines contacts, chooses newest, or overwrites remote', async () => {
  const legacyWord = E.review(record('restoration'), {kind: 'correct', date: '2026-10-10', answer: 'restoration'});
  const remoteWord = E.review(record('restoration'), {kind: 'wrong', date: '2026-10-02', answer: 'actual miss'});
  const legacy = state([legacyWord]), remote = state([remoteWord]);
  const preview = await recover(legacy, remote);
  assert.deepEqual(preview.state.records, [remoteWord]);
  assert.equal(preview.state.records[0].contacts, 2);
  assert.equal(preview.state.records[0].lastReview, '2026-10-02');
  assert.equal(preview.summary.conflictingWords, 1);
  assert.equal(preview.summary.addedWords, 0);
  assert.deepEqual(preview.conflicts.map(item => item.path), ['records.' + legacyWord.id]);
  assert.equal(preview.conflicts[0].kept, 'remote');
  assert.deepEqual(legacy.records[0], legacyWord, 'the separately archived source remains available');
  assert.equal(preview.changed, false);
});

test('identical canonical words are not duplicated and teaching-only differences are reported', async () => {
  const legacy = state([record('restoration')]), remote = copy(legacy);
  const same = await recover(legacy, remote);
  assert.equal(same.summary.identicalWords, 1);
  assert.equal(same.state.records.length, 1);
  assert.equal(same.changed, false);
  legacy.records[0].meaning = 'different teaching explanation';
  const different = await recover(legacy, remote);
  assert.equal(different.summary.conflictingWords, 1);
  assert.equal(different.state.records[0].meaning, '教学含义');
  assert.equal(different.state.records[0].reviewHistory.length, 0);
  assert.equal(different.state.records[0].contacts, 1);
});

test('reading submissions and confirmations are united atomically, conflicting entries retain remote evidence', async () => {
  const legacy = state(), remote = state();
  const existingKey = '2026-10-02|urban-health', addedKey = '2026-10-03|heat-adaptation';
  remote.readingState.results[existingKey] = result('urban-health', '2026-10-02', 'TRUE');
  legacy.readingState.results[existingKey] = result('urban-health', '2026-10-02', 'FALSE');
  legacy.readingState.results[addedKey] = result('heat-adaptation', '2026-10-03');
  remote.readingState.completed['urban-health'] = '2026-10-02';
  legacy.readingState.completed['urban-health'] = '2026-10-03';
  legacy.readingState.completed['heat-adaptation'] = '2026-10-03';
  const preview = await recover(legacy, remote);
  assert.deepEqual(preview.state.readingState.results, {...remote.readingState.results,
    [addedKey]: legacy.readingState.results[addedKey]});
  assert.deepEqual(preview.state.readingState.completed,
    {'urban-health': '2026-10-02', 'heat-adaptation': '2026-10-03'});
  assert.equal(preview.summary.addedReadingResults, 1);
  assert.equal(preview.summary.addedReadingCompletions, 1);
  assert.equal(preview.summary.conflictCount, 2);
  assert.deepEqual(preview.state.readingState.results[addedKey].answers, {q1: 'FALSE'});
  assert.equal(preview.state.readingState.results[addedKey].submittedAt, '2026-10-03T04:00:00.000Z');
});

test('destination preferences and export date remain authoritative without changing any learning date', async () => {
  const legacy = state([record('restoration')]), remote = state();
  legacy.preferences.dailyMinutes = 90;
  legacy.preferences.examDate = '2027-01-01';
  legacy.lastExcel = '2026-09-29';
  const preview = await recover(legacy, remote);
  assert.deepEqual(preview.state.preferences, remote.preferences);
  assert.equal(preview.state.lastExcel, '2026-10-11');
  assert.equal(preview.state.records[0].firstSeen, '2026-09-28');
  assert.equal(preview.state.records[0].nextReview, '2026-09-29');
  assert.equal(preview.state.records[0].lastReview, null);
  assert.deepEqual(preview.conflicts.map(item => item.path), ['preferences', 'lastExcel']);
});

test('reading assignments avoid duplicate recommendation dates and exclusion conflicts', async () => {
  const legacy = state(), remote = state();
  remote.readingState.assignments['2026-10-01'] = 'urban-health';
  legacy.readingState.assignments = {'2026-10-01': 'other-lesson', '2026-10-02': 'urban-health',
    '2026-10-03': 'excluded-lesson', '2026-10-04': 'fresh-lesson'};
  remote.readingState.excluded = ['https://example.test/excluded'];
  legacy.readingState.excluded = ['https://example.test/urban', 'https://example.test/past'];
  const preview = await recover(legacy, remote, {lessons: [
    {id: 'urban-health', url: 'https://example.test/urban'},
    {id: 'excluded-lesson', url: 'https://example.test/excluded'},
  ]});
  assert.deepEqual(preview.state.readingState.assignments,
    {'2026-10-01': 'urban-health', '2026-10-04': 'fresh-lesson'});
  assert.deepEqual(preview.state.readingState.excluded,
    ['https://example.test/excluded', 'https://example.test/past']);
  assert.equal(preview.summary.addedReadingAssignments, 1);
  assert.equal(preview.summary.addedReadingExclusions, 1);
  assert.equal(preview.summary.conflictCount, 4);
});

test('an absent destination can import the full validated snapshot without generating progress or dates', async () => {
  const legacy = state([record('restoration')]);
  legacy.readingState.results['2026-10-02|urban-health'] = result('urban-health', '2026-10-02');
  const preview = await recover(S.serialize(legacy), null);
  assert.deepEqual(preview.state, legacy);
  assert.equal(preview.state.records[0].contacts, 1);
  assert.deepEqual(preview.state.records[0].reviewHistory, []);
  assert.equal(preview.summary.addedWords, 1);
  assert.equal(preview.summary.addedReadingResults, 1);
  assert.equal(preview.changed, true);
});

test('a missing legacy source is a no-op and two absent stores do not fabricate an initial state', async () => {
  const remote = state([record('threshold')]);
  const existing = await recover(null, remote);
  assert.deepEqual(existing.state, remote);
  assert.equal(existing.changed, false);
  assert.equal(existing.summary.addedWords, 0);
  assert.equal(existing.summary.candidateWords, 1);
  const absent = await recover(null, null);
  assert.equal(absent.state, null);
  assert.equal(absent.changed, false);
  assert.equal(absent.summary.candidateWords, 0);
  assert.equal(absent.summary.conflictCount, 0);
});

test('custom lesson additions preserve complete lessons and conflicting content remains remote', async () => {
  const context = {window: {}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../dist/reading-data.js'), 'utf8'), context);
  const catalog = copy(context.window.READING_LESSONS);
  const legacy = state(), remote = state();
  remote.customLessons = [catalog[0]];
  legacy.customLessons = [copy(catalog[0]), catalog[1]];
  legacy.customLessons[0].title = 'Alternative teaching title';
  const preview = await recover(legacy, remote);
  assert.deepEqual(preview.state.customLessons, [remote.customLessons[0], catalog[1]]);
  assert.equal(preview.summary.addedLessons, 1);
  assert.deepEqual(preview.conflicts.map(item => item.path), ['customLessons.' + catalog[0].id]);
});

test('repeating an applied preview is idempotent and does not create contacts or repeat submissions', async () => {
  const legacy = state([E.review(record('restoration'), {kind: 'studied', date: '2026-10-02'})]);
  legacy.readingState.results['2026-10-02|urban-health'] = result('urban-health', '2026-10-02');
  const first = await recover(legacy, state([record('threshold')]));
  const repeated = await recover(legacy, first.state);
  assert.deepEqual(repeated.state, first.state);
  assert.equal(repeated.changed, false);
  assert.equal(repeated.summary.addedWords, 0);
  assert.equal(repeated.summary.addedReadingResults, 0);
  assert.equal(repeated.state.records[1].contacts, 2);
  assert.equal(repeated.state.records[1].reviewHistory.length, 1);
});

test('recovery rejects invalid or fabricated source progress before forming a candidate', async () => {
  const invalid = state([record('restoration')]);
  invalid.records[0].contacts = 5;
  await assert.rejects(recover(invalid, state()), /接触次数/);
  const invalidRemote = state([record('threshold')]);
  invalidRemote.records[0].status = 'correct-once';
  await assert.rejects(recover(state(), invalidRemote), /虚构/);
});
