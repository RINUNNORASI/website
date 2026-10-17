const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const B = require('../dist/practice-batches.js');
const E = require('../dist/engine.js');
const DATE = '2026-10-16';

function word(name, extra = {}) {
  return E.seed([{word:name,firstSeen:'2026-10-14',level:'A',ipa:'/test/',meaning:'合成测试释义',...extra}])[0];
}
function learned(name, extra = {}) {
  return E.review(word(name, {firstSeen:'2026-10-13',...extra}), {date:'2026-10-14',kind:'studied'});
}
const preferences = {dailyNewLimit:18,dailyReviewLimit:20};

test('exposes a browser global and pure CommonJS API without DOM access', () => {
  const context = {window:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/practice-batches.js'), 'utf8'), context);
  assert.equal(typeof context.window.IELTS_PRACTICE_BATCHES.build, 'function');
  assert.deepEqual(B.build([], DATE, preferences, E).groups, []);
  assert.throws(() => B.build(null, DATE, preferences, E), /个人词库/);
  assert.throws(() => B.build([], DATE, preferences, {}), /安排/);
});

test('a huge imported source is split into bounded groups from one capped pool, leaving an explicit backlog', () => {
  const records = Array.from({length:157}, (_, index) => word('synthetic-' + index, {batch:'one import'}));
  const before = JSON.stringify(records), plan = B.build(records, DATE, preferences, E);
  assert.deepEqual(plan.groups.map(group => group.count), [6,6,6]);
  assert.equal(plan.counts.planned,18);
  assert.equal(plan.counts.dueTotal,157);
  assert.equal(plan.counts.backlog,139);
  assert.equal(plan.counts.deferredNew,139);
  assert.equal(plan.counts.nextSession,0);
  assert.equal(new Set(plan.queueIds).size,18);
  assert.deepEqual(new Set(plan.queueIds), new Set(E.studyQueue(records, DATE, preferences).map(record => record.id)));
  assert.ok(plan.groups.every(group => group.stage === 'learn' && group.suggestedMode === 'guided'));
  assert.equal(JSON.stringify(records),before);
});

test('unresolved real errors precede due recall, which precedes new learning without inventing mastery', () => {
  const failed = E.review(word('repair'), {date:'2026-10-15',kind:'wrong',answer:'actual error'});
  const recall = learned('recall'), fresh = word('new');
  const plan = B.build([fresh,recall,failed],DATE,preferences,E);
  assert.deepEqual(plan.groups.map(group => group.stage),['repair','recall','learn']);
  assert.deepEqual(plan.groups.map(group => group.recordIds),[[failed.id],[recall.id],[fresh.id]]);
  assert.match(plan.groups[0].reason,/未解决的错误/);
  assert.match(plan.groups[1].reason,/先不看答案/);
  assert.match(plan.groups[2].reason,/尚无学习确认/);
  assert.deepEqual(plan.groups[0].counts,{repair:1,recall:0,learn:0});
});

test('today confirmations and future/C words are excluded without replaying the same word as another group', () => {
  const today = E.review(word('today'),{date:DATE,kind:'studied'});
  today.nextReview = DATE; // Defensive handling of a legacy/stale due marker.
  const future = word('future',{firstSeen:DATE});
  const ignored = word('ignored',{level:'C'});
  const fresh = word('ready');
  const plan = B.build([today,future,ignored,fresh],DATE,preferences,E);
  assert.deepEqual(plan.queueIds,[fresh.id]);
  assert.equal(plan.counts.completedToday,1);
  assert.equal(plan.counts.dueTotal,1);
  assert.equal(plan.counts.backlog,0);
});

test('new words already confirmed today consume the daily allowance even though absent from groups', () => {
  const done = Array.from({length:4},(_,index) => E.review(word('done-' + index),{date:DATE,kind:'studied'}));
  const fresh = Array.from({length:9},(_,index) => word('fresh-' + index));
  const plan = B.build([...done,...fresh],DATE,{dailyNewLimit:5,dailyReviewLimit:20},E);
  assert.equal(plan.counts.planned,1);
  assert.equal(plan.counts.completedToday,4);
  assert.equal(plan.counts.deferredNew,8);
  assert.equal(plan.counts.nextSession,0);
});

test('existing reviews completed today do not consume the daily new allowance', () => {
  const oldDone = E.review(learned('already-known'),{date:DATE,kind:'correct',answer:'actual answer'});
  const fresh = Array.from({length:5},(_,index) => word('fresh-' + index));
  const plan = B.build([oldDone,...fresh],DATE,{dailyNewLimit:5,dailyReviewLimit:20},E);
  assert.equal(plan.counts.planned,5);
  assert.equal(plan.counts.completedToday,1);
  assert.equal(plan.counts.deferredNew,0);
});

test('the original per-arrangement limit still bounds all displayed groups combined', () => {
  const records = Array.from({length:37},(_,index) => learned('recall-' + index));
  const plan = B.build(records,DATE,{dailyNewLimit:5,dailyReviewLimit:13},E);
  assert.deepEqual(plan.groups.map(group => group.count),[6,6,1]);
  assert.equal(plan.counts.planned,13);
  assert.equal(plan.counts.backlog,24);
  assert.equal(plan.counts.nextSession,24);
  assert.equal(plan.counts.deferredNew,0);
});

test('incomplete teaching content is counted separately and cannot starve ready cards from the capped pool', () => {
  const missing = Array.from({length:25},(_,index) => word('aaa-missing-' + index,{needsContent:true}));
  const ready = Array.from({length:9},(_,index) => word('zzz-ready-' + index));
  const plan = B.build([...missing,...ready],DATE,{dailyNewLimit:5,dailyReviewLimit:5},E);
  assert.equal(plan.counts.needsContent,25);
  assert.equal(plan.counts.planned,5);
  assert.equal(plan.counts.backlog,4);
  assert.equal(plan.counts.dueTotal,34);
  assert.equal(plan.counts.dueTotal,plan.counts.planned + plan.counts.backlog + plan.counts.needsContent);
  assert.deepEqual(new Set(plan.needsContentIds),new Set(missing.map(record => record.id)));
  assert.ok(plan.queueIds.every(id => ready.some(record => record.id === id)));
});

test('refreshing produces stable group IDs, orders and membership without storage or mutation', () => {
  const records = Array.from({length:18},(_,index) => word('stable-' + index,{batch:'source-' + index % 3}));
  const plan = B.build(records,DATE,preferences,E);
  assert.deepEqual(B.build(records,DATE,preferences,E),plan);
  assert.ok(plan.groups.every(group => /^practice-group-[a-z0-9]+$/.test(group.id)));
  assert.equal(new Set(plan.groups.map(group => group.id)).size,plan.groups.length);
});

test('same-due-day provenance is mixed without inventing topics and older due dates remain first', () => {
  const records = ['alpha','beta','gamma','delta'].flatMap(prefix => Array.from({length:3},(_,index) => word(prefix + '-' + index,{batch:prefix})));
  const old = word('older',{firstSeen:'2026-10-13',batch:'older source'});
  const plan = B.build([...records,old],DATE,{dailyNewLimit:18,dailyReviewLimit:20},E);
  const byId = new Map([...records,old].map(record => [record.id,record]));
  assert.equal(plan.queueIds[0],old.id);
  const sameDay = plan.queueIds.slice(1,5).map(id => byId.get(id).batch);
  assert.equal(new Set(sameDay).size,4);
  assert.ok(plan.groups.some(group => group.sourceCount > 1));
  assert.ok(!JSON.stringify(plan).includes('语义主题'));
});

test('duplicate input identities never become duplicate practice cards or duplicate backlog counts', () => {
  const original = word('unique');
  const plan = B.build([original,original,{...original}],DATE,preferences,E);
  assert.deepEqual(plan.queueIds,[original.id]);
  assert.equal(plan.counts.dueTotal,1);
});

test('options cannot create a giant group and the final short group remains usable', () => {
  const records = Array.from({length:17},(_,index) => word('bounded-' + index));
  const plan = B.build(records,DATE,preferences,E,{groupSize:157});
  assert.equal(plan.groupSize,8);
  assert.deepEqual(plan.groups.map(group => group.count),[8,8,1]);
  assert.equal(B.build(records,DATE,preferences,E,{groupSize:0}).groupSize,6);
});

test('finishing a group frees the next small arrangement while daily new usage remains bounded', () => {
  const records = Array.from({length:30},(_,index) => word('progress-' + index));
  const first = B.build(records,DATE,{dailyNewLimit:10,dailyReviewLimit:10},E);
  const completed = new Set(first.groups[0].recordIds);
  const after = records.map(record => completed.has(record.id) ? E.review(record,{date:DATE,kind:'studied'}) : record);
  const next = B.build(after,DATE,{dailyNewLimit:10,dailyReviewLimit:10},E);
  assert.equal(next.counts.planned,4);
  assert.equal(next.counts.completedToday,6);
  assert.ok(next.queueIds.every(id => !completed.has(id)));
  assert.equal(next.counts.deferredNew,20);
});
