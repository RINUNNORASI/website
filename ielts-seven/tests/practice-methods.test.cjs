const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const P = require('../dist/practice-methods.js');

function record(word = 'resilience', extra = {}) {
  return {id: 'word-' + word, word, meaning: '恢复力；韧性', needsContent: false,
    collocations: [{en: 'build resilience', zh: '培养韧性'}, {en: 'show resilience', zh: '展现韧性'}, {en: 'improve resilience', zh: '提升韧性'}],
    example: {en: 'Trees build resilience. Resilience helps communities recover.', zh: '树木提升恢复力，韧性有助于社区恢复。'}, ...extra};
}
function ownRecords() { return [record(), record('prevent', {meaning: '阻止；预防'}), record('disparity', {meaning: '差异；不平等'})]; }

test('module supports the browser global and CommonJS without DOM or engine dependencies', () => {
  const browser = {window: {}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/practice-methods.js'), 'utf8'), browser);
  assert.equal(typeof browser.window.IELTS_PRACTICE.makeExercise, 'function');
  assert.deepEqual(Array.from(P.modes, mode => mode.id), ['guided', 'flashcard', 'meaning', 'spelling', 'listening', 'cloze', 'collocation', 'writing']);
  assert.ok(P.modes.every(mode => mode.name && mode.description && mode.icon && mode.focus));
  assert.ok(Object.isFrozen(P.modes));
  assert.ok(P.modes.every(Object.isFrozen));
});

test('all eight methods generate only from supplied records and leave source data unchanged', () => {
  const records = ownRecords(), before = JSON.stringify(records);
  for (const {id: mode} of P.modes) {
    assert.equal(P.availability(mode, records[0], records).available, true, mode);
    const first = P.makeExercise(mode, records[0], records);
    assert.equal(first.mode, mode);
    assert.equal(first.recordId, records[0].id);
    assert.equal(first.word, 'resilience');
    assert.deepEqual(P.makeExercise(mode, records[0], records), first, 'stable ordering and exercise identity');
  }
  assert.equal(JSON.stringify(records), before);
});

test('missing content is reported instead of inventing definitions, example sentences or pairs', () => {
  const blank = record('unfamiliar', {meaning: '', collocations: [], example: {en: '', zh: ''}, needsContent: true});
  for (const mode of ['flashcard', 'meaning', 'spelling', 'cloze', 'collocation']) {
    const status = P.availability(mode, blank, [blank]);
    assert.equal(status.available, false, mode);
    assert.ok(status.reason);
    assert.throws(() => P.makeExercise(mode, blank, [blank]));
  }
  const guided = P.makeExercise('guided', blank, [blank]);
  assert.equal(guided.prompt, 'unfamiliar');
  assert.equal(guided.expectedAnswer, 'unfamiliar');
  assert.equal(P.availability('unknown-mode', blank, []).available, false);
  assert.equal(P.availability('guided', null, []).available, false);
  assert.equal(P.availability('guided', {word: '  '}, []).available, false);
});

test('meaning choices use only this supplied vocabulary, exclude duplicate or overlapping saved meanings', () => {
  const target = record();
  const records = [target, record('resilience', {id: 'duplicate', meaning: '不应成为干扰项'}),
    record('same-meaning', {meaning: '恢复力；韧性'}), record('overlap', {meaning: '恢复力'}),
    record('prevent', {meaning: '阻止；预防'}), record('disparity', {meaning: '差异；不平等'})];
  const exercise = P.makeExercise('meaning', target, records);
  assert.equal(exercise.kind, 'choice');
  assert.deepEqual(new Set(exercise.choices.map(choice => choice.label)), new Set(['恢复力；韧性', '阻止；预防', '差异；不平等']));
  assert.equal(new Set(exercise.choices.map(choice => choice.id)).size, 3);
  assert.equal(exercise.choices.find(choice => choice.id === exercise.expectedChoiceId).label, target.meaning);
  assert.match(exercise.subprompt, /已保存释义/);
  assert.equal(P.grade(exercise, exercise.expectedChoiceId).correct, true);
  assert.equal(P.grade(exercise, exercise.choices.find(choice => choice.id !== exercise.expectedChoiceId).id).correct, false);
  assert.equal(P.grade(exercise, target.meaning).valid, false, 'labels cannot masquerade as selected option IDs');
});

test('meaning recognition needs two unique choices but never pads a small private vocabulary', () => {
  const target = record();
  assert.equal(P.availability('meaning', target, [target]).available, false);
  const exercise = P.makeExercise('meaning', target, [target, record('prevent', {meaning: '预防'})]);
  assert.equal(exercise.choices.length, 2);
  assert.deepEqual(new Set(exercise.choices.map(choice => choice.label)), new Set([target.meaning, '预防']));
});

test('correct choices are deterministically shuffled rather than always appearing first', () => {
  const positions = new Set();
  for (let index = 0; index < 24; index++) {
    const records = ownRecords();
    records[0].id = 'target-' + index;
    const exercise = P.makeExercise('meaning', records[0], records);
    positions.add(exercise.choices.findIndex(choice => choice.id === exercise.expectedChoiceId));
  }
  assert.ok(positions.size > 1);
});

test('spelling normalizes case, surrounding whitespace, phrase whitespace and smart punctuation without lemmatization', () => {
  const word = record('one’s long-term goal', {meaning: '一个人的长期目标'});
  const exercise = P.makeExercise('spelling', word, [word]);
  assert.equal(exercise.prompt, word.meaning);
  assert.equal(exercise.prompt.includes(word.word), false);
  assert.equal(P.grade(exercise, "  ONE'S   LONG‑TERM GOAL  ").correct, true);
  assert.equal(P.grade(exercise, "one's long-term goals").correct, false);
  assert.equal(P.grade(exercise, "one's long term goal").correct, false);
  assert.equal(P.grade(exercise, "one's long-term goal.").correct, false);
  assert.equal(P.normalizeAnswer('cafe\u0301'), P.normalizeAnswer('café'));
});

test('listening hides the spelling and definition from its visible prompts and grades typed words only', () => {
  const word = record();
  const exercise = P.makeExercise('listening', word, [word]);
  assert.equal(exercise.audio, true);
  assert.equal(exercise.kind, 'text');
  assert.equal((exercise.prompt + exercise.subprompt).includes(word.word), false);
  assert.equal((exercise.prompt + exercise.subprompt).includes(word.meaning), false);
  assert.equal(P.grade(exercise, 'RESILIENCE').correct, true);
  assert.equal(P.grade(exercise, 'resilient').correct, false);
});

test('cloze blanks all complete occurrences and preserves exact saved sentence and phrase forms', () => {
  const word = record('urban heat island', {example: {en: 'An urban heat island is local. The Urban Heat Island can be measured.', zh: '城市热岛现象可以测量。'}});
  const exercise = P.makeExercise('cloze', word, [word]);
  assert.equal(exercise.prompt, 'An ______ is local. The ______ can be measured.');
  assert.equal(exercise.expectedAnswer, 'urban heat island');
  assert.equal(exercise.blankCount, 2);
  assert.equal(exercise.subprompt, word.example.zh);
  assert.equal(P.grade(exercise, 'Urban  Heat Island').correct, true);
  assert.equal(P.grade(exercise, 'urban heat islands').correct, false);
  assert.equal(exercise.prompt.toLowerCase().includes(word.word), false);
});

test('cloze never derives plural or conjugated answers or uses unrelated legacy example text', () => {
  const word = record('tree', {example: {en: 'Trees surround the street.', zh: '街道周围有树木。'}, exampleEn: 'A tree grows.'});
  assert.equal(P.availability('cloze', word, [word]).available, false);
  assert.throws(() => P.makeExercise('cloze', word, [word]));
  assert.equal(P.availability('cloze', record('art', {example: {en: 'The earth matters.', zh: ''}}), []).available, false);
  assert.equal(P.availability('cloze', record('heat island', {example: {en: 'A heat islander arrived.', zh: ''}}), []).available, false);
});

test('cloze escapes literal punctuation and uses Unicode letter boundaries', () => {
  const literal = record('a.b', {example: {en: 'The a.b example differs from axb.', zh: ''}});
  const exercise = P.makeExercise('cloze', literal, [literal]);
  assert.equal(exercise.prompt, 'The ______ example differs from axb.');
  assert.equal(P.grade(exercise, 'a.b').correct, true);
  assert.equal(P.grade(exercise, 'axb').correct, false);
  const plus = record('c++', {example: {en: 'We use C++, not c++ish.', zh: ''}});
  assert.equal(P.makeExercise('cloze', plus, []).prompt, 'We use ______, not c++ish.');
  assert.equal(P.availability('cloze', record('art', {example: {en: 'éart and arté only.', zh: ''}}), []).available, false);
  assert.equal(P.makeExercise('cloze', record('café', {example: {en: 'The café is open.', zh: ''}}), []).prompt, 'The ______ is open.');
});

test('collocation matches only saved bilingual pairs instead of guessing another plausible collocation', () => {
  const word = record();
  const exercise = P.makeExercise('collocation', word, [word, record('distractor')]);
  const saved = word.collocations.find(pair => pair.en === exercise.prompt);
  assert.ok(saved);
  assert.equal(exercise.kind, 'choice');
  assert.equal(exercise.expectedAnswer, saved.zh);
  assert.ok(exercise.choices.every(choice => word.collocations.some(pair => pair.zh === choice.label)));
  assert.equal(P.grade(exercise, exercise.expectedChoiceId).correct, true);
  assert.equal(new Set(exercise.choices.map(choice => choice.label)).size, exercise.choices.length);
});

test('collocation removes conflicting pairs and refuses a single or ambiguous translation', () => {
  const single = record('resilience', {collocations: [{en: 'build resilience', zh: '培养韧性'}, {en: 'build resilience', zh: '培养韧性'}]});
  assert.equal(P.availability('collocation', single, []).available, false);
  const conflicting = record('resilience', {collocations: [{en: 'build resilience', zh: '培养韧性'}, {en: 'build resilience', zh: '不同译文'}, {en: 'show resilience', zh: '展现韧性'}]});
  assert.equal(P.availability('collocation', conflicting, []).available, false);
  const duplicateZh = record('resilience', {collocations: [{en: 'build resilience', zh: '培养韧性'}, {en: 'develop resilience', zh: '培养韧性'}, {en: 'show resilience', zh: '展现韧性'}]});
  assert.equal(P.availability('collocation', duplicateZh, []).available, false);
  const two = record('resilience', {collocations: [{en: 'build resilience', zh: '培养韧性'}, {en: 'show resilience', zh: '展现韧性'}]});
  assert.equal(P.makeExercise('collocation', two, []).choices.length, 2);
});

test('guided, flashcard and writing always require human assessment without automatic accuracy claims', () => {
  const word = record();
  for (const mode of ['guided', 'flashcard', 'writing']) {
    const exercise = P.makeExercise(mode, word, [word]);
    for (const answer of [exercise.expectedAnswer || 'I used resilience.', 'A sentence with deliberate grammar errors.']) {
      const result = P.grade(exercise, answer);
      assert.equal(result.correct, null, mode);
      assert.equal(result.requiresSelfAssessment, true, mode);
      assert.equal(result.valid, true, mode);
    }
    assert.equal(P.grade(exercise, '').correct, null);
  }
  const writing = P.makeExercise('writing', word, [word]);
  assert.match(P.grade(writing, 'I has resilience.').feedback, /未判断语法/);
  assert.throws(() => P.grade({...writing, kind: 'text'}, 'anything'), /不一致/);
});

test('all graders reject empty, nonstring, oversized or unknown choice answers without awarding correctness', () => {
  const records = ownRecords();
  for (const {id: mode} of P.modes) {
    const exercise = P.makeExercise(mode, records[0], records);
    for (const answer of ['', ' \n\t ', null, undefined, {answer: exercise.expectedAnswer}, 'a'.repeat(2001)]) {
      const result = P.grade(exercise, answer);
      assert.equal(result.valid, false, mode);
      assert.equal(result.correct, null, mode);
      assert.ok(result.feedback);
    }
  }
  assert.equal(P.grade(P.makeExercise('meaning', records[0], records), 'option-999').valid, false);
  assert.throws(() => P.grade(null, 'answer'), /无效/);
});
