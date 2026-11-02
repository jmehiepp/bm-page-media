window.FbTool = window.FbTool || {};

(function (ns) {
  const { el } = ns.cardFields;
  const LABELS = { video: 'video', image: 'ảnh' };

  function open(kind, selectedId, onSelect) {
    const dialog = document.getElementById('media-picker');
    const header = el('div', { className: 'picker-head' });
    header.appendChild(el('strong', { textContent: `Chọn ${LABELS[kind]} từ thư viện` }));
    header.appendChild(el('button', { type: 'button', textContent: '✕', className: 'icon-btn', onclick: () => dialog.close() }));

    const items = ns.mediaLibraries[kind].list();
    const ready = items.filter((item) => item.status === 'ready');
    if (!ready.length) {
      const message = items.length
        ? `${LABELS[kind]} trong thư viện chưa xử lý xong — bấm "Làm mới" ở tab Thư viện sau ít phút.`
        : `Thư viện ${LABELS[kind]} trống — thêm ở tab Thư viện trước.`;
      dialog.replaceChildren(header, el('div', { className: 'muted', textContent: message }));
      dialog.showModal();
      return;
    }

    const body = el('div');
    const search = el('input', { type: 'search', className: 'library-search', placeholder: `Tìm ${LABELS[kind]} theo tên...` }, () => renderGrid());

    function renderGrid() {
      const matched = ready.filter((item) => ns.mediaLibraries.matchesQuery(item, search.value));
      if (!matched.length) {
        body.replaceChildren(el('div', { className: 'muted', textContent: `Không tìm thấy "${search.value}"` }));
        return;
      }
      const grid = el('div', { className: 'library-grid' });
      matched.forEach((item) => grid.appendChild(ns.mediaLibraryPanel.mediaTile(kind, item, (picked) => {
        onSelect(picked);
        dialog.close();
      }, item.id === selectedId)));
      body.replaceChildren(grid);
    }

    renderGrid();
    dialog.replaceChildren(header, search, body);
    dialog.showModal();
    search.focus();
  }

  ns.mediaPicker = { open };
})(window.FbTool);
