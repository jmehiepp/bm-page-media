window.FbTool = window.FbTool || {};

(function (ns) {
  const DB_NAME = 'fbtool-media';
  const STORE = 'items';
  let dbPromise = null;

  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(new Error('Trình duyệt không cho lưu thư viện (IndexedDB bị chặn)'));
      });
    }
    return dbPromise;
  }

  async function run(mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => {
        const err = tx.error || req.error;
        reject(new Error(err && err.name === 'QuotaExceededError' ? 'Hết dung lượng lưu trữ trình duyệt — xóa bớt mục trong thư viện' : `Lỗi lưu thư viện: ${err && err.message}`));
      };
    });
  }

  ns.localMediaDb = {
    put: (item) => run('readwrite', (store) => store.put(item)),
    get: (id) => run('readonly', (store) => store.get(id)),
    getAll: () => run('readonly', (store) => store.getAll()),
    remove: (id) => run('readwrite', (store) => store.delete(id)),
  };
})(window.FbTool);
