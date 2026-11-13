// web_bridge.js - CẦU NỐI THỜI GIAN THỰC BẢO MẬT GIỮA WEB APP VÀ CHROME EXTENSION
// Tuân thủ nghiêm ngặt bảo mật Manifest V3: Chỉ chạy trên domain production chính thức

(function () {
  const ALLOWED_ORIGIN = 'https://gia-long---tuy-n-d-ng.pages.dev';
  const MAX_PAYLOAD_BYTES = 102400; // 100KB tối đa

  if (window.location.origin !== ALLOWED_ORIGIN) {
    return;
  }

  console.log('[Gia Long - FB Bridge] Khởi động cầu nối thời gian thực trên domain chính thức:', window.location.origin);

  try {
    document.documentElement.setAttribute('data-autorecruit-extension', 'true');
    document.documentElement.setAttribute('data-gialong-extension', 'true');
    window.__AUTORECRUIT_EXTENSION_INSTALLED__ = true;
    window.__GIALONG_EXTENSION_INSTALLED__ = true;
  } catch (e) {}

  let lastSentHash = '';

  function validateSyncSchema(payload) {
    if (!payload || typeof payload !== 'object') return false;
    const rawStr = JSON.stringify(payload);
    if (rawStr.length > MAX_PAYLOAD_BYTES) {
      console.warn('[Bridge Security] Payload vượt quá giới hạn 100KB, bỏ qua đồng bộ!');
      return false;
    }

    if (payload.posts && (!Array.isArray(payload.posts) || payload.posts.length > 50)) {
      console.warn('[Bridge Security] Danh sách bài viết không hợp lệ hoặc vượt quá 50 bài!');
      return false;
    }

    if (payload.groups && (!Array.isArray(payload.groups) || payload.groups.length > 500)) {
      console.warn('[Bridge Security] Danh sách nhóm không hợp lệ hoặc vượt quá 500 nhóm!');
      return false;
    }

    return true;
  }

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
      if (!validateSyncSchema(payload)) return;

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

      const gdriveWebhook = localStorage.getItem('glfb_gdrive_webhook') || settings.googleDriveSheetWebhookUrl || '';

      chrome.runtime.sendMessage({
        action: 'REALTIME_WEBAPP_SYNC',
        payload: {
          posts,
          groups: groups.filter((g) => g.enabled).length ? groups.filter((g) => g.enabled) : groups,
          settings,
          activePost,
          url: window.location.href,
          googleDriveWebhookUrl: gdriveWebhook,
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
    broadcastUpdateToExtension(event.detail);
  });

  // Lắng nghe message với kiểm tra nghiêm ngặt event.source và event.origin
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== ALLOWED_ORIGIN) {
      return;
    }

    if (event.data && (event.data.type === 'AUTORECRUIT_DATA_CHANGE' || event.data.type === 'AUTORECRUIT_PUSH_TO_EXTENSION')) {
      broadcastUpdateToExtension(event.data.payload);
    }

    if (event.data && event.data.type === 'AUTORECRUIT_ACTIVATE_KEY') {
      const key = String(event.data.key || '').trim();
      if (key) {
        chrome.runtime.sendMessage({ action: 'ACTIVATE_LICENSE', key }, (res) => {
          window.postMessage({ type: 'AUTORECRUIT_ACTIVATE_RESULT', result: res }, ALLOWED_ORIGIN);
        });
      }
    }

    if (event.data && event.data.type === 'AUTORECRUIT_CHECK_LICENSE') {
      chrome.runtime.sendMessage({ action: 'CHECK_LICENSE', forceRemote: true }, (res) => {
        window.postMessage({ type: 'AUTORECRUIT_CHECK_LICENSE_RESULT', result: res }, ALLOWED_ORIGIN);
      });
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key === 'autorecruit_fb_data_v1') {
      broadcastUpdateToExtension();
    }
  });

  // Lắng nghe thông báo đơn mới từ Extension
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg.action === 'DISPATCH_NEW_ORDER_TO_WEBAPP') {
          const orderPayload = msg.order || msg.payload;
          if (orderPayload) {
            window.dispatchEvent(new CustomEvent('GIALONG_NEW_ORDER', { detail: orderPayload }));
            window.postMessage({ type: 'GIALONG_NEW_ORDER', order: orderPayload }, ALLOWED_ORIGIN);
          }
          sendResponse({ received: true });
          return true;
        }
      });
    }
  } catch (e) {}

  setInterval(broadcastUpdateToExtension, 3000);

  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('AUTORECRUIT_EXTENSION_READY'));
    broadcastUpdateToExtension();
  }, 1000);
})();
