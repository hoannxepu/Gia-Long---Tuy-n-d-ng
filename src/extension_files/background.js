// background.js - Điều phối Đăng Bài Facebook & Hẹn Giờ Chuẩn 100% Manifest V3
// Hỗ trợ: Dừng tức thì, Hẹn giờ chuẩn Alarms, Lịch sử đăng bài, Dò tìm & Tham gia nhóm, Giữ kết nối Web App

let isRunning = false;
let shouldStop = false;
let activeTabId = null;
let keepAliveTimer = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Ngủ có thể ngắt ngay lập tức khi bấm DỪNG (kiểm tra mỗi 100ms)
async function interruptibleSleep(ms) {
  const step = 100;
  let elapsed = 0;
  while (elapsed < ms) {
    if (shouldStop) return;
    await sleep(Math.min(step, ms - elapsed));
    elapsed += step;
  }
}

// Chống ngủ Service Worker trong Manifest V3
function startKeepAlive() {
  stopKeepAlive();
  keepAliveTimer = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
  }, 15000);
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

// Cập nhật trạng thái tiến trình vào storage
async function updateStatus(status) {
  try {
    await chrome.storage.local.set({ postJobState: status });
  } catch (e) {}
}

// GHI LỊCH SỬ ĐĂNG BÀI
async function addHistoryEntry(entry) {
  try {
    const res = await chrome.storage.local.get(['postHistory']);
    const history = res.postHistory || [];
    const newEntry = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: Date.now(),
      timeFormatted: new Date().toLocaleString('vi-VN'),
      ...entry,
    };
    const updated = [newEntry, ...history].slice(0, 150);
    await chrome.storage.local.set({ postHistory: updated });
    console.log('[AutoRecruit Background] Đã ghi lịch sử:', newEntry.status, newEntry.groupName);
  } catch (err) {
    console.warn('[AutoRecruit Background] Lỗi ghi lịch sử:', err);
  }
}

// ==========================================
// HỆ THỐNG QUẢN LÝ BẢN QUYỀN (LICENSE MANAGER)
// Hỗ trợ cả Cá Nhân (1 máy) & Doanh Nghiệp (Team N máy)
// ==========================================
async function getOrCreateDeviceId() {
  try {
    const data = await chrome.storage.local.get(['autorecruit_device_id']);
    if (data.autorecruit_device_id) return data.autorecruit_device_id;
    const newId = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    await chrome.storage.local.set({ autorecruit_device_id: newId });
    return newId;
  } catch (e) {
    return 'dev_fallback_' + Date.now();
  }
}

async function getApiBaseUrl() {
  try {
    const data = await chrome.storage.local.get(['customApiServerUrl', 'webapp_last_url', 'lastSyncedFromUrl']);
    if (data.customApiServerUrl && data.customApiServerUrl.trim()) {
      return data.customApiServerUrl.trim().replace(/\/+$/, '');
    }
    const candidate = data.webapp_last_url || data.lastSyncedFromUrl;
    if (candidate && candidate.startsWith('http')) {
      const u = new URL(candidate);
      return u.origin;
    }
  } catch (e) {}
  return 'https://dang-bai-fb.pages.dev';
}

function getCandidateServerUrls(primaryBase) {
  const list = [
    primaryBase,
    'https://dang-bai-fb.pages.dev',
    'https://ais-dev-cc3pyed4ifrln4z7zxo36q-299083950282.asia-southeast1.run.app',
    'https://ais-pre-cc3pyed4ifrln4z7zxo36q-299083950282.asia-southeast1.run.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];
  return list.filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);
}

// Xử lý gửi đơn đặt mua gói bản quyền tự động lên Server
// Đồng bộ song song tới cả Cloudflare Pages và Studio để đơn hiển thị lập tức trên cả hai hệ thống
async function handleCreateOrder(payload) {
  const currentBase = await getApiBaseUrl();
  const urlsToTry = getCandidateServerUrls(currentBase);

  const promises = urlsToTry.map(async (rawUrl) => {
    if (!rawUrl || !rawUrl.startsWith('http')) return null;
    const base = rawUrl.replace(/\/+$/, '');
    try {
      const resp = await fetch(`${base}/api/orders/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = await resp.text();
      if (!text || (!text.trim().startsWith('{') && !text.trim().startsWith('['))) {
        return null;
      }
      const data = JSON.parse(text);
      if (data && data.success) {
        console.log('[Gia Long - FB Background] ✓ Đã gửi đơn hàng thành công lên:', base);
        return { base, order: data.order, message: data.message };
      }
    } catch (err) {
      console.warn('[Gia Long - FB Background] Thử gửi đơn tới', base, 'thất bại:', err.message);
    }
    return null;
  });

  const results = await Promise.allSettled(promises);
  const successful = results
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value);

  if (successful.length > 0) {
    const primarySuccess = successful.find((s) => s.base.includes('pages.dev')) || successful[0];
    await chrome.storage.local.set({ 
      customApiServerUrl: primarySuccess.base, 
      webapp_last_url: primarySuccess.base 
    });
    return { success: true, order: primarySuccess.order, message: primarySuccess.message };
  }

  return { success: false, error: 'Không thể kết nối đến máy chủ Quản trị viên' };
}

async function checkLicenseStatus(forceRemote = false) {
  try {
    const data = await chrome.storage.local.get(['licenseKey', 'licenseData']);
    const key = data.licenseKey;
    const deviceId = await getOrCreateDeviceId();

    if (!key) {
      // Nếu chưa nạp key thủ công: Thử kiểm tra xem Quản trị viên đã duyệt đề xuất mua cho Device ID này chưa
      const primaryBase = await getApiBaseUrl();
      const serverCandidates = getCandidateServerUrls(primaryBase);
      for (const baseUrl of serverCandidates) {
        try {
          const resp = await fetch(`${baseUrl}/api/license/check-by-device?deviceId=${encodeURIComponent(deviceId)}`);
          const text = await resp.text();
          if (!text || (!text.trim().startsWith('{') && !text.trim().startsWith('['))) continue;
          const devResult = JSON.parse(text);
          if (devResult.success && devResult.license && devResult.license.key) {
            const autoLic = {
              ...devResult.license,
              lastVerifiedAt: Date.now(),
            };
            await chrome.storage.local.set({
              licenseKey: devResult.license.key,
              licenseData: autoLic,
              customApiServerUrl: baseUrl,
            });
            return {
              isValid: true,
              isActivated: true,
              message: '✓ Bản quyền VIP đã được Quản trị viên phê duyệt tự động theo thiết bị!',
              license: autoLic,
            };
          }
        } catch (e) {}
      }

      return {
        isValid: false,
        isActivated: false,
        message: 'Chưa kích hoạt bản quyền. Vui lòng chọn gói đặt mua để Quản trị viên duyệt tự động!',
        license: null,
      };
    }

    const cached = data.licenseData;
    const now = Date.now();

    // 1. Dùng Cache an toàn nếu mới kiểm tra gần đây (< 3 phút) và không bị khóa/thu hồi
    if (!forceRemote && cached && cached.lastVerifiedAt && (now - cached.lastVerifiedAt < 3 * 60 * 1000)) {
      const expMs = new Date(cached.expiresAt).getTime();
      const isExpired = expMs < now;
      const daysLeft = Math.max(0, Math.ceil((expMs - now) / (24 * 60 * 60 * 1000)));

      if (!isExpired && !cached.isSuspended && !cached.isRevoked) {
        return {
          isValid: true,
          isActivated: true,
          message: 'Bản quyền VIP đang hoạt động',
          license: { ...cached, daysLeft, isExpired: false },
        };
      }
    }

    // 2. Xác thực với Máy Chủ (Server) - Thử lần lượt các máy chủ khả dụng
    const primaryBase = await getApiBaseUrl();
    const serverCandidates = getCandidateServerUrls(primaryBase);
    let networkError = null;

    for (const baseUrl of serverCandidates) {
      try {
        const resp = await fetch(`${baseUrl}/api/license/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, deviceId }),
        });
        const text = await resp.text();
        if (!text || (!text.trim().startsWith('{') && !text.trim().startsWith('['))) continue;
        const result = JSON.parse(text);

        // Ghi nhớ máy chủ phản hồi tốt
        chrome.storage.local.set({ customApiServerUrl: baseUrl });

        const isRevoked = Boolean(result.isRevoked || result.license?.isRevoked);
        const isSuspended = Boolean(result.license?.isSuspended);
        const isForceRevoke = Boolean(result.action === 'FORCE_REVOKE' || isRevoked || result.isDeleted);

        if (result.valid && result.license && !isRevoked && !isSuspended) {
          const lic = {
            ...result.license,
            key,
            lastVerifiedAt: now,
          };
          await chrome.storage.local.set({ licenseData: lic });
          return {
            isValid: true,
            isActivated: true,
            message: result.message || 'Bản quyền hợp lệ!',
            license: lic,
          };
        } else {
          // Khi bị xóa, thu hồi hoặc không hợp lệ: LẬP TỨC XÓA SẠCH KEY, NGẮT MỌI ALARMS & DỪNG TIẾN TRÌNH
          if (isForceRevoke || !result.valid) {
            await chrome.storage.local.remove(['licenseKey', 'licenseData', 'isVip', 'currentLicense', 'licenseInfo']);
          } else {
            const lic = {
              ...(cached || {}),
              key,
              isExpired: result.isExpired || false,
              isSuspended,
              isRevoked,
              revokeReason: result.license?.revokeReason || result.message,
              lastVerifiedAt: now,
            };
            await chrome.storage.local.set({ licenseData: lic });
          }

          // Ngắt ngay toàn bộ hẹn giờ Alarms và dừng mọi tiến trình đang chạy
          chrome.alarms.clearAll(() => {});
          await chrome.storage.local.set({
            isScheduleActive: false,
            isRunning: false,
            autoScheduleEnabled: false,
            scheduledJobs: [],
            postJobState: 'REVOKED_STOPPED',
          });
          shouldStop = true;
          isRunning = false;
          stopKeepAlive();

          return {
            isValid: false,
            isActivated: false,
            isExpired: result.isExpired || false,
            isRevoked: true,
            isSuspended,
            message: result.message || '🚨 BẢN QUYỀN ĐÃ BỊ THU HỒI / XÓA KHỎI HỆ THỐNG: Mọi tiến trình đã bị chấm dứt ngay lập tức!',
            license: null,
          };
        }
      } catch (err) {
        networkError = err;
      }
    }

    // 3. Cơ chế Offline Grace Period: Cho phép tiếp tục dùng trong 24 giờ nếu rớt mạng (Tuyệt đối không áp dụng nếu bị Thu hồi hoặc Tạm khóa)
    if (cached && (now - (cached.lastVerifiedAt || 0) < 24 * 60 * 60 * 1000)) {
      const expMs = new Date(cached.expiresAt).getTime();
      if (expMs > now && !cached.isSuspended && !cached.isRevoked) {
        console.warn('[AutoRecruit License] Rớt mạng tạm thời, duy trì bản quyền trong 24h grace period.');
        return {
          isValid: true,
          isActivated: true,
          message: 'Bản quyền hợp lệ (Chế độ Ngoại Tuyến)',
          license: cached,
        };
      }
    }
    return {
      isValid: false,
      isActivated: true,
      message: 'Không thể kết nối máy chủ xác thực bản quyền!',
      license: cached || null,
    };
  } catch (err) {
    return { isValid: false, message: err.message };
  }
}

async function activateLicenseKey(rawKey) {
  if (!rawKey) return { success: false, message: 'Vui lòng nhập mã bản quyền!' };
  const key = rawKey.trim().toUpperCase();
  const deviceId = await getOrCreateDeviceId();
  const primaryBase = await getApiBaseUrl();
  const serverCandidates = getCandidateServerUrls(primaryBase);

  let lastErr = null;
  for (const baseUrl of serverCandidates) {
    try {
      const resp = await fetch(`${baseUrl}/api/license/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          deviceId,
          deviceName: `Browser (${deviceId.slice(-4)})`,
        }),
      });
      const text = await resp.text();
      if (!text || (!text.trim().startsWith('{') && !text.trim().startsWith('['))) continue;
      const result = JSON.parse(text);

      if (result.success && result.license) {
        const lic = {
          ...result.license,
          key,
          lastVerifiedAt: Date.now(),
        };
        await chrome.storage.local.set({
          licenseKey: key,
          licenseData: lic,
          customApiServerUrl: baseUrl,
        });

        // Nếu kích hoạt gói chính thức, xóa bỏ giới hạn bài đăng dùng thử; nếu là gói dùng thử thì reset về 0
        if (result.license.planType === 'trial') {
          await chrome.storage.local.set({ trialPostsCount: 0 });
        } else {
          await chrome.storage.local.remove(['trialPostsCount']);
        }

        return { success: true, message: result.message, license: lic };
      } else {
        return { success: false, message: result.message || 'Kích hoạt mã không thành công!' };
      }
    } catch (err) {
      lastErr = err;
    }
  }
  return { success: false, message: 'Lỗi kết nối máy chủ: ' + (lastErr ? lastErr.message : 'Không thể kết nối') };
}

async function deactivateLicenseKey() {
  await chrome.storage.local.remove(['licenseKey', 'licenseData']);
  return { success: true, message: 'Đã hủy kích hoạt bản quyền trên máy này.' };
}

// ==========================================
// 1. CHẾ ĐỘ HẸN GIỜ ĐĂNG BÀI TỰ ĐỘNG CHUẨN 100%
// ==========================================
function getNextOccurrenceTimestamp(timeStr) {
  const [hours, minutes] = timeStr.split(':').map((n) => parseInt(n, 10));
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

async function handleSetSchedule(config) {
  const licCheck = await checkLicenseStatus();
  if (!licCheck.isValid) {
    console.warn('[AutoRecruit Background] Không thể hẹn giờ: Chưa kích hoạt bản quyền VIP!');
    chrome.alarms.clearAll(() => {
      chrome.storage.local.set({ isScheduleActive: false });
    });
    return {
      success: false,
      message: `Chưa kích hoạt bản quyền VIP hoặc đã hết hạn (${licCheck.message}). Không thể kích hoạt hẹn giờ tự động!`,
    };
  }

  return new Promise((resolve) => {
    chrome.alarms.clearAll(() => {
      const times = config.times || ['08:30', '11:30', '17:30', '20:00'];
      chrome.storage.local.set({
        isScheduleActive: true,
        savedTimes: times,
        scheduledTimes: times,
        scheduleConfigPayload: config,
      });

      times.forEach((timeStr, idx) => {
        const targetTime = getNextOccurrenceTimestamp(timeStr);
        chrome.alarms.create(`autorecruit_alarm_${idx}_${timeStr.replace(':', '_')}`, {
          when: targetTime,
          periodInMinutes: 1440,
        });
        const diffMinutes = Math.round((targetTime - Date.now()) / 60000);
        console.log(`[AutoRecruit Background] Đã hẹn giờ lúc ${timeStr} (sau khoảng ${diffMinutes} phút nữa).`);
      });
      resolve({ success: true, message: 'Đã kích hoạt hẹn giờ tự động thành công!' });
    });
  });
}

// BỘ LẮNG NGHE ALARMS: TỰ ĐỘNG CHẠY KHI ĐẾN GIỜ (KHI CHROME ĐANG MỞ)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log('[AutoRecruit Background] ⏰ ALARM KÍCH HOẠT:', alarm.name);

  if (!alarm.name.startsWith('autorecruit_alarm_')) return;

  const storage = await chrome.storage.local.get([
    'isScheduleActive',
    'savedPosts',
    'savedGroups',
    'selectedPostIdx',
    'delaySec',
    'enableSpintax',
    'shouldShuffleGroups',
  ]);

  if (!storage.isScheduleActive) {
    console.log('[AutoRecruit Background] Hẹn giờ đang tắt, bỏ qua.');
    return;
  }

  // KIỂM TRA BẢN QUYỀN NGAY KHI TỚI GIỜ HẸN (BẢO ĐẢM NẾU CHƯA MUA HOẶC HẾT HẠN LÀ TUYỆT ĐỐI KHÔNG CHẠY!)
  const licCheck = await checkLicenseStatus(true);
  if (!licCheck.isValid) {
    const errorText = `🚨 HẸN GIỜ ĐÃ BỊ HỦY: ${licCheck.message || 'Chưa kích hoạt bản quyền VIP hoặc đã hết hạn'}`;
    console.warn('[AutoRecruit Background]', errorText);
    chrome.alarms.clearAll(() => {
      chrome.storage.local.set({ isScheduleActive: false });
    });
    await updateStatus({
      isRunning: false,
      currentIndex: 0,
      totalGroups: 0,
      statusText: errorText,
    });
    await addHistoryEntry({
      groupName: 'Hệ Thống Bản Quyền',
      groupLink: '',
      postTitle: 'Hẹn Giờ Tự Động',
      status: 'failed',
      type: 'scheduled',
      message: `🚨 ${errorText}. Không thể thực hiện đăng bài khi chưa kích hoạt bản quyền!`,
    });
    return;
  }

  if (isRunning) {
    console.warn('[AutoRecruit Background] Đang có tiến trình chạy, bỏ qua lần hẹn giờ này.');
    addHistoryEntry({
      groupName: 'Hẹn Giờ Tự Động',
      groupLink: '#',
      postTitle: 'Bỏ qua',
      status: 'failed',
      type: 'scheduled',
      message: 'Bị trùng do đang có tiến trình đăng dở.',
    });
    return;
  }

  let posts = storage.savedPosts || [];
  let groups = (storage.savedGroups || []).filter((g) => g.enabled !== false);
  const selectedIdx = storage.selectedPostIdx || 0;
  let targetPost = posts[selectedIdx] || posts[0];

  // Nếu chưa có trong storage, tải từ preloaded_data.json
  if (!posts.length || !groups.length) {
    try {
      const preloaded = await fetch(chrome.runtime.getURL('preloaded_data.json')).then((r) => r.json()).catch(() => null);
      if (preloaded) {
        if (!posts.length && preloaded.posts?.length) posts = preloaded.posts;
        if (!groups.length && preloaded.groups?.length) groups = preloaded.groups.filter((g) => g.enabled !== false);
        targetPost = posts[0];
      }
    } catch (e) {}
  }

  if (!groups.length) {
    console.warn('[AutoRecruit Background] Không có nhóm nào được chọn!');
    return;
  }

  if (!targetPost || !targetPost.content) {
    console.warn('[AutoRecruit Background] Không có nội dung bài viết!');
    return;
  }

  // KIỂM TRA TÀI KHOẢN CÓ ĐANG TRONG THỜI GIAN NGHỈ NGƠI CHỐNG CHECKPOINT KHÔNG
  const alertCheck = await chrome.storage.local.get(['fbSpamWarningAlert']);
  if (alertCheck.fbSpamWarningAlert && alertCheck.fbSpamWarningAlert.isBlocked) {
    const detectedAt = new Date(alertCheck.fbSpamWarningAlert.detectedAt).getTime();
    const cooldownMs = 4 * 60 * 60 * 1000; // 4 tiếng nghỉ ngơi an toàn
    if (Date.now() - detectedAt < cooldownMs) {
      const remainingHours = Math.ceil((cooldownMs - (Date.now() - detectedAt)) / (60 * 60 * 1000));
      console.warn(`[AutoRecruit Background] 🚨 Tài khoản đang trong thời gian nghỉ ngơi chống checkpoint (${remainingHours}h còn lại). Bỏ qua ca hẹn giờ.`);
      await addHistoryEntry({
        groupName: 'Hẹn Giờ Tự Động',
        groupLink: '#',
        postTitle: targetPost?.title || 'Bài Tuyển Dụng',
        status: 'failed',
        type: 'scheduled',
        message: `🛡️ Tự động tạm hoãn đăng bài: Tài khoản đang trong thời gian nghỉ ngơi chống giới hạn Facebook (còn ~${remainingHours} tiếng).`,
      });
      return;
    }
  }

  console.log(`[AutoRecruit Background] 🚀 TỰ ĐỘNG CHẠY HẸN GIỜ: ${groups.length} nhóm!`);

  isRunning = true;
  shouldStop = false;
  startKeepAlive();

  const postVariants = [
    targetPost.content || '',
    (targetPost.content || '') + '\u200B\u200C',
    (targetPost.content || '') + '\uFEFF\u200D',
  ];

  runBatchPosting(
    groups,
    targetPost.content,
    targetPost.images || [],
    storage.enableSpintax !== undefined ? storage.enableSpintax : true,
    storage.delaySec || 25,
    storage.shouldShuffleGroups !== undefined ? storage.shouldShuffleGroups : true,
    'scheduled',
    targetPost.title || 'Bài Tuyển Dụng',
    postVariants
  )
    .then(() => {
      isRunning = false;
      activeTabId = null;
      stopKeepAlive();
    })
    .catch((err) => {
      console.error('[AutoRecruit Background] Lỗi hẹn giờ:', err);
      isRunning = false;
      activeTabId = null;
      stopKeepAlive();
    });
});

// TỰ ĐỘNG KHÔI PHỤC HẸN GIỜ KHI KHỞI ĐỘNG LẠI CHROME HOẶC MỞ MÁY TÍNH
async function restoreScheduleOnBoot() {
  try {
    const licCheck = await checkLicenseStatus();
    if (!licCheck.isValid) {
      console.log('[AutoRecruit Background] Bản quyền chưa kích hoạt -> Không khôi phục hẹn giờ.');
      chrome.alarms.clearAll();
      await chrome.storage.local.set({ isScheduleActive: false });
      return;
    }
    const data = await chrome.storage.local.get(['isScheduleActive', 'savedTimes', 'scheduledTimes', 'delaySec', 'enableSpintax']);
    const times = data.savedTimes || data.scheduledTimes;
    if (data.isScheduleActive && times && times.length > 0) {
      handleSetSchedule({
        times: times,
        delaySec: data.delaySec || 25,
        isSpintaxEnabled: data.enableSpintax !== false,
      });
      console.log('[AutoRecruit Background] ✓ Đã tự động nạp lại các mốc hẹn giờ:', times);
    }
  } catch (err) {
    console.warn('[AutoRecruit Background] Lỗi khôi phục hẹn giờ:', err);
  }
}

chrome.runtime.onStartup.addListener(() => {
  console.log('[AutoRecruit Background] Chrome vừa khởi động -> Nạp lại lịch hẹn giờ...');
  restoreScheduleOnBoot();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[AutoRecruit Background] Extension vừa nạp/cập nhật -> Kiểm tra lịch hẹn giờ...');
  restoreScheduleOnBoot();
});

// ==========================================
// 2. LẮNG NGHE THÔNG ĐIỆP
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. BẮT ĐẦU ĐĂNG BÀI
  if (request.action === 'START_BATCH_POSTING') {
    if (isRunning) {
      sendResponse({ success: false, message: 'Đang có một tiến trình đang chạy!' });
      return true;
    }

    const payload = request.payload || request;
    const groups = payload.groups || [];
    const content = payload.content || payload.postContent || '';
    const variants = payload.variants || [];
    const images = payload.images || [];
    const isSpintaxEnabled = payload.isSpintaxEnabled !== undefined ? payload.isSpintaxEnabled : true;
    const delaySec = parseInt(payload.delaySec, 10) || 25;
    const shouldShuffle = payload.shouldShuffle !== undefined ? payload.shouldShuffle : true;
    const postTitle = payload.postTitle || 'Bài Tuyển Dụng';

    if (!groups.length) {
      sendResponse({ success: false, message: 'Danh sách nhóm trống!' });
      return true;
    }

    // KIỂM TRA BẢN QUYỀN TRƯỚC KHI THỰC HIỆN ĐĂNG BÀI
    checkLicenseStatus().then(async (licCheck) => {
      if (!licCheck.isValid) {
        const errorText = `🚨 BẢN QUYỀN CHƯA KÍCH HOẠT HOẶC ĐÃ HẾT HẠN: ${licCheck.message}`;
        await updateStatus({
          isRunning: false,
          currentIndex: 0,
          totalGroups: groups.length,
          statusText: errorText,
        });
        await addHistoryEntry({
          groupName: 'Hệ Thống Bản Quyền',
          groupLink: '',
          postTitle: postTitle,
          status: 'failed',
          type: 'manual',
          message: errorText,
        });
        return;
      }

      // KIỂM TRA HẠN MỨC GÓI DÙNG THỬ 1 NGÀY (TỐI ĐA 20 BÀI ĐĂNG)
      if (licCheck.license?.planType === 'trial') {
        const trialData = await chrome.storage.local.get(['trialPostsCount']);
        const trialPostsCount = trialData.trialPostsCount || 0;
        if (trialPostsCount >= 20) {
          const errorText = `🚨 ĐÃ HẾT HẠN MỨC DÙNG THỬ (20/20 BÀI ĐĂNG)!\n\nGói dùng thử 1 ngày đã hoàn thành tối đa 20 bài đăng. Vui lòng đặt mua Gói Bản Quyền Chính Thức để tiếp tục đăng không giới hạn!`;
          await updateStatus({
            isRunning: false,
            currentIndex: 0,
            totalGroups: groups.length,
            statusText: '🎯 Đã đạt giới hạn 20 bài đăng của Gói Dùng Thử. Vui lòng nâng cấp bản quyền chính thức!',
          });
          await addHistoryEntry({
            groupName: 'Gói Dùng Thử',
            groupLink: '',
            postTitle: postTitle,
            status: 'failed',
            type: 'manual',
            message: errorText,
          });
          return;
        }
      }

      isRunning = true;
      shouldStop = false;
      startKeepAlive();

      runBatchPosting(groups, content, images, isSpintaxEnabled, delaySec, shouldShuffle, 'manual', postTitle, variants)
        .then(() => {
          isRunning = false;
          activeTabId = null;
          stopKeepAlive();
        })
        .catch((err) => {
          console.error('[AutoRecruit Background] Lỗi tiến trình:', err);
          isRunning = false;
          activeTabId = null;
          stopKeepAlive();
        });
    });

    sendResponse({ success: true, message: 'Đang kiểm tra bản quyền & bắt đầu tiến trình...' });
    return true;
  }

  // 2. DỪNG TIẾN TRÌNH LẬP TỨC
  if (request.action === 'STOP_BATCH_POSTING') {
    console.log('[AutoRecruit Background] Nhận lệnh DỪNG TIẾN TRÌNH!');
    shouldStop = true;
    isRunning = false;
    stopKeepAlive();

    if (activeTabId) {
      chrome.tabs.remove(activeTabId).catch(() => {});
      activeTabId = null;
    }

    updateStatus({
      isRunning: false,
      currentIndex: 0,
      totalGroups: 0,
      statusText: '⏹️ Đã dừng tiến trình theo yêu cầu của bạn.',
    });

    addHistoryEntry({
      groupName: 'Tiến trình đăng',
      groupLink: '#',
      postTitle: 'Tất cả bài',
      status: 'stopped',
      type: 'manual',
      message: 'Người dùng bấm nút Dừng tức thì.',
    });

    sendResponse({ success: true, message: 'Đã dừng ngay lập tức.' });
    return true;
  }

  // 3. Cài đặt hẹn giờ
  if (request.action === 'SCHEDULE_AUTO_POST') {
    handleSetSchedule(request.payload || request)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  // 4. Hủy hẹn giờ
  if (request.action === 'CANCEL_SCHEDULE') {
    chrome.alarms.clearAll(() => {
      chrome.storage.local.set({ isScheduleActive: false });
    });
    sendResponse({ success: true });
    return true;
  }

  // 4.1 Gửi đơn đặt mua gói bản quyền trực tuyến lên Server Quản Trị
  if (request.action === 'CREATE_ORDER') {
    handleCreateOrder(request.payload || {})
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 4.2 Thiết lập URL máy chủ hiện hành
  if (request.action === 'SET_SERVER_URL' && request.url) {
    chrome.storage.local.set({
      customApiServerUrl: request.url,
      webapp_last_url: request.url,
      lastSyncedFromUrl: request.url,
    });
    sendResponse({ success: true });
    return true;
  }

  // 5. Đồng bộ thời gian thực từ Web App (pages.dev)
  if (request.action === 'REALTIME_WEBAPP_SYNC' || request.action === 'SYNC_FROM_WEBAPP_PAGE') {
    const { posts, groups, settings, activePost, url } = request.payload || {};
    if (posts && posts.length) {
      const targetPost = activePost || posts.find((p) => p.status === 'active') || posts[0];
      const hasImage = !!(targetPost?.images && targetPost.images.length > 0 && targetPost.images[0]);
      chrome.storage.local.set({
        isInitialized: true,
        savedPosts: posts || [],
        savedGroups: (groups && groups.length > 0) ? groups : [],
        savedTimes: (settings && settings.postTimes) ? settings.postTimes : ['08:30', '11:30', '17:30', '20:00'],
        attachedImageUrl: targetPost?.images?.[0] || '',
        attachedImages: (targetPost?.images || []).slice(0, 3),
        customPostText: targetPost?.content || '',
        isAttachImageEnabled: hasImage,
        lastSyncedFromUrl: url || 'dang-bai-fb.pages.dev',
        lastSyncTimestamp: Date.now(),
      });
      console.log('[AutoRecruit Background] ✓ Đã nhận dữ liệu đồng bộ từ Web App');
    }
    sendResponse({ success: true });
    return true;
  }

  // 6. DÒ TÌM NHÓM FACEBOOK THEO TỪ KHÓA & THÀNH VIÊN
  if (request.action === 'SEARCH_AND_SCAN_GROUPS') {
    handleSearchGroups(request.payload || {})
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 7. TỰ ĐỘNG THAM GIA CÁC NHÓM ĐÃ CHỌN VÀ THÊM VÀO DANH SÁCH ĐĂNG BÀI
  if (request.action === 'JOIN_AND_ADD_GROUPS') {
    handleBatchJoinAndAddGroups(request.payload || {})
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 8. KIỂM TRA BẢN QUYỀN (LICENSE VERIFY)
  if (request.action === 'CHECK_LICENSE') {
    checkLicenseStatus(request.forceRemote || false)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ isValid: false, message: err.message }));
    return true;
  }

  // 9. KÍCH HOẠT MÃ BẢN QUYỀN (LICENSE ACTIVATE)
  if (request.action === 'ACTIVATE_LICENSE') {
    activateLicenseKey(request.key || request.licenseKey)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  // 10. HỦY KÍCH HOẠT MÃ TRÊN MÁY NÀY
  if (request.action === 'DEACTIVATE_LICENSE') {
    deactivateLicenseKey()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }

  // 11. LẤY MÃ ĐỊNH DANH THIẾT BỊ (DEVICE ID)
  if (request.action === 'GET_DEVICE_ID') {
    getOrCreateDeviceId()
      .then((deviceId) => sendResponse({ success: true, deviceId }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // 12. TẢI LẠI & ĐỒNG BỘ QUẢN TRỊ (KÉO TRẠNG THÁI DUYỆT ĐƠN & KEY MỚI NHẤT TỪ SERVER)
  if (request.action === 'SYNC_ADMIN_STATUS' || request.action === 'FETCH_MY_ORDERS') {
    fetchMyOrdersAndSync()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, message: err.message }));
    return true;
  }
});

// Tra cứu danh sách đơn hàng của máy khách và tự động kích hoạt key nếu đã được Admin duyệt
async function fetchMyOrdersAndSync() {
  const deviceId = await getOrCreateDeviceId();
  const primaryBase = await getApiBaseUrl();
  const serverCandidates = getCandidateServerUrls(primaryBase);

  for (const baseUrl of serverCandidates) {
    try {
      const resp = await fetch(`${baseUrl}/api/orders/my-orders?deviceId=${encodeURIComponent(deviceId)}`);
      const text = await resp.text();
      if (!text || (!text.trim().startsWith('{') && !text.trim().startsWith('['))) continue;
      const data = JSON.parse(text);
      if (data && data.success && Array.isArray(data.orders)) {
        await chrome.storage.local.set({ myOrders: data.orders, lastOrdersSync: Date.now() });

        // Tự động kích hoạt mã nếu có đơn được phê duyệt
        const approvedOrder = data.orders.find((o) => o.status === 'approved' && o.generatedKey);
        if (approvedOrder && approvedOrder.generatedKey) {
          const currentData = await chrome.storage.local.get(['licenseKey']);
          if (!currentData.licenseKey || currentData.licenseKey !== approvedOrder.generatedKey) {
            console.log('[AutoRecruit Background] Phát hiện đơn đã được duyệt, tự động nạp key:', approvedOrder.generatedKey);
            await activateLicenseKey(approvedOrder.generatedKey);
          }
        }

        const licRes = await checkLicenseStatus(true);
        return {
          success: true,
          orders: data.orders,
          totalPending: data.totalPending || 0,
          license: licRes.license,
          isValid: licRes.isValid,
          message: '✓ Đã đồng bộ trạng thái đơn hàng & bản quyền từ máy chủ Quản trị thành công!',
        };
      }
    } catch (e) {}
  }
  return { success: false, message: 'Không thể kết nối đến máy chủ Quản trị!' };
}

// Chuyển URL ảnh thành DataURL trực tiếp trong Background Service Worker (Không dùng FileReader)
async function urlToDataUrl(url) {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const mime = blob.type || 'image/jpeg';
    return `data:${mime};base64,${base64}`;
  } catch (err) {
    console.warn('[AutoRecruit Background] Lỗi nạp URL ảnh:', err);
    return url;
  }
}

// BIẾN THỂ NỘI DUNG TỰ ĐỘNG CHỐNG THUẬT TOÁN QUÉT TRÙNG LẶP CỦA FACEBOOK
// Giữ nguyên vẹn 100% nội dung chính của bài viết, chỉ áp dụng ký tự vô hình để tránh FB check trùng lặp
function generateAutoVariant(baseText, variantIdx) {
  if (!baseText || typeof baseText !== 'string') return '';
  if (variantIdx === 0) {
    return baseText;
  } else if (variantIdx === 1) {
    return baseText + '\u200B\u200C';
  } else {
    return baseText + '\uFEFF\u200D';
  }
}

// Xử lý biến thể xoay vòng xen kẽ 3 loại nội dung kèm Spintax {A|B|C}
function generateShuffledContent(text, index, isSpintaxEnabled, variants = []) {
  if (!text) return '';
  const variantIdx = index % 3; // 0, 1, 2 xen kẽ cho từng nhóm
  let chosenText = text;

  if (variants && Array.isArray(variants) && variants.length === 3 && variants[variantIdx] && variants[variantIdx].trim()) {
    chosenText = variants[variantIdx];
  } else {
    chosenText = generateAutoVariant(text, variantIdx);
  }

  if (!isSpintaxEnabled) {
    return chosenText.replace(/\{([^{}]+)\}/g, (m, c) => c.split('|')[0]);
  }
  return chosenText.replace(/\{([^{}]+)\}/g, (match, choices) => {
    const parts = choices.split('|');
    return parts[Math.floor(Math.random() * parts.length)];
  });
}

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// TIẾN TRÌNH ĐĂNG LIÊN HOÀN CÁC NHÓM (HỖ TRỢ 3 BIẾN THỂ XEN KẼ & CHẶN SPAM)
async function runBatchPosting(
  groups,
  baseContent,
  images,
  isSpintaxEnabled,
  delaySec,
  shouldShuffle = true,
  runType = 'manual',
  postTitle = '',
  variants = []
) {
  let groupsToRun = groups;
  if (shouldShuffle && groups.length > 1) {
    groupsToRun = shuffleArray(groups);
    console.log('[AutoRecruit Background] 🎲 Đã trộn ngẫu nhiên thứ tự', groupsToRun.length, 'nhóm.');
  }

  // Tiền xử lý chuyển đổi tất cả ảnh thành base64 DataURL trong background trước khi gửi sang content
  let processedImages = [];
  if (images && images.length > 0) {
    const rawList = images.slice(0, 3);
    for (let j = 0; j < rawList.length; j++) {
      if (rawList[j]) {
        try {
          const dataUrl = await urlToDataUrl(rawList[j]);
          if (dataUrl) processedImages.push(dataUrl);
        } catch (imgErr) {
          console.warn('Lỗi nạp ảnh nền:', imgErr);
        }
      }
    }
  }

  for (let i = 0; i < groupsToRun.length; i++) {
    if (shouldStop) break;

    // Kiểm tra bản quyền định kỳ trong suốt quá trình đăng bài (Mỗi 3 nhóm kiểm tra máy chủ 1 lần)
    if (i > 0 && i % 3 === 0) {
      const runtimeLicCheck = await checkLicenseStatus(true);
      if (!runtimeLicCheck.isValid) {
        console.warn('[AutoRecruit Background] 🚨 Bản quyền bị thu hồi hoặc hết hạn trong lúc đăng bài:', runtimeLicCheck.message);
        shouldStop = true;
        isRunning = false;
        stopKeepAlive();
        await updateStatus({
          isRunning: false,
          currentIndex: i,
          totalGroups: groupsToRun.length,
          statusText: `🚨 TIẾN TRÌNH BỊ DỪNG: ${runtimeLicCheck.message}`,
        });
        await addHistoryEntry({
          groupName: 'Hệ Thống Bản Quyền',
          groupLink: '',
          postTitle: postTitle || 'Bản Quyền',
          status: 'failed',
          type: runType,
          message: `🚨 Bị dừng giữa chừng: ${runtimeLicCheck.message}`,
        });
        break;
      }
    }

    const group = groupsToRun[i];
    const groupContent = generateShuffledContent(baseContent, i, isSpintaxEnabled, variants);

    let groupUrl = group.link;
    if (!groupUrl.startsWith('http')) {
      groupUrl = `https://www.facebook.com/groups/${groupUrl.replace(/^groups\//, '')}/`;
    }

    await updateStatus({
      isRunning: true,
      currentIndex: i + 1,
      totalGroups: groupsToRun.length,
      currentGroupName: group.name,
      statusText: `Đang mở nhóm ${i + 1}/${groupsToRun.length}: ${group.name}...`,
    });

    let tab = null;
    let postSuccess = false;
    let errorMsg = '';
    let isSpamDetected = false;

    try {
      tab = await chrome.tabs.create({ url: groupUrl, active: true });
      activeTabId = tab.id;

      // Chờ trang Facebook tải xong
      for (let w = 0; w < 12; w++) {
        if (shouldStop) break;
        try {
          const t = await chrome.tabs.get(tab.id);
          if (t.status === 'complete') break;
        } catch (e) {}
        await interruptibleSleep(1000);
      }
      await interruptibleSleep(2500);

      if (shouldStop) {
        if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
        break;
      }

      await updateStatus({
        isRunning: true,
        currentIndex: i + 1,
        totalGroups: groupsToRun.length,
        currentGroupName: group.name,
        statusText: `Đang điền nội dung (Biến thể ${(i % 3) + 1}/3) & ảnh vào: ${group.name}...`,
      });

      // Gửi lệnh sang content script kèm cơ chế thử lại nếu script đang được nạp
      let response = null;
      for (let retry = 0; retry < 5; retry++) {
        if (shouldStop) break;
        try {
          response = await chrome.tabs.sendMessage(tab.id, {
            action: 'AUTO_POST_TO_GROUP',
            content: groupContent,
            images: processedImages.length > 0 ? processedImages : (images || []),
          });
          if (response) break;
        } catch (msgErr) {
          console.log(`[AutoRecruit Background] Đang đợi content script nạp (lần ${retry + 1}/5)...`);
          if (retry === 2) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js'],
              });
            } catch (injErr) {}
          }
          await interruptibleSleep(2000);
        }
      }

      postSuccess = !!(response && response.success);
      if (!postSuccess) errorMsg = response?.error || 'Không thể bấm nút Đăng bài';

      // Kiểm tra mọi dấu hiệu Facebook chặn spam / giới hạn tần suất
      const lowerErr = (errorMsg || '').toLowerCase();
      isSpamDetected = !!(
        response?.isSpamBlocked ||
        lowerErr.includes('giới hạn tần suất') ||
        lowerErr.includes('bảo vệ cộng đồng') ||
        lowerErr.includes('chặn spam') ||
        lowerErr.includes('thao tác quá nhanh') ||
        lowerErr.includes('temporarily blocked') ||
        lowerErr.includes('protect the community') ||
        lowerErr.includes('limit how often') ||
        lowerErr.includes('thử lại sau')
      );

      if (tab?.id) {
        chrome.tabs.remove(tab.id).catch(() => {});
        activeTabId = null;
      }
    } catch (err) {
      errorMsg = err.message || 'Lỗi mạng hoặc tải trang';
      console.error('[AutoRecruit Background] Lỗi nhóm:', group.name, err);
      const lowerErr = (errorMsg || '').toLowerCase();
      if (
        lowerErr.includes('giới hạn tần suất') ||
        lowerErr.includes('bảo vệ cộng đồng') ||
        lowerErr.includes('chặn spam') ||
        lowerErr.includes('thao tác quá nhanh') ||
        lowerErr.includes('temporarily blocked')
      ) {
        isSpamDetected = true;
      }
      if (tab?.id) {
        chrome.tabs.remove(tab.id).catch(() => {});
        activeTabId = null;
      }
    }

    // 🚨 NẾU PHÁT HIỆN FACEBOOK GIỚI HẠN TẦN SUẤT: DỪNG TỨC THÌ 100% VÀ NGẮT TOÀN BỘ HÀNG ĐỢI!
    if (isSpamDetected) {
      shouldStop = true;
      isRunning = false;
      stopKeepAlive();
      console.warn('[AutoRecruit Background] 🚨 FACEBOOK ACTION BLOCK DETECTED -> IMMEDIATE EMERGENCY HALT!');

      const alertData = {
        isBlocked: true,
        detectedAt: new Date().toISOString(),
        groupName: group.name,
        error: errorMsg || 'Facebook giới hạn tần suất bạn đăng bài để bảo vệ cộng đồng khỏi spam.',
        advice: 'Hệ thống đã tự động dừng khẩn cấp toàn bộ tiến trình để bảo vệ an toàn tuyệt đối cho tài khoản. Vui lòng cho tài khoản nghỉ ngơi (sau tối thiểu 4 - 6 tiếng).'
      };
      await chrome.storage.local.set({ fbSpamWarningAlert: alertData });

      await addHistoryEntry({
        groupName: group.name,
        groupLink: group.link,
        postTitle: postTitle || 'Bài Tuyển Dụng',
        status: 'failed',
        type: runType,
        message: `🚨 ${errorMsg || 'Facebook giới hạn tần suất'}. [ĐÃ TỰ ĐỘNG DỪNG TOÀN BỘ TIẾN TRÌNH]`,
      });

      await updateStatus({
        isRunning: false,
        currentIndex: i + 1,
        totalGroups: groupsToRun.length,
        statusText: '🚨 ĐÃ TỰ ĐỘNG DỪNG KHẨN CẤP: Facebook cảnh báo giới hạn tần suất! Đã dừng toàn bộ hàng đợi.',
      });

      break; // DỪNG NGAY LẬP TỨC! KHÔNG ĐĂNG THÊM BẤT KỲ NHÓM NÀO KHÁC!
    }

    // Theo dõi và giới hạn số bài đăng của gói dùng thử (20 bài)
    let trialLimitReached = false;
    let trialPostCountText = '';
    if (postSuccess) {
      try {
        const licRes = await checkLicenseStatus();
        if (licRes?.license?.planType === 'trial') {
          const trialData = await chrome.storage.local.get(['trialPostsCount']);
          const currentTrialCount = (trialData.trialPostsCount || 0) + 1;
          await chrome.storage.local.set({ trialPostsCount: currentTrialCount });
          trialPostCountText = ` [Dùng Thử: ${currentTrialCount}/20 bài]`;

          if (currentTrialCount >= 20) {
            trialLimitReached = true;
            shouldStop = true;
          }
        }
      } catch (tErr) {}
    }

    await addHistoryEntry({
      groupName: group.name,
      groupLink: group.link,
      postTitle: postTitle || 'Bài Tuyển Dụng',
      status: postSuccess ? 'success' : 'failed',
      type: runType,
      message: postSuccess ? `Đăng thành công${trialPostCountText}` : errorMsg,
    });

    if (trialLimitReached) {
      await updateStatus({
        isRunning: false,
        currentIndex: i + 1,
        totalGroups: groupsToRun.length,
        statusText: '🎯 [DÙNG THỬ]: Đã hoàn thành trọn vẹn 20/20 bài đăng! Vui lòng nâng cấp bản quyền để tiếp tục.',
      });
      break;
    }

    if (shouldStop) break;

    // Giãn cách nghỉ an toàn giữa 2 nhóm (Kèm Jitter ngẫu nhiên tránh nhịp máy tính)
    if (i < groupsToRun.length - 1) {
      // 1. Sau mỗi 4 nhóm, nghỉ xả hơi (Cooling Break) 90 - 120s
      if ((i + 1) % 4 === 0) {
        const coolingSec = 90 + Math.floor(Math.random() * 30);
        for (let c = coolingSec; c > 0; c--) {
          if (shouldStop) break;
          await updateStatus({
            isRunning: true,
            currentIndex: i + 1,
            totalGroups: groupsToRun.length,
            currentGroupName: group.name,
            statusText: `🛡️ [Chống Checkpoint]: Đã đăng ${i + 1} nhóm liên tiếp. Đang nghỉ xả hơi ${c}s...`,
          });
          await interruptibleSleep(1000);
        }
      }

      // 2. Giãn cách ngẫu nhiên an toàn giữa các bài (+0 đến 20s ngẫu nhiên)
      const randomJitter = Math.floor(Math.random() * 20);
      const waitTime = Math.max(25, delaySec) + randomJitter;

      for (let sec = waitTime; sec > 0; sec--) {
        if (shouldStop) break;
        await updateStatus({
          isRunning: true,
          currentIndex: i + 1,
          totalGroups: groupsToRun.length,
          currentGroupName: group.name,
          statusText: `Đã xong ${i + 1}/${groupsToRun.length}. Nghỉ an toàn ${sec}s (kèm jitter ngẫu nhiên)...`,
        });
        await interruptibleSleep(1000);
      }
    }
  }

  isRunning = false;
  activeTabId = null;
  stopKeepAlive();
  const finalMsg = shouldStop ? '⏹️ Đã dừng tiến trình theo yêu cầu của bạn.' : '✓ Đã hoàn thành đăng tất cả các nhóm đã chọn!';
  await updateStatus({
    isRunning: false,
    currentIndex: groupsToRun.length,
    totalGroups: groupsToRun.length,
    statusText: finalMsg,
  });
}

// DÒ TÌM NHÓM FACEBOOK THEO TỪ KHÓA
async function handleSearchGroups({ keyword, minMembers = 0, autoJoin = false }) {
  if (!keyword) throw new Error('Vui lòng nhập từ khóa tìm kiếm nhóm!');

  // Sử dụng đường dẫn tìm kiếm chuẩn của Facebook: https://www.facebook.com/search/groups/?q=...
  const searchUrl = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(keyword)}`;
  const tab = await chrome.tabs.create({ url: searchUrl, active: true });

  // Chờ nạp trang
  for (let wait = 0; wait < 12; wait++) {
    try {
      const t = await chrome.tabs.get(tab.id);
      if (t.status === 'complete') break;
    } catch (e) {}
    await sleep(1000);
  }
  await sleep(3500);

  let response = null;
  for (let r = 0; r < 5; r++) {
    try {
      response = await chrome.tabs.sendMessage(tab.id, {
        action: 'SCAN_AND_PARSE_GROUPS',
        minMembers: parseInt(minMembers, 10) || 0,
        autoJoin: !!autoJoin,
      });
      if (response && response.groups) break;
    } catch (err) {
      console.log(`[AutoRecruit Background] Đợi content script nạp trang tìm kiếm (lần ${r + 1}/5)...`);
      if (r === 2) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          });
        } catch (injErr) {}
      }
      await sleep(2000);
    }
  }

  setTimeout(() => {
    if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
  }, 3000);

  return response || { success: true, groups: [] };
}

// TỰ ĐỘNG THAM GIA CÁC NHÓM ĐÃ CHỌN VÀ THÊM VÀO DANH SÁCH ĐĂNG BÀI
async function handleBatchJoinAndAddGroups({ groupsToProcess = [] }) {
  if (!groupsToProcess.length) {
    return { success: false, message: 'Danh sách nhóm cần xử lý trống!' };
  }

  console.log(`[AutoRecruit Background] 🚀 Bắt đầu tự động tham gia ${groupsToProcess.length} nhóm...`);
  startKeepAlive();

  let joinedCount = 0;
  let alreadyJoinedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < groupsToProcess.length; i++) {
    const group = groupsToProcess[i];
    let groupUrl = group.link;
    if (!groupUrl.startsWith('http')) {
      groupUrl = `https://www.facebook.com/groups/${groupUrl.replace(/^groups\//, '')}/`;
    }

    await updateStatus({
      isRunning: true,
      currentIndex: i + 1,
      totalGroups: groupsToProcess.length,
      currentGroupName: group.name,
      statusText: `Đang tham gia nhóm ${i + 1}/${groupsToProcess.length}: ${group.name}...`,
    });

    let tab = null;
    try {
      tab = await chrome.tabs.create({ url: groupUrl, active: true });

      // Chờ nạp trang
      for (let wait = 0; wait < 12; wait++) {
        try {
          const t = await chrome.tabs.get(tab.id);
          if (t.status === 'complete') break;
        } catch (e) {}
        await sleep(1000);
      }
      await sleep(2500);

      // Gửi lệnh sang content script thực hiện bấm Tham gia
      let res = null;
      for (let retry = 0; retry < 4; retry++) {
        try {
          res = await chrome.tabs.sendMessage(tab.id, { action: 'AUTO_JOIN_GROUP' });
          if (res) break;
        } catch (msgErr) {
          if (retry === 1) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js'],
              });
            } catch (e) {}
          }
          await sleep(2000);
        }
      }

      if (res && res.success) {
        if (res.message && res.message.includes('Đã là thành viên')) {
          alreadyJoinedCount++;
        } else {
          joinedCount++;
        }
        group.joined = true;
      } else {
        failedCount++;
      }

      await sleep(2000);
      if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
    } catch (err) {
      console.warn('[AutoRecruit Background] Lỗi tham gia nhóm:', group.name, err);
      failedCount++;
      if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
    }

    // Giãn cách an toàn giữa 2 lần tham gia nhóm (nghỉ 4 giây chống spam)
    if (i < groupsToProcess.length - 1) {
      for (let s = 4; s > 0; s--) {
        await updateStatus({
          isRunning: true,
          currentIndex: i + 1,
          totalGroups: groupsToProcess.length,
          currentGroupName: group.name,
          statusText: `Đã xong ${group.name}. Chờ ${s}s an toàn trước nhóm kế tiếp...`,
        });
        await sleep(1000);
      }
    }
  }

  // Tự động thêm các nhóm này vào danh sách đăng bài (savedGroups)
  const storageData = await chrome.storage.local.get(['savedGroups']);
  const currentSaved = storageData.savedGroups || [];
  let addedCount = 0;

  groupsToProcess.forEach((g) => {
    if (!currentSaved.some((item) => item.link === g.link)) {
      currentSaved.push({
        id: g.id || 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name: g.name,
        link: g.link,
        enabled: true,
      });
      addedCount++;
    }
  });

  await chrome.storage.local.set({ savedGroups: currentSaved });

  stopKeepAlive();
  await updateStatus({
    isRunning: false,
    currentIndex: groupsToProcess.length,
    totalGroups: groupsToProcess.length,
    statusText: `✓ Đã tham gia xong & thêm ${addedCount} nhóm mới vào danh sách đăng bài!`,
  });

  // Ghi nhật ký vào Lịch sử
  await addHistoryEntry({
    groupName: `Tham gia ${groupsToProcess.length} nhóm`,
    groupLink: '#',
    postTitle: 'Tự động Tham gia Nhóm',
    status: 'success',
    type: 'manual',
    message: `Thành công: ${joinedCount + alreadyJoinedCount}, Thất bại: ${failedCount}, Nạp mới: ${addedCount}`,
  });

  return {
    success: true,
    joinedCount,
    alreadyJoinedCount,
    failedCount,
    addedCount,
    updatedGroups: currentSaved,
  };
}
