# Cloudflare 免费独立部署

这个部署目标使用自己的 Cloudflare Workers、D1 和已有 Supabase 邮箱认证。访问和邮箱登录不依赖 ChatGPT。`workers.dev` 是平台提供的免费子域名；无需注册付费域名。使用量受 Workers Free 和 D1 Free 额度限制。

## 从 GitHub 创建

在 Cloudflare 的 **Workers & Pages → Create application → Continue with GitHub** 中授权自己的仓库。下面以包含本项目的仓库为例：

| 字段 | 值 |
| --- | --- |
| Git 仓库 | `website` |
| 部署分支 | `cloudflare-deploy` |
| 根目录 / Root directory | `ielts-seven` |
| Worker 名称 / Project name | `xunci-ielts` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy` |

如果使用完整项目的独立仓库，根目录留空。保持 Free 方案。

展开构建环境变量配置，添加以下三项。优先选择 Secret 类型；若创建页面仅提供环境变量，创建后可在 **Settings → Build → Variables and secrets** 中管理。这里的值在构建时可用，部署脚本会通过 Wrangler 的 `--secrets-file` 同时写入 Worker 的运行时 Secrets，因此无需再填一遍。

| 名称 | 内容 |
| --- | --- |
| `SUPABASE_URL` | 已有 Supabase 项目的 HTTPS 地址 |
| `SUPABASE_PUBLISHABLE_KEY` | 同一项目以 `sb_publishable_` 开头的有效 Publishable Key |
| `SESSION_ENCRYPTION_KEY` | 新生成的 32 字节随机值的 Base64 编码 |

会话密钥只生成一次，后续部署沿用。可在自己的电脑上用 `openssl rand -base64 32` 生成。密钥只填 Cloudflare，不写进 Git 仓库。邮箱认证的固定开关由独立部署适配器强制启用。

点击部署后，脚本按顺序执行：读取现有 D1 清单 → 必要时创建 `xunci-ielts-db` → 执行追加迁移 → 构建并发布 Worker。数据库查询失败时停止；迁移失败时不会发布新程序。后续部署复用已有数据库。这个过程不删除已有数据库，也不修改旧站。

部署成功后，Cloudflare 提供形如 `https://xunci-ielts.<账号子域>.workers.dev` 的地址。新地址以 Cloudflare 实际返回的结果为准。

## 允许新网址接收登录链接

在 Supabase **Authentication → URL Configuration → Redirect URLs** 中添加实际新网址的根地址，带末尾 `/`，然后保存，例如：

```text
https://xunci-ielts.<账号子域>.workers.dev/
```

迁移期间保留原 Site URL 和原站允许的地址。新站发送登录请求时会使用自己的根地址作为 `redirect_to`。未允许该地址时，邮件可能跳回旧站，无法使用新站浏览器中的 PKCE 登录凭据。无需编辑邮件模板。

新站发送登录邮件后，在发起请求的同一浏览器打开邮件链接。Supabase 默认邮件服务仍受项目成员邮箱及发信额度限制；独立域名不会改变这些规则。

## 迁移个人学习记录

1. 在旧站 **数据与设置 → 完整进度备份 → 下载 JSON 备份**，保留文件。
2. 在新站用邮箱登录。
3. 在新站 **数据与设置 → 恢复备份** 中选择刚才的文件，核对后明确确认恢复。
4. 等待云端同步成功，核对词汇数量、真实作答、接触记录和阅读历史。

不同网址的浏览器存储不共享。新数据库不会自动读取旧站数据，也不会因为邮箱相同就合并旧账号。已有备份保留原始学习证据；恢复是明确操作，不重算掌握状态或复习次数。需要多账号搬迁时，分别由各账号导出和恢复。

独立目标会移除原登录入口、删除客户端传来的 `oai-*` 身份头，并关闭依赖 Sites 网关身份的 MCP 发布入口。旧站的每日发布任务仍写入旧数据库；新站可使用现有“导入课程 JSON”功能，自动日更需要另外连接独立发布方式。

## 本地验证

```sh
npm ci
npm test
npm run build:cloudflare
npx wrangler deploy --dry-run
```

`npm run build` 仍用于原 Sites 构建。独立目标输出 `.cloudflare/worker.mjs`，是包含静态资产的完整 Worker ESM；Wrangler 使用 `no_bundle` 避免再次解析浏览器与 Node 共享的 UMD 模块。

参考：[Workers 免费额度](https://developers.cloudflare.com/workers/platform/pricing/)、[D1 免费额度](https://developers.cloudflare.com/d1/platform/pricing/)、[Workers 构建](https://developers.cloudflare.com/workers/ci-cd/builds/)、[Wrangler Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[Supabase 邮件登录](https://supabase.com/docs/guides/auth/auth-email-passwordless)。
