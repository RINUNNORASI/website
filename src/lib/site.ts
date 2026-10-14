export const languages = ['zh', 'en'] as const;
export type Language = (typeof languages)[number];

export function withBase(path = '') {
  return import.meta.env.BASE_URL.replace(/\/?$/, '/') + path.replace(/^\/+/, '');
}

export function localizedPath(language: Language, path = '') {
  return withBase(language + '/' + path.replace(/^\/+/, ''));
}

export const text = {
  zh: {
    siteTitle: '空间 · 作品与研究',
    description: '环境设计作品、空间研究与设计笔记。',
    work: '作品', notes: '笔记', about: '关于', search: '搜索',
    skip: '跳到正文', home: '首页',
    hero: '用空间，记录思考。',
    intro: '一个展示设计作品、调研过程与方法的个人空间。',
    projects: '作品选集', sample: '示例项目',
    sampleDescription: '用问题、调研、设计决策、方案与验证组织项目。替换示例图，开始记录自己的作品。',
    galleryHint: '点击查看大图',
    recentNotes: '设计笔记', read: '阅读笔记',
    aboutTitle: '关于我', aboutText: '这里预留给你的个人介绍、教育经历与设计关注。添加真实信息后，再用它介绍自己。',
    searchTitle: '搜索作品与笔记',
    searchDev: '搜索在构建后的预览中可用。',
    footer: '作品与笔记，持续更新。',
  },
  en: {
    siteTitle: 'Space · Work & Notes',
    description: 'Environmental design projects, spatial research and design notes.',
    work: 'Work', notes: 'Notes', about: 'About', search: 'Search',
    skip: 'Skip to content', home: 'Home',
    hero: 'Thinking through space.',
    intro: 'A personal place for design projects, research and methods.',
    projects: 'Selected work', sample: 'Example project',
    sampleDescription: 'Tell a project through its question, research, decisions, proposal and evaluation. Replace the example images with your own work.',
    galleryHint: 'Open full-size image',
    recentNotes: 'Design notes', read: 'Read note',
    aboutTitle: 'About me', aboutText: 'Add your introduction, education and design interests here. Replace this placeholder with your own information.',
    searchTitle: 'Search work & notes',
    searchDev: 'Search is available in the production preview after a build.',
    footer: 'Work and notes, in progress.',
  },
} as const;
