// Preview only: callers must verify that both stores belong to the same account,
// preserve the original snapshots, and use revision checks before saving a result.
// A record is atomic. Recovery never replays answers or synthesizes learning events.
export function previewAccountRecovery(legacyInput, remoteInput, options = {}) {
  const sync = options.sync || globalThis.IELTS_SYNC;
  const engine = options.engine || globalThis.IELTS_ENGINE;
  if (!sync || typeof sync.validateState !== 'function' || typeof sync.fingerprint !== 'function'
    || !engine || typeof engine.normalizeWord !== 'function') {
    throw new Error('Account recovery requires the learning-state validators');
  }
  const legacy = legacyInput == null ? null : sync.validateState(legacyInput);
  const remote = remoteInput == null ? null : sync.validateState(remoteInput);
  const clone = value => JSON.parse(JSON.stringify(value));
  const canonical = value => {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
      .map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
    return JSON.stringify(value);
  };
  const equal = (left, right) => canonical(left) === canonical(right);
  const conflicts = [];
  const summary = {
    legacyWords: legacy?.records.length || 0, remoteWords: remote?.records.length || 0,
    candidateWords: 0, addedWords: 0, identicalWords: 0, conflictingWords: 0,
    addedReadingAssignments: 0, addedReadingResults: 0, addedReadingCompletions: 0,
    addedReadingExclusions: 0, addedLessons: 0, conflictCount: 0,
  };
  const conflict = (path, reason) => conflicts.push({path, reason, kept: 'remote'});

  if (!legacy) {
    summary.candidateWords = remote?.records.length || 0;
    return {state: remote && clone(remote), conflicts, summary, changed: false};
  }

  if (!remote) {
    summary.candidateWords = summary.addedWords = legacy.records.length;
    summary.addedReadingAssignments = Object.keys(legacy.readingState.assignments).length;
    summary.addedReadingResults = Object.keys(legacy.readingState.results).length;
    summary.addedReadingCompletions = Object.keys(legacy.readingState.completed).length;
    summary.addedReadingExclusions = legacy.readingState.excluded.length;
    summary.addedLessons = legacy.customLessons.length;
    return {state: clone(legacy), conflicts, summary, changed: true};
  }

  const state = clone(remote);
  const records = new Map(state.records.map(record => [engine.normalizeWord(record.word), record]));
  for (const record of legacy.records) {
    const key = engine.normalizeWord(record.word);
    if (!records.has(key)) {
      const added = clone(record);
      state.records.push(added); records.set(key, added); summary.addedWords++;
    } else if (equal(records.get(key), record)) summary.identicalWords++;
    else {
      summary.conflictingWords++;
      conflict('records.' + record.id, 'The same word has different saved data; review the preserved legacy backup.');
    }
  }

  const lessons = new Map(state.customLessons.map(lesson => [lesson.id, lesson]));
  for (const lesson of legacy.customLessons) {
    if (!lessons.has(lesson.id)) {
      const added = clone(lesson);
      state.customLessons.push(added); lessons.set(lesson.id, added); summary.addedLessons++;
    } else if (!equal(lessons.get(lesson.id), lesson)) {
      conflict('customLessons.' + lesson.id, 'The same lesson has different saved content.');
    }
  }

  // Actual submissions and explicit completion records remain complete objects.
  // A different timestamp is evidence of a difference, never proof that one wins.
  for (const [field, count] of [['results', 'addedReadingResults'], ['completed', 'addedReadingCompletions']]) {
    for (const [key, value] of Object.entries(legacy.readingState[field])) {
      if (!Object.hasOwn(state.readingState[field], key)) {
        state.readingState[field][key] = clone(value); summary[count]++;
      } else if (!equal(state.readingState[field][key], value)) {
        conflict('readingState.' + field + '.' + key, 'The same reading entry has different saved evidence.');
      }
    }
  }

  const lessonURLs = new Map((options.lessons || []).map(lesson => [lesson.id, lesson.url]));
  for (const lesson of state.customLessons) lessonURLs.set(lesson.id, lesson.url);
  for (const [day, id] of Object.entries(legacy.readingState.assignments)) {
    const path = 'readingState.assignments.' + day;
    if (Object.hasOwn(state.readingState.assignments, day)) {
      if (state.readingState.assignments[day] !== id) conflict(path, 'The same day has different reading assignments.');
    } else if (Object.values(state.readingState.assignments).includes(id)) {
      conflict(path, 'This lesson is already assigned on another day in the destination.');
    } else if (state.readingState.excluded.includes(lessonURLs.get(id))) {
      conflict(path, 'The destination excluded this assigned article.');
    } else {
      state.readingState.assignments[day] = id; summary.addedReadingAssignments++;
    }
  }
  const assignedURLs = new Set(Object.values(state.readingState.assignments).map(id => lessonURLs.get(id)).filter(Boolean));
  for (const url of legacy.readingState.excluded) {
    if (state.readingState.excluded.includes(url)) continue;
    if (assignedURLs.has(url)) conflict('readingState.excluded.' + url, 'An assigned article would become excluded.');
    else { state.readingState.excluded.push(url); summary.addedReadingExclusions++; }
  }

  if (!equal(legacy.preferences, remote.preferences)) conflict('preferences', 'Learning settings differ; destination settings stay in place.');
  if (legacy.lastExcel !== remote.lastExcel) conflict('lastExcel', 'Export bookkeeping differs; destination bookkeeping stays in place.');
  const validated = sync.validateState(state);
  summary.candidateWords = validated.records.length;
  summary.conflictCount = conflicts.length;
  return {state: validated, conflicts, summary, changed: sync.fingerprint(validated) !== sync.fingerprint(remote)};
}

export const mergeAccountRecovery = previewAccountRecovery;
