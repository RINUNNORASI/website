/* Reading workspace: English exam practice first, bilingual teaching after reveal. */
(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const url = value => /^https:\/\//i.test(String(value || '')) ? esc(value) : '#';
  const canonical = word => window.IELTS_ENGINE?.normalizeWord(word) || norm(word);
  const find = (records, word) => (records || []).find(record => canonical(record.word) === canonical(word));
  const pair = (item, extra = '') => `<div class="ru-pair ${extra}"><p class="ru-en" lang="en">${esc(item?.en)}</p><p class="ru-zh">${esc(item?.zh)}</p></div>`;
  const pairs = items => (items || []).map(item => pair(item)).join('');
  const timers = new Map();
  let timerInterval = null;
  let binding = null;
  let currentLesson = null;
  let fontSize = 17;
  const getTimer = id => {
    if (!timers.has(id)) timers.set(id, { remaining: 20 * 60, started: null });
    return timers.get(id);
  };
  const remaining = timer => Math.max(0, timer.remaining - (timer.started ? Math.floor((Date.now() - timer.started) / 1000) : 0));
  const timeText = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const paragraphId = (lesson, id) => `ru-p-${lesson.id}-${id}`;

  function evidenceRanges(lesson, paragraph) {
    const ranges = [];
    (lesson.questions || []).forEach((question, index) => {
      if (norm(question.answer) === 'not given') return;
      const locators = Array.isArray(question.locator) ? question.locator : Array.isArray(question.location) ? question.location : [];
      locators.filter(locator => locator && typeof locator === 'object' && locator.paragraphId === paragraph.id && locator.quote).forEach(locator => {
        const quote = String(locator.quote), start = String(paragraph.text).indexOf(quote);
        if (start >= 0) ranges.push({ start, end: start + quote.length, qid: question.id, index: index + 1 });
      });
    });
    return ranges;
  }

  function passageText(lesson, paragraph, showAnswers) {
    const text = String(paragraph.text || '');
    if (!showAnswers) return esc(text);
    const ranges = evidenceRanges(lesson, paragraph);
    if (!ranges.length) return esc(text);
    const bounds = [...new Set([0, text.length, ...ranges.flatMap(range => [range.start, range.end])])].sort((a, b) => a - b);
    return bounds.slice(0, -1).map((start, i) => {
      const end = bounds[i + 1], matches = ranges.filter(range => range.start <= start && range.end >= end);
      return matches.length ? `<mark class="ru-evidence" data-evidence-questions="${esc(matches.map(match => match.qid).join(' '))}" title="Evidence for question ${matches.map(match => match.index).join(', ')}">${esc(text.slice(start, end))}</mark>` : esc(text.slice(start, end));
    }).join('');
  }

  function evidenceParagraphs(question) {
    if (norm(question.answer) === 'not given') return [];
    const locators = Array.isArray(question.locator) ? question.locator : Array.isArray(question.location) ? question.location : [];
    return [...new Set([...(question.evidenceParagraphIds || []), ...locators.map(locator => typeof locator === 'string' ? locator : locator?.paragraphId).filter(Boolean)])];
  }

  function passage(lesson, showAnswers) {
    const article = lesson.article;
    if (!article?.paragraphs?.length) return `<article class="ru-source-card"><span class="ru-source-kicker" lang="en">READ AT THE SOURCE</span><h3 lang="en">${esc(lesson.title)}</h3><p class="ru-source-meta">${esc(lesson.source)} · ${esc(lesson.published)}</p><p>本课程保留原文链接，请在来源网站阅读完整文章。打开原文后，可返回本页继续作答。</p><a class="button outline" href="${url(lesson.url)}" target="_blank" rel="noopener noreferrer">打开原文 ↗</a></article>`;
    const sourceLink = `<a href="${url(lesson.url)}" target="_blank" rel="noopener noreferrer">${esc(lesson.source)}</a>`;
    const author = String(article.author || '');
    const credit = author.endsWith(` | ${lesson.source}`) ? `${esc(author.slice(0, -lesson.source.length))}${sourceLink}` : `${author ? `${esc(author)} · ` : ''}${sourceLink}`;
    return `<article class="ru-passage-article" lang="en"><h2>${esc(lesson.title)}</h2>${article.subtitle || lesson.subtitle ? `<p class="ru-passage-subtitle">${esc(article.subtitle || lesson.subtitle)}</p>` : ''}<p class="ru-byline">${credit} · ${esc(lesson.published)}</p>${article.paragraphs.map((paragraph, index) => {
      const relevant = showAnswers ? lesson.questions.map((question, i) => ({ question, number: i + 1 })).filter(item => evidenceParagraphs(item.question).includes(paragraph.id)) : [];
      const isHeading = paragraph.kind === 'heading' || paragraph.heading === true;
      const tag = isHeading ? 'h3' : 'p';
      return `<div class="ru-paragraph ${relevant.length ? 'has-evidence' : ''} ${isHeading ? 'is-heading' : ''}" id="${esc(paragraphId(lesson, paragraph.id))}" data-paragraph="${esc(paragraph.id)}"><span class="ru-paragraph-number" aria-label="Paragraph ${index + 1}">${String(index + 1).padStart(2, '0')}</span><${tag}>${passageText(lesson, paragraph, showAnswers)}</${tag}>${relevant.length ? `<div class="ru-evidence-tags">${relevant.map(item => `<a href="#ru-answer-${esc(item.question.id)}" class="ru-evidence-tag" data-reading-ui="answer-jump" data-qid="${esc(item.question.id)}">Q${item.number}</a>`).join('')}</div>` : ''}</div>`;
    }).join('')}<div class="ru-attribution">${article.footer || lesson.source === 'MIT News' ? `<a href="${url(article.footerUrl || (lesson.source === 'MIT News' ? 'https://news.mit.edu/' : lesson.url))}" target="_blank" rel="noopener noreferrer">${esc(article.footer || 'Reprinted with permission of MIT News')}</a>` : `<a href="${url(lesson.url)}" target="_blank" rel="noopener noreferrer">${esc(lesson.source)} · ${esc(lesson.published)}</a>`}${article.license ? ` · <a href="${url(article.license.url)}" target="_blank" rel="noopener noreferrer">${esc(article.license.name)}</a>` : ''}${showAnswers ? '<span>Yellow marks identify answer evidence.</span>' : ''}</div></article>`;
  }

  function question(question, index, formAnswers) {
    const selected = formAnswers[question.id] || '';
    const type = question.type === 'tfng' ? 'TRUE / FALSE / NOT GIVEN' : question.type === 'choice' ? 'MULTIPLE CHOICE' : 'SENTENCE COMPLETION';
    let controls;
    if (question.type === 'tfng') controls = `<select name="${esc(question.id)}" id="ru-input-${esc(question.id)}" aria-label="Answer to question ${index + 1}"><option value="">Select an answer</option>${['TRUE', 'FALSE', 'NOT GIVEN'].map(option => `<option value="${option}" ${selected === option ? 'selected' : ''}>${option}</option>`).join('')}</select>`;
    else if (question.options) controls = `<div class="ru-options">${question.options.map((option, i) => {
      const value = question.type === 'choice' ? String.fromCharCode(65 + i) : option;
      return `<label class="ru-option" for="ru-input-${esc(question.id)}-${i}"><input type="radio" id="ru-input-${esc(question.id)}-${i}" name="${esc(question.id)}" value="${esc(value)}" ${selected === value ? 'checked' : ''}><span>${esc(option)}</span></label>`;
    }).join('')}</div>`;
    else controls = `<input type="text" name="${esc(question.id)}" id="ru-input-${esc(question.id)}" autocomplete="off" spellcheck="false" aria-label="Answer to question ${index + 1}" placeholder="Type your answer" value="${esc(selected)}">`;
    return `<div class="ru-question question" id="ru-question-${esc(question.id)}"><div class="ru-question-number">${index + 1}</div><div class="ru-question-content"><span class="ru-question-type">${type}</span><p>${esc(question.prompt)}</p></div><div class="ru-question-response">${controls}</div></div>`;
  }

  function answers(lesson, result) {
    const correct = result ? lesson.questions.filter(question => norm(result.answers?.[question.id]) === norm(question.answer)).length : null;
    return `<section class="ru-lesson-section" id="answer-start"><div class="ru-section-heading"><span>01 / CHECK YOUR READING</span><h2>答案与原文定位</h2>${result ? `<div class="ru-result-score"><strong>${correct}<span> / ${lesson.questions.length}</span></strong><small>本篇正确题数</small></div>` : ''}</div><div class="ru-answer-grid">${lesson.questions.map((question, index) => {
      const locator = evidenceParagraphs(question), canLocate = locator.length && lesson.article?.paragraphs?.length;
      const hasAnswer = result && Object.prototype.hasOwnProperty.call(result.answers || {}, question.id);
      const isCorrect = hasAnswer && norm(result.answers[question.id]) === norm(question.answer);
      return `<article class="ru-answer-card" id="ru-answer-${esc(question.id)}"><div class="ru-answer-top"><span class="ru-question-pill">Question ${index + 1}</span><strong class="ru-correct-answer">${esc(question.answer)}</strong>${hasAnswer ? `<span class="ru-response-result ${isCorrect ? 'correct' : 'incorrect'}">${isCorrect ? '✓' : '×'} ${esc(result.answers[question.id])}</span>` : ''}</div>${pair({ en: question.prompt, zh: question.translation })}${question.options?.length ? `<ul class="ru-translated-options">${question.options.map((option, i) => `<li><span lang="en">${esc(option)}</span><span>${esc(question.optionTranslations?.[i] || '')}</span></li>`).join('')}</ul>` : ''}<blockquote>${esc(question.evidence)}</blockquote><div class="ru-location"><span>${esc(typeof question.location === 'string' ? question.location : '见原文标注段落')}</span>${canLocate ? `<button type="button" class="ru-link" data-action="locate-evidence" data-reading-ui="locate" data-qid="${esc(question.id)}">在原文中定位 ↑</button>` : norm(question.answer) === 'not given' ? '<strong>原文缺少这项信息</strong>' : ''}</div><p class="ru-explanation">${esc(question.explanation)}</p><div class="ru-analysis-row"><span>同义替换</span><p>${esc(question.paraphrases)}</p></div><div class="ru-analysis-row trap"><span>范围与干扰项</span><p>${esc(question.trap)}</p></div></article>`;
    }).join('')}</div></section>`;
  }

  function grammarSentence(text) {
    const tokens = /\b(Although|although|However|however|Whereas|whereas|Because|because|If|if|which|that|where|may|might|could|can|must)\b/g;
    let cursor = 0, html = '', match;
    while ((match = tokens.exec(String(text || '')))) {
      html += esc(String(text).slice(cursor, match.index));
      const type = /^(may|might|could|can|must)$/.test(match[0]) ? 'scope' : /^(which|that|where)$/.test(match[0]) ? 'relative' : 'logic';
      html += `<span class="ru-grammar-${type}">${esc(match[0])}</span>`;
      cursor = match.index + match[0].length;
    }
    return html + esc(String(text || '').slice(cursor));
  }

  function closeReading(lesson) {
    return `<section class="ru-lesson-section"><div class="ru-section-heading"><span>02 / CLOSE READING</span><h2>读懂结构、限定与证据</h2></div><div class="ru-close-overview"><article><h3>中心主旨</h3>${pairs(lesson.overview)}</article><article><h3>段落推进</h3>${pairs(lesson.structure)}</article></div><div class="ru-sentence-heading"><h3>长难句拆解</h3><div class="ru-grammar-legend"><span class="ru-grammar-logic">逻辑连接</span><span class="ru-grammar-relative">修饰连接</span><span class="ru-grammar-scope">结论强度</span></div></div>${(lesson.sentences || []).map((sentence, index) => `<article class="ru-sentence-card"><div class="ru-sentence-label">${String(index + 1).padStart(2, '0')} <span>${esc(sentence.kind || '结构练习 · 教学改写')}</span></div><p class="ru-sentence-en" lang="en">${grammarSentence(sentence.en)}</p><p class="ru-sentence-zh">${esc(sentence.zh)}</p><ol class="ru-sentence-parts">${(sentence.parts || []).map(part => `<li>${esc(part.replace(/^教学改写，非原文引句[。；]?\s*/, ''))}</li>`).join('')}</ol><div class="ru-transfer-tip"><strong>答题时这样用</strong><span>${esc(sentence.tip)}</span></div></article>`).join('')}<article class="ru-method"><span>方法与证据</span>${pair(lesson.method)}</article></section>`;
  }

  function wordCards(lesson, records) {
    return `<section class="ru-lesson-section"><div class="ru-section-heading"><span>03 / IELTS VOCABULARY</span><h2>从阅读学表达 <small>${lesson.words?.length || 0} 个词与短语</small></h2></div><div class="ru-word-grid">${(lesson.words || []).map(word => {
      const record = find(records, word.word);
      return `<article class="ru-word-card"><div class="ru-word-top"><span class="ru-word-state ${record ? 'known' : ''}">${record ? '巩固' : '待选词'}</span><button class="audio-button ru-audio" data-action="speak" data-word="${esc(word.word)}" aria-label="播放 ${esc(word.word)} 英式发音"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button></div><h3 lang="en">${esc(word.word)}</h3><div class="ru-word-pronunciation"><span class="ipa">${esc(word.ipa)}</span><span class="ru-pos">${esc(word.pos)}</span></div><p class="ru-word-meaning">${esc(word.meaning)}</p><div class="ru-word-context"><span>文中语境</span><p>${esc(word.context)}</p></div><details class="ru-word-family"><summary>词族与常见词形</summary><p>${esc(word.family)}</p></details><div class="ru-collocations">${(word.collocations || []).map(collocation => pair(collocation)).join('')}</div><div class="ru-word-synonym"><strong>雅思同义替换</strong><p>${esc(word.synonyms)}</p></div>${pair(word.example, 'ru-word-example')}<label class="ru-candidate"><input type="checkbox" class="candidate-check candidate-checkbox" value="${esc(word.word)}"><span>${record ? '记录本篇重现' : '这个词不认识，加入词库'}</span></label></article>`;
    }).join('')}</div><div class="ru-word-actions"><button class="button" data-action="intake-candidates">将勾选词加入词库</button><button class="button outline" data-action="anki">下载 Anki 卡片</button></div></section>`;
  }

  function recall(lesson, records) {
    const eligible = exercise => exercise.phase === 'teaching' || (exercise.targetWords?.length > 0 && exercise.targetWords.every(word => {
      const record = find(records, word);
      return record && record.level === 'A' && !record.forceTeaching && (exercise.phase === 'recall' ? record.contacts >= 2 : record.contacts >= 3);
    }));
    const exercises = (lesson.recall || []).filter(eligible);
    return `<section class="ru-lesson-section"><div class="ru-section-heading"><span>04 / PUT IT INTO PRACTICE</span><h2>练一下，再看示范</h2></div><div class="ru-recall-grid">${exercises.map((exercise, index) => `<article class="ru-recall-card"><span>${exercise.phase === 'teaching' ? '理解与识别' : exercise.phase === 'recall' ? '提示回忆' : '语境输出'}</span><p>${esc(exercise.prompt.replace(/，?不要求默写[。；]?/g, '。'))}</p><textarea rows="2" id="ru-recall-${index}" aria-label="词汇练习 ${index + 1} 的回答" placeholder="写下你的理解或答案…"></textarea><details><summary>查看示范与讲解</summary><p>${esc(exercise.answer)}</p></details></article>`).join('')}</div><a class="ru-link ru-next-practice" href="#review">继续词汇复习 →</a></section>`;
  }

  const writingTasks = {
    'urban-health': {
      prompt: 'Some people think cities should spend more money on public transport and green spaces than on new roads. To what extent do you agree or disagree?',
      promptZh: '有人认为城市应将更多资金投入公共交通和绿地，而不是新道路。你在多大程度上同意或不同意？',
      position: 'I largely agree, provided that basic road safety and maintenance are not neglected.', positionZh: '我总体同意，前提是基本道路安全和维护得到保障。',
      reason: 'Accessible transport and well-placed green spaces can improve daily access to work, services and exercise.', reasonZh: '便利的交通和位置合适的绿地可以改善日常就业、服务和运动的可达性。',
      example: 'For example, a frequent bus route linking housing to employment centres can give residents a practical alternative to driving.', exampleZh: '例如，连接住宅区与就业中心的高频公交线路，可以为居民提供驾车之外的实用选择。',
      limit: 'The benefit depends on affordability, location and maintenance, so construction alone is insufficient.', limitZh: '收益取决于价格、位置和维护，因此仅仅建设还不够。',
      phrases: [{ en: 'improve access to essential services', zh: '改善基本服务的可达性', use: '描述规划措施带来的具体收益' }, { en: 'provide a practical alternative to driving', zh: '提供驾车之外的实用选择', use: '解释公共交通的作用' }, { en: 'provided that services remain affordable', zh: '前提是服务价格仍可负担', use: '加入条件，避免绝对化' }],
      speaking: { en: 'What changes would make your neighbourhood a better place to live?', zh: '哪些改变能让你所在的社区更宜居？' }
    },
    'plastic-materials': {
      prompt: 'Some people argue that technological innovation is the best way to reduce waste. Others believe that changing consumer behaviour is more important. Discuss both views and give your own opinion.',
      promptZh: '有人认为技术创新是减少废弃物的最佳方式，另一些人认为改变消费者行为更重要。讨论双方观点并给出你的看法。',
      position: 'Technology and consumer behaviour should support each other rather than compete for attention.', positionZh: '技术和消费者行为应当相互支持，而不是相互排斥。',
      reason: 'New processes can make discarded materials useful, while repair and reuse can prevent waste at its source.', reasonZh: '新流程可以使废弃材料重新有用，而维修和再利用可以从源头预防浪费。',
      example: 'For example, local repair services may help households keep furniture in use instead of replacing it.', exampleZh: '例如，当地维修服务可能帮助家庭继续使用家具，而不是将其更换。',
      limit: 'A product made from recycled material still needs reliable safety checks and an assessment of its whole life cycle.', limitZh: '采用回收材料的产品仍需要可靠的安全检查，以及整个生命周期的评估。',
      phrases: [{ en: 'reduce demand for new resources', zh: '减少对新资源的需求', use: '解释维修与再利用的价值' }, { en: 'assess the whole life cycle', zh: '评估整个生命周期', use: '评价环保主张，而非只看制造环节' }, { en: 'combine innovation with practical incentives', zh: '将创新与务实的激励措施结合', use: '提出兼顾双方的解决思路' }],
      speaking: { en: 'What could encourage people to repair things rather than throw them away?', zh: '什么能鼓励人们维修物品，而不是将其丢弃？' }
    },
    'environmental-adaptation': {
      prompt: 'Some people believe that protecting wildlife should be a priority for governments. Others think that public money should focus on human needs. Discuss both views and give your own opinion.',
      promptZh: '有人认为保护野生动物应是政府的优先事项；其他人认为公共资金应侧重人的需求。讨论双方观点并给出你的看法。',
      position: 'Wildlife protection deserves public support, but policies should also consider the needs of local communities.', positionZh: '野生动物保护值得公共支持，但政策也应考虑当地社区的需求。',
      reason: 'Protecting habitats can preserve biodiversity and support services on which people depend.', reasonZh: '保护栖息地可以保留生物多样性，并支持人类赖以生存的生态服务。',
      example: 'For example, restoring a wetland may create habitat while helping a community manage floodwater.', exampleZh: '例如，恢复湿地可能在创造栖息地的同时，帮助社区管理洪水。',
      limit: 'Such benefits depend on local conditions, so conservation plans need monitoring and consultation.', limitZh: '这些收益取决于当地条件，因此保护方案需要监测和协商。',
      phrases: [{ en: 'preserve biodiversity', zh: '保留生物多样性', use: '描述保护目的' }, { en: 'adapt to changing conditions', zh: '适应不断变化的条件', use: '适用于环境、城市和就业等主题' }, { en: 'balance conservation with local needs', zh: '平衡保护与当地需求', use: '提出有限定的政策立场' }],
      speaking: { en: 'How can local communities help protect the natural environment?', zh: '当地社区怎样帮助保护自然环境？' }
    }
  };
  const educationTask = {
    prompt: 'Some people think schools should focus mainly on academic achievement. Others believe that students’ well-being is equally important. Discuss both views and give your own opinion.',
    promptZh: '有人认为学校应主要关注学业成绩；其他人认为学生的身心健康同样重要。讨论双方观点并给出你的看法。',
    position: 'Academic learning and student well-being should be treated as complementary goals.', positionZh: '学业学习与学生身心健康应当被视为相互补充的目标。',
    reason: 'Students who feel respected may find it easier to ask questions and participate in class.', reasonZh: '感到受到尊重的学生可能更容易提问并参与课堂。',
    example: 'For example, a regular check-in can help a teacher notice difficulties before they disrupt a student’s learning.', exampleZh: '例如，定期交流可以帮助教师在问题影响学生学习之前发现困难。',
    limit: 'However, teachers also need adequate time and support; adding duties without resources may increase their workload.', limitZh: '不过，教师也需要足够的时间与支持；在没有资源的情况下增加职责，可能加重其工作负担。',
    phrases: [{ en: 'create an inclusive learning environment', zh: '创造包容的学习环境', use: '描述具体教育目标' }, { en: 'encourage active participation', zh: '鼓励积极参与', use: '把关系与学习过程联系起来' }, { en: 'provide teachers with adequate support', zh: '为教师提供足够支持', use: '让建议具有实施条件' }],
    speaking: { en: 'What qualities make someone a good teacher?', zh: '哪些品质能让一个人成为好教师？' }
  };

  function writing(lesson) {
    const suppliedTopic = lesson.writingTopic;
    const topicTask = suppliedTopic ? {
      prompt: suppliedTopic.question, promptZh: suppliedTopic.questionZh,
      position: suppliedTopic.plan?.[0]?.en, positionZh: suppliedTopic.plan?.[0]?.zh,
      reason: suppliedTopic.plan?.[1]?.en, reasonZh: suppliedTopic.plan?.[1]?.zh,
      example: suppliedTopic.plan?.[2]?.en, exampleZh: suppliedTopic.plan?.[2]?.zh,
      limit: suppliedTopic.plan?.[3]?.en, limitZh: suppliedTopic.plan?.[3]?.zh,
      phrases: suppliedTopic.phrases || [], speaking: suppliedTopic.speaking || { en: 'How might this issue affect the place where you live?', zh: '这个问题可能怎样影响你生活的地方？' },
      model: suppliedTopic.model || lesson.writing, moves: suppliedTopic.plan || []
    } : null;
    if (topicTask && lesson.id === 'heat-dome-2026') {
      if (!topicTask.phrases.length) topicTask.phrases = [
        { en: 'reduce immediate health risks', zh: '降低即时健康风险', use: '指出防暑措施的具体目标' },
        { en: 'combine these priorities', zh: '将这些优先事项结合', use: '回应双方观点，提出综合立场' },
        { en: 'evaluate long-term maintenance costs', zh: '评估长期维护成本', use: '展开建议的可行性与限制' }
      ];
      topicTask.model = [...(topicTask.model || []), { en: 'A relatively affordable design could meet both goals, provided that it remains accessible and receives regular maintenance.', zh: '价格相对可负担的设计可以同时实现两个目标，前提是设施方便使用，并得到定期维护。' }];
    }
    const task = lesson.writingTask || topicTask || writingTasks[lesson.id] || (/教育|学校|teacher|school/i.test(lesson.topic + lesson.title) ? educationTask : null);
    if (!task) return `<section class="ru-lesson-section"><div class="ru-section-heading"><span>05 / WRITING & SPEAKING</span><h2>把阅读观点写清楚</h2></div><div class="ru-writing-card">${pairs(lesson.writing)}<p>将一个观点展开为：立场 → 原因 → 例子 → 条件与限制。</p></div></section>`;
    const moves = task.moves || [{ label: '立场', en: task.position, zh: task.positionZh }, { label: '原因', en: task.reason, zh: task.reasonZh }, { label: '例子', en: task.example, zh: task.exampleZh }, { label: '限制', en: task.limit, zh: task.limitZh }];
    return `<section class="ru-lesson-section"><div class="ru-section-heading"><span>05 / WRITING & SPEAKING</span><h2>从文章观点到 Task 2 段落</h2></div><article class="ru-writing-card"><div class="ru-writing-header"><span>Task 2 · 主题练习</span><a href="https://ielts.org/cdn/ielts-guides/ielts-writing-band-descriptors.pdf" target="_blank" rel="noopener noreferrer">官方写作评分标准 ↗</a></div>${pair({ en: task.prompt, zh: task.promptZh }, 'ru-task-prompt')}<div class="ru-writing-moves">${moves.map(move => `<div><span>${move.label}</span>${pair(move)}</div>`).join('')}</div><div class="ru-band-checklist"><h3>对照 Band 7 的四项要求</h3><div><p><strong>回应题目</strong><span>回应各部分问题；立场清楚，理由和例子服务于主张。</span></p><p><strong>组织与衔接</strong><span>段落推进有逻辑；用指代与连接词表达关系。</span></p><p><strong>词汇准确性</strong><span>搭配自然；区分近义词，避免为了复杂而换词。</span></p><p><strong>句式与语法</strong><span>结合简单句和复杂句；检查主谓一致、从句与标点。</span></p></div></div><h3 class="ru-writing-subheading">三个可迁移表达</h3><div class="ru-writing-phrases">${(task.phrases || []).map(phrase => `<div>${pair(phrase)}<small>${esc(phrase.use)}</small></div>`).join('')}</div><h3 class="ru-writing-subheading">段落示范 · 逐句对照</h3><div class="ru-model-paragraph">${(task.model || moves).map(item => pair(item)).join('')}</div><div class="ru-speaking"><span>Speaking Part 3 · 主题练习</span>${pair(task.speaking)}<p>先回答观点，再给一个具体原因和生活例子；可以使用上面的短语。</p><textarea rows="3" aria-label="写作或口语练习笔记" placeholder="试着写出你的观点、原因和一个例子…"></textarea></div></article></section>`;
  }

  function render(options) {
    const { lesson, date, day, showAnswers, result, formAnswers = {}, records = [], completed } = options;
    currentLesson = lesson;
    if (!lesson) return '';
    const timer = getTimer(lesson.id);
    return `<div class="reading-workspace" data-lesson="${esc(lesson.id)}" style="--ru-font-size:${fontSize}px"><div class="ru-page-top"><span>每日精读 · Day ${day || 1} · ${esc(date)}</span><button class="ru-link" data-action="reading-archive">查看往日文章 ↗</button></div><header class="ru-metadata"><div class="ru-topic">${esc(lesson.topic)}</div><h1>${esc(lesson.title)}</h1>${lesson.titleZh || lesson.article?.titleZh ? `<p class="ru-title-zh">${esc(lesson.titleZh || lesson.article.titleZh)}</p>` : ''}<div class="ru-meta-row"><a href="${url(lesson.url)}" target="_blank" rel="noopener noreferrer">${esc(lesson.source)} ↗</a><span>${esc(lesson.published)}</span><span>${esc(lesson.difficulty)}</span><span>首读约 ${esc(lesson.minutes)} 分钟</span></div><p class="ru-focus">训练重点 · ${esc(lesson.focus)}</p></header><div class="ru-reading-flow"><span><strong>1</strong> 用 2–3 分钟浏览原文</span><i>→</i><span><strong>2</strong> 读题，抓英文关键词</span><i>→</i><span><strong>3</strong> 定位后精读，核对范围</span></div><section class="ru-exam" aria-label="IELTS reading practice"><div class="ru-exam-toolbar" lang="en"><span class="ru-exam-label">Reading practice</span><div class="ru-font-controls" aria-label="Text size">${[15, 17, 19].map(size => `<button type="button" data-reading-ui="font" data-size="${size}" class="${fontSize === size ? 'active' : ''}" aria-label="Text size ${size}" aria-pressed="${fontSize === size}">${size === 15 ? 'A' : size === 17 ? 'A+' : 'A++'}</button>`).join('')}</div><div class="ru-timer"><output id="ru-timer-output" aria-label="Time remaining">${timeText(remaining(timer))}</output><button type="button" data-reading-ui="timer">${timer.started ? 'Pause' : 'Start'}</button><button type="button" data-reading-ui="timer-reset" aria-label="Reset timer to twenty minutes">Reset</button></div></div><div class="ru-mobile-tabs" role="tablist" aria-label="Reading panels"><button type="button" role="tab" aria-selected="true" data-reading-ui="panel" data-panel="passage" class="active">Passage</button><button type="button" role="tab" aria-selected="false" data-reading-ui="panel" data-panel="questions">Questions</button></div><div class="ru-exam-panes" data-active-panel="passage"><section class="ru-passage-pane ru-scroll-pane" aria-label="Reading passage"><div class="ru-pane-heading" lang="en"><h2>Reading passage</h2><span>${lesson.article?.paragraphs?.length ? 'Original text' : 'Original website'}</span></div>${passage(lesson, showAnswers)}</section><section class="ru-question-pane ru-scroll-pane" aria-label="Reading questions" lang="en"><div class="ru-pane-heading"><h2>Questions 1–${lesson.questions.length}</h2><span>Answer all questions.</span></div><form id="reading-form" class="ru-questions" lang="en">${lesson.questions.map((item, index) => question(item, index, formAnswers)).join('')}<div class="ru-submit-actions"><button type="submit" class="button">Check answers</button><button type="button" class="button outline" data-action="reveal-reading">Reveal answers</button></div><div class="ru-question-nav" aria-label="Question navigation">${lesson.questions.map((item, index) => `<button type="button" class="${formAnswers[item.id] ? 'answered' : ''}" data-reading-ui="question-jump" data-qid="${esc(item.id)}" aria-label="Go to question ${index + 1}">${index + 1}</button>`).join('')}</div></form></section></div></section>${showAnswers ? `${answers(lesson, result)}${closeReading(lesson)}${wordCards(lesson, records)}${recall(lesson, records)}${writing(lesson)}<div class="ru-complete"><button class="button" data-action="complete-reading">${completed ? '本篇已完成 ✓' : '完成本篇学习 ✓'}</button><button class="ru-link" data-action="reading-archive">浏览文章档案 →</button></div>` : ''}</div>`;
  }

  function locate(main, qid) {
    const question = currentLesson?.questions?.find(item => item.id === qid);
    if (!question) return;
    const ids = evidenceParagraphs(question);
    if (!ids.length) return;
    const element = document.getElementById(paragraphId(currentLesson, ids[0]));
    if (!element) return;
    main.querySelector('.ru-exam-panes').dataset.activePanel = 'passage';
    main.querySelectorAll('[data-reading-ui="panel"]').forEach(button => { const active = button.dataset.panel === 'passage'; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
    main.querySelector('.ru-exam').scrollIntoView({ behavior: 'smooth', block: 'start' });
    const pane = main.querySelector('.ru-passage-pane');
    pane.scrollTo({ top: element.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 70, behavior: 'smooth' });
    main.querySelectorAll('.ru-paragraph').forEach(paragraph => paragraph.classList.remove('ru-focused-evidence'));
    ids.forEach(id => document.getElementById(paragraphId(currentLesson, id))?.classList.add('ru-focused-evidence'));
    setTimeout(() => main.querySelectorAll('.ru-focused-evidence').forEach(paragraph => paragraph.classList.remove('ru-focused-evidence')), 4500);
  }

  function bind(main, callbacks = {}) {
    binding?.abort();
    binding = new AbortController();
    const signal = binding.signal;
    clearInterval(timerInterval);
    const updateClock = () => {
      const output = main.querySelector('#ru-timer-output');
      if (!output || !currentLesson) { clearInterval(timerInterval); return; }
      const timer = getTimer(currentLesson.id), seconds = remaining(timer);
      output.textContent = timeText(seconds);
      output.classList.toggle('ru-timer-ended', seconds === 0);
      const button = main.querySelector('[data-reading-ui="timer"]');
      if (seconds === 0 && timer.started) { timer.remaining = 0; timer.started = null; }
      if (button) button.textContent = timer.started ? 'Pause' : seconds === 0 ? 'Finished' : 'Start';
    };
    timerInterval = setInterval(updateClock, 1000);
    main.addEventListener('click', event => {
      const button = event.target.closest('[data-reading-ui]');
      if (!button) return;
      const action = button.dataset.readingUi;
      if (action === 'font') {
        fontSize = Number(button.dataset.size);
        main.querySelector('.reading-workspace').style.setProperty('--ru-font-size', `${fontSize}px`);
        main.querySelectorAll('[data-reading-ui="font"]').forEach(item => { const active = Number(item.dataset.size) === fontSize; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
      } else if (action === 'timer') {
        const timer = getTimer(currentLesson.id);
        if (timer.started) { timer.remaining = remaining(timer); timer.started = null; }
        else if (timer.remaining > 0) timer.started = Date.now();
        updateClock();
      } else if (action === 'timer-reset') { timers.set(currentLesson.id, { remaining: 20 * 60, started: null }); updateClock(); }
      else if (action === 'panel') {
        main.querySelector('.ru-exam-panes').dataset.activePanel = button.dataset.panel;
        main.querySelectorAll('[data-reading-ui="panel"]').forEach(item => { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-selected', String(active)); });
      } else if (action === 'locate') locate(main, button.dataset.qid);
      else if (action === 'question-jump') document.getElementById(`ru-question-${button.dataset.qid}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      else if (action === 'answer-jump') { event.preventDefault(); document.getElementById(`ru-answer-${button.dataset.qid}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    }, { signal });
    const form = main.querySelector('#reading-form');
    form?.addEventListener('input', () => {
      const answers = Object.fromEntries(new FormData(form));
      main.querySelectorAll('[data-reading-ui="question-jump"]').forEach(button => button.classList.toggle('answered', Boolean(answers[button.dataset.qid])));
      callbacks.onDraft?.(answers);
    }, { signal });
    if (callbacks.onSubmit) form?.addEventListener('submit', event => { event.preventDefault(); callbacks.onSubmit(Object.fromEntries(new FormData(form))); }, { signal });
    updateClock();
  }

  window.IELTS_READING_UI = { render, bind, locate };
})();
