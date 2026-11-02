window.FbTool = window.FbTool || {};

// Affiliate links are small browser-local records, separate from media blobs.
(function (ns) {
  const STORAGE_KEY = 'fbtool.affiliate-links.v1';
  let items = [];
  const listeners = new Set();

  const emit = () => listeners.forEach((listener) => listener(items));

  function read() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      items = Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.url) : [];
    } catch {
      items = [];
    }
    items.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    return items;
  }

  function write() {
    items.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      throw new Error('Không thể lưu kho link AFF trong trình duyệt');
    }
    emit();
    window.dispatchEvent(new Event('fbtool:affiliate-links-changed'));
  }

  function validateUrl(value) {
    let parsed;
    try {
      parsed = new URL(String(value || '').trim());
    } catch {
      throw new Error('Link AFF không hợp lệ');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Link AFF phải bắt đầu bằng http:// hoặc https://');
    return parsed.href;
  }

  function add({ name, url }) {
    const normalizedUrl = validateUrl(url);
    const title = String(name || '').trim() || normalizedUrl;
    const now = Date.now();
    const existing = items.find((item) => item.url === normalizedUrl);
    if (existing) {
      existing.name = title;
      existing.updatedAt = now;
    } else {
      items.push({ id: `aff-${now}-${Math.random().toString(36).slice(2, 8)}`, name: title, url: normalizedUrl, createdAt: now, updatedAt: now });
    }
    write();
    return existing || items[items.length - 1];
  }

  function remove(id) {
    items = items.filter((item) => item.id !== id);
    write();
  }

  function matchesQuery(item, query) {
    const needle = String(query || '').trim().toLowerCase();
    return !needle || item.name.toLowerCase().includes(needle) || item.url.toLowerCase().includes(needle);
  }

  read();
  ns.affiliateLinks = {
    list: () => items.slice(),
    add,
    remove,
    matchesQuery,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(items);
      return () => listeners.delete(listener);
    },
  };
})(window.FbTool);
