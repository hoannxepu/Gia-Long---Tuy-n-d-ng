// background.js - Điều phối Đăng Bài Facebook & Hẹn Giờ Chuẩn 100% Manifest V3 (v1.0.5)
// Kiến trúc Single Source of Truth cho Bản Quyền (License State Machine) & Quản Lý Tài Khoản FB

self.__GLFB_IS_BACKGROUND_WORKER__ = true;

try {
  importScripts('storage.js');
  importScripts('spintax.js');
  importScripts('ed25519_verify.js');
  importScripts('accounts_manager.js');
  importScripts('fb_runner.js');
  importScripts('alarms_manager.js');
} catch (e) {
  console.warn('[Background] importScripts notice:', e);
}

let isRunning = false;
let shouldStop = false;
let activeTabId = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Chống ngủ Service Worker trong Manifest V3 thông qua Alarms chu kỳ 30s
function startKeepAlive() {
  if (typeof AlarmsManager !== 'undefined') {
    AlarmsManager.startKeepAlive();
  }
}

function stopKeepAlive() {
  if (typeof AlarmsManager !== 'undefined') {
    AlarmsManager.stopKeepAlive();
  }
}

// Cập nhật trạng thái tiến trình vào storage
async function updateStatus(status) {
  try {
    await chrome.storage.local.set({ postJobState: status });
  } catch (e) {}
}

// GHI LỊCH SỬ ĐĂNG BÀI (Đồng bộ qua FbRunner.appendHistoryEntry & SharedStorage mutex, giữ tối đa 1.000 bản ghi)
async function addHistoryEntry(entry) {
  try {
    if (typeof FbRunner !== 'undefined' && typeof FbRunner.appendHistoryEntry === 'function') {
      await FbRunner.appendHistoryEntry(entry);
      return;
    }
    const res = await chrome.storage.local.get(['postHistory', 'fbAccounts', 'activeAccountId']);
    const history = Array.isArray(res.postHistory) ? res.postHistory : [];
    const accounts = Array.isArray(res.fbAccounts) ? res.fbAccounts : [];
    const activeAcc = accounts.find((a) => a.id === res.activeAccountId) || accounts[0] || null;
    const newEntry = {
      id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      timestamp: Date.now(),
      timeFormatted: new Date().toLocaleString('vi-VN'),
      accountId: entry.accountId || (activeAcc ? activeAcc.id : 'default'),
      accountName: entry.accountName || (activeAcc ? activeAcc.name : 'Tài khoản mặc định'),
      cUser: entry.cUser || (activeAcc ? activeAcc.cUser || '' : ''),
      ...entry,
    };
    const updated = [newEntry, ...history].slice(0, 1000);
    await chrome.storage.local.set({ postHistory: updated });
  } catch (err) {
    console.warn('[AutoRecruit Background] Lỗi ghi lịch sử:', err);
  }
}

// ============================================================================
// HỆ THỐNG ĐỊNH DANH THIẾT BỊ DUY NHẤT (CANONICAL DEVICE ID WITH PROMISE MUTEX)
// & MÁY TRẠNG THÁI BẢN QUYỀN (SINGLE SOURCE OF TRUTH LICENSE STATE MACHINE)
// ============================================================================
const PRODUCTION_API_BASE = 'https://gia-long---tuy-n-d-ng.pages.dev';

const LICENSE_STATES = {
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
  SUSPENDED: 'SUSPENDED',
  UNREGISTERED: 'UNREGISTERED',
  UNKNOWN_OFFLINE: 'UNKNOWN_OFFLINE',
};

const LICENSE_CACHE_TTL_MS = 60 * 1000; // 60 giây khi UI (Popup/Dashboard) mở
const UNREGISTERED_DOWNGRADE_STREAK_THRESHOLD = 3; // Cần >= 3 phản hồi unregistered liên tiếp mới hạ cấp máy đang ACTIVE
const OFFLINE_GRACE_PERIOD_MS = 48 * 60 * 60 * 1000; // 48 giờ giữ trạng thái ACTIVE khi lỗi mạng/server 5xx

let cachedDeviceId = null;
let inFlightDeviceIdPromise = null;
let inFlightLicenseCheckPromise = null;
let licenseSeqCounter = 0;
let consecutiveNetworkFailures = 0;
let fastPollTimer = null;
let fastPollEndTime = 0;

function isValidDeviceId(val) {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (trimmed.length < 6) return false;
  const lower = trimmed.toLowerCase();
  if (lower.includes('đang lấy') || lower.includes('dang lay') || lower === 'chưa gắn' || lower === 'chuagan') {
    return false;
  }
  return true;
}

function isRealHumanLicenseKey(key) {
  if (!key || typeof key !== 'string') return false;
  const clean = key.trim();
  if (!clean || clean === 'GLFB-VIP-ACTIVE') return false;
  if (
    clean.startsWith('GLFB_ED1_') ||
    clean.startsWith('GLFB_ED25519_') ||
    clean.startsWith('GLFB_SIG_')
  ) {
    return false;
  }
  return clean.toUpperCase().startsWith('GLFB-');
}

/**
 * Hàm lấy/khởi tạo Mã Máy duy nhất trong toàn bộ Extension.
 * An toàn tuyệt đối khi gọi đồng thời (50+ callers cùng lúc nhận đúng 1 Promise & 1 ID).
 * Hỗ trợ bảo toàn legacyHintId từ localStorage cũ của Dashboard để khách đang có bản quyền không bị mất.
 */
async function getOrCreateDeviceId(legacyHintId = '') {
  const cleanHint = isValidDeviceId(legacyHintId) ? String(legacyHintId).trim() : '';

  if (cachedDeviceId && isValidDeviceId(cachedDeviceId)) {
    if (cleanHint && cleanHint.toLowerCase() !== cachedDeviceId.toLowerCase()) {
      try {
        const st = await chrome.storage.local.get(['legacyDeviceIds']);
        const list = Array.isArray(st.legacyDeviceIds) ? st.legacyDeviceIds : [];
        if (!list.some((id) => String(id).toLowerCase() === cleanHint.toLowerCase())) {
          await chrome.storage.local.set({ legacyDeviceIds: [...list, cleanHint] });
        }
      } catch (_) {}
    }
    return cachedDeviceId;
  }

  if (inFlightDeviceIdPromise) {
    return inFlightDeviceIdPromise;
  }

  inFlightDeviceIdPromise = (async () => {
    try {
      const localData = await chrome.storage.local.get(['autorecruit_device_id', 'legacyDeviceIds']);
      let syncId = '';
      try {
        if (chrome.storage && chrome.storage.sync) {
          const syncData = await chrome.storage.sync.get(['autorecruit_device_id']);
          if (isValidDeviceId(syncData?.autorecruit_device_id)) {
            syncId = String(syncData.autorecruit_device_id).trim();
          }
        }
      } catch (_) {}

      const localId = isValidDeviceId(localData?.autorecruit_device_id)
        ? String(localData.autorecruit_device_id).trim()
        : '';

      const legacySet = new Set(
        Array.isArray(localData?.legacyDeviceIds)
          ? localData.legacyDeviceIds.filter(isValidDeviceId).map((s) => String(s).trim())
          : []
      );
      if (syncId) legacySet.add(syncId);
      if (cleanHint) legacySet.add(cleanHint);
      if (localId) legacySet.add(localId);

      // Thứ tự ưu tiên: local -> sync -> legacyHint -> sinh UUID mới
      let chosenId = localId || syncId || cleanHint;
      if (!chosenId) {
        chosenId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
      }

      cachedDeviceId = chosenId;
      const otherLegacyIds = Array.from(legacySet).filter(
        (id) => id.toLowerCase() !== chosenId.toLowerCase()
      );

      await chrome.storage.local.set({
        autorecruit_device_id: chosenId,
        legacyDeviceIds: otherLegacyIds,
      });

      try {
        if (chrome.storage && chrome.storage.sync) {
          await chrome.storage.sync.set({ autorecruit_device_id: chosenId });
        }
      } catch (_) {}

      return chosenId;
    } catch (e) {
      if (!cachedDeviceId) {
        cachedDeviceId =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : 'dev_pc_' + Date.now().toString(36);
      }
      return cachedDeviceId;
    } finally {
      inFlightDeviceIdPromise = null;
    }
  })();

  return inFlightDeviceIdPromise;
}

async function getApiBaseUrl() {
  try {
    const data = await chrome.storage.local.get(['customApiServerUrl']);
    if (data.customApiServerUrl && String(data.customApiServerUrl).trim().startsWith('http')) {
      return data.customApiServerUrl.trim().replace(/\/+$/, '');
    }
  } catch (e) {}
  return PRODUCTION_API_BASE;
}

function getCandidateServerUrls(primaryBase = null) {
  const urls = [];
  if (primaryBase && primaryBase.startsWith('http')) {
    urls.push(primaryBase.trim().replace(/\/+$/, ''));
  }
  if (!urls.includes(PRODUCTION_API_BASE)) {
    urls.push(PRODUCTION_API_BASE);
  }
  return urls;
}

async function getAllServerCandidates(primaryBase = null) {
  return getCandidateServerUrls(primaryBase);
}

/**
 * Ghi trạng thái license chuẩn hóa kèm số thứ tự tăng đơn điệu (licenseSeq) và timestamp (licenseUpdatedAt).
 * Mọi cập nhật trạng thái bản quyền đều đi qua hàm này để chống race condition và render lệch thứ tự.
 */
async function commitLicenseState(patch = {}) {
  const runCommit = async () => {
    const cur = await chrome.storage.local.get(['licenseSeq', 'licenseState', 'licenseStatus']);
    const nextSeq = Math.max(licenseSeqCounter + 1, (Number(cur.licenseSeq) || 0) + 1);
    licenseSeqCounter = nextSeq;
    const now = Date.now();
    const toWrite = {
      ...patch,
      licenseSeq: nextSeq,
      licenseUpdatedAt: now,
    };
    await chrome.storage.local.set(toWrite);
    return { nextSeq, updatedAt: now };
  };

  if (typeof SharedStorage !== 'undefined' && SharedStorage.enqueueKeyTask) {
    return SharedStorage.enqueueKeyTask('licenseState', runCommit);
  }
  return runCommit();
}

/**
 * Thực thi dừng khẩn cấp toàn bộ tiến trình khi có xác nhận REVOKED hoặc SUSPENDED thật sự từ máy chủ.
 */
async function enforceHardRevokeOrSuspend({ isRevoked, isSuspended, message }) {
  const nextState = isRevoked ? LICENSE_STATES.REVOKED : LICENSE_STATES.SUSPENDED;
  const nextStatus = isRevoked ? 'revoked' : 'suspended';

  await commitLicenseState({
    licenseState: nextState,
    licenseStatus: nextStatus,
    isRevoked: Boolean(isRevoked),
    isSuspended: Boolean(isSuspended),
    isVip: false,
    isRunning: false,
    isScheduleActive: false,
    autoScheduleEnabled: false,
    scheduledJobs: [],
    unregisteredStreak: 0,
    postJobState: 'REVOKED_STOPPED',
    lastCheckedAt: Date.now(),
  });

  if (isRevoked) {
    await chrome.storage.local.remove(['signedToken', 'licenseKey', 'licenseData', 'currentLicense', 'licenseInfo']);
  }

  try {
    if (typeof FbRunner !== 'undefined' && typeof FbRunner.stopBatchPosting === 'function') {
      await Promise.resolve(FbRunner.stopBatchPosting()).catch(() => {});
    }
  } catch (_) {}
  try {
    if (typeof AlarmsManager !== 'undefined' && typeof AlarmsManager.stopKeepAlive === 'function') {
      await Promise.resolve(AlarmsManager.stopKeepAlive()).catch(() => {});
    }
  } catch (_) {}
  try {
    if (typeof chrome !== 'undefined' && chrome.alarms && typeof chrome.alarms.clearAll === 'function') {
      chrome.alarms.clearAll(() => {});
    }
  } catch (_) {}

  shouldStop = true;
  isRunning = false;
  try { stopKeepAlive(); } catch (_) {}
  if (activeTabId) {
    try {
      Promise.resolve(chrome.tabs.remove(activeTabId)).catch(() => {});
    } catch (_) {}
    activeTabId = null;
  }

  try {
    if (chrome.tabs && typeof chrome.tabs.query === 'function') {
      Promise.resolve(chrome.tabs.query({})).then((tabs) => {
        if (!Array.isArray(tabs)) return;
        tabs.forEach((tab) => {
          if (tab && tab.id) {
            try {
              Promise.resolve(chrome.tabs.sendMessage(tab.id, {
                action: 'FORCE_REVOKE_STOP',
                message: message || '🚨 Bản quyền của máy tính này đã bị Quản trị viên thu hồi hoặc tạm khóa!',
              })).catch(() => {});
            } catch (_) {}
          }
        });
      }).catch(() => {});
    }
  } catch (_) {}
}

/**
 * Khởi động kiểm tra nhanh (Fast Poll 3s/lần trong tối đa 5 phút) CHỈ ngay sau khi khách gửi đơn mua gói.
 * Chỉ chạy duy nhất tại Service Worker (background.js), tuyệt đối không chạy trùng từ Dashboard.
 */
function startFastLicensePolling(machineId, maxSeconds = 300) {
  if (fastPollTimer) {
    clearInterval(fastPollTimer);
    fastPollTimer = null;
  }
  fastPollEndTime = Date.now() + maxSeconds * 1000;
  chrome.storage.local.set({ fastPollUntil: fastPollEndTime }).catch(() => {});

  try {
    if (chrome.alarms) {
      chrome.alarms.create('glfb_fast_order_poll', { periodInMinutes: 0.5 });
    }
  } catch (_) {}

  fastPollTimer = setInterval(async () => {
    if (Date.now() >= fastPollEndTime) {
      clearInterval(fastPollTimer);
      fastPollTimer = null;
      try {
        chrome.alarms?.clear('glfb_fast_order_poll');
      } catch (_) {}
      return;
    }

    try {
      const res = await checkLicenseStatus(true, { reason: 'fast_poll_order' });
      if (res && res.isValid && res.state === LICENSE_STATES.ACTIVE) {
        clearInterval(fastPollTimer);
        fastPollTimer = null;
        fastPollEndTime = 0;
        chrome.storage.local.remove(['fastPollUntil']).catch(() => {});
        try {
          chrome.alarms?.clear('glfb_fast_order_poll');
        } catch (_) {}

        try {
          if (chrome.tabs && chrome.tabs.query) {
            chrome.tabs.query({}).then((tabs) => {
              tabs.forEach((tab) => {
                if (tab.id) {
                  chrome.tabs.sendMessage(tab.id, {
                    action: 'VIP_ACTIVATED_FAST',
                    data: res,
                  }).catch(() => {});
                }
              });
            }).catch(() => {});
          }
        } catch (_) {}
      }
    } catch (_) {}
  }, 3000);
}

/**
 * Gọi máy chủ /api/check?machine_id=... cho một mã máy cụ thể.
 * Phân biệt rõ:
 *  - Lỗi mạng / timeout / HTTP 5xx / HTTP 429 / JSON lỗi -> { outcome: 'NETWORK_ERROR' }
 *  - Kết quả xác định từ server -> { outcome: 'AUTHORITATIVE', data, baseUrl }
 */
async function queryServerCheckByMachineId(machineId, serverCandidates) {
  let sawNetworkOr5xxError = false;

  for (const baseUrl of serverCandidates) {
    try {
      const resp = await fetch(`${baseUrl}/api/check?machine_id=${encodeURIComponent(machineId)}`, {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(7000),
      });

      if (resp.status >= 500 || resp.status === 429 || resp.status === 408) {
        sawNetworkOr5xxError = true;
        continue;
      }
      if (!resp.ok) {
        sawNetworkOr5xxError = true;
        continue;
      }

      const text = await resp.text();
      if (!text || (!text.trim().startsWith('{') && !text.trim().startsWith('['))) {
        sawNetworkOr5xxError = true;
        continue;
      }

      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || data.status === 'error') {
        sawNetworkOr5xxError = true;
        continue;
      }

      return { outcome: 'AUTHORITATIVE', data, baseUrl };
    } catch (err) {
      sawNetworkOr5xxError = true;
    }
  }

  return { outcome: 'NETWORK_ERROR', sawNetworkOr5xxError };
}

/**
 * Hàm tương thích ngược cho các nơi gọi checkServerBackground:
 * Điều hướng 100% về checkLicenseStatus(true) để đảm bảo chỉ có 1 nguồn sự thật duy nhất.
 */
async function checkServerBackground() {
  return checkLicenseStatus(true, { reason: 'background_sync' });
}

/**
 * KIỂM TRA BẢN QUYỀN TRUNG TÂM (SINGLE SOURCE OF TRUTH)
 * - Deduplicate in-flight requests: mọi caller gọi đồng thời đều nhận chung 1 Promise (không bao giờ trả null).
 * - Máy trạng thái rõ ràng: ACTIVE | EXPIRED | REVOKED | SUSPENDED | UNREGISTERED | UNKNOWN_OFFLINE.
 * - Chống flapping: máy đang ACTIVE cần >= 3 lần UNREGISTERED xác định liên tiếp mới hạ cấp.
 * - Lỗi mạng / timeout / HTTP 5xx / 429 -> giữ nguyên trạng thái cũ (Grace Period), không xóa dữ liệu.
 */
async function checkLicenseStatus(forceRemote = false, options = {}) {
  // Nếu đang có 1 request kiểm tra bản quyền đang bay, dùng chung Promise đó cho mọi caller!
  if (inFlightLicenseCheckPromise) {
    return inFlightLicenseCheckPromise;
  }

  inFlightLicenseCheckPromise = (async () => {
    try {
      const data = await chrome.storage.local.get([
        'licenseKey',
        'licenseData',
        'gialong_customer_phone',
        'signedToken',
        'licenseState',
        'licenseStatus',
        'expiresAt',
        'lastCheckedAt',
        'isVip',
        'isRevoked',
        'isSuspended',
        'cachedPkgName',
        'unregisteredStreak',
        'licenseSeq',
        'licenseUpdatedAt',
        'legacyDeviceIds',
      ]);

      const deviceId = await getOrCreateDeviceId(options.legacyHintId || '');
      const now = Date.now();
      const currentSeq = Number(data.licenseSeq) || 1;
      const currentUpdatedAt = Number(data.licenseUpdatedAt) || now;

      // Xác định xem máy hiện tại có đang ở trạng thái ACTIVE hợp lệ trong local storage không
      const storedExpStr = data.expiresAt || data.licenseData?.expiresAt || '';
      const storedExpMs = storedExpStr ? new Date(storedExpStr).getTime() : 0;
      const hasValidFutureExpiry = storedExpMs > now;
      const wasActiveLocally =
        !data.isRevoked &&
        !data.isSuspended &&
        hasValidFutureExpiry &&
        Boolean(data.isVip || data.licenseStatus === 'active' || data.licenseState === LICENSE_STATES.ACTIVE);

      // 1. Kiểm tra chữ ký Ed25519 của signedToken (nếu là token định dạng Ed25519)
      const token = data.signedToken || '';
      if (
        token &&
        (token.startsWith('GLFB_ED25519_') || token.startsWith('GLFB_ED1_')) &&
        typeof self !== 'undefined' &&
        typeof self.verifyEd25519LicenseToken === 'function'
      ) {
        const verifyRes = await self.verifyEd25519LicenseToken(token, deviceId, data.lastCheckedAt || now);
        if (!verifyRes.valid) {
          // CHỈ xóa token khi chữ ký giả mạo thật sự hoặc sai mã máy; lỗi hết hạn offline 48h thì giữ nguyên để check online
          if (
            verifyRes.isTampered ||
            verifyRes.errorCode === 'SIGNATURE_MISMATCH' ||
            verifyRes.errorCode === 'MALFORMED_TOKEN' ||
            verifyRes.errorCode === 'MACHINE_ID_MISMATCH'
          ) {
            console.warn('[Security] Chữ ký Ed25519 bị giả mạo hoặc không khớp mã máy:', verifyRes.errorCode);
            await chrome.storage.local.remove(['signedToken']);
          }
        }
      }

      // 2. Nếu không ép buộc gọi server (forceRemote === false) và cache còn trong TTL (60s): trả ngay từ cache
      const lastChecked = Number(data.lastCheckedAt) || 0;
      if (!forceRemote && lastChecked > 0 && now - lastChecked < LICENSE_CACHE_TTL_MS) {
        if (data.isRevoked) {
          return {
            isValid: false,
            isActivated: false,
            isRevoked: true,
            state: LICENSE_STATES.REVOKED,
            status: 'revoked',
            seq: currentSeq,
            updatedAt: currentUpdatedAt,
            deviceId,
            message: '🚨 Thiết bị đã bị Quản trị viên thu hồi bản quyền và ngắt máy!',
            license: null,
          };
        }
        if (data.isSuspended) {
          return {
            isValid: false,
            isActivated: false,
            isSuspended: true,
            state: LICENSE_STATES.SUSPENDED,
            status: 'suspended',
            seq: currentSeq,
            updatedAt: currentUpdatedAt,
            deviceId,
            message: '⏸️ Bản quyền đang bị Quản trị viên tạm khóa!',
            license: null,
          };
        }
        if (wasActiveLocally) {
          const daysLeft = Math.max(1, Math.ceil((storedExpMs - now) / (24 * 60 * 60 * 1000)));
          const licObj = {
            ...(data.licenseData || {}),
            key: isRealHumanLicenseKey(data.licenseKey) ? data.licenseKey : (data.licenseData?.key || 'VIP-MACHINE'),
            expiresAt: storedExpStr,
            notes: data.cachedPkgName || data.licenseData?.notes || 'Bản quyền VIP Gia Long',
            daysLeft,
            isExpired: false,
          };
          return {
            isValid: true,
            isActivated: true,
            state: LICENSE_STATES.ACTIVE,
            status: 'active',
            seq: currentSeq,
            updatedAt: currentUpdatedAt,
            deviceId,
            message: `✓ Bản quyền VIP đang hoạt động (Còn ${daysLeft} ngày)`,
            license: licObj,
          };
        }
      }

      // 3. Truy vấn máy chủ qua endpoint chuẩn duy nhất: /api/check?machine_id=...
      const primaryBase = await getApiBaseUrl();
      const serverCandidates = getCandidateServerUrls(primaryBase);
      let serverCheck = await queryServerCheckByMachineId(deviceId, serverCandidates);
      let effectiveDeviceId = deviceId;

      // Nếu mã máy chính trả về unregistered nhưng máy có legacyDeviceIds (do bản cũ từng sinh ID khác trên Dashboard),
      // tự động kiểm tra các legacyDeviceIds; nếu 1 ID cũ đang có bản quyền ACTIVE trên server -> tự động di trú về ID đó!
      if (
        serverCheck.outcome === 'AUTHORITATIVE' &&
        serverCheck.data?.status === 'unregistered' &&
        Array.isArray(data.legacyDeviceIds) &&
        data.legacyDeviceIds.length > 0
      ) {
        for (const legId of data.legacyDeviceIds) {
          if (!isValidDeviceId(legId) || legId.toLowerCase() === deviceId.toLowerCase()) continue;
          const legCheck = await queryServerCheckByMachineId(legId, serverCandidates);
          if (legCheck.outcome === 'AUTHORITATIVE' && legCheck.data?.status === 'active') {
            console.log(`[License Migration] 🔄 Phát hiện bản quyền ACTIVE trên mã máy cũ (${legId}) -> Tự động khôi phục mã máy!`);
            effectiveDeviceId = legId;
            cachedDeviceId = legId;
            serverCheck = legCheck;
            await chrome.storage.local.set({ autorecruit_device_id: legId });
            try {
              chrome.storage?.sync?.set({ autorecruit_device_id: legId });
            } catch (_) {}
            break;
          }
        }
      }

      // Nếu có mã bản quyền thật (GLFB-...) được nhập thủ công mà /api/check chưa ánh xạ thiết bị,
      // kiểm tra phụ qua /api/license/verify (TUYỆT ĐỐI không gửi signedToken hay 'GLFB-VIP-ACTIVE' vào đây!)
      if (
        serverCheck.outcome === 'AUTHORITATIVE' &&
        serverCheck.data?.status === 'unregistered' &&
        isRealHumanLicenseKey(data.licenseKey)
      ) {
        for (const baseUrl of serverCandidates) {
          try {
            const vResp = await fetch(`${baseUrl}/api/license/verify`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
              body: JSON.stringify({ key: data.licenseKey.trim(), deviceId: effectiveDeviceId }),
              signal: AbortSignal.timeout(7000),
            });
            if (vResp.ok) {
              const vData = await vResp.json();
              if (vData && vData.valid && vData.license) {
                serverCheck = {
                  outcome: 'AUTHORITATIVE',
                  baseUrl,
                  data: {
                    success: true,
                    status: 'active',
                    machine_id: effectiveDeviceId,
                    plan: vData.license.planType || 'individual',
                    expires_at: vData.license.expiresAt,
                    days_left: vData.license.daysLeft || 30,
                    pkg_name: vData.license.notes || 'Bản quyền VIP Gia Long',
                    client_name: vData.license.clientName || 'Khách Kích Hoạt',
                    license_key: vData.license.key || data.licenseKey.trim(),
                    message: vData.message || '✓ Bản quyền VIP hợp lệ!',
                  },
                };
                break;
              } else if (vData && vData.isRevoked === true && vData.statusCode !== 'NOT_FOUND') {
                serverCheck = {
                  outcome: 'AUTHORITATIVE',
                  baseUrl,
                  data: {
                    success: false,
                    status: 'revoked',
                    isRevoked: true,
                    action: 'FORCE_REVOKE',
                    message: vData.message || '🚨 Bản quyền đã bị Quản trị viên thu hồi!',
                  },
                };
                break;
              }
            }
          } catch (_) {}
        }
      }

      // 4. XỬ LÝ KHI LỖI MẠNG / TIMEOUT / SERVER 5XX (GRACE PERIOD - KHÔNG BAO GIỜ XÓA HAY HẠ CẤP)
      if (serverCheck.outcome === 'NETWORK_ERROR') {
        consecutiveNetworkFailures = Math.min(10, consecutiveNetworkFailures + 1);
        if (wasActiveLocally && now - lastChecked < OFFLINE_GRACE_PERIOD_MS) {
          const daysLeft = Math.max(1, Math.ceil((storedExpMs - now) / (24 * 60 * 60 * 1000)));
          const licObj = {
            ...(data.licenseData || {}),
            expiresAt: storedExpStr,
            daysLeft,
            isExpired: false,
          };
          return {
            isValid: true,
            isActivated: true,
            offlineGrace: true,
            state: LICENSE_STATES.ACTIVE,
            status: 'active',
            seq: currentSeq,
            updatedAt: currentUpdatedAt,
            deviceId: effectiveDeviceId,
            message: `✓ Bản quyền VIP đang hoạt động (Chế độ bảo vệ ngoại tuyến - Còn ${daysLeft} ngày)`,
            license: licObj,
          };
        }

        return {
          isValid: false,
          isActivated: Boolean(wasActiveLocally),
          state: LICENSE_STATES.UNKNOWN_OFFLINE,
          status: 'offline',
          seq: currentSeq,
          updatedAt: currentUpdatedAt,
          deviceId: effectiveDeviceId,
          message: 'Không thể kết nối máy chủ xác thực bản quyền (Đang giữ trạng thái an toàn).',
          license: data.licenseData || null,
        };
      }

      // Đã nhận phản hồi xác định từ máy chủ -> reset bộ đếm lỗi mạng
      consecutiveNetworkFailures = 0;
      const srv = serverCheck.data;

      // 5A. TRẠNG THÁI XÁC ĐỊNH: ACTIVE
      if (srv.success && srv.status === 'active') {
        const expStr = srv.expires_at || storedExpStr || new Date(now + 30 * 86400000).toISOString();
        const expMs = new Date(expStr).getTime();
        const daysLeft = !isNaN(expMs) && expMs > now
          ? Math.max(1, Math.ceil((expMs - now) / (24 * 60 * 60 * 1000)))
          : (Number(srv.days_left) || 30);

        const realKey = isRealHumanLicenseKey(srv.license_key)
          ? srv.license_key
          : isRealHumanLicenseKey(srv.key)
            ? srv.key
            : isRealHumanLicenseKey(data.licenseKey)
              ? data.licenseKey
              : '';

        const freshLic = {
          ...(data.licenseData || {}),
          ...(srv.license || {}),
          key: realKey || srv.key || 'VIP-MACHINE',
          clientName: srv.client_name || srv.license?.clientName || data.licenseData?.clientName || 'Khách Hàng VIP',
          planType: srv.plan || srv.license?.planType || data.licenseData?.planType || 'individual',
          expiresAt: expStr,
          notes: srv.pkg_name || srv.license?.notes || data.cachedPkgName || 'Bản quyền VIP Gia Long',
          daysLeft,
          isExpired: false,
          isRevoked: false,
          isSuspended: false,
          lastVerifiedAt: now,
        };

        const patch = {
          licenseState: LICENSE_STATES.ACTIVE,
          licenseStatus: 'active',
          isVip: true,
          isRevoked: false,
          isSuspended: false,
          unregisteredStreak: 0,
          lastCheckedAt: now,
          expiresAt: expStr,
          cachedPkgName: freshLic.notes,
          licenseData: freshLic,
        };
        if (srv.token) {
          patch.signedToken = srv.token;
        }
        if (realKey) {
          patch.licenseKey = realKey;
        }

        const { nextSeq, updatedAt } = await commitLicenseState(patch);
        return {
          isValid: true,
          isActivated: true,
          state: LICENSE_STATES.ACTIVE,
          status: 'active',
          seq: nextSeq,
          updatedAt,
          deviceId: effectiveDeviceId,
          message: srv.message || `✓ Bản quyền VIP đang hoạt động (Còn ${daysLeft} ngày)`,
          license: freshLic,
        };
      }

      // 5B. TRẠNG THÁI XÁC ĐỊNH: REVOKED HOẶC SUSPENDED (Chỉ khi server có cờ rõ ràng)
      const isExplicitRevoked = Boolean(
        srv.status === 'revoked' || srv.isRevoked === true || srv.action === 'FORCE_REVOKE'
      );
      const isExplicitSuspended = Boolean(srv.status === 'suspended' || srv.isSuspended === true);

      if (isExplicitRevoked || isExplicitSuspended) {
        await enforceHardRevokeOrSuspend({
          isRevoked: isExplicitRevoked,
          isSuspended: isExplicitSuspended,
          message: srv.message,
        });
        const stAfter = await chrome.storage.local.get(['licenseSeq', 'licenseUpdatedAt']);
        return {
          isValid: false,
          isActivated: false,
          isRevoked: isExplicitRevoked,
          isSuspended: isExplicitSuspended,
          state: isExplicitRevoked ? LICENSE_STATES.REVOKED : LICENSE_STATES.SUSPENDED,
          status: isExplicitRevoked ? 'revoked' : 'suspended',
          seq: stAfter.licenseSeq || currentSeq + 1,
          updatedAt: stAfter.licenseUpdatedAt || now,
          deviceId: effectiveDeviceId,
          message: srv.message || '🚨 Bản quyền của thiết bị đã bị Quản trị viên thu hồi hoặc tạm khóa!',
          license: null,
        };
      }

      // 5C. TRẠNG THÁI XÁC ĐỊNH: EXPIRED
      if (srv.status === 'expired' || srv.isExpired === true) {
        const expStr = srv.expires_at || storedExpStr;
        const expiredLic = {
          ...(data.licenseData || {}),
          expiresAt: expStr,
          daysLeft: 0,
          isExpired: true,
          lastVerifiedAt: now,
        };
        const { nextSeq, updatedAt } = await commitLicenseState({
          licenseState: LICENSE_STATES.EXPIRED,
          licenseStatus: 'expired',
          isVip: false,
          isRevoked: false,
          isSuspended: false,
          unregisteredStreak: 0,
          lastCheckedAt: now,
          expiresAt: expStr,
          licenseData: expiredLic,
        });
        return {
          isValid: false,
          isActivated: true,
          isExpired: true,
          state: LICENSE_STATES.EXPIRED,
          status: 'expired',
          seq: nextSeq,
          updatedAt,
          deviceId: effectiveDeviceId,
          message: srv.message || 'Bản quyền của máy đã hết hạn sử dụng. Vui lòng gia hạn thêm!',
          license: expiredLic,
        };
      }

      // 5D. TRẠNG THÁI PENDING HOẶC UNREGISTERED (ÁP DỤNG CHỐNG FLAPPING CHO MÁY ĐANG ACTIVE)
      const nextStreak = (Number(data.unregisteredStreak) || 0) + 1;

      if (wasActiveLocally && nextStreak < UNREGISTERED_DOWNGRADE_STREAK_THRESHOLD) {
        console.warn(
          `[License Anti-Flapping] Máy đang ACTIVE nhận phản hồi '${srv.status}' lần ${nextStreak}/${UNREGISTERED_DOWNGRADE_STREAK_THRESHOLD} -> Giữ nguyên ACTIVE!`
        );
        const daysLeft = Math.max(1, Math.ceil((storedExpMs - now) / (24 * 60 * 60 * 1000)));
        const licObj = {
          ...(data.licenseData || {}),
          expiresAt: storedExpStr,
          daysLeft,
          isExpired: false,
        };
        await chrome.storage.local.set({
          unregisteredStreak: nextStreak,
          lastCheckedAt: now,
        });
        return {
          isValid: true,
          isActivated: true,
          state: LICENSE_STATES.ACTIVE,
          status: 'active',
          seq: currentSeq,
          updatedAt: currentUpdatedAt,
          deviceId: effectiveDeviceId,
          message: `✓ Bản quyền VIP đang hoạt động (Còn ${daysLeft} ngày)`,
          license: licObj,
        };
      }

      // Đã đủ N >= 3 lần liên tiếp unregistered (hoặc máy chưa từng kích hoạt)
      const finalStatus = srv.status === 'pending' ? 'pending' : 'unregistered';
      const { nextSeq, updatedAt } = await commitLicenseState({
        licenseState: LICENSE_STATES.UNREGISTERED,
        licenseStatus: finalStatus,
        isVip: false,
        isRevoked: false,
        isSuspended: false,
        unregisteredStreak: nextStreak,
        lastCheckedAt: now,
      });

      return {
        isValid: false,
        isActivated: false,
         isRevoked: false,
        isSuspended: false,
        state: LICENSE_STATES.UNREGISTERED,
        status: finalStatus,
         pkgName: srv.pkg_name || '',
        seq: nextSeq,
        updatedAt,
        deviceId: effectiveDeviceId,
        message:
          srv.message ||
          (finalStatus === 'pending'
            ? 'Đơn đăng ký đang chờ Quản trị viên phê duyệt.'
            : 'Thiết bị chưa kích hoạt bản quyền. Vui lòng chọn gói đặt mua hoặc nhập mã kích hoạt!'),
        license: null,
      };
    } catch (err) {
      return {
        isValid: false,
        state: LICENSE_STATES.UNKNOWN_OFFLINE,
        status: 'offline',
        message: err.message || 'Lỗi kiểm tra bản quyền',
        license: null,
      };
    } finally {
      inFlightLicenseCheckPromise = null;
    }
  })();

  return inFlightLicenseCheckPromise;
}

// Xử lý gửi đơn đặt mua gói bản quyền tự động lên Server (Chỉ gọi từ Background)
async function handleCreateOrder(payload = {}) {
  const canonicalDeviceId = await getOrCreateDeviceId(payload.deviceId || '');
  payload.deviceId = canonicalDeviceId;
  if (!payload.id) {
    payload.id = 'ord_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  }

  const primaryBase = await getApiBaseUrl();
  const candidates = await getAllServerCandidates(primaryBase);

  async function postOrderTo(url) {
    if (!url || !url.startsWith('http')) return null;
    const base = url.replace(/\/+$/, '');
    try {
      const resp = await fetch(`${base}/api/orders/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(7000),
      });
      if (resp.ok) {
        const text = await resp.text();
        if (text && (text.trim().startsWith('{') || text.trim().startsWith('['))) {
          const data = JSON.parse(text);
          if (data && data.success) {
            return { base, order: data.order, message: data.message };
          }
        }
      }
    } catch (_) {}
    return null;
  }

  const allUrls = [primaryBase, ...candidates].filter((u, i, arr) => u && arr.indexOf(u) === i);
  let orderResult = null;
  const results = await Promise.allSettled(allUrls.map((u) => postOrderTo(u)));
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      if (!orderResult) orderResult = r.value;
    }
  }

  // Đẩy đồng thời sang Webhook Google Drive / Google Sheet nếu có
  try {
    const st = await chrome.storage.local.get(['googleDriveSheetWebhookUrl']);
    let gdriveUrl = st.googleDriveSheetWebhookUrl;
    if (!gdriveUrl) {
      try {
        const sResp = await fetch(`${primaryBase}/api/settings`, { signal: AbortSignal.timeout(2500) });
        if (sResp.ok) {
          const sData = await sResp.json();
          if (sData?.settings?.googleDriveSheetWebhookUrl) {
            gdriveUrl = sData.settings.googleDriveSheetWebhookUrl;
            await chrome.storage.local.set({ googleDriveSheetWebhookUrl: gdriveUrl });
          }
        }
      } catch (_) {}
    }
    if (gdriveUrl && gdriveUrl.startsWith('http')) {
      fetch(gdriveUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'ORDER_UPDATE',
          id: payload.id,
          timestamp: new Date().toISOString(),
          timeFormatted: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
          clientName: payload.clientName || 'Khách Đặt Mua (Extension)',
          phone: payload.phone || '',
          pkgName: payload.pkgName || '',
          price: payload.price || '',
          deviceId: canonicalDeviceId,
          status: 'pending',
          note: payload.note || '',
          source: 'Gia Long FB Extension (Trực Tiếp Khách Hàng)',
        }),
      }).catch(() => {});
    }
  } catch (_) {}

  const createdOrder = orderResult?.order || {
    id: payload.id,
    pkgName: payload.pkgName || 'Gói Bản Quyền',
    price: payload.price || '1.000.000đ',
    clientName: payload.clientName || 'Khách Đặt Mua',
    phone: payload.phone || '',
    deviceId: canonicalDeviceId,
    createdAt: new Date().toISOString(),
    status: 'pending',
    note: payload.note || '',
  };

  // Lưu đơn vào myOrders trong chrome.storage.local để UI cập nhật ngay qua storage.onChanged
  try {
    const existingOrdersData = await chrome.storage.local.get(['myOrders']);
    const existingList = Array.isArray(existingOrdersData.myOrders) ? existingOrdersData.myOrders : [];
    const dedupedOrders = [createdOrder, ...existingList.filter((o) => o && o.id !== createdOrder.id)].slice(0, 50);
    await chrome.storage.local.set({
      myOrders: dedupedOrders,
      gialong_customer_phone: payload.phone || '',
      gialong_customer_name: payload.clientName || '',
      lastOrdersSync: Date.now(),
    });
  } catch (_) {}

  // Bắn tín hiệu đơn mới tới các Tab Web Quản Trị đang mở
  try {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({}).then((openTabs) => {
        for (const tab of openTabs) {
          if (tab.id && tab.url && tab.url.startsWith('http')) {
            chrome.tabs.sendMessage(tab.id, {
              action: 'DISPATCH_NEW_ORDER_TO_WEBAPP',
              order: createdOrder,
            }).catch(() => {});
          }
        }
      }).catch(() => {});
    }
  } catch (_) {}

  // Khởi động Fast Polling tại Service Worker (3s/lần trong tối đa 5 phút)
  startFastLicensePolling(canonicalDeviceId, 300);

  return {
    success: true,
    order: createdOrder,
    deviceId: canonicalDeviceId,
    message: '✓ Đã gửi yêu cầu đề xuất mua bản quyền tới Quản trị viên thành công!',
  };
}

async function activateLicenseKey(rawKey) {
  if (!rawKey) return { success: false, message: 'Vui lòng nhập mã bản quyền!' };
  const key = String(rawKey).trim().toUpperCase();
  if (!isRealHumanLicenseKey(key)) {
    return checkLicenseStatus(true, { reason: 'activate_non_human_key' });
  }

  const deviceId = await getOrCreateDeviceId();
  const primaryBase = await getApiBaseUrl();
  const serverCandidates = getCandidateServerUrls(primaryBase);

  let lastErr = null;
  for (const baseUrl of serverCandidates) {
    try {
      const resp = await fetch(`${baseUrl}/api/license/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({
          key,
          deviceId,
          deviceName: `Browser (${deviceId.slice(-4)})`,
        }),
        signal: AbortSignal.timeout(7000),
      });
      const text = await resp.text();
      if (!text || (!text.trim().startsWith('{') && !text.trim().startsWith('['))) continue;
      const result = JSON.parse(text);

      if (result.success && result.license) {
        const expMs = new Date(result.license.expiresAt).getTime();
        const daysLeft = !isNaN(expMs) && expMs > Date.now()
          ? Math.max(1, Math.ceil((expMs - Date.now()) / (24 * 60 * 60 * 1000)))
          : (result.license.daysLeft || 30);

        const lic = {
          ...result.license,
          key,
          daysLeft,
          isExpired: false,
          isRevoked: false,
          isSuspended: false,
          lastVerifiedAt: Date.now(),
        };

        const { nextSeq, updatedAt } = await commitLicenseState({
          licenseKey: key,
          licenseData: lic,
          customApiServerUrl: baseUrl,
          expiresAt: result.license.expiresAt,
          signedToken: result.token || result.license.signedToken || '',
          licenseState: LICENSE_STATES.ACTIVE,
          licenseStatus: 'active',
          isVip: true,
          isRevoked: false,
          isSuspended: false,
          unregisteredStreak: 0,
          lastCheckedAt: Date.now(),
          cachedPkgName:
            result.license.notes ||
            (result.license.planType === 'team'
              ? 'Gói Doanh Nghiệp'
              : result.license.planType === 'trial'
                ? 'Gói Dùng Thử 1N'
                : 'Gói VIP Cá Nhân'),
        });

        if (result.license.planType === 'trial') {
          await chrome.storage.local.set({ trialPostsCount: 0 });
        } else {
          await chrome.storage.local.remove(['trialPostsCount']);
        }

        return {
          success: true,
          isValid: true,
          state: LICENSE_STATES.ACTIVE,
          seq: nextSeq,
          updatedAt,
          message: result.message,
          license: lic,
        };
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
  await commitLicenseState({
    licenseState: LICENSE_STATES.UNREGISTERED,
    licenseStatus: 'unregistered',
    isVip: false,
    unregisteredStreak: 0,
  });
  await chrome.storage.local.remove(['licenseKey', 'licenseData', 'signedToken']);
  return { success: true, message: 'Đã hủy kích hoạt bản quyền trên máy này.' };
}

if (typeof self !== 'undefined') {
  self.LICENSE_STATES = LICENSE_STATES;
  self.getOrCreateDeviceId = getOrCreateDeviceId;
  self.checkLicenseStatus = checkLicenseStatus;
  self.activateLicenseKey = activateLicenseKey;
  self.handleCreateOrder = handleCreateOrder;
}

// ==========================================
// 1. CHẾ ĐỘ HẸN GIỜ ĐĂNG BÀI TỰ ĐỘNG THEO KHUNG GIỜ & TỰ CHUYỂN TÀI KHOẢN FACEBOOK
// ==========================================
async function handleSetSchedule(config = {}) {
  const licCheck = await checkLicenseStatus(false);
  if (!licCheck.isValid) {
    console.warn('[AutoRecruit Background] Không thể hẹn giờ: Chưa kích hoạt bản quyền VIP!');
    if (typeof AlarmsManager !== 'undefined') {
      await AlarmsManager.syncScheduleAlarms([], false);
    }
    await chrome.storage.local.set({ isScheduleActive: false });
    return {
      success: false,
      message: `Chưa kích hoạt bản quyền VIP hoặc đã hết hạn (${licCheck.message}). Không thể kích hoạt hẹn giờ tự động!`,
    };
  }

  const existing = await chrome.storage.local.get(['scheduleSlots', 'savedTimes', 'scheduledTimes']);
  const rawTimes = Array.isArray(config.times) && config.times.length > 0
    ? config.times
    : (existing.savedTimes || existing.scheduledTimes || ['08:30', '11:30', '17:30', '20:00']);
  const rawSlots = Array.isArray(config.slots) && config.slots.length > 0
    ? config.slots
    : existing.scheduleSlots;

  const normalizedSlots = (typeof SharedStorage !== 'undefined' && SharedStorage.normalizeScheduleSlots)
    ? SharedStorage.normalizeScheduleSlots(rawSlots, rawTimes)
    : rawTimes.map((t) => ({
        id: `slot_${String(t).replace(':', '_')}`,
        time: String(t),
        enabled: true,
        accountId: 'active',
        accountName: 'Tài khoản đang chọn',
        postId: 'selected',
        autoSwitchAccount: true,
        lastRunDate: null,
      }));

  const timesList = normalizedSlots.map((s) => s.time);

  if (typeof SharedStorage !== 'undefined' && SharedStorage.patch) {
    await SharedStorage.patch('scheduleSlots', () => normalizedSlots);
    await SharedStorage.patch('savedTimes', () => timesList);
  }

  await chrome.storage.local.set({
    isScheduleActive: true,
    scheduleSlots: normalizedSlots,
    savedTimes: timesList,
    scheduledTimes: timesList,
    scheduleConfigPayload: config,
  });

  if (typeof AlarmsManager !== 'undefined') {
    await AlarmsManager.initAlarms();
    await AlarmsManager.syncScheduleAlarms(normalizedSlots, true);
  }

  console.log('[AutoRecruit Background] ✓ Đã kích hoạt hẹn giờ theo khung giờ & tài khoản:', normalizedSlots);
  return {
    success: true,
    slots: normalizedSlots,
    times: timesList,
    message: 'Đã kích hoạt hẹn giờ tự động theo khung giờ thành công!',
  };
}

// BỘ LẮNG NGHE ALARMS: ĐIỀU PHỐI QUA ALARMS MANAGER & FAST ORDER POLL
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm || !alarm.name) return;
  if (alarm.name === 'glfb_fast_order_poll') {
    try {
      const st = await chrome.storage.local.get(['fastPollUntil']);
      if (st.fastPollUntil && Date.now() < st.fastPollUntil) {
        const res = await checkLicenseStatus(true, { reason: 'fast_poll_alarm' });
        if (res && res.isValid && res.state === LICENSE_STATES.ACTIVE) {
          await chrome.storage.local.remove(['fastPollUntil']);
          chrome.alarms.clear('glfb_fast_order_poll');
        }
      } else {
        await chrome.storage.local.remove(['fastPollUntil']);
        chrome.alarms.clear('glfb_fast_order_poll');
      }
    } catch (_) {}
    return;
  }
  if (typeof AlarmsManager !== 'undefined') {
    await AlarmsManager.handleAlarmTrigger(alarm);
  }
});

// TỰ ĐỘNG KHÔI PHỤC HẸN GIỜ KHI KHỞI ĐỘNG LẠI CHROME HOẶC MỞ MÁY TÍNH
async function restoreScheduleOnBoot() {
  try {
    const licCheck = await checkLicenseStatus(false);
    if (!licCheck.isValid) {
      if (typeof AlarmsManager !== 'undefined') {
        await AlarmsManager.syncScheduleAlarms([], false);
      }
      await chrome.storage.local.set({ isScheduleActive: false });
      return;
    }
    const data = await chrome.storage.local.get([
      'isScheduleActive',
      'scheduleSlots',
      'savedTimes',
      'scheduledTimes',
      'delaySec',
      'enableSpintax',
    ]);
    const times = data.savedTimes || data.scheduledTimes || [];
    const slots = data.scheduleSlots || [];
    if (data.isScheduleActive && (slots.length > 0 || times.length > 0)) {
      await handleSetSchedule({
        slots,
        times,
        delaySec: data.delaySec || 30,
        isSpintaxEnabled: data.enableSpintax !== false,
      });
    }
  } catch (err) {
    console.warn('[AutoRecruit Background] Lỗi khôi phục hẹn giờ:', err);
  }
}

chrome.runtime.onStartup.addListener(async () => {
  if (typeof SharedStorage !== 'undefined') await SharedStorage.runStorageMigrations();
  await getOrCreateDeviceId();
  if (typeof AlarmsManager !== 'undefined') await AlarmsManager.initAlarms();
  if (typeof FbRunner !== 'undefined') await FbRunner.checkAndRecoverRunState();
  restoreScheduleOnBoot();
});

chrome.runtime.onInstalled.addListener(async () => {
  if (typeof SharedStorage !== 'undefined') await SharedStorage.runStorageMigrations();
  await getOrCreateDeviceId();
  if (typeof AlarmsManager !== 'undefined') await AlarmsManager.initAlarms();
  if (typeof FbRunner !== 'undefined') await FbRunner.checkAndRecoverRunState();
  restoreScheduleOnBoot();
});

// ==========================================
// 2. LẮNG NGHE THÔNG ĐIỆP (MESSAGE ROUTER TRUNG TÂM)
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || typeof request !== 'object') return false;

  // 1. BẮT ĐẦU ĐĂNG BÀI BỀN VỮNG
  if (request.action === 'START_BATCH_POSTING') {
    const payload = request.payload || request;
    const groups = payload.groups || [];
    const content = payload.content || payload.postContent || '';
    const variants = payload.variants || [];
    const images = payload.images || [];
    const isSpintaxEnabled = payload.isSpintaxEnabled !== undefined ? payload.isSpintaxEnabled : true;
    const delaySec = parseInt(payload.delaySec, 10) || 30;
    const postTitle = payload.postTitle || 'Bài Tuyển Dụng';
    const accountId = payload.accountId || null;
    const accountName = payload.accountName || null;

    if (!groups.length) {
      sendResponse({ success: false, message: 'Danh sách nhóm trống!' });
      return true;
    }

    checkLicenseStatus(false).then(async (licCheck) => {
      if (!licCheck.isValid) {
        const errorText = `🚨 BẢN QUYỀN CHƯA KÍCH HOẠT HOẶC ĐÃ HẾT HẠN: ${licCheck.message}`;
        if (typeof FbRunner !== 'undefined') {
          await FbRunner.appendHistoryEntry({
            groupName: 'Hệ Thống Bản Quyền',
            groupLink: '',
            postTitle,
            status: 'failed',
            statusCode: 'LICENSE_INVALID',
            message: errorText,
          });
        }
        sendResponse({ success: false, message: errorText });
        return;
      }

      if (licCheck.license?.planType === 'trial') {
        const trialData = await chrome.storage.local.get(['trialPostsCount']);
        const trialPostsCount = trialData.trialPostsCount || 0;
        if (trialPostsCount >= 20) {
          const errorText = `🚨 ĐÃ HẾT HẠN MỨC DÙNG THỬ (20/20 BÀI ĐĂNG)!\n\nGói dùng thử 1 ngày đã hoàn thành tối đa 20 bài đăng. Vui lòng đặt mua Gói Bản Quyền Chính Thức để tiếp tục đăng không giới hạn!`;
          if (typeof FbRunner !== 'undefined') {
            await FbRunner.appendHistoryEntry({
              groupName: 'Gói Dùng Thử',
              groupLink: '',
              postTitle,
              status: 'failed',
              statusCode: 'TRIAL_LIMIT_REACHED',
              message: errorText,
            });
          }
          sendResponse({ success: false, message: errorText });
          return;
        }
      }

      try {
        if (typeof FbRunner !== 'undefined') {
          const startResult = await FbRunner.startBatchPosting({
            groups,
            content,
            variants,
            images,
            isSpintaxEnabled,
            delaySec,
            postTitle,
            accountId,
            accountName,
          });
          sendResponse({ success: true, message: 'Đã bắt đầu tiến trình đăng bài bền vững!', runId: startResult.runId });
        } else {
          sendResponse({ success: false, message: 'FbRunner chưa được nạp' });
        }
      } catch (err) {
        sendResponse({ success: false, message: err.message || 'Lỗi khởi chạy tiến trình' });
      }
    });

    return true;
  }

  // 2. DỪNG TIẾN TRÌNH LẬP TỨC
  if (request.action === 'STOP_BATCH_POSTING') {
    if (typeof FbRunner !== 'undefined') {
      FbRunner.stopBatchPosting()
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ success: false, message: err.message }));
    } else {
      sendResponse({ success: true, message: 'Đã dừng' });
    }
    return true;
  }

  // 2.1 TRUY VẤN TRẠNG THÁI RUN STATE
  if (request.action === 'GET_RUN_STATE') {
    if (typeof FbRunner !== 'undefined') {
      FbRunner.getRunState().then((state) => sendResponse({ success: true, state }));
    } else {
      sendResponse({ success: true, state: null });
    }
    return true;
  }

  // 2.2 QUẢN LÝ TÀI KHOẢN FACEBOOK (SINGLE WRITER TRONG SERVICE WORKER)
  if (request.action === 'GET_FB_ACCOUNTS') {
    if (typeof AccountsManager !== 'undefined') {
      Promise.all([
        AccountsManager.getAccounts(),
        AccountsManager.getAccountById(),
      ]).then(([accounts, active]) => {
        sendResponse({ success: true, accounts, activeAccount: active });
      }).catch((err) => sendResponse({ success: false, error: err.message }));
    } else {
      sendResponse({ success: false, error: 'AccountsManager chưa sẵn sàng' });
    }
    return true;
  }

  if (request.action === 'SET_ACTIVE_FB_ACCOUNT' || request.action === 'ACCOUNTS_SET_ACTIVE') {
    if (typeof AccountsManager !== 'undefined') {
      AccountsManager.setActiveAccount(request.accountId)
        .then((account) => sendResponse({ success: true, account }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    } else {
      sendResponse({ success: false, error: 'AccountsManager chưa sẵn sàng' });
    }
    return true;
  }

  if (request.action === 'ACCOUNTS_UPSERT') {
    if (typeof AccountsManager !== 'undefined') {
      AccountsManager.upsertAccount(request.accountInput, request.options || {})
        .then((account) => sendResponse({ success: true, account }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    } else {
      sendResponse({ success: false, error: 'AccountsManager chưa sẵn sàng' });
    }
    return true;
  }

  if (request.action === 'DETECT_CURRENT_FB_ACCOUNT_FROM_TAB') {
    if (typeof AccountsManager !== 'undefined') {
      AccountsManager.detectCurrentAccountFromTab()
        .then((res) => sendResponse(res))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    } else {
      sendResponse({ success: false, error: 'AccountsManager chưa sẵn sàng' });
    }
    return true;
  }

  if (request.action === 'REMOVE_FB_ACCOUNT' || request.action === 'ACCOUNTS_REMOVE') {
    if (typeof AccountsManager !== 'undefined') {
      AccountsManager.removeAccount(request.accountId)
        .then((accounts) => sendResponse({ success: true, accounts }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
    } else {
      sendResponse({ success: false, error: 'AccountsManager chưa sẵn sàng' });
    }
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
    const clearPromise = (typeof AlarmsManager !== 'undefined' && AlarmsManager.syncScheduleAlarms)
      ? AlarmsManager.syncScheduleAlarms([], false)
      : Promise.resolve();
    clearPromise.then(() => {
      chrome.storage.local.set({ isScheduleActive: false });
      sendResponse({ success: true });
    });
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
    const cleanUrl = String(request.url).trim().replace(/\/+$/, '');
    chrome.storage.local.get(['known_server_urls'], (res) => {
      const list = Array.isArray(res.known_server_urls) ? res.known_server_urls : [];
      if (!list.includes(cleanUrl)) list.push(cleanUrl);
      chrome.storage.local.set({
        customApiServerUrl: cleanUrl,
        webapp_last_url: cleanUrl,
        lastSyncedFromUrl: cleanUrl,
        known_server_urls: list,
      });
    });
    sendResponse({ success: true, url: cleanUrl });
    return true;
  }

  // 5. Đồng bộ thời gian thực từ Web App (pages.dev)
  if (request.action === 'REALTIME_WEBAPP_SYNC' || request.action === 'SYNC_FROM_WEBAPP_PAGE') {
    const senderUrl = sender?.url || '';
    const isAllowedSender = (!sender?.id || sender.id === chrome.runtime.id) &&
      (!senderUrl || senderUrl.startsWith('https://gia-long---tuy-n-d-ng.pages.dev'));
    if (!isAllowedSender) {
      sendResponse({ success: false, error: 'Nguồn gửi không được phép!' });
      return true;
    }

    if (activeTabId !== null || isRunning) {
      sendResponse({ success: false, message: 'Đang chạy đăng bài, tạm thời không ghi đè!' });
      return true;
    }

    const { posts, groups, settings, activePost, url, googleDriveWebhookUrl } = request.payload || {};
    if (posts && posts.length) {
      const targetPost = activePost || posts.find((p) => p.status === 'active') || posts[0];
      const hasImage = !!(targetPost?.images && targetPost.images.length > 0 && targetPost.images[0]);
      const gdriveUrl = googleDriveWebhookUrl || settings?.googleDriveSheetWebhookUrl;
      const toSet = {
        isInitialized: true,
        savedPosts: posts || [],
        savedGroups: (groups && groups.length > 0) ? groups : [],
        savedTimes: (settings && settings.postTimes) ? settings.postTimes : ['08:30', '11:30', '17:30', '20:00'],
        attachedImageUrl: targetPost?.images?.[0] || '',
        attachedImages: (targetPost?.images || []).slice(0, 3),
        customPostText: targetPost?.content || '',
        isAttachImageEnabled: hasImage,
        lastSyncedFromUrl: url || 'https://gia-long---tuy-n-d-ng.pages.dev',
        lastSyncTimestamp: Date.now(),
      };
      if (gdriveUrl && typeof gdriveUrl === 'string' && gdriveUrl.startsWith('http')) {
        toSet.googleDriveSheetWebhookUrl = gdriveUrl.trim();
      }
      chrome.storage.local.set(toSet);
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

  // 8. KIỂM TRA BẢN QUYỀN (LICENSE VERIFY - SINGLE SOURCE OF TRUTH)
  if (request.action === 'CHECK_LICENSE') {
    checkLicenseStatus(Boolean(request.forceRemote), {
      legacyHintId: request.legacyHintId || '',
      reason: request.reason || 'ui_check',
    })
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ isValid: false, state: LICENSE_STATES.UNKNOWN_OFFLINE, message: err.message }));
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

  // 11. LẤY MÃ ĐỊNH DANH THIẾT BỊ DUY NHẤT (CANONICAL DEVICE ID)
  if (request.action === 'GET_DEVICE_ID') {
    getOrCreateDeviceId(request.legacyHintId || '')
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

  // 13. NGẮT MÁY KHẨN CẤP TỪ WEB APP / ADMIN (FORCE REVOKE)
  if (request.action === 'FORCE_REVOKE_DEVICE') {
    enforceHardRevokeOrSuspend({
      isRevoked: true,
      isSuspended: false,
      message: '🚨 Quản trị viên đã thu hồi bản quyền và ngắt kết nối thiết bị này!',
    }).then(() => {
      sendResponse({ success: true, message: 'Đã ngắt máy lập tức!' });
    });
    return true;
  }
});

// Tra cứu danh sách đơn hàng của máy khách và tự động đồng bộ trạng thái bản quyền
async function fetchMyOrdersAndSync() {
  const deviceId = await getOrCreateDeviceId();
  const primaryBase = await getApiBaseUrl();
  const serverCandidates = getCandidateServerUrls(primaryBase);

  for (const baseUrl of serverCandidates) {
    try {
      const resp = await fetch(`${baseUrl}/api/orders/my-orders?deviceId=${encodeURIComponent(deviceId)}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(7000),
      });
      if (!resp.ok) continue;
      const text = await resp.text();
      if (!text || (!text.trim().startsWith('{') && !text.trim().startsWith('['))) continue;
      const data = JSON.parse(text);
      if (data && data.success && Array.isArray(data.orders)) {
        await chrome.storage.local.set({ myOrders: data.orders, lastOrdersSync: Date.now() });

        const hasActiveOrderOrLicense = Boolean(
          data.activeLicense ||
          data.orders.some((o) => o.status === 'approved' && o.generatedKey)
        );
        if (data.isRevoked && !hasActiveOrderOrLicense) {
          await enforceHardRevokeOrSuspend({
            isRevoked: true,
            isSuspended: false,
            message: data.message || '🚨 Bản quyền của máy này đã bị thu hồi!',
          });
          return { success: false, isRevoked: true, message: 'Bản quyền đã bị thu hồi' };
        }

        // Tự động nạp mã thật nếu có đơn được phê duyệt kèm mã GLFB-...
        const approvedOrder = data.orders.find((o) => o.status === 'approved' && isRealHumanLicenseKey(o.generatedKey));
        if (approvedOrder && approvedOrder.generatedKey) {
          const currentData = await chrome.storage.local.get(['licenseKey', 'isRevoked']);
          if (!currentData.isRevoked && currentData.licenseKey !== approvedOrder.generatedKey) {
            await activateLicenseKey(approvedOrder.generatedKey);
          }
        }

        const licRes = await checkLicenseStatus(true, { reason: 'orders_sync' });
        return {
          success: true,
          orders: data.orders,
          totalPending: data.totalPending || 0,
          license: licRes.license,
          isValid: licRes.isValid,
          state: licRes.state,
          seq: licRes.seq,
          message: '✓ Đã đồng bộ trạng thái đơn hàng & bản quyền từ máy chủ Quản trị thành công!',
        };
      }
    } catch (_) {}
  }

  // Khi lỗi mạng, trả lại dữ liệu myOrders đã lưu trong máy mà không hạ cấp bản quyền
  const fallback = await chrome.storage.local.get(['myOrders']);
  const licRes = await checkLicenseStatus(false, { reason: 'orders_sync_offline' });
  return {
    success: Array.isArray(fallback.myOrders),
    orders: fallback.myOrders || [],
    license: licRes.license,
    isValid: licRes.isValid,
    state: licRes.state,
    seq: licRes.seq,
    message: 'Đang dùng dữ liệu bộ nhớ đệm (Mạng chập chờn).',
  };
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

    // Kiểm tra bản quyền nghiêm ngặt trước mỗi nhóm đăng
    const runtimeLicCheck = await checkLicenseStatus(true);
    if (!runtimeLicCheck.isValid || runtimeLicCheck.isRevoked) {
      console.warn('[AutoRecruit Background] 🚨 Bản quyền bị thu hồi hoặc ngắt máy trong lúc đăng bài:', runtimeLicCheck.message);
      shouldStop = true;
      isRunning = false;
      stopKeepAlive();
      if (activeTabId) {
        chrome.tabs.remove(activeTabId).catch(() => {});
        activeTabId = null;
      }
      chrome.alarms.clearAll(() => {});
      await updateStatus({
        isRunning: false,
        currentIndex: i,
        totalGroups: groupsToRun.length,
        statusText: `🚨 TIẾN TRÌNH ĐÃ BỊ DỪNG: ${runtimeLicCheck.message || 'Bản quyền bị thu hồi'}`,
      });
      await addHistoryEntry({
        groupName: 'Hệ Thống Bản Quyền',
        groupLink: '',
        postTitle: postTitle || 'Bản Quyền',
        status: 'failed',
        type: runType,
        message: `🚨 Ngắt máy ngay lập tức: ${runtimeLicCheck.message || 'Bản quyền bị thu hồi'}`,
      });
      break;
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

// DÒ TÌM NHÓM FACEBOOK THEO TỪ KHÓA (Không bấm Tham gia hàng loạt trên trang tìm kiếm, đóng tab an toàn bằng await)
async function handleSearchGroups({ keyword, minMembers = 0 }) {
  if (!keyword) throw new Error('Vui lòng nhập từ khóa tìm kiếm nhóm!');

  // Sử dụng đường dẫn tìm kiếm chuẩn của Facebook: https://www.facebook.com/search/groups/?q=...
  const searchUrl = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(keyword)}`;
  const tab = await chrome.tabs.create({ url: searchUrl, active: true });

  try {
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

    await sleep(1000);
    return response || { success: true, groups: [] };
  } finally {
    if (tab?.id) {
      await chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
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
