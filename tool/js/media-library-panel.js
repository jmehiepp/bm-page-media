window.FbTool = window.FbTool || {};

(function (ns) {
  const { el } = ns.cardFields;
  const remoteLibrary = ns.serverLibrary && ns.serverLibrary.available !== false ? ns.serverLibrary : null;
  const STATUS_LABELS = { ready: 'Sẵn sàng', processing: 'Đang xử lý', error: 'Lỗi' };
  const KIND_CONFIG = {
    video: { accept: 'video/*', placeholder: 'Link file video trực tiếp: https://.../video.mp4', empty: 'Thư viện video trống' },
    image: { accept: 'image/*', placeholder: 'Link file ảnh trực tiếp: https://.../anh.jpg', empty: 'Thư viện ảnh trống' },
  };

  function mediaTile(kind, item, onClick, selected) {
    const tile = el(onClick ? 'button' : 'div', { type: 'button', className: `library-tile${selected ? ' selected' : ''}` });
    if (onClick) tile.onclick = () => onClick(item);
    if (item.thumb) tile.appendChild(el('img', { className: 'preview-media', src: item.thumb, alt: '' }));
    tile.appendChild(el('span', { className: `badge status-${item.status}`, textContent: STATUS_LABELS[item.status] || item.status }));
    tile.appendChild(el('div', { className: 'library-title', textContent: item.title }));
    if (item.caption) tile.appendChild(el('div', { className: 'muted small library-caption', textContent: item.caption.slice(0, 140) }));
    if (!onClick && item.postUrl) tile.appendChild(el('a', { className: 'source-link small', href: item.postUrl, target: '_blank', rel: 'noopener', textContent: 'Mở bài gốc' }));
    if (item.length) tile.appendChild(el('div', { className: 'muted', textContent: `${Math.round(item.length)} giây` }));
    if (item.managed) tile.appendChild(el('div', { className: 'muted', textContent: `Tự xóa sau ${Math.max(0, ns.mediaLibraries[kind].daysLeft(item))} ngày` }));
    return tile;
  }

  function createPanel(kind, root, { getPages }) {
    const library = ns.mediaLibraries[kind];
    const config = KIND_CONFIG[kind];
    const state = { url: '', title: '', postUrl: '', busy: false, message: '', links: [], sourceUrl: '', sources: [], remoteStatus: null, remoteBusy: false, remoteMessage: '' };
    state.sources = kind === 'video' && remoteLibrary ? remoteLibrary.cachedSources() : [];
    state.sourcesLoaded = false;
    state.sourceNotice = 'Đang kết nối bộ quét...';

    async function loadSources() {
      if (state.remoteBusy) return;
      state.remoteBusy = true;
      state.sourceNotice = 'Đang kết nối bộ quét...';
      render();
      try {
        const result = await remoteLibrary.getSources();
        state.sources = result.sources;
        state.remoteStatus = result.status || null;
        state.sourcesLoaded = true;
        state.sourceNotice = '';
        state.remoteMessage = '';
      } catch (err) {
        state.sourcesLoaded = false;
        state.sourceNotice = err.message;
      } finally {
        state.remoteBusy = false;
        render();
      }
    }

    async function runTask(label, task) {
      Object.assign(state, { busy: true, message: `⏳ ${label}...`, links: [] });
      render();
      try {
        const { removedCount, duplicateCount, importedCount, failed, downloadedCount, links } = await task();
        const parts = [`✅ ${label}: xong`];
        if (importedCount) parts.push(`thêm ${importedCount} mục`);
        if (downloadedCount) parts.push(`đã tải ${downloadedCount} file về máy`);
        if (links && links.length) {
          parts.push(`${links.length} file cần tải thủ công: mở link → chuột phải → Lưu`);
          state.links = links;
        }
        if (failed && failed.length) parts.push(`lỗi thẻ ${failed.join(', ')}`);
        if (removedCount) parts.push(`đã tự xóa ${removedCount} mục quá ${ns.mediaLibraries.RETENTION_DAYS} ngày`);
        if (duplicateCount) parts.push(`đã gộp hiển thị ${duplicateCount} bản trùng nội dung`);
        state.message = parts.join(' · ');
      } catch (err) {
        state.message = `❌ ${err.message}`;
      }
      state.busy = false;
      render();
    }

    function form() {
      const box = el('div', { className: 'library-form' });
      const urlRow = el('div', { className: 'source-row' });
      urlRow.appendChild(el('input', { type: 'url', value: state.url, placeholder: config.placeholder }, (e) => { state.url = e.target.value.trim(); }));
      urlRow.appendChild(el('input', { value: state.title, placeholder: 'Tên (tùy chọn)', className: 'library-name' }, (e) => { state.title = e.target.value; }));
      urlRow.appendChild(el('button', {
        type: 'button',
        textContent: 'Thêm từ link',
        disabled: state.busy,
        onclick: () => state.url && runTask('Thêm từ link', async () => {
          const result = await library.addByUrl(state.url, state.title);
          Object.assign(state, { url: '', title: '' });
          return result;
        }),
      }));
      box.appendChild(urlRow);

      const postRow = el('div', { className: 'source-row' });
      postRow.appendChild(el('input', { type: 'url', value: state.postUrl, placeholder: 'Link bài viết của Page bạn quản lý: https://www.facebook.com/.../posts/...' }, (e) => { state.postUrl = e.target.value.trim(); }));
      postRow.appendChild(el('button', {
        type: 'button',
        className: 'primary',
        textContent: 'Tải về máy',
        disabled: state.busy,
        onclick: () => state.postUrl && runTask('Tải về máy', () => ns.mediaLibraries.downloadFromPost(kind, state.postUrl, getPages())),
      }));
      postRow.appendChild(el('button', {
        type: 'button',
        textContent: 'Lưu vào thư viện',
        disabled: state.busy,
        onclick: () => state.postUrl && runTask('Lấy từ bài viết', async () => {
          const result = await library.importFromPost(state.postUrl, getPages());
          state.postUrl = '';
          return result;
        }),
      }));
      box.appendChild(postRow);

      const actions = el('div', { className: 'row' });
      const fileLabel = el('label', { className: 'file-button', textContent: 'Tải file từ máy' });
      fileLabel.appendChild(el('input', { type: 'file', accept: config.accept, multiple: true, hidden: true, disabled: state.busy }, (e) => {
        const files = [...e.target.files];
        if (files.length) runTask(`Tải ${files.length} file lên`, () => library.addFiles(files));
      }));
      actions.appendChild(fileLabel);
      actions.appendChild(el('button', { type: 'button', textContent: 'Làm mới', disabled: state.busy, onclick: () => runTask('Làm mới', () => library.refresh()) }));
      actions.appendChild(el('span', { className: 'muted', textContent: state.message }));
      state.links.forEach((link) => actions.appendChild(el('a', { href: link.url, target: '_blank', rel: 'noopener', className: 'source-link', textContent: `⬇ ${link.label}` })));
      box.appendChild(actions);
      return box;
    }

    function remoteForm() {
      if (kind !== 'video' || !remoteLibrary) return null;
      const box = el('section', { className: 'library-auto-scan' });
      const heading = el('div', { className: 'panel-head' });
      heading.appendChild(el('strong', { textContent: 'Quét Page tự động' }));
      heading.appendChild(el('span', { className: 'muted small', textContent: 'Cron server · 15 phút/lần' }));
      box.appendChild(heading);

      const addRow = el('div', { className: 'source-row' });
      addRow.appendChild(el('input', {
        type: 'url', value: state.sourceUrl,
        placeholder: 'https://www.facebook.com/TenPage/',
      }, (e) => { state.sourceUrl = e.target.value.trim(); }));
      addRow.appendChild(el('button', {
        type: 'button', textContent: '＋ Thêm Page', disabled: state.remoteBusy,
        onclick: async () => {
          if (!state.sourceUrl) return;
          state.remoteBusy = true; state.remoteMessage = 'Đang lưu Page...'; render();
          try {
            const result = await remoteLibrary.addSource(state.sourceUrl);
            state.sources = result.sources || [];
            state.sourcesLoaded = true;
            state.sourceNotice = '';
            state.remoteStatus = result.status || state.remoteStatus;
            state.sourceUrl = '';
            state.remoteMessage = 'Đã thêm Page';
          } catch (err) { state.remoteMessage = `❌ ${err.message}`; }
          state.remoteBusy = false; render();
        },
      }));
      box.appendChild(addRow);

      const list = el('div', { className: 'library-source-list' });
      if (state.sourceNotice) list.appendChild(el('div', { className: 'muted small', textContent: state.sourceNotice }));
      if (!state.sourcesLoaded && state.sources.length) {
        list.appendChild(el('div', { className: 'muted small', textContent: 'Danh sách Page đã lưu lần gần nhất — chưa xác nhận trạng thái hiện tại trên server.' }));
      } else if (state.sourcesLoaded && !state.sources.length) {
        list.appendChild(el('div', { className: 'muted small', textContent: 'Chưa có Page nào trong danh sách quét.' }));
      }
      state.sources.forEach((source) => {
        const row = el('div', { className: 'library-source-item' });
        row.appendChild(el('span', { textContent: source }));
        row.appendChild(el('button', {
          type: 'button', className: 'icon-btn danger', textContent: '✕', title: 'Bỏ Page khỏi cron', disabled: state.remoteBusy,
          onclick: async () => {
            state.remoteBusy = true; render();
            try {
              const result = await remoteLibrary.removeSource(source);
              state.sources = result.sources || [];
              state.sourcesLoaded = true;
              state.sourceNotice = '';
              state.remoteStatus = result.status || state.remoteStatus;
              state.remoteMessage = 'Đã bỏ Page khỏi danh sách quét';
            } catch (err) { state.remoteMessage = `❌ ${err.message}`; }
            state.remoteBusy = false; render();
          },
        }));
        list.appendChild(row);
      });
      box.appendChild(list);

      const actions = el('div', { className: 'row' });
      actions.appendChild(el('button', {
        type: 'button', textContent: 'Kết nối lại', disabled: state.remoteBusy, onclick: loadSources,
      }));
      actions.appendChild(el('button', {
        type: 'button', textContent: 'Quét ngay', disabled: state.remoteBusy,
        onclick: async () => {
          state.remoteBusy = true; state.remoteMessage = 'Đang quét các Page mới...'; render();
          try {
            const result = await remoteLibrary.scanNow();
            state.remoteStatus = result.status || state.remoteStatus;
            const synced = await remoteLibrary.syncVideos(library);
            state.remoteMessage = `✅ Quét xong: ${result.found || 0} video mới · đồng bộ ${synced.added} video`;
          } catch (err) { state.remoteMessage = `❌ ${err.message}`; }
          state.remoteBusy = false; render();
        },
      }));
      actions.appendChild(el('button', {
        type: 'button', textContent: 'Đồng bộ video mới', disabled: state.remoteBusy,
        onclick: async () => {
          state.remoteBusy = true; state.remoteMessage = 'Đang đồng bộ kho server...'; render();
          try {
            const result = await remoteLibrary.syncVideos(library);
            state.remoteStatus = result.status || state.remoteStatus;
            state.remoteMessage = `✅ Đã đồng bộ ${result.added} video mới`;
          } catch (err) { state.remoteMessage = `❌ ${err.message}`; }
          state.remoteBusy = false; render();
        },
      }));
      if (state.remoteStatus) {
        const status = state.remoteStatus;
        const run = status.running ? 'đang quét' : (status.last_run ? `lần cuối ${new Date(status.last_run).toLocaleString()}` : 'chưa quét');
        actions.appendChild(el('span', { className: 'muted small', textContent: `Kho server: ${status.item_count || 0} video · ${run}` }));
      }
      actions.appendChild(el('span', { className: 'muted small', textContent: state.remoteMessage }));
      box.appendChild(actions);
      return box;
    }

    // The search box lives outside the re-rendered area so typing keeps focus.
    const remoteHost = el('div');
    const formHost = el('div');
    const gridHost = el('div');
    const search = el('input', { type: 'search', className: 'library-search', placeholder: `Tìm ${kind === 'video' ? 'video' : 'ảnh'} theo tên...` }, () => renderGrid());
    root.replaceChildren(remoteHost, formHost, search, gridHost);

    function renderGrid() {
      const items = library.list();
      const matched = items.filter((item) => ns.mediaLibraries.matchesQuery(item, search.value));
      const grid = el('div', { className: 'library-grid' });
      matched.forEach((item) => {
        const tile = mediaTile(kind, item);
        tile.appendChild(el('button', {
          type: 'button',
          className: 'icon-btn tile-remove',
          textContent: '✕',
          title: 'Xóa khỏi thư viện',
          onclick: () => confirm(`Xóa "${item.title}" khỏi thư viện?`) && runTask('Xóa', () => library.remove(item.id)),
        }));
        grid.appendChild(tile);
      });
      const emptyText = items.length ? `Không tìm thấy "${search.value}"` : `${config.empty} — thêm bằng link hoặc tải file lên.`;
      gridHost.replaceChildren(matched.length ? grid : el('div', { className: 'muted', textContent: emptyText }));
    }

    function render() {
      remoteHost.replaceChildren(remoteForm() || '');
      formHost.replaceChildren(form());
      renderGrid();
    }

    library.subscribe(render);
    if (kind === 'video' && remoteLibrary) {
      loadSources();
    }
  }

  const init = (container, kind, options) => createPanel(kind, container, options);

  ns.mediaLibraryPanel = { init, mediaTile };
})(window.FbTool);
