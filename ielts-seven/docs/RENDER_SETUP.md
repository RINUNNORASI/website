# Render 免费运行

这个目标在 Render 的免费 Node Web Service 上运行完整网站，继续使用原 Cloudflare D1 和 Supabase 邮箱认证。无需购买域名。先验证自己的 `onrender.com` 地址在实际使用的网络上可访问，再接入完整网站；某一个地址能打开不代表所有地区都稳定可达。

## 先验证连接

`scripts/render-probe.mjs` 是独立的连接测试页面，不读取账号、密钥或学习记录。多项目仓库可将 `scripts/render-probe.yaml` 放在仓库根目录并命名为 `render.yaml`，通过 Render 的 Deploy to Render 入口部署。

预设只有一个 `plan: free` 的 Node Web Service。打开生成的地址，等待出现“连接测试通过”。

## 连接完整网站

在同一个 Render 服务的 **Environment** 中配置下列五项。可以通过 **Add from .env** 批量添加；值只写进 Render，不提交到 GitHub。保留原会话密钥。

| 名称 | 内容 |
| --- | --- |
| `SUPABASE_URL` | 原 Supabase 项目的 HTTPS 地址 |
| `SUPABASE_PUBLISHABLE_KEY` | 同一项目的有效 `sb_publishable_` 密钥 |
| `SESSION_ENCRYPTION_KEY` | 原 Cloudflare 网站使用的 32 字节 Base64 会话密钥 |
| `CLOUDFLARE_ACCOUNT_ID` | 原 D1 所属 Cloudflare 账号的 32 位 ID |
| `CLOUDFLARE_D1_API_TOKEN` | 专用 API 令牌，仅 Account → D1 → Edit，账号范围限定为上述账号 |

无需手动查找 Database ID。服务会在指定账号内按名称 `xunci-ielts-db` 查询已有数据库，只在恰好找到一个有效匹配项时继续。查询不会创建数据库。名称不同时可设置 `D1_DATABASE_NAME`；也可以用可选的 `D1_DATABASE_ID` 明确指定原数据库 UUID，填写无效 ID 时会报错，不会自动改连其他数据库。

D1 Edit 是账号级权限，数据库名称或 ID 不会将令牌权限限制在单个数据库。不要使用拥有额外部署或账号管理权限的令牌。

保存环境变量后，使用以下完整站配置：

| 字段 | 值 |
| --- | --- |
| 类型 | Node Web Service |
| 方案 | Free |
| 仓库 | 包含本项目的仓库 |
| 分支 | `codex/render-access-test` |
| 根目录 | `ielts-seven` |
| Build command | `node scripts/build-worker.mjs --cloudflare && node scripts/verify-render.mjs` |
| Start command | `node scripts/serve-render.mjs` |
| Health check path | `/health` |

多项目仓库可以在环境变量准备好后，将 `scripts/render-full.yaml` 复制为仓库根目录的 `render.yaml`，再在原 Blueprint 中同步配置。已有服务新增的 `sync: false` 环境变量仍需通过 Environment 手动填写。使用同一个服务可以保留已经测试过的访问地址。

构建先生成完整网站，再检查 Supabase 邮箱认证配置和 D1 连接。数据库检查只读取应用表结构，并创建随机命名的隔离校验表，验证数值参数、整数列里的时间戳和大版本号、条件更新、返回值和批量事务回滚，最后删除校验表。D1 REST 可以把传入的整数绑定为 SQLite REAL；校验允许这种数值类型，但仍要求整数列保存的值、比较与版本更新准确。它不读取、删除或改写个人学习记录，也不执行 Cloudflare 部署或重建数据库。校验失败则构建失败。

Node 服务使用 Render 提供的 `RENDER_EXTERNAL_URL` 作为公开 HTTPS 地址。通常无需手动添加；自定义入口时可通过 `PUBLIC_ORIGIN` 显式指定根地址。客户端提供的转发域名和 IP 头不作为可信身份依据。

## 验证邮箱与学习记录

在 Supabase **Authentication → URL Configuration → Redirect URLs → Add URL** 添加实际 Render 根地址，保留末尾 `/`，然后点 **Save URLs**：

```text
https://<服务名>.onrender.com/
```

在 Render 网站点“邮箱登录”，发送登录链接，在发起登录的同一浏览器打开。Supabase 默认邮件仍受项目成员邮箱与发信额度限制；需在实际使用的网络上验证整个登录过程。

Render 与原 Cloudflare 网站使用同一 D1 和 Supabase 项目。同一邮箱账号已经同步到该 D1 的进度可在重新登录后继续读取。不同域名的浏览器 Cookie 和本地记录彼此独立。

原 Sites 网站使用的是另一个数据库。如果进度仍在原 Sites 网站，先通过 **数据与设置 → 完整进度备份 → 下载 JSON 备份** 导出，在 Render 登录后恢复备份，等待“已同步”，再刷新核对词汇、真实作答与学习轨迹。

## 免费运行的边界

Render Free 闲置 15 分钟后休眠，下一次打开可能需要约一分钟唤醒。遵守免费额度，避免选择付费实例。未添加付款方式时，流量等免费额度耗尽会暂停服务。

本目标不将进度存入 Render 的临时本地磁盘，也不创建会在 30 天后过期的免费 Render Postgres。D1 REST 请求受 Cloudflare 管理 API 限额约束；多个查询会增加登录和同步的往返时间，适合先以个人用量验证。

参考：[Render Free](https://render.com/docs/free)、[Blueprint 配置](https://render.com/docs/blueprint-spec)、[D1 REST API](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)、[D1 API 令牌](https://developers.cloudflare.com/d1/tutorials/import-to-d1-with-rest-api/)。
