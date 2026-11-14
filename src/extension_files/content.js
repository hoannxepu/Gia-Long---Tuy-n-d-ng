// content.js - TỰ ĐỘNG HÓA TƯƠNG TÁC NHÓM FACEBOOK (CHROME EXTENSION MV3)
// Xử lý đăng bài an toàn, tự vào nhóm khi phát hiện chưa tham gia, phát hiện checkpoint & rate limit chính xác.

(function (root) {
  if (typeof window !== 'undefined') {
    if (window.__AUTORECRUIT_FB_RUNNING__) return;
    window.__AUTORECRUIT_FB_RUNNING__ = true;
  }

  let isStopped = false;

  // Cấu hình thời gian chờ (cho phép rút ngắn khi chạy unit test tự động)
  const RuntimeConfig = {
    actionDelayMs: 1500,
    joinWaitMs: 2500,
    conditionTimeoutMs: 15000,
    conditionStepMs: 300,
    postVerifyIterations: 12,
    postVerifyStepMs: 1000,
  };

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isVisible(el) {
    if (!el) return false;
    if (typeof el.getBoundingClientRect === 'function') {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 5 || rect.height <= 5) return false;
    }
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      const style = window.getComputedStyle(el);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
    }
    return true;
  }

  function getElementText(el) {
    if (!el) return '';
    return String(el.innerText || el.textContent || el.getAttribute?.('aria-label') || '').trim();
  }

  function getFrontmostDialog() {
    if (typeof document === 'undefined') return null;
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]')).filter((d) => {
      if (!isVisible(d)) return false;
      if (typeof d.getBoundingClientRect === 'function') {
        const rect = d.getBoundingClientRect();
        return rect.width > 240 && rect.height > 160;
      }
      return true;
    });
    return dialogs[dialogs.length - 1] || null;
  }

  /**
   * Chờ phần tử xuất hiện có giới hạn thời gian
   */
  async function waitForCondition(checkFn, timeoutMs = RuntimeConfig.conditionTimeoutMs, stepMs = RuntimeConfig.conditionStepMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (isStopped) throw new Error('ABORTED');
      const res = checkFn();
      if (res) return res;
      await sleep(stepMs);
    }
    return checkFn() || null;
  }

  /**
   * Phân tích văn bản nội dung bài: Không tự ý thêm mã hash hay tag vô cớ
   */
  function saltContentAntiSpam(text, enableInvisible = false) {
    if (!text || typeof text !== 'string') return '';
    const clean = text.trim();
    if (!enableInvisible) return clean;

    const invisibleChars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
    let salt = '';
    const len = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < len; i++) {
      salt += invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
    }
    return clean + salt;
  }

  /**
   * Quét kiểm tra cảnh báo spam hoặc giới hạn tần suất CHỈ trên dialog/alert/toast xuất hiện sau khi thao tác
   */
  function checkSpamWarningInDialogs() {
    if (typeof document === 'undefined') return { isBlocked: false };

    const rateLimitKeywords = [
      'bảo vệ cộng đồng khỏi spam',
      'giới hạn tần suất',
      'thao tác quá nhanh',
      'bạn đang thao tác quá nhanh',
      'khoảng thời gian nhất định',
      'to help protect the community from spam',
      'limit how often',
      'temporarily blocked',
      'action blocked',
      'rate limit',
      'you’re temporarily blocked',
      'you are temporarily blocked',
      'going too fast',
      'slow down',
    ];

    const generalErrorKeywords = [
      'tiêu chuẩn cộng đồng',
      'vi phạm tiêu chuẩn',
      'không thể đăng bài',
      'đã xảy ra lỗi',
      'something went wrong',
    ];

    const containers = Array.from(
      document.querySelectorAll('div[role="dialog"], div[role="alert"], [aria-live="assertive"], [aria-live="polite"]')
    ).filter(isVisible);

    for (const d of containers) {
      const text = getElementText(d).toLowerCase();
      if (!text) continue;

      for (const sig of rateLimitKeywords) {
        if (text.includes(sig)) {
          return {
            isBlocked: true,
            type: 'rate_limit',
            reason: getElementText(d).slice(0, 200),
          };
        }
      }

      for (const sig of generalErrorKeywords) {
        if (text.includes(sig)) {
          return {
            isBlocked: true,
            type: 'other_error',
            reason: getElementText(d).slice(0, 200),
          };
        }
      }
    }

    return { isBlocked: false };
  }

  /**
   * Tìm nút mở hộp thoại Tạo bài viết ("Bạn viết gì đi...", "Viết gì đó...", "Write something...")
   */
  function findComposerTrigger() {
    if (typeof document === 'undefined') return null;
    const triggerKeywords = [
      'bạn viết gì đi',
      'viết gì đó',
      'tạo bài viết',
      'bạn đang nghĩ gì',
      'write something',
      'create a post',
      'start a discussion',
    ];
    const elements = Array.from(
      document.querySelectorAll('div[role="button"], span[role="button"], div[tabindex="0"], button')
    );
    return (
      elements.find((el) => {
        if (!isVisible(el)) return false;
        if (el.closest && el.closest('div[role="dialog"]')) return false;
        const t = getElementText(el).toLowerCase();
        return triggerKeywords.some((k) => t.includes(k));
      }) || null
    );
  }

  /**
   * Tìm nút "Tham gia nhóm" / "Join group" ở đầu trang nhóm (bỏ qua nút trong bài viết feed hoặc dialog)
   */
  function findGroupJoinButton() {
    if (typeof document === 'undefined') return null;
    const excludePhrases = [
      'đã tham gia',
      'joined',
      'hủy yêu cầu',
      'cancel request',
      'cuộc trò chuyện',
      'sự kiện',
      'phòng họp mặt',
      'chat',
      'event',
    ];

    const buttons = Array.from(
      document.querySelectorAll('div[role="button"], button, span[role="button"], a[role="button"]')
    );

    for (const btn of buttons) {
      if (!isVisible(btn)) continue;
      if (btn.closest && (btn.closest('[role="article"]') || btn.closest('div[role="dialog"]'))) continue;

      const label = (btn.getAttribute?.('aria-label') || '').trim().toLowerCase();
      const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      const combined = `${label} ${text}`.trim();

      if (!combined) continue;
      if (excludePhrases.some((ex) => combined.includes(ex))) continue;

      const isJoinMatch =
        text === 'tham gia nhóm' ||
        text === 'tham gia' ||
        text === 'join group' ||
        text === 'join' ||
        label === 'tham gia nhóm' ||
        label === 'tham gia' ||
        label === 'join group' ||
        label === 'join' ||
        text.startsWith('tham gia nhóm') ||
        label.startsWith('tham gia nhóm') ||
        text.startsWith('join group') ||
        label.startsWith('join group');

      if (isJoinMatch) {
        const isDisabled = btn.getAttribute?.('aria-disabled') === 'true' || btn.disabled;
        if (!isDisabled) return btn;
      }
    }
    return null;
  }

  /**
   * Tìm nút "Hủy yêu cầu" / "Đang chờ phê duyệt" khi đã gửi yêu cầu vào nhóm trước đó
   */
  function findGroupPendingButton() {
    if (typeof document === 'undefined') return null;
    const pendingKeywords = [
      'hủy yêu cầu',
      'đã gửi yêu cầu',
      'chờ phê duyệt',
      'đang chờ duyệt',
      'cancel request',
      'request sent',
      'pending approval',
      'pending',
    ];

    const buttons = Array.from(
      document.querySelectorAll('div[role="button"], button, span[role="button"]')
    );

    for (const btn of buttons) {
      if (!isVisible(btn)) continue;
      if (btn.closest && (btn.closest('[role="article"]') || btn.closest('div[role="dialog"]'))) continue;
      const label = (btn.getAttribute?.('aria-label') || '').trim().toLowerCase();
      const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      const combined = `${label} ${text}`.trim();
      if (pendingKeywords.some((kw) => combined === kw || combined.includes(kw))) {
        return btn;
      }
    }
    return null;
  }

  /**
   * Tìm nút "Đã tham gia" / "Joined" trên trang nhóm
   */
  function findGroupJoinedButton() {
    if (typeof document === 'undefined') return null;
    const joinedKeywords = ['đã tham gia', 'joined'];
    const buttons = Array.from(
      document.querySelectorAll('div[role="button"], button, span[role="button"]')
    );
    for (const btn of buttons) {
      if (!isVisible(btn)) continue;
      if (btn.closest && (btn.closest('[role="article"]') || btn.closest('div[role="dialog"]'))) continue;
      const label = (btn.getAttribute?.('aria-label') || '').trim().toLowerCase();
      const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      if (joinedKeywords.some((kw) => text === kw || label === kw || label.startsWith(kw))) {
        return btn;
      }
    }
    return null;
  }

  /**
   * Kiểm tra hộp thoại câu hỏi khảo sát thành viên hoặc đồng ý quy tắc nhóm sau khi bấm Tham gia
   */
  async function handlePostJoinDialogIfPresent() {
    const dlg = getFrontmostDialog();
    if (!dlg) return { hasDialog: false };

    const dlgText = getElementText(dlg).toLowerCase();
    const isSurveyOrRules =
      dlgText.includes('trả lời câu hỏi') ||
      dlgText.includes('câu hỏi thành viên') ||
      dlgText.includes('quy tắc nhóm') ||
      dlgText.includes('answer questions') ||
      dlgText.includes('membership questions') ||
      dlgText.includes('group rules') ||
      dlgText.includes('yêu cầu tham gia');

    if (!isSurveyOrRules) {
      return { hasDialog: false };
    }

    // Kiểm tra xem có ô nhập câu trả lời tự luận (textarea / input text) hay câu hỏi trắc nghiệm bắt buộc không
    const textInputs = Array.from(
      dlg.querySelectorAll('textarea, input[type="text"], div[role="textbox"][contenteditable="true"]')
    ).filter(isVisible);

    const radioInputs = Array.from(
      dlg.querySelectorAll('input[type="radio"], div[role="radio"]')
    ).filter(isVisible);

    if (textInputs.length > 0 || radioInputs.length > 0) {
      // Không tự điền câu trả lời rác để bảo vệ tài khoản khỏi bị QTV chặn
      return {
        hasDialog: true,
        type: 'questions_required',
        message: 'Nhóm yêu cầu trả lời câu hỏi khảo sát khi tham gia — cần trả lời thủ công',
      };
    }

    // Trường hợp hộp thoại CHỈ có duy nhất ô tích "Tôi đồng ý với quy tắc nhóm"
    const checkboxes = Array.from(
      dlg.querySelectorAll('div[role="checkbox"], input[type="checkbox"]')
    ).filter(isVisible);

    if (checkboxes.length > 0) {
      for (const cb of checkboxes) {
        const isChecked = cb.getAttribute?.('aria-checked') === 'true' || cb.checked === true;
        if (!isChecked) {
          cb.click();
          await sleep(400);
        }
      }

      // Tìm nút Gửi / Tham gia nhóm trong dialog
      const submitKeywords = ['gửi', 'submit', 'tham gia nhóm', 'join group', 'hoàn tất'];
      const dlgButtons = Array.from(dlg.querySelectorAll('div[role="button"], button')).filter(isVisible);
      for (const b of dlgButtons) {
        const bt = getElementText(b).toLowerCase();
        if (submitKeywords.some((k) => bt === k || bt.includes(k))) {
          const isDisabled = b.getAttribute?.('aria-disabled') === 'true' || b.disabled;
          if (!isDisabled) {
            b.click();
            await sleep(RuntimeConfig.actionDelayMs);
            return { hasDialog: true, type: 'rules_accepted' };
          }
        }
      }
    }

    return {
      hasDialog: true,
      type: 'questions_required',
      message: 'Nhóm yêu cầu xác nhận thông tin tham gia — cần kiểm tra thủ công',
    };
  }

  /**
   * Kiểm tra trạng thái thành viên và tự động bấm Tham gia nhóm nếu chưa vào nhóm
   * @param {boolean} autoJoinOnPost
   */
  async function ensureGroupMembershipBeforePost(autoJoinOnPost = true) {
    // Chờ trang nhóm ổn định (tìm thấy nút tạo bài viết, nút tham gia, hoặc nút chờ duyệt)
    await waitForCondition(
      () => findComposerTrigger() || findGroupJoinButton() || findGroupPendingButton() || getFrontmostDialog(),
      Math.min(6000, RuntimeConfig.conditionTimeoutMs),
      RuntimeConfig.conditionStepMs
    );

    const existingComposer = findComposerTrigger();
    const joinBtn = findGroupJoinButton();
    const pendingBtn = findGroupPendingButton();

    // 1. Nếu đang chờ QTV duyệt yêu cầu tham gia trước đó và không có ô đăng bài
    if (pendingBtn && !existingComposer) {
      return {
        canPost: false,
        autoJoined: false,
        joinStatus: 'pending',
        statusCode: 'JOIN_PENDING_APPROVAL',
        message: 'Đang chờ Quản trị viên duyệt yêu cầu tham gia nhóm trước đó',
      };
    }

    // 2. Nếu phát hiện nút "Tham gia nhóm" (chưa là thành viên)
    if (joinBtn) {
      if (!autoJoinOnPost) {
        if (existingComposer) {
          return {
            canPost: true,
            autoJoined: false,
            joinStatus: 'not_joined',
            statusCode: 'PUBLIC_NON_MEMBER',
            message: 'Nhóm công khai cho phép đăng bài',
          };
        }
        return {
          canPost: false,
          autoJoined: false,
          joinStatus: 'not_joined',
          statusCode: 'NOT_GROUP_MEMBER',
          message: 'Chưa tham gia nhóm này (Tuỳ chọn tự vào nhóm khi đăng đang tắt)',
        };
      }

      // Thực hiện bấm Tham gia nhóm
      if (typeof joinBtn.scrollIntoView === 'function') {
        joinBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      joinBtn.click();
      await sleep(RuntimeConfig.joinWaitMs);

      // Kiểm tra xem Facebook có cảnh báo giới hạn tần suất khi bấm Tham gia không
      const warn = checkSpamWarningInDialogs();
      if (warn.isBlocked && warn.type === 'rate_limit') {
        await sleep(Math.min(1000, RuntimeConfig.actionDelayMs));
        const recheck = checkSpamWarningInDialogs();
        if (recheck.isBlocked) {
          return {
            canPost: false,
            autoJoined: false,
            joinStatus: 'not_joined',
            statusCode: 'RATE_LIMIT',
            message: `Facebook giới hạn thao tác khi tham gia nhóm: ${recheck.reason}`,
          };
        }
      }

      // Kiểm tra hộp thoại câu hỏi thành viên hoặc đồng ý quy tắc nhóm
      const dlgRes = await handlePostJoinDialogIfPresent();
      if (dlgRes.hasDialog && dlgRes.type === 'questions_required') {
        return {
          canPost: false,
          autoJoined: false,
          joinStatus: 'questions_required',
          statusCode: 'JOIN_QUESTIONS_REQUIRED',
          message: dlgRes.message,
        };
      }

      // Chờ xem sau khi bấm Tham gia, ô "Bạn viết gì đi..." có xuất hiện không
      const composerAfterJoin = await waitForCondition(
        () => findComposerTrigger(),
        Math.min(6000, RuntimeConfig.conditionTimeoutMs),
        RuntimeConfig.conditionStepMs
      );

      if (composerAfterJoin) {
        return {
          canPost: true,
          autoJoined: true,
          joinStatus: 'joined',
          statusCode: 'AUTO_JOINED_SUCCESS',
          message: 'Đã tự động tham gia nhóm thành công',
        };
      }

      const pendingAfterJoin = findGroupPendingButton();
      if (pendingAfterJoin) {
        return {
          canPost: false,
          autoJoined: true,
          joinStatus: 'pending',
          statusCode: 'JOIN_REQUEST_SENT',
          message: 'Chưa là thành viên -> Đã tự động gửi yêu cầu tham gia nhóm (Chờ QTV duyệt)',
        };
      }

      const joinedAfterClick = findGroupJoinedButton();
      if (joinedAfterClick) {
        return {
          canPost: false,
          autoJoined: true,
          joinStatus: 'joined',
          statusCode: 'JOINED_BUT_POSTING_RESTRICTED',
          message: 'Đã tự động vào nhóm nhưng nhóm hiện khóa quyền đăng bài của thành viên mới',
        };
      }

      return {
        canPost: false,
        autoJoined: true,
        joinStatus: 'pending',
        statusCode: 'JOIN_REQUEST_SENT',
        message: 'Đã tự động bấm Tham gia nhóm (Đang chờ QTV phê duyệt thành viên)',
      };
    }

    // 3. Đã là thành viên hoặc đã có sẵn ô tạo bài viết
    if (existingComposer || getFrontmostDialog()) {
      return {
        canPost: true,
        autoJoined: false,
        joinStatus: 'joined',
        statusCode: 'ALREADY_MEMBER',
        message: 'Đã là thành viên nhóm',
      };
    }

    return {
      canPost: true,
      autoJoined: false,
      joinStatus: findGroupJoinedButton() ? 'joined' : 'unknown',
      statusCode: 'UNKNOWN_MEMBERSHIP',
      message: '',
    };
  }

  /**
   * Đính kèm ảnh an toàn với kiểm tra dung lượng (<10MB), định dạng và xem trước (tối đa 20s)
   */
  async function attachImagesSafely(dialog, imageSources) {
    const list = (Array.isArray(imageSources) ? imageSources : [imageSources])
      .filter((s) => typeof s === 'string' && s.trim().length > 0)
      .slice(0, 3);

    if (list.length === 0) return { success: true, attachedCount: 0 };

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const dt = new DataTransfer();

    for (let i = 0; i < list.length; i++) {
      const src = list[i];
      if (src.startsWith('data:image/')) {
        if (src.length > 13500000) {
          console.warn(`[Content] Bỏ qua ảnh ${i + 1} vì vượt quá kích thước 10MB`);
          continue;
        }

        const mimeMatch = src.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,/);
        const mime = mimeMatch ? mimeMatch[1].toLowerCase() : 'image/jpeg';
        if (!allowedMimes.includes(mime)) {
          console.warn(`[Content] Định dạng ảnh không hỗ trợ: ${mime}`);
          continue;
        }

        try {
          const bstr = atob(src.split(',')[1]);
          let n = bstr.length;
          const u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          const file = new File([u8arr], `photo_${Date.now()}_${i + 1}.${mime.split('/')[1]}`, { type: mime });
          dt.items.add(file);
        } catch (e) {
          console.warn('[Content] Lỗi giải mã ảnh base64:', e);
        }
      } else if (src.startsWith('https://')) {
        try {
          const resp = await fetch(src);
          const blob = await resp.blob();
          if (blob.size <= 10 * 1024 * 1024 && allowedMimes.includes(blob.type)) {
            dt.items.add(new File([blob], `photo_${Date.now()}_${i + 1}.jpg`, { type: blob.type }));
          }
        } catch (e) {
          console.warn('[Content] Không thể tải ảnh từ URL:', src);
        }
      }
    }

    if (dt.files.length === 0) return { success: true, attachedCount: 0 };

    const expectedCount = dt.files.length;
    const container = dialog || getFrontmostDialog() || document;
    let fileInput = container.querySelector('input[type="file"][accept*="image"], input[type="file"]');

    if (!fileInput) {
      const photoBtn = container.querySelector('div[aria-label*="Ảnh" i], div[aria-label*="Photo" i], div[aria-label*="Thêm vào bài viết" i]');
      if (photoBtn && isVisible(photoBtn)) {
        photoBtn.click();
        await sleep(RuntimeConfig.actionDelayMs);
      }
      fileInput = container.querySelector('input[type="file"][accept*="image"], input[type="file"]') ||
                  document.querySelector('div[role="dialog"] input[type="file"]');
    }

    if (!fileInput) {
      return {
        success: false,
        reason: 'Không tìm thấy ô đính kèm ảnh trong hộp thoại đăng bài',
      };
    }

    try {
      fileInput.files = dt.files;
    } catch (e) {
      try {
        Object.defineProperty(fileInput, 'files', { value: dt.files, configurable: true });
      } catch (err) {}
    }
    fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

    // Chờ đủ ảnh xem trước (tối đa 20 giây)
    const previewReady = await waitForCondition(() => {
      const previews = container.querySelectorAll('img[src^="blob:"], img[src*="fbcdn"], div[aria-label*="Gỡ ảnh" i], div[aria-label*="Remove photo" i]');
      return previews.length >= expectedCount || previews.length > 0;
    }, Math.min(20000, RuntimeConfig.conditionTimeoutMs + 5000), 400);

    if (!previewReady) {
      return {
        success: false,
        reason: 'Quá thời gian 20 giây chờ tải xem trước ảnh đính kèm',
      };
    }

    return { success: true, attachedCount: expectedCount };
  }

  /**
   * Điền văn bản an toàn vào khung soạn thảo
   */
  async function insertTextSafely(textBox, text) {
    if (!text || !textBox) return;

    if (typeof textBox.scrollIntoView === 'function') {
      textBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (typeof textBox.focus === 'function') textBox.focus();
    if (typeof textBox.click === 'function') textBox.click();
    await sleep(200);

    if (typeof window !== 'undefined' && typeof window.getSelection === 'function' && typeof document.createRange === 'function') {
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(textBox);
        range.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(range);
      } catch (e) {}
    }
    await sleep(150);

    let pasteSuccess = false;
    try {
      if (typeof DataTransfer !== 'undefined' && typeof ClipboardEvent !== 'undefined') {
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        const pasteEvt = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
        textBox.dispatchEvent(pasteEvt);
        await sleep(250);
        if ((textBox.innerText || textBox.textContent || '').trim().length > 0) {
          pasteSuccess = true;
        }
      }
    } catch (e) {}

    if (!pasteSuccess) {
      try {
        if (typeof document.execCommand === 'function') {
          document.execCommand('selectAll', false, null);
          document.execCommand('delete', false, null);
          const lines = text.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].length > 0) {
              document.execCommand('insertText', false, lines[i]);
            }
            if (i < lines.length - 1) {
              document.execCommand('insertLineBreak', false, null);
            }
          }
        }
      } catch (e) {}

      if (!(textBox.innerText || textBox.textContent || '').trim()) {
        textBox.textContent = text;
      }
    }

    if (typeof InputEvent !== 'undefined') {
      textBox.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText' }));
    } else {
      textBox.dispatchEvent(new Event('input', { bubbles: true }));
    }
    textBox.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(300);
  }

  /**
   * Tìm nút bấm Đăng bài trong hộp thoại
   */
  async function findAndClickPostButton(dialog) {
    const container = dialog || getFrontmostDialog() || document;
    const postKeywords = ['đăng', 'post', 'đăng bài', 'chia sẻ', 'gửi', 'submit', 'phê duyệt'];

    return waitForCondition(() => {
      const allButtons = Array.from(container.querySelectorAll('div[role="button"], button'));
      for (const btn of allButtons) {
        if (!isVisible(btn)) continue;
        const text = getElementText(btn).toLowerCase();
        if (postKeywords.some((kw) => text === kw || text.includes(kw))) {
          const isDisabled = btn.getAttribute?.('aria-disabled') === 'true' || btn.disabled;
          if (!isDisabled) {
            if (typeof btn.scrollIntoView === 'function') {
              btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            btn.click();
            return true;
          }
        }
      }
      return null;
    }, RuntimeConfig.conditionTimeoutMs, 400);
  }

  /**
   * Xử lý đăng bài vào nhóm (Tích hợp Giai đoạn 3: Tự vào nhóm khi phát hiện chưa tham gia)
   * @param {string} content
   * @param {string[]} images
   * @param {boolean} enableInvisibleChars
   * @param {boolean} autoJoinOnPost
   */
  async function handleAutoPost(content, images, enableInvisibleChars = false, autoJoinOnPost = true) {
    isStopped = false;

    // 1. Kiểm tra trạng thái đăng nhập và checkpoint
    const currentUrl = typeof window !== 'undefined' && window.location ? window.location.href : '';
    if (currentUrl.includes('/checkpoint') || currentUrl.includes('/two_step_verification')) {
      return {
        success: false,
        status: 'failed',
        statusCode: 'CHECKPOINT',
        message: 'Tài khoản Facebook bị yêu cầu xác minh danh tính hoặc checkpoint',
      };
    }

    if (currentUrl.includes('/login') || (typeof document !== 'undefined' && document.querySelector('form[action*="/login"]'))) {
      return {
        success: false,
        status: 'failed',
        statusCode: 'NOT_LOGGED_IN',
        message: 'Chưa đăng nhập Facebook trên trình duyệt này',
      };
    }

    // 2. GIAI ĐOẠN 3: Kiểm tra tư cách thành viên & Tự động vào nhóm nếu chưa tham gia
    const membership = await ensureGroupMembershipBeforePost(autoJoinOnPost);
    if (!membership.canPost) {
      return {
        success: false,
        status: 'failed',
        statusCode: membership.statusCode,
        joinStatus: membership.joinStatus,
        autoJoined: Boolean(membership.autoJoined),
        message: membership.message,
      };
    }

    const autoJoinedDuringRun = Boolean(membership.autoJoined);

    // 3. Mở hộp thoại Tạo bài viết
    let dialog = getFrontmostDialog();
    if (!dialog) {
      const trigger = await waitForCondition(
        () => findComposerTrigger(),
        Math.min(10000, RuntimeConfig.conditionTimeoutMs),
        RuntimeConfig.conditionStepMs
      );

      if (trigger) {
        trigger.click();
        await sleep(RuntimeConfig.actionDelayMs);
      }
    }

    dialog = await waitForCondition(() => getFrontmostDialog(), RuntimeConfig.conditionTimeoutMs, RuntimeConfig.conditionStepMs);
    if (!dialog) {
      return {
        success: false,
        status: 'failed',
        statusCode: 'TIMEOUT',
        joinStatus: membership.joinStatus || 'unknown',
        autoJoined: autoJoinedDuringRun,
        message: 'Không thể mở hộp thoại Tạo bài viết (nhóm có thể khoá quyền đăng hoặc tải chậm)',
      };
    }

    // 4. Tìm khung soạn thảo và điền nội dung
    const textBox = await waitForCondition(() => {
      const boxes = Array.from(dialog.querySelectorAll('div[role="textbox"][contenteditable="true"], div[contenteditable="true"]'));
      return boxes.find(isVisible) || null;
    }, RuntimeConfig.conditionTimeoutMs, RuntimeConfig.conditionStepMs);

    if (!textBox) {
      return {
        success: false,
        status: 'failed',
        statusCode: 'TIMEOUT',
        joinStatus: membership.joinStatus || 'joined',
        autoJoined: autoJoinedDuringRun,
        message: 'Không tìm thấy khung soạn thảo văn bản trong hộp thoại',
      };
    }

    const finalContent = saltContentAntiSpam(content, enableInvisibleChars);
    await insertTextSafely(textBox, finalContent);
    await sleep(Math.min(1000, RuntimeConfig.actionDelayMs));

    // 5. Đính kèm ảnh nếu có
    if (images && images.length > 0) {
      const imgRes = await attachImagesSafely(dialog, images);
      if (imgRes && imgRes.success === false) {
        return {
          success: false,
          status: 'failed',
          statusCode: 'IMAGE_ATTACH_FAILED',
          joinStatus: 'joined',
          autoJoined: autoJoinedDuringRun,
          message: imgRes.reason || 'Đính kèm ảnh thất bại',
        };
      }
      await sleep(RuntimeConfig.actionDelayMs);
    }

    // 6. Bấm nút Đăng bài
    const clicked = await findAndClickPostButton(dialog);
    if (!clicked) {
      return {
        success: false,
        status: 'failed',
        statusCode: 'TIMEOUT',
        joinStatus: 'joined',
        autoJoined: autoJoinedDuringRun,
        message: 'Không thể nhấn nút Đăng bài (nút bị vô hiệu hóa hoặc không tìm thấy)',
      };
    }

    // 7. Kiểm tra phản hồi sau khi bấm đăng
    let modalClosed = false;
    for (let check = 0; check < RuntimeConfig.postVerifyIterations; check++) {
      if (isStopped) {
        return {
          success: false,
          status: 'failed',
          statusCode: 'ABORTED',
          joinStatus: 'joined',
          autoJoined: autoJoinedDuringRun,
          message: 'Tiến trình đã dừng',
        };
      }
      await sleep(RuntimeConfig.postVerifyStepMs);

      // Kiểm tra cảnh báo giới hạn tần suất trong alert/toast
      const warning = checkSpamWarningInDialogs();
      if (warning.isBlocked) {
        await sleep(RuntimeConfig.postVerifyStepMs);
        const recheck = checkSpamWarningInDialogs();
        if (recheck.isBlocked) {
          return {
            success: false,
            status: 'failed',
            statusCode: recheck.type === 'rate_limit' ? 'RATE_LIMIT' : 'POST_BLOCKED',
            joinStatus: 'joined',
            autoJoined: autoJoinedDuringRun,
            message: `Facebook chặn: ${recheck.reason}`,
          };
        }
      }

      const activeDlg = getFrontmostDialog();
      if (!activeDlg) {
        modalClosed = true;
        break;
      }
    }

    const bodyText = getElementText(document.body).toLowerCase();
    const isPendingApproval =
      bodyText.includes('đang chờ phê duyệt') ||
      bodyText.includes('pending approval') ||
      bodyText.includes('quản trị viên phê duyệt') ||
      bodyText.includes('chờ quản trị viên duyệt');

    if (modalClosed) {
      if (isPendingApproval) {
        return {
          success: true,
          status: 'success',
          statusCode: autoJoinedDuringRun ? 'AUTO_JOINED_AND_PENDING_POST' : 'GROUP_PENDING_APPROVAL',
          joinStatus: 'joined',
          autoJoined: autoJoinedDuringRun,
          message: autoJoinedDuringRun
            ? 'Đã tự động vào nhóm & gửi bài (đang chờ Quản trị viên duyệt)'
            : 'Đã gửi bài vào nhóm (đang chờ Quản trị viên duyệt)',
        };
      }
      return {
        success: true,
        status: 'success',
        statusCode: autoJoinedDuringRun ? 'AUTO_JOINED_AND_POSTED' : 'SUCCESS',
        joinStatus: 'joined',
        autoJoined: autoJoinedDuringRun,
        message: autoJoinedDuringRun
          ? 'Đã tự động tham gia nhóm & đăng bài thành công'
          : 'Đã đăng bài thành công lên nhóm',
      };
    }

    return {
      success: false,
      status: 'uncertain',
      statusCode: 'UNCERTAIN_DIALOG_OPEN',
      joinStatus: 'joined',
      autoJoined: autoJoinedDuringRun,
      message: 'Hộp thoại đăng bài chưa đóng sau khi bấm gửi. Trạng thái chưa thể xác nhận 100%.',
    };
  }

  /**
   * Nhận diện tài khoản Facebook hiện tại đang đăng nhập trên trình duyệt.
   * Quy tắc định danh:
   *  - Ưu tiên tuyệt đối numeric UID từ cookie c_user (hoặc cookieUidHint truyền từ chrome.cookies API).
   *  - Dự phòng numeric UID từ inline script ("USER_ID" / "ACCOUNT_ID").
   *  - Các thẻ <a> trên trang chỉ dùng để lấy tên hiển thị (name) và ảnh đại diện (avatar),
   *    TUYỆT ĐỐI không ghi đè uid đã có và không bao giờ gán vanity username làm uid.
   */
  function detectCurrentFacebookAccount(cookieUidHint = '') {
    const currentUrl = typeof window !== 'undefined' && window.location ? window.location.href : '';
    if (currentUrl.includes('/login') || (typeof document !== 'undefined' && document.querySelector('form[action*="/login"]'))) {
      return { success: false, error: 'Chưa đăng nhập Facebook trên trình duyệt này' };
    }
    if (currentUrl.includes('/checkpoint')) {
      return { success: false, error: 'Tài khoản Facebook đang bị checkpoint hoặc xác minh danh tính' };
    }

    let uid = '';
    let name = '';
    let avatar = '';

    // 0. Ưu tiên cookieUidHint từ chrome.cookies API (Service Worker truyền xuống)
    if (cookieUidHint && /^\d{4,25}$/.test(String(cookieUidHint).trim())) {
      uid = String(cookieUidHint).trim();
    }

    // 1. Đọc cookie c_user nếu có trên document.cookie
    if (!uid && typeof document !== 'undefined' && typeof document.cookie === 'string') {
      const cUserMatch = document.cookie.match(/(?:^|;\s*)c_user=([0-9]{4,25})/);
      if (cUserMatch && cUserMatch[1]) {
        uid = cUserMatch[1];
      }
    }

    // 2. Đọc USER_ID / ACCOUNT_ID chuẩn và NAME từ script nội tuyến của Facebook
    const scripts = Array.from(document.querySelectorAll('script:not([src])'));
    for (const s of scripts) {
      const raw = s.textContent || '';
      if (!raw) continue;
      if (!uid) {
        const idMatch =
          raw.match(/"USER_ID"\s*:\s*"([0-9]{4,25})"/) ||
          raw.match(/"ACCOUNT_ID"\s*:\s*"([0-9]{4,25})"/) ||
          raw.match(/"actorID"\s*:\s*"([0-9]{4,25})"/);
        if (idMatch && idMatch[1] && idMatch[1] !== '0') {
          uid = idMatch[1];
        }
      }
      if (!name) {
        const nameMatch = raw.match(/"NAME"\s*:\s*"([^"]+)"/);
        if (nameMatch && nameMatch[1]) {
          try {
            name = JSON.parse(`"${nameMatch[1]}"`);
          } catch (e) {
            name = nameMatch[1];
          }
        }
      }
      if (uid && name) break;
    }

    // 3. Quét thanh điều hướng / liên kết trang cá nhân CHỈ để bổ sung name, avatar (và numeric id nếu thuộc thanh điều hướng)
    const profileLinks = Array.from(
      document.querySelectorAll(
        'div[role="navigation"] a[href*="/me"], div[role="navigation"] a[href*="profile.php"], div[role="banner"] a[href*="profile.php"], a[aria-label*="Trang cá nhân" i], a[aria-label*="Profile" i], div[role="navigation"] a[role="link"]'
      )
    );
    for (const a of profileLinks) {
      if (!isVisible(a)) continue;
      const href = a.href || a.getAttribute?.('href') || '';
      const label = a.getAttribute?.('aria-label') || '';
      const text = a.textContent || '';

      // Chỉ lấy numeric id từ profile.php?id=... khi CHƯA có uid (tuyệt đối không lấy vanity username)
      if (!uid && href.includes('profile.php?id=')) {
        const m = href.match(/id=([0-9]{4,25})/);
        if (m && m[1]) uid = m[1];
      }

      if (!name && label && (label.toLowerCase().includes('trang cá nhân') || label.toLowerCase().includes('profile'))) {
        const cleanedName = label.replace(/^(trang cá nhân của|profile of|trang cá nhân|profile)\s*:?\s*/i, '').trim();
        if (cleanedName && cleanedName.length > 1 && cleanedName.length < 50) {
          name = cleanedName;
        }
      } else if (!name && text && text.trim().length > 1 && text.trim().length < 40) {
        if (!['trang chủ', 'video', 'bảng feed', 'thông báo', 'menu', 'nhóm', 'bạn bè'].includes(text.trim().toLowerCase())) {
          name = text.trim();
        }
      }

      if (!avatar) {
        const img = a.querySelector?.('img, image');
        if (img) {
          const imgSrc = img.getAttribute?.('xlink:href') || img.src || '';
          if (imgSrc.startsWith('http') || imgSrc.startsWith('data:')) {
            avatar = imgSrc;
          }
        }
      }

      if (uid && name && avatar) break;
    }

    if (!avatar) {
      const navAvatar = document.querySelector('svg image, div[role="navigation"] img, [aria-label*="Tài khoản" i] img, [aria-label*="Account" i] img');
      if (navAvatar) {
        avatar = navAvatar.getAttribute?.('xlink:href') || navAvatar.src || '';
      }
    }

    if (!name) {
      const navBtn = document.querySelector('div[aria-label*="Tài khoản" i], div[aria-label*="Account" i]');
      if (navBtn) {
        const t = (navBtn.textContent || navBtn.getAttribute?.('aria-label') || '').trim();
        if (t && t.length < 40 && !/^tài khoản|^account/i.test(t)) name = t;
      }
    }

    // Chuẩn hóa uid chỉ giữ chữ số
    const numericUid = String(uid || '').replace(/\D/g, '');
    if (!numericUid || numericUid.length < 4) {
      return {
        success: false,
        error: 'Không xác định được UID số của tài khoản Facebook. Vui lòng mở trang chủ facebook.com đã đăng nhập rồi thử lại.',
      };
    }

    return {
      success: true,
      account: {
        uid: numericUid,
        name: (name || `FB User ${numericUid}`).trim(),
        avatar: avatar || '',
      },
    };
  }

  /**
   * Kiểm tra xem tài khoản phát hiện trên trang có khớp với tài khoản chỉ định không
   */
  function matchAccountIdentity(detectedAcc, targetSpec) {
    if (!detectedAcc || !targetSpec) return false;
    const detUid = String(detectedAcc.uid || '').trim().toLowerCase();
    const detName = String(detectedAcc.name || '').trim().toLowerCase();

    const targetUid = String(targetSpec.uid || targetSpec.accountUid || '').trim().toLowerCase();
    const targetId = String(targetSpec.accountId || targetSpec.id || '').trim().toLowerCase();
    const targetName = String(targetSpec.name || targetSpec.accountName || '').trim().toLowerCase();

    if (targetUid && detUid && detUid === targetUid) return true;
    if (targetId && targetId !== 'active' && detUid && (detUid === targetId || targetId === `fb_${detUid}`)) return true;
    if (targetName && targetName !== 'tài khoản đang chọn' && detName && detName === targetName) return true;
    return false;
  }

  /**
   * Tự động kiểm tra hoặc chuyển sang trang cá nhân/tài khoản Facebook chỉ định bằng menu Chuyển trang cá nhân gốc của Facebook
   * Không lưu mật khẩu, không can thiệp cookie, không dùng thủ thuật né phát hiện.
   */
  async function switchOrVerifyFacebookAccount(targetSpec = {}) {
    const currentRes = detectCurrentFacebookAccount();

    const specUid = targetSpec.uid || targetSpec.accountUid || '';
    const specName = targetSpec.name || targetSpec.accountName || '';

    // Nếu khung giờ cấu hình dùng "Tài khoản đang chọn" ('active') hoặc không chỉ định cụ thể
    const isUsingCurrentActive =
      !targetSpec ||
      targetSpec.accountId === 'active' ||
      (!specUid && (!specName || specName === 'Tài khoản đang chọn'));

    if (isUsingCurrentActive) {
      if (currentRes.success && currentRes.account) {
        return {
          success: true,
          switched: false,
          statusCode: 'ACCOUNT_VERIFIED',
          account: currentRes.account,
          message: `Đang sử dụng tài khoản hiện tại: ${currentRes.account.name}`,
        };
      }
      return {
        success: false,
        switched: false,
        statusCode: 'NOT_LOGGED_IN',
        currentAccount: null,
        message: currentRes.error || 'Chưa đăng nhập Facebook trên trình duyệt này.',
      };
    }

    // Nếu tài khoản đang mở đã khớp sẵn với tài khoản của khung giờ
    if (currentRes.success && currentRes.account && matchAccountIdentity(currentRes.account, targetSpec)) {
      return {
        success: true,
        switched: false,
        statusCode: 'ACCOUNT_ALREADY_MATCHED',
        account: currentRes.account,
        message: `Đang ở đúng tài khoản chỉ định: ${currentRes.account.name}`,
      };
    }

    // Nếu không khớp nhưng người dùng tắt tuỳ chọn tự chuyển tài khoản
    if (targetSpec.autoSwitchAccount === false || targetSpec.autoSwitch === false) {
      return {
        success: false,
        switched: false,
        statusCode: 'ACCOUNT_MISMATCH_NO_SWITCH',
        currentAccount: currentRes.account || null,
        message: `Tài khoản đang mở (${currentRes.account?.name || 'Chưa rõ'}) không khớp với nick hẹn giờ (${specName || specUid}) và tuỳ chọn tự chuyển đang tắt.`,
      };
    }

    // Thực hiện mở menu Tài khoản / Trang cá nhân gốc của Facebook ở góc phải trên cùng
    const accountMenuSelectors = [
      'div[aria-label*="Tài khoản" i]',
      'div[aria-label*="Account" i]',
      '[aria-label*="Trang cá nhân của bạn" i]',
      '[aria-label*="Your profile" i]',
      'div[role="button"][aria-label*="Cài đặt và trang cá nhân" i]',
    ];

    let menuTrigger = null;
    for (const sel of accountMenuSelectors) {
      const candidates = Array.from(document.querySelectorAll(sel)).filter(isVisible);
      if (candidates.length > 0) {
        menuTrigger = candidates[0];
        break;
      }
    }

    if (!menuTrigger) {
      return {
        success: false,
        switched: false,
        statusCode: 'ACCOUNT_MENU_NOT_FOUND',
        currentAccount: currentRes.account || null,
        message: `Không tìm thấy menu Tài khoản Facebook để chuyển sang "${specName || specUid}".`,
      };
    }

    menuTrigger.click();
    await sleep(RuntimeConfig.actionDelayMs);

    const targetNameLower = String(specName).trim().toLowerCase();
    const targetUidLower = String(specUid).trim().toLowerCase();

    function findTargetProfileItemInDom() {
      const items = Array.from(
        document.querySelectorAll(
          'div[role="dialog"] [role="button"], div[role="dialog"] [role="menuitem"], div[role="dialog"] [role="listitem"], div[role="dialog"] [role="radio"], div[role="menu"] [role="menuitem"], div[role="menu"] [role="listitem"], div[role="menu"] [role="button"], div[aria-label*="Tài khoản" i] [role="button"]'
        )
      ).filter(isVisible);

      for (const el of items) {
        const text = getElementText(el).toLowerCase();
        if (!text) continue;
        // Không bấm nhầm vào nút mở rộng menu
        if (
          text === 'xem tất cả trang cá nhân' ||
          text === 'see all profiles' ||
          text === 'chuyển trang cá nhân' ||
          text === 'switch profile' ||
          text === 'đăng xuất' ||
          text === 'log out'
        ) {
          continue;
        }
        if ((targetNameLower && text.includes(targetNameLower)) || (targetUidLower && text.includes(targetUidLower))) {
          return el;
        }
      }
      return null;
    }

    let targetProfileBtn = findTargetProfileItemInDom();

    // Nếu chưa thấy trực tiếp, bấm "Xem tất cả trang cá nhân" / "See all profiles" / "Chuyển trang cá nhân"
    if (!targetProfileBtn) {
      const expandKeywords = [
        'xem tất cả trang cá nhân',
        'see all profiles',
        'chuyển trang cá nhân',
        'switch profile',
        'chuyển tài khoản',
        'switch accounts',
      ];
      const allMenuButtons = Array.from(
        document.querySelectorAll('div[role="dialog"] [role="button"], div[role="dialog"] [role="menuitem"], div[role="menu"] [role="button"], span[role="button"]')
      ).filter(isVisible);

      const expandBtn = allMenuButtons.find((b) => {
        const t = getElementText(b).toLowerCase();
        return expandKeywords.some((kw) => t.includes(kw));
      });

      if (expandBtn) {
        expandBtn.click();
        await sleep(RuntimeConfig.actionDelayMs);
        targetProfileBtn = findTargetProfileItemInDom();
      }
    }

    if (!targetProfileBtn) {
      return {
        success: false,
        switched: false,
        statusCode: 'SWITCH_PROFILE_NOT_FOUND',
        currentAccount: currentRes.account || null,
        message: `Không tìm thấy "${targetSpec.name || targetSpec.uid}" trong danh sách Chuyển trang cá nhân của Facebook.`,
      };
    }

    targetProfileBtn.click();
    await sleep(RuntimeConfig.joinWaitMs);

    // Nếu Facebook yêu cầu nhập mật khẩu lại, tuyệt đối không tự điền mật khẩu
    const passInput = document.querySelector('input[type="password"]');
    if (passInput && isVisible(passInput)) {
      return {
        success: false,
        switched: false,
        statusCode: 'SWITCH_REQUIRES_MANUAL_LOGIN',
        currentAccount: currentRes.account || null,
        message: `Tài khoản "${targetSpec.name || targetSpec.uid}" yêu cầu đăng nhập mật khẩu thủ công trên Facebook.`,
      };
    }

    const afterRes = detectCurrentFacebookAccount();
    if (afterRes.success && afterRes.account && matchAccountIdentity(afterRes.account, targetSpec)) {
      return {
        success: true,
        switched: true,
        statusCode: 'ACCOUNT_SWITCHED_SUCCESS',
        account: afterRes.account,
        message: `Đã tự động chuyển sang tài khoản "${afterRes.account.name}" thành công.`,
      };
    }

    return {
      success: false,
      switched: false,
      statusCode: 'SWITCH_VERIFY_FAILED',
      currentAccount: afterRes.account || currentRes.account || null,
      message: `Đã bấm chuyển trang cá nhân nhưng chưa xác nhận được tài khoản "${targetSpec.name || targetSpec.uid}".`,
    };
  }

  /**
   * Quét danh sách nhóm từ trang kết quả tìm kiếm Facebook (Không bấm Tham gia hàng loạt trên trang tìm kiếm)
   */
  async function scanGroupsOnSearchPage(minMembers = 0) {
    const found = [];
    const seenUrls = new Set();

    const groupAnchors = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
    for (const a of groupAnchors) {
      const rawHref = a.href || '';
      const cleanMatch = rawHref.match(/https?:\/\/(?:www\.|m\.)?facebook\.com\/groups\/([^/?#]+)/i);
      if (!cleanMatch || !cleanMatch[1]) continue;

      const slug = cleanMatch[1].trim();
      if (['feed', 'discover', 'joins', 'search', 'create', 'notifications'].includes(slug.toLowerCase())) {
        continue;
      }

      const canonicalUrl = `https://www.facebook.com/groups/${slug}/`;
      if (seenUrls.has(canonicalUrl)) continue;

      const nameText = (a.textContent || '').trim();
      if (!nameText || nameText.length < 3 || nameText.length > 140) continue;
      if (['tham gia', 'join', 'xem nhóm', 'view group'].includes(nameText.toLowerCase())) continue;

      const card = a.closest('div[role="article"], div[data-visualcompletion]') || a.parentElement?.parentElement;
      const cardText = card ? (card.textContent || '') : '';

      let memberCount = 0;
      let memberText = '';
      const memMatch = cardText.match(/([0-9.,]+)\s*(k|nghìn|triệu|m)?\s*(thành viên|members)/i);
      if (memMatch) {
        memberText = memMatch[0].trim();
        let num = parseFloat(memMatch[1].replace(/,/g, '.'));
        const unit = (memMatch[2] || '').toLowerCase();
        if (unit === 'k' || unit === 'nghìn') num *= 1000;
        else if (unit === 'm' || unit === 'triệu') num *= 1000000;
        else if (memMatch[1].includes('.') && num < 100) num = parseFloat(memMatch[1].replace(/\./g, ''));
        memberCount = Math.round(num);
      }

      if (minMembers > 0 && memberCount > 0 && memberCount < minMembers) {
        continue;
      }

      const isJoined = /đã tham gia|joined/i.test(cardText);
      seenUrls.add(canonicalUrl);
      found.push({
        id: `grp_${slug}`,
        name: nameText,
        link: canonicalUrl,
        memberCount,
        memberText: memberText || 'Nhóm Facebook',
        joined: isJoined,
      });
    }

    return { success: true, groups: found };
  }

  // Lắng nghe các tác vụ từ Background
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'AUTO_POST_GROUP' || request.action === 'AUTO_POST_TO_GROUP') {
        const allowAutoJoin = request.autoJoinOnPost !== false;
        handleAutoPost(request.content, request.images, request.enableInvisibleChars, allowAutoJoin)
          .then((res) => sendResponse(res))
          .catch((err) => {
            sendResponse({
              success: false,
              status: 'failed',
              statusCode: 'UNHANDLED_ERROR',
              message: err.message || 'Lỗi ngoại lệ khi đăng bài',
            });
          });
        return true;
      }

      if (request.action === 'AUTO_JOIN_GROUP') {
        ensureGroupMembershipBeforePost(true)
          .then((res) => {
            sendResponse({
              success: res.canPost || res.autoJoined || res.joinStatus === 'joined' || res.joinStatus === 'pending',
              joinStatus: res.joinStatus,
              statusCode: res.statusCode,
              message: res.message,
            });
          })
          .catch((err) => {
            sendResponse({ success: false, message: err.message || 'Lỗi khi tham gia nhóm' });
          });
        return true;
      }

      if (request.action === 'SCAN_AND_PARSE_GROUPS') {
        scanGroupsOnSearchPage(request.minMembers || 0)
          .then((res) => sendResponse(res))
          .catch((err) => sendResponse({ success: false, error: err.message, groups: [] }));
        return true;
      }

      if (request.action === 'STOP_POSTING') {
        isStopped = true;
        sendResponse({ success: true, message: 'Đã nhận tín hiệu dừng' });
        return true;
      }

      if (request.action === 'DETECT_CURRENT_FB_ACCOUNT') {
        try {
          const res = detectCurrentFacebookAccount(request.cookieUid || '');
          sendResponse(res);
        } catch (err) {
          sendResponse({ success: false, error: err.message || 'Lỗi nhận diện tài khoản' });
        }
        return true;
      }

      if (request.action === 'SWITCH_OR_VERIFY_FB_ACCOUNT') {
        switchOrVerifyFacebookAccount(request.targetAccount || {})
          .then((res) => sendResponse(res))
          .catch((err) => sendResponse({
            success: false,
            switched: false,
            statusCode: 'SWITCH_EXCEPTION',
            message: err.message || 'Lỗi khi kiểm tra/chuyển tài khoản Facebook',
          }));
        return true;
      }
    });
  }

  const ContentModule = {
    RuntimeConfig,
    handleAutoPost,
    ensureGroupMembershipBeforePost,
    findComposerTrigger,
    findGroupJoinButton,
    findGroupPendingButton,
    findGroupJoinedButton,
    handlePostJoinDialogIfPresent,
    detectCurrentFacebookAccount,
    matchAccountIdentity,
    switchOrVerifyFacebookAccount,
    scanGroupsOnSearchPage,
    saltContentAntiSpam,
    checkSpamWarningInDialogs,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContentModule;
  }
  if (root) {
    root.ContentScriptEngine = ContentModule;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
