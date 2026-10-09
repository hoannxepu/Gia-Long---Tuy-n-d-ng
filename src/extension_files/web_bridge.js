// web_bridge.js - CẦU NỐI THỜI GIAN THỰC 2 CHIỀU GIỮA WEB APP VÀ CHROME EXTENSION
// Mọi thao tác sửa bài, đổi ảnh, chỉnh nhóm trên Web App sẽ tự động đẩy ngay lập tức sang Extension!

(function () {
  const isTarget = 
    window.location.href.includes('dang-bai-fb') ||
    window.location.href.includes('pages.dev') ||
    window.location.href.includes('run.app') ||
    window.location.href.includes('localhost') ||
    document.title.includes('AutoRecruit') ||
    document.title.includes('Gia Long');

  if (!isTarget) return;

  console.log('[Gia Long - FB Bridge] Khởi động cầu nối thời gian thực trên:', window.location.href);

  try {
    document.documentElement.setAttribute('data-autorecruit-extension', 'true');
    document.documentElement.setAttribute('data-gialong-extension', 'true');
    window.__AUTORECRUIT_EXTENSION_INSTALLED__ = true;
    window.__GIALONG_EXTENSION_INSTALLED__ = true;
    if (window.location.origin && window.location.origin.startsWith('http')) {
      const serverUrl = window.location.origin.includes('pages.dev')
        ? 'https://ais-dev-cc3pyed4ifrln4z7zxo36q-299083950282.asia-southeast1.run.app'
        : window.location.origin;
      chrome.runtime.sendMessage({
        action: 'SET_SERVER_URL',
        url: serverUrl,
      });
    }
  } catch (e) {}

  let lastSentHash = '';

  function broadcastUpdateToExtension(customPayload = null) {
    try {
      let payload = customPayload;
      if (!payload) {
        const raw = localStorage.getItem('autorecruit_fb_data_v1');
        if (raw) {
          try { payload = JSON.parse(raw); } catch (e) {}
        }
      }

      if (!payload || !payload.posts) return;

      const posts = payload.posts || [];
      const groups = payload.groups || [];
      const settings = payload.settings || {};
      const activePost = payload.activePost || posts.find((p) => p.status === 'active') || posts[0];

      const currentHash = JSON.stringify({
        postCount: posts.length,
        activePostTitle: activePost?.title,
        activePostContent: activePost?.content?.slice(0, 100),
        activePostImg: activePost?.images?.[0],
        groupCount: groups.length,
      });

      if (currentHash === lastSentHash && !customPayload) return;
      lastSentHash = currentHash;

      chrome.runtime.sendMessage({
        action: 'REALTIME_WEBAPP_SYNC',
        payload: {
          posts,
          groups: groups.filter((g) => g.enabled).length ? groups.filter((g) => g.enabled) : groups,
          settings,
          activePost,
          url: window.location.href,
          timestamp: Date.now(),
        },
      }, () => {
        if (!chrome.runtime.lastError) {
          console.log('[AutoRecruit Real-time Bridge] ✓ Đã tự động cập nhật Extension theo thay đổi của Web App!');
        }
      });
    } catch (err) {
      console.warn('[AutoRecruit Real-time Bridge] Lỗi đồng bộ:', err);
    }
  }

  window.addEventListener('AUTORECRUIT_WEBAPP_PING', () => {
    window.dispatchEvent(new CustomEvent('AUTORECRUIT_EXTENSION_PONG'));
    broadcastUpdateToExtension();
  });

  window.addEventListener('AUTORECRUIT_DATA_CHANGE', (event) => {
    console.log('[AutoRecruit Real-time Bridge] Nhận tín hiệu Web App sửa dữ liệu:', event.detail);
    broadcastUpdateToExtension(event.detail);
  });

  window.addEventListener('message', (event) => {
    if (event.data && (event.data.type === 'AUTORECRUIT_DATA_CHANGE' || event.data.type === 'AUTORECRUIT_PUSH_TO_EXTENSION')) {
      broadcastUpdateToExtension(event.detail || event.data.payload);
    }

    if (event.data && event.data.type === 'AUTORECRUIT_ACTIVATE_KEY') {
      const key = event.data.key;
      chrome.runtime.sendMessage({ action: 'ACTIVATE_LICENSE', key }, (res) => {
        window.postMessage({ type: 'AUTORECRUIT_ACTIVATE_RESULT', result: res }, '*');
      });
    }

    if (event.data && event.data.type === 'AUTORECRUIT_CHECK_LICENSE') {
      chrome.runtime.sendMessage({ action: 'CHECK_LICENSE', forceRemote: true }, (res) => {
        window.postMessage({ type: 'AUTORECRUIT_CHECK_LICENSE_RESULT', result: res }, '*');
      });
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key === 'autorecruit_fb_data_v1') {
      broadcastUpdateToExtension();
    }
  });

  setInterval(broadcastUpdateToExtension, 2500);

  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('AUTORECRUIT_EXTENSION_READY'));
    broadcastUpdateToExtension();
  }, 1000);
})();
