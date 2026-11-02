window.FbTool = window.FbTool || {};

(function (ns) {
  const CTA_TYPES = [
    ['OPEN_LINK', 'Open link'],
    ['LEARN_MORE', 'Learn more'],
    ['SHOP_NOW', 'Shop now'],
    ['BUY_NOW', 'Buy now'],
    ['ORDER_NOW', 'Order now'],
    ['GET_OFFER', 'Get offer'],
    ['WATCH_MORE', 'Watch more'],
    ['SIGN_UP', 'Sign up'],
    ['CONTACT_US', 'Contact us'],
    ['NO_BUTTON', 'Không nút'],
  ];

  function el(tag, attrs = {}, onInput) {
    const node = document.createElement(tag);
    Object.assign(node, attrs);
    if (onInput) node.addEventListener(tag === 'select' || attrs.type === 'file' ? 'change' : 'input', onInput);
    return node;
  }

  function field(label, input) {
    const wrap = el('label', { className: 'field' });
    wrap.appendChild(el('span', { textContent: label }));
    wrap.appendChild(input);
    return wrap;
  }

  // Any edit to media invalidates the cached upload.
  const setMedia = (card, key, value) => {
    card[key] = value;
    card.uploaded = null;
  };

  const ctaLabel = (type) => (CTA_TYPES.find(([v]) => v === type) || [null, 'Open link'])[1];

  function ctaSelect(card) {
    const select = el('select', {}, (e) => { card.ctaType = e.target.value; });
    select.innerHTML = CTA_TYPES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    select.value = card.ctaType;
    return select;
  }

  function typeToggle(card, rerender) {
    const toggle = el('div', { className: 'segmented mini' });
    [['video', 'Video'], ['image', 'Ảnh']].forEach(([type, label]) => {
      toggle.appendChild(el('button', {
        type: 'button',
        textContent: label,
        className: card.type === type ? 'active' : '',
        onclick: () => {
          if (card.type === type) return;
          setMedia(card, 'type', type);
          if (card.source === 'link') {
            card.source = undefined;
            card.fetched = null;
          }
          rerender();
        },
      }));
    });
    return toggle;
  }

  // The whole media area is the picker trigger, which is faster than a separate button.
  function mediaSlot(card, rerender) {
    const kind = card.type;
    const key = kind === 'video' ? 'libraryVideo' : 'libraryImage';
    const selected = card[key];
    const linkedVideo = kind === 'video' && card.source === 'link' && card.fetched && card.fetched.videoUrl;
    const label = kind === 'video' ? 'video' : 'ảnh';
    const slot = el('button', { type: 'button', className: `media-slot${selected || linkedVideo ? ' has-media' : ''}`, title: selected ? `Đổi ${label}` : linkedVideo ? 'Video từ bài gốc — bấm để đổi' : `Chọn ${label}` });
    if (selected && selected.thumb) slot.appendChild(el('img', { src: selected.thumb, alt: '' }));
    if (selected) {
      if (kind === 'video') slot.appendChild(el('span', { className: 'play-badge', textContent: '▶' }));
      slot.appendChild(el('span', { className: 'media-caption', textContent: selected.title }));
    } else if (linkedVideo) {
      if (card.fetched.imageUrl) slot.appendChild(el('img', { src: card.fetched.imageUrl, alt: '' }));
      slot.appendChild(el('span', { className: 'play-badge', textContent: '▶' }));
      slot.appendChild(el('span', { className: 'media-caption', textContent: 'Video từ bài gốc' }));
    } else {
      slot.appendChild(el('span', { className: 'media-empty', textContent: `＋ Chọn ${label} từ thư viện` }));
    }
    slot.onclick = () => ns.mediaPicker.open(kind, selected && selected.id, (item) => {
      setMedia(card, key, {
        id: item.id,
        title: item.title,
        thumb: item.thumb,
        caption: item.caption || '',
        sourcePage: item.sourcePage || '',
        postUrl: item.postUrl || '',
      });
      card.source = undefined;
      card.fetched = null;
      // Caption belongs to the post, so the first selected library item can
      // provide it to the top-level Caption field. The host decides whether
      // it is safe to fill the field without overwriting user input.
      document.dispatchEvent(new CustomEvent('fbtool:library-media-selected', {
        detail: { kind, item },
      }));
      rerender();
    });
    return slot;
  }

  function thumbnailButton(card) {
    const label = el('label', { className: 'file-button small', textContent: card.thumbnailFile ? `Thumbnail: ${card.thumbnailFile.name}` : 'Chọn ảnh thumbnail riêng' });
    label.appendChild(el('input', { type: 'file', accept: 'image/*', hidden: true }, (e) => {
      setMedia(card, 'thumbnailFile', e.target.files[0]);
      label.firstChild.textContent = `Thumbnail: ${e.target.files[0].name}`;
    }));
    return label;
  }

  function manualFields(card, rerender) {
    const more = el('details', { className: 'card-more', open: Boolean(card.description || card.link || card.thumbnailFile) });
    more.appendChild(el('summary', { textContent: 'Tùy chọn thêm' }));
    more.appendChild(field('Mô tả', el('input', { value: card.description, placeholder: 'Không bắt buộc' }, (e) => { card.description = e.target.value; })));
    more.appendChild(ns.affiliateLinkPicker.build({
      label: 'Link riêng cho thẻ',
      value: card.link,
      onChange: (value) => { card.link = value; },
    }));
    if (card.type === 'video') more.appendChild(thumbnailButton(card));

    return [
      typeToggle(card, rerender),
      mediaSlot(card, rerender),
      field('Headline', el('input', { value: card.headline, placeholder: 'Săn sale giá tốt tại đây 👉' }, (e) => { card.headline = e.target.value; })),
      field('Nút CTA', ctaSelect(card)),
      more,
    ];
  }

  ns.cardFields = { el, field, ctaSelect, ctaLabel, manualFields };
})(window.FbTool);
