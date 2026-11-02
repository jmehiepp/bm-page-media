(function (ns) {
  const TOKEN_KEY = 'fbtool.userToken';
  const AD_ACCOUNT_KEY = 'fbtool.adAccountId';
  const LINK_WRAPPER_KEY = 'fbtool.linkWrapper';
  const $ = (id) => document.getElementById(id);
  let contentMode = 'manual';
  let connectedToken = '';
  let publishing = false;
  let connecting = false;
  let connectionGeneration = 0;
  let discoveredAdAccounts = [];
  let loginAttempt = 0;
  let facebookLoginPending = false;

  const connectionMatches = () => connectedToken && connectedToken === $('token').value.trim();

  function updatePublishAvailability() {
    const disabled = publishing || connecting || facebookLoginPending || !connectionMatches() || !adAccountId();
    $('publish-now').disabled = $('schedule').disabled = Boolean(disabled);
    $('ad-account-id').disabled = publishing || connecting || !discoveredAdAccounts.some(a => a.account_status === 1);
    if (ns.facebookLogin?.canLogin()) $('facebook-login-btn').disabled = publishing || connecting || facebookLoginPending || !ns.facebookLogin.isReady();
    $('disconnect-facebook').hidden = !connectionMatches();
    $('disconnect-facebook').disabled = publishing;
  }

  function disconnectFacebook() {
    loginAttempt++;
    ns.facebookLogin?.clearSession();
    $('token').value = '';
    $('remember-token').checked = false;
    applyToken();
    invalidateConnection();
    $('me').textContent = 'Đã ngắt kết nối';
  }

  async function prepareFacebookLogin() {
    if (!ns.facebookLogin) return;
    const button = $('facebook-login-btn');
    const status = $('facebook-login-status');
    if (!ns.facebookLogin.canLogin()) {
      button.textContent = 'Mở bản web để kết nối Facebook';
      button.onclick = () => window.open(ns.facebookLogin.hostedUrl, '_blank', 'noopener,noreferrer');
      status.textContent = 'Đăng nhập Facebook dùng bản web HTTPS. Thư viện video được lưu riêng trong từng bản; bạn có thể thêm file từ máy vào bản web.';
      return;
    }
    button.disabled = true;
    button.textContent = 'Đang tải Facebook Login...';
    try {
      await ns.facebookLogin.prepare();
      button.textContent = 'Kết nối Facebook';
      button.onclick = connectFacebook;
      status.textContent = 'Đăng nhập và chọn Page được cấp quyền trong cửa sổ Facebook.';
      updatePublishAvailability();
    } catch (err) {
      status.textContent = err.message;
      button.textContent = 'Thử tải lại Facebook Login';
      button.disabled = false;
      button.onclick = prepareFacebookLogin;
    }
  }

  async function connectFacebook() {
    const attempt = ++loginAttempt;
    facebookLoginPending = true;
    updatePublishAvailability();
    $('facebook-login-status').textContent = 'Hoàn tất đăng nhập và cấp quyền trong cửa sổ Facebook...';
    try {
      const token = await ns.facebookLogin.login();
      if (attempt !== loginAttempt) return;
      $('token').value = token;
      $('facebook-login-status').textContent = 'Đã nhận phiên đăng nhập. Đang kiểm tra quyền và tự tải Page, tài khoản quảng cáo...';
      await loadAccounts();
    } catch (err) {
      if (attempt === loginAttempt) $('facebook-login-status').textContent = err.message;
    } finally {
      facebookLoginPending = false;
      updatePublishAvailability();
    }
  }

  function invalidateConnection() {
    connectedToken = '';
    connectionGeneration++;
    connecting = false;
    $('load-accounts').disabled = false;
    $('load-accounts').textContent = 'Kết nối bằng token';
    $('refresh-pages').disabled = false;
    $('refresh-pages').textContent = '↻ Cập nhật Page & QC';
    ns.pageSelector.setPages([]);
    showAdAccount([], false);
    ns.shell.setConnection(false, 'Cần kết nối lại');
    $('me').textContent = 'Token đã thay đổi — bấm Kết nối & tải Page';
  }

  function log(message) {
    const line = document.createElement('div');
    line.className = /^❌/.test(message) ? 'log-error' : /^✅/.test(message) ? 'log-ok' : '';
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    $('log').prepend(line);
  }

  const storage = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
    del: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  function applyToken() {
    const token = $('token').value.trim();
    ns.graph.configure({ version: $('api-version').value, userToken: token });
    if ($('remember-token').checked) storage.set(TOKEN_KEY, token);
    else storage.del(TOKEN_KEY);
  }

  // Restore a saved choice only when it is still active and accessible to this user.
  function showAdAccount(adAccounts, loaded = true) {
    const preferred = $('ad-account-id').value || storage.get(AD_ACCOUNT_KEY);
    discoveredAdAccounts = adAccounts;
    const active = adAccounts.filter(a => a.account_status === 1);
    const options = active.map((account) => {
      const option = document.createElement('option');
      option.value = account.id;
      option.textContent = `${account.name} (${account.id})`;
      return option;
    });
    if (!options.length) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = loaded ? 'Không có tài khoản quảng cáo đang hoạt động' : 'Kết nối User Token để tải tài khoản';
      options.push(empty);
    }
    $('ad-account-id').replaceChildren(...options);
    $('ad-account-id').value = (active.find(a => a.id === preferred) || active[0])?.id || '';
    const selected = active.find(a => a.id === adAccountId());
    if (selected) storage.set(AD_ACCOUNT_KEY, selected.id);
    else if (loaded) storage.del(AD_ACCOUNT_KEY);
    $('ad-account-status').textContent = selected
      ? `✅ Đang dùng ${selected.name} (${selected.id}).${active.length > 1 ? ' Có thể chọn tài khoản khác trong danh sách.' : ''}`
      : loaded ? `⚠️ Không tìm thấy tài khoản quảng cáo đang hoạt động cho User Token này.${adAccounts.length ? ` Có ${adAccounts.length} tài khoản chưa hoạt động.` : ''} Kiểm tra quyền của tài khoản Facebook rồi bấm cập nhật.` : '';
    updatePublishAvailability();
  }

  function adAccountId() {
    const selected = discoveredAdAccounts.find(a => a.id === $('ad-account-id').value && a.account_status === 1);
    return selected ? selected.id : '';
  }

  async function refreshPages() {
    if (!connectionMatches()) return loadAccounts();
    const button = $('refresh-pages');
    const generation = ++connectionGeneration;
    connecting = true;
    updatePublishAvailability();
    button.disabled = true;
    button.textContent = 'Đang cập nhật...';
    try {
      const { pages, adAccounts } = await ns.accounts.loadAccountsWithDiagnostics();
      if (generation !== connectionGeneration || !connectionMatches()) return;
      const { added } = ns.pageSelector.setPages(pages);
      showAdAccount(adAccounts);
      const total = ns.pageSelector.list().length;
      log(added.length ? `✅ Thêm ${added.length} Page mới: ${added.map((p) => p.name).join(', ')}` : `Không có Page mới (tổng ${total} Page)`);
      $('connection-text').textContent = $('connection-text').textContent.replace(/\d+ Page$/, `${total} Page`);
    } catch (err) {
      if (generation !== connectionGeneration) return;
      invalidateConnection();
      log(`❌ Cập nhật Page: ${err.message}`);
    } finally {
      if (generation === connectionGeneration) {
        connecting = false;
        button.disabled = false;
        button.textContent = '↻ Cập nhật Page & QC';
        updatePublishAvailability();
      }
    }
  }

  async function loadAccounts() {
    loginAttempt++;
    applyToken();
    const tokenAtStart = $('token').value.trim();
    const generation = ++connectionGeneration;
    connectedToken = '';
    connecting = true;
    ns.pageSelector.setPages([]);
    showAdAccount([], false);
    const button = $('load-accounts');
    button.disabled = true;
    button.textContent = 'Đang kết nối...';
    $('me').textContent = '⏳ Đang tải Page...';
    try {
      const { me, pages, adAccounts } = await ns.accounts.loadAccountsWithDiagnostics();
      if (generation !== connectionGeneration || tokenAtStart !== $('token').value.trim()) return;
      connectedToken = tokenAtStart;
      ns.pageSelector.setPages(pages);
      $('me').textContent = `✅ ${me.name} — ${pages.length} Page`;
      $('refresh-pages').hidden = false;
      showAdAccount(adAccounts);
      ns.shell.setConnection(true, `${me.name} · ${pages.length} Page`);
      log(`✅ Kết nối ${me.name}, tải được ${pages.length} Page`);
      if (adAccountId()) ns.shell.closeSettings();
    } catch (err) {
      if (generation !== connectionGeneration) return;
      $('me').textContent = `❌ ${err.message}`;
      ns.shell.setConnection(false, 'Lỗi kết nối');
      log(`❌ ${err.message}`);
    } finally {
      if (generation === connectionGeneration) {
        connecting = false;
        button.disabled = false;
        button.textContent = 'Kết nối bằng token';
        updatePublishAvailability();
      }
    }
  }

  function refreshLibraries() {
    Object.entries({ video: 'video', image: 'ảnh' }).forEach(([kind, label]) => {
      ns.mediaLibraries[kind].refresh()
        .then(({ removedCount, duplicateCount }) => {
          if (removedCount) log(`🗑️ Đã tự xóa ${removedCount} ${label} quá ${ns.mediaLibraries.RETENTION_DAYS} ngày`);
          if (duplicateCount) log(`✅ Thư viện ${label}: gộp hiển thị ${duplicateCount} bản trùng nội dung`);
        })
        .catch((err) => log(`❌ Thư viện ${label}: ${err.message}`));
    });
    if (ns.serverLibrary && ns.serverLibrary.available !== false) {
      ns.serverLibrary.syncVideos(ns.mediaLibraries.video)
        .then(({ added }) => added && log(`✅ Đồng bộ ${added} video mới từ kho cron`))
        .catch((err) => log(`ℹ️ Chưa đồng bộ được kho cron: ${err.message}`));
    }
  }

  function syncCronLibrary() {
    if (!ns.serverLibrary || ns.serverLibrary.available === false) return;
    ns.serverLibrary.syncVideos(ns.mediaLibraries.video)
      .then(({ added }) => added && log(`✅ Đồng bộ ${added} video mới từ kho cron`))
      .catch(() => { /* The server may be stopped while the editor remains open. */ });
  }

  const selectedPages = () => ns.pageSelector.selected();

  const currentContent = () => (contentMode === 'clone'
    ? ns.clonePanel.peek()
    : { message: $('message').value, cards: ns.cardEditor.getCards() });

  // Facebook refuses carousel links it cannot crawl, so an own-domain redirect can stand in.
  function wrapLinks(content) {
    const prefix = $('link-wrapper').value.trim();
    if (!prefix) return content;
    const wrap = (link) => (link ? prefix + encodeURIComponent(link) : link);
    return { ...content, defaultLink: wrap(content.defaultLink), cards: content.cards.map((card) => ({ ...card, link: wrap(card.link) })) };
  }

  function refreshPreview() {
    const targets = selectedPages();
    ns.preview.render($('post-preview'), { ...currentContent(), pageName: targets[0] && targets[0].name, showEndCard: $('end-card').checked });
    $('publish-summary').textContent = targets.length
      ? `Sẽ đăng lên ${targets.length} Page: ${targets.map((p) => p.name).join(', ')}`
      : 'Chưa chọn Page nào';
  }

  async function submit(scheduled) {
    if (publishing || connecting) return;
    applyToken();
    const targets = selectedPages();
    const runAt = scheduled ? new Date($('schedule-at').value).getTime() : null;
    let post;

    try {
      if (!connectionMatches()) throw new Error('Kết nối & tải Page với token hiện tại trước khi đăng');
      const content = contentMode === 'clone'
        ? ns.clonePanel.getContent()
        : { message: $('message').value, defaultLink: $('default-link').value.trim(), cards: ns.cardEditor.getCards() };
      // Freeze this submission's content while the user continues editing the next post.
      post = { ...structuredClone(wrapLinks(content)), adAccountId: adAccountId(), showEndCard: $('end-card').checked };
      if (!targets.length) throw new Error('Chọn ít nhất 1 Page');
      targets.filter((page) => page.tasks && !page.tasks.some((task) => ['CREATE_CONTENT', 'PROFILE_PLUS_CREATE_CONTENT', 'MANAGE'].includes(task))).forEach((page) => {
        log(`⚠️ Page ${page.name}: chưa thấy quyền CREATE_CONTENT — kiểm tra quyền tạo nội dung của tài khoản quản trị`);
      });
      if (!post.adAccountId) throw new Error('Chưa có tài khoản quảng cáo đang hoạt động được cấp quyền cho User Token này');
      if (scheduled && !(runAt > Date.now())) throw new Error('Thời gian hẹn phải ở tương lai');
      ns.publisher.validatePost(post);
    } catch (err) {
      return log(`❌ ${err.message}`);
    }

    publishing = true;
    $('publish-now').disabled = $('schedule').disabled = true;
    const locked = ['token', 'ad-account-id', 'load-accounts', 'refresh-pages', 'api-version'];
    locked.forEach((id) => { $(id).disabled = true; });
    log(`Đăng carousel bằng User Token qua ${post.adAccountId}.`);
    try {
    for (const page of targets) {
      try {
        const { storyId } = await ns.publisher.createUnpublishedCarousel({ ...post, pageId: page.id }, log, page.access_token);
        if (scheduled) {
          ns.queue.add({ runAt, pageId: page.id, pageName: page.name, storyId });
          log(`🕒 Đã hẹn giờ cho ${page.name} lúc ${new Date(runAt).toLocaleString()}`);
        } else {
          const result = await ns.publisher.publishStory(storyId, page.access_token);
          log(`✅ Đã đăng lên ${page.name}: ${result.permalink_url || ns.publisher.postUrl(storyId)}`);
          if (result.reportedError) log(`ℹ️ Facebook báo "${result.reportedError}" nhưng bài đã lên thật — bỏ qua thông báo này`);
        }
      } catch (err) {
        log(`${err.publicationUncertain ? '⚠️' : '❌'} ${page.name}: ${err.message}`);
        if (err.stage !== 'ad-account-access' && err.raw && ([10, 200].includes(err.raw.code) || err.raw.error_subcode === 1609011)) {
          await ns.publishDiagnostics.report(page, $('token').value.trim(), log);
        }
      }
    }
    } finally {
    publishing = false;
    locked.forEach((id) => { $(id).disabled = false; });
    updatePublishAvailability();
    }
  }

  function renderJobs(jobs) {
    $('jobs').replaceChildren(
      ...jobs.map((job) => {
        const row = document.createElement('div');
        row.className = `job job-${job.status}`;
        row.textContent = `${new Date(job.runAt).toLocaleString()} · ${job.pageName} · ${job.status}${job.error ? ` (${job.error})` : ''} `;
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'icon-btn';
        del.textContent = '✕';
        del.title = 'Xóa lịch';
        del.onclick = () => ns.queue.remove(job.id);
        row.appendChild(del);
        return row;
      })
    );
  }

  document.addEventListener('DOMContentLoaded', () => {
    ns.shell.init();
    const message = $('message');
    const initialMessage = message.value.trim();
    let messageEdited = false;
    let autoCaption = '';
    message.addEventListener('input', (event) => {
      // Synthetic input dispatched after an automatic fill must not lock out
      // later library selections. Real typing remains authoritative.
      if (event.isTrusted) messageEdited = true;
    });
    document.addEventListener('fbtool:library-media-selected', (event) => {
      const caption = (event.detail && event.detail.item && event.detail.item.caption || '').trim();
      if (!caption || messageEdited) return;
      const current = message.value.trim();
      if (current !== initialMessage && current !== autoCaption) return;
      message.value = caption;
      autoCaption = caption;
      message.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const saved = storage.get(TOKEN_KEY);
    if (saved) {
      $('token').value = saved;
      $('remember-token').checked = true;
      ns.graph.configure({ userToken: saved });
    }
    $('ad-account-id').addEventListener('change', () => {
      const selected = adAccountId();
      if (selected) storage.set(AD_ACCOUNT_KEY, selected);
      showAdAccount(discoveredAdAccounts);
    });
    $('link-wrapper').value = storage.get(LINK_WRAPPER_KEY) || '';
    $('link-wrapper').addEventListener('input', (e) => storage.set(LINK_WRAPPER_KEY, e.target.value.trim()));
    ['video', 'image'].forEach((kind) => ns.mediaLibraryPanel.init($(`library-${kind}`), kind, { getPages: ns.pageSelector.list }));
    ns.affiliateLibraryPanel.init($('library-affiliate'));
    ns.shell.bindSegmented([
      ['video', 'library-tab-video', 'library-video'],
      ['image', 'library-tab-image', 'library-image'],
      ['affiliate', 'library-tab-affiliate', 'library-affiliate'],
    ]);
    $('default-link-picker').replaceChildren(ns.affiliateLinkPicker.build({
      label: 'Link liên kết chung',
      value: $('default-link').value,
      onChange: (value) => { $('default-link').value = value; },
    }));
    ns.cardEditor.init($('cards'));
    ns.quickVideoImport.init($('quick-import'), { getPages: ns.pageSelector.list, log });
    ns.pageSelector.init($('pages'), $('pages-count'));
    ns.clonePanel.init($('clone-content'), { getPages: ns.pageSelector.list, log });
    $('refresh-pages').onclick = refreshPages;
    ns.shell.bindSegmented([['manual', 'mode-manual', 'manual-content'], ['clone', 'mode-clone', 'clone-content']], (mode) => { contentMode = mode; });
    $('token').addEventListener('input', () => { loginAttempt++; invalidateConnection(); applyToken(); });
    $('remember-token').addEventListener('change', applyToken);
    $('load-accounts').onclick = loadAccounts;
    $('disconnect-facebook').onclick = disconnectFacebook;
    $('publish-now').onclick = () => submit(false);
    $('schedule').onclick = () => submit(true);
    ns.queue.subscribe(renderJobs);
    ns.queue.start(log, () => Boolean(connectionMatches() && !connecting && !facebookLoginPending));
    refreshLibraries();
    window.setInterval(syncCronLibrary, 60 * 1000);
    ns.shell.onAnyEdit(refreshPreview);
    refreshPreview();
    showAdAccount([], false);
    prepareFacebookLogin();
    if (saved) loadAccounts();
    else ns.shell.openSettings();
  });
})(window.FbTool);
