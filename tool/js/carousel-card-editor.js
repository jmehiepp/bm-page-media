window.FbTool = window.FbTool || {};

(function (ns) {
  const { el, manualFields } = ns.cardFields;
  const MAX_CARDS = 10;

  let cards = [];
  let container;
  let dragIndex = null;

  const newCard = (prev) => ({
    type: prev ? prev.type : 'video',
    headline: prev ? prev.headline : 'Săn sale giá tốt tại đây 👉',
    description: '',
    link: '',
    ctaType: prev ? prev.ctaType : 'OPEN_LINK',
  });

  // Only the handle arms dragging, otherwise selecting text in inputs would start a drag.
  function enableDrag(box, handle, index) {
    handle.addEventListener('mousedown', () => { box.draggable = true; });
    handle.addEventListener('mouseup', () => { box.draggable = false; });
    box.addEventListener('dragstart', (e) => {
      dragIndex = index;
      box.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    });
    box.addEventListener('dragend', () => {
      box.draggable = false;
      dragIndex = null;
      container.querySelectorAll('.dragging, .drop-target').forEach((n) => n.classList.remove('dragging', 'drop-target'));
    });
    box.addEventListener('dragover', (e) => {
      if (dragIndex === null || dragIndex === index) return;
      e.preventDefault();
      box.classList.add('drop-target');
    });
    box.addEventListener('dragleave', () => box.classList.remove('drop-target'));
    box.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragIndex === null || dragIndex === index) return;
      const [moved] = cards.splice(dragIndex, 1);
      cards.splice(index, 0, moved);
      dragIndex = null;
      render();
    });
  }

  function renderCard(card, index) {
    const box = el('div', { className: 'card' });
    const head = el('div', { className: 'card-head' });
    const title = el('div', { className: 'card-title' });
    const handle = el('span', { className: 'drag-handle', textContent: '⠿', title: 'Kéo để đổi thứ tự' });
    title.append(handle, el('strong', { textContent: `Thẻ ${index + 1}` }));
    head.appendChild(title);
    enableDrag(box, handle, index);
    const actions = el('div', { className: 'card-actions' });
    [['←', -1, 'Chuyển sang trái'], ['→', 1, 'Chuyển sang phải']].forEach(([text, dir, title]) => {
      actions.appendChild(el('button', { type: 'button', textContent: text, title, className: 'icon-btn', disabled: !cards[index + dir], onclick: () => move(index, dir) }));
    });
    actions.appendChild(el('button', { type: 'button', textContent: '✕', title: 'Xóa thẻ', className: 'icon-btn danger', disabled: cards.length <= 2, onclick: () => removeCard(index) }));
    head.appendChild(actions);

    box.appendChild(head);
    manualFields(card, render).forEach((node) => box.appendChild(node));
    return box;
  }

  function render() {
    const nodes = cards.map(renderCard);
    if (cards.length < MAX_CARDS) {
      nodes.push(el('button', { type: 'button', className: 'card add-card', textContent: '＋ Thêm thẻ', onclick: addCard }));
    }
    container.replaceChildren(...nodes);
    const counter = document.getElementById('card-count');
    if (counter) counter.textContent = `${cards.length}/${MAX_CARDS}`;
  }

  function addCard() {
    if (cards.length >= MAX_CARDS) return;
    cards.push(newCard(cards[cards.length - 1]));
    render();
    container.scrollTo({ left: container.scrollWidth, behavior: 'smooth' });
  }

  function fillVideoSources(sources) {
    sources.slice(0, MAX_CARDS).forEach((source, i) => {
      const slot = cards.findIndex((card, index) => index >= i && card.type === 'video' && !card.libraryVideo && !card.fetched);
      const card = slot >= 0 ? cards[slot] : (cards.push(newCard(cards[cards.length - 1])), cards[cards.length - 1]);
      Object.assign(card, source, { type: 'video', uploaded: null });
      if (source.libraryVideo && source.libraryVideo.caption) {
        document.dispatchEvent(new CustomEvent('fbtool:library-media-selected', {
          detail: { kind: 'video', item: source.libraryVideo },
        }));
      }
    });
    render();
  }

  // Reuses empty cards first so pasting 3 links does not leave the 2 starter cards behind.
  function fillVideos(items) {
    fillVideoSources(items.map((item) => ({
      source: undefined,
      libraryVideo: { id: item.id, title: item.title, thumb: item.thumb, caption: item.caption || '' },
      fetched: null,
    })));
  }

  // Used when Facebook's CDN rejects a browser download. Facebook can still
  // fetch this short-lived source URL during the publish step.
  function fillLinkedVideos(cardsFromPost) {
    fillVideoSources(cardsFromPost.map((card) => ({
      source: 'link',
      libraryVideo: null,
      fetched: card.fetched,
      headline: card.headline || 'Video từ bài gốc',
      description: card.description || '',
      link: card.link || '',
      ctaType: card.ctaType || 'OPEN_LINK',
    })));
  }

  function removeCard(index) {
    cards.splice(index, 1);
    render();
  }

  function move(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= cards.length) return;
    [cards[index], cards[target]] = [cards[target], cards[index]];
    render();
  }

  function init(root) {
    container = root;
    cards = [newCard(), newCard()];
    render();
  }

  ns.cardEditor = { init, addCard, fillVideos, fillLinkedVideos, fillVideoSources, getCards: () => cards };
})(window.FbTool);
