const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../dist/engine.js');
const P = require('../dist/practice-methods.js');
const UI = require('../dist/practice-ui.js');

const DATE = '2026-10-16';
function word(name = 'preventive', extra = {}) {
  return {...E.seed([{word:name,meaning:'预防的',ipa:'/prɪˈventɪv/',level:'A',firstSeen:'2026-10-01',pos:'adj.',
    example:{en:'Preventive measures can help.',zh:'预防措施可以有所帮助。'},
    collocations:[{en:'preventive measures',zh:'预防措施'},{en:'preventive care',zh:'预防护理'}]}])[0],
    nextReview:DATE,contacts:4,reviewHistory:[{date:'2026-10-04',kind:'studied'}],...extra};
}
function harness({records = [word()], canEdit = true, play, save = true} = {}) {
  let writes = 0, html = '', active = true, stops = 0, logins = 0, edits = [], calls = [], saved = [], toasts = [];
  let ctx = {state:{records,preferences:{dailyNewLimit:18,dailyReviewLimit:20}},date:DATE,account:{owner:'A',generation:1},canEdit};
  const root = {get innerHTML(){return html;},set innerHTML(value){writes++;html=value;}};
  const ui = UI.create({root,engine:E,practice:P,getContext:() => ctx,isSameAccount:token => ctx.canEdit && token.owner === ctx.account.owner && token.generation === ctx.account.generation,
    isActive:() => active,requireAccount(){logins++;},onRecord(action){calls.push({...action});if (!save) return false;const record=ctx.state.records.find(item => item.id===action.recordId);ctx.state.records=ctx.state.records.map(item=>item.id===record.id?E.review(record,{...action,date:DATE}):item);saved.push({...action});return true;},
    renderTeaching:record => `<div class="teaching-fixture">${record.word} · ${record.meaning} · ${record.ipa} · ${record.example?.en || '例句待补充'}</div>`,
    onPlay:play,onToast:message=>toasts.push(message),stopAudio(){stops++;},onEdit:id=>edits.push(id),onRouteReview(){active=true;}});
  ui.render();
  return {ui,root,get html(){return html;},get writes(){return writes;},get stops(){return stops;},get saved(){return saved;},get calls(){return calls;},get logins(){return logins;},get edits(){return edits;},get toasts(){return toasts;},get context(){return ctx;},
    action(action,data={}){ui.handleAction('practice-'+action,data);},
    input(value){ui.handleInput({dataset:{practiceInput:'answer'},value});},
    start(mode,ids){if (mode) this.action('mode',{mode});ui.start(ids);},
    account(owner,ownRecords=[]){ctx={...ctx,account:{owner,generation:ctx.account.generation+1},canEdit:!!owner,state:{records:ownRecords,preferences:ctx.state.preferences}};},
    activate(value){active=value;},replaceRecords(ownRecords){ctx.state.records=ownRecords;},
  };
}

test('the landing page offers eight selectable methods without recording a view, selection or start',()=>{
  const h=harness();
  assert.equal((h.html.match(/class="practice-mode-card/g)||[]).length,8);
  assert.match(h.html,/aria-pressed="true" data-action="practice-mode" data-mode="guided"/);
  h.action('mode',{mode:'cloze'});
  assert.match(h.html,/aria-pressed="true" data-action="practice-mode" data-mode="cloze"/);
  assert.equal(h.saved.length,0);
  h.ui.start();assert.equal(h.saved.length,0);
  h.action('exit');assert.equal(h.saved.length,0);
});

test('flashcards require a reveal and an explicit self report, never an objective accuracy claim',()=>{
  const h=harness();h.start('flashcard');
  h.action('self-remember');assert.equal(h.saved.length,0);
  assert.doesNotMatch(h.html,/teaching-fixture/);
  h.action('reveal');assert.match(h.html,/teaching-fixture/);assert.equal(h.saved.length,0);
  h.action('self-remember');assert.equal(h.saved.length,1);
  assert.equal(h.saved[0].kind,'studied');assert.match(h.saved[0].answer,/翻卡回忆.*自评.*记得/);
  assert.match(h.html,/本组没有独立客观作答/);assert.match(h.html,/1 次自评记得或可用/);
});

test('guided teaching records only studied and incomplete cards require editing',()=>{
  const h=harness();h.start('guided');assert.equal(h.saved.length,0);h.action('studied');
  assert.equal(h.saved[0].kind,'studied');assert.match(h.saved[0].answer,/讲解学习/);
  const incomplete=harness({records:[word('personal',{needsContent:true})]});incomplete.start('guided');
  incomplete.action('studied');assert.equal(incomplete.saved.length,0);
  assert.match(incomplete.html,/先补充完整教案/);incomplete.action('edit');
  assert.deepEqual(incomplete.edits,['word-personal']);
});

test('empty or oversized text cannot be checked, saved or advanced; a checked wrong answer stays locked',()=>{
  const h=harness();h.start('spelling');
  h.action('finish');h.action('check');assert.equal(h.saved.length,0);assert.match(h.html,/请先完成作答/);
  h.input('x'.repeat(2001));h.action('check');h.action('finish');assert.equal(h.saved.length,0);assert.match(h.html,/2000/);
  h.input('preventiv');h.action('check');assert.equal(h.saved.length,0);assert.match(h.html,/再对照一次/);
  h.input('preventive');h.action('check');h.action('finish');
  assert.equal(h.saved.length,1);assert.equal(h.saved[0].kind,'wrong');assert.equal(h.saved[0].answer,'[看义拼词] preventiv');
  assert.match(h.html,/独立作答 · 客观核对/);assert.match(h.html,/<strong>0 \/ 1<\/strong>/);
});

test('an objective exact answer saves only after confirmation; first learning remains studied',()=>{
  const h=harness();h.start('spelling');h.input('preventive');h.action('check');
  assert.equal(h.saved.length,0);h.action('finish');assert.equal(h.saved[0].kind,'correct');
  assert.match(h.html,/<strong>1 \/ 1<\/strong>/);
  const fresh=harness({records:[word('preventive',{contacts:1,reviewHistory:[]})]});fresh.start('spelling');fresh.input('preventive');fresh.action('check');fresh.action('finish');
  assert.equal(fresh.saved[0].kind,'studied');
  const b=harness({records:[word('preventive',{level:'B'})]});b.start('spelling');b.input('preventive');b.action('check');b.action('finish');assert.equal(b.saved[0].kind,'studied');
});

test('meaning and collocation choices do not write until checked and confirmed',()=>{
  for(const mode of ['meaning','collocation']){
    const a=word(),b=word('determinant',{meaning:'决定因素'});const h=harness({records:[a,b]});h.start(mode,[a.id]);
    const ex=P.makeExercise(mode,a,[a,b]);h.action('choice',{choice:ex.expectedChoiceId});assert.equal(h.saved.length,0);
    h.action('check');assert.equal(h.saved.length,0);h.action('finish');assert.equal(h.saved.length,1);assert.equal(h.saved[0].kind,'correct');
    assert.match(h.saved[0].answer,new RegExp(ex.expectedAnswer));
  }
});

test('a requested hint produces a separate assisted result and never a correct recall record',()=>{
  const h=harness();h.start('spelling');h.action('hint');assert.equal(h.saved.length,0);
  h.input('preventive');h.action('check');h.action('finish');
  assert.equal(h.saved[0].kind,'studied');assert.match(h.saved[0].answer,/使用提示/);
  assert.match(h.html,/本组没有独立客观作答/);assert.match(h.html,/提示后作答/);
});

test('switching from a visible teaching card to spelling keeps the answer exposed and assisted',()=>{
  const h=harness();h.start('guided');assert.match(h.html,/teaching-fixture/);
  h.action('mode',{mode:'spelling'});h.input('preventive');h.action('check');h.action('finish');
  assert.equal(h.saved[0].kind,'studied');assert.match(h.saved[0].answer,/已查看/);
  assert.match(h.html,/本组没有独立客观作答/);
});

test('changing methods cannot erase the first checked wrong answer or its original method',()=>{
  const h=harness();h.start('spelling');h.input('wrong-first-answer');h.action('check');
  h.action('mode',{mode:'guided'});assert.match(h.html,/需要重学。保存时保留最初作答/);
  h.action('studied');assert.equal(h.saved.length,1);assert.equal(h.saved[0].kind,'wrong');
  assert.equal(h.saved[0].answer,'[看义拼词] wrong-first-answer');assert.match(h.html,/<strong>0 \/ 1<\/strong>/);
});

test('writing keeps the learner sentence and explicit self assessment without grading grammar',()=>{
  const h=harness();h.start('writing');h.input('Preventive care matters in my community.');h.action('check');
  assert.equal(h.saved.length,0);assert.match(h.html,/系统未判断语法或用词是否正确/);
  h.action('self-remember');assert.equal(h.saved[0].kind,'studied');
  assert.match(h.saved[0].answer,/Preventive care matters in my community\./);assert.match(h.saved[0].answer,/自评/);
  assert.match(h.html,/本组没有独立客观作答/);
});

test('listening hides the target, meaning, IPA and target-bearing batch until a successful playback and check',()=>{
  let status;const record=word('preventive',{batch:'preventive personal batch'});
  const h=harness({records:[record],play:(_word,callback)=>{status=callback;}});h.start('listening');
  assert.doesNotMatch(h.html,/preventive|预防的|prɪˈventɪv/);
  h.input('my-unchecked-answer');h.action('check');h.action('finish');assert.equal(h.saved.length,0);
  h.action('audio');status({kind:'loading'});h.action('check');assert.equal(h.saved.length,0);
  status({kind:'recording'});assert.doesNotMatch(h.html,/preventive|预防的|prɪˈventɪv/);
  h.input('preventive');h.action('check');assert.match(h.html,/preventive/);assert.equal(h.saved.length,0);h.action('finish');
  assert.equal(h.saved[0].kind,'correct');
});

test('failed audio leaves listening unavailable and cannot manufacture a listening result',()=>{
  const h=harness({play:(_word,status)=>status({kind:'unavailable'})});h.start('listening');h.action('audio');
  assert.match(h.html,/当前没有可播放的发音/);h.input('preventive');h.action('check');h.action('finish');h.action('self-wrong');assert.equal(h.saved.length,0);
  h.action('mode',{mode:'guided'});h.action('studied');assert.equal(h.saved[0].kind,'studied');assert.match(h.saved[0].answer,/讲解学习/);
});

test('a missing saved example offers an explicit guided fallback and never fabricates an exercise',()=>{
  const h=harness({records:[word('preventive',{example:{en:'This example has no target.',zh:'此句不含目标词。'}})]});h.start('cloze');
  assert.match(h.html,/现有英文例句中没有完整出现/);h.action('check');h.action('finish');assert.equal(h.saved.length,0);
  h.action('guided');assert.match(h.html,/teaching-fixture/);assert.equal(h.saved.length,0);h.action('studied');assert.equal(h.saved[0].kind,'studied');
});

test('anonymous sessions are blocked; an account transition clears drafts and rejects stale audio',()=>{
  const anonymous=harness({canEdit:false});assert.doesNotMatch(anonymous.html,/preventive/);assert.equal(anonymous.ui.start(),false);assert.equal(anonymous.logins,1);assert.equal(anonymous.saved.length,0);
  let status;const h=harness({play:(_word,callback)=>{status=callback;}});h.start('listening');h.input('private-old-answer');h.action('audio');
  h.account('B',[]);h.ui.reset();h.ui.render();const after=h.html,writes=h.writes;
  status({kind:'recording'});assert.equal(h.writes,writes);assert.equal(h.html,after);assert.doesNotMatch(h.html,/private-old-answer|preventive/);
  h.action('finish');assert.equal(h.saved.length,0);
});

test('suspending or leaving the route rejects deferred audio renders while retaining the session draft',()=>{
  let status;const h=harness({play:(_word,callback)=>{status=callback;}});h.start('listening');h.input('retained-draft');h.action('audio');
  h.ui.suspend();h.root.innerHTML='LIBRARY VIEW';const writes=h.writes;status({kind:'speech'});
  assert.equal(h.writes,writes);assert.equal(h.html,'LIBRARY VIEW');h.action('finish');assert.equal(h.saved.length,0);
  h.ui.render();assert.match(h.html,/retained-draft/);assert.match(h.html,/practice-session/);assert.doesNotMatch(h.html,/正在准备发音/);
  h.action('audio');h.activate(false);h.root.innerHTML='READING VIEW';const inactiveWrites=h.writes;status({kind:'recording'});
  assert.equal(h.writes,inactiveWrites);h.ui.render();assert.equal(h.html,'READING VIEW');
});

test('same-id content edits drop stale answers, grades and audio before regenerating the current exercise',()=>{
  let status;const h=harness({play:(_word,callback)=>{status=callback;}});h.start('spelling');h.input('preventive');h.action('check');
  h.replaceRecords([word('preventive',{meaning:'已更新的中文义'})]);h.ui.render();
  assert.match(h.html,/已更新的中文义/);assert.match(h.html,/<textarea[^>]*><\/textarea>/);h.action('finish');assert.equal(h.saved.length,0);
  assert.ok(h.toasts.some(message=>/词卡讲解已更新/.test(message)));
  h.action('mode',{mode:'listening'});h.action('audio');h.replaceRecords([word('preventive',{meaning:'再次更新'})]);h.ui.render();const writes=h.writes;
  status({kind:'recording'});assert.equal(h.writes,writes);
});

test('a failed save leaves the explicit result on screen for retry without claiming completion',()=>{
  const h=harness({save:false});h.start('spelling');h.input('preventive');h.action('check');h.action('finish');
  assert.equal(h.saved.length,0);assert.equal(h.calls.length,1);assert.doesNotMatch(h.html,/完成 1 个词的练习/);assert.match(h.html,/保存这次作答/);
});

test('record disappearance ends the old session without falling back to a stale private record',()=>{
  const h=harness();h.start('spelling');h.input('preventive');h.replaceRecords([]);h.ui.render();
  assert.doesNotMatch(h.html,/preventive/);assert.match(h.html,/从第一个陌生词开始/);assert.equal(h.saved.length,0);
});
