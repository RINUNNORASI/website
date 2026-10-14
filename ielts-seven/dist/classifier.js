/* Explainable intake suggestions; this module never writes learning state. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.IELTS_CLASSIFY = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const levels = new Set(['A', 'B', 'C']);
  const words = text => new Set(text.trim().split(/\s+/));
  // AWL membership is factual data. These are headwords, not dictionary entries
  // or a claim to cover all derived members of the 570 word families.
  const academic = words('analyse approach area assess assume authority available benefit concept consist constitute context contract create data define derive distribute economy environment establish estimate evident export factor finance formula function identify income indicate individual interpret involve issue labour legal legislate major method occur percent period policy principle proceed process require research respond role section sector significant similar source specific structure theory vary achieve acquire administrate affect appropriate aspect assist category chapter commission community complex compute conclude conduct consequent construct consume credit culture design distinct element equate evaluate feature final focus impact injure institute invest item journal maintain normal obtain participate perceive positive potential previous primary purchase range region regulate relevant reside resource restrict secure seek select site strategy survey text tradition transfer alternative circumstance comment compensate component consent considerable constant constrain contribute convene coordinate core corporate correspond criteria deduce demonstrate document dominate emphasis ensure exclude framework fund illustrate immigrate imply initial instance interact justify layer link locate maximise minor negate outcome partner philosophy physical proportion publish react register rely remove scheme sequence sex shift specify sufficient task technical technique technology valid volume access adequate annual apparent approximate attitude attribute civil code commit communicate concentrate confer contrast cycle debate despite dimension domestic emerge error ethnic goal grant hence hypothesis implement implicate impose integrate internal investigate job label mechanism obvious occupy option output overall parallel parameter phase predict principal prior professional project promote regime resolve retain series statistic status stress subsequent sum summary undertake academy adjust alter amend aware capacity challenge clause compound conflict consult contact decline discrete draft enable energy enforce entity equivalent evolve expand expose external facilitate fundamental generate generation image liberal licence logic margin medical mental modify monitor network notion objective orient perspective precise prime psychology pursue ratio reject revenue stable style substitute sustain symbol target transit trend version welfare whereas abstract accurate acknowledge aggregate allocate assign attach author bond brief capable cite cooperate discriminate display diverse domain edit enhance estate exceed expert explicit federal fee flexible furthermore gender ignorant incentive incidence incorporate index inhibit initiate input instruct intelligent interval lecture migrate minimum ministry motive neutral nevertheless overseas precede presume rational recover reveal scope subsidy tape trace transform transport underlie utilise adapt adult advocate aid channel chemical classic comprehensive comprise confirm contrary convert couple decade definite deny differentiate dispose dynamic eliminate empirical equip extract file finite foundation globe grade guarantee hierarchy identical ideology infer innovate insert intervene isolate media mode paradigm phenomenon priority prohibit publication quote release reverse simulate sole somewhat submit successor survive thesis topic transmit ultimate unique visible voluntary abandon accompany accumulate ambiguous append appreciate arbitrary automate bias chart clarify commodity complement conform contemporary contradict crucial currency denote detect deviate displace drama eventual exhibit exploit fluctuate guideline highlight implicit induce inevitable infrastructure inspect intense manipulate minimise nuclear offset paragraph plus practitioner predominant prospect radical random reinforce restore revise schedule tense terminate theme thereby uniform vehicle via virtual visual widespread accommodate analogy anticipate assure attain behalf bulk cease coherent coincide commence compatible concurrent confine controversy converse device devote diminish distort duration erode ethic format found inherent insight integral intermediate manual mature mediate medium military minimal mutual norm overlap passive portion preliminary protocol qualitative refine relax restrain revolution rigid route scenario sphere subordinate supplement suspend team temporary trigger unify violate vision adjacent albeit assemble collapse colleague compile conceive convince depress encounter enormous forthcoming incline integrity intrinsic invoke levy likewise nonetheless notwithstanding odd ongoing panel persist pose reluctance so-called straightforward undergo whereby');
  const academicForms = Object.freeze({
    analysis: 'analyse', analytical: 'analyse', analyst: 'analyse', analyze: 'analyse',
    assessment: 'assess', assumption: 'assume', availability: 'available',
    beneficial: 'benefit', conceptual: 'concept', consistency: 'consist',
    constitutional: 'constitute', contextual: 'context', distribution: 'distribute',
    economic: 'economy', economical: 'economy', financial: 'finance',
    identifiable: 'identify', identification: 'identify', indication: 'indicate',
    interpret: 'interpret', interpretation: 'interpret', involvement: 'involve',
    legislation: 'legislate', methodological: 'method', periodic: 'period',
    procedural: 'procedure', requirement: 'require', responsiveness: 'respond',
    significant: 'significant', significance: 'significant', similarity: 'similar',
    structural: 'structure', theorise: 'theory', theorize: 'theory',
    synthesis: 'synthesize', synthesise: 'synthesize',
    environmental: 'environment', sustainable: 'sustain', sustainability: 'sustain',
    evaluation: 'evaluate', implementation: 'implement',
    demographic: 'demography', socioeconomic: 'socioeconomic'
  });
  // Curated for the learner's stated urban/environment/design and IELTS goals.
  const topic = words(`
    architecture architectural urban rural city town community neighbourhood
    neighborhood housing affordable affordability resident residents municipal
    municipality utility utilities infrastructure transit transport transportation
    commuter commute pedestrian walkability congestion traffic mobility suburban
    suburbanization suburbanisation segregation inequality equitable equity justice
    socioeconomic demographic demography population ageing aging retirement
    caregiver carer education literacy curriculum tuition vocational digital
    technology innovation renewable energy emission emissions carbon pollution
    pollutant conservation habitat biodiversity ecosystem ecological ecology
    climate weather drought flooding flood rainfall precipitation canopy vegetation
    deforestation restoration resilience resilient vulnerability vulnerable thermal
    imagery satellite nutrient nutrition nutritional malnutrition sustainable
    sustainability mitigate mitigation adaptation adapt exacerbate deterioration
    deteriorate degradation deplete depletion regenerate regeneration recover
    restoration buffer sensitive sensitive mature harvest monitor agricultural
    agriculture irrigation fertile fertilizer fertiliser waste recycling recycle
    compost landfill sanitation sewage drinking-water potable ventilation insulation
    accessibility accessible inclusive inclusion recreation recreational wellness
    intervention benchmark measurement variable participant evidence correlation
    causation causal uncertainty probability reliable validity robust hypothesis
    quantitative qualitative empirical longitudinal cross-sectional randomised
    randomized bias biased sample sampling proportion percentage percentage-point
    respectively simultaneous occurrence increasingly potential prioritize
    prioritise facilitate feasible feasibility cost-effective trade-off outweigh
    implication consequence incentive objective subjective distinctive retain
    contrast contradictory complementary abundant ample persist persistent durable
    irreversible fundamental underlying evaluate identify determine accomplish
  `);
  const phrases = new Set([
    'urban heat island', 'tree canopy', 'satellite imagery', 'municipal utilities',
    'socioeconomic segregation', 'public transit', 'public transport',
    'affordable housing', 'demographic variation', 'increasingly severe droughts',
    'climate change', 'synthesize evidence', 'synthesise evidence', 'attribute to',
    'attribute ... to', 'be wary of', 'keep pace with', 'on the other hand',
    'in contrast', 'in addition', 'as a result', 'due to', 'in terms of',
    'give rise to', 'take into account', 'play a role in', 'green space',
    'quality of life', 'living standards', 'sustainable development',
    'carbon footprint', 'renewable energy', 'climate change may exacerbate...'
  ]);
  const specialist = words(`
    anthropogenic biogeochemical stratospheric landsat thermodynamics
    chromatographic chromatography photosynthesis cytoplasm mitochondria
    mitochondrial ribosome ribosomal genome genomic allele genotype phenotype
    phylogenetic palaeolithic paleolithic holocene pleistocene radiocarbon
    mesozoic cretaceous jurassic triassic cambrian eocene oligocene miocene
    pliocene archaeopteryx australopithecus hominin barista artisanal shortgrass
    prairie swelter excavate specimen lineage hectare millennium stratum
    municipal-level geostationary photovoltaic lidar voxel pixel chlorophyll
    spectroscopy spectrometer spectroscopy neuroanatomy epistemological
    epistemology ionosphere tropospheric bathymetry stratigraphy mineralogy
    aquifer aquifers hydraulic hydrological paleontology palaeontology
    morphometry morphometric isotherm isotherms ornithology mycorrhizal
  `);
  // Frequent subtitle names must not be mistaken for academic vocabulary.
  const properNames = words(`
    john mary joel ginny harry james jim jack jake jimmy mike michael william
    david daniel danny robert bob bobby richard rick sam samantha sarah sara
    emma kate katie jennifer jessica jess julie julia susan suzanne george
    henry oliver tom thomas charlie peter paul patricia patrick helen lucy
    charlotte sophie sophia alice linda kevin brian steve steven tony edward
    elizabeth ethan liam noah adam andrew josh joshua rachel rebecca simon
    chris christopher victor victoria amanda grace holly max michael
    london paris beijing shanghai tokyo sydney melbourne nasa noaa ipcc unesco
    unicef oecd landsat sentinel copernicus
  `);
  const functionWords = words(`a an the and or but if as at by for in of on to
    from with without into onto over under above below through between among
    i you he she it we they me him her us them my your his its our their this
    that these those some any each every all no not yes be is am are was were
    been being do does did have has had can could may might must shall should
    will would ought whom whose who which what when where why how then than
    so very too only also even still yet already again there here`);

  function normalize(value) {
    if (typeof value !== 'string') return '';
    if (root.IELTS_ENGINE && typeof root.IELTS_ENGINE.normalizeWord === 'function') {
      return root.IELTS_ENGINE.normalizeWord(value);
    }
    return value.trim().replace(/^[-*•]\s*/, '').replace(/^\d+[.)、]\s*/, '')
      .replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').replace(/\s+/g, ' ').toLowerCase();
  }
  function result(level, reason, confidence, details) {
    return Object.freeze(Object.assign({level, reason, confidence}, details || {}));
  }
  function lexical(value) {
    return /^[a-z]+(?:[-'][a-z]+)*(?: [a-z]+(?:[-'][a-z]+)*)*$/.test(value);
  }
  function matches(record, term) {
    return record && typeof record === 'object' && !Array.isArray(record) &&
      (!record.word || normalize(record.word) === term) && levels.has(record.level);
  }
  function seedRecord(term) {
    const lists = [root.VOCAB_HISTORY, root.VOCAB_NEW];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      const found = list.find(record => matches(record, term));
      if (found) return found;
    }
    return null;
  }
  function academicBase(term) {
    if (academic.has(term)) return term;
    const mapped = academicForms[term];
    if (mapped && academic.has(mapped)) return mapped;
    // Inflection matching only accepts an actual AWL stem. No invented root,
    // derived meaning, or automatic merge of the learner's records follows.
    const candidates = [];
    if (/ies$/.test(term)) candidates.push(term.slice(0, -3) + 'y');
    if (/s$/.test(term) && !/ss$/.test(term)) candidates.push(term.slice(0, -1));
    if (/es$/.test(term)) candidates.push(term.slice(0, -2));
    if (/ed$/.test(term)) candidates.push(term.slice(0, -2), term.slice(0, -1));
    if (/ing$/.test(term)) candidates.push(term.slice(0, -3), term.slice(0, -3) + 'e');
    for (const candidate of candidates) {
      if (academic.has(candidate)) return candidate;
      if (academicForms[candidate] && academic.has(academicForms[candidate])) return academicForms[candidate];
    }
    return '';
  }
  function frequency(term) {
    const data = root.IELTS_FREQUENCY;
    return data && data.entries && Object.prototype.hasOwnProperty.call(data.entries, term)
      ? data.entries[term] : null;
  }
  function pending(level, reason, confidence, details) {
    return result(level, reason + '；待词典核实，建议可调整。', confidence,
      Object.assign({dictionaryPending: true}, details || {}));
  }
  function suggest(input, knownData) {
    const term = normalize(input);
    const options = knownData && typeof knownData === 'object' ? knownData : {};
    if (levels.has(options.manualLevel)) {
      return result(options.manualLevel, '使用你明确选择的分类；不改变接触或掌握状态。', 1, {source: 'manual'});
    }
    const existing = options.existing && typeof options.existing === 'object'
      ? options.existing : null;
    const records = Array.isArray(options.records) ? options.records : [];
    const saved = matches(existing, term) ? existing
      : records.find(record => matches(record, term));
    if (saved) return result(saved.level, '保留已有词汇分类；重现不表示已掌握。', 1, {source: 'existing'});
    const card = options.knownData || options.knownCard || options;
    if (matches(card, term)) {
      return result(card.level, '保留已核实词卡的分类；需你确认陌生后才入库。', 1, {source: 'known-card'});
    }
    const seed = seedRecord(term);
    if (seed) return result(seed.level, '沿用已确认历史词卡的分类；不推断已掌握。', 1, {source: 'history'});
    if (!term || !/[a-z]/.test(term) || term.length > 200) {
      return result('C', '不是有效英文词汇或短语，暂不进入复习；请检查输入。', 0.99, {source: 'invalid'});
    }
    if (phrases.has(term)) return result('A', '适合雅思阅读、写作或城市环境主题的常用短语。', 0.92, {source: 'curated-phrase'});
    if (!lexical(term)) return pending('B', '包含需要确认的标点、数字或词形，先保留认读', 0.2, {source: 'unverified'});
    if (specialist.has(term) || properNames.has(term)) {
      return result('B', '专业术语或专名，先理解文章语境并认读；有输出需求时可调为 A。', 0.82, {source: 'specialist'});
    }
    if (topic.has(term)) return result('A', '城市、社会、环境、研究或雅思表达中的实用词。', 0.9, {source: 'curated-topic'});
    const awl = academicBase(term);
    if (awl) return result('A', '对应 Academic Word List 学术词族 ' + awl + '，优先理解与运用。', 0.9, {source: 'academic', familyHead: awl});
    const found = frequency(term);
    if (found) {
      const data = root.IELTS_FREQUENCY.metadata;
      const info = '英语字幕语料保留词表排名 ' + found.rank + '/' + data.retainedTokens +
        '，出现 ' + found.count + ' 次（字幕频率不等于雅思频率）';
      // A self-reported unknown common word remains worth learning. A basic
      // function word is not silently treated as known or assigned C.
      if (functionWords.has(term)) return result('A', info + '；你报为陌生词时仍先教学。', 0.58, {source: 'frequency', frequency: found});
      if (found.rank <= data.aMaxRank) return pending('A', info + '，暂列实用词重点学习', 0.62, {source: 'frequency', frequency: found});
      return pending('B', info + '，相对低频，先结合语境认读', 0.48, {source: 'frequency', frequency: found});
    }
    const components = term.split(' ');
    if (components.length >= 2 && components.length <= 8) {
      if (components.some(part => specialist.has(part) || properNames.has(part))) {
        return pending('B', '短语含专业术语或专名，先确认文章中的整体含义', 0.55, {source: 'phrase'});
      }
      const content = components.filter(part => !functionWords.has(part));
      const useful = content.filter(part => topic.has(part) || academicBase(part));
      const allSeen = components.every(part => functionWords.has(part) || topic.has(part) || academicBase(part) || frequency(part));
      if (content.length && useful.length / content.length >= 0.5 && allSeen) {
        return pending('A', '短语包含实用主题或学术词；需核实整体搭配与语境', 0.65, {source: 'phrase'});
      }
    }
    if (/^[A-Z][A-Z0-9-]{1,15}$/.test(typeof input === 'string' ? input.trim() : '') && term.length <= 16) {
      return pending('B', '可能是缩写或专名，先核实全称与文章语境', 0.5, {source: 'possible-name'});
    }
    if (!root.IELTS_FREQUENCY || !root.IELTS_FREQUENCY.entries) {
      return pending('B', '未命中已核实词卡或学术词，且词频数据尚未加载；先保留认读，不能据此断言无用', 0.15, {source: 'data-unavailable'});
    }
    return pending('B', '未命中已核实词卡、学术词或 17,000 词频快照；可能是低频词、专名或错拼，不能据此断言无用', 0.2, {source: 'uncovered'});
  }
  return Object.freeze({suggest, metadata: Object.freeze({
    academicHeadwords: academic.size,
    methodology: '保留明确分类；主题与 AWL 优先 A；字幕保留排名前 10000 暂列 A，其余 B；仅无效项 C。分类不是掌握判断。',
    sources: Object.freeze([
      'https://github.com/hermitdave/FrequencyWords',
      'https://www.wgtn.ac.nz/lals/resources/academicwordlist'
    ])
  })});
});
