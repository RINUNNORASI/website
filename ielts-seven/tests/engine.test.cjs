const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../dist/engine.js');

function word(word = 'resilience', extra = {}) {
  return E.seed([{word, firstSeen: '2026-09-24', level: 'A', ipa: '/rɪˈzɪliəns/',
    meaning: '恢复力', pos: 'n.', family: 'resilient', memory: '词族记忆',
    batch: '9月24日第一批', collocations: [{en: 'build resilience', zh: '提高恢复力'}],
    example: {en: 'Trees build resilience.', zh: '树木提高恢复力。'}, ...extra}])[0];
}

test('Shanghai day boundary and calendar arithmetic are independent of host timezone', () => {
  assert.equal(E.today('2026-10-13T15:59:59Z'), '2026-10-13');
  assert.equal(E.today('2026-10-13T16:00:00Z'), '2026-10-14');
  assert.equal(E.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(E.addDays('2028-02-28', 3), '2028-03-02');
  assert.equal(E.dayDiff('2026-09-24', '2026-10-14'), 20);
  assert.equal(E.isDate('2026-02-30'), false);
  assert.throws(() => E.addDays('2026-02-30', 1));
});

test('historical elapsed dates do not count contacts or invent completed reviews', () => {
  const record = word();
  assert.equal(record.contacts, 1);
  assert.equal(record.status, 'unconfirmed');
  assert.deepEqual(record.reviewHistory, []);
  assert.equal(record.lastReview, null);
  assert.equal(record.nextReview, '2026-09-25');
  assert.equal(E.mode(record), 'teaching');
  assert.deepEqual(E.due([record], '2026-09-24'), []);
  assert.equal(E.due([record], '2026-10-14').length, 1);
  assert.equal(record.contacts, 1);
  assert.equal(record.example.zh, '树木提高恢复力。');
});

test('actual confirmations count once a day and missed slots advance to future anchor', () => {
  const original = word();
  const learned = E.review(original, {kind: 'studied', date: '2026-10-14'});
  assert.equal(learned.contacts, 2);
  assert.equal(learned.nextReview, '2026-10-24');
  assert.equal(E.mode(learned), 'hinted');
  assert.equal(original.contacts, 1, 'review is pure');
  const again = E.review(learned, {kind: 'studied', date: '2026-10-14'});
  assert.equal(again.contacts, 2);
  const third = E.review(again, {kind: 'correct', date: '2026-10-24', answer: '恢复力'});
  assert.equal(third.contacts, 3);
  assert.equal(E.mode(third), 'context');
  assert.equal(third.status, 'correct-once');
  assert.equal(third.nextReview, null);
  assert.deepEqual(E.due([third], '2026-10-25'), []);
});

test('empty or absent answers cannot mark a word right or wrong', () => {
  for (const kind of ['correct', 'wrong']) {
    assert.throws(() => E.review(word(), {kind, date: '2026-10-14'}), /明确作答/);
    assert.throws(() => E.review(word(), {kind, date: '2026-10-14', answer: '  '}), /明确作答/);
  }
  assert.throws(() => E.review(word(), {kind: 'studied', date: '2026-09-23'}), /早于/);
});

test('a real error reopens teaching and adds next-day and day-three reviews', () => {
  const older = E.review(word(), {kind: 'studied', date: '2026-10-14'});
  const failed = E.review(older, {kind: 'wrong', date: '2026-10-15', answer: '危险'});
  assert.equal(failed.contacts, 3);
  assert.equal(E.mode(failed), 'teaching');
  assert.equal(E.hasError(failed), true);
  assert.deepEqual(failed.extraReviews, ['2026-10-16', '2026-10-18']);
  assert.equal(failed.nextReview, '2026-10-16');
  const taught = E.review(failed, {kind: 'studied', date: '2026-10-16'});
  assert.equal(taught.forceTeaching, false);
  assert.equal(taught.nextReview, '2026-10-18');
  assert.equal(E.hasError(taught), true, 'reading the explanation does not resolve a recorded error');
  const corrected = E.review(taught, {kind: 'correct', date: '2026-10-18', answer: '恢复力'});
  assert.equal(E.hasError(corrected), false);
  assert.equal(corrected.errors.length, 1, 'error history is retained');
  assert.equal(corrected.errors[0].resolvedOn, '2026-10-18');
  assert.equal(corrected.status, 'correct-once');
  assert.equal(corrected.nextReview, '2026-10-24');
});

test('due excludes C, does not invent empty batches, sorts real errors and repetitions first', () => {
  const repeated = word('alternative', {repeatCount: 3});
  const ordinary = word('manage');
  const low = word('specimen', {level: 'B'});
  const ignored = word('ignored', {level: 'C'});
  const failed = E.review(word('caution'), {kind: 'wrong', date: '2026-10-13', answer: '随意'});
  assert.deepEqual(E.due([ordinary, ignored, low, repeated, failed], '2026-10-14').map(x => x.word),
    ['caution', 'alternative', 'manage', 'specimen']);
  assert.deepEqual(E.due([], '2026-10-14'), []);
});

test('intake corrects reported spelling, splits the known two-word typo and preserves phrases', () => {
  const existing = word('exacerbate');
  const staged = E.stageIntake('Exacerbate Swelter\nAsphalt\nasphalt\nAffordable\naffordable\nStratosphenic\nspearheaded\nfacilitated\ndrought(s)\nurban heat island', [existing]);
  assert.deepEqual(staged.items.map(x => x.word), ['exacerbate', 'swelter', 'asphalt', 'affordable',
    'stratospheric', 'spearhead', 'facilitate', 'drought', 'urban heat island']);
  assert.equal(staged.duplicates.length, 2);
  assert.equal(staged.items[0].existing, true);
  assert.equal(staged.items[1].levelSuggested, 'B');
  assert.equal(staged.items[5].needsContent, true);
  assert.equal(staged.items[8].requiresConfirmation, true);
});

test('candidates never enter formal review merely by being shown; confirmed missing content stays blank', () => {
  const known = [word('resilience')];
  const staged = E.stageIntake('unknownterm\nresilience', known, [{word: 'uncertainty', ipa: '/ʌnˈsɜːtnti/', meaning: '不确定性', level: 'A'}]);
  assert.equal(known.length, 1);
  const confirmed = E.confirmIntake(staged.items, known, {date: '2026-10-14', batch: '主动提交'});
  assert.equal(confirmed.length, 2);
  const newWord = confirmed.find(x => x.word === 'unknownterm');
  assert.equal(newWord.ipa, ''); assert.equal(newWord.meaning, '');
  assert.equal(newWord.needsContent, true);
  assert.equal(newWord.firstSeen, '2026-10-14');
  const repeat = confirmed.find(x => x.word === 'resilience');
  assert.equal(repeat.contacts, 1);
  assert.equal(repeat.repeats, 1);
  assert.equal(repeat.firstSeen, '2026-09-24');
  assert.equal(repeat.origins.at(-1).batch, '主动提交');
  assert.equal(known[0].repeats, 0, 'confirmation is pure');
  assert.equal(confirmed.some(x => x.word === 'uncertainty'), false);
});

test('flat repeated seeds keep the oldest date and original spelling', () => {
  const result = E.seed([{word: 'Stratosphenic', firstSeen: '2026-09-24', level: 'B'}],
    [{word: 'stratospheric', firstSeen: '2026-10-13', level: 'B'}]);
  assert.equal(result.length, 1);
  assert.equal(result[0].word, 'stratospheric');
  assert.equal(result[0].firstSeen, '2026-09-24');
  assert.equal(result[0].contacts, 1);
  assert.equal(result[0].repeats, 1);
  assert.ok(result[0].originals.includes('Stratosphenic'));
});

test('backup round-trips history and rejects malformed dates, arrays, false scores and missing evidence', () => {
  const reviewed = E.review(word(), {kind: 'wrong', date: '2026-10-14', answer: '错答'});
  const backup = E.makeBackup([reviewed], {lastExcel: '2026-10-11', readingState: {
    assignments: {'2026-10-14': 'lesson-1'}, completed: {}, excluded: [],
    results: {'2026-10-14|lesson-1': {date: '2026-10-14', lessonId: 'lesson-1', submittedAt: '2026-10-14T04:00:00Z', answers: {'1': 'TRUE'}}}
  }});
  assert.deepEqual(E.validateBackup(JSON.stringify(backup)).records, [reviewed]);
  assert.throws(() => E.validateBackup([]), /格式或版本/);
  assert.throws(() => E.validateBackup('{'), /有效 JSON/);
  const mutate = change => { const copy = JSON.parse(JSON.stringify(backup)); change(copy); return copy; };
  assert.throws(() => E.validateBackup(mutate(x => x.records[0].firstSeen = '2026-02-30')), /有效/);
  assert.throws(() => E.validateBackup(mutate(x => x.records[0].contacts = 100)), /不一致/);
  assert.throws(() => E.validateBackup(mutate(x => x.records[0].status = 'mastered')), /状态/);
  assert.throws(() => E.validateBackup(mutate(x => x.records[0].reviewHistory[0].answer = '')), /实际作答/);
  assert.throws(() => E.validateBackup(mutate(x => x.records.push(x.records[0]))), /重复词汇/);
  assert.throws(() => E.validateBackup(mutate(x => x.records = {})), /必须是数组/);
  assert.throws(() => E.validateBackup(mutate(x => x.readingState = [])), /阅读进度/);
  assert.throws(() => E.validateBackup(mutate(x => x.readingState.results['2026-10-14|lesson-1'].answers['1'] = '')), /明确作答/);
  assert.throws(() => E.validateBackup(mutate(x => x.readingState.assignments['2026-02-30'] = 'lesson-2')), /有效/);
});

test('manual reclassification preserves scheduling and B remains recognition-only', () => {
  const original = word();
  const hidden = E.setLevel(original, 'C');
  assert.equal(hidden.nextReview, null);
  assert.equal(original.level, 'A');
  assert.doesNotThrow(() => E.makeBackup([hidden]));
  const restored = E.setLevel(hidden, 'B');
  assert.equal(restored.nextReview, '2026-09-25', 'returning to A/B preserves the overdue original anchor');
  let studied = E.review(restored, {kind: 'studied', date: '2026-10-14'});
  studied = E.review(studied, {kind: 'studied', date: '2026-10-15'});
  assert.equal(studied.contacts, 3);
  assert.equal(E.mode(studied), 'teaching');
  assert.doesNotThrow(() => E.makeBackup([studied]));
  assert.equal(E.mode(E.setLevel(studied, 'A')), 'context');
  const staged = E.stageIntake('resilience', [studied]);
  const reclassified = E.confirmIntake(staged.items.map(item => ({...item, confirmed: true, level: 'C'})),
    [studied], {date: '2026-10-16'})[0];
  assert.equal(reclassified.level, 'C', 'an explicit intake classification also applies to existing words');
  assert.equal(reclassified.nextReview, null);
  assert.equal(reclassified.contacts, studied.contacts, 'reappearance does not count a study contact');
  assert.equal(reclassified.firstSeen, studied.firstSeen);
  assert.doesNotThrow(() => E.makeBackup([reclassified]));
  assert.throws(() => E.confirmIntake([{word: 'resilience', level: 'X'}], [studied], {date: '2026-10-16'}), /A\/B\/C/);
});

test('Excel remains gated until day five and enough genuinely new confirmed records exist', () => {
  const records = Array.from({length: 6}, (_, i) => word('new' + i, {firstSeen: '2026-10-13'}));
  assert.equal(E.exportEligible(records, '2026-10-11', '2026-10-14').allowed, false);
  assert.equal(E.exportEligible(records, '2026-10-11', '2026-10-16').allowed, true);
  assert.equal(E.exportEligible(records.slice(0, 4), '2026-10-11', '2026-10-18').allowed, false);
  assert.equal(E.exportEligible([word()], '2026-10-11', '2026-10-18').newCount, 0);
});
