(function (root) {
  'use strict';

  const EMPTY_MIGRATION = {pending: false, legacyAvailable: false, legacyRecordCount: 0, emailRecordCount: 0};
  const ERRORS = {
    invalid_email: '请输入有效的邮箱地址。',
    invalid_otp: '请输入邮件中的六位验证码。',
    invalid_or_expired_otp: '验证码不正确或已过期，请重新获取。',
    rate_limited: '获取验证码太频繁，请稍后再试。',
    email_delivery_unavailable: '暂时无法发送邮件，请稍后重试。',
    auth_provider_unavailable: '登录服务暂时无法连接，请稍后重试。',
    storage_unavailable: '暂时无法读取账号记录，请稍后重试。',
    authentication_required: '登录已过期，请重新登录。',
    session_invalid: '登录已过期，请重新登录。',
    legacy_authentication_required: '请先登录旧账号，再迁移学习记录。',
    explicit_confirmation_required: '请确认要迁移旧账号的学习记录。',
    legacy_link_conflict: '两个账号都有学习记录，无法直接迁移。你可以先下载双方备份，再使用邮箱账号。',
    email_auth_not_configured: '邮箱登录尚未启用，请稍后再试。',
    email_auth_misconfigured: '邮箱登录配置尚未完成，请联系管理员。',
    session_refresh_in_progress: '账号正在重新连接，请稍后重试。',
    forbidden: '这次操作未通过验证，请刷新后重试。'
  };
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const copy = value => JSON.parse(JSON.stringify(value));
  const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const recordCount = value => Number.isInteger(value) && value >= 0 ? value : 0;

  function create(options) {
    options = options || {};
    let state = {status: 'loading', enabled: false, authenticated: false, user: null, loginMethod: 'otp', sessionStartedAt: null,
      migration: copy(EMPTY_MIGRATION), message: '', busy: false};
    let dialog, phase = 'email', email = '', token = '', message = '', messageKind = '', initialized = false;
    let initTask, migrationWaiter, paused = false, conflict = false, confirmed = false, countdownTimer, completedChanges = 0;
    let linkPollTimer, linkPollGeneration = 0, linkBaseline;
    const resendDeadlines = new Map();

    function notify(status, text) {
      state.status = status;
      state.message = text || '';
      if (typeof options.onStatus === 'function') options.onStatus(copy(state));
    }
    function session(data) {
      if (!data || typeof data !== 'object' || typeof data.authenticated !== 'boolean') {
        throw new Error('暂时无法确认登录状态，请刷新后重试。');
      }
      if (data.authenticated && (!data.user || typeof data.user.id !== 'string' || typeof data.user.email !== 'string')) {
        throw new Error('暂时无法确认登录状态，请刷新后重试。');
      }
      const migration = data.migration || EMPTY_MIGRATION;
      state.enabled = data.enabled === undefined ? state.enabled : data.enabled === true;
      state.authenticated = data.authenticated;
      state.user = data.authenticated ? {id: data.user.id, email: data.user.email} : null;
      state.sessionStartedAt = data.authenticated && typeof data.sessionStartedAt === 'string' ? data.sessionStartedAt : null;
      state.migration = {pending: data.authenticated && migration.pending === true,
        legacyAvailable: migration.legacyAvailable === true,
        legacyRecordCount: recordCount(migration.legacyRecordCount),
        emailRecordCount: recordCount(migration.emailRecordCount)};
      return copy(state);
    }
    async function request(path, body) {
      const controller = new root.AbortController();
      const timer = root.setTimeout(() => controller.abort(), 15000);
      try {
        const response = await root.fetch('/api/auth/' + path, {method: body === undefined ? 'GET' : 'POST',
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
          headers: body === undefined ? {'Accept': 'application/json'} : {'Accept': 'application/json', 'Content-Type': 'application/json'},
          ...(body === undefined ? {} : {body: JSON.stringify(body)})});
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const code = typeof data.error === 'string' ? data.error : data.error && data.error.code;
          const error = new Error(ERRORS[code] || (response.status === 429 ? ERRORS.rate_limited : '这次操作未完成，请稍后重试。'));
          error.code = code;
          error.status = response.status;
          error.retryAfterSeconds = data.retryAfterSeconds;
          error.migration = data.migration;
          throw error;
        }
        return data;
      } catch (error) {
        if (error && error.name === 'AbortError') throw new Error('连接超时，请检查网络后重试。');
        if (error instanceof TypeError) throw new Error('暂时无法连接，请检查网络后重试。');
        throw error;
      } finally {
        root.clearTimeout(timer);
      }
    }
    async function beforeChange(reason) {
      if (typeof options.onBeforeChange === 'function') await options.onBeforeChange({reason, user: copy(state.user)});
      paused = true;
    }
    function stopCountdown() {
      if (countdownTimer !== undefined) root.clearInterval(countdownTimer);
      countdownTimer = undefined;
    }
    function stopLinkPoll() {
      linkPollGeneration++;
      if (linkPollTimer !== undefined) root.clearTimeout(linkPollTimer);
      linkPollTimer = undefined;
    }
    function startLinkPoll() {
      const generation = linkPollGeneration;
      const active = () => generation === linkPollGeneration && phase === 'link-sent' && dialog && dialog.open;
      async function check() {
        if (!active()) return;
        if (!state.busy) {
          try {
            const fresh = await request('session');
            if (!active()) return;
            const renewed = linkBaseline && (!linkBaseline.authenticated ||
              (fresh.user && fresh.user.id) !== linkBaseline.userId ||
              (typeof fresh.sessionStartedAt === 'string' && fresh.sessionStartedAt !== linkBaseline.sessionStartedAt));
            if (renewed && fresh.authenticated && fresh.user && typeof fresh.user.email === 'string' && fresh.user.email.toLowerCase() === email) {
              session(fresh);
              if (state.migration.pending) {
                confirmed = false; conflict = false;
                clearMessage();
                notify('migration', '请选择旧记录的处理方式');
                show('migration');
              } else await finish('login');
              return;
            }
          } catch (_) {
            // A failed status check leaves the current account and local records unchanged.
          }
        }
        if (active()) linkPollTimer = root.setTimeout(check, 3000);
      }
      linkPollTimer = root.setTimeout(check, 3000);
    }
    function remaining() {
      return Math.max(0, Math.ceil(((resendDeadlines.get(email) || 0) - Date.now()) / 1000));
    }
    function waitToResend(seconds) {
      const delay = Number.isFinite(+seconds) && +seconds > 0 ? Math.min(3600, Math.ceil(+seconds)) : 60;
      resendDeadlines.set(email, Date.now() + delay * 1000);
    }
    function updateButtons() {
      if (!dialog) return;
      const send = dialog.querySelector('#email-auth-send');
      const verify = dialog.querySelector('#email-auth-verify');
      const resend = dialog.querySelector('#email-auth-resend');
      const link = dialog.querySelector('#email-auth-link');
      if (send) {
        const seconds = remaining();
        send.disabled = state.busy || !validEmail(email) || seconds > 0;
        send.textContent = state.busy ? '正在发送…' : seconds ? seconds + (state.loginMethod === 'magic-link' ? ' 秒后重新发送' : ' 秒后重新获取') :
          state.loginMethod === 'magic-link' ? '发送登录链接' : '获取验证码';
      }
      if (verify) verify.disabled = state.busy || !/^\d{6}$/.test(token);
      if (link) link.disabled = state.busy || !confirmed || !state.migration.legacyAvailable || conflict;
      if (resend) {
        const seconds = remaining();
        resend.disabled = state.busy || seconds > 0;
        resend.textContent = seconds ? seconds + (phase === 'link-sent' ? ' 秒后重新发送' : ' 秒后重新获取') :
          phase === 'link-sent' ? '重新发送登录链接' : '重新获取验证码';
      }
    }
    function ensureDialog() {
      if (dialog) return dialog;
      dialog = root.document.getElementById('email-auth-dialog');
      if (!dialog) {
        dialog = root.document.createElement('dialog');
        dialog.id = 'email-auth-dialog';
        root.document.body.appendChild(dialog);
      }
      dialog.classList.add('email-auth-dialog');
      dialog.setAttribute('aria-labelledby', 'email-auth-title');
      dialog.addEventListener('cancel', event => {
        event.preventDefault();
        void close();
      });
      dialog.addEventListener('click', async event => {
        const action = event.target.closest('[data-auth-action]');
        if (!action || action.disabled) return;
        event.preventDefault();
        const name = action.dataset.authAction;
        if (name === 'close') await close();
        else if (name === 'change-email') {phase = 'email'; token = ''; clearMessage(); render();}
        else if (name === 'resend') await sendCode();
        else if (name === 'logout') await logout();
        else if (name === 'switch') {phase = 'email'; token = ''; email = ''; clearMessage(); render();}
        else if (name === 'link') await resolveMigration('link');
        else if (name === 'skip') {phase = 'skip-confirm'; clearMessage(); render();}
        else if (name === 'confirm-skip') await resolveMigration('skip');
        else if (name === 'back') {phase = 'migration'; clearMessage(); render();}
        else if (name === 'backups') await downloadBackups();
        else if (name === 'retry') {
          const previousChanges = completedChanges;
          initTask = undefined; initialized = false; clearMessage();
          await open();
          if (initialized && state.status !== 'error' && !state.migration.pending && completedChanges === previousChanges &&
              typeof options.onChange === 'function') {
            await options.onChange({reason: 'retry', user: copy(state.user)});
          }
        }
      });
      dialog.addEventListener('submit', async event => {
        const form = event.target.closest('[data-auth-form]');
        if (!form) return;
        event.preventDefault();
        if (form.dataset.authForm === 'email') await sendCode();
        else if (form.dataset.authForm === 'code') await verifyCode();
      });
      dialog.addEventListener('input', event => {
        if (event.target.id === 'email-auth-email') email = event.target.value.trim().toLowerCase();
        else if (event.target.id === 'email-auth-code') token = event.target.value.trim();
        updateButtons();
      });
      dialog.addEventListener('change', event => {
        if (event.target.id === 'email-auth-confirm') {confirmed = event.target.checked; updateButtons();}
      });
      return dialog;
    }
    function clearMessage() {message = ''; messageKind = '';}
    function showMessage(text, kind) {message = text; messageKind = kind || 'error';}
    function render() {
      ensureDialog();
      stopCountdown();
      stopLinkPoll();
      const disabled = state.busy ? ' disabled' : '';
      let title = '邮箱登录', intro = state.loginMethod === 'magic-link' ? '用邮箱接收登录链接，继续你的学习。' : '用邮箱接收验证码，继续你的学习。', content = '';
      if (phase === 'disabled') {
        title = '邮箱登录尚未启用';
        intro = '启用后，你可以用邮箱登录并同步学习记录。';
        content = '<button type="button" class="email-auth-primary" data-auth-action="close">知道了</button>';
      } else if (phase === 'error') {
        title = '暂时无法连接'; intro = '请检查网络后重试。';
        content = '<button type="button" class="email-auth-primary" data-auth-action="retry">重新连接</button>';
      } else if (phase === 'account') {
        title = '你的账号'; intro = '学习记录会同步到此邮箱账号。';
        content = '<div class="email-auth-account"><span>登录邮箱</span><strong>' + escape(state.user && state.user.email) + '</strong></div>' +
          '<div class="email-auth-actions"><button type="button" class="email-auth-primary" data-auth-action="switch"' + disabled + '>更换邮箱</button>' +
          '<button type="button" class="email-auth-secondary" data-auth-action="logout"' + disabled + '>退出登录</button></div>';
      } else if (phase === 'migration') {
        title = '带上你的学习记录'; intro = '邮箱已验证，请选择这个账号要使用的记录。';
        content = '<div class="email-auth-account"><span>新登录邮箱</span><strong>' + escape(state.user && state.user.email) + '</strong></div>' +
          '<div class="email-auth-records"><div><span>旧账号词汇</span><strong>' + state.migration.legacyRecordCount + '<small> 个</small></strong></div>' +
          '<div><span>邮箱账号词汇</span><strong>' + state.migration.emailRecordCount + '<small> 个</small></strong></div></div>' +
          (conflict ? '<p class="email-auth-note">两份记录会分别保留。下载备份后，你可以在数据设置中整理记录。</p>' :
            '<label class="email-auth-check"><input id="email-auth-confirm" type="checkbox"' + (confirmed ? ' checked' : '') + disabled +
            '><span>确认将旧账号的学习记录迁移到此邮箱</span></label>') +
          '<button id="email-auth-link" type="button" class="email-auth-primary" data-auth-action="link">迁移旧账号记录</button>' +
          '<button type="button" class="email-auth-secondary" data-auth-action="skip"' + disabled + '>使用新邮箱账号</button>' +
          '<button type="button" class="email-auth-text" data-auth-action="backups"' + disabled + '>下载双方备份</button>';
      } else if (phase === 'skip-confirm') {
        title = '使用邮箱账号的记录'; intro = '你将使用 ' + escape(state.user && state.user.email) + ' 的词库继续学习。';
        content = '<p class="email-auth-note">旧账号记录仍会保留。这次选择不会覆盖旧账号的学习记录。</p>' +
          '<button type="button" class="email-auth-primary" data-auth-action="confirm-skip"' + disabled + '>确认使用邮箱账号</button>' +
          '<button type="button" class="email-auth-secondary" data-auth-action="back"' + disabled + '>返回选择</button>';
      } else if (phase === 'link-sent') {
        title = '查看邮箱，完成登录';
        intro = '登录邮件已发送至 <strong>' + escape(email) + '</strong>。';
        content = '<p class="email-auth-note">点击邮件中的登录链接。请在发起登录的浏览器中打开链接。</p>' +
          '<p class="email-auth-note">完成后，账号会在这里自动连接。</p>' +
          '<div class="email-auth-code-actions"><button id="email-auth-resend" type="button" class="email-auth-text" data-auth-action="resend">重新发送登录链接</button>' +
          '<button type="button" class="email-auth-text" data-auth-action="change-email"' + disabled + '>更换邮箱</button></div>';
      } else if (phase === 'code') {
        title = '输入验证码'; intro = '验证码已发送至 <strong>' + escape(email) + '</strong>，请查看收件箱。';
        content = '<form data-auth-form="code"><label class="email-auth-field" for="email-auth-code">六位验证码</label>' +
          '<input id="email-auth-code" name="token" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code"' +
          ' required placeholder="000000" value="' + escape(token) + '"' + disabled + '>' +
          '<button id="email-auth-verify" type="submit" class="email-auth-primary">' + (state.busy ? '正在验证…' : '验证并登录') + '</button></form>' +
          '<div class="email-auth-code-actions"><button id="email-auth-resend" type="button" class="email-auth-text" data-auth-action="resend">重新获取验证码</button>' +
          '<button type="button" class="email-auth-text" data-auth-action="change-email"' + disabled + '>更换邮箱</button></div>';
      } else {
        content = '<form data-auth-form="email"><label class="email-auth-field" for="email-auth-email">邮箱地址</label>' +
          '<input id="email-auth-email" name="email" type="email" autocomplete="email" maxlength="254" required placeholder="name@example.com"' +
          ' value="' + escape(email) + '"' + disabled + '>' +
          '<button id="email-auth-send" type="submit" class="email-auth-primary">' + (state.busy ? '正在发送…' : '获取验证码') + '</button></form>';
      }
      dialog.innerHTML = '<button type="button" class="email-auth-close" data-auth-action="close" aria-label="关闭"' +
        (state.busy || state.migration.pending ? ' disabled' : '') + '>×</button><div class="email-auth-heading"><span class="email-auth-kicker">循词 · 学习账号</span>' +
        '<h2 id="email-auth-title" tabindex="-1">' + title + '</h2><p>' + intro + '</p></div>' + content +
        '<p id="email-auth-message" class="email-auth-message ' + (messageKind === 'success' ? 'success' : '') + '" role="status" aria-live="polite">' + escape(message) + '</p>';
      updateButtons();
      if (phase === 'code' || phase === 'email' || phase === 'link-sent') countdownTimer = root.setInterval(updateButtons, 1000);
      if (phase === 'link-sent') startLinkPoll();
    }
    function show(nextPhase) {
      phase = nextPhase || phase;
      render();
      if (!dialog.open) dialog.showModal();
      const target = dialog.querySelector(phase === 'code' ? '#email-auth-code' : phase === 'email' ? '#email-auth-email' : '#email-auth-title');
      if (target && typeof target.focus === 'function') target.focus();
    }
    async function close() {
      if (state.busy || state.migration.pending) return;
      stopLinkPoll();
      if (paused) {
        state.busy = true;
        try {session(await request('session'));}
        catch (error) {
          state.busy = false;
          showMessage(error.message);
          notify('error', error.message);
          render();
          return;
        }
        state.busy = false;
        if (state.migration.pending) {
          confirmed = false; conflict = false;
          notify('migration', '请选择旧记录的处理方式');
          show('migration');
          return;
        }
      }
      stopCountdown();
      if (dialog && dialog.open) dialog.close();
      if (paused) {
        paused = false;
        notify(state.authenticated ? 'signed-in' : state.enabled ? 'signed-out' : 'disabled');
        if (typeof options.onChange === 'function') await options.onChange({reason: 'cancel', user: copy(state.user)});
      }
    }
    function awaitMigration() {
      if (!migrationWaiter) {
        let resolve;
        const promise = new Promise(done => {resolve = done;});
        migrationWaiter = {promise, resolve};
      }
      return migrationWaiter.promise;
    }
    async function finish(reason) {
      state.busy = false;
      paused = false;
      clearMessage();
      stopCountdown();
      stopLinkPoll();
      if (dialog && dialog.open) dialog.close();
      notify(state.authenticated ? 'signed-in' : 'signed-out');
      completedChanges++;
      if (typeof options.onChange === 'function') await options.onChange({reason, user: copy(state.user)});
      if (migrationWaiter && !state.migration.pending) {
        const waiter = migrationWaiter;
        migrationWaiter = undefined;
        waiter.resolve(copy(state));
      }
    }
    async function init() {
      if (initTask) return initTask;
      initTask = (async () => {
        notify('loading');
        try {
          const config = await request('config');
          state.enabled = config.enabled === true;
          state.loginMethod = config.loginMethod === 'magic-link' ? 'magic-link' : 'otp';
          if (!state.enabled) {
            initialized = true;
            notify('disabled', '邮箱登录尚未启用');
            return copy(state);
          }
          session(await request('session'));
          initialized = true;
          if (state.migration.pending) {
            await beforeChange('migration');
            notify('migration', '请选择旧记录的处理方式');
            show('migration');
            return await awaitMigration();
          }
          notify(state.authenticated ? 'signed-in' : 'signed-out');
          return copy(state);
        } catch (error) {
          notify('error', error.message);
          throw error;
        }
      })();
      return initTask;
    }
    async function open() {
      if (state.busy || (dialog && dialog.open && ['email', 'code', 'link-sent', 'migration', 'skip-confirm'].includes(phase))) return;
      const wasInitialized = initialized;
      if (!initialized) {
        try {await init();} catch (error) {showMessage(error.message); show('error'); return;}
      }
      if (wasInitialized && state.enabled) {
        try {
          const fresh = await request('session');
          const changed = fresh.authenticated !== state.authenticated ||
            (fresh.user && fresh.user.id || null) !== (state.user && state.user.id || null);
          if (changed || (fresh.migration && fresh.migration.pending && !paused)) {
            await beforeChange(fresh.migration && fresh.migration.pending ? 'migration' : fresh.authenticated ? 'login' : 'logout');
          }
          session(fresh);
          if (changed && !state.migration.pending) await finish(state.authenticated ? 'login' : 'logout');
        } catch (error) {showMessage(error.message); notify('error', error.message); show('error'); return;}
      }
      if (state.migration.pending) {notify('migration', '请选择旧记录的处理方式'); show('migration'); return;}
      clearMessage();
      show(!state.enabled ? 'disabled' : state.authenticated ? 'account' : 'email');
    }
    async function sendCode() {
      if (state.busy || !state.enabled || !validEmail(email) || remaining() > 0) return;
      state.busy = true;
      clearMessage();
      const magicLink = state.loginMethod === 'magic-link';
      try {
        if (magicLink) {
          linkBaseline = {authenticated: state.authenticated, userId: state.user && state.user.id, sessionStartedAt: state.sessionStartedAt};
          await beforeChange('login');
        }
        notify('sending', magicLink ? '正在发送登录邮件' : '正在发送验证码'); render();
        const data = await request('otp', {email});
        if (data.sent !== true) throw new Error(magicLink ? '登录邮件未发送，请稍后重试。' : '验证码未发送，请稍后重试。');
        waitToResend(data.retryAfterSeconds);
        token = '';
        if (data.method === 'magic-link' || magicLink) {
          if (!magicLink) {
            linkBaseline = {authenticated: state.authenticated, userId: state.user && state.user.id, sessionStartedAt: state.sessionStartedAt};
            await beforeChange('login');
          }
          state.loginMethod = 'magic-link';
          phase = 'link-sent';
          notify('link-sent', '登录邮件已发送');
        } else {
          phase = 'code';
          notify('code-sent', '验证码已发送');
        }
      } catch (error) {
        if (error.retryAfterSeconds) waitToResend(error.retryAfterSeconds);
        showMessage(error.message);
        notify('error', error.message);
      } finally {
        state.busy = false; notify(state.status, state.message); render();
        const input = dialog.querySelector(phase === 'code' ? '#email-auth-code' : phase === 'link-sent' ? '#email-auth-title' : '#email-auth-email');
        if (input) input.focus();
      }
    }
    async function verifyCode() {
      if (state.busy || !/^\d{6}$/.test(token) || !validEmail(email)) return;
      state.busy = true;
      clearMessage();
      try {
        await beforeChange('login');
        notify('verifying', '正在验证邮箱'); render();
        session(await request('verify', {email, token}));
        token = '';
        if (!state.authenticated) throw new Error('邮箱验证未完成，请重新获取验证码。');
        if (state.migration.pending) {
          confirmed = false; conflict = false; phase = 'migration';
          notify('migration', '请选择旧记录的处理方式');
        } else await finish('login');
      } catch (error) {
        showMessage(error.message);
        notify('error', error.message);
      } finally {
        state.busy = false;
        notify(state.status, state.message);
        if (dialog && dialog.open) render();
      }
    }
    async function resolveMigration(choice) {
      if (state.busy || !state.migration.pending) return;
      if (choice === 'link' && (!confirmed || conflict || !state.migration.legacyAvailable)) return;
      state.busy = true;
      clearMessage();
      try {
        await beforeChange('migration');
        notify('migration', '正在保存你的选择'); render();
        session(await request('session'));
        if (!state.migration.pending && state.authenticated) {
          await finish('migration');
          return;
        }
        await request(choice === 'link' ? 'link-legacy' : 'skip-legacy', choice === 'link' ? {confirm: true} : {});
        session(await request('session'));
        if (state.migration.pending || !state.authenticated) throw new Error('账号选择尚未完成，请重试。');
        await finish('migration');
      } catch (error) {
        if (error.code === 'legacy_link_conflict' || error.status === 409) {
          conflict = true;
          phase = 'migration';
          if (error.migration) state.migration = {...state.migration,
            legacyRecordCount: recordCount(error.migration.legacyRecordCount),
            emailRecordCount: recordCount(error.migration.emailRecordCount)};
        }
        showMessage(error.message);
        notify('migration', error.message);
      } finally {
        state.busy = false;
        notify(state.status, state.message);
        if (dialog && dialog.open) render();
      }
    }
    async function logout() {
      if (state.busy || !state.enabled) return;
      state.busy = true;
      clearMessage();
      try {
        await beforeChange('logout');
        render();
        await request('logout', {});
        session(await request('session'));
        if (state.authenticated) throw new Error('退出尚未完成，请重试。');
        await finish('logout');
      } catch (error) {
        showMessage(error.message);
        notify('error', error.message);
        if (!dialog || !dialog.open) show(state.migration.pending ? 'migration' : state.authenticated ? 'account' : 'email');
      } finally {
        state.busy = false;
        notify(state.status, state.message);
        if (dialog && dialog.open) render();
      }
    }
    async function downloadBackups() {
      if (state.busy || !state.migration.pending) return;
      state.busy = true;
      clearMessage(); render();
      try {
        const snapshots = await request('migration-backups');
        if (typeof options.onBackup === 'function') await options.onBackup(snapshots);
        else {
          let downloaded = 0;
          for (const source of ['legacy', 'email']) {
            const snapshot = snapshots[source];
            if (!snapshot || !snapshot.state) continue;
            const data = root.IELTS_SYNC ? root.IELTS_SYNC.serialize(snapshot.state) : snapshot.state;
            const blob = new root.Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
            const url = root.URL.createObjectURL(blob);
            const link = root.document.createElement('a');
            link.href = url;
            link.download = 'xunci-' + source + '-' + new Date().toISOString().slice(0, 10) + '.json';
            root.document.body.appendChild(link); link.click(); link.remove();
            root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
            downloaded++;
          }
          if (!downloaded) throw new Error('两个账号暂时都没有可下载的学习记录。');
        }
        showMessage('备份已下载。', 'success');
      } catch (error) {showMessage(error.message);}
      finally {state.busy = false; render();}
    }
    return {init, open, getStatus: () => copy(state), logout};
  }

  root.IELTS_AUTH = {create};
})(typeof window !== 'undefined' ? window : globalThis);
