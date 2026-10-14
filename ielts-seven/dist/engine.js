(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  if (root) root.IELTS_ENGINE = engine;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const SCHEDULE = Object.freeze([1, 3, 7, 14, 30]);
  const LEVELS = ['A', 'B', 'C'];
  const STATUSES = ['unconfirmed', 'studied', 'correct-once', 'needs-review'];
  const CORRECTIONS = Object.freeze({
    stratosphenic: 'stratospheric',
    'drought(s)': 'drought', droughts: 'drought',
    spearheaded: 'spearhead', 'spearhead/spearheaded': 'spearhead',
    facilitated: 'facilitate', 'facilitate/facilitated': 'facilitate',
    residents: 'resident', utilities: 'utility', lawns: 'lawn', hectares: 'hectare',
    millennia: 'millennium', strata: 'stratum', dams: 'dam', animations: 'animation'
  });
  const B_TERMS = new Set(['planetary boundaries', 'acidification', 'biosphere', 'biogeochemical',
    'stratospheric', 'ozone', 'diagnosis', 'patchwork', 'below-average', 'shortgrass', 'prairie',
    'dams', 'animations', 'district', 'excavate', 'specimen', 'lineage', 'thinning',
    'carbon storage', 'anthropogenic', 'municipal-level', 'swelter', 'asphalt', 'lawns',
    'landsat', 'hectares', 'millennia', 'strata', 'barista', 'artisanal'].map(word => CORRECTIONS[word] || word));

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function isDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T12:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  function requireDate(value, name) {
    if (!isDate(value)) throw new Error((name || '日期') + '必须是有效的 YYYY-MM-DD 日期');
    return value;
  }
  function today(now) {
    const date = now === undefined ? new Date() : new Date(now);
    if (!Number.isFinite(date.getTime())) throw new Error('无法识别当前时间');
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return values.year + '-' + values.month + '-' + values.day;
  }
  function addDays(date, days) {
    requireDate(date);
    if (!Number.isInteger(days)) throw new Error('天数必须为整数');
    const parsed = new Date(date + 'T12:00:00Z');
    parsed.setUTCDate(parsed.getUTCDate() + days);
    return parsed.toISOString().slice(0, 10);
  }
  function dayDiff(from, to) {
    requireDate(from); requireDate(to);
    return Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000);
  }
  function normalizeWord(word) {
    if (typeof word !== 'string') throw new Error('词汇必须为文本');
    const clean = word.trim().replace(/^[-*•]\s*/, '').replace(/^\d+[.)、]\s*/, '')
      .replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    return CORRECTIONS[clean] || clean;
  }
  function idFor(word) { return 'word-' + encodeURIComponent(word); }
  function textOf(value) { return typeof value === 'string' ? value : ''; }
  function unique(array) { return [...new Set(array)]; }
  function asEntries(input) {
    if (!Array.isArray(input)) throw new Error('词库输入必须为数组');
    return input.flatMap(item => {
      if (typeof item === 'string') return [{word: item, firstSeen: today(), level: 'A'}];
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('词库条目格式错误');
      if (item.word) return [item];
      if (item.date && (item.A || item.B || item.C)) {
        return LEVELS.flatMap(level => (item[level] || []).map(word => Object.assign(
          {}, typeof word === 'string' ? {word} : word,
          {level, firstSeen: item.date, batch: item.label || item.batch || item.date}
        )));
      }
      throw new Error('词库条目缺少 word');
    });
  }
  function makeRecord(data) {
    const word = normalizeWord(data.word);
    if (!word || word.length > 200) throw new Error('词汇为空或过长');
    const firstSeen = requireDate(data.firstSeen || data.date || today(), '首次学习日期');
    const level = data.level || 'A';
    if (!LEVELS.includes(level)) throw new Error('词汇分类必须是 A/B/C');
    const example = data.example && typeof data.example === 'object' ? clone(data.example) : {
      en: textOf(data.exampleEn), zh: textOf(data.exampleZh)
    };
    const origins = Array.isArray(data.origins) ? clone(data.origins) : [{
      date: firstSeen, batch: data.batch || '自主提交', original: data.word
    }];
    const repeats = Number.isInteger(data.repeatCount) ? Math.max(0, data.repeatCount - 1)
      : (Number.isInteger(data.repeats) ? Math.max(0, data.repeats) : 0);
    return Object.assign({}, clone(data), {
      id: idFor(word), word, displayWord: word === 'landsat' ? 'Landsat' : word,
      originals: unique([data.word, ...(data.originals || []), ...origins.map(x => x.original).filter(Boolean)]),
      level, firstSeen, batch: data.batch || '自主提交',
      ipa: textOf(data.ipa), meaning: textOf(data.meaning), pos: textOf(data.pos),
      family: data.family || '', memory: textOf(data.memory), notes: textOf(data.notes),
      collocations: Array.isArray(data.collocations) ? clone(data.collocations) : [],
      synonyms: data.synonyms || '', example, exampleEn: textOf(example.en), exampleZh: textOf(example.zh),
      contacts: 1, contactDates: [firstSeen], reviewHistory: [], status: 'unconfirmed',
      lastReview: null, nextReview: level === 'C' ? null : addDays(firstSeen, 1),
      errors: [], extraReviews: [], forceTeaching: false, forceTeachingSince: null,
      repeats, repeatCount: repeats + 1, origins,
      needsContent: Boolean(data.needsContent || !data.ipa || !data.meaning)
    });
  }
  function mergeAppearance(record, data, date, batch) {
    const next = clone(record);
    next.originals = unique([...(next.originals || []), data.original || data.word]);
    next.origins = [...(next.origins || []), {
      date, batch: batch || data.batch || '自主提交', original: data.original || data.word, ...(data.source?{source:clone(data.source)}:{})
    }];
    next.repeats = (next.repeats || 0) + 1;
    next.repeatCount = next.repeats + 1;
    return next;
  }
  function seed(history, fresh) {
    const map = new Map();
    for (const data of asEntries(history || []).concat(asEntries(fresh || []))) {
      const candidate = makeRecord(data);
      const existing = map.get(candidate.word);
      if (!existing) { map.set(candidate.word, candidate); continue; }
      let merged = mergeAppearance(existing, data, candidate.firstSeen, data.batch);
      for (const field of ['ipa', 'meaning', 'pos', 'family', 'memory', 'collocations', 'synonyms', 'example', 'notes']) {
        if (!merged[field] || (Array.isArray(merged[field]) && !merged[field].length)) merged[field] = clone(candidate[field]);
      }
      if (candidate.firstSeen < merged.firstSeen) {
        merged.firstSeen = candidate.firstSeen; merged.batch = candidate.batch;
        merged.contactDates = [candidate.firstSeen];
        merged.nextReview = merged.level === 'C' ? null : addDays(candidate.firstSeen, 1);
      }
      if (candidate.level === 'A') merged.level = 'A';
      merged.needsContent = !merged.ipa || !merged.meaning;
      merged.exampleEn = textOf(merged.example.en); merged.exampleZh = textOf(merged.example.zh);
      map.set(candidate.word, merged);
    }
    return [...map.values()];
  }
  function mode(record) {
    if (record.level === 'B') return 'teaching';
    if (record.forceTeaching || record.contacts < 2) return 'teaching';
    if (record.contacts === 2) return 'hinted';
    return 'context';
  }
  function hasError(record) { return Boolean((record.errors || []).some(error => !error.resolved)); }
  function dueDate(record) {
    const dates = [record.nextReview, ...(record.extraReviews || [])].filter(isDate);
    return dates.length ? dates.sort()[0] : null;
  }
  function due(records, date) {
    requireDate(date || (date = today()));
    return records.filter(record => record.level !== 'C' && dueDate(record) && dueDate(record) <= date)
      .slice().sort((a, b) => Number(hasError(b)) - Number(hasError(a))
        || (b.repeats || 0) - (a.repeats || 0)
        || LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level)
        || dueDate(a).localeCompare(dueDate(b)) || a.word.localeCompare(b.word));
  }
  function nextScheduled(record, date) {
    const future = SCHEDULE.map(day => addDays(record.firstSeen, day)).filter(day => day > date);
    return future.length ? future[0] : null;
  }
  function setLevel(record, level) {
    if (!LEVELS.includes(level)) throw new Error('词汇分类必须是 A/B/C');
    const next = clone(record);
    next.level = level;
    const scheduled = nextScheduled(next, next.lastReview || next.firstSeen);
    next.nextReview = level === 'C' ? null : [scheduled, ...(next.extraReviews || [])].filter(Boolean).sort()[0] || null;
    return next;
  }
  function review(record, action) {
    if (!action || !['studied', 'correct', 'wrong'].includes(action.kind)) throw new Error('无效的学习确认');
    const date = requireDate(action.date || today());
    if (date < record.firstSeen || (record.lastReview && date < record.lastReview)) throw new Error('复习日期不能早于词汇记录');
    const answer = typeof action.answer === 'string' ? action.answer.trim() : '';
    if (action.kind !== 'studied' && !answer) throw new Error('必须有明确作答才能标记对错');
    const next = clone(record);
    next.contactDates = unique(next.contactDates || [next.firstSeen]);
    if (!next.contactDates.includes(date)) next.contactDates.push(date);
    next.contactDates.sort(); next.contacts = next.contactDates.length;
    next.lastReview = date;
    next.reviewHistory = [...(next.reviewHistory || []), {date, kind: action.kind, ...(answer ? {answer} : {})}];
    next.extraReviews = unique((next.extraReviews || []).filter(day => day > date));
    if (action.kind === 'wrong') {
      next.status = 'needs-review'; next.forceTeaching = true; next.forceTeachingSince = date;
      next.errors = [...(next.errors || []), {date, answer, resolved: false}];
      next.extraReviews = unique(next.extraReviews.concat([addDays(date, 1), addDays(date, 3)])).sort();
    } else if (action.kind === 'correct') {
      next.status = 'correct-once';
      next.errors = (next.errors || []).map(error => error.resolved ? error : Object.assign({}, error, {resolved: true, resolvedOn: date}));
    } else {
      next.status = hasError(next) ? 'needs-review' : 'studied';
      next.forceTeaching = false; next.forceTeachingSince = null;
    }
    const scheduled = next.level === 'C' ? null : nextScheduled(next, date);
    const dates = [scheduled, ...next.extraReviews].filter(Boolean).sort();
    next.nextReview = next.level === 'C' ? null : (dates[0] || null);
    return next;
  }
  function stageIntake(text, records, candidates) {
    if (typeof text !== 'string') throw new Error('请按一行一个词或短语输入');
    const known = new Map((records || []).map(record => [normalizeWord(record.word), record]));
    const candidateMap = new Map((candidates || []).map(candidate => {
      const data = typeof candidate === 'string' ? {word: candidate} : candidate;
      return [normalizeWord(data.word), data];
    }));
    const items = [], duplicates = [], corrections = [], ignored = [], seen = new Set();
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const trimmed = line.trim().replace(/^[-*•]\s*/, '').replace(/^\d+[.)、]\s*/, '').trim();
      if (/^```/.test(trimmed) || /^day\s*\d+/i.test(trimmed)
        || /^candidate\s+(?:words?|vocabulary)\s*[:：]/i.test(trimmed)
        || /[\u3400-\u9fff\uf900-\ufaff]/.test(trimmed) || !/[a-z]/i.test(trimmed)) {
        ignored.push({original: line.trim(), reason: '清单说明、代码块标记或非英语词汇行已跳过'});
        continue;
      }
      const entries = /^exacerbate\s+swelter$/i.test(trimmed) ? trimmed.split(/\s+/) : [trimmed];
      if (entries.length > 1) corrections.push({original: trimmed, word: 'exacerbate + swelter', reason: '两个词已拆分'});
      for (const original of entries) {
        const word = normalizeWord(original);
        if (!word || word.length > 200) continue;
        if (seen.has(word)) { duplicates.push({word, original, reason: '本次输入重复'}); continue; }
        seen.add(word);
        const correction = word !== original.trim().toLowerCase() ? word : null;
        if (correction) corrections.push({original, word, reason: '拼写或词形合并'});
        const existing = known.get(word) || null;
        const knownData = existing || candidateMap.get(word) || null;
        items.push({word, original, existing: Boolean(existing), existingId: existing && existing.id,
          correction, levelSuggested: (knownData && knownData.level) || (B_TERMS.has(word) ? 'B' : 'A'),
          knownData: knownData ? clone(knownData) : null,
          requiresConfirmation: true, needsContent: !knownData || !knownData.ipa || !knownData.meaning});
      }
    }
    return {items, duplicates, corrections, ignored};
  }
  function confirmIntake(items, records, options) {
    if (!Array.isArray(items) || !Array.isArray(records)) throw new Error('确认词汇的格式错误');
    const opts = options || {}, date = requireDate(opts.date || today()), batch = opts.batch || '自主提交';
    const output = records.map(clone), indices = new Map(output.map((record, index) => [normalizeWord(record.word), index]));
    for (const item of items) {
      if (item.confirmed === false || item.selected === false) continue;
      const word = normalizeWord(item.word);
      if (!word) continue;
      if (indices.has(word)) {
        const index = indices.get(word);
        const merged = mergeAppearance(output[index], item, date, batch);
        output[index] = item.level !== undefined ? setLevel(merged, item.level) : merged;
        continue;
      }
      const level = item.level || item.levelSuggested || 'A';
      if (!LEVELS.includes(level)) throw new Error('请确认 A/B/C 分类');
      const content = item.knownData ? clone(item.knownData) : {};
      const record = makeRecord(Object.assign(content, {word, originals: [item.original || word], level,
        firstSeen: date, batch, origins: [{date, batch, original: item.original || word, ...(item.source?{source:clone(item.source)}:{})}],
        repeatCount: 1, notes: content.notes || (item.correction ? '原输入：' + item.original : '')}));
      indices.set(word, output.length); output.push(record);
    }
    return output;
  }
  function validateRecord(record, index) {
    const prefix = '第 ' + (index + 1) + ' 条记录：';
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error(prefix + '记录格式错误');
    if (typeof record.word !== 'string' || !record.word.trim() || record.word.length > 200) throw new Error(prefix + '词汇无效');
    if (record.word !== normalizeWord(record.word) || record.id !== idFor(record.word)) throw new Error(prefix + '词汇标识不一致');
    if (!LEVELS.includes(record.level) || !STATUSES.includes(record.status)) throw new Error(prefix + '分类或状态无效');
    requireDate(record.firstSeen, prefix + '首次学习日期');
    for (const field of ['lastReview', 'nextReview', 'forceTeachingSince']) {
      if (record[field] !== null && record[field] !== undefined) requireDate(record[field], prefix + field);
    }
    if (!Number.isInteger(record.contacts) || record.contacts < 1 || record.contacts > 10000) throw new Error(prefix + '接触次数无效');
    for (const field of ['originals', 'origins', 'collocations', 'contactDates', 'reviewHistory', 'errors', 'extraReviews']) {
      if (!Array.isArray(record[field]) || record[field].length > 10000) throw new Error(prefix + field + ' 必须为数组');
    }
    if (unique(record.contactDates).length !== record.contacts || record.contactDates.length !== record.contacts
      || !record.contactDates.includes(record.firstSeen)) throw new Error(prefix + '接触次数与日期不一致');
    for (const date of [...record.contactDates, ...record.extraReviews]) {
      requireDate(date, prefix + '复习日期'); if (date < record.firstSeen) throw new Error(prefix + '复习早于首次学习');
    }
    if (record.lastReview && record.lastReview < record.firstSeen) throw new Error(prefix + '最近复习日期无效');
    if (!Number.isInteger(record.repeats) || record.repeats < 0 || typeof record.forceTeaching !== 'boolean') throw new Error(prefix + '优先级或教学状态无效');
    for (const field of ['ipa', 'meaning', 'pos', 'memory', 'notes']) if (typeof record[field] !== 'string') throw new Error(prefix + field + ' 必须为文本');
    if (typeof record.needsContent !== 'boolean') throw new Error(prefix + 'needsContent 无效');
    for (const origin of record.origins) {
      if (!origin || typeof origin !== 'object') throw new Error(prefix + '词源记录无效');
      requireDate(origin.date, prefix + '词源日期');
      if (typeof origin.original !== 'string' || typeof origin.batch !== 'string') throw new Error(prefix + '词源文本无效');
    }
    for (const review of record.reviewHistory) {
      if (!review || !['studied', 'correct', 'wrong'].includes(review.kind)) throw new Error(prefix + '复习记录无效');
      requireDate(review.date, prefix + '复习日期');
      if (!record.contactDates.includes(review.date)) throw new Error(prefix + '复习记录缺少接触日期');
      if (review.kind !== 'studied' && (typeof review.answer !== 'string' || !review.answer.trim())) throw new Error(prefix + '对错标记缺少实际作答');
    }
    for (const error of record.errors) {
      if (!error || typeof error.answer !== 'string' || !error.answer.trim() || typeof error.resolved !== 'boolean') throw new Error(prefix + '错词记录无效');
      requireDate(error.date, prefix + '错词日期');
      if (error.resolvedOn) requireDate(error.resolvedOn, prefix + '订正日期');
    }
    const reviewedDates = unique(record.reviewHistory.map(review => review.date)).sort();
    if (record.contactDates.some(date => date !== record.firstSeen && !reviewedDates.includes(date))) {
      throw new Error(prefix + '接触日期缺少真实学习记录');
    }
    const latestDate = reviewedDates.length ? reviewedDates[reviewedDates.length - 1] : null;
    if ((record.lastReview || null) !== latestDate) throw new Error(prefix + '最近复习日期与记录不一致');
    if (!record.reviewHistory.length) {
      if (record.status !== 'unconfirmed' || record.errors.length || record.forceTeaching) throw new Error(prefix + '未作答不能虚构学习状态');
    } else {
      const lastEvent = record.reviewHistory[record.reviewHistory.length - 1];
      if (lastEvent.date !== latestDate) throw new Error(prefix + '复习记录顺序错误');
      const expectedStatus = lastEvent.kind === 'wrong' ? 'needs-review' : lastEvent.kind === 'correct'
        ? 'correct-once' : hasError(record) ? 'needs-review' : 'studied';
      if (record.status !== expectedStatus) throw new Error(prefix + '学习状态缺少实际作答依据');
    }
    for (const error of record.errors) {
      if (!record.reviewHistory.some(review => review.kind === 'wrong' && review.date === error.date && review.answer === error.answer)) {
        throw new Error(prefix + '错误标记缺少真实作答记录');
      }
      if (error.resolved && (!error.resolvedOn || error.resolvedOn < error.date
        || !record.reviewHistory.some(review => review.kind === 'correct' && review.date === error.resolvedOn))) {
        throw new Error(prefix + '订正状态缺少真实作答记录');
      }
    }
    if (record.forceTeaching && (!record.forceTeachingSince || !record.errors.some(error => error.date === record.forceTeachingSince))) {
      throw new Error(prefix + '重新教学缺少错误依据');
    }
    if (record.extraReviews.some(date => latestDate && date <= latestDate)) throw new Error(prefix + '额外复习日期过期');
    if (record.extraReviews.some(date => !record.errors.some(error => date === addDays(error.date, 1) || date === addDays(error.date, 3)))) {
      throw new Error(prefix + '额外复习缺少错词依据');
    }
    const expectedNext = record.level === 'C' ? null : latestDate
      ? [nextScheduled(record, latestDate), ...record.extraReviews].filter(Boolean).sort()[0] || null
      : addDays(record.firstSeen, 1);
    if ((record.nextReview || null) !== expectedNext) throw new Error(prefix + '下一复习日期与计划不一致');
    return clone(record);
  }
  function validateBackup(input) {
    let data;
    try { data = typeof input === 'string' ? JSON.parse(input) : clone(input); }
    catch (_) { throw new Error('备份不是有效 JSON'); }
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.schema !== 'ielts-seven' || data.version !== 1) throw new Error('备份格式或版本不兼容');
    if (!Array.isArray(data.records) || data.records.length > 10000) throw new Error('备份词库必须是数组且不超过 10000 条');
    if (typeof data.exportedAt !== 'string' || !Number.isFinite(Date.parse(data.exportedAt))) throw new Error('备份导出时间无效');
    requireDate(data.lastExcel, '上次 Excel 日期');
    const records = data.records.map(validateRecord), words = new Set(), ids = new Set();
    for (const record of records) {
      if (words.has(record.word) || ids.has(record.id)) throw new Error('备份含重复词汇');
      words.add(record.word); ids.add(record.id);
    }
    data.records = records;
    if (data.readingState !== undefined) data.readingState = validateReadingState(data.readingState);
    return data;
  }
  function validateReadingState(input) {
    const plainObject = value => value && typeof value === 'object' && !Array.isArray(value);
    if (!plainObject(input) || !['assignments', 'results', 'completed'].every(key => plainObject(input[key]))
      || !Array.isArray(input.excluded)) throw new Error('阅读进度结构无效');
    if (Object.keys(input.assignments).length > 10000 || Object.keys(input.results).length > 10000
      || Object.keys(input.completed).length > 10000 || input.excluded.length > 10000) throw new Error('阅读进度过大');
    for (const [date, id] of Object.entries(input.assignments)) {
      requireDate(date, '阅读推荐日期');
      if (typeof id !== 'string' || !id.trim() || id.length > 200) throw new Error('阅读课程标识无效');
    }
    for (const [id, date] of Object.entries(input.completed)) {
      if (!id.trim() || id.length > 200) throw new Error('已完成课程标识无效');
      requireDate(date, '阅读完成日期');
    }
    for (const url of input.excluded) {
      if (typeof url !== 'string' || url.length > 2000) throw new Error('历史文章链接无效');
      let parsed;
      try { parsed = new URL(url); } catch (_) { throw new Error('历史文章链接无效'); }
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('历史文章链接无效');
    }
    for (const [key, result] of Object.entries(input.results)) {
      if (!plainObject(result) || !plainObject(result.answers) || typeof result.lessonId !== 'string'
        || !result.lessonId.trim() || result.lessonId.length > 200 || typeof result.submittedAt !== 'string'
        || !Number.isFinite(Date.parse(result.submittedAt))) throw new Error('阅读作答记录无效');
      requireDate(result.date, '阅读作答日期');
      if (key !== result.date + '|' + result.lessonId || !Object.keys(result.answers).length
        || Object.keys(result.answers).length > 100) throw new Error('阅读作答标识无效');
      if (Object.values(result.answers).some(answer => typeof answer !== 'string' || !answer.trim() || answer.length > 10000)) {
        throw new Error('阅读成绩缺少明确作答');
      }
    }
    return clone(input);
  }
  function makeBackup(records, options) {
    const opts = options || {};
    return validateBackup({schema: 'ielts-seven', version: 1, exportedAt: new Date().toISOString(),
      records, lastExcel: opts.lastExcel || today(), ...(opts.readingState !== undefined ? {readingState: clone(opts.readingState)} : {})});
  }
  function exportEligible(records, lastExcel, date) {
    date = requireDate(date || today()); requireDate(lastExcel, '上次 Excel 日期');
    const days = dayDiff(lastExcel, date), newCount = records.filter(record => record.level !== 'C' && record.firstSeen > lastExcel && record.firstSeen <= date).length;
    const allowed = days >= 5 && newCount >= 5;
    return {allowed, days, newCount, reason: days < 5 ? '距离上次整理未满 5 天，推荐每 7 天整理一次。'
      : newCount < 5 ? '新增词汇少于 5 个，积累足够新增后再整理。' : '可整理 A/B 词库；推荐每 7 天整理一次。'};
  }
  return {today, isDate, addDays, dayDiff, normalizeWord, seed, mode, hasError, due, dueDate,
    stageIntake, confirmIntake, review, setLevel, validateReadingState, validateBackup, makeBackup, exportEligible, SCHEDULE};
});
