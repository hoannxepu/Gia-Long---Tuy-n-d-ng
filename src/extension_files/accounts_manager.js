// accounts_manager.js - QUẢN LÝ TÀI KHOẢN FACEBOOK & COOLDOWN ĐỘC LẬP
// Hỗ trợ lưu trữ nhiều tài khoản, nhận diện tài khoản hiện hành, kiểm soát thời gian nghỉ độc lập.

(function (root) {
  /**
   * Đọc danh sách tài khoản Facebook từ storage
   * @returns {Promise<Array<object>>}
   */
  async function getAccounts() {
    if (typeof SharedStorage !== 'undefined' && SharedStorage.getState) {
      const state = await SharedStorage.getState('fbAccounts');
      return Array.isArray(state.fbAccounts) ? state.fbAccounts : [];
    }
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        return resolve([]);
      }
      chrome.storage.local.get(['fbAccounts'], (res) => {
        resolve(Array.isArray(res?.fbAccounts) ? res.fbAccounts : []);
      });
    });
  }

  /**
   * Lấy tài khoản đang được chọn để đăng bài
   * @returns {Promise<object|null>}
   */
  async function getActiveAccount() {
    let activeId = null;
    let list = [];

    if (typeof SharedStorage !== 'undefined' && SharedStorage.getState) {
      const st = await SharedStorage.getState(['activeAccountId', 'fbAccounts']);
      activeId = st.activeAccountId;
      list = Array.isArray(st.fbAccounts) ? st.fbAccounts : [];
    } else {
      const st = await new Promise((r) => chrome.storage.local.get(['activeAccountId', 'fbAccounts'], r));
      activeId = st?.activeAccountId;
      list = Array.isArray(st?.fbAccounts) ? st.fbAccounts : [];
    }

    if (!list.length) return null;

    if (activeId) {
      const matched = list.find((a) => String(a.id) === String(activeId) || String(a.uid) === String(activeId));
      if (matched) return matched;
    }

    // Fallback: Lấy tài khoản đang active đầu tiên
    const activeOne = list.find((a) => a.status === 'active' && (!a.rateLimitUntil || a.rateLimitUntil <= Date.now()));
    return activeOne || list[0];
  }

  /**
   * Đặt tài khoản đang chọn
   * @param {string} accountId
   */
  async function setActiveAccount(accountId) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set({ activeAccountId: accountId });
    }
    return { success: true, activeAccountId: accountId };
  }

  /**
   * Thêm mới hoặc cập nhật thông tin tài khoản Facebook
   * @param {object} accountData { uid, name, avatar, note }
   */
  async function upsertAccount(accountData) {
    if (!accountData) throw new Error('Dữ liệu tài khoản không hợp lệ');

    const uid = String(accountData.uid || '').trim();
    const name = String(accountData.name || 'Tài khoản Facebook').trim().slice(0, 100);
    const avatar = String(accountData.avatar || '').trim();

    let updatedAccount = null;

    if (typeof SharedStorage !== 'undefined' && SharedStorage.patch) {
      await SharedStorage.patch('fbAccounts', (currentList) => {
        const list = Array.isArray(currentList) ? [...currentList] : [];
        const idx = list.findIndex((a) => (uid && a.uid === uid) || (accountData.id && a.id === accountData.id));

        if (idx !== -1) {
          // Cập nhật tài khoản hiện có
          list[idx] = {
            ...list[idx],
            name: name || list[idx].name,
            avatar: avatar || list[idx].avatar,
            status: accountData.status || list[idx].status || 'active',
            rateLimitUntil: accountData.rateLimitUntil !== undefined
              ? accountData.rateLimitUntil
              : (accountData.cooldownUntil !== undefined ? accountData.cooldownUntil : (list[idx].rateLimitUntil || 0)),
            lastActiveAt: Date.now(),
          };
          updatedAccount = list[idx];
        } else {
          // Thêm tài khoản mới
          const newId = accountData.id || `acc_${uid || Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          updatedAccount = {
            id: newId,
            uid: uid || '',
            name: name || 'Tài khoản Facebook',
            avatar: avatar || '',
            status: accountData.status || 'active',
            rateLimitUntil: accountData.rateLimitUntil || accountData.cooldownUntil || 0,
            lastActiveAt: Date.now(),
            note: accountData.note || '',
          };
          list.push(updatedAccount);
        }
        return list;
      });
    }

    // Nếu chưa có activeAccountId, chọn tài khoản này làm mặc định
    const active = await getActiveAccount();
    if (!active && updatedAccount) {
      await setActiveAccount(updatedAccount.id);
    }

    return { success: true, account: updatedAccount };
  }

  /**
   * Xóa một tài khoản khỏi danh sách
   * @param {string} accountId
   */
  async function removeAccount(accountId) {
    if (typeof SharedStorage !== 'undefined' && SharedStorage.patch) {
      await SharedStorage.patch('fbAccounts', (currentList) => {
        const list = Array.isArray(currentList) ? [...currentList] : [];
        return list.filter((a) => String(a.id) !== String(accountId));
      });
    }

    // Nếu vừa xóa tài khoản đang chọn, reset activeAccountId
    const active = await getActiveAccount();
    if (active && String(active.id) === String(accountId)) {
      const remaining = await getAccounts();
      await setActiveAccount(remaining[0]?.id || null);
    }

    return { success: true };
  }

  /**
   * Cập nhật trạng thái và thời gian Cooldown theo từng tài khoản độc lập
   * @param {string} accountId
   * @param {'active'|'rate_limited'|'checkpoint'|'disconnected'} status
   * @param {object} [details] { cooldownMs, reason }
   */
  async function setAccountStatus(accountId, status, details = {}) {
    if (!accountId) return;

    const cooldownMs = details.cooldownMs || (4 * 3600 * 1000); // Mặc định nghỉ 4 giờ khi dính giới hạn
    const rateLimitUntil = status === 'rate_limited' ? (Date.now() + cooldownMs) : 0;

    if (typeof SharedStorage !== 'undefined' && SharedStorage.patchItem) {
      await SharedStorage.patchItem('fbAccounts', 'id', accountId, (acc) => ({
        ...acc,
        status,
        rateLimitUntil,
        lastError: details.reason || null,
        lastActiveAt: Date.now(),
      }));
    }

    console.log(`[AccountsManager] Đã cập nhật trạng thái nick ${accountId}: ${status}`, details);
    return { success: true };
  }

  /**
   * Kiểm tra xem tài khoản có đang trong thời gian Cooldown không
   * @param {object} account
   * @returns {{ isCoolingDown: boolean, remainingMinutes: number, untilFormatted: string }}
   */
  function isAccountCoolingDown(account) {
    const until = account ? (account.rateLimitUntil || account.cooldownUntil || 0) : 0;
    if (!until) {
      return { isCoolingDown: false, remainingMinutes: 0, untilFormatted: '' };
    }

    const now = Date.now();
    if (until > now) {
      const remainingMs = until - now;
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      const untilFormatted = new Date(until).toLocaleTimeString('vi-VN');
      return {
        isCoolingDown: true,
        remainingMinutes,
        untilFormatted,
      };
    }

    return { isCoolingDown: false, remainingMinutes: 0, untilFormatted: '' };
  }

  /**
   * Tự động nhận diện tài khoản Facebook từ tab Facebook đang mở
   */
  async function detectCurrentAccountFromTab() {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      throw new Error('Môi trường không hỗ trợ chrome.tabs');
    }

    // 1. Tìm các tab Facebook đang mở
    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ url: ['https://*.facebook.com/*', 'https://facebook.com/*'] }, resolve);
    });

    if (!tabs || tabs.length === 0) {
      throw new Error('Vui lòng mở ít nhất 1 tab Facebook trên trình duyệt và đăng nhập trước khi quét!');
    }

    const targetTab = tabs.find((t) => t.active) || tabs[0];

    // 2. Gửi message DETECT_CURRENT_FB_ACCOUNT tới content script
    const response = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(targetTab.id, { action: 'DETECT_CURRENT_FB_ACCOUNT' }, (res) => {
        if (chrome.runtime.lastError) {
          reject(new Error('Không thể kết nối với trang Facebook. Vui lòng bấm F5 tải lại tab Facebook rồi thử lại!'));
        } else {
          resolve(res);
        }
      });
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Không nhận diện được tài khoản Facebook trên tab đang mở.');
    }

    // 3. Cập nhật vào danh sách fbAccounts
    const upsertRes = await upsertAccount(response.account);
    if (upsertRes.account) {
      await setActiveAccount(upsertRes.account.id);
    }

    return {
      success: true,
      account: upsertRes.account,
      message: `✓ Đã nhận diện thành công tài khoản: ${response.account.name || 'Facebook'}`,
    };
  }

  /**
   * Kiểm tra và tự động chuyển tài khoản Facebook theo khung giờ hẹn đăng
   * @param {object} slot { id, time, accountId, accountName, autoSwitchAccount }
   * @returns {Promise<{ ready: boolean, switched: boolean, statusCode: string, account: object|null, message: string }>}
   */
  async function ensureAccountForScheduledSlot(slot = {}) {
    const accounts = await getAccounts();
    const activeAcc = await getActiveAccount();

    let targetAcc = null;
    const requestedId = String(slot.accountId || 'active').trim();
    const requestedName = String(slot.accountName || '').trim();

    if (requestedId && requestedId !== 'active') {
      targetAcc = accounts.find(
        (a) => String(a.id) === requestedId || (a.uid && String(a.uid) === requestedId)
      ) || null;
    }

    if (!targetAcc && requestedName && requestedName !== 'Tài khoản đang chọn') {
      targetAcc = accounts.find(
        (a) => String(a.name || '').trim().toLowerCase() === requestedName.toLowerCase()
      ) || null;
    }

    if (!targetAcc && requestedId === 'active') {
      targetAcc = activeAcc;
    }

    // 1. Nếu tìm thấy tài khoản trong danh sách, kiểm tra Cooldown & Checkpoint trước khi mở tab
    if (targetAcc) {
      const cooling = isAccountCoolingDown(targetAcc);
      if (cooling.isCoolingDown) {
        return {
          ready: false,
          switched: false,
          statusCode: 'ACCOUNT_COOLDOWN',
          account: targetAcc,
          message: `Tài khoản "${targetAcc.name}" đang nghỉ chống giới hạn tần suất đến ${cooling.untilFormatted} (còn ${cooling.remainingMinutes} phút).`,
        };
      }
      if (targetAcc.status === 'checkpoint') {
        return {
          ready: false,
          switched: false,
          statusCode: 'ACCOUNT_CHECKPOINT',
          account: targetAcc,
          message: `Tài khoản "${targetAcc.name}" đang ở trạng thái cần xác minh bảo mật (Checkpoint).`,
        };
      }
    }

    // 2. Kết nối tới tab Facebook để xác minh hoặc chuyển trang cá nhân gốc của Facebook
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      let tempTabId = null;
      try {
        const openTabs = await new Promise((resolve) => {
          chrome.tabs.query({ url: ['https://*.facebook.com/*', 'https://facebook.com/*'] }, (t) => resolve(t || []));
        });

        let targetTab = openTabs.find((t) => t.active) || openTabs[0] || null;
        if (!targetTab) {
          targetTab = await new Promise((resolve, reject) => {
            chrome.tabs.create({ url: 'https://www.facebook.com/', active: false }, (t) => {
              if (chrome.runtime && chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(t);
              }
            });
          });
          tempTabId = targetTab ? targetTab.id : null;
          await new Promise((r) => setTimeout(r, 2500));
        }

        if (targetTab && targetTab.id) {
          const switchSpec = {
            accountId: requestedId,
            uid: targetAcc ? (targetAcc.uid || '') : '',
            name: targetAcc ? (targetAcc.name || '') : (requestedName !== 'Tài khoản đang chọn' ? requestedName : ''),
            autoSwitchAccount: slot.autoSwitchAccount !== false,
          };

          const response = await new Promise((resolve) => {
            chrome.tabs.sendMessage(
              targetTab.id,
              {
                action: 'SWITCH_OR_VERIFY_FB_ACCOUNT',
                targetAccount: switchSpec,
              },
              (res) => {
                if (chrome.runtime && chrome.runtime.lastError) {
                  resolve({
                    success: false,
                    switched: false,
                    statusCode: 'TAB_CONNECTION_FAILED',
                    message: 'Không thể kết nối với tab Facebook để kiểm tra tài khoản.',
                  });
                } else {
                  resolve(res);
                }
              }
            );
          });

          if (response && response.success && response.account) {
            const upserted = await upsertAccount(response.account);
            const verifiedAccount = upserted.account || targetAcc || response.account;

            // Kiểm tra lại Cooldown trên tài khoản thực tế vừa nhận diện
            const postSwitchCooling = isAccountCoolingDown(verifiedAccount);
            if (postSwitchCooling.isCoolingDown) {
              return {
                ready: false,
                switched: Boolean(response.switched),
                statusCode: 'ACCOUNT_COOLDOWN',
                account: verifiedAccount,
                message: `Tài khoản "${verifiedAccount.name}" đang nghỉ chống giới hạn tần suất đến ${postSwitchCooling.untilFormatted} (còn ${postSwitchCooling.remainingMinutes} phút).`,
              };
            }

            if (verifiedAccount && verifiedAccount.id) {
              await setActiveAccount(verifiedAccount.id);
            }

            return {
              ready: true,
              switched: Boolean(response.switched),
              statusCode: response.statusCode || (response.switched ? 'ACCOUNT_SWITCHED_SUCCESS' : 'ACCOUNT_VERIFIED'),
              account: verifiedAccount,
              message: response.message || `Đã xác nhận tài khoản: ${verifiedAccount.name}`,
            };
          }

          if (response && !response.success) {
            return {
              ready: false,
              switched: false,
              statusCode: response.statusCode || 'ACCOUNT_SWITCH_FAILED',
              account: targetAcc || null,
              currentAccount: response.currentAccount || null,
              message: response.message || 'Không thể tự chuyển sang tài khoản chỉ định của khung giờ.',
            };
          }
        }
      } catch (err) {
        return {
          ready: false,
          switched: false,
          statusCode: 'ACCOUNT_VERIFY_ERROR',
          account: targetAcc || null,
          message: err.message || 'Lỗi khi kiểm tra tài khoản cho khung giờ hẹn đăng.',
        };
      } finally {
        if (tempTabId && chrome.tabs && chrome.tabs.remove) {
          try {
            chrome.tabs.remove(tempTabId, () => {});
          } catch (e) {}
        }
      }
    }

    if (targetAcc) {
      await setActiveAccount(targetAcc.id);
      return {
        ready: true,
        switched: false,
        statusCode: 'ACCOUNT_READY',
        account: targetAcc,
        message: `Đã sẵn sàng tài khoản: ${targetAcc.name}`,
      };
    }

    return {
      ready: false,
      switched: false,
      statusCode: 'NO_ACCOUNT_AVAILABLE',
      account: null,
      message: 'Chưa có tài khoản Facebook nào được cấu hình hoặc nhận diện.',
    };
  }

  /**
   * Lưu phiên cookie (c_user, xs, fr, datr) của tài khoản đang đăng nhập vào Két phiên cục bộ (Session Vault)
   * Tuyệt đối KHÔNG lưu mật khẩu Facebook.
   * @param {string} [targetAccountId]
   */
  async function saveCurrentSessionToVault(targetAccountId = null) {
    if (typeof chrome === 'undefined' || !chrome.cookies || !chrome.cookies.getAll) {
      return { ok: false, reason: 'COOKIES_PERMISSION_MISSING' };
    }

    const allCookies = await chrome.cookies.getAll({ domain: 'facebook.com' });
    const cUserCookie = Array.isArray(allCookies) ? allCookies.find((c) => c.name === 'c_user') : null;
    const xsCookie = Array.isArray(allCookies) ? allCookies.find((c) => c.name === 'xs') : null;

    if (!cUserCookie || !cUserCookie.value || !xsCookie || !xsCookie.value) {
      return { ok: false, reason: 'NOT_LOGGED_IN' };
    }

    const fbUserId = String(cUserCookie.value).trim();
    const accountKey = String(targetAccountId || fbUserId).trim();
    const allowedNames = new Set(['c_user', 'xs', 'fr', 'datr', 'sb', 'wd']);
    const snapshot = allCookies
      .filter((c) => allowedNames.has(c.name) && c.value)
      .map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain || '.facebook.com',
        path: c.path || '/',
        secure: c.secure !== false,
        httpOnly: Boolean(c.httpOnly),
        sameSite: c.sameSite || 'no_restriction',
      }));

    if (typeof SharedStorage !== 'undefined' && SharedStorage.patch) {
      await SharedStorage.patch('fbAccountVault', (oldVault) => {
        const vault = oldVault && typeof oldVault === 'object' ? { ...oldVault } : {};
        vault[accountKey] = {
          accountId: accountKey,
          fbUserId,
          savedAt: Date.now(),
          cookies: snapshot,
        };
        vault[fbUserId] = vault[accountKey];
        return vault;
      });

      await SharedStorage.patch('fbAccounts', (currentList) => {
        const list = Array.isArray(currentList) ? [...currentList] : [];
        return list.map((acc) => {
          if (
            acc &&
            (String(acc.id) === accountKey ||
              String(acc.uid) === fbUserId ||
              String(acc.fbUserId) === fbUserId)
          ) {
            return { ...acc, vault: true, status: acc.status === 'needs_login' ? 'ok' : acc.status };
          }
          return acc;
        });
      });
    }

    return { ok: true, accountId: accountKey, fbUserId, count: snapshot.length };
  }

  /**
   * Chuyển đổi tài khoản Facebook thông qua Két phiên (Session Vault) hoặc trình chuyển trang cá nhân
   * @param {string} accountId
   * @returns {Promise<{ok: boolean, reason?: string, account?: object}>}
   */
  async function switchTo(accountId) {
    if (!accountId) {
      return { ok: false, reason: 'MISSING_ACCOUNT_ID' };
    }

    const accounts = await getAccounts();
    const targetAcc = accounts.find(
      (a) =>
        a &&
        (String(a.id) === String(accountId) ||
          String(a.uid) === String(accountId) ||
          String(a.fbUserId) === String(accountId))
    );

    if (targetAcc) {
      const cool = isAccountCoolingDown(targetAcc);
      if (cool.isCoolingDown) {
        return {
          ok: false,
          reason: 'ACCOUNT_COOLDOWN',
          account: targetAcc,
          message: `Tài khoản "${targetAcc.name}" đang nghỉ cooldown đến ${cool.untilFormatted}`,
        };
      }
    }

    // 1. Thử nạp từ Két phiên (fbAccountVault) nếu có quyền chrome.cookies
    if (typeof chrome !== 'undefined' && chrome.cookies && chrome.cookies.set) {
      let vaultMap = {};
      if (typeof SharedStorage !== 'undefined' && SharedStorage.getState) {
        const st = await SharedStorage.getState('fbAccountVault');
        vaultMap = st.fbAccountVault || {};
      }
      const keyCandidates = [
        String(accountId),
        targetAcc ? String(targetAcc.id || '') : '',
        targetAcc ? String(targetAcc.uid || '') : '',
        targetAcc ? String(targetAcc.fbUserId || '') : '',
      ].filter(Boolean);

      let vaultEntry = null;
      for (const k of keyCandidates) {
        if (vaultMap[k] && Array.isArray(vaultMap[k].cookies) && vaultMap[k].cookies.length > 0) {
          vaultEntry = vaultMap[k];
          break;
        }
      }

      if (vaultEntry) {
        try {
          for (const ck of vaultEntry.cookies) {
            await chrome.cookies.set({
              url: 'https://www.facebook.com/',
              name: ck.name,
              value: ck.value,
              domain: ck.domain || '.facebook.com',
              path: ck.path || '/',
              secure: ck.secure !== false,
              httpOnly: Boolean(ck.httpOnly),
            });
          }
          await setActiveAccount(targetAcc ? targetAcc.id : accountId);
          return {
            ok: true,
            reason: 'SWITCHED_BY_VAULT',
            account: targetAcc || { id: accountId, uid: vaultEntry.fbUserId },
          };
        } catch (e) {}
      }
    }

    // 2. Fallback sang cơ chế kiểm tra & chuyển trên giao diện Facebook (ensureAccountForScheduledSlot)
    const slotRes = await ensureAccountForScheduledSlot({
      accountId,
      accountName: targetAcc ? targetAcc.name : String(accountId),
      autoSwitchAccount: true,
    });

    return {
      ok: Boolean(slotRes.ready),
      reason: slotRes.statusCode || (slotRes.ready ? 'ACCOUNT_READY' : 'SWITCH_FAILED'),
      account: slotRes.account || targetAcc || null,
      message: slotRes.message,
    };
  }

  const AccountsManager = {
    getAccounts,
    getActiveAccount,
    setActiveAccount,
    upsertAccount,
    removeAccount,
    setAccountStatus,
    isAccountCoolingDown,
    detectCurrentAccountFromTab,
    ensureAccountForScheduledSlot,
    saveCurrentSessionToVault,
    switchTo,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AccountsManager;
  }
  if (typeof self !== 'undefined') {
    self.AccountsManager = AccountsManager;
    self.AccountSwitcher = AccountsManager;
  }
  if (typeof window !== 'undefined') {
    window.AccountsManager = AccountsManager;
    window.AccountSwitcher = AccountsManager;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
