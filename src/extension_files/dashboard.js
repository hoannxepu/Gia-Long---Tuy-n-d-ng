// dashboard.js - Bảng Điều Khiển Nâng Cấp V1.5
// Hỗ trợ: Hẹn giờ chuẩn Alarms, Chọn/bỏ chọn tất cả nhóm, Xóa nhiều nhóm, Dò tìm nhóm, Lịch sử đăng bài

let posts = [];
let groups = [];
let scheduledTimes = ['08:30', '11:30', '17:30', '20:00'];
let selectedPostIdx = 0;
let currentVariantTab = 1;
let autoSaveTimer = null;
let scannedGroupsTemp = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Navigation Tabs
  const tabNavMain = document.getElementById('tabNavMain');
  const tabNavFinder = document.getElementById('tabNavFinder');
  const tabNavHistory = document.getElementById('tabNavHistory');
  const tabNavLicense = document.getElementById('tabNavLicense');
  const viewMain = document.getElementById('viewMain');
  const viewFinder = document.getElementById('viewFinder');
  const viewHistory = document.getElementById('viewHistory');
  const viewLicense = document.getElementById('viewLicense');

  function switchTab(target) {
    [tabNavMain, tabNavFinder, tabNavHistory, tabNavLicense].forEach((b) => b?.classList.remove('active'));
    [viewMain, viewFinder, viewHistory, viewLicense].forEach((v) => { if (v) v.style.display = 'none'; });

    if (target === 'main') {
      tabNavMain?.classList.add('active');
      if (viewMain) viewMain.style.display = 'grid';
    } else if (target === 'finder') {
      tabNavFinder?.classList.add('active');
      if (viewFinder) viewFinder.style.display = 'flex';
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

  // Elements Cột 3 (Hẹn giờ)
  const delayInput = document.getElementById('delayInput');
  const timeTagsContainer = document.getElementById('timeTagsContainer');
  const timeInput = document.getElementById('timeInput');
  const btnAddTime = document.getElementById('btnAddTime');
  const btnGoldenHours = document.getElementById('btnGoldenHours');
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

  function showToast(msg) {
    if (!toast) return;
    toast.innerText = msg;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 2600);
  }

  // HÀM LƯU TỨC THÌ VÀO STORAGE
  function triggerAutoSave(immediate = false) {
    clearTimeout(autoSaveTimer);
    const saveFn = () => {
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
      chrome.storage.local.set({
        isInitialized: true,
        savedPosts: posts,
        savedGroups: groups,
        savedTimes: scheduledTimes,
        scheduledTimes: scheduledTimes,
        selectedPostIdx: selectedPostIdx,
        delaySec: delayInput ? (parseInt(delayInput.value, 10) || 25) : 25,
        isScheduleActive: scheduleToggle ? scheduleToggle.checked : false,
        enableSpintax: true,
        shouldShuffleGroups: true,
      });
    };

    if (immediate) {
      saveFn();
    } else {
      autoSaveTimer = setTimeout(saveFn, 200);
    }
  }

  // Tải dữ liệu từ Storage: Nếu đã khởi tạo thì đọc 100% từ storage
  chrome.storage.local.get(
    ['isInitialized', 'savedPosts', 'savedGroups', 'savedTimes', 'scheduledTimes', 'selectedPostIdx', 'isScheduleActive', 'delaySec'],
    async (res) => {
      if (res.isInitialized) {
        posts = Array.isArray(res.savedPosts) ? res.savedPosts : [];
        groups = Array.isArray(res.savedGroups) ? res.savedGroups : [];
        const times = res.savedTimes || res.scheduledTimes;
        if (times) scheduledTimes = times;
        if (res.isScheduleActive !== undefined && scheduleToggle) {
          scheduleToggle.checked = res.isScheduleActive;
          // Kiểm tra xem bản quyền có hợp lệ không, nếu không thì tắt toggle
          chrome.runtime.sendMessage({ action: 'CHECK_LICENSE' }, (licRes) => {
            if (!licRes || !licRes.isValid) {
              if (scheduleToggle) scheduleToggle.checked = false;
              chrome.runtime.sendMessage({ action: 'CANCEL_SCHEDULE' });
              updateScheduleStatus();
            }
          });
        }
        if (res.delaySec !== undefined && delayInput) delayInput.value = res.delaySec;
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
        triggerAutoSave(true);
      }

      renderPostDropdown();
      loadPost(selectedPostIdx, false);
      renderGroupList();
      renderTimes();
    }
  );

  window.addEventListener('beforeunload', () => triggerAutoSave(true));
  window.addEventListener('pagehide', () => triggerAutoSave(true));
  window.addEventListener('blur', () => triggerAutoSave(true));
  delayInput?.addEventListener('input', () => triggerAutoSave());

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

  // 3. Giờ đăng & Hẹn giờ
  function updateScheduleStatus() {
    const statusTextEl = document.getElementById('schedStatusText');
    const badgeEl = document.getElementById('scheduleStatusBadge');
    if (!statusTextEl) return;

    if (scheduleToggle && scheduleToggle.checked) {
      if (scheduledTimes && scheduledTimes.length > 0) {
        statusTextEl.innerHTML = `🟢 <strong>Đã cập nhật hẹn giờ:</strong> ${scheduledTimes.join(', ')} (Đang chạy ngầm)`;
        if (badgeEl) {
          badgeEl.style.borderColor = 'rgba(16, 185, 129, 0.4)';
          badgeEl.style.color = '#34d399';
        }
      } else {
        statusTextEl.innerHTML = `⚠️ <strong>Đã bật hẹn giờ:</strong> Chưa có khung giờ nào, vui lòng bấm + Thêm hoặc chọn Giờ Vàng!`;
        if (badgeEl) {
          badgeEl.style.borderColor = 'rgba(245, 158, 11, 0.4)';
          badgeEl.style.color = '#fbbf24';
        }
      }
    } else {
      statusTextEl.innerHTML = `⚪ Trạng thái: Chưa kích hoạt hẹn giờ`;
      if (badgeEl) {
        badgeEl.style.borderColor = '#1e293b';
        badgeEl.style.color = '#94a3b8';
      }
    }
  }

  function renderTimes() {
    if (!timeTagsContainer) return;
    timeTagsContainer.innerHTML = '';
    scheduledTimes.forEach((t, i) => {
      const tag = document.createElement('div');
      tag.className = 'time-tag';
      tag.innerHTML = `<span>⏰ ${t}</span><span class="del" data-i="${i}">✕</span>`;
      timeTagsContainer.appendChild(tag);
    });

    document.querySelectorAll('.time-tag .del').forEach((el) => {
      el.addEventListener('click', (e) => {
        const i = parseInt(e.target.getAttribute('data-i') || '0', 10);
        scheduledTimes.splice(i, 1);
        triggerAutoSave(true);
        renderTimes();
        updateScheduleStatus();
      });
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
      let h = parseInt(hStr, 10);
      let m = parseInt(mStr, 10);

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

    if (!scheduledTimes.includes(formattedTime)) {
      scheduledTimes.push(formattedTime);
      scheduledTimes.sort();
      triggerAutoSave(true);
      renderTimes();
      updateScheduleStatus();
      showToast(`✓ Đã thêm khung giờ hẹn đăng: ${formattedTime}`);
    } else {
      showToast(`Khung giờ ${formattedTime} đã có trong danh sách!`);
    }
  });

  btnGoldenHours?.addEventListener('click', () => {
    scheduledTimes = ['08:30', '11:30', '17:30', '20:00'];
    triggerAutoSave(true);
    renderTimes();
    updateScheduleStatus();
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
            delaySec: delayInput ? (parseInt(delayInput.value, 10) || 25) : 25,
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
      // 3 Biến thể tự động an toàn, giữ nguyên 100% nội dung chính bài đăng
      const postVariants = [
        baseContent,
        baseContent + '\u200B\u200C',
        baseContent + '\uFEFF\u200D',
      ];

      if (btnStartRun) btnStartRun.style.display = 'none';
      if (btnStopRun) btnStopRun.style.display = 'block';
      if (progressArea) progressArea.style.display = 'block';
      if (statusLabel) statusLabel.innerText = 'Đang bắt đầu...';
      if (progressBar) progressBar.style.width = '5%';

      chrome.runtime.sendMessage({
        action: 'START_BATCH_POSTING',
        payload: {
          groups: activeGrps,
          content: txt,
          variants: postVariants,
          images: postImgs,
          isSpintaxEnabled: true,
          delaySec: delayInput ? (parseInt(delayInput.value, 10) || 45) : 45,
          shouldShuffle: true,
          postTitle: currentPostObj?.title || 'Bài Tuyển Dụng',
        },
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

  // 6. Lịch sử đăng bài
  async function renderHistory() {
    if (!historyTableBody) return;
    historyTableBody.innerHTML = '';
    const res = await chrome.storage.local.get(['postHistory']);
    const history = res.postHistory || [];

    if (history.length === 0) {
      historyTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #64748b; padding: 25px;">Chưa có lịch sử đăng bài nào.</td></tr>';
      return;
    }

    history.forEach((h) => {
      const tr = document.createElement('tr');
      const badgeClass = h.status === 'success' ? 'badge-success' : (h.status === 'stopped' ? 'badge-stopped' : 'badge-failed');
      const statusText = h.status === 'success' ? 'Thành công' : (h.status === 'stopped' ? 'Đã dừng' : 'Thất bại');
      const typeLabel = h.type === 'scheduled' ? '⏰ Hẹn giờ' : '⚡ Thủ công';

      tr.innerHTML = `
        <td style="font-size: 11px; color: #94a3b8;">${h.timeFormatted || new Date(h.timestamp).toLocaleString()}</td>
        <td><span style="font-size: 11px; color: #38bdf8;">${typeLabel}</span></td>
        <td style="font-weight: 600;"><a href="${h.groupLink}" target="_blank" style="color: #e2e8f0; text-decoration: none;">${h.groupName} ↗</a></td>
        <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${h.postTitle || 'Bài Tuyển Dụng'}</td>
        <td><span class="${badgeClass}">${statusText}</span></td>
        <td style="font-size: 11px; color: #94a3b8;">${h.message || ''}</td>
      `;
      historyTableBody.appendChild(tr);
    });
  }

  btnClearHistory?.addEventListener('click', async () => {
    if (confirm('Bạn có chắc muốn xóa sạch toàn bộ lịch sử đăng bài?')) {
      await chrome.storage.local.set({ postHistory: [] });
      renderHistory();
      showToast('Đã xóa sạch lịch sử.');
    }
  });

  btnExportHistory?.addEventListener('click', async () => {
    const res = await chrome.storage.local.get(['postHistory']);
    const history = res.postHistory || [];
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
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
  const licKeyDisplay = document.getElementById('licKeyDisplay');
  const licBadgeStatus = document.getElementById('licBadgeStatus');
  const licDaysLeftText = document.getElementById('licDaysLeftText');
  const licPlanTypeText = document.getElementById('licPlanTypeText');
  const licDevicesCount = document.getElementById('licDevicesCount');
  const licCurrentDeviceId = document.getElementById('licCurrentDeviceId');

  const inputNewLicenseKey = document.getElementById('inputNewLicenseKey');
  const btnSubmitActivateLicense = document.getElementById('btnSubmitActivateLicense');
  const btnRefreshLicenseStatus = document.getElementById('btnRefreshLicenseStatus');

  licenseHeaderPill?.addEventListener('click', () => switchTab('license'));
  btnHeaderLicenseAction?.addEventListener('click', (e) => {
    e.stopPropagation();
    switchTab('license');
  });

  async function loadLicenseDetails(forceRemote = false) {
    chrome.runtime.sendMessage({ action: 'GET_DEVICE_ID' }, (devRes) => {
      if (licCurrentDeviceId && devRes?.deviceId) {
        licCurrentDeviceId.innerText = devRes.deviceId;
      }
    });

    chrome.runtime.sendMessage({ action: 'CHECK_LICENSE', forceRemote }, (res) => {
      if (!res) return;

      const lic = res.license;
      if (res.isValid && lic) {
        const isTrialPlan = lic.planType === 'trial';

        // Cập nhật Header Pill
        if (licenseHeaderPill) {
          licenseHeaderPill.style.background = isTrialPlan ? 'rgba(88, 28, 135, 0.35)' : 'rgba(6, 78, 59, 0.35)';
          licenseHeaderPill.style.borderColor = isTrialPlan ? 'rgba(168, 85, 247, 0.45)' : 'rgba(16, 185, 129, 0.45)';
        }
        if (licenseHeaderTitle) {
          const deviceText = lic.maxDevices > 1 ? `${lic.maxDevices} máy` : '1 máy';
          licenseHeaderTitle.innerText = isTrialPlan
            ? `${lic.clientName} (DÙNG THỬ 1N • 20 BÀI)`
            : `${lic.clientName} (${deviceText}) • ${lic.daysLeft} ngày`;
          licenseHeaderTitle.style.color = isTrialPlan ? '#d8b4fe' : '#6ee7b7';
        }
        if (licenseHeaderIcon) licenseHeaderIcon.innerText = isTrialPlan ? '🎁' : '💎';
        if (btnHeaderLicenseAction) {
          btnHeaderLicenseAction.innerText = isTrialPlan ? 'DÙNG THỬ' : 'VIP';
          btnHeaderLicenseAction.className = isTrialPlan ? 'btn btn-sub' : 'btn btn-emerald';
        }

        // Cập nhật Trang License
        if (licClientName) licClientName.innerText = lic.clientName || (isTrialPlan ? 'Khách Hàng Dùng Thử' : 'Khách Hàng VIP');
        if (licKeyDisplay) licKeyDisplay.innerText = `Mã Bản Quyền: ${lic.key}`;
        if (licBadgeStatus) {
          licBadgeStatus.innerText = isTrialPlan ? '🎁 GÓI DÙNG THỬ (20 BÀI ĐĂNG)' : '✓ BẢN QUYỀN HỢP LỆ';
          licBadgeStatus.className = 'badge-success';
        }
        if (licDaysLeftText) {
          const expDate = new Date(lic.expiresAt).toLocaleDateString('vi-VN');
          licDaysLeftText.innerText = isTrialPlan
            ? `Dùng thử 1 ngày (Hết hạn: ${expDate}) • Giới hạn 20 bài`
            : `Còn ${lic.daysLeft} ngày (Hết hạn: ${expDate})`;
        }
        if (licPlanTypeText) {
          licPlanTypeText.innerText = isTrialPlan
            ? '0 VNĐ (Gói Dùng Thử 1 Ngày • Giới hạn 20 bài đăng)'
            : `1.000.000đ / tháng (${lic.maxDevices || 1} máy)`;
        }
        if (licDevicesCount) {
          licDevicesCount.innerText = `${lic.activeDevicesCount || 1} / ${lic.maxDevices || 1} máy tính`;
        }
      } else {
        // Chưa kích hoạt, hết hạn hoặc bị thu hồi
        const isRevoked = res.isRevoked || lic?.isRevoked;
        const isExp = res.isExpired;
        if (licenseHeaderPill) {
          licenseHeaderPill.style.background = isRevoked || isExp ? 'rgba(136, 19, 55, 0.3)' : 'rgba(120, 53, 15, 0.25)';
          licenseHeaderPill.style.borderColor = isRevoked || isExp ? 'rgba(244, 63, 94, 0.4)' : 'rgba(245, 158, 11, 0.4)';
        }
        if (licenseHeaderTitle) {
          licenseHeaderTitle.innerText = isRevoked
            ? 'Bản Quyền Đã Thu Hồi'
            : isExp
            ? 'Bản Quyền Đã Hết Hạn'
            : 'Chưa Kích Hoạt Bản Quyền';
          licenseHeaderTitle.style.color = isRevoked || isExp ? '#fda4af' : '#fbbf24';
        }
        if (licenseHeaderIcon) licenseHeaderIcon.innerText = isRevoked ? '🚫' : isExp ? '🚨' : '⚠️';
        if (btnHeaderLicenseAction) {
          btnHeaderLicenseAction.innerText = isRevoked ? 'Bị Khóa' : isExp ? 'Gia Hạn' : 'Kích Hoạt';
          btnHeaderLicenseAction.className = isRevoked ? 'btn btn-danger' : 'btn btn-amber';
        }

        if (licClientName) licClientName.innerText = lic?.clientName ? `${lic.clientName} (${isRevoked ? 'Đã Thu Hồi' : 'Hết Hạn'})` : 'Chưa Kích Hoạt';
        if (licKeyDisplay) licKeyDisplay.innerText = lic?.key ? `Mã: ${lic.key}` : 'Vui lòng nhập mã kích hoạt bên dưới';
        if (licBadgeStatus) {
          licBadgeStatus.innerText = isRevoked ? 'ĐÃ THU HỒI' : isExp ? 'HẾT HẠN' : 'CHƯA KÍCH HOẠT';
          licBadgeStatus.className = 'badge-failed';
        }
        if (licDaysLeftText) licDaysLeftText.innerText = res.message || 'Cần kích hoạt bản quyền';
        if (licPlanTypeText) licPlanTypeText.innerText = 'Chưa xác định';
        if (licDevicesCount) licDevicesCount.innerText = '0 / 0 máy';
      }
    });
  }

  btnSubmitActivateLicense?.addEventListener('click', () => {
    const raw = inputNewLicenseKey?.value.trim();
    if (!raw) return alert('Vui lòng nhập mã bản quyền (License Key)!');

    btnSubmitActivateLicense.disabled = true;
    btnSubmitActivateLicense.innerText = 'Đang kích hoạt...';

    chrome.runtime.sendMessage({ action: 'ACTIVATE_LICENSE', key: raw }, (res) => {
      btnSubmitActivateLicense.disabled = false;
      btnSubmitActivateLicense.innerText = '⚡ Kích Hoạt Ngay';

      if (res && res.success) {
        showToast('✓ ' + res.message);
        loadLicenseDetails(true);
        if (inputNewLicenseKey) inputNewLicenseKey.value = '';
      } else {
        alert('❌ Kích hoạt thất bại: ' + (res?.message || 'Mã không tồn tại hoặc đã hết hạn.'));
      }
    });
  });

  btnRefreshLicenseStatus?.addEventListener('click', () => {
    loadLicenseDetails(true);
    showToast('🔄 Đã cập nhật trạng thái bản quyền mới nhất!');
  });

  // Cấu hình máy chủ bản quyền tùy chỉnh
  const inputCustomServerUrl = document.getElementById('inputCustomServerUrl');
  const btnSaveCustomServerUrl = document.getElementById('btnSaveCustomServerUrl');
  const btnResetDefaultServerUrl = document.getElementById('btnResetDefaultServerUrl');

  chrome.storage.local.get(['customApiServerUrl'], (res) => {
    if (inputCustomServerUrl) {
      inputCustomServerUrl.value = res.customApiServerUrl || 'https://dang-bai-fb.pages.dev';
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
    const defaultUrl = 'https://dang-bai-fb.pages.dev';
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
  const devIdEl = document.getElementById('licCurrentDeviceId');
  const devId = (devIdEl && devIdEl.innerText) ? devIdEl.innerText.trim() : 'AFB-PC-USER';

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
      qrImg.src = `https://img.vietqr.io/image/970422-0869029310-compact2.png?amount=${rawNum}&addInfo=${encodeURIComponent(memo)}&accountName=GIA%20LONG%20FB`;
    } else {
      qrDebounceTimer = setTimeout(() => {
        qrImg.src = `https://img.vietqr.io/image/970422-0869029310-compact2.png?amount=${rawNum}&addInfo=${encodeURIComponent(memo)}&accountName=GIA%20LONG%20FB`;
      }, 180);
    }
  }
  return memo;
};

// Xử lý Hộp Thoại Đặt Mua Gói Bản Quyền Tự Động (Phương án A)
window.currentSelectedPkg = { name: 'Gói 3 Tháng', price: '2.700.000đ' };

window.openOrderModal = function(pkgName, pkgPrice) {
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

  const devIdEl = document.getElementById('licCurrentDeviceId');
  const devId = (devIdEl && devIdEl.innerText) ? devIdEl.innerText.trim() : 'AFB-PC-USER';

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
    const devIdEl = document.getElementById('licCurrentDeviceId');
    const devId = (devIdEl && devIdEl.innerText) ? devIdEl.innerText.trim() : 'AFB-PC-USER';
    const memo = generateTransferMemo(customerName, phone, pkg.name, devId);

    if (priceEl) priceEl.innerText = pkg.price;
    if (memoEl) memoEl.innerText = memo;

    if (modalConfirm) {
      modalConfirm.style.display = 'flex';
    } else {
      // Fallback nếu không tìm thấy modal confirm
      if (confirm(`Bạn đã chuyển khoản ${pkg.price} tới MBBank 0869.029.310 (Nội dung: ${memo}) chưa?\n\nBấm OK nếu đã chuyển khoản thành công để gửi lệnh mua đi!`)) {
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
window.proceedSendOrder = async function() {
  const modalConfirm = document.getElementById('modalConfirmTransferCheck');
  if (modalConfirm) modalConfirm.style.display = 'none';

  const devIdEl = document.getElementById('licCurrentDeviceId');
  const devId = (devIdEl && devIdEl.innerText) ? devIdEl.innerText.trim() : 'AFB-PC-USER';
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

  // Lưu thông tin SĐT và Tên để lần sau tự điền
  try {
    if (phone) localStorage.setItem('gialong_last_phone', phone);
    if (customerName) localStorage.setItem('gialong_last_name', customerName);
  } catch (e) {}

  const orderPayload = {
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

    if (successCode) successCode.innerText = orderData?.id || '#ORD-' + Date.now().toString().slice(-4);
    if (successPkg) successPkg.innerText = pkg.name + ' (' + pkg.price + ')';
    if (successDev) successDev.innerText = devId;
    if (successPhone) successPhone.innerText = phone + (customerName ? ` (${customerName})` : '');

    if (formBody) formBody.style.display = 'none';
    if (successBody) successBody.style.display = 'flex';
  };

  // 1. Thử gửi qua Service Worker (Background) có quyền kết nối mạng đầy đủ
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'CREATE_ORDER', payload: orderPayload }, (resp) => {
        if (!chrome.runtime.lastError && resp && resp.success) {
          showSuccessUI(resp.order);
          return;
        }
        fallbackDirectFetch();
      });
      return;
    }
  } catch (e) {}

  fallbackDirectFetch();

  // 2. Fallback gửi trực tiếp qua danh sách máy chủ khả dụng
  async function fallbackDirectFetch() {
    const candidates = [
      'https://ais-dev-cc3pyed4ifrln4z7zxo36q-299083950282.asia-southeast1.run.app',
      'https://ais-pre-cc3pyed4ifrln4z7zxo36q-299083950282.asia-southeast1.run.app',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      window.location.origin.startsWith('http') ? window.location.origin : null,
      'https://dang-bai-fb.pages.dev',
    ].filter(Boolean);

    for (const sUrl of candidates) {
      try {
        const res = await fetch(`${sUrl}/api/orders/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload),
        });
        const text = await res.text();
        if (!text || (!text.trim().startsWith('{') && !text.trim().startsWith('['))) continue;
        const data = JSON.parse(text);
        if (data && data.success) {
          showSuccessUI(data.order);
          return;
        }
      } catch (err) {
        console.warn('Lỗi kết nối tới:', sUrl, err);
      }
    }

    // Nếu không kết nối được, thông báo rõ ràng để khách không bị nhầm lẫn
    alert('Không thể kết nối máy chủ gửi đơn tự động do gián đoạn mạng. Vui lòng bấm mở Zalo 0869.029.310 để Quản trị viên kích hoạt trực tiếp!');
    window.open('https://zalo.me/0869029310', '_blank');
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '🚀 Xác Nhận Mua';
    }
  }
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
});
