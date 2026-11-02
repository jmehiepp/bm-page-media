window.FbTool = window.FbTool || {};

(function (ns) {
  const { request } = ns.graph;
  const ITEM_FIELDS = 'type,title,description,media,target';
  const POST_FIELDS = `message,permalink_url,call_to_action,attachments{${ITEM_FIELDS},subattachments.limit(10){${ITEM_FIELDS}}}`;
  const LINK_HELP = 'Mở bài viết gốc, bấm vào thời gian đăng bài rồi copy link đầy đủ trên thanh địa chỉ';

  function parsePostRef(input) {
    const value = input.trim();
    if (/^\d+_\d+$/.test(value)) return { postId: value };

    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`Link bài viết không hợp lệ. ${LINK_HELP}`);
    }

    const storyId = url.searchParams.get('story_fbid');
    const ownerId = url.searchParams.get('id');
    if (storyId && ownerId) return /^\d+$/.test(storyId) ? { postId: `${ownerId}_${storyId}` } : { pageRef: ownerId, pfbid: storyId };

    const match = url.pathname.match(/^\/([^/]+)\/posts\/([^/?#]+)/);
    if (match) return /^\d+$/.test(match[2]) ? { pageRef: match[1], objectId: match[2] } : { pageRef: match[1], pfbid: match[2] };

    throw new Error(`Không nhận ra link bài viết Facebook. ${LINK_HELP}`);
  }

  // me/accounts often omits username, so fall back to resolving the vanity name to an id.
  async function findManagedPage(pageRef, pages) {
    const ref = String(pageRef).toLowerCase();
    const direct = pages.find((p) => p.id === ref || (p.username && p.username.toLowerCase() === ref));
    if (direct || /^\d+$/.test(ref)) return direct;
    for (const page of pages) {
      const res = await request(pageRef, { params: { fields: 'id' }, token: page.access_token }).catch(() => null);
      if (res && res.id) return pages.find((p) => p.id === res.id);
    }
    return undefined;
  }

  // pfbid links cannot be converted to a Graph id, so match them against the
  // page feed. Keep paging because a copied link may be older than the first
  // 100 posts returned by Graph.
  async function findPostIdByPermalink(page, pfbid) {
    const needle = String(pfbid).toLowerCase();
    const seen = new Set();
    for (const edge of ['feed', 'posts', 'ads_posts']) {
      let after = '';
      for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
        const params = { fields: 'id,permalink_url', limit: 100 };
        if (after) params.after = after;
        const res = await request(`${page.id}/${edge}`, { params, token: page.access_token }).catch(() => null);
        if (!res) break;
        const rawRows = res.data || [];
        const rows = rawRows.filter((item) => item && !seen.has(item.id));
        rows.forEach((item) => seen.add(item.id));
        const hit = rows.find((item) => String(item.permalink_url || '').toLowerCase().includes(needle));
        if (hit) return hit.id;
        const next = res.paging && res.paging.cursors && res.paging.cursors.after;
        if (!next || !rawRows.length) break;
        after = next;
      }
    }
    throw new Error(`Không tìm thấy bài có mã ${pfbid} trong lịch sử bài viết của Page "${page.name}"`);
  }

  async function resolvePost(input, pages) {
    if (!pages.length) throw new Error('Bấm "Tải Page & tài khoản QC" trước khi sao chép');
    const ref = parsePostRef(input);
    const pageRef = ref.postId ? ref.postId.split('_')[0] : ref.pageRef;
    const page = await findManagedPage(pageRef, pages);
    if (!page) throw new Error('Bài viết không thuộc Page mà token đang quản lý — chỉ sao chép được bài của Page bạn có quyền');
    if (ref.postId) return { page, postId: ref.postId };
    if (ref.objectId) return { page, postId: `${page.id}_${ref.objectId}` };
    return { page, postId: await findPostIdByPermalink(page, ref.pfbid) };
  }

  async function resolveVideoFileUrl(item, token) {
    if (item.media && item.media.source) return item.media.source;
    if (!item.target || !item.target.id) return null;
    const video = await request(item.target.id, { params: { fields: 'source' }, token }).catch(() => ({}));
    return video.source || null;
  }

  async function toCard(item, ctaType, token) {
    const isVideo = /video/i.test(item.type || '') || Boolean(item.media && item.media.source);
    const videoUrl = isVideo ? await resolveVideoFileUrl(item, token) : null;
    if (isVideo && !videoUrl) throw new Error(`Không lấy được file video của thẻ "${item.title || ''}"`);
    const imageUrl = item.media && item.media.image ? item.media.image.src : null;
    return {
      source: 'link',
      type: videoUrl ? 'video' : 'image',
      headline: item.title || '',
      description: item.description || '',
      link: '',
      ctaType,
      fetched: { type: videoUrl ? 'video' : 'image', videoUrl, imageUrl },
    };
  }

  async function clonePost(input, pages) {
    const { page, postId } = await resolvePost(input, pages);
    const post = await request(postId, { params: { fields: POST_FIELDS }, token: page.access_token });
    const attachment = ((post.attachments && post.attachments.data) || [])[0];
    if (!attachment) throw new Error('Bài viết gốc không có video/ảnh đính kèm');

    const subItems = (attachment.subattachments && attachment.subattachments.data) || [];
    // The page's "see more" end card has no media of its own and must not become a card.
    const items = (subItems.length ? subItems : [attachment]).filter((item) => item.media);
    const ctaType = (post.call_to_action && post.call_to_action.type) || 'OPEN_LINK';
    const cards = [];
    for (const item of items) cards.push(await toCard(item, ctaType, page.access_token));

    return { pageName: page.name, permalink: post.permalink_url, message: post.message || '', ctaType, cards };
  }

  ns.cloner = { clonePost };
})(window.FbTool);
