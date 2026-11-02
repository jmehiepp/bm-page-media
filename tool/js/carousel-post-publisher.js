window.FbTool = window.FbTool || {};

(function (ns) {
  const { request, sleep } = ns.graph;
  function buildChildAttachment(card, defaultLink) {
    const link = card.link || defaultLink;
    const { uploaded } = card;
    const attachment = {
      link,
      name: card.headline,
      description: card.description || undefined,
      ...(card.ctaType && card.ctaType !== 'NO_BUTTON' ? { call_to_action: { type: card.ctaType, value: { link } } } : {}),
    };
    if (uploaded.videoId) attachment.video_id = uploaded.videoId;
    if (uploaded.imageHash) attachment.image_hash = uploaded.imageHash;
    else if (uploaded.pictureUrl) attachment.picture = uploaded.pictureUrl;
    return attachment;
  }

  function validatePost({ cards, defaultLink }) {
    if (defaultLink) validateLink(defaultLink, 'Link chung');
    if (cards.length < 2 || cards.length > 10) throw new Error('Carousel cần từ 2 đến 10 thẻ');
    cards.forEach((card, i) => {
      if (card.source === 'link' && !card.fetched) throw new Error(`Thẻ ${i + 1} chưa lấy nội dung từ link`);
      if (card.source !== 'link' && card.type === 'video' && !card.libraryVideo) throw new Error(`Thẻ ${i + 1} chưa chọn video từ thư viện`);
      if (card.source !== 'link' && card.type === 'image' && !card.libraryImage) throw new Error(`Thẻ ${i + 1} chưa chọn ảnh từ thư viện`);
      if (!card.headline) throw new Error(`Thẻ ${i + 1} chưa có headline`);
      if (!card.link && !defaultLink) throw new Error(`Thẻ ${i + 1} chưa có link`);
      validateLink(card.link || defaultLink, `Link thẻ ${i + 1}`);
    });
  }

  function validateLink(link, label) {
    try {
      if (!['https:', 'http:'].includes(new URL(link).protocol)) throw new Error();
    } catch { throw new Error(`${label} phải là URL http/https hợp lệ`); }
  }

  async function createCarouselCreative({ adAccountId, pageId, message, defaultLink, cards, showEndCard }) {
    const firstLink = defaultLink || cards[0].link;
    const res = await request(`${adAccountId}/adcreatives`, {
      method: 'POST',
      params: {
        name: `Carousel post ${new Date().toISOString()}`,
        object_story_spec: {
          page_id: pageId,
          link_data: {
            link: firstLink,
            message,
            child_attachments: cards.map((c) => buildChildAttachment(c, firstLink)),
            multi_share_optimized: false,
            multi_share_end_card: Boolean(showEndCard),
          },
        },
      },
    });
    if (!res.id) throw new Error('Facebook không trả về ID creative; chưa thể xác định bài viết để đăng');
    return res.id;
  }

  // The hidden post appears only once Facebook finished encoding every video in the
  // carousel, which routinely takes minutes — not the seconds a short poll allows.
  async function waitForStoryId(creativeId, log, timeoutMs = 10 * 60 * 1000) {
    const startedAt = Date.now();
    let lastNotice = 0;
    while (Date.now() - startedAt < timeoutMs) {
      const creative = await request(creativeId, { params: { fields: 'effective_object_story_id,object_story_id' } });
      const storyId = creative.effective_object_story_id || creative.object_story_id;
      if (storyId) return storyId;
      const waited = Math.round((Date.now() - startedAt) / 1000);
      if (log && waited - lastNotice >= 15) {
        lastNotice = waited;
        log(`Chờ Facebook xử lý video và sinh bài viết... ${waited}s`);
      }
      await sleep(5000);
    }
    const error = new Error(`Facebook chưa sinh ra bài viết sau 10 phút (creative ${creativeId}). Kiểm tra creative hiện có trước khi tạo bài mới để tránh trùng.`);
    error.creativeId = creativeId;
    throw error;
  }

  const PUBLISH_HINTS = {
    10: 'Kiểm tra quyền pages_manage_posts của ứng dụng và quyền tạo nội dung trên Page.',
    200: 'Kiểm tra quyền pages_manage_posts và quyền truy cập Page của tài khoản đã cấp token.',
    190: 'Token hết hạn hoặc đã bị thu hồi — kết nối lại bằng token mới.',
  };

  async function storyState(storyId, pageToken) {
    let state = {};
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await sleep(2000);
      state = await request(storyId, { params: { fields: 'is_published,permalink_url' }, token: pageToken }).catch(() => ({}));
      if (state.is_published === true) return state;
    }
    return state;
  }

  function unverifiedPublication(storyId) {
    const error = new Error(`Chưa xác nhận được bài đã công khai (${storyId}). Kiểm tra ${postUrl(storyId)} trước khi đăng lại để tránh tạo bài trùng.`);
    error.publicationUncertain = true;
    error.storyId = storyId;
    return error;
  }

  // Facebook often answers this call with an error while having published the post anyway,
  // so never trust the error alone — read the post back before reporting a failure.
  async function publishStory(storyId, pageToken) {
    let publishError;
    try {
      await request(storyId, { method: 'POST', params: { is_published: true }, token: pageToken });
    } catch (err) {
      publishError = err;
    }
    const state = await storyState(storyId, pageToken);
    if (state.is_published === true) return { success: true, permalink_url: state.permalink_url, reportedError: publishError && publishError.message };
    // An unreadable state must not trigger another public post through /feed.
    if (state.is_published !== false || !publishError) throw unverifiedPublication(storyId);
    const hint = PUBLISH_HINTS[publishError.raw && publishError.raw.code];
    if (!hint) throw publishError;
    const wrapped = new Error(`${publishError.message} — ${hint} Bản nháp chưa công khai: ${storyId}.`);
    wrapped.raw = publishError.raw;
    throw wrapped;
  }

  // Retain incomplete creatives so an encoding/readback failure can be resumed
  // without uploading again or creating another hidden post in this tab.
  const pendingCreatives = new Map();
  function creativeSignature(post) {
    // File contents cannot be compared safely with JSON serialization.
    if (post.cards.some((card) => card.thumbnailFile)) return null;
    return JSON.stringify({ version: ns.graph.config && ns.graph.config.version, post }, (key, value) => key === 'uploaded' ? undefined : value);
  }

  async function verifyUnpublishedCarousel(storyId, post, pageToken, log) {
    log(`Bản nháp ${storyId}: đang kiểm tra các thẻ trước khi công khai...`);
    try {
      // Attachments may appear after the story ID. Retry reads only, never creates.
      for (let attempt = 0; attempt < 5; attempt++) {
        if (attempt) await sleep(2000);
        const state = await request(storyId, {
          token: pageToken,
          params: { fields: 'is_published,attachments{type,subattachments.limit(11){type,media,target}}' },
        });
        if (state.is_published === true) throw new Error(`Bài đã công khai: ${postUrl(storyId)}. Kiểm tra bài hiện có trước khi tạo thêm`);
        const attachments = state.attachments && state.attachments.data || [];
        const children = attachments.length === 1 && attachments[0].subattachments && attachments[0].subattachments.data || [];
        const validCount = children.length === post.cards.length || (post.showEndCard && children.length === post.cards.length + 1);
        const validKinds = post.cards.every((card, i) => {
          const type = children[i] && children[i].type || '';
          return card.uploaded.videoId ? /^video/.test(type) : /^(photo|image|share)/.test(type);
        });
        if (state.is_published === false && attachments[0]?.type === 'multi_share' && validCount && validKinds) return;
      }
      throw new Error('Facebook chưa trả về bản nháp carousel đúng số thẻ và loại media. Công cụ không tự chuyển thành bài ảnh hoặc video đơn.');
    } catch (err) {
      const error = new Error(`${err.message} Bản nháp: ${storyId}; chưa gửi lệnh công khai.`);
      error.storyId = storyId;
      error.raw = err.raw;
      throw error;
    }
  }

  // Fewfeed's public two-video UI uses ad-account uploads, then a carousel
  // creative for the selected Page. Publication remains a separate step.
  async function createUnpublishedCarousel(post, log, pageToken) {
    validatePost(post);
    await ns.accounts.requireUserToken();
    if (!/^act_\d+$/.test(post.adAccountId || '')) throw new Error('Nhập ID tài khoản quảng cáo hợp lệ (act_ và dãy số)');
    if (!pageToken) pageToken = await ns.accounts.getPageToken(post.pageId);
    const signature = creativeSignature(post);
    const token = ns.graph.config && ns.graph.config.userToken;
    let pending = pendingCreatives.get(post.pageId);
    if (!signature || !pending || pending.signature !== signature || pending.token !== token) {
      // Fail before expensive uploads when the ad account is inaccessible/inactive.
      let account;
      try {
        account = await request(post.adAccountId, { params: { fields: 'id,name,account_status,disable_reason' } });
      } catch (err) {
        if (!err.raw || ![10, 200].includes(err.raw.code)) throw err;
        const error = new Error(`${err.message} — Kết nối hiện tại chưa được quyền truy cập tài khoản quảng cáo ${post.adAccountId}. Chủ tài khoản cần cấp quyền quản lý quảng cáo cho tài khoản Facebook cá nhân đã cấp User Token. Có ads_management trong token chưa đủ nếu tài khoản QC chưa được gán. Chưa upload media và chưa tạo bài.`);
        error.raw = err.raw;
        error.stage = 'ad-account-access';
        error.adAccountId = post.adAccountId;
        throw error;
      }
      log(`Tài khoản quảng cáo ${account.name || post.adAccountId}: account_status=${account.account_status ?? 'không đọc được'}, disable_reason=${account.disable_reason ?? 'không đọc được'}.`);
      if (account.account_status !== 1) {
        const reason = account.account_status === 2 ? 'đang bị vô hiệu hóa' : `có account_status=${account.account_status ?? 'không đọc được'}`;
        throw new Error(`Tài khoản quảng cáo chưa hoạt động: ${post.adAccountId} ${reason} (disable_reason=${account.disable_reason ?? 'không đọc được'}). Chọn tài khoản hoạt động đã cấp quyền cho token, hoặc xử lý tài khoản này trong Meta Business trước khi thử lại. Chưa upload media và chưa tạo bài.`);
      }
      for (const card of post.cards) await ns.media.prepareCardMedia(post.adAccountId, card, log);
      log(`Tạo creative cho Page ${post.pageId}...`);
      pending = { signature, token, creativeId: await createCarouselCreative(post), post };
      if (signature) pendingCreatives.set(post.pageId, pending);
    } else log(`Tiếp tục kiểm tra creative ${pending.creativeId}; không upload lại video.`);
    try {
      pending.storyId = pending.storyId || await waitForStoryId(pending.creativeId, log);
      await verifyUnpublishedCarousel(pending.storyId, pending.post, pageToken, log);
      pendingCreatives.delete(post.pageId);
      return { creativeId: pending.creativeId, storyId: pending.storyId };
    } catch (error) {
      error.creativeId = pending.creativeId;
      throw error;
    }
  }

  const postUrl = (storyId) => `https://www.facebook.com/${storyId}`;

  ns.publisher = { validatePost, createUnpublishedCarousel, publishStory, postUrl };
})(window.FbTool);
