/* Shared by the browser and API: validate snapshots and merge independent edits. */
(function (root, factory) {
  const engine = typeof module === 'object' && module.exports ? require('./engine.js') : root.IELTS_ENGINE;
  const sync = factory(engine, root);
  if (typeof module === 'object' && module.exports) module.exports = sync;
  if (root) root.IELTS_SYNC = sync;
})(typeof window !== 'undefined' ? window : globalThis, function (E, runtime) {
  'use strict';

  const MAX_BYTES = 8000000;
  const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
  const STATE_KEYS = new Set(['schema', 'version', 'exportedAt', 'records', 'lastExcel', 'readingState', 'customLessons', 'preferences']);
  const DEFAULT_PREFERENCES = Object.freeze({examDate: null, dailyMinutes: 45,
    dailyNewLimit: 18, dailyReviewLimit: 20, cycleWeeks: 12});
  const EMPTY_READING = () => ({assignments: {}, results: {}, completed: {}, excluded: []});
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const jsonBytes = value => new TextEncoder().encode(value).length;
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  const object = (value, label) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label + '必须是对象');
  };
  function text(value, label, max = 100000) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) fail(label + '必须是有效文本');
  }
  function list(value, label, min, max) {
    if (!Array.isArray(value) || value.length < min || value.length > max) fail(label + '数量或格式无效');
  }
  function date(value, label) {
    if (!E.isDate(value)) fail(label + '必须是有效的 YYYY-MM-DD 日期');
  }
  function url(value, label) {
    text(value, label, 2000);
    let parsed;
    try { parsed = new URL(value); } catch (_) { fail(label + '无效'); }
    if (parsed.protocol !== 'https:' || !parsed.hostname) fail(label + '必须是 HTTPS 链接');
  }
  function bilingual(value, label) {
    object(value, label); text(value.en, label + '英文'); text(value.zh, label + '中文');
  }
  function identifier(value, label) {
    if (typeof value !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value)) fail(label + '无效');
  }
  function validatePreferences(input) {
    if (input === undefined) return {...DEFAULT_PREFERENCES};
    object(input, '学习偏好');
    if (Object.keys(input).some(key => !own(DEFAULT_PREFERENCES, key))) fail('学习偏好包含未知字段');
    const preferences = {...DEFAULT_PREFERENCES, ...input};
    if (preferences.examDate !== null) date(preferences.examDate, '考试日期');
    for (const [key, min, max] of [['dailyMinutes', 15, 180], ['dailyNewLimit', 5, 30],
      ['dailyReviewLimit', 5, 60], ['cycleWeeks', 4, 24]]) {
      if (!Number.isInteger(preferences[key]) || preferences[key] < min || preferences[key] > max) fail('学习偏好 ' + key + ' 超出范围');
    }
    return preferences;
  }

  // Reject non-JSON values and dangerous keys before any stringify or merge.
  function plainJSON(input) {
    let value = input;
    if (typeof input === 'string') {
      if (jsonBytes(input) > MAX_BYTES) fail('学习记录超过 8 MB');
      try { value = JSON.parse(input); } catch (_) { fail('学习记录不是有效 JSON'); }
    }
    const seen = new Set();
    let nodes = 0;
    function copy(item, depth) {
      if (++nodes > 500000 || depth > 40) fail('学习记录结构过大或嵌套过深');
      if (item === null || typeof item === 'boolean') return item;
      if (typeof item === 'string') {
        if (item.length > 100000) fail('学习记录文本过长');
        return item;
      }
      if (typeof item === 'number' && Number.isFinite(item)) return item;
      if (typeof item !== 'object' || !item) fail('学习记录包含非 JSON 数据');
      const proto = Object.getPrototypeOf(item);
      if (!Array.isArray(item) && proto !== Object.prototype && proto !== null) fail('学习记录必须是普通 JSON 对象');
      if (seen.has(item)) fail('学习记录不能包含循环引用');
      seen.add(item);
      const isArray = Array.isArray(item);
      const output = isArray ? [] : {};
      if (isArray && (item.length > 10000 || Object.keys(item).length !== item.length)) fail('学习记录数组过大或包含空项');
      for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
        if (isArray && key === 'length') continue;
        if (isArray && !/^(0|[1-9]\d*)$/.test(key)) fail('学习记录数组包含非 JSON 字段');
        if (FORBIDDEN_KEYS.has(key)) fail('学习记录包含不允许的字段');
        if (!own(descriptor, 'value')) fail('学习记录不能包含访问器');
        if (!descriptor.enumerable) fail('学习记录包含非 JSON 字段');
        output[key] = copy(descriptor.value, depth + 1);
      }
      seen.delete(item);
      return output;
    }
    const copied = copy(value, 0);
    if (jsonBytes(JSON.stringify(copied)) > MAX_BYTES) fail('学习记录超过 8 MB');
    return copied;
  }

  function validateArticle(article) {
    object(article, '原文');
    list(article.paragraphs, '原文段落', 3, 60);
    const ids = new Set();
    for (const paragraph of article.paragraphs) {
      object(paragraph, '原文段落');
      if (typeof paragraph.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(paragraph.id)
        || ids.has(paragraph.id)) fail('原文段落标识无效或重复');
      ids.add(paragraph.id);
      text(paragraph.text, '原文段落文本');
      if (/<\/?[a-z][^>]*>/i.test(paragraph.text)) fail('原文段落必须使用纯文本');
    }
    object(article.license, '原文授权');
    text(article.license.name, '授权名称'); url(article.license.url, '授权链接');
    if (!['public-domain', 'licensed'].includes(article.license.permission)) fail('原文授权状态无效');
    for (const key of ['author', 'titleZh']) if (article[key] !== undefined) text(article[key], '原文 ' + key);
    return ids;
  }

  function validateLocator(input, paragraphIds, label) {
    list(input, label, 0, 60);
    const seen = new Set();
    for (const locator of input) {
      const id = typeof locator === 'string' ? locator : locator && locator.paragraphId;
      if (typeof id !== 'string' || !paragraphIds.has(id)) fail(label + '引用了缺失的原文段落');
      if (typeof locator === 'object') {
        object(locator, label);
        if (locator.quote !== undefined) text(locator.quote, label + '引文');
      }
      const key = typeof locator === 'string' ? id : id + '\u0000' + (locator.quote || '');
      if (seen.has(key)) fail(label + '重复引用了同一项原文定位');
      seen.add(key);
    }
  }

  function validateLessons(lessons) {
    list(lessons, '自定义课程', 0, 500);
    const ids = new Set();
    for (const lesson of lessons) {
      object(lesson, '课程'); identifier(lesson.id, '课程标识');
      if (ids.has(lesson.id)) fail('自定义课程标识重复');
      ids.add(lesson.id);
      for (const key of ['title', 'source', 'topic', 'difficulty', 'focus']) text(lesson[key], '课程 ' + key);
      url(lesson.url, '原文链接'); date(lesson.published, '文章发布日期'); date(lesson.verified, '文章核实日期');
      if (lesson.published > lesson.verified) fail('文章核实日期不能早于发布日期');
      if (!Number.isFinite(lesson.minutes) || lesson.minutes <= 0 || lesson.minutes > 180) fail('首读时间无效');
      const paragraphIds = lesson.article === undefined ? new Set() : validateArticle(lesson.article);
      list(lesson.questions, '阅读题', 3, 5);
      const questionIds = new Set();
      for (const question of lesson.questions) {
        object(question, '阅读题'); identifier(question.id, '题目标识');
        if (questionIds.has(question.id)) fail('题目标识重复');
        questionIds.add(question.id);
        if (!['tfng', 'choice', 'fill'].includes(question.type)) fail('题型无效');
        for (const key of ['prompt', 'answer', 'translation', 'evidence', 'explanation', 'paraphrases', 'trap']) text(question[key], '题目 ' + key);
        if (Array.isArray(question.location)) validateLocator(question.location, paragraphIds, '题目原文定位');
        else text(question.location, '题目 location');
        if (question.evidenceParagraphIds !== undefined) {
          list(question.evidenceParagraphIds, '证据段落', 0, 60);
          if (question.evidenceParagraphIds.some(id => typeof id !== 'string')) fail('证据段落标识必须为文本');
          validateLocator(question.evidenceParagraphIds, paragraphIds, '证据段落');
        }
        if (question.locator !== undefined) validateLocator(question.locator, paragraphIds, '题目 locator');
        if (/[\u3400-\u9fff\uf900-\ufaff]/.test(question.prompt)) fail('题区题干必须仅使用英文');
        if (question.options !== undefined) {
          list(question.options, '题目选项', 2, 8);
          for (const option of question.options) {
            text(option, '题目选项');
            if (/[\u3400-\u9fff\uf900-\ufaff]/.test(option)) fail('题区选项必须仅使用英文');
          }
        }
        if (question.optionTranslations !== undefined) {
          list(question.optionTranslations, '选项中文翻译', 2, 8);
          question.optionTranslations.forEach(value => text(value, '选项中文翻译'));
          if (question.options && question.optionTranslations.length !== question.options.length) fail('选项与中文翻译数量不一致');
        }
        if (question.type === 'tfng' && (!question.options || question.options.join('|') !== 'TRUE|FALSE|NOT GIVEN'
          || !question.options.includes(question.answer))) fail('T/F/NG 选项或答案无效');
        if (question.type === 'choice' && (!question.options || !/^[A-H]$/.test(question.answer)
          || !question.options.some(option => option.startsWith(question.answer + '.')))) fail('选择题选项或答案无效');
      }
      for (const key of ['overview', 'structure', 'writing']) {
        list(lesson[key], key, 1, 30); lesson[key].forEach(value => bilingual(value, key));
      }
      bilingual(lesson.method, '方法与证据');
      list(lesson.sentences, '长难句', 2, 3);
      for (const sentence of lesson.sentences) {
        bilingual(sentence, '长难句'); text(sentence.tip, '长难句迁移技巧');
        list(sentence.parts, '长难句拆解', 1, 20); sentence.parts.forEach(value => text(value, '长难句拆解'));
        if (sentence.kind !== undefined) text(sentence.kind, '引用/改写标记');
      }
      list(lesson.words, '阅读词卡', 15, 20);
      const words = new Set();
      for (const word of lesson.words) {
        object(word, '阅读词卡');
        for (const key of ['word', 'ipa', 'meaning', 'pos', 'family', 'context', 'synonyms']) text(word[key], '词卡 ' + key);
        const normalized = E.normalizeWord(word.word);
        if (words.has(normalized)) fail('阅读课程包含重复词卡');
        words.add(normalized);
        list(word.collocations, '词卡搭配', 2, 10); word.collocations.forEach(value => bilingual(value, '词卡搭配'));
        bilingual(word.example, '词卡例句');
      }
      list(lesson.candidateWords, '候选词清单', 15, 20);
      const candidates = lesson.candidateWords.map(word => { text(word, '候选词', 200); return E.normalizeWord(word); });
      if (new Set(candidates).size !== candidates.length || candidates.length !== words.size
        || candidates.some(word => !words.has(word))) fail('候选词清单与详解词卡不一致');
      list(lesson.recall, '主动回忆', 1, 30);
      for (const recall of lesson.recall) {
        object(recall, '主动回忆'); text(recall.prompt, '主动回忆题目'); text(recall.answer, '主动回忆示范');
        if (!['teaching', 'recall', 'output'].includes(recall.phase)) fail('主动回忆阶段无效');
        if (recall.targetWords !== undefined) {
          list(recall.targetWords, '主动回忆目标词', 1, 20);
          recall.targetWords.forEach(word => text(word, '主动回忆目标词', 200));
        }
      }
    }
    return clone(lessons);
  }

  function validateState(input) {
    const data = plainJSON(input);
    object(data, '学习记录');
    if (Object.keys(data).some(key => !STATE_KEYS.has(key))) fail('学习记录包含未知顶层字段');
    date(data.lastExcel, '上次 Excel 日期');
    // Existing vocabulary validators check actual-answer evidence, contacts, errors and due dates.
    const backup = own(data, 'schema') || own(data, 'version') || own(data, 'exportedAt')
      ? E.validateBackup(data)
      : E.makeBackup(data.records, {lastExcel: data.lastExcel, readingState: data.readingState || EMPTY_READING()});
    for (const record of backup.records) {
      for (const key of ['family', 'synonyms', 'batch', 'displayWord', 'exampleEn', 'exampleZh']) {
        if (record[key] !== undefined && typeof record[key] !== 'string') fail('词汇 ' + key + ' 必须为文本');
      }
      record.originals.forEach(value => text(value, '原始拼写', 200));
      record.collocations.forEach(value => bilingual(value, '词汇搭配'));
      object(record.example, '词汇例句');
      if (typeof record.example.en !== 'string' || typeof record.example.zh !== 'string') fail('词汇例句必须是双语文本');
      if (record.repeatCount !== undefined && record.repeatCount !== record.repeats + 1) fail('词汇重现次数不一致');
      let previous = record.firstSeen;
      for (const review of record.reviewHistory) {
        if (review.date < previous) fail('复习事件必须按真实学习日期排列');
        previous = review.date;
      }
    }
    const customLessons = validateLessons(data.customLessons === undefined ? [] : data.customLessons);
    return {records: backup.records, lastExcel: backup.lastExcel,
      readingState: E.validateReadingState(backup.readingState || EMPTY_READING()), customLessons,
      preferences: validatePreferences(data.preferences)};
  }

  function serialize(input) {
    const state = validateState(input);
    return Object.assign(E.makeBackup(state.records, {lastExcel: state.lastExcel, readingState: state.readingState}),
      {customLessons: state.customLessons, preferences: state.preferences});
  }
  function canonical(value) {
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }
  // A collision-free canonical JSON fingerprint; exportedAt never changes progress equality.
  const fingerprint = input => canonical(validateState(input));
  const equal = (left, right) => canonical(left) === canonical(right);
  const hasChanges = (base, current) => base === null || base === undefined || fingerprint(base) !== fingerprint(current);

  function decideSync(baseInput, localInput, remoteInput, options) {
    const local = validateState(localInput);
    const base = baseInput == null ? null : validateState(baseInput);
    const remote = remoteInput == null ? null : validateState(remoteInput);
    const decision = (action, state, conflicts = []) => ({action, state: state && clone(state), conflicts});
    if (!remote) {
      if (!base) return decision('upload', local);
      return {...decision('conflict', null, [{path: 'cloud', reason: '已有同步基线，但云端记录缺失'}]), base, local, remote};
    }
    if (equal(local, remote)) return decision('unchanged', local);
    if (!base) return {...decision('conflict', null, [{path: 'initial', reason: '本机与云端已有不同记录，需选择首次同步方式'}]), base, local, remote};
    if (equal(local, base)) return decision('download', remote);
    if (equal(remote, base)) return decision('upload', local);

    const conflicts = [];
    function field(before, here, there, path) {
      if (equal(here, there)) return here;
      if (equal(here, before)) return there;
      if (equal(there, before)) return here;
      conflicts.push({path, reason: '两个设备都修改了同一项记录', base: before, local: here, remote: there});
      return before;
    }
    function map(before, here, there, path) {
      const output = {};
      for (const key of new Set([...Object.keys(before), ...Object.keys(here), ...Object.keys(there)])) {
        const value = field(before[key], here[key], there[key], path + '.' + key);
        if (value !== undefined) output[key] = value;
      }
      return output;
    }
    function entries(before, here, there, path) {
      const toMap = array => Object.fromEntries(array.map(item => [item.id, item]));
      return Object.values(map(toMap(before), toMap(here), toMap(there), path));
    }
    function excluded(before, here, there) {
      const output = [];
      for (const value of new Set([...before, ...here, ...there])) {
        if (field(before.includes(value), here.includes(value), there.includes(value), 'readingState.excluded.' + value)) output.push(value);
      }
      return output;
    }
    const merged = {
      records: entries(base.records, local.records, remote.records, 'records'),
      lastExcel: field(base.lastExcel, local.lastExcel, remote.lastExcel, 'lastExcel'),
      readingState: {
        assignments: map(base.readingState.assignments, local.readingState.assignments, remote.readingState.assignments, 'readingState.assignments'),
        results: map(base.readingState.results, local.readingState.results, remote.readingState.results, 'readingState.results'),
        completed: map(base.readingState.completed, local.readingState.completed, remote.readingState.completed, 'readingState.completed'),
        excluded: excluded(base.readingState.excluded, local.readingState.excluded, remote.readingState.excluded)
      },
      // Lesson order affects recommendations, so the collection is deliberately atomic.
      customLessons: field(base.customLessons, local.customLessons, remote.customLessons, 'customLessons'),
      preferences: field(base.preferences, local.preferences, remote.preferences, 'preferences')
    };
    // Recommendations and exclusions have meaning across keys, not just within a date key.
    const localAssignments = Object.entries(local.readingState.assignments)
      .filter(([day, id]) => base.readingState.assignments[day] !== id);
    const remoteAssignments = Object.entries(remote.readingState.assignments)
      .filter(([day, id]) => base.readingState.assignments[day] !== id);
    const repeated = new Set();
    for (const [localDate, localId] of localAssignments) {
      if (remoteAssignments.some(([remoteDate, remoteId]) => remoteDate !== localDate && remoteId === localId)) repeated.add(localId);
    }
    for (const id of repeated) conflicts.push({path: 'readingState.assignments.' + id,
      reason: '两个设备在不同日期推荐了同一篇文章，需选择保留的推荐日期'});
    const catalog = [...((options && options.lessons) || (runtime && runtime.READING_LESSONS) || []), ...merged.customLessons];
    const lessonUrls = new Map(catalog.map(lesson => [lesson.id, lesson.url]));
    function checkExclusions(changedAssignments, changedExclusions) {
      for (const [day, id] of changedAssignments) {
        if (changedExclusions.includes(lessonUrls.get(id))) conflicts.push({path: 'readingState.assignments.' + day,
          reason: '一个设备推荐的文章被另一个设备同时加入了排除清单'});
      }
    }
    checkExclusions(remoteAssignments, local.readingState.excluded.filter(url => !base.readingState.excluded.includes(url)));
    checkExclusions(localAssignments, remote.readingState.excluded.filter(url => !base.readingState.excluded.includes(url)));
    if (conflicts.length) return {...decision('conflict', null, conflicts), base, local, remote};
    // Never replay concurrent answers or synthesize contacts/mastery. Whole word records are atomic.
    const valid = validateState(merged);
    return decision(equal(valid, remote) ? 'download' : equal(valid, local) ? 'upload' : 'merge', valid);
  }

  return {MAX_BYTES, DEFAULT_PREFERENCES, validatePreferences, validateState, validateLessons,
    serialize, parse: validateState, fingerprint, hasChanges, decideSync};
});
