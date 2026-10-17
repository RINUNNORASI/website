/* Small, explicit practice groups. This module never changes learning records or dates. */
(function (host, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (host) host.IELTS_PRACTICE_BATCHES = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const DEFAULT_GROUP_SIZE = 6, MAX_GROUP_SIZE = 8;
  const STAGES = ['repair', 'recall', 'learn'];
  const LABELS = {repair:'优先修复', recall:'到期回忆', learn:'新词理解'};
  const history = record => Array.isArray(record.reviewHistory) ? record.reviewHistory : [];
  const confirmed = (record, date) => history(record).some(event => event.date === date);
  const source = record => record.batch || record.origins?.[0]?.batch || '自主提交';
  const hash = value => {
    let code = 2166136261;
    for (let index = 0; index < value.length; index++) code = Math.imul(code ^ value.charCodeAt(index), 16777619);
    return (code >>> 0).toString(36);
  };
  function stageOf(record, E) {
    if (E.hasError(record)) return 'repair';
    return history(record).length ? 'recall' : 'learn';
  }
  function mixSources(records, date, E) {
    // Preserve due-day priority; avoid presenting each import as one predictable block.
    // Source labels are provenance only, never inferred semantic topics or difficulty.
    const days = new Map();
    for (const record of records) {
      const day = E.dueDate(record);
      if (!days.has(day)) days.set(day, []);
      days.get(day).push(record);
    }
    const ordered = [];
    for (const day of [...days.keys()].sort()) {
      const buckets = new Map();
      for (const record of days.get(day)) {
        const key = source(record);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(record);
      }
      const keys = [...buckets.keys()].sort((a, b) => hash(date + a).localeCompare(hash(date + b)) || a.localeCompare(b));
      for (const bucket of buckets.values()) bucket.sort((a, b) => hash(date + a.id).localeCompare(hash(date + b.id)) || a.id.localeCompare(b.id));
      let remaining = true;
      while (remaining) {
        remaining = false;
        for (const key of keys) {
          const next = buckets.get(key).shift();
          if (next) { ordered.push(next); remaining = true; }
        }
      }
    }
    return ordered;
  }
  function build(records, date, preferences, E, options) {
    if (!Array.isArray(records)) throw new Error('练习分组需要个人词库。');
    if (!E || ['studyQueue', 'due', 'dueDate', 'hasError'].some(name => typeof E[name] !== 'function')) throw new Error('练习安排尚未准备好。');
    const p = preferences || {}, opts = options || {};
    const groupSize = Number.isInteger(opts.groupSize) && opts.groupSize > 0 ? Math.min(MAX_GROUP_SIZE, opts.groupSize) : DEFAULT_GROUP_SIZE;
    const unique = [], seen = new Set();
    for (const record of records) {
      if (!record || typeof record.id !== 'string' || !record.id || seen.has(record.id)) continue;
      seen.add(record.id); unique.push(record);
    }
    const due = E.due(unique, date).filter(record => !confirmed(record, date));
    const pending = due.filter(record => !record.needsContent);
    const readyIds = new Set(pending.map(record => record.id));
    // Keep all records here: the engine counts new words already introduced today.
    // One shared pool also prevents picking another group from bypassing that limit.
    const pool = E.studyQueue(unique, date, p, [...readyIds]).filter(record => readyIds.has(record.id));
    const poolIds = new Set(pool.map(record => record.id)), groups = [];
    const counts = {dueTotal:due.length, planned:pool.length, backlog:pending.length - pool.length,
      completedToday:unique.filter(record => record.level !== 'C' && confirmed(record, date)).length,
      needsContent:due.length - pending.length, repair:0, recall:0, learn:0, deferredNew:0, nextSession:0};
    const startedToday = unique.filter(record => history(record).length
      && history(record).every(event => event.date >= date) && confirmed(record, date)).length;
    const newLimit = p.dailyNewLimit || 18, sessionLimit = p.dailyReviewLimit || 20;
    const newRemaining = Math.max(0, newLimit - startedToday);
    counts.deferredNew = Math.max(0, pending.filter(record => !history(record).length).length - newRemaining);
    counts.nextSession = Math.max(0, counts.backlog - counts.deferredNew);
    for (const stage of STAGES) {
      const members = mixSources(pool.filter(record => stageOf(record, E) === stage), date, E);
      counts[stage] = members.length;
      for (let offset = 0; offset < members.length; offset += groupSize) {
        const words = members.slice(offset, offset + groupSize), recordIds = words.map(record => record.id);
        const number = Math.floor(offset / groupSize) + 1;
        const reason = stage === 'repair' ? `${words.length} 个词仍有未解决的错误；先看清差异，再主动回忆。`
          : stage === 'recall' ? `${words.length} 个学过的词已经到期；先不看答案，尝试回忆。`
          : `${words.length} 个词尚无学习确认；先理解词义、搭配和例句。`;
        groups.push({id:'practice-group-' + hash(date + '|' + stage + '|' + recordIds.join('|')),
          label:LABELS[stage] + ' · 第 ' + number + ' 组', stage, recordIds, count:words.length, reason,
          counts:{repair:stage === 'repair' ? words.length : 0, recall:stage === 'recall' ? words.length : 0, learn:stage === 'learn' ? words.length : 0},
          suggestedMode:stage === 'recall' ? 'flashcard' : 'guided',
          overdueCount:words.filter(record => E.dueDate(record) < date).length,
          sourceCount:new Set(words.map(source)).size});
      }
    }
    return {groups, queueIds:groups.flatMap(group => group.recordIds), groupSize, counts,
      needsContentIds:due.filter(record => record.needsContent).map(record => record.id),
      backlogIds:pending.filter(record => !poolIds.has(record.id)).map(record => record.id),
      policy:{order:STAGES.slice(), maxGroupSize:MAX_GROUP_SIZE, newLimit, sessionLimit,
        sourceMixing:true, spacing:'existing-schedule'}};
  }
  return Object.freeze({build, DEFAULT_GROUP_SIZE, MAX_GROUP_SIZE});
});
