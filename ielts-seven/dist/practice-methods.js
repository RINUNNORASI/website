/* Practice generation is local to the caller's supplied word records. No scheduling or storage. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IELTS_PRACTICE = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  const modes = Object.freeze([
    {id: 'guided', name: '讲解学习', description: '先理解词义、搭配与例句，再确认已读懂。', icon: 'book-open', focus: '理解'},
    {id: 'flashcard', name: '翻卡回忆', description: '先在心里回忆词义，翻面核对后自行评估。', icon: 'layers', focus: '主动回忆'},
    {id: 'meaning', name: '释义辨认', description: '从自己词库的已保存释义中选出对应的一项。', icon: 'list-checks', focus: '词义辨认'},
    {id: 'spelling', name: '看义拼词', description: '根据已保存的中文义，输入英文词或完整短语。', icon: 'keyboard', focus: '主动拼写'},
    {id: 'listening', name: '听音拼写', description: '听发音后输入词形，可按需重复播放。', icon: 'headphones', focus: '听音辨形'},
    {id: 'cloze', name: '语境填空', description: '在词卡原有例句中补回被隐藏的词或短语。', icon: 'text-cursor-input', focus: '语境回忆'},
    {id: 'collocation', name: '搭配配对', description: '把词卡中已有的英文搭配与中文意思配对。', icon: 'link', focus: '常用搭配'},
    {id: 'writing', name: '造句运用', description: '用这个词写自己的句子，对照词卡后自行核对。', icon: 'pencil-line', focus: '主动运用'}
  ].map(Object.freeze));
  const knownModes = new Set(modes.map(mode => mode.id));
  const letters = /[\p{L}\p{N}_]/u;
  const MAX_ANSWER = 2000;
  function text(value) { return typeof value === 'string' ? value.trim() : ''; }
  function normalizeAnswer(value) {
    if (typeof value !== 'string') return '';
    return value.normalize('NFC').replace(/[\u2018\u2019\u02bc\uff07]/g, "'")
      .replace(/[\u201c\u201d\uff02]/g, '"').replace(/[\u2010\u2011\ufe63\uff0d]/g, '-')
      .replace(/\s+/gu, ' ').trim().toLocaleLowerCase('en');
  }
  function hash(value) {
    let result = 2166136261;
    for (const char of String(value)) { result ^= char.codePointAt(0); result = Math.imul(result, 16777619); }
    return result >>> 0;
  }
  function seed(record, mode) { return mode + '|' + text(record && record.id) + '|' + normalizeAnswer(record && record.word); }
  function shuffled(values, key) {
    const result = values.slice();
    let state = hash(key) || 1;
    for (let index = result.length - 1; index > 0; index--) {
      state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
      const other = (state >>> 0) % (index + 1);
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }
  function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function previousChar(value, index) { return Array.from(value.slice(0, index)).at(-1) || ''; }
  function nextChar(value, index) { return Array.from(value.slice(index))[0] || ''; }
  function blankSavedExample(record) {
    const word = text(record && record.word);
    const example = text(record && record.example && record.example.en);
    if (!word || !example) return null;
    const matcher = new RegExp(escapeRegExp(word), 'giu');
    let match, end = 0, prompt = '', expectedAnswer = '', count = 0;
    while ((match = matcher.exec(example))) {
      if (letters.test(previousChar(example, match.index)) || letters.test(nextChar(example, match.index + match[0].length))) continue;
      prompt += example.slice(end, match.index) + '______';
      end = match.index + match[0].length;
      if (!expectedAnswer) expectedAnswer = match[0];
      count++;
    }
    return count ? {prompt: prompt + example.slice(end), expectedAnswer, count} : null;
  }
  function meaningParts(value) {
    return normalizeAnswer(value).split(/[;；、,/／]/u).map(value => value.trim()).filter(Boolean);
  }
  function overlapsMeaning(first, second) {
    const a = normalizeAnswer(first), b = normalizeAnswer(second);
    if (!a || !b || a === b || (a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a)))) return true;
    const parts = new Set(meaningParts(a));
    return meaningParts(b).some(part => parts.has(part));
  }
  function meaningOptions(record, records) {
    const ownMeaning = text(record && record.meaning);
    if (!ownMeaning) return [];
    const labels = [ownMeaning];
    const candidates = Array.isArray(records) ? records : [];
    for (const candidate of candidates) {
      if (!candidate || normalizeAnswer(candidate.word) === normalizeAnswer(record.word)) continue;
      const meaning = text(candidate.meaning);
      if (!meaning || labels.some(label => overlapsMeaning(label, meaning))) continue;
      labels.push(meaning);
      if (labels.length === 3) break;
    }
    return labels;
  }
  function savedPairs(record) {
    const candidates = [], english = new Map(), chinese = new Map();
    for (const pair of Array.isArray(record && record.collocations) ? record.collocations : []) {
      const en = text(pair && pair.en), zh = text(pair && pair.zh);
      if (!en || !zh) continue;
      const enKey = normalizeAnswer(en), zhKey = normalizeAnswer(zh);
      if (!english.has(enKey)) english.set(enKey, new Set());
      if (!chinese.has(zhKey)) chinese.set(zhKey, new Set());
      english.get(enKey).add(zhKey); chinese.get(zhKey).add(enKey);
      candidates.push({en, zh, enKey, zhKey});
    }
    const seen = new Set();
    return candidates.filter(pair => {
      if (english.get(pair.enKey).size !== 1 || chinese.get(pair.zhKey).size !== 1 || seen.has(pair.enKey)) return false;
      seen.add(pair.enKey); return true;
    }).map(pair => ({en: pair.en, zh: pair.zh}));
  }
  function availability(mode, record, records) {
    if (!knownModes.has(mode)) return {available: false, reason: '暂不支持这种练习方式。'};
    if (!record || !text(record.word)) return {available: false, reason: '请先选择一个词或短语。'};
    if (['flashcard', 'spelling'].includes(mode) && !text(record.meaning)) return {available: false, reason: '请先补充这个词的中文释义。'};
    if (mode === 'meaning' && meaningOptions(record, records).length < 2) return {available: false, reason: '自己的词库中还需要另一条不同且不重叠的释义，才能生成辨认选项。'};
    if (mode === 'cloze' && !blankSavedExample(record)) return {available: false, reason: '现有英文例句中没有完整出现这个词或短语；补充例句后即可练习。'};
    if (mode === 'collocation' && savedPairs(record).length < 2) return {available: false, reason: '请先保存至少两组英文和中文均不重复的双语搭配。'};
    return {available: true, reason: ''};
  }
  function withChoices(exercise, labels, expected, key) {
    exercise.choices = shuffled(labels, key).map((label, index) => ({id: 'option-' + (index + 1), label}));
    exercise.expectedChoiceId = exercise.choices.find(choice => normalizeAnswer(choice.label) === normalizeAnswer(expected)).id;
    return exercise;
  }
  function makeExercise(mode, record, records) {
    const status = availability(mode, record, records);
    if (!status.available) throw new Error(status.reason);
    const word = text(record.word), meaning = text(record.meaning), key = seed(record, mode);
    const exercise = {id: 'practice-' + hash(key).toString(16), mode, kind: 'text', prompt: '', subprompt: '', choices: [],
      expectedAnswer: word, expectedChoiceId: null, word, recordId: text(record.id), audio: false};
    switch (mode) {
      case 'guided':
        return {...exercise, kind: 'guided', prompt: word, subprompt: '结合词卡中的词义、搭配和例句理解，再自行确认。', expectedAnswer: meaning || word};
      case 'flashcard':
        return {...exercise, kind: 'self', prompt: word, subprompt: '先回忆中文意思，再翻卡核对；回忆结果由你自己判断。', expectedAnswer: meaning};
      case 'meaning':
        exercise.kind = 'choice'; exercise.prompt = word; exercise.subprompt = '按已保存释义核对，选择这个词对应的完整释义。'; exercise.expectedAnswer = meaning;
        return withChoices(exercise, meaningOptions(record, records), meaning, key);
      case 'spelling':
        return {...exercise, prompt: meaning, subprompt: '输入完整英文词或短语；按词卡保存的词形核对。'};
      case 'listening':
        return {...exercise, prompt: '听发音，写出你听到的词或短语。', subprompt: '可以重复播放；提交后再显示词形。', audio: true};
      case 'cloze': {
        const blank = blankSavedExample(record);
        return {...exercise, prompt: blank.prompt, subprompt: text(record.example && record.example.zh), expectedAnswer: blank.expectedAnswer, blankCount: blank.count};
      }
      case 'collocation': {
        const pairs = savedPairs(record), pair = pairs[hash(key + '|pair') % pairs.length];
        const alternatives = pairs.filter(candidate => candidate !== pair).slice(0, 2);
        exercise.kind = 'choice'; exercise.prompt = pair.en; exercise.subprompt = '按词卡保存的双语配对，选择这条搭配的中文意思。'; exercise.expectedAnswer = pair.zh;
        return withChoices(exercise, [pair.zh, ...alternatives.map(candidate => candidate.zh)], pair.zh, key);
      }
      case 'writing':
        return {...exercise, kind: 'writing', prompt: '用 ' + word + ' 写一个与你有关的英文句子。', subprompt: meaning ? '词卡中文义：' + meaning : '写完后对照词卡，自行检查词义、搭配与句意。', expectedAnswer: ''};
      default: throw new Error('暂不支持这种练习方式。');
    }
  }
  function grade(exercise, answer) {
    if (!exercise || !knownModes.has(exercise.mode)) throw new Error('练习内容无效。');
    const expectedKind = {guided: 'guided', flashcard: 'self', meaning: 'choice', spelling: 'text', listening: 'text', cloze: 'text', collocation: 'choice', writing: 'writing'}[exercise.mode];
    if (exercise.kind !== expectedKind) throw new Error('练习题型与方式不一致。');
    const human = ['guided', 'flashcard', 'writing'].includes(exercise.mode);
    const expectedAnswer = typeof exercise.expectedAnswer === 'string' ? exercise.expectedAnswer : '';
    const result = {correct: null, expectedAnswer, feedback: '', requiresSelfAssessment: human, valid: false};
    if (typeof answer !== 'string' || !answer.trim()) return {...result, feedback: exercise.kind === 'choice' ? '请先选择一个答案。' : '请先完成作答或明确选择自评结果。'};
    if (answer.length > MAX_ANSWER) return {...result, feedback: '作答请控制在 2000 个字符以内。'};
    if (human) return {...result, valid: true, feedback: exercise.kind === 'writing' ? '这次造句需要你对照词卡自行核对；系统未判断语法或用词是否正确。' : '对照词卡后，由你自行评估这次理解或回忆。'};
    let correct;
    if (exercise.kind === 'choice') {
      const choice = Array.isArray(exercise.choices) && exercise.choices.find(choice => choice.id === answer);
      if (!choice) return {...result, feedback: '请选择当前题目提供的一个选项。'};
      correct = answer === exercise.expectedChoiceId;
    } else if (exercise.kind === 'text') correct = normalizeAnswer(answer) === normalizeAnswer(expectedAnswer);
    else throw new Error('练习题型无效。');
    return {...result, correct, valid: true, feedback: correct ? '与词卡保存的答案一致。' : '与词卡保存的答案不一致，请核对后再练。'};
  }

  return Object.freeze({modes, availability, makeExercise, grade, normalizeAnswer});
});
