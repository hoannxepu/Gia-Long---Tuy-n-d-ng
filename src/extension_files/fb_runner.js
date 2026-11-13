// fb_runner.js - BỘ ĐIỀU PHỐI TIẾN TRÌNH ĐĂNG BÀI BỀN VỮNG (RESILIENT POST RUNNER)
// Quản lý runState bền vững, AbortController, dừng an toàn, kiểm soát tần suất và ghi lịch sử tuần tự.

(function (root) {
  let activeAbortController = null;
  let activeCreatedTabId = null;
  let lastStatusUpdateMs = 0;
  let lastStatusText = '';

  /**
   * Tạo UUID v4 đơn giản cho runId
   */
  function generateRunId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'run_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }

  /**
   * Sleep có thể hủy lập tức thông qua AbortSignal
   * @param {number} ms
   * @param {AbortSignal} [signal]
   * @returns {Promise<void>}
   */
  function abortableSleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        return reject(new Error('ABORTED'));
      }

      const timer = setTimeout(() => {
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      function onAbort() {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(new Error('ABORTED'));
      }

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  /**
   * Cập nhật trạng thái hiển thị (tối đa 1 lần/giây và chỉ khi nội dung thay đổi)
   */
  async function updateStatusThrottled(statusData) {
    const now = Date.now();
    const statusText = statusData.statusText || '';
    if (now - lastStatusUpdateMs < 1000 && statusText === lastStatusText) {
      return;
    }
    lastStatusUpdateMs = now;
    lastStatusText = statusText;

    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ postingStatus: statusData });
      }
    } catch (e) {}

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ action: 'STATUS_UPDATE', status: statusData }).catch(() => {});
      }
    } catch (e) {}
  }

  /**
   * Đọc runState hiện tại từ storage (ưu tiên session nếu có, fallback về local)
   */
  async function getRunState() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        if (chrome.storage.session) {
          const s = await new Promise((r) => chrome.storage.session.get('runState', r));
          if (s && s.runState) return s.runState;
        }
        const l = await new Promise((r) => chrome.storage.local.get('runState', r));
        return l && l.runState ? l.runState : null;
      }
    } catch (e) {}
    return null;
  }

  /**
   * Lưu runState vào cả session và local
   */
  async function setRunState(state) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        if (chrome.storage.session) {
          await chrome.storage.session.set({ runState: state }).catch(() => {});
        }
        await chrome.storage.local.set({ runState: state }).catch(() => {});
      }
    } catch (e) {}
  }

  /**
   * Ghi nhận 1 bản ghi vào lịch sử đăng bài (postHistory) thông qua mutex tuần tự
   * Giới hạn tối đa 1.000 bản ghi mới nhất, cắt tỉa các bản ghi cũ.
   */
  async function appendHistoryEntry(entry) {
    if (typeof SharedStorage === 'undefined' || !SharedStorage.patch) {
      return;
    }

    let resolvedAccountId = entry.accountId || null;
    let resolvedAccountUid = entry.accountUid || null;
    let resolvedAccountName = entry.accountName || null;

    if ((!resolvedAccountId || !resolvedAccountName || !resolvedAccountUid) && typeof AccountsManager !== 'undefined') {
      try {
        let matchedAcc = null;
        if (resolvedAccountId && typeof AccountsManager.getAccounts === 'function') {
          const allAccs = await AccountsManager.getAccounts();
          if (Array.isArray(allAccs)) {
            matchedAcc = allAccs.find(
              (a) =>
                a &&
                (String(a.id) === String(resolvedAccountId) ||
                  String(a.uid) === String(resolvedAccountId) ||
                  String(a.fbUserId) === String(resolvedAccountId))
            );
          }
        }
        if (!matchedAcc && !resolvedAccountId && typeof AccountsManager.getActiveAccount === 'function') {
          matchedAcc = await AccountsManager.getActiveAccount();
        }
        if (matchedAcc) {
          if (!resolvedAccountId) resolvedAccountId = matchedAcc.id || matchedAcc.uid || matchedAcc.fbUserId || null;
          if (!resolvedAccountUid) resolvedAccountUid = matchedAcc.uid || matchedAcc.fbUserId || matchedAcc.id || null;
          if (!resolvedAccountName) resolvedAccountName = matchedAcc.name || matchedAcc.displayName || null;
        }
      } catch (e) {}
    }

    const nowIso = entry.timestamp || new Date().toISOString();
    const safeGroupLink = (typeof SharedStorage !== 'undefined' && SharedStorage.normalizeGroupUrl && entry.groupLink)
      ? SharedStorage.normalizeGroupUrl(entry.groupLink)
      : (String(entry.groupLink || '').startsWith('https://www.facebook.com/groups/') ? String(entry.groupLink) : '');

    const safeEntry = {
      id: entry.id || ('hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
      timestamp: nowIso,
      timeFormatted: entry.timeFormatted || new Date(nowIso).toLocaleString('vi-VN'),
      groupName: String(entry.groupName || 'Nhóm Facebook').slice(0, 150),
      groupLink: safeGroupLink,
      postTitle: String(entry.postTitle || 'Bài viết').slice(0, 150),
      accountId: resolvedAccountId || 'default',
      accountUid: resolvedAccountUid || '',
      accountName: String(resolvedAccountName || 'Mặc định').slice(0, 100),
      slotId: entry.slotId || null,
      autoJoined: Boolean(entry.autoJoined),
      joinStatus: entry.joinStatus || null,
      status: ['success', 'failed', 'uncertain', 'stopped'].includes(entry.status) ? entry.status : 'uncertain',
      statusCode: entry.statusCode || 'UNKNOWN',
      message: String(entry.message || '').slice(0, 300),
      type: entry.type || 'manual',
    };

    await SharedStorage.patch('postHistory', (current) => {
      const list = Array.isArray(current) ? [...current] : [];
      list.unshift(safeEntry);
      if (list.length > 1000) {
        return list.slice(0, 1000);
      }
      return list;
    });

    return safeEntry;
  }

  /**
   * Bắt đầu một phiên đăng bài hàng loạt
   * @param {object} options
   */
  async function startBatchPosting(options) {
    const currentState = await getRunState();
    if (currentState && currentState.status === 'running') {
      const isDead = (Date.now() - (currentState.heartbeatAt || 0)) > 90000;
      if (!isDead) {
        throw new Error('Đang có một tiến trình đăng bài đang chạy!');
      }
      console.warn('[FbRunner] Phát hiện tiến trình cũ bị ngắt nhịp (heartbeat quá 90s). Tự động dọn dẹp để bắt đầu phiên mới.');
    }

    const groups = Array.isArray(options.groups) ? options.groups : [];
    if (groups.length === 0) {
      throw new Error('Danh sách nhóm trống!');
    }

    // Kiểm tra tài khoản và trạng thái Cooldown độc lập
    let targetAccount = null;
    if (typeof AccountsManager !== 'undefined') {
      if (options.accountId) {
        const accounts = await AccountsManager.getAccounts();
        targetAccount = accounts.find((a) => String(a.id) === String(options.accountId));
      }
      if (!targetAccount) {
        targetAccount = await AccountsManager.getActiveAccount();
      }
      if (targetAccount) {
        const coolCheck = AccountsManager.isAccountCoolingDown(targetAccount);
        if (coolCheck.isCoolingDown) {
          throw new Error(`Tài khoản "${targetAccount.name}" đang bị giới hạn tần suất (cần nghỉ ngơi đến ${coolCheck.untilFormatted}, còn khoảng ${coolCheck.remainingMinutes} phút). Vui lòng chọn tài khoản khác hoặc chờ hết thời gian!`);
        }
      }
    }

    // Đọc cấu hình postingSettings
    let postingSettings = {
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
    if (typeof SharedStorage !== 'undefined' && SharedStorage.getState) {
      const st = await SharedStorage.getState('postingSettings');
      if (st && st.postingSettings) {
        postingSettings = { ...postingSettings, ...st.postingSettings };
      }
    }

    const runId = generateRunId();
    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;

    const runState = {
      runId,
      slotId: options.slotId || null,
      accountId: targetAccount ? targetAccount.id : (options.accountId || null),
      accountUid: targetAccount ? (targetAccount.uid || '') : (options.accountUid || ''),
      accountName: targetAccount ? targetAccount.name : (options.accountName || null),
      queue: groups,
      index: 0,
      startedAt: Date.now(),
      heartbeatAt: Date.now(),
      status: 'running',
      lastResult: null,
      postedGroupIds: [],
      autoJoinedCount: 0,
      options: {
        postTitle: options.postTitle || 'Bài Tuyển Dụng',
        content: options.content || '',
        variants: Array.isArray(options.variants) ? options.variants : [],
        images: Array.isArray(options.images) ? options.images : [],
        isSpintaxEnabled: options.isSpintaxEnabled !== false,
        autoJoinOnPost: options.autoJoinOnPost !== false,
        delaySec: Math.max(30, parseInt(options.delaySec, 10) || 30),
      },
    };

    await setRunState(runState);

    // Kích hoạt alarm keep-alive mỗi 30s
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.create('RUNNER_KEEP_ALIVE', { periodInMinutes: 0.5 });
    }

    // Chạy vòng lặp đăng bài trong nền
    runPostingLoop(runState, postingSettings, signal).catch(async (err) => {
      console.error('[FbRunner] Lỗi luồng đăng bài:', err);
      const latest = await getRunState();
      if (latest && latest.runId === runId && latest.status === 'running') {
        latest.status = err.message === 'ABORTED' ? 'stopped' : 'failed';
        latest.heartbeatAt = Date.now();
        await setRunState(latest);
      }
    });

    return { success: true, runId };
  }

  /**
   * Vòng lặp chính thực hiện đăng bài qua từng nhóm
   */
  async function runPostingLoop(runState, settings, signal) {
    const queue = runState.queue;
    let consecutiveCount = 0;

    for (let i = runState.index; i < queue.length; i++) {
      if (signal.aborted) {
        throw new Error('ABORTED');
      }

      // Cập nhật nhịp tim heartbeat và vị trí hiện tại
      runState.index = i;
      runState.heartbeatAt = Date.now();
      await setRunState(runState);

      const group = queue[i];
      const groupLink = typeof SharedStorage !== 'undefined' && SharedStorage.normalizeGroupUrl
        ? SharedStorage.normalizeGroupUrl(group.link || group.url)
        : (group.link || group.url);

      await updateStatusThrottled({
        isRunning: true,
        currentIndex: i + 1,
        totalGroups: queue.length,
        currentGroup: group.name || 'Nhóm Facebook',
        statusText: `Đang xử lý nhóm ${i + 1}/${queue.length}: ${group.name || ''}`,
      });

      // 1. Chuẩn bị nội dung bài viết
      const rawVariants = [
        runState.options.content,
        ...(runState.options.variants || [])
      ].filter((v) => typeof v === 'string' && v.trim().length > 0);

      let chosenContent = rawVariants.length > 0
        ? rawVariants[Math.floor(Math.random() * rawVariants.length)]
        : '';

      // Áp dụng Spintax nếu được bật
      if (runState.options.isSpintaxEnabled && settings.enableSpintax && typeof Spintax !== 'undefined') {
        chosenContent = Spintax.sampleSpintax(chosenContent);
      }

      // Kiểm tra hạn mức tự vào nhóm tối đa mỗi phiên (tránh spam yêu cầu tham gia liên tục)
      const maxAutoJoin = settings.maxAutoJoinPerRun || 10;
      const canAutoJoinNow =
        runState.options.autoJoinOnPost !== false &&
        settings.autoJoinOnPost !== false &&
        (runState.autoJoinedCount || 0) < maxAutoJoin;

      // 2. Mở tab nhóm Facebook và thực thi content script
      let postResult = null;
      try {
        postResult = await executePostInGroupTab(groupLink, {
          content: chosenContent,
          images: runState.options.images || [],
          enableInvisibleChars: Boolean(settings.enableInvisibleChars),
          autoJoinOnPost: canAutoJoinNow,
        }, signal);
      } catch (postErr) {
        if (postErr.message === 'ABORTED') throw postErr;
        postResult = {
          success: false,
          status: 'failed',
          statusCode: 'TAB_EXECUTION_ERROR',
          message: postErr.message || 'Lỗi mở tab hoặc thực thi bài đăng',
        };
      }

      if (postResult && postResult.autoJoined) {
        runState.autoJoinedCount = (runState.autoJoinedCount || 0) + 1;
      }

      // Ghi nhận trạng thái kết quả (3 trạng thái chuẩn: success, failed, uncertain)
      const finalStatus = postResult.status || (postResult.success ? 'success' : 'failed');
      const finalMessage = postResult.message || (finalStatus === 'success' ? 'Đã gửi bài thành công' : 'Đăng bài thất bại');

      // Cập nhật trạng thái thành viên và kết quả vào savedGroups
      if (group.id && typeof SharedStorage !== 'undefined' && SharedStorage.patchItem) {
        let groupBadgeStatus = finalStatus === 'success' ? 'Đã đăng' : (finalStatus === 'uncertain' ? 'Chưa rõ' : 'Lỗi đăng');
        if (postResult.autoJoined && finalStatus === 'success') {
          groupBadgeStatus = 'Đã tự vào & Đăng';
        } else if (postResult.statusCode === 'JOIN_REQUEST_SENT' || postResult.statusCode === 'JOIN_PENDING_APPROVAL') {
          groupBadgeStatus = 'Chờ duyệt vào nhóm';
        } else if (postResult.statusCode === 'JOIN_QUESTIONS_REQUIRED') {
          groupBadgeStatus = 'Cần trả lời câu hỏi';
        } else if (postResult.statusCode === 'NOT_GROUP_MEMBER') {
          groupBadgeStatus = 'Chưa tham gia';
        }

        await SharedStorage.patchItem('savedGroups', 'id', group.id, (oldGrp) => ({
          ...oldGrp,
          joinStatus: postResult.joinStatus || (finalStatus === 'success' ? 'joined' : (oldGrp.joinStatus || 'unknown')),
          status: groupBadgeStatus,
          lastPostAt: Date.now(),
        })).catch(() => {});
      }

      await appendHistoryEntry({
        groupName: group.name || 'Nhóm Facebook',
        groupLink,
        postTitle: runState.options.postTitle,
        accountId: runState.accountId,
        accountUid: runState.accountUid,
        accountName: runState.accountName,
        slotId: runState.slotId,
        status: finalStatus,
        statusCode: postResult.statusCode || (finalStatus === 'success' ? 'SUCCESS' : 'POST_ERROR'),
        autoJoined: Boolean(postResult.autoJoined),
        joinStatus: postResult.joinStatus || null,
        message: finalMessage,
        type: runState.slotId ? 'scheduled' : 'manual',
      });

      runState.postedGroupIds.push(group.id || groupLink);
      runState.lastResult = postResult;
      runState.heartbeatAt = Date.now();
      await setRunState(runState);

      // Nếu gặp mã lỗi chặn tần suất (RATE_LIMIT / SPAM_BLOCKED) -> Dừng ngay lập tức và áp dụng Cooldown cho tài khoản
      if (postResult.statusCode === 'RATE_LIMIT' || postResult.statusCode === 'SPAM_BLOCKED') {
        console.error('[FbRunner] 🚨 Phát hiện chặn tần suất. Dừng phiên đăng bài để bảo vệ tài khoản.');
        if (typeof AccountsManager !== 'undefined' && runState.accountId) {
          await AccountsManager.setAccountStatus(runState.accountId, 'rate_limited', {
            cooldownMs: 4 * 3600 * 1000,
            reason: postResult.message || 'Facebook giới hạn tần suất thao tác',
          });
        }
        runState.status = 'paused';
        await setRunState(runState);
        await updateStatusThrottled({
          isRunning: false,
          currentIndex: i + 1,
          totalGroups: queue.length,
          statusText: `🚨 TẠM DỪNG: Facebook giới hạn tần suất đối với tài khoản "${runState.accountName || 'hiện tại'}". Tài khoản cần nghỉ ngơi.`,
        });
        cleanupActiveTab();
        return;
      }

      // Kiểm tra nếu là nhóm cuối cùng -> Kết thúc
      if (i === queue.length - 1) {
        break;
      }

      consecutiveCount++;

      // 3. Kiểm tra nghỉ dài sau N nhóm liên tiếp
      if (consecutiveCount >= (settings.maxConsecutivePosts || 10)) {
        consecutiveCount = 0;
        const breakMs = (settings.longBreakMinutes || 15) * 60 * 1000;
        const resumeAt = new Date(Date.now() + breakMs).toLocaleTimeString('vi-VN');
        await updateStatusThrottled({
          isRunning: true,
          currentIndex: i + 1,
          totalGroups: queue.length,
          statusText: `Đã đăng liên tiếp ${settings.maxConsecutivePosts} nhóm. Đang tạm nghỉ an toàn ${settings.longBreakMinutes} phút (tiếp tục lúc ${resumeAt})...`,
        });

        // Chia nhỏ thời gian ngủ để cập nhật heartbeat định kỳ
        const stepMs = 5000;
        let elapsed = 0;
        while (elapsed < breakMs) {
          await abortableSleep(stepMs, signal);
          elapsed += stepMs;
          runState.heartbeatAt = Date.now();
          await setRunState(runState);
        }
      } else {
        // Nghỉ ngắn: tối thiểu 30s + Jitter ngẫu nhiên 5-15s
        const baseDelay = Math.max(30, runState.options.delaySec || 30);
        const minJ = settings.minJitterSec || 5;
        const maxJ = settings.maxJitterSec || 15;
        const jitter = Math.floor(Math.random() * (maxJ - minJ + 1)) + minJ;
        const totalDelaySec = baseDelay + jitter;

        for (let s = totalDelaySec; s > 0; s--) {
          await updateStatusThrottled({
            isRunning: true,
            currentIndex: i + 1,
            totalGroups: queue.length,
            statusText: `Chờ an toàn ${s}s trước khi đăng nhóm tiếp theo (+${jitter}s jitter)...`,
          });
          await abortableSleep(1000, signal);
          if (s % 5 === 0) {
            runState.heartbeatAt = Date.now();
            await setRunState(runState);
          }
        }
      }
    }

    // Hoàn tất tiến trình
    runState.status = 'completed';
    runState.heartbeatAt = Date.now();
    await setRunState(runState);

    await updateStatusThrottled({
      isRunning: false,
      currentIndex: queue.length,
      totalGroups: queue.length,
      statusText: `✓ Đã hoàn tất đăng bài vào ${queue.length} nhóm!`,
    });

    cleanupKeepAliveAlarm();
    cleanupActiveTab();
  }

  /**
   * Mở tab nhóm Facebook và gửi lệnh đăng bài đến content script
   */
  async function executePostInGroupTab(groupUrl, payload, signal) {
    if (!groupUrl || !groupUrl.startsWith('https://www.facebook.com/groups/')) {
      return {
        success: false,
        status: 'failed',
        statusCode: 'INVALID_GROUP_URL',
        message: 'Link nhóm Facebook không hợp lệ (phải bắt đầu bằng https://www.facebook.com/groups/)',
      };
    }

    if (signal.aborted) throw new Error('ABORTED');

    // Tạo tab mới ở chế độ nền
    const tab = await new Promise((resolve, reject) => {
      chrome.tabs.create({ url: groupUrl, active: false }, (t) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(t);
      });
    });

    activeCreatedTabId = tab.id;

    try {
      // Chờ tab tải xong (tối đa 25s)
      await waitForTabComplete(tab.id, 25000, signal);

      // Chờ thêm 3s cho Facebook render giao diện đầy đủ
      await abortableSleep(3000, signal);

      // Gửi message AUTO_POST_GROUP tới content.js
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'AUTO_POST_GROUP',
          content: payload.content,
          images: payload.images,
          enableInvisibleChars: payload.enableInvisibleChars,
          autoJoinOnPost: payload.autoJoinOnPost !== false,
        }, (res) => {
          if (chrome.runtime.lastError) {
            // Content script có thể chưa nạp, thử chèn thủ công
            resolve({
              success: false,
              status: 'uncertain',
              statusCode: 'CONTENT_SCRIPT_NOT_READY',
              message: 'Không nhận được phản hồi từ trang Facebook (Content Script chưa sẵn sàng)',
            });
          } else {
            resolve(res);
          }
        });
      });

      return response || {
        success: false,
        status: 'uncertain',
        statusCode: 'EMPTY_RESPONSE',
        message: 'Không nhận được phản hồi xác nhận từ Facebook',
      };
    } finally {
      // Luôn dọn dẹp đóng tab do extension mở để giải phóng RAM
      if (activeCreatedTabId === tab.id) {
        try {
          chrome.tabs.remove(tab.id, () => {});
        } catch (e) {}
        activeCreatedTabId = null;
      }
    }
  }

  /**
   * Chờ tab tải hoàn tất với timeout và AbortSignal
   */
  function waitForTabComplete(tabId, timeoutMs, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error('ABORTED'));

      let timer = null;

      function onUpdated(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          cleanup();
          resolve();
        }
      }

      function onAbort() {
        cleanup();
        reject(new Error('ABORTED'));
      }

      function cleanup() {
        if (timer) clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        signal.removeEventListener('abort', onAbort);
      }

      chrome.tabs.onUpdated.addListener(onUpdated);
      signal.addEventListener('abort', onAbort, { once: true });

      timer = setTimeout(() => {
        cleanup();
        // Hết thời gian chờ, vẫn cho phép tiếp tục thử nghiệm tương tác
        resolve();
      }, timeoutMs);
    });
  }

  /**
   * Dừng toàn bộ tiến trình đăng bài đang chạy
   */
  async function stopBatchPosting() {
    console.log('[FbRunner] Người dùng kích hoạt lệnh dừng (STOP_BATCH_POSTING)...');

    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }

    cleanupActiveTab();
    cleanupKeepAliveAlarm();

    const currentState = await getRunState();
    if (currentState) {
      currentState.status = 'stopped';
      currentState.heartbeatAt = Date.now();
      await setRunState(currentState);
    }

    await updateStatusThrottled({
      isRunning: false,
      statusText: 'Đã dừng tiến trình đăng bài theo yêu cầu!',
    });

    return { success: true, message: 'Đã dừng tiến trình thành công' };
  }

  /**
   * Đóng tab đang mở bởi extension (nếu có)
   */
  function cleanupActiveTab() {
    if (activeCreatedTabId) {
      try {
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.sendMessage(activeCreatedTabId, { action: 'STOP_POSTING' }).catch(() => {});
          chrome.tabs.remove(activeCreatedTabId, () => {});
        }
      } catch (e) {}
      activeCreatedTabId = null;
    }
  }

  /**
   * Hủy alarm keep-alive
   */
  function cleanupKeepAliveAlarm() {
    if (typeof chrome !== 'undefined' && chrome.alarms) {
      chrome.alarms.clear('RUNNER_KEEP_ALIVE', () => {});
    }
  }

  /**
   * Kiểm tra phục hồi trạng thái khi Service Worker thức dậy
   */
  async function checkAndRecoverRunState() {
    const state = await getRunState();
    if (!state || state.status !== 'running') {
      return;
    }

    const elapsed = Date.now() - (state.heartbeatAt || 0);
    // Nếu quá 90 giây không có heartbeat -> Đánh dấu bị gián đoạn
    if (elapsed > 90000) {
      console.warn(`[FbRunner] Phát hiện tiến trình bị ngắt nhịp (${Math.round(elapsed / 1000)}s kể từ heartbeat cuối).`);
      state.status = 'interrupted';
      state.heartbeatAt = Date.now();
      await setRunState(state);

      await appendHistoryEntry({
        groupName: 'Hệ Thống Đăng Bài',
        groupLink: '',
        postTitle: state.options?.postTitle || 'Tiến trình đăng',
        accountId: state.accountId,
        accountName: state.accountName,
        status: 'uncertain',
        statusCode: 'RUNNER_INTERRUPTED',
        message: `Tiến trình bị gián đoạn sau khi hoàn tất ${state.index}/${state.queue?.length || 0} nhóm do trình duyệt hoặc Service Worker tạm dừng.`,
        type: state.slotId ? 'scheduled' : 'manual',
      });

      await updateStatusThrottled({
        isRunning: false,
        currentIndex: state.index,
        totalGroups: state.queue?.length || 0,
        statusText: `Tiến trình đăng bài bị gián đoạn tại nhóm ${state.index}/${state.queue?.length || 0}. Bạn có thể bấm Đăng tiếp để chạy phần còn lại.`,
      });

      cleanupKeepAliveAlarm();
      cleanupActiveTab();
    }
  }

  const FbRunner = {
    generateRunId,
    abortableSleep,
    getRunState,
    setRunState,
    appendHistoryEntry,
    startBatchPosting,
    stopBatchPosting,
    checkAndRecoverRunState,
    cleanupActiveTab,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FbRunner;
  }
  if (typeof self !== 'undefined') {
    self.FbRunner = FbRunner;
    self.abortableSleep = abortableSleep;
    self.getRunState = getRunState;
    self.setRunState = setRunState;
    self.appendHistoryEntry = appendHistoryEntry;
    self.startBatchPosting = startBatchPosting;
    self.stopBatchPosting = stopBatchPosting;
    self.checkAndRecoverRunState = checkAndRecoverRunState;
  }
  if (typeof window !== 'undefined') {
    window.FbRunner = FbRunner;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
