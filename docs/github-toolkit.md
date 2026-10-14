# 个人网站 GitHub 工具清单

检索日期：2026-10-14

这份清单按“个人介绍 + 环境设计作品集 + 设计研究 / 博客 + 中英双语”的用途整理，共 44 个 GitHub 项目，覆盖框架、界面、动效、图像、内容、地图与模型、表单后台、上线维护和整站模板。

选型建议属于针对上述用途的判断；项目功能与许可证以所链接的官方仓库、LICENSE 和文档为依据。GSAP 与 React Bits 的许可证有额外条款，因此本清单使用“GitHub 项目”统称，不把所有项目都归为同一种开源许可。

## 最适合先完成的一套

| 层级 | 初期选择 | 原因 |
| --- | --- | --- |
| 整站框架 | Astro | 优先服务以图像和文字为主的内容展示 |
| 页面样式 | Tailwind CSS，配合自定义 CSS | 容易统一网格、间距、字号与响应式布局 |
| 内容 | Astro Content Collections + Markdown；需要组件时加入 MDX | 用结构化项目信息生成列表与详情 |
| 图标 | Lucide | 给导航、下载、外链等提供一致的 SVG 图标 |
| 大图查看 | PhotoSwipe | 让平剖面、效果图在手机与桌面上可放大阅读 |
| 动效 | 先用 CSS；需要时加入 Motion 的普通 JavaScript API | 只为明确的交互需求增加运行时代码 |
| 搜索 | 文章或项目积累后加入 Pagefind | 构建静态索引，无需单独搜索服务器 |
| 双语 | Astro 原生 i18n 路由 + 你自己维护的中英内容 | 明确区分 /zh/ 和 /en/，语言切换并不自动翻译 |
| 图片性能 | Astro 原生 Image / Picture | 优先用内置图片能力生成合适尺寸，不重复加入图像服务 |
| 上线 | 静态站可使用 withastro/action 部署到 GitHub Pages | 自动构建和发布；动态功能要另配服务 |
| 基础检查 | Lighthouse；关键互动需要时使用 Playwright | 关注加载速度、移动端阅读和用户操作 |

第一阶段建议只有：首页、作品列表、项目详情、关于我 / 简历、设计笔记、联系入口。普通作品展示无需先加入登录、数据库或复杂 CMS。

针对环境设计，可按作品需要逐项添加：

- 改造前后与方案迭代：img-comparison-slider。
- 超大总平、精细分析底图：OpenSeadragon。
- 可旋转的模型展示：model-viewer。
- 项目地点与调研路径：Leaflet。
- 问卷、评论或人流分析：ECharts。
- 网页后台更新内容：Decap CMS。

## 怎么阅读清单

- “首选”表示适合上述用途，并非所有网站都必须安装。
- “按需”表示有对应功能时再加入。
- “后加”表示需要明确收益后再引入，尤其是特殊滚动、三维场景、登录和统计服务。
- “替代方案 / 替代起点”通常与同类方案二选一。
- 框架负责组织网站；功能库解决某个问题；模板是已有整站起点；服务平台需要额外账号或部署；检查工具通常只在开发阶段运行。

## 基础与界面

| 序号 | 项目 / GitHub | 许可证 | 选择时机 | 类型与适配 | 用途 | 接入说明 | npm 包或使用方式 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | [Astro](https://github.com/withastro/astro) | MIT | 首选 | 框架；内容站 | 项目页面、个人介绍、博客、静态生成。 | 适合以文字和图像为主的个人网站；图片优化、内容集合与国际化路由可使用原生能力。 | astro |
| 2 | [Next.js](https://github.com/vercel/next.js) | MIT | 替代方案 | 框架；React | 需要登录、复杂交互、数据库读写的个人应用。 | 与 Astro 作为整站框架通常二选一；不必为了普通作品集上全栈。 | next |
| 3 | [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | MIT | 首选 | 样式；框架无关 | 响应式网格、排版、颜色、间距。 | 可以和普通 CSS 共存；它提供样式工具，并不自动决定网站设计。 | tailwindcss |
| 4 | [shadcn/ui](https://github.com/shadcn-ui/ui) | MIT | 按需 | 组件源码；React | 菜单、弹窗、标签页、表单等。 | 通过 CLI 把组件源码加入项目；Astro 使用交互组件时需配置 React 集成和客户端指令。 | shadcn CLI；复制组件源码 |
| 5 | [daisyUI](https://github.com/saadeghi/daisyui) | MIT | 替代方案 | CSS 组件；Tailwind | 快速搭建按钮、卡片、导航和主题。 | 主要提供 CSS 组件，不要求整站使用 React；默认视觉需按个人风格修改。 | daisyui |
| 6 | [Lucide](https://github.com/lucide-icons/lucide) | ISC | 首选 | SVG 图标；多框架 | 菜单、外链、下载、语言切换等小图标。 | 可直接使用 SVG 或对应框架包；根据实际使用导入图标。 | lucide / lucide-react 等 |

## 动画与视觉

| 序号 | 项目 / GitHub | 许可证 | 选择时机 | 类型与适配 | 用途 | 接入说明 | npm 包或使用方式 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 7 | [Motion](https://github.com/motiondivision/motion) | MIT | 按需 | 动画；JS / React / Vue | 卡片入场、图片切换、页面微交互。 | 原 Framer Motion；普通 JS 与 React 的用法不同。Motion+ 是另一个付费产品。 | motion；React 从 motion/react 导入 |
| 8 | [GSAP](https://github.com/greensock/GSAP) | GSAP Standard License；专门许可 | 按需 | 动画；框架无关 | 滚动叙事、时间线、SVG 线条与图层变化。 | 目前含原付费插件在内可免费使用；不是 MIT 许可证。ScrollTrigger 是其插件，不是另一套整站框架。 | gsap |
| 9 | [Lenis](https://github.com/darkroomengineering/lenis) | MIT | 后加 | 滚动；框架无关 | 需要特殊滚动体验的展示页面。 | 不是必需；检查锚点、键盘、弹窗和减少动态效果设置，避免影响阅读。 | lenis |
| 10 | [React Bits](https://github.com/DavidHDev/react-bits) | MIT + Commons Clause；含额外限制 | 后加 | 效果组件；React | 文字、背景、卡片等视觉实验。 | 用于自己的站点与出售组件不同；许可证限制组件本身的销售、再许可与再分发。复制时检查各组件依赖。 | 按组件文档复制源码 |
| 11 | [Magic UI](https://github.com/magicuidesign/magicui) | MIT（公开仓库） | 后加 | 效果组件；React | 首页数字、卡片、装饰性动效。 | 公开仓库与付费模板分开；Astro 需 React 集成，避免整页为装饰加载大量 JS。 | 按组件文档复制源码 |

## 图片与作品集

| 序号 | 项目 / GitHub | 许可证 | 选择时机 | 类型与适配 | 用途 | 接入说明 | npm 包或使用方式 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 12 | [PhotoSwipe](https://github.com/dimsemenov/PhotoSwipe) | MIT | 首选 | 灯箱；框架无关 | 点击效果图、平剖面后放大，并在手机上手势查看。 | 图片浏览，不解析 CAD；设置图片宽高与原图资源，并保留缩略图。 | photoswipe |
| 13 | [Embla Carousel](https://github.com/davidjerleke/embla-carousel) | MIT | 按需 | 轮播；多框架 | 模型照片、过程图、材料样本滑动切换。 | 适合少量连续图像；长篇设计论证仍建议直接排版展开。 | embla-carousel；React 可用 embla-carousel-react |
| 14 | [img-comparison-slider](https://github.com/sneas/img-comparison-slider) | MIT | 优先扩展 | Web Component；多框架 | 改造前后、日夜、两版方案拖动对比。 | 两张图须有一致视角、尺寸和对应关系，才能说明真实变化。 | img-comparison-slider |
| 15 | [OpenSeadragon](https://github.com/openseadragon/openseadragon) | BSD-3-Clause | 按需 | 大图查看；JS | 高分辨率总平、场地底图、分析图深度缩放。 | 大图建议制作多级瓦片或使用兼容图像服务；不是加载 DWG/DXF 的工具。 | openseadragon |
| 16 | [Sharp](https://github.com/lovell/sharp) | Apache-2.0 | 构建时按需 | 图像处理；Node.js | 批量生成缩略图、多尺寸图像、WebP/AVIF。 | 不在浏览器里运行；Astro 原生图片能力已能覆盖不少需求，只有独立批处理才需单独接入。 | sharp |
| 17 | [PDF.js](https://github.com/mozilla/pdf.js) | Apache-2.0 | 按需 | PDF 渲染；JS | 网页内阅读作品集 PDF，定制翻页和缩放。 | 需要配置 worker 等资源；只提供下载或简单嵌入时可以先使用浏览器能力。 | pdfjs-dist |

## 内容与更新

| 序号 | 项目 / GitHub | 许可证 | 选择时机 | 类型与适配 | 用途 | 接入说明 | npm 包或使用方式 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 18 | [MDX](https://github.com/mdx-js/mdx) | MIT | 按需 | 内容格式；组件集成 | 在设计研究文章里插入图像、图表和交互组件。 | 普通 Markdown 已能写大多数文章；Astro 通常通过官方 @astrojs/mdx 集成。 | Astro 用 @astrojs/mdx |
| 19 | [Pagefind](https://github.com/Pagefind/pagefind) | MIT | 首选扩展 | 搜索；静态构建 | 搜索作品、案例、标签和设计笔记。 | 构建后生成索引；不需要自行部署搜索服务器。仓库已从 CloudCannon 跳转到 Pagefind 组织。 | pagefind |
| 20 | [Decap CMS](https://github.com/decaporg/decap-cms) | MIT | 按需 | 内容后台；Git CMS | 在网页后台编辑文章、作品信息和上传图片。 | 需要配置仓库访问与身份验证；不是装完就能自动登录的管理页面。 | decap-cms-app；或按官方部署方式 |
| 21 | [giscus](https://github.com/giscus/giscus) | MIT | 后加 | 评论；GitHub Discussions | 设计笔记下方交流。 | 评论者需要 GitHub 登录；适合技术读者，面向普通访客时要评估使用门槛。 | 嵌入脚本；React 可用 @giscus/react |
| 22 | [next-intl](https://github.com/amannn/next-intl) | MIT | Next.js 按需 | 国际化；Next.js | 中文和英文界面、日期与数字格式。 | 仅供 Next.js 路线；Astro 可先使用原生国际化路由并维护自己的翻译内容。 | next-intl |

## 地图模型与研究

| 序号 | 项目 / GitHub | 许可证 | 选择时机 | 类型与适配 | 用途 | 接入说明 | npm 包或使用方式 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 23 | [Leaflet](https://github.com/Leaflet/Leaflet) | BSD-2-Clause | 优先扩展 | 2D 地图；JS | 标注项目地点、调研点、路线和场地边界。 | 需自行准备数据或接入底图；地图瓦片、数据和署名要求独立于库许可证。 | leaflet |
| 24 | [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | BSD-3-Clause | 按需 | 矢量地图；WebGL | 多图层场地展示、地图样式和空间叙事。 | 与 Leaflet 按需求选择；地形、建筑等效果依赖对应数据与样式配置。 | maplibre-gl |
| 25 | [Turf.js](https://github.com/Turfjs/turf) | MIT | 按需 | 地理计算；JS / TS | GeoJSON 面积、缓冲区、距离与空间关系计算。 | 用于网页中的轻量空间分析；复杂 GIS 工作仍可在 QGIS/ArcGIS 完成后导出结果。 | @turf/turf；可按模块安装 |
| 26 | [model-viewer](https://github.com/google/model-viewer) | Apache-2.0 | 优先扩展 | 3D 查看；Web Component | 可旋转的建筑、室内、景观或装置模型。 | 主要模型格式为 glTF/GLB；先转换并压缩模型，不能把 SKP、RVT 或 3DM 直接当成 GLB 使用。 | @google/model-viewer |
| 27 | [Three.js](https://github.com/mrdoob/three.js) | MIT | 后加 | 3D 引擎；JS | 自定义灯光、相机、场景、材质和复杂三维互动。 | 如果只需旋转看模型，先使用 model-viewer；完整场景开发和移动端优化成本更高。 | three |
| 28 | [Apache ECharts](https://github.com/apache/echarts) | Apache-2.0 | 按需 | 交互图表；JS | 问卷、评论统计、人流、时间变化和方案比较。 | 图表只展示已提供的数据；作品集里同时交代来源、样本量和分析方法。 | echarts |
| 29 | [Mermaid](https://github.com/mermaid-js/mermaid) | MIT | 按需 | 文本生成图示；JS | 研究流程、策略关系、项目推进和决策图。 | 适合表达逻辑；不替代作品集中需要精细构图的空间分析图。 | mermaid |

## 表单与后台

| 序号 | 项目 / GitHub | 许可证 | 选择时机 | 类型与适配 | 用途 | 接入说明 | npm 包或使用方式 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 30 | [React Hook Form](https://github.com/react-hook-form/react-hook-form) | MIT | React 按需 | 表单；React | 较复杂的联系表单、预约或投稿表单。 | 简单联系入口可以先用 mailto 或原生 HTML 表单；它管理表单，不负责发送邮件。 | react-hook-form |
| 31 | [Zod](https://github.com/colinhacks/zod) | MIT | 按需 | 数据校验；JS / TS | 检查邮箱、消息长度、表单和接口数据结构。 | 浏览器校验不替代服务器校验；Astro 内容集合已有校验能力时不用重复设置。 | zod |
| 32 | [Resend Node SDK](https://github.com/resend/resend-node) | MIT（SDK） | 按需 | 邮件 SDK；服务端 | 访客提交联系表单后向你的邮箱发送通知。 | SDK 开源不代表邮件服务无限免费；需要账号与发信配置。API 密钥应留在服务端。 | resend |
| 33 | [Supabase](https://github.com/supabase/supabase) | Apache-2.0（平台主仓库） | 后加 | 数据库 / 身份 / 存储平台 | 登录、收藏、用户投稿、数据库记录和文件存储。 | 可托管或自部署；托管费用与平台源码许可不同。纯展示作品集不需要先加入数据库。 | 前端连接通常用 @supabase/supabase-js |
| 34 | [Better Auth](https://github.com/better-auth/better-auth) | MIT | 替代方案 | 认证；TypeScript / 服务端 | 需要自行掌握账号、会话与登录流程。 | 需要服务端和持久化配置；与 Supabase Auth 通常选择一条路线，避免重复认证系统。 | better-auth |

## 上线与维护

| 序号 | 项目 / GitHub | 许可证 | 选择时机 | 类型与适配 | 用途 | 接入说明 | npm 包或使用方式 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 35 | [Astro GitHub Pages Action](https://github.com/withastro/action) | MIT；LICENSE 内另有继承代码说明 | 按部署方式选 | 部署工具；GitHub Actions | 提交代码后自动构建并发布静态 Astro 站点。 | GitHub Pages 不能运行你的动态服务端代码；数据库、邮件等需独立服务或改用支持服务端的托管。 | GitHub workflow 引用 withastro/action |
| 36 | [Playwright](https://github.com/microsoft/playwright) | Apache-2.0 | 上线前按需 | 浏览器测试；开发工具 | 检查手机布局、导航、大图查看、双语切换和表单。 | 不发给访客运行；为关键流程编写测试，不需要给每个静态段落写测试。 | 测试通常用 @playwright/test |
| 37 | [Lighthouse](https://github.com/GoogleChrome/lighthouse) | Apache-2.0 | 上线前 | 性能与质量审计 | 检查大图、首屏、SEO 和无障碍问题。 | 报告是自动检查结果；仍需实际体验手机加载、阅读和交互。 | lighthouse；也可用 Chrome DevTools |
| 38 | [axe-core](https://github.com/dequelabs/axe-core) | MPL-2.0 | 上线前按需 | 无障碍检查；开发工具 | 发现标题结构、标签、对比度和 ARIA 等常见问题。 | 无法覆盖所有无障碍问题；保留人工键盘操作检查。正确仓库是 dequelabs/axe-core。 | axe-core；或对应测试集成 |
| 39 | [Prettier](https://github.com/prettier/prettier) | MIT | 开发时 | 代码格式化；开发工具 | 保持多人或 AI 修改后的代码格式统一。 | Astro 文件通常搭配 prettier-plugin-astro；格式化不等于代码正确性校验。 | prettier |
| 40 | [Plausible Analytics](https://github.com/plausible/analytics) | AGPL-3.0-or-later（CE）；站点追踪器为 MIT | 后加 | 访问统计；独立服务 | 了解哪些作品被阅读、入口页面和访问趋势。 | 自部署需要运行服务；托管服务另计费。不是需要打包进前端的普通 UI 库。 | 服务端部署或按托管文档嵌入脚本 |

## 可直接修改的起点

| 序号 | 项目 / GitHub | 许可证 | 选择时机 | 类型与适配 | 用途 | 接入说明 | npm 包或使用方式 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 41 | [Astro 官方 Portfolio Starter](https://github.com/withastro/astro/tree/main/examples/portfolio) | 随 Astro 仓库；查看源码许可 | 首选起点 | 整站模板；Astro | 先做个人介绍、项目列表，再扩展项目详情。 | 模板是整站起点，不与其他整站模板拼装；应把项目详情改为问题—调研—策略—方案—验证的阅读结构。 | npm create astro@latest -- --template portfolio |
| 42 | [AstroPaper](https://github.com/satnaing/astro-paper) | MIT | 替代起点 | 博客主题；Astro | 设计案例阅读、调研记录和长文档。 | 原生更偏博客；主打大图作品集时需要重新设计作品网格与项目详情。 | 使用其模板仓库与 README |
| 43 | [AstroWind](https://github.com/arthelokyo/astrowind) | MIT | 替代起点 | 多页面模板；Astro + Tailwind | 有首页、介绍、联系与内容页的个人网站。 | 原 onwidget/astrowind 地址现跳转至 arthelokyo/astrowind；按当前 README 配置。 | 使用其模板仓库与 README |
| 44 | [Starlight](https://github.com/withastro/starlight) | MIT | 替代起点 | 文档框架；Astro | 设计方法库、软件学习手册、研究资料库。 | 更适合目录和文档阅读；视觉作品集首页通常需要单独设计。 | npm create astro@latest -- --template starlight |

## 三种可以实际搭配的路线

| 网站目标 | 组合 | 先完成什么 |
| --- | --- | --- |
| 环境设计作品集 | Astro + Tailwind + Lucide + Markdown / MDX + PhotoSwipe；Pagefind 后加 | 让项目故事、大图和手机阅读先成立 |
| 带少量互动的作品集 | 上述组合 + img-comparison-slider + model-viewer / Leaflet，按项目选择 | 把互动用于解释方案变化和空间关系 |
| 有账号或数据操作的个人应用 | Next.js + Tailwind + shadcn/ui + React Hook Form + Zod + Supabase；next-intl 按需 | 明确谁登录、保存什么数据、服务端如何处理 |

第三条路线若采用 Supabase Auth，通常无需同时加入 Better Auth；只有要另建认证体系时才考虑后者。

## 常见的重复与兼容问题

1. Astro 与 Next.js：选一个整站框架，不需要为普通网站叠加两套。
2. Tailwind 与 shadcn/ui：可以搭配；shadcn 是可修改的组件源码，不是完整网站模板。
3. shadcn/ui 与 daisyUI：可以技术上混用，但初期建议选一套基础视觉体系，便于控制样式和依赖。
4. Motion 与 GSAP：并非绝对不能共存；初期优先选一个动画系统，同一元素避免由两套系统同时控制。
5. PhotoSwipe 与 OpenSeadragon：前者解决常规相册放大；后者更适合超大图深度缩放，不必每张图都接入后者。
6. model-viewer 与 Three.js：前者适合现有 glTF / GLB 模型查看；后者适合自定义场景。先判断是否真的需要完整三维开发。
7. Leaflet 与 MapLibre：按 2D 标注与矢量地图等实际需求选择；它们并不自动提供所有底图和场地数据。
8. 原生能力与额外依赖：图片优化、语言路由、普通表单、CSS 网格和简单 PDF 嵌入，先确认框架 / 浏览器已有能力。
9. React 组件与 Astro：安装 @astrojs/react 后，交互组件仍需要合适的客户端指令（例如 client:visible 或 client:load）。服务端输出静态 HTML 并不自动激活交互。
10. npm 包与 GitHub 仓库：普通功能库通常用包管理器安装；整站模板才需要以模板仓库为起点。无需把每个库的源码仓库全部克隆进网站。

## 许可证和费用应怎样理解

- MIT、ISC、BSD、Apache 等项目许可不同；保留所用代码要求的版权与许可说明。
- React Bits 的 MIT + Commons Clause 限制组件本身的销售、再许可和再分发；使用在自己网站中与转售组件不是同一件事。
- GSAP 当前可免费使用，采用 GSAP Standard License；不要误写为 MIT。
- Resend 的 SDK 开源，不代表邮件发送服务无额度或费用限制。
- Supabase 主仓库的许可与其各 SDK、依赖组件和托管服务费用应分开看。
- Plausible CE 服务端采用 AGPL，嵌入网站的 JavaScript tracker 为 MIT；托管产品与自部署是不同使用方式。
- React Bits Pro、Magic UI 的付费产品、Motion+ 等扩展，不应直接当成公开仓库免费内容。

## 环境设计作品页该优先实现的阅读体验

一页项目建议按“问题与约束 → 调研证据 → 设计决策 → 方案与细节 → 迭代 / 验证”组织。

图像保留清楚的说明、单位、比例与出处；手机上能读图中的文字；重要平剖面有大图入口。地图、对比滑块和三维查看应帮助读者理解设计，而不是仅增加首页装饰。

## 官方文档补充

- [Astro 图片优化](https://docs.astro.build/en/guides/images/)
- [Astro 国际化路由](https://docs.astro.build/en/guides/internationalization/)
- [Astro React 集成](https://docs.astro.build/en/guides/integrations-guide/react/)
- [Astro 官方 Portfolio 模板页面](https://astro.build/themes/details/portfolio/)
- [PhotoSwipe 文档](https://photoswipe.com/)
- [OpenSeadragon 文档](https://openseadragon.github.io/)
- [model-viewer 文档与编辑器](https://modelviewer.dev/)
- [Pagefind 文档](https://pagefind.app/)
- [GSAP 当前标准许可](https://gsap.com/community/standard-license/)
- [React Bits LICENSE](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md)
- [Plausible 仓库与许可说明](https://github.com/plausible/analytics)

