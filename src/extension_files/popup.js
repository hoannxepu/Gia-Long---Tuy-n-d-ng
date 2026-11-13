// popup.js - Trình Quản Lý Mini Popup V1.5 Chuẩn Alarms & Lịch Sử & Dò Nhóm
// Lưu trữ bền vững 100%, bảo toàn dữ liệu, chống mất cấu hình khi tắt trình duyệt

let currentPosts = [];
let currentGroups = [];
let currentScheduledTimes = ['08:30', '11:30', '17:30', '20:00'];
let currentScheduleSlots = [];
let currentSelectedPostIndex = 0;
let autoSaveTimer = null;
let popupFoundGroups = [];

document.addEventListener('DOMContentLoaded', async () => {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const btnOpenFullTab = document.getElementById('btnOpenFullTab');
  const toast = document.getElementById('toast');

  btnOpenFullTab?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      tabPanels.forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      if (targetId) document.getElementById(targetId)?.classList.add('active');
      if (targetId === 'tab-history') renderPopupHistory();
    });
  });

  function showToast(msg) {
    if (!toast) return;
    toast.innerText = msg;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2200);
  }

  // Elements Tab 1: Bài viết
  const postSelector = document.getElementById('postSelector');
  const btnSaveCurrentPost = document.getElementById('btnSaveCurrentPost');
  const btnAddNewPost = document.getElementById('btnAddNewPost');
  const btnDeleteCurrentPost = document.getElementById('btnDeleteCurrentPost');
  const postTitleInput = document.getElementById('postTitleInput');
  const postContent = document.getElementById('postContent');
  const enableSpintax = document.getElementById('enableSpintax');
  const btnAutoSpintax = document.getElementById('btnAutoSpintax');
  const previewBox = document.getElementById('previewBox');
  const btnRerollPreview = document.getElementById('btnRerollPreview');

  const enableAttachImage = document.getElementById('enableAttachImage');
  const imageStatusBadge = document.getElementById('imageStatusBadge');
  const btnPickLocalFile = document.getElementById('btnPickLocalFile');
  const localImagePicker = document.getElementById('localImagePicker');
  const btnClearAllImages = document.getElementById('btnClearAllImages');
  const imageUrlInput = document.getElementById('imageUrlInput');
  const btnAddImageUrl = document.getElementById('btnAddImageUrl');

  // Elements Tab 2: Nhóm
  const groupBox = document.getElementById('groupBox');
  const groupCountBadge = document.getElementById('groupCountBadge');
  const popupSelectAll = document.getElementById('popupSelectAll');
  const popupDeselectAll = document.getElementById('popupDeselectAll');
  const popupInvertSelect = document.getElementById('popupInvertSelect');
  const popupDeleteSelected = document.getElementById('popupDeleteSelected');
  const shuffleGroupsToggle = document.getElementById('shuffleGroupsToggle');
  const autoJoinOnPostToggle = document.getElementById('autoJoinOnPostToggle');
  const btnShuffleGroupsNow = document.getElementById('btnShuffleGroupsNow');
  const btnEditGroups = document.getElementById('btnEditGroups');
  const btnExportPopupGroups = document.getElementById('btnExportPopupGroups');
  const editGroupArea = document.getElementById('editGroupArea');
  const groupLinksInput = document.getElementById('groupLinksInput');
  const btnSaveGroupLinks = document.getElementById('btnSaveGroupLinks');
  const btnCancelEditGroups = document.getElementById('btnCancelEditGroups');

  // Elements Tab 3: Hẹn giờ
  const delayInput = document.getElementById('delayInput');
  const timeTagsContainer = document.getElementById('timeTagsContainer');
  const newTimeInput = document.getElementById('newTimeInput');
  const popupSchedAccountSelect = document.getElementById('popupSchedAccountSelect');
  const popupSchedAutoSwitch = document.getElementById('popupSchedAutoSwitch');
  const btnAddTime = document.getElementById('btnAddTime');
  const btnResetGoldenHours = document.getElementById('btnResetGoldenHours');
  const enableScheduleAuto = document.getElementById('enableScheduleAuto');

  // Elements Tab 4: Dò tìm nhóm
  const popupFinderKeyword = document.getElementById('popupFinderKeyword');
  const popupFinderMinMembers = document.getElementById('popupFinderMinMembers');
  const btnPopupStartFind = document.getElementById('btnPopupStartFind');
  const popupFinderResultsArea = document.getElementById('popupFinderResultsArea');
  const popupFinderCountText = document.getElementById('popupFinderCountText');
  const btnPopupAddFoundToGroups = document.getElementById('btnPopupAddFoundToGroups');
  const btnPopupJoinAndAddGroups = document.getElementById('btnPopupJoinAndAddGroups');
  const btnPopupExportFoundGroups = document.getElementById('btnPopupExportFoundGroups');
  const popupFinderListBox = document.getElementById('popupFinderListBox');

  // Elements Tab 5: Lịch sử
  const popupHistoryBox = document.getElementById('popupHistoryBox');
  const btnPopupClearHistory = document.getElementById('btnPopupClearHistory');
  const btnPopupExportHistoryCsv = document.getElementById('btnPopupExportHistoryCsv');
  const popupHistoryAccountFilter = document.getElementById('popupHistoryAccountFilter');
  const popupHistoryStatusFilter = document.getElementById('popupHistoryStatusFilter');

  // Nút chạy & tiến trình
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const progressBox = document.getElementById('progressBox');
  const statusText = document.getElementById('statusText');
  const progressBar = document.getElementById('progressBar');

  // LƯU STORAGE BẢO TOÀN DỮ LIỆU
  function saveStorage(immediate = false) {
    clearTimeout(autoSaveTimer);
    const saveFn = async () => {
      if (currentPosts[currentSelectedPostIndex]) {
        currentPosts[currentSelectedPostIndex].title = postTitleInput ? postTitleInput.value.trim() : 'Bài Tuyển Dụng';
        currentPosts[currentSelectedPostIndex].content = postContent ? postContent.value : '';
      }
      currentScheduledTimes = currentScheduleSlots.map((s) => s.time);
      if (typeof SharedStorage !== 'undefined' && SharedStorage.patch) {
        await SharedStorage.patch('savedPosts', () => currentPosts);
        await SharedStorage.patch('savedGroups', () => currentGroups);
        await SharedStorage.patch('savedTimes', () => currentScheduledTimes);
        await SharedStorage.patch('scheduledTimes', () => currentScheduledTimes);
        await SharedStorage.patch('scheduleSlots', () => currentScheduleSlots);
        await SharedStorage.patch('postingSettings', (old) => ({
          ...(old || {}),
          autoJoinOnPost: autoJoinOnPostToggle ? autoJoinOnPostToggle.checked : true,
        }));
      } else {
        chrome.storage.local.set({
          savedPosts: currentPosts,
          savedGroups: currentGroups,
          savedTimes: currentScheduledTimes,
          scheduledTimes: currentScheduledTimes,
          scheduleSlots: currentScheduleSlots,
        });
      }
      chrome.storage.local.set({
        isInitialized: true,
        selectedPostIdx: currentSelectedPostIndex,
        delaySec: delayInput ? (parseInt(delayInput.value, 10) || 30) : 30,
        isScheduleActive: enableScheduleAuto ? enableScheduleAuto.checked : false,
        enableSpintax: enableSpintax ? enableSpintax.checked : true,
        shouldShuffleGroups: shuffleGroupsToggle ? shuffleGroupsToggle.checked : true,
        autoJoinOnPost: autoJoinOnPostToggle ? autoJoinOnPostToggle.checked : true,
      });
    };

    if (immediate) {
      saveFn();
    } else {
      autoSaveTimer = setTimeout(saveFn, 300);
    }
  }

  // Tải dữ liệu từ Storage
  chrome.storage.local.get(
    ['isInitialized', 'savedGroups', 'savedPosts', 'savedTimes', 'scheduledTimes', 'scheduleSlots', 'isScheduleActive', 'selectedPostIdx', 'delaySec', 'enableSpintax', 'shouldShuffleGroups', 'autoJoinOnPost', 'postingSettings'],
    async (res) => {
      if (res.isInitialized) {
        currentPosts = Array.isArray(res.savedPosts) ? res.savedPosts : [];
        currentGroups = Array.isArray(res.savedGroups) ? res.savedGroups : [];
        const t = res.savedTimes || res.scheduledTimes;
        if (t && Array.isArray(t)) currentScheduledTimes = t;
        if (Array.isArray(res.scheduleSlots) && res.scheduleSlots.length > 0) {
          currentScheduleSlots = (typeof SharedStorage !== 'undefined' && SharedStorage.normalizeScheduleSlots)
            ? SharedStorage.normalizeScheduleSlots(res.scheduleSlots, currentScheduledTimes)
            : res.scheduleSlots;
        } else {
          currentScheduleSlots = currentScheduledTimes.map((tm, i) => ({
            id: `slot_${String(tm).replace(':', '')}_${i}`,
            time: tm,
            enabled: true,
            accountId: 'active',
            accountUid: '',
            accountName: 'Tài khoản đang chọn',
            postIdx: -1,
            autoSwitchAccount: true,
          }));
        }
        currentScheduledTimes = currentScheduleSlots.map((s) => s.time);

        if (res.isScheduleActive !== undefined && enableScheduleAuto) {
          enableScheduleAuto.checked = res.isScheduleActive;
          chrome.runtime.sendMessage({ action: 'CHECK_LICENSE' }, (licRes) => {
            if (!licRes || !licRes.isValid) {
              if (enableScheduleAuto) enableScheduleAuto.checked = false;
              chrome.runtime.sendMessage({ action: 'CANCEL_SCHEDULE' });
            }
          });
        }
        if (res.delaySec !== undefined && delayInput) delayInput.value = res.delaySec;
        if (res.enableSpintax !== undefined && enableSpintax) enableSpintax.checked = res.enableSpintax;
        if (res.shouldShuffleGroups !== undefined && shuffleGroupsToggle) shuffleGroupsToggle.checked = res.shouldShuffleGroups;
        const autoJoinSetting = res.autoJoinOnPost !== undefined ? res.autoJoinOnPost : (res.postingSettings?.autoJoinOnPost !== false);
        if (autoJoinOnPostToggle) autoJoinOnPostToggle.checked = autoJoinSetting !== false;
        if (res.selectedPostIdx !== undefined && res.selectedPostIdx < currentPosts.length) {
          currentSelectedPostIndex = res.selectedPostIdx;
        }
      } else {
        try {
          const preloadedRes = await fetch(chrome.runtime.getURL('preloaded_data.json')).then((r) => r.json()).catch(() => null);
          if (preloadedRes) {
            if (preloadedRes.groups?.length) currentGroups = preloadedRes.groups;
            if (preloadedRes.posts?.length) currentPosts = preloadedRes.posts;
            if (preloadedRes.settings?.scheduledTimes) currentScheduledTimes = preloadedRes.settings.scheduledTimes;
          }
        } catch (e) {}
        currentScheduleSlots = currentScheduledTimes.map((tm, i) => ({
          id: `slot_${String(tm).replace(':', '')}_${i}`,
          time: tm,
          enabled: true,
          accountId: 'active',
          accountUid: '',
          accountName: 'Tài khoản đang chọn',
          postIdx: -1,
          autoSwitchAccount: true,
        }));
        saveStorage(true);
      }

      renderPostsDropdown();
      loadPostByIndex(currentSelectedPostIndex, false);
      renderGroupsList();
      await loadPopupActiveAccount();
      renderTimeTags();
      updatePreview();
      renderPopupHistory();
    }
  );

  const popupActiveAccountName = document.getElementById('popupActiveAccountName');
  const popupActiveAccountBadge = document.getElementById('popupActiveAccountBadge');
  const btnPopupDetectAccount = document.getElementById('btnPopupDetectAccount');

  async function loadPopupActiveAccount() {
    if (!popupActiveAccountName) return;
    if (typeof AccountsManager !== 'undefined' && AccountsManager.getActiveAccount) {
      const acc = await AccountsManager.getActiveAccount();
      const allAccounts = AccountsManager.getAccounts ? await AccountsManager.getAccounts() : [];

      if (popupSchedAccountSelect) {
        const prevVal = popupSchedAccountSelect.value || 'active';
        popupSchedAccountSelect.textContent = '';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = 'active';
        defaultOpt.textContent = '🔄 Nick đang chọn';
        popupSchedAccountSelect.appendChild(defaultOpt);

        allAccounts.forEach((a) => {
          const opt = document.createElement('option');
          opt.value = a.id;
          opt.textContent = `👤 ${a.name || 'Nick FB'} (${a.uid || a.id})`;
          popupSchedAccountSelect.appendChild(opt);
        });
        if ([...popupSchedAccountSelect.options].some((o) => o.value === prevVal)) {
          popupSchedAccountSelect.value = prevVal;
        }
      }

      if (acc) {
        popupActiveAccountName.textContent = `${acc.name || 'Tài khoản FB'} (${acc.uid || acc.id})`;
        if (popupActiveAccountBadge) {
          const cooling = AccountsManager.isAccountCoolingDown(acc);
          popupActiveAccountBadge.style.display = 'inline-block';
          if (cooling && cooling.isCoolingDown) {
            popupActiveAccountBadge.textContent = `Nghỉ ${cooling.remainingMinutes}p`;
            popupActiveAccountBadge.style.background = '#881337';
            popupActiveAccountBadge.style.color = '#fda4af';
          } else {
            popupActiveAccountBadge.textContent = 'Sẵn sàng';
            popupActiveAccountBadge.style.background = '#065f46';
            popupActiveAccountBadge.style.color = '#6ee7b7';
          }
        }
      } else {
        popupActiveAccountName.textContent = 'Chưa chọn tài khoản (Bấm Quét)';
        if (popupActiveAccountBadge) popupActiveAccountBadge.style.display = 'none';
      }
    }
  }

  btnPopupDetectAccount?.addEventListener('click', () => {
    if (btnPopupDetectAccount) btnPopupDetectAccount.textContent = 'Đang quét...';
    chrome.runtime.sendMessage({ action: 'DETECT_CURRENT_FB_ACCOUNT_FROM_TAB' }, (res) => {
      if (btnPopupDetectAccount) btnPopupDetectAccount.textContent = 'Quét Nick ↗';
      if (res && res.success && res.account) {
        loadPopupActiveAccount();
        showToast(`✓ Đã nhận diện: ${res.account.name}`);
      } else {
        alert(res?.error || 'Không thể nhận diện tài khoản. Hãy mở sẵn tab Facebook đã đăng nhập!');
      }
    });
  });

  // Lắng nghe thay đổi storage từ background/dashboard
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.savedGroups) {
      currentGroups = changes.savedGroups.newValue || [];
      renderGroupsList();
    }
    if (changes.savedPosts) {
      currentPosts = changes.savedPosts.newValue || [];
      renderPostsDropdown();
      loadPostByIndex(currentSelectedPostIndex, false);
    }
    if (changes.scheduleSlots) {
      currentScheduleSlots = Array.isArray(changes.scheduleSlots.newValue) ? changes.scheduleSlots.newValue : [];
      currentScheduledTimes = currentScheduleSlots.map((s) => s.time);
      renderTimeTags();
    }
    if (changes.fbAccounts || changes.activeAccountId) {
      loadPopupActiveAccount();
    }
    if (changes.postHistory) {
      renderPopupHistory();
    }
    if (changes.postingStatus) {
      const st = changes.postingStatus.newValue;
      if (st && statusText) {
        statusText.textContent = st.statusText || '';
      }
    }
  });

  window.addEventListener('beforeunload', () => saveStorage(true));
  delayInput?.addEventListener('input', () => saveStorage());

  // 1. Quản lý bài viết
  function renderPostsDropdown() {
    if (!postSelector) return;
    postSelector.innerHTML = '';
    currentPosts.forEach((p, idx) => {
      const opt = document.createElement('option');
      opt.value = idx.toString();
      opt.innerText = `Bài ${idx + 1}: ${p.title || 'Tuyển Dụng'}`;
      if (idx === currentSelectedPostIndex) opt.selected = true;
      postSelector.appendChild(opt);
    });
  }

  function loadPostByIndex(idx, shouldSave = true) {
    if (!currentPosts[idx]) return;
    currentSelectedPostIndex = idx;
    const p = currentPosts[idx];
    if (postTitleInput) postTitleInput.value = p.title || '';
    if (postContent) postContent.value = p.content || '';
    renderThumbnails();
    updatePreview();
    if (shouldSave) saveStorage();
  }

  function renderThumbnails() {
    const post = currentPosts[currentSelectedPostIndex];
    const imgs = (post && Array.isArray(post.images)) ? post.images.filter(Boolean).slice(0, 3) : [];
    if (post) post.images = imgs;

    for (let slot = 0; slot < 3; slot++) {
      const thumb = document.getElementById(`thumb${slot + 1}`);
      const label = document.getElementById(`label${slot + 1}`);
      const slotDiv = document.getElementById(`slot${slot + 1}`);
      const delBtn = slotDiv?.querySelector('.del-slot-btn');

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
    if (imageStatusBadge) imageStatusBadge.innerText = `${imgs.length}/3 ảnh`;
    updatePreview();
  }

  document.querySelectorAll('.del-slot-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const slotIdx = parseInt(btn.getAttribute('data-slot') || '0', 10);
      const post = currentPosts[currentSelectedPostIndex];
      if (post && Array.isArray(post.images)) {
        post.images.splice(slotIdx, 1);
        renderThumbnails();
        saveStorage(true);
      }
    });
  });

  postSelector?.addEventListener('change', () => loadPostByIndex(parseInt(postSelector.value, 10), true));
  postTitleInput?.addEventListener('input', () => saveStorage());
  postContent?.addEventListener('input', () => {
    updatePreview();
    saveStorage();
  });

  btnSaveCurrentPost?.addEventListener('click', () => {
    saveStorage(true);
    showToast('✓ Đã lưu bài viết!');
  });

  btnAddNewPost?.addEventListener('click', () => {
    currentPosts.push({
      id: 'post_' + Date.now(),
      title: `Bài Tuyển Dụng ${currentPosts.length + 1}`,
      content: '🔥 CƠ HỘI NGHỀ NGHIỆP TUYỂN DỤNG\n📍 Địa điểm: Hà Nội\n💰 Lương: 12 - 20 Triệu\n📞 Hotline / Zalo: Gia Long',
      images: [],
    });
    currentSelectedPostIndex = currentPosts.length - 1;
    renderPostsDropdown();
    loadPostByIndex(currentSelectedPostIndex, true);
    showToast('✓ Đã thêm bài viết mới!');
  });

  btnDeleteCurrentPost?.addEventListener('click', () => {
    if (currentPosts.length <= 1) return alert('Phải giữ ít nhất 1 bài viết!');
    if (confirm('Bạn có chắc muốn xóa bài này?')) {
      currentPosts.splice(currentSelectedPostIndex, 1);
      currentSelectedPostIndex = 0;
      renderPostsDropdown();
      loadPostByIndex(0, true);
      showToast('Đã xóa bài viết.');
    }
  });

  function resolveSpintax(t) {
    if (!t) return '';
    return t.replace(/\{([^{}]+)\}/g, (m, c) => {
      const parts = c.split('|');
      return parts[Math.floor(Math.random() * parts.length)];
    });
  }

  function updatePreview() {
    if (previewBox && postContent) {
      previewBox.innerText = resolveSpintax(postContent.value) || 'Chưa có nội dung bài viết...';
    }

    const popupPreviewImages = document.getElementById('popupPreviewImages');
    if (popupPreviewImages) {
      const p = currentPosts[currentSelectedPostIndex];
      const shouldAttach = enableAttachImage ? enableAttachImage.checked : true;
      const imgs = (shouldAttach && p && Array.isArray(p.images)) ? p.images.filter(Boolean).slice(0, 3) : [];

      if (imgs.length === 0) {
        popupPreviewImages.style.display = 'none';
        popupPreviewImages.innerHTML = '';
      } else {
        popupPreviewImages.style.display = 'grid';
        if (imgs.length === 1) {
          popupPreviewImages.style.gridTemplateColumns = '1fr';
          popupPreviewImages.innerHTML = `
            <img src="${imgs[0]}" alt="Ảnh bài viết" style="width: 100%; max-height: 120px; object-fit: cover; border-radius: 4px; border: 1px solid #334155;" />
          `;
        } else if (imgs.length === 2) {
          popupPreviewImages.style.gridTemplateColumns = '1fr 1fr';
          popupPreviewImages.style.gap = '4px';
          popupPreviewImages.innerHTML = `
            <img src="${imgs[0]}" alt="Ảnh 1" style="width: 100%; height: 75px; object-fit: cover; border-radius: 4px; border: 1px solid #334155;" />
            <img src="${imgs[1]}" alt="Ảnh 2" style="width: 100%; height: 75px; object-fit: cover; border-radius: 4px; border: 1px solid #334155;" />
          `;
        } else {
          popupPreviewImages.style.gridTemplateColumns = 'repeat(3, 1fr)';
          popupPreviewImages.style.gap = '4px';
          popupPreviewImages.innerHTML = `
            <img src="${imgs[0]}" alt="Ảnh 1" style="width: 100%; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #334155;" />
            <img src="${imgs[1]}" alt="Ảnh 2" style="width: 100%; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #334155;" />
            <img src="${imgs[2]}" alt="Ảnh 3" style="width: 100%; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #334155;" />
          `;
        }
      }
    }
  }
  btnRerollPreview?.addEventListener('click', updatePreview);
  enableAttachImage?.addEventListener('change', () => {
    updatePreview();
    saveStorage(true);
  });

  btnAutoSpintax?.addEventListener('click', () => {
    if (!postContent) return;
    let t = postContent.value;
    if (!t) return;
    t = t.replace(/(CÔNG TY THÔNG BÁO TUYỂN DỤNG|TUYỂN DỤNG|TUYỂN GẤP)/gi, '{CÔNG TY THÔNG BÁO TUYỂN DỤNG|THÔNG TIN TUYỂN DỤNG GẤP|CƠ HỘI NGHỀ NGHIỆP HẤP DẪN}');
    t = t.replace(/(Mức lương|Thu nhập|Lương cứng)/gi, '{Mức lương|Thu nhập|Mức đãi ngộ}');
    t = t.replace(/(Yêu cầu|Yêu cầu công việc)/gi, '{Yêu cầu công việc|Tiêu chuẩn ứng tuyển}');
    t = t.replace(/(Địa điểm làm việc|Địa chỉ|Nơi làm việc)/gi, '{Địa điểm làm việc|Nơi làm việc|Khu vực làm việc}');
    postContent.value = t;
    updatePreview();
    saveStorage(true);
    showToast('✓ Đã áp dụng Spintax {A|B|C}!');
  });

  // Tối ưu hóa và nén ảnh (max dimension 1280px, chất lượng 0.85) để lưu trữ bền vững trong popup
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

  btnPickLocalFile?.addEventListener('click', () => localImagePicker?.click());
  localImagePicker?.addEventListener('change', async () => {
    const files = Array.from(localImagePicker.files || []);
    const p = currentPosts[currentSelectedPostIndex];
    if (!p) return;
    if (!Array.isArray(p.images)) p.images = [];
    const slots = 3 - p.images.length;
    if (slots <= 0) {
      alert('Đã đủ 3 ảnh! Hãy xóa bớt ảnh cũ để thêm ảnh mới.');
      localImagePicker.value = '';
      return;
    }

    showToast('⏳ Đang nén và nạp ảnh...');
    const toProcess = files.slice(0, slots);
    for (const f of toProcess) {
      if (p.images.length >= 3) break;
      try {
        const compressed = await compressAndResizeImage(f);
        if (compressed && p.images.length < 3) {
          p.images.push(compressed);
        }
      } catch (err) {
        console.warn('Lỗi nén ảnh popup:', err);
      }
    }

    renderThumbnails();
    saveStorage(true);
    showToast(`✓ Đã nạp ${p.images.length}/3 ảnh!`);
    localImagePicker.value = '';
  });

  btnAddImageUrl?.addEventListener('click', () => {
    const url = imageUrlInput?.value.trim();
    if (!url) return;
    const p = currentPosts[currentSelectedPostIndex];
    if (!p) return;
    if (!Array.isArray(p.images)) p.images = [];
    if (p.images.length >= 3) return alert('Đã đủ 3 ảnh!');
    p.images.push(url);
    if (imageUrlInput) imageUrlInput.value = '';
    renderThumbnails();
    saveStorage(true);
  });

  btnClearAllImages?.addEventListener('click', () => {
    if (currentPosts[currentSelectedPostIndex]) {
      currentPosts[currentSelectedPostIndex].images = [];
      renderThumbnails();
      saveStorage(true);
      showToast('Đã xóa tất cả ảnh');
    }
  });

  // 2. Quản lý nhóm
  autoJoinOnPostToggle?.addEventListener('change', () => saveStorage(true));
  shuffleGroupsToggle?.addEventListener('change', () => saveStorage(true));

  function renderGroupsList() {
    if (!groupBox) return;
    groupBox.textContent = '';
    const activeCount = currentGroups.filter((g) => g.enabled !== false).length;
    if (groupCountBadge) groupCountBadge.textContent = `Đã chọn ${activeCount}/${currentGroups.length} Nhóm`;

    currentGroups.forEach((g) => {
      const row = document.createElement('div');
      row.className = 'group-item';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '6px';
      left.style.minWidth = '0';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = g.enabled !== false;
      cb.style.accentColor = '#0284c7';
      cb.addEventListener('change', () => {
        g.enabled = cb.checked;
        saveStorage(true);
        const cur = currentGroups.filter((item) => item.enabled !== false).length;
        if (groupCountBadge) groupCountBadge.textContent = `Đã chọn ${cur}/${currentGroups.length} Nhóm`;
      });

      const span = document.createElement('span');
      span.textContent = g.name || 'Nhóm Facebook';
      span.style.maxWidth = '185px';
      span.style.overflow = 'hidden';
      span.style.textOverflow = 'ellipsis';
      span.style.whiteSpace = 'nowrap';

      left.appendChild(cb);
      left.appendChild(span);

      if (g.status && g.status !== 'Chờ đăng') {
        const badge = document.createElement('span');
        badge.style.cssText = 'font-size: 9px; padding: 1px 4px; border-radius: 3px; white-space: nowrap;';
        if (g.status.includes('Đã tự vào') || g.status === 'Đã đăng') {
          badge.style.background = '#065f46';
          badge.style.color = '#6ee7b7';
        } else if (g.status.includes('Chờ duyệt') || g.status.includes('câu hỏi')) {
          badge.style.background = '#78350f';
          badge.style.color = '#fcd34d';
        } else {
          badge.style.background = '#334155';
          badge.style.color = '#cbd5e1';
        }
        badge.textContent = g.status;
        left.appendChild(badge);
      }

      const link = document.createElement('a');
      link.className = 'group-link';
      const safeLink = (typeof SharedStorage !== 'undefined' && SharedStorage.normalizeGroupUrl)
        ? SharedStorage.normalizeGroupUrl(g.link)
        : (String(g.link || '').startsWith('https://www.facebook.com/groups/') ? g.link : '');
      link.href = safeLink || 'https://www.facebook.com/groups/';
      link.target = '_blank';
      link.textContent = 'Xem ↗';

      row.appendChild(left);
      row.appendChild(link);
      groupBox.appendChild(row);
    });
  }

  popupSelectAll?.addEventListener('click', () => {
    currentGroups.forEach((g) => { g.enabled = true; });
    saveStorage(true);
    renderGroupsList();
    showToast('✓ Đã chọn tất cả nhóm!');
  });

  popupDeselectAll?.addEventListener('click', () => {
    currentGroups.forEach((g) => { g.enabled = false; });
    saveStorage(true);
    renderGroupsList();
    showToast('Đã bỏ chọn tất cả.');
  });

  popupInvertSelect?.addEventListener('click', () => {
    currentGroups.forEach((g) => { g.enabled = !g.enabled; });
    saveStorage(true);
    renderGroupsList();
    showToast('🔄 Đã đảo chọn nhóm!');
  });

  popupDeleteSelected?.addEventListener('click', () => {
    const selCount = currentGroups.filter((g) => g.enabled !== false).length;
    if (!selCount) return alert('Chưa chọn nhóm nào để xóa!');
    if (confirm(`Xóa ${selCount} nhóm đang được chọn?`)) {
      currentGroups = currentGroups.filter((g) => g.enabled === false);
      saveStorage(true);
      renderGroupsList();
      showToast(`✓ Đã xóa ${selCount} nhóm!`);
    }
  });

  btnShuffleGroupsNow?.addEventListener('click', () => {
    if (!currentGroups || currentGroups.length <= 1) return;
    for (let i = currentGroups.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [currentGroups[i], currentGroups[j]] = [currentGroups[j], currentGroups[i]];
    }
    saveStorage(true);
    renderGroupsList();
    showToast('🎲 Đã xáo trộn thứ tự nhóm!');
  });

  btnEditGroups?.addEventListener('click', () => {
    if (editGroupArea) {
      editGroupArea.style.display = editGroupArea.style.display === 'none' ? 'block' : 'none';
      if (groupLinksInput) groupLinksInput.value = currentGroups.map((g) => g.link).join('\n');
    }
  });

  btnCancelEditGroups?.addEventListener('click', () => {
    if (editGroupArea) editGroupArea.style.display = 'none';
  });

  btnSaveGroupLinks?.addEventListener('click', () => {
    const raw = groupLinksInput?.value.trim();
    if (!raw) return alert('Vui lòng nhập ít nhất 1 link nhóm!');
    const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('http'));
    currentGroups = lines.map((url, i) => ({ id: 'grp_custom_' + Date.now() + '_' + i, name: `Nhóm ${i + 1}`, link: url, enabled: true }));
    saveStorage(true);
    renderGroupsList();
    if (editGroupArea) editGroupArea.style.display = 'none';
    showToast(`✓ Đã lưu ${currentGroups.length} nhóm!`);
  });

  // Xuất danh sách nhóm sang file Excel (CSV)
  btnExportPopupGroups?.addEventListener('click', () => {
    if (!currentGroups || !currentGroups.length) return alert('Danh sách nhóm trống!');
    
    let csv = '\uFEFFSTT,Tên Nhóm,Link Nhóm,Trạng Thái Đăng Bài\n';
    currentGroups.forEach((g, idx) => {
      const name = `"${(g.name || '').replace(/"/g, '""')}"`;
      const link = `"${(g.link || '').replace(/"/g, '""')}"`;
      const status = g.enabled !== false ? 'Đang bật' : 'Đang tắt';
      csv += `${idx + 1},${name},${link},${status}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `danh_sach_nhom_dang_bai_${currentGroups.length}_nhom_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`✓ Đã xuất file ${currentGroups.length} nhóm!`);
  });

  // 3. Hẹn giờ theo khung + tự chuyển tài khoản Facebook
  function syncActiveScheduleIfEnabled() {
    if (enableScheduleAuto && enableScheduleAuto.checked) {
      chrome.runtime.sendMessage({
        action: 'SCHEDULE_AUTO_POST',
        payload: {
          times: currentScheduledTimes,
          slots: currentScheduleSlots,
          delaySec: delayInput ? (parseInt(delayInput.value, 10) || 25) : 25,
          isSpintaxEnabled: enableSpintax ? enableSpintax.checked : true,
        },
      });
    }
  }

  function renderTimeTags() {
    if (!timeTagsContainer) return;
    timeTagsContainer.textContent = '';
    currentScheduledTimes = currentScheduleSlots.map((s) => s.time);

    currentScheduleSlots.forEach((slot, i) => {
      const tag = document.createElement('div');
      tag.className = 'time-tag';

      const infoSpan = document.createElement('span');
      const accLabel = (slot.accountId && slot.accountId !== 'active')
        ? (slot.accountName || slot.accountUid || slot.accountId)
        : 'Nick đang chọn';
      const switchIcon = slot.autoSwitchAccount !== false ? '🔀' : '👤';
      infoSpan.textContent = `⏰ ${slot.time} · ${switchIcon} ${accLabel}`;

      const delSpan = document.createElement('span');
      delSpan.className = 'del-time';
      delSpan.setAttribute('data-i', String(i));
      delSpan.textContent = '✕';
      delSpan.addEventListener('click', () => {
        currentScheduleSlots.splice(i, 1);
        currentScheduledTimes = currentScheduleSlots.map((s) => s.time);
        saveStorage(true);
        renderTimeTags();
        syncActiveScheduleIfEnabled();
      });

      tag.appendChild(infoSpan);
      tag.appendChild(delSpan);
      timeTagsContainer.appendChild(tag);
    });
  }

  btnAddTime?.addEventListener('click', async () => {
    const val = newTimeInput?.value.trim();
    if (!val || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(val)) return alert('Nhập đúng định dạng HH:mm (VD: 09:30)');

    const selectedAccId = popupSchedAccountSelect ? popupSchedAccountSelect.value : 'active';
    const autoSwitch = popupSchedAutoSwitch ? popupSchedAutoSwitch.checked : true;

    let accName = 'Tài khoản đang chọn';
    let accUid = '';
    if (selectedAccId !== 'active' && typeof AccountsManager !== 'undefined' && AccountsManager.getAccounts) {
      const allAccs = await AccountsManager.getAccounts();
      const foundAcc = allAccs.find((a) => a.id === selectedAccId || a.uid === selectedAccId);
      if (foundAcc) {
        accName = foundAcc.name || 'Tài khoản FB';
        accUid = foundAcc.uid || '';
      }
    }

    const existingIdx = currentScheduleSlots.findIndex((s) => s.time === val);
    const slotObj = {
      id: `slot_${val.replace(':', '')}_${Date.now()}`,
      time: val,
      enabled: true,
      accountId: selectedAccId,
      accountUid: accUid,
      accountName: accName,
      postIdx: -1,
      autoSwitchAccount: autoSwitch,
    };

    if (existingIdx >= 0) {
      currentScheduleSlots[existingIdx] = { ...currentScheduleSlots[existingIdx], ...slotObj };
    } else {
      currentScheduleSlots.push(slotObj);
    }

    currentScheduleSlots.sort((a, b) => a.time.localeCompare(b.time));
    currentScheduledTimes = currentScheduleSlots.map((s) => s.time);
    saveStorage(true);
    renderTimeTags();
    syncActiveScheduleIfEnabled();
    showToast(`✓ Đã hẹn khung ${val} (${accName})!`);
  });

  btnResetGoldenHours?.addEventListener('click', async () => {
    const selectedAccId = popupSchedAccountSelect ? popupSchedAccountSelect.value : 'active';
    const autoSwitch = popupSchedAutoSwitch ? popupSchedAutoSwitch.checked : true;
    let accName = 'Tài khoản đang chọn';
    let accUid = '';
    if (selectedAccId !== 'active' && typeof AccountsManager !== 'undefined' && AccountsManager.getAccounts) {
      const allAccs = await AccountsManager.getAccounts();
      const foundAcc = allAccs.find((a) => a.id === selectedAccId || a.uid === selectedAccId);
      if (foundAcc) {
        accName = foundAcc.name || 'Tài khoản FB';
        accUid = foundAcc.uid || '';
      }
    }

    const golden = ['08:30', '11:30', '17:30', '20:00'];
    currentScheduleSlots = golden.map((tm, idx) => ({
      id: `slot_${tm.replace(':', '')}_${idx}`,
      time: tm,
      enabled: true,
      accountId: selectedAccId,
      accountUid: accUid,
      accountName: accName,
      postIdx: -1,
      autoSwitchAccount: autoSwitch,
    }));
    currentScheduledTimes = [...golden];
    saveStorage(true);
    renderTimeTags();
    syncActiveScheduleIfEnabled();
    showToast('✓ Đã nạp 4 mốc giờ vàng!');
  });

  enableScheduleAuto?.addEventListener('change', () => {
    if (enableScheduleAuto.checked) {
      chrome.runtime.sendMessage({ action: 'CHECK_LICENSE' }, (licRes) => {
        if (!licRes || !licRes.isValid) {
          enableScheduleAuto.checked = false;
          chrome.runtime.sendMessage({ action: 'CANCEL_SCHEDULE' });
          saveStorage(true);
          alert(`🚨 CHƯA KÍCH HOẠT BẢN QUYỀN VIP!\n\nTính năng "Hẹn giờ tự động đăng bài" yêu cầu bản quyền VIP.\n\n${licRes?.message || 'Vui lòng kích hoạt mã bản quyền hoặc đặt mua gói để hệ thống có thể tự động chạy khi tới giờ hẹn.'}`);
          chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html?tab=license') });
          return;
        }

        saveStorage(true);
        chrome.runtime.sendMessage({
          action: 'SCHEDULE_AUTO_POST',
          payload: {
            times: currentScheduledTimes,
            slots: currentScheduleSlots,
            delaySec: delayInput ? (parseInt(delayInput.value, 10) || 25) : 25,
            isSpintaxEnabled: enableSpintax ? enableSpintax.checked : true,
          },
        }, (schedRes) => {
          if (schedRes && schedRes.success === false) {
            enableScheduleAuto.checked = false;
            saveStorage(true);
            alert(`🚨 LỖI HẸN GIỜ:\n\n${schedRes.message || 'Không thể kích hoạt hẹn giờ'}`);
          } else {
            showToast('✓ Đã bật hẹn giờ đăng tự động!');
          }
        });
      });
    } else {
      saveStorage(true);
      chrome.runtime.sendMessage({ action: 'CANCEL_SCHEDULE' });
      showToast('Đã tắt hẹn giờ.');
    }
  });

  // 4. DÒ TÌM NHÓM FACEBOOK
  btnPopupStartFind?.addEventListener('click', () => {
    const kw = popupFinderKeyword?.value.trim();
    if (!kw) return alert('Vui lòng nhập từ khóa tìm nhóm!');
    const minMembers = popupFinderMinMembers ? parseInt(popupFinderMinMembers.value, 10) : 10000;

    if (btnPopupStartFind) {
      btnPopupStartFind.disabled = true;
      btnPopupStartFind.innerText = '⏳ Đang quét Facebook...';
    }

    chrome.runtime.sendMessage({
      action: 'SEARCH_AND_SCAN_GROUPS',
      payload: { keyword: kw, minMembers },
    }, (res) => {
      if (btnPopupStartFind) {
        btnPopupStartFind.disabled = false;
        btnPopupStartFind.innerText = '🚀 Bắt Đầu Quét Nhóm';
      }

      if (res && res.success && res.groups) {
        popupFoundGroups = res.groups;
        renderPopupFoundGroups(popupFoundGroups);
        showToast(`✓ Tìm thấy ${popupFoundGroups.length} nhóm!`);
      } else {
        alert(res?.error || 'Không tìm thấy nhóm hoặc chưa đăng nhập Facebook!');
      }
    });
  });

  function renderPopupFoundGroups(list) {
    if (!popupFinderListBox || !popupFinderResultsArea) return;
    popupFinderResultsArea.style.display = 'block';
    popupFinderListBox.textContent = '';
    if (popupFinderCountText) popupFinderCountText.textContent = `${list.length} nhóm tìm được`;

    if (!list.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align: center; color: #64748b; padding: 10px;';
      empty.textContent = 'Không có nhóm nào phù hợp.';
      popupFinderListBox.appendChild(empty);
      return;
    }

    list.forEach((g, idx) => {
      const row = document.createElement('div');
      row.className = 'group-item';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '6px';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'popup-finder-cb';
      cb.setAttribute('data-idx', String(idx));
      cb.checked = true;
      cb.style.accentColor = '#0284c7';
      cb.style.width = '14px';
      cb.style.height = '14px';

      const infoWrap = document.createElement('div');
      infoWrap.style.cssText = 'flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';

      const linkEl = document.createElement('a');
      const safeUrl = (typeof SharedStorage !== 'undefined' && SharedStorage.normalizeGroupUrl)
        ? SharedStorage.normalizeGroupUrl(g.link)
        : (String(g.link || '').startsWith('https://www.facebook.com/groups/') ? g.link : '');
      linkEl.href = safeUrl || 'https://www.facebook.com/groups/';
      linkEl.target = '_blank';
      linkEl.style.cssText = 'color: #38bdf8; text-decoration: none; font-weight: bold; font-size: 11px;';
      linkEl.textContent = g.name || 'Nhóm Facebook';

      const subEl = document.createElement('div');
      subEl.style.cssText = 'font-size: 9.5px; color: #10b981;';
      const memSpan = document.createElement('span');
      memSpan.textContent = `${g.memberText || ''} · `;
      const statusSpan = document.createElement('span');
      statusSpan.style.color = g.joined ? '#10b981' : '#f59e0b';
      statusSpan.textContent = g.joined ? 'Đã tham gia' : 'Chưa tham gia';
      subEl.appendChild(memSpan);
      subEl.appendChild(statusSpan);

      infoWrap.appendChild(linkEl);
      infoWrap.appendChild(subEl);
      row.appendChild(cb);
      row.appendChild(infoWrap);
      popupFinderListBox.appendChild(row);
    });
  }

  // Tự động tham gia các nhóm đã chọn & Thêm vào danh sách đăng bài
  btnPopupJoinAndAddGroups?.addEventListener('click', () => {
    const selectedBoxes = Array.from(document.querySelectorAll('.popup-finder-cb:checked'));
    const selectedIndexes = selectedBoxes.map((el) => parseInt(el.getAttribute('data-idx') || '0', 10));
    const toProcess = selectedIndexes.map((i) => popupFoundGroups[i]).filter(Boolean);
    if (!toProcess.length) return alert('Vui lòng tích chọn ít nhất 1 nhóm!');

    if (!confirm(`Tiện ích sẽ mở tab để tham gia ${toProcess.length} nhóm đã chọn và thêm vào danh sách. Tiếp tục?`)) {
      return;
    }

    btnPopupJoinAndAddGroups.disabled = true;
    btnPopupJoinAndAddGroups.innerText = '⏳ Đang tham gia...';
    showToast(`Đang chạy tham gia ${toProcess.length} nhóm...`);

    chrome.runtime.sendMessage({
      action: 'JOIN_AND_ADD_GROUPS',
      payload: { groupsToProcess: toProcess }
    }, (res) => {
      btnPopupJoinAndAddGroups.disabled = false;
      btnPopupJoinAndAddGroups.innerText = '🚀 Tham Gia & Thêm Vào Đăng';

      if (res && res.success) {
        if (res.updatedGroups) {
          currentGroups = res.updatedGroups;
        }
        toProcess.forEach((g) => { g.joined = true; });
        renderPopupFoundGroups(popupFoundGroups);
        renderGroupsList();
        showToast(`✓ Đã tham gia xong & thêm ${res.addedCount || toProcess.length} nhóm!`);
      } else {
        alert(res?.error || 'Có lỗi xảy ra khi tự động tham gia nhóm.');
      }
    });
  });

  btnPopupAddFoundToGroups?.addEventListener('click', () => {
    const selectedBoxes = Array.from(document.querySelectorAll('.popup-finder-cb:checked'));
    const selectedIndexes = selectedBoxes.length
      ? selectedBoxes.map((el) => parseInt(el.getAttribute('data-idx') || '0', 10))
      : popupFoundGroups.map((_, i) => i);

    const toAdd = selectedIndexes.map((i) => popupFoundGroups[i]).filter(Boolean);
    if (!toAdd.length) return alert('Chưa có nhóm nào!');

    let addedCount = 0;
    toAdd.forEach((g) => {
      if (!currentGroups.some((item) => item.link === g.link)) {
        currentGroups.push({ id: g.id, name: g.name, link: g.link, enabled: true });
        addedCount++;
      }
    });
    saveStorage(true);
    renderGroupsList();
    showToast(`✓ Đã thêm ${addedCount} nhóm mới vào danh sách!`);
  });

  // Xuất danh sách nhóm tìm kiếm được sang Excel
  btnPopupExportFoundGroups?.addEventListener('click', () => {
    if (!popupFoundGroups || !popupFoundGroups.length) return alert('Chưa có nhóm nào!');
    let csv = '\uFEFFSTT,Tên Nhóm,Số Lượng Thành Viên,Trạng Thái Tham Gia,Link Nhóm\n';
    popupFoundGroups.forEach((g, i) => {
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
    a.download = `tim_nhom_fb_${popupFoundGroups.length}_nhom_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`✓ Đã xuất ${popupFoundGroups.length} nhóm sang Excel!`);
  });

  // 5. LỊCH SỬ ĐĂNG BÀI THEO TÀI KHOẢN (Rule 5: dùng textContent)
  function populatePopupHistoryAccountFilter(historyList, accountsList) {
    if (!popupHistoryAccountFilter) return;
    const prevVal = popupHistoryAccountFilter.value || 'all';
    popupHistoryAccountFilter.textContent = '';

    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = '👤 Tất cả nick FB';
    popupHistoryAccountFilter.appendChild(optAll);

    const seen = new Set();
    const addOpt = (val, label) => {
      const k = String(val || '').trim();
      if (!k || seen.has(k)) return;
      seen.add(k);
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = label;
      popupHistoryAccountFilter.appendChild(opt);
    };

    if (Array.isArray(accountsList)) {
      accountsList.forEach((acc) => {
        if (!acc) return;
        const key = acc.id || acc.uid || acc.fbUserId || acc.name || acc.displayName;
        const name = acc.name || acc.displayName || 'Nick FB';
        addOpt(key, `👤 ${name}`);
      });
    }
    if (Array.isArray(historyList)) {
      historyList.forEach((h) => {
        if (!h) return;
        const key = h.accountId || h.accountUid || h.accountName;
        const name = h.accountName || h.accountId || 'Mặc định';
        if (key) addOpt(key, `👤 ${name}`);
      });
    }

    if (Array.from(popupHistoryAccountFilter.options).some((o) => o.value === prevVal)) {
      popupHistoryAccountFilter.value = prevVal;
    } else {
      popupHistoryAccountFilter.value = 'all';
    }
  }

  function getPopupFilteredHistory(rawHistory) {
    const filters = {
      accountId: popupHistoryAccountFilter ? popupHistoryAccountFilter.value : 'all',
      status: popupHistoryStatusFilter ? popupHistoryStatusFilter.value : 'all',
    };
    if (typeof SharedStorage !== 'undefined' && typeof SharedStorage.filterHistoryEntries === 'function') {
      return SharedStorage.filterHistoryEntries(rawHistory, filters);
    }
    return Array.isArray(rawHistory) ? rawHistory : [];
  }

  async function renderPopupHistory() {
    if (!popupHistoryBox) return;
    popupHistoryBox.textContent = '';
    const res = await chrome.storage.local.get(['postHistory', 'fbAccounts']);
    const history = Array.isArray(res.postHistory) ? res.postHistory : [];
    const accountsList = Array.isArray(res.fbAccounts) ? res.fbAccounts : [];

    populatePopupHistoryAccountFilter(history, accountsList);
    const filtered = getPopupFilteredHistory(history);

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align: center; color: #64748b; padding: 15px;';
      empty.textContent = history.length === 0
        ? 'Chưa có lịch sử đăng bài nào.'
        : 'Không có lịch sử khớp bộ lọc.';
      popupHistoryBox.appendChild(empty);
      return;
    }

    filtered.slice(0, 60).forEach((h) => {
      const item = document.createElement('div');
      item.className = 'history-item';
      const badgeClass = h.status === 'success' ? 'badge-success' : (h.status === 'stopped' || h.status === 'uncertain' ? 'badge-stopped' : 'badge-failed');
      const statusLabel = h.status === 'success' ? 'Thành công' : (h.status === 'uncertain' ? 'Chưa rõ' : (h.status === 'stopped' ? 'Đã dừng' : 'Thất bại'));
      const typeLabel = h.type === 'scheduled' ? '⏰ Hẹn giờ' : '⚡ Thủ công';

      const topRow = document.createElement('div');
      topRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

      if (h.groupLink && String(h.groupLink).startsWith('https://www.facebook.com/groups/')) {
        const grpLinkEl = document.createElement('a');
        grpLinkEl.href = h.groupLink;
        grpLinkEl.target = '_blank';
        grpLinkEl.rel = 'noopener noreferrer';
        grpLinkEl.style.cssText = 'font-weight: bold; color: #e2e8f0; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: none;';
        grpLinkEl.textContent = (h.groupName || 'Nhóm Facebook') + ' ↗';
        topRow.appendChild(grpLinkEl);
      } else {
        const grpNameSpan = document.createElement('span');
        grpNameSpan.style.cssText = 'font-weight: bold; color: #e2e8f0; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
        grpNameSpan.textContent = h.groupName || 'Nhóm Facebook';
        topRow.appendChild(grpNameSpan);
      }

      const badgeSpan = document.createElement('span');
      badgeSpan.className = badgeClass;
      badgeSpan.textContent = statusLabel;
      topRow.appendChild(badgeSpan);

      const midRow = document.createElement('div');
      midRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; color: #38bdf8;';
      const accSpan = document.createElement('span');
      const uidInfo = h.accountUid || (h.accountId && h.accountId !== 'default' ? h.accountId : '');
      accSpan.textContent = uidInfo && uidInfo !== h.accountName
        ? `👤 Nick: ${h.accountName || 'Mặc định'} (${uidInfo})`
        : `👤 Nick: ${h.accountName || h.accountId || 'Mặc định'}`;
      midRow.appendChild(accSpan);

      if (h.autoJoined) {
        const joinSpan = document.createElement('span');
        joinSpan.style.cssText = 'color: #34d399; font-weight: 600;';
        joinSpan.textContent = '🤝 Tự vào nhóm';
        midRow.appendChild(joinSpan);
      }

      const botRow = document.createElement('div');
      botRow.style.cssText = 'display: flex; justify-content: space-between; font-size: 9.5px; color: #94a3b8;';

      const timeSpan = document.createElement('span');
      timeSpan.textContent = `${h.timeFormatted || new Date(h.timestamp).toLocaleTimeString()} (${typeLabel})`;

      const msgSpan = document.createElement('span');
      msgSpan.textContent = h.message || '';

      botRow.appendChild(timeSpan);
      botRow.appendChild(msgSpan);

      item.appendChild(topRow);
      item.appendChild(midRow);
      item.appendChild(botRow);
      popupHistoryBox.appendChild(item);
    });
  }

  popupHistoryAccountFilter?.addEventListener('change', () => renderPopupHistory());
  popupHistoryStatusFilter?.addEventListener('change', () => renderPopupHistory());

  btnPopupExportHistoryCsv?.addEventListener('click', async () => {
    const res = await chrome.storage.local.get(['postHistory']);
    const history = Array.isArray(res.postHistory) ? res.postHistory : [];
    const filtered = getPopupFilteredHistory(history);
    if (!filtered.length) return alert('Chưa có lịch sử nào để xuất CSV!');
    const csvContent = (typeof SharedStorage !== 'undefined' && typeof SharedStorage.formatHistoryToCsv === 'function')
      ? SharedStorage.formatHistoryToCsv(filtered)
      : '\uFEFFSTT,Thời Gian,Tài Khoản,Nhóm,Trạng Thái\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lich_su_fb_${filtered.length}_muc_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`✓ Đã xuất ${filtered.length} dòng lịch sử ra CSV!`);
  });

  btnPopupClearHistory?.addEventListener('click', async () => {
    if (confirm('Xóa toàn bộ lịch sử đăng bài?')) {
      await chrome.storage.local.set({ postHistory: [] });
      renderPopupHistory();
      showToast('Đã xóa sạch lịch sử.');
    }
  });

  // 6. Bắt đầu chạy & Dừng
  startBtn?.addEventListener('click', () => {
    const active = currentGroups.filter((g) => g.enabled !== false);
    if (!active.length) return alert('Chưa chọn nhóm nào!');
    const txt = postContent?.value.trim();
    if (!txt) return alert('Chưa có nội dung bài viết!');

    // KIỂM TRA BẢN QUYỀN TRƯỚC KHI THỰC HIỆN ĐĂNG
    chrome.runtime.sendMessage({ action: 'CHECK_LICENSE' }, async (licRes) => {
      if (!licRes || !licRes.isValid) {
        alert(`🚨 BẢN QUYỀN CHƯA KÍCH HOẠT HOẶC ĐÃ HẾT HẠN!\n\n${licRes?.message || 'Vui lòng kích hoạt mã bản quyền để bắt đầu đăng bài.'}`);
        chrome.runtime.openOptionsPage();
        return;
      }

      let activeAcc = null;
      if (typeof AccountsManager !== 'undefined' && AccountsManager.getActiveAccount) {
        activeAcc = await AccountsManager.getActiveAccount();
      }

      const p = currentPosts[currentSelectedPostIndex];
      const shouldAttach = enableAttachImage ? enableAttachImage.checked : true;
      if (startBtn) startBtn.style.display = 'none';
      if (stopBtn) stopBtn.style.display = 'block';
      if (progressBox) progressBox.style.display = 'block';
      if (statusText) statusText.innerText = 'Đang kích hoạt tiến trình...';

      chrome.runtime.sendMessage({
        action: 'START_BATCH_POSTING',
        payload: {
          groups: active,
          content: txt,
          variants: [p?.content, p?.contentVariant2, p?.contentVariant3].filter((v) => typeof v === 'string' && v.trim().length > 0),
          images: shouldAttach ? (p?.images?.slice(0, 3) || []) : [],
          isSpintaxEnabled: enableSpintax ? enableSpintax.checked : true,
          delaySec: delayInput ? (parseInt(delayInput.value, 10) || 30) : 30,
          shouldShuffle: shuffleGroupsToggle ? shuffleGroupsToggle.checked : true,
          autoJoinOnPost: autoJoinOnPostToggle ? autoJoinOnPostToggle.checked : true,
          postTitle: p?.title || 'Bài Tuyển Dụng',
          accountId: activeAcc ? activeAcc.id : 'default',
          accountName: activeAcc ? activeAcc.name : 'Tài khoản mặc định',
        },
      }, (runRes) => {
        if (runRes && runRes.success === false) {
          if (startBtn) startBtn.style.display = 'block';
          if (stopBtn) stopBtn.style.display = 'none';
          alert(`🚨 KHÔNG THỂ BẮT ĐẦU:\n\n${runRes.error || 'Tài khoản đang trong thời gian nghỉ an toàn.'}`);
        }
      });
    });
  });

  stopBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'STOP_BATCH_POSTING' }, () => {
      if (startBtn) startBtn.style.display = 'block';
      if (stopBtn) stopBtn.style.display = 'none';
      if (statusText) statusText.innerText = '⏹️ Đã dừng tiến trình!';
      if (progressBar) progressBar.style.width = '0%';
      showToast('⏹️ Đã dừng tiến trình ngay lập tức!');
    });
  });

  // ==========================================
  // CẬP NHẬT TRẠNG THÁI BẢN QUYỀN TRÊN POPUP
  // ==========================================
  const popupClientName = document.getElementById('popupClientName');
  const popupClientPhone = document.getElementById('popupClientPhone');
  const popupDeviceId = document.getElementById('popupDeviceId');
  const popupDaysLeft = document.getElementById('popupDaysLeft');
  const popupExpiresAt = document.getElementById('popupExpiresAt');
  const popupPlanBadge = document.getElementById('popupPlanBadge');
  const popupLicIcon = document.getElementById('popupLicIcon');

  function refreshPopupLicense() {
    chrome.storage.local.get(['autorecruit_device_id'], (st) => {
      if (popupDeviceId) popupDeviceId.innerText = st.autorecruit_device_id || 'Đang xác định...';
    });

    chrome.runtime.sendMessage({ action: 'SYNC_ADMIN_STATUS' }, () => {
      chrome.runtime.sendMessage({ action: 'CHECK_LICENSE', forceRemote: true }, (res) => {
        if (!res) return;
        if (res.isValid && res.license && !res.isRevoked && !res.license.isRevoked) {
          const lic = res.license;
          const expMs = lic.expiresAt ? new Date(lic.expiresAt).getTime() : 0;
          const daysLeft = expMs > Date.now()
            ? Math.max(1, Math.ceil((expMs - Date.now()) / (24 * 60 * 60 * 1000)))
            : (typeof lic.daysLeft === 'number' ? lic.daysLeft : parseInt(lic.daysLeft || '0', 10));
          const isExpiringSoon = daysLeft <= 3 && daysLeft >= 0;

          if (popupClientName) popupClientName.innerText = lic.clientName || 'Khách Hàng VIP';
          if (popupClientPhone) popupClientPhone.innerText = lic.phone || 'Chưa cập nhật';
          if (popupDaysLeft) popupDaysLeft.innerText = `${daysLeft} ngày`;
          if (popupExpiresAt) {
            try {
              const expDate = new Date(lic.expiresAt).toLocaleDateString('vi-VN');
              popupExpiresAt.innerText = expDate;
            } catch (e) {
              popupExpiresAt.innerText = lic.expiresAt || 'Vĩnh viễn';
            }
          }
          if (popupPlanBadge) {
            popupPlanBadge.innerText = lic.planType === 'team' ? 'DOANH NGHIỆP' : (lic.planType === 'trial' ? 'DÙNG THỬ' : 'VIP CÁ NHÂN');
            popupPlanBadge.style.background = isExpiringSoon ? 'rgba(217,119,6,0.2)' : 'rgba(16,185,129,0.2)';
            popupPlanBadge.style.color = isExpiringSoon ? '#fbbf24' : '#34d399';
          }
          if (popupLicIcon) popupLicIcon.innerText = isExpiringSoon ? '⏰' : (lic.planType === 'trial' ? '🎁' : '💎');
        } else {
          const isExp = res.isExpired;
          const isRevoked = Boolean(res.isRevoked || res.license?.isRevoked);
          if (popupClientName) popupClientName.innerText = isRevoked ? 'Đã bị khóa quyền' : (isExp ? 'Đã hết hạn' : 'Chưa kích hoạt');
          if (popupClientPhone) popupClientPhone.innerText = '---';
          if (popupDaysLeft) popupDaysLeft.innerText = '0 ngày';
          if (popupExpiresAt) popupExpiresAt.innerText = 'Cần gia hạn / duyệt đơn';
          if (popupPlanBadge) {
            popupPlanBadge.innerText = isRevoked ? 'BỊ KHÓA' : (isExp ? 'HẾT HẠN' : 'CHƯA KÍCH HOẠT');
            popupPlanBadge.style.background = 'rgba(225,29,72,0.2)';
            popupPlanBadge.style.color = '#fda4af';
          }
          if (popupLicIcon) popupLicIcon.innerText = isRevoked ? '🚫' : (isExp ? '🚨' : '⚠️');
        }
      });
    });
  }

  document.getElementById('popupLicenseBar')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html?tab=license&pricing=1') });
  });



  refreshPopupLicense();

  setInterval(() => {
    chrome.storage.local.get(['postJobState'], (res) => {
      const state = res.postJobState;
      if (!state) return;
      if (state.isRunning) {
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'block';
        if (progressBox) progressBox.style.display = 'block';
        if (statusText) statusText.innerText = state.statusText || 'Đang đăng...';
        const pct = Math.min(100, Math.round(((state.currentIndex || 0) / (state.totalGroups || 1)) * 100));
        if (progressBar) progressBar.style.width = `${pct}%`;
      } else {
        if (startBtn) startBtn.style.display = 'block';
        if (stopBtn) stopBtn.style.display = 'none';
        if (state.statusText && statusText) statusText.innerText = state.statusText;
      }
    });
  }, 800);

  // Đồng hồ thời gian thực Popup
  function updatePopupClock() {
    const el = document.getElementById('popupLiveClock');
    if (!el) return;
    const now = new Date();
    el.innerText = '🕒 ' + now.toLocaleTimeString('vi-VN', { hour12: false });
  }
  updatePopupClock();
  setInterval(updatePopupClock, 1000);
});
