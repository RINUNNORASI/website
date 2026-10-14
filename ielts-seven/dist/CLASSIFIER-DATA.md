# 录词分类数据与限制

分类只给出可修改建议。用户勾选“确认不认识”后才入正式词库；分类不创建成绩、不推断掌握、不改变接触次数。已有记录和手选分类优先。

## FrequencyWords / OpenSubtitles2018

- 作者：Hermit Dave；语料来源：OpenSubtitles2018。
- 原仓库：https://github.com/hermitdave/FrequencyWords
- 原文件：https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt
- **内容许可证：CC BY-SA 4.0**，https://creativecommons.org/licenses/by-sa/4.0/ 。仓库代码为 MIT，不能把内容误标为 MIT。
- 本站派生的 `frequency-data.js` 数据继续按 CC BY-SA 4.0 发布。改动：从 50,000 条源记录中仅保留小写英文、内部连字符和撇号的 tokens，再截取前 17,000 条；用 36 进制编码原始出现次数，次数未改。过滤后源词表有 48,412 条有效 tokens。
- 数据包内提供原文件 SHA-256、有效条目数、截断范围和阈值，以便核验。`scripts/build-frequency-data.py` 可从下载的原文件重建，浏览器无需联网。
- 排名是过滤后词表的一基序号，**不是原文件的行号**。前 10,000 的末项出现 2,451 次；17,000 的末项出现次数保存在 metadata。前 10,000 的实用词暂建议 A，其余暂 B。这是教学筛选规则，不是 CEFR、雅思频率或雅思分数预测。
- 字幕语料带口语、人名、错拼和题材偏差，频率匹配不等于词典核实。频率建议会显示“待词典核实”；没有匹配时明确说明词表未覆盖，不断言该词无用，也不编造音标、释义、词根或例句。

## Academic Word List

- 研究：Averil Coxhead (2000), *A New Academic Word List*, TESOL Quarterly 34(2), 213–238。
- 官方说明：https://www.wgtn.ac.nz/lals/resources/academicwordlist
- 官方词族说明：https://www.wgtn.ac.nz/lals/resources/academicwordlist/information/thesublists
- 这里只使用 570 个 headwords 的词族成员事实，未复制定义、教学说明、论文或例句。常规屈折匹配与少量明确的词形映射不意味着覆盖 AWL 全部派生词，也不会合并用户记录或推断同词族已掌握。
- 机器可读 headword 转录来源：https://github.com/smnji/grade-level-drift/blob/main/src/evaluators/wordlists/awl.txt ，其来源说明指向 Coxhead 原始 AWL。词族名称对应学术词事实，不能据此称为完整词典。

## 教学筛选

城市、环境、社会、设计和研究主题集合由本站为用户目标人工整理；专业低频术语和可确认专名优先认读。大写首字母本身不作为专名证据。仅无效英文词项建议 C，不能因为某个词简单就默认用户认识。全部建议可由用户调整。
