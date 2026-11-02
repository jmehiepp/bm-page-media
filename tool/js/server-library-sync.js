window.FbTool = window.FbTool || {};

(function (ns) {
  const available = window.location.protocol === 'file:' || !window.location.hostname || ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
  function base() {
    if (window.location.port === '8000') return window.location.origin;
    return 'http://127.0.0.1:8000';
  }

  async function request(path, options = {}) {
    if (!available) throw new Error('Kho quét trên máy chỉ dùng trong bản local. Bản web hỗ trợ thêm video từ máy hoặc link trực tiếp.');
    const response = await fetch(`${base()}${path}`, {
      ...options,
      signal: AbortSignal.timeout(path.endsWith('/scan') ? 330000 : 15000),
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    }).catch(() => {
      throw new Error('Không kết nối được bộ quét ở cổng 8000. Hãy bật fb-scraper/START.sh rồi bấm “Kết nối lại”. Chưa tải được danh sách Page từ server.');
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `Server trả HTTP ${response.status}`);
    return data;
  }

  const cacheKey = () => `fbtool.scan-sources:${base()}`;
  function cachedSources() {
    try {
      const sources = JSON.parse(localStorage.getItem(cacheKey()) || '[]');
      return Array.isArray(sources) ? sources.filter((source) => typeof source === 'string') : [];
    } catch { return []; }
  }
  async function sourceRequest(options) {
    const result = await request('/api/carousel/library/sources', options);
    if (!Array.isArray(result.sources)) throw new Error('Server trả danh sách Page không hợp lệ');
    try { localStorage.setItem(cacheKey(), JSON.stringify(result.sources)); } catch { /* Cache is optional. */ }
    return result;
  }
  const getSources = () => sourceRequest();

  const addSource = (url) => sourceRequest({
    method: 'POST', body: JSON.stringify({ url }),
  });

  const removeSource = (url) => sourceRequest({
    method: 'DELETE', body: JSON.stringify({ url }),
  });

  const scanNow = () => request('/api/carousel/library/scan', { method: 'POST' });

  const syncs = new WeakMap();
  function syncVideos(library) {
    if (syncs.has(library)) return syncs.get(library);
    const run = syncVideosOnce(library).finally(() => syncs.delete(library));
    syncs.set(library, run);
    return run;
  }

  async function syncVideosOnce(library) {
    // IndexedDB must be loaded before deciding which server files are missing.
    await library.refresh();
    const { items, status } = await request('/api/carousel/library/items');
    let added = 0;
    for (const item of items) {
      const remoteIds = [...new Set([item.id, ...(item.remote_ids || [])])];
      const local = library.list().find((entry) =>
        (item.content_hash && entry.contentHash === item.content_hash) ||
        remoteIds.some((id) => entry.remoteId === id || (entry.remoteIds || []).includes(id)));
      if (local) {
        await library.updateMetadata(local.id, {
          remoteIds,
          caption: local.caption || item.caption || '',
          sourcePage: item.source_page || local.sourcePage || '',
          postUrl: item.post_url || local.postUrl || '',
        });
        continue;
      }
      const response = await fetch(`${base()}/api/carousel/library/items/${encodeURIComponent(item.id)}/download`);
      if (!response.ok) throw new Error(`Không tải được ${item.filename || item.id}`);
      const blob = await response.blob();
      const file = new File([blob], item.filename || `${item.id}.mp4`, { type: blob.type || 'video/mp4' });
      await library.addFiles([file], [{
        remoteId: item.id,
        remoteIds,
        title: item.title || item.filename || `${item.id}.mp4`,
        caption: item.caption || '',
        sourcePage: item.source_page || '',
        postUrl: item.post_url || '',
      }]);
      added += 1;
    }
    return { added, total: items.length, status };
  }

  ns.serverLibrary = { available, getSources, cachedSources, addSource, removeSource, scanNow, syncVideos };
})(window.FbTool);
