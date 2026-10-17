const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../dist/engine.js');
const UI = require('../dist/plan-ui.js');

const date = '2026-10-14';
const record = (word, firstSeen = '2026-10-13', level = 'A') => E.seed([{word, firstSeen, level, meaning: '中文义', ipa: '/test/'}], [])[0];

test('planned load moves overdue reviews to today and counts overlapping schedules once', () => {
  const r = record('climate', '2026-09-24');
  r.nextReview = '2026-09-25';
  r.extraReviews = ['2026-10-13', '2026-10-14', '2026-10-24'];
  const days = UI.plannedDays([r], date, 30, E);
  assert.equal(days[0].count, 1);
  assert.ok(days[0].entries[0].reasons.has('待补复习'));
  assert.ok(days[0].entries[0].reasons.has('错词加练'));
  const d30 = days.find(day => day.date === '2026-10-24');
  assert.equal(d30.count, 1);
  assert.ok(d30.entries[0].reasons.has('D30'));
  assert.ok(d30.entries[0].reasons.has('错词加练'));
});

test('future schedule includes D1 D3 D7 D14 D30 and excludes level C', () => {
  const days = UI.plannedDays([record('climate'), record('ignore', '2026-10-13', 'C')], date, 30, E);
  assert.deepEqual(days.filter(day => day.count).map(day => [day.date, day.count]), [
    ['2026-10-14', 1], ['2026-10-16', 1], ['2026-10-20', 1], ['2026-10-27', 1], ['2026-11-12', 1]
  ]);
});

test('first-seen dates and schedules do not become actual learning records', () => {
  const days = UI.actualDays([record('climate')], date, E, {completed: {}});
  assert.equal(days.length, 28);
  assert.equal(days.reduce((sum, day) => sum + day.count, 0), 0);
  assert.equal(days[27].date, date);
});

test('actual learning deduplicates a word per day and keeps its latest explicit result', () => {
  const a = record('climate'), b = record('urban');
  a.reviewHistory = [{date, kind: 'studied'}, {date, kind: 'wrong', answer: '天气'}, {date, kind: 'correct', answer: '气候'}];
  b.reviewHistory = [{date, kind: 'wrong', answer: '海洋'}];
  const today = UI.actualDays([a, b], date, E, {completed: {lesson1: date}})[27];
  assert.equal(today.count, 2);
  assert.equal(today.studied, 0);
  assert.equal(today.correct, 1);
  assert.equal(today.wrong, 1);
  assert.equal(today.readingCount, 1);
});

test('actual history excludes events outside its date range and unknown result types', () => {
  const r = record('climate', '2026-09-01');
  r.reviewHistory = [{date: '2026-09-16', kind: 'correct'}, {date: '2026-10-15', kind: 'correct'}, {date, kind: 'automatic'}];
  assert.equal(UI.actualDays([r], date, E).reduce((sum, day) => sum + day.count, 0), 0);
});

test('phase boundaries cover the exact configured period without gaps or overlaps', () => {
  for (const weeks of [8, 12, 16, 9]) {
    const phases = UI.phasesFor({cycleWeeks: weeks, examDate: null}, date, E);
    assert.equal(phases.reduce((sum, phase) => sum + phase.days, 0), weeks * 7);
    assert.equal(phases[0].start, date);
    assert.equal(phases[3].end, E.addDays(date, weeks * 7 - 1));
    for (let i = 1; i < phases.length; i++) assert.equal(phases[i].start, E.addDays(phases[i - 1].end, 1));
  }
  const short = UI.phasesFor({cycleWeeks: 12, examDate: '2026-10-15'}, date, E);
  assert.equal(short.reduce((sum, phase) => sum + phase.days, 0), 2);
  assert.equal(short.at(-1).end, '2026-10-15');
});

test('rendered time budgets sum to the configured minutes and all data text is escaped', () => {
  const r = record('climate'); r.meaning = '<img src=x onerror=alert(1)>';
  const html = UI.render({state: {records: [r], readingState: {completed: {}}, preferences: {dailyMinutes: 45}}, date, engine: E});
  const budget = html.slice(html.indexOf('class="pl-time-budget"'), html.indexOf('class="pl-cycle-card"'));
  const minutes = [...budget.matchAll(/<strong>(\d+) <small>分钟<\/small>/g)].map(match => +match[1]);
  assert.deepEqual(minutes, [13, 18, 7, 7]);
  assert.equal(minutes.reduce((sum, number) => sum + number, 0), 45);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!html.includes('<img src=x'));
});

function planFormHarness(state) {
  UI.render({state, date, engine: E});
  const listeners = new Map();
  const customWeeks = {hidden: true};
  const message = {textContent: ''};
  const button = {disabled: false};
  const form = {
    values: {examDate: '', cyclePreset: '12', cycleWeeks: '9', dailyMinutes: '60', dailyNewLimit: '15', dailyReviewLimit: '20'},
    addEventListener: (type, callback) => listeners.set('form:' + type, callback),
    querySelector: selector => selector === '#plan-form-message' ? message : button
  };
  const preset = {addEventListener: (type, callback) => listeners.set('preset:' + type, callback)};
  const main = {
    innerHTML: '', querySelectorAll: () => [],
    querySelector: selector => ({'#plan-cycle-preset': preset, '.pl-custom-weeks': customWeeks, '#plan-preferences': form, '#plan-form-message': message}[selector] || null)
  };
  return {main, form, customWeeks, message, button, listeners};
}

test('custom planning weeks can be shown and hidden without losing the entered value', () => {
  const h = planFormHarness({records: [], readingState: {completed: {}}, preferences: {}});
  UI.bind(h.main, {});
  const change = h.listeners.get('preset:change');
  change({target: {value: 'custom'}});
  assert.equal(h.customWeeks.hidden, false);
  change({target: {value: '16'}});
  assert.equal(h.customWeeks.hidden, true);
  change({target: {value: 'custom'}});
  assert.equal(h.customWeeks.hidden, false);
  assert.equal(h.form.values.cycleWeeks, '9');
});

test('the responsive preferences form saves the selected custom duration and all numeric limits', async () => {
  const state = {records: [], readingState: {completed: {}}, preferences: {}};
  const h = planFormHarness(state);
  h.form.values.cyclePreset = 'custom';
  let saved;
  UI.bind(h.main, {onPreferences: async preferences => { saved = preferences; }});
  const OriginalFormData = global.FormData;
  global.FormData = class { constructor(form) { this.values = form.values; } get(key) { return this.values[key]; } };
  try {
    await h.listeners.get('form:submit')({preventDefault() {}, currentTarget: h.form});
  } finally { global.FormData = OriginalFormData; }
  assert.deepEqual(saved, {examDate: null, cycleWeeks: 9, dailyMinutes: 60, dailyNewLimit: 15, dailyReviewLimit: 20});
  assert.equal(state.preferences.cycleWeeks, 9);
  assert.equal(h.message.textContent, '计划已保存');
});
