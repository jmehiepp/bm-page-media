window.FbTool = window.FbTool || {};

(function (ns) {
  const MAX_SIZE = 320;

  function drawToDataUrl(source, width, height) {
    const scale = Math.min(1, MAX_SIZE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  }

  function imageThumb(blob) {
    const url = URL.createObjectURL(blob);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ thumb: drawToDataUrl(img, img.naturalWidth, img.naturalHeight) });
      img.onerror = () => resolve({ thumb: '' });
      img.src = url;
    }).finally(() => URL.revokeObjectURL(url));
  }

  // Seeks slightly past the start because frame 0 is often black.
  function videoThumb(blob) {
    const url = URL.createObjectURL(blob);
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.preload = 'metadata';
      video.onloadedmetadata = () => { video.currentTime = Math.min(1, (video.duration || 0) / 2); };
      video.onseeked = () => resolve({ thumb: drawToDataUrl(video, video.videoWidth, video.videoHeight), length: video.duration });
      video.onerror = () => resolve({ thumb: '' });
      video.src = url;
    }).finally(() => URL.revokeObjectURL(url));
  }

  ns.mediaThumbnail = { create: (kind, blob) => (kind === 'video' ? videoThumb(blob) : imageThumb(blob)) };
})(window.FbTool);
