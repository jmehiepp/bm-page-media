window.FbTool = window.FbTool || {};

// Public Facebook posts are resolved by the local fb-scraper browser session.
// The browser downloads through the same local service so CDN CORS does not
// prevent the file from entering IndexedDB.
(function (ns) {
  const base = () => {
    if (ns.publicResolverBase) return ns.publicResolverBase.replace(/\/$/, '');
    if (location.port === '8000') return location.origin;
    return 'http://127.0.0.1:8000';
  };

  async function jsonRequest(path, payload) {
    let response;
    try {
      response = await fetch(`${base()}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new Error('Chưa kết nối bộ tải Facebook ở localhost:8000 — hãy bật fb-scraper rồi thử lại');
    }
    let data = {};
    try { data = await response.json(); } catch { /* handled below */ }
    if (!response.ok) throw new Error(data.detail || `Bộ tải Facebook trả về HTTP ${response.status}`);
    return data;
  }

  async function downloadVideo(url, index) {
    const response = await fetch(`${base()}/api/carousel/public-post/download`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
    }).catch(() => null);
    if (!response || !response.ok) {
      let detail = '';
      try { detail = (await response.json()).detail || ''; } catch { /* no JSON body */ }
      throw new Error(detail || `Không tải được video thẻ ${index}`);
    }
    const blob = await response.blob();
    if (!blob.size || /^text\//i.test(blob.type || '')) throw new Error(`Video thẻ ${index} không phải file hợp lệ`);
    return new File([blob], `facebook-post-the-${index}.mp4`, { type: blob.type || 'video/mp4' });
  }

  async function importPost(postUrl) {
    const result = await jsonRequest('/api/carousel/public-post', { url: postUrl });
    const files = [];
    for (const video of result.videos || []) files.push(await downloadVideo(video.url, video.index));
    if (!files.length) throw new Error('Không tìm thấy video trong bài viết public');
    const saved = await ns.mediaLibraries.video.addFiles(files, files.map((file, index) => ({
      caption: result.caption || '',
      postUrl: result.post_url || postUrl,
      sourcePage: result.source_page || '',
      videoIndex: (result.videos[index] && result.videos[index].index) || index + 1,
    })));
    return { ...result, addedIds: saved.addedIds || [] };
  }

  ns.publicPostResolver = { importPost };
})(window.FbTool);
