const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const D=require('../dist/listening-data.js');

function harness(){
  let html='',writes=0,active=true,context={account:{owner:null,generation:0},canEdit:false,state:{records:[]},date:'2026-10-16'},audio=null,nextUrl=1;
  const revoked=[],created=[],downloads=[],toasts=[],status={textContent:''},check={disabled:true};
  function makeAudio(){
    const listeners={},rejections=[];
    return {pauses:0,plays:0,currentTime:0,duration:100,readyState:0,playbackRate:1,throwOnPlay:false,
      pause(){this.pauses++;},
      play(){this.plays++;if(this.throwOnPlay)throw Error('play blocked');return {catch(fn){rejections.push(fn);}};},
      reject(){for(const fn of rejections.splice(0))fn(Error('play rejected'));},
      addEventListener(name,fn){(listeners[name]||=[]).push(fn);},
      fire(name){if(['loadedmetadata','playing','timeupdate'].includes(name))this.readyState=Math.max(this.readyState,1);for(const fn of listeners[name]||[])fn();}};
  }
  const root={get innerHTML(){return html;},set innerHTML(value){html=value;writes++;audio=value.includes('data-listening-audio src=')?makeAudio():null;const tag=value.match(/<button[^>]*data-listening-check[^>]*>/)?.[0];check.disabled=!tag||/\bdisabled\b/.test(tag);},querySelector(selector){if(selector==='audio[data-listening-audio]')return audio;if(selector==='[data-listening-status]')return status;if(selector==='[data-listening-check]')return html.includes('data-listening-check')?check:null;if(selector==='.ln-page')return html.includes('class="ln-page"')?root:null;return null;}};
  // No speech API: originals must work without installed English device voices.
  const window={IELTS_LISTENING_DATA:D,Blob,URL:{createObjectURL(file){const url='blob:private-local-'+nextUrl++;created.push({url,file});return url;},revokeObjectURL(url){revoked.push(url);}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/listening-ui.js'),'utf8'),{window});
  const ui=window.IELTS_LISTENING_UI.create({root,getContext:()=>context,isActive:()=>active,isSameAccount:token=>token.owner===context.account.owner&&token.generation===context.account.generation,onToast:message=>toasts.push(message),onDownload:file=>downloads.push(file)});ui.render();
  return {ui,root,status,check,downloads,toasts,revoked,created,get html(){return html;},get writes(){return writes;},get audio(){return audio;},get context(){return context;},
    action(action,data={}){return ui.handleAction('listening-'+action,data);},input(field,value){return ui.handleInput({dataset:{listeningField:field},value});},answer(id,value){return ui.handleInput({dataset:{listeningAnswer:id},value});},file(file){return ui.handleInput({dataset:{listeningFile:'true'},files:[file]});},officialFile(kind,file,epoch){return ui.handleInput({dataset:{listeningOfficialFile:kind,...(epoch===undefined?{}:{listeningEpoch:epoch})},files:[file]});},rate(value){return ui.handleInput({dataset:{listeningRate:'true'},value});},account(owner){context={...context,account:{owner,generation:context.account.generation+1},canEdit:!!owner};},activate(value){active=value;},epoch(){return html.match(/data-listening-epoch="(\d+)"/)[1];},audioSrc(){return html.match(/<audio[^>]+src="([^"]+)"/)?.[1];},documentSrc(){return html.match(/<iframe[^>]+src="([^"]+)"/)?.[1];}};
}

test('public originals use bundled MP3s without device speech or exposing the script',()=>{
  const h=harness();assert.match(h.html,/站内 MP3 · 原创合成语音/);assert.match(h.html,/非真人录音，非 IELTS 真题/);assert.match(h.html,/Kokoro 开源模型 · 英式英语/);assert.match(h.html,/本轮笔记仅暂存在当前会话/);assert.equal(h.audioSrc(),D.originals[0].audioUrl);assert.match(h.audioSrc(),/^\/assets\/listening\/.+\.mp3(?:\?v=[a-f0-9]{12})?$/);assert.doesNotMatch(h.html,/Good morning, Greenway Library/);assert.equal(h.context.state.records.length,0);assert.equal(h.ui.handleAction('unrelated'),false);
});

test('pending, rejected or synchronously blocked native play never enables original grading',()=>{
  const h=harness();h.action('step',{step:2});h.action('check');assert.match(h.toasts.at(-1),/先实际播放/);h.action('play');assert.equal(h.audio.plays,1);assert.equal(h.check.disabled,true);assert.match(h.status.textContent,/加载/);h.audio.fire('waiting');assert.equal(h.check.disabled,true);h.audio.reject();assert.equal(h.check.disabled,true);assert.match(h.status.textContent,/未能播放/);h.action('check');assert.match(h.toasts.at(-1),/先实际播放/);h.action('reload');h.audio.throwOnPlay=true;h.action('play');assert.equal(h.check.disabled,true);assert.match(h.status.textContent,/未能播放/);assert.doesNotMatch(h.html,/本轮核对 0/);
});

test('only actual native playing enables exact grading, which requires explicit check',()=>{
  const h=harness();h.audio.fire('playing');h.answer('surname',' mason ');h.answer('day','Tuesday');h.answer('time','6:15');h.answer('cost','nine');assert.doesNotMatch(h.html,/本轮核对 \d/);h.action('check');assert.match(h.html,/本轮核对 3 \/ 4/);assert.match(h.html,/Good morning, Greenway Library/);assert.match(h.html,/参考答案：8/);assert.match(h.html,/不换算 IELTS 分数/);assert.equal(h.context.state.records.length,0);h.answer('cost','8');h.action('check');assert.match(h.html,/本轮核对 3 \/ 4/);
});

test('revealing the script first prevents an independent score until restart',()=>{
  const h=harness();h.action('reveal');assert.match(h.html,/本轮已先查看文本/);h.audio.fire('playing');h.action('check');assert.doesNotMatch(h.html,/本轮核对 \d/);h.action('restart');assert.doesNotMatch(h.html,/Good morning, Greenway Library/);h.action('check');assert.match(h.toasts.at(-1),/先实际播放/);
});

test('exact normalization accepts predefined numerical variants without semantic guessing',()=>{
  const lesson=D.originals[1];const result=D.grade(lesson,{date:'18th',gate:'north.',volunteers:'twenty–four',bring:'water bottles'});assert.equal(result.correct,3);assert.equal(result.rows[3].correct,false);assert.equal(D.grade(D.official[0],{}),null);assert.equal(D.grade(D.originals[0],{}).correct,0);
});

test('same-route renders and typed notes preserve the live native player, position and rate',()=>{
  const h=harness(),player=h.audio;player.fire('playing');player.currentTime=23.5;player.fire('timeupdate');h.rate('1.25');const writes=h.writes,pauses=player.pauses;h.input('gist','preserved note');h.ui.render();h.ui.render();assert.equal(h.audio,player);assert.equal(h.writes,writes);assert.equal(player.pauses,pauses);assert.equal(player.currentTime,23.5);assert.equal(player.playbackRate,1.25);assert.match(h.ui.getNotes().text,/preserved note/);h.rate('99');assert.equal(player.playbackRate,1.25);
});

test('step changes, stop and reload restore position and speed and keep replay functional',()=>{
  const h=harness(),first=h.audio;first.fire('loadedmetadata');first.currentTime=32;first.fire('timeupdate');h.rate('.75');h.action('step',{step:1});assert.ok(first.pauses>=1);let current=h.audio;current.fire('loadedmetadata');assert.equal(current.currentTime,32);assert.equal(current.playbackRate,.75);h.action('play');assert.equal(current.plays,1);current.fire('playing');h.action('stop');assert.ok(current.pauses>=1);current=h.audio;current.fire('loadedmetadata');assert.equal(current.currentTime,32);h.action('play');assert.equal(current.plays,1);h.action('reload');current=h.audio;current.fire('loadedmetadata');assert.equal(current.currentTime,32);assert.equal(current.playbackRate,.75);h.action('play');assert.equal(current.plays,1);current.fire('playing');h.action('step',{step:2});assert.equal(h.check.disabled,false);
});

test('late player events and rejected promises cannot mutate another lesson or suspended route',()=>{
  const h=harness(),old=h.audio;h.action('play');h.action('select',{lesson:'riverside-volunteers'});const next=h.audio,writes=h.writes;for(const event of ['playing','error','ended','timeupdate'])old.fire(event);old.reject();assert.equal(h.audio,next);assert.equal(h.writes,writes);assert.ok(old.pauses>=1);h.action('check');assert.match(h.toasts.at(-1),/先实际播放/);h.activate(false);h.ui.suspend();const status=h.status.textContent;next.fire('playing');next.fire('error');assert.equal(h.status.textContent,status);assert.equal(h.writes,writes);
});

test('stale audio callbacks before account render cannot leave another account private DOM visible',()=>{
  const h=harness();h.input('gist','private old owner');h.action('step',{step:1});h.action('step',{step:0});assert.match(h.html,/private old owner/);const old=h.audio;h.account('new-owner');old.fire('playing');h.ui.render();assert.doesNotMatch(h.html,/private old owner/);assert.doesNotMatch(h.ui.getNotes().text,/private old owner/);h.action('check');assert.match(h.toasts.at(-1),/先实际播放/);
});

test('same-owner generation changes and sign-out clear drafts even when getNotes runs before render',()=>{
  const h=harness();h.account('A');h.ui.render();h.input('gist','first private');h.action('step',{step:1});h.action('step',{step:0});assert.match(h.html,/first private/);h.account('A');assert.doesNotMatch(h.ui.getNotes().text,/first private/);h.ui.render();assert.doesNotMatch(h.html,/first private/);h.input('gist','second private');h.account(null);h.ui.render();assert.doesNotMatch(h.ui.getNotes().text,/second private/);
});

test('official audio and question PDF stay on this page with answer and transcript controls gated',()=>{
  const h=harness();h.action('tab',{tab:'official'});const item=D.official[0];assert.equal(h.audioSrc(),item.audioUrl);assert.equal(h.documentSrc(),item.questionUrl);assert.match(h.html,/官方样题 · 站内播放/);assert.match(h.html,/官方题本查看器/);assert.match(h.html,/完整 PDF 可能含答案/);assert.doesNotMatch(h.html,/打开官方音频|打开题本/);assert.match(h.html,/data-document="answer"[^>]*disabled/);assert.match(h.html,/data-document="transcript"[^>]*disabled/);h.action('document',{document:'answer'});assert.equal(h.documentSrc(),item.questionUrl);h.action('document',{document:'transcript'});assert.equal(h.documentSrc(),item.questionUrl);h.action('reveal');assert.equal(h.documentSrc(),item.answerUrl);h.action('document',{document:'transcript'});assert.equal(h.documentSrc(),item.transcriptUrl);assert.match(h.html,/本轮不自动判分/);assert.doesNotMatch(h.html,/本轮核对 \d/);
});

test('all official sample selectors use their corresponding audio and PDF question pages',()=>{
  const h=harness();h.action('tab',{tab:'official'});for(const item of D.official){h.action('select',{lesson:item.id});assert.equal(h.audioSrc(),item.audioUrl);assert.equal(h.documentSrc(),item.questionUrl);assert.equal(new URL(h.documentSrc()).hostname,'cdn.ielts.org');}
});

test('switching official PDF views preserves independent notes, playback position and speed',()=>{
  const h=harness();h.action('tab',{tab:'official'});h.input('details','my independent answer');h.audio.fire('loadedmetadata');h.audio.currentTime=19;h.audio.fire('timeupdate');h.rate('1.25');h.action('reveal');h.action('document',{document:'transcript'});h.audio.fire('loadedmetadata');assert.equal(h.audio.currentTime,19);assert.equal(h.audio.playbackRate,1.25);assert.match(h.ui.getNotes().text,/my independent answer/);assert.match(h.ui.getNotes().text,/没有独立作答评分/);h.action('document',{document:'question'});assert.equal(h.documentSrc(),D.official[0].questionUrl);assert.match(h.ui.getNotes().text,/my independent answer/);
});

test('official audio and PDF imports remain private, safely named, replaceable and account-bound',()=>{
  const h=harness();h.action('tab',{tab:'official'});h.input('details','personal official notes');h.officialFile('audio',{name:'<img src=x onerror=alert(1)>.mp3',type:'audio/mpeg',size:100});assert.equal(h.audioSrc(),'blob:private-local-1');assert.match(h.html,/&lt;img src=x onerror=alert\(1\)&gt;\.mp3/);assert.doesNotMatch(h.html,/<img src=x/);h.officialFile('document',{name:'my paper.pdf',type:'application/pdf',size:200});assert.equal(h.documentSrc(),'blob:private-local-2#page='+D.official[0].questionPage);assert.match(h.html,/sandbox="allow-scripts"/);assert.match(h.html,/文件只在此浏览器会话使用，不会上传/);assert.match(h.ui.getNotes().text,/personal official notes/);h.officialFile('audio',{name:'new recording.mp3',type:'audio/mpeg',size:100});assert.equal(h.audioSrc(),'blob:private-local-3');assert.deepEqual(h.revoked,['blob:private-local-1']);h.account('B');h.ui.render();assert.deepEqual(h.revoked.sort(),['blob:private-local-1','blob:private-local-2','blob:private-local-3']);assert.doesNotMatch(h.html,/blob:private-local|my paper|personal official notes/);assert.doesNotMatch(h.ui.getNotes().text,/personal official notes/);assert.equal(h.context.state.records.length,0);
});

test('replacing an official PDF preserves recorded answers, reveal state and original grading',()=>{
  const h=harness();h.audio.fire('playing');h.answer('surname','Mason');h.action('check');assert.match(h.html,/本轮核对 1 \/ 4/);h.action('tab',{tab:'official'});h.input('details','my official answers');h.audio.fire('playing');h.action('reveal');h.officialFile('document',{name:'first.pdf',type:'application/pdf',size:100});const first=h.created.at(-1).url;assert.equal(h.documentSrc(),first+'#page='+D.official[0].answerPage);h.officialFile('document',{name:'replacement.pdf',type:'application/pdf',size:100});assert.deepEqual(h.revoked,[first]);assert.match(h.ui.getNotes().text,/my official answers/);assert.match(h.ui.getNotes().text,/没有独立作答评分/);assert.equal(h.documentSrc(),h.created.at(-1).url+'#page='+D.official[0].answerPage);h.action('tab',{tab:'onsite'});assert.match(h.html,/本轮核对 1 \/ 4/);assert.match(h.html,/你的答案：Mason/);
});

test('invalid and oversized official imports do not replace existing files or private drafts',()=>{
  const h=harness();h.action('tab',{tab:'official'});h.input('details','keep this answer');h.officialFile('audio',{name:'valid.mp3',type:'audio/mpeg',size:100});const source=h.audioSrc();for(const file of [{name:'x.txt',type:'text/plain',size:10},{name:'x.mp3',type:'audio/mpeg',size:101*1024*1024},{name:'x.mp3',type:'audio/mpeg',size:0}])h.officialFile('audio',file);for(const file of [{name:'x.html',type:'text/html',size:10},{name:'x.pdf',type:'text/html',size:10},{name:'x.pdf',type:'application/pdf',size:26*1024*1024},{name:'x.pdf',type:'application/pdf',size:NaN}])h.officialFile('document',file);assert.equal(h.toasts.length,7);assert.equal(h.audioSrc(),source);assert.equal(h.created.length,1);assert.deepEqual(h.revoked,[]);assert.match(h.ui.getNotes().text,/keep this answer/);
});

test('late official file-picker results cannot import into another lesson, account or stale form',()=>{
  const h=harness();h.action('tab',{tab:'official'});const old=h.epoch();h.action('select',{lesson:D.official[1].id});h.officialFile('document',{name:'old.pdf',type:'application/pdf',size:100},old);assert.equal(h.created.length,0);const current=h.epoch();h.account('B');h.officialFile('audio',{name:'old.mp3',type:'audio/mpeg',size:100},current);h.ui.render();assert.equal(h.created.length,0);assert.doesNotMatch(h.html,/old\.pdf|old\.mp3|blob:/);
});

test('permitted NASA recording uses a native lazy player and old player events are ignored',()=>{
  const h=harness();h.action('select',{lesson:'nasa-small-step'});assert.match(h.html,/<audio controls preload="none"/);assert.match(h.html,/Credit: NASA/);assert.match(h.html,/非 IELTS 试题/);const old=h.audio;old.fire('playing');assert.match(h.status.textContent,/正在播放/);h.action('select',{lesson:'library-workshop'});const writes=h.writes;old.fire('playing');assert.ok(old.pauses>=1);assert.equal(h.writes,writes);h.action('check');assert.match(h.toasts.at(-1),/先实际播放/);
});

test('local files are object URLs only, safely named, and revoked on replacement and account change',()=>{
  const h=harness();h.action('tab',{tab:'local'});h.file({name:'<img src=x onerror=alert(1)>.mp3',type:'audio/mpeg',size:100});assert.equal(h.audioSrc(),'blob:private-local-1');assert.match(h.html,/&lt;img src=x onerror=alert\(1\)&gt;\.mp3/);assert.doesNotMatch(h.html,/<img src=x/);assert.match(h.html,/文件不会上传/);h.file({name:'replacement.mp3',type:'audio/mpeg',size:100});assert.deepEqual(h.revoked,['blob:private-local-1']);h.input('details','local secret');h.account('B');h.ui.render();assert.deepEqual(h.revoked,['blob:private-local-1','blob:private-local-2']);assert.doesNotMatch(h.ui.getNotes().text,/local secret/);assert.doesNotMatch(h.html,/blob:private-local/);
});

test('local import rejects huge files and non-audio files without clearing an existing draft',()=>{
  const h=harness();h.input('gist','keep me');h.file({name:'x.txt',type:'text/plain',size:10});h.file({name:'x.mp3',type:'audio/mpeg',size:101*1024*1024});assert.equal(h.toasts.length,2);assert.match(h.ui.getNotes().text,/keep me/);assert.doesNotMatch(h.html,/blob:private-local/);
});

test('typed notes are escaped, do not redraw the player, and download only by explicit action',()=>{
  const h=harness();const before=h.writes;h.input('gist','<script>private()</script>');assert.equal(h.writes,before);assert.equal(h.downloads.length,0);h.action('step',{step:1});h.action('step',{step:0});assert.match(h.html,/&lt;script&gt;private\(\)&lt;\/script&gt;/);assert.doesNotMatch(h.html,/<script>private/);h.action('download');assert.equal(h.downloads.length,1);assert.match(h.downloads[0].text,/<script>private\(\)<\/script>/);assert.match(h.downloads[0].text,/尚未核对/);assert.match(h.downloads[0].filename,/^xunci-listening-library-workshop\.txt$/);
});

test('old rendered inputs and file-picker results cannot enter a new lesson or account',()=>{
  const h=harness(),oldEpoch=h.epoch();h.action('select',{lesson:'riverside-volunteers'});h.ui.handleInput({dataset:{listeningField:'gist',listeningEpoch:oldEpoch},value:'stale private note'});assert.doesNotMatch(h.ui.getNotes().text,/stale private note/);const pickerEpoch=h.epoch();h.account('B');h.ui.handleInput({dataset:{listeningFile:'true',listeningEpoch:pickerEpoch},files:[{name:'old.mp3',type:'audio/mpeg',size:100}]});h.ui.render();assert.doesNotMatch(h.html,/old\.mp3|blob:private-local/);
});

test('an old rendered reveal button cannot expose answers in a newly selected lesson',()=>{
  const h=harness(),oldEpoch=h.epoch();h.action('select',{lesson:'urban-shade-study'});h.action('reveal',{listeningEpoch:oldEpoch});assert.doesNotMatch(h.html,/Today I will describe/);h.action('reveal');assert.match(h.html,/Today I will describe/);
});
