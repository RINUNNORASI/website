# 开启独立邮箱登录

网站已准备好 Supabase 邮箱验证码认证，学习数据继续保存在现有 D1 数据库。登录时不需要 GPT 账号。认证会话由网站后端处理，浏览器只持有 HttpOnly 会话 Cookie。

## 已连接的认证项目

当前网站使用 Supabase 的 `IELTS` 免费项目。项目地址和 Publishable Key 已配置进网站运行环境，认证密钥不会进入源码或 GitHub。数据库密码不需要交给网站或聊天。

在 [URL Configuration](https://supabase.com/dashboard/project/vowqqwcxomjlhdcypqxv/auth/url-configuration) 将 Site URL 设置为：

```text
https://ielts-seven-study-journey.mellowflea128.chatgpt.site
```

该设置已由用户确认保存。邮件模板保持默认即可。新 Free 项目使用默认 SMTP 时不能编辑模板，因此网站采用带 PKCE 的邮件登录链接；以后配置自定义 SMTP 后，也可选择验证码方式。

Supabase 默认发信只允许项目组织成员邮箱，并有较低的小时限额。先使用你注册 Supabase 时的邮箱登录；其他用户的邮箱需要在 Authentication → SMTP Settings 配置自己的发信服务。

## 使用邮箱登录

1. 在网站点击“邮箱账号”，输入自己的邮箱，发送登录链接。
2. 在希望登录的浏览器打开最新邮件中的 **Sign in**。新链接支持其他浏览器和设备；核对网站显示的邮箱后，点击“确认登录”。会话只创建在完成确认的浏览器。
3. 不同浏览器需要分别登录同一邮箱，个人记录再由共同云端同步。登录后如果出现旧账号迁移选项，应核对归属后明确选择。

登录链接单次使用，过期或已经使用时需要重新发送。改版前的旧链接仍可能要求原浏览器；重新发信即可使用新版跨浏览器流程。网站不保存你的邮箱密码。

## 网站运行配置

以下配置保存在 Sites 运行环境中，不写入浏览器、源码或 GitHub：

| 配置 | 内容 |
| --- | --- |
| `SUPABASE_URL` | 当前项目的 HTTPS URL |
| `SUPABASE_PUBLISHABLE_KEY` | 项目公开 Publishable Key；不使用 service_role |
| `SESSION_ENCRYPTION_KEY` | 32 字节随机密钥的 Base64；用于加密认证令牌，网站部署者配置 |
| `EMAIL_AUTH_ENABLED` | 配置完成后设为 `1`；准备期间保持 `0` |
| `EMAIL_AUTH_METHOD` | 默认邮件使用 `magic-link`；自定义 SMTP 配好验证码模板后可用 `otp` |

准备期间开关为 `0`，原登录方式继续可用，邮箱入口显示待启用。全部配置完成后设为 `1`，日常登录改用邮箱邮件链接；启用后配置错误会暂停同步，不会改回 GPT 身份。本机进度保留。

## 保留原学习记录

首次邮箱登录时，如果当前浏览器也已经登录原 ChatGPT 账号，网站会提供“迁移旧账号记录”。需要明确确认后才绑定；只凭两个账号的邮箱相同不会自动合并。

迁移沿用原学习账号和记录，不重算作答、接触次数或复习日期。新邮箱账号如果已有记录，网站会阻止覆盖并提供双方备份；用户可以保留新账号或通过现有备份恢复功能自行选择。跳过迁移后，原账号的云端记录继续保留。

新设备可以直接使用邮箱验证码。原 ChatGPT 登录只用于证明旧记录的归属，后续学习不需要重复使用。

## 验证范围

自动化测试使用独立测试账号和模拟认证服务，检查发送限流、PKCE 与一次性链接、跨浏览器显式确认、错误验证码、身份验证、会话刷新和退出、账号隔离、跨站请求拒绝，以及旧记录迁移并发保护。真实邮件送达及邮箱内置浏览器行为不由这些模拟测试证明。

参考：[Supabase 邮箱 OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)、[SMTP 限制](https://supabase.com/docs/guides/auth/auth-smtp)、[项目 API 密钥](https://supabase.com/docs/guides/getting-started/api-keys)。
