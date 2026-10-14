# 个人网站 / Personal website

以 Astro 为基础的个人网站工程，适合环境设计作品集、设计研究与中英双语内容。

## 已接入的工具

| 工具 | 实际接入位置 |
| --- | --- |
| Astro | 静态页面、中英路由与内容集合 |
| Tailwind CSS | Vite 插件、全局样式与响应式图库 |
| Lucide | 导航、外链、阅读和大图图标，使用 Astro 原生包 |
| MDX | 中英文示例笔记及动态笔记页面 |
| PhotoSwipe | 首页示例图库，可点击查看大图 |
| Motion | 页面元素进入视口的轻量动画；尊重减少动态效果设置 |
| Pagefind | 构建后生成中英搜索索引与搜索页面 |

完整的 44 项 GitHub 参考项目、许可、适配关系与扩展建议见 [docs/github-toolkit.md](docs/github-toolkit.md)。其他框架、服务平台和可选功能保留为选型参考，没有作为未使用的依赖全部安装。

## 本地运行

使用 Node.js 22.12 或更新版本（建议 Node.js 24）。

~~~sh
npm install
npm run dev
~~~

开发网址以终端输出为准。默认首页进入中文页面，也可访问 /en/。

~~~sh
npm run check
npm run build
npm run verify:build
npm run preview
~~~

Pagefind 索引在 build 阶段生成，因此请在构建后的 preview 中测试搜索。

## 替换成自己的内容

- src/lib/site.ts：站点文字、中英文导航和介绍。
- src/pages/[lang]/index.astro：首页作品结构。
- src/pages/[lang]/about.astro：个人介绍；目前是明确标注的占位内容。
- src/content/notes/zh 与 en：新增 MDX 笔记。相同文章使用相同 slug，语言切换会保留阅读位置。
- public/images：放入自己的图片，并在图库中填写真实宽高与替代文字。
- src/styles/global.css：调整颜色、字体与间距。

示例平面、剖面 SVG 只用于演示图库交互，不代表你的真实项目或设计成果。

## 部署配置

本次只加入代码与构建检查，没有配置或启用网站发布。

默认 BASE_PATH 为 /，适合部署在域名根路径。如果使用 GitHub Pages 的项目路径，将 BASE_PATH 设为 /website。SITE_URL 用于配置正式域名与 canonical URL；样例见 .env.example。

GitHub Actions 会检查默认路径和 /website 两种构建。当前未提供依赖锁文件；首次成功安装后，将生成的 package-lock.json 提交到仓库，并可将 CI 安装步骤改为 npm ci。

## 后续扩展

按具体项目需要加入方案对比、场地地图或模型查看。参考 [docs/integration-notes.md](docs/integration-notes.md)，不要同时叠加多套整站框架。

保留所用依赖要求的版权与许可说明。依赖自身的许可证不改变你的作品与图片的使用权。
