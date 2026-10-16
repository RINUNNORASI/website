# 循词练习方式：官方来源与可实现交互

核查日期：2026-10-16（Asia/Shanghai）。通过网络搜索并打开官方页面核查。下面“官方事实”是来源所述；“循词适配”是本项目根据公开交互做的设计推断，不表示已还原厂商算法、商业服务或题库。

## 公开方法与本次实现

| 方法 | 官方事实与来源 | 循词适配（设计推断） | 可靠判分边界 |
| --- | --- | --- | --- |
| 翻卡回忆 | Anki 先只显示问题，思考后 Show Answer，再用 Again / Hard / Good / Easy 自评；手册也允许只用 Again / Good 简化。[Anki Studying](https://docs.ankiweb.net/manual/studying)、[Background](https://docs.ankiweb.net/manual/background) | 看英文回忆词义，答案初始隐藏；翻卡后选择“还需重学 / 记得”。 | 翻面只是揭晓；只有用户明确自评才写记录。自评与客观拼写正确分开；未实现 Anki FSRS。 |
| 释义辨认 | Quizlet 官方学习方式页说明存在选择题、书面答题等题型；Flashcards 可翻面、乱序、分为 Still learning / Know。[Quizlet Studying](https://help.quizlet.com/hc/en-us/articles/360030841732-Studying-on-Quizlet)、[Flashcards](https://help.quizlet.com/hc/en-us/articles/360030988091-Studying-with-Flashcards) | 单词→二至四个释义候选；明确核对后锁定首答、显示解释。只从当前账号有不同完整释义的词条生成干扰项。 | 不够有效候选时不可用；不编造候选。选对表示本次识别正确，不等于会拼写。 |
| 主动拼写 | Quizlet Write 位于 Learn 的 Options，输入答案、提交，第二轮聚焦错题；官方支持“不知道”揭晓，并允许人工覆盖误判。[Quizlet Write](https://help.quizlet.com/hc/en-us/articles/360030990531-Studying-with-Write-mode) | 显示中文释义与词性，隐藏英文与 IPA；输入后明确核对，再确认保存。 | 只做大小写、空白、引号等透明规范化；不推断词形或使用 AI 语义判分。提示后不计独立答对。 |
| 听音拼写 | Duolingo 听力练习从配合文字逐步过渡到无文字，并建议先听再看。Practice tab 提供 Listen、Words、Mistakes 等自主选择。[Listening](https://blog.duolingo.com/covering-all-the-bases-duolingos-approach-to-listening-skills/)、[Practice tab](https://blog.duolingo.com/guide-to-duolingo-practice-hub/) | 播放当前词条的词典录音或设备英式语音；英文、IPA、中文默认隐藏。支持重播，实际开始播放后才能核对；不可播放时提示换方法。 | 标题、aria-label、按钮、批次名不提前泄露目标词。合成音明确标为设备语音；不把没有听到音频的输入当听写。 |
| 语境填空 | Cambridge 官方词汇活动提供语境线索、填空、近义混淆辨析与不同词形练习；Memrise 强调用学过词汇在真实视频和声音语境中重逢。[Cambridge activities](https://www.cambridgeenglish.org/learning-english/activities-for-learners/?rows=24&skill=vocabulary)、[Memrise English](https://www.memrise.com/en/learn-english) | 将自己词卡例句中完整匹配的目标词或短语挖空，核对后显示完整句和讲解；方法卡显示可用词数。 | 仅匹配完整边界，不猜词形；无匹配例句时说明原因。未抓取或复制厂商视频。 |
| 常用搭配 | British Council 讲解把搭配两部分连接，范围包括动词+名词、复合名词、形容词/动词+介词，并提供搭配分组与介词填空。[Words that go together](https://learnenglishteens.britishcouncil.org/exams/grammar-vocabulary-exams/words-go-together) | 从自己已有的双语搭配生成英文→中文配对辨认。 | 至少两条不同且无冲突的双语搭配才启用。不随机拼接所谓“错误搭配”。 |
| 引导理解 | 延续循词现有词卡讲解，并应用 Anki 的“查看与评价分开”交互。 | 查看构词、词族、搭配、近义区别和例句，读懂后主动确认。 | 教案不完整时先补充；理解确认不记作独立测试答对。 |
| 自主造句 | 由语境应用原则做的项目设计推断，并非还原某家产品的自动评分。 | 用目标词写自己的英文句子，核对自己的词卡后自行评估。 | 不声称自动判断语法、语义或 IELTS 分数；正向自评只保存学习确认。 |

## 当前产品/付费限制（只影响来源描述）

- Quizlet 官方当前说明：非订阅用户 Learn 每个词卡集仅有限轮数，Test 每个词卡集可用一次练习测试；Write / Spell 已并入 Learn。应描述为借鉴其方法，不称其所有功能免费。[Studying on Quizlet](https://help.quizlet.com/hc/en-us/articles/360030841732-Studying-on-Quizlet)
- Duolingo 当前官方 Practice tab 文章称专项练习已向所有用户免费开放，iOS 和 Android 全部课程可用。旧文中“仅 Super 可选专项练习”的说法不能再当作当前事实；部分额外 Max 会话仍涉及订阅。[Practice tab](https://blog.duolingo.com/guide-to-duolingo-practice-hub/)
- Memrise 所核查英语页列 Free / Pro，两者都列真实语境片段，Pro 列全部学习功能及无广告；这不足以推断任意视频都无限免费。循词只借鉴“语境重逢”，无需增加付费服务。[Memrise English](https://www.memrise.com/en/learn-english)

## 本次方法选择与结果结构

1. 八张方法卡写明任务、目标与今天可用词数。使用原有到期、每日新词量及优先级安排；可以选择批次开始。
2. 每题严格经历：题目 → 主动回答/自评 → 反馈 → 下一题；下一题之前不自动提交答案、不自动记录浏览。
3. 方法、提示情况、自评与实际输入写入现有作答说明；不改动云端数据格式。首次学习按原规则记录理解确认；已看答案后切换方法也不冒充独立答对。
4. 结果页分别显示独立核对、提示后完成、自评和引导学习；切换方式不能覆盖最初已核对的错误作答。
5. 保留账号隔离和共同云端同步。方法选择暂存于当前账号的页面会话，未明确完成的题目不写云端。
6. 界面采用原创布局与图形，网站练习流程不暴露 REA 或后端实现细节。

## 实际访问限制

Quizlet `/features/study-modes` 直接打开返回 403；其官方 Help Center 页面可正常访问，以上主要依据 Help Center。未绕过登录、付费或访问限制。未登录厂商账号，未获取私有 API、音频或课程素材。以上页面核查的是公开说明，不应称为实际操作过对应完整付费功能。

## 本次实际 REA 证据

分析对象是官方 AnkiDroid v2.25.2 发布 APK 中的 reviewer 控制脚本，不是对付费学习服务的运行时观察。官方发布：https://github.com/ankidroid/Anki-Android/releases/tag/v2.25.2 。

APK SHA-256：`430ff81da13f9afe965b2d6e474663324a3d84c72dbdb066bdbcd8b5317e4c4a`，与官方 release digest 匹配。未安装或运行 APK。使用 `rea-agents@6.5.0` 的 `analyze-javascript-application` 聚焦分析发布包里的 `assets/scripts/card.js` 与 `assets/scripts/ankidroid-reviewer.js`。

REA Evidence ID：`ev_92b759820ed318740839a944bdd0f8cbf885a03e174fcb858b513a70b482e3ab`。两份脚本共 19,651 bytes，零解析错误，无节点截断；动态及 native 调用的完整可达性仍未验证。

- `card.js` 的 `showAnswer()` 与四种 ease 信号分开；支持把“揭示答案”和“明确自评”设计为两个独立动作。
- 输入转发及 Enter 提交有独立处理；支持先输入、再提交、再显示对照反馈。
- 按需提示另有处理；支持单独标记提示使用情况。

以上是静态交互证据，不证明实际浏览器布局、音频播放、学习效果或 Anki native 调度算法。本项目采用原创界面、原有间隔安排与用户自己的词卡，未复制第三方代码、视觉素材或题库。原始 APK 和完整 REA Evidence 保留在分析工作区，不进入网站或公共源码。

## 本站的记录规则

练习方式由用户自行选择。题目、干扰项、搭配和例句来自当前账号自己的词卡。浏览、切换方式、揭晓和音频播放不增加学习记录；仅明确确认才调用既有学习记录接口。客观题、自评、引导学习分别展示结果。提示后完成只作学习确认，不冒充无提示答对。填写开放式造句不使用未经验证的自动语法判分。
