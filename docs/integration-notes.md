# 接入说明

## 当前组合

当前工程实际使用 Astro、Tailwind、Lucide、MDX、PhotoSwipe、Motion 和 Pagefind。Lucide 采用 @lucide/astro，动画使用 Motion 的普通 JavaScript API，因此不需要为了这些功能引入 React。

## 为什么其他项目没有全部安装

44 项清单包含相互替代的整站框架、整站模板、功能组件、服务平台和检查工具。将它们一起装入项目会带来重复配置和未使用的依赖。

- Next.js 是另一条框架路线，不叠加到本 Astro 工程。
- shadcn/ui、React Bits、Magic UI 需要相应的 React 组件运行环境；确有需求时先配置 @astrojs/react。
- 网站当前没有账号、数据库或服务端邮件操作，所以暂不加入 Supabase、Better Auth、Resend。
- 地图、模型和超大图只在对应的项目页面使用，避免所有访客都加载相关代码。
- 完整清单仍保留在 github-toolkit.md，便于后续扩展。

## 适合环境设计的下一步

| 需求 | 工具 | 接入前准备 |
| --- | --- | --- |
| 改造前后、两版方案对比 | img-comparison-slider | 对齐视角、尺度与图片尺寸 |
| 超大总平细节查看 | OpenSeadragon | 图像与多级瓦片或兼容图像服务 |
| 旋转查看模型 | model-viewer | 压缩后的 GLB / glTF 与替代预览图 |
| 地点、调研点与路线 | Leaflet | 地理数据、底图与署名配置 |
| 问卷、人流与评论统计 | ECharts | 清楚的数据来源、样本量与分析说明 |
| 网页后台更新内容 | Decap CMS | 仓库访问与登录验证配置 |

## 官方文档

- [Astro](https://docs.astro.build/)
- [Tailwind 与 Astro](https://tailwindcss.com/docs/installation/framework-guides/astro)
- [Lucide Astro](https://lucide.dev/guide/packages/lucide-astro)
- [MDX 集成](https://docs.astro.build/en/guides/integrations-guide/mdx/)
- [PhotoSwipe](https://photoswipe.com/getting-started/)
- [Motion JavaScript](https://motion.dev/docs/quick-start)
- [Pagefind](https://pagefind.app/docs/)
