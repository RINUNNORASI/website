(function () {
  const W = (word, ipa, meaning, pos, family, context, c1, c2, synonyms, en, zh) => ({ word, ipa, meaning, pos, family, context, collocations: [{ en: c1[0], zh: c1[1] }, { en: c2[0], zh: c2[1] }], synonyms, example: { en, zh } });
  const urban = {
    id: 'urban-health',
    title: 'How urban design leads to better wellness',
    url: 'https://news.mit.edu/2026/how-urban-design-leads-to-better-wellness-0701',
    source: 'MIT News', published: '2026-07-01', verified: '2026-10-14',
    topic: '城市与健康', difficulty: 'IELTS 6.0–7.0', minutes: 8,
    focus: 'FALSE / NOT GIVEN · 数字与研究变量 · 限定条件',
    questions: [
      { id: 'u1', type: 'tfng', prompt: 'The researchers analysed exactly 28,323 street-view images.', options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'FALSE', translation: '研究者分析了恰好 28,323 张街景图片。', optionTranslations: ['与原文一致', '与原文矛盾', '原文未提供足够信息'], evidence: '“28,323 census tracts”', location: '小标题 Only connect：介绍研究数据的段落。', explanation: '28,323 对应人口普查统计区，街景图片另有超过 800 万张。题干把数字移到了另一变量上，有明确矛盾，所以是 FALSE。', paraphrases: 'census tracts → 人口普查统计区；street-view images → 街景图像，两个单位不能互换。', trap: '数字一样并不代表命题一样；先写出“数字—对象—单位”。' },
      { id: 'u2', type: 'tfng', prompt: 'Socioeconomic factors were taken into account in the analysis.', options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'TRUE', translation: '分析考虑了社会经济因素。', optionTranslations: ['与原文一致', '与原文矛盾', '原文未提供足够信息'], evidence: '“socioeconomic factors”', location: 'Only connect：数据介绍段末句。', explanation: '原文明确说研究考虑了这些因素及其他变量。题干 taken into account 与原文 accounts for 同义。', paraphrases: 'account for → take into account → consider：考虑；这里不是“解释……的原因”。', trap: '同一短语 account for 有多种义项，要由宾语和语境确定。' },
      { id: 'u3', type: 'tfng', prompt: 'The article states the cost, in dollars, of planting one tree in Boston.', options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'NOT GIVEN', translation: '文章说明了在波士顿种一棵树的美元成本。', optionTranslations: ['与原文一致', '与原文矛盾', '原文未提供足够信息'], evidence: '未提供单棵树的美元成本；不是“成本为零”。', location: '核对全文树冠、Boston 和投资回报相关段落。', explanation: '文章涉及波士顿、树冠和投资，但没有给出这项具体价格。不能用常识补足，也不能因为找不到价格就选 FALSE。', paraphrases: 'planting cost → 种植成本；health benefits → 健康收益，不是费用金额。', trap: 'NOT GIVEN 是无法从文章判定；FALSE 需要原文提供相反信息。' },
      { id: 'u4', type: 'choice', prompt: 'Which street pattern can also work well, according to the article?', options: ['A. Rectangular blocks only', 'B. Curving streets with many connections', 'C. Long blocks without amenities', 'D. One identical layout in every city'], answer: 'B', translation: '文章认为哪一种街道模式也可以有效？', optionTranslations: ['A. 只有矩形街区', 'B. 有许多连接的弯曲街道', 'C. 没有便利设施的长街区', 'D. 所有城市采用一个完全相同的布局'], evidence: '“circular and curving”', location: 'Only connect：解释矩形街区和弯曲街道的段落末句。', explanation: 'B 保留了连接性这个必要条件。A 把可行例子变成唯一方案；C 与便利设施、短街区的论述不符；D 忽略不存在适用于所有地点的单一模板。', paraphrases: 'interconnectedness → many connections → 相互连通；as long as → provided that → 只要。', trap: '保留条件从句的约束，不能只读主句的“can also work”。' },
      { id: 'u5', type: 'fill', prompt: 'Write NO MORE THAN TWO WORDS from the article. For the same investment, lower-income neighbourhoods may gain about ______ the added health benefits of better-off areas.', answer: 'four times', translation: '从原文填写不超过两个词：同等投资下，低收入社区可能获得较富裕地区约四倍的额外健康收益。', evidence: '“four times”', location: 'Knowing where to intervene：第一段。', explanation: '比较的是同等投资带来的额外健康收益，不是疾病人数、树木数量或投资额。about 和 may 表示估计及可能性，不是每个社区必然如此。', paraphrases: 'the same level of investment → the same investment；better-off → wealthier → 较富裕的。', trap: 'about ≠ exactly；on aggregate ≠ 每个个体或每个社区。' }
    ],
    overview: [{ en: 'Urban form and health are connected.', zh: '文章讨论城市形态与健康的关系；读时注意关联、规划建议与因果证明的区别。' }],
    structure: [{ en: 'Question → data → patterns → possible action.', zh: '开头提出议题；Only connect 介绍数据与模式；最后讨论可能的干预方向。' }],
    sentences: [
      { en: 'A district with several small parks, which residents can reach on foot, may encourage regular exercise.', zh: '一个拥有数个居民可以步行到达的小公园的城区，可能鼓励经常锻炼。', parts: ['教学改写，非原文引句。主干：A district may encourage regular exercise。', 'with several small parks 修饰 district；which residents can reach on foot 就近修饰 parks。', 'may 表可能；不能改写为一定会让每位居民锻炼。'], tip: '先找谓语，再框出介词短语与关系从句，辨别修饰对象。' },
      { en: 'Although two areas receive equal funding, the improvement in residents’ health may differ.', zh: '虽然两个地区获得相同资金，居民健康的改善幅度可能不同。', parts: ['教学改写，非原文引句。Although 引导让步从句。', '主句主语是 the improvement；in residents’ health 说明哪一方面的改善。', 'equal 修饰 funding，不表示健康结果相同。'], tip: '比较题必须分别绑定投入与结果，不能把一者的相等推给另一者。' }
    ],
    method: { en: 'Association alone does not establish causation.', zh: '研究整合公开健康、环境及人口数据并使用模型。考虑混杂变量会加强分析，但不能仅凭关联断言城市设计单独导致某个个体变健康。文末提出后续时间追踪研究的空间。' },
    words: [
      W('amenity', '/əˈmiːnəti/', '便利设施；生活服务设施', 'n. 可数', 'amenities（复数）；常以复数讨论社区设施。', '城市规划中的设施与服务。', ['local amenities', '当地生活设施'], ['access to amenities', '获得便利设施的机会'], 'facility 更偏具体设施；amenity 强调提升便利与生活品质。', 'The flat is close to shops and other amenities.', '这套公寓靠近商店和其他生活设施。'),
      W('resident', '/ˈrezɪdənt/', '居民', 'n. 可数；adj.', 'reside v. 居住；residential adj. 住宅的。', '城市居民及其健康。', ['local residents', '当地居民'], ['residential area', '住宅区'], 'inhabitant 更正式，常用于人口或地理描述；resident 强调住在某地的人。', 'Local residents asked for a safer crossing.', '当地居民要求设置更安全的过街设施。'),
      W('socioeconomic', '/ˌsəʊsiəʊˌiːkəˈnɒmɪk/', '社会经济的', 'adj.', 'socio- 社会的 + economic 经济的；不用编造单一词源故事。', '研究需要考虑的社会经济因素。', ['socioeconomic factors', '社会经济因素'], ['socioeconomic status', '社会经济地位'], 'economic 只谈经济；socioeconomic 同时涉及社会地位、教育与收入等。', 'Income is one measure of socioeconomic status.', '收入是衡量社会经济地位的一个指标。'),
      W('correlate', '/ˈkɒrəleɪt/', '相互关联；相关', 'v.', 'correlation n. 相关性；correlated adj. 相关的。', '城市特征与健康指标的关联。', ['correlate with', '与……相关'], ['a strong correlation', '较强的相关性'], 'be associated with 也表关联；cause 表因果，证据强度更高。', 'Longer commuting times may correlate with stress.', '更长的通勤时间可能与压力相关。'),
      W('account for', '/əˈkaʊnt fɔː/', '考虑；解释；占（比例）', 'phr. v.', 'account n./v.；三个义项由宾语判断。', '此文语境：分析时考虑其他因素。', ['account for differences', '解释差异'], ['account for other factors', '考虑其他因素'], 'take into account = consider；make up 常对应“占比例”的义项。', 'The model accounts for differences in age.', '这个模型考虑了年龄差异。'),
      W('mixed-use', '/ˌmɪkst ˈjuːs/', '混合用途的', 'adj.', 'mixed 混合的 + use 用途；可写 mixed-use development。', '住宅与商业用途混合的街道。', ['mixed-use development', '混合用途开发'], ['mixed-use neighbourhood', '混合用途社区'], 'multifunctional 强调多功能；mixed-use 常指土地或建筑的多种用途。', 'A mixed-use building has shops below the flats.', '一栋混合用途建筑在公寓下面设有商店。'),
      W('interconnectedness', '/ˌɪntəkəˈnektɪdnəs/', '相互连接；连通性', 'n. 不可数', 'interconnect v. 相互连接；interconnected adj. 相连的。', '街道网络的连通程度。', ['urban interconnectedness', '城市连通性'], ['interconnected streets', '相互连接的街道'], 'connectivity 更常用于网络连接程度；interdependence 是相互依赖。', 'Interconnected streets give pedestrians more routes.', '相互连接的街道为行人提供更多路线。'),
      W('tree canopy', '/triː ˈkænəpi/', '树冠；树冠覆盖层', 'n. phr.', 'canopy n. 覆盖层；canopies 复数。', '城市绿化中的树冠。', ['expand the tree canopy', '扩大树冠覆盖'], ['tree canopy cover', '树冠覆盖'], 'tree cover 泛指树木覆盖；shade 是形成的阴影，二者不可随意互换。', 'A broad tree canopy shades the pavement.', '宽大的树冠为人行道遮阴。'),
      W('disparity', '/dɪˈspærəti/', '显著差距；不平等', 'n. 可数／不可数', 'disparities 复数；常与 between/in 搭配。', '不同地区之间的健康差距。', ['health disparities', '健康差距'], ['a disparity between groups', '群体之间的差距'], 'difference 中性；disparity 往往强调差距明显或不公平。', 'There is a large disparity in access to parks.', '使用公园的机会存在很大差距。'),
      W('preventive', '/prɪˈventɪv/', '预防性的', 'adj.', 'prevent v. 预防；prevention n.；preventative 是另一常用形式。', '预防性健康措施。', ['preventive measures', '预防措施'], ['preventive care', '预防性医疗'], 'precautionary 强调应对潜在风险；preventive 强调防止问题发生。', 'Regular checks are part of preventive care.', '定期检查属于预防性医疗。'),
      W('isolation', '/ˌaɪsəˈleɪʃən/', '孤立；隔离', 'n. 不可数', 'isolate v. 孤立；isolated adj. 孤立的。', '步行与社会接触相关的语境。', ['social isolation', '社会孤立'], ['reduce isolation', '减少孤立'], 'loneliness 是主观孤独感；isolation 是联系少或被隔离的状态。', 'Community activities can reduce social isolation.', '社区活动可以减少社会孤立。'),
      W('intervention', '/ˌɪntəˈvenʃən/', '干预；介入', 'n. 可数／不可数', 'intervene v. 干预；inter- 可提示“介入其间”。', '规划者可以采取的改善行动。', ['policy intervention', '政策干预'], ['targeted intervention', '有针对性的干预'], 'measure 是措施；intervention 强调介入某个问题或过程。', 'The council planned an intervention near the school.', '地方议会计划在学校附近采取干预措施。'),
      W('empirical', '/ɪmˈpɪrɪkəl/', '实证的；以观察为依据的', 'adj.', 'empirically adv. 以实证方式；不等于一定正确。', '文章对研究证据的定位。', ['empirical evidence', '实证证据'], ['empirical study', '实证研究'], 'theoretical 依据理论；empirical 依据观察或数据。', 'The proposal needs empirical evidence.', '这项提议需要实证证据。'),
      W('determinant', '/dɪˈtɜːmɪnənt/', '决定因素；影响因素', 'n. 可数', 'determine v. 确定／决定；determination n. 决心／确定。', '健康的社会与物质影响因素。', ['social determinants', '社会决定因素'], ['a key determinant', '一个关键影响因素'], 'factor 范围更广；determinant 强调对结果具有重要影响。', 'Housing is an important determinant of health.', '住房是影响健康的重要因素。'),
      W('return on investment', '/rɪˈtɜːn ɒn ɪnˈvestmənt/', '投资回报', 'n. phr.', 'invest v. 投资；investment n. 投资；简称 ROI。', '用健康收益讨论规划投入。', ['improve returns on investment', '改善投资回报'], ['a long-term investment', '长期投资'], 'benefit 是收益；return on investment 将收益与投入相联系。', 'Better insulation can offer a good return on investment.', '更好的隔热措施可以带来不错的投资回报。')
    ],
    recall: [
      { phase: 'teaching', prompt: '第一、二次接触：先对照词卡，理解 amenities → 社区设施；尝试指出家附近的一种 amenity。', answer: '例如 a library / a park / a local shop。只确认理解，不判默写掌握。' },
      { phase: 'teaching', prompt: '第一、二次接触：correlate with 表示“有关联”还是“必然导致”？', answer: '表示有关联；不能单凭相关性确认因果。' },
      { phase: 'recall', prompt: '第三次起，可看提示：English → Chinese: account for other factors.', answer: '考虑其他因素。这里的 account for 不是“占比例”。' },
      { phase: 'recall', prompt: '第三次起，可看提示：Chinese → English: 有针对性的干预（t_______ i_______）。', answer: 'targeted intervention' },
      { phase: 'output', prompt: '第四次起：Complete: Access to local ______ can make daily life easier. (amenities / isolation)', answer: 'amenities。其他原文语境不自动纳入错词；需用户明确提交。' },
      { phase: 'output', prompt: '第四次起：用 may / correlate with 写一句通勤与压力的谨慎观点。', answer: 'Long commuting times may correlate with higher stress. 通勤时间长可能与更高压力相关；合理变体同样有效。' }
    ],
    writing: [{ en: 'Cities should improve access to daily services, especially in underserved neighbourhoods.', zh: '城市应改善日常服务的可及性，尤其是在服务不足的社区。' }, { en: 'Such investment may support well-being, but its effects should be evaluated over time.', zh: '这样的投资可能支持身心健康，但应长期评估其效果。' }]
  };
  urban.candidateWords = urban.words.map(w => w.word);
  window.READING_LESSONS = [urban];
  window.READING_WORD = W;
})();

(function () {
  const W = window.READING_WORD;
  const lesson = {
    id: 'teacher-communication',
    title: 'Positive teacher communication boosts attendance, learning and motivation',
    url: 'https://www.ucl.ac.uk/news/2026/sep/positive-teacher-communication-boosts-attendance-learning-and-motivation',
    source: 'UCL News', published: '2026-09-08', verified: '2026-10-14',
    topic: '教育与社会', difficulty: 'IELTS 6.0–7.0', minutes: 7,
    focus: '数字绑定 · 调查对象 · 并列结构的修饰范围',
    questions: [
      { id: 'e1', type: 'tfng', prompt: '94% of young people said positive teacher communication motivated them to attend school.', options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'FALSE', translation: '94% 的年轻人说教师的积极沟通使他们更有动力去学校。', optionTranslations: ['与原文一致', '与原文矛盾', '原文未提供足够信息'], evidence: '“helps them learn”', location: '标题下方导语，分别对应两个百分比。', explanation: '94% 对应帮助学习；去学校的动力对应 93%。原文有明确相反的数字绑定，所以为 FALSE。', paraphrases: 'makes them more motivated to come to school → motivates them to attend school；helps them learn → 支持学习。', trap: '同一并列句里有两个数字，必须分别绑定各自谓语。' },
      { id: 'e2', type: 'tfng', prompt: 'The survey included both young people and secondary school teachers.', options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'TRUE', translation: '该调查同时包括年轻人和中学教师。', optionTranslations: ['与原文一致', '与原文矛盾', '原文未提供足够信息'], evidence: '“600 secondary school teachers”', location: '正文开头，介绍 UK-wide study 的段落。', explanation: '调查包括超过 1,000 位年轻人与 600 位中学教师。后续访谈是另一个阶段，不应与问卷样本人数混算。', paraphrases: 'surveyed → included in the survey；both A and B → A、B 两类都包括。', trap: '先区分 survey 与 follow-up discussions，再核对各阶段研究对象。' },
      { id: 'e3', type: 'tfng', prompt: 'Teachers completed six hours of communication training before answering the survey.', options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'NOT GIVEN', translation: '教师在回答问卷前完成了六小时沟通培训。', optionTranslations: ['与原文一致', '与原文矛盾', '原文未提供足够信息'], evidence: '全文没有说明调查前是否培训及培训时长。', location: '核对研究方法介绍段，以及呼吁改进教师培训的政策段落。', explanation: '文章呼吁把积极沟通纳入教师培训，并不等于被调查教师此前已经参加某种培训。也没有说明他们没参加过，不能判 FALSE。', paraphrases: 'calling for training → 呼吁培训；completed training → 已完成培训，时间与事实状态不同。', trap: '建议将来采取行动，不是报告过去已采取行动。' },
      { id: 'e4', type: 'choice', prompt: 'Which percentage of teachers identified workload as a barrier to positive relationships?', options: ['A. 70%', 'B. 61%', 'C. 54%', 'D. 16%'], answer: 'A', translation: '多少比例的教师把工作负荷视为建立积极关系的障碍？', optionTranslations: ['A. 70%', 'B. 61%', 'C. 54%', 'D. 16%'], evidence: '“workload (70%)”', location: '介绍教师看法的段落，列出 workload、pupil behaviour、curriculum pressures。', explanation: 'A 对应教师的工作负荷。B 对应课程压力；C 属于特定年轻人群体对不愿到校的报告；D 是年轻人报告遭教师叫作“stupid”的比例。选项跨对象、跨变量，不能凭数字熟悉度选择。', paraphrases: 'made it harder → a barrier → 妨碍；workload → 工作负荷。', trap: '先锁定 teachers，再锁定 workload；不要把学生比例误用到教师。' },
      { id: 'e5', type: 'fill', prompt: 'Write ONE WORD from the article. The 42% figure refers to patience, fairness and ______.', answer: 'understanding', translation: '从原文填一个词：42% 对应耐心、公平与理解。', evidence: '“understanding”', location: '年轻人认为哪些行动能增加自信与受到鼓励的段落。', explanation: '42% 绑定 patience, fairness and understanding 这一并列组。原文没有说其中每项被独立测出相同百分比，也没有把 42% 绑定后面的两项。', paraphrases: 'patience → 耐心；fairness → 公平；understanding → 理解。', trap: '括号的位置界定统计值所属的并列组，不可自行拆成三项独立结果。' }
    ],
    overview: [{ en: 'Everyday communication matters in education.', zh: '文章以年轻人与教师的调查回应讨论日常沟通。重点区分参与者的感受、调查结果和政策呼吁。' }],
    structure: [{ en: 'Survey → experiences → barriers → recommendations.', zh: '先介绍调查；再呈现学生体验、教师障碍；最后讨论培训与教育政策建议。' }],
    sentences: [
      { en: 'Students who feel respected may participate more, while teachers under pressure may struggle to listen patiently.', zh: '感觉受到尊重的学生可能更多参与，而承受压力的教师可能难以耐心倾听。', parts: ['教学改写，非原文引句。who feel respected 修饰 Students。', 'while 连接两种情况，表示对照。', 'under pressure 修饰 teachers；两个 may 都表示可能，而非保证。'], tip: '遇到 while，分别写出左右两侧的对象与谓语，防止信息串线。' },
      { en: 'A survey of pupils and teachers can describe their experiences without proving that one factor caused another.', zh: '针对学生和教师的调查可以描述他们的体验，而未必证明一个因素造成另一个因素。', parts: ['教学改写，非原文引句。主干：A survey can describe their experiences。', 'of pupils and teachers 同时限定调查的两个群体。', 'without proving 后接 that 宾语从句，强调因果证据的限制。'], tip: '描述感受、统计关联和证明因果是不同层级的证据。' }
    ],
    method: { en: 'Reported experiences are not experimental proof.', zh: '文章描述调查及后续讨论，包含参与者自述。自述可以帮助理解体验；未报告随机分组的干预试验，就不能把“有帮助的感受”读成已测得客观成绩提升或因果效应。作者态度积极，但正文 could、may 等限定不能删除。' },
    words: [
      W('attendance', '/əˈtendəns/', '出勤；到场', 'n. 不可数', 'attend v. 出席；attendee n. 参加者。', '学校出勤议题。', ['school attendance', '学校出勤'], ['improve attendance', '改善出勤率'], 'participation 是参与程度；attendance 只说明到场或出勤。', 'The school records attendance every morning.', '学校每天早晨记录出勤情况。'),
      W('motivation', '/ˌməʊtɪˈveɪʃən/', '动力；动机', 'n. 可数／不可数', 'motivate v. 激励；motivated adj. 有动力的。', '去学校与学习的动力。', ['learning motivation', '学习动力'], ['increase motivation', '增强动力'], 'incentive 是外在诱因；motivation 可包含内在原因。', 'Clear goals can increase learning motivation.', '清晰的目标可以增强学习动力。'),
      W('strengthen', '/ˈstreŋθən/', '加强；增强', 'v.', 'strong adj.；strength n.；-en 可构成“使变得”的动词。', '加强师生沟通与关系。', ['strengthen relationships', '加强关系'], ['strengthen skills', '强化技能'], 'enhance 偏提升质量；strengthen 偏让事物更强或更稳固。', 'Regular conversations can strengthen trust.', '经常交流可以增强信任。'),
      W('engagement', '/ɪnˈɡeɪdʒmənt/', '参与；投入', 'n. 不可数／可数', 'engage v.；engaged adj. 投入的；engaging adj. 吸引人的。', '学生的学习投入。', ['student engagement', '学生投入'], ['active engagement', '积极参与'], 'involvement 是参与某事；engagement 往往强调注意力与投入程度。', 'The teacher used questions to encourage engagement.', '教师用提问来鼓励学生投入。'),
      W('belonging', '/bɪˈlɒŋɪŋ/', '归属感', 'n. 不可数', 'belong v. 属于；belongings 复数是“个人物品”。', '学生对学校的归属感。', ['a sense of belonging', '归属感'], ['create a sense of belonging', '建立归属感'], 'inclusion 是被接纳的过程；belonging 强调主观归属体验。', 'A friendly class gives pupils a sense of belonging.', '友好的班级让学生产生归属感。'),
      W('fairness', '/ˈfeənəs/', '公平；公正', 'n. 不可数', 'fair adj. 公平的；fairly adv. 公平地／相当。', '学生重视的教师态度。', ['ensure fairness', '确保公平'], ['fairness in assessment', '评估中的公平'], 'equality 侧重平等；fairness 强调处理方式公正，未必是人人得到同样东西。', 'Clear rules can improve fairness in assessment.', '明确的规则可以改善评估的公平性。'),
      W('harsh', '/hɑːʃ/', '严厉的；苛刻的', 'adj.', 'harshly adv.；harshness n.；可形容话语、条件、天气。', '教师严厉话语的体验。', ['harsh words', '严厉的话语'], ['harsh criticism', '苛刻的批评'], 'strict 是严格，未必伤人；harsh 常带令人不舒服或过度严厉的意味。', 'Harsh criticism may discourage a nervous learner.', '苛刻的批评可能使紧张的学习者灰心。'),
      W('contribute to', '/kənˈtrɪbjuːt tuː/', '促成；有助于；导致（部分）', 'phr. v.', 'contribution n. 贡献；contributor n. 贡献者。', '学校体验与不愿到校的关系。', ['contribute to progress', '有助于进步'], ['contribute to a problem', '促成某个问题'], 'cause 可表直接造成；contribute to 常指多种原因之一。', 'Poor lighting can contribute to eye strain.', '不良照明可能导致眼睛疲劳。'),
      W('overwhelmingly', '/ˌəʊvəˈwelmɪŋli/', '压倒性地；绝大多数地', 'adv.', 'overwhelm v.；overwhelming adj. 压倒性的。', '概括教师对积极关系的重视。', ['overwhelmingly support', '绝大多数支持'], ['overwhelmingly positive', '总体非常积极的'], 'mostly 表大部分；overwhelmingly 表占明显优势，但仍不等于全部。', 'Parents overwhelmingly supported the safer route.', '绝大多数家长支持这条更安全的路线。'),
      W('curriculum', '/kəˈrɪkjələm/', '课程体系；全部课程', 'n. 可数', 'curricula / curriculums 都是复数；curricular adj.。', '教师面临的课程压力。', ['school curriculum', '学校课程体系'], ['curriculum reform', '课程改革'], 'syllabus 是某门课的大纲；curriculum 是整体课程设置。', 'The curriculum includes art and science.', '课程体系包含艺术和科学。'),
      W('verbal', '/ˈvɜːbəl/', '言语的；用语言表达的', 'adj.', 'verbally adv.；不要因含 verb 就误解成“动词的”。', '言语互动与言语伤害。', ['verbal communication', '言语沟通'], ['verbal abuse', '言语虐待'], 'oral 特指口头；verbal 在某些语境也可涵盖书面语言，依搭配判断。', 'A calm tone improves verbal communication.', '平静的语气有助于言语沟通。'),
      W('mutual', '/ˈmjuːtʃuəl/', '相互的；共同的', 'adj.', 'mutually adv. 相互地。', '师生之间的相互尊重。', ['mutual respect', '相互尊重'], ['mutual understanding', '相互理解'], 'shared 强调共同拥有；mutual 常强调双方彼此。', 'Good teamwork depends on mutual respect.', '良好的团队合作依赖相互尊重。'),
      W('inclusive', '/ɪnˈkluːsɪv/', '包容的；涵盖广泛人群的', 'adj.', 'include v. 包括；inclusion n. 包容；exclusive adj. 排他的。', '让不同学生获得支持的学校。', ['inclusive education', '包容性教育'], ['an inclusive environment', '包容的环境'], 'accessible 强调可进入或可使用；inclusive 强调接纳与参与机会。', 'An inclusive classroom welcomes different needs.', '包容的课堂接纳不同需求。'),
      W('cost-effective', '/ˌkɒst ɪˈfektɪv/', '成本效益高的；划算的', 'adj.', 'cost 成本 + effective 有效；cost-effectiveness n.。', '教育措施投入与效果的评价。', ['a cost-effective approach', '成本效益高的方法'], ['cost-effective solutions', '成本效益高的解决方案'], 'cheap 只说价格低；cost-effective 比较成本与效果，未必最便宜。', 'Group workshops can be a cost-effective option.', '小组工作坊可以是一种成本效益高的选择。'),
      W('persistent', '/pəˈsɪstənt/', '持续的；坚持不懈的', 'adj.', 'persist v. 持续／坚持；persistence n.。', '持续存在的教育挑战。', ['persistent challenges', '长期存在的挑战'], ['persistent effort', '坚持不懈的努力'], 'continuous 常指不中断；persistent 强调持续存在或不轻易消失。', 'Persistent effort can make a difficult skill easier.', '坚持不懈的努力可以让难学的技能变得更容易。')
    ],
    recall: [
      { phase: 'teaching', prompt: '第一、二次接触：对照词卡，把 attendance 与“到场／出勤”、engagement 与“投入”配对。', answer: 'attendance = 出勤；engagement = 参与／投入。到场不自动等于认真投入。' },
      { phase: 'teaching', prompt: '第一、二次接触：看例句理解 harsh 与 strict 的差异，不要求默写。', answer: 'strict 强调严格；harsh 常有过度严厉或使人不舒服的含义。' },
      { phase: 'recall', prompt: '第三次起，带提示 English → Chinese: a sense of belonging.', answer: '归属感。不要与 belongings（个人物品）混淆。' },
      { phase: 'recall', prompt: '第三次起，带提示 Chinese → English: 相互尊重（m_____ r_____）。', answer: 'mutual respect' },
      { phase: 'output', prompt: '第四次起：Complete: Poor sleep may ______ difficulties with concentration. (contribute to / belong to)', answer: 'contribute to，促成注意力困难；这不是指定唯一病因。' },
      { phase: 'output', prompt: '第四次起：用 inclusive 与 engagement 写一句学校建议。', answer: 'An inclusive classroom may improve student engagement. 包容的课堂可能改善学生投入；合理变体可接受。' }
    ],
    writing: [{ en: 'Teachers need time and support to build respectful relationships with students.', zh: '教师需要时间和支持来与学生建立互相尊重的关系。' }, { en: 'A practical policy should address workload as well as communication skills.', zh: '务实的政策应同时处理工作负荷和沟通技能问题。' }]
  };
  lesson.candidateWords = lesson.words.map(w => w.word);
  window.READING_LESSONS.push(lesson);
})();

window.PLASTIC_LESSON = {
  id: 'plastic-materials',
  title: 'MIT spinout turns plastic waste into resilient building materials',
  url: 'https://news.mit.edu/2026/mit-spinout-turns-plastic-waste-into-resilient-building-materials-0914',
  source: 'MIT News',
  published: '2026-09-14',
  verified: '2026-10-14',
  topic: '设计与可持续材料',
  difficulty: 'IELTS 6.0–7.0',
  minutes: 8,
  focus: '数字与变量绑定 · 范围限定 · 目标与成果 · FALSE / NOT GIVEN',
  questions: [
    {
      id: 'plastic-q1', type: 'tfng',
      prompt: 'Trusses tested at MIT supported over 4,000 pounds.',
      options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'TRUE',
      translation: '在 MIT 测试的桁架能够承受超过 4,000 磅的重量。',
      optionTranslations: ['正确：原文支持该说法', '错误：原文给出相反信息', '未提及：原文不足以判断'],
      evidence: '原文短引：“over 4,000 pounds”。',
      location: 'Research for impact 小节，介绍 MIT 桁架研究结果的段落；正文可搜索 4,000。',
      explanation: '报道明确把超过 4,000 磅与桁架承载重量绑定，把少于 13 分钟与打印耗时绑定。题干的对象与变量都对应原文，因此为 TRUE。此处不能把打印速度当作承载能力。',
      paraphrases: 'supported → 能够承受；over → 超过。两处表述的比较方向一致。',
      trap: '先写“桁架—承重—超过 4,000 磅”，再判断；不要仅因看见相同数字就选答案。'
    },
    {
      id: 'plastic-q2', type: 'tfng',
      prompt: 'The daily output figure describes finished homes rather than framing components.',
      options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'FALSE',
      translation: '日产量数字指的是完工住宅，而不是框架部件。',
      optionTranslations: ['正确：原文支持该说法', '错误：原文给出相反信息', '未提及：原文不足以判断'],
      evidence: '原文短引：“structural framing components”。',
      location: 'Research for impact 小节靠后的段落；找到介绍“目前每个工厂生产单元”产能的句子。',
      explanation: '原文明确限定该日产量数字所指的是大约一栋小住宅所需的结构框架部件。题干却说这个数字指完工住宅、而非框架部件，与原文明示的统计范围相反，因此为 FALSE。判断依据是该数字实际描述的对象，不是推测系统还有什么其他能力。',
      paraphrases: '生产所需的结构框架部件 ≠ 完成整栋住宅；about → 大约，表示近似值。',
      trap: '对照谓语和宾语：生产什么？同样出现“一天”和“一栋住宅”，并不代表两句话等义。'
    },
    {
      id: 'plastic-q3', type: 'tfng',
      prompt: 'Waterless recycling consumes less electricity than conventional recycling.',
      options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'NOT GIVEN',
      translation: '无水回收比传统回收耗电更少。',
      optionTranslations: ['正确：原文支持该说法', '错误：原文给出相反信息', '未提及：原文不足以判断'],
      evidence: '原文介绍免用水的流程及其推广便利，但没有给出两种流程的耗电对比。',
      location: '开篇介绍回收技术及水资源可及性的段落；检查全文也没有耗电比较数据。',
      explanation: '不需要用水，不能推出更省电。报道没有证明更省电，也没有说更费电，因此不能判 FALSE，正确答案是 NOT GIVEN。这里缺失的是“电力消耗”这个变量的比较。',
      paraphrases: '无水 → 用水需求；耗电更少 → 电力需求。两者属于不同测量变量。',
      trap: '“环保”这种总体印象不是答案证据；只有原文明确比较的指标才能用于判断。'
    },
    {
      id: 'plastic-q4', type: 'choice',
      prompt: 'What motivated the project?',
      options: ['A. Faster shipping', 'B. Housing shortages and plastic waste', 'C. Cheaper water supplies'],
      answer: 'B',
      translation: '是什么推动了这个项目？',
      optionTranslations: ['A. 更快的运输', 'B. 住房短缺与塑料废弃物', 'C. 更便宜的供水'],
      evidence: '开篇并列介绍住房需求和塑料过剩，并说明公司希望用一个方案处理两者。',
      location: '正文最开头的三个段落；后文 Research for impact 又解释了创始人的问题意识。',
      explanation: 'B 对应两个并列问题。A 把后文对远距离生产运输的讨论当成项目最初动机；C 把无水技术的应用优势改成降低供水价格，原文没有这样表述。',
      paraphrases: '住房需求上升 → 住房供应问题；塑料过剩 → 废弃物处理问题。',
      trap: '识别并列范围：项目同时回应两个问题，不能只保留其中一个，也不能用后文的实施优势替换最初动机。'
    },
    {
      id: 'plastic-q5', type: 'fill',
      prompt: 'Complete the sentence with ONE WORD from the article. Bottle plastic is strengthened with ______ before printing.',
      answer: 'fiberglass',
      translation: '用原文中的一个词完成句子：瓶子塑料在打印前与______结合以增强强度。',
      evidence: '原文短引：“fiberglass”。',
      location: 'Research for impact 小节，按顺序介绍破碎、熔化、融合与打印的段落；搜索该材料名称。',
      explanation: '报道说明塑料先破碎，再熔化并与玻璃纤维融合，随后打印成部件。填入原文美式拼写 fiberglass，满足 ONE WORD。英式常见拼写 fibreglass 可用于平时笔记，但该题要求取自原文。',
      paraphrases: 'strengthened → 增强强度；与玻璃纤维融合是打印之前的处理步骤。',
      trap: '材料名称和制造工具要分清：玻璃纤维是加入的材料，打印机是后续成形工具。'
    }
  ],
  overview: [
    { en: 'Teaching summary: One technology addresses two resource problems.', zh: '教学概括：报道介绍用回收塑料制造建筑部件的技术，把住房材料需求与塑料污染联系起来。' },
    { en: 'Teaching summary: Demonstrations differ from future ambitions.', zh: '教学概括：已有桥梁应用、MIT 的桁架研究、当前产能和创始人的未来目标分别属于不同证据层级。十亿栋住宅、三十年是使命设想，不能写成已完成的成果。' }
  ],
  structure: [
    { en: 'Problem → process → evidence → expansion', zh: '问题背景：住房与塑料；技术流程：回收、融合、打印；现有证据：桁架研究和部件应用；扩展计划：本地生产与国际合作。此为教师梳理，不是原文引句。' },
    { en: 'Separate facts, reported views and plans.', zh: '读到数字时单独记录对象、单位、时间和来源；读到创始人引语时判断它在报告现状、提出预测，还是表达愿景。' }
  ],
  sentences: [
    {
      en: 'Teaching rewrite: Each cell makes framing parts for a small home, rather than a finished home.',
      zh: '教学改写，非原文引句：每个生产单元制造一栋小住宅所需的框架部件，而不是完成整栋住宅。',
      parts: ['主语：每个生产单元；谓语：制造。', '宾语：框架部件；“一栋小住宅所需的”限定部件用途。', '后半句明确排除“完工住宅”，防止把部件产能扩大为整栋建筑产能。'],
      tip: '先找中心名词，再把修饰语挂回它：产出的中心名词是“部件”。'
    },
    {
      en: 'Teaching rewrite: Plastic is melted, combined with another material and then printed into parts.',
      zh: '教学改写，非原文引句：塑料被熔化，与另一种材料结合，然后被打印成部件。',
      parts: ['共同主语是塑料，三个并列动作都作用于它。', '三个动作共享被动结构；后两个动作省略重复的助动词。', '“与另一种材料结合”属于第二个动作；“打印成部件”属于第三个动作。'],
      tip: '用箭头画出熔化→结合→打印，逐项检查材料、动作和顺序，避免把并列项混读。'
    }
  ],
  method: {
    en: 'Teaching note: A news report is not a controlled comparison.',
    zh: '这是 MIT 新闻报道，包含创始人陈述、技术流程、MIT 的性能研究及实际应用。桁架承重数据支持特定部件的性能；桥梁案例说明已有应用。它没有提供完整生命周期对照，也不能证明所有建筑、所有环境下都更环保或更便宜。作者整体态度积极，但把“可能降低成本”读成“已经在所有情况下更便宜”会增强原文结论。'
  },
  words: [
    {
      word: 'resilient', ipa: '/rɪˈzɪliənt/', meaning: '有韧性的；受冲击后能恢复的', pos: 'adj.',
      family: 'resilience n. 韧性；resilient adj. 有韧性的。已有词族，作为巩固，不能机械计作新词。',
      context: '标题用来描述建筑材料的韧性；材料语境偏抗冲击、保持功能，人和社会语境偏恢复能力。',
      collocations: [{ en: 'resilient communities', zh: '有恢复能力的社区' }, { en: 'a resilient economy', zh: '有韧性的经济' }],
      synonyms: 'robust 偏强健、可靠；resilient 强调承受冲击并恢复。durable 强调经久耐用，两者不能完全互换。',
      example: { en: 'A resilient community can recover after a flood.', zh: '有韧性的社区能够在洪灾后恢复。' }
    },
    {
      word: 'durable', ipa: '/ˈdjʊərəbl/', meaning: '耐用的；持久的', pos: 'adj.',
      family: 'durability n. 耐用性；durable adj. 耐用的。可与同主题词汇一起巩固。',
      context: '报道把回收塑料制成的建筑材料描述为可以长期使用的材料。',
      collocations: [{ en: 'durable materials', zh: '耐用材料' }, { en: 'a durable solution', zh: '持久有效的解决方案' }],
      synonyms: 'long-lasting 持续时间长，较通俗；durable 常用于产品、材料，也用于协议或解决方案。',
      example: { en: 'Schools need durable furniture that is easy to repair.', zh: '学校需要容易维修的耐用家具。' }
    },
    {
      word: 'infrastructure', ipa: '/ˈɪnfrəstrʌktʃə/', meaning: '基础设施', pos: 'n. 通常不可数',
      family: 'infrastructural adj. 基础设施的；把道路、桥梁、供水系统作为同一语义组记忆，不编造词源。',
      context: '文章把建筑之外的桥梁等设施也列入该技术的应用范围。',
      collocations: [{ en: 'public infrastructure', zh: '公共基础设施' }, { en: 'invest in infrastructure', zh: '投资基础设施' }],
      synonyms: 'facilities 设施，常指具体场所或设备；infrastructure 指支撑社会运行的整体基础系统。',
      example: { en: 'Reliable infrastructure makes daily travel easier.', zh: '可靠的基础设施让日常出行更便利。' }
    },
    {
      word: 'manufacturing', ipa: '/ˌmænjʊˈfæktʃərɪŋ/', meaning: '制造；制造业', pos: 'n.',
      family: 'manufacture v./n. 制造；manufacturer n. 制造商；manufacturing 是 manufacture 的 -ing 形式。',
      context: '文章讨论用机器人和打印设备制造建筑部件的流程。',
      collocations: [{ en: 'the manufacturing sector', zh: '制造业部门' }, { en: 'manufacturing costs', zh: '制造成本' }],
      synonyms: 'production 生产，范围更广，也可指农业产出；manufacturing 通常指把原材料加工成产品。',
      example: { en: 'Better training can improve manufacturing quality.', zh: '更好的培训可以提高制造质量。' }
    },
    {
      word: 'conventional', ipa: '/kənˈvenʃənl/', meaning: '传统的；常规的', pos: 'adj.',
      family: 'convention n. 惯例；conventional adj. 常规的；unconventional adj. 非传统的，un- 表示否定。',
      context: '报道拿既有建筑生产方式与新技术作比较。常规并不自动等于落后或有害。',
      collocations: [{ en: 'conventional methods', zh: '常规方法' }, { en: 'conventional wisdom', zh: '普遍接受的看法' }],
      synonyms: 'traditional 强调沿袭历史习俗；conventional 强调当前普遍采用、符合惯例。',
      example: { en: 'The study compares a new method with a conventional one.', zh: '这项研究把一种新方法与一种常规方法进行比较。' }
    },
    {
      word: 'capacity', ipa: '/kəˈpæsəti/', meaning: '容量；产能；能力', pos: 'n.',
      family: 'capacity 与 capable / capability 在含义上相关，但不作为简单加后缀的构词关系来记。',
      context: '报道讨论生产系统能制造多少材料或部件；此处是产能，不是住宅居住人数。',
      collocations: [{ en: 'production capacity', zh: '生产能力；产能' }, { en: 'at full capacity', zh: '以满负荷运行' }],
      synonyms: 'ability 常用于人能做什么；capacity 还可表示系统可容纳或可生产的上限。',
      example: { en: 'The new workshop has the capacity to serve more students.', zh: '新工作室有能力服务更多学生。' }
    },
    {
      word: 'component', ipa: '/kəmˈpəʊnənt/', meaning: '组成部分；部件', pos: 'n.',
      family: 'component n./adj. 组成部分／组成的；用“部件→整体”的关系记忆。',
      context: '生产系统制造的是结构部件；不能把部件数量直接当作整栋住宅数量。',
      collocations: [{ en: 'a key component', zh: '关键组成部分' }, { en: 'electronic components', zh: '电子元件' }],
      synonyms: 'part 较通用；component 常指系统、机器或产品中具有功能的组成部分。',
      example: { en: 'Public transport is a key component of urban planning.', zh: '公共交通是城市规划的重要组成部分。' }
    },
    {
      word: 'deploy', ipa: '/dɪˈplɔɪ/', meaning: '部署；调配使用', pos: 'v.',
      family: 'deployment n. 部署；redeploy v. 重新部署，re- 表示再次。',
      context: '创始人希望在不同地区部署生产系统；这是扩大应用的计划。',
      collocations: [{ en: 'deploy resources', zh: '调配资源' }, { en: 'deploy new technology', zh: '部署新技术' }],
      synonyms: 'use 使用，较宽泛；deploy 强调有计划地把人员、设备或资源投入使用。',
      example: { en: 'The city will deploy more buses during the festival.', zh: '节日期间，城市将调配更多公交车。' }
    },
    {
      word: 'sustainable', ipa: '/səˈsteɪnəbl/', meaning: '可持续的；能长期维持的', pos: 'adj.',
      family: 'sustain v. 维持 + -able → sustainable；sustainability n. 可持续性。可与 sustainability 一起巩固词族。',
      context: '文章用长期使用材料的角度讨论可持续性；它没有量化所有环境指标。',
      collocations: [{ en: 'sustainable development', zh: '可持续发展' }, { en: 'sustainable transport', zh: '可持续交通' }],
      synonyms: 'environmentally friendly 偏环境友好；sustainable 还包含长期资源、社会或经济维持能力。',
      example: { en: 'A sustainable transport system should also be affordable.', zh: '可持续的交通系统也应当让人负担得起。' }
    },
    {
      word: 'degrade', ipa: '/dɪˈɡreɪd/', meaning: '退化；降解；使质量下降', pos: 'v.',
      family: 'degradation n. 退化；degraded adj. 退化的。可与 degradation 一起巩固词族。',
      context: '文中指材料在反复回收过程中性能下降；不等于它立即完全分解消失。',
      collocations: [{ en: 'degrade over time', zh: '随时间退化' }, { en: 'degrade the environment', zh: '损害环境质量' }],
      synonyms: 'deteriorate 强调状况变坏，通常不及物；degrade 可及物，也可用于材料品质下降。已有 deteriorate，比较巩固。',
      example: { en: 'Some materials degrade when exposed to sunlight.', zh: '某些材料暴露在阳光下会退化。' }
    },
    {
      word: 'supply chain', ipa: '/səˈplaɪ tʃeɪn/', meaning: '供应链', pos: 'n. phrase',
      family: 'supply v./n. 供应；supplier n. 供应商；chain n. 链条，词组整体记忆。',
      context: '报道讨论大量住宅建设对全球材料供应网络可能产生的压力。',
      collocations: [{ en: 'disrupt supply chains', zh: '扰乱供应链' }, { en: 'a global supply chain', zh: '全球供应链' }],
      synonyms: 'distribution network 配送网络，偏向分销环节；supply chain 涵盖原材料、生产、运输等连续环节。',
      example: { en: 'A storm can disrupt the food supply chain.', zh: '暴风雨可能扰乱食品供应链。' }
    },
    {
      word: 'carbon footprint', ipa: '/ˌkɑːbən ˈfʊtprɪnt/', meaning: '碳足迹；某活动造成的温室气体排放量', pos: 'n. phrase',
      family: 'carbon n. 碳；footprint n. 足迹，词组以“活动留下的排放痕迹”作记忆提示。',
      context: '创始人用碳足迹讨论本地生产的潜在益处；这是报道中的观点，不是完整量化对照。',
      collocations: [{ en: 'reduce a carbon footprint', zh: '减少碳足迹' }, { en: 'a smaller carbon footprint', zh: '较小的碳足迹' }],
      synonyms: 'carbon emissions 碳排放，指排放本身；carbon footprint 常把排放归属于某人、产品或活动。',
      example: { en: 'Sharing a car may reduce the carbon footprint of a journey.', zh: '拼车可能减少一次出行的碳足迹。' }
    },
    {
      word: 'structural', ipa: '/ˈstrʌktʃərəl/', meaning: '结构的；与承重结构有关的', pos: 'adj.',
      family: 'structure n./v. 结构／组织 + -al → structural；structurally adv. 在结构上。',
      context: '修饰框架部件，限定生产系统输出的具体范围。',
      collocations: [{ en: 'structural damage', zh: '结构损坏' }, { en: 'structural changes', zh: '结构性变化' }],
      synonyms: 'physical 物理的，范围更广；structural 强调组成、组织方式或建筑承重结构。',
      example: { en: 'Engineers checked the bridge for structural damage.', zh: '工程师检查了桥梁是否存在结构损坏。' }
    },
    {
      word: 'localise', ipa: '/ˈləʊkəlaɪz/', meaning: '使本地化；使集中于某一地区', pos: 'v.',
      family: 'local adj. 当地的 + -ise → localise；localisation n. 本地化。美式常写 localize / localization；英式也接受 -ize 拼法。',
      context: '文章使用美式被动词形 localized 表达把生产布局在当地；本词库统一以英式 localise 收录，保留原文词形。',
      collocations: [{ en: 'localise production', zh: '使生产本地化' }, { en: 'localise a service', zh: '使服务适合当地需要' }],
      synonyms: 'decentralise 分散权力或系统，未必在当地生产；localise 强调落到某个地区或适应本地。',
      example: { en: 'The company plans to localise production near its customers.', zh: '这家公司计划在客户附近实现本地生产。' }
    },
    {
      word: 'accomplish', ipa: '/əˈkʌmplɪʃ/', meaning: '完成；实现', pos: 'v.',
      family: 'accomplishment n. 成就；accomplished adj. 技艺高超的。可与同主题词汇一起巩固。',
      context: '创始人谈到如何实现使命；表达实现路径不等于使命已经完成。',
      collocations: [{ en: 'accomplish a task', zh: '完成任务' }, { en: 'accomplish a goal', zh: '实现目标' }],
      synonyms: 'achieve 常搭配目标、成功或结果；accomplish 强调成功完成一件事或任务。',
      example: { en: 'A clear plan helps students accomplish their goals.', zh: '明确的计划有助于学生实现目标。' }
    }
  ],
  recall: [
    { phase: 'teaching', prompt: '首次或第二次接触：结合中文解释，resilient 更接近“能恢复的”还是“价格低的”？', answer: '能恢复的；其词族名词是 resilience。先理解，无需默写。' },
    { phase: 'teaching', prompt: '首次或第二次接触：把 durable materials 与“耐用材料”配对，再朗读英式发音。', answer: 'durable materials = 耐用材料。注意 durable /ˈdjʊərəbl/。' },
    { phase: 'recall', prompt: '第 3 次接触起：英→中。Explain supply chain in Chinese. 提示：从原材料到交付的联系。', answer: '供应链；连接原材料供应、生产、运输与交付的网络。' },
    { phase: 'recall', prompt: '第 3 次接触起：中→英。写出“组成部件”。提示：c 开头，可数名词。', answer: 'component；复数 components。' },
    { phase: 'output', prompt: '第 4 次接触起：Complete the sentence: Schools need ______ furniture that lasts for years. 提示：耐用的。', answer: 'durable。此句为自编练习，不是文章引句。' },
    { phase: 'output', prompt: '第 4 次接触起：用 sustainable transport 造一句话，表达一个有条件、不过度绝对的观点。', answer: '示例：Sustainable transport can improve urban life if services are affordable. 可持续交通如果价格可负担，就能改善城市生活。答案开放；只据你的实际提交给予反馈，不把示例算作你的得分。' }
  ],
  writing: [
    { en: 'Original practice: Cities could encourage repair and reuse to reduce demand for new resources.', zh: '自编写作表达：城市可以鼓励维修和再利用，以减少对新资源的需求。' },
    { en: 'Original practice: However, environmental claims should be assessed using evidence from the whole life cycle.', zh: '自编写作表达：不过，环境效益的主张应当依据整个生命周期的证据来评估。' },
    { en: 'Original practice: A promising technology still needs suitable safety checks and local support.', zh: '自编口语／写作表达：一项有前景的技术仍需要合适的安全检查与当地支持。' }
  ],
  candidateWords: [
    'resilient', 'durable', 'infrastructure', 'manufacturing', 'conventional',
    'capacity', 'component', 'deploy', 'sustainable', 'degrade', 'supply chain',
    'carbon footprint', 'structural', 'localise', 'accomplish'
  ]
};

window.PLASTIC_LESSON.candidateWords = window.PLASTIC_LESSON.words.map(w => w.word);
window.READING_LESSONS.push(window.PLASTIC_LESSON);
(function () {
  const W = window.READING_WORD;
  const lesson = {
    id: 'environmental-adaptation',
    title: 'What happens when environmental change outpaces life’s ability to adapt?',
    url: 'https://news.mit.edu/2026/when-environmental-change-outpaces-life-ability-to-adapt-0624',
    source: 'MIT News', published: '2026-06-24', verified: '2026-10-14',
    topic: '环境与科学', difficulty: 'IELTS 6.5–7.5', minutes: 10,
    focus: '时间尺度 · 数学模型与观测 · some / most / all',
    questions: [
      { id: 's1', type: 'tfng', prompt: 'The study uses 27 million years as the time span for its 27 episodes.', options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'FALSE', translation: '研究将 2,700 万年作为其 27 次事件的时间跨度。', optionTranslations: ['与原文一致', '与原文矛盾', '原文未提供足够信息'], evidence: '“450 million years”', location: 'Finding a mismatch：介绍 paleontological and geochemical data 的段落。', explanation: '27 是事件数量；时间跨度为过去 4.5 亿年。题干把事件数量移到年份上，构成明确矛盾。', paraphrases: 'episodes → events → 事件；over the last … years → 在过去……年期间。', trap: '一个数字绑定次数，另一个绑定时间，不能看到 27 就跳过单位。' },
      { id: 's2', type: 'tfng', prompt: 'Adaptation rates on geological timescales are difficult to observe directly.', options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'TRUE', translation: '地质时间尺度上的适应速度难以直接观察。', optionTranslations: ['与原文一致', '与原文矛盾', '原文未提供足够信息'], evidence: '“direct observation”', location: 'Finding a mismatch：对比两类所需数据后，Rothman 解释观测困难的段落。', explanation: '原文明确说涉及数千至数百万年的尺度，不适合直接观测。题干说 difficult，保留了困难程度，没有改成“任何适应都绝对无法观察”。', paraphrases: 'does not lend itself to → is not suitable for → 不适合；geological timescales → 地质时间尺度。', trap: '范围限定在特定时间尺度，不可扩大到所有物种、所有适应研究。' },
      { id: 's3', type: 'tfng', prompt: 'The model gives the exact date of the next mass extinction.', options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'NOT GIVEN', translation: '该模型给出了下一次大灭绝的准确日期。', optionTranslations: ['与原文一致', '与原文矛盾', '原文未提供足够信息'], evidence: '文章没有报告下一次大灭绝的准确日期。', location: '核对模型结果及最后讨论现代灭绝风险的段落。', explanation: '文末讨论潜在风险与速率，未给出下一次事件的准确日期，也未直接评价模型能否给出日期。缺失的是具体预测信息，因此是 NOT GIVEN。', paraphrases: 'severity → 严重程度；date → 日期。预测一种变量不等于报告另一种变量。', trap: '关于现代风险的谨慎提示，不能补成确定事件与时间。' },
      { id: 's4', type: 'choice', prompt: 'Why was a mathematical theory used for adaptation rates?', options: ['A. Direct records were impractical', 'B. Geological records were unavailable', 'C. All species adapt equally fast', 'D. It guaranteed future predictions'], answer: 'A', translation: '为什么研究用数学理论描述适应速度？', optionTranslations: ['A. 实际直接记录不切实际', 'B. 地质记录无法取得', 'C. 所有物种适应速度一样快', 'D. 它保证未来预测正确'], evidence: '“In place of actual data”', location: 'Finding a mismatch：比较两类数据后，介绍 general mathematical theory 的段落。', explanation: 'A 对应难以直接记录适应速度。B 混淆数据来源，环境变化记录可以从地质资料推断；C 忽略动物群体速率分布；D 把理论应用与研究结果增强为未来保证。', paraphrases: 'in place of → instead of → 替代；construct a theory → 建立理论。', trap: '分别追踪环境变化数据与适应速度数据，别把其中一类的困难套到另一类。' },
      { id: 's5', type: 'fill', prompt: 'Write ONE WORD from the article. Most animal groups adapt at ______ rates.', answer: 'intermediate', translation: '从原文填一个词：大多数动物群体以中等速率适应。', evidence: '“intermediate”', location: 'Finding a mismatch：解释 bell-shaped curve 的段落。', explanation: '曲线讨论大多数群体的中等速率，最慢与最快处的群体较少。most 不是 all；这是分布模式，不是每个物种都具有同一个数值。', paraphrases: 'intermediate → between the slowest and fastest → 介于最慢与最快之间。', trap: '分布的中心趋势不代表所有个体都相同。' }
    ],
    overview: [{ en: 'Rates matter when environments change.', zh: '文章通过模型探索环境变化速率与生物适应速率的关系。不要把理论、历史数据检验和现代风险讨论混成一种证据。' }],
    structure: [{ en: 'Background → theory → historical test → cautious relevance.', zh: '开头提出议题；回顾假说；Finding a mismatch 建立模型并用历史资料对照；结尾谨慎讨论现代意义。' }],
    sentences: [
      { en: 'If a habitat changes faster than a species can adapt, survival may become harder.', zh: '如果栖息地变化得比一个物种适应得更快，生存可能变得更困难。', parts: ['教学改写，非原文引句。If 引导条件从句；主句是 survival may become harder。', 'faster than 比较变化速度与适应速度；两边都要保留对象。', 'may 是可能，不等于所有个体一定死亡。'], tip: '比较结构写成“对象 A 的速率 > 对象 B 的速率”，不要只抓快慢词。' },
      { en: 'A theory that matches past observations may offer a useful framework, although further testing is needed.', zh: '与过去观测相符的理论可能提供有用的框架，不过仍需要进一步检验。', parts: ['教学改写，非原文引句。that matches past observations 修饰 A theory。', '主句动词是 may offer；主句结论力度受到 may 限制。', 'although 引导让步，提醒读者证据仍有边界。'], tip: 'matched past data ≠ guarantees future outcomes；时态与限定词共同决定结论范围。' }
    ],
    method: { en: 'A model is checked against historical evidence.', zh: '研究用理论描述难以直接记录的适应速率，再与地质及古生物资料比较。数学模型有假设，历史拟合也不自动构成对未来的确定预测。阅读时持续区分“多数”与“全部”、“可能接近”与“已经越过”，以及环境变化指标与灭绝比例。' },
    words: [
      W('adapt', '/əˈdæpt/', '适应；改编', 'v.', 'adaptation n. 适应；adaptable adj. 适应性强的。已有词族巩固。', '物种适应环境变化的速率。', ['adapt to change', '适应变化'], ['adapt a design', '调整设计'], 'adjust 常指较小调整；adapt 常指为了适合新条件而改变。', 'Cities must adapt to a warmer climate.', '城市必须适应更温暖的气候。'),
      W('outpace', '/ˌaʊtˈpeɪs/', '速度超过；比……发展得快', 'v.', 'out- 表“超过” + pace 速度；outpaced 过去式。', '标题中环境变化与适应速度的比较。', ['outpace growth', '超过增长速度'], ['demand outpaces supply', '需求增长快于供应'], 'exceed 强调超过数值或界限；outpace 强调速度或进展。', 'Demand for housing can outpace construction.', '住房需求的增长可能快于建设。'),
      W('extinction', '/ɪkˈstɪŋkʃən/', '灭绝', 'n. 可数／不可数', 'extinct adj. 灭绝的；go extinct 灭绝。', '历史大灭绝与现代风险。', ['mass extinction', '大灭绝'], ['risk of extinction', '灭绝风险'], 'disappearance 可指离开或消失；extinction 指一个物种或群体彻底不再存续。', 'Habitat loss can increase the risk of extinction.', '栖息地丧失可能增加灭绝风险。'),
      W('infer', '/ɪnˈfɜː/', '推断', 'v.', 'inferred / inferring 注意双写 r；inference n. 推断。', '通过地质记录推断环境变化。', ['infer from evidence', '由证据推断'], ['make an inference', '作出推断'], 'deduce 强调逻辑推导；infer 是由线索或证据得出判断，不等于直接观察。', 'We can infer the season from the clothes in the photo.', '我们可以根据照片中的衣服推断季节。'),
      W('theoretical', '/ˌθɪəˈretɪkəl/', '理论的', 'adj.', 'theory n. 理论；theoretically adv. 理论上。', '描述研究建立的模型。', ['a theoretical model', '理论模型'], ['theoretical knowledge', '理论知识'], 'hypothetical 是假设的；theoretical 指依理论解释或推演，未必只是猜想。', 'A theoretical model simplifies a complex system.', '理论模型会简化复杂系统。'),
      W('variation', '/ˌveəriˈeɪʃən/', '变化；差异；变异', 'n. 可数／不可数', 'vary v.；variable adj./n.；varied adj. 多样的。已有词族巩固。', '种群内的差异与适应条件。', ['genetic variation', '遗传变异'], ['variation between groups', '群体之间的差异'], 'change 强调前后变化；variation 也可指同时存在的差异。', 'There is variation in the size of leaves.', '叶子的大小存在差异。'),
      W('heritable', '/ˈherɪtəbl/', '可遗传的', 'adj.', 'heritability n. 遗传度；与 inherit 有意义联系。作为语境词轻量认读。', '进化适应需要的条件。', ['heritable traits', '可遗传的性状'], ['heritable variation', '可遗传的变异'], 'inherited 是已经遗传得到的；heritable 是能够遗传的。', 'Some differences in plant height are heritable.', '植物高度的某些差异是可遗传的。'),
      W('offspring', '/ˈɒfsprɪŋ/', '后代；子女', 'n. 单复数同形', 'one offspring / several offspring；不可机械加 -s。', '更适应的生物留下更多后代。', ['produce offspring', '产生后代'], ['healthy offspring', '健康后代'], 'descendant 常指更后代的后裔；offspring 通常指直接后代或子女。', 'The birds feed their offspring in the nest.', '鸟在巢中喂养后代。'),
      W('intermediate', '/ˌɪntəˈmiːdiət/', '中间的；中等的', 'adj.; n.', '可用 beginner → intermediate → advanced 记忆等级。', '适应速率分布的中间区域。', ['intermediate level', '中级水平'], ['an intermediate stage', '中间阶段'], 'moderate 是适中、不极端；intermediate 强调位于两个阶段或水平之间。', 'This course is suitable for intermediate learners.', '这门课程适合中级学习者。'),
      W('fraction', '/ˈfrækʃən/', '一部分；比例；分数', 'n. 可数', 'fractional adj. 很小部分的／分数的。', '不同速率下能适应或灭绝的群体比例。', ['a fraction of', '……的一部分'], ['a small fraction', '一小部分'], 'proportion 强调占整体的份额；fraction 也有数学分数含义。', 'Only a small fraction of the land is covered by water.', '只有一小部分土地被水覆盖。'),
      W('nonlinear', '/ˌnɒnˈlɪniə/', '非线性的', 'adj.', 'non- 否定 + linear 线性的；也写 non-linear。', '变量关系并非简单直线变化。', ['a nonlinear relationship', '非线性关系'], ['nonlinear change', '非线性变化'], 'uneven 表不均匀；nonlinear 特指关系不呈线性，不能随意互换。', 'The relationship between effort and progress can be nonlinear.', '努力与进步之间的关系可能是非线性的。'),
      W('acidification', '/əˌsɪdɪfɪˈkeɪʃən/', '酸化', 'n. 不可数', 'acid n./adj. 酸／酸性的；acidify v. 使酸化。已有 B 类语境词。', '讨论古海洋环境变化的语境。', ['ocean acidification', '海洋酸化'], ['soil acidification', '土壤酸化'], 'acidic 是状态“酸性的”；acidification 是变得更酸的过程。', 'Ocean acidification can affect marine organisms.', '海洋酸化可能影响海洋生物。'),
      W('persist', '/pəˈsɪst/', '持续存在；坚持', 'v.', 'persistent adj.；persistence n.；与已学 persistent 合并词族。', '物种在环境变化中持续存续。', ['persist over time', '随时间持续存在'], ['persist in doing something', '坚持做某事'], 'remain 强调留下或仍是；persist 强调不易消失或持续坚持。', 'Some problems persist even after a rule changes.', '某些问题在规则改变后仍持续存在。'),
      W('framework', '/ˈfreɪmwɜːk/', '框架；体系', 'n. 可数', 'frame 框架 + work；常指思考或执行的结构。', '模型提供理解风险的框架。', ['a theoretical framework', '理论框架'], ['a policy framework', '政策框架'], 'structure 泛指结构；framework 强调组织理解、规划或实施的基础。', 'The framework helps us compare different policies.', '这个框架帮助我们比较不同政策。'),
      W('severity', '/sɪˈverəti/', '严重程度', 'n. 不可数', 'severe adj. 严重的；severely adv. 严重地。', '灭绝事件的严重程度。', ['the severity of a problem', '问题的严重程度'], ['reduce severity', '降低严重程度'], 'magnitude 指大小或规模；severity 常用于不良事件的严重性。', 'Early action may reduce the severity of damage.', '及早行动可能降低损害的严重程度。')
    ],
    recall: [
      { phase: 'teaching', prompt: '第一、二次接触：看词卡，用“需求增长比供应快”理解 outpace；不要求拼写。', answer: 'Demand outpaces supply. 需求增长快于供应。重点识别比较的两边。' },
      { phase: 'teaching', prompt: '第一、二次接触：把 theoretical 与“理论的”、empirical 与“实证的”对应起来。', answer: 'theoretical = 理论的；empirical = 以观察或数据为依据的。二者可以在同一研究中结合。' },
      { phase: 'recall', prompt: '第三次起，带提示 English → Chinese: infer from evidence.', answer: '根据证据推断。推断不等于已经直接观察到。' },
      { phase: 'recall', prompt: '第三次起，带提示 Chinese → English: 严重程度（s_______）。', answer: 'severity' },
      { phase: 'output', prompt: '第四次起：Complete: Some environmental problems ______ over time. (persist / offspring)', answer: 'persist。该位置需要动词。' },
      { phase: 'output', prompt: '第四次起：用 may 与 adapt to 写一句城市建议，不表达必然结果。', answer: 'Better planning may help cities adapt to climate change. 更好的规划可能帮助城市适应气候变化；合理变体可接受。' }
    ],
    writing: [{ en: 'Environmental policy should consider the speed of change as well as its scale.', zh: '环境政策应同时考虑变化的速度与规模。' }, { en: 'Early action may give ecosystems more time to adapt, although outcomes remain uncertain.', zh: '及早行动可能为生态系统争取更多适应时间，不过结果仍存在不确定性。' }]
  };
  lesson.candidateWords = lesson.words.map(w => w.word);
  window.READING_LESSONS.push(lesson);
})();

delete window.PLASTIC_LESSON;
delete window.READING_WORD;

// Each recall exercise is gated by its own vocabulary, never by an unrelated word.
(function () {
  const targets = {
    'urban-health': [['amenity'], ['correlate'], ['account for'], ['intervention'], ['amenity'], ['correlate']],
    'teacher-communication': [['attendance', 'engagement'], ['harsh'], ['belonging'], ['mutual'], ['contribute to'], ['inclusive', 'engagement']],
    'plastic-materials': [['resilient'], ['durable'], ['supply chain'], ['component'], ['durable'], ['sustainable']],
    'environmental-adaptation': [['outpace'], ['theoretical'], ['infer'], ['severity'], ['persist'], ['adapt']]
  };
  window.READING_LESSONS.forEach(lesson => {
    lesson.recall.forEach((exercise, index) => {
      exercise.targetWords = targets[lesson.id][index];
    });
  });
})();


// Publisher permissions checked on 2026-10-14. Preserve original text and attribution.
(function () {
  const articles = {
  "urban-health": {
    "paragraphs": [
      {
        "id": "urban-p1",
        "text": "A new big-data analysis of the U.S. pinpoints how urban design aids the health of city residents — especially when cities provide walking opportunities, greenery, and mixed-use streets with a blend of commercial and residential activity."
      },
      {
        "id": "urban-p2",
        "text": "The study examines tens of thousands of urban census-bureau tracts in the U.S., seeing how city features correlate with population health measures, while accounting for socioeconomic considerations as well."
      },
      {
        "id": "urban-p3",
        "text": "“We found that on a very large scale, urban planning and design, such as the availability of different amenities and their spatial arrangement, plays a critical role in population health outomes,” says Winston Yap, a visiting scholar at the MIT Senseable City Lab, a postdoc at Cornell University, and co-author of a new paper outlining the study’s findings."
      },
      {
        "id": "urban-p4",
        "text": "While there is not one design template for all locations, short and well-connected blocks with a variety of amenities, as well as the strategic placement of parks, all help well-being — physiologically and psychologically."
      },
      {
        "id": "urban-p5",
        "text": "“We usually think about physical health first, but we also found a high correlation between good design and mental health,” says Fabio Duarte, an MIT researcher and co-author of the paper. “If you are walking more, it is not only a matter of physical fitness, but gives people a chance to avoid isolation, have serendipitous meetings with people, and at least see there are others around.”"
      },
      {
        "id": "urban-p6",
        "text": "The paper, “Urban motifs associated with population health,” appears today in Nature Health."
      },
      {
        "id": "urban-p7",
        "text": "The authors are Yap; Duarte, who is associate director and a principal research scientist at MIT Senseable City Lab; postdocs Yu Zheng, Kee Moon Zhang, and Peng Luo, who is also an incoming assistant professor at the University of Iowa; Paolo Vineis, a professor at Imperial College, London; Carlo Ratti, director of the MIT Senseable City Lab; and Filip Biljecki, an associate professor at the National University of Singapore."
      },
      {
        "id": "urban-p8",
        "text": "Only connect",
        "heading": true
      },
      {
        "id": "urban-p9",
        "text": "The researchers say they conducted the analysis not just due to an interest in cities, but out of recognition that health care systems are often swamped, and preventative health measures are ever-more important."
      },
      {
        "id": "urban-p10",
        "text": "“We wanted to do this study because health care systems around the world are overloaded,” Yap says. “There’s a lot of burden on health care systems, and there is a need not just for treatment but for prevention as well, for obesity, high cholesterol, depression and other mental health issues, and more.”"
      },
      {
        "id": "urban-p11",
        "text": "To conduct the study, the researchers analyzed 28,323 census tracts, using data from the U.S. Census Bureau along with health data from the U.S. Center for Disease Control and Prevention (CDC). They then used geospatial data, including more than 8 million street view images, to see how urban form related to the health status of residents in those areas. The study accounts for socioeconomic factors and other variables in building an assessment of the relationship between design and health."
      },
      {
        "id": "urban-p12",
        "text": "The study confimed that by themselves, socioeconomic factors are associated with urban health disparities; it then examined the relative impact of differences in urban design in those different settings."
      },
      {
        "id": "urban-p13",
        "text": "“By bringing together open demographic, health, and environmental data, the study highlights the importance of open data accessibility for planning healthy cities,” says Ratti."
      },
      {
        "id": "urban-p14",
        "text": "The scholars also applied a graph deep-learning model to the data, an emerging machine-learning technique they used to help understand which key factors in urban design are most connected to health outcomes."
      },
      {
        "id": "urban-p15",
        "text": "The research reveals that in some cases, rectangularity in city blocks, and “building spread,” meaning structures that cover the full size of their lots, can enhance wellness. Examples of this include Manhattan or Boston’s Back Bay neighborhood, where mixed-use buildings on relatively short blocks create many amenities and a variety of walking routes. That said, circular and curving street forms can also work, as long as they feature a lot of interconnectedness as well."
      },
      {
        "id": "urban-p16",
        "text": "Urban greenery is almost always a significant factor in urban wellness, with parks scoring high as a facet of city design that helps resident health. Beyond that, expanding the tree canopy can also help urban health outcomes."
      },
      {
        "id": "urban-p17",
        "text": "The presence of cultural institutions and restaurants are also linked to general health, while access to health care amenities are understandably connected to physical health improvements. In general, access to points of interest, broadly defined, whether cultural or commercial, is a significant factor in abetting better health, in cities across the country."
      },
      {
        "id": "urban-p18",
        "text": "“One of the major contributions of the study is that we look at not only one or two cities, but the entire United States,” Yap says. “In a large-scale study, we were trying to find patterns that were consistent across different urban contexts, as well as populations with different characteristics. Just using this data, we can predict very confidently the population health outcomes for a neighborhood.”"
      },
      {
        "id": "urban-p19",
        "text": "Knowing where to intervene",
        "heading": true
      },
      {
        "id": "urban-p20",
        "text": "The research also provides a kind of road map for urban planners and city officials when it comes to policy decisions and local improvements. Among other things, the study suggests where cities might see the greatest return on investment in urban improvements, in health terms. Improvements in lower-income neighborhoods, on aggregate, may generate about four times the added health benefits than the same level of investment in better-off areas that already realize the benefits of good urban amenities."
      },
      {
        "id": "urban-p21",
        "text": "“It’s important to know where to intervene,” Yap says."
      },
      {
        "id": "urban-p22",
        "text": "“I think for me it shows how intertwined different policies are,” Duarte adds. “Some funding for urban development could have a direct influence on health, and could be more inexpensive than [direct spending on health].”"
      },
      {
        "id": "urban-p23",
        "text": "The researchers regard the study as just one empirical step in this domain. As they note, additional studies could observe changes over time, to further enhance our picture of the connection between urban design and health. Still, as the authors write in the paper, “we believe that our broad picture provides an overarching scaffolding for the understanding of the social and material determinants of health and can guide [further] analytical studies.”"
      },
      {
        "id": "urban-p24",
        "text": "The research received support from the Campus for Research Excellence and Technological Enterprise (CREATE) program of the National Research Foundation Singapore; the Singapore-MIT Alliance for Research and Technology (SMART); and the MIT Senseable City Lab consortium. It is part of the Largescale 3D Geospatial Data for Urban Analytics project, supported by the National University of Singapore."
      }
    ],
    "subtitle": "An extensive study of U.S. cities identifies walkable neighborhoods, urban greenery, and access to amenities as key contributors to residents’ health.",
    "author": "Peter Dizikes | MIT News",
    "titleZh": "城市设计如何改善身心健康",
    "license": {
      "name": "MIT News republication policy",
      "url": "https://news.mit.edu/terms-of-use",
      "permission": "licensed"
    },
    "footer": "Reprinted with permission of MIT News",
    "footerUrl": "https://news.mit.edu/"
  },
  "plastic-materials": {
    "paragraphs": [
      {
        "id": "plastic-p1",
        "text": "The world needs more homes. The world also has too much plastic. Perhaps the only thing those two problems have in common is that they’re hard to solve."
      },
      {
        "id": "plastic-p2",
        "text": "Atlas Building Composites, a spinout of MIT, is on a mission to address both problems with a single solution. The company has developed an AI-powered robotic manufacturing platform capable of turning single-use plastics into durable building materials."
      },
      {
        "id": "plastic-p3",
        "text": "The company emerged from MIT HAUS, a research effort in the MIT Department of Mechanical Engineering that’s short for “Home Architecture for Universal Sustainability.” Atlas uses waterless plastic recycling and large-scale composite additive manufacturing technology to make parts like home foundations, decks, and trusses for walls, floors, and roofs."
      },
      {
        "id": "plastic-p4",
        "text": "“Our mission is to convert waste plastic pollution into durable composites to build 1 billion homes,” says Atlas chair and co-founder A.J. Perez ’13, MNG ’14, PhD ’23, who is also an MIT research scientist. “You can’t divorce these things from each other. We’re not here just to build homes, and we’re not here just to recycle plastic. The conventional way of building homes involves cutting down trees, mining, refining, and a bunch of other dirty activities."
      },
      {
        "id": "plastic-p5",
        "text": "We want to avoid all that and address all the plastic bound for our oceans and landfills. We’re turning bottles into buildings.”"
      },
      {
        "id": "plastic-p6",
        "text": "Atlas’ parts are already being used to support barns, sheds, decks, and docks. Most recently, the company supplied the U.S. Army Corps of Engineers with American-made recycled composite trusses to construct a 40-foot bridge in a Massachusetts wetland."
      },
      {
        "id": "plastic-p7",
        "text": "Perez and Atlas co-founder Matt Pouliot envision deploying thousands of their AI robotic production systems around the world. A key enabler for that scale is the company’s ability to recycle low-grade plastic into building components without water."
      },
      {
        "id": "plastic-p8",
        "text": "“This is key to democratizing recycling,” Perez says. “Now, every country around the world, regardless of their water access, will be able to do something about their plastic. We strive to study these issues in the real world, not just a lab. When you talk to government officials about creating a new recycling facility, they have to get the local water agency involved, there’s permitting, etc. A lot of that work disappears with the waterless recycling process.”"
      },
      {
        "id": "plastic-p9",
        "text": "Research for impact",
        "heading": true
      },
      {
        "id": "plastic-p10",
        "text": "Since earning his PhD at MIT, Perez has been developing advanced fabrication techniques for homes and new techniques for plastic recycling. In 2019, he started MIT HAUS with David Hardt, MIT’s Ralph E. and Eloise F. Cross Professor in Manufacturing."
      },
      {
        "id": "plastic-p11",
        "text": "“It started with the simple mission of enabling the production of 1 billion homes over a 30-year period,” Perez says. “Then we realized how much the materials needed for those homes would strain global supply chains.”"
      },
      {
        "id": "plastic-p12",
        "text": "Perez says building those homes using conventional methods would require a doubling of global production capacity for materials like concrete, not to mention a dramatic acceleration of global deforestation."
      },
      {
        "id": "plastic-p13",
        "text": "“That’s where the light bulb went off,” Perez says. “There’s this other problem humanity has, which is 8 gigatons of plastic that have been produced and are polluting our oceans, rivers, and cities. We decided to plug two really big, hairy problems together.”"
      },
      {
        "id": "plastic-p14",
        "text": "Perez met Pouliot, a former Maine senator, and the pair started Atlas to commercialize the technology Perez had been developing at MIT. The founders worked with MIT’s Technology Licensing Office and have since worked with researchers at other universities to independently develop technology for the company’s robotic manufacturing platform, which the founders call the Atlas Factory Stack."
      },
      {
        "id": "plastic-p15",
        "text": "First, single-use plastic from water bottles and other objects is shredded and fed into the Atlas system, where it is melted and fused with American-made fiberglass to make it stronger than wood. From there, a large-scale 3D printer creates the parts, including trusses for floors, walls, roofs, and bridges."
      },
      {
        "id": "plastic-p16",
        "text": "Through research at MIT, Perez has shown large composite trusses can be printed in under 13 minutes and support over 4,000 pounds, exceeding key building standards."
      },
      {
        "id": "plastic-p17",
        "text": "“At MIT, we’ve demonstrated we can produce 60 to 80 pounds of parts per hour, and the systems we’re specifying in Atlas factories operate in the 150 to 200 pound per hour range,” Perez says. “There’s the potential for our robotic manufacturing platform to produce each part at a lower cost than injection molding, and it’s far more flexible and convenient. For example,  we can manufacture the parts in the reverse order so that they’ll be placed on the finished goods pallet next to the machine.”"
      },
      {
        "id": "plastic-p18",
        "text": "The founders envision Atlas as a technology provider enabling the creation of home factories close to wherever homes need to be built. Today, each Atlas factory cell is capable of producing the structural framing components for about one small home per day."
      },
      {
        "id": "plastic-p19",
        "text": "“The old way of doing things would be some huge factory in China would mass produce one type of part and ship it far away,” Perez says. “I don’t think that’s good for the planet. Another reason we don’t use injection molding is economic: Mega factories don’t produce as many jobs and have a much higher carbon footprint. We want this to be localized to benefit local communities. The plastic is already everywhere. The more local Atlas is, the lower the cost and footprint.”"
      },
      {
        "id": "plastic-p20",
        "text": "Going global",
        "heading": true
      },
      {
        "id": "plastic-p21",
        "text": "Plastics last far longer than wood, especially for applications where they’re in contact with the ground or water. That adds to the company’s environmental benefits."
      },
      {
        "id": "plastic-p22",
        "text": "“If you get a material into the building world and it does its job, it’s going to be used for a very long time and not need to be recycled again for a very long time,” Pouliot says. “That’s important because when you recycle something over and over again, it degrades. This is one of the most sustainable use cases for recycled petrochemical products.”"
      },
      {
        "id": "plastic-p23",
        "text": "Atlas’ bridge with the Army Corps of Engineers was installed in less than a day. The founders are also in talks with international franchise partners to deploy the Atlas Factory Stack across the globe."
      },
      {
        "id": "plastic-p24",
        "text": "“To accomplish our mission, I fundamentally believe it’s not going to be one far-away company dominating the industry,” Perez says. “It’s going to be every country leveraging Atlas Factory Stacks to create local recycling jobs, local factory jobs, local construction jobs, and to stimulate their economies with local materials.”"
      }
    ],
    "subtitle": "Atlas Building Composites is commercializing MIT research to turn plastic waste into parts for buildings and other infrastructure.",
    "author": "Zach Winn | MIT News",
    "titleZh": "MIT 创业公司把塑料垃圾变成耐用建筑材料",
    "license": {
      "name": "MIT News republication policy",
      "url": "https://news.mit.edu/terms-of-use",
      "permission": "licensed"
    },
    "footer": "Reprinted with permission of MIT News",
    "footerUrl": "https://news.mit.edu/"
  },
  "environmental-adaptation": {
    "paragraphs": [
      {
        "id": "adaptation-p1",
        "text": "When an animal’s environment changes faster than the animal can adapt, its chances of survival can flat-line. The same is true for populations, and even entire species."
      },
      {
        "id": "adaptation-p2",
        "text": "Now, scientists at MIT and the University of Leicester have found that this connection between evolutionary adaptation and the pace of environmental change holds up at the global scale as well — and can determine life’s susceptibility to mass extinction. The researchers developed a theoretical model of this phenomenon, which they present in a paper appearing today in Physical Review Letters."
      },
      {
        "id": "adaptation-p3",
        "text": "The team compared the model with available data from past major mass extinctions, including how fast the global environment changed at the time of each event. The model successfully predicted the severity of most mass extinctions in Earth’s history, or the fraction of life that was unable to adapt, and therefore went extinct."
      },
      {
        "id": "adaptation-p4",
        "text": "Interestingly, the researchers found that the range of adaptation rates across animal groups is broadly similar to the range of rates at which the environment can change."
      },
      {
        "id": "adaptation-p5",
        "text": "“What we’re beginning to see is a certain level of organization, and ways in which life behaves that are consistent with the ways in which the environment behaves,” says study author Daniel Rothman, professor of geophysics and co-director of the Lorenz Center at MIT. “It may be that life has evolved so that its range of adaptabilities matches the range of stresses that it meets.”"
      },
      {
        "id": "adaptation-p6",
        "text": "Rothman’s study co-author is Sergei Petrovskii, professor of applied mathematics at the University of Leicester in England."
      },
      {
        "id": "adaptation-p7",
        "text": "A catastrophizing connection",
        "heading": true
      },
      {
        "id": "adaptation-p8",
        "text": "The connection between extinction and environmental change is not new. In the late 18th century, the French naturalist Georges Cuvier, who is often referred to as the founding father of paleontology, was the first to propose the concept of “catastrophism.” He had discovered fossil bones near Paris that didn’t match any animal known to exist at the time. Cuvier concluded that the bones were from a group of giant mammals that existed at one time but was no longer around."
      },
      {
        "id": "adaptation-p9",
        "text": "He proposed, then, that an entire species could disappear, or go extinct, likely due to a widespread catastrophe."
      },
      {
        "id": "adaptation-p10",
        "text": "“That itself was a major idea, that a species could go extinct,” Rothman says. “And he had suggested it was an environmental catastrophe that had caused it.”"
      },
      {
        "id": "adaptation-p11",
        "text": "The concept of catastrophism later gave way to the view that Earth’s history was shaped mainly by slow, gradual processes. But in the mid-20th century the American geologist Norman Newell revisited the problem. In seeking the cause of extinctions, he proposed what Rothman and Petrovskii call the “rate-mismatch” hypothesis, the notion that extinction occurs when the rate of environmental change is higher than the rate at which a species can evolve to adapt."
      },
      {
        "id": "adaptation-p12",
        "text": "Biologists have since observed Newell’s hypothesis play out in many cases where changes in the environment have driven the extinction of individual species. Rothman and Petrovskii wondered: Could the hypothesis also apply at the global scale?"
      },
      {
        "id": "adaptation-p13",
        "text": "“We know that individual species go extinct when environmental change outpaces their ability to adapt,” Rothman notes. “But it hasn’t been clear whether this same idea applies at the scale of global extinction events.”"
      },
      {
        "id": "adaptation-p14",
        "text": "Finding a mismatch",
        "heading": true
      },
      {
        "id": "adaptation-p15",
        "text": "For their new study, the researchers looked to test the rate mismatch hypothesis at the global scale. They wanted to see whether mass extinction events in history can be explained by a mismatch between the rate of global environmental change and the rate at which life around the world can adapt."
      },
      {
        "id": "adaptation-p16",
        "text": "To do so, at least in theory, they would have to compare two sources of data: the rates at which the global environment has changed over time and the rates at which different groups of organisms adapt to environmental change. The first can be found in geological records, which scientists have used extensively to infer how the Earth’s climate changed through history. The second, however, is almost impossible to record."
      },
      {
        "id": "adaptation-p17",
        "text": "“We’re talking about the rates at which organisms adapt to major environmental change at effectively geologic timescales, from thousands to millions of years,” Rothman says. “And that doesn’t lend itself to direct observation.”"
      },
      {
        "id": "adaptation-p18",
        "text": "In place of actual data, the researchers aimed to construct a general mathematical theory to describe the range of adaptation rates across animal groups around the world. In this context, “adaptation” refers to any change within a species, over time periods that are much longer than a generation, that enable the species to persist as its environment changes."
      },
      {
        "id": "adaptation-p19",
        "text": "It is generally understood in evolutionary theory that a species can successfully adapt only when multiple conditions are met. For instance, there needs to be variation in the population, these variations must be heritable, some variations enable an organism to adapt better than others, and the organisms that adapt better should leave more offspring. If all these conditions are met, the entire species should be able to adapt to a given environmental change."
      },
      {
        "id": "adaptation-p20",
        "text": "However, if any one condition fails, the population will go extinct."
      },
      {
        "id": "adaptation-p21",
        "text": "Rothman and Petrovskii recognized that in this case, a species’ probability of successfully adapting multiplies with every condition that it meets. And it turns out that this pattern can be described mathematically as a very simple, bell-shaped curve. Such a curve essentially describes what fraction of the world’s animals can adapt at given rates, from the slowest to the fastest adapters, and how this fraction changes nonlinearly with the rate of adaptation."
      },
      {
        "id": "adaptation-p22",
        "text": "This curve generally shows that most animal groups can adapt at intermediate rates, while fewer animal groups adapt at the slowest and fastest rates."
      },
      {
        "id": "adaptation-p23",
        "text": "After they established this general pattern of adaptation rates, the researchers looked to see how this pattern compares to recorded rates of environmental change, and how these two rates match, or don’t match, at times of mass extinction."
      },
      {
        "id": "adaptation-p24",
        "text": "To do so, they considered paleontological and geochemical data from 27 episodes over the last 450 million years where the carbon cycle experienced significant change — a measure that is generally understood to reflect global environmental change. They then compared rates of environmental change with the fraction of animal groups that went extinct during each episode — numbers that were established previously in a well-regarded study by paleobiologist John Alroy."
      },
      {
        "id": "adaptation-p25",
        "text": "In the end, Rothman and Petrovskii observed that indeed, for almost every mass extinction event in the last 450 million years, there was a mismatch in the rates at which the environment changed and at which animals could adapt; mass extinctions occurred when a significant fraction of animals could not adapt fast enough to match the changing environment. Their results confirm that the rate mismatch hypothesis applies at the global scale."
      },
      {
        "id": "adaptation-p26",
        "text": "What’s more, this mismatch in rates could predict the severity of extinction events, or the fraction of animal life that went extinct given the rate at which the environment changed."
      },
      {
        "id": "adaptation-p27",
        "text": "In the case of the end-Permian extinction, it’s likely that the rapid acidification of the ocean outpaced organisms’ ability to evolve adequate protections, leading to the extinction of over 80 percent of the world’s marine species."
      },
      {
        "id": "adaptation-p28",
        "text": "The team’s work focuses on applying the new model to past extinction events. But the work could also provide a framework for understanding modern extinction risk."
      },
      {
        "id": "adaptation-p29",
        "text": "“Carbon dioxide levels in the ocean are increasing today at a rate which, when appropriately re-scaled, is similar to rates of carbon-cycle change that are just lower than those associated with major extinction events in the past,” Rothman says. “It suggests that modern environmental change may be approaching rates beyond which adaptation becomes increasingly difficult.”"
      },
      {
        "id": "adaptation-p30",
        "text": "This research is supported, in part, by Schmidt Sciences, LLC; the MIT Climate Grand Challenges; the U.S. National Science Foundation; the European Space Agency; and the London Mathematical Society."
      }
    ],
    "subtitle": "A new model links Earth’s mass extinctions to mismatches between rates of environmental change and biological adaptation.",
    "author": "Jennifer Chu | MIT News",
    "titleZh": "当环境变化快过生命的适应能力",
    "license": {
      "name": "MIT News republication policy",
      "url": "https://news.mit.edu/terms-of-use",
      "permission": "licensed"
    },
    "footer": "Reprinted with permission of MIT News",
    "footerUrl": "https://news.mit.edu/"
  },
  "heat-dome-2026": {
    "paragraphs": [
      {
        "id": "heat-p1",
        "text": "While the calendar indicated that astronomical summer was winding down, a swath of the south-central United States was sweltering under a heat dome in mid-September 2026."
      },
      {
        "id": "heat-p2",
        "text": "This map shows air temperatures in the contiguous U.S. on September 15, 2026, at 4 p.m. Central Time (21:00 Universal Time), modeled at 2 meters (6.5 feet) above the ground. It was produced by combining satellite observations with temperatures predicted by a version of the GEOS (Goddard Earth Observing System) model, which uses mathematical equations to represent physical processes in the atmosphere."
      },
      {
        "id": "heat-p3",
        "text": "The darkest reds indicate areas where temperatures approached or exceeded 40 degrees Celsius (104 degrees Fahrenheit)."
      },
      {
        "id": "heat-p4",
        "text": "More than 41 million people in the U.S.—about 12 percent of the population—were under a National Weather Service extreme heat advisory, extreme heat watch, or extreme heat warning on September 15. The high temperatures spanned large portions of several states, such as Texas, Oklahoma, Arkansas, Missouri, and Tennessee."
      },
      {
        "id": "heat-p5",
        "text": "Meteorologists warned that high humidity, limited cloud cover, and light winds could make temperatures feel higher than thermometer readings and increase the risk of heat-related illnesses."
      },
      {
        "id": "heat-p6",
        "text": "Several locations set new daily high temperature records on September 15. These included Dallas, Texas, at 101ºF (38ºC), Memphis, Tennessee, at 99ºF (37ºC), and Nashville, Tennessee, at 100ºF (38ºC). The cities were all at least 12ºF warmer than normal that day, with Nashville breaking its daily-high record from 1927. The day before, Nashville also set a record-high minimum temperature of 75ºF (24ºC)."
      },
      {
        "id": "heat-p7",
        "text": "A weather phenomenon meteorologists call a heat dome was responsible for driving temperatures up across the region. A heat dome develops when an area of high pressure in the upper atmosphere pushes hot air toward the surface and traps it there. Heat domes put the brakes on convection and suppress clouds and precipitation. This allows sunlight to reach Earth’s surface relatively unhindered and further elevate air temperatures."
      },
      {
        "id": "heat-p8",
        "text": "The stretch of unseasonable temperatures follows the warmest June through August in the contiguous United States in a 132-year record, according to NOAA. The three-month period in 2026 was 0.4ºF warmer than the previous records, set in 1936 and 2021."
      }
    ],
    "subtitle": "Temperature records toppled across the central and southern U.S. as the autumnal equinox approached.",
    "author": "Lindsey Doermann | NASA Earth Observatory",
    "titleZh": "夏末的热穹顶",
    "license": {
      "name": "NASA educational media use / public domain",
      "url": "https://www.nasa.gov/nasa-brand-center/images-and-media/",
      "permission": "public-domain"
    },
    "footer": "Original text: NASA Earth Observatory. Learning material: 循词 IELTS.",
    "footerUrl": "https://science.nasa.gov/earth/earth-observatory/summer-goes-out-with-a-heat-dome/"
  }
};
  const locators = {
  "urban-health": {
    "u1": [
      {
        "paragraphId": "urban-p11",
        "quote": "28,323 census tracts"
      },
      {
        "paragraphId": "urban-p11",
        "quote": "more than 8 million street view images"
      }
    ],
    "u2": [
      {
        "paragraphId": "urban-p11",
        "quote": "accounts for socioeconomic factors"
      }
    ],
    "u3": [],
    "u4": [
      {
        "paragraphId": "urban-p15",
        "quote": "circular and curving street forms can also work"
      },
      {
        "paragraphId": "urban-p15",
        "quote": "as long as they feature a lot of interconnectedness"
      }
    ],
    "u5": [
      {
        "paragraphId": "urban-p20",
        "quote": "about four times the added health benefits"
      }
    ]
  },
  "plastic-materials": {
    "plastic-q1": [
      {
        "paragraphId": "plastic-p16",
        "quote": "support over 4,000 pounds"
      }
    ],
    "plastic-q2": [
      {
        "paragraphId": "plastic-p18",
        "quote": "structural framing components for about one small home per day"
      }
    ],
    "plastic-q3": [],
    "plastic-q4": [
      {
        "paragraphId": "plastic-p1",
        "quote": "The world needs more homes. The world also has too much plastic."
      }
    ],
    "plastic-q5": [
      {
        "paragraphId": "plastic-p15",
        "quote": "melted and fused with American-made fiberglass"
      }
    ]
  },
  "environmental-adaptation": {
    "s1": [
      {
        "paragraphId": "adaptation-p24",
        "quote": "27 episodes over the last 450 million years"
      }
    ],
    "s2": [
      {
        "paragraphId": "adaptation-p17",
        "quote": "from thousands to millions of years"
      },
      {
        "paragraphId": "adaptation-p17",
        "quote": "doesn’t lend itself to direct observation"
      }
    ],
    "s3": [],
    "s4": [
      {
        "paragraphId": "adaptation-p16",
        "quote": "The second, however, is almost impossible to record."
      },
      {
        "paragraphId": "adaptation-p18",
        "quote": "In place of actual data"
      }
    ],
    "s5": [
      {
        "paragraphId": "adaptation-p22",
        "quote": "most animal groups can adapt at intermediate rates"
      }
    ]
  }
};
  window.READING_LESSONS.forEach(lesson => {
    if (articles[lesson.id]) {
      lesson.article = articles[lesson.id];
      lesson.titleZh = articles[lesson.id].titleZh;
      lesson.questions.forEach(question => {
        question.locator = locators[lesson.id][question.id] || [];
        question.evidenceParagraphIds = [...new Set(question.locator.map(item => item.paragraphId))];
      });
    }
    if (lesson.id === 'teacher-communication') {
      lesson.titleZh = '教师的积极沟通如何影响出勤、学习和动力';
      lesson.sourceRights = { permission: 'link-only', url: 'https://www.ucl.ac.uk/legal-services/disclaimer' };
    }
  });
  window.READING_ARTICLE_ADDITIONS = articles;
})();


(function () {
  const W = (word, ipa, meaning, pos, family, context, c1, c2, synonyms, en, zh) => ({ word, ipa, meaning, pos, family, context, collocations: [{ en: c1[0], zh: c1[1] }, { en: c2[0], zh: c2[1] }], synonyms, example: { en, zh } });
  const lesson = {
    id: 'heat-dome-2026',
    title: 'Summer Goes Out With a Heat Dome',
    titleZh: '夏末的热穹顶',
    url: 'https://science.nasa.gov/earth/earth-observatory/summer-goes-out-with-a-heat-dome/',
    source: 'NASA Earth Observatory',
    published: '2026-09-17', verified: '2026-10-14', learningDate: '2026-10-14',
    topic: '环境与极端天气', difficulty: 'IELTS 6.0–7.0', minutes: 6,
    focus: 'FALSE / NOT GIVEN · 数字与测量对象 · 时间与并列范围',
    article: window.READING_ARTICLE_ADDITIONS['heat-dome-2026'],
    questions: [
      {
        id: 'heat-q1', type: 'tfng',
        prompt: 'The map presents temperatures measured directly on the ground surface at 4 p.m. Central Time.',
        options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'FALSE',
        translation: '地图显示中央时区下午 4 点在地表直接测得的温度。',
        optionTranslations: ['原文支持该说法', '原文与该说法相矛盾', '原文信息不足以判断'],
        evidence: '原文说明气温是距地面 2 米处的模型结果，融合卫星观测与模型预测。',
        location: '原文第 2 段：地图时间、高度与制作方法。',
        locator: [{ paragraphId: 'heat-p2', quote: 'modeled at 2 meters (6.5 feet) above the ground' }, { paragraphId: 'heat-p2', quote: 'combining satellite observations with temperatures predicted' }],
        evidenceParagraphIds: ['heat-p2'],
        explanation: '4 p.m. 与原文相符，但题干其余两处限定不符：对象是距地面 2 米的空气温度，并非地表温度；数据是模型融合的结果，并非全部直接测量。只要命题的一部分与明确信息矛盾，整题为 FALSE。',
        paraphrases: 'modeled → estimated using a model；above the ground → 距地面一定高度；ground surface → 地表。三者不能省略或替换。',
        trap: '先核对“变量—高度—方法—时刻”，同一时间不能抵消测量对象与方法的错误。'
      },
      {
        id: 'heat-q2', type: 'tfng',
        prompt: 'On September 15, more than 41 million people were covered by at least one of the three listed categories of extreme heat notice.',
        options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'TRUE',
        translation: '9 月 15 日，超过 4,100 万人处于列出的三类极端高温通知中的至少一类覆盖范围内。',
        optionTranslations: ['原文支持该说法', '原文与该说法相矛盾', '原文信息不足以判断'],
        evidence: '第 4 段把超过 4,100 万人与 advisory、watch 或 warning 的覆盖范围绑定。',
        location: '原文第 4 段：人口数字与气象通知类别。',
        locator: [{ paragraphId: 'heat-p4', quote: 'More than 41 million people' }, { paragraphId: 'heat-p4', quote: 'extreme heat advisory, extreme heat watch, or extreme heat warning' }],
        evidenceParagraphIds: ['heat-p4'],
        explanation: '原文的 or 列出三类可能的通知，题干 at least one 保留了这个并列范围。它没有要求每个人同时收到三种通知，也没有把 4,100 万误作患病人数。',
        paraphrases: 'were under an advisory, watch, or warning → were covered by at least one notice category；more than → over。',
        trap: '并列项共享 people 这个对象；or 不能读成 and，覆盖人口也不等于实际伤病人数。'
      },
      {
        id: 'heat-q3', type: 'tfng',
        prompt: 'The article gives the number of people admitted to hospital because of the heat on September 15.',
        options: ['TRUE', 'FALSE', 'NOT GIVEN'], answer: 'NOT GIVEN',
        translation: '文章给出了 9 月 15 日因高温住院的人数。',
        optionTranslations: ['原文支持该说法', '原文与该说法相矛盾', '原文信息不足以判断'],
        evidence: '全文没有报告住院人数。',
        location: '对照原文第 4–5 段的人口覆盖与健康风险说明，并核对全文。',
        locator: [], evidenceParagraphIds: [],
        explanation: '文章给出气象通知覆盖人数，并提示高温相关疾病的风险，却没有报告实际住院人数。不能把风险警告当作已经发生的病例，也不能由未报数字推出无人住院。',
        paraphrases: 'increase the risk of illness → 增加患病风险；be admitted to hospital → 已经住院。可能性与实际结果是不同信息。',
        trap: 'FALSE 需要相反信息；这里既未给住院人数，也未说没有人住院，因此是 NOT GIVEN。'
      },
      {
        id: 'heat-q4', type: 'choice',
        prompt: 'According to the article, how does a heat dome help raise air temperatures?',
        options: ['A. It traps hot air and reduces cloud formation.', 'B. It increases cloud cover and blocks sunlight.', 'C. It draws cool air towards the ground.', 'D. It creates stronger winds that remove hot air.'],
        answer: 'A',
        translation: '文章认为热穹顶如何促使气温升高？',
        optionTranslations: ['A. 它困住热空气并减少云的形成。', 'B. 它增加云量并阻挡阳光。', 'C. 它把冷空气引向地面。', 'D. 它形成更强的风并带走热空气。'],
        evidence: '第 7 段先说明热空气被困住，再说明云与降水受到抑制。',
        location: '原文第 7 段：热穹顶的物理过程。',
        locator: [{ paragraphId: 'heat-p7', quote: 'pushes hot air toward the surface and traps it there' }, { paragraphId: 'heat-p7', quote: 'suppress clouds and precipitation' }],
        evidenceParagraphIds: ['heat-p7'],
        explanation: 'A 概括了两条原文信息。B 把云量变化方向反过来；C 把 hot air 换成 cool air；D 的更强风与移走热空气没有依据，而且与困住热空气的机制相反。',
        paraphrases: 'traps it → holds hot air in place；suppress clouds → reduce cloud formation；elevate → raise。',
        trap: '沿着动作方向读因果链：热空气被困 → 云与降水受抑 → 阳光较少受阻 → 气温继续上升。'
      },
      {
        id: 'heat-q5', type: 'fill',
        prompt: 'Write ONE WORD from the article. Heat domes suppress clouds and ______.',
        answer: 'precipitation',
        translation: '从原文填入一个词：热穹顶抑制云和______。',
        evidence: '第 7 段中 suppress 后的两个并列宾语。',
        location: '原文第 7 段：suppress 后面的并列结构。',
        locator: [{ paragraphId: 'heat-p7', quote: 'suppress clouds and precipitation' }],
        evidenceParagraphIds: ['heat-p7'],
        explanation: 'precipitation 是原文原词，指降水，符合 ONE WORD。sunlight 在下一句中充当主语，不是 suppress 的第二个宾语；不能用同主题但不同语法位置的词填空。',
        paraphrases: 'precipitation → rain, snow and other water falling from the atmosphere；句中用统称“降水”。',
        trap: '确认词性与并列关系：clouds and precipitation 两个名词都作 suppress 的宾语。'
      }
    ],
    overview: [
      { en: 'The article describes a late-summer heat event and explains the weather pattern behind it.', zh: '文章描述一次夏末高温事件，并解释背后的天气模式。数字分别对应地图、气象通知覆盖人口、城市纪录与三个月平均情况。' },
      { en: 'A temperature model, a health warning and a recorded maximum answer different questions.', zh: '气温模型、健康风险警告和实测最高气温回答的是不同问题。精读时不要把三者当成同一种证据。' }
    ],
    structure: [
      { en: 'Event → map and exposure → local records → physical mechanism → historical context.', zh: '首段交代事件；第 2–5 段说明地图、覆盖人口与健康风险；第 6 段列城市纪录；第 7 段解释机制；第 8 段提供较长时间尺度的背景。' },
      { en: 'The final comparison concerns June through August, not one September day.', zh: '末段比较的是六月至八月的三个月时段，不能套用到九月某一天。' }
    ],
    sentences: [
      {
        en: 'It was produced by combining satellite observations with temperatures predicted by a version of the GEOS (Goddard Earth Observing System) model, which uses mathematical equations to represent physical processes in the atmosphere.',
        zh: '这幅地图由卫星观测与某一版本 GEOS（戈达德地球观测系统）模型所预测的温度结合而成；该模型用数学方程表示大气中的物理过程。',
        original: true,
        parts: ['主干：It was produced，It 指前文的 map，采用被动语态。', 'by combining A with B 是制作方法：A = satellite observations；B = temperatures predicted by a version of the GEOS model。', 'predicted 是过去分词，修饰 temperatures；which uses … 修饰 model，不修饰 observations 或 temperatures。'],
        tip: '并列变量先拆成 A 与 B，再给后置修饰语画范围：模型预测修饰温度，数学方程描述的是模型方法。'
      },
      {
        en: 'The cities were all at least 12ºF warmer than normal that day, with Nashville breaking its daily-high record from 1927.',
        zh: '这些城市当天都比正常温度至少高 12 华氏度，其中纳什维尔打破了始于 1927 年的单日最高温纪录。',
        original: true,
        parts: ['主干：The cities were all … warmer；all 的范围是前句列出的 Dallas、Memphis、Nashville。', 'at least 12ºF 是相对正常温度的差值下限，不是当天最高温只有 12ºF，也不是 12ºC。', 'with Nashville breaking … 是补充结构；打破 1927 年纪录只明确属于 Nashville，不能把这一纪录年份分配给三座城市。'],
        tip: 'all 只统摄主句的共同升温幅度；with 结构单独指定城市与纪录。'
      },
      {
        en: 'The three-month period in 2026 was 0.4ºF warmer than the previous records, set in 1936 and 2021.',
        zh: '2026 年的这三个月比此前在 1936 年和 2021 年创下的纪录高 0.4 华氏度。',
        original: true,
        parts: ['The three-month period 回指前句 June through August，不是九月连续三天。', '0.4ºF 是温差，不是绝对温度；than 比较今年三个月与此前纪录。', 'set in 1936 and 2021 是过去分词短语，修饰 previous records，而非 2026 年。'],
        tip: '每个数字都绑定“时段—变量—单位—比较对象”，温度和温差也要区分。'
      }
    ],
    method: {
      en: 'The map combines observations and a physical model; risk notices do not measure hospital admissions.',
      zh: '地图融合卫星观测与 GEOS 物理模型，呈现特定时刻、距地面 2 米的空气温度。通知覆盖人数来自气象告警，不等于受伤或住院人数。城市单日纪录与六月至八月纪录属于不同时间尺度。正文对风险用 could，对部分地区用 some，均应保留。文章解释天气机制，但没有随机对照试验，也没有估计个人患病概率。'
    },
    words: [
      W('record-breaking', '/ˈrekɔːdˌbreɪkɪŋ/', '破纪录的', 'adj.', 'record n. 纪录；break a record 打破纪录。', '部分地区的异常高温创下纪录。', ['record-breaking temperatures', '破纪录的气温'], ['record-breaking rainfall', '破纪录的降雨量'], 'unprecedented = 前所未有的；record-breaking 需要明确的纪录比较，不等于任何异常。', 'The city experienced record-breaking temperatures in July.', '这座城市七月经历了破纪录的高温。'),
      W('observation', '/ˌɒbzəˈveɪʃən/', '观测；观察；观察结果', 'n. 可数／不可数', 'observe v. 观察；observer n. 观察者；observational adj. 观察性的。', '卫星观测是地图的一个数据来源。', ['satellite observations', '卫星观测'], ['direct observation', '直接观测'], 'measurement 强调测量数值；observation 可含数值与其他观察信息。', 'The model was checked against direct observations.', '研究者用直接观测检验了模型。'),
      W('predict', '/prɪˈdɪkt/', '预测；预判', 'v.', 'prediction n. 预测；predictable adj. 可预测的；predicted 过去分词。', '模型预测的温度与卫星观测结合。', ['predict an outcome', '预测结果'], ['predict future demand', '预测未来需求'], 'forecast 常用于天气或趋势；predict 范围更广。预测不等于已经观测到事实。', 'The model predicts how air temperature may change.', '该模型预测空气温度可能如何变化。'),
      W('represent', '/ˌreprɪˈzent/', '表示；代表；描绘', 'v.', 'representation n. 表示／代表；representative adj. 有代表性的。', '数学方程表示大气中的物理过程。', ['represent a process', '表示一个过程'], ['represent a proportion', '代表一个比例'], 'describe 用语言描述；represent 可用符号、模型或图形表达。', 'The diagram represents the movement of warm air.', '该图表示暖空气的运动。'),
      W('indicate', '/ˈɪndɪkeɪt/', '显示；表明；指示', 'v.', 'indication n. 迹象；indicator n. 指标。', '地图颜色显示某些地区的温度范围。', ['indicate a trend', '显示趋势'], ['indicate a risk', '表明风险'], 'suggest 可能只是提示；indicate 表显示或指向，仍须判断证据强度；prove 的证明力度更强。', 'The results indicate a rise in demand.', '结果显示需求有所上升。'),
      W('exceed', '/ɪkˈsiːd/', '超过（数量、限度或标准）', 'v.', 'exceeded 过去式／过去分词；excess n. 过量，词义相关但不必强记词源。', '某些地区的气温接近或超过 40 摄氏度。', ['exceed a limit', '超过限度'], ['exceed expectations', '超出预期'], 'surpass 常指表现超越；exceed 常直接接数值或标准；approach 只是接近。', 'The total cost exceeded the original estimate.', '总费用超过了原先的估计。'),
      W('humidity', '/hjuːˈmɪdəti/', '湿度；空气潮湿程度', 'n. 不可数', 'humid adj. 潮湿的；humid conditions 潮湿环境。', '高湿度是可能加重热感受的条件之一。', ['high humidity', '高湿度'], ['relative humidity', '相对湿度'], 'moisture 是水分／湿气；humidity 特指空气中的水汽含量或湿度。', 'High humidity can make warm weather feel less comfortable.', '高湿度会使温暖天气感觉更不舒适。'),
      W('risk', '/rɪsk/', '风险；危险；冒险', 'n. 可数／不可数；v.', 'risky adj. 有风险的；risk doing sth 冒险做某事。', '文章提示高温相关疾病的风险，而非病例总数。', ['increase the risk of', '增加……的风险'], ['reduce health risks', '降低健康风险'], 'possibility 只是可能性；risk 通常涉及不利后果；risk ≠ 已经发生的损害。', 'Shaded waiting areas may reduce health risks during hot weather.', '有遮阴的等候区可能降低炎热天气中的健康风险。'),
      W('phenomenon', '/fəˈnɒmɪnən/', '现象', 'n. 可数', 'phenomena /fəˈnɒmɪnə/ 是复数；不要写 phenomenons。', '热穹顶被介绍为一种天气现象。', ['a natural phenomenon', '自然现象'], ['a widespread phenomenon', '普遍现象'], 'event 侧重一次事件；phenomenon 侧重可观察到的现象或规律。', 'This phenomenon occurs in several regions.', '这种现象发生在多个地区。'),
      W('suppress', '/səˈpres/', '抑制；压制；阻止显现', 'v.', 'suppression n. 抑制；suppressed 过去式／过去分词。', '热穹顶抑制云与降水。', ['suppress growth', '抑制增长／生长'], ['suppress the formation of clouds', '抑制云的形成'], 'reduce 只表示减少；suppress 强调抑制或使其无法充分发展；不自动等于完全消除。', 'A lack of water can suppress plant growth.', '缺水可能抑制植物生长。'),
      W('precipitation', '/prɪˌsɪpɪˈteɪʃən/', '降水（雨、雪等的统称）', 'n. 不可数', 'precipitate v. 在化学中为沉淀，在其他语境可指促使突然发生；阅读按语境选义。', '在天气语境中与 clouds 并列。', ['annual precipitation', '年降水量'], ['low precipitation', '降水少'], 'rainfall 只指降雨；precipitation 包括雨、雪等多种降水。', 'Low precipitation can put pressure on water supplies.', '降水偏少可能给供水带来压力。'),
      W('elevate', '/ˈelɪveɪt/', '提高；抬升', 'v.', 'elevated adj. 升高的；elevation n. 高度／抬升。', '阳光进一步抬升空气温度。', ['elevate temperatures', '使温度升高'], ['elevated levels', '升高的水平'], 'raise 是较通用的提高；elevate 较正式，常与 levels、risk、temperature 搭配。', 'Heavy traffic can elevate pollution levels near a road.', '交通繁忙可能提高道路附近的污染水平。'),
      W('previous', '/ˈpriːviəs/', '先前的；此前的', 'adj.', 'previously adv. 先前；一般用于名词前。', '2026 年的三个月情况与此前纪录比较。', ['previous records', '此前的纪录'], ['previous research', '先前的研究'], 'former 可指原来的身份／前者；previous 强调时间上在前。', 'The new results differ from previous research.', '新结果与先前研究不同。'),
      W('relatively', '/ˈrelətɪvli/', '相对地；比较而言', 'adv.', 'relative adj. 相对的；relatively + adjective／adverb。', '阳光到达地面受到的阻碍相对较小。', ['relatively small', '相对较小的'], ['relatively high', '相对较高的'], 'comparatively 与其接近；relatively 要追问比较基准，不等于绝对程度很高或很低。', 'Public transport is relatively affordable in this city.', '公共交通在这座城市相对负担得起。'),
      W('wind down', '/ˌwaɪnd ˈdaʊn/', '逐渐结束；放松下来', 'phr. v.', 'wind 此处读 /waɪnd/；过去式／过去分词 wound /waʊnd/。', 'astronomical summer was winding down 指天文意义上的夏季接近尾声。', ['the season winds down', '季节逐渐结束'], ['wind down after work', '工作后放松'], 'end 可以是一次性结束；wind down 强调逐渐结束；在人的语境也可指放松。', 'As the project winds down, the team reviews its results.', '项目接近尾声时，团队回顾成果。')
    ],
    recall: [
      { phase: 'teaching', targetWords: ['observation', 'predict'], prompt: '对照词卡选词：卫星实际收集的信息是 observation 还是 prediction？模型对温度的估计是哪个？', answer: '卫星收集的信息 = observation；模型估计 = prediction。两者可以结合，但不是同一来源。' },
      { phase: 'teaching', targetWords: ['exceed', 'precipitation'], prompt: '看词卡理解：approach 40°C 与 exceed 40°C 的方向有何差别？precipitation 是否只有雨？', answer: 'approach = 接近；exceed = 超过。precipitation 包含雨、雪等降水。' },
      { phase: 'recall', targetWords: ['risk'], prompt: 'English → Chinese（提示：健康）：increase the risk of heat-related illness.', answer: '增加高温相关疾病的风险；不等于已发生的病例数。' },
      { phase: 'recall', targetWords: ['previous'], prompt: 'Chinese → English：先前的研究（p_______ r_______）。', answer: 'previous research' },
      { phase: 'output', targetWords: ['suppress', 'elevate'], prompt: 'Fill each gap with suppress or elevate: A lack of rain can ______ plant growth. Hot air can ______ temperatures.', answer: 'suppress；elevate。分别是抑制生长与抬升温度。' },
      { phase: 'output', targetWords: ['risk', 'relatively'], prompt: '用 risk 和 relatively 写一句话，评价一项城市防暑措施；包含 may 或 can，不承诺一定有效。', answer: '示例：Relatively inexpensive shaded spaces may reduce health risks. 成本相对较低的遮阴空间可能降低健康风险。' }
    ],
    writingTopic: {
      label: 'Task 2 · 教学练习题',
      question: 'Some people think city governments should spend more on adapting to extreme weather, while others believe improving public transport should be the priority. Discuss both views and give your own opinion.',
      questionZh: '有人认为城市政府应增加应对极端天气的投入；另一些人认为应优先改善公共交通。讨论双方观点并给出你的看法。',
      type: 'discuss-both-and-opinion',
      criteria: [
        { name: 'Task Response', tip: '分别回应防灾与交通两方；给出贯穿全文的立场；每个观点写出原因、具体例子和限制。' },
        { name: 'Coherence and Cohesion', tip: '一段推进一个主论点；用 this approach、such investment 精确回指；让步后回到立场。' },
        { name: 'Lexical Resource', tip: '优先准确搭配：reduce health risks、public transport、limited budgets；不用冷门词堆砌替换。' },
        { name: 'Grammatical Range and Accuracy', tip: '结合条件句与让步句，并检查主谓一致、冠词和比较对象；复杂句服务逻辑。' }
      ],
      plan: [
        { label: '防灾观点', en: 'Extreme heat can create immediate health risks, so warning systems and shaded public spaces deserve funding.', zh: '极端高温可能带来即时健康风险，因此预警系统和公共遮阴空间值得投入。' },
        { label: '交通观点', en: 'Reliable public transport supports everyday access to jobs and services, including for people who cannot afford a car.', zh: '可靠的公共交通支持日常获得工作与服务的机会，也惠及无力购买汽车的人。' },
        { label: '立场与权衡', en: 'A combined approach is preferable: heat-resistant transport stops can serve daily travel while protecting passengers during hot weather.', zh: '结合两者更可取：具有防暑能力的公交站既服务日常出行，也保护高温期间的乘客。' },
        { label: '具体展开', en: 'For example, shaded bus shelters with drinking-water access could benefit older passengers; however, local needs and maintenance costs should guide the design.', zh: '例如，有遮阴和饮水条件的候车亭可能使年长乘客受益；但设计应依据当地需求和维护成本。' }
      ]
    },
    writing: [
      { en: 'Although reliable transport supports everyday mobility, extreme heat may expose passengers to immediate health risks.', zh: '虽然可靠的交通支持日常出行，极端高温却可能使乘客面临即时健康风险。' },
      { en: 'City governments could therefore combine these priorities by providing shaded bus shelters and accessible drinking water.', zh: '因此，城市政府可以通过提供遮阴候车亭和方便获取的饮用水，把两项优先事项结合起来。' },
      { en: 'Such investment should be evaluated against local needs and long-term maintenance costs, rather than judged only by its initial price.', zh: '这样的投入应结合当地需求和长期维护费用评估，不能只按初期价格判断。' }
    ]
  };
  lesson.candidateWords = lesson.words.map(word => word.word);
  window.READING_LESSONS.push(lesson);
  delete window.READING_ARTICLE_ADDITIONS;
})();


