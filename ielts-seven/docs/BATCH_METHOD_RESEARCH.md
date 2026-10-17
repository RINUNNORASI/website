# 词汇练习分组依据

核查与实现日期：2026-10-16（Asia/Shanghai）。本次将导入来源分组改为小组练习；导入批次继续保留为来源记录。下列公开事实、REA 静态证据和本站设计分别说明，避免把界面推断当成厂商算法。

## 公开方法

| 来源事实 | 本站适配及边界 |
| --- | --- |
| [Anki Deck Options](https://docs.ankiweb.net/manual/deck-options) 分开配置新卡数量、复习数量、学习/重学与显示顺序；可优先等待更久的复习。手册提醒积压时继续大量加入新卡会增加负担，也说明固定按牌组顺序可能提供答案线索。 | 继续由本站原有 `studyQueue` 决定候选和限额；仅把同一个候选池按真实错误、已有学习记录和首次学习区分为小组。来源名称不再决定整组大小。本站的 `dailyReviewLimit` 原本是“每批复习词数”，保留该含义，不能称为 Anki 的每日复习封顶。 |
| [The Learning Scientists：Retrieval Practice](https://www.learningscientists.org/blog/2016/6/23-1) 建议先尝试从记忆中提取，再对照；翻卡时应真正回忆，而非直接偷看。 | 到期回忆组提示先回忆，再核对。用户仍可自行选择八种方法；查看、切换和揭晓均不自动保存。 |
| [The Learning Scientists：Spaced Practice](https://www.learningscientists.org/blog/2016/7/21-1) 建议把学习分布在多天，并在短学习时段结合提取等策略。 | 今天已明确确认的词不反复加入新组；未来到期词不提前拉入，不把逾期日期补造为已完成。继续沿用本站现有间隔安排。 |
| [The Learning Scientists：Interleaving](https://www.learningscientists.org/blog/2016/8/11-1) 讨论切换相关概念与问题类型，同时提醒切换过密的风险；[官方后续说明](https://www.learningscientists.org/learning-scientists-podcast/2017/12/6/episode-8-interleaving) 指出随意混合无关材料没有相同证据。 | 本次仅在同一阶段、同一到期日内轮换来源并打散固定顺序，减少导入列表顺序提示。来源不是语义主题；没有词义主题分析，也不宣称此规则已实现研究中的交错学习或证明更优效果。 |

**每组默认 6 词、最多 8 词是本站的可完成性设计选择，不能表述为研究证明的最优数量。** 没有移植或还原 FSRS、厂商记忆预测模型、语义聚类或学习效果保证。

## 实际 REA 核查

复用并重新运行对官方 [AnkiDroid v2.25.2](https://github.com/ankidroid/Anki-Android/releases/tag/v2.25.2) APK 的聚焦分析。APK 的 SHA-256 为 `430ff81da13f9afe965b2d6e474663324a3d84c72dbdb066bdbcd8b5317e4c4a`，与官方 release digest 一致。未安装或执行 APK。

```sh
npx -y rea-agents@6.5.0 analyze-javascript-application /workspace/scratch/rea-learning-artifacts/ankidroid-2.25.2-reviewer-assets --source-path assets/scripts/card.js --source-path assets/scripts/ankidroid-reviewer.js --format json
```

本次重新执行得到相同内容寻址 Evidence ID：`ev_92b759820ed318740839a944bdd0f8cbf885a03e174fcb858b513a70b482e3ab`。两份发布脚本共 19,651 bytes，1,902 AST 节点，零解析失败；五份未选文件与 native/dynamic 调用仍在已知覆盖限制之外。

`card.js` 的 `showAnswer()` 和四种 `buttonAnswerEase*()` 是独立操作；输入变更与 Enter 提交另有路径。对应 reviewer 脚本也保留揭晓与评价的区别。由此可支持“先回忆、核对后由本人评价”的交互分离。**这些静态 JS 不包含可验证的 native 排程实现，不足以反推出学习批次的最优数量或 Anki 调度算法。** 分组与负担规则另外依据上方公开说明，并以本站设计实现。

原始 APK 和完整 Evidence 留在分析工作区，不进入网站或公共源码。没有复制第三方代码、题库或视觉资源。

## 实现与记录边界

- `IELTS_PRACTICE_BATCHES.build(records, date, preferences, engine, options)` 仅返回小组、词条 ID 和事实计数，不修改词卡、复习日期、掌握状态或云端格式。
- 只对当前账号词库调用一次原有 `studyQueue`；保留全部原词卡供引擎计算今天已开始的新词数量。小组都来自同一个受限池，选择其他组不能另起新词额度。
- 受限池内依次显示“优先修复”“到期回忆”“新词理解”；同阶段先较早到期，再轮换导入来源。小组建议方法可供参考，用户的选择优先。
- 已确认当日学习、C 类、未到期的词不进入小组；教案待补的词单独计数，不占可练池，也不伪装成已经学会。
- 当前安排以外的待复习词明确显示为积压；新词额度不足的部分与可继续的下一轮数量分别说明。不会擅自改写它们的到期日期。
- `dueTotal = planned + backlog + needsContent`；`backlog` 不含教案待补词。所有小组 ID 去重，界面刷新结果稳定，明确确认后才重新产生后续小组。

对应回归检查覆盖大导入批次、真实错题优先、今天已完成、新词额度、原批量上限、待补教案、来源混排、去重、稳定性和完成后递进。无实际浏览器布局或学习效果实验。
