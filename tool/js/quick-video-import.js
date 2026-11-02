window.FbTool = window.FbTool || {};

// Paste source links, import each video into the local library, then fill the carousel cards.
(function (ns) {
  const { el } = ns.cardFields;
  const FACEBOOK_POST = /(^|\.)(facebook\.com|fb\.watch)$/i;

  function isPostLink(url) {
    try {
      return FACEBOOK_POST.test(new URL(url).hostname);
    } catch {
      return false;
    }
  }

  // Accept a URL pasted from a chat/document too, e.g. Markdown links or a
  // trailing full stop. The tool still processes one source per line.
  function extractUrls(value) {
    return [...new Set((value.match(/https?:\/\/[^\s<>()[\]{}]+/gi) || [])
      .map((url) => url.replace(/[.,;:!?]+$/, ''))
      .filter(Boolean))];
  }

  function init(root, { getPages, log }) {
    const state = { links: '', busy: false, message: '' };

    async function importLink(url) {
      const library = ns.mediaLibraries.video;
      if (!isPostLink(url)) {
        const addedIds = (await library.addByUrl(url)).addedIds || [];
        return { sources: addedIds.map((libraryId) => ({ libraryId })) };
      }

      // A public post can be outside the managed Pages available to Graph API.
      // Try Graph first when configured, then use the local browser resolver.
      let result;
      try {
        result = await library.importFromPost(url, getPages(), { allowFailed: true });
      } catch (graphError) {
        if (!ns.publicPostResolver) throw graphError;
        const publicResult = await ns.publicPostResolver.importPost(url);
        return { sources: (publicResult.addedIds || []).map((libraryId) => ({ libraryId })) };
      }

      // Keep the resolved card metadata so a CDN/CORS failure can fall back
      // to Facebook's server-side file_url upload at publish time. If Graph
      // found no usable file, let the browser resolver download the public post.
      if (!(result.addedIds || []).length && ns.publicPostResolver) {
        const publicResult = await ns.publicPostResolver.importPost(url);
        return { sources: (publicResult.addedIds || []).map((libraryId) => ({ libraryId })) };
      }
      const failed = new Set(result.failed || []);
      let importedCursor = 0;
      const sources = (result.assets || []).flatMap((asset) => {
        if (failed.has(asset.index)) {
          const card = result.clone && result.clone.cards && result.clone.cards[asset.index - 1];
          return card && card.fetched && card.fetched.videoUrl ? [{ linkedCard: card }] : [];
        }
        const libraryId = result.addedIds && result.addedIds[importedCursor++];
        return libraryId ? [{ libraryId }] : [];
      });
      return { sources };
    }

    async function run() {
      const urls = extractUrls(state.links);
      if (!urls.length) return;
      Object.assign(state, { busy: true, message: `⏳ Đang tải ${urls.length} link...` });
      render();

      const sources = [];
      const failed = [];
      for (const url of urls) {
        try {
          const result = await importLink(url);
          sources.push(...result.sources);
        } catch (err) {
          failed.push(`${url}: ${err.message}`);
        }
      }

      const byId = new Map(ns.mediaLibraries.video.list().map((item) => [item.id, item]));
      const videoSources = sources.flatMap((source) => {
        if (source.libraryId) {
        const item = byId.get(source.libraryId);
          return item ? [{ source: undefined, libraryVideo: {
            id: item.id,
            title: item.title,
            thumb: item.thumb,
            caption: item.caption || '',
          }, fetched: null }] : [];
        }
        return source.linkedCard ? [{
          source: 'link',
          libraryVideo: null,
          fetched: source.linkedCard.fetched,
          headline: source.linkedCard.headline || 'Video từ bài gốc',
          description: source.linkedCard.description || '',
          link: source.linkedCard.link || '',
          ctaType: source.linkedCard.ctaType || 'OPEN_LINK',
        }] : [];
      });
      const linkedCount = videoSources.filter((source) => source.source === 'link').length;
      if (videoSources.length) {
        ns.cardEditor.fillVideoSources(videoSources);
        root.dispatchEvent(new Event('input', { bubbles: true }));
      }
      state.message = videoSources.length
        ? `✅ Đã nhận ${videoSources.length} video và tạo thẻ${linkedCount ? ` (Facebook sẽ tải trực tiếp ${linkedCount} video khi đăng)` : ''} — kiểm tra caption, headline và link liên kết`
        : '❌ Không tải được video nào';
      failed.forEach((message) => log(`❌ Tải video: ${message}`));
      state.busy = false;
      state.links = videoSources.length ? '' : state.links;
      render();
    }

    function render() {
      const box = el('div', { className: 'quick-import' });
      box.appendChild(el('div', { className: 'subhead-line', textContent: 'Dán link bài viết Facebook (mỗi link 1 dòng) — công cụ tự mở bài, rà toàn bộ video, tải về và tạo thẻ. Link public dùng bộ tải Facebook ở localhost:8000.' }));
      const row = el('div', { className: 'source-row' });
      row.appendChild(el('textarea', { rows: 2, value: state.links, placeholder: 'https://www.facebook.com/kenhnhachay/posts/pfbid...\nhoặc https://.../video.mp4', disabled: state.busy }, (e) => { state.links = e.target.value; }));
      row.appendChild(el('button', { type: 'button', className: 'primary', textContent: 'Tải video & tạo thẻ', disabled: state.busy, onclick: run }));
      box.appendChild(row);
      if (state.message) box.appendChild(el('div', { className: 'muted', textContent: state.message }));
      root.replaceChildren(box);
    }

    render();
  }

  ns.quickVideoImport = { init };
})(window.FbTool);
