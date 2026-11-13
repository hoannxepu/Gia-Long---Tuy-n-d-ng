import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

async function runPhase6IntegrationSuite() {
  console.log('================================================================================');
  console.log('🚀 BẮT ĐẦU KIỂM THỬ TỔNG HỢP GIAI ĐOẠN 6 (END-TO-END & AUDIT TOÀN HỆ THỐNG)');
  console.log('================================================================================\n');

  const rootDir = process.cwd();
  const extDir = path.join(rootDir, 'src/extension_files');

  // 1. Chạy lại toàn bộ các bộ kiểm thử tự động từ Giai đoạn 0 -> Giai đoạn 5
  const testScripts = [
    'scripts/test_phase0_security.ts',
    'scripts/test_phase1_runner.ts',
    'scripts/test_phase2_accounts.ts',
    'scripts/test_phase3_autojoin.ts',
    'scripts/test_phase4_schedule_switch.ts',
    'scripts/test_phase5_history.ts',
  ];

  console.log('--- PHẦN 1: CHẠY LẠI TOÀN BỘ SUITE KIỂM THỬ GIAI ĐOẠN 0 -> 5 ---');
  for (const script of testScripts) {
    const fullPath = path.join(rootDir, script);
    assert.ok(fs.existsSync(fullPath), `Thiếu file test: ${script}`);
    console.log(`▶ Đang chạy ${script}...`);
    execSync(`npx tsx ${script}`, { stdio: 'inherit' });
    console.log(`✓ PASS: ${script}\n`);
  }

  // 2. Kiểm tra tính toàn vẹn của Manifest V3 và toàn bộ file JS trong src/extension_files
  console.log('--- PHẦN 2: KIỂM TRA MANIFEST V3 & CÚ PHÁP VANILLA JS (RULE 2, 3, 4, 5) ---');
  const manifestPath = path.join(extDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(manifest.manifest_version, 3, 'Phải là Chrome Extension Manifest V3');
  assert.ok(manifest.permissions.includes('storage'), 'Manifest phải có quyền storage');
  assert.ok(manifest.permissions.includes('alarms'), 'Manifest phải có quyền alarms');
  assert.ok(manifest.permissions.includes('cookies'), 'Manifest phải có quyền cookies (Giai đoạn 2 & 4)');
  assert.ok(manifest.permissions.includes('scripting'), 'Manifest phải có quyền scripting');
  assert.equal(
    manifest.host_permissions.includes('https://*/*'),
    false,
    'Manifest tuyệt đối không được chứa https://*/* (Giai đoạn 0.6)'
  );

  const extJsFiles = [
    'ed25519_verify.js',
    'storage.js',
    'spintax.js',
    'accounts_manager.js',
    'fb_runner.js',
    'alarms_manager.js',
    'background.js',
    'content.js',
    'web_bridge.js',
    'dashboard.js',
    'popup.js',
  ];

  for (const fileName of extJsFiles) {
    const filePath = path.join(extDir, fileName);
    assert.ok(fs.existsSync(filePath), `File extension bắt buộc phải tồn tại: ${fileName}`);
    const code = fs.readFileSync(filePath, 'utf8');
    // Kiểm tra cú pháp JS thuần bằng vm.Script (Rule 3: không cần bước build, chạy trực tiếp)
    new vm.Script(code, { filename: fileName });
    // Kiểm tra Rule 4: Không còn dòng "Mã TD: #" tự chèn vào nội dung người dùng
    assert.equal(
      code.includes('Mã TD: #'),
      false,
      `File ${fileName} không được chứa chuỗi tự chèn 'Mã TD: #' (Rule 4)`
    );
  }
  console.log('✓ PASS: Toàn bộ 11 file JS của Extension đều hợp lệ cú pháp Vanilla JS và tuân thủ Rule 3 & Rule 4.');

  // 3. Kiểm tra kịch bản tích hợp liên thông (E2E Workflow):
  //    Migration -> Quản lý 2 Nick FB -> Hẹn giờ theo khung tự chuyển Nick -> Tự vào nhóm khi đăng -> Ghi lịch sử & Xuất CSV
  console.log('\n--- PHẦN 3: KIỂM THỬ TÍCH HỢP LIÊN THÔNG (E2E WORKFLOW TRONG SANDBOX) ---');
  const localStore: Record<string, any> = {
    // Dữ liệu cũ trước khi nâng cấp (kiểm tra Rule 2 bảo toàn khoá cũ)
    savedPosts: [
      {
        id: 'post_1',
        title: 'Tuyển Nhân Viên Văn Phòng',
        content: '{Tuyển gấp|Cần tuyển} nhân viên văn phòng thu nhập hấp dẫn',
        contentVariant2: 'Tuyển nhân sự hành chính làm việc ngay',
        contentVariant3: 'Cơ hội việc làm văn phòng lương cứng + thưởng',
        images: [],
      },
    ],
    savedGroups: [
      {
        id: 'grp_1',
        name: 'Hội Tuyển Dụng Việc Làm Hà Nội',
        link: 'https://m.facebook.com/groups/tuyendunghanoi/?ref=share',
        enabled: true,
      },
    ],
    savedTimes: ['08:30', '14:00'],
    selectedPostIdx: 0,
    delaySec: 30,
    isScheduleActive: true,
    postHistory: [],
  };
  const sessionStore: Record<string, any> = {};
  const cookieJar: Record<string, string> = {
    c_user: '1000111111111',
    xs: 'xs_token_acc_1',
  };

  const chromeMock = {
    storage: {
      local: {
        get: (keys?: any, cb?: (res: any) => void) => {
          let res: Record<string, any> = {};
          if (!keys) res = { ...localStore };
          else if (typeof keys === 'string') res = { [keys]: localStore[keys] };
          else if (Array.isArray(keys)) {
            for (const k of keys) res[k] = localStore[k];
          } else {
            for (const [k, defVal] of Object.entries(keys)) {
              res[k] = localStore[k] !== undefined ? localStore[k] : defVal;
            }
          }
          if (typeof cb === 'function') cb(res);
          return Promise.resolve(res);
        },
        set: (items: Record<string, any>, cb?: () => void) => {
          Object.assign(localStore, items);
          if (typeof cb === 'function') cb();
          return Promise.resolve();
        },
        remove: (keys: string | string[], cb?: () => void) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) delete localStore[k];
          if (typeof cb === 'function') cb();
          return Promise.resolve();
        },
      },
      session: {
        get: (keys?: any, cb?: (res: any) => void) => {
          let res: Record<string, any> = {};
          if (!keys) res = { ...sessionStore };
          else if (typeof keys === 'string') res = { [keys]: sessionStore[keys] };
          else if (Array.isArray(keys)) {
            for (const k of keys) res[k] = sessionStore[k];
          }
          if (typeof cb === 'function') cb(res);
          return Promise.resolve(res);
        },
        set: (items: Record<string, any>, cb?: () => void) => {
          Object.assign(sessionStore, items);
          if (typeof cb === 'function') cb();
          return Promise.resolve();
        },
      },
      onChanged: { addListener: () => {} },
    },
    cookies: {
      get: async ({ name }: { name: string }) =>
        cookieJar[name] ? { name, value: cookieJar[name], domain: '.facebook.com' } : null,
      getAll: async () =>
        Object.entries(cookieJar).map(([name, value]) => ({
          name,
          value,
          domain: '.facebook.com',
          path: '/',
          secure: true,
          httpOnly: name === 'xs',
        })),
      set: async ({ name, value }: { name: string; value: string }) => {
        cookieJar[name] = value;
        return { name, value };
      },
      remove: async ({ name }: { name: string }) => {
        delete cookieJar[name];
        return { name };
      },
    },
    tabs: {
      query: async () => [{ id: 1, url: 'https://www.facebook.com/' }],
      reload: async () => {},
      create: async () => ({ id: 2, status: 'complete' }),
      remove: async () => {},
      onUpdated: {
        addListener: (fn: any) => setTimeout(() => fn(2, { status: 'complete' }), 5),
        removeListener: () => {},
      },
      sendMessage: async () => ({
        success: true,
        status: 'success',
        statusCode: 'SUCCESS',
        autoJoined: true,
        joinStatus: 'joined',
        message: 'Đã tự tham gia nhóm & đăng bài thành công',
      }),
    },
    alarms: {
      create: async () => {},
      clear: async () => {},
      getAll: async () => [],
      onAlarm: { addListener: () => {} },
    },
    runtime: {
      id: 'gialong-fb-ext',
      sendMessage: async () => ({}),
      getURL: (p: string) => `chrome-extension://gialong-fb-ext/${p}`,
    },
  };

  const sandbox: Record<string, any> = {
    chrome: chromeMock,
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    Promise,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Map,
    Set,
    AbortController,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  for (const f of ['storage.js', 'spintax.js', 'accounts_manager.js', 'fb_runner.js', 'alarms_manager.js']) {
    vm.runInContext(fs.readFileSync(path.join(extDir, f), 'utf8'), sandbox, { filename: f });
  }

  const { SharedStorage, AccountsManager, FbRunner } = sandbox;

  // Bước 3.1: Chạy Migration kiểm tra bảo toàn dữ liệu cũ (Rule 2)
  await SharedStorage.runStorageMigrations();
  assert.equal(
    localStore.savedGroups[0].link,
    'https://www.facebook.com/groups/tuyendunghanoi/',
    'Migration phải chuẩn hoá link nhóm về https://www.facebook.com/groups/...'
  );
  assert.equal(localStore.scheduleSlots.length, 2, 'Migration phải đồng bộ 2 khung giờ từ savedTimes sang scheduleSlots');

  // Bước 3.2: Lưu 2 tài khoản kèm Két phiên (Session Vault)
  await AccountsManager.upsertAccount({
    id: '1000111111111',
    uid: '1000111111111',
    name: 'Nick Tuyển Dụng 01',
    status: 'active',
  });
  await AccountsManager.saveCurrentSessionToVault('1000111111111');

  cookieJar.c_user = '1000222222222';
  cookieJar.xs = 'xs_token_acc_2';
  await AccountsManager.upsertAccount({
    id: '1000222222222',
    uid: '1000222222222',
    name: 'Nick Tuyển Dụng 02',
    status: 'active',
  });
  await AccountsManager.saveCurrentSessionToVault('1000222222222');

  // Bước 3.3: Chuyển tự động từ Nick 02 về Nick 01 qua AccountSwitcher.switchTo
  const switchRes = await AccountsManager.switchTo('1000111111111');
  assert.equal(switchRes.ok, true, 'AccountSwitcher.switchTo phải chuyển phiên thành công sang Nick 01');
  assert.equal(cookieJar.c_user, '1000111111111', 'Cookie c_user sau khi switch phải là 1000111111111');

  // Bước 3.4: Ghi nhận lịch sử đăng bài có tự vào nhóm (Tính năng 1 + 2 + 3)
  await FbRunner.appendHistoryEntry({
    type: 'scheduled',
    slotId: 'slot_08_30',
    accountId: '1000111111111',
    groupName: localStore.savedGroups[0].name,
    groupLink: localStore.savedGroups[0].link,
    postTitle: localStore.savedPosts[0].title,
    status: 'success',
    statusCode: 'SUCCESS',
    autoJoined: true,
    joinStatus: 'joined',
    message: 'Đã tự vào nhóm & đăng bài thành công',
  });

  const filtered = SharedStorage.filterHistoryEntries(localStore.postHistory, {
    accountId: '1000111111111',
    status: 'autoJoined',
  });
  assert.equal(filtered.length, 1, 'Lọc lịch sử theo Nick 01 + Đã tự vào nhóm phải khớp 1 bản ghi');
  assert.equal(filtered[0].accountName, 'Nick Tuyển Dụng 01');

  const csvOut = SharedStorage.formatHistoryToCsv(filtered);
  assert.ok(csvOut.includes('"Nick Tuyển Dụng 01"'), 'Báo cáo CSV xuất ra phải có tên Nick Tuyển Dụng 01');
  assert.ok(csvOut.includes('"1000111111111"'), 'Báo cáo CSV xuất ra phải có UID 1000111111111');
  assert.ok(csvOut.includes('"Đã tự vào nhóm"'), 'Báo cáo CSV xuất ra phải có trạng thái Đã tự vào nhóm');

  console.log('✓ PASS: Luồng tích hợp E2E (Migration -> Đa tài khoản & Két phiên -> Tự chuyển Nick -> Tự vào nhóm -> Lịch sử & CSV) hoạt động hoàn hảo!');
  console.log('\n================================================================================');
  console.log('🎉 HOÀN TẤT KIỂM THỬ TỔNG HỢP GIAI ĐOẠN 6: TẤT CẢ CÁC HẠNG MỤC ĐỀU PASS 100%!');
  console.log('================================================================================');
}

runPhase6IntegrationSuite().catch((err) => {
  console.error('Lỗi kiểm thử tổng hợp Giai đoạn 6:', err);
  process.exit(1);
});
