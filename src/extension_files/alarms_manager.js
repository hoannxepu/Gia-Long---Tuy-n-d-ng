// alarms_manager.js - QUẢN LÝ BÁO THỨC VÀ TIẾN TRÌNH NỀN (CHROME ALARMS MANAGER)
// Giữ Service Worker sống trong phiên đăng bài (30s), kiểm tra bản quyền định kỳ 6 giờ, và điều phối hẹn giờ tự chuyển tài khoản Facebook theo khung giờ.

(function (root) {
  const ALARM_KEEP_ALIVE = 'RUNNER_KEEP_ALIVE';
  const ALARM_LICENSE_CHECK = 'PERIODIC_LICENSE_CHECK';
  const ALARM_SCHEDULE_TICK = 'SCHEDULE_SLOT_TICK';
  const SLOT_ALARM_PREFIX = 'SCHEDULE_SLOT_';

  function getTodayDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function getNextOccurrenceTimestamp(timeStr) {
    const parts = String(timeStr || '08:30').split(':');
    const hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const now = new Date();
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);

    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target.getTime();
  }

  /**
   * Khởi tạo các alarms định kỳ khi Service Worker khởi động
   */
  async function initAlarms() {
    if (typeof chrome === 'undefined' || !chrome.alarms) return;

    // 1. Kiểm tra bản quyền định kỳ mỗi 6 giờ (360 phút)
    chrome.alarms.get(ALARM_LICENSE_CHECK, (existing) => {
      if (!existing) {
        chrome.alarms.create(ALARM_LICENSE_CHECK, {
          periodInMinutes: 360,
        });
        console.log('[AlarmsManager] Đã tạo alarm kiểm tra bản quyền định kỳ 6 giờ.');
      }
    });

    // 2. Alarm kiểm tra lịch hẹn đăng bài mỗi 1 phút
    chrome.alarms.get(ALARM_SCHEDULE_TICK, (existing) => {
      if (!existing) {
        chrome.alarms.create(ALARM_SCHEDULE_TICK, {
          periodInMinutes: 1,
        });
        console.log('[AlarmsManager] Đã tạo alarm kiểm tra lịch hẹn mỗi 1 phút.');
      }
    });
  }

  /**
   * Đồng bộ danh sách khung giờ hẹn đăng với chrome.alarms (Không xóa alarm hệ thống)
   * @param {Array<object>} slots
   * @param {boolean} isScheduleActive
   */
  async function syncScheduleAlarms(slots = [], isScheduleActive = true) {
    if (typeof chrome === 'undefined' || !chrome.alarms) return;

    const allAlarms = await new Promise((resolve) => {
      chrome.alarms.getAll((list) => resolve(list || []));
    });

    for (const al of allAlarms) {
      if (!al || !al.name) continue;
      if (
        (al.name.startsWith(SLOT_ALARM_PREFIX) && al.name !== ALARM_SCHEDULE_TICK) ||
        al.name.startsWith('autorecruit_alarm_')
      ) {
        await new Promise((r) => chrome.alarms.clear(al.name, () => r()));
      }
    }

    if (!isScheduleActive || !Array.isArray(slots)) {
      return;
    }

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot || slot.enabled === false || !slot.time) continue;
      const alarmName = `${SLOT_ALARM_PREFIX}${slot.id || ('slot_' + slot.time.replace(':', '_'))}`;
      const when = getNextOccurrenceTimestamp(slot.time);
      chrome.alarms.create(alarmName, {
        when,
        periodInMinutes: 1440,
      });
    }
  }

  /**
   * Bật keep-alive cho service worker khi có tiến trình đăng bài
   */
  function startKeepAlive() {
    if (typeof chrome === 'undefined' || !chrome.alarms) return;
    chrome.alarms.create(ALARM_KEEP_ALIVE, {
      periodInMinutes: 0.5, // 30 giây
    });
  }

  /**
   * Tắt keep-alive khi hoàn tất hoặc dừng tiến trình
   */
  function stopKeepAlive() {
    if (typeof chrome === 'undefined' || !chrome.alarms) return;
    chrome.alarms.clear(ALARM_KEEP_ALIVE, () => {});
  }

  /**
   * Đánh dấu một khung giờ đã chạy trong ngày hôm nay để tránh chạy lặp
   */
  async function markSlotLastRunDate(slotId, timeStr, todayKey) {
    if (typeof SharedStorage !== 'undefined' && SharedStorage.patch) {
      await SharedStorage.patch('scheduleSlots', (currentSlots) => {
        const list = Array.isArray(currentSlots) ? [...currentSlots] : [];
        return list.map((s) => {
          if ((slotId && s.id === slotId) || (timeStr && s.time === timeStr)) {
            return { ...s, lastRunDate: todayKey };
          }
          return s;
        });
      });
    }
  }

  /**
   * Thực thi 1 khung giờ hẹn đăng bài (Tự động kiểm tra/chuyển tài khoản FB -> Lấy đủ 3 biến thể -> Chạy FbRunner)
   * @param {object|string} slotOrId
   * @param {'alarm'|'tick'|'force_test'} triggerSource
   */
  async function executeScheduledSlot(slotOrId, triggerSource = 'alarm') {
    const storage = await new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        return resolve({});
      }
      chrome.storage.local.get(
        [
          'isScheduleActive',
          'scheduleSlots',
          'savedTimes',
          'scheduledTimes',
          'savedPosts',
          'savedGroups',
          'selectedPostIdx',
          'delaySec',
          'enableSpintax',
          'shouldShuffleGroups',
          'autoJoinOnPost',
          'postingSettings',
        ],
        (res) => resolve(res || {})
      );
    });

    if (triggerSource !== 'force_test' && !storage.isScheduleActive) {
      return {
        success: false,
        skipped: true,
        statusCode: 'SCHEDULE_INACTIVE',
        message: 'Hẹn giờ tự động đang tắt.',
      };
    }

    const legacyTimes = storage.savedTimes || storage.scheduledTimes || ['08:30', '11:30', '17:30', '20:00'];
    const slots = (typeof SharedStorage !== 'undefined' && SharedStorage.normalizeScheduleSlots)
      ? SharedStorage.normalizeScheduleSlots(storage.scheduleSlots, legacyTimes)
      : (Array.isArray(storage.scheduleSlots) ? storage.scheduleSlots : []);

    let slot = null;
    if (slotOrId && typeof slotOrId === 'object') {
      slot = slots.find((s) => s.id === slotOrId.id || s.time === slotOrId.time) || slotOrId;
    } else if (typeof slotOrId === 'string') {
      const cleanKey = slotOrId.replace(/^SCHEDULE_SLOT_/, '').replace(/^autorecruit_alarm_\d+_/, '');
      const normalizedTime = cleanKey.replace(/^slot_/, '').replace('_', ':');
      slot = slots.find((s) => s.id === cleanKey || s.time === normalizedTime || s.id === slotOrId) || {
        id: `slot_${normalizedTime.replace(':', '_')}`,
        time: normalizedTime,
        enabled: true,
        accountId: 'active',
        accountName: 'Tài khoản đang chọn',
        postId: 'selected',
        autoSwitchAccount: true,
      };
    }

    if (!slot || slot.enabled === false) {
      return {
        success: false,
        skipped: true,
        statusCode: 'SLOT_DISABLED',
        message: 'Khung giờ này đang tắt.',
      };
    }

    const todayKey = getTodayDateKey();
    if (triggerSource !== 'force_test' && slot.lastRunDate === todayKey) {
      return {
        success: false,
        skipped: true,
        statusCode: 'ALREADY_RAN_TODAY',
        message: `Khung giờ ${slot.time} đã được thực thi trong ngày hôm nay (${todayKey}).`,
      };
    }

    // 1. Kiểm tra nếu đang có tiến trình chạy dở
    if (typeof FbRunner !== 'undefined' && FbRunner.getRunState) {
      const currentRun = await FbRunner.getRunState();
      if (currentRun && currentRun.status === 'running') {
        const isAlive = (Date.now() - (currentRun.heartbeatAt || 0)) <= 90000;
        if (isAlive) {
          await FbRunner.appendHistoryEntry({
            groupName: `Hẹn Giờ Khung ${slot.time}`,
            groupLink: '',
            postTitle: 'Bỏ qua khung giờ',
            accountId: slot.accountId || null,
            accountName: slot.accountName || null,
            status: 'failed',
            statusCode: 'SLOT_SKIPPED_RUNNER_BUSY',
            message: `Bỏ qua khung giờ ${slot.time} do đang có một tiến trình đăng bài khác đang chạy.`,
            type: 'scheduled',
          });
          return {
            success: false,
            skipped: true,
            statusCode: 'SLOT_SKIPPED_RUNNER_BUSY',
            message: 'Đang có tiến trình đăng bài đang chạy.',
          };
        }
      }
    }

    // 2. Kiểm tra bản quyền (dùng cache đã ký Ed25519; không huỷ lịch nếu chỉ lỗi mạng tạm thời)
    const licenseChecker = (typeof root.checkLicenseStatus === 'function')
      ? root.checkLicenseStatus
      : (typeof checkLicenseStatus === 'function' ? checkLicenseStatus : null);

    if (licenseChecker) {
      const licRes = await licenseChecker(false);
      if (!licRes || !licRes.isValid) {
        const errMsg = licRes?.message || 'Chưa kích hoạt bản quyền VIP hoặc bản quyền đã hết hạn';
        if (typeof FbRunner !== 'undefined' && FbRunner.appendHistoryEntry) {
          await FbRunner.appendHistoryEntry({
            groupName: 'Hệ Thống Bản Quyền',
            groupLink: '',
            postTitle: `Hẹn Giờ ${slot.time}`,
            accountId: slot.accountId || null,
            accountName: slot.accountName || null,
            status: 'failed',
            statusCode: 'LICENSE_INVALID',
            message: `🚨 Tạm dừng khung giờ ${slot.time}: ${errMsg}`,
            type: 'scheduled',
          });
        }
        return {
          success: false,
          skipped: true,
          statusCode: 'LICENSE_INVALID',
          message: errMsg,
        };
      }
    }

    // 3. Kiểm tra & Tự động chuyển tài khoản Facebook theo khung giờ
    let targetAccountId = slot.accountId || 'active';
    let targetAccountName = slot.accountName || 'Tài khoản đang chọn';
    let switchedAccount = false;

    if (typeof AccountsManager !== 'undefined' && AccountsManager.ensureAccountForScheduledSlot) {
      const accCheck = await AccountsManager.ensureAccountForScheduledSlot(slot);
      if (!accCheck.ready) {
        await markSlotLastRunDate(slot.id, slot.time, todayKey);
        if (typeof FbRunner !== 'undefined' && FbRunner.appendHistoryEntry) {
          await FbRunner.appendHistoryEntry({
            groupName: `Hẹn Giờ Khung ${slot.time}`,
            groupLink: '',
            postTitle: 'Kiểm tra / Chuyển tài khoản FB',
            accountId: accCheck.account ? accCheck.account.id : targetAccountId,
            accountName: accCheck.account ? accCheck.account.name : targetAccountName,
            status: 'failed',
            statusCode: accCheck.statusCode || 'ACCOUNT_NOT_READY',
            message: `⏰ Khung giờ ${slot.time}: ${accCheck.message}`,
            type: 'scheduled',
          });
        }
        return {
          success: false,
          skipped: true,
          statusCode: accCheck.statusCode || 'ACCOUNT_NOT_READY',
          message: accCheck.message,
        };
      }

      if (accCheck.account) {
        targetAccountId = accCheck.account.id;
        targetAccountName = accCheck.account.name;
      }
      switchedAccount = Boolean(accCheck.switched);
    }

    // 4. Lấy bài viết (đủ 3 biến thể thật) và danh sách nhóm đang bật
    const posts = Array.isArray(storage.savedPosts) ? storage.savedPosts : [];
    const activeGroups = (Array.isArray(storage.savedGroups) ? storage.savedGroups : []).filter(
      (g) => g && g.enabled !== false
    );

    if (activeGroups.length === 0) {
      return {
        success: false,
        skipped: true,
        statusCode: 'NO_ACTIVE_GROUPS',
        message: 'Không có nhóm nào được bật để đăng bài.',
      };
    }

    let targetPost = null;
    if (slot.postId && slot.postId !== 'selected') {
      targetPost = posts.find(
        (p, idx) => String(p.id) === String(slot.postId) || String(idx) === String(slot.postId)
      ) || null;
    }
    if (!targetPost) {
      const selIdx = typeof storage.selectedPostIdx === 'number' ? storage.selectedPostIdx : 0;
      targetPost = posts[selIdx] || posts[0] || null;
    }

    if (!targetPost || !targetPost.content) {
      return {
        success: false,
        skipped: true,
        statusCode: 'NO_POST_CONTENT',
        message: 'Không tìm thấy nội dung bài viết cho khung giờ này.',
      };
    }

    const postVariants = [
      targetPost.content,
      targetPost.contentVariant2,
      targetPost.contentVariant3,
    ].filter((v) => typeof v === 'string' && v.trim().length > 0);

    // 5. Đánh dấu đã chạy trong ngày và khởi chạy FbRunner
    await markSlotLastRunDate(slot.id, slot.time, todayKey);

    if (typeof FbRunner !== 'undefined' && FbRunner.startBatchPosting) {
      const startRes = await FbRunner.startBatchPosting({
        groups: activeGroups,
        content: targetPost.content,
        variants: postVariants,
        images: Array.isArray(targetPost.images) ? targetPost.images.slice(0, 3) : [],
        isSpintaxEnabled: storage.enableSpintax !== false,
        delaySec: Math.max(30, parseInt(storage.delaySec, 10) || 30),
        shouldShuffle: storage.shouldShuffleGroups !== false,
        autoJoinOnPost: storage.autoJoinOnPost !== false && (storage.postingSettings?.autoJoinOnPost !== false),
        postTitle: targetPost.title || `Bài Hẹn Giờ (${slot.time})`,
        slotId: slot.id || `slot_${slot.time.replace(':', '_')}`,
        accountId: targetAccountId,
        accountName: targetAccountName,
      });

      return {
        success: true,
        runId: startRes.runId,
        switchedAccount,
        accountId: targetAccountId,
        accountName: targetAccountName,
        slot,
      };
    }

    return {
      success: false,
      skipped: true,
      statusCode: 'RUNNER_UNAVAILABLE',
      message: 'FbRunner chưa sẵn sàng.',
    };
  }

  /**
   * Kiểm tra mỗi phút xem có khung giờ nào khớp với giờ hiện tại mà chưa chạy hôm nay không
   */
  async function handleScheduledTick(customNow = null) {
    const now = customNow instanceof Date ? customNow : new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const currentTimeStr = `${hh}:${mm}`;
    const todayKey = getTodayDateKey(now);

    const storage = await new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        return resolve({});
      }
      chrome.storage.local.get(['isScheduleActive', 'scheduleSlots', 'savedTimes', 'scheduledTimes'], (res) =>
        resolve(res || {})
      );
    });

    if (!storage.isScheduleActive) return null;

    const legacyTimes = storage.savedTimes || storage.scheduledTimes || [];
    const slots = (typeof SharedStorage !== 'undefined' && SharedStorage.normalizeScheduleSlots)
      ? SharedStorage.normalizeScheduleSlots(storage.scheduleSlots, legacyTimes)
      : (Array.isArray(storage.scheduleSlots) ? storage.scheduleSlots : []);

    const matchingSlot = slots.find(
      (s) => s && s.enabled !== false && s.time === currentTimeStr && s.lastRunDate !== todayKey
    );

    if (matchingSlot) {
      console.log(`[AlarmsManager] ⏰ Khớp khung giờ hẹn đăng ${currentTimeStr} -> Bắt đầu thực thi slot:`, matchingSlot);
      return await executeScheduledSlot(matchingSlot, 'tick');
    }
    return null;
  }

  /**
   * Xử lý sự kiện khi có Alarm kích hoạt
   */
  async function handleAlarmTrigger(alarm) {
    if (!alarm || !alarm.name) return null;

    if (alarm.name === ALARM_KEEP_ALIVE) {
      if (typeof FbRunner !== 'undefined') {
        const state = await FbRunner.getRunState();
        if (state && state.status === 'running') {
          state.heartbeatAt = Date.now();
          await FbRunner.setRunState(state);
        } else {
          stopKeepAlive();
        }
      }
      return null;
    }

    if (alarm.name === ALARM_LICENSE_CHECK) {
      console.log('[AlarmsManager] Kích hoạt kiểm tra bản quyền định kỳ 6 giờ...');
      const licenseChecker = (typeof root.checkLicenseStatus === 'function')
        ? root.checkLicenseStatus
        : (typeof checkLicenseStatus === 'function' ? checkLicenseStatus : null);
      if (licenseChecker) {
        try {
          await licenseChecker(false);
        } catch (e) {
          console.warn('[AlarmsManager] Lỗi kiểm tra bản quyền qua mạng tạm thời (giữ nguyên token cache):', e);
        }
      }
      return null;
    }

    if (alarm.name === ALARM_SCHEDULE_TICK) {
      try {
        return await handleScheduledTick();
      } catch (e) {
        console.warn('[AlarmsManager] Lỗi kiểm tra lịch hẹn:', e);
      }
      return null;
    }

    if (alarm.name.startsWith(SLOT_ALARM_PREFIX) || alarm.name.startsWith('autorecruit_alarm_')) {
      try {
        return await executeScheduledSlot(alarm.name, 'alarm');
      } catch (e) {
        console.error('[AlarmsManager] Lỗi thực thi alarm khung giờ:', e);
      }
      return null;
    }

    return null;
  }

  const AlarmsManager = {
    initAlarms,
    syncScheduleAlarms,
    startKeepAlive,
    stopKeepAlive,
    executeScheduledSlot,
    handleScheduledTick,
    handleAlarmTrigger,
    getTodayDateKey,
    getNextOccurrenceTimestamp,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AlarmsManager;
  }
  if (typeof self !== 'undefined') {
    self.AlarmsManager = AlarmsManager;
  }
  if (typeof window !== 'undefined') {
    window.AlarmsManager = AlarmsManager;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
