window.FbTool = window.FbTool || {};

(function (ns) {
  const { el } = ns.cardFields;

  function init(root) {
    const state = { name: '', url: '', query: '', message: '' };

    function render() {
      const box = el('div', { className: 'affiliate-library' });
      box.appendChild(el('p', { className: 'muted small', textContent: 'Lưu các link AFF để chọn nhanh khi soạn bài. Link được lưu riêng trên trình duyệt này.' }));

      const form = el('div', { className: 'affiliate-form' });
      form.appendChild(el('input', { value: state.name, placeholder: 'Tên link / sản phẩm', className: 'affiliate-name' }, (event) => { state.name = event.target.value; }));
      form.appendChild(el('input', { type: 'url', value: state.url, placeholder: 'https://...link-affiliate...', className: 'affiliate-url' }, (event) => { state.url = event.target.value.trim(); }));
      form.appendChild(el('button', {
        type: 'button',
        className: 'primary',
        textContent: '＋ Lưu link AFF',
        onclick: () => {
          try {
            ns.affiliateLinks.add({ name: state.name, url: state.url });
            state.name = '';
            state.url = '';
            state.message = '✅ Đã lưu link AFF';
          } catch (error) {
            state.message = `❌ ${error.message}`;
          }
          render();
        },
      }));
      box.appendChild(form);

      const actions = el('div', { className: 'row affiliate-actions' });
      actions.appendChild(el('input', { type: 'search', value: state.query, className: 'library-search', placeholder: 'Tìm tên hoặc URL...', }, (event) => {
        state.query = event.target.value;
        renderList(listHost);
      }));
      actions.appendChild(el('span', { className: 'muted small', textContent: state.message }));
      box.appendChild(actions);

      const listHost = el('div');
      box.appendChild(listHost);
      root.replaceChildren(box);
      renderList(listHost);
    }

    function renderList(host) {
      if (!host) return;
      const list = ns.affiliateLinks.list().filter((item) => ns.affiliateLinks.matchesQuery(item, state.query));
      if (!list.length) {
        host.replaceChildren(el('div', { className: 'muted', textContent: state.query ? `Không tìm thấy "${state.query}"` : 'Chưa có link AFF — thêm link ở ô phía trên.' }));
        return;
      }
      const rows = list.map((item) => {
        const row = el('div', { className: 'affiliate-link-item' });
        const info = el('div', { className: 'affiliate-link-info' });
        info.appendChild(el('strong', { textContent: item.name }));
        info.appendChild(el('a', { href: item.url, target: '_blank', rel: 'noopener', textContent: item.url }));
        row.appendChild(info);
        row.appendChild(el('button', {
          type: 'button', className: 'icon-btn danger', textContent: '✕', title: 'Xóa link AFF',
          onclick: () => {
            if (confirm(`Xóa "${item.name}" khỏi kho link AFF?`)) ns.affiliateLinks.remove(item.id);
          },
        }));
        return row;
      });
      const listBox = el('div', { className: 'affiliate-link-list' });
      listBox.replaceChildren(...rows);
      host.replaceChildren(listBox);
    }

    ns.affiliateLinks.subscribe(() => render());
  }

  ns.affiliateLibraryPanel = { init };
})(window.FbTool);
