/* Listening drafts stay in this browser session; no vocabulary or cloud writes. */
(function(host,factory){const api=factory(host);if(typeof module==='object'&&module.exports)module.exports=api;if(host)host.IELTS_LISTENING_UI=api;})(typeof window!=='undefined'?window:globalThis,function(host){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 14v-3a9 9 0 0 1 18 0v3M3 13h3v8H4a1 1 0 0 1-1-1v-7Zm18 0h-3v8h2a1 1 0 0 0 1-1v-7Z"/></svg>';
  function create(options){
    const o=options||{},root=o.root,D=o.data||host.IELTS_LISTENING_DATA;
    if(!root||!D||typeof o.getContext!=='function')throw new Error('听力页面尚未准备好。');
    const catalog=[...D.originals,...D.official,...(D.archive||[])];
    const restoredPlayers=new WeakSet();
    let owner=null,active=false,sequence=0,formEpoch=0,lessonId=D.originals[0]?.id,tab='onsite',drafts=new Map(),local=null,nativeAudio=null,officialFiles=new Map();
    const current=()=>o.getContext()||{};
    const tokenOf=context=>({owner:context.account?.owner||null,generation:context.account?.generation??null});
    const same=(a,b)=>!!a&&!!b&&a.owner===b.owner&&a.generation===b.generation;
    const toast=message=>o.onToast?.(message);
    const isActive=()=>active&&(!o.isActive||o.isActive());
    const lesson=()=>local?.id===lessonId?local:catalog.find(item=>item.id===lessonId)||D.originals[0];
    function draft(){if(!drafts.has(lessonId))drafts.set(lessonId,{step:0,gist:'',details:'',reflection:'',answers:{},heard:false,revealed:false,result:null,audioStatus:'idle',position:0,rate:1,documentView:'question'});return drafts.get(lessonId);}
    function stop(){sequence++;const d=drafts.get(lessonId);if(d&&nativeAudio&&restoredPlayers.has(nativeAudio)&&Number.isFinite(nativeAudio.currentTime))d.position=nativeAudio.currentTime;try{nativeAudio?.pause();}catch{}nativeAudio=null;if(d&&['playing','waiting'].includes(d.audioStatus))d.audioStatus=d.heard?'heard':'idle';}
    function revokeLocal(){if(local?.audioUrl)try{host.URL?.revokeObjectURL(local.audioUrl);}catch{}local=null;}
    function revokeOfficial(){for(const files of officialFiles.values())for(const key of ['audioUrl','documentUrl'])if(files[key])try{host.URL?.revokeObjectURL(files[key]);}catch{}officialFiles=new Map();}
    function reset(){formEpoch++;stop();revokeLocal();revokeOfficial();drafts=new Map();lessonId=D.originals[0]?.id;tab='onsite';owner=null;active=false;}
    function context(){const latest=current(),token=tokenOf(latest);if(owner&&!same(owner,token)){const clear=isActive();owner=token;active=false;formEpoch++;stop();revokeLocal();revokeOfficial();drafts=new Map();lessonId=D.originals[0]?.id;tab='onsite';if(clear)root.innerHTML='';}owner=token;return latest;}
    function valid(run,token,id){context();return isActive()&&run===sequence&&id===lessonId&&same(token,owner)&&(!token.owner||!o.isSameAccount||o.isSameAccount(token));}
    function suspend(){stop();active=false;}
    const button=(action,label,extra='',secondary=false)=>`<button type="button" class="ln-button${secondary?' ln-button-secondary':''}" data-action="listening-${action}" data-listening-epoch="${formEpoch}" ${extra}>${label}</button>`;
    const link=(url,label,extra='')=>`<a class="ln-button ln-button-secondary" href="${esc(url)}" target="_blank" rel="noopener noreferrer" ${extra}>${esc(label)} <span aria-hidden="true">↗</span></a>`;
    const statusText=status=>({idle:'点击播放器的播放按钮开始；播放本身不会保存学习记录。',waiting:'正在加载音频，请稍候…',playing:'正在播放，可暂停、拖动进度或调节速度。',heard:'已开始过播放，可以填写并核对本轮答案。',unavailable:'音频未能播放。请点重新加载；官方材料也可导入已下载的音频。'}[status]||'');
    function drawStatus(){const d=draft(),status=root.querySelector?.('[data-listening-status]');if(status)status.textContent=statusText(d.audioStatus);const check=root.querySelector?.('[data-listening-check]');if(check)check.disabled=!d.heard||d.revealed;}
    function bindAudio(){
      const audio=root.querySelector?.('audio[data-listening-audio]');if(!audio)return;
      nativeAudio=audio;const run=sequence,token={...owner},id=lessonId;
      const restore=()=>{if(!valid(run,token,id)||nativeAudio!==audio)return;const d=draft();audio.playbackRate=d.rate;if(d.position>0&&Number.isFinite(audio.duration))try{audio.currentTime=Math.min(d.position,Math.max(0,audio.duration-.1));}catch{}restoredPlayers.add(audio);};
      audio.playbackRate=draft().rate;audio.addEventListener('loadedmetadata',restore);
      audio.addEventListener('playing',()=>{if(!valid(run,token,id)||nativeAudio!==audio){try{audio.pause();}catch{}return;}if(!restoredPlayers.has(audio))restore();const d=draft();d.heard=true;d.audioStatus='playing';drawStatus();});
      audio.addEventListener('waiting',()=>{if(valid(run,token,id)&&nativeAudio===audio){draft().audioStatus='waiting';drawStatus();}});
      audio.addEventListener('pause',()=>{if(valid(run,token,id)&&nativeAudio===audio&&draft().audioStatus!=='unavailable'){draft().audioStatus=draft().heard?'heard':'idle';drawStatus();}});
      audio.addEventListener('timeupdate',()=>{if(valid(run,token,id)&&nativeAudio===audio&&restoredPlayers.has(audio)&&Number.isFinite(audio.currentTime))draft().position=audio.currentTime;});
      audio.addEventListener('ended',()=>{if(valid(run,token,id)&&nativeAudio===audio){draft().audioStatus=draft().heard?'heard':'idle';drawStatus();}});
      audio.addEventListener('error',()=>{if(valid(run,token,id)&&nativeAudio===audio){draft().audioStatus='unavailable';drawStatus();}});
    }
    function officialImport(item){const files=officialFiles.get(item.id)||{};return `<details class="ln-official-import"><summary>加载不了？导入已下载的官方文件</summary><p>文件只在此浏览器会话使用，不会上传。刷新或切换账号后需重新选择。</p><div class="ln-import-grid"><label class="ln-file-button">导入官方音频<input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac" data-listening-official-file="audio" data-listening-epoch="${formEpoch}"></label><label class="ln-file-button">导入官方题本 PDF<input type="file" accept="application/pdf,.pdf" data-listening-official-file="document" data-listening-epoch="${formEpoch}"></label></div>${files.audioName?`<p>本地音频：${esc(files.audioName)}</p>`:''}${files.documentName?`<p>本地题本：${esc(files.documentName)}</p>`:''}</details>`;}
    function officialDocument(item,d){
      const view=d.revealed?d.documentView:'question',files=officialFiles.get(item.id)||{},key=view==='answer'?'answerUrl':view==='transcript'?'transcriptUrl':'questionUrl';
      const url=files.documentUrl?files.documentUrl+(item[key].includes('#')?item[key].slice(item[key].indexOf('#')):''):item[key];
      return `<section class="ln-document" aria-label="官方题本查看器"><div class="ln-document-tabs" role="group" aria-label="选择题本内容">${[['question','看题目'],['answer','核对答案'],['transcript','查看文本']].map(([id,label])=>button('document',label,`data-document="${id}" aria-pressed="${view===id}" ${id!=='question'&&!d.revealed?'disabled':''}`,true)).join('')}</div><iframe src="${esc(url)}" title="${esc(item.title)} · ${view==='question'?'官方题目':view==='answer'?'官方答案':'官方文本'}" referrerpolicy="strict-origin-when-cross-origin" ${files.documentUrl?'sandbox="allow-scripts"':''} class="ln-document-frame"></iframe><p class="ln-caption">题本由${files.documentUrl?'你导入的 PDF':'官方原站'}提供，保留原有版权与页码。完整 PDF 可能含答案；独立作答时请只看题目。若显示空白，可在下方导入已下载的题本。</p>${officialImport(item)}</section>`;
    }
    function player(item,d){
      if(item.kind==='original'||item.kind==='official'){
        const official=item.kind==='official',files=officialFiles.get(item.id)||{},url=official?(files.audioUrl||item.audioUrl):item.audioUrl;
        return `<div class="ln-player"><div class="ln-audio-label">${icon}<div><strong>${official?'官方样题 · 站内播放':'站内 MP3 · 原创合成语音'}</strong><span>${official?'原始录音由 IELTS 官方来源提供，题目与版权信息保留原样。':'Kokoro 开源模型 · 英式英语。非真人录音，非 IELTS 真题。'}</span></div></div><audio controls preload="metadata" data-listening-audio src="${esc(url)}">浏览器不支持音频播放器。</audio><div class="ln-audio-tools"><label>播放速度<select data-listening-rate="true" data-listening-epoch="${formEpoch}" aria-label="播放速度">${[.75,1,1.25].map(rate=>`<option value="${rate}" ${d.rate===rate?'selected':''}>${rate} ×</option>`).join('')}</select></label>${button('reload','重新加载音频','',true)}</div><p class="ln-audio-status" data-listening-status role="status">${statusText(d.audioStatus)}</p>${official?`<p class="ln-caption">对应题号 ${esc(item.range)} · <a href="${esc(item.sourcePage)}" target="_blank" rel="noopener noreferrer">官方样题来源与版权 ↗</a></p>`:''}</div>${official?officialDocument(item,d):''}`;
      }
      return `<div class="ln-player"><div class="ln-audio-label">${icon}<div><strong>${item.kind==='local'?'本地音频 · 仅此浏览器会话':'NASA 历史录音 · 真实音频'}</strong><span>${item.kind==='local'?'文件不会上传；切换账号或刷新后需要重新选择。':'泛听补充，非 IELTS 试题 · Credit: NASA'}</span></div></div><audio controls preload="none" data-listening-audio src="${esc(item.audioUrl)}">浏览器不支持音频播放器。</audio><p class="ln-audio-status" data-listening-status role="status">${statusText(d.audioStatus)}</p>${item.sourcePage?`<p class="ln-caption">播放失败时，${link(item.sourcePage,'打开 NASA 来源页')}</p>`:''}</div>`;
    }
    function notes(field,label,placeholder,rows=4){const d=draft();return `<label class="ln-field"><span>${label}</span><textarea data-listening-field="${field}" data-listening-epoch="${formEpoch}" rows="${rows}" maxlength="6000" placeholder="${esc(placeholder)}">${esc(d[field])}</textarea></label>`;}
    function detailQuestions(item,d){
      if(item.kind!=='original')return notes('details',item.kind==='official'?'独立答案与听到的证据':'细节记录 / 自由听写','记录时间、数字、关键词，或写下需要重听的一句。');
      return `<div class="ln-question-intro"><h3>听取具体信息</h3><p>填入你实际听到的内容。不确定可以留空，核对时会标记未答。</p></div><div class="ln-questions">${item.questions.map((q,index)=>`<label class="ln-question"><span><b>${index+1}</b>${esc(q.prompt)}</span><input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="160" data-listening-answer="${esc(q.id)}" data-listening-epoch="${formEpoch}" value="${esc(d.answers[q.id]||'')}" ${d.revealed?'disabled':''} aria-label="第 ${index+1} 题答案"></label>`).join('')}</div>`;
    }
    function compare(item,d){
      if(!d.revealed)return `<div class="ln-compare-prompt"><h3>先独立听，再打开对照</h3><p>${item.kind==='original'?'核对前需实际开始一次播放。核对会显示参考答案与完整文本；提前查看文本后，本轮只做学习对照。':'完成独立记录后，再按需查看来源、文本或答案。打开材料不代表答对或完成学习。'}</p><div class="ln-actions">${item.kind==='original'?button('check','核对本轮答案',`data-listening-check ${!d.heard?'disabled':''}`):''}${button('reveal',item.kind==='official'?'在本页显示答案与文本':item.kind==='original'?'直接查看文本（放弃本轮核对）':'打开对照与复盘','',true)}</div></div>`;
      let content='';
      if(item.kind==='original')content=`${d.result?`<div class="ln-score" role="status"><strong>本轮核对 ${d.result.correct} / ${d.result.total}</strong><span>仅对应这段原创材料，不换算 IELTS 分数，也不写入词汇掌握记录。</span></div><ol class="ln-answer-list">${d.result.rows.map(row=>`<li class="${row.correct?'is-correct':'is-wrong'}"><span>${row.correct?'符合参考答案':row.answer?'需要重听':'未作答'}</span><p>你的答案：${esc(row.answer||'（空）')}<br>参考答案：${esc(row.expected)}</p></li>`).join('')}</ol>`:'<p class="ln-warning">本轮已先查看文本，不再计算独立作答结果。可重开本轮再次练习。</p>'}<details class="ln-transcript" open><summary>原创听力文本</summary><p lang="en">${esc(item.script)}</p></details><p class="ln-caption">核对仅忽略大小写、首尾空格、常见引号和末尾句号；数字写法只接受题目预设的等价形式，不推测语意。</p>`;
      if(item.kind==='official')content='<h3>在本页对照答案与文本</h3><p>在上方题本查看器切换「核对答案」或「查看文本」，对照自己的记录。本轮不自动判分，也不换算 IELTS 分数。</p>';
      if(item.kind==='archive')content=`<h3>重听与了解背景</h3><p>对照你写下的词，再听一次。背景材料不等于逐字文本，本段不自动判分。</p>${link(item.sourcePage,'NASA 历史声音来源')}`;
      if(item.kind==='local')content='<h3>使用你自己的文本核对</h3><p>本网站没有读取音频内容，也没有自动语音识别。请对照你拥有的原文或答案，标出没听清的地方。</p>';
      return `<div class="ln-compare">${content}${notes('reflection','这次为什么没听清？下一遍听什么？','可以记录连读、拼写、数字、同义替换或一个值得复习的表达。',3)}<div class="ln-actions">${button('restart','清空答案，重开本轮','',true)}</div></div>`;
    }
    function render(){const before=owner;context();if(active&&same(before,owner)&&root.querySelector?.('.ln-page'))return;active=true;if(!o.isActive||o.isActive())draw();}
    function draw(){
      if(!isActive())return;
      formEpoch++;
      // Replacing a native player must stop its old node; typed notes never redraw.
      if(nativeAudio)stop();
      const item=lesson(),d=draft(),visible=tab==='official'?D.official:[...D.originals,...(D.archive||[])];
      root.innerHTML=`<section class="ln-page"><header class="ln-heading"><div><span class="ln-eyebrow">LISTEN, NOTICE, UNDERSTAND</span><h1>把听到的，变成听懂的。</h1><p>先听主旨，再抓细节，最后对照重听。一次专注一小段。</p></div><span class="ln-heading-icon">${icon}</span></header><div class="ln-session-note"><span>本轮笔记仅暂存在当前会话；刷新前请下载保存。切换账号会清空。</span>${button('download','下载本轮笔记','',true)}</div><div class="ln-tabs" role="group" aria-label="听力材料来源">${[['onsite','站内练习'],['official','官方样题'],['local','自带音频']].map(([id,label])=>button('tab',label,`data-tab="${id}" aria-pressed="${tab===id}"`,true)).join('')}</div><div class="ln-layout"><aside class="ln-library" aria-label="选择听力材料">${tab==='local'?`<div class="ln-upload"><h2>用自己的材料练习</h2><p>选择有权使用的音频。文件只在浏览器播放，不会上传。</p><label class="ln-file-button">选择本地音频<input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm,.aac,.flac" data-listening-file="true" data-listening-epoch="${formEpoch}"></label>${local?`<p class="ln-file-name">${esc(local.title)}</p>`:''}<p>支持常见音频格式，最多 100 MB；设备不支持的格式可能无法播放。</p></div>`:visible.map(entry=>`<button class="ln-lesson ${item?.id===entry.id?'is-selected':''}" type="button" data-action="listening-select" data-listening-epoch="${formEpoch}" data-lesson="${esc(entry.id)}" aria-pressed="${item?.id===entry.id}"><span>${entry.kind==='official'?'IELTS · 官方来源':entry.kind==='archive'?'NASA · 泛听':'原创 · 站内音频'}</span><strong>${esc(entry.title)}</strong><small>${esc(entry.focus)}</small><em>建议练习 ${entry.minutes} 分钟</em></button>`).join('')}</aside><article class="ln-workspace">${tab==='local'&&!local?`<div class="ln-empty">${icon}<h2>从一段自己的音频开始</h2><p>选择文件后，可以记录主旨、自由听写与复盘。这里不会自动识别或评分。</p></div>`:`<header class="ln-workspace-heading"><span class="ln-eyebrow">${item.kind==='official'?'OFFICIAL SOURCE':item.kind==='original'?'ORIGINAL PRACTICE':item.kind==='local'?'YOUR AUDIO':'HISTORICAL SOUND'}</span><h2>${esc(item.title)}</h2><p>${esc(item.description)}</p></header>${player(item,d)}<div class="ln-steps" role="group" aria-label="练习步骤">${['听主旨','抓细节','对照重听'].map((label,index)=>`<button type="button" data-action="listening-step" data-listening-epoch="${formEpoch}" data-step="${index}" class="${d.step===index?'is-selected':''}" aria-pressed="${d.step===index}"><span>0${index+1}</span>${label}</button>`).join('')}</div><div class="ln-step-content">${d.step===0?`<h3>第一遍，先听懂大意</h3><p class="ln-guidance">${esc(item.gistPrompt||'这段材料在谈什么？谁在说话，目的是什么？先用自己的话记下来。')}</p>${notes('gist','我的主旨笔记','用一两句话写下主要内容。')}${button('step','接着抓细节 →','data-step="1"')}`:d.step===1?`${detailQuestions(item,d)}<div class="ln-next">${button('step','准备对照重听 →','data-step="2"')}</div>`:compare(item,d)}</div>`}</article></div><p class="ln-footer-note">播放、切换步骤和下载都不会计入学习次数。笔记不会自动同步至云端；原创材料只做本轮核对，官方材料由你自行对照答案。</p></section>`;
      bindAudio();
    }
    function play(){
      if(!nativeAudio)return false;
      const audio=nativeAudio,run=sequence,token={...owner},id=lessonId;
      const failed=()=>{if(valid(run,token,id)&&nativeAudio===audio){draft().audioStatus='unavailable';drawStatus();}};
      try{draft().audioStatus='waiting';drawStatus();const pending=audio.play();pending?.catch?.(failed);}catch{failed();}
      return true;
    }
    function getNotes(){context();const item=lesson(),d=draft();return {filename:`xunci-listening-${item?.id||'notes'}.txt`,text:[`循词 · 听力本轮笔记`,item?.title||'',`材料：${item?.kind==='original'?'原创 / 站内 MP3 合成语音':item?.kind==='official'?'官方样题':item?.kind==='local'?'本地音频（未上传）':'NASA 真实历史录音'}`,item?.sourcePage||'','【主旨】',d.gist,'','【细节 / 独立答案】',d.details,...(item?.questions||[]).map(q=>`${q.prompt} ${d.answers[q.id]||'（未答）'}`),'','【复盘】',d.reflection,d.result?`本轮原创答案核对：${d.result.correct}/${d.result.total}（不换算 IELTS 分数）`:d.revealed?'已查看对照材料；没有独立作答评分。':'尚未核对。','笔记未自动上传或写入词汇学习记录。'].join('\n')};}
    function download(){const file=getNotes();if(o.onDownload){o.onDownload(file);return;}try{const url=host.URL.createObjectURL(new host.Blob([file.text],{type:'text/plain;charset=utf-8'})),anchor=host.document.createElement('a');anchor.href=url;anchor.download=file.filename;anchor.click();host.setTimeout(()=>host.URL.revokeObjectURL(url),1000);}catch{toast('当前浏览器无法下载，请先手动复制笔记。');}}
    function handleAction(action,data={}){
      if(!String(action).startsWith('listening-'))return false;context();if(!isActive()||(data.listeningEpoch!==undefined&&Number(data.listeningEpoch)!==formEpoch))return true;const name=action.slice(10),d=draft(),item=lesson();
      if(name==='tab'){if(!['onsite','official','local'].includes(data.tab))return true;stop();tab=data.tab;lessonId=tab==='local'?(local?.id||D.originals[0].id):tab==='official'?D.official[0].id:D.originals[0].id;draw();}
      else if(name==='select'){const next=catalog.find(entry=>entry.id===data.lesson);if(next){stop();lessonId=next.id;draw();}}
      else if(name==='step'){const step=Number(data.step);if(Number.isInteger(step)&&step>=0&&step<=2){stop();d.step=step;draw();}}
      else if(name==='play')play();
      else if(name==='stop'){stop();draw();}
      else if(name==='reload'){stop();d.audioStatus='idle';draw();}
      else if(name==='document'&&item.kind==='official'){if(['question','answer','transcript'].includes(data.document)&&(data.document==='question'||d.revealed)){stop();d.documentView=data.document;draw();}}
      else if(name==='check'&&item.kind==='original'){if(!d.heard){toast('请先实际播放一次，再核对答案。');return true;}if(!d.revealed){stop();d.result=D.grade(item,d.answers);d.revealed=true;d.step=2;draw();}}
      else if(name==='reveal'){stop();d.revealed=true;d.step=2;if(item.kind==='official')d.documentView='answer';draw();}
      else if(name==='restart'){stop();drafts.delete(lessonId);draw();}
      else if(name==='download')download();
      return true;
    }
    function handleInput(target){
      if(!target?.dataset||!('listeningField'in target.dataset||'listeningAnswer'in target.dataset||'listeningFile'in target.dataset||'listeningOfficialFile'in target.dataset||'listeningRate'in target.dataset))return false;
      context();if(!isActive()||(target.dataset.listeningEpoch!==undefined&&Number(target.dataset.listeningEpoch)!==formEpoch))return true;const d=draft();
      if(target.dataset.listeningRate!==undefined){const rate=Number(target.value);if([.75,1,1.25].includes(rate)){d.rate=rate;if(nativeAudio)nativeAudio.playbackRate=rate;}}
      else if(target.dataset.listeningOfficialFile!==undefined){
        const item=lesson(),kind=target.dataset.listeningOfficialFile,file=target.files?.[0];if(item.kind!=='official'||!file||!['audio','document'].includes(kind))return true;
        const pdf=kind==='document',limit=(pdf?25:100)*1024*1024;
        if(!Number.isFinite(file.size)||file.size<=0||file.size>limit||(pdf?!/\.pdf$/i.test(file.name||'')||!['','application/pdf'].includes(String(file.type||'')):!(String(file.type||'').startsWith('audio/')||/\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(file.name||'')))){toast(pdf?'请选择不超过 25 MB 的 PDF 题本。':'请选择不超过 100 MB 的常见音频文件。');return true;}
        if(!host.URL?.createObjectURL){toast('当前浏览器不支持本地文件预览。');return true;}
        const files=officialFiles.get(item.id)||{},key=pdf?'documentUrl':'audioUrl';let url;
        try{url=host.URL.createObjectURL(pdf&&host.Blob?new host.Blob([file],{type:'application/pdf'}):file);}catch{toast('文件无法打开，请重新选择。');return true;}
        stop();if(files[key])try{host.URL.revokeObjectURL(files[key]);}catch{}
        files[key]=url;files[pdf?'documentName':'audioName']=String(file.name||'官方文件').slice(0,200);officialFiles.set(item.id,files);
        if(!pdf){d.heard=false;d.position=0;d.audioStatus='idle';}draw();
      }
      else if(target.dataset.listeningFile!==undefined){
        const file=target.files?.[0];if(!file)return true;
        if(file.size>100*1024*1024||!(String(file.type||'').startsWith('audio/')||/\.(mp3|wav|m4a|ogg|webm|aac|flac|aiff?)$/i.test(file.name||''))){toast('请选择不超过 100 MB 的常见音频文件。');return true;}
        if(!host.URL?.createObjectURL){toast('这个浏览器不支持本地音频播放，请使用其他练习。');return true;}
        stop();revokeLocal();drafts.delete('local-audio');local={id:'local-audio',kind:'local',title:String(file.name||'我的音频').slice(0,200),description:'只在当前浏览器中播放。文件不会上传，也不会自动识别内容。',audioUrl:host.URL.createObjectURL(file)};lessonId=local.id;tab='local';draw();
      }else if(target.dataset.listeningField!==undefined){const field=target.dataset.listeningField;if(['gist','details','reflection'].includes(field))d[field]=String(target.value||'').slice(0,6000);}
      else if(lesson().kind==='original'&&!d.revealed&&lesson().questions.some(q=>q.id===target.dataset.listeningAnswer))d.answers[target.dataset.listeningAnswer]=String(target.value||'').slice(0,160);
      return true;
    }
    return {render,reset,suspend,handleAction,handleInput,getNotes};
  }
  return {create};
});
