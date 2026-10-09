// content.js - Tự động hóa đăng bài & Quét dò tìm nhóm Facebook chuẩn 100%
// Khắc phục toàn diện: Upload ảnh bài viết, nhận diện nút Đăng (cả nhóm duyệt), quét dò tìm nhóm chính xác

(function () {
  if (window.__AUTORECRUIT_FB_RUNNING__) return;
  window.__AUTORECRUIT_FB_RUNNING__ = true;

  console.log('[AutoRecruit FB] Content script khởi động:', window.location.href);

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Phân tích số lượng thành viên thông minh (hỗ trợ cả tiếng Việt và tiếng Anh: tr, triệu, k, m, nghìn)
  function parseMemberCount(text) {
    if (!text) return 0;
    const lower = text.toLowerCase();

    // 1. Kiểm tra đơn vị triệu: 1,5 tr | 1.2 triệu | 2m
    const matchTrieu = lower.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:tr|triệu|m)\b/i);
    if (matchTrieu) {
      const val = parseFloat(matchTrieu[1].replace(',', '.'));
      return Math.round(val * 1000000);
    }

    // 2. Kiểm tra đơn vị nghìn: 45k | 12.5k | 50 nghìn
    const matchNghin = lower.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:k|nghìn|ngàn)\b/i);
    if (matchNghin) {
      const val = parseFloat(matchNghin[1].replace(',', '.'));
      return Math.round(val * 1000);
    }

    // 3. Số định dạng đầy đủ: 15.420 thành viên | 15,420 members
    const matchFull = lower.match(/([0-9]{1,3}(?:[.,][0-9]{3})+)\s*(?:thành viên|members|người)/i);
    if (matchFull) {
      const cleanNum = matchFull[1].replace(/[.,]/g, '');
      return parseInt(cleanNum, 10) || 0;
    }

    // 4. Số đơn giản trước từ khóa thành viên
    const matchSimple = lower.match(/([0-9]+)\s*(?:thành viên|members|người theo dõi)/i);
    if (matchSimple) {
      return parseInt(matchSimple[1], 10) || 0;
    }

    return 0;
  }

  // Lắng nghe các tác vụ từ Background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'AUTO_POST_TO_GROUP') {
      handleAutoPost(request.content, request.images)
        .then((res) => {
          if (res && !res.success) {
            const spamCheck = checkFacebookSpamWarning();
            if (spamCheck.isBlocked) {
              res.isSpamBlocked = true;
              res.error = `🚨 FACEBOOK GIỚI HẠN TẦN SUẤT: ${spamCheck.reason}`;
            }
          }
          sendResponse(res || { success: true });
        })
        .catch((err) => {
          console.error('[AutoRecruit FB] Lỗi đăng bài:', err);
          const spamCheck = checkFacebookSpamWarning();
          const errText = (err.message || '').toLowerCase();
          const isSpam = spamCheck.isBlocked ||
            errText.includes('spam') ||
            errText.includes('giới hạn') ||
            errText.includes('tần suất') ||
            errText.includes('bảo vệ cộng đồng') ||
            errText.includes('thao tác quá nhanh') ||
            errText.includes('temporarily blocked');

          sendResponse({
            success: false,
            isSpamBlocked: isSpam,
            error: isSpam
              ? `🚨 FACEBOOK GIỚI HẠN TẦN SUẤT: ${spamCheck.reason || err.message}`
              : (err.message || 'Lỗi khi đăng bài'),
          });
        });
      return true;
    }

    if (request.action === 'SCAN_AND_PARSE_GROUPS') {
      handleScanSearchGroups(request.minMembers, request.autoJoin)
        .then((res) => sendResponse(res))
        .catch((err) => {
          console.error('[AutoRecruit FB] Lỗi quét nhóm:', err);
          sendResponse({ success: false, error: err.message || 'Lỗi khi quét nhóm' });
        });
      return true;
    }

    if (request.action === 'AUTO_JOIN_GROUP') {
      handleAutoJoinGroupPage()
        .then((res) => sendResponse(res || { success: true }))
        .catch((err) => {
          console.error('[AutoRecruit FB] Lỗi tự động tham gia nhóm:', err);
          sendResponse({ success: false, error: err.message || 'Lỗi khi tham gia nhóm' });
        });
      return true;
    }
  });

  // =========================================================================
  // 1. TÌM KIẾM & QUÉT DÒ TÌM NHÓM FACEBOOK (SỬA LỖI AVATAR VÀ THÀNH VIÊN)
  // =========================================================================
  async function handleScanSearchGroups(minMembers = 0, autoJoin = false) {
    console.log('[AutoRecruit FB] Bắt đầu cuộn trang để nạp kết quả tìm kiếm nhóm...');

    // Cuộn nhiều lần nhẹ nhàng để nạp dữ liệu lazy load của Facebook
    for (let s = 0; s < 5; s++) {
      window.scrollBy({ top: 800, behavior: 'smooth' });
      await sleep(1000);
    }

    const foundGroupsMap = new Map();
    const systemSubPaths = ['/feed', '/search', '/discover', '/create', '/joins', '/categories', '/notifications', '/messages'];

    // Tìm tất cả các liên kết nhóm
    const allLinks = Array.from(document.querySelectorAll('a[href*="/groups/"]'));

    for (const a of allLinks) {
      try {
        let rawHref = a.href;
        if (!rawHref) continue;

        // Chuẩn hóa link nhóm
        let cleanUrl = rawHref.split('?')[0].replace(/\/+$/, '');
        if (cleanUrl.endsWith('/groups')) continue;

        // Bỏ qua các URL chức năng hệ thống
        if (systemSubPaths.some((sub) => cleanUrl.includes(sub))) continue;

        // Đảm bảo là URL nhóm cấp 1: https://www.facebook.com/groups/<group_id_or_name>
        const matchGroup = cleanUrl.match(/(https?:\/\/[^/]+\/groups\/[^/]+)/i);
        if (!matchGroup) continue;
        const normalizedGroupUrl = matchGroup[1] + '/';

        // Tìm thẻ card chứa thông tin của nhóm này
        const cardContainer =
          a.closest('div[role="feed"] > div') ||
          a.closest('div[role="article"]') ||
          a.closest('div[data-visualcompletion="ignore-dynamic-attribute"]') ||
          a.closest('div[style*="border-radius"]') ||
          a.parentElement?.parentElement?.parentElement ||
          a.parentElement;

        if (!cardContainer) continue;

        // Trích xuất tên nhóm: Tìm từ thẻ tiêu đề hoặc từ link có chứa văn bản
        let groupName = '';
        const titleEl = cardContainer.querySelector('h2, h3, [role="heading"], strong, span[dir="auto"]');
        if (titleEl && titleEl.innerText?.trim().length >= 3) {
          groupName = titleEl.innerText.trim();
        }

        if (!groupName || groupName.length < 3) {
          const textCandidate = a.innerText?.trim() || a.textContent?.trim();
          if (textCandidate && textCandidate.length >= 3 && !textCandidate.includes('thành viên')) {
            groupName = textCandidate;
          }
        }

        // Bỏ qua nếu vẫn không có tên hợp lệ (chỉ là avatar rỗng)
        if (!groupName || groupName.length < 3) continue;

        // Lấy toàn bộ văn bản của Card để bóc tách thông tin thành viên và trạng thái
        const cardText = cardContainer.innerText || cardContainer.textContent || '';
        const memberCount = parseMemberCount(cardText);

        // Kiểm tra điều kiện số thành viên tối thiểu
        if (minMembers > 0 && memberCount > 0 && memberCount < minMembers) {
          continue;
        }

        // Kiểm tra trạng thái đã tham gia chưa
        const lowerCard = cardText.toLowerCase();
        let joined =
          lowerCard.includes('đã tham gia') ||
          lowerCard.includes('joined') ||
          lowerCard.includes('xem nhóm') ||
          lowerCard.includes('view group');

        // Tìm nút Tham gia nhóm nếu muốn tự động tham gia
        const joinBtn = cardContainer.querySelector(
          'div[role="button"][aria-label*="Tham gia"], div[role="button"][aria-label*="Join"], button[aria-label*="Tham gia"], button[aria-label*="Join"]'
        );

        if (!foundGroupsMap.has(normalizedGroupUrl)) {
          let memberText = '';
          if (memberCount >= 1000000) {
            memberText = (memberCount / 1000000).toFixed(1) + 'M thành viên';
          } else if (memberCount >= 1000) {
            memberText = (memberCount / 1000).toFixed(1) + 'K thành viên';
          } else if (memberCount > 0) {
            memberText = memberCount.toLocaleString('vi-VN') + ' thành viên';
          } else {
            memberText = 'Nhóm Facebook';
          }

          foundGroupsMap.set(normalizedGroupUrl, {
            id: 'grp_found_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            name: groupName,
            link: normalizedGroupUrl,
            memberCount: memberCount,
            memberText: memberText,
            joined: joined,
            enabled: true,
          });

          // Nếu có tùy chọn tự động tham gia nhóm và chưa tham gia
          if (autoJoin && joinBtn && !joined) {
            try {
              console.log('[AutoRecruit FB] Tự động bấm tham gia nhóm:', groupName);
              joinBtn.click();
              await sleep(1500);
            } catch (joinErr) {}
          }
        }
      } catch (err) {
        console.warn('[AutoRecruit FB] Lỗi parse nhóm con:', err);
      }
    }

    const resultList = Array.from(foundGroupsMap.values());
    console.log(`[AutoRecruit FB] Đã quét được ${resultList.length} nhóm hợp lệ!`);
    return { success: true, groups: resultList };
  }

  // =========================================================================
  // BỘ PHÁT HIỆN CHẶN SPAM & CƠ CHẾ BẢO VỆ CHỐNG TRÙNG LẶP HASH CỦA FACEBOOK
  // =========================================================================

  // 1. Kiểm tra chính xác xem Facebook có đang hiện thông báo chặn spam / giới hạn tần suất không
  function checkFacebookSpamWarning() {
    const spamSignals = [
      'bảo vệ cộng đồng khỏi spam',
      'giới hạn tần suất',
      'tạm thời bị chặn',
      'hành động này bị chặn',
      'thao tác quá nhanh',
      'bạn đang thao tác quá nhanh',
      'khoảng thời gian nhất định',
      'thử lại sau',
      'tiêu chuẩn cộng đồng',
      'vi phạm tiêu chuẩn',
      'không thể đăng bài',
      'to help protect the community from spam',
      'limit how often',
      'try again later',
      'temporarily blocked',
      'action blocked',
      'rate limit',
      'you’re temporarily blocked',
      'you are temporarily blocked',
      'going too fast',
      'slow down'
    ];

    // Quét trong tất cả dialog, alerts, thông báo lỗi hiện hành
    const containers = document.querySelectorAll('div[role="dialog"], div[role="alert"], [aria-live], div[data-nosnippet]');
    for (const d of containers) {
      if (!isVisible(d)) continue;
      const text = (d.innerText || '').toLowerCase();
      for (const sig of spamSignals) {
        if (text.includes(sig)) {
          return {
            isBlocked: true,
            reason: d.innerText.trim().slice(0, 200) || 'Facebook hiển thị cảnh báo giới hạn tần suất thao tác / chặn tạm thời.'
          };
        }
      }
    }

    // Quét toàn bộ phần tử văn bản trên trang
    const allSpans = document.querySelectorAll('span, div, p');
    for (const el of allSpans) {
      if (el.children.length === 0 && el.innerText && el.innerText.length > 15 && el.innerText.length < 350) {
        const t = el.innerText.toLowerCase();
        for (const sig of spamSignals) {
          if (t.includes(sig)) {
            return {
              isBlocked: true,
              reason: el.innerText.trim()
            };
          }
        }
      }
    }

    return { isBlocked: false };
  }

  // 2. Chống trùng lặp mã băm hình ảnh (Anti-PhotoDNA / Image Hash Buster)
  // Biến thiên nhẹ kích thước ±1px, điểm màu vô hình góc ảnh & độ nén giúp mỗi nhóm nhận 1 mã file MD5 hoàn toàn khác
  async function mutateImageUniqueHash(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:image')) return dataUrl;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const deltaW = Math.random() > 0.5 ? 1 : 0;
          const deltaH = Math.random() > 0.5 ? 1 : 0;
          canvas.width = Math.max(10, img.naturalWidth + deltaW);
          canvas.height = Math.max(10, img.naturalHeight + deltaH);

          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(dataUrl);

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Biến thiên 1 giá trị màu RGB ở góc (0,0) (mắt người hoàn toàn không nhận ra)
          try {
            const pixel = ctx.getImageData(0, 0, 1, 1);
            pixel.data[0] = (pixel.data[0] + 1) % 256;
            ctx.putImageData(pixel, 0, 0);
          } catch (e) {}

          const randomQuality = 0.83 + Math.random() * 0.05;
          const mutated = canvas.toDataURL('image/jpeg', randomQuality);
          resolve(mutated);
        } catch (err) {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // 3. Chống trùng lặp mã băm văn bản (Chèn Zero-Width Space vô hình & Ref Code ngẫu nhiên)
  function saltContentAntiSpam(text) {
    if (!text) return '';
    const invisibleChars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
    let salt = '';
    const len = 4 + Math.floor(Math.random() * 6);
    for (let i = 0; i < len; i++) {
      salt += invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
    }
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    return text.trim() + `\n\n${salt}· Mã TD: #${code}`;
  }

  // =========================================================================
  // 2. ĐĂNG BÀI VÀO NHÓM FACEBOOK (TÍCH HỢP BẢO VỆ CHỐNG SPAM)
  // =========================================================================
  async function handleAutoPost(content, images) {
    console.log('[AutoRecruit FB] Bắt đầu quy trình đăng bài...');

    // 0. Kiểm tra xem người dùng đã đăng nhập Facebook chưa
    if (
      window.location.href.includes('/login') ||
      window.location.pathname.startsWith('/login') ||
      document.querySelector('form[action*="/login"]')
    ) {
      return {
        success: false,
        error: 'Chưa đăng nhập Facebook trên trình duyệt này! Vui lòng mở Facebook và đăng nhập trước.'
      };
    }

    // Giả lập hành vi người thật: Cuộn trang nhẹ nhàng khi mới vào nhóm
    try {
      window.scrollBy({ top: 200, behavior: 'smooth' });
      await sleep(600);
      window.scrollBy({ top: -100, behavior: 'smooth' });
    } catch (e) {}
    await sleep(1500);

    // Nếu ở nhóm Mua bán (Sell/Marketplace group), tự động chuyển sang tab Thảo luận
    try {
      const discussionLink = document.querySelector('a[href*="/discussion"], a[href*="/thao-luan"]');
      if (discussionLink && !window.location.href.includes('/discussion')) {
        console.log('[AutoRecruit FB] Phát hiện nhóm mua bán, chuyển sang tab Thảo luận...');
        discussionLink.click();
        await sleep(2000);
      }
    } catch (tabErr) {}

    // Kiểm tra ngay xem Facebook có đang chặn spam từ trước không
    const initialSpam = checkFacebookSpamWarning();
    if (initialSpam.isBlocked) {
      console.error('[AutoRecruit FB] 🚨 TÀI KHOẢN ĐANG BỊ GIỚI HẠN TẦN SUẤT:', initialSpam.reason);
      return {
        success: false,
        isSpamBlocked: true,
        error: `🚨 FACEBOOK CHẶN SPAM: ${initialSpam.reason}`
      };
    }

    // 1. Kiểm tra hoặc mở modal Tạo bài viết
    let dialog = getFrontmostDialog();
    if (!dialog) {
      const trigger = findDiscussionPostTrigger();
      if (trigger) {
        console.log('[AutoRecruit FB] Đã tìm thấy ô tạo bài viết, đang click mở modal...');
        trigger.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(400);
        trigger.focus();
        trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        trigger.click();
        await sleep(2500);
      } else {
        window.scrollBy({ top: 300, behavior: 'smooth' });
        await sleep(1000);
        const retryTrigger = findDiscussionPostTrigger();
        if (retryTrigger) {
          retryTrigger.click();
          await sleep(2500);
        }
      }
    }

    // Chờ modal mở ra
    dialog = await waitForActiveDialog(8000);
    if (!dialog) {
      throw new Error('Không thể mở modal Tạo bài viết của Facebook (có thể nhóm yêu cầu tham gia trước hoặc Facebook chưa tải xong).');
    }

    // 2. Tìm khung soạn thảo văn bản
    const textBox = await waitForActiveEditor(dialog, 8000);
    if (!textBox) {
      throw new Error('Không tìm thấy khung nhập nội dung bài viết trong modal Facebook.');
    }

    // 3. Điền nội dung bài viết (Chèn Salt vô hình để biến thiên mã băm text 100%)
    console.log('[AutoRecruit FB] Đang điền nội dung vào khung soạn thảo...');
    const saltedContent = saltContentAntiSpam(content);
    await insertTextSafelyOnce(textBox, saltedContent);
    await sleep(1500);

    // 4. Đính kèm ảnh nếu có (Áp dụng Image Hash Buster)
    if (images && images.length > 0) {
      console.log(`[AutoRecruit FB] Đang đính kèm ${images.length} ảnh vào bài viết...`);
      await attachImagesSafely(dialog, images);
      await sleep(2500);
    }

    // Dừng nhẹ 1-2s như người thật trước khi bấm đăng
    await sleep(1500);

    // 5. Tìm và bấm nút Đăng (Post / Gửi phê duyệt)
    console.log('[AutoRecruit FB] Đang tìm nút Đăng bài...');
    const postSuccess = await findAndClickPostButton(dialog);
    if (!postSuccess) {
      // Kiểm tra có thông báo lỗi spam xuất hiện ngăn cản nút bấm không
      const checkBlock = checkFacebookSpamWarning();
      if (checkBlock.isBlocked) {
        return {
          success: false,
          isSpamBlocked: true,
          error: `🚨 FACEBOOK CHẶN SPAM: ${checkBlock.reason}`
        };
      }
      throw new Error('Không thể bấm nút Đăng (nút bị vô hiệu hóa hoặc Facebook đang chặn thao tác).');
    }

    console.log('[AutoRecruit FB] Đã bấm nút Đăng, đang kiểm tra kết quả phản hồi...');

    // 6. Kiểm tra phản hồi trong 8 giây: Đảm bảo không bị dính cảnh báo giới hạn tần suất
    let modalClosed = false;
    for (let check = 0; check < 8; check++) {
      await sleep(1000);

      // Kiểm tra ngay xem dòng chữ đỏ spam có xuất hiện không
      const spamCheck = checkFacebookSpamWarning();
      if (spamCheck.isBlocked) {
        console.error('[AutoRecruit FB] 🚨 PHÁT HIỆN CẢNH BÁO GIỚI HẠN TẦN SUẤT:', spamCheck.reason);
        return {
          success: false,
          isSpamBlocked: true,
          error: `🚨 FACEBOOK GIỚI HẠN TẦN SUẤT: ${spamCheck.reason}`
        };
      }

      // Nếu modal đã đóng thành công -> Bài viết đã được gửi đi
      const currentDialog = getFrontmostDialog();
      if (!currentDialog) {
        modalClosed = true;
        break;
      }
    }

    if (!modalClosed) {
      const finalSpam = checkFacebookSpamWarning();
      if (finalSpam.isBlocked) {
        return {
          success: false,
          isSpamBlocked: true,
          error: `🚨 FACEBOOK GIỚI HẠN TẦN SUẤT: ${finalSpam.reason}`
        };
      }
    }

    console.log('[AutoRecruit FB] ✓ Đã đăng bài thành công!');
    return { success: true, message: 'Đã gửi bài đăng thành công!' };
  }

  // Tìm nút/ô kích hoạt mở modal tạo bài viết trong nhóm
  function findDiscussionPostTrigger() {
    const main = document.querySelector('div[role="main"]') || document;

    const keywords = [
      'bạn viết gì đi',
      'viết gì đó',
      'tạo bài viết công khai',
      'tạo bài viết',
      'viết bài thảo luận',
      'bạn đang nghĩ gì',
      'write something',
      'create a public post',
      'create a post',
      'write a post'
    ];

    // 1. Quét theo aria-label chính xác
    for (const kw of keywords) {
      const matchAria = main.querySelector(`[aria-label*="${kw}" i]`);
      if (matchAria && isVisible(matchAria)) return matchAria;
    }

    // 2. Quét qua các button/div tương tác
    const candidates = Array.from(
      main.querySelectorAll('div[role="button"], span[role="button"], div[tabindex="0"]')
    );

    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const text = (el.innerText || el.getAttribute('aria-label') || '').toLowerCase().trim();
      if (!text || text.length > 90) continue;
      if (text.includes('bán gì đó') || text.includes('bán hàng') || text.includes('sell something')) continue;

      if (keywords.some((k) => text.includes(k))) {
        return el;
      }
    }

    // 3. Quét bất kỳ phần tử nào chứa văn bản gợi ý
    const allSpans = Array.from(main.querySelectorAll('span, div'));
    for (const sp of allSpans) {
      const t = (sp.innerText || '').toLowerCase().trim();
      if (keywords.some((k) => t === k || t === k + '...')) {
        const btn = sp.closest('[role="button"]') || sp;
        if (isVisible(btn)) return btn;
      }
    }

    return null;
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 10 && rect.height > 10 && window.getComputedStyle(el).display !== 'none';
  }

  function getFrontmostDialog() {
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).filter((d) => {
      const rect = d.getBoundingClientRect();
      return rect.width > 240 && rect.height > 160 && window.getComputedStyle(d).display !== 'none';
    });
    return dialogs[dialogs.length - 1] || null;
  }

  async function waitForActiveDialog(timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const d = getFrontmostDialog();
      if (d) return d;
      await sleep(300);
    }
    return getFrontmostDialog() || document.querySelector('div[role="dialog"]');
  }

  async function waitForActiveEditor(dialog, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const container = dialog || getFrontmostDialog() || document;
      const boxes = Array.from(
        container.querySelectorAll('div[role="textbox"][contenteditable="true"], div[contenteditable="true"]')
      ).filter((b) => {
        const rect = b.getBoundingClientRect();
        return rect.width > 60 && rect.height > 20 && window.getComputedStyle(b).display !== 'none';
      });
      if (boxes.length > 0) return boxes[boxes.length - 1];
      await sleep(300);
    }
    return null;
  }

  // Điền văn bản an toàn, tích hợp ClipboardEvent ('paste') chuẩn Lexical của Facebook
  async function insertTextSafelyOnce(textBox, text) {
    if (!text) return;

    textBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    textBox.focus();
    textBox.click();
    await sleep(200);

    // Đặt con trỏ vào khung soạn thảo
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(textBox);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
    await sleep(150);

    let pasteSuccess = false;

    // Cách 1: Sử dụng ClipboardEvent 'paste' (Phương pháp chuẩn nhất trên Facebook Lexical 2024-2026)
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const pasteEvt = new ClipboardEvent('paste', {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      textBox.dispatchEvent(pasteEvt);
      await sleep(400);

      if (textBox.innerText && textBox.innerText.trim().length > 0) {
        pasteSuccess = true;
      }
    } catch (e) {
      pasteSuccess = false;
    }

    // Cách 2: Nếu paste không kích hoạt, dùng execCommand tách đoạn
    if (!pasteSuccess) {
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
      } catch (e) {}
      await sleep(100);

      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length > 0) {
          document.execCommand('insertText', false, line);
        }
        if (i < lines.length - 1) {
          const ok = document.execCommand('insertParagraph', false, null);
          if (!ok) {
            document.execCommand('insertLineBreak', false, null);
          }
        }
      }
    }

    // Phát các sự kiện Input để cập nhật State của Facebook
    textBox.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: ' ' }));
    textBox.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText' }));
    textBox.dispatchEvent(new Event('change', { bubbles: true }));
    textBox.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
    textBox.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
    await sleep(400);
  }

  // Chuyển DataURL thành File nhị phân chuẩn không qua fetch (tránh lỗi CORS / CSP)
  function dataUrlToFile(dataUrl, filename = 'image.jpg') {
    try {
      const parts = dataUrl.split(',');
      if (parts.length < 2) return null;
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new File([u8arr], filename, { type: mime });
    } catch (e) {
      console.warn('[AutoRecruit FB] Lỗi chuyển đổi dataUrl sang File:', e);
      return null;
    }
  }

  // Đính kèm tối đa 3 ảnh vào modal Facebook
  async function attachImagesSafely(dialog, imageSources) {
    try {
      const container = dialog || getFrontmostDialog() || document;
      const imagesToAttach = (Array.isArray(imageSources) ? imageSources : [imageSources]).filter(Boolean).slice(0, 3);
      if (imagesToAttach.length === 0) return;

      // 1. Chuẩn bị danh sách File (Áp dụng Anti-Duplicate Hash Mutator cho mỗi ảnh)
      const dt = new DataTransfer();
      for (let i = 0; i < imagesToAttach.length; i++) {
        let src = imagesToAttach[i];
        if (typeof src === 'string' && src.startsWith('data:image')) {
          try {
            src = await mutateImageUniqueHash(src);
          } catch (e) {}
          const file = dataUrlToFile(src, `anh_${Date.now()}_${i + 1}.jpg`);
          if (file) dt.items.add(file);
        } else if (typeof src === 'string' && src.startsWith('http')) {
          try {
            const resp = await fetch(src);
            const blob = await resp.blob();
            dt.items.add(new File([blob], `anh_${Date.now()}_${i + 1}.jpg`, { type: blob.type || 'image/jpeg' }));
          } catch (e) {}
        }
      }

      if (dt.files.length === 0) {
        console.warn('[AutoRecruit FB] Không có file ảnh hợp lệ để đính kèm.');
        return;
      }

      // 2. Tìm input file hiện có
      let fileInput = container.querySelector('input[type="file"][accept*="image"], input[type="file"]') || document.querySelector('div[role="dialog"] input[type="file"]');

      // 3. Nếu chưa có input file, bấm nút mở phần Ảnh/video
      if (!fileInput) {
        const photoSelectors = [
          'div[aria-label*="Ảnh/video" i]',
          'div[aria-label*="Photo/video" i]',
          'div[aria-label*="Ảnh/Video" i]',
          'div[aria-label*="Thêm ảnh" i]',
          'div[aria-label*="Add photos" i]',
          'div[aria-label*="Photo" i]',
          'div[aria-label*="Image" i]',
          'div[aria-label*="Thêm vào bài viết" i]',
          'div[aria-label*="Add to your post" i]'
        ];

        for (const sel of photoSelectors) {
          const btn = container.querySelector(sel);
          if (btn && isVisible(btn)) {
            btn.click();
            await sleep(1500);
            break;
          }
        }

        // Tìm lại input file sau khi bấm nút
        fileInput =
          container.querySelector('input[type="file"][accept*="image"], input[type="file"]') ||
          document.querySelector('div[role="dialog"] input[type="file"]') ||
          document.querySelector('input[type="file"]');
      }

      // 4. Nếu có input file, nạp files vào
      if (fileInput) {
        try {
          Object.defineProperty(fileInput, 'files', {
            value: dt.files,
            configurable: true,
          });
        } catch (e) {
          fileInput.files = dt.files;
        }

        fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        console.log(`[AutoRecruit FB] Đã gắn ${dt.files.length} ảnh vào input file.`);
      }

      // 5. Thử phát thêm sự kiện Drop vào vùng soạn thảo hoặc modal (phòng khi Facebook dùng drag-and-drop)
      try {
        const dropTarget = container.querySelector('div[role="dialog"]') || container;
        const dropEvent = new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          composed: true,
          dataTransfer: dt,
        });
        dropTarget.dispatchEvent(dropEvent);
      } catch (dropErr) {}

      // Chờ Facebook xử lý ảnh và render khung xem trước
      await sleep(3500);
    } catch (err) {
      console.warn('[AutoRecruit FB] Lỗi trong quá trình gắn ảnh:', err);
    }
  }

  // Tìm và bấm nút Đăng (Hỗ trợ: Đăng, Post, Gửi phê duyệt, Submit, Tiếp, Next)
  async function findAndClickPostButton(dialog) {
    const container = dialog || getFrontmostDialog() || document;

    for (let attempt = 0; attempt < 25; attempt++) {
      const allButtons = Array.from(container.querySelectorAll('div[role="button"], button, [role="button"]'));

      const postBtn = allButtons.find((b) => {
        if (!isVisible(b)) return false;
        const text = (b.innerText || b.getAttribute('aria-label') || '').trim().toLowerCase();

        return (
          text === 'đăng' ||
          text === 'post' ||
          text === 'đăng bài' ||
          text === 'chia sẻ' ||
          text === 'gửi' ||
          text === 'submit' ||
          text.includes('phê duyệt') ||
          text.includes('gửi để phê duyệt') ||
          text.includes('submit for approval') ||
          text === 'tiếp' ||
          text === 'next' ||
          text === 'publish'
        );
      });

      if (postBtn) {
        const isDisabled =
          postBtn.getAttribute('aria-disabled') === 'true' ||
          postBtn.disabled ||
          postBtn.classList.contains('disabled');

        if (!isDisabled) {
          console.log('[AutoRecruit FB] Nút Đăng đã sẵn sàng, thực hiện click...');
          postBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(300);
          postBtn.focus();
          postBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
          postBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
          postBtn.click();

          const t = (postBtn.innerText || postBtn.getAttribute('aria-label') || '').trim().toLowerCase();
          if (t === 'tiếp' || t === 'next') {
            await sleep(2000);
            continue;
          }
          return true;
        } else {
          console.log(`[AutoRecruit FB] Nút Đăng vẫn đang bị vô hiệu hóa (lần thử ${attempt + 1}/25)...`);
        }
      }

      await sleep(500);
    }

    return false;
  }

  // =========================================================================
  // 3. TỰ ĐỘNG THAM GIA NHÓM TRÊN TRANG NHÓM FACEBOOK
  // =========================================================================
  async function handleAutoJoinGroupPage() {
    console.log('[AutoRecruit FB] Kiểm tra và tham gia nhóm tại trang:', window.location.href);
    await sleep(2500);

    // 1. Kiểm tra xem đã là thành viên hoặc đã gửi yêu cầu chưa
    const bodyText = (document.body.innerText || '').toLowerCase();
    if (
      bodyText.includes('đã tham gia') ||
      bodyText.includes('joined') ||
      bodyText.includes('hủy yêu cầu') ||
      bodyText.includes('cancel request')
    ) {
      console.log('[AutoRecruit FB] Bạn đã là thành viên hoặc đã gửi yêu cầu tham gia.');
      return { success: true, joined: true, message: 'Đã là thành viên hoặc đã gửi yêu cầu' };
    }

    // 2. Tìm nút "Tham gia nhóm" / "Join group"
    const joinSelectors = [
      'div[role="button"][aria-label*="Tham gia nhóm" i]',
      'div[role="button"][aria-label*="Join group" i]',
      'div[role="button"][aria-label*="Tham gia" i]',
      'div[role="button"][aria-label*="Join" i]',
      'button[aria-label*="Tham gia" i]',
      'button[aria-label*="Join" i]'
    ];

    let joinBtn = null;
    for (const sel of joinSelectors) {
      const btn = document.querySelector(sel);
      if (btn && isVisible(btn)) {
        joinBtn = btn;
        break;
      }
    }

    if (!joinBtn) {
      const allButtons = Array.from(document.querySelectorAll('div[role="button"], button'));
      joinBtn = allButtons.find((b) => {
        if (!isVisible(b)) return false;
        const t = (b.innerText || '').trim().toLowerCase();
        return t === 'tham gia nhóm' || t === 'join group' || t === 'tham gia' || t === 'join';
      });
    }

    if (!joinBtn) {
      console.warn('[AutoRecruit FB] Không tìm thấy nút Tham gia nhóm (có thể đã tham gia hoặc nhóm đóng).');
      return { success: false, error: 'Không tìm thấy nút Tham gia nhóm trên trang' };
    }

    console.log('[AutoRecruit FB] Đã tìm thấy nút Tham gia, đang click...');
    joinBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(400);
    joinBtn.click();
    await sleep(2500);

    // 3. Xử lý popup câu hỏi hoặc quy tắc nhóm nếu có
    const dialog = getFrontmostDialog();
    if (dialog) {
      console.log('[AutoRecruit FB] Phát hiện hộp thoại câu hỏi / quy tắc nhóm, đang tự động đồng ý...');
      const checkboxes = Array.from(dialog.querySelectorAll('input[type="checkbox"]'));
      for (const cb of checkboxes) {
        if (!cb.checked) {
          cb.click();
          await sleep(200);
        }
      }

      const submitBtn = Array.from(dialog.querySelectorAll('div[role="button"], button')).find((b) => {
        const t = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase().trim();
        return (
          t === 'gửi' ||
          t === 'submit' ||
          t === 'xác nhận' ||
          t === 'đồng ý' ||
          t === 'agree' ||
          t === 'hoàn tất' ||
          t === 'done' ||
          t === 'tiếp' ||
          t === 'next'
        );
      });

      if (submitBtn && submitBtn.getAttribute('aria-disabled') !== 'true') {
        submitBtn.click();
        await sleep(2000);
      }
    }

    return { success: true, joined: true, message: 'Đã gửi yêu cầu tham gia nhóm thành công!' };
  }
})();
