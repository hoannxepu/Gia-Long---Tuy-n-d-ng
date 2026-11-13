import assert from 'assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Lightweight DOM Simulator for testing content.js Phase 3 Auto-Join flows
class MockElement {
  tagName: string;
  attributes: Record<string, string> = {};
  innerText: string = '';
  textContent: string = '';
  href: string = '';
  disabled: boolean = false;
  checked: boolean = false;
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  onClick?: () => void;

  constructor(tagName: string, opts: Partial<MockElement> & { attrs?: Record<string, string> } = {}) {
    this.tagName = tagName.toLowerCase();
    if (opts.attrs) this.attributes = { ...opts.attrs };
    if (opts.innerText !== undefined) {
      this.innerText = opts.innerText;
      this.textContent = opts.innerText;
    }
    if (opts.textContent !== undefined) {
      this.textContent = opts.textContent;
      if (!this.innerText) this.innerText = opts.textContent;
    }
    if (opts.href) this.href = opts.href;
    if (opts.disabled !== undefined) this.disabled = opts.disabled;
    if (opts.checked !== undefined) this.checked = opts.checked;
    if (opts.onClick) this.onClick = opts.onClick;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  setAttribute(name: string, val: string) {
    this.attributes[name] = val;
  }

  getBoundingClientRect() {
    return { width: 320, height: 220 };
  }

  scrollIntoView() {}
  focus() {}

  click() {
    if (this.onClick) this.onClick();
  }

  dispatchEvent(_evt: any) {
    return true;
  }

  closest(selector: string): MockElement | null {
    let cur: MockElement | null = this.parentElement;
    while (cur) {
      if (matchesSimpleSelector(cur, selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  appendChild(child: MockElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const selectors = selector.split(',').map((s) => s.trim());
    function traverse(node: MockElement) {
      for (const ch of node.children) {
        if (selectors.some((sel) => matchesSimpleSelector(ch, sel))) {
          results.push(ch);
        }
        traverse(ch);
      }
    }
    traverse(this);
    return results;
  }

  querySelector(selector: string): MockElement | null {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function matchesSimpleSelector(el: MockElement, sel: string): boolean {
  if (sel === 'div[role="dialog"]') {
    return el.tagName === 'div' && el.getAttribute('role') === 'dialog';
  }
  if (sel === 'div[role="alert"]') {
    return el.tagName === 'div' && el.getAttribute('role') === 'alert';
  }
  if (sel === '[role="article"]') {
    return el.getAttribute('role') === 'article';
  }
  if (sel === 'div[role="button"]' || sel === 'span[role="button"]' || sel === 'a[role="button"]') {
    const tag = sel.split('[')[0];
    return el.tagName === tag && el.getAttribute('role') === 'button';
  }
  if (sel === 'button' || sel === 'textarea') {
    return el.tagName === sel;
  }
  if (sel === 'div[tabindex="0"]') {
    return el.tagName === 'div' && el.getAttribute('tabindex') === '0';
  }
  if (sel === 'input[type="text"]') {
    return el.tagName === 'input' && el.getAttribute('type') === 'text';
  }
  if (sel === 'input[type="radio"]') {
    return el.tagName === 'input' && el.getAttribute('type') === 'radio';
  }
  if (sel === 'div[role="radio"]') {
    return el.tagName === 'div' && el.getAttribute('role') === 'radio';
  }
  if (sel === 'div[role="checkbox"]') {
    return el.tagName === 'div' && el.getAttribute('role') === 'checkbox';
  }
  if (sel === 'input[type="checkbox"]') {
    return el.tagName === 'input' && el.getAttribute('type') === 'checkbox';
  }
  if (sel.includes('contenteditable="true"')) {
    return el.getAttribute('contenteditable') === 'true';
  }
  return false;
}

let mockRoot = new MockElement('body');

(globalThis as any).window = {
  location: { href: 'https://www.facebook.com/groups/tuyendunghanoi/' },
  getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
};

(globalThis as any).document = {
  body: mockRoot,
  querySelectorAll: (sel: string) => mockRoot.querySelectorAll(sel),
  querySelector: (sel: string) => mockRoot.querySelector(sel),
  execCommand: () => false,
};

(globalThis as any).Event = class {
  type: string;
  constructor(type: string) {
    this.type = type;
  }
};

const ContentEngine = require('../src/extension_files/content.js');

// Speed up timers for unit testing
ContentEngine.RuntimeConfig.actionDelayMs = 20;
ContentEngine.RuntimeConfig.joinWaitMs = 30;
ContentEngine.RuntimeConfig.conditionTimeoutMs = 150;
ContentEngine.RuntimeConfig.conditionStepMs = 20;
ContentEngine.RuntimeConfig.postVerifyIterations = 3;
ContentEngine.RuntimeConfig.postVerifyStepMs = 20;

function resetDOM() {
  mockRoot = new MockElement('body');
  (globalThis as any).document.body = mockRoot;
}

async function runPhase3Tests() {
  console.log('=== BẮT ĐẦU KIỂM THỬ GIAI ĐOẠN 3 (TỰ VÀO NHÓM KHI ĐĂNG) ===');

  // 1. Đã là thành viên (Có sẵn ô "Bạn viết gì đi...")
  resetDOM();
  mockRoot.appendChild(
    new MockElement('div', {
      attrs: { role: 'button' },
      innerText: 'Bạn viết gì đi...',
    })
  );
  const res1 = await ContentEngine.ensureGroupMembershipBeforePost(true);
  assert.strictEqual(res1.canPost, true);
  assert.strictEqual(res1.autoJoined, false);
  assert.strictEqual(res1.statusCode, 'ALREADY_MEMBER');
  console.log('✓ 1. Nhận diện nhóm đã tham gia (có sẵn khung tạo bài viết) chính xác');

  // 2. Chưa tham gia -> Tự bấm "Tham gia nhóm" -> Nhóm công khai vào thẳng & mở khung đăng bài -> Đăng thành công
  resetDOM();
  const joinBtn2 = new MockElement('div', {
    attrs: { role: 'button' },
    innerText: 'Tham gia nhóm',
    onClick: () => {
      // Sau khi bấm Tham gia, nút đổi thành "Đã tham gia" và xuất hiện ô "Bạn viết gì đi..."
      joinBtn2.innerText = 'Đã tham gia';
      joinBtn2.textContent = 'Đã tham gia';

      const composerTrigger = new MockElement('div', {
        attrs: { role: 'button' },
        innerText: 'Bạn viết gì đi...',
        onClick: () => {
          // Mở dialog tạo bài viết
          const dlg = new MockElement('div', { attrs: { role: 'dialog' } });
          const textBox = new MockElement('div', {
            attrs: { role: 'textbox', contenteditable: 'true' },
          });
          const postBtn = new MockElement('div', {
            attrs: { role: 'button' },
            innerText: 'Đăng',
            onClick: () => {
              // Đóng dialog sau khi bấm Đăng
              mockRoot.children = mockRoot.children.filter((c) => c !== dlg);
            },
          });
          dlg.appendChild(textBox);
          dlg.appendChild(postBtn);
          mockRoot.appendChild(dlg);
        },
      });
      mockRoot.appendChild(composerTrigger);
    },
  });
  mockRoot.appendChild(joinBtn2);

  const postRes2 = await ContentEngine.handleAutoPost('Tuyển nhân viên hành chính lương 15tr', [], false, true);
  assert.strictEqual(postRes2.success, true, 'Phải tự vào nhóm và đăng bài thành công');
  assert.strictEqual(postRes2.status, 'success');
  assert.strictEqual(postRes2.autoJoined, true, 'Cờ autoJoined phải bằng true');
  assert.strictEqual(postRes2.joinStatus, 'joined');
  assert.strictEqual(postRes2.statusCode, 'AUTO_JOINED_AND_POSTED');
  console.log('✓ 2. Tự động bấm Tham gia nhóm -> Mở khung soạn thảo -> Đăng bài thành công trong cùng 1 lượt');

  // 3. Chưa tham gia -> Tự bấm "Tham gia nhóm" -> Nhóm riêng tư chuyển sang "Hủy yêu cầu" (Chờ QTV duyệt)
  resetDOM();
  const joinBtn3 = new MockElement('div', {
    attrs: { role: 'button' },
    innerText: 'Tham gia nhóm',
    onClick: () => {
      joinBtn3.innerText = 'Hủy yêu cầu';
      joinBtn3.textContent = 'Hủy yêu cầu';
    },
  });
  mockRoot.appendChild(joinBtn3);

  const postRes3 = await ContentEngine.handleAutoPost('Bài tuyển dụng', [], false, true);
  assert.strictEqual(postRes3.success, false);
  assert.strictEqual(postRes3.status, 'failed');
  assert.strictEqual(postRes3.autoJoined, true);
  assert.strictEqual(postRes3.joinStatus, 'pending');
  assert.strictEqual(postRes3.statusCode, 'JOIN_REQUEST_SENT');
  console.log('✓ 3. Tự động bấm Tham gia nhóm riêng tư -> Ghi nhận trạng thái Chờ QTV duyệt (JOIN_REQUEST_SENT)');

  // 4. Chưa tham gia -> Bấm "Tham gia nhóm" -> Hiện hộp thoại câu hỏi khảo sát tự luận (textarea) -> Dừng an toàn không điền bừa
  resetDOM();
  const joinBtn4 = new MockElement('div', {
    attrs: { role: 'button' },
    innerText: 'Tham gia nhóm',
    onClick: () => {
      const surveyDlg = new MockElement('div', {
        attrs: { role: 'dialog' },
        innerText: 'Trả lời câu hỏi thành viên',
      });
      surveyDlg.appendChild(new MockElement('textarea'));
      mockRoot.appendChild(surveyDlg);
    },
  });
  mockRoot.appendChild(joinBtn4);

  const postRes4 = await ContentEngine.handleAutoPost('Bài tuyển dụng', [], false, true);
  assert.strictEqual(postRes4.success, false);
  assert.strictEqual(postRes4.statusCode, 'JOIN_QUESTIONS_REQUIRED');
  assert.strictEqual(postRes4.joinStatus, 'questions_required');
  console.log('✓ 4. Phát hiện hộp thoại câu hỏi thành viên (textarea) -> Không điền rác, trả về JOIN_QUESTIONS_REQUIRED');

  // 5. Chưa tham gia -> Bấm "Tham gia nhóm" -> Hộp thoại CHỈ yêu cầu tích đồng ý quy tắc nhóm -> Tự tích & bấm Gửi -> Vào nhóm
  resetDOM();
  const joinBtn5 = new MockElement('div', {
    attrs: { role: 'button' },
    innerText: 'Tham gia nhóm',
    onClick: () => {
      const rulesDlg = new MockElement('div', {
        attrs: { role: 'dialog' },
        innerText: 'Quy tắc nhóm: Tôi đồng ý với quy tắc nhóm',
      });
      const checkbox = new MockElement('div', {
        attrs: { role: 'checkbox', 'aria-checked': 'false' },
        onClick: () => {
          checkbox.setAttribute('aria-checked', 'true');
        },
      });
      const submitBtn = new MockElement('div', {
        attrs: { role: 'button' },
        innerText: 'Gửi',
        onClick: () => {
          if (checkbox.getAttribute('aria-checked') === 'true') {
            mockRoot.children = mockRoot.children.filter((c) => c !== rulesDlg);
            joinBtn5.innerText = 'Đã tham gia';
            joinBtn5.textContent = 'Đã tham gia';
            mockRoot.appendChild(
              new MockElement('div', {
                attrs: { role: 'button' },
                innerText: 'Bạn viết gì đi...',
              })
            );
          }
        },
      });
      rulesDlg.appendChild(checkbox);
      rulesDlg.appendChild(submitBtn);
      mockRoot.appendChild(rulesDlg);
    },
  });
  mockRoot.appendChild(joinBtn5);

  const res5 = await ContentEngine.ensureGroupMembershipBeforePost(true);
  assert.strictEqual(res5.canPost, true);
  assert.strictEqual(res5.autoJoined, true);
  assert.strictEqual(res5.joinStatus, 'joined');
  console.log('✓ 5. Tự động tích đồng ý quy tắc nhóm (khi không có câu hỏi tự luận) và vào nhóm thành công');

  // 6. Nhóm đang ở trạng thái "Hủy yêu cầu" từ trước -> Không bấm lại để tránh hủy nhầm yêu cầu
  resetDOM();
  let clickedCancelByMistake = false;
  mockRoot.appendChild(
    new MockElement('div', {
      attrs: { role: 'button' },
      innerText: 'Hủy yêu cầu',
      onClick: () => {
        clickedCancelByMistake = true;
      },
    })
  );
  const res6 = await ContentEngine.ensureGroupMembershipBeforePost(true);
  assert.strictEqual(res6.canPost, false);
  assert.strictEqual(res6.statusCode, 'JOIN_PENDING_APPROVAL');
  assert.strictEqual(clickedCancelByMistake, false, 'Tuyệt đối không được bấm vào nút Hủy yêu cầu');
  console.log('✓ 6. Bảo vệ không bấm nhầm nút "Hủy yêu cầu" khi nhóm đang chờ duyệt từ trước');

  // 7. Khi tắt tuỳ chọn autoJoinOnPost (autoJoinOnPost = false)
  resetDOM();
  let clickedJoinWhenDisabled = false;
  mockRoot.appendChild(
    new MockElement('div', {
      attrs: { role: 'button' },
      innerText: 'Tham gia nhóm',
      onClick: () => {
        clickedJoinWhenDisabled = true;
      },
    })
  );
  const res7 = await ContentEngine.ensureGroupMembershipBeforePost(false);
  assert.strictEqual(res7.canPost, false);
  assert.strictEqual(res7.statusCode, 'NOT_GROUP_MEMBER');
  assert.strictEqual(clickedJoinWhenDisabled, false);
  console.log('✓ 7. Tôn trọng cấu hình tắt tự vào nhóm (autoJoinOnPost = false)');

  console.log('=== TẤT CẢ TEST GIAI ĐOẠN 3 ĐỀU PASS 100% ===');
}

runPhase3Tests().catch((err) => {
  console.error('TEST GIAI ĐOẠN 3 THẤT BẠI:', err);
  process.exit(1);
});
