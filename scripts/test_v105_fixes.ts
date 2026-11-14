import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extDir = path.resolve(__dirname, '../src/extension_files');

// Minimal in-memory Chrome MV3 environment simulator
function createChromeSandbox(customFetch: (url: string, opts?: any) => Promise<any>) {
  const localStore: Record<string, any> = {};
  const syncStore: Record<string, any> = {};
  const storageListeners: Array<(changes: Record<string, any>, area: string) => void> = [];

  const clone = (v: any) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

  const makeStorageArea = (store: Record<string, any>, areaName: string) => ({
    get(keys: string | string[] | null, cb?: (res: Record<string, any>) => void) {
      const result: Record<string, any> = {};
      if (keys === null || keys === undefined) {
        Object.keys(store).forEach((k) => {
          result[k] = clone(store[k]);
        });
      } else {
        const list = Array.isArray(keys) ? keys : [keys];
        list.forEach((k) => {
          if (store[k] !== undefined) result[k] = clone(store[k]);
        });
      }
      if (cb) {
        queueMicrotask(() => cb(result));
      }
      return Promise.resolve(result);
    },
    set(items: Record<string, any>, cb?: () => void) {
      const changes: Record<string, any> = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: clone(store[k]), newValue: clone(v) };
        store[k] = clone(v);
      }
      if (cb) queueMicrotask(() => cb());
      queueMicrotask(() => {
        storageListeners.forEach((fn) => fn(changes, areaName));
      });
      return Promise.resolve();
    },
    remove(keys: string | string[], cb?: () => void) {
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach((k) => delete store[k]);
      if (cb) queueMicrotask(() => cb());
      return Promise.resolve();
    },
  });

  const chromeMock: any = {
    storage: {
      local: makeStorageArea(localStore, 'local'),
      sync: makeStorageArea(syncStore, 'sync'),
      onChanged: {
        addListener(fn: any) {
          storageListeners.push(fn);
        },
      },
    },
    alarms: {
      create: () => Promise.resolve(),
      clear: () => Promise.resolve(true),
      get: () => Promise.resolve(null),
      getAll: () => Promise.resolve([]),
      onAlarm: { addListener: () => {} },
    },
    cookies: {
      get: ({ name }: { url: string; name: string }, cb?: (cookie: any) => void) => {
        const val = name === 'c_user' ? { value: '100088899911122' } : null;
        if (cb) queueMicrotask(() => cb(val));
        return Promise.resolve(val);
      },
    },
    tabs: {
      query: (_q: any, cb?: (tabs: any[]) => void) => {
        const tabs = [{ id: 1, url: 'https://www.facebook.com/', active: true }];
        if (cb) queueMicrotask(() => cb(tabs));
        return Promise.resolve(tabs);
      },
      sendMessage: (_tabId: number, msg: any, cb?: (res: any) => void) => {
        if (msg.action === 'DETECT_FB_ACCOUNT') {
          const reply = {
            success: true,
            account: {
              uid: msg.cookieUidHint || '100088899911122',
              name: 'Nguyễn Văn Hiệu',
              avatar: '',
              profileUrl: 'https://www.facebook.com/me',
            },
          };
          if (cb) queueMicrotask(() => cb(reply));
          return Promise.resolve(reply);
        }
        if (cb) queueMicrotask(() => cb({ success: true }));
        return Promise.resolve({ success: true });
      },
      create: () => Promise.resolve({ id: 2 }),
      remove: () => Promise.resolve(),
      onUpdated: { addListener: () => {}, removeListener: () => {} },
    },
    runtime: {
      id: 'gialong-test-ext-id',
      lastError: null,
      getURL: (p: string) => `chrome-extension://gialong-test-ext-id/${p}`,
      onInstalled: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      onMessage: {
        listeners: [] as any[],
        addListener(fn: any) {
          this.listeners.push(fn);
        },
      },
      sendMessage: (msg: any, cb?: (res: any) => void) => {
        for (const fn of chromeMock.runtime.onMessage.listeners) {
          let handledAsync = false;
          const sendResp = (res: any) => {
            if (cb) queueMicrotask(() => cb(res));
          };
          const ret = fn(msg, {}, sendResp);
          if (ret === true) {
            handledAsync = true;
            break;
          }
        }
      },
    },
  };

  const sandbox: any = {
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    Date,
    Math,
    JSON,
    Promise,
    URL,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    crypto: globalThis.crypto,
    atob: globalThis.atob,
    btoa: globalThis.btoa,
    AbortSignal: globalThis.AbortSignal,
    chrome: chromeMock,
    fetch: customFetch,
    importScripts: (...files: string[]) => {
      for (const f of files) {
        const code = fs.readFileSync(path.join(extDir, f), 'utf-8');
        vm.runInContext(code, sandbox, { filename: f });
      }
    },
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  return { sandbox, localStore, syncStore, chromeMock };
}

async function runAllTests() {
  console.log('==============================================================');
  console.log('🚀 CHẠY BỘ KIỂM THỬ TỰ ĐỘNG GIA LONG - FB v1.0.5');
  console.log('==============================================================\n');

  let fetchCallCount = 0;
  let serverScenario: 'active' | 'http_500' | 'timeout' | 'unregistered' | 'revoked' = 'active';

  const makeResp = (status: number, bodyObj: any) => {
    const raw = JSON.stringify(bodyObj);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => raw,
      json: async () => bodyObj,
    };
  };

  const mockFetch = async (url: string): Promise<any> => {
    fetchCallCount++;
    await new Promise((r) => setTimeout(r, 8)); // Simulate network latency

    if (url.includes('/api/check')) {
      if (serverScenario === 'timeout') {
        throw new Error('Network Timeout Simulated');
      }
      if (serverScenario === 'http_500') {
        return makeResp(500, { success: false, status: 'server_error' });
      }
      if (serverScenario === 'unregistered') {
        return makeResp(200, {
          success: false,
          status: 'unregistered',
          isRevoked: false,
          message: 'Thiết bị chưa kích hoạt bản quyền.',
        });
      }
      if (serverScenario === 'revoked') {
        return makeResp(200, {
          success: false,
          status: 'revoked',
          isRevoked: true,
          action: 'FORCE_REVOKE',
          message: 'Bản quyền đã bị thu hồi!',
        });
      }
      const futureIso = new Date(Date.now() + 90 * 86400000).toISOString();
      return makeResp(200, {
        success: true,
        status: 'active',
        isRevoked: false,
        plan: 'individual',
        pkg_name: 'Gói VIP 3 Tháng',
        client_name: 'Công Ty Hoa Phượng',
        phone: '0869029310',
        key: 'GLFB-VIP-TEST99',
        expires_at: futureIso,
        days_left: 90,
        message: '✓ Bản quyền hợp lệ!',
      });
    }

    return makeResp(200, { success: true });
  };

  const { sandbox, localStore, syncStore } = createChromeSandbox(mockFetch);
  const bgCode = fs.readFileSync(path.join(extDir, 'background.js'), 'utf-8');
  vm.runInContext(bgCode, sandbox, { filename: 'background.js' });

  // Wait briefly for initial startup tasks to settle
  await new Promise((r) => setTimeout(r, 50));

  // ---------------------------------------------------------------------------
  // TEST 1: 50 CONCURRENT getOrCreateDeviceId() CALLS -> 1 CANONICAL ID
  // ---------------------------------------------------------------------------
  delete localStore.autorecruit_device_id;
  delete syncStore.autorecruit_device_id;
  vm.runInContext(`inFlightDeviceIdPromise = null;`, sandbox);

  const parallelDeviceIds: string[] = await Promise.all(
    Array.from({ length: 50 }, () => sandbox.getOrCreateDeviceId())
  );
  const uniqueDeviceIds = new Set(parallelDeviceIds);
  assert.equal(uniqueDeviceIds.size, 1, '50 lời gọi getOrCreateDeviceId() song song phải trả về đúng 1 Mã máy duy nhất');
  assert.ok(parallelDeviceIds[0].length >= 10, `Mã máy phải hợp lệ, nhận được: ${parallelDeviceIds[0]}`);
  assert.equal(localStore.autorecruit_device_id, parallelDeviceIds[0], 'local storage phải lưu đúng Mã máy chuẩn');
  assert.equal(syncStore.autorecruit_device_id, parallelDeviceIds[0], 'sync storage phải sao lưu đúng Mã máy chuẩn');
  console.log(`✅ [TEST 1 PASS] 50 lời gọi getOrCreateDeviceId() song song -> 1 ID duy nhất (${parallelDeviceIds[0]})`);

  // ---------------------------------------------------------------------------
  // TEST 2: 200 CONCURRENT checkLicenseStatus() + TRANSIENT SERVER ERRORS (NO FLAPPING)
  // ---------------------------------------------------------------------------
  serverScenario = 'active';
  const prevFetchCount = fetchCallCount;

  // Fire 50 concurrent forceRemote checks at once -> must deduplicate into 1 in-flight Promise
  const batch1 = await Promise.all(
    Array.from({ length: 50 }, () => sandbox.checkLicenseStatus(true))
  );
  const networkCallsFor50Concurrent = fetchCallCount - prevFetchCount;
  assert.equal(networkCallsFor50Concurrent, 1, `50 lời gọi checkLicenseStatus(true) đồng thời chỉ được phát sinh 1 request mạng (thực tế: ${networkCallsFor50Concurrent})`);
  assert.ok(batch1.every((r: any) => r && r.isValid === true && r.state === 'ACTIVE'), 'Tất cả 50 caller đồng thời phải nhận kết quả ACTIVE');

  // Now simulate 150 more checks across intermittent server failures (HTTP 500, Timeout, and 1-2 transient UNREGISTERED)
  const statesObserved: string[] = [];
  for (let i = 0; i < 15; i++) {
    if (i % 5 === 1) serverScenario = 'http_500';
    else if (i % 5 === 2) serverScenario = 'timeout';
    else if (i % 5 === 3) serverScenario = 'unregistered'; // Single transient unregistered (streak=1 < 3)
    else serverScenario = 'active';

    const wave = await Promise.all(
      Array.from({ length: 10 }, () => sandbox.checkLicenseStatus(true))
    );
    wave.forEach((res: any) => {
      assert.ok(res.isValid === true, `Không được nhấp nháy mất bản quyền ở vòng ${i} (scenario=${serverScenario}), nhận được: ${JSON.stringify(res)}`);
      statesObserved.push(res.state);
    });
  }

  assert.equal(localStore.isVip, true, 'isVip trong storage phải giữ nguyên true qua toàn bộ 200 lần kiểm tra');
  assert.notEqual(localStore.licenseState, 'UNREGISTERED', 'licenseState tuyệt đối không được chuyển sang UNREGISTERED khi lỗi mạng/500/1 lần unregistered');

  // Verify explicit REVOKED immediately transitions to REVOKED
  serverScenario = 'revoked';
  const revokedRes = await sandbox.checkLicenseStatus(true);
  assert.equal(revokedRes.isValid, false, 'Khi server trả REVOKED xác định, isValid phải chuyển thành false');
  assert.equal(revokedRes.state, 'REVOKED', 'Trạng thái phải chuyển sang REVOKED');
  serverScenario = 'active';
  const reactivatedRes = await sandbox.checkLicenseStatus(true);
  assert.equal(reactivatedRes.isValid, true, 'Khi được cấp lại bản quyền, trạng thái phải khôi phục ACTIVE');

  console.log(`✅ [TEST 2 PASS] 200 lần gọi checkLicenseStatus() song song + lỗi server 500/timeout/unregistered tạm thời -> 0 lần nhấp nháy, de-dup request chuẩn xác!`);

  // ---------------------------------------------------------------------------
  // TEST 3: 20 CONCURRENT AccountsManager.upsertAccount() -> 1 ACCOUNT RECORD
  // ---------------------------------------------------------------------------
  localStore.fbAccounts = [];
  localStore.activeAccountId = '';

  // Mix numeric UID calls and vanity username calls with the same account name
  const concurrentUpserts = Array.from({ length: 20 }, (_, idx) => {
    if (idx % 3 === 0) {
      return sandbox.AccountsManager.upsertAccount({
        uid: '100088899911122',
        name: 'Nguyễn Văn Hiệu',
        profileUrl: 'https://www.facebook.com/nguyenvanhieu.hr',
      });
    } else if (idx % 3 === 1) {
      return sandbox.AccountsManager.upsertAccount({
        uid: 'nguyenvanhieu.hr', // Legacy/vanity string
        name: 'Nguyễn Văn Hiệu',
        profileUrl: 'https://www.facebook.com/nguyenvanhieu.hr',
        note: 'Nick chính tuyển dụng',
      });
    } else {
      return sandbox.AccountsManager.upsertAccount({
        id: 'acc_100088899911122',
        uid: '100088899911122',
        name: 'Nguyễn Văn Hiệu',
        avatar: 'https://example.com/avatar.jpg',
      });
    }
  });

  await Promise.all(concurrentUpserts);
  const finalAccounts = await sandbox.AccountsManager.getAccounts();
  assert.equal(finalAccounts.length, 1, `20 lần gọi upsertAccount() đồng thời cho cùng 1 tài khoản chỉ được tạo đúng 1 bản ghi (thực tế: ${finalAccounts.length})`);
  assert.equal(finalAccounts[0].id, 'acc_100088899911122', 'ID chuẩn hóa phải là acc_<numeric_uid>');
  assert.equal(finalAccounts[0].uid, '100088899911122', 'UID chuẩn hóa phải chỉ gồm chữ số c_user');
  assert.equal(finalAccounts[0].note, 'Nick chính tuyển dụng', 'Ghi chú từ các bản ghi gộp phải được bảo toàn');
  assert.equal(finalAccounts[0].avatar, 'https://example.com/avatar.jpg', 'Avatar từ các bản ghi gộp phải được bảo toàn');
  console.log(`✅ [TEST 3 PASS] 20 lần gọi upsertAccount() song song (trộn UID số + vanity username) -> Duy nhất 1 bản ghi (${finalAccounts[0].id})`);

  // ---------------------------------------------------------------------------
  // TEST 4: MIGRATION DEDUPLICATION REMAPS activeAccountId & scheduleSlots
  // ---------------------------------------------------------------------------
  const duplicateLegacyAccounts = [
    {
      id: 'acc_vanity_old',
      uid: 'hieu.tuyendung',
      name: 'Trần Minh Quân',
      note: 'Ghi chú cũ cần giữ',
      updatedAt: 1000,
    },
    {
      id: 'acc_1000555666777',
      uid: '1000555666777',
      name: 'Trần Minh Quân',
      avatar: 'https://example.com/quan.png',
      updatedAt: 2000,
    },
  ];
  const legacySlots = [
    {
      id: 'slot_0830_0',
      time: '08:30',
      enabled: true,
      accountId: 'acc_vanity_old',
      accountUid: 'hieu.tuyendung',
      accountName: 'Trần Minh Quân',
    },
  ];

  const deduped = sandbox.SharedStorage.dedupeAccounts(
    duplicateLegacyAccounts,
    'acc_vanity_old',
    legacySlots
  );

  assert.equal(deduped.accounts.length, 1, 'Migration dedupe phải gộp 2 bản ghi trùng thành 1');
  assert.equal(deduped.accounts[0].id, 'acc_1000555666777', 'Phải giữ ID chuẩn theo numeric UID');
  assert.equal(deduped.accounts[0].note, 'Ghi chú cũ cần giữ', 'Phải giữ lại note của bản ghi cũ');
  assert.equal(deduped.activeAccountId, 'acc_1000555666777', 'activeAccountId đang trỏ vào ID cũ phải được ánh xạ sang ID chuẩn');
  assert.equal(deduped.scheduleSlots[0].accountId, 'acc_1000555666777', 'scheduleSlots[].accountId đang trỏ vào ID cũ phải được ánh xạ sang ID chuẩn');
  assert.equal(deduped.scheduleSlots[0].accountUid, '1000555666777', 'scheduleSlots[].accountUid phải được cập nhật sang numeric UID');
  console.log(`✅ [TEST 4 PASS] Migration dedupeAccounts() gộp bản ghi trùng và cập nhật an toàn activeAccountId + scheduleSlots[].accountId`);

  console.log('\n🎉 TẤT CẢ 4 BÀI KIỂM THỬ NGHIỆM THU ĐỀU ĐẠT 100%!');
}

runAllTests().catch((err) => {
  console.error('❌ KIỂM THỬ THẤT BẠI:', err);
  process.exit(1);
});
