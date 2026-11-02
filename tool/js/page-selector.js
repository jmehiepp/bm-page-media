window.FbTool = window.FbTool || {};

(function (ns) {
  let pages = [];
  let root;
  let countEl;

  const selectedIds = () => new Set([...root.querySelectorAll('input:checked')].map((i) => i.value));

  function render(keepSelected = new Set()) {
    countEl.textContent = pages.length ? `${pages.length} Page` : '';
    if (!pages.length) {
      root.innerHTML = '<span class="muted">Chưa có Page — kết nối token được cấp quyền quản lý Page</span>';
      return;
    }
    root.replaceChildren(...pages.map((page) => {
      const chip = document.createElement('label');
      chip.className = 'page-chip';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = page.id;
      input.checked = keepSelected.has(page.id) || pages.length === 1;
      const name = document.createElement('span');
      name.textContent = page.name;
      chip.append(input, name);
      return chip;
    }));
  }

  function setPages(list) {
    const previousIds = new Set(pages.map((p) => p.id));
    const keep = selectedIds();
    const added = previousIds.size ? list.filter((p) => !previousIds.has(p.id)) : [];
    pages = list;
    render(keep);
    return { added };
  }

  const selected = () => {
    const ids = selectedIds();
    return pages.filter((p) => ids.has(p.id));
  };

  function init(container, counter) {
    root = container;
    countEl = counter;
  }

  ns.pageSelector = { init, setPages, selected, list: () => pages };
})(window.FbTool);
