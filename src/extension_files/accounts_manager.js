// accounts_manager.js - QUẢN LÝ ĐA TÀI KHOẢN FACEBOOK, KHÓA MUTEX & CHỐNG TRÙNG LẶP TUYỆT ĐỐI (v1.0.5)
// Đảm bảo:
//  1. Mọi thao tác ghi fbAccounts + activeAccountId đi qua 1 hàng đợi tuần tự (Single Mutex Queue) và ghi nguyên tử 1 lần.
//  2. Khi gọi từ Popup/Dashboard (Window context), tự động ủy quyền (delegate) sang Service Worker (background.js) làm Single Writer.
//  3. Ưu tiên đọc numeric UID chuẩn từ cookie c_user (chrome.cookies API), tuyệt đối không tạo bản ghi trùng từ vanity URL.

const AccountsManager = (() => {
  const RATE_LIMIT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // Nghỉ an toàn 6 tiếng khi bị chặn tương tác
  let inFlightScanPromise = null;

  function isWindowClientContext() {
    return (
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === 'function' &&
      !self.__GLFB_IS_BACKGROUND_WORKER__
    );
  }

  function sendBackgroundCommand(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (res) => {
          if (chrome.runtime.lastError || !res) {
            resolve(null);
            return;
          }
          resolve(res);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  function normalizeNumericUid(rawUid) {
    if (typeof SharedStorage !== 'undefined' && SharedStorage.normalizeNumericUid) {
      return SharedStorage.normalizeNumericUid(rawUid);
    }
    if (rawUid === null || rawUid === undefined) return '';
    const str = String(rawUid).trim();
    if (/^\d{4,25}$/.test(str)) return str;
    const m = str.match(/id=(\d{4,25})/) || str.match(/(?:^|\D)(\d{6,25})(?:\D|$)/);
    return m ? m[1] : '';
  }

  /**
   * Đọc cookie c_user trực tiếp từ trình duyệt qua chrome.cookies API
   * @returns {Promise<string>} Numeric UID hoặc chuỗi rỗng
   */
  async function readFacebookCUserCookie() {
    try {
      if (typeof chrome === 'undefined' || !chrome.cookies || typeof chrome.cookies.get !== 'function') {
        return '';
      }
      const urls = ['https://www.facebook.com', 'https://m.facebook.com', 'https://web.facebook.com'];
      for (const url of urls) {
        const cookie = await chrome.cookies.get({ url, name: 'c_user' }).catch(() => null);
        if (cookie && cookie.value) {
          const clean = normalizeNumericUid(cookie.value);
          if (clean) return clean;
        }
      }
    } catch (_) {}
    return '';
  }

  /**
   * Lấy danh sách tất cả các tài khoản Facebook đã lưu (đã tự động khử trùng lặp)
   */
  async function getAccounts() {
    if (typeof SharedStorage !== 'undefined') {
      const raw = await SharedStorage.get(['fbAccounts', 'activeAccountId', 'scheduleSlots']);
      const list = Array.isArray(raw.fbAccounts) ? raw.fbAccounts : [];
      if (SharedStorage.dedupeAccounts && list.length > 1) {
        const deduped = SharedStorage.dedupeAccounts(list, raw.activeAccountId, raw.scheduleSlots);
        if (deduped.changed) {
          await SharedStorage.set({
            fbAccounts: deduped.accounts,
            activeAccountId: deduped.activeAccountId,
            scheduleSlots: deduped.scheduleSlots,
          });
          return deduped.accounts;
        }
      }
      return list;
    }
    const res = await chrome.storage.local.get(['fbAccounts']);
    return Array.isArray(res.fbAccounts) ? res.fbAccounts : [];
  }

  /**
   * Lấy ID tài khoản đang được chọn làm mặc định
   */
  async function getActiveAccountId() {
    if (typeof SharedStorage !== 'undefined') {
      return await SharedStorage.get('activeAccountId');
    }
    const res = await chrome.storage.local.get(['activeAccountId']);
    return res.activeAccountId || null;
  }

  /**
   * Đặt tài khoản đang hoạt động mặc định (ghi nguyên tử qua hàng đợi fbAccounts)
   */
  async function setActiveAccount(accountId) {
    if (isWindowClientContext()) {
      const delegated = await sendBackgroundCommand({
        action: 'ACCOUNTS_SET_ACTIVE',
        accountId,
      });
      if (delegated && delegated.success) {
        return delegated.account || null;
      }
    }

    const runTask = async () => {
      const raw = typeof SharedStorage !== 'undefined'
        ? await SharedStorage.get(['fbAccounts', 'activeAccountId', 'scheduleSlots'])
        : await chrome.storage.local.get(['fbAccounts', 'activeAccountId', 'scheduleSlots']);
      const accounts = Array.isArray(raw.fbAccounts) ? raw.fbAccounts : [];
      const found = accounts.find((a) => a.id === accountId || a.uid === accountId);
      const nextActiveId = found ? found.id : (accounts[0]?.id || null);
      if (raw.activeAccountId !== nextActiveId) {
        if (typeof SharedStorage !== 'undefined') {
          await SharedStorage.set({ activeAccountId: nextActiveId });
        } else {
          await chrome.storage.local.set({ activeAccountId: nextActiveId });
        }
      }
      return found || accounts[0] || null;
    };

    if (typeof SharedStorage !== 'undefined' && SharedStorage.enqueueKeyTask) {
      return SharedStorage.enqueueKeyTask('fbAccounts', runTask);
    }
    return runTask();
  }

  /**
   * Lấy thông tin chi tiết của tài khoản theo ID (hoặc lấy tài khoản active nếu không truyền ID)
   */
  async function getAccountById(accountId = null) {
    const accounts = await getAccounts();
    if (!accounts.length) return null;

    const targetId = accountId || (await getActiveAccountId());
    if (targetId) {
      const matched = accounts.find((a) => a.id === targetId || a.uid === targetId);
      if (matched) return matched;
    }
    return accounts[0];
  }

  /**
   * Thêm mới hoặc cập nhật thông tin tài khoản Facebook (Atomic + Deduplicated)
   * @param {Object} accountInput - { uid, name, avatar, cookieHint, status, note }
   * @param {Object} options - { setAsActive: boolean }
   */
  async function upsertAccount(accountInput, options = {}) {
    if (!accountInput || (!accountInput.uid && !accountInput.name)) {
      throw new Error('Thiếu thông tin định danh tài khoản Facebook!');
    }

    if (isWindowClientContext()) {
      const delegated = await sendBackgroundCommand({
        action: 'ACCOUNTS_UPSERT',
        accountInput,
        options,
      });
      if (delegated && delegated.success && delegated.account) {
        return delegated.account;
      }
    }

    const runUpsert = async () => {
      const raw = typeof SharedStorage !== 'undefined'
        ? await SharedStorage.get(['fbAccounts', 'activeAccountId', 'scheduleSlots'])
        : await chrome.storage.local.get(['fbAccounts', 'activeAccountId', 'scheduleSlots']);

      const currentAccounts = Array.isArray(raw.fbAccounts) ? raw.fbAccounts : [];
      const currentSlots = Array.isArray(raw.scheduleSlots) ? raw.scheduleSlots : [];
      let currentActiveId = raw.activeAccountId || null;

      let cleanUid = normalizeNumericUid(accountInput.uid);
      if (!cleanUid) {
        const cookieUid = await readFacebookCUserCookie();
        if (cookieUid) cleanUid = cookieUid;
      }

      // Nếu đầu vào vẫn chưa phải numeric UID, kiểm tra xem có khớp tên với tài khoản đã có numeric UID không
      const inputName = String(accountInput.name || '').trim();
      if (!cleanUid && inputName) {
        const normName = inputName.toLowerCase().replace(/\s+/g, ' ');
        const matchedByName = currentAccounts.find(
          (a) => String(a.name || '').trim().toLowerCase().replace(/\s+/g, ' ') === normName
        );
        if (matchedByName) {
          cleanUid = normalizeNumericUid(matchedByName.uid) || String(matchedByName.uid || '').trim();
        }
      }

      if (!cleanUid) {
        cleanUid = String(accountInput.uid || '').trim();
      }
      if (!cleanUid) {
        throw new Error('Không xác định được UID hợp lệ cho tài khoản Facebook!');
      }

      const nowIso = new Date().toISOString();
      const canonicalId = `acc_${cleanUid}`;
      const existingIdx = currentAccounts.findIndex(
        (a) => a.uid === cleanUid || a.id === canonicalId || a.id === accountInput.id
      );
      const prevRecord = existingIdx >= 0 ? currentAccounts[existingIdx] : null;

      const candidateRecord = {
        id: canonicalId,
        uid: cleanUid,
        name: inputName || prevRecord?.name || `FB User ${cleanUid}`,
        avatar: accountInput.avatar || prevRecord?.avatar || '',
        cookieHint: accountInput.cookieHint || prevRecord?.cookieHint || `c_user=${cleanUid}`,
        status: accountInput.status || prevRecord?.status || 'valid',
        lastCheckAt: nowIso,
        note: accountInput.note !== undefined ? accountInput.note : (prevRecord?.note || ''),
        rateLimitUntil:
          accountInput.rateLimitUntil !== undefined ? accountInput.rateLimitUntil : (prevRecord?.rateLimitUntil || null),
        createdAt: prevRecord?.createdAt || nowIso,
      };

      const combinedList = existingIdx >= 0
        ? currentAccounts.map((item, idx) => (idx === existingIdx ? candidateRecord : item))
        : [candidateRecord, ...currentAccounts];

      const desiredActiveId =
        options.setAsActive || !currentActiveId || combinedList.length === 1
          ? canonicalId
          : currentActiveId;

      let finalAccounts = combinedList;
      let finalActiveId = desiredActiveId;
      let finalSlots = currentSlots;

      if (typeof SharedStorage !== 'undefined' && SharedStorage.dedupeAccounts) {
        const deduped = SharedStorage.dedupeAccounts(combinedList, desiredActiveId, currentSlots);
        finalAccounts = deduped.accounts;
        finalActiveId = deduped.activeAccountId;
        finalSlots = deduped.scheduleSlots;
      }

      const toSave = {
        fbAccounts: finalAccounts,
        activeAccountId: finalActiveId,
      };
      if (finalSlots !== currentSlots) {
        toSave.scheduleSlots = finalSlots;
      }

      if (typeof SharedStorage !== 'undefined') {
        await SharedStorage.set(toSave);
      } else {
        await chrome.storage.local.set(toSave);
      }

      return finalAccounts.find((a) => a.uid === cleanUid || a.id === canonicalId) || finalAccounts[0] || candidateRecord;
    };

    if (typeof SharedStorage !== 'undefined' && SharedStorage.enqueueKeyTask) {
      return SharedStorage.enqueueKeyTask('fbAccounts', runUpsert);
    }
    return runUpsert();
  }

  /**
   * Xóa tài khoản khỏi danh sách (ghi nguyên tử 1 lần cả fbAccounts + activeAccountId + scheduleSlots)
   */
  async function removeAccount(accountId) {
    if (isWindowClientContext()) {
      const delegated = await sendBackgroundCommand({
        action: 'ACCOUNTS_REMOVE',
        accountId,
      });
      if (delegated && delegated.success) {
        return Array.isArray(delegated.accounts) ? delegated.accounts : [];
      }
    }

    const runRemove = async () => {
      const raw = typeof SharedStorage !== 'undefined'
        ? await SharedStorage.get(['fbAccounts', 'activeAccountId', 'scheduleSlots'])
        : await chrome.storage.local.get(['fbAccounts', 'activeAccountId', 'scheduleSlots']);

      const list = Array.isArray(raw.fbAccounts) ? raw.fbAccounts : [];
      const next = list.filter((a) => a.id !== accountId && a.uid !== accountId);
      const nextActiveId =
        raw.activeAccountId === accountId || !next.some((a) => a.id === raw.activeAccountId)
          ? (next[0]?.id || null)
          : raw.activeAccountId;

      const slots = Array.isArray(raw.scheduleSlots) ? raw.scheduleSlots : [];
      const nextSlots = slots.map((s) =>
        s && s.accountId === accountId ? { ...s, accountId: nextActiveId } : s
      );

      const payload = {
        fbAccounts: next,
        activeAccountId: nextActiveId,
        scheduleSlots: nextSlots,
      };

      if (typeof SharedStorage !== 'undefined') {
        await SharedStorage.set(payload);
      } else {
        await chrome.storage.local.set(payload);
      }
      return next;
    };

    if (typeof SharedStorage !== 'undefined' && SharedStorage.enqueueKeyTask) {
      return SharedStorage.enqueueKeyTask('fbAccounts', runRemove);
    }
    return runRemove();
  }

  /**
   * Cập nhật trạng thái sức khỏe của tài khoản ('valid' | 'expired' | 'checkpoint' | 'rate_limited')
   */
  async function markAccountStatus(accountId, status, extra = {}) {
    if (!accountId) return null;

    const runMark = async () => {
      const raw = typeof SharedStorage !== 'undefined'
        ? await SharedStorage.get(['fbAccounts'])
        : await chrome.storage.local.get(['fbAccounts']);
      const list = Array.isArray(raw.fbAccounts) ? raw.fbAccounts : [];
      const idx = list.findIndex((a) => a.id === accountId || a.uid === accountId);
      if (idx === -1) return null;

      const now = Date.now();
      const updated = {
        ...list[idx],
        status,
        lastCheckAt: new Date(now).toISOString(),
        ...extra,
      };

      if (status === 'rate_limited' && !extra.rateLimitUntil) {
        updated.rateLimitUntil = now + RATE_LIMIT_COOLDOWN_MS;
      } else if (status === 'valid') {
        updated.rateLimitUntil = null;
      }

      const nextList = [...list];
      nextList[idx] = updated;

      if (typeof SharedStorage !== 'undefined') {
        await SharedStorage.set({ fbAccounts: nextList });
      } else {
        await chrome.storage.local.set({ fbAccounts: nextList });
      }
      return updated;
    };

    if (typeof SharedStorage !== 'undefined' && SharedStorage.enqueueKeyTask) {
      return SharedStorage.enqueueKeyTask('fbAccounts', runMark);
    }
    return runMark();
  }

  /**
   * Kiểm tra xem tài khoản có đủ điều kiện an toàn để chạy đăng bài hay không
   */
  async function canAccountPost(accountId = null) {
    const acc = await getAccountById(accountId);
    if (!acc) {
      return { canPost: true, account: null, reason: 'Sử dụng phiên trình duyệt Facebook hiện tại' };
    }

    const now = Date.now();
    if (acc.status === 'checkpoint') {
      return {
        canPost: false,
        account: acc,
        reason: `Tài khoản "${acc.name}" đang bị cảnh báo Checkpoint. Vui lòng kiểm tra trên trình duyệt trước khi đăng!`,
      };
    }

    if (acc.status === 'expired') {
      return {
        canPost: false,
        account: acc,
        reason: `Phiên đăng nhập của tài khoản "${acc.name}" đã hết hạn. Vui lòng đăng nhập lại Facebook!`,
      };
    }

    if (acc.status === 'rate_limited' && acc.rateLimitUntil && acc.rateLimitUntil > now) {
      const remainMin = Math.ceil((acc.rateLimitUntil - now) / 60000);
      return {
        canPost: false,
        account: acc,
        reason: `Tài khoản "${acc.name}" đang trong thời gian nghỉ an toàn chống chặn tương tác (còn ${remainMin} phút).`,
      };
    }

    if (acc.status === 'rate_limited' && (!acc.rateLimitUntil || acc.rateLimitUntil <= now)) {
      await markAccountStatus(acc.id, 'valid');
    }

    return { canPost: true, account: acc, reason: 'Tài khoản hợp lệ' };
  }

  /**
   * Nhận diện tài khoản Facebook đang đăng nhập trên tab Facebook hiện tại.
   * Có khóa inFlightScanPromise chống bấm đúp từ Popup/Dashboard và ưu tiên đọc numeric UID từ cookie c_user.
   */
  async function detectCurrentAccountFromTab() {
    // Nếu đang ở Popup/Dashboard, ủy quyền toàn bộ sang Background Service Worker để dùng chung 1 mutex duy nhất
    if (isWindowClientContext()) {
      const delegated = await sendBackgroundCommand({
        action: 'DETECT_CURRENT_FB_ACCOUNT_FROM_TAB',
      });
      if (delegated) return delegated;
    }

    if (inFlightScanPromise) {
      return inFlightScanPromise;
    }

    inFlightScanPromise = (async () => {
      try {
        if (typeof chrome === 'undefined' || !chrome.tabs) {
          return { success: false, error: 'API chrome.tabs không khả dụng' };
        }

        // Bước 1: Đọc numeric UID chuẩn trực tiếp từ cookie c_user của trình duyệt
        const cookieUid = await readFacebookCUserCookie();

        // Bước 2: Tìm tab Facebook đang mở để lấy thêm tên hiển thị (name) và ảnh đại diện (avatar)
        const fbTabs = await chrome.tabs.query({ url: ['*://*.facebook.com/*'] });
        let targetTab = fbTabs.find((t) => t.active) || fbTabs[0] || null;
        let domAccount = null;

        if (targetTab && targetTab.id) {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const response = await chrome.tabs.sendMessage(targetTab.id, {
                action: 'DETECT_CURRENT_FB_ACCOUNT',
                cookieUid,
              });
              if (response && response.success && response.account) {
                domAccount = response.account;
                break;
              }
            } catch (_) {
              if (attempt === 0 && chrome.scripting) {
                try {
                  await chrome.scripting.executeScript({
                    target: { tabId: targetTab.id },
                    files: ['content.js'],
                  });
                } catch (_) {}
              }
            }
          }
        }

        const finalNumericUid = cookieUid || normalizeNumericUid(domAccount?.uid);
        if (!finalNumericUid) {
          if (!targetTab) {
            return {
              success: false,
              error: 'Chưa phát hiện phiên đăng nhập Facebook (cookie c_user trống). Vui lòng mở facebook.com và đăng nhập trước!',
            };
          }
          return {
            success: false,
            error: 'Không lấy được UID số của tài khoản Facebook. Vui lòng tải lại tab Facebook đã đăng nhập rồi thử lại!',
          };
        }

        const saved = await upsertAccount(
          {
            uid: finalNumericUid,
            name: domAccount?.name || `FB User ${finalNumericUid}`,
            avatar: domAccount?.avatar || '',
            status: 'valid',
          },
          { setAsActive: true }
        );

        return { success: true, account: saved };
      } catch (err) {
        return {
          success: false,
          error: err.message || 'Không thể nhận diện tài khoản trên tab Facebook',
        };
      } finally {
        inFlightScanPromise = null;
      }
    })();

    return inFlightScanPromise;
  }

  /**
   * Kiểm tra hoặc tự động chuyển sang tài khoản Facebook được gán cho chiến dịch/khung giờ
   * trên tab chỉ định trước khi bắt đầu đăng bài
   * @param {number} tabId
   * @param {string|null} targetAccountId
   */
  async function ensureAccountOnTab(tabId, targetAccountId = null) {
    try {
      if (!tabId || typeof chrome === 'undefined' || !chrome.tabs) {
        return { success: true, switched: false, statusCode: 'SKIPPED_NO_TAB' };
      }

      const targetAcc = await getAccountById(targetAccountId);
      if (!targetAcc) {
        return {
          success: true,
          switched: false,
          statusCode: 'NO_SAVED_ACCOUNT',
          message: 'Chưa cấu hình danh sách tài khoản, giữ nguyên phiên trình duyệt hiện tại.',
        };
      }

      for (let retry = 0; retry < 3; retry++) {
        try {
          const res = await chrome.tabs.sendMessage(tabId, {
            action: 'SWITCH_OR_VERIFY_FB_ACCOUNT',
            targetAccount: {
              id: targetAcc.id,
              uid: targetAcc.uid,
              name: targetAcc.name,
            },
          });

          if (res) {
            if (res.success && res.account) {
              const numericUid = normalizeNumericUid(res.account.uid) || targetAcc.uid;
              await upsertAccount({
                uid: numericUid,
                name: res.account.name || targetAcc.name,
                avatar: res.account.avatar || targetAcc.avatar,
                status: 'valid',
              });
            }
            return res;
          }
        } catch (_) {
          if (retry === 1 && chrome.scripting) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content.js'],
              });
            } catch (_) {}
          }
          await new Promise((r) => setTimeout(r, 1200));
        }
      }

      return {
        success: false,
        switched: false,
        statusCode: 'CONTENT_SCRIPT_UNREACHABLE',
        message: 'Không thể giao tiếp với trang Facebook để kiểm tra tài khoản.',
      };
    } catch (err) {
      return {
        success: false,
        switched: false,
        statusCode: 'ENSURE_ACCOUNT_ERROR',
        message: err.message || 'Lỗi khi xác minh tài khoản trên tab Facebook',
      };
    }
  }

  function isAccountCoolingDown(acc) {
    if (!acc || typeof acc !== 'object') {
      return { isCoolingDown: false, remainingMinutes: 0, untilFormatted: '' };
    }
    const untilMs = Number(acc.rateLimitUntil || acc.cooldownUntil) || 0;
    const now = Date.now();
    if (untilMs > now) {
      const remainingMinutes = Math.max(1, Math.ceil((untilMs - now) / 60000));
      const untilFormatted = new Date(untilMs).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      });
      return { isCoolingDown: true, remainingMinutes, untilFormatted };
    }
    return { isCoolingDown: false, remainingMinutes: 0, untilFormatted: '' };
  }

  async function getActiveAccount() {
    return getAccountById(null);
  }

  return {
    RATE_LIMIT_COOLDOWN_MS,
    normalizeNumericUid,
    readFacebookCUserCookie,
    getAccounts,
    getActiveAccountId,
    getActiveAccount,
    setActiveAccount,
    getAccountById,
    upsertAccount,
    removeAccount,
    markAccountStatus,
    isAccountCoolingDown,
    canAccountPost,
    detectCurrentAccountFromTab,
    ensureAccountOnTab,
  };
})();

if (typeof self !== 'undefined') {
  self.AccountsManager = AccountsManager;
}
if (typeof window !== 'undefined') {
  window.AccountsManager = AccountsManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AccountsManager };
}
