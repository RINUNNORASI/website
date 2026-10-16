const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const E=require('../dist/engine.js');
const S=require('../dist/sync-state.js');
const app=fs.readFileSync(require.resolve('../dist/app.js'),'utf8');
const cloudCode=fs.readFileSync(require.resolve('../dist/cloud-client.js'),'utf8');
const copy=value=>JSON.parse(JSON.stringify(value));
const empty=()=>S.validateState({records:[],lastExcel:E.today(),readingState:{assignments:{},results:{},completed:{},excluded:[]},customLessons:[]});
const withWord=(word,firstSeen=E.today())=>S.validateState({...empty(),records:E.seed([{word,firstSeen,level:'A',meaning:'个人词义',ipa:'/test/',pos:'n.'}])});
const signedIn=id=>({status:'signed-in',enabled:true,authenticated:true,user:{id,email:id+'@example.test'}});
const signedOut=()=>({status:'signed-out',enabled:true,authenticated:false,user:null});
const cacheKey=id=>'xunci.cloud.v1.state.'+encodeURIComponent(id);
const stored=(id,state)=>[cacheKey(id),JSON.stringify({version:1,userId:id,state})];
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};

function harness({entries=[],initial=signedOut(),deferInit=false,loadLessons=async()=>[],fetch=async()=>({ok:false}),storageFailure=false,noAuth=false,lessons=[],route='library',startSync=()=>undefined}={}){
  const storage=new Map(entries),nodes=new Map(),events=new Map(),clients=[],timers=new Map();let authHooks,auth=copy(initial),failStorage=storageFailure,nextTimer=1;
  const init=deferred();
  function node(selector){if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',value:'',dataset:{},hidden:false,open:false,classList:{add(){},remove(){},toggle(){}},addEventListener(){},close(){this.open=false;},showModal(){this.open=true;},insertAdjacentHTML(_where,html){this.innerHTML=html+this.innerHTML;},scrollIntoView(){},focus(){},setSelectionRange(){}});return nodes.get(selector);}
  const document={hidden:false,querySelector(selector){if(selector==='#reading-form'&&!node('#main').innerHTML.includes('id="reading-form"'))return null;return node(selector);},querySelectorAll:()=>[],addEventListener:(name,fn)=>events.set(name,fn)};
  // Browser modules share one JavaScript realm. Normalize this harness's VM
  // objects before calling the imported host-realm JSON validator.
  const browserSync={...S};
  for(const name of ['validateState','validatePreferences','serialize','fingerprint'])browserSync[name]=value=>S[name](value===undefined?undefined:copy(value));
  const window={IELTS_ENGINE:E,IELTS_SYNC:browserSync,document,location:{hash:'#'+route},VOCAB_HISTORY:[{word:'public-seed-must-never-appear'}],VOCAB_NEW:[],READING_LESSONS:copy(lessons),
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>{if(failStorage)throw Error('quota');storage.set(key,value);}},
    addEventListener:(name,fn)=>events.set(name,fn),setInterval:()=>0,setTimeout:(fn,delay)=>{const id=nextTimer++;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
    speechSynthesis:{cancel(){}},IELTS_AUDIO:{stop(){}},scrollTo(){}};
  new Function('window',cloudCode)(window);
  window.IELTS_CLOUD.loadLessons=loadLessons;
  window.IELTS_CLOUD.create=options=>{const client={options,stopped:false,queued:0,start(){return startSync(options);},stop(){this.stopped=true;},queue(){this.queued++;},getConflict(){return null;}};clients.push(client);return client;};
  if(!noAuth)window.IELTS_AUTH={consumeCallback:()=>null,create:options=>{authHooks=options;return {getStatus:()=>copy(auth),init:()=>deferInit?init.promise:Promise.resolve(copy(auth)),open(){},logout:async()=>{await options.onBeforeChange();auth=signedOut();options.onStatus(copy(auth));await options.onChange();}};}};
  const context={window,document,location:window.location,localStorage:window.localStorage,fetch:(...args)=>fetch(...args),Intl,Date,Map,Set,Promise,Error,TypeError,FormData:class{constructor(form){this.values=form?.values||{};}*[Symbol.iterator](){yield* Object.entries(this.values);}get(key){return this.values[key]??null;}},clearTimeout:window.clearTimeout,setTimeout:window.setTimeout,setInterval:window.setInterval};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/practice-methods.js'),'utf8'),context);
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/practice-ui.js'),'utf8'),context);
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/reading-ui.js'),'utf8'),context);
  window.IELTS_READING_UI.bind=()=>{};
  vm.runInNewContext(app,context);
  return {storage,nodes,clients,html:()=>node('#main').innerHTML,modal:()=>node('#modal-content'),latest:()=>clients.at(-1),
    finishInit(status=auth){auth=copy(status);init.resolve(copy(auth));},
    async change(status){await authHooks.onBeforeChange();auth=copy(status);authHooks.onStatus(copy(auth));await authHooks.onChange();await settle();},
    async before(){return authHooks.onBeforeChange();},
    status(status){auth=copy(status);authHooks.onStatus(copy(auth));},setStorageFailure(value){failStorage=value;},
    async click(action,dataset={}){await events.get('click')({target:{closest:()=>({dataset:{action,...dataset}})}});await settle();},
    input(value){events.get('input')({target:{dataset:{practiceInput:'answer'},value}});},
    async route(name){window.location.hash='#'+name;events.get('hashchange')();await settle();},node,
  };
}

test('first paint and signed-out UI never read another owner or the shared legacy state',async()=>{
  const old=withWord('owner-only-word');
  const h=harness({deferInit:true,entries:[['xunci.ielts7.v1',JSON.stringify(old)],['xunci.cloud.v1',JSON.stringify({userId:'A',revision:1,baseline:old})]]});
  assert.doesNotMatch(h.html(),/owner-only-word|public-seed-must-never-appear/);
  assert.equal(h.clients.length,0);
  h.finishInit();await settle();
  assert.doesNotMatch(h.html(),/owner-only-word/);
  assert.equal(h.clients.length,0);
  assert.ok(h.storage.has(cacheKey('A')),'owned legacy data remains recoverable for A');
  assert.equal(h.storage.get('xunci.ielts7.v1'),JSON.stringify(old));
});

test('new B account starts empty; an A-only word entered today survives logout, B login, then A login',async()=>{
  const h=harness({initial:signedIn('A'),entries:[stored('A',withWord('original-a'))]});await settle();
  assert.match(h.html(),/original-a/);
  const a=h.latest();a.options.setState(withWord('entered-today-a'));
  assert.match(h.html(),/entered-today-a/);
  assert.equal(JSON.parse(h.storage.get(cacheKey('A'))).state.records[0].word,'entered-today-a');
  await h.change(signedOut());
  assert.doesNotMatch(h.html(),/entered-today-a|original-a/);
  await h.change(signedIn('B'));
  assert.equal(h.latest().options.expectedUserId,'B');
  assert.equal(h.latest().options.getState().records.length,0);
  assert.doesNotMatch(h.html(),/entered-today-a/);
  h.latest().options.setState(withWord('b-private'));
  await h.change(signedIn('A'));
  assert.match(h.html(),/entered-today-a/);
  assert.doesNotMatch(h.html(),/b-private/);
  assert.equal(h.latest().options.expectedUserId,'A');
  await h.change(signedIn('B'));
  assert.match(h.html(),/b-private/);
  assert.doesNotMatch(h.html(),/entered-today-a/);
});

test('account transition empties an open private dialog before the next account is verified',async()=>{
  const h=harness({initial:signedIn('A'),entries:[stored('A',withWord('private-dialog-word'))]});await settle();
  await h.click('intake');assert.match(h.modal().innerHTML,/intake-text/);assert.equal(h.node('#modal').open,true);
  await h.before();
  assert.equal(h.node('#modal').open,false);assert.equal(h.modal().innerHTML,'');
  assert.doesNotMatch(h.html(),/private-dialog-word/);
  assert.equal(h.clients[0].stopped,true);
  await h.click('intake');assert.equal(h.node('#modal').open,false,'unauthenticated transition cannot open a personal intake form');
});

test('stale cloud callbacks and content fetches cannot apply to a newly selected account',async()=>{
  const lessonsA=deferred();let loads=0;
  const h=harness({initial:signedIn('A'),entries:[stored('A',withWord('a-private'))],loadLessons:()=>++loads===1?lessonsA.promise:Promise.resolve([])});await settle();const a=h.latest();
  await h.change(signedIn('B'));const b=h.latest();
  a.options.setState(withWord('stale-a-response'));a.options.onStatus({status:'synced',user:{id:'A'}});
  lessonsA.resolve([{id:'a-personal-lesson',title:'A private lesson'}]);await settle();
  assert.equal(b.options.getState().records.length,0);assert.doesNotMatch(h.html(),/a-private|stale-a-response/);
  assert.throws(()=>a.options.getState(),/账号已变化/);
  assert.equal(b.stopped,false);
});

test('401 and account mismatch clear personal UI while retaining the exact owner cache',async()=>{
  const h=harness({initial:signedIn('A'),entries:[stored('A',withWord('private-on-401'))]});await settle();
  h.latest().options.onStatus({status:'unauthorized',message:'请登录'});
  assert.doesNotMatch(h.html(),/private-on-401/);assert.equal(h.latest().stopped,true);
  assert.equal(JSON.parse(h.storage.get(cacheKey('A'))).state.records[0].word,'private-on-401');
  await h.change(signedIn('A'));
  h.latest().options.onAccountMismatch();
  assert.doesNotMatch(h.html(),/private-on-401/);
  assert.equal(JSON.parse(h.storage.get(cacheKey('A'))).state.records[0].word,'private-on-401');
});

test('invalid owner cache and legacy archive failures fail closed without removing prior storage',async()=>{
  const bad=JSON.stringify({version:1,userId:'B',state:withWord('do-not-show')});
  const h=harness({initial:signedIn('A'),entries:[[cacheKey('A'),bad]]});await settle();
  assert.equal(h.clients.length,0);assert.doesNotMatch(h.html(),/do-not-show/);assert.equal(h.storage.get(cacheKey('A')),bad);
  const legacy=JSON.stringify(withWord('legacy-private'));
  const blocked=harness({initial:signedIn('A'),entries:[['xunci.ielts7.v1',legacy]],storageFailure:true});await settle();
  assert.equal(blocked.clients.length,0);assert.doesNotMatch(blocked.html(),/legacy-private/);assert.equal(blocked.storage.get('xunci.ielts7.v1'),legacy);
});

test('failed before-change backup blocks the account operation and preserves the A snapshot for retry',async()=>{
  const h=harness({initial:signedIn('A'),entries:[stored('A',withWord('today-snapshot'))]});await settle();
  h.setStorageFailure(true);
  await assert.rejects(h.before(),/暂停账号切换/);
  assert.equal(h.latest().stopped,true);
  assert.equal(JSON.parse(h.storage.get(cacheKey('A'))).state.records[0].word,'today-snapshot');
  h.status({...signedIn('A'),status:'error'});assert.doesNotMatch(h.html(),/today-snapshot/);
  h.setStorageFailure(false);await h.change(signedIn('B'));
  assert.equal(h.latest().options.getState().records.length,0);
  await h.change(signedIn('A'));assert.match(h.html(),/today-snapshot/);
});

test('native Sites fallback verifies the server-owned user before selecting any local cache',async()=>{
  const remote=deferred();const h=harness({noAuth:true,entries:[stored('native-A',withWord('native-private'))],fetch:()=>remote.promise});
  assert.equal(h.clients.length,0);assert.doesNotMatch(h.html(),/native-private/);
  remote.resolve({ok:true,json:async()=>({version:1,user:{id:'native-A'},state:null})});await settle();
  assert.equal(h.latest().options.expectedUserId,'native-A');assert.match(h.html(),/native-private/);
});

test('pending save status is visible and cannot be labeled synced',async()=>{
  const h=harness({initial:signedIn('A')});await settle();
  h.latest().options.onStatus({status:'pending',message:'新修改已在本机保存，等待上传。',user:{id:'A'}});
  assert.equal(h.node('#sync-label').textContent,'待同步');
  assert.equal(h.node('#sidebar-sync-label').textContent,'待同步');
});

test('the integrated practice page records only explicit confirmation into the verified account cache',async()=>{
  const original=withWord('private-practice-word',E.addDays(E.today(),-1));
  const h=harness({initial:signedIn('A'),entries:[stored('A',original)]});await settle();
  await h.route('review');
  assert.match(h.html(),/八种方式/);
  assert.equal(h.latest().options.getState().records[0].reviewHistory.length,0);
  await h.click('practice-start');
  assert.match(h.html(),/private-practice-word/);
  assert.equal(h.latest().options.getState().records[0].reviewHistory.length,0);
  await h.click('practice-studied');
  const own=h.latest().options.getState().records[0];
  assert.equal(own.reviewHistory.length,1);
  assert.equal(own.reviewHistory[0].kind,'studied');
  assert.match(own.reviewHistory[0].answer,/讲解学习/);
  assert.equal(h.latest().queued,1);
  await h.change(signedIn('B'));await h.route('review');
  assert.doesNotMatch(h.html(),/private-practice-word/);
  await h.click('practice-studied');
  assert.equal(h.latest().options.getState().records.length,0);
  assert.equal(JSON.parse(h.storage.get(cacheKey('A'))).state.records[0].reviewHistory.length,1);
});

test('integrated spelling checks do not save until confirmation and preserve the actual method and typed answer',async()=>{
  const original=withWord('resilience',E.addDays(E.today(),-1));
  const h=harness({initial:signedIn('A'),entries:[stored('A',original)]});await settle();
  await h.route('review');await h.click('practice-mode',{mode:'spelling'});await h.click('practice-start');
  h.input('resilience');await h.click('practice-check');
  assert.equal(h.latest().options.getState().records[0].reviewHistory.length,0);
  await h.click('practice-finish');
  const event=h.latest().options.getState().records[0].reviewHistory[0];
  assert.equal(event.kind,'studied','first learning is confirmed without claiming mastery');
  assert.match(event.answer,/看义拼词/);assert.match(event.answer,/resilience/);
});

function readingLessons(){const scope={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../dist/reading-data.js'),'utf8'),scope);return copy(scope.window.READING_LESSONS);}

test('daily reading waits for the account and initial catalog instead of flashing and assigning another lesson',async()=>{
  const sync=deferred(),catalog=deferred(),lessons=readingLessons();
  const h=harness({initial:signedIn('A'),deferInit:true,route:'reading',lessons,startSync:()=>sync.promise,loadLessons:()=>catalog.promise});
  assert.match(h.html(),/正在加载今日精读/);assert.doesNotMatch(h.html(),/ru-passage-article/);
  h.finishInit();await settle();
  assert.match(h.html(),/正在加载今日精读/);
  assert.deepEqual(copy(h.latest().options.getState().readingState.assignments),{});
  assert.equal(h.latest().queued,0);
  const remote=empty();remote.readingState.assignments[E.today()]='teacher-communication';
  h.latest().options.setState(remote);sync.resolve();await settle();
  assert.match(h.html(),/正在加载今日精读/);
  catalog.resolve([]);await settle();
  assert.match(h.html(),/Positive teacher communication/);
  assert.doesNotMatch(h.html(),/How urban design leads to better wellness/);
  assert.deepEqual(copy(h.latest().options.getState().readingState.assignments),remote.readingState.assignments);
  assert.equal(h.latest().queued,0,'loading existing reading never creates a new assignment or learning result');
});

test('an open daily reading refreshes when its assigned cloud lesson finishes loading',async()=>{
  const catalog=deferred(),lessons=readingLessons(),online={...lessons[0],id:'cloud-only-reading',title:'Assigned cloud reading'};
  const state=empty();state.readingState.assignments[E.today()]=online.id;
  const h=harness({initial:signedIn('A'),route:'reading',lessons,entries:[stored('A',state)],loadLessons:()=>catalog.promise});await settle();
  assert.match(h.html(),/正在加载今日精读/);
  catalog.resolve([online]);await settle();
  assert.match(h.html(),/Assigned cloud reading/);assert.match(h.html(),/ru-passage-article/);
  assert.ok(h.html().includes(online.article.paragraphs[0].text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')));
});

test('an older same-source custom lesson cannot erase a bundled full passage during cloud state download',async()=>{
  const lessons=readingLessons(),legacy=copy(lessons[0]);delete legacy.article;
  for(const question of legacy.questions){delete question.locator;delete question.evidenceParagraphIds;question.location='Original article';}
  const initial=empty();initial.readingState.assignments[E.today()]=legacy.id;
  const h=harness({initial:signedIn('A'),route:'reading',lessons,entries:[stored('A',initial)]});await settle();
  assert.match(h.html(),/ru-passage-article/);
  const remote=copy(initial);remote.customLessons=[legacy];h.latest().options.setState(remote);
  assert.match(h.html(),/ru-passage-article/);assert.doesNotMatch(h.html(),/<iframe/);
  assert.ok(h.html().includes(lessons[0].article.paragraphs[0].text));
  assert.equal(h.latest().options.getState().customLessons[0].article,undefined,'display fallback does not rewrite the personal backup');
});

test('a same-id lesson for a different source never borrows another article',async()=>{
  const lessons=readingLessons(),changed=copy(lessons[0]);delete changed.article;changed.url='https://example.test/different-article';
  for(const question of changed.questions){delete question.locator;delete question.evidenceParagraphIds;question.location='Original article';}
  const state=empty();state.customLessons=[changed];state.readingState.assignments[E.today()]=changed.id;
  const h=harness({initial:signedIn('A'),route:'reading',lessons,entries:[stored('A',state)]});await settle();
  assert.doesNotMatch(h.html(),/ru-passage-article|<iframe/);
  assert.match(h.html(),/https:\/\/example.test\/different-article/);
});

test('catalog loading preserves answers in a manually opened reading form',async()=>{
  const catalog=deferred(),lessons=readingLessons();
  const h=harness({initial:signedIn('A'),lessons,loadLessons:()=>catalog.promise});await settle();
  await h.click('choose-lesson',{id:'urban-health'});
  await h.route('reading');
  h.node('#reading-form').values={u5:'draft before loading finished'};
  catalog.resolve([]);await settle();
  assert.match(h.html(),/value="draft before loading finished"/);
  assert.deepEqual(copy(h.latest().options.getState().readingState.results),{},'draft never becomes a submitted result');
});
