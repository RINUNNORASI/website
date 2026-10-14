# 循词每日内容更新

为本网站每天提供一篇全新、真实且近期的免费英文文章精读，并补齐用户主动录入的陌生词词卡。用户希望使用 GPT-6 最高智能档位；平台若不能设置具体模型，不宣称已经锁定。默认教材面向中国高中/CET-4水平学习者，目标 IELTS 总分/阅读7分。时区 Asia/Shanghai。

## 运行入口

通过本站原生 MCP 工具执行，不写入 GitHub 或重新部署网站：

1. `get_daily_learning_instructions` 读取本文件。
2. `list_reading_lessons` 读取完整标题/URL/已发布日期索引，防止重复。
3. `get_learning_summary` 读取用户的真实待完善词卡、复习阶段及最近实际作答；仅据实际作答调整弱项。
4. 先核实文章来源、发布日期、免费全文和完整转载许可，再制作课程。
5. `publish_reading_lesson` 发布课程，随后 `list_reading_lessons` 核对返回的 id、日期、URL。每天 learningDate 唯一，重复运行不要改写当天已有课。
6. `publish_word_cards` 补齐 pendingWords 的分级和教学内容，随后 `get_word_cards` 核对。工具只更新通用词卡，不替用户判定掌握或生成学习成绩。

用户希望每日内容在 ChatGPT 日程生成，滚动进入网页档案。网站关闭时也写入数据库。成功时只说明新增文章标题和链接；失败或需要用户连接时明确报告原因，不声称已更新。

## 文章与版权

题材轮换环境、社会、历史、科技、健康、教育、城市、设计。难度从 IELTS6.0–7.0 起步，根据真实作答渐进到6.5–7.5；提升同义替换、变量绑定和长难句，不靠生僻专名加难。

优先能合法完整转载的优质来源。NASA政府署名原创可按其媒体政策用于事实教育并注明作者来源；检查第三方内容排除。MIT News允许按其 Terms of Use转载：完整保留原英文标题、副标题、作者/署名，顶部链接MIT News，页尾准确显示链接到https://news.mit.edu/的“Reprinted with permission of MIT News”。MIT文本许可不是图片的CC许可，不能混淆。UCL未授权全文不得复制。新课程必须含完整、未改写的英文原文；不要把教学改写冒充原句。

## 课程结构与防泄题

顶部仅标题（可配较小中文标题）、来源与日期、难度、首读时间、训练重点。原文左侧、英文题区右侧，靠近机考习惯。答案、中文解释、词义和段落论证结构在提交/主动揭晓后显示。3–5题混合TRUE/FALSE/NOT GIVEN、选择、填空、配对；题干/选项全英文。用户弱项：FALSE vs NOT GIVEN，数字—对象—测量变量的绑定，并列/定语范围，方向、时间、对照、some/all、may/will、相关/因果、程度；用可靠原文决定答案，不靠词面。

每题提供中文题干和所有选项翻译、正确答案、可靠原文段落定位、同义替换链、干扰项和限定强度分析。NOT GIVEN 没有支持原句，不能编造定位。其他题 `evidenceParagraphIds` 和 `locator` 指向真正依据，提交后在原文高亮；locator引用须确实存在于该段。

精读提供主旨、结构、2–3个真实长难句拆分、科研方法/证据强度/作者态度和可迁移技巧。重要英语配中文，突出字号层级和语法成分；不逐词翻译整篇。教学创作与原句分开。

每天15–20个通用学术/雅思写作口语/同义替换有用的词与短语，兼顾已收录词巩固。词卡含英式IPA、准确多义释义、词性、词族、可靠记忆提示、文中语境、2–3高频搭配及中文、同义替换区别、英一句中一句教学例句。专业低频 B 只认读。没有依据的词源不要编造；真人/词典录音的地域必须核实，不把美音标成英音。

主动回忆5–8项分层：前两次主要理解与轻量识别；第三次有提示英→中/中→英；第四次起搭配填空、改写、输出。每项 targetWords 必须指向实际目标词，只有目标词自己的接触次数达到条件才开放，不用其他词的次数解锁。固定间隔D0/1/3/7/14/30；错词次日/第三日加练。词表是候选，不默认陌生或入库。勾选确认入库替代单词库复制清单，网页不再需要重复的导入清单栏目。

写作与口语结合话题制作“教学自拟”Task2题或Speaking问题，不能冒充真题；按官方Band7标准讲清立场、回应任务、论证展开、段落衔接、准确搭配及复杂句。提供观点→理由→例子→局限的可使用内容、3个有用表达和可模仿的英中对照段落，不给虚构分数。

## publish_reading_lesson JSON

调用参数 `{lesson:{...}}`。字段：

- id：唯一小写a-z/数字/连字符；learningDate：当日上海YYYY-MM-DD。
- title、titleZh、url(HTTPS)、source、published、verified、topic、difficulty、minutes(数字)、focus。
- article：`{paragraphs:[{id,text,heading?}],license:{name,url,permission:'public-domain'|'licensed'},author,titleZh?,subtitle?,footer?,footerUrl?}`。3–60个原文段落，id唯一，纯文本不得写HTML。许可name和url指向已核实的真实授权，不能伪称许可。
- questions：3–5项 `{id,type:'tfng'|'choice'|'fill',prompt,options?,answer,translation,optionTranslations?,evidence,location,explanation,paraphrases,trap,evidenceParagraphIds:[],locator:[{paragraphId,quote}]}`。TRUE/FALSE/NOT GIVEN选项使用这三个英文值；选择题options为A/B/C/D，answer为单个字母；填空answer是原文词语。NG证据定位空数组。
- overview、structure、writing：`[{en,zh}]`。
- sentences：2–3项 `{en,zh,parts:[中文结构拆解],tip,kind:'原文'|'教学改写'}`。kind只在确有引用时为原文。
- method：`{en,zh}`。
- words：15–20项 `{word,ipa,meaning,pos,family,memory?,context,collocations:[{en,zh}],synonyms,example:{en,zh},source?:{title,url,publisher,date}}`。
- recall：5–8项 `{phase:'teaching'|'recall'|'output',targetWords:[词卡原拼写],prompt,answer}`。
- candidateWords：精选词/短语一行式数组，保留内部数据，但网页不再重复显示复制清单。
- writingTopic 可选：`{type:'Task 2 · 教学自拟',prompt,translation,plan:[{label,en,zh}],criteria:[{criterion,application}],model:[{en,zh}],phrases:[{en,zh}]}`；没有字段时界面使用基于文章主题的自拟框架。

## publish_word_cards JSON

参数 `{cards:[{word,ipa,meaning,pos,family,memory,collocations:[{en,zh},{en,zh}],synonyms,example:{en,zh},level:'A'|'B'|'C',senses?:[{meaning,en,zh}],source?:{title,url}}]}`。默认新用户主动提交的词都不认识；先用已有词族/原文语境去重纠错。已有优先级A/B/C有明确理由时可建议调整，用户手选优先。只输出准确教学词卡，不包含contacts/status/errors/掌握或成绩字段。

Excel按当前用户的实际最近整理日期，至少5天且新增足够（推荐7天），由用户界面导出A/B工作表。未读取旧Excel就不声称覆盖旧文件未见内容。
