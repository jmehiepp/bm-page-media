window.FbTool = window.FbTool || {};

(function (ns) {
  const { el, field, ctaSelect } = ns.cardFields;

  const state = { sourceUrl: '', newLink: '', clone: null, status: 'idle', error: '' };
  let root;
  let options;

  async function copyPost() {
    if (!state.sourceUrl) return;
    Object.assign(state, { status: 'loading', error: '' });
    render();
    try {
      state.clone = await ns.cloner.clonePost(state.sourceUrl, options.getPages());
      state.status = 'idle';
      options.log(`Đã sao chép ${state.clone.cards.length} thẻ từ bài gốc của ${state.clone.pageName}`);
    } catch (err) {
      Object.assign(state, { clone: null, status: 'error', error: err.message });
    }
    render();
  }

  function sourceField() {
    const wrap = el('div', { className: 'field' });
    wrap.appendChild(el('span', { textContent: 'Link bài viết gốc (Page bạn quản lý)' }));
    const row = el('div', { className: 'source-row' });
    row.appendChild(el('input', { type: 'url', value: state.sourceUrl, placeholder: 'https://www.facebook.com/.../posts/...' }, (e) => {
      state.sourceUrl = e.target.value.trim();
    }));
    row.appendChild(el('button', { type: 'button', textContent: state.status === 'loading' ? 'Đang sao chép...' : 'Sao chép bài viết', disabled: state.status === 'loading', onclick: copyPost }));
    wrap.appendChild(row);
    return wrap;
  }

  function clonedCard(card, index) {
    const box = el('div', { className: 'clone-card' });
    if (card.fetched.imageUrl) box.appendChild(el('img', { className: 'preview-media', src: card.fetched.imageUrl, alt: '' }));
    box.appendChild(el('span', { className: `badge badge-${card.type}`, textContent: `Thẻ ${index + 1} · ${card.type === 'video' ? 'Video' : 'Ảnh'}` }));
    box.appendChild(field('Headline', el('input', { value: card.headline, placeholder: 'Nhập headline' }, (e) => { card.headline = e.target.value; })));
    box.appendChild(field('Nút CTA', ctaSelect(card)));
    return box;
  }

  function clonedContent() {
    const box = el('div', { className: 'prefilled' });
    box.appendChild(el('div', { className: 'group-title', textContent: '📋 Nội dung sao chép từ bài gốc (đã điền sẵn — sửa được)' }));

    if (state.status === 'loading') box.appendChild(el('div', { className: 'muted', textContent: 'Đang đọc bài viết và lấy file video...' }));
    else if (state.status === 'error') box.appendChild(el('div', { className: 'error', textContent: state.error }));
    else if (!state.clone) box.appendChild(el('div', { className: 'muted', textContent: 'Chưa sao chép — dán link bài viết gốc rồi bấm "Sao chép bài viết".' }));
    else {
      const { clone } = state;
      box.appendChild(field('Caption', el('textarea', { rows: 3, value: clone.message, placeholder: 'Nhập caption' }, (e) => { clone.message = e.target.value; })));
      const grid = el('div', { className: 'clone-cards' });
      clone.cards.forEach((card, i) => grid.appendChild(clonedCard(card, i)));
      box.appendChild(grid);
      box.appendChild(el('div', { className: 'muted', textContent: `${clone.cards.length} thẻ · video/ảnh giữ nguyên từ bài gốc` }));
      if (clone.cards.length < 2) box.appendChild(el('div', { className: 'error', textContent: 'Bài gốc có ít hơn 2 thẻ — không đăng được dạng carousel' }));
      if (clone.permalink) box.appendChild(el('a', { className: 'muted source-link', href: clone.permalink, target: '_blank', rel: 'noopener', textContent: `Bài gốc: ${clone.permalink}` }));
    }
    return box;
  }

  function customizable() {
    const box = el('div', { className: 'customizable' });
    box.appendChild(el('div', { className: 'group-title', textContent: '🔗 Link liên kết' }));
    box.appendChild(ns.affiliateLinkPicker.build({
      label: 'Link liên kết mới (áp dụng cho tất cả thẻ) *',
      value: state.newLink,
      onChange: (value) => { state.newLink = value; },
    }));
    return box;
  }

  function render() {
    root.replaceChildren(sourceField(), clonedContent(), customizable());
  }

  function getContent() {
    if (!state.clone) throw new Error('Chưa sao chép bài viết gốc');
    if (!state.newLink) throw new Error('Nhập link liên kết mới');
    return { message: state.clone.message, defaultLink: state.newLink, cards: state.clone.cards };
  }

  function init(container, opts) {
    root = container;
    options = opts;
    render();
  }

  const peek = () => (state.clone ? { message: state.clone.message, cards: state.clone.cards } : { message: '', cards: [] });

  ns.clonePanel = { init, getContent, peek };
})(window.FbTool);
