window.FbTool = window.FbTool || {};

// Media library kept in this browser (IndexedDB). Facebook upload happens only at publish time.
(function (ns) {
  const RETENTION_DAYS = 45;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const SOCIAL_PAGE_HOSTS = /(^|\.)(facebook\.com|fb\.watch|tiktok\.com|youtube\.com|youtu\.be|instagram\.com|douyin\.com)$/i;
  const LABELS = { video: 'video', image: 'ảnh' };

  async function fingerprint(blob) {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  const remoteIdsOf = (item) => [...new Set([item.remoteId, ...(item.remoteIds || [])].filter(Boolean))];
  function mergeMetadata(target, incoming) {
    const merged = { ...target, remoteIds: [...new Set([...remoteIdsOf(target), ...remoteIdsOf(incoming)])] };
    for (const key of ['caption', 'sourcePage', 'postUrl', 'remoteId']) {
      if (!merged[key] && incoming[key]) merged[key] = incoming[key];
    }
    return merged;
  }

  function validateFileUrl(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Link không hợp lệ');
    }
    if (SOCIAL_PAGE_HOSTS.test(parsed.hostname)) {
      throw new Error('Ô này chỉ nhận link file trực tiếp — link bài viết Facebook hãy dán vào ô bên dưới');
    }
  }

  async function fetchBlob(url) {
    const res = await fetch(url, { credentials: 'omit' }).catch(() => null);
    if (!res || !res.ok) return null;
    const blob = await res.blob().catch(() => null);
    if (!blob || !blob.size) return null;
    // Facebook may return an HTML login/error document with HTTP 200 when a
    // CDN URL has expired. Never put that response in the media library.
    const contentType = (res.headers.get('content-type') || blob.type || '').toLowerCase();
    if (contentType && /^(text\/|application\/(json|xhtml|xml|javascript))/.test(contentType)) return null;
    return blob;
  }

  function createLibrary(kind) {
    const db = ns.localMediaDb;
    let items = [];
    let pending = Promise.resolve();
    // Serialize hashing + writes, including imports from another open tab.
    function exclusive(task) {
      const run = pending.then(() => typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request(`fbtool-media-${kind}`, task) : task());
      pending = run.catch(() => {});
      return run;
    }
    const listeners = new Set();
    const emit = () => listeners.forEach((fn) => fn(items));
    const daysLeft = (item) => Math.ceil((item.createdAt + RETENTION_DAYS * DAY_MS - Date.now()) / DAY_MS);
    const toListItem = ({ blob, ...meta }) => ({ ...meta, status: 'ready', managed: true, size: blob.size });

    async function refreshUnlocked() {
      const all = (await db.getAll()).filter((item) => item.kind === kind);
      const expired = all.filter((item) => daysLeft(item) <= 0);
      for (const item of expired) await db.remove(item.id);
      const groups = new Map();
      const active = all.filter((item) => !expired.includes(item)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      for (const item of active) {
        if (!item.contentHash) {
          item.contentHash = await fingerprint(item.blob);
          await db.put(item);
        }
        const existing = groups.get(item.contentHash);
        const meta = toListItem(item);
        if (existing) {
          groups.set(item.contentHash, { ...mergeMetadata(existing, meta), duplicateIds: [...existing.duplicateIds, item.id] });
        } else {
          groups.set(item.contentHash, { ...meta, remoteIds: remoteIdsOf(meta), duplicateIds: [] });
        }
      }
      // Old records remain addressable for cards already using their IDs.
      items = [...groups.values()].sort((a, b) => b.createdAt - a.createdAt);
      emit();
      return { items, removedCount: expired.length, duplicateCount: active.length - items.length };
    }
    const refresh = () => exclusive(refreshUnlocked);

    async function save(blob, title, metadata = {}) {
      return exclusive(async () => {
        await refreshUnlocked();
        const contentHash = await fingerprint(blob);
        const existing = items.find((item) => item.contentHash === contentHash);
        if (existing) {
          const record = await db.get(existing.id);
          await db.put(mergeMetadata(mergeMetadata(record, existing), metadata));
          return existing.id;
        }
        const { thumb, length } = await ns.mediaThumbnail.create(kind, blob);
        const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await db.put({ ...metadata, id, kind, title: metadata.title || title, blob, thumb, length, contentHash, createdAt: Date.now(), remoteIds: remoteIdsOf(metadata) });
        return id;
      });
    }

    async function addByUrl(url, title) {
      validateFileUrl(url);
      const blob = await fetchBlob(url);
      if (!blob) throw new Error(`Không tải được ${LABELS[kind]} từ link (máy chủ chặn tải) — tải file về rồi dùng "Tải file từ máy"`);
      const id = await save(blob, title || decodeURIComponent(url.split('/').pop().split('?')[0]));
      return { ...(await refresh()), addedIds: [id] };
    }

    async function addFiles(files, metadata = []) {
      const addedIds = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        addedIds.push(await save(file, file.name, metadata[i] || {}));
      }
      return { ...(await refresh()), addedIds };
    }

    async function importFromPost(postUrl, pages, { allowFailed = false } = {}) {
      const { clone, assets } = await postAssets(kind, postUrl, pages);
      const failed = [];
      const addedIds = [];
      for (const asset of assets) {
        const blob = await fetchBlob(asset.url);
        if (blob) addedIds.push(await save(blob, `${clone.pageName} - thẻ ${asset.index}`, {
          caption: clone.message || '',
          postUrl,
          sourcePage: clone.pageName || '',
          videoIndex: asset.index,
        }));
        else failed.push(asset.index);
      }
      const result = await refresh();
      if (failed.length === assets.length && !allowFailed) throw new Error(`Facebook chặn tải ${LABELS[kind]} (thẻ ${failed.join(', ')}) — dùng "Tải về máy" rồi "Tải file từ máy"`);
      return {
        ...result,
        addedIds,
        importedCount: assets.length - failed.length,
        failed,
        clone,
        assets,
      };
    }

    async function remove(id) {
      return exclusive(async () => {
        await refreshUnlocked();
        const item = items.find((entry) => entry.id === id || entry.duplicateIds.includes(id));
        for (const recordId of item ? [item.id, ...item.duplicateIds] : [id]) await db.remove(recordId);
        return refreshUnlocked();
      });
    }

    async function getBlob(id) {
      const item = await db.get(id);
      if (!item) throw new Error(`${LABELS[kind]} đã bị xóa khỏi thư viện — chọn lại`);
      return item.blob;
    }

    async function updateMetadata(id, metadata = {}) {
      return exclusive(async () => {
        const item = await db.get(id);
        if (item) await db.put({ ...item, ...metadata, remoteIds: [...new Set([...remoteIdsOf(item), ...remoteIdsOf(metadata)])] });
        return refreshUnlocked();
      });
    }

    return {
      refresh,
      addByUrl,
      addFiles,
      importFromPost,
      remove,
      getBlob,
      updateMetadata,
      daysLeft,
      list: () => items,
      subscribe: (fn) => {
        listeners.add(fn);
        fn(items);
      },
    };
  }

  // Works only for posts of pages the connected user manages.
  async function postAssets(kind, postUrl, pages) {
    const clone = await ns.cloner.clonePost(postUrl, pages);
    const assets = clone.cards
      .map((card, i) => ({ url: kind === 'video' ? card.fetched.videoUrl : !card.fetched.videoUrl && card.fetched.imageUrl, index: i + 1 }))
      .filter((asset) => asset.url);
    if (!assets.length) throw new Error(`Bài viết không có ${LABELS[kind]} nào`);
    return { clone, assets };
  }

  function saveBlob(blob, filename) {
    const href = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href, download: filename });
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60000);
  }

  // When the CDN blocks browser fetches, the direct links are returned for manual saving.
  async function downloadFromPost(kind, postUrl, pages) {
    const { clone, assets } = await postAssets(kind, postUrl, pages);
    const slug = normalizeText(clone.pageName).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'post';
    const links = [];
    let downloadedCount = 0;
    for (const asset of assets) {
      const blob = await fetchBlob(asset.url);
      if (blob) {
        saveBlob(blob, `${slug}-the-${asset.index}.${kind === 'video' ? 'mp4' : 'jpg'}`);
        downloadedCount += 1;
      } else {
        links.push({ label: `Thẻ ${asset.index}`, url: asset.url });
      }
    }
    return { downloadedCount, links };
  }

  // Accent-insensitive so "vay" matches "váy".
  const normalizeText = (text) => (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const matchesQuery = (item, query) => {
    const needle = normalizeText(query.trim());
    return normalizeText(item.title).includes(needle) || normalizeText(item.caption).includes(needle);
  };

  ns.mediaLibraries = {
    video: createLibrary('video'),
    image: createLibrary('image'),
    RETENTION_DAYS,
    matchesQuery,
    downloadFromPost,
  };
})(window.FbTool);
