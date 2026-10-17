/* Account-scoped practice sessions. Viewing, hints and checking never save a review. */
(function (host, factory) {
  const api = factory(host);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (host) host.IELTS_PRACTICE_UI = api;
})(typeof window !== 'undefined' ? window : globalThis, function (host) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icons = {
    guided: '<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1V5Z"/>',
    flashcard: '<rect x="5" y="7" width="16" height="14" rx="2"/><path d="M17 3H5a2 2 0 0 0-2 2v12m6-4h8m-8 4h5"/>',
    meaning: '<path d="m3 6 1 1 2-2m3 1h12M3 12l1 1 2-2m3 1h12M3 18l1 1 2-2m3 1h12"/>',
    spelling: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M7 16h10"/>',
    listening: '<path d="M3 14v-3a9 9 0 0 1 18 0v3M3 13h3v8H4a1 1 0 0 1-1-1v-7Zm18 0h-3v8h2a1 1 0 0 0 1-1v-7Z"/>',
    cloze: '<path d="M3 5h18M3 12h5m8 0h5M3 19h18m-9-11v8m-2-8h4m-4 8h4"/>',
    collocation: '<path d="m10 7 3-3a5 5 0 0 1 7 7l-3 3m-3 3-3 3a5 5 0 0 1-7-7l3-3m1 6 8-8"/>',
    writing: '<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15l-1 5Zm8 0h9"/>'
  };
  function create(options) {
    const o = options || {}, root = o.root, E = o.engine, P = o.practice || host.IELTS_PRACTICE, B = o.batches || host.IELTS_PRACTICE_BATCHES;
    if (!root || !E || !P || typeof o.getContext !== 'function') throw new Error('练习页面尚未准备好。');
    let selectedMode = 'guided', owner = null, session = null, sequence = 0, active = false;
    const modeById = new Map(P.modes.map(mode => [mode.id, mode]));
    const toast = message => o.onToast?.(message);
    const currentContext = () => o.getContext() || {};
    const tokenOf = context => ({owner:context.account?.owner || null,generation:context.account?.generation});
    const matches = (first, second) => !!first?.owner && first.owner === second?.owner && first.generation === second?.generation;
    function allowed(context, token) {
      return !!context.canEdit && !!context.account?.owner && (!token || (matches(token, tokenOf(context)) && (!o.isSameAccount || o.isSameAccount(token))));
    }
    function stopAudio() { sequence++; o.stopAudio?.(); if (session?.card && session.card.audioStatus !== 'unavailable') session.card.audioStatus = 'idle'; }
    function clearSession() { stopAudio(); session = null; }
    function reset() { clearSession(); selectedMode = 'guided'; owner = null; active = false; }
    function suspend() { stopAudio(); active = false; }
    const isActive = () => active && (!o.isActive || o.isActive());
    function context() {
      const latest = currentContext(), token = tokenOf(latest);
      if (owner && (!allowed(latest, owner))) { clearSession(); selectedMode = 'guided'; }
      owner = allowed(latest) ? token : null;
      return latest;
    }
    function requireOwner() {
      const latest = context();
      if (allowed(latest)) return latest;
      o.requireAccount?.(); return null;
    }
    const modeName = id => modeById.get(id)?.name || '词汇练习';
    const recordBatch = record => record.batch || record.origins?.[0]?.batch || '自主提交';
    const icon = id => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[id] || icons.guided}</svg>`;
    const button = (action, text, extra = '', secondary = false) => `<button type="button" class="practice-button${secondary ? ' practice-button-secondary' : ''}" data-action="practice-${action}" ${session?.card ? `data-card="${session.card.key}"` : ''} ${extra}>${text}</button>`;
    function available(mode, record, records) {
      if (record.needsContent && mode !== 'guided') return {available:false,reason:'这个词的教案尚未补充完整，先理解已有内容或补充教案。'};
      return P.availability(mode, record, records);
    }
    function heading(title, description, eyebrow = 'YOUR PRACTICE, YOUR WAY', action = '') {
      return `<header class="practice-heading"><div><span class="practice-eyebrow">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div>${action}</header>`;
    }
    function batchPlan(latest) {
      if (B?.build) return B.build(latest.state.records, latest.date, latest.state.preferences, E, {groupSize:6});
      // Older cached pages can still start a small, capped session while the new module refreshes.
      const records = latest.state.records, confirmedToday = record => record.reviewHistory?.some(event => event.date === latest.date);
      const due = E.due(records, latest.date).filter(record => !confirmedToday(record));
      const queue = E.studyQueue(records, latest.date, latest.state.preferences, due.filter(record => !record.needsContent).map(record => record.id));
      const groups = [];
      for (let index = 0; index < queue.length; index += 6) {
        const recordIds = queue.slice(index,index+6).map(record => record.id);
        groups.push({id:`ready-${index/6+1}`,label:`优先练习 · 第 ${index/6+1} 组`,recordIds,count:recordIds.length,stage:'recall',reason:'按当前个人复习安排练习，每次只专注一小组。'});
      }
      const needsContent = due.filter(record => record.needsContent).length;
      return {groups,queueIds:queue.map(record => record.id),groupSize:6,needsContentIds:due.filter(record => record.needsContent).map(record => record.id),counts:{dueTotal:due.length,planned:queue.length,backlog:Math.max(0,due.length-queue.length-needsContent),completedToday:records.filter(confirmedToday).length,needsContent}};
    }
    function renderBatchPlan(plan, records) {
      const counts = plan.counts;
      const incompleteIds = plan.needsContentIds || [];
      const incomplete = incompleteIds.map(id => records.find(record => record.id === id)).find(Boolean);
      return `<section class="practice-batches" aria-labelledby="practice-groups-heading"><div class="practice-section-title"><h2 id="practice-groups-heading">按学习状态，分成小组</h2><p>每组最多 ${plan.groupSize} 词。先修复错误，再回忆到期词，最后理解新词。</p></div><div class="practice-batch-overview"><div><span>本轮安排</span><strong>${counts.planned}<small>词</small></strong></div><div><span>今日已确认</span><strong>${counts.completedToday}<small>词</small></strong></div><div><span>仍待后续安排</span><strong>${counts.backlog}<small>词</small></strong></div></div>${plan.groups.map((group,index) => `<div class="practice-batch" data-stage="${esc(group.stage)}"><span class="practice-batch-mark" aria-hidden="true">${String(index+1).padStart(2,'0')}</span><div><h3>${esc(group.label)}</h3><p>${esc(group.reason)}</p></div><span class="practice-batch-count">${group.count} 词</span>${button('batch','开始 <span aria-hidden="true">→</span>',`data-group="${esc(group.id)}"`,true)}</div>`).join('')}<p class="practice-batch-note">${counts.dueTotal} 个到期或待补词中，本轮安排 ${counts.planned} 个。${counts.backlog ? `其余 ${counts.backlog} 个保留原复习日期，可分轮继续；新词仍受每日上限约束。` : '每次确认后重新计算下一组。'}${counts.needsContent ? `另有 ${counts.needsContent} 个需先补充完整教案。` : ''}</p>${incomplete && counts.needsContent ? `<div class="practice-content-notice"><p>先补充完整教案，再把这些词加入练习安排。</p>${button('edit-missing','补充教案',`data-record="${esc(incomplete.id)}"`,true)}</div>` : ''}<details class="practice-group-rationale"><summary>分组依据</summary><p>优先修复词卡中尚未解决的错误；其后安排已经学过的到期词，再安排首次学习。符合条件的词会交错原始录入批次，避免只按导入顺序练习。分组不会改变个人间隔复习日期，也不会因浏览或切换方法增加学习次数。</p></details></section>`;
    }
    function renderLanding(latest) {
      const signedIn = allowed(latest), records = signedIn ? latest.state.records : [];
      const plan = signedIn ? batchPlan(latest) : null;
      const queue = plan ? plan.queueIds.map(id => records.find(record => record.id === id)).filter(Boolean) : [];
      const active = modeById.get(selectedMode) || P.modes[0];
      root.innerHTML = `<section class="practice-page">${heading('找到适合你的练习方式', '先理解，再回忆，再用起来。选择今天想练的一项，从自己的词库开始。')}
        <section class="practice-hero" aria-labelledby="practice-selected-name"><div class="practice-hero-copy"><span class="practice-eyebrow">TODAY’S FOCUS</span><h2 id="practice-selected-name">${esc(active.name)}</h2><p>${esc(active.description)}</p><div class="practice-hero-meta"><span>${signedIn ? (plan.groups[0] ? `当前小组 ${plan.groups[0].count} 词 · 本轮 ${queue.length} 词` : '本轮暂无可练词汇') : '登录后读取个人词库'}</span><span>由你明确确认后保存</span></div>${button('start', signedIn ? (queue.length ? '开始这一小组 <span aria-hidden="true">→</span>' : '查看词库') : '登录并开始', !queue.length && signedIn ? 'data-empty="true"' : '')}</div><div class="practice-hero-art" aria-hidden="true"><span class="practice-art-back">RECALL</span><span class="practice-art-card">${icon(selectedMode)}<b>${esc(active.focus || 'PRACTICE')}</b><i>Make it yours.</i></span><span class="practice-art-dot"></span></div></section>
        <div class="practice-section-title"><h2>八种方式，一份自己的词库</h2><p>每次选择一种，学习中也可以切换。</p></div><div class="practice-mode-grid" role="group" aria-label="选择练习方式">${P.modes.map((mode, index) => {
          const count = queue.filter(record => available(mode.id, record, records).available && !(mode.id === 'guided' && record.needsContent)).length;
          return `<button type="button" class="practice-mode-card ${mode.id === selectedMode ? 'is-selected' : ''}" aria-pressed="${mode.id === selectedMode}" data-action="practice-mode" data-mode="${esc(mode.id)}"><span class="practice-mode-top"><span class="practice-mode-icon">${icon(mode.id)}</span><span class="practice-mode-number">0${index + 1}</span></span><span class="practice-mode-name">${esc(mode.name)}<span class="practice-selected-dot" aria-hidden="true"></span></span><span class="practice-mode-description">${esc(mode.description)}</span><span class="practice-mode-foot">${esc(mode.focus || '')}<span>${signedIn ? count + ' 词可练' : '个人词库'}</span></span></button>`;
        }).join('')}</div>
        ${!signedIn ? `<div class="practice-notice"><strong>你的练习，只属于你。</strong><p>先登录邮箱，即可读取自己的词库与安排。</p>${button('login', '邮箱登录', '', true)}</div>` : !queue.length ? `<section class="practice-empty"><h2>${!records.length ? '从第一个陌生词开始' : plan.counts.needsContent ? '先补充词卡，再开始练习' : plan.counts.backlog ? '今天的新词量已完成' : '今天暂时没有到期词汇'}</h2><p>${!records.length ? '把想学的词或短语加入词库，补充教案后即可练习。' : plan.counts.needsContent ? '这些词的讲解还不完整，补充后会按个人安排加入小组。' : plan.counts.backlog ? '你可以回看词卡，或明天继续下一组。' : '复习会按已有安排出现；现在也可以去词库回看。'}</p><a href="#library" class="practice-link">打开我的词库 <span aria-hidden="true">↗</span></a></section>${records.length && (plan.counts.dueTotal || plan.counts.completedToday) ? renderBatchPlan(plan,records) : ''}` : renderBatchPlan(plan,records)}
        <details class="practice-principles"><summary>怎样记录这次练习？</summary><p>查看、翻卡和核对都不会自动增加学习次数。完成后由你确认保存；客观核对、自评与讲解学习会分别显示。提示后的答案会单独标记，造句由你自行对照词卡评估。</p></details></section>`;
    }
    function start(selectedIds = null) {
      const latest = requireOwner(); if (!latest) return false;
      const plan = batchPlan(latest), requested = selectedIds === null ? null : new Set(Array.isArray(selectedIds) ? selectedIds : []);
      const ids = requested ? plan.queueIds.filter(id => requested.has(id)).slice(0,plan.groupSize) : plan.groups[0]?.recordIds || [];
      const queue = ids.map(id => latest.state.records.find(record => record.id === id)).filter(Boolean);
      if (!queue.length) { clearSession(); render(); toast(latest.state.records.length ? '这组暂时没有可练词汇，请查看词库或下一次安排。' : '先把想学的词加入个人词库。'); return false; }
      clearSession();
      session = {token:tokenOf(latest),ids:queue.map(record => record.id),index:0,mode:selectedMode,card:null,results:[],run:++sequence,exposed:false,firstAttempt:null};
      o.onRouteReview?.(); render(); return true;
    }
    function currentCard(latest) {
      if (!session || !allowed(latest, session.token) || session.index >= session.ids.length) return null;
      const record = latest.state.records.find(item => item.id === session.ids[session.index]);
      if (!record) { clearSession(); toast('词库已更新，请重新选择这一组。'); return null; }
      const scheduled = E.dueDate(record);
      if (record.level === 'C' || !scheduled || scheduled > latest.date || record.reviewHistory?.some(event => event.date === latest.date)) {
        clearSession(); toast('这个词的学习安排已更新，请从当前小组继续。'); return null;
      }
      const contentKey = JSON.stringify([record.word,record.displayWord,record.meaning,record.ipa,record.pos,record.example,record.exampleEn,record.exampleZh,record.collocations,record.memory,record.family,record.synonyms,record.needsContent]);
      if (session.card && session.card.contentKey !== contentKey) {
        stopAudio(); session.card = null; session.firstAttempt = null; session.exposed = true;
        toast('词卡讲解已更新，本词练习已重新准备。');
      }
      if (!session.card) {
        const status = available(session.mode, record, latest.state.records);
        session.card = {recordId:record.id,mode:session.mode,available:status.available,reason:status.reason,exercise:status.available ? P.makeExercise(session.mode, record, latest.state.records) : null,
          key:++sequence,contentKey,answer:'',lockedAnswer:null,grade:null,revealed:false,assisted:session.exposed,hintShown:false,audioHeard:false,audioStatus:'idle',audioNonce:0,validation:'',committing:false};
      }
      return {record,card:session.card};
    }
    function teaching(record) { return `<section class="practice-teaching" aria-label="词卡讲解">${o.renderTeaching ? o.renderTeaching(record) : `<p>${esc(record.meaning || '释义待补充')}</p>`}</section>`; }
    function methodSwitcher() { return `<div class="practice-method-switcher" role="group" aria-label="本组练习方式">${P.modes.map(mode => `<button type="button" data-action="practice-mode" data-mode="${esc(mode.id)}" aria-pressed="${session.mode === mode.id}" class="${session.mode === mode.id ? 'is-selected' : ''}">${esc(mode.name)}</button>`).join('')}</div>`; }
    function audioButton(card, hidden) { return `<div class="practice-audio-row">${button('audio', `${icon('listening')} ${card.audioStatus === 'loading' ? '正在准备发音…' : card.audioHeard ? '再听一次' : '播放英式发音'}`, card.audioStatus === 'loading' ? 'disabled' : '', true)}<span role="status">${card.audioStatus === 'unavailable' ? '当前没有可播放的发音，请换一种方式或稍后重试。' : card.audioStatus === 'recording' ? '正在播放词典录音' : card.audioStatus === 'speech' ? '正在播放设备英式语音' : hidden ? '播放后再作答，词形将在核对时显示。' : ''}</span></div>`; }
    function renderExercise(record, card) {
      if (!card.available) return `<div class="practice-unavailable"><span class="practice-eyebrow">ANOTHER WAY IN</span><h2>换个入口，继续理解这个词</h2><p>${esc(card.reason)}</p><div class="practice-actions">${button('guided', '先看词卡讲解')}${button('edit', '补充教案', '', true)}</div></div>`;
      const ex = card.exercise, hiddenWord = ['spelling', 'listening', 'cloze'].includes(card.mode) && !card.grade && !card.revealed;
      const showIPA = !hiddenWord && !!record.ipa;
      let body = `<div class="practice-question"><span class="practice-eyebrow">${esc(modeById.get(card.mode)?.focus || '')}</span><h2 ${card.mode === 'cloze' ? 'class="practice-cloze-prompt"' : ''}>${esc(ex.prompt)}</h2>${showIPA ? `<p class="practice-ipa">${esc(record.ipa)}</p>` : ''}<p class="practice-subprompt">${esc(ex.subprompt)}</p></div>`;
      if (card.mode === 'listening') body += audioButton(card, hiddenWord);
      else if (!hiddenWord) body += `<button type="button" class="practice-small-audio" data-action="practice-audio" data-card="${card.key}" aria-label="播放这个词的英式发音">${icon('listening')} 听发音</button>`;
      if (ex.kind === 'guided') { session.exposed = true; return body + teaching(record) + (record.needsContent ? `<div class="practice-notice"><p>先补充完整教案，再确认这次学习。</p>${button('edit', '补充教案')}</div>` : `<footer class="practice-card-footer"><span>确认理解后，保存一次学习记录。</span>${button('studied', session.firstAttempt ? '保存最初作答，继续 <span aria-hidden="true">→</span>' : '已读懂，保存并继续 <span aria-hidden="true">→</span>')}</footer>`); }
      if (ex.kind === 'self') {
        if (!card.revealed) return body + `<div class="practice-flash-space"><span>在心里回忆词义和一个常用搭配。</span>${button('reveal', '翻卡核对 <span aria-hidden="true">↻</span>')}</div><p class="practice-save-note">翻卡不会自动记录；核对后再选择自评结果。</p>`;
        return body + teaching(record) + `<footer class="practice-card-footer"><span>这次回忆由你自行评估。</span><div class="practice-actions">${button('self-wrong', '还需重学', '', true)}${button('self-remember', '记得，保存并继续 <span aria-hidden="true">→</span>')}</div></footer>`;
      }
      if (ex.kind === 'choice') body += `<div class="practice-choices" role="group" aria-label="选择答案">${ex.choices.map((choice, index) => `<button type="button" class="practice-choice ${card.answer === choice.id ? 'is-selected' : ''} ${card.grade && choice.id === ex.expectedChoiceId ? 'is-answer' : ''} ${card.grade && card.answer === choice.id && !card.grade.correct ? 'is-wrong' : ''}" aria-pressed="${card.answer === choice.id}" data-action="practice-choice" data-card="${card.key}" data-choice="${esc(choice.id)}" ${card.grade ? 'disabled' : ''}><span>${String.fromCharCode(65 + index)}</span>${esc(choice.label)}</button>`).join('')}</div>`;
      else body += `<label class="practice-answer-label" for="practice-answer">${ex.kind === 'writing' ? '你的英文句子' : '你的实际作答'}</label><textarea id="practice-answer" data-practice-input="answer" data-card="${card.key}" rows="${ex.kind === 'writing' ? 4 : 2}" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="2000" placeholder="${ex.kind === 'writing' ? '写下你自己的表达…' : '写下英文词或完整短语…'}" ${card.grade ? 'disabled' : ''}>${esc(card.answer)}</textarea>`;
      if (card.validation) body += `<p class="practice-validation" role="alert">${esc(card.validation)}</p>`;
      if (!card.grade) {
        if (card.hintShown) body += `<div class="practice-hint" role="status">提示：${esc(ex.expectedAnswer.charAt(0))}… · ${Array.from(ex.expectedAnswer.replace(/\s/g, '')).length} 个字符；这次会标记为使用提示。</div>`;
        else if (card.assisted) body += '<div class="practice-hint" role="status">本词先前已查看，这次作答会单独标记。</div>';
        return body + `<footer class="practice-card-footer"><span>${card.mode === 'listening' && !card.audioHeard ? '请先成功播放发音。' : '先核对，再由你确认保存。'}</span><div class="practice-actions">${ex.kind === 'text' && ex.expectedAnswer ? button('hint', '给我一点提示', card.mode === 'listening' && !card.audioHeard ? 'disabled' : '', true) : ''}${button('check', ex.kind === 'writing' ? '对照词卡自行核对' : '核对答案', card.mode === 'listening' && !card.audioHeard ? 'disabled' : '')}</div></footer>`;
      }
      if (ex.kind === 'writing') return body + `<div class="practice-feedback" role="status"><strong>对照例句，检查自己的表达</strong><p>${esc(card.grade.feedback)}</p></div>` + teaching(record) + `<footer class="practice-card-footer"><span>保存你的句子与自评。</span><div class="practice-actions">${button('self-wrong', '还需修改', '', true)}${button('self-remember', '自评可用，保存并继续 <span aria-hidden="true">→</span>')}</div></footer>`;
      return body + `<div class="practice-feedback ${card.grade.correct ? 'is-correct' : 'is-wrong'}" role="status"><strong>${card.grade.correct ? '与保存的答案一致' : '再对照一次，把差异看清'}</strong><p>${esc(card.grade.feedback)}</p><p>词卡答案：<b>${esc(card.grade.expectedAnswer)}</b>${card.assisted ? ' · 本次使用了提示' : ''}</p></div>` + teaching(record) + `<footer class="practice-card-footer"><span>保存最初这次作答；下一词重新开始。</span>${button('finish', '保存这次作答，继续 <span aria-hidden="true">→</span>')}</footer>`;
    }
    function renderResults() {
      const objective = session.results.filter(result => result.type === 'objective' && !result.assisted), correct = objective.filter(result => result.correct).length;
      const assisted = session.results.filter(result => result.type === 'objective' && result.assisted), self = session.results.filter(result => result.type === 'self'), learned = session.results.filter(result => result.type === 'learning');
      root.innerHTML = `<section class="practice-page">${heading('这一组，往前走了一点', '你明确确认的记录已保存在当前账号，云端状态可在同步标记中查看。', 'A SMALL STEP FORWARD')}<section class="practice-results"><span class="practice-results-mark" aria-hidden="true">✓</span><h2>完成 ${session.results.length} 个词的练习</h2><p>回忆、理解与运用，各自算数。</p><div class="practice-results-grid"><div><span>独立作答 · 客观核对</span><strong>${objective.length ? correct + ' / ' + objective.length : '—'}</strong><small>${objective.length ? '与词卡答案一致 / 已作答' : '本组没有独立客观作答'}</small></div><div><span>提示后作答</span><strong>${assisted.length}</strong><small>单独记录，不计独立作答</small></div><div><span>回忆 / 造句自评</span><strong>${self.length}</strong><small>${self.filter(result => result.correct).length} 次自评记得或可用</small></div><div><span>讲解学习</span><strong>${learned.length}</strong><small>明确确认已理解</small></div></div><p class="practice-save-note">一次练习不会默认标记为掌握。后续仍按个人复习安排继续。</p><div class="practice-actions">${button('next-group', '继续下一组 <span aria-hidden="true">→</span>')}${button('exit', '重新选择方法', '', true)}<a href="#today" class="practice-link">返回今日学习</a></div></section></section>`;
    }
    function render() {
      if (o.isActive && !o.isActive()) { suspend(); return; }
      active = true;
      const latest = context();
      if (!session) return renderLanding(latest);
      if (!allowed(latest, session.token)) { clearSession(); return renderLanding(latest); }
      if (session.index >= session.ids.length) return renderResults();
      const item = currentCard(latest); if (!item) return renderLanding(latest);
      const {record,card} = item;
      const hideBatch = ['spelling','listening','cloze'].includes(card.mode) && !card.grade && !card.revealed;
      root.innerHTML = `<section class="practice-page practice-session">${heading('一次，只专注这个词', `${session.index + 1} / ${session.ids.length} · ${esc(modeName(session.mode))}`, 'ONE WORD, ONE CONNECTION', button('exit', '返回方法选择', '', true))}${methodSwitcher()}<div class="practice-progress" role="progressbar" aria-label="本组已确认词数" aria-valuemin="0" aria-valuemax="${session.ids.length}" aria-valuenow="${session.index}"><i style="width:${session.index / session.ids.length * 100}%"></i></div><article class="practice-study-card"><div class="practice-card-top"><span class="practice-level">${esc(record.level)}</span><span>${hideBatch ? '当前批次' : esc(recordBatch(record))} · ${session.index + 1} / ${session.ids.length}</span></div>${session.firstAttempt && session.firstAttempt.mode !== card.mode ? `<div class="practice-hint" role="status">本词已核对一次：${session.firstAttempt.correct ? '与词卡答案一致' : '需要重学'}。保存时保留最初作答；切换方式可继续理解。</div>` : ''}${renderExercise(record,card)}</article><p class="practice-session-note">查看、切换方法和退出都不会自动记作完成。</p></section>`;
    }
    function saveResult(kind, answer, type, correct) {
      const latest = requireOwner(); if (!latest || !session || !allowed(latest, session.token)) return false;
      const item = currentCard(latest); if (!item || item.card.committing || !item.card.available || item.record.needsContent) return false;
      const {record,card} = item;
      if (!isActive()) return false;
      const currentSession = session;
      let resultMode = card.mode, assisted = card.assisted;
      if (currentSession.firstAttempt) {
        const first = currentSession.firstAttempt;
        resultMode = first.mode; answer = first.answer; type = 'objective'; correct = first.correct; assisted = first.assisted;
        kind = !correct ? 'wrong' : (record.level === 'B' || E.mode(record) === 'teaching' || assisted) ? 'studied' : 'correct';
      }
      const answerPrefix = `[${modeName(resultMode)}${assisted ? ' · 使用提示或已查看' : ''}${type === 'self' ? ' · 自评' : ''}] `;
      card.committing = true;
      let saved = false;
      try { saved = o.onRecord?.({recordId:record.id,kind,answer:answerPrefix + answer,token:{...session.token}}) === true; }
      catch (error) { toast(error.message || '保存失败，请重试。'); }
      if (!saved) { card.committing = false; return false; }
      if (session !== currentSession || !allowed(currentContext(), currentSession.token)) return false;
      session.results.push({recordId:record.id,mode:resultMode,type,correct,assisted});
      stopAudio(); session.index++; session.card = null; session.exposed = false; session.firstAttempt = null; render(); return true;
    }
    function handleAction(action, dataset = {}) {
      if (!String(action).startsWith('practice-')) return false;
      if (!isActive()) return true;
      const name = String(action).slice(9), latest = context();
      if (name === 'login') { o.requireAccount?.(); return true; }
      if (name === 'exit') { clearSession(); render(); return true; }
      if (name === 'mode') {
        if (!modeById.has(dataset.mode)) return true;
        selectedMode = dataset.mode;
        if (session) { if (!allowed(latest, session.token)) return true; stopAudio(); session.exposed = true; session.mode = selectedMode; session.card = null; }
        render(); return true;
      }
      if (name === 'start') { if (dataset.empty === 'true') { o.onRouteLibrary?.(); if (!o.onRouteLibrary && host.location) host.location.hash = 'library'; } else start(); return true; }
      if (name === 'next-group') { start(); return true; }
      if (name === 'batch') {
        if (!requireOwner()) return true;
        const group = batchPlan(latest).groups.find(item => item.id === dataset.group);
        if (group) start(group.recordIds); else { render(); toast('分组已更新，请选择当前的小组。'); }
        return true;
      }
      if (name === 'edit-missing') {
        if (!requireOwner()) return true;
        const record = latest.state.records.find(item => item.id === dataset.record && item.needsContent && item.level !== 'C');
        if (record) { stopAudio(); o.onEdit?.(record.id); }
        return true;
      }
      if (!allowed(latest) || !session || !allowed(latest, session.token)) { o.requireAccount?.(); return true; }
      const item = currentCard(latest); if (!item) { render(); return true; }
      const {record,card} = item, ex = card.exercise;
      if (dataset.card !== undefined && String(dataset.card) !== String(card.key)) return true;
      if (name === 'guided') { stopAudio(); session.exposed = true; selectedMode = 'guided'; session.mode = 'guided'; session.card = null; render(); return true; }
      if (name === 'edit') { stopAudio(); o.onEdit?.(record.id); return true; }
      if (!card.available || !ex) return true;
      if (name === 'audio') {
        if (typeof o.onPlay !== 'function') { card.audioStatus = 'unavailable'; render(); return true; }
        const token = {...session.token}, cardIdentity = card, nonce = ++sequence;
        card.audioNonce = nonce; card.audioStatus = 'loading'; render();
        const status = value => {
          const now = currentContext();
          if (!isActive() || !session || session.card !== cardIdentity || card.audioNonce !== nonce || sequence !== nonce || !allowed(now, token)) return;
          const kind = typeof value === 'string' ? value : value?.kind;
          card.audioStatus = ['loading','recording','speech','unavailable'].includes(kind) ? kind : 'unavailable';
          if (kind === 'recording' || kind === 'speech') { card.audioHeard = true; card.validation = ''; }
          render();
        };
        try { const result = o.onPlay(record.word, status); if (result && typeof result.catch === 'function') result.catch(() => status({kind:'unavailable'})); }
        catch { status({kind:'unavailable'}); }
        return true;
      }
      if (name === 'reveal' && ex.kind === 'self') { card.revealed = true; session.exposed = true; render(); return true; }
      if (name === 'choice' && ex.kind === 'choice' && !card.grade && ex.choices.some(choice => choice.id === dataset.choice)) { card.answer = dataset.choice; card.validation = ''; render(); return true; }
      if (name === 'hint' && ex.kind === 'text' && !card.grade && (card.mode !== 'listening' || card.audioHeard)) { card.assisted = true; card.hintShown = true; session.exposed = true; render(); return true; }
      if (name === 'check' && ['text','choice','writing'].includes(ex.kind) && !card.grade) {
        if (card.mode === 'listening' && !card.audioHeard) { card.validation = '请先成功播放发音，再完成作答。'; render(); return true; }
        const grade = P.grade(ex, card.answer);
        if (!grade.valid) { card.validation = grade.feedback; render(); return true; }
        if (['text','choice'].includes(ex.kind) && !session.firstAttempt) session.firstAttempt = {mode:card.mode,answer:ex.kind === 'choice' ? ex.choices.find(choice => choice.id === card.answer).label : card.answer,correct:grade.correct === true,assisted:card.assisted};
        card.grade = grade; card.lockedAnswer = card.answer; card.revealed = true; card.validation = ''; session.exposed = true; stopAudio(); render(); return true;
      }
      if (name === 'studied' && ex.kind === 'guided' && !record.needsContent) { saveResult('studied', '已阅读并理解词义、搭配与例句。', 'learning', null); return true; }
      if (name === 'finish' && card.grade && ['text','choice'].includes(ex.kind)) {
        const actual = ex.kind === 'choice' ? ex.choices.find(choice => choice.id === card.lockedAnswer)?.label : card.lockedAnswer;
        if (!actual) return true;
        const correct = card.grade.correct === true, kind = !correct ? 'wrong' : (record.level === 'B' || E.mode(record) === 'teaching' || card.assisted) ? 'studied' : 'correct';
        saveResult(kind, actual, 'objective', correct); return true;
      }
      if (['self-remember','self-wrong'].includes(name) && ((ex.kind === 'self' && card.revealed) || (ex.kind === 'writing' && card.grade))) {
        const remembered = name === 'self-remember';
        const answer = ex.kind === 'writing' ? `${card.lockedAnswer}\n自评：${remembered ? '对照词卡后认为可用' : '还需修改'}` : `自评：翻卡核对后${remembered ? '记得' : '需要重学'}`;
        saveResult(remembered ? 'studied' : 'wrong', answer, 'self', remembered); return true;
      }
      return true;
    }
    function handleInput(target) {
      if (!target || target.dataset?.practiceInput !== 'answer') return false;
      if (!isActive()) return true;
      const latest = context(); if (!session || !allowed(latest, session.token)) return true;
      const item = currentCard(latest); if (!item) { render(); return true; }
      if (!item.card.available || item.card.grade || !['text','writing'].includes(item.card.exercise?.kind)) return true;
      if (target.dataset.card !== undefined && String(target.dataset.card) !== String(item.card.key)) return true;
      item.card.answer = String(target.value ?? ''); item.card.validation = ''; return true;
    }
    return {render,start,reset,suspend,handleAction,handleInput};
  }
  return Object.freeze({create});
});
