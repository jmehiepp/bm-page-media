window.FbTool = window.FbTool || {};

(function (ns) {
  const { el, ctaLabel } = ns.cardFields;

  function thumbOf(card) {
    if (card.fetched) return card.fetched.imageUrl;
    const media = card.type === 'video' ? card.libraryVideo : card.libraryImage;
    return media && media.thumb;
  }

  function previewCard(card) {
    const box = el('div', { className: 'pv-card' });
    const media = el('div', { className: 'pv-media' });
    const thumb = thumbOf(card);
    if (!thumb) media.appendChild(el('span', { className: 'muted', textContent: card.type === 'video' ? 'Chưa chọn video' : 'Chưa chọn ảnh' }));
    else {
      media.appendChild(el('img', { src: thumb, alt: '' }));
      if (card.type === 'video') media.appendChild(el('span', { className: 'pv-play', textContent: '▶' }));
    }
    box.appendChild(media);

    const foot = el('div', { className: 'pv-foot' });
    foot.appendChild(el('div', { className: 'pv-headline', textContent: card.headline || 'Headline' }));
    if (card.ctaType !== 'NO_BUTTON') foot.appendChild(el('span', { className: 'pv-cta', textContent: ctaLabel(card.ctaType) }));
    box.appendChild(foot);
    return box;
  }

  function render(container, { pageName, message, cards, showEndCard }) {
    const post = el('div', { className: 'pv-post' });
    const head = el('div', { className: 'pv-head' });
    head.appendChild(el('span', { className: 'pv-avatar', textContent: (pageName || 'P').charAt(0).toUpperCase() }));
    const meta = el('div');
    meta.appendChild(el('div', { className: 'pv-page', textContent: pageName || 'Tên Page' }));
    meta.appendChild(el('div', { className: 'muted small', textContent: 'Vừa xong · 🌐' }));
    head.appendChild(meta);
    post.appendChild(head);

    post.appendChild(el('div', { className: 'pv-message', textContent: message || 'Caption sẽ hiện ở đây' }));

    const track = el('div', { className: 'pv-track' });
    if (!cards.length) track.appendChild(el('div', { className: 'muted', textContent: 'Chưa có thẻ nào' }));
    cards.forEach((card) => track.appendChild(previewCard(card)));
    if (showEndCard && cards.length) {
      const end = el('div', { className: 'pv-card pv-end' });
      end.appendChild(el('span', { textContent: `Xem thêm tại ${pageName || 'Page'}` }));
      track.appendChild(end);
    }
    post.appendChild(track);
    container.replaceChildren(post);
  }

  ns.preview = { render };
})(window.FbTool);
