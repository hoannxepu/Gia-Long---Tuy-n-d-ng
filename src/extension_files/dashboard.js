// dashboard.js - Bảng Điều Khiển Nâng Cấp V1.5
// Hỗ trợ: Hẹn giờ chuẩn Alarms, Chọn/bỏ chọn tất cả nhóm, Xóa nhiều nhóm, Dò tìm nhóm, Lịch sử đăng bài

let posts = [];
let groups = [];
let scheduledTimes = ['08:30', '11:30', '17:30', '20:00'];
let scheduleSlots = [];
let selectedPostIdx = 0;
let currentVariantTab = 1;
let autoSaveTimer = null;
let scannedGroupsTemp = [];

// Quản lý Device ID tập trung và cập nhật DOM ngay lập tức (0ms)
let cachedDeviceId = '';

function generateHardwareFingerprint() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'dev_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function updateDeviceDomElements(id) {
  if (!id || id === 'Đang lấy...' || String(id).trim() === '') return;
  cachedDeviceId = String(id).trim();
  const elements = [
    document.getElementById('licCurrentDeviceId'),
    document.getElementById('modalDeviceId'),
    document.getElementById('modalActiveDeviceId'),
    document.getElementById('trialDeviceIdNotice'),
    document.getElementById('successDeviceId')
  ];
  elements.forEach((el) => {
    if (el) {
      el.innerText = cachedDeviceId;
      if ('value' in el) el.value = cachedDeviceId;
    }
  });
}

function getOrInitDeviceId() {
  if (cachedDeviceId && cachedDeviceId !== 'Đang lấy...' && cachedDeviceId.trim() !== '') {
    return cachedDeviceId;
  }

  // 1. Kiểm tra localStorage (tức thì 0ms đồng bộ)
  try {
    const localId = localStorage.getItem('autorecruit_device_id');
    if (localId && localId !== 'Đang lấy...' && !localId.includes('đang lấy') && localId.trim() !== '') {
      updateDeviceDomElements(localId);
      return localId;
    }
  } catch (e) {}

  // 2. Sinh mã máy cố định phần cứng chuẩn xác duy nhất ngay lập tức (0ms)
  const genId = generateHardwareFingerprint();
  updateDeviceDomElements(genId);
  try { localStorage.setItem('autorecruit_device_id', genId); } catch (e) {}

  // Đồng bộ với chrome.storage.local & sync
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['autorecruit_device_id'], (stored) => {
        if (stored && stored.autorecruit_device_id && stored.autorecruit_device_id !== 'Đang lấy...' && !stored.autorecruit_device_id.includes('đang lấy')) {
          updateDeviceDomElements(stored.autorecruit_device_id);
          try { localStorage.setItem('autorecruit_device_id', stored.autorecruit_device_id); } catch (e) {}
        } else {
          chrome.storage.local.set({ autorecruit_device_id: genId });
          if (chrome.storage.sync) chrome.storage.sync.set({ autorecruit_device_id: genId });
        }
      });
    }
  } catch (e) {}

  return genId;
}

// Khởi tạo mã máy ngay tức khắc khi script nạp để DOM nhận diện ngay
getOrInitDeviceId();

document.addEventListener('DOMContentLoaded', () => {
  // Gán lại mã máy cho DOM ngay khi cấu trúc HTML sẵn sàng
  getOrInitDeviceId();

  // Navigation Tabs
  const tabNavMain = document.getElementById('tabNavMain');
  const tabNavFinder = document.getElementById('tabNavFinder');
  const tabNavAccounts = document.getElementById('tabNavAccounts');
  const tabNavHistory = document.getElementById('tabNavHistory');
  const tabNavLicense = document.getElementById('tabNavLicense');
  const viewMain = document.getElementById('viewMain');
  const viewFinder = document.getElementById('viewFinder');
  const viewAccounts = document.getElementById('viewAccounts');
  const viewHistory = document.getElementById('viewHistory');
  const viewLicense = document.getElementById('viewLicense');

  function switchTab(target) {
    [tabNavMain, tabNavFinder, tabNavAccounts, tabNavHistory, tabNavLicense].forEach((b) => b?.classList.remove('active'));
    [viewMain, viewFinder, viewAccounts, viewHistory, viewLicense].forEach((v) => { if (v) v.style.display = 'none'; });

    if (target === 'main') {
      tabNavMain?.classList.add('active');
      if (viewMain) viewMain.style.display = 'grid';
    } else if (target === 'finder') {
      tabNavFinder?.classList.add('active');
      if (viewFinder) viewFinder.style.display = 'flex';
    } else if (target === 'accounts') {
      tabNavAccounts?.classList.add('active');
      if (viewAccounts) viewAccounts.style.display = 'block';
      renderAccountsList();
    } else if (target === 'history') {
      tabNavHistory?.classList.add('active');
      if (viewHistory) viewHistory.style.display = 'flex';
      renderHistory();
    } else if (target === 'license') {
      tabNavLicense?.classList.add('active');
      if (viewLicense) viewLicense.style.display = 'flex';
      loadLicenseDetails();
    }
  }

  tabNavMain?.addEventListener('click', () => switchTab('main'));
  tabNavFinder?.addEventListener('click', () => switchTab('finder'));
  tabNavAccounts?.addEventListener('click', () => switchTab('accounts'));
  tabNavHistory?.addEventListener('click', () => switchTab('history'));
  tabNavLicense?.addEventListener('click', () => switchTab('license'));

  // Elements Cột 1
  const postSelect = document.getElementById('postSelect');
  const btnNewPost = document.getElementById('btnNewPost');
  const btnSavePost = document.getElementById('btnSavePost');
  const btnDeletePost = document.getElementById('btnDeletePost');
  const postTitle = document.getElementById('postTitle');
  const postContent = document.getElementById('postContent');
  const btnSpintax = document.getElementById('btnSpintax');
  const btnPickFile = document.getElementById('btnPickFile');
  const filePicker = document.getElementById('filePicker');
  const btnClearDashImages = document.getElementById('btnClearDashImages');
  const postImageUrl = document.getElementById('postImageUrl');
  const btnAddDashImageUrl = document.getElementById('btnAddDashImageUrl');
  const dashImageBadge = document.getElementById('dashImageBadge');
  const previewText = document.getElementById('previewText');
  const btnRandomPreview = document.getElementById('btnRandomPreview');

  // Elements Cột 2 (Quản lý nhóm)
  const groupTotalBadge = document.getElementById('groupTotalBadge');
  const groupList = document.getElementById('groupList');
  const btnSelectAllGroups = document.getElementById('btnSelectAllGroups');
  const btnDeselectAllGroups = document.getElementById('btnDeselectAllGroups');
  const btnInvertSelectGroups = document.getElementById('btnInvertSelectGroups');
  const btnExportGroupsExcel = document.getElementById('btnExportGroupsExcel');
  const btnExportGroupsTxt = document.getElementById('btnExportGroupsTxt');
  const btnDeleteSelectedGroups = document.getElementById('btnDeleteSelectedGroups');
  const btnShuffleDashboardGroups = document.getElementById('btnShuffleDashboardGroups');
  const newGroupName = document.getElementById('newGroupName');
  const newGroupLink = document.getElementById('newGroupLink');
  const btnAddGroup = document.getElementById('btnAddGroup');
  const bulkLinksInput = document.getElementById('bulkLinksInput');
  const btnSaveBulkLinks = document.getElementById('btnSaveBulkLinks');

  // Elements Cột 1 (3 Biến thể)
  const btnVariant1 = document.getElementById('btnVariant1');
  const btnVariant2 = document.getElementById('btnVariant2');
  const btnVariant3 = document.getElementById('btnVariant3');

  // Elements Cột 3 (Hẹn giờ & Tài khoản theo khung)
  const delayInput = document.getElementById('delayInput');
  const dashAutoJoinOnPostToggle = document.getElementById('dashAutoJoinOnPostToggle');
  const timeTagsContainer = document.getElementById('timeTagsContainer');
  const timeInput = document.getElementById('timeInput');
  const btnAddTime = document.getElementById('btnAddTime');
  const btnGoldenHours = document.getElementById('btnGoldenHours');
  const schedAccountSelect = document.getElementById('schedAccountSelect');
  const schedPostSelect = document.getElementById('schedPostSelect');
  const schedAutoSwitchToggle = document.getElementById('schedAutoSwitchToggle');
  const scheduleToggle = document.getElementById('scheduleToggle');
  const btnStartRun = document.getElementById('btnStartRun');
  const btnStopRun = document.getElementById('btnStopRun');
  const progressArea = document.getElementById('progressArea');
  const statusLabel = document.getElementById('statusLabel');
  const progressBar = document.getElementById('progressBar');
  const toast = document.getElementById('toast');

  // Elements View Finder (Dò tìm nhóm)
  const finderKeyword = document.getElementById('finderKeyword');
  const finderMinMembers = document.getElementById('finderMinMembers');
  const finderAutoJoin = document.getElementById('finderAutoJoin');
  const btnStartFindGroups = document.getElementById('btnStartFindGroups');
  const finderResultTitle = document.getElementById('finderResultTitle');
  const btnAddFinderToPostingList = document.getElementById('btnAddFinderToPostingList');
  const btnJoinAndAddFinderGroups = document.getElementById('btnJoinAndAddFinderGroups');
  const btnExportFinderGroups = document.getElementById('btnExportFinderGroups');
  const finderTableBody = document.getElementById('finderTableBody');
  const finderCheckAll = document.getElementById('finderCheckAll');

  // Elements View History (Lịch sử)
  const historyTableBody = document.getElementById('historyTableBody');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const btnExportHistory = document.getElementById('btnExportHistory');
  const btnExportHistoryCsv = document.getElementById('btnExportHistoryCsv');
  const historyFilterAccount = document.getElementById('historyFilterAccount');
  const historyFilterStatus = document.getElementById('historyFilterStatus');
  const historyFilterType = document.getElementById('historyFilterType');
  const historySearchInput = document.getElementById('historySearchInput');
  const historyStatsSummary = document.getElementById('historyStatsSummary');

  function showToast(msg) {
    if (!toast) return;
    toast.innerText = msg;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2600);
  }

  // HÀM LƯU TỨC THÌ VÀO STORAGE DÙNG SHARED STORAGE VỚI HÀNG ĐỢI TUẦN TỰ
  function triggerAutoSave(immediate = false) {
    clearTimeout(autoSaveTimer);
    const saveFn = async () => {
      if (posts[selectedPostIdx]) {
        posts[selectedPostIdx].title = postTitle ? postTitle.value.trim() : 'Bài Tuyển Dụng';
        if (currentVariantTab === 1) {
          posts[selectedPostIdx].content = postContent ? postContent.value : '';
        } else if (currentVariantTab === 2) {
          posts[selectedPostIdx].contentVariant2 = postContent ? postContent.value : '';
        } else if (currentVariantTab === 3) {
          posts[selectedPostIdx].contentVariant3 = postContent ? postContent.value : '';
        }
      }

      if (typeof SharedStorage !== 'undefined' && SharedStorage.normalizeScheduleSlots) {
        scheduleSlots = SharedStorage.normalizeScheduleSlots(scheduleSlots, scheduledTimes);
        scheduledTimes = scheduleSlots.map((s) => s.time);
      }

      const autoJoinVal = dashAutoJoinOnPostToggle ? dashAutoJoinOnPostToggle.checked : true;

      if (typeof SharedStorage !== 'undefined' && SharedStorage.patch) {
        await SharedStorage.patch('savedPosts', () => posts);
        await SharedStorage.patch('savedGroups', () => groups);
        await SharedStorage.patch('savedTimes', () => scheduledTimes);
        await SharedStorage.patch('scheduleSlots', () => scheduleSlots);
        await SharedStorage.patch('postingSettings', (old) => ({
          ...(old || {}),
          autoJoinOnPost: autoJoinVal,
        }));
      } else {
        chrome.storage.local.set({
          savedPosts: posts,
          savedGroups: groups,
          savedTimes: scheduledTimes,
          scheduleSlots: scheduleSlots,
        });
      }
      chrome.storage.local.set({
        isInitialized: true,
        selectedPostIdx: selectedPostIdx,
        delaySec: delayInput ? (parseInt(delayInput.value, 10) || 30) : 30,
        isScheduleActive: scheduleToggle ? scheduleToggle.checked : false,
        scheduledTimes: scheduledTimes,
        autoJoinOnPost: autoJoinVal,
      });
    };

    if (immediate) {
      saveFn();
    } else {
      autoSaveTimer = setTimeout(saveFn, 300);
    }
  }

  async function renderScheduleDropdowns() {
    if (schedPostSelect) {
      const prevPostVal = schedPostSelect.value || 'selected';
      schedPostSelect.textContent = '';
      const defOpt = document.createElement('option');
      defOpt.value = 'selected';
      defOpt.textContent = '📝 Bài viết đang chọn';
      schedPostSelect.appendChild(defOpt);

      posts.forEach((p, idx) => {
        const opt = document.createElement('option');
        opt.value = p.id || String(idx);
        opt.textContent = `Bài ${idx + 1}: ${p.title || 'Bài Tuyển Dụng'}`;
        schedPostSelect.appendChild(opt);
      });
      schedPostSelect.value = Array.from(schedPostSelect.options).some((o) => o.value === prevPostVal)
        ? prevPostVal
        : 'selected';
    }

    if (schedAccountSelect) {
      const prevAccVal = schedAccountSelect.value || 'active';
      schedAccountSelect.textContent = '';
      const defAccOpt = document.createElement('option');
      defAccOpt.value = 'active';
      defAccOpt.textContent = '🔄 Tài khoản đang chọn';
      schedAccountSelect.appendChild(defAccOpt);

      const st = await chrome.storage.local.get(['fbAccounts']);
      const fbAccounts = Array.isArray(st.fbAccounts) ? st.fbAccounts : [];
      fbAccounts.forEach((acc) => {
        const opt = document.createElement('option');
        opt.value = acc.id;
        opt.textContent = `👤 ${acc.name || 'Facebook'} (${acc.uid || acc.id})`;
        opt.setAttribute('data-acc-name', acc.name || 'Facebook');
        schedAccountSelect.appendChild(opt);
      });
      schedAccountSelect.value = Array.from(schedAccountSelect.options).some((o) => o.value === prevAccVal)
        ? prevAccVal
        : 'active';
    }
  }

  // Tải dữ liệu từ Storage: Nếu đã khởi tạo thì đọc 100% từ storage
  chrome.storage.local.get(
    [
      'isInitialized',
      'savedPosts',
      'savedGroups',
      'savedTimes',
      'scheduledTimes',
      'scheduleSlots',
      'selectedPostIdx',
      'isScheduleActive',
      'delaySec',
      'autoJoinOnPost',
      'postingSettings',
    ],
    async (res) => {
      if (res.isInitialized) {
        posts = Array.isArray(res.savedPosts) ? res.savedPosts : [];
        groups = Array.isArray(res.savedGroups) ? res.savedGroups : [];
        const times = res.savedTimes || res.scheduledTimes || ['08:30', '11:30', '17:30', '20:00'];
        scheduledTimes = times;
        if (typeof SharedStorage !== 'undefined' && SharedStorage.normalizeScheduleSlots) {
          scheduleSlots = SharedStorage.normalizeScheduleSlots(res.scheduleSlots, times);
        } else {
          scheduleSlots = Array.isArray(res.scheduleSlots) ? res.scheduleSlots : [];
        }
        if (res.isScheduleActive !== undefined && scheduleToggle) {
          scheduleToggle.checked = res.isScheduleActive;
          chrome.runtime.sendMessage({ action: 'CHECK_LICENSE' }, (licRes) => {
            if (!licRes || !licRes.isValid) {
              if (scheduleToggle) scheduleToggle.checked = false;
              chrome.runtime.sendMessage({ action: 'CANCEL_SCHEDULE' });
              updateScheduleStatus();
            }
          });
        }
        if (res.delaySec !== undefined && delayInput) delayInput.value = res.delaySec;
        const autoJoinSetting = res.autoJoinOnPost !== undefined
          ? res.autoJoinOnPost
          : (res.postingSettings?.autoJoinOnPost !== false);
        if (dashAutoJoinOnPostToggle) dashAutoJoinOnPostToggle.checked = autoJoinSetting !== false;
        if (res.selectedPostIdx !== undefined && res.selectedPostIdx < posts.length) {
          selectedPostIdx = res.selectedPostIdx;
        }
      } else {
        try {
          const preloaded = await fetch(chrome.runtime.getURL('preloaded_data.json')).then((r) => r.json()).catch(() => null);
          if (preloaded) {
            if (preloaded.posts?.length) posts = preloaded.posts;
            if (preloaded.groups?.length) groups = preloaded.groups;
            if (preloaded.settings?.scheduledTimes) scheduledTimes = preloaded.settings.scheduledTimes;
          }
        } catch (e) {}
        if (typeof SharedStorage !== 'undefined' && SharedStorage.normalizeScheduleSlots) {
          scheduleSlots = SharedStorage.normalizeScheduleSlots([], scheduledTimes);
        }
        triggerAutoSave(true);
      }

      renderPostDropdown();
      await renderScheduleDropdowns();
      loadPost(selectedPostIdx, false);
      renderGroupList();
      renderTimes();
    }
  );

  // Lắng nghe thay đổi từ storage để tự động đồng bộ giao diện
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.savedGroups && !document.activeElement?.closest('#groupList')) {
      groups = changes.savedGroups.newValue || [];
      renderGroupList();
    }
    if (changes.savedPosts && !document.activeElement?.closest('#postContent')) {
      posts = changes.savedPosts.newValue || [];
      renderPostDropdown();
      renderScheduleDropdowns();
      loadPost(selectedPostIdx, false);
    }
    if (changes.fbAccounts || changes.activeAccountId) {
      renderScheduleDropdowns();
      renderAccountsList();
    }
    if (changes.scheduleSlots) {
      scheduleSlots = changes.scheduleSlots.newValue || [];
      scheduledTimes = scheduleSlots.map((s) => s.time);
      renderTimes();
    }
    if (changes.postingStatus) {
      const st = changes.postingStatus.newValue;
      if (st && statusLabel) {
        statusLabel.textContent = st.statusText || '';
      }
    }
  });

  window.addEventListener('beforeunload', () => triggerAutoSave(true));
  delayInput?.addEventListener('input', () => triggerAutoSave());
  dashAutoJoinOnPostToggle?.addEventListener('change', () => triggerAutoSave(true));

  // Chuyển đổi giữa 3 biến thể nội dung bài viết
  function switchVariantTab(tabNum) {
    if (posts[selectedPostIdx] && postContent) {
      if (currentVariantTab === 1) posts[selectedPostIdx].content = postContent.value;
      else if (currentVariantTab === 2) posts[selectedPostIdx].contentVariant2 = postContent.value;
      else if (currentVariantTab === 3) posts[selectedPostIdx].contentVariant3 = postContent.value;
    }
    currentVariantTab = tabNum;
    [btnVariant1, btnVariant2, btnVariant3].forEach((btn, idx) => {
      if (!btn) return;
      btn.className = (idx + 1 === tabNum) ? 'btn btn-primary' : 'btn btn-sub';
    });
    const p = posts[selectedPostIdx];
    if (p && postContent) {
      if (tabNum === 1) postContent.value = p.content || '';
      else if (tabNum === 2) postContent.value = p.contentVariant2 || '';
      else if (tabNum === 3) postContent.value = p.contentVariant3 || '';
    }
    updatePreview();
  }

  btnVariant1?.addEventListener('click', () => switchVariantTab(1));
  btnVariant2?.addEventListener('click', () => switchVariantTab(2));
  btnVariant3?.addEventListener('click', () => switchVariantTab(3));

  // 1. Quản lý bài viết
  function renderPostDropdown() {
    if (!postSelect) return;
    postSelect.innerHTML = '';
    posts.forEach((p, idx) => {
      const opt = document.createElement('option');
      opt.value = idx.toString();
      opt.innerText = `Bài ${idx + 1}: ${p.title || 'Bài Tuyển Dụng'}`;
      if (idx === selectedPostIdx) opt.selected = true;
      postSelect.appendChild(opt);
    });
  }

  function loadPost(idx, shouldSave = true) {
    if (!posts[idx]) return;
    selectedPostIdx = idx;
    const p = posts[idx];
    if (postTitle) postTitle.value = p.title || '';
    currentVariantTab = 1;
    [btnVariant1, btnVariant2, btnVariant3].forEach((btn, bIdx) => {
      if (btn) btn.className = bIdx === 0 ? 'btn btn-primary' : 'btn btn-sub';
    });
    if (postContent) {
      postContent.value = p.content || '';
    }
    renderDashImageSlots();
    updatePreview();
    if (shouldSave) triggerAutoSave();
  }

  function renderDashImageSlots() {
    const post = posts[selectedPostIdx];
    const imgs = (post && Array.isArray(post.images)) ? post.images.filter(Boolean).slice(0, 3) : [];
    if (post) post.images = imgs;

    for (let slot = 0; slot < 3; slot++) {
      const thumb = document.getElementById(`dashThumb${slot + 1}`);
      const label = document.getElementById(`dashLabel${slot + 1}`);
      const slotDiv = document.getElementById(`dashSlot${slot + 1}`);
      const delBtn = slotDiv?.querySelector('.dash-del-btn');

      if (imgs[slot]) {
        if (thumb) { thumb.src = imgs[slot]; thumb.style.display = 'block'; }
        if (label) label.style.display = 'none';
        if (delBtn) delBtn.style.display = 'block';
        if (slotDiv) slotDiv.style.border = '1px solid #0284c7';
      } else {
        if (thumb) { thumb.src = ''; thumb.style.display = 'none'; }
        if (label) label.style.display = 'block';
        if (delBtn) delBtn.style.display = 'none';
        if (slotDiv) slotDiv.style.border = '1px dashed #475569';
      }
    }
    if (dashImageBadge) dashImageBadge.innerText = `${imgs.length}/3 ảnh`;
    updatePreview();
  }

  document.querySelectorAll('.dash-del-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slotIdx = parseInt(btn.getAttribute('data-slot') || '0', 10);
      const post = posts[selectedPostIdx];
      if (post && Array.isArray(post.images)) {
        post.images.splice(slotIdx, 1);
        renderDashImageSlots();
        triggerAutoSave(true);
      }
    });
  });

  // Tối ưu hóa và nén ảnh (max dimension 1280px, chất lượng 0.85) để lưu trữ bền vững, chống tràn quota storage
  function compressAndResizeImage(file, maxDimension = 1280, quality = 0.85) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } else {
            resolve(e.target?.result);
          }
        };
        img.onerror = () => resolve(e.target?.result);
        img.src = e.target?.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  btnPickFile?.addEventListener('click', () => filePicker?.click());
  filePicker?.addEventListener('change', async (e) => {
    const files = Array.from(filePicker.files || []);
    if (!files.length) return;
    const p = posts[selectedPostIdx];
    if (!p) return;
    if (!Array.isArray(p.images)) p.images = [];

    const availableSlots = 3 - p.images.length;
    if (availableSlots <= 0) {
      alert('Đã đủ 3 ảnh! Hãy xóa bớt ảnh cũ để thêm ảnh mới.');
      filePicker.value = '';
      return;
    }

    showToast('⏳ Đang tối ưu dung lượng và nạp ảnh...');
    const filesToProcess = files.slice(0, availableSlots);
    for (const file of filesToProcess) {
      if (p.images.length >= 3) break;
      try {
        const compressed = await compressAndResizeImage(file);
        if (compressed && p.images.length < 3) {
          p.images.push(compressed);
        }
      } catch (err) {
        console.warn('Lỗi nén ảnh:', err);
      }
    }

    renderDashImageSlots();
    triggerAutoSave(true);
    showToast(`✓ Đã nạp thành công ${p.images.length}/3 ảnh!`);
    filePicker.value = '';
  });

  btnAddDashImageUrl?.addEventListener('click', () => {
    const url = postImageUrl?.value.trim();
    if (!url) return;
    const p = posts[selectedPostIdx];
    if (!p) return;
    if (!Array.isArray(p.images)) p.images = [];
    if (p.images.length >= 3) return alert('Đã đủ 3 ảnh!');
    p.images.push(url);
    if (postImageUrl) postImageUrl.value = '';
    renderDashImageSlots();
    triggerAutoSave(true);
  });

  btnClearDashImages?.addEventListener('click', () => {
    if (posts[selectedPostIdx]) {
      posts[selectedPostIdx].images = [];
      renderDashImageSlots();
      triggerAutoSave(true);
      showToast('Đã xóa tất cả ảnh');
    }
  });

  btnNewPost?.addEventListener('click', () => {
    posts.push({
      id: 'post_' + Date.now(),
      title: `Bài Tuyển Dụng ${posts.length + 1}`,
      content: '🔥 CƠ HỘI NGHỀ NGHIỆP TUYỂN DỤNG\n📍 Địa điểm: Hà Nội\n💰 Lương: 12 - 20 Triệu\n📞 Hỗ trợ: Zalo Gia Long',
      images: [],
    });
    selectedPostIdx = posts.length - 1;
    renderPostDropdown();
    loadPost(selectedPostIdx, true);
  });

  btnDeletePost?.addEventListener('click', () => {
    if (posts.length <= 1) return alert('Cần giữ ít nhất 1 bài viết!');
    if (confirm('Bạn có chắc muốn xóa bài này?')) {
      posts.splice(selectedPostIdx, 1);
      selectedPostIdx = 0;
      renderPostDropdown();
      loadPost(0, true);
    }
  });

  postSelect?.addEventListener('change', (e) => loadPost(parseInt(postSelect.value, 10), true));
  postTitle?.addEventListener('input', () => triggerAutoSave());
  postContent?.addEventListener('input', () => {
    if (posts[selectedPostIdx]) {
      posts[selectedPostIdx].content = postContent.value;
    }
    updatePreview();
    triggerAutoSave();
  });
  btnSavePost?.addEventListener('click', () => { triggerAutoSave(true); showToast('✓ Đã lưu cài đặt bài viết!'); });

  function resolveSpintax(t) {
    if (!t) return '';
    return t.replace(/\{([^{}]+)\}/g, (m, c) => {
      const parts = c.split('|');
      return parts[Math.floor(Math.random() * parts.length)];
    });
  }

  function updatePreview() {
    if (previewText && postContent) {
      previewText.innerText = resolveSpintax(postContent.value) || 'Chưa có nội dung bài viết...';
    }

    const previewImagesContainer = document.getElementById('previewImagesContainer');
    if (previewImagesContainer) {
      const p = posts[selectedPostIdx];
      const imgs = (p && Array.isArray(p.images)) ? p.images.filter(Boolean).slice(0, 3) : [];

      if (imgs.length === 0) {
        previewImagesContainer.style.display = 'none';
        previewImagesContainer.innerHTML = '';
      } else {
        previewImagesContainer.style.display = 'grid';
        if (imgs.length === 1) {
          previewImagesContainer.style.gridTemplateColumns = '1fr';
          previewImagesContainer.innerHTML = `
            <img src="${imgs[0]}" alt="Ảnh bài viết" style="width: 100%; max-height: 160px; object-fit: cover; border-radius: 6px; border: 1px solid #1e293b;" />
          `;
        } else if (imgs.length === 2) {
          previewImagesContainer.style.gridTemplateColumns = '1fr 1fr';
          previewImagesContainer.style.gap = '5px';
          previewImagesContainer.innerHTML = `
            <img src="${imgs[0]}" alt="Ảnh 1" style="width: 100%; height: 110px; object-fit: cover; border-radius: 6px; border: 1px solid #1e293b;" />
            <img src="${imgs[1]}" alt="Ảnh 2" style="width: 100%; height: 110px; object-fit: cover; border-radius: 6px; border: 1px solid #1e293b;" />
          `;
        } else {
          previewImagesContainer.style.gridTemplateColumns = 'repeat(3, 1fr)';
          previewImagesContainer.style.gap = '5px';
          previewImagesContainer.innerHTML = `
            <img src="${imgs[0]}" alt="Ảnh 1" style="width: 100%; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid #1e293b;" />
            <img src="${imgs[1]}" alt="Ảnh 2" style="width: 100%; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid #1e293b;" />
            <img src="${imgs[2]}" alt="Ảnh 3" style="width: 100%; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid #1e293b;" />
          `;
        }
      }
    }
  }
  btnRandomPreview?.addEventListener('click', updatePreview);

  // 2. QUẢN LÝ NHÓM
  function renderGroupList() {
    if (!groupList) return;
    groupList.innerHTML = '';
    const activeCount = groups.filter((g) => g.enabled !== false).length;
    if (groupTotalBadge) groupTotalBadge.innerText = `Đã chọn ${activeCount}/${groups.length} Nhóm`;

    groups.forEach((g, idx) => {
      const row = document.createElement('div');
      row.className = 'group-item';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '8px';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = g.enabled !== false;
      cb.style.accentColor = '#0284c7';
      cb.addEventListener('change', () => {
        g.enabled = cb.checked;
        triggerAutoSave(true);
        const curActive = groups.filter((item) => item.enabled !== false).length;
        if (groupTotalBadge) groupTotalBadge.innerText = `Đã chọn ${curActive}/${groups.length} Nhóm`;
      });

      const name = document.createElement('span');
      name.className = 'group-name';
      name.innerText = `${idx + 1}. ${g.name || 'Nhóm Facebook'}`;

      left.appendChild(cb);
      left.appendChild(name);

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.alignItems = 'center';
      right.style.gap = '8px';

      const link = document.createElement('a');
      link.href = g.link;
      link.target = '_blank';
      link.innerText = 'Xem ↗';
      link.style.color = '#38bdf8';
      link.style.textDecoration = 'none';

      const delBtn = document.createElement('button');
      delBtn.innerText = '✕';
      delBtn.className = 'btn btn-sub';
      delBtn.style.padding = '2px 6px';
      delBtn.style.color = '#ef4444';
      delBtn.title = 'Xóa nhóm này khỏi danh sách';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = g.id;
        const gName = g.name || 'Nhóm';
        groups = groups.filter((item) => (targetId && item.id) ? item.id !== targetId : item !== g);
        triggerAutoSave(true);
        renderGroupList();
        showToast(`✓ Đã xóa "${gName}" khỏi danh sách!`);
      });

      right.appendChild(link);
      right.appendChild(delBtn);
      row.appendChild(left);
      row.appendChild(right);
      groupList.appendChild(row);
    });
  }

  btnSelectAllGroups?.addEventListener('click', () => {
    groups.forEach((g) => { g.enabled = true; });
    triggerAutoSave(true);
    renderGroupList();
    showToast('✓ Đã chọn tất cả các nhóm!');
  });

  btnDeselectAllGroups?.addEventListener('click', () => {
    groups.forEach((g) => { g.enabled = false; });
    triggerAutoSave(true);
    renderGroupList();
    showToast('Đã bỏ chọn tất cả các nhóm.');
  });

  btnDeleteSelectedGroups?.addEventListener('click', () => {
    const selectedCount = groups.filter((g) => g.enabled !== false).length;
    if (selectedCount === 0) {
      showToast('⚠️ Vui lòng tích chọn ít nhất 1 nhóm để xóa!');
      return;
    }
    groups = groups.filter((g) => g.enabled === false);
    triggerAutoSave(true);
    renderGroupList();
    showToast(`✓ Đã xóa ${selectedCount} nhóm khỏi danh sách!`);
  });

  // Xuất danh sách link nhóm sang file TXT (mỗi dòng 1 link)
  btnExportGroupsTxt?.addEventListener('click', () => {
    if (!groups || !groups.length) return alert('Danh sách nhóm đăng bài hiện đang trống!');

    const links = groups.map((g) => g.link).filter(Boolean);
    const txt = links.join('\n');

    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `danh_sach_link_nhom_${links.length}_link_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`✓ Đã xuất file TXT (${links.length} link nhóm)!`);
  });

  btnShuffleDashboardGroups?.addEventListener('click', () => {
    if (!groups || groups.length <= 1) return;
    for (let i = groups.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [groups[i], groups[j]] = [groups[j], groups[i]];
    }
    triggerAutoSave(true);
    renderGroupList();
    showToast('🎲 Đã xáo trộn thứ tự các nhóm!');
  });

  btnAddGroup?.addEventListener('click', () => {
    const name = newGroupName?.value.trim() || `Nhóm Tuyển Dụng ${groups.length + 1}`;
    const link = newGroupLink?.value.trim();
    if (!link || !link.startsWith('http')) return alert('Vui lòng nhập link nhóm hợp lệ!');
    groups.push({ id: 'grp_' + Date.now(), name, link, enabled: true });
    triggerAutoSave(true);
    renderGroupList();
    if (newGroupName) newGroupName.value = '';
    if (newGroupLink) newGroupLink.value = '';
    showToast('✓ Đã thêm nhóm mới!');
  });

  btnSaveBulkLinks?.addEventListener('click', () => {
    const raw = bulkLinksInput?.value.trim();
    if (!raw) return;
    const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('http'));
    lines.forEach((url, i) => {
      groups.push({ id: 'grp_custom_' + Date.now() + '_' + i, name: `Nhóm Mới ${groups.length + 1}`, link: url, enabled: true });
    });
    triggerAutoSave(true);
    renderGroupList();
    if (bulkLinksInput) bulkLinksInput.value = '';
    showToast(`✓ Đã nạp thêm ${lines.length} link nhóm!`);
  });

  // 3. Giờ đăng & Hẹn giờ theo từng khung giờ + Tài khoản Facebook
  function syncActiveScheduleWithBackground() {
    if (scheduleToggle && scheduleToggle.checked) {
      chrome.runtime.sendMessage({
        action: 'SCHEDULE_AUTO_POST',
        payload: {
          times: scheduledTimes,
          slots: scheduleSlots,
          delaySec: delayInput ? (parseInt(delayInput.value, 10) || 30) : 30,
          isSpintaxEnabled: true,
        },
      });
    }
  }

  function updateScheduleStatus() {
    const statusTextEl = document.getElementById('schedStatusText');
    const badgeEl = document.getElementById('scheduleStatusBadge');
    if (!statusTextEl) return;

    if (scheduleToggle && scheduleToggle.checked) {
      if (scheduleSlots && scheduleSlots.length > 0) {
        const summary = scheduleSlots.map((s) => `${s.time} (${s.accountName || 'Nick đang chọn'})`).join(', ');
        statusTextEl.textContent = `🟢 Đã cập nhật hẹn giờ: ${summary} (Đang chạy ngầm)`;
        if (badgeEl) {
          badgeEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
          badgeEl.style.color = '#34d399';
        }
      } else {
        statusTextEl.textContent = '⚠️ Đã bật hẹn giờ: Chưa có khung giờ nào, vui lòng bấm + Thêm Khung hoặc chọn Giờ Vàng!';
        if (badgeEl) {
          badgeEl.style.borderColor = 'rgba(245, 158, 11, 0.4)';
          badgeEl.style.color = '#fbbf24';
        }
      }
    } else {
      statusTextEl.textContent = '⚪ Trạng thái: Chưa kích hoạt hẹn giờ';
      if (badgeEl) {
        badgeEl.style.borderColor = '#1e293b';
        badgeEl.style.color = '#94a3b8';
      }
    }
  }

  function renderTimes() {
    if (!timeTagsContainer) return;
    timeTagsContainer.textContent = '';

    if (!Array.isArray(scheduleSlots) || scheduleSlots.length === 0) {
      if (typeof SharedStorage !== 'undefined' && SharedStorage.normalizeScheduleSlots) {
        scheduleSlots = SharedStorage.normalizeScheduleSlots([], scheduledTimes);
      }
    }

    scheduleSlots.forEach((slot, i) => {
      const tag = document.createElement('div');
      tag.className = 'time-tag';

      const timeSpan = document.createElement('span');
      timeSpan.textContent = `⏰ ${slot.time}`;

      const accSpan = document.createElement('span');
      accSpan.style.cssText = 'color: #a7f3d0; font-size: 10px; font-weight: 600;';
      accSpan.textContent = `· 👤 ${slot.accountName || 'Tài khoản đang chọn'}${slot.autoSwitchAccount !== false ? ' 🔀' : ''}`;

      const delSpan = document.createElement('span');
      delSpan.className = 'del';
      delSpan.setAttribute('data-i', String(i));
      delSpan.textContent = '✕';
      delSpan.addEventListener('click', () => {
        scheduleSlots.splice(i, 1);
        scheduledTimes = scheduleSlots.map((s) => s.time);
        triggerAutoSave(true);
        renderTimes();
        updateScheduleStatus();
        syncActiveScheduleWithBackground();
      });

      tag.appendChild(timeSpan);
      tag.appendChild(accSpan);
      tag.appendChild(delSpan);
      timeTagsContainer.appendChild(tag);
    });

    updateScheduleStatus();
  }

  // Khởi tạo các phần tử nhập thời gian chuẩn hóa
  const schedHourInput = document.getElementById('schedHourInput');
  const schedMinuteInput = document.getElementById('schedMinuteInput');
  const schedTimePicker = document.getElementById('schedTimePicker');

  // Tự động đồng bộ giữa TimePicker và 2 ô nhập số
  schedTimePicker?.addEventListener('input', () => {
    if (schedTimePicker.value && schedTimePicker.value.includes(':')) {
      const [h, m] = schedTimePicker.value.split(':');
      if (schedHourInput) schedHourInput.value = h.padStart(2, '0');
      if (schedMinuteInput) schedMinuteInput.value = m.padStart(2, '0');
    }
  });

  schedHourInput?.addEventListener('input', () => {
    schedHourInput.value = schedHourInput.value.replace(/[^0-9]/g, '');
    if (schedHourInput.value.length >= 2) {
      schedMinuteInput?.focus();
      schedMinuteInput?.select();
    }
    syncInputsToPicker();
  });

  schedMinuteInput?.addEventListener('input', () => {
    schedMinuteInput.value = schedMinuteInput.value.replace(/[^0-9]/g, '');
    syncInputsToPicker();
  });

  function syncInputsToPicker() {
    if (!schedTimePicker || !schedHourInput || !schedMinuteInput) return;
    const h = schedHourInput.value.trim();
    const m = schedMinuteInput.value.trim();
    if (h !== '' && m !== '') {
      const hNum = Math.min(23, Math.max(0, parseInt(h, 10) || 0));
      const mNum = Math.min(59, Math.max(0, parseInt(m, 10) || 0));
      schedTimePicker.value = `${hNum.toString().padStart(2, '0')}:${mNum.toString().padStart(2, '0')}`;
    }
  }

  btnAddTime?.addEventListener('click', () => {
    let formattedTime = '';
    const hStr = schedHourInput?.value.trim() || '';
    const mStr = schedMinuteInput?.value.trim() || '';

    if (hStr !== '' && mStr !== '') {
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);

      if (isNaN(h) || h < 0 || h > 23 || isNaN(m) || m < 0 || m > 59) {
        showToast('⚠️ Giờ hợp lệ từ 00 đến 23, Phút từ 00 đến 59!');
        return;
      }
      formattedTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    } else if (schedTimePicker && schedTimePicker.value && schedTimePicker.value.includes(':')) {
      formattedTime = schedTimePicker.value;
    } else {
      showToast('⚠️ Vui lòng nhập giờ phút hợp lệ!');
      return;
    }

    const chosenAccountId = schedAccountSelect ? schedAccountSelect.value : 'active';
    const selectedAccOption = schedAccountSelect?.selectedOptions?.[0];
    const chosenAccountName = chosenAccountId === 'active'
      ? 'Tài khoản đang chọn'
      : (selectedAccOption?.getAttribute('data-acc-name') || selectedAccOption?.textContent?.replace(/^👤\s*/, '').split(' (')[0] || 'Tài khoản FB');
    const chosenPostId = schedPostSelect ? schedPostSelect.value : 'selected';
    const autoSwitch = schedAutoSwitchToggle ? schedAutoSwitchToggle.checked : true;

    const existingIdx = scheduleSlots.findIndex((s) => s.time === formattedTime);
    const newSlot = {
      id: `slot_${formattedTime.replace(':', '_')}`,
      time: formattedTime,
      enabled: true,
      accountId: chosenAccountId,
      accountName: chosenAccountName,
      postId: chosenPostId,
      autoSwitchAccount: autoSwitch,
      lastRunDate: null,
    };

    if (existingIdx !== -1) {
      scheduleSlots[existingIdx] = newSlot;
      showToast(`✓ Đã cập nhật khung giờ ${formattedTime} (${chosenAccountName})`);
    } else {
      scheduleSlots.push(newSlot);
      scheduleSlots.sort((a, b) => a.time.localeCompare(b.time));
      showToast(`✓ Đã thêm khung giờ ${formattedTime} (${chosenAccountName})`);
    }

    scheduledTimes = scheduleSlots.map((s) => s.time);
    triggerAutoSave(true);
    renderTimes();
    updateScheduleStatus();
    syncActiveScheduleWithBackground();
  });

  btnGoldenHours?.addEventListener('click', () => {
    scheduledTimes = ['08:30', '11:30', '17:30', '20:00'];
    const chosenAccountId = schedAccountSelect ? schedAccountSelect.value : 'active';
    const selectedAccOption = schedAccountSelect?.selectedOptions?.[0];
    const chosenAccountName = chosenAccountId === 'active'
      ? 'Tài khoản đang chọn'
      : (selectedAccOption?.getAttribute('data-acc-name') || 'Tài khoản FB');
    const chosenPostId = schedPostSelect ? schedPostSelect.value : 'selected';
    const autoSwitch = schedAutoSwitchToggle ? schedAutoSwitchToggle.checked : true;

    scheduleSlots = scheduledTimes.map((t) => ({
      id: `slot_${t.replace(':', '_')}`,
      time: t,
      enabled: true,
      accountId: chosenAccountId,
      accountName: chosenAccountName,
      postId: chosenPostId,
      autoSwitchAccount: autoSwitch,
      lastRunDate: null,
    }));

    triggerAutoSave(true);
    renderTimes();
    updateScheduleStatus();
    syncActiveScheduleWithBackground();
    showToast('✓ Đã nạp 4 mốc giờ vàng: 08:30, 11:30, 17:30, 20:00!');
  });

  scheduleToggle?.addEventListener('change', () => {
    if (scheduleToggle.checked) {
      chrome.runtime.sendMessage({ action: 'CHECK_LICENSE' }, (licRes) => {
        if (!licRes || !licRes.isValid) {
          scheduleToggle.checked = false;
          chrome.runtime.sendMessage({ action: 'CANCEL_SCHEDULE' });
          triggerAutoSave(true);
          updateScheduleStatus();
          switchTab('license');
          alert(`🚨 CHƯA KÍCH HOẠT BẢN QUYỀN VIP!\n\nTính năng "Hẹn giờ tự động đăng bài" yêu cầu bản quyền Gia Long FB đang hoạt động.\n\n${licRes?.message || 'Vui lòng kích hoạt mã bản quyền hoặc đặt mua gói để hệ thống có thể tự động chạy khi tới giờ hẹn.'}`);
          return;
        }

        triggerAutoSave(true);
        updateScheduleStatus();
        chrome.runtime.sendMessage({
          action: 'SCHEDULE_AUTO_POST',
          payload: {
            times: scheduledTimes,
            slots: scheduleSlots,
            delaySec: delayInput ? (parseInt(delayInput.value, 10) || 30) : 30,
            isSpintaxEnabled: true,
          },
        }, (schedRes) => {
          if (schedRes && schedRes.success === false) {
            scheduleToggle.checked = false;
            triggerAutoSave(true);
            updateScheduleStatus();
            alert(`🚨 LỖI HẸN GIỜ:\n\n${schedRes.message || 'Không thể kích hoạt hẹn giờ'}`);
          } else {
            showToast('✓ Đã cập nhật kích hoạt hẹn giờ tự động thành công!');
          }
        });
      });
    } else {
      triggerAutoSave(true);
      updateScheduleStatus();
      chrome.runtime.sendMessage({ action: 'CANCEL_SCHEDULE' });
      showToast('Đã tắt hẹn giờ tự động.');
    }
  });

  // 4. Bắt đầu đăng liên hoàn
  btnStartRun?.addEventListener('click', () => {
    const activeGrps = groups.filter((g) => g.enabled !== false);
    if (!activeGrps.length) return alert('Chưa chọn nhóm nào!');
    const txt = postContent?.value.trim();
    if (!txt) return alert('Chưa có nội dung bài!');

    // KIỂM TRA BẢN QUYỀN TRƯỚC KHI THỰC HIỆN ĐĂNG
    chrome.runtime.sendMessage({ action: 'CHECK_LICENSE' }, (licRes) => {
      if (!licRes || !licRes.isValid) {
        switchTab('license');
        alert(`🚨 BẢN QUYỀN CHƯA KÍCH HOẠT HOẶC ĐÃ HẾT HẠN!\n\n${licRes?.message || 'Vui lòng kích hoạt mã bản quyền (Cá nhân hoặc Doanh nghiệp) để bắt đầu đăng bài.'}`);
        return;
      }

      const currentPostObj = posts[selectedPostIdx];
      const postImgs = (currentPostObj?.images && currentPostObj.images.length > 0) ? currentPostObj.images.slice(0, 3) : [];
      const baseContent = currentPostObj?.content || txt;
      // 3 Biến thể nội dung thật do người dùng thiết lập
      const rawV2 = currentPostObj?.contentVariant2 || '';
      const rawV3 = currentPostObj?.contentVariant3 || '';
      const postVariants = [
        baseContent,
        rawV2,
        rawV3,
      ].filter((v) => typeof v === 'string' && v.trim().length > 0);

      if (btnStartRun) btnStartRun.style.display = 'none';
      if (btnStopRun) btnStopRun.style.display = 'block';
      if (progressArea) progressArea.style.display = 'block';
      if (statusLabel) statusLabel.innerText = 'Đang bắt đầu...';
      if (progressBar) progressBar.style.width = '5%';

      chrome.runtime.sendMessage({ action: 'GET_FB_ACCOUNTS' }, (accRes) => {
        const activeAcc = accRes?.activeAccount || null;
        chrome.runtime.sendMessage({
          action: 'START_BATCH_POSTING',
          payload: {
            groups: activeGrps,
            content: txt,
            variants: postVariants,
            images: postImgs,
            isSpintaxEnabled: true,
            delaySec: delayInput ? (parseInt(delayInput.value, 10) || 30) : 30,
            shouldShuffle: true,
            postTitle: currentPostObj?.title || 'Bài Tuyển Dụng',
            accountId: activeAcc ? activeAcc.id : null,
            accountName: activeAcc ? activeAcc.name : null,
          },
        });
      });
    });
  });

  btnStopRun?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'STOP_BATCH_POSTING' }, () => {
      if (btnStartRun) btnStartRun.style.display = 'block';
      if (btnStopRun) btnStopRun.style.display = 'none';
      if (statusLabel) statusLabel.innerText = '⏹️ Đã dừng tiến trình!';
      if (progressBar) progressBar.style.width = '0%';
      showToast('⏹️ Đã dừng tiến trình ngay lập tức!');
    });
  });

  // 5. Dò tìm nhóm Facebook
  btnStartFindGroups?.addEventListener('click', () => {
    const kw = finderKeyword?.value.trim();
    if (!kw) return alert('Vui lòng nhập từ khóa tìm nhóm!');
    const minMembers = finderMinMembers ? parseInt(finderMinMembers.value, 10) : 10000;
    const autoJoin = finderAutoJoin ? finderAutoJoin.checked : false;

    if (btnStartFindGroups) {
      btnStartFindGroups.disabled = true;
      btnStartFindGroups.innerText = '⏳ Đang quét Facebook...';
    }

    chrome.runtime.sendMessage({
      action: 'SEARCH_AND_SCAN_GROUPS',
      payload: { keyword: kw, minMembers, autoJoin },
    }, (res) => {
      if (btnStartFindGroups) {
        btnStartFindGroups.disabled = false;
        btnStartFindGroups.innerText = '🚀 Bắt Đầu Quét Nhóm';
      }

      if (res && res.success && res.groups) {
        scannedGroupsTemp = res.groups;
        renderFinderResults(scannedGroupsTemp);
        showToast(`✓ Đã tìm được ${scannedGroupsTemp.length} nhóm!`);
      } else {
        alert(res?.error || 'Không tìm thấy nhóm hoặc chưa đăng nhập Facebook!');
      }
    });
  });

  function renderFinderResults(list) {
    if (!finderTableBody) return;
    finderTableBody.innerHTML = '';
    if (finderResultTitle) finderResultTitle.innerText = `Danh sách nhóm tìm được (${list.length} nhóm):`;
    if (btnAddFinderToPostingList) btnAddFinderToPostingList.style.display = list.length > 0 ? 'inline-flex' : 'none';
    if (btnJoinAndAddFinderGroups) btnJoinAndAddFinderGroups.style.display = list.length > 0 ? 'inline-flex' : 'none';
    if (btnExportFinderGroups) btnExportFinderGroups.style.display = list.length > 0 ? 'inline-flex' : 'none';

    if (list.length === 0) {
      finderTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 25px;">Không có nhóm nào thỏa mãn.</td></tr>';
      return;
    }

    list.forEach((g, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="checkbox" class="finder-cb" data-idx="${idx}" checked /></td>
        <td style="font-weight: 600;"><a href="${g.link}" target="_blank" style="color: #38bdf8; text-decoration: none;">${g.name} ↗</a></td>
        <td><span style="color: #10b981; font-weight: bold;">${g.memberText}</span></td>
        <td><span class="${g.joined ? 'badge-success' : 'badge-stopped'}">${g.joined ? 'Đã Tham Gia' : 'Chưa Tham Gia'}</span></td>
        <td><a href="${g.link}" target="_blank" class="btn btn-sub" style="font-size: 10px; text-decoration: none; display: inline-flex; align-items: center;">Xem Nhóm ↗</a></td>
      `;
      finderTableBody.appendChild(tr);
    });
  }

  finderCheckAll?.addEventListener('change', () => {
    document.querySelectorAll('.finder-cb').forEach((cb) => { cb.checked = finderCheckAll.checked; });
  });

  // Tham gia nhóm tự động & Thêm vào danh sách đăng bài
  btnJoinAndAddFinderGroups?.addEventListener('click', () => {
    const selectedIndexes = Array.from(document.querySelectorAll('.finder-cb:checked')).map((el) => parseInt(el.getAttribute('data-idx') || '0', 10));
    const toProcess = selectedIndexes.map((i) => scannedGroupsTemp[i]).filter(Boolean);
    if (!toProcess.length) return alert('Vui lòng tích chọn ít nhất 1 nhóm!');

    if (!confirm(`Tiện ích sẽ tự động mở tab để tham gia ${toProcess.length} nhóm đã chọn và thêm vào danh sách đăng bài. Bắt đầu ngay?`)) {
      return;
    }

    btnJoinAndAddFinderGroups.disabled = true;
    btnJoinAndAddFinderGroups.innerText = '⏳ Đang tham gia nhóm...';
    showToast(`Đang chạy tham gia ${toProcess.length} nhóm...`);

    chrome.runtime.sendMessage({
      action: 'JOIN_AND_ADD_GROUPS',
      payload: { groupsToProcess: toProcess }
    }, (res) => {
      btnJoinAndAddFinderGroups.disabled = false;
      btnJoinAndAddFinderGroups.innerText = '🚀 Tham Gia & Thêm Vào Đăng Bài';

      if (res && res.success) {
        if (res.updatedGroups) {
          groups = res.updatedGroups;
        }
        toProcess.forEach((g) => { g.joined = true; });
        renderFinderResults(scannedGroupsTemp);
        renderGroupList();
        showToast(`✓ Đã tham gia xong & thêm ${res.addedCount || toProcess.length} nhóm vào danh sách!`);
      } else {
        alert(res?.error || 'Có lỗi xảy ra khi tự động tham gia nhóm.');
      }
    });
  });

  btnAddFinderToPostingList?.addEventListener('click', () => {
    const selectedIndexes = Array.from(document.querySelectorAll('.finder-cb:checked')).map((el) => parseInt(el.getAttribute('data-idx') || '0', 10));
    const toAdd = selectedIndexes.map((i) => scannedGroupsTemp[i]).filter(Boolean);
    if (!toAdd.length) return alert('Chưa chọn nhóm nào để nạp!');

    toAdd.forEach((g) => {
      if (!groups.some((existing) => existing.link === g.link)) {
        groups.push({ id: g.id, name: g.name, link: g.link, enabled: true });
      }
    });

    triggerAutoSave(true);
    renderGroupList();
    showToast(`✓ Đã nạp ${toAdd.length} nhóm vào danh sách đăng bài!`);
    switchTab('main');
  });

  // Xuất kết quả dò tìm nhóm sang file Excel (CSV)
  btnExportFinderGroups?.addEventListener('click', () => {
    if (!scannedGroupsTemp || !scannedGroupsTemp.length) return alert('Chưa có nhóm nào trong kết quả tìm kiếm!');

    let csv = '\uFEFFSTT,Tên Nhóm,Số Lượng Thành Viên,Trạng Thái Tham Gia,Link Nhóm\n';
    scannedGroupsTemp.forEach((g, i) => {
      const name = `"${(g.name || '').replace(/"/g, '""')}"`;
      const member = `"${(g.memberText || '').replace(/"/g, '""')}"`;
      const status = g.joined ? 'Đã tham gia' : 'Chưa tham gia';
      const link = `"${(g.link || '').replace(/"/g, '""')}"`;
      csv += `${i + 1},${name},${member},${status},${link}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ket_qua_tim_kiem_nhom_${scannedGroupsTemp.length}_nhom_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`✓ Đã xuất ${scannedGroupsTemp.length} nhóm tìm được sang Excel!`);
  });

  // 5.5 Quản lý tài khoản Facebook
  const btnDetectCurrentAccount = document.getElementById('btnDetectCurrentAccount');
  const accountsListContainer = document.getElementById('accountsListContainer');
  const activeAccountNameLabel = document.getElementById('activeAccountNameLabel');
  const activeAccountCooldownLabel = document.getElementById('activeAccountCooldownLabel');

  async function renderAccountsList() {
    if (!accountsListContainer) return;
    accountsListContainer.innerHTML = '';

    const res = await chrome.storage.local.get(['fbAccounts', 'activeAccountId']);
    const accounts = Array.isArray(res.fbAccounts) ? res.fbAccounts : [];
    const activeId = res.activeAccountId;

    const activeAcc = accounts.find((a) => String(a.id) === String(activeId)) || accounts[0] || null;
    if (activeAccountNameLabel) {
      activeAccountNameLabel.textContent = activeAcc ? (activeAcc.name || 'Facebook User') : 'Chưa chọn tài khoản';
    }
    if (activeAccountCooldownLabel) {
      if (activeAcc && typeof AccountsManager !== 'undefined') {
        const cool = AccountsManager.isAccountCoolingDown(activeAcc);
        if (cool.isCoolingDown) {
          activeAccountCooldownLabel.textContent = `⏳ Tạm nghỉ giới hạn tần suất đến ${cool.untilFormatted} (${cool.remainingMinutes}p)`;
          activeAccountCooldownLabel.style.color = '#f59e0b';
        } else {
          activeAccountCooldownLabel.textContent = '✓ Trạng thái: Sẵn sàng';
          activeAccountCooldownLabel.style.color = '#34d399';
        }
      } else {
        activeAccountCooldownLabel.textContent = '✓ Trạng thái: Sẵn sàng';
        activeAccountCooldownLabel.style.color = '#34d399';
      }
    }

    if (accounts.length === 0) {
      accountsListContainer.innerHTML = `
        <div style="grid-column: 1 / -1; background: #0f172a; border: 1px dashed #334155; border-radius: 8px; padding: 25px; text-align: center; color: #94a3b8;">
          <p style="font-size: 13px; font-weight: 600; margin-bottom: 6px; color: #f1f5f9;">Chưa có tài khoản Facebook nào được lưu</p>
          <p style="font-size: 11.5px; margin-bottom: 12px;">Mở tab Facebook trên trình duyệt này và bấm "Quét &amp; Nhận Diện Nick FB Hiện Tại" để tự động thêm.</p>
        </div>
      `;
      return;
    }

    accounts.forEach((acc) => {
      const isSelected = activeAcc && String(activeAcc.id) === String(acc.id);
      const isCooling = typeof AccountsManager !== 'undefined' ? AccountsManager.isAccountCoolingDown(acc) : { isCoolingDown: false };

      const card = document.createElement('div');
      card.style.background = isSelected ? '#0d1f3d' : '#0f172a';
      card.style.border = isSelected ? '1px solid #38bdf8' : '1px solid #1e293b';
      card.style.borderRadius = '10px';
      card.style.padding = '14px';
      card.style.display = 'flex';
      card.style.flexDirection = 'column';
      card.style.gap = '10px';

      const topRow = document.createElement('div');
      topRow.style.display = 'flex';
      topRow.style.alignItems = 'center';
      topRow.style.gap = '10px';

      const avatarImg = document.createElement('img');
      avatarImg.src = acc.avatar || 'icon48.png';
      avatarImg.style.width = '42px';
      avatarImg.style.height = '42px';
      avatarImg.style.borderRadius = '50%';
      avatarImg.style.objectFit = 'cover';
      avatarImg.style.border = '1px solid #334155';
      avatarImg.onerror = () => { avatarImg.src = 'icon48.png'; };

      const infoCol = document.createElement('div');
      infoCol.style.flex = '1';
      infoCol.style.minWidth = '0';

      const nameEl = document.createElement('div');
      nameEl.style.fontWeight = '700';
      nameEl.style.fontSize = '13.5px';
      nameEl.style.color = '#ffffff';
      nameEl.style.overflow = 'hidden';
      nameEl.style.textOverflow = 'ellipsis';
      nameEl.style.whiteSpace = 'nowrap';
      nameEl.textContent = acc.name || 'Tài khoản Facebook';

      const uidEl = document.createElement('div');
      uidEl.style.fontSize = '11px';
      uidEl.style.color = '#94a3b8';
      uidEl.textContent = 'UID: ' + (acc.uid || 'Không xác định');

      infoCol.appendChild(nameEl);
      infoCol.appendChild(uidEl);
      topRow.appendChild(avatarImg);
      topRow.appendChild(infoCol);
      card.appendChild(topRow);

      const statusPill = document.createElement('div');
      statusPill.style.fontSize = '11px';
      statusPill.style.padding = '3px 8px';
      statusPill.style.borderRadius = '6px';
      statusPill.style.display = 'inline-flex';
      statusPill.style.alignItems = 'center';
      statusPill.style.gap = '4px';

      if (isCooling.isCoolingDown) {
        statusPill.style.background = 'rgba(245, 158, 11, 0.15)';
        statusPill.style.color = '#fbbf24';
        statusPill.style.border = '1px solid rgba(245, 158, 11, 0.3)';
        statusPill.textContent = `⏳ Giới hạn tần suất: Cooldown đến ${isCooling.untilFormatted} (${isCooling.remainingMinutes}p)`;
      } else if (acc.status === 'checkpoint') {
        statusPill.style.background = 'rgba(239, 68, 68, 0.15)';
        statusPill.style.color = '#f87171';
        statusPill.style.border = '1px solid rgba(239, 68, 68, 0.3)';
        statusPill.textContent = '⚠️ Cần đăng nhập lại / Checkpoint';
      } else {
        statusPill.style.background = 'rgba(16, 185, 129, 0.15)';
        statusPill.style.color = '#34d399';
        statusPill.style.border = '1px solid rgba(16, 185, 129, 0.3)';
        statusPill.textContent = '✓ Hoạt động bình thường';
      }
      card.appendChild(statusPill);

      const actionRow = document.createElement('div');
      actionRow.style.display = 'flex';
      actionRow.style.justifyContent = 'space-between';
      actionRow.style.alignItems = 'center';
      actionRow.style.marginTop = '4px';

      const selectBtn = document.createElement('button');
      selectBtn.className = isSelected ? 'btn btn-emerald' : 'btn btn-sub';
      selectBtn.style.fontSize = '11px';
      selectBtn.style.padding = '4px 10px';
      selectBtn.textContent = isSelected ? '★ Đang Chọn Đăng' : 'Chọn Nick Này';
      selectBtn.disabled = isSelected;
      selectBtn.addEventListener('click', async () => {
        if (typeof AccountsManager !== 'undefined') {
          await AccountsManager.setActiveAccount(acc.id);
          renderAccountsList();
          showToast(`✓ Đã chọn nick: ${acc.name}`);
        }
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sub';
      delBtn.style.fontSize = '11px';
      delBtn.style.padding = '4px 8px';
      delBtn.style.color = '#ef4444';
      delBtn.textContent = 'Xóa';
      delBtn.addEventListener('click', async () => {
        if (confirm(`Xóa nick "${acc.name}" khỏi danh sách?`)) {
          if (typeof AccountsManager !== 'undefined') {
            await AccountsManager.removeAccount(acc.id);
            renderAccountsList();
            showToast('Đã xóa tài khoản.');
          }
        }
      });

      actionRow.appendChild(selectBtn);
      actionRow.appendChild(delBtn);
      card.appendChild(actionRow);

      accountsListContainer.appendChild(card);
    });
  }

  btnDetectCurrentAccount?.addEventListener('click', async () => {
    btnDetectCurrentAccount.disabled = true;
    btnDetectCurrentAccount.textContent = '⏳ Đang quét tab Facebook...';
    try {
      if (typeof AccountsManager !== 'undefined') {
        const res = await AccountsManager.detectCurrentAccountFromTab();
        showToast(res.message || '✓ Đã nhận diện nick Facebook thành công!');
        renderAccountsList();
      }
    } catch (err) {
      alert(`⚠️ KHÔNG THỂ NHẬN DIỆN NICK:\n\n${err.message}`);
    } finally {
      btnDetectCurrentAccount.disabled = false;
      btnDetectCurrentAccount.textContent = '🔍 Quét & Nhận Diện Nick FB Hiện Tại';
    }
  });

  // 6. Lịch sử đăng bài (Hiển thị Tài khoản Facebook đã đăng, lọc theo nick/trạng thái & xuất CSV - Rule 5 dùng textContent)
  function populateHistoryAccountFilter(historyList, accountsList) {
    if (!historyFilterAccount) return;
    const prevValue = historyFilterAccount.value || 'all';
    historyFilterAccount.textContent = '';

    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = '👤 Tất cả tài khoản FB';
    historyFilterAccount.appendChild(optAll);

    const seenKeys = new Set();
    const addOption = (val, label) => {
      const key = String(val || '').trim();
      if (!key || seenKeys.has(key)) return;
      seenKeys.add(key);
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      historyFilterAccount.appendChild(opt);
    };

    if (Array.isArray(accountsList)) {
      accountsList.forEach((acc) => {
        if (!acc) return;
        const key = acc.id || acc.uid || acc.fbUserId || acc.name || acc.displayName;
        const name = acc.name || acc.displayName || 'Nick FB';
        const uid = acc.uid || acc.fbUserId || acc.id || '';
        addOption(key, uid && uid !== name ? `👤 ${name} (${uid})` : `👤 ${name}`);
      });
    }

    if (Array.isArray(historyList)) {
      historyList.forEach((h) => {
        if (!h) return;
        const key = h.accountId || h.accountUid || h.accountName;
        const name = h.accountName || h.accountId || 'Mặc định';
        const uid = h.accountUid || (h.accountId && h.accountId !== 'default' ? h.accountId : '');
        if (key) {
          addOption(key, uid && uid !== name ? `👤 ${name} (${uid})` : `👤 ${name}`);
        }
      });
    }

    if (Array.from(historyFilterAccount.options).some((o) => o.value === prevValue)) {
      historyFilterAccount.value = prevValue;
    } else {
      historyFilterAccount.value = 'all';
    }
  }

  function getFilteredHistoryFromUI(rawHistory) {
    const filters = {
      accountId: historyFilterAccount ? historyFilterAccount.value : 'all',
      status: historyFilterStatus ? historyFilterStatus.value : 'all',
      type: historyFilterType ? historyFilterType.value : 'all',
      keyword: historySearchInput ? historySearchInput.value : '',
    };
    if (typeof SharedStorage !== 'undefined' && typeof SharedStorage.filterHistoryEntries === 'function') {
      return SharedStorage.filterHistoryEntries(rawHistory, filters);
    }
    return Array.isArray(rawHistory) ? rawHistory : [];
  }

  async function renderHistory() {
    if (!historyTableBody) return;
    historyTableBody.textContent = '';
    const res = await chrome.storage.local.get(['postHistory', 'fbAccounts']);
    const history = Array.isArray(res.postHistory) ? res.postHistory : [];
    const accountsList = Array.isArray(res.fbAccounts) ? res.fbAccounts : [];

    populateHistoryAccountFilter(history, accountsList);
    const filtered = getFilteredHistoryFromUI(history);

    if (historyStatsSummary) {
      const okCount = filtered.filter((h) => h && h.status === 'success').length;
      const failCount = filtered.filter((h) => h && h.status === 'failed').length;
      const uncertainCount = filtered.filter((h) => h && h.status === 'uncertain').length;
      const autoJoinCount = filtered.filter((h) => h && h.autoJoined).length;
      historyStatsSummary.textContent =
        `Hiển thị: ${filtered.length}/${history.length} | ✅ Thành công: ${okCount} | ❌ Lỗi: ${failCount} | ⚠️ Chưa rõ: ${uncertainCount} | 🤝 Tự vào nhóm: ${autoJoinCount}`;
    }

    if (filtered.length === 0) {
      const trEmpty = document.createElement('tr');
      const tdEmpty = document.createElement('td');
      tdEmpty.colSpan = 7;
      tdEmpty.style.textAlign = 'center';
      tdEmpty.style.color = '#64748b';
      tdEmpty.style.padding = '25px';
      tdEmpty.textContent = history.length === 0
        ? 'Chưa có lịch sử đăng bài nào.'
        : 'Không tìm thấy bản ghi lịch sử nào khớp với bộ lọc hiện tại.';
      trEmpty.appendChild(tdEmpty);
      historyTableBody.appendChild(trEmpty);
      return;
    }

    filtered.forEach((h) => {
      const tr = document.createElement('tr');
      const badgeClass = h.status === 'success'
        ? 'badge-success'
        : (h.status === 'stopped' || h.status === 'uncertain' ? 'badge-stopped' : 'badge-failed');
      const statusText = h.status === 'success'
        ? 'Thành công'
        : (h.status === 'uncertain' ? 'Chưa rõ' : (h.status === 'stopped' ? 'Đã dừng' : 'Thất bại'));
      const typeLabel = h.type === 'scheduled' ? '⏰ Hẹn giờ' : '⚡ Thủ công';

      // 1. Cột Thời gian
      const tdTime = document.createElement('td');
      tdTime.style.fontSize = '11px';
      tdTime.style.color = '#94a3b8';
      tdTime.textContent = h.timeFormatted || new Date(h.timestamp).toLocaleString();
      tr.appendChild(tdTime);

      // 2. Cột Loại
      const tdType = document.createElement('td');
      const spanType = document.createElement('span');
      spanType.style.fontSize = '11px';
      spanType.style.color = '#38bdf8';
      spanType.textContent = h.slotId ? `${typeLabel} (${h.slotId})` : typeLabel;
      tdType.appendChild(spanType);
      tr.appendChild(tdType);

      // 3. Cột Tài Khoản FB (Rule 5: textContent)
      const tdAccount = document.createElement('td');
      const divAccName = document.createElement('div');
      divAccName.style.fontSize = '11.5px';
      divAccName.style.fontWeight = '600';
      divAccName.style.color = '#f1f5f9';
      divAccName.textContent = `👤 ${h.accountName || 'Mặc định'}`;
      tdAccount.appendChild(divAccName);

      const uidDisplay = h.accountUid || (h.accountId && h.accountId !== 'default' ? h.accountId : '');
      if (uidDisplay && uidDisplay !== h.accountName) {
        const divAccUid = document.createElement('div');
        divAccUid.style.fontSize = '10px';
        divAccUid.style.color = '#64748b';
        divAccUid.textContent = `UID: ${uidDisplay}`;
        tdAccount.appendChild(divAccUid);
      }
      tr.appendChild(tdAccount);

      // 4. Cột Nhóm Nhận Bài (Rule 5: textContent + link bắt đầu bằng https://www.facebook.com/groups/)
      const tdGroup = document.createElement('td');
      tdGroup.style.fontWeight = '600';
      if (h.groupLink && String(h.groupLink).startsWith('https://www.facebook.com/groups/')) {
        const aGroup = document.createElement('a');
        aGroup.href = h.groupLink;
        aGroup.target = '_blank';
        aGroup.rel = 'noopener noreferrer';
        aGroup.style.color = '#e2e8f0';
        aGroup.style.textDecoration = 'none';
        aGroup.textContent = (h.groupName || 'Nhóm Facebook') + ' ↗';
        tdGroup.appendChild(aGroup);
      } else {
        const spanGrp = document.createElement('span');
        spanGrp.textContent = h.groupName || 'Nhóm Facebook';
        tdGroup.appendChild(spanGrp);
      }
      if (h.autoJoined) {
        const spanJoinBadge = document.createElement('div');
        spanJoinBadge.style.fontSize = '10px';
        spanJoinBadge.style.color = '#34d399';
        spanJoinBadge.style.fontWeight = '600';
        spanJoinBadge.style.marginTop = '2px';
        spanJoinBadge.textContent = '🤝 Đã tự vào nhóm khi đăng';
        tdGroup.appendChild(spanJoinBadge);
      }
      tr.appendChild(tdGroup);

      // 5. Cột Bài Viết
      const tdPost = document.createElement('td');
      tdPost.style.maxWidth = '180px';
      tdPost.style.overflow = 'hidden';
      tdPost.style.textOverflow = 'ellipsis';
      tdPost.style.whiteSpace = 'nowrap';
      tdPost.textContent = h.postTitle || 'Bài Tuyển Dụng';
      tr.appendChild(tdPost);

      // 6. Cột Trạng Thái
      const tdStatus = document.createElement('td');
      const spanStatus = document.createElement('span');
      spanStatus.className = badgeClass;
      spanStatus.textContent = statusText;
      tdStatus.appendChild(spanStatus);
      tr.appendChild(tdStatus);

      // 7. Cột Chi Tiết (Rule 5: textContent)
      const tdMessage = document.createElement('td');
      tdMessage.style.fontSize = '11px';
      tdMessage.style.color = '#94a3b8';
      tdMessage.textContent = h.message || '';
      tr.appendChild(tdMessage);

      historyTableBody.appendChild(tr);
    });
  }

  historyFilterAccount?.addEventListener('change', () => renderHistory());
  historyFilterStatus?.addEventListener('change', () => renderHistory());
  historyFilterType?.addEventListener('change', () => renderHistory());
  historySearchInput?.addEventListener('input', () => renderHistory());

  btnClearHistory?.addEventListener('click', async () => {
    if (confirm('Bạn có chắc muốn xóa sạch toàn bộ lịch sử đăng bài?')) {
      await chrome.storage.local.set({ postHistory: [] });
      renderHistory();
      showToast('Đã xóa sạch lịch sử.');
    }
  });

  btnExportHistoryCsv?.addEventListener('click', async () => {
    const res = await chrome.storage.local.get(['postHistory']);
    const history = Array.isArray(res.postHistory) ? res.postHistory : [];
    const filtered = getFilteredHistoryFromUI(history);
    if (!filtered.length) {
      alert('Không có dữ liệu lịch sử nào để xuất CSV!');
      return;
    }
    const csvContent = (typeof SharedStorage !== 'undefined' && typeof SharedStorage.formatHistoryToCsv === 'function')
      ? SharedStorage.formatHistoryToCsv(filtered)
      : '\uFEFFSTT,Thời Gian,Tài Khoản,Nhóm,Trạng Thái\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lich_su_dang_bai_fb_${filtered.length}_muc_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`✓ Đã xuất ${filtered.length} dòng lịch sử ra file Excel (CSV)!`);
  });

  btnExportHistory?.addEventListener('click', async () => {
    const res = await chrome.storage.local.get(['postHistory']);
    const history = Array.isArray(res.postHistory) ? res.postHistory : [];
    const filtered = getFilteredHistoryFromUI(history);
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lich_su_dang_bai_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // ==========================================
  // HỆ THỐNG QUẢN LÝ BẢN QUYỀN TRÊN DASHBOARD
  // ==========================================
  const licenseHeaderPill = document.getElementById('licenseHeaderPill');
  const licenseHeaderTitle = document.getElementById('licenseHeaderTitle');
  const licenseHeaderIcon = document.getElementById('licenseHeaderIcon');
  const btnHeaderLicenseAction = document.getElementById('btnHeaderLicenseAction');

  const licClientName = document.getElementById('licClientName');
  const licClientPhone = document.getElementById('licClientPhone');
  const licKeyDisplay = document.getElementById('licKeyDisplay');
  const licBadgeStatus = document.getElementById('licBadgeStatus');
  const licBadgeStatusCard = document.getElementById('licBadgeStatusCard');
  const licDaysLeftText = document.getElementById('licDaysLeftText');
  const licExpiresAtText = document.getElementById('licExpiresAtText');
  const licPlanTypeText = document.getElementById('licPlanTypeText');
  const licDevicesCount = document.getElementById('licDevicesCount');
  const licCurrentDeviceId = document.getElementById('licCurrentDeviceId');
  const licDeviceId = document.getElementById('licDeviceId');

  const inputNewLicenseKey = document.getElementById('inputNewLicenseKey');
  const btnSubmitActivateLicense = document.getElementById('btnSubmitActivateLicense');
  const btnRefreshLicenseStatus = document.getElementById('btnRefreshLicenseStatus');

  const modalActivateLicense = document.getElementById('modalActivateLicense');
  const inputModalLicenseKey = document.getElementById('inputModalLicenseKey');
  const btnSubmitModalActivate = document.getElementById('btnSubmitModalActivate');
  const btnCloseActivateModal = document.getElementById('btnCloseActivateModal');
  const btnCancelActivateModal = document.getElementById('btnCancelActivateModal');
  const linkGoToBuyPackages = document.getElementById('linkGoToBuyPackages');

  // Mở modal kích hoạt bản quyền
  window.openActivateModal = async function() {
    switchTab('license');
    const modal = document.getElementById('modalActivateLicense');
    const input = document.getElementById('inputModalLicenseKey');
    const devEl = document.getElementById('modalActiveDeviceId');
    const curDev = document.getElementById('licCurrentDeviceId');
    const devId = await getOrInitDeviceId();
    if (devEl) devEl.innerText = devId;
    if (curDev) curDev.innerText = devId;
    if (modal) modal.style.display = 'flex';
    if (input) {
      setTimeout(() => input.focus(), 150);
    }
  };

  window.closeActivateModal = function() {
    const modal = document.getElementById('modalActivateLicense');
    if (modal) modal.style.display = 'none';
  };

  // Thực thi kích hoạt bản quyền
  async function performActivateKey(rawKey, resultContainerId = 'licenseActivationResultMsg') {
    const key = (rawKey || '').trim().toUpperCase();
    const resultEl = document.getElementById(resultContainerId);
    if (!key) {
      alert('Vui lòng nhập hoặc dán mã bản quyền của bạn!');
      return;
    }

    if (resultEl) {
      resultEl.style.display = 'block';
      resultEl.style.background = 'rgba(56, 189, 248, 0.15)';
      resultEl.style.color = '#38bdf8';
      resultEl.style.border = '1px solid rgba(56, 189, 248, 0.4)';
      resultEl.innerText = '⏳ Đang xác thực và kích hoạt mã trên máy chủ...';
    }

    chrome.runtime.sendMessage({ action: 'ACTIVATE_LICENSE', key }, (res) => {
      if (res && res.success) {
        if (resultEl) {
          resultEl.style.background = 'rgba(16, 185, 129, 0.2)';
          resultEl.style.color = '#34d399';
          resultEl.style.border = '1px solid rgba(16, 185, 129, 0.5)';
          resultEl.innerText = `✓ ${res.message || 'Kích hoạt thành công!'}`;
        }
        showToast('✓ Kích hoạt bản quyền thành công! Chúc bạn tuyển dụng hiệu quả.');
        loadLicenseDetails(true);
        fetchMyOrdersAndSync(true);
        setTimeout(() => {
          window.closeActivateModal();
        }, 1500);
      } else {
        const errMsg = res?.message || 'Mã bản quyền không tồn tại hoặc không hợp lệ!';
        if (resultEl) {
          resultEl.style.background = 'rgba(239, 68, 68, 0.2)';
          resultEl.style.color = '#f87171';
          resultEl.style.border = '1px solid rgba(239, 68, 68, 0.5)';
          resultEl.innerText = `🚨 Lỗi kích hoạt: ${errMsg}`;
        }
        alert(`🚨 KÍCH HOẠT THẤT BẠI:\n\n${errMsg}\n\nVui lòng kiểm tra lại mã hoặc liên hệ Zalo 0869.029.310 để Quản trị viên hỗ trợ!`);
      }
    });
  }

  // Gắn sự kiện cho các nút kích hoạt
  btnSubmitActivateLicense?.addEventListener('click', () => {
    performActivateKey(inputNewLicenseKey?.value, 'licenseActivationResultMsg');
  });
  inputNewLicenseKey?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      performActivateKey(inputNewLicenseKey?.value, 'licenseActivationResultMsg');
    }
  });

  btnSubmitModalActivate?.addEventListener('click', () => {
    performActivateKey(inputModalLicenseKey?.value, 'modalActivateResultMsg');
  });
  inputModalLicenseKey?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      performActivateKey(inputModalLicenseKey?.value, 'modalActivateResultMsg');
    }
  });

  btnRefreshLicenseStatus?.addEventListener('click', () => {
    loadLicenseDetails(true);
    fetchMyOrdersAndSync(true);
    showToast('✓ Đang làm mới trạng thái bản quyền trực tuyến...');
  });

  btnCloseActivateModal?.addEventListener('click', () => window.closeActivateModal());
  btnCancelActivateModal?.addEventListener('click', () => window.closeActivateModal());
  modalActivateLicense?.addEventListener('click', (e) => {
    if (e.target === modalActivateLicense) window.closeActivateModal();
  });

  window.scrollToPricingTable = function() {
    switchTab('license');
    if (window.closeActivateModal) window.closeActivateModal();
    const pricingEl = document.getElementById('packagesPricingTable') || document.querySelector('.license-plans-grid');
    if (pricingEl) {
      pricingEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      pricingEl.classList.add('pricing-highlight-pulse');
      setTimeout(() => pricingEl.classList.remove('pricing-highlight-pulse'), 3600);
    }
  };

  linkGoToBuyPackages?.addEventListener('click', () => {
    window.closeActivateModal();
    window.scrollToPricingTable();
  });

  licenseHeaderPill?.addEventListener('click', () => {
    window.scrollToPricingTable();
  });
  btnHeaderLicenseAction?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.scrollToPricingTable();
  });

  const btnQuickRenewModal = document.getElementById('btnQuickRenewModal');
  btnQuickRenewModal?.addEventListener('click', () => {
    window.scrollToPricingTable();
  });

  async function loadLicenseDetails(forceRemote = true) {
    const activeId = await getOrInitDeviceId();
    updateDeviceDomElements(activeId);

    chrome.runtime.sendMessage({ action: 'GET_DEVICE_ID' }, (devRes) => {
      if (devRes?.deviceId && devRes.deviceId !== 'Đang lấy...') {
        updateDeviceDomElements(devRes.deviceId);
      }
    });

    chrome.runtime.sendMessage({ action: 'CHECK_LICENSE', forceRemote }, (res) => {
      if (!res) return;

      const expiryAlertCard = document.getElementById('licenseExpiryAlertCard');
      const expiryAlertBadge = document.getElementById('expiryAlertBadge');
      const expiryAlertDesc = document.getElementById('expiryAlertDesc');
      const lic = res.license || {};

      function parseExpDate(expStr) {
        if (!expStr) return 0;
        if (typeof expStr === 'number') return expStr;
        if (typeof expStr === 'string') {
          const s = expStr.trim();
          if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
            const parts = s.split('/');
            return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10), 23, 59, 59).getTime();
          }
          if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
            return new Date(s).getTime();
          }
          const d = new Date(s);
          if (!isNaN(d.getTime())) return d.getTime();
        }
        return 0;
      }

      const clientPhoneVal = lic.phone || localStorage.getItem('gialong_last_phone') || 'Chưa cập nhật';

      if (res.isValid && lic && !res.isRevoked && !lic.isRevoked && !lic.isSuspended) {
        const isTrialPlan = lic.planType === 'trial';
        const expMs = parseExpDate(lic.expiresAt);
        const daysLeft = expMs > Date.now()
          ? Math.max(1, Math.ceil((expMs - Date.now()) / (24 * 60 * 60 * 1000)))
          : (typeof lic.daysLeft === 'number' ? lic.daysLeft : parseInt(lic.daysLeft || '0', 10));
        const isExpiringSoon = daysLeft <= 3 && daysLeft >= 0;

        // Cập nhật Header Pill
        if (licenseHeaderPill) {
          licenseHeaderPill.style.background = isExpiringSoon
            ? 'rgba(234, 88, 12, 0.35)'
            : (isTrialPlan ? 'rgba(88, 28, 135, 0.35)' : 'rgba(6, 78, 59, 0.35)');
          licenseHeaderPill.style.borderColor = isExpiringSoon
            ? 'rgba(249, 115, 22, 0.5)'
            : (isTrialPlan ? 'rgba(168, 85, 247, 0.45)' : 'rgba(16, 185, 129, 0.45)');
        }
        if (licenseHeaderTitle) {
          const deviceText = lic.maxDevices > 1 ? `${lic.maxDevices} máy` : '1 máy';
          licenseHeaderTitle.innerText = isExpiringSoon
            ? `${lic.clientName} • Còn ${daysLeft} ngày (Sắp Hết Hạn)`
            : (isTrialPlan
                ? `${lic.clientName} (DÙNG THỬ 1N • 20 BÀI)`
                : `${lic.clientName} (${deviceText}) • ${daysLeft} ngày`);
          licenseHeaderTitle.style.color = isExpiringSoon ? '#fbbf24' : (isTrialPlan ? '#d8b4fe' : '#6ee7b7');
        }
        if (licenseHeaderIcon) licenseHeaderIcon.innerText = isExpiringSoon ? '⏰' : (isTrialPlan ? '🎁' : '💎');
        if (btnHeaderLicenseAction) {
          btnHeaderLicenseAction.innerText = isExpiringSoon ? 'Gia Hạn' : (isTrialPlan ? 'DÙNG THỬ' : 'VIP');
          btnHeaderLicenseAction.className = isExpiringSoon ? 'btn btn-amber' : (isTrialPlan ? 'btn btn-sub' : 'btn btn-emerald');
        }

        // Cập nhật Trang License
        if (licClientName) licClientName.innerText = lic.clientName || (isTrialPlan ? 'Khách Hàng Dùng Thử' : 'Khách Hàng VIP');
        if (licClientPhone) licClientPhone.innerText = clientPhoneVal;
        if (licKeyDisplay) licKeyDisplay.innerText = lic.key;
        if (licDeviceId) licDeviceId.innerText = activeId;
        const activeBadgeText = isExpiringSoon
          ? `⚠️ SẮP HẾT HẠN (CÒN ${daysLeft} NGÀY)`
          : (isTrialPlan ? '🎁 GÓI DÙNG THỬ (20 BÀI ĐĂNG)' : '✓ BẢN QUYỀN HỢP LỆ');
        const activeBadgeClass = isExpiringSoon ? 'badge-failed' : 'badge-success';
        if (licBadgeStatus) {
          licBadgeStatus.innerText = activeBadgeText;
          licBadgeStatus.className = activeBadgeClass;
        }
        if (licBadgeStatusCard) {
          licBadgeStatusCard.innerText = activeBadgeText;
          licBadgeStatusCard.className = activeBadgeClass;
        }
        if (licDaysLeftText) {
          licDaysLeftText.innerText = `${daysLeft} ngày`;
        }
        if (licExpiresAtText) {
          try {
            licExpiresAtText.innerText = new Date(parseExpDate(lic.expiresAt)).toLocaleDateString('vi-VN');
          } catch (e) {
            licExpiresAtText.innerText = lic.expiresAt || '---';
          }
        }
        if (licPlanTypeText) {
          licPlanTypeText.innerText = isTrialPlan
            ? '0 VNĐ (Gói Dùng Thử 1 Ngày • Giới hạn 20 bài đăng)'
            : `1.000.000đ / tháng (${lic.maxDevices || 1} máy)`;
        }
        if (licDevicesCount) {
          licDevicesCount.innerText = `${lic.activeDevicesCount || 1} / ${lic.maxDevices || 1} máy tính`;
        }

        // 3. KHỐI NHẮC KHÁCH MUA GÓI MỚI KHI CÁCH NGÀY HẾT HẠN <= 3 NGÀY (ẢNH 2)
        if (expiryAlertCard) {
          if (isExpiringSoon) {
            expiryAlertCard.style.display = 'block';
            if (expiryAlertBadge) {
              expiryAlertBadge.innerText = daysLeft === 0 ? 'HẾT HẠN HÔM NAY' : `CÒN ${daysLeft} NGÀY`;
              expiryAlertBadge.style.background = daysLeft <= 1 ? '#dc2626' : '#ea580c';
            }
            if (expiryAlertDesc) {
              const expDate = lic.expiresAt ? (isNaN(new Date(lic.expiresAt).getTime()) ? lic.expiresAt : new Date(parseExpDate(lic.expiresAt)).toLocaleDateString('vi-VN')) : 'sắp tới';
              expiryAlertDesc.innerHTML = `Gói cước của máy tính này sẽ hết hạn vào ngày <strong style="color: #fbbf24;">${expDate}</strong> (chỉ còn ${daysLeft} ngày). Vui lòng đặt mua thêm gói bên dưới để được <strong style="color: #34d399;">cộng dồn thời hạn sử dụng</strong> ngay lập tức, không làm gián đoạn lịch đăng bài tự động!`;
            }
          } else {
            expiryAlertCard.style.display = 'none';
          }
        }
      } else {
        // Chưa kích hoạt, hết hạn hoặc bị thu hồi (Ngắt máy)
        if (expiryAlertCard) expiryAlertCard.style.display = 'none';

        const isRevoked = Boolean(res.isRevoked || lic?.isRevoked);
        const isExp = Boolean(res.isExpired || lic?.isExpired);

        if (licenseHeaderPill) {
          licenseHeaderPill.style.background = isRevoked || isExp ? 'rgba(136, 19, 55, 0.4)' : 'rgba(120, 53, 15, 0.25)';
          licenseHeaderPill.style.borderColor = isRevoked || isExp ? 'rgba(244, 63, 94, 0.5)' : 'rgba(245, 158, 11, 0.4)';
        }
        if (licenseHeaderTitle) {
          licenseHeaderTitle.innerText = isRevoked
            ? '🚫 Bản Quyền Đã Thu Hồi (Bị Khóa)'
            : isExp
            ? '🚨 Bản Quyền Đã Hết Hạn'
            : 'Chưa Kích Hoạt Bản Quyền';
          licenseHeaderTitle.style.color = isRevoked || isExp ? '#fda4af' : '#fbbf24';
        }
        if (licenseHeaderIcon) licenseHeaderIcon.innerText = isRevoked ? '🚫' : isExp ? '🚨' : '⚠️';
        if (btnHeaderLicenseAction) {
          btnHeaderLicenseAction.innerText = isRevoked ? 'Bị Khóa' : isExp ? 'Gia Hạn' : 'Kích Hoạt';
          btnHeaderLicenseAction.className = isRevoked ? 'btn btn-danger' : 'btn btn-amber';
        }

        if (licClientName) licClientName.innerText = lic?.clientName ? `${lic.clientName} (${isRevoked ? 'Đã Thu Hồi' : 'Hết Hạn'})` : (isRevoked ? 'Bản Quyền Bị Thu Hồi' : 'Chưa Kích Hoạt');
        if (licClientPhone) licClientPhone.innerText = clientPhoneVal !== 'Chưa cập nhật' ? clientPhoneVal : '---';
        if (licKeyDisplay) licKeyDisplay.innerText = lic?.key ? lic.key : 'Chưa có mã';
        if (licDeviceId) licDeviceId.innerText = activeId;
        if (licExpiresAtText) licExpiresAtText.innerText = isRevoked ? 'Đã thu hồi' : (isExp ? 'Đã hết hạn' : 'Cần đặt mua / duyệt gói');
        const inactiveBadgeText = isRevoked ? '🚫 ĐÃ THU HỒI (NGẮT MÁY)' : isExp ? '🚨 HẾT HẠN' : 'CHƯA KÍCH HOẠT';
        if (licBadgeStatus) {
          licBadgeStatus.innerText = inactiveBadgeText;
          licBadgeStatus.className = 'badge-failed';
        }
        if (licBadgeStatusCard) {
          licBadgeStatusCard.innerText = inactiveBadgeText;
          licBadgeStatusCard.className = 'badge-failed';
        }
        if (licDaysLeftText) {
          licDaysLeftText.innerText = '0 ngày';
        }
        if (licPlanTypeText) licPlanTypeText.innerText = isRevoked ? 'Bị ngắt kết nối' : 'Chưa xác định';
        if (licDevicesCount) licDevicesCount.innerText = '0 / 0 máy';
      }
    });
  }

  btnRefreshLicenseStatus?.addEventListener('click', () => {
    loadLicenseDetails(true);
    chrome.runtime.sendMessage({ action: 'SYNC_ADMIN_STATUS' }, () => {
      loadLicenseDetails(true);
    });
    showToast('🔄 Đang kiểm tra và đồng bộ lại bản quyền với máy chủ...');
  });

  // ==========================================
  // LỊCH SỬ ĐƠN ĐẶT MUA & ĐỒNG BỘ HAI CHIỀU VỚI QUẢN TRỊ (ẨN & TỰ ĐỘNG KÍCH HOẠT)
  // ==========================================
  const clientOrdersHistoryList = document.getElementById('clientOrdersHistoryList');

  async function loadAndRenderClientOrders(forceRemote = false) {
    if (!clientOrdersHistoryList) return;
    if (forceRemote && !clientOrdersHistoryList.children.length) {
      clientOrdersHistoryList.innerHTML = '<div style="color: #38bdf8; text-align: center; padding: 10px;">⏳ Đang đồng bộ với máy chủ Quản trị viên...</div>';
    }

    chrome.runtime.sendMessage({ action: 'SYNC_ADMIN_STATUS' }, (res) => {
      const orders = res?.orders || [];
      if (!orders || orders.length === 0) {
        clientOrdersHistoryList.innerHTML = '<div style="color: #64748b; text-align: center; padding: 10px;">Chưa có đơn đặt mua nào. Chọn một trong các gói bên dưới để gửi yêu cầu duyệt tự động!</div>';
        return;
      }

      let html = '';
      const approvedOrders = orders.filter((o) => o.status === 'approved');

      // Banner thông báo cộng dồn tất cả các gói đã mua thành công
      if (approvedOrders.length > 1) {
        let totalDays = 0;
        approvedOrders.forEach((ao) => {
          const p = (ao.pkgName || '').toLowerCase();
          if (p.includes('3 tháng') || p.includes('90 ngày') || p.includes('100 ngày')) totalDays += 100;
          else if (p.includes('6 tháng') || p.includes('180 ngày') || p.includes('195 ngày')) totalDays += 195;
          else if (p.includes('1 năm') || p.includes('12 tháng') || p.includes('360 ngày') || p.includes('390 ngày')) totalDays += 390;
          else if (p.includes('dùng thử') || p.includes('1 ngày')) totalDays += 1;
          else totalDays += 30;
        });

        html += `
          <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 78, 59, 0.35)); border: 1.5px solid rgba(16, 185, 129, 0.6); border-radius: 10px; padding: 10px 14px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 4px 12px rgba(16,185,129,0.15);">
            <div style="display: flex; align-items: center; gap: 9px;">
              <span style="font-size: 20px;">💎</span>
              <div>
                <div style="color: #34d399; font-weight: 800; font-size: 12.5px;">✓ ĐÃ CỘNG DỒN TẤT CẢ ${approvedOrders.length} GÓI MUA THÀNH CÔNG</div>
                <div style="color: #cbd5e1; font-size: 11px; margin-top: 1px;">Toàn bộ ${approvedOrders.length} gói mua đã được hợp nhất thành một bản quyền VIP duy nhất cho máy này.</div>
              </div>
            </div>
            <div style="text-align: right;">
              <span style="background: #10b981; color: #042f2e; font-weight: 900; padding: 3px 10px; border-radius: 999px; font-size: 11px; letter-spacing: 0.3px;">TỔNG ${totalDays} NGÀY</span>
            </div>
          </div>
        `;
      }

      orders.forEach((o) => {
        const isApproved = o.status === 'approved';
        const isPending = o.status === 'pending';
        const statusBadge = isApproved
          ? '<span style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); padding: 2px 7px; border-radius: 999px; font-weight: bold; font-size: 10px;">✅ Đã Phê Duyệt</span>'
          : '<span style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); padding: 2px 7px; border-radius: 999px; font-weight: bold; font-size: 10px;">⏳ Chờ Quản Trị Duyệt</span>';

        const shortId = (o.id || '').slice(-8).toUpperCase();
        const dateStr = o.createdAt ? new Date(o.createdAt).toLocaleString('vi-VN') : '';

        // Tự động kích hoạt ngầm trực tuyến nếu đơn đã duyệt mà máy chưa nhận
        if (isApproved && o.generatedKey) {
          chrome.storage.local.get(['licenseKey', 'licenseData'], (st) => {
            if (!st.licenseKey || !st.licenseData?.isValid || st.licenseKey !== o.generatedKey) {
              chrome.runtime.sendMessage({ action: 'ACTIVATE_LICENSE', key: o.generatedKey }, (actRes) => {
                if (actRes?.success) {
                  loadLicenseDetails(false);
                }
              });
            }
          });
        }

        let keyActionHtml = '';
        if (isApproved) {
          keyActionHtml = `
            <div style="margin-top: 5px; padding: 5px 8px; background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 6px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #34d399;">
              <span>⚡ Gói này đã được cộng dồn vào thời hạn bản quyền VIP của máy!</span>
              <span style="font-weight: 800;">✓ Hoạt Động</span>
            </div>
          `;
        } else if (isPending) {
          keyActionHtml = `
            <div style="margin-top: 4px; color: #94a3b8; font-size: 10px;">
              💡 <em>Đang chờ Quản trị viên duyệt (khoảng 1-3 phút). Tiện ích sẽ tự động nhận bản quyền ngay khi được duyệt!</em>
            </div>
          `;
        }

        const isTrial = (o.price === '0đ' || String(o.pkgName).includes('Dùng Thử'));
        const pkgIcon = isTrial ? '🎁' : '💎';

        html += `
          <div style="background: #0f172a; border: 1px solid ${isApproved ? 'rgba(16, 185, 129, 0.4)' : '#1e293b'}; border-radius: 9px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 14px;">${pkgIcon}</span>
                <div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <strong style="color: #ffffff; font-size: 12px;">${o.pkgName || 'Gói Bản Quyền'}</strong>
                    <span style="color: #34d399; font-weight: 800; font-size: 12px;">${o.price || '0đ'}</span>
                  </div>
                  <div style="font-size: 10.5px; color: #94a3b8; display: flex; align-items: center; gap: 6px; margin-top: 1px;">
                    <span>Mã đơn: <code style="color: #38bdf8; font-family: monospace;">#${shortId}</code></span>
                    ${o.deviceId ? `<span>• Máy: <code style="color: #cbd5e1; font-family: monospace;">${o.deviceId}</code></span>` : ''}
                  </div>
                </div>
              </div>
              <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px;">
                ${statusBadge}
                <span style="color: #64748b; font-size: 10px; margin-top: 2px;">${dateStr}</span>
              </div>
            </div>
            ${keyActionHtml}
          </div>
        `;
      });

      clientOrdersHistoryList.innerHTML = html;
    });
  }

  // Cơ chế đồng bộ ẩn: Tự động chạy định kỳ 3 giây để cập nhật tức thì hai chiều giữa Quản trị và Extension
  setInterval(() => {
    loadLicenseDetails(false);
    loadAndRenderClientOrders(false);
  }, 3000);

  // Tự động tải danh sách đơn hàng của khách
  loadAndRenderClientOrders(false);

  // Cấu hình máy chủ bản quyền tùy chỉnh
  const inputCustomServerUrl = document.getElementById('inputCustomServerUrl');
  const btnSaveCustomServerUrl = document.getElementById('btnSaveCustomServerUrl');
  const btnResetDefaultServerUrl = document.getElementById('btnResetDefaultServerUrl');

  chrome.storage.local.get(['customApiServerUrl'], (res) => {
    if (inputCustomServerUrl) {
      inputCustomServerUrl.value = res.customApiServerUrl || 'https://gia-long---tuy-n-d-ng.pages.dev';
    }
  });

  btnSaveCustomServerUrl?.addEventListener('click', () => {
    const val = inputCustomServerUrl?.value.trim();
    if (!val) return alert('Vui lòng nhập URL máy chủ hợp lệ!');
    chrome.storage.local.set({ customApiServerUrl: val }, () => {
      showToast('✓ Đã lưu máy chủ bản quyền mới!');
      loadLicenseDetails(true);
    });
  });

  btnResetDefaultServerUrl?.addEventListener('click', () => {
    const defaultUrl = 'https://gia-long---tuy-n-d-ng.pages.dev';
    if (inputCustomServerUrl) inputCustomServerUrl.value = defaultUrl;
    chrome.storage.local.set({ customApiServerUrl: defaultUrl }, () => {
      showToast('✓ Đã khôi phục máy chủ mặc định!');
      loadLicenseDetails(true);
    });
  });

  // Tải trạng thái bản quyền ngay khi mở trang
  loadLicenseDetails();

  // MODAL HƯỚNG DẪN SỬ DỤNG & LƯU Ý AN TOÀN
  const modalUserGuide = document.getElementById('modalUserGuide');
  const btnOpenUserGuideModal = document.getElementById('btnOpenUserGuideModal');
  const btnCloseUserGuideModal = document.getElementById('btnCloseUserGuideModal');
  const btnConfirmUserGuideModal = document.getElementById('btnConfirmUserGuideModal');

  btnOpenUserGuideModal?.addEventListener('click', (e) => {
    e.preventDefault();
    if (modalUserGuide) modalUserGuide.style.display = 'flex';
  });

  btnCloseUserGuideModal?.addEventListener('click', () => {
    if (modalUserGuide) modalUserGuide.style.display = 'none';
  });

  btnConfirmUserGuideModal?.addEventListener('click', () => {
    if (modalUserGuide) modalUserGuide.style.display = 'none';
  });

  modalUserGuide?.addEventListener('click', (e) => {
    if (e.target === modalUserGuide) {
      modalUserGuide.style.display = 'none';
    }
  });

  // THEO DÕI TRẠNG THÁI TIẾN TRÌNH & CẢNH BÁO SPAM FACEBOOK
  const modalSpam = document.getElementById('modalFbSpamWarning');
  const btnAckSpam = document.getElementById('btnAcknowledgeSpamWarning');
  const spamGroupName = document.getElementById('spamWarnGroupName');
  const spamWarnDetails = document.getElementById('spamWarnDetails');

  btnAckSpam?.addEventListener('click', async () => {
    if (modalSpam) modalSpam.style.display = 'none';
    await chrome.storage.local.remove(['fbSpamWarningAlert']);
    showToast('✓ Đã xác nhận dừng an toàn. Hãy cho tài khoản nghỉ ngơi và đợi ca đăng tiếp theo!');
  });

  setInterval(() => {
    chrome.storage.local.get(['postJobState', 'fbSpamWarningAlert'], (res) => {
      // 1. Kiểm tra cảnh báo giới hạn Facebook
      if (res.fbSpamWarningAlert && res.fbSpamWarningAlert.isBlocked) {
        if (modalSpam && modalSpam.style.display !== 'flex') {
          if (spamGroupName) spamGroupName.innerText = res.fbSpamWarningAlert.groupName || 'Nhóm Facebook';
          if (spamWarnDetails) spamWarnDetails.innerText = res.fbSpamWarningAlert.error || 'Facebook thông báo: "Để bảo vệ cộng đồng khỏi spam, chúng tôi giới hạn tần suất bạn đăng bài..."';
          modalSpam.style.display = 'flex';
        }
      }

      // 2. Cập nhật tiến trình đăng
      const state = res.postJobState;
      if (!state) return;
      if (state.isRunning) {
        if (btnStartRun) btnStartRun.style.display = 'none';
        if (btnStopRun) btnStopRun.style.display = 'block';
        if (progressArea) progressArea.style.display = 'block';
        if (statusLabel) statusLabel.innerText = state.statusText || 'Đang đăng...';
        const percent = Math.min(100, Math.round(((state.currentIndex || 0) / (state.totalGroups || 1)) * 100));
        if (progressBar) progressBar.style.width = `${percent}%`;
      } else {
        if (btnStartRun) btnStartRun.style.display = 'block';
        if (btnStopRun) btnStopRun.style.display = 'none';
        if (state.statusText && statusLabel) statusLabel.innerText = state.statusText;
      }
    });
  }, 800);
});


  

// Helper tạo mã ký hiệu gói cước và nội dung chuyển khoản chuẩn: Tên, SĐT, gói cước (1TH, 3TH, 6TH, 1N..), mã máy
function getPackageCodeSymbol(pkgName) {
  if (!pkgName) return '1TH';
  const lower = pkgName.toLowerCase();
  if (lower.includes('12 tháng') || lower.includes('12m') || lower.includes('360 ngày') || lower.includes('390 ngày') || lower.includes('1 năm') || lower.includes('1 nam') || lower.includes('13 tháng')) {
    return '1N';
  }
  if (lower.includes('6 tháng') || lower.includes('6m') || lower.includes('180 ngày') || lower.includes('195 ngày')) {
    return '6TH';
  }
  if (lower.includes('3 tháng') || lower.includes('3m') || lower.includes('90 ngày') || lower.includes('100 ngày')) {
    return '3TH';
  }
  if (lower.includes('1 tháng') || lower.includes('1m') || lower.includes('30 ngày')) {
    return '1TH';
  }
  return '1TH';
}

function removeAccentsUpper(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'D')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .toUpperCase();
}

function generateTransferMemo(customerName, phone, pkgName, deviceId) {
  const cleanName = removeAccentsUpper(customerName);
  const cleanPhone = (phone || '').replace(/\D/g, '').trim();
  const pkgCode = getPackageCodeSymbol(pkgName);
  const cleanDevId = (deviceId || 'AFB-PC').trim();
  
  // Cấu trúc thông tin theo yêu cầu: Tên, SĐT, gói cước (1TH 3TH 6TH 1N..), mã máy
  const parts = [];
  if (cleanName) parts.push(cleanName);
  if (cleanPhone) parts.push(cleanPhone);
  parts.push(pkgCode);
  parts.push(cleanDevId);
  return parts.join(' ');
}

let qrDebounceTimer = null;
window.updateOrderTransferMemoAndQr = function(immediateQr = false) {
  const pkg = window.currentSelectedPkg || { name: 'Gói 1 Tháng (30 ngày)', price: '1.000.000đ' };
  const nameInput = document.getElementById('orderCustomerName');
  const phoneInput = document.getElementById('orderCustomerPhone');

  let devId = cachedDeviceId && cachedDeviceId !== 'Đang lấy...' ? cachedDeviceId : '';
  if (!devId) {
    const devIdEl = document.getElementById('licCurrentDeviceId');
    if (devIdEl && devIdEl.innerText && devIdEl.innerText !== 'Đang lấy...') {
      devId = devIdEl.innerText.trim();
    }
  }
  if (!devId) {
    try {
      const localId = localStorage.getItem('autorecruit_device_id');
      if (localId && localId !== 'Đang lấy...') devId = localId;
    } catch (e) {}
  }
  if (!devId) {
    devId = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
  }
  updateDeviceDomElements(devId);

  const customerName = nameInput ? nameInput.value.trim() : '';
  const customerPhone = phoneInput ? phoneInput.value.trim() : '';

  if (customerPhone) {
    try { localStorage.setItem('gialong_last_phone', customerPhone); } catch (e) {}
  }
  if (customerName) {
    try { localStorage.setItem('gialong_last_name', customerName); } catch (e) {}
  }

  const memo = generateTransferMemo(customerName, customerPhone, pkg.name, devId);

  const memoEl = document.getElementById('modalTransferMemo');
  const qrImg = document.getElementById('modalQrCodeImg');

  if (memoEl) memoEl.innerText = memo;

  const rawNum = parseInt((pkg.price || '1.000.000đ').replace(/\D/g, ''), 10) || 1000000;
  if (qrImg) {
    clearTimeout(qrDebounceTimer);
    if (immediateQr) {
      qrImg.src = `https://img.vietqr.io/image/tpbank-10005959864-compact2.png?amount=${rawNum}&addInfo=${encodeURIComponent(memo)}&accountName=NGUYEN%20VAN%20HIEU`;
    } else {
      qrDebounceTimer = setTimeout(() => {
        qrImg.src = `https://img.vietqr.io/image/tpbank-10005959864-compact2.png?amount=${rawNum}&addInfo=${encodeURIComponent(memo)}&accountName=NGUYEN%20VAN%20HIEU`;
      }, 180);
    }
  }
  return memo;
};

// Xử lý Hộp Thoại Đặt Mua Gói Bản Quyền Tự Động (Phương án A)
window.currentSelectedPkg = { name: 'Gói 3 Tháng', price: '2.700.000đ' };

window.openOrderModal = async function(pkgName, pkgPrice) {
  window.currentSelectedPkg = { name: pkgName, price: pkgPrice };

  // Cập nhật Banner Gói Đang Chọn trên giao diện Dashboard
  const bannerName = document.getElementById('bannerSelectedPkgName');
  const bannerPrice = document.getElementById('bannerSelectedPkgPrice');
  const bannerDiscount = document.getElementById('bannerSelectedPkgDiscount');
  const bannerBtn = document.getElementById('btnBannerOpenOrderModal');

  const isTrial = (pkgPrice === '0đ' || String(pkgName).includes('Dùng Thử') || String(pkgName).toLowerCase().includes('trial'));

  if (bannerName) bannerName.innerText = pkgName;
  if (bannerPrice) bannerPrice.innerText = `(${pkgPrice})`;

  let discountText = '';
  if (pkgName.includes('3 Tháng')) discountText = '• Tiết kiệm 800.000đ (-10%)';
  else if (pkgName.includes('6 Tháng')) discountText = '• Tiết kiệm 1.600.000đ';
  else if (pkgName.includes('12 Tháng')) discountText = '• Tiết kiệm 3.200.000đ';
  else if (isTrial) discountText = '• Miễn phí 100%, không cần chuyển khoản';

  if (bannerDiscount) {
    bannerDiscount.innerText = discountText;
    bannerDiscount.style.display = discountText ? 'inline' : 'none';
  }

  if (bannerBtn) {
    bannerBtn.innerHTML = isTrial
      ? '<span>🚀 Đăng Ký Dùng Thử Ngay (0đ)</span>'
      : '<span>🚀 Mở Hộp Thoại Đặt Mua &amp; Quét QR</span>';
  }

  // Highlight thẻ được chọn trong bảng 5 gói
  document.querySelectorAll('.pkg-card').forEach((card) => {
    if (card.getAttribute('data-pkg-name') === pkgName || card.getAttribute('data-pkg-name')?.includes(pkgName)) {
      card.style.borderColor = '#38bdf8';
      card.style.boxShadow = '0 0 20px rgba(56, 189, 248, 0.4)';
    } else {
      card.style.borderColor = '';
      card.style.boxShadow = '';
    }
  });

  const modal = document.getElementById('modalOrderPackage');
  const nameEl = document.getElementById('modalPkgName');
  const priceEl = document.getElementById('modalPkgPrice');
  const devEl = document.getElementById('modalDeviceId');
  const phoneInput = document.getElementById('orderCustomerPhone');
  const nameInput = document.getElementById('orderCustomerName');

  const devId = await getOrInitDeviceId();
  updateDeviceDomElements(devId);

  if (nameEl) nameEl.innerText = pkgName;
  if (priceEl) priceEl.innerText = pkgPrice;
  if (devEl) devEl.innerText = devId;

  const paidBox = document.getElementById('modalPaidQrBox');
  const trialBox = document.getElementById('modalTrialInfoBox');
  const trialDevId = document.getElementById('trialDeviceIdNotice');
  if (trialDevId) trialDevId.innerText = devId;

  if (isTrial) {
    if (paidBox) paidBox.style.display = 'none';
    if (trialBox) trialBox.style.display = 'flex';
  } else {
    if (paidBox) paidBox.style.display = 'flex';
    if (trialBox) trialBox.style.display = 'none';
  }

  // Tự động điền SĐT và Tên nếu khách hàng đã từng nhập trước đó
  try {
    const savedPhone = localStorage.getItem('gialong_last_phone');
    const savedName = localStorage.getItem('gialong_last_name');
    if (phoneInput && !phoneInput.value && savedPhone) {
      phoneInput.value = savedPhone;
    }
    if (nameInput && !nameInput.value && savedName) {
      nameInput.value = savedName;
    }
  } catch (e) {}

  // Cập nhật Nội dung CK theo cấu trúc: Tên, SĐT, gói cước (1TH 3TH 6TH 1N..), mã máy
  if (!isTrial) {
    window.updateOrderTransferMemoAndQr(true);
  }

  // Reset hiển thị về form nhập ban đầu
  const formBody = document.getElementById('orderFormBody');
  const successBody = document.getElementById('orderSuccessBody');
  if (formBody) formBody.style.display = 'grid';
  if (successBody) successBody.style.display = 'none';

  const btnSubmit = document.getElementById('btnSubmitOrderOnline');
  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = isTrial ? '🚀 Xác Nhận Kích Hoạt Dùng Thử (0đ)' : '🚀 Xác Nhận Mua';
  }

  if (modal) {
    modal.style.display = 'flex';
  }
};

window.closeOrderModal = function() {
  const modal = document.getElementById('modalOrderPackage');
  if (modal) modal.style.display = 'none';
};

// Hàm xác nhận chuyển khoản và gửi đơn đặt mua
window.submitOrderOnline = async function() {
  const pkg = window.currentSelectedPkg || { name: 'Gói 1 Tháng (30 ngày)', price: '1.000.000đ' };
  const phoneInput = document.getElementById('orderCustomerPhone');
  const nameInput = document.getElementById('orderCustomerName');
  const phone = phoneInput ? phoneInput.value.trim() : '';
  const customerName = nameInput ? nameInput.value.trim() : '';

  if (!phone || phone.length < 8) {
    alert('Vui lòng nhập Số điện thoại hoặc Zalo hợp lệ để hệ thống và Quản trị viên gửi mã kích hoạt cho bạn!');
    phoneInput?.focus();
    return;
  }

  const isTrial = (pkg.price === '0đ' || String(pkg.name).includes('Dùng Thử') || String(pkg.name).toLowerCase().includes('trial'));
  
  if (!isTrial) {
    // Hiện hộp thoại hỏi lại về việc đã chuyển khoản chưa
    const modalConfirm = document.getElementById('modalConfirmTransferCheck');
    const priceEl = document.getElementById('confirmCheckPrice');
    const memoEl = document.getElementById('confirmCheckMemo');
    const devId = (cachedDeviceId && cachedDeviceId !== 'Đang lấy...') ? cachedDeviceId : (await getOrInitDeviceId());
    updateDeviceDomElements(devId);
    const memo = generateTransferMemo(customerName, phone, pkg.name, devId);

    if (priceEl) priceEl.innerText = pkg.price;
    if (memoEl) memoEl.innerText = memo;

    if (modalConfirm) {
      modalConfirm.style.display = 'flex';
    } else {
      // Fallback nếu không tìm thấy modal confirm
      if (confirm(`Bạn đã chuyển khoản ${pkg.price} tới TPBank 1000 5959 864 (Chủ TK: Nguyễn Văn Hiệu - Nội dung: ${memo}) chưa?\n\nBấm OK nếu đã chuyển khoản thành công để gửi lệnh mua đi!`)) {
        window.proceedSendOrder();
      }
    }
  } else {
    // Gói dùng thử miễn phí 0đ
    if (confirm('🎁 Xác nhận gửi yêu cầu kích hoạt Gói Dùng Thử 1 Ngày (0đ - Miễn phí 100%) lên hệ thống Quản Trị Viên?')) {
      window.proceedSendOrder();
    }
  }
};

// Hàm thực thi hoàn tất quá trình mua và gửi lệnh mua lên Server
let isSubmittingOrder = false;
window.proceedSendOrder = async function() {
  if (isSubmittingOrder) return;
  isSubmittingOrder = true;

  const modalConfirm = document.getElementById('modalConfirmTransferCheck');
  if (modalConfirm) modalConfirm.style.display = 'none';

  const devId = (cachedDeviceId && cachedDeviceId !== 'Đang lấy...') ? cachedDeviceId : (await getOrInitDeviceId());
  updateDeviceDomElements(devId);

  const pkg = window.currentSelectedPkg || { name: 'Gói 1 Tháng (30 ngày)', price: '1.000.000đ' };
  
  const phoneInput = document.getElementById('orderCustomerPhone');
  const nameInput = document.getElementById('orderCustomerName');
  const btnSubmit = document.getElementById('btnSubmitOrderOnline');

  const phone = phoneInput ? phoneInput.value.trim() : '';
  const customerName = nameInput ? nameInput.value.trim() : '';

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '⏳ Đang gửi đơn lên máy chủ...';
  }

  const isTrial = (pkg.price === '0đ' || String(pkg.name).includes('Dùng Thử') || String(pkg.name).toLowerCase().includes('trial'));
  const memo = generateTransferMemo(customerName, phone, pkg.name, devId);

  // Lưu thông tin SĐT và Tên để lần sau tự điền và tự động nhận diện bản quyền
  try {
    if (phone) {
      localStorage.setItem('gialong_last_phone', phone);
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ gialong_customer_phone: phone });
      }
    }
    if (customerName) localStorage.setItem('gialong_last_name', customerName);
  } catch (e) {}

  const stableOrderId = 'ord_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
  const orderPayload = {
    id: stableOrderId,
    pkgName: pkg.name,
    price: pkg.price,
    deviceId: devId,
    clientName: customerName || `Khách ${phone}`,
    phone: phone,
    note: isTrial
      ? `Đăng ký dùng thử 1 ngày (giới hạn 20 bài đăng, 0đ) từ Extension`
      : `Đơn mua ${pkg.name} từ Extension • Đã xác nhận CK: ${memo}`,
  };

  const showSuccessUI = (orderData) => {
    const formBody = document.getElementById('orderFormBody');
    const successBody = document.getElementById('orderSuccessBody');
    
    const successCode = document.getElementById('successOrderCode');
    const successPkg = document.getElementById('successPkgName');
    const successDev = document.getElementById('successDeviceId');
    const successPhone = document.getElementById('successCustomerPhone');

    if (successCode) successCode.innerText = orderData?.id || stableOrderId;
    if (successPkg) successPkg.innerText = pkg.name + ' (' + pkg.price + ')';
    if (successDev) successDev.innerText = devId;
    if (successPhone) successPhone.innerText = phone + (customerName ? ` (${customerName})` : '');

    if (formBody) formBody.style.display = 'none';
    if (successBody) successBody.style.display = 'flex';
  };

  // Hiển thị UI thành công NGAY LẬP TỨC (0ms) để khách hàng không phải chờ đợi load
  let uiShown = false;
  const triggerSuccessOnce = (data) => {
    if (uiShown) return;
    uiShown = true;
    showSuccessUI(data || orderPayload);
  };

  triggerSuccessOnce(orderPayload);

  // Gửi qua Background Service Worker (1 lần duy nhất)
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'CREATE_ORDER', payload: orderPayload });
    }
  } catch (e) {}

  // Gửi trực tiếp /api/orders/create duy nhất 1 lần tới API_BASE chính thức
  try {
    const apiBase = 'https://gia-long---tuy-n-d-ng.pages.dev';
    fetch(`${apiBase}/api/orders/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
    }).then((res) => {
      if (res.ok) console.log('[Gia Long FB] ✓ Đã gửi đơn hàng thành công lên máy chủ:', apiBase);
    }).catch(() => {});
  } catch (e) {}

  // Gửi trực tiếp sang Google Drive Sheet Webhook nếu có
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['googleDriveSheetWebhookUrl'], (res) => {
        const gdriveUrl = res?.googleDriveSheetWebhookUrl;
        if (gdriveUrl && gdriveUrl.startsWith('http')) {
          fetch(gdriveUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'ORDER_UPDATE',
              id: orderPayload.id,
              timestamp: new Date().toISOString(),
              timeFormatted: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
              clientName: customerName || orderPayload.clientName || 'Khách Đặt Mua (Dashboard)',
              phone: phone || orderPayload.phone || '',
              pkgName: pkg.name || orderPayload.pkgName || '',
              price: pkg.price || orderPayload.price || '',
              deviceId: devId || orderPayload.deviceId || '',
              status: 'pending',
              note: orderPayload.note || '',
              source: 'Gia Long FB Extension Dashboard',
            }),
          }).catch(() => {});
        }
      });
    }
  } catch (e) {}

  // 3. Khởi động kiểm tra nhanh phía Dashboard (3s/lần trong 5 phút)
  let dashFastPollCount = 0;
  const dashFastPollInterval = setInterval(async () => {
    dashFastPollCount += 3;
    if (dashFastPollCount >= 300) {
      clearInterval(dashFastPollInterval);
      return;
    }
    for (const base of candidateUrls) {
      try {
        const resp = await fetch(`${base}/api/check?machine_id=${encodeURIComponent(devId)}`, { cache: 'no-store' });
        if (!resp.ok) continue;
        const res = await resp.json();
        if (res && res.success && res.status === 'active') {
          clearInterval(dashFastPollInterval);
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            await chrome.storage.local.set({
              signedToken: res.token,
              licenseStatus: 'active',
              expiresAt: res.expires_at,
              lastCheckedAt: Date.now(),
              cachedPkgName: res.pkg_name,
              isVip: true,
              licenseKey: res.token || 'GLFB-VIP-ACTIVE',
              isRevoked: false,
            });
          }
          const successNotice = document.getElementById('orderSuccessBody');
          if (successNotice) {
            successNotice.innerHTML = `
              <div style="text-align: center; padding: 20px; background: #064e3b; border: 1px solid #10b981; border-radius: 12px; color: #fff;">
                <h3 style="font-size: 18px; font-weight: bold; margin-bottom: 8px;">🎉 QUẢN TRỊ VIÊN ĐÃ PHÊ DUYỆT!</h3>
                <p style="font-size: 14px; color: #a7f3d0; margin-bottom: 12px;">Bản quyền VIP của bạn đã được kích hoạt thành công (Hạn đến: ${new Date(res.expires_at).toLocaleDateString('vi-VN')}).</p>
                <button onclick="window.location.reload()" style="background: #10b981; color: #000; font-weight: bold; padding: 8px 18px; border: none; border-radius: 8px; cursor: pointer;">Sử Dụng Ngay</button>
              </div>
            `;
          }
          break;
        }
      } catch (e) {}
    }
  }, 3000);

  setTimeout(() => {
    isSubmittingOrder = false;
  }, 3000);
};

// Gắn sự kiện cho các nút trong Modal khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  const btnClose = document.getElementById('btnCloseOrderModal');
  const btnCancel = document.getElementById('btnCancelOrderPackage');
  const btnUnderstand = document.getElementById('btnUnderstandCloseOrder');
  const btnSubmit = document.getElementById('btnSubmitOrderOnline');
  const modalOrder = document.getElementById('modalOrderPackage');

  const btnBackToScan = document.getElementById('btnBackToScanQr');
  const btnConfirmedTransfer = document.getElementById('btnConfirmedTransferred');
  const modalConfirmTransfer = document.getElementById('modalConfirmTransferCheck');

  btnClose?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.closeOrderModal();
  });
  btnCancel?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.closeOrderModal();
  });
  btnUnderstand?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.closeOrderModal();
  });
  btnSubmit?.addEventListener('click', window.submitOrderOnline);

  // Nút trong hộp thoại xác nhận đã chuyển khoản
  btnBackToScan?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (modalConfirmTransfer) modalConfirmTransfer.style.display = 'none';
  });

  btnConfirmedTransfer?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.proceedSendOrder();
  });

  // Lắng nghe thay đổi SĐT & Tên để cập nhật ngay lập tức Nội dung CK và mã QR VietQR
  const inputPhone = document.getElementById('orderCustomerPhone');
  const inputName = document.getElementById('orderCustomerName');
  ['input', 'keyup', 'change', 'paste'].forEach(evt => {
    inputPhone?.addEventListener(evt, () => {
      window.updateOrderTransferMemoAndQr();
    });
    inputName?.addEventListener(evt, () => {
      window.updateOrderTransferMemoAndQr();
    });
  });

  // Nút sao chép nội dung chuyển khoản nhanh
  const btnCopyMemo = document.getElementById('btnCopyTransferMemo');
  btnCopyMemo?.addEventListener('click', () => {
    const memoEl = document.getElementById('modalTransferMemo');
    if (memoEl && memoEl.innerText) {
      navigator.clipboard.writeText(memoEl.innerText.trim());
      const originalHtml = btnCopyMemo.innerHTML;
      btnCopyMemo.innerHTML = '✓ Đã chép!';
      btnCopyMemo.style.color = '#34d399';
      btnCopyMemo.style.borderColor = '#10b981';
      setTimeout(() => {
        btnCopyMemo.innerHTML = originalHtml;
        btnCopyMemo.style.color = '#38bdf8';
        btnCopyMemo.style.borderColor = 'rgba(56, 189, 248, 0.4)';
      }, 2000);
    }
  });

  modalOrder?.addEventListener('click', (e) => {
    if (e.target === modalOrder) {
      window.closeOrderModal();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.closeOrderModal();
    }
  });

  document.querySelectorAll('.pkg-card').forEach(card => {
    card.addEventListener('click', () => {
      const name = card.getAttribute('data-pkg-name') || 'Gói 1 Tháng (30 ngày)';
      const price = card.getAttribute('data-pkg-price') || '1.000.000đ';
      window.openOrderModal(name, price);
    });
  });

  // Đồng hồ thời gian thực (Real-time Clock - Chỉ giữ lại ở Header)
  function updateDashboardRealtimeClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour12: false }) + ' • ' + now.toLocaleDateString('vi-VN');
    const headerEl = document.getElementById('dashLiveTimeText');
    if (headerEl) headerEl.innerText = '🕒 ' + timeStr;
  }
  updateDashboardRealtimeClock();
  setInterval(updateDashboardRealtimeClock, 1000);



  // Lắng nghe tín hiệu ngắt máy từ Background
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'FORCE_REVOKE_STOP' || msg.action === 'VIP_REVOKED') {
          console.warn('[Dashboard] Nhận lệnh ngắt máy khẩn cấp:', msg);
          loadLicenseDetails(true);
          switchTab('license');
        }
      });
    }
  } catch (e) {}
});
