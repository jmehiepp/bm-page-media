window.FbTool = window.FbTool || {};

(function (ns) {
  const { request, sleep } = ns.graph;

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function uploadImage(adAccountId, file, name) {
    const res = await request(`${adAccountId}/adimages`, {
      method: 'POST',
      params: { bytes: await fileToBase64(file), name },
    });
    const image = Object.values(res.images || {})[0];
    if (!image || !image.hash) throw new Error('Upload ảnh không trả về image_hash');
    return { hash: image.hash, url: image.url };
  }

  async function videoUploadFile(file) {
    if (!file.size) throw new Error('File video trống — hãy tải lại video vào thư viện');
    const types = { mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm', avi: 'video/x-msvideo', mkv: 'video/x-matroska', mpg: 'video/mpeg', mpeg: 'video/mpeg', '3gp': 'video/3gpp' };
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const ascii = (start, end) => String.fromCharCode(...header.slice(start, end));
    // Library titles are labels, not filenames. Preserve the actual container
    // extension and MIME even for old records whose display title has no suffix.
    let extension = (file.name || '').match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase();
    if (ascii(4, 8) === 'ftyp') extension = ascii(8, 12) === 'qt  ' ? 'mov' : 'mp4';
    else if (!types[extension]) extension = Object.keys(types).find((ext) => types[ext] === file.type);
    if (!extension) throw new Error('Không xác định được định dạng video — hãy tải lại file gốc có đuôi .mp4 hoặc .mov');
    const stem = (file.name || 'video').replace(/\.[a-z0-9]+$/i, '').replace(/[\\/\r\n]/g, '_');
    return new File([file], `${stem}.${extension}`, { type: types[extension] || file.type });
  }

  async function uploadVideo(adAccountId, { file, url }) {
    const params = file ? { source: await videoUploadFile(file) } : { file_url: url };
    const res = await request(`${adAccountId}/advideos`, {
      method: 'POST',
      params,
      host: 'graph-video.facebook.com',
    });
    if (!res.id) throw new Error('Facebook không trả về ID video sau khi tải lên');
    return res.id;
  }

  // Carousel video cards require a thumbnail; it only exists once Facebook finishes encoding.
  async function waitForVideoThumbnail(videoId, onProgress, timeoutMs = 10 * 60 * 1000, token) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const video = await request(videoId, { params: { fields: 'status' }, token });
      const status = video.status || {};
      if (status.video_status === 'error') throw new Error(`Video ${videoId} xử lý lỗi`);
      if (status.video_status === 'ready') {
        const thumbs = await request(`${videoId}/thumbnails`, { token });
        const list = thumbs.data || [];
        const preferred = list.find((t) => t.is_preferred) || list[0];
        if (preferred) return preferred.uri;
      }
      onProgress && onProgress(`Video ${videoId}: ${status.video_status || 'processing'} ${status.processing_progress ?? ''}%`);
      await sleep(5000);
    }
    throw new Error(`Hết thời gian chờ video ${videoId} xử lý`);
  }

  // Uploads each card's media once per ad account and caches the result on the card.
  async function prepareCardMedia(adAccountId, card, log) {
    if (card.uploaded && card.uploaded.adAccountId === adAccountId) return card.uploaded;
    const uploaded = { adAccountId };

    if (card.source === 'link') {
      if (!card.fetched) throw new Error(`Thẻ "${card.headline}" chưa lấy nội dung từ link`);
      const { videoUrl, imageUrl } = card.fetched;
      if (videoUrl) {
        log(`Facebook đang tải video từ link cho thẻ "${card.headline}"...`);
        uploaded.videoId = await uploadVideo(adAccountId, { url: videoUrl });
        // A source thumbnail says nothing about Facebook's encoding status.
        const facebookThumb = await waitForVideoThumbnail(uploaded.videoId, log);
        if (card.thumbnailFile) uploaded.imageHash = (await uploadImage(adAccountId, card.thumbnailFile)).hash;
        else uploaded.pictureUrl = imageUrl || facebookThumb;
      } else {
        uploaded.pictureUrl = imageUrl;
      }
    } else if (card.type === 'video') {
      if (!card.libraryVideo) throw new Error(`Thẻ "${card.headline}" chưa chọn video từ thư viện`);
      log(`Đang tải video "${card.libraryVideo.title}" lên Facebook...`);
      const blob = await ns.mediaLibraries.video.getBlob(card.libraryVideo.id);
      uploaded.videoId = await uploadVideo(adAccountId, { file: new File([blob], blob.name || card.libraryVideo.title || 'video.mp4', { type: blob.type }) });
      const facebookThumb = await waitForVideoThumbnail(uploaded.videoId, log);
      if (card.thumbnailFile) {
        uploaded.imageHash = (await uploadImage(adAccountId, card.thumbnailFile)).hash;
      } else {
        uploaded.pictureUrl = facebookThumb;
      }
    } else {
      if (!card.libraryImage) throw new Error(`Thẻ "${card.headline}" chưa chọn ảnh từ thư viện`);
      const blob = await ns.mediaLibraries.image.getBlob(card.libraryImage.id);
      uploaded.imageHash = (await uploadImage(adAccountId, blob, card.libraryImage.title)).hash;
    }

    card.uploaded = uploaded;
    return uploaded;
  }

  ns.media = { uploadImage, uploadVideo, waitForVideoThumbnail, prepareCardMedia };
})(window.FbTool);
