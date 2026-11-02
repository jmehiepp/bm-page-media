window.FbTool = window.FbTool || {};

(function (ns) {
  const { el } = ns.cardFields;

  function build({ label, value = '', onChange }) {
    const wrap = el('label', { className: 'field affiliate-picker-field' });
    wrap.appendChild(el('span', { textContent: label }));
    const row = el('div', { className: 'affiliate-picker' });
    const select = el('select');
    const input = el('input', { type: 'url', value, placeholder: 'Hoặc dán link AFF mới...' });

    function refreshOptions() {
      const current = input.value;
      select.replaceChildren(el('option', { value: '', textContent: 'Chọn link AFF đã lưu...' }));
      ns.affiliateLinks.list().forEach((item) => select.appendChild(el('option', { value: item.url, textContent: `${item.name} · ${item.url}` })));
      select.value = ns.affiliateLinks.list().some((item) => item.url === current) ? current : '';
    }

    select.addEventListener('change', () => {
      input.value = select.value;
      onChange(input.value);
    });
    input.addEventListener('input', () => {
      select.value = '';
      onChange(input.value.trim());
    });
    row.append(select, input);
    wrap.appendChild(row);
    refreshOptions();
    window.addEventListener('fbtool:affiliate-links-changed', refreshOptions);
    return wrap;
  }

  ns.affiliateLinkPicker = { build };
})(window.FbTool);
