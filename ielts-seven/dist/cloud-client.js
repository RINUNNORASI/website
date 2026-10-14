/* Same-origin authenticated synchronization. Authentication belongs to the server. */
(function (root) {
  'use strict';
  const META_KEY = 'xunci.cloud.v1';
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const accountKey = id => META_KEY + '.account.' + encodeURIComponent(id);

  class ServiceError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  async function request(path, options = {}) {
    const controller = new root.AbortController();
    const timeout = root.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await root.fetch(path, {
        ...options, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: {Accept: 'application/json', ...(options.headers || {})}
      });
      if (response.status === 401 || response.status === 403) {
        throw new ServiceError('unauthorized', '请先登录本站，学习记录仍保存在本机。');
      }
      if ([404, 405, 501].includes(response.status)) {
        throw new ServiceError('unavailable', '当前网址尚未启用云端同步，学习记录仍保存在本机。');
      }
      if (response.status === 428) {
        throw new ServiceError('unavailable', '云端要求重新确认账户与记录版本，已保留本机记录。');
      }
      if (!response.ok && response.status !== 409 && response.status !== 412) {
        throw new ServiceError('offline', '云端暂时无法连接，学习记录仍保存在本机，稍后重试。');
      }
      let body;
      try { body = await response.json(); }
      catch (_) { throw new ServiceError('unavailable', '云端返回了无效数据，已保留本机记录。'); }
      // The hosting gateway may weaken ETag when compressing JSON. The dedicated
      // application revision token survives that transport transformation.
      return {status: response.status, body,
        etag: response.headers?.get('X-Xunci-State-Tag') || response.headers?.get('ETag') || null};
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('offline', error.name === 'AbortError'
        ? '云端连接超时，学习记录仍保存在本机，稍后重试。'
        : '网络不可用，学习记录仍保存在本机，恢复连接后会重试。');
    } finally { root.clearTimeout(timeout); }
  }

  function create(options) {
    const S = root.IELTS_SYNC;
    if (!S || !options || typeof options.getState !== 'function' || typeof options.setState !== 'function') {
      throw new Error('云端同步需要 IELTS_SYNC、getState 和 setState。');
    }
    let metadata = {userId: null, revision: 0, baseline: null};
    let status = {status: 'loading', message: '正在连接云端学习记录…', updatedAt: null, user: null, revision: 0};
    let conflict = null, busy = null, timer = null, poll = null;
    let started = false, stopped = false, pending = false, generation = 0;

    function readLocal() { return S.validateState(options.getState()); }
    function storeMetadata(next) {
      metadata = {userId: next.userId, revision: next.revision,
        baseline: next.baseline == null ? null : S.validateState(next.baseline)};
      try { root.localStorage.setItem(META_KEY, JSON.stringify(metadata)); }
      catch (_) { /* In-memory ownership and the local app state remain intact. */ }
    }
    try {
      const saved = JSON.parse(root.localStorage.getItem(META_KEY) || 'null');
      if (saved && typeof saved.userId === 'string' && saved.userId && Number.isSafeInteger(saved.revision)
        && saved.revision >= 0 && Object.prototype.hasOwnProperty.call(saved, 'baseline')) {
        metadata = {userId: saved.userId, revision: saved.revision,
          baseline: saved.baseline == null ? null : S.validateState(saved.baseline)};
      }
    } catch (_) { /* Unknown ownership uses the conservative first-sync rules. */ }

    function emit(next) {
      if (stopped) return;
      status = {...status, ...next};
      options.onStatus?.(copy(status));
    }
    function envelope(result) {
      const value = result.body;
      if (!value || value.version !== 1 || !value.user || typeof value.user.id !== 'string'
        || !value.user.id || (value.user.email != null && typeof value.user.email !== 'string')
        || !Number.isSafeInteger(value.revision) || value.revision < 0
        || (value.updatedAt !== null && (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))))
        || !Object.prototype.hasOwnProperty.call(value, 'state')) {
        throw new ServiceError('unavailable', '云端学习记录格式无效，已保留本机记录。');
      }
      let state;
      try { state = value.state == null ? null : S.validateState(value.state); }
      catch (_) { throw new ServiceError('unavailable', '云端学习记录未通过校验，已保留本机记录。'); }
      return {version: 1, user: {id: value.user.id, email: value.user.email || null},
        revision: value.revision, updatedAt: value.updatedAt, state, etag: result.etag};
    }
    function currentView(remote) {
      return {user: remote.user, revision: remote.revision, updatedAt: remote.updatedAt};
    }
    function commitBaseline(remote, baseline) {
      storeMetadata({userId: remote.user.id, revision: remote.revision, baseline});
    }
    function makeInitial() {
      if (typeof options.makeInitialState !== 'function') {
        throw new ServiceError('unavailable', '切换账户需要初始词库配置，已保留本机记录。');
      }
      return S.validateState(options.makeInitialState());
    }
    function adoptAccount(remote) {
      if (!metadata.userId) {
        storeMetadata({userId: remote.user.id, revision: 0, baseline: null});
        return false;
      }
      if (metadata.userId === remote.user.id) return false;
      // Save the previous account before replacing the app state. Failure stops the switch.
      const previous = {version: 1, userId: metadata.userId, revision: metadata.revision,
        baseline: metadata.baseline, state: readLocal(), savedAt: new Date().toISOString()};
      const replacement = remote.state || makeInitial();
      try { root.localStorage.setItem(accountKey(metadata.userId), JSON.stringify(previous)); }
      catch (_) { throw new ServiceError('unavailable', '无法备份上一账户的本机进度，已暂停账户切换和云端上传。'); }
      commitBaseline(remote, remote.state);
      conflict = null;
      options.setState(copy(replacement));
      // Any changes made while rendering the new account belong to that new account.
      pending = true;
      emit({...currentView(remote), status: 'synced', message: '已切换到当前登录账户，上一账户的本机进度已单独保存。'});
      return true;
    }
    function showConflict(remote, conflicts) {
      conflict = {local: readLocal(), remote: copy(remote.state), conflicts: copy(conflicts),
        revision: remote.revision, updatedAt: remote.updatedAt, user: copy(remote.user)};
      emit({...currentView(remote), status: 'conflict', message: '本机与云端记录都有变化，请选择保留方式；当前记录尚未覆盖。'});
      if (!stopped) options.onConflict?.(copy(conflict));
    }
    function synced(remote, baseline, message = '学习记录已同步到云端。') {
      commitBaseline(remote, baseline);
      conflict = null;
      emit({...currentView(remote), status: 'synced', message});
      // A PUT only acknowledges its own snapshot, never edits made while it was in flight.
      if (S.fingerprint(readLocal()) !== S.fingerprint(baseline)) pending = true;
    }
    async function put(remote, snapshot) {
      const headers = {'Content-Type': 'application/json'};
      // If-Match is an opaque server-generated account guard, never client authentication.
      if (!remote.etag) throw new ServiceError('unavailable', '云端缺少账户版本校验，已暂停上传并保留本机记录。');
      headers['If-Match'] = remote.etag;
      return request('/api/learning-state', {method: 'PUT', headers,
        body: JSON.stringify({version: 1, baseRevision: remote.revision, state: snapshot})});
    }
    async function reconcile(remote, token, retried = false) {
      if (stopped || token !== generation) return;
      if (adoptAccount(remote)) return;
      const local = readLocal();
      let decision;
      if (!metadata.baseline && remote.state && options.isPristine?.(local)) {
        decision = {action: 'download', state: remote.state};
      } else { decision = S.decideSync(metadata.baseline, local, remote.state); }
      if (decision.action === 'conflict') { showConflict(remote, decision.conflicts); return; }
      if (decision.action === 'download') {
        commitBaseline(remote, decision.state);
        options.setState(copy(decision.state));
        synced(remote, decision.state, '已下载云端学习记录。');
        return;
      }
      if (decision.action === 'unchanged') { synced(remote, local); return; }
      if (decision.action === 'merge') options.setState(copy(decision.state));
      // Read again after applying a merge: setState may render and persist another local edit.
      const snapshot = readLocal();
      const response = await put(remote, snapshot);
      if (stopped || token !== generation) return;
      if (response.status === 412) {
        const latest = envelope(await request('/api/learning-state'));
        if (stopped || token !== generation || adoptAccount(latest)) return;
        if (!retried) { await reconcile(latest, token, true); return; }
        showConflict(latest, [{path: 'cloud', reason: '账户或云端记录版本在提交期间变化，请重新选择'}]);
        return;
      }
      const returned = envelope(response);
      if (adoptAccount(returned)) return;
      if (response.status === 409) {
        if (!retried) { await reconcile(returned, token, true); return; }
        const newer = S.decideSync(metadata.baseline, readLocal(), returned.state);
        showConflict(returned, newer.conflicts?.length ? newer.conflicts
          : [{path: 'cloud', reason: '云端记录在提交时再次更新，请重新选择保留方式'}]);
        return;
      }
      if (returned.revision <= remote.revision || !returned.state
        || S.fingerprint(returned.state) !== S.fingerprint(snapshot)) {
        throw new ServiceError('unavailable', '云端未确认本次学习记录，已保留本机记录。');
      }
      synced(returned, snapshot);
    }
    function schedule() {
      if (stopped) return;
      root.clearTimeout(timer);
      timer = root.setTimeout(() => { timer = null; pending = false; sync(); }, 1000);
    }
    function queue() {
      if (stopped) return;
      pending = true;
      if (conflict) {
        conflict.local = readLocal();
        options.onConflict?.(copy(conflict));
        return;
      }
      if (!busy) schedule();
    }
    function run(operation) {
      if (stopped) return Promise.resolve(copy(status));
      if (busy) { pending = true; return busy; }
      root.clearTimeout(timer); timer = null; pending = false;
      const token = generation;
      emit({status: 'syncing', message: '正在同步学习记录…'});
      // Defer execution one microtask so busy is assigned even when callbacks queue work.
      busy = Promise.resolve().then(() => operation(token)).catch(error => {
        if (!stopped && token === generation) emit({status: error.status || 'unavailable',
          message: error.message || '同步未完成，已保留本机学习记录。'});
      }).then(() => copy(status)).finally(() => {
        busy = null;
        if (pending && !stopped && !conflict && !['unauthorized', 'unavailable'].includes(status.status)) schedule();
      });
      return busy;
    }
    function sync() {
      return run(async token => {
        const remote = envelope(await request('/api/learning-state'));
        if (stopped || token !== generation) return;
        // Local state is deliberately captured after GET, not before the request.
        await reconcile(remote, token);
      });
    }
    function resolveConflict(choice) {
      if (!['local', 'remote'].includes(choice)) return Promise.reject(new Error('请选择 local 或 remote。'));
      if (!conflict) return sync();
      return run(async token => {
        const remote = envelope(await request('/api/learning-state'));
        if (stopped || token !== generation || adoptAccount(remote)) return;
        if (choice === 'remote') {
          const replacement = remote.state || makeInitial();
          commitBaseline(remote, remote.state);
          conflict = null;
          options.setState(copy(replacement));
          emit({...currentView(remote), status: 'synced', message: '已保留最新云端学习记录。'});
          if (!remote.state || S.fingerprint(readLocal()) !== S.fingerprint(remote.state)) pending = true;
          return;
        }
        const snapshot = readLocal();
        const response = await put(remote, snapshot);
        if (stopped || token !== generation) return;
        if (response.status === 412) {
          const latest = envelope(await request('/api/learning-state'));
          if (stopped || token !== generation || adoptAccount(latest)) return;
          showConflict(latest, [{path: 'cloud', reason: '账户或云端记录版本在确认期间变化，尚未覆盖'}]);
          return;
        }
        const returned = envelope(response);
        if (adoptAccount(returned)) return;
        if (response.status === 409) {
          showConflict(returned, [{path: 'cloud', reason: '云端在确认期间更新，尚未覆盖，请再次选择'}]);
          return;
        }
        if (!returned.state || returned.revision <= remote.revision
          || S.fingerprint(returned.state) !== S.fingerprint(snapshot)) {
          throw new ServiceError('unavailable', '云端未确认本机记录，已保留本机学习记录。');
        }
        synced(returned, snapshot, '已将本机学习记录保存到云端。');
      });
    }
    const online = () => { if (!stopped) sync(); };
    const visible = () => { if (!root.document.hidden && !stopped) sync(); };
    function start() {
      if (started && !stopped) return sync();
      started = true; stopped = false;
      root.addEventListener('online', online);
      root.document.addEventListener('visibilitychange', visible);
      poll = root.setInterval(() => { if (!root.document.hidden && !busy) sync(); }, 30000);
      return sync();
    }
    function stop() {
      stopped = true; generation++; pending = false;
      root.clearTimeout(timer); root.clearInterval(poll);
      root.removeEventListener('online', online);
      root.document.removeEventListener('visibilitychange', visible);
    }
    return {start, queue, sync, resolveConflict, stop,
      getStatus: () => copy(status), getConflict: () => copy(conflict)};
  }

  async function loadLessons() {
    const result = await request('/api/lessons');
    const body = result.body;
    const lessons = Array.isArray(body) ? body : body?.lessons;
    if (!Array.isArray(lessons)) throw new ServiceError('unavailable', '云端课程列表格式无效。');
    return root.IELTS_SYNC.validateLessons(lessons);
  }
  root.IELTS_CLOUD = {create, loadLessons};
})(window);
