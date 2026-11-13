import assert from 'assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// 1. Mock Chrome API & Storage
const mockLocalStore: Record<string, any> = {};
const mockSessionStore: Record<string, any> = {};
const mockAlarms: Record<string, any> = {};

let mockTabs: any[] = [
  { id: 101, url: 'https://www.facebook.com/', active: true },
];
let customTabMessageHandler: ((tabId: number, msg: any) => any) | null = null;

(globalThis as any).chrome = {
  storage: {
    local: {
      get: (keys: string[] | string | null, cb?: (res: any) => void) => {
        const res: Record<string, any> = {};
        if (!keys) {
          Object.assign(res, mockLocalStore);
        } else if (typeof keys === 'string') {
          res[keys] = mockLocalStore[keys];
        } else if (Array.isArray(keys)) {
          for (const k of keys) res[k] = mockLocalStore[k];
        }
        if (cb) cb(res);
        return Promise.resolve(res);
      },
      set: (items: Record<string, any>, cb?: () => void) => {
        Object.assign(mockLocalStore, items);
        if (cb) cb();
        return Promise.resolve();
      },
      remove: (keys: string[] | string, cb?: () => void) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete mockLocalStore[k];
        if (cb) cb();
        return Promise.resolve();
      },
    },
    session: {
      get: (keys: string[] | string | null, cb?: (res: any) => void) => {
        const res: Record<string, any> = {};
        if (!keys) {
          Object.assign(res, mockSessionStore);
        } else if (typeof keys === 'string') {
          res[keys] = mockSessionStore[keys];
        } else if (Array.isArray(keys)) {
          for (const k of keys) res[k] = mockSessionStore[k];
        }
        if (cb) cb(res);
        return Promise.resolve(res);
      },
      set: (items: Record<string, any>, cb?: () => void) => {
        Object.assign(mockSessionStore, items);
        if (cb) cb();
        return Promise.resolve();
      },
    },
    onChanged: {
      addListener: () => {},
    },
  },
  alarms: {
    create: (name: string, info: any) => {
      mockAlarms[name] = { name, ...info };
      return Promise.resolve();
    },
    clear: (name: string, cb?: (wasCleared: boolean) => void) => {
      const existed = Boolean(mockAlarms[name]);
      delete mockAlarms[name];
      if (cb) cb(existed);
      return Promise.resolve(existed);
    },
    getAll: (cb?: (alarms: any[]) => void) => {
      const list = Object.values(mockAlarms);
      if (cb) cb(list);
      return Promise.resolve(list);
    },
  },
  tabs: {
    query: (_q: any, cb?: (tabs: any[]) => void) => {
      if (cb) cb(mockTabs);
      return Promise.resolve(mockTabs);
    },
    create: (opts: any, cb?: (tab: any) => void) => {
      const newTab = { id: 202, url: opts.url, active: Boolean(opts.active) };
      mockTabs.push(newTab);
      if (cb) cb(newTab);
      return Promise.resolve(newTab);
    },
    sendMessage: (tabId: number, msg: any, cb?: (res: any) => void) => {
      let response: any = null;
      if (customTabMessageHandler) {
        response = customTabMessageHandler(tabId, msg);
      }
      Promise.resolve(response).then((resolved) => {
        if (cb) cb(resolved);
      });
    },
  },
  scripting: {
    executeScript: () => Promise.resolve([]),
  },
  runtime: {
    lastError: null,
    onMessage: {
      addListener: () => {},
    },
  },
};

// 2. Mock DOM for ContentScriptEngine account detection & switching
class MockElement {
  tagName: string;
  attributes: Record<string, string> = {};
  innerText: string = '';
  textContent: string = '';
  href: string = '';
  disabled: boolean = false;
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
    if (opts.onClick) this.onClick = opts.onClick;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  setAttribute(name: string, val: string) {
    this.attributes[name] = val;
  }

  getBoundingClientRect() {
    return { width: 240, height: 60 };
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
      if (matchesSelector(cur, selector)) return cur;
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
        if (selectors.some((sel) => matchesSelector(ch, sel))) {
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

function matchesSelector(el: MockElement, sel: string): boolean {
  const parts = sel.trim().split(/\s+(?![^\[]*\])/);
  if (parts.length > 1) {
    const childSel = parts[parts.length - 1];
    const parentSel = parts.slice(0, -1).join(' ');
    if (!matchesSelector(el, childSel)) return false;
    return Boolean(el.closest(parentSel));
  }
  if (sel === 'script:not([src])') {
    return el.tagName === 'script' && !el.getAttribute('src');
  }
  if (sel === 'div[role="dialog"]' || sel === 'div[role="menu"]') {
    const role = sel.includes('dialog') ? 'dialog' : 'menu';
    return el.tagName === 'div' && el.getAttribute('role') === role;
  }
  if (sel === 'div[role="button"]' || sel === 'span[role="button"]' || sel === 'a[role="button"]') {
    const tag = sel.split('[')[0];
    return el.tagName === tag && el.getAttribute('role') === 'button';
  }
  if (sel === '[role="button"]' || sel === '[role="menuitem"]' || sel === '[role="listitem"]' || sel === '[role="radio"]') {
    const role = sel.replace('[role="', '').replace('"]', '');
    return el.getAttribute('role') === role;
  }
  if (sel === 'div[role="menuitem"]' || sel === 'div[role="listitem"]' || sel === 'a[role="link"]') {
    const [tag, rest] = sel.split('[role="');
    const role = rest?.replace('"]', '');
    return el.tagName === tag && el.getAttribute('role') === role;
  }
  if (sel === 'input[type="password"]' || sel === 'input[name="pass"]') {
    return (
      el.tagName === 'input' &&
      (el.getAttribute('type') === 'password' || el.getAttribute('name') === 'pass')
    );
  }
  if (sel.includes('aria-label*=')) {
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    if (sel.includes('Tài khoản')) return aria.includes('tài khoản');
    if (sel.includes('Trang cá nhân')) return aria.includes('trang cá nhân');
    if (sel.includes('Account')) return aria.includes('account');
    if (sel.includes('Your profile')) return aria.includes('your profile');
    if (sel.includes('Cài đặt và trang cá nhân')) return aria.includes('cài đặt và trang cá nhân');
  }
  if (sel === '[role="navigation"] a[href*="facebook.com/"]') {
    return el.tagName === 'a' && (el.getAttribute('href') || el.href || '').includes('facebook.com/');
  }
  if (sel === 'svg[aria-label]') {
    return el.tagName === 'svg' && Boolean(el.getAttribute('aria-label'));
  }
  if (sel === 'button') return el.tagName === 'button';
  if (sel === 'span') return el.tagName === 'span';
  return false;
}

let mockRoot = new MockElement('body');
let mockCookieString = 'c_user=100001111111; xs=mock_session';

(globalThis as any).window = {
  location: { href: 'https://www.facebook.com/' },
  getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
};

(globalThis as any).document = {
  get cookie() {
    return mockCookieString;
  },
  set cookie(val: string) {
    mockCookieString = val;
  },
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

const SharedStorage = require('../src/extension_files/storage.js');
const AccountsManager = require('../src/extension_files/accounts_manager.js');
const ContentEngine = require('../src/extension_files/content.js');
const AlarmsManager = require('../src/extension_files/alarms_manager.js');

(globalThis as any).SharedStorage = SharedStorage;
(globalThis as any).AccountsManager = AccountsManager;
(globalThis as any).AlarmsManager = AlarmsManager;

// Speed up content script timers for unit tests
ContentEngine.RuntimeConfig.actionDelayMs = 15;
ContentEngine.RuntimeConfig.joinWaitMs = 20;
ContentEngine.RuntimeConfig.switchMenuWaitMs = 20;
ContentEngine.RuntimeConfig.switchSettleWaitMs = 30;

function resetDOM(uid: string, name: string) {
  mockRoot = new MockElement('body');
  (globalThis as any).document.body = mockRoot;
  mockCookieString = `c_user=${uid}; xs=mock_xs`;
  mockRoot.appendChild(
    new MockElement('script', {
      textContent: JSON.stringify({ CURRENT_USER: { id: uid, name } }),
    })
  );
}

async function runPhase4Tests() {
  console.log('=== BẮT ĐẦU KIỂM THỬ GIAI ĐOẠN 4 (HẸN GIỜ THEO KHUNG + TỰ CHUYỂN TÀI KHOẢN) ===');

  // 1. Kiểm thử Migration & Chuẩn hóa scheduleSlots (Tương thích ngược với savedTimes/scheduledTimes)
  Object.keys(mockLocalStore).forEach((k) => delete mockLocalStore[k]);
  mockLocalStore.savedTimes = ['08:30', '14:15'];
  await SharedStorage.runStorageMigrations();

  assert.ok(Array.isArray(mockLocalStore.scheduleSlots), 'Phải tự tạo scheduleSlots từ savedTimes cũ');
  assert.strictEqual(mockLocalStore.scheduleSlots.length, 2);
  assert.strictEqual(mockLocalStore.scheduleSlots[0].time, '08:30');
  assert.strictEqual(mockLocalStore.scheduleSlots[0].accountId, 'active');
  assert.deepStrictEqual(mockLocalStore.savedTimes, ['08:30', '14:15'], 'Phải giữ nguyên khóa cũ savedTimes');
  assert.deepStrictEqual(mockLocalStore.scheduledTimes, ['08:30', '14:15'], 'Phải giữ nguyên khóa cũ scheduledTimes');
  console.log('✓ 1. Migration tự động từ savedTimes sang scheduleSlots & bảo toàn khóa cũ (Rule 2)');

  // 2. Kiểm thử switchOrVerifyFacebookAccount khi ĐÃ ĐÚNG tài khoản của khung giờ
  resetDOM('100001111111', 'Nguyễn Văn A');
  const verifyRes1 = await ContentEngine.switchOrVerifyFacebookAccount({
    accountId: 'fb_100001111111',
    accountUid: '100001111111',
    accountName: 'Nguyễn Văn A',
    autoSwitch: true,
  });
  assert.strictEqual(verifyRes1.success, true);
  assert.strictEqual(verifyRes1.switched, false);
  assert.strictEqual(verifyRes1.statusCode, 'ACCOUNT_ALREADY_MATCHED');
  assert.strictEqual(verifyRes1.account.uid, '100001111111');
  console.log('✓ 2. Nhận diện tài khoản đang mở đã trùng khớp với tài khoản khung giờ (ACCOUNT_ALREADY_MATCHED)');

  // 3. Kiểm thử switchOrVerifyFacebookAccount khi đang ở Nick A nhưng khung giờ yêu cầu Nick B -> Tự bấm menu Tài khoản -> Xem tất cả trang cá nhân -> Chuyển sang Nick B
  resetDOM('100001111111', 'Nguyễn Văn A');
  const accountMenuBtn = new MockElement('div', {
    attrs: { role: 'button', 'aria-label': 'Tài khoản của bạn' },
    onClick: () => {
      const menuDlg = new MockElement('div', { attrs: { role: 'dialog' } });
      const seeAllBtn = new MockElement('div', {
        attrs: { role: 'button' },
        innerText: 'Xem tất cả trang cá nhân',
        onClick: () => {
          const profileBItem = new MockElement('div', {
            attrs: { role: 'listitem' },
            innerText: 'Trần Thị B',
            onClick: () => {
              // Sau khi bấm vào Trần Thị B, Facebook chuyển sang tài khoản Trần Thị B
              resetDOM('100002222222', 'Trần Thị B');
            },
          });
          menuDlg.appendChild(profileBItem);
        },
      });
      menuDlg.appendChild(seeAllBtn);
      mockRoot.appendChild(menuDlg);
    },
  });
  mockRoot.appendChild(accountMenuBtn);

  const switchRes = await ContentEngine.switchOrVerifyFacebookAccount({
    accountId: 'fb_100002222222',
    accountUid: '100002222222',
    accountName: 'Trần Thị B',
    autoSwitch: true,
  });
  assert.strictEqual(switchRes.success, true, 'Phải tự chuyển tài khoản qua menu trang cá nhân thành công');
  assert.strictEqual(switchRes.switched, true);
  assert.strictEqual(switchRes.statusCode, 'ACCOUNT_SWITCHED_SUCCESS');
  assert.strictEqual(switchRes.account.uid, '100002222222');
  assert.strictEqual(switchRes.account.name, 'Trần Thị B');
  console.log('✓ 3. Tự động chuyển từ Nick A sang Nick B qua menu trang cá nhân của Facebook (ACCOUNT_SWITCHED_SUCCESS)');

  // 4. Kiểm thử khi Facebook yêu cầu nhập lại mật khẩu thủ công lúc chuyển tài khoản -> Dừng an toàn, không lưu pass
  resetDOM('100001111111', 'Nguyễn Văn A');
  const accountMenuBtnPass = new MockElement('div', {
    attrs: { role: 'button', 'aria-label': 'Tài khoản' },
    onClick: () => {
      const dlg = new MockElement('div', { attrs: { role: 'dialog' } });
      const profileCItem = new MockElement('div', {
        attrs: { role: 'menuitem' },
        innerText: 'Lê Văn C',
        onClick: () => {
          // Facebook bật ô nhập mật khẩu
          dlg.appendChild(new MockElement('input', { attrs: { type: 'password', name: 'pass' } }));
        },
      });
      dlg.appendChild(profileCItem);
      mockRoot.appendChild(dlg);
    },
  });
  mockRoot.appendChild(accountMenuBtnPass);

  const passSwitchRes = await ContentEngine.switchOrVerifyFacebookAccount({
    accountId: 'fb_100003333333',
    accountUid: '100003333333',
    accountName: 'Lê Văn C',
    autoSwitch: true,
  });
  assert.strictEqual(passSwitchRes.success, false);
  assert.strictEqual(passSwitchRes.statusCode, 'SWITCH_REQUIRES_MANUAL_LOGIN');
  console.log('✓ 4. Phát hiện Facebook yêu cầu nhập mật khẩu -> Dừng an toàn (SWITCH_REQUIRES_MANUAL_LOGIN), tuyệt đối không lưu mật khẩu');

  // 5. Kiểm thử AlarmsManager.executeScheduledSlot bỏ qua khung giờ khi tài khoản gắn với khung giờ đang trong thời gian Cooldown
  await AccountsManager.upsertAccount({
    id: 'fb_100001111111',
    uid: '100001111111',
    name: 'Nguyễn Văn A',
    status: 'rate_limited',
    cooldownUntil: Date.now() + 60 * 60 * 1000, // Còn 60 phút nghỉ
  });

  // Giả lập bản quyền hợp lệ và FbRunner
  (globalThis as any).checkLicenseStatus = async () => ({ isValid: true });
  let capturedBatchPayload: any = null;
  (globalThis as any).FbRunner = {
    getRunState: async () => ({ status: 'idle' }),
    appendHistoryEntry: async (entry: any) => {
      mockLocalStore.postHistory = mockLocalStore.postHistory || [];
      mockLocalStore.postHistory.unshift(entry);
    },
    startBatchPosting: async (payload: any) => {
      capturedBatchPayload = payload;
      return { success: true, runId: 'run_test_1130' };
    },
  };

  mockLocalStore.isScheduleActive = true;
  mockLocalStore.postHistory = [];
  mockLocalStore.scheduleSlots = [
    {
      id: 'slot_0830',
      time: '08:30',
      enabled: true,
      accountId: 'fb_100001111111',
      accountUid: '100001111111',
      accountName: 'Nguyễn Văn A',
      postId: 'selected',
      autoSwitchAccount: true,
    },
  ];

  const cooldownSlotRes = await AlarmsManager.executeScheduledSlot(mockLocalStore.scheduleSlots[0]);
  assert.strictEqual(cooldownSlotRes.success, false);
  assert.strictEqual(cooldownSlotRes.skipped, true);
  assert.strictEqual(cooldownSlotRes.statusCode, 'ACCOUNT_COOLDOWN');
  assert.strictEqual(mockLocalStore.postHistory.length, 1);
  assert.strictEqual(mockLocalStore.postHistory[0].accountId, 'fb_100001111111');
  assert.strictEqual(mockLocalStore.postHistory[0].accountName, 'Nguyễn Văn A');
  console.log('✓ 5. Khung giờ gắn với tài khoản đang Cooldown -> Tự động bỏ qua & ghi lịch sử kèm đúng tên tài khoản');

  // 6. Kiểm thử AlarmsManager.executeScheduledSlot tự chuyển sang Nick B, truyền đủ 3 biến thể nội dung (content, contentVariant2, contentVariant3) và chặn chạy trùng trong cùng 1 ngày
  await AccountsManager.upsertAccount({
    id: 'fb_100002222222',
    uid: '100002222222',
    name: 'Trần Thị B',
    status: 'active',
    cooldownUntil: 0,
  });

  customTabMessageHandler = (_tabId, msg) => {
    if (msg.action === 'SWITCH_OR_VERIFY_FB_ACCOUNT') {
      return {
        success: true,
        switched: true,
        statusCode: 'ACCOUNT_SWITCHED_SUCCESS',
        account: {
          id: 'fb_100002222222',
          uid: '100002222222',
          name: 'Trần Thị B',
        },
      };
    }
    return null;
  };

  mockLocalStore.savedGroups = [
    { id: 'g1', name: 'Nhóm Tuyển Dụng HN', link: 'https://www.facebook.com/groups/tuyendunghn/', enabled: true },
  ];
  mockLocalStore.savedPosts = [
    {
      id: 'p1',
      title: 'Tuyển Kế Toán',
      content: 'Biến thể 1: Tuyển kế toán nội bộ',
      contentVariant2: 'Biến thể 2: Cần tuyển gấp kế toán tổng hợp',
      contentVariant3: 'Biến thể 3: Góc tìm đồng đội kế toán đi làm ngay',
      images: ['https://example.com/img1.jpg'],
    },
  ];
  mockLocalStore.scheduleSlots = [
    {
      id: 'slot_1130',
      time: '11:30',
      enabled: true,
      accountId: 'fb_100002222222',
      accountUid: '100002222222',
      accountName: 'Trần Thị B',
      postId: 'p1',
      autoSwitchAccount: true,
    },
  ];

  const runSlotRes = await AlarmsManager.executeScheduledSlot(mockLocalStore.scheduleSlots[0]);
  assert.strictEqual(runSlotRes.success, true, 'Khung giờ hợp lệ phải được kích hoạt chạy');
  assert.strictEqual(runSlotRes.switchedAccount, true);
  assert.ok(capturedBatchPayload, 'Phải gọi FbRunner.startBatchPosting');
  assert.strictEqual(capturedBatchPayload.accountId, 'fb_100002222222');
  assert.strictEqual(capturedBatchPayload.accountName, 'Trần Thị B');
  assert.strictEqual(capturedBatchPayload.slotId, 'slot_1130');
  assert.deepStrictEqual(
    capturedBatchPayload.variants,
    [
      'Biến thể 1: Tuyển kế toán nội bộ',
      'Biến thể 2: Cần tuyển gấp kế toán tổng hợp',
      'Biến thể 3: Góc tìm đồng đội kế toán đi làm ngay',
    ],
    'Phải truyền đúng cả 3 biến thể nội dung thật của bài viết được chọn'
  );

  // Gọi lại cùng slot đó trong cùng ngày -> Phải chặn ALREADY_RAN_TODAY
  const duplicateRunRes = await AlarmsManager.executeScheduledSlot(mockLocalStore.scheduleSlots[0]);
  assert.strictEqual(duplicateRunRes.success, false);
  assert.strictEqual(duplicateRunRes.skipped, true);
  assert.strictEqual(duplicateRunRes.statusCode, 'ALREADY_RAN_TODAY');
  console.log('✓ 6. Kích hoạt khung giờ tự chuyển sang Nick B, truyền đủ 3 biến thể nội dung & chống chạy lặp trong ngày (ALREADY_RAN_TODAY)');

  console.log('=== TẤT CẢ TEST GIAI ĐOẠN 4 ĐỀU PASS 100% ===');
}

runPhase4Tests().catch((err) => {
  console.error('TEST GIAI ĐOẠN 4 THẤT BẠI:', err);
  process.exit(1);
});
