# 开启独立邮箱登录

本目录提供 Supabase 默认邮件登录链接（Magic Link + PKCE），自定义 SMTP 配好模板后也可选择验证码。学习数据保存在部署者的 D1 数据库。是否可用以实际部署和验证为准；本公开模板不代表任何实例已启用邮箱或成功发送真实邮件。认证会话由网站后端处理，浏览器只持有 HttpOnly 会话 Cookie。

## 配置自己的认证项目

在 [Supabase 控制台](https://supabase.com/dashboard)选择或创建自己的项目。在 Authentication → URL Configuration 中，将 Site URL 设置为你的网站正式 HTTPS 地址，例如：

```text
https://your-study-site.example
```

默认邮件模板可保持原样。新 Free 项目使用默认 SMTP 时不能编辑认证模板，因此默认方式使用带 PKCE 的登录链接；以后配置自定义 SMTP 后，也可选择验证码方式。

Supabase 默认发信只允许项目组织成员邮箱，并有较低的小时限额；公开源码不表示所有邮箱都可以使用。其他邮箱的送达需要配置自己的发信服务。实际设置和真实邮件送达须由部署者验证。

## 使用邮箱登录

1. 在网站点击“邮箱账号”，输入自己的邮箱，发送登录链接。
2. 打开邮件并点击 **Sign in**。必须在发起请求的同一浏览器打开链接；如果邮箱默认打开了其他浏览器，可以复制链接到原浏览器。
3. 登录后选择是否迁移旧账号的学习记录。新设备后续可以直接使用邮箱。

登录链接单次使用，失效或换浏览器时重新获取。网站不保存你的邮箱密码。

## 网站运行配置

以下实际值保存在 Sites 运行环境中，不写入浏览器、源码或 GitHub；`.env.example` 只提供空值模板：

| 配置 | 内容 |
| --- | --- |
| `SUPABASE_URL` | 当前项目的 HTTPS URL |
| `SUPABASE_PUBLISHABLE_KEY` | 项目公开 Publishable Key；不使用 service_role |
| `SESSION_ENCRYPTION_KEY` | 32 字节随机密钥的 Base64；用于加密认证令牌，网站部署者配置 |
| `EMAIL_AUTH_ENABLED` | 配置完成后设为 `1`；准备期间保持 `0` |
| `EMAIL_AUTH_METHOD` | 默认邮件使用 `magic-link`；自定义 SMTP 配好验证码模板后可用 `otp` |

部署自己的副本时，准备期间开关保持 `0`，原登录方式继续可用，邮箱入口显示待启用。全部配置完成后设为 `1`，日常登录改用邮箱邮件链接；启用后配置错误会暂停同步，不会改回 GPT 身份。本机进度保留。

## 保留原学习记录

首次邮箱登录时，如果当前浏览器也已经登录原 ChatGPT 账号，网站会提供“迁移旧账号记录”。需要明确确认后才绑定；只凭两个账号的邮箱相同不会自动合并。

迁移沿用原学习账号和记录，不重算作答、接触次数或复习日期。新邮箱账号如果已有记录，网站会阻止覆盖并提供双方备份；用户可以保留新账号或通过现有备份恢复功能自行选择。跳过迁移后，原账号的云端记录继续保留。

配置启用后，新设备可以直接使用邮箱登录链接。原 ChatGPT 登录只用于证明旧记录的归属，后续学习不需要重复使用。

## 验证范围

自动化测试使用独立测试账号和模拟认证服务，检查发送限流、PKCE 浏览器绑定、一次性登录链接、错误验证码、身份验证、会话刷新和退出、账号隔离、跨站请求拒绝，以及旧记录迁移并发保护。真实邮件送达和 Supabase 项目设置必须在项目创建后验证。

参考：[Supabase 邮箱 OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)、[SMTP 限制](https://supabase.com/docs/guides/auth/auth-smtp)、[项目 API 密钥](https://supabase.com/docs/guides/getting-started/api-keys)。
