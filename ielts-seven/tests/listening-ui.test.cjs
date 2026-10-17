const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const D=require('../dist/listening-data.js');

function harness({voices=[{lang:'en-GB',name:'Device English'}],speech=true}={}){
  let html='',writes=0,active=true,cancels=0,context={account:{owner:null,generation:0},canEdit:false,state:{records:[]},date:'2026-10-16'},audio=null;
  const utterances=[],timers=new Map(),voiceListeners=new Set(),revoked=[],downloads=[],toasts=[];
  let nextTimer=1,voiceList=voices;
  const status={textContent:''},check={disabled:true},playButton={disabled:false,textContent:''};
  function makeAudio(){const listeners={};return {pauses:0,pause(){this.pauses++;},addEventListener(name,fn){listeners[name]=fn;},fire(name){listeners[name]?.();}};}
  const root={get innerHTML(){return html;},set innerHTML(value){html=value;writes++;audio=value.includes('data-listening-audio src=')?makeAudio():null;},querySelector(selector){if(selector==='audio[data-listening-audio]')return audio;if(selector==='[data-listening-status]')return status;if(selector==='[data-listening-check]')return check;if(selector==='[data-listening-play]')return playButton;return null;}};
  const window={IELTS_LISTENING_DATA:D,URL:{createObjectURL(){return 'blob:private-local';},revokeObjectURL(url){revoked.push(url);}},setTimeout(fn){const id=nextTimer++;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},SpeechSynthesisUtterance:function(text){this.text=text;}};
  if(speech)window.speechSynthesis={cancel(){cancels++;},getVoices(){return voiceList;},speak(utterance){utterances.push(utterance);},addEventListener(name,fn){if(name==='voiceschanged')voiceListeners.add(fn);},removeEventListener(name,fn){voiceListeners.delete(fn);}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/listening-ui.js'),'utf8'),{window});
  const ui=window.IELTS_LISTENING_UI.create({root,getContext:()=>context,isActive:()=>active,isSameAccount:token=>token.owner===context.account.owner&&token.generation===context.account.generation,onToast:message=>toasts.push(message),onDownload:file=>downloads.push(file)});ui.render();
  return {ui,root,utterances,status,check,playButton,downloads,toasts,revoked,get html(){return html;},get writes(){return writes;},get audio(){return audio;},get cancels(){return cancels;},get context(){return context;},get listeners(){return voiceListeners.size;},
    action(action,data={}){return ui.handleAction('listening-'+action,data);},input(field,value){return ui.handleInput({dataset:{listeningField:field},value});},answer(id,value){return ui.handleInput({dataset:{listeningAnswer:id},value});},file(file){return ui.handleInput({dataset:{listeningFile:'true'},files:[file]});},account(owner){context={...context,account:{owner,generation:context.account.generation+1},canEdit:!!owner};},activate(value){active=value;},voices(value){voiceList=value;for(const listener of [...voiceListeners])listener();},timeout(){for(const [id,fn] of [...timers]){timers.delete(id);fn();}}};
}

test('public listening has original lessons and honest synthetic labels without showing the script',()=>{
  const h=harness();assert.match(h.html,/设备合成语音 · 原创练习/);assert.match(h.html,/非真人录音，非 IELTS 真题/);assert.match(h.html,/本轮笔记仅暂存在当前会话/);assert.doesNotMatch(h.html,/Good morning, Greenway Library/);assert.equal(h.context.state.records.length,0);assert.equal(h.ui.handleAction('unrelated'),false);
});

test('original answers require actual speech start, and queued or failed speech is not heard',()=>{
  const h=harness();h.action('step',{step:2});h.action('check');assert.match(h.toasts.at(-1),/先实际播放/);h.action('play');assert.equal(h.utterances.length,1);assert.equal(h.check.disabled,true);assert.match(h.status.textContent,/等待/);h.utterances[0].onerror();assert.equal(h.check.disabled,true);assert.match(h.status.textContent,/未能播放/);h.utterances[0].onstart();assert.equal(h.check.disabled,true);assert.doesNotMatch(h.html,/本轮核对 0/);
});

test('an actual started original practice grades exact answers only on explicit check',()=>{
  const h=harness();h.action('play');h.utterances[0].onstart();h.answer('surname',' mason ');h.answer('day','Tuesday');h.answer('time','6:15');h.answer('cost','nine');assert.doesNotMatch(h.html,/本轮核对 \d/);h.action('check');assert.match(h.html,/本轮核对 3 \/ 4/);assert.match(h.html,/Good morning, Greenway Library/);assert.match(h.html,/参考答案：8/);assert.match(h.html,/不换算 IELTS 分数/);assert.equal(h.context.state.records.length,0);h.answer('cost','8');h.action('check');assert.match(h.html,/本轮核对 3 \/ 4/);
});

test('revealing the script first prevents an independent score until restart',()=>{
  const h=harness();h.action('reveal');assert.match(h.html,/本轮已先查看文本/);h.action('play');h.utterances[0].onstart();h.action('check');assert.doesNotMatch(h.html,/本轮核对 \d/);h.action('restart');assert.doesNotMatch(h.html,/Good morning, Greenway Library/);h.action('check');assert.match(h.toasts.at(-1),/先实际播放/);
});

test('exact normalization accepts predefined numerical variants without semantic guessing',()=>{
  const lesson=D.originals[1];const result=D.grade(lesson,{date:'18th',gate:'north.',volunteers:'twenty–four',bring:'water bottles'});assert.equal(result.correct,3);assert.equal(result.rows[3].correct,false);assert.equal(D.grade(D.official[0],{}),null);assert.equal(D.grade(D.originals[0],{}).correct,0);
});

test('missing English voices time out honestly and late voices cannot begin a stale request',()=>{
  const h=harness({voices:[]});h.action('play');assert.equal(h.utterances.length,0);assert.equal(h.listeners,1);h.timeout();assert.match(h.status.textContent,/未能播放/);assert.equal(h.listeners,0);h.voices([{lang:'en-US'}]);assert.equal(h.utterances.length,0);assert.equal(h.check.disabled,true);
});

test('delayed English voices can start once and use the actual speech onstart signal',()=>{
  const h=harness({voices:[]});h.action('play');h.voices([{lang:'zh-CN'},{lang:'en-US'}]);assert.equal(h.utterances.length,1);assert.equal(h.listeners,0);assert.equal(h.check.disabled,true);h.utterances[0].onstart();assert.equal(h.check.disabled,false);h.timeout();assert.match(h.status.textContent,/正在播放/);
});

test('unsupported speech offers another source without pretending playback occurred',()=>{
  const h=harness({speech:false});h.action('play');assert.match(h.status.textContent,/未能播放/);assert.match(h.toasts[0],/自己的音频或官方练习/);assert.equal(h.check.disabled,true);
});

test('stale speech events cannot redraw another route or survive an account generation change',()=>{
  const h=harness();h.input('gist','private note');h.action('play');const utterance=h.utterances[0];h.activate(false);h.ui.suspend();const writes=h.writes;utterance.onstart();utterance.onend();assert.equal(h.writes,writes);h.account('new-owner');h.activate(true);h.ui.render();assert.doesNotMatch(h.html,/private note/);assert.doesNotMatch(h.ui.getNotes().text,/private note/);utterance.onstart();assert.equal(h.check.disabled,true);
});

test('same-owner new generation and sign-out both clear transient drafts',()=>{
  const h=harness();h.account('A');h.ui.render();h.input('details','first private');h.account('A');h.ui.render();assert.doesNotMatch(h.ui.getNotes().text,/first private/);h.input('gist','second private');h.account(null);h.ui.render();assert.doesNotMatch(h.ui.getNotes().text,/second private/);
});

test('official audio stays an external source with answer entrances behind reveal',()=>{
  const h=harness();h.action('tab',{tab:'official'});assert.match(h.html,/打开官方音频/);assert.match(h.html,/题本 PDF 同时包含答案与文本/);assert.match(h.html,/target="_blank" rel="noopener noreferrer"/);assert.doesNotMatch(h.html,/<audio/);assert.doesNotMatch(h.html,/#page=4/);h.action('reveal');assert.match(h.html,/#page=4/);assert.match(h.html,/未读取你的外站播放或答题结果/);assert.doesNotMatch(h.html,/本轮核对 \d/);
});

test('permitted NASA recording uses a native lazy player and old player events are ignored',()=>{
  const h=harness();h.action('select',{lesson:'nasa-small-step'});assert.match(h.html,/<audio controls preload="none"/);assert.match(h.html,/Credit: NASA/);assert.match(h.html,/非 IELTS 试题/);const old=h.audio;old.fire('playing');assert.match(h.status.textContent,/正在播放/);h.action('select',{lesson:'library-workshop'});const writes=h.writes;old.fire('playing');assert.ok(old.pauses>=1);assert.equal(h.writes,writes);h.action('check');assert.match(h.toasts.at(-1),/先实际播放/);
});

test('local files are object URLs only, safely named, and revoked on account change',()=>{
  const h=harness();h.action('tab',{tab:'local'});h.file({name:'<img src=x onerror=alert(1)>.mp3',type:'audio/mpeg',size:100});assert.match(h.html,/blob:private-local/);assert.match(h.html,/&lt;img src=x onerror=alert\(1\)&gt;\.mp3/);assert.doesNotMatch(h.html,/<img src=x/);assert.match(h.html,/文件不会上传/);h.input('details','local secret');h.account('B');h.ui.render();assert.deepEqual(h.revoked,['blob:private-local']);assert.doesNotMatch(h.ui.getNotes().text,/local secret/);assert.doesNotMatch(h.html,/blob:private-local/);
});

test('local import rejects huge files and non-audio files without clearing an existing draft',()=>{
  const h=harness();h.input('gist','keep me');h.file({name:'x.txt',type:'text/plain',size:10});h.file({name:'x.mp3',type:'audio/mpeg',size:101*1024*1024});assert.equal(h.toasts.length,2);assert.match(h.ui.getNotes().text,/keep me/);assert.doesNotMatch(h.html,/blob:private-local/);
});

test('typed notes are escaped, do not redraw the player, and download only by explicit action',()=>{
  const h=harness();const before=h.writes;h.input('gist','<script>private()</script>');assert.equal(h.writes,before);assert.equal(h.downloads.length,0);h.action('step',{step:1});h.action('step',{step:0});assert.match(h.html,/&lt;script&gt;private\(\)&lt;\/script&gt;/);assert.doesNotMatch(h.html,/<script>private/);h.action('download');assert.equal(h.downloads.length,1);assert.match(h.downloads[0].text,/<script>private\(\)<\/script>/);assert.match(h.downloads[0].text,/尚未核对/);assert.match(h.downloads[0].filename,/^xunci-listening-library-workshop\.txt$/);
});

test('old rendered inputs and file-picker results cannot enter a new lesson or account',()=>{
  const h=harness(),oldEpoch=h.html.match(/data-listening-epoch="(\d+)"/)[1];
  h.action('select',{lesson:'riverside-volunteers'});
  h.ui.handleInput({dataset:{listeningField:'gist',listeningEpoch:oldEpoch},value:'stale private note'});
  assert.doesNotMatch(h.ui.getNotes().text,/stale private note/);
  const pickerEpoch=h.html.match(/data-listening-epoch="(\d+)"/)[1];h.account('B');
  h.ui.handleInput({dataset:{listeningFile:'true',listeningEpoch:pickerEpoch},files:[{name:'old.mp3',type:'audio/mpeg',size:100}]});
  h.ui.render();assert.doesNotMatch(h.html,/old\.mp3|blob:private-local/);
});

test('an old rendered reveal button cannot expose answers in a newly selected lesson',()=>{
  const h=harness(),oldEpoch=h.html.match(/data-listening-epoch="(\d+)"/)[1];
  h.action('select',{lesson:'urban-shade-study'});
  h.action('reveal',{listeningEpoch:oldEpoch});assert.doesNotMatch(h.html,/Today I will describe/);
  h.action('reveal');assert.match(h.html,/Today I will describe/);
});
