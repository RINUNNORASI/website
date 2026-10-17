/* Original practice scripts and attributed links. No third-party questions are copied. */
(function (host, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  if (host) host.IELTS_LISTENING_DATA = data;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const originals = [
    {
      id:'library-workshop',kind:'original',title:'预约图书馆工作坊',focus:'姓名拼写 · 星期 · 时间 · 费用',minutes:5,
      description:'听一段原创预约对话，先抓住来电目的，再记录四项具体信息。',
      gistPrompt:'来电者想预约什么？先用一句话记录，不必逐字听写。',
      script:'Receptionist: Good morning, Greenway Library. How can I help? Caller: I would like to book a place on the photography workshop. Receptionist: Of course. May I have your surname? Caller: It is Mason. M, A, S, O, N. Receptionist: Thank you. The workshop is on Tuesday. Caller: Does it start at six? Receptionist: Nearly. It starts at six fifteen in the evening and lasts for one hour. Caller: And how much does it cost? Receptionist: It is eight pounds. Please bring your own camera. Caller: That is fine. Please book one place for me.',
      questions:[
        {id:'surname',prompt:'The caller’s surname: ______',answers:['Mason']},
        {id:'day',prompt:'Workshop day: ______',answers:['Tuesday']},
        {id:'time',prompt:'Starting time in the evening: ______',answers:['6:15','6.15','six fifteen','18:15']},
        {id:'cost',prompt:'Cost in pounds: ______',answers:['8','eight','£8','8 pounds','eight pounds']}
      ]
    },
    {
      id:'riverside-volunteers',kind:'original',title:'河岸志愿活动通知',focus:'日期 · 地点 · 数量 · 随身物品',minutes:6,
      description:'听一则原创活动通知，留意更正信息，记录最终确认的安排。',
      gistPrompt:'这则通知面向谁？活动主要做什么？先记主旨。',
      script:'Hello everyone. Here are the final arrangements for our riverside clean-up. We originally planned to meet on the seventeenth of May, but the event will now take place on the eighteenth of May. Please meet at the north gate of Riverside Park at nine thirty in the morning. We have twenty-four volunteers, so we will work in four teams of six. Gloves and bags will be provided. You need to bring a water bottle. There is no need to bring food because lunch will be available at the visitor centre. If it rains heavily, we will send you a message by eight o’clock that morning.',
      questions:[
        {id:'date',prompt:'Final event date: ______ May',answers:['18','eighteenth','18th']},
        {id:'gate',prompt:'Meeting point: the ______ gate',answers:['north']},
        {id:'volunteers',prompt:'Number of volunteers: ______',answers:['24','twenty-four','twenty four']},
        {id:'bring',prompt:'Bring a ______',answers:['water bottle']}
      ]
    },
    {
      id:'urban-shade-study',kind:'original',title:'一项城市遮阴研究',focus:'研究范围 · 数字 · 指标 · 限定条件',minutes:6,
      description:'听一段原创研究简介，区分实际测量结果和研究尚未证明的事情。',
      gistPrompt:'研究比较了什么？不要把温度变化直接写成健康结论。',
      script:'Today I will describe a small study of shade in an urban neighbourhood. Our team selected forty-eight street locations and collected measurements for six weeks in July and August. Half of the locations had mature trees; the others had very little shade. At each location, we measured surface temperature at two o’clock in the afternoon. On sunny days, the shaded surfaces were cooler. However, we did not measure residents’ health or their daily exercise. The findings therefore describe temperature at these locations, rather than proving that trees improved people’s health. Our next study will include interviews with local residents.',
      questions:[
        {id:'locations',prompt:'Number of street locations: ______',answers:['48','forty-eight','forty eight']},
        {id:'weeks',prompt:'Measurements continued for ______ weeks',answers:['6','six']},
        {id:'measured',prompt:'The team measured surface ______',answers:['temperature']},
        {id:'next',prompt:'The next study will include ______ with residents',answers:['interviews']}
      ]
    }
  ];
  const sourcePage='https://takeielts.britishcouncil.org/teach-ielts/teaching-resources/lesson-plans-listening?language=en';
  const official = [
    {id:'bc-part1',kind:'official',title:'Part 1 · 表单信息',focus:'拼写 · 地址 · 尺寸 · 金额',minutes:8,range:'1–8',
      description:'先预测每个空格需要的信息类型，再按对话顺序记录。音频仅对应题 1–8。',
      audioUrl:'https://ielts.org/cdn/Sample-tests/Listening/ielts-listening-sample-task-1-form-completion.mp3',
      questionUrl:'https://takeielts.britishcouncil.org/sites/default/files/2026-06/listening_part_1_form_completion_and_multiple_choice_questions.pdf#page=9',
      answerUrl:'https://takeielts.britishcouncil.org/sites/default/files/2026-06/listening_part_1_form_completion_and_multiple_choice_questions.pdf#page=4',
      transcriptUrl:'https://takeielts.britishcouncil.org/sites/default/files/2026-06/listening_part_1_form_completion_and_multiple_choice_questions.pdf#page=11',questionPage:9,answerPage:4,transcriptPages:'11–12',sourcePage},
    {id:'bc-part2',kind:'official',title:'Part 2 · 社区生活简答',focus:'话题变化 · 并列信息 · 字数限制',minutes:8,range:'11–16',
      description:'分清每组需要几个答案，跟随话题变化，听完后检查题目的字数限制。',
      audioUrl:'https://ielts.org/cdn/Sample-tests/Listening/ielts-listening-sample-task-3-short-answer-questions.mp3',
      questionUrl:'https://takeielts.britishcouncil.org/sites/default/files/2026-06/listening_part_2_short_answer_questions.pdf#page=8',
      answerUrl:'https://takeielts.britishcouncil.org/sites/default/files/2026-06/listening_part_2_short_answer_questions.pdf#page=5',
      transcriptUrl:'https://takeielts.britishcouncil.org/sites/default/files/2026-06/listening_part_2_short_answer_questions.pdf#page=9',questionPage:8,answerPage:5,transcriptPages:'9',sourcePage},
    {id:'bc-part3',kind:'official',title:'Part 3 · 选课态度匹配',focus:'说话人态度 · 否定 · 最终决定',minutes:10,range:'21–25',
      description:'关注最终形成的态度，避免只凭听到课程关键词就选择答案。',
      audioUrl:'https://ielts.org/cdn/Sample-tests/Listening/ielts-listening-sample-task-5-matching.mp3',
      questionUrl:'https://takeielts.britishcouncil.org/sites/default/files/2026-06/listening_part_3_matching-classifying_questions_.pdf#page=9',
      answerUrl:'https://takeielts.britishcouncil.org/sites/default/files/2026-06/listening_part_3_matching-classifying_questions_.pdf#page=4',
      transcriptUrl:'https://takeielts.britishcouncil.org/sites/default/files/2026-06/listening_part_3_matching-classifying_questions_.pdf#page=10',questionPage:9,answerPage:4,transcriptPages:'10–11',sourcePage}
  ];
  function normalize(value) { return String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[–—]/g,'-').replace(/\s+/g,' ').replace(/[.!?。！？]+$/,''); }
  function grade(lesson, answers) {
    if (lesson?.kind !== 'original' || !Array.isArray(lesson.questions)) return null;
    const rows=lesson.questions.map(question=>{ const answer=String(answers?.[question.id] ?? '').slice(0,160);return {id:question.id,answer,expected:question.answers[0],correct:!!normalize(answer)&&question.answers.some(target=>normalize(target)===normalize(answer))}; });
    return {correct:rows.filter(row=>row.correct).length,total:rows.length,rows};
  }
  const archive=[{id:'nasa-small-step',kind:'archive',title:'NASA · 月面历史录音',focus:'真实录音泛听 · 关键词 · 连读',minutes:4,
    description:'听一小段阿波罗 11 号历史录音，记下能听清的词，再回到 NASA 来源页了解背景。',
    gistPrompt:'你听到了什么场景？先记录能辨认的关键词，不必猜全句。',
    audioUrl:'https://www.nasa.gov/wp-content/uploads/2015/01/590331main_ringtone_smallStep.mp3',
    sourcePage:'https://www.nasa.gov/historical-sounds/',credit:'NASA',
    rightsUrl:'https://www.nasa.gov/nasa-brand-center/images-and-media/'}];
  return {originals,official,archive,normalize,grade};
});
