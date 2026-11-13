// storage.js - LỚP LƯU TRỮ TUẦN TỰ DÙNG CHUNG (STORAGE LAYER WITH QUEUE & REVISION)
// Đồng bộ giữa Background, Dashboard và Popup mà không làm ghi đè mất mát dữ liệu cũ.

(function (root) {
  // Hàng đợi tuần tự theo từng khóa lưu trữ để loại trừ race condition
  const keyQueues = new Map();

  /**
   * Chuẩn hóa URL nhóm Facebook về dạng chuẩn https://www.facebook.com/groups/<id_hoặc_alias>/
   * @param {string} rawUrl
   * @returns {string}
   */
  function normalizeGroupUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    let clean = rawUrl.trim();

    // Bỏ tiền tố không cần thiết
    clean = clean.replace(/^(https?:\/\/)?(m\.|mbasic\.|touch\.|www\.)?facebook\.com\/?/i, '');
    clean = clean.replace(/^groups\//i, '');

    // Bỏ query parameters (?...) và hash (#...)
    clean = clean.split('?')[0].split('#')[0];

    // Bỏ các đuôi con như /permalink/..., /posts/..., /about, /members...
    clean = clean.replace(/\/(permalink|posts|about|members|media|files|events|photos|announcements).*$/i, '');
    clean = clean.replace(/\/+$/, '');

    const idOrAlias = clean.split('/')[0].trim();
    if (!idOrAlias) return '';

    return `https://www.facebook.com/groups/${idOrAlias}/`;
  }

  /**
   * Đọc trạng thái từ chrome.storage.local
   * @param {string|string[]|null} keys
   * @returns {Promise<object>}
   */
  function getState(keys = null) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        resolve({});
        return;
      }
      chrome.storage.local.get(keys, (res) => {
        resolve(res || {});
      });
    });
  }

  /**
   * Cập nhật dữ liệu nguyên tử tuần tự có hàng đợi và trường _rev theo từng khóa
   * @param {string} key - Tên khóa lưu trữ
   * @param {function} updater - Hàm nhận giá trị hiện tại và trả về giá trị mới
   * @returns {Promise<any>}
   */
  function patch(key, updater) {
    if (!key || typeof updater !== 'function') {
      return Promise.reject(new Error('Khóa hoặc hàm updater không hợp lệ'));
    }

    const currentPromise = keyQueues.get(key) || Promise.resolve();

    const nextPromise = currentPromise.then(async () => {
      const revKey = `_rev_${key}`;
      const existing = await getState([key, revKey]);
      const currentVal = existing[key];
      const currentRev = (typeof existing[revKey] === 'number') ? existing[revKey] : 0;

      const newVal = await Promise.resolve(updater(currentVal));
      const nextRev = currentRev + 1;

      return new Promise((resolve, reject) => {
        const payload = {
          [key]: newVal,
          [revKey]: nextRev,
        };
        chrome.storage.local.set(payload, () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve({ value: newVal, rev: nextRev });
          }
        });
      });
    }).catch((err) => {
      console.error(`[Storage Queue Error on key: ${key}]`, err);
      throw err;
    });

    keyQueues.set(key, nextPromise.catch(() => {}));
    return nextPromise;
  }

  /**
   * Cập nhật phẫu thuật 1 phần tử trong mảng (như savedGroups, savedPosts) theo ID
   * Tránh hoàn toàn việc ghi đè nguyên mảng từ bản chụp cũ của dashboard / popup
   * @param {string} arrayKey
   * @param {string} idKey
   * @param {string|number} itemId
   * @param {function} itemUpdater
   * @returns {Promise<any>}
   */
  function patchItem(arrayKey, idKey, itemId, itemUpdater) {
    return patch(arrayKey, (currentArray) => {
      const list = Array.isArray(currentArray) ? [...currentArray] : [];
      const idx = list.findIndex((item) => String(item?.[idKey]) === String(itemId));
      if (idx === -1) {
        return list;
      }
      const updatedItem = itemUpdater(list[idx]);
      list[idx] = { ...list[idx], ...updatedItem };
      return list;
    });
  }

  /**
   * Chuẩn hóa danh sách khung giờ hẹn đăng (scheduleSlots) đồng bộ hai chiều với savedTimes
   * @param {Array<object>} rawSlots
   * @param {Array<string>} fallbackTimes
   * @returns {Array<object>}
   */
  function normalizeScheduleSlots(rawSlots, fallbackTimes = ['08:30', '11:30', '17:30', '20:00']) {
    const validTimeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    const result = [];
    const seenTimes = new Set();

    if (Array.isArray(rawSlots) && rawSlots.length > 0) {
      for (const item of rawSlots) {
        if (!item) continue;
        const timeStr = typeof item === 'string' ? item.trim() : String(item.time || '').trim();
        if (!validTimeRegex.test(timeStr) || seenTimes.has(timeStr)) continue;
        seenTimes.add(timeStr);
        result.push({
          id: item.id || `slot_${timeStr.replace(':', '_')}`,
          time: timeStr,
          enabled: item.enabled !== false,
          accountId: item.accountId || 'active',
          accountName: item.accountName || 'Tài khoản đang chọn',
          postId: item.postId || 'selected',
          autoSwitchAccount: item.autoSwitchAccount !== false,
          lastRunDate: item.lastRunDate || null,
        });
      }
    }

    if (result.length === 0 && Array.isArray(fallbackTimes)) {
      for (const t of fallbackTimes) {
        const timeStr = String(t || '').trim();
        if (!validTimeRegex.test(timeStr) || seenTimes.has(timeStr)) continue;
        seenTimes.add(timeStr);
        result.push({
          id: `slot_${timeStr.replace(':', '_')}`,
          time: timeStr,
          enabled: true,
          accountId: 'active',
          accountName: 'Tài khoản đang chọn',
          postId: 'selected',
          autoSwitchAccount: true,
          lastRunDate: null,
        });
      }
    }

    result.sort((a, b) => a.time.localeCompare(b.time));
    return result;
  }

  /**
   * Di chuyển và bảo toàn dữ liệu cũ (Migration) khi cài đặt hoặc khởi động extension
   */
  async function runStorageMigrations() {
    const data = await getState([
      'savedPosts',
      'savedGroups',
      'savedTimes',
      'scheduledTimes',
      'scheduleSlots',
      'postHistory',
      'selectedPostIdx',
      'delaySec',
      'isScheduleActive',
      'postingSettings',
      'runState',
      'fbAccounts',
      'activeAccountId',
      '_migrated_v1_1',
    ]);

    const toSet = {};

    // 1. Chuẩn hóa link toàn bộ các nhóm hiện có
    if (Array.isArray(data.savedGroups) && data.savedGroups.length > 0) {
      let groupsChanged = false;
      const normalizedGroups = data.savedGroups.map((g, idx) => {
        const oldLink = g.link || g.url || '';
        const cleanLink = normalizeGroupUrl(oldLink);
        if (cleanLink !== oldLink) groupsChanged = true;
        return {
          id: g.id || `group_${idx}_${Date.now()}`,
          name: g.name || 'Nhóm Facebook',
          link: cleanLink || oldLink,
          members: g.members || '',
          privacy: g.privacy || '',
          enabled: g.enabled !== false,
          status: g.status || 'Chờ đăng',
          joinStatus: g.joinStatus || 'unknown',
        };
      });
      if (groupsChanged) {
        toSet.savedGroups = normalizedGroups;
        toSet._rev_savedGroups = 1;
      }
    }

    // 2. Bảo đảm cấu hình postingSettings mặc định theo chuẩn an toàn
    const defaultSettings = {
      minDelaySec: 30,
      minJitterSec: 5,
      maxJitterSec: 15,
      maxConsecutivePosts: 10,
      longBreakMinutes: 15,
      enableSpintax: true,
      enableInvisibleChars: false,
      autoJoinOnPost: true,
      maxAutoJoinPerRun: 10,
    };

    if (!data.postingSettings || typeof data.postingSettings !== 'object') {
      toSet.postingSettings = defaultSettings;
      toSet._rev_postingSettings = 1;
    } else {
      toSet.postingSettings = { ...defaultSettings, ...data.postingSettings };
    }

    // 3. Khởi tạo runState bền vững nếu chưa có
    if (!data.runState || typeof data.runState !== 'object') {
      toSet.runState = {
        runId: null,
        slotId: null,
        accountId: null,
        queue: [],
        index: 0,
        startedAt: 0,
        heartbeatAt: 0,
        status: 'idle',
        lastResult: null,
      };
      toSet._rev_runState = 1;
    }

    // 4. Khởi tạo danh sách tài khoản Facebook và tài khoản đang chọn
    if (!Array.isArray(data.fbAccounts)) {
      toSet.fbAccounts = [];
      toSet._rev_fbAccounts = 1;
    }
    if (data.activeAccountId === undefined) {
      toSet.activeAccountId = null;
    }

    // 5. Đồng bộ khung giờ hẹn đăng (scheduleSlots) từ savedTimes / scheduledTimes mà không xóa khóa cũ
    const legacyTimes = Array.isArray(data.savedTimes) && data.savedTimes.length > 0
      ? data.savedTimes
      : (Array.isArray(data.scheduledTimes) && data.scheduledTimes.length > 0
          ? data.scheduledTimes
          : ['08:30', '11:30', '17:30', '20:00']);

    const normalizedSlots = normalizeScheduleSlots(data.scheduleSlots, legacyTimes);
    toSet.scheduleSlots = normalizedSlots;
    toSet._rev_scheduleSlots = 1;

    if (!Array.isArray(data.savedTimes) || data.savedTimes.length === 0) {
      toSet.savedTimes = normalizedSlots.map((s) => s.time);
    }
    if (!Array.isArray(data.scheduledTimes) || data.scheduledTimes.length === 0) {
      toSet.scheduledTimes = normalizedSlots.map((s) => s.time);
    }

    toSet._migrated_v1_1 = true;
    toSet._migrated_v1_2 = true;
    toSet._migrated_v1_4 = true;

    return new Promise((resolve) => {
      chrome.storage.local.set(toSet, () => {
        console.log('[Storage] ✓ Đã chạy hoàn tất kiểm tra và bảo toàn dữ liệu (Storage Migration V1.4)');
        resolve();
      });
    });
  }

  /**
   * Lọc danh sách lịch sử đăng bài theo Tài khoản Facebook, Trạng thái và Loại chạy (Giai đoạn 5)
   * @param {Array<object>} historyList
   * @param {object} filters { accountId, status, type, keyword }
   * @returns {Array<object>}
   */
  function filterHistoryEntries(historyList, filters = {}) {
    const list = Array.isArray(historyList) ? historyList : [];
    const accFilter = String(filters.accountId || 'all').trim();
    const statusFilter = String(filters.status || 'all').trim();
    const typeFilter = String(filters.type || 'all').trim();
    const kw = String(filters.keyword || '').trim().toLowerCase();

    return list.filter((item) => {
      if (!item || typeof item !== 'object') return false;

      if (accFilter && accFilter !== 'all') {
        const itemAccId = String(item.accountId || '').trim();
        const itemAccUid = String(item.accountUid || '').trim();
        const itemAccName = String(item.accountName || 'Mặc định').trim();
        const matchedAcc =
          itemAccId === accFilter ||
          itemAccUid === accFilter ||
          itemAccName === accFilter ||
          (accFilter === 'default' && (!itemAccId || itemAccId === 'default'));
        if (!matchedAcc) return false;
      }

      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'autoJoined') {
          if (!item.autoJoined) return false;
        } else if (String(item.status || '') !== statusFilter) {
          return false;
        }
      }

      if (typeFilter && typeFilter !== 'all') {
        const itemType = item.type === 'scheduled' ? 'scheduled' : 'manual';
        if (itemType !== typeFilter) return false;
      }

      if (kw) {
        const haystack = [
          item.groupName,
          item.accountName,
          item.accountUid,
          item.postTitle,
          item.message,
          item.statusCode,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(kw)) return false;
      }

      return true;
    });
  }

  /**
   * Xuất danh sách lịch sử đăng bài ra chuỗi CSV chuẩn UTF-8 BOM kèm đầy đủ thông tin Tài khoản Facebook (Giai đoạn 5)
   * @param {Array<object>} historyList
   * @returns {string}
   */
  function formatHistoryToCsv(historyList) {
    const list = Array.isArray(historyList) ? historyList : [];
    const escapeCsvCell = (val) => {
      const str = String(val ?? '').replace(/\r?\n/g, ' ').trim();
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = [
      'STT',
      'Thời Gian',
      'Loại Chạy',
      'Khung Giờ',
      'Tên Tài Khoản FB',
      'UID / Mã Nick',
      'Tên Nhóm',
      'Link Nhóm',
      'Tiêu Đề Bài Viết',
      'Trạng Thái',
      'Mã Trạng Thái',
      'Tự Vào Nhóm',
      'Chi Tiết',
    ];

    let csv = '\uFEFF' + headers.join(',') + '\n';

    list.forEach((h, idx) => {
      const timeStr = h.timeFormatted || (h.timestamp ? new Date(h.timestamp).toLocaleString('vi-VN') : '');
      const typeLabel = h.type === 'scheduled' ? 'Hẹn giờ tự động' : 'Thủ công';
      const slotStr = h.slotId || '';
      const accName = h.accountName || 'Mặc định';
      const accUid = h.accountUid || h.accountId || '';
      const grpName = h.groupName || 'Nhóm Facebook';
      const grpLink = (h.groupLink && String(h.groupLink).startsWith('https://www.facebook.com/groups/'))
        ? h.groupLink
        : '';
      const postTitle = h.postTitle || 'Bài Tuyển Dụng';
      const statusLabel =
        h.status === 'success'
          ? 'Thành công'
          : h.status === 'uncertain'
          ? 'Chưa rõ'
          : h.status === 'stopped'
          ? 'Đã dừng'
          : 'Thất bại';
      const statusCode = h.statusCode || '';
      const autoJoinedLabel = h.autoJoined ? 'Đã tự vào nhóm' : 'Không';
      const message = h.message || '';

      const row = [
        idx + 1,
        escapeCsvCell(timeStr),
        escapeCsvCell(typeLabel),
        escapeCsvCell(slotStr),
        escapeCsvCell(accName),
        escapeCsvCell(accUid),
        escapeCsvCell(grpName),
        escapeCsvCell(grpLink),
        escapeCsvCell(postTitle),
        escapeCsvCell(statusLabel),
        escapeCsvCell(statusCode),
        escapeCsvCell(autoJoinedLabel),
        escapeCsvCell(message),
      ];
      csv += row.join(',') + '\n';
    });

    return csv;
  }

  const SharedStorage = {
    getState,
    patch,
    patchItem,
    normalizeGroupUrl,
    normalizeScheduleSlots,
    runStorageMigrations,
    filterHistoryEntries,
    formatHistoryToCsv,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SharedStorage;
  }
  if (typeof self !== 'undefined') {
    self.SharedStorage = SharedStorage;
    self.getState = getState;
    self.patch = patch;
    self.patchItem = patchItem;
    self.normalizeGroupUrl = normalizeGroupUrl;
    self.normalizeScheduleSlots = normalizeScheduleSlots;
    self.runStorageMigrations = runStorageMigrations;
    self.filterHistoryEntries = filterHistoryEntries;
    self.formatHistoryToCsv = formatHistoryToCsv;
  }
  if (typeof window !== 'undefined') {
    window.SharedStorage = SharedStorage;
    window.getState = getState;
    window.patch = patch;
    window.patchItem = patchItem;
    window.normalizeGroupUrl = normalizeGroupUrl;
    window.normalizeScheduleSlots = normalizeScheduleSlots;
    window.runStorageMigrations = runStorageMigrations;
    window.filterHistoryEntries = filterHistoryEntries;
    window.formatHistoryToCsv = formatHistoryToCsv;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
