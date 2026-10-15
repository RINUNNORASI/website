const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const E = require('../dist/engine.js');
const S = require('../dist/sync-state.js');

const copy = value => JSON.parse(JSON.stringify(value));
function word(word = 'resilience') {
  return E.seed([{word, firstSeen: '2026-09-24', level: 'A', ipa: '/rɪˈzɪliəns/',
    meaning: '恢复力', pos: 'n.', family: 'resilient', memory: '词族记忆', batch: '第一批',
    collocations: [{en: 'build resilience', zh: '提高恢复力'}],
    example: {en: 'Trees build resilience.', zh: '树木提高恢复力。'}}])[0];
}
function state() {
  return {records: [word(), word('alternative')], lastExcel: '2026-10-11',
    readingState: {assignments: {}, results: {}, completed: {}, excluded: []}, customLessons: [],
    preferences: {...S.DEFAULT_PREFERENCES}};
}
function reviewed(input, index, kind = 'studied', answer) {
  const output = copy(input);
  output.records[index] = E.review(output.records[index], {kind, date: '2026-10-14', answer});
  return output;
}
function result(lessonId, answer = 'FALSE') {
  return {date: '2026-10-14', lessonId, submittedAt: '2026-10-14T04:00:00Z', answers: {q1: answer}};
}
function lessons() {
  const context = {window: {}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../dist/reading-data.js'), 'utf8'), context);
  return copy(context.window.READING_LESSONS);
}

test('complete backup preserves genuine evidence, teaching state and reading submissions', () => {
  const input = reviewed(state(), 0, 'wrong', '易受伤害');
  input.readingState.results['2026-10-14|urban-health'] = result('urban-health');
  input.customLessons = [lessons()[0]];
  const envelope = S.serialize(input);
  assert.equal(envelope.schema, 'ielts-seven');
  assert.equal(envelope.version, 1);
  assert.ok(Number.isFinite(Date.parse(envelope.exportedAt)));
  assert.deepEqual(S.validateState(JSON.stringify(envelope)), input);
  assert.equal(input.records[0].contacts, 2);
  assert.equal(input.records[0].status, 'needs-review');
  assert.deepEqual(input.records[0].extraReviews, ['2026-10-15', '2026-10-17']);
  envelope.records[0].meaning = 'Changed';
  assert.equal(input.records[0].meaning, '恢复力', 'serialize returns a detached snapshot');
});

test('fingerprints ignore export time and object key insertion order, but detect evidence changes', () => {
  const first = S.serialize(state());
  const second = copy(first);
  second.exportedAt = '2026-10-15T00:00:00Z';
  second.readingState = {excluded: [], completed: {}, results: {}, assignments: {}};
  assert.equal(S.fingerprint(first), S.fingerprint(second));
  assert.equal(S.hasChanges(first, second), false);
  assert.equal(S.hasChanges(null, second), true);
  assert.equal(S.hasChanges(first, reviewed(state(), 0)), true);
});

test('schema errors and fabricated mastery fail before synchronization', () => {
  const mutate = fn => { const input = state(); fn(input); return input; };
  assert.throws(() => S.validateState(mutate(x => x.records[0].contacts = 3)), /接触次数/);
  assert.throws(() => S.validateState(mutate(x => x.records[0].status = 'correct-once')), /虚构/);
  assert.throws(() => S.validateState(mutate(x => x.records[0].nextReview = '2026-10-15')), /计划不一致/);
  assert.throws(() => S.validateState(mutate(x => x.records[0].collocations = [{en: 'x', zh: 123}])), /中文/);
  assert.throws(() => S.validateState(mutate(x => x.lastExcel = '2026-02-30')), /有效/);
  assert.throws(() => S.validateState(mutate(x => x.unknown = true)), /未知顶层/);
  const noAnswer = reviewed(state(), 0, 'wrong', '错误');
  noAnswer.records[0].reviewHistory[0].answer = '';
  assert.throws(() => S.validateState(noAnswer), /实际作答/);
  const badVersion = S.serialize(state()); badVersion.version = 2;
  assert.throws(() => S.validateState(badVersion), /版本/);
});

test('payload validation rejects prototype poisoning, cycles, accessors and oversized data', () => {
  assert.throws(() => S.validateState('{"__proto__":{"polluted":true}}'), /不允许/);
  assert.equal({}.polluted, undefined);
  const cycle = state(); cycle.customLessons.push(cycle);
  assert.throws(() => S.validateState(cycle), /循环/);
  const getter = state(); Object.defineProperty(getter, 'records', {get() { throw Error('must not execute'); }});
  assert.throws(() => S.validateState(getter), /访问器/);
  assert.throws(() => S.validateState(' '.repeat(S.MAX_BYTES + 1)), /8 MB/);
  const fn = state(); fn.customLessons.push(() => {});
  assert.throws(() => S.validateState(fn), /非 JSON/);
  const nan = state(); nan.records[0].repeats = NaN;
  assert.throws(() => S.validateState(nan), /非 JSON/);
  const sparse = state(); sparse.customLessons = new Array(2);
  assert.throws(() => S.validateState(sparse), /空项/);
});

test('course payloads require complete safe nested lesson fields', () => {
  const input = state(); input.customLessons = lessons();
  assert.doesNotThrow(() => S.validateState(input));
  const mutate = fn => { const x = copy(input); fn(x.customLessons[0]); return x; };
  assert.throws(() => S.validateState(mutate(l => l.words[0].example.zh = 5)), /中文/);
  assert.throws(() => S.validateState(mutate(l => l.sentences[0].parts = 'x')), /数量或格式/);
  assert.throws(() => S.validateState(mutate(l => l.questions[0].prompt = '先选 TRUE')), /仅使用英文/);
  assert.throws(() => S.validateState(mutate(l => l.questions[0].options[0] = '正确')), /仅使用英文/);
  assert.throws(() => S.validateState(mutate(l => l.candidateWords[0] = 'unexplained term')), /不一致/);
  assert.throws(() => S.validateState(mutate(l => l.url = 'javascript:alert(1)')), /HTTPS/);
  assert.throws(() => S.validateState(mutate(l => l.questions[1].id = l.questions[0].id)), /题目标识重复/);
  assert.throws(() => S.validateState(mutate(l => l.published = '2026-02-30')), /有效/);
});

test('first sync and missing-cloud cases require explicit resolution when records differ', () => {
  const local = state();
  assert.equal(S.decideSync(null, local, null).action, 'upload');
  assert.equal(S.decideSync(null, local, local).action, 'unchanged');
  const remote = reviewed(local, 0);
  const initial = S.decideSync(null, local, remote);
  assert.equal(initial.action, 'conflict');
  assert.equal(initial.state, null);
  assert.equal(initial.conflicts[0].path, 'initial');
  assert.deepEqual(initial.local, local);
  assert.deepEqual(initial.remote, remote);
  assert.equal(S.decideSync(local, local, null).action, 'conflict');
});

test('unchanged and one-device edits have unambiguous upload/download decisions', () => {
  const base = state(), local = reviewed(base, 0), remote = reviewed(base, 1);
  assert.equal(S.decideSync(base, base, base).action, 'unchanged');
  assert.deepEqual(S.decideSync(base, local, base).state, local);
  assert.equal(S.decideSync(base, local, base).action, 'upload');
  assert.deepEqual(S.decideSync(base, base, remote).state, remote);
  assert.equal(S.decideSync(base, base, remote).action, 'download');
  assert.equal(S.decideSync(base, local, local).action, 'unchanged');
});

test('independent word reviews merge with exact schedules and no invented contacts', () => {
  const base = state(), local = reviewed(base, 0, 'wrong', '易受伤害'), remote = reviewed(base, 1);
  const merged = S.decideSync(base, local, remote);
  assert.equal(merged.action, 'merge');
  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(merged.state.records[0], local.records[0]);
  assert.deepEqual(merged.state.records[1], remote.records[1]);
  assert.equal(merged.state.records[0].contacts, 2);
  assert.equal(merged.state.records[1].contacts, 2);
  assert.equal(merged.state.records[0].status, 'needs-review');
  assert.equal(E.mode(merged.state.records[0]), 'teaching');
  assert.deepEqual(base, state(), 'neither the baseline nor either device is mutated');
});

test('conflicting word evidence never selects later/correcter answers or silently drops either history', () => {
  const base = state(), local = reviewed(base, 0, 'correct', '恢复力'), remote = reviewed(base, 0, 'wrong', '脆弱');
  const conflict = S.decideSync(base, local, remote);
  assert.equal(conflict.action, 'conflict');
  assert.equal(conflict.state, null);
  assert.deepEqual(conflict.local.records[0].reviewHistory, local.records[0].reviewHistory);
  assert.deepEqual(conflict.remote.records[0].reviewHistory, remote.records[0].reviewHistory);
  assert.equal(conflict.conflicts[0].path, 'records.word-resilience');
  const sameDay = reviewed(base, 0, 'studied');
  sameDay.records[0].notes = 'remote edit';
  assert.equal(S.decideSync(base, local, sameDay).action, 'conflict');
});

test('independent word additions merge; concurrent edits to the same new word conflict', () => {
  const base = state(), local = copy(base), remote = copy(base);
  local.records.push(word('nutrition'));
  remote.records.push(word('canopy'));
  const merged = S.decideSync(base, local, remote);
  assert.equal(merged.action, 'merge');
  assert.deepEqual(merged.state.records.map(x => x.word), ['resilience', 'alternative', 'nutrition', 'canopy']);
  assert.ok(merged.state.records.every(x => x.contacts === 1 && x.reviewHistory.length === 0));
  remote.records[2] = word('nutrition'); remote.records[2].meaning = '营养';
  assert.equal(S.decideSync(base, local, remote).action, 'conflict');
});

test('independent reading submissions and assignment dates merge without scores being fabricated', () => {
  const base = state(), local = copy(base), remote = copy(base);
  local.readingState.assignments['2026-10-14'] = 'urban-health';
  local.readingState.results['2026-10-14|urban-health'] = result('urban-health');
  local.readingState.completed['urban-health'] = '2026-10-14';
  remote.readingState.assignments['2026-10-15'] = 'teacher-communication';
  remote.readingState.results['2026-10-14|teacher-communication'] = result('teacher-communication', 'TRUE');
  const merged = S.decideSync(base, local, remote);
  assert.equal(merged.action, 'merge');
  assert.equal(Object.keys(merged.state.readingState.results).length, 2);
  assert.equal(Object.keys(merged.state.readingState.completed).length, 1);
  assert.ok(merged.state.records.every(x => x.status === 'unconfirmed'));
  assert.equal(merged.state.readingState.results['2026-10-14|urban-health'].answers.q1, 'FALSE');
  assert.equal(merged.state.readingState.results['2026-10-14|teacher-communication'].answers.q1, 'TRUE');
});

test('same reading assignment or submission changed by both devices is a conflict', () => {
  const base = state(), local = copy(base), remote = copy(base);
  local.readingState.assignments['2026-10-14'] = 'urban-health';
  remote.readingState.assignments['2026-10-14'] = 'teacher-communication';
  assert.equal(S.decideSync(base, local, remote).action, 'conflict');
  delete local.readingState.assignments['2026-10-14']; delete remote.readingState.assignments['2026-10-14'];
  local.readingState.results['2026-10-14|urban-health'] = result('urban-health');
  remote.readingState.results['2026-10-14|urban-health'] = result('urban-health', 'TRUE');
  const conflict = S.decideSync(base, local, remote);
  assert.equal(conflict.action, 'conflict');
  assert.equal(conflict.conflicts[0].path, 'readingState.results.2026-10-14|urban-health');
});

test('concurrent different-date recommendations of one article conflict instead of creating a repeat', () => {
  const base = state(), local = copy(base), remote = copy(base);
  local.readingState.assignments['2026-10-14'] = 'urban-health';
  remote.readingState.assignments['2026-10-15'] = 'urban-health';
  const conflict = S.decideSync(base, local, remote);
  assert.equal(conflict.action, 'conflict');
  assert.equal(conflict.state, null);
  assert.match(conflict.conflicts[0].reason, /同一篇/);
});

test('concurrent exclusion and assignment of that article conflict, while historical exclusions remain valid', () => {
  const base = state(), local = copy(base), remote = copy(base), catalog = lessons();
  local.readingState.excluded = [catalog[0].url];
  remote.readingState.assignments['2026-10-14'] = catalog[0].id;
  assert.equal(S.decideSync(base, local, remote, {lessons: catalog}).action, 'conflict');
  base.readingState.assignments['2026-10-13'] = catalog[0].id;
  const historicalLocal = copy(base), historicalRemote = reviewed(base, 0);
  historicalLocal.readingState.excluded = [catalog[0].url];
  assert.equal(S.decideSync(base, historicalLocal, historicalRemote, {lessons: catalog}).action, 'merge');
});

test('excluded article edits preserve removals and independent additions across devices', () => {
  const base = state(), old = 'https://example.com/old';
  base.readingState.excluded = [old];
  const local = copy(base), remote = copy(base);
  local.readingState.excluded = ['https://example.com/local'];
  remote.readingState.excluded.push('https://example.com/remote');
  const merged = S.decideSync(base, local, remote);
  assert.equal(merged.action, 'merge');
  assert.deepEqual(merged.state.readingState.excluded, ['https://example.com/local', 'https://example.com/remote']);
});

test('deletion plus unrelated edits merges, but deletion plus edit of the same record conflicts', () => {
  const base = state(), local = copy(base), remote = reviewed(base, 1);
  local.records.splice(0, 1);
  const merged = S.decideSync(base, local, remote);
  assert.equal(merged.action, 'merge');
  assert.deepEqual(merged.state.records, [remote.records[1]]);
  assert.equal(S.decideSync(base, local, reviewed(base, 0)).action, 'conflict');
});

test('concurrent export dates or custom lesson reorders require resolution', () => {
  const base = state(), local = copy(base), remote = copy(base);
  local.lastExcel = '2026-10-18'; remote.lastExcel = '2026-10-19';
  assert.equal(S.decideSync(base, local, remote).conflicts[0].path, 'lastExcel');
  local.lastExcel = base.lastExcel; remote.lastExcel = base.lastExcel;
  local.customLessons = [lessons()[0]]; remote.customLessons = [lessons()[1]];
  assert.equal(S.decideSync(base, local, remote).conflicts[0].path, 'customLessons');
});

test('legacy preferences default predictably and validated preferences round-trip', () => {
  const legacy = state(); delete legacy.preferences;
  assert.deepEqual(S.validateState(legacy).preferences, S.DEFAULT_PREFERENCES);
  assert.equal(S.fingerprint(legacy), S.fingerprint(state()));
  const input = state(); input.preferences = {examDate: '2027-03-15', dailyMinutes: 60,
    dailyNewLimit: 15, dailyReviewLimit: 30, cycleWeeks: 16};
  assert.deepEqual(S.validateState(S.serialize(input)), input);
  const invalid = change => { const x = state(); change(x.preferences); return x; };
  assert.throws(() => S.validateState(invalid(p => p.examDate = '2027-02-30')), /考试日期/);
  assert.throws(() => S.validateState(invalid(p => p.dailyMinutes = 14)), /范围/);
  assert.throws(() => S.validateState(invalid(p => p.dailyMinutes = 181)), /范围/);
  assert.throws(() => S.validateState(invalid(p => p.dailyNewLimit = 31)), /范围/);
  assert.throws(() => S.validateState(invalid(p => p.dailyReviewLimit = 4)), /范围/);
  assert.throws(() => S.validateState(invalid(p => p.cycleWeeks = 24.5)), /范围/);
  assert.throws(() => S.validateState(invalid(p => p.extra = true)), /未知字段/);
});

test('preferences merge independently of vocabulary but overlapping preference edits conflict', () => {
  const base = state(), local = reviewed(base, 0), remote = copy(base);
  remote.preferences.dailyMinutes = 60;
  const merge = S.decideSync(base, local, remote);
  assert.equal(merge.action, 'merge');
  assert.equal(merge.state.preferences.dailyMinutes, 60);
  assert.deepEqual(merge.state.records[0], local.records[0]);
  local.preferences.dailyNewLimit = 15;
  const conflict = S.decideSync(base, local, remote);
  assert.equal(conflict.action, 'conflict');
  assert.equal(conflict.conflicts[0].path, 'preferences');
});

function withArticle() {
  const lesson = lessons()[0];
  lesson.article = {paragraphs: [
    {id: 'P1', text: 'Urban design affects how residents reach daily services.'},
    {id: 'P2', text: 'The researchers compared several kinds of neighbourhoods.'},
    {id: 'P3', text: 'More evidence is needed to establish cause and effect.'}
  ], license: {name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', permission: 'licensed'},
  author: 'Example Author', titleZh: '城市设计研究'};
  // These synthetic paragraphs replace the real article: reset every real locator.
  for (const question of lesson.questions) {
    question.evidenceParagraphIds = ['P1'];
    question.locator = [{paragraphId: 'P1'}];
    if (Array.isArray(question.location)) question.location = ['P1'];
  }
  lesson.questions[0].evidenceParagraphIds = ['P2'];
  lesson.questions[0].locator = [{paragraphId: 'P2', quote: 'compared several kinds'}];
  return lesson;
}

test('licensed inline article paragraphs and checked evidence locators round-trip', () => {
  const input = state(); input.customLessons = [withArticle()];
  assert.deepEqual(S.validateState(S.serialize(input)), input);
  input.customLessons[0].questions[1].location = ['P1', 'P2'];
  assert.doesNotThrow(() => S.validateState(input));
  input.customLessons[0].article.license.permission = 'public-domain';
  assert.doesNotThrow(() => S.validateState(input));
});

test('distinct quotations can point to one paragraph while duplicate exact locators still fail', () => {
  const input = state(); input.customLessons = [withArticle()];
  input.customLessons[0].questions[0].locator = [
    {paragraphId: 'P2', quote: 'The researchers compared'},
    {paragraphId: 'P2', quote: 'several kinds of neighbourhoods'}
  ];
  assert.doesNotThrow(() => S.validateState(input));
  input.customLessons[0].questions[0].locator.push(copy(input.customLessons[0].questions[0].locator[0]));
  assert.throws(() => S.validateState(input), /重复/);
});

test('invalid inline article licensing, HTML and missing evidence references are rejected', () => {
  const mutate = change => { const input = state(); input.customLessons = [withArticle()]; change(input.customLessons[0]); return input; };
  assert.throws(() => S.validateState(mutate(l => l.article.paragraphs[1].id = 'P1')), /重复/);
  assert.throws(() => S.validateState(mutate(l => l.article.paragraphs = l.article.paragraphs.slice(0, 2))), /数量/);
  assert.throws(() => S.validateState(mutate(l => l.article.paragraphs[0].text = '<script>alert(1)</script>')), /纯文本/);
  assert.throws(() => S.validateState(mutate(l => l.article.license.permission = 'free-to-read')), /授权状态/);
  assert.throws(() => S.validateState(mutate(l => delete l.article.license)), /授权/);
  assert.throws(() => S.validateState(mutate(l => l.questions[0].evidenceParagraphIds = ['P4'])), /缺失/);
  assert.throws(() => S.validateState(mutate(l => l.questions[0].evidenceParagraphIds = ['P2', 'P2'])), /重复/);
  assert.throws(() => S.validateState(mutate(l => l.questions[0].locator = [{paragraphId: 'P9'}])), /缺失/);
  assert.throws(() => S.validateState(mutate(l => l.questions[0].locator = [{paragraphId: 'P2', quote: 7}])), /引文/);
});

test('source provenance and optional vocabulary senses are preserved without implying mastery', () => {
  const input = state();
  input.records[0].source = {kind: 'user-confirmed', lessonId: 'urban-health', paragraphId: 'P2'};
  input.records[0].senses = [{meaning: '恢复能力', context: 'ecology'}, {meaning: '韧性', context: 'materials'}];
  assert.deepEqual(S.validateState(S.serialize(input)), input);
  assert.equal(S.validateState(input).records[0].status, 'unconfirmed');
  assert.deepEqual(S.validateState(input).records[0].reviewHistory, []);
});
