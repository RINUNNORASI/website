/* IELTS planning view: scheduled workload and dated learning events. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IELTS_PLAN_UI = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const DEFAULTS = Object.freeze({examDate: null, dailyMinutes: 45, dailyNewLimit: 18, dailyReviewLimit: 20, cycleWeeks: 12});
  const PHASES = [
    {name: '基础与精读', weight: 40, tag: 'BUILD', title: '先读懂，再提速', tasks: ['词汇：把词义、发音和常见搭配放在同一语境里学习。', '阅读：每天精读一篇；标出同义替换、限定词与 FALSE / NOT GIVEN 的判断依据。', '听力：选一段可核对文本的录音，听后检查数字、名词和词尾。', '口语：围绕文章主题录一段 60 秒回答，回听并修改表达。']},
    {name: '限时与定位', weight: 30, tag: 'APPLY', title: '把理解带进限时练习', tasks: ['阅读：从单篇限时练习开始，复盘找答案的路径与花费时间。', '词汇：第三次接触起加入有提示回忆，继续复习错词。', '听力：练习跟上录音，只在完成后核对答案与脚本。', '口语：练习 Part 2 的组织与延伸，避免只背孤立句子。']},
    {name: '写作与表达', weight: 20, tag: 'EXPRESS', title: '用证据支撑观点', tasks: ['写作：每周完成 Task 1 与 Task 2，检查回应题目、段落推进、用词与语法。', '阅读：把一个论点改写为“观点—原因—例子”，区分相关与因果。', '口语：在 Part 3 中补充原因、例子和适当限制，不把可能说成确定。', '词汇：优先使用熟悉而准确的搭配，再尝试新表达。']},
    {name: '模考与复盘', weight: 10, tag: 'CHECK', title: '找到最后需要修补的地方', tasks: ['使用官方练习材料，按考试时限完成听力、阅读与写作。', '阅读：按题型归纳失分，检查数字绑定、范围、时间与限定词。', '写作与口语：依据公开评分标准逐项检查；反馈后再改一版。', '词汇：减少新增，把时间留给错词、常用表达与已有知识。']}
  ];
  const ui = {tab: 'future', horizon: 30, selectedDate: null, phase: 0, page: 0};
  let context = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const shortDate = value => value ? (+value.slice(5, 7)) + '/' + (+value.slice(8)) : '';
  const integer = (value, min, max, fallback) => Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : fallback;
  function preferences(state, E) {
    const p = state.preferences || {};
    return {
      examDate: E.isDate(p.examDate) ? p.examDate : null,
      dailyMinutes: integer(p.dailyMinutes, 15, 180, DEFAULTS.dailyMinutes),
      dailyNewLimit: integer(p.dailyNewLimit, 1, 50, DEFAULTS.dailyNewLimit),
      dailyReviewLimit: integer(p.dailyReviewLimit, 1, 200, DEFAULTS.dailyReviewLimit),
      cycleWeeks: integer(p.cycleWeeks, 1, 52, DEFAULTS.cycleWeeks)
    };
  }
  function plannedDays(records, date, horizon, E) {
    const days = Array.from({length: horizon}, (_, i) => ({date: E.addDays(date, i), entries: new Map()}));
    const byDate = new Map(days.map(day => [day.date, day]));
    const insert = (day, r, reason) => {
      const slot = byDate.get(day);
      if (!slot) return;
      const existing = slot.entries.get(r.id);
      if (existing) { existing.reasons.add(reason); return; }
      slot.entries.set(r.id, {record: r, reasons: new Set([reason])});
    };
    for (const r of E.due(records, date)) insert(date, r, E.dueDate(r) < date ? '待补复习' : '今日到期');
    for (const r of records) {
      if (r.level === 'C') continue;
      if (E.isDate(r.nextReview) && r.nextReview > date) insert(r.nextReview, r, '计划复习');
      if (E.isDate(r.firstSeen)) {
        for (const offset of E.SCHEDULE || [1, 3, 7, 14, 30]) {
          const target = E.addDays(r.firstSeen, offset);
          if (target > date && (!r.lastReview || target > r.lastReview)) insert(target, r, 'D' + offset);
        }
      }
      for (const target of r.extraReviews || []) {
        if (!E.isDate(target)) continue;
        insert(target < date ? date : target, r, '错词加练');
      }
    }
    return days.map(day => ({date: day.date, entries: [...day.entries.values()], count: day.entries.size}));
  }
  function actualDays(records, date, E, readingState) {
    const days = Array.from({length: 28}, (_, i) => ({date: E.addDays(date, i - 27), entries: new Map(), readingCount: 0}));
    const byDate = new Map(days.map(day => [day.date, day]));
    for (const r of records) for (const event of r.reviewHistory || []) {
      if (!['studied', 'correct', 'wrong'].includes(event.kind)) continue;
      const slot = byDate.get(event.date);
      if (slot) slot.entries.set(r.id, {record: r, event});
    }
    for (const completedDate of Object.values(readingState?.completed || {})) {
      const slot = byDate.get(completedDate);
      if (slot) slot.readingCount++;
    }
    return days.map(day => {
      const entries = [...day.entries.values()];
      return {date: day.date, entries, count: entries.length, readingCount: day.readingCount,
        studied: entries.filter(x => x.event.kind === 'studied').length,
        correct: entries.filter(x => x.event.kind === 'correct').length,
        wrong: entries.filter(x => x.event.kind === 'wrong').length};
    });
  }
  function allocate(total, weights) {
    const raw = weights.map(x => total * x / weights.reduce((a, b) => a + b, 0));
    const result = raw.map(Math.floor);
    const order = raw.map((value, i) => ({i, remainder: value - result[i]})).sort((a, b) => b.remainder - a.remainder);
    const remaining = total - result.reduce((a, b) => a + b, 0);
    for (let i = 0; i < remaining; i++) result[order[i].i]++;
    return result;
  }
  function phasesFor(p, date, E) {
    const totalDays = p.examDate && p.examDate >= date ? E.dayDiff(date, p.examDate) + 1 : p.cycleWeeks * 7;
    const chosen = totalDays < 4 ? PHASES.slice(4 - totalDays) : PHASES;
    const lengths = totalDays < 4 ? chosen.map(() => 1) : allocate(totalDays - 4, chosen.map(x => x.weight)).map(x => x + 1);
    let offset = 0;
    return chosen.map((phase, i) => {
      const result = {...phase, start: E.addDays(date, offset), end: E.addDays(date, offset + lengths[i] - 1), days: lengths[i]};
      offset += lengths[i]; return result;
    });
  }
  function futureChart(days, p, selectedDate) {
    const W = 880, H = 240, left = 44, right = 12, top = 18, bottom = 40;
    const max = Math.max(p.dailyReviewLimit, ...days.map(d => d.count), 1);
    const plotH = H - top - bottom, step = (W - left - right) / days.length;
    const y = value => H - bottom - value / max * plotH;
    const capY = y(p.dailyReviewLimit);
    const ticks = [...new Set([0, Math.round(max / 2), max])];
    return `<div class="pl-chart-scroll"><svg class="pl-load-chart" viewBox="0 0 ${W} ${H}" role="group" aria-label="未来 ${days.length} 天复习词数，点击柱形查看词汇">${ticks.map(t => `<line x1="${left}" y1="${y(t)}" x2="${W - right}" y2="${y(t)}" class="pl-grid-line"/><text x="${left - 10}" y="${y(t) + 4}" text-anchor="end" class="pl-axis">${t}</text>`).join('')}<line x1="${left}" y1="${capY}" x2="${W - right}" y2="${capY}" class="pl-capacity-line"/>${days.map((day, i) => {
      const x = left + step * i + step * .14, width = step * .72, height = Math.max(4, plotH * day.count / max);
      const isSelected = day.date === selectedDate;
      return `<g class="pl-bar-group ${isSelected ? 'is-selected' : ''}" tabindex="0" role="button" data-plan-date="${day.date}" aria-label="${day.date}，${day.count} 个计划词汇" aria-pressed="${isSelected}"><title>${day.date} · ${day.count} 词</title><rect class="pl-bar-hit" x="${left + step * i}" y="${top}" width="${step}" height="${plotH + 25}" fill="transparent"/><rect class="pl-bar ${i === 0 ? 'is-today' : ''}" x="${x}" y="${H - bottom - height}" width="${width}" height="${height}" rx="3"/>${days.length <= 14 || i === 0 || i === days.length - 1 || i % 5 === 0 ? `<text x="${x + width / 2}" y="${H - bottom + 22}" text-anchor="middle" class="pl-axis">${i === 0 ? '今天' : shortDate(day.date)}</text>` : ''}${(day.count && (days.length <= 14 || isSelected)) ? `<text x="${x + width / 2}" y="${H - bottom - height - 6}" text-anchor="middle" class="pl-bar-value">${day.count}</text>` : ''}</g>`;
    }).join('')}</svg></div>`;
  }
  function historyChart(days, selectedDate) {
    return `<div class="pl-history-grid">${days.map(day => {
      const intensity = !day.count ? 0 : day.count < 5 ? 1 : day.count < 10 ? 2 : day.count < 20 ? 3 : 4;
      return `<button type="button" class="pl-history-day pl-intensity-${intensity} ${day.date === selectedDate ? 'is-selected' : ''}" data-plan-date="${day.date}" aria-label="${day.date}，复习 ${day.count} 词，完成精读 ${day.readingCount} 篇" aria-pressed="${day.date === selectedDate}"><span>${shortDate(day.date)}</span><strong>${day.count}</strong>${day.readingCount ? '<i aria-label="有精读完成记录"></i>' : ''}</button>`;
    }).join('')}</div><div class="pl-history-legend"><span>每格为当天复习词数</span><span>少 <i class="pl-intensity-0"></i><i class="pl-intensity-1"></i><i class="pl-intensity-2"></i><i class="pl-intensity-3"></i><i class="pl-intensity-4"></i> 多</span><span><b class="pl-reading-dot"></b> 完成精读</span></div>`;
  }
  function details(selected, tab) {
    const items = selected.entries.slice().sort((a, b) => (a.record.batch || '').localeCompare(b.record.batch || '') || a.record.word.localeCompare(b.record.word));
    const groups = new Map();
    for (const item of items) {
      const name = item.record.batch || item.record.origins?.[0]?.batch || '自主提交';
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(item);
    }
    const pageSize = 20, pages = Math.max(1, Math.ceil(items.length / pageSize));
    ui.page = Math.min(ui.page, pages - 1);
    const visible = new Set(items.slice(ui.page * pageSize, (ui.page + 1) * pageSize));
    const summary = tab === 'future'
      ? `<span>${items.length} 词</span>${selected.entries.some(x => x.reasons.has('待补复习')) ? '<span class="pl-tag pl-tag-warm">含待补复习</span>' : ''}`
      : `<span>复习 ${selected.count} 词</span><span>理解 ${selected.studied}</span><span class="pl-correct">答对 ${selected.correct}</span><span class="pl-wrong">需重学 ${selected.wrong}</span><span>精读 ${selected.readingCount} 篇</span>`;
    return `<section class="pl-day-detail" aria-live="polite"><div class="pl-detail-heading"><h3>${esc(selected.date)}<span>${tab === 'future' ? '计划词汇' : '学习记录'}</span></h3><div class="pl-detail-summary">${summary}</div></div>${items.length ? `<div class="pl-words-wrap"><table class="pl-words"><thead><tr><th>词汇</th><th>中文义</th><th>${tab === 'future' ? '安排' : '本次记录'}</th></tr></thead><tbody>${[...groups].map(([group, entries]) => {
      const rows = entries.filter(x => visible.has(x));
      if (!rows.length) return '';
      return `<tr class="pl-batch-row"><td colspan="3">${esc(group)} <small>${entries.length} 词</small></td></tr>${rows.map(item => {
        const r = item.record;
        const label = tab === 'future' ? [...item.reasons].join(' · ') : ({studied: '理解学习', correct: '本次答对', wrong: '需要重学'}[item.event.kind] || '已复习');
        return `<tr><td><button type="button" class="pl-word-link" data-action="word-detail" data-id="${esc(r.id)}">${esc(r.displayWord || r.word)}</button><span class="pl-word-level">${esc(r.level)}</span></td><td>${esc(r.meaning || '释义待补充')}</td><td><span class="${tab === 'history' && item.event.kind === 'wrong' ? 'pl-wrong' : ''}">${esc(label)}</span></td></tr>`;
      }).join('')}`;
    }).join('')}</tbody></table></div>${pages > 1 ? `<div class="pl-list-pagination"><span>${items.length} 词</span><label>第 <select data-plan-page aria-label="选择词汇列表页码">${Array.from({length: pages}, (_, i) => `<option value="${i}" ${ui.page === i ? 'selected' : ''}>${i + 1}</option>`).join('')}</select> / ${pages} 页</label></div>` : ''}` : `<div class="pl-empty">${tab === 'future' ? '这一天没有到期词汇。可以安排阅读或回看错题。' : '这一天还没有学习记录。'}</div>`}</section>`;
  }
  function render(args) {
    context = args;
    const {state, date, engine: E} = args;
    const p = preferences(state, E), due = E.due(state.records, date), phases = phasesFor(p, date, E);
    const future = plannedDays(state.records, date, ui.horizon, E), history = actualDays(state.records, date, E, state.readingState);
    const activeDays = ui.tab === 'future' ? future : history;
    if (!activeDays.some(day => day.date === ui.selectedDate)) ui.selectedDate = date;
    const selected = activeDays.find(day => day.date === ui.selectedDate) || activeDays[0];
    ui.phase = Math.min(ui.phase, phases.length - 1);
    const currentPhase = phases[ui.phase], minutes = allocate(p.dailyMinutes, [30, 40, 15, 15]);
    const totalHistory = history.reduce((sum, day) => sum + day.count, 0), activeDates = history.filter(day => day.count || day.readingCount).length;
    const countdown = p.examDate && p.examDate >= date ? E.dayDiff(date, p.examDate) : null;
    return `<div class="pl-view"><div class="pl-page-heading"><div><span class="pl-kicker">STUDY PLAN</span><h1>备考计划与学习记录</h1><p>安排每天的练习，查看到期词汇与过去的学习。</p></div><a class="button" href="#review">开始今日复习 →</a></div>
      <section class="pl-settings-card"><div class="pl-card-head"><div><h2>你的备考节奏</h2><p>${countdown === null ? `从今天开始规划 ${p.cycleWeeks} 周` : countdown ? `距离考试还有 ${countdown} 天` : '考试日：今天'} · 目标 IELTS 7</p></div><span class="pl-tag">每天 ${p.dailyMinutes} 分钟</span></div>
        <form id="plan-preferences" class="pl-preferences-form"><label>考试日期 <span>可选</span><input name="examDate" type="date" min="${date}" value="${esc(p.examDate || '')}"></label><label>规划周期<select name="cyclePreset" id="plan-cycle-preset">${[8, 12, 16].map(weeks => `<option value="${weeks}" ${p.cycleWeeks === weeks ? 'selected' : ''}>${weeks} 周</option>`).join('')}<option value="custom" ${![8, 12, 16].includes(p.cycleWeeks) ? 'selected' : ''}>自定义</option></select></label><label class="pl-custom-weeks" ${[8, 12, 16].includes(p.cycleWeeks) ? 'hidden' : ''}>自定义周数<input name="cycleWeeks" type="number" min="1" max="52" value="${p.cycleWeeks}"></label><label>每日学习时间<div class="pl-input-unit"><input name="dailyMinutes" type="number" min="15" max="180" step="1" value="${p.dailyMinutes}"><span>分钟</span></div></label><label>每日新词上限<input name="dailyNewLimit" type="number" min="1" max="50" value="${p.dailyNewLimit}"></label><label>每批复习词数<input name="dailyReviewLimit" type="number" min="1" max="200" value="${p.dailyReviewLimit}"></label><button type="submit" class="button">保存计划</button><p id="plan-form-message" role="status"></p></form>
        <div class="pl-time-budget">${[['词汇', '#review'], ['阅读', '#reading'], ['听力', null], ['写作 / 口语', null]].map(([name, href], i) => `<${href ? 'a href="' + href + '"' : 'div'} class="pl-budget-item"><span>${name}</span><strong>${minutes[i]} <small>分钟</small></strong>${!href ? '<small>自主练习</small>' : '<small>进入练习 ↗</small>'}</${href ? 'a' : 'div'}>`).join('')}</div></section>
      <section class="pl-cycle-card"><div class="pl-card-head"><div><h2>四个阶段，逐步推进</h2><p>这是可调整的时间安排；每周根据错题和实际表现修改重点。</p></div><span class="pl-subtle-tag">${shortDate(date)}—${shortDate(phases[phases.length - 1].end)}</span></div><div class="pl-phase-tabs" role="tablist" aria-label="备考阶段">${phases.map((phase, i) => `<button type="button" role="tab" id="plan-phase-${i}" aria-controls="plan-phase-content" aria-selected="${ui.phase === i}" class="pl-phase-tab ${ui.phase === i ? 'is-active' : ''}" data-plan-phase="${i}" style="--phase-weight:${phase.days}"><span>0${i + 1} / ${phase.tag}</span><strong>${phase.name}</strong><small>${shortDate(phase.start)}—${shortDate(phase.end)} · ${phase.days} 天</small></button>`).join('')}</div><div id="plan-phase-content" class="pl-phase-content" role="tabpanel" aria-labelledby="plan-phase-${ui.phase}"><h3>${currentPhase.title}</h3><ul>${currentPhase.tasks.map(task => `<li>${esc(task)}</li>`).join('')}</ul></div></section>
      <section class="pl-data-card"><div class="pl-data-toolbar"><div class="pl-view-tabs" role="tablist" aria-label="学习数据"><button type="button" role="tab" aria-controls="plan-data-panel" aria-selected="${ui.tab === 'future'}" data-plan-tab="future" class="${ui.tab === 'future' ? 'is-active' : ''}">未来复习</button><button type="button" role="tab" aria-controls="plan-data-panel" aria-selected="${ui.tab === 'history'}" data-plan-tab="history" class="${ui.tab === 'history' ? 'is-active' : ''}">学习记录</button></div>${ui.tab === 'future' ? `<label class="pl-horizon">范围 <select data-plan-horizon aria-label="复习计划范围">${[7, 14, 30].map(n => `<option value="${n}" ${n === ui.horizon ? 'selected' : ''}>${n} 天</option>`).join('')}</select></label>` : '<span class="pl-subtle-tag">最近 28 天</span>'}</div>
        <div id="plan-data-panel" role="tabpanel"><div class="pl-chart-heading"><div><h2>${ui.tab === 'future' ? '未来复习负荷' : '过去 28 天的学习'}</h2><p>${ui.tab === 'future' ? '点击日期查看词汇。待补复习合并在今天，未来柱形显示已有词库的计划。' : '点击日期查看当天词汇与中文义。同一词一天合并为一条记录。'}</p></div><div class="pl-chart-stat"><strong>${ui.tab === 'future' ? due.length : totalHistory}</strong><span>${ui.tab === 'future' ? '今日待复习' : '复习词次'}</span></div></div>
          ${ui.tab === 'future' ? futureChart(future, p, ui.selectedDate) : historyChart(history, ui.selectedDate)}
          <div class="pl-chart-note">${ui.tab === 'future' ? `<span><b class="pl-legend-square"></b>计划词数</span><span><b class="pl-legend-dash"></b>每批 ${p.dailyReviewLimit} 词</span><span>今日先处理 ${Math.min(p.dailyReviewLimit, due.length)} 词，剩余分批继续</span>` : `<span>${activeDates} 天有学习记录</span><span>答对 / 需重学按当天最后一次作答显示</span>`}</div>${details(selected, ui.tab)}
        </div></section>
      <details class="pl-principles"><summary>为什么这样安排学习？<span>间隔 · 回忆 · 反馈</span></summary><div><p><strong>拉开复习间隔：</strong>使用 D0、D1、D3、D7、D14、D30 作为基础安排；错词增加次日与第三日复习。间隔长短需要随表现调整，研究并没有给出适合所有人的唯一日程。</p><p><strong>逐步增加主动回忆：</strong>前两次建立词义与语境，再增加有提示回忆、搭配与输出；答错后回到讲解并再次练习。</p><p><strong>按任务评价：</strong>词汇答对次数用于安排复习，阅读与写作表现要在对应任务中检查。备考阶段是一份时间预算。</p><div class="pl-references"><a href="https://doi.org/10.1037/0033-2909.132.3.354" target="_blank" rel="noopener">Cepeda et al. (2006) · 间隔学习综述 ↗</a><a href="https://doi.org/10.1177/1529100612453266" target="_blank" rel="noopener">Dunlosky et al. (2013) · 学习方法综述 ↗</a><a href="https://ielts.org/take-a-test/preparation-resources" target="_blank" rel="noopener">IELTS 官方练习与评分资料 ↗</a></div></div></details>
    </div>`;
  }
  function bind(main, callbacks) {
    const handlers = callbacks || {};
    const rerender = () => { main.innerHTML = render(context); bind(main, handlers); };
    main.querySelectorAll('[data-plan-tab]').forEach(button => button.addEventListener('click', () => {
      ui.tab = button.dataset.planTab; ui.selectedDate = context.date; ui.page = 0; rerender();
    }));
    main.querySelector('[data-plan-horizon]')?.addEventListener('change', event => {
      ui.horizon = integer(event.target.value, 7, 30, 30); ui.page = 0; rerender();
    });
    main.querySelectorAll('[data-plan-date]').forEach(element => {
      const select = () => { ui.selectedDate = element.dataset.planDate; ui.page = 0; rerender(); };
      element.addEventListener('click', select);
      if (element.tagName.toLowerCase() === 'g') element.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
      });
    });
    main.querySelectorAll('[data-plan-phase]').forEach(button => button.addEventListener('click', () => {
      ui.phase = Number(button.dataset.planPhase); rerender();
    }));
    main.querySelector('[data-plan-page]')?.addEventListener('change', event => { ui.page = Number(event.target.value); rerender(); });
    main.querySelector('#plan-cycle-preset')?.addEventListener('change', event => {
      main.querySelector('.pl-custom-weeks').hidden = event.target.value !== 'custom';
    });
    main.querySelector('#plan-preferences')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, values = new FormData(form), E = context.engine;
      const message = form.querySelector('#plan-form-message'), button = form.querySelector('button[type="submit"]');
      const examDate = String(values.get('examDate') || '');
      if (examDate && (!E.isDate(examDate) || examDate < context.date)) { message.textContent = '请填写今天或之后的有效考试日期。'; return; }
      const p = {
        examDate: examDate || null,
        dailyMinutes: Number(values.get('dailyMinutes')),
        dailyNewLimit: Number(values.get('dailyNewLimit')),
        dailyReviewLimit: Number(values.get('dailyReviewLimit')),
        cycleWeeks: Number(values.get('cyclePreset') === 'custom' ? values.get('cycleWeeks') : values.get('cyclePreset'))
      };
      const limits = {dailyMinutes: [15, 180], dailyNewLimit: [1, 50], dailyReviewLimit: [1, 200], cycleWeeks: [1, 52]};
      if (Object.entries(limits).some(([key, [min, max]]) => !Number.isInteger(p[key]) || p[key] < min || p[key] > max)) { message.textContent = '请在显示的范围内填写整数。'; return; }
      button.disabled = true; message.textContent = '正在保存…';
      try {
        if (typeof handlers.onPreferences !== 'function') throw new Error('暂时无法保存计划，请刷新后重试。');
        await handlers.onPreferences(p);
        context.state.preferences = {...context.state.preferences, ...p};
        rerender();
        main.querySelector('#plan-form-message').textContent = '计划已保存';
      } catch (error) { message.textContent = error.message || '保存失败，请重试。'; button.disabled = false; }
    });
  }
  return {render, bind, plannedDays, actualDays, preferences, phasesFor};
});
