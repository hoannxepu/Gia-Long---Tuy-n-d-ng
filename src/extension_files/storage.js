// storage.js - LỚP LƯU TRỮ TRUNG TÂM, KHÓA MUTEX THEO KEY & TỰ ĐỘNG DI TRÚ DỮ LIỆU (MIGRATION v1.0.5)
// Đảm bảo tương thích ngược 100% với bản cài đặt cũ, chống race condition khi ghi đồng thời

const SharedStorage = (() => {
  // Hàng đợi tuần tự hóa (Mutex Queue) theo từng khóa để tránh ghi đè mất dữ liệu
  const keyQueues = new Map();

  function enqueueKeyTask(key, taskFn) {
    const prev = keyQueues.get(key) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(() => taskFn());
    keyQueues.set(
      key,
      next.finally(() => {
        if (keyQueues.get(key) === next) {
          keyQueues.delete(key);
        }
      })
    );
    return next;
  }

  // Giá trị mặc định chuẩn cho toàn bộ Extension (Giữ nguyên các key cũ + Mở rộng key mới)
  const DEFAULTS = {
    // Các khóa hiện có (tương thích ngược)
    isInitialized: false,
    savedPosts: [],
    savedGroups: [],
    savedTimes: ['08:00', '12:00', '18:00', '21:00'],
    scheduledTimes: ['08:00', '12:00', '18:00', '21:00'],
    isScheduleActive: false,
    delaySec: 25,
    selectedPostIdx: 0,
    postingHistory: [],
    postingStatus: {
      isRunning: false,
      currentIndex: 0,
      totalGroups: 0,
      currentGroupName: '',
      statusText: 'Đang chờ lệnh...',
    },
    fbSpamWarningAlert: null,
    trialPostsCount: 0,

    // Các khóa mở rộng mới (v1.0.4 / v1.0.5)
    fbAccounts: [],
    activeAccountId: null,
    scheduleSlots: [],
    postingSettings: {
      minDelaySec: 25,
      maxDelaySec: 45,
      coffeeBreakEveryPosts: 4,
      coffeeBreakMinSec: 90,
      coffeeBreakMaxSec: 120,
      stopOnCheckpoint: true,
      stopOnActionBlock: true,
      maxPostsPerSession: 40,
      shuffleGroups: true,
      enableSpintax: true,
      autoSwitchVariant: true,
      autoJoinOnPost: true,
    },
    autoJoinOnPost: true,
    postDrafts: [],
    postTemplates: [
      {
        id: 'tpl_tuyendung_1',
        name: 'Mẫu Tuyển Dụng Phổ Thông',
        category: 'Tuyển dụng',
        content:
          '🔥 {THÔNG BÁO TUYỂN DỤNG|CẦN TUYỂN GẤP|CƠ HỘI VIỆC LÀM ĐI LÀM NGAY} 🔥\n' +
          '✅ Vị trí: Nhân viên thời vụ / chính thức\n' +
          '💰 Thu nhập: Hấp dẫn + Phụ cấp đầy đủ\n' +
          '📍 Khu vực làm việc: Trao đổi trực tiếp khi liên hệ\n' +
          '👉 Anh/chị quan tâm vui lòng {inbox trực tiếp|nhắn tin ngay|bình luận dưới bài viết} để nhận lịch phỏng vấn nhé!',
      },
      {
        id: 'tpl_tuyendung_2',
        name: 'Mẫu Tuyển Nhân Viên Kinh Doanh / Văn Phòng',
        category: 'Văn phòng',
        content:
          '🌟 {TUYỂN DỤNG NHÂN SỰ|MỞ RỘNG ĐỘI NGŨ|CHÀO ĐÓN ĐỒNG ĐỘI MỚI} 🌟\n' +
          '📌 Môi trường làm việc chuyên nghiệp, năng động, hỗ trợ đào tạo từ đầu.\n' +
          '💎 Quyền lợi: Lương cứng + Thưởng doanh số + Chế độ BHXH đầy đủ.\n' +
          '📩 Liên hệ ứng tuyển ngay qua SĐT/Zalo hoặc nhắn tin trực tiếp!',
      },
      {
        id: 'tpl_banhang_1',
        name: 'Mẫu Giới Thiệu Sản Phẩm / Dịch Vụ',
        category: 'Kinh doanh',
        content:
          '✨ {ƯU ĐÃI ĐẶC BIỆT HÔM NAY|GIẢI PHÁP TIẾT KIỆM CHI PHÍ|SẢN PHẨM CHẤT LƯỢNG CAO} ✨\n' +
          '✔️ Cam kết uy tín - Hỗ trợ tận tâm 24/7\n' +
          '✔️ Giao hàng nhanh chóng - Kiểm tra trước khi thanh toán\n' +
          '💬 Để lại {chấm (.)|bình luận|tin nhắn} để được tư vấn chi tiết ngay hôm nay!',
      },
    ],
    checkpointState: {
      isBlocked: false,
      reason: '',
      detectedAt: null,
      cooldownUntil: null,
      accountId: null,
    },
    _migrated_v1_4: false,
    _migrated_v1_5: false,
  };

  /**
   * Chuẩn hóa UID Facebook về chuỗi chỉ gồm chữ số (numeric UID).
   */
  function normalizeNumericUid(rawUid) {
    if (rawUid === null || rawUid === undefined) return '';
    const str = String(rawUid).trim();
    if (/^\d{4,25}$/.test(str)) return str;
    const m = str.match(/id=(\d{4,25})/) || str.match(/(?:^|\D)(\d{6,25})(?:\D|$)/);
    return m ? m[1] : '';
  }

  /**
   * Chuẩn hóa tên hiển thị để so khớp các bản ghi bị trùng do vanity username vs numeric UID.
   */
  function normalizeAccountNameKey(name) {
    if (!name || typeof name !== 'string') return '';
    return name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  /**
   * Khử trùng lặp danh sách tài khoản Facebook (fbAccounts) theo numeric UID (và gộp bản ghi vanity trùng tên),
   * giữ lại bản ghi mới nhất, bảo toàn note/avatar/rateLimitUntil, đồng thời ánh xạ lại activeAccountId
   * và scheduleSlots[].accountId để không làm gãy lịch hẹn.
   *
   * @param {Array} rawAccounts
   * @param {string|null} currentActiveAccountId
   * @param {Array} rawScheduleSlots
   * @returns {{ accounts: Array, activeAccountId: string|null, scheduleSlots: Array, idRemap: Object, changed: boolean }}
   */
  function dedupeAccounts(rawAccounts = [], currentActiveAccountId = null, rawScheduleSlots = []) {
    const list = Array.isArray(rawAccounts) ? rawAccounts.filter((a) => a && typeof a === 'object') : [];
    const slots = Array.isArray(rawScheduleSlots) ? rawScheduleSlots.map((s) => (s && typeof s === 'object' ? { ...s } : s)) : [];
    const idRemap = {};
    let changed = false;

    if (list.length === 0) {
      return {
        accounts: [],
        activeAccountId: null,
        scheduleSlots: slots,
        idRemap,
        changed: currentActiveAccountId !== null,
      };
    }

    // Sắp xếp bản ghi mới nhất lên trước (theo lastCheckAt -> createdAt)
    const sorted = [...list].sort((a, b) => {
      const tA = new Date(a.lastCheckAt || a.createdAt || 0).getTime() || 0;
      const tB = new Date(b.lastCheckAt || b.createdAt || 0).getTime() || 0;
      return tB - tA;
    });

    const byUid = new Map();
    const byName = new Map();
    const canonicalList = [];

    for (const item of sorted) {
      const numericUid = normalizeNumericUid(item.uid);
      const fallbackRawUid = String(item.uid || '').trim();
      const effectiveUid = numericUid || fallbackRawUid;
      if (!effectiveUid) {
        changed = true;
        continue;
      }
      if (effectiveUid !== item.uid) {
        changed = true;
      }

      const canonicalId = numericUid ? `acc_${numericUid}` : (item.id || `acc_${effectiveUid}`);
      if (item.id && item.id !== canonicalId) {
        idRemap[item.id] = canonicalId;
        changed = true;
      }

      const nameKey = normalizeAccountNameKey(item.name);
      const isGenericName = !nameKey || nameKey === 'tài khoản facebook' || nameKey.startsWith('fb user');

      // Kiểm tra xem đã có bản ghi trùng UID hoặc trùng tên (khi 1 bản ghi là numeric UID và 1 bản ghi là vanity UID)
      let existing = byUid.get(effectiveUid);
      if (!existing && !isGenericName && byName.has(nameKey)) {
        const candidateByName = byName.get(nameKey);
        const candNumeric = normalizeNumericUid(candidateByName.uid);
        // Chỉ gộp theo tên nếu ít nhất 1 trong 2 chưa có numeric UID chuẩn hoặc cùng numeric UID
        if (!numericUid || !candNumeric || numericUid === candNumeric) {
          existing = candidateByName;
        }
      }

      if (existing) {
        changed = true;
        if (item.id) {
          idRemap[item.id] = existing.id;
        }
        // Nếu bản ghi cũ chưa có numeric UID mà bản ghi đang xét có numeric UID -> nâng cấp existing sang numeric UID
        const existingNumeric = normalizeNumericUid(existing.uid);
        if (!existingNumeric && numericUid) {
          const oldId = existing.id;
          existing.uid = numericUid;
          existing.id = `acc_${numericUid}`;
          idRemap[oldId] = existing.id;
          byUid.set(numericUid, existing);
        }
        // Gộp thông tin phụ (giữ tên đẹp hơn, avatar, note, rateLimitUntil lớn hơn)
        if ((!existing.name || existing.name === 'Tài khoản Facebook' || existing.name.startsWith('FB User')) && item.name) {
          existing.name = String(item.name).trim();
        }
        if (!existing.avatar && item.avatar) {
          existing.avatar = item.avatar;
        }
        if (!existing.note && item.note) {
          existing.note = item.note;
        }
        if ((item.rateLimitUntil || 0) > (existing.rateLimitUntil || 0)) {
          existing.rateLimitUntil = item.rateLimitUntil;
        }
        continue;
      }

      const normalizedRecord = {
        id: canonicalId,
        uid: effectiveUid,
        name: String(item.name || `FB User ${effectiveUid}`).trim(),
        avatar: item.avatar || '',
        cookieHint: item.cookieHint || `c_user=${effectiveUid}`,
        status: item.status || 'valid',
        lastCheckAt: item.lastCheckAt || new Date().toISOString(),
        note: item.note || '',
        rateLimitUntil: item.rateLimitUntil || null,
        createdAt: item.createdAt || new Date().toISOString(),
      };

      canonicalList.push(normalizedRecord);
      byUid.set(effectiveUid, normalizedRecord);
      if (!isGenericName) {
        byName.set(nameKey, normalizedRecord);
      }
    }

    // Ánh xạ lại activeAccountId
    let nextActiveId = currentActiveAccountId || null;
    if (nextActiveId && idRemap[nextActiveId]) {
      nextActiveId = idRemap[nextActiveId];
      changed = true;
    }
    if (!nextActiveId || !canonicalList.some((a) => a.id === nextActiveId)) {
      const fallbackId = canonicalList[0]?.id || null;
      if (nextActiveId !== fallbackId) {
        nextActiveId = fallbackId;
        changed = true;
      }
    }

    // Ánh xạ lại scheduleSlots[].accountId và accountUid (giữ nguyên 'active'/'default')
    const accountById = new Map(canonicalList.map((a) => [a.id, a]));
    const nextSlots = slots.map((slot) => {
      if (!slot || typeof slot !== 'object') return slot;
      if (!slot.accountId || slot.accountId === 'active' || slot.accountId === 'default') {
        return slot;
      }
      if (idRemap[slot.accountId]) {
        const mappedId = idRemap[slot.accountId];
        const targetAcc = accountById.get(mappedId);
        changed = true;
        return {
          ...slot,
          accountId: mappedId,
          accountUid: targetAcc?.uid || slot.accountUid || '',
          accountName: targetAcc?.name || slot.accountName || '',
        };
      }
      const exactAcc = accountById.get(slot.accountId);
      if (exactAcc) {
        if (slot.accountUid !== exactAcc.uid) {
          changed = true;
          return {
            ...slot,
            accountUid: exactAcc.uid,
            accountName: exactAcc.name || slot.accountName || '',
          };
        }
        return slot;
      }
      const fallbackAcc = accountById.get(nextActiveId);
      changed = true;
      return {
        ...slot,
        accountId: nextActiveId || 'active',
        accountUid: fallbackAcc?.uid || '',
        accountName: fallbackAcc?.name || slot.accountName || 'Tài khoản đang chọn',
      };
    });

    return {
      accounts: canonicalList,
      activeAccountId: nextActiveId,
      scheduleSlots: nextSlots,
      idRemap,
      changed,
    };
  }

  /**
   * Đọc dữ liệu từ chrome.storage.local kèm giá trị mặc định
   * @param {string|string[]|Object|null} keys
   */
  async function get(keys = null) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return {};
    }
    if (keys === null) {
      const all = await chrome.storage.local.get(null);
      return { ...DEFAULTS, ...all };
    }
    if (typeof keys === 'string') {
      const res = await chrome.storage.local.get([keys]);
      return res[keys] !== undefined ? res[keys] : DEFAULTS[keys];
    }
    if (Array.isArray(keys)) {
      const res = await chrome.storage.local.get(keys);
      const merged = {};
      for (const k of keys) {
        merged[k] = res[k] !== undefined ? res[k] : DEFAULTS[k];
      }
      return merged;
    }
    return chrome.storage.local.get(keys);
  }

  /**
   * Ghi dữ liệu vào chrome.storage.local
   * @param {Object} obj
   */
  async function set(obj) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }
    await chrome.storage.local.set(obj);
  }

  /**
   * Cập nhật nguyên tử (Atomic Read-Modify-Write) trên 1 key cụ thể với khóa Mutex
   * @param {string} key
   * @param {(currentVal: any) => any} updaterFn
   */
  function patch(key, updaterFn) {
    return enqueueKeyTask(key, async () => {
      const currentVal = await get(key);
      const nextVal = await updaterFn(
        currentVal !== undefined ? structuredCloneSafe(currentVal) : structuredCloneSafe(DEFAULTS[key])
      );
      await set({ [key]: nextVal });
      return nextVal;
    });
  }

  function structuredCloneSafe(val) {
    if (val === undefined || val === null) return val;
    try {
      return JSON.parse(JSON.stringify(val));
    } catch (_) {
      return val;
    }
  }

  /**
   * Chuẩn hóa danh sách bài viết để đảm bảo mọi bài đều có id, variants, groupIds, groupCategory
   */
  function normalizePosts(posts) {
    if (!Array.isArray(posts)) return [];
    return posts.map((p, idx) => {
      const baseContent = typeof p?.content === 'string' ? p.content : '';
      const v2 = typeof p?.contentVariant2 === 'string' ? p.contentVariant2 : '';
      const v3 = typeof p?.contentVariant3 === 'string' ? p.contentVariant3 : '';
      return {
        ...p,
        id: p?.id || `post_${idx + 1}`,
        title: p?.title || `Bài Tuyển Dụng ${idx + 1}`,
        content: baseContent,
        contentVariant2: v2,
        contentVariant3: v3,
        variants: Array.isArray(p?.variants) && p.variants.length === 3 ? p.variants : [baseContent, v2, v3],
        images: Array.isArray(p?.images) ? p.images.slice(0, 3) : [],
        groupIds: Array.isArray(p?.groupIds) ? p.groupIds : [],
        groupCategory: p?.groupCategory || 'all',
        updatedAt: p?.updatedAt || new Date().toISOString(),
      };
    });
  }

  /**
   * Chuẩn hóa danh sách nhóm để đảm bảo mọi nhóm đều có id, category, joinedStatus
   */
  function normalizeGroups(groups) {
    if (!Array.isArray(groups)) return [];
    const seen = new Set();
    const result = [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (!g || !g.link) continue;
      const cleanLink = String(g.link).trim();
      const key = cleanLink.toLowerCase().replace(/\/+$/, '');
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({
        ...g,
        id: g.id || `grp_${i + 1}_${Math.random().toString(36).slice(2, 6)}`,
        name: g.name || 'Nhóm Facebook',
        link: cleanLink,
        category: g.category || 'Chung',
        enabled: g.enabled !== undefined ? Boolean(g.enabled) : true,
        joined: g.joined !== undefined ? Boolean(g.joined) : true,
      });
    }
    return result;
  }

  /**
   * Đồng bộ 2 chiều giữa scheduledTimes (mảng chuỗi 'HH:mm' cũ) và scheduleSlots (mảng đối tượng chi tiết mới)
   */
  function normalizeScheduleSlots(scheduleSlots, scheduledTimes, savedPosts = [], activeAccountId = null) {
    const firstPostId = savedPosts[0]?.id || '0';
    if (Array.isArray(scheduleSlots) && scheduleSlots.length > 0) {
      return scheduleSlots
        .filter((s) => s && typeof s.time === 'string' && /^\d{2}:\d{2}$/.test(s.time.trim()))
        .map((s, idx) => ({
          id: s.id || `slot_${s.time.replace(':', '')}_${idx}`,
          time: s.time.trim(),
          enabled: s.enabled !== undefined ? Boolean(s.enabled) : true,
          postId: s.postId !== undefined ? String(s.postId) : firstPostId,
          postIdx: typeof s.postIdx === 'number' ? s.postIdx : 0,
          accountId: s.accountId || activeAccountId || null,
          daysOfWeek: Array.isArray(s.daysOfWeek) ? s.daysOfWeek : [0, 1, 2, 3, 4, 5, 6],
          groupCategory: s.groupCategory || 'all',
          lastTriggeredDate: s.lastTriggeredDate || null,
        }));
    }

    // Di trú từ scheduledTimes cũ sang scheduleSlots mới
    const times = Array.isArray(scheduledTimes) && scheduledTimes.length > 0
      ? scheduledTimes
      : DEFAULTS.scheduledTimes;

    return times
      .filter((t) => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t.trim()))
      .map((t, idx) => ({
        id: `slot_${t.trim().replace(':', '')}_${idx}`,
        time: t.trim(),
        enabled: true,
        postId: firstPostId,
        postIdx: 0,
        accountId: activeAccountId || null,
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        groupCategory: 'all',
        lastTriggeredDate: null,
      }));
  }

  /**
   * Chạy di trú dữ liệu an toàn khi khởi động Service Worker hoặc Dashboard
   * Không bao giờ xóa dữ liệu cũ của người dùng
   */
  async function runStorageMigrations() {
    try {
      const raw = await get(null);
      const updates = {};

      // 1. Chuẩn hóa danh sách bài viết
      const normPosts = normalizePosts(raw.savedPosts || []);
      if (!raw._migrated_v1_4 && normPosts.length > 0) {
        updates.savedPosts = normPosts;
      }

      // 2. Chuẩn hóa danh sách nhóm
      const normGroups = normalizeGroups(raw.savedGroups || []);
      if (!raw._migrated_v1_4 && normGroups.length > 0) {
        updates.savedGroups = normGroups;
      }

      // 3. Khử trùng lặp tài khoản Facebook và ánh xạ lại activeAccountId + scheduleSlots
      const baseSlots = normalizeScheduleSlots(
        raw.scheduleSlots,
        raw.scheduledTimes || raw.savedTimes,
        normPosts,
        raw.activeAccountId
      );
      const deduped = dedupeAccounts(raw.fbAccounts || [], raw.activeAccountId || null, baseSlots);
      if (deduped.changed || !raw._migrated_v1_5) {
        updates.fbAccounts = deduped.accounts;
        updates.activeAccountId = deduped.activeAccountId;
        updates.scheduleSlots = deduped.scheduleSlots;
      } else if (!Array.isArray(raw.scheduleSlots) || raw.scheduleSlots.length === 0) {
        updates.scheduleSlots = baseSlots;
      }

      // 4. Đảm bảo postingSettings có đủ trường mặc định
      const currentSettings = raw.postingSettings || {};
      const delaySec = Number(raw.delaySec) || 25;
      updates.postingSettings = {
        ...DEFAULTS.postingSettings,
        ...currentSettings,
        minDelaySec: currentSettings.minDelaySec || delaySec,
      };

      // 5. Đảm bảo postTemplates có sẵn nếu chưa có
      if (!Array.isArray(raw.postTemplates) || raw.postTemplates.length === 0) {
        updates.postTemplates = DEFAULTS.postTemplates;
      }

      // 6. Khởi tạo số thứ tự licenseSeq nếu chưa có
      if (typeof raw.licenseSeq !== 'number') {
        updates.licenseSeq = 1;
      }

      // 7. Làm sạch licenseKey nếu bản cũ từng lưu nhầm signedToken hoặc 'GLFB-VIP-ACTIVE' vào licenseKey
      if (
        typeof raw.licenseKey === 'string' &&
        (raw.licenseKey === 'GLFB-VIP-ACTIVE' ||
          raw.licenseKey.startsWith('GLFB_ED1_') ||
          raw.licenseKey.startsWith('GLFB_ED25519_') ||
          raw.licenseKey.startsWith('GLFB_SIG_'))
      ) {
        if (!raw.signedToken && raw.licenseKey !== 'GLFB-VIP-ACTIVE') {
          updates.signedToken = raw.licenseKey;
        }
        updates.licenseKey = '';
      }

      if (!raw._migrated_v1_4 || !raw._migrated_v1_5 || Object.keys(updates).length > 0) {
        updates._migrated_v1_4 = true;
        updates._migrated_v1_5 = true;
        await set(updates);
      }

      return { ...raw, ...updates };
    } catch (err) {
      console.warn('[SharedStorage] Lỗi khi chạy migration:', err);
      return {};
    }
  }

  /**
   * Xuất toàn bộ cấu hình ra đối tượng JSON sạch để sao lưu
   */
  async function exportAllBackup() {
    const data = await get([
      'savedPosts',
      'savedGroups',
      'scheduledTimes',
      'scheduleSlots',
      'isScheduleActive',
      'delaySec',
      'postingSettings',
      'fbAccounts',
      'activeAccountId',
      'postTemplates',
      'postDrafts',
    ]);
    return {
      app: 'Gia Long - FB Auto Poster',
      version: '1.0.5',
      exportedAt: new Date().toISOString(),
      data,
    };
  }

  /**
   * Nhập cấu hình từ file backup JSON (hỗ trợ cả định dạng cũ và mới)
   */
  async function importAllBackup(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Dữ liệu file sao lưu không hợp lệ!');
    }
    const src = payload.data && typeof payload.data === 'object' ? payload.data : payload;
    const updates = { isInitialized: true };

    if (Array.isArray(src.savedPosts || src.posts)) {
      updates.savedPosts = normalizePosts(src.savedPosts || src.posts);
    }
    if (Array.isArray(src.savedGroups || src.groups)) {
      updates.savedGroups = normalizeGroups(src.savedGroups || src.groups);
    }
    if (Array.isArray(src.scheduledTimes || src.savedTimes)) {
      const times = (src.scheduledTimes || src.savedTimes).filter(
        (t) => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t.trim())
      );
      updates.scheduledTimes = times;
      updates.savedTimes = times;
    }

    const rawAccounts = Array.isArray(src.fbAccounts) ? src.fbAccounts : [];
    const rawSlots = Array.isArray(src.scheduleSlots)
      ? normalizeScheduleSlots(src.scheduleSlots, updates.scheduledTimes, updates.savedPosts)
      : updates.scheduledTimes
        ? normalizeScheduleSlots([], updates.scheduledTimes, updates.savedPosts)
        : [];

    if (rawAccounts.length > 0 || rawSlots.length > 0) {
      const deduped = dedupeAccounts(rawAccounts, src.activeAccountId || null, rawSlots);
      if (rawAccounts.length > 0) {
        updates.fbAccounts = deduped.accounts;
        updates.activeAccountId = deduped.activeAccountId;
      }
      if (rawSlots.length > 0) {
        updates.scheduleSlots = deduped.scheduleSlots;
      }
    }

    if (src.postingSettings && typeof src.postingSettings === 'object') {
      updates.postingSettings = { ...DEFAULTS.postingSettings, ...src.postingSettings };
    }
    if (typeof src.delaySec === 'number') {
      updates.delaySec = Math.max(10, src.delaySec);
    }
    if (Array.isArray(src.postTemplates)) {
      updates.postTemplates = src.postTemplates;
    }

    await set(updates);
    return updates;
  }

  return {
    DEFAULTS,
    get,
    set,
    patch,
    enqueueKeyTask,
    normalizeNumericUid,
    normalizeAccountNameKey,
    dedupeAccounts,
    normalizePosts,
    normalizeGroups,
    normalizeScheduleSlots,
    runStorageMigrations,
    exportAllBackup,
    importAllBackup,
  };
})();

if (typeof self !== 'undefined') {
  self.SharedStorage = SharedStorage;
}
if (typeof window !== 'undefined') {
  window.SharedStorage = SharedStorage;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SharedStorage };
}
