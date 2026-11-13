import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function createChromeMock(initialLocal: Record<string, any> = {}) {
  const localStore: Record<string, any> = { ...initialLocal };
  const sessionStore: Record<string, any> = {};

  const chromeMock = {
    storage: {
      local: {
        get: (keys?: string | string[] | Record<string, any> | null, cb?: (res: any) => void) => {
          let res: Record<string, any> = {};
          if (!keys) {
            res = { ...localStore };
          } else if (typeof keys === 'string') {
            res = { [keys]: localStore[keys] };
          } else if (Array.isArray(keys)) {
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
        get: (keys?: string | string[] | null, cb?: (res: any) => void) => {
          let res: Record<string, any> = {};
          if (!keys) {
            res = { ...sessionStore };
          } else if (typeof keys === 'string') {
            res = { [keys]: sessionStore[keys] };
          } else {
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
        remove: (keys: string | string[], cb?: () => void) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const k of list) delete sessionStore[k];
          if (typeof cb === 'function') cb();
          return Promise.resolve();
        },
      },
      onChanged: {
        addListener: () => {},
      },
    },
    alarms: {
      create: async () => {},
      clear: async () => {},
      get: async () => null,
      getAll: async () => [],
      onAlarm: { addListener: () => {} },
    },
    tabs: {
      create: async () => ({ id: 101 }),
      update: async () => ({ id: 101 }),
      get: async () => ({ id: 101, status: 'complete' }),
      remove: async () => {},
      sendMessage: async () => ({ status: 'success' }),
      query: async () => [{ id: 101, url: 'https://www.facebook.com/' }],
    },
    cookies: {
      get: async () => ({ value: '100099887766' }),
      getAll: async () => [{ name: 'c_user', value: '100099887766', domain: '.facebook.com' }],
      set: async () => ({}),
      remove: async () => ({}),
    },
    runtime: {
      id: 'test-extension-id',
      sendMessage: async () => ({}),
      getURL: (p: string) => `chrome-extension://test-extension-id/${p}`,
    },
  };

  return { chromeMock, localStore, sessionStore };
}

async function runPhase5Tests() {
  console.log('=== BẮT ĐẦU KIỂM THỬ GIAI ĐOẠN 5 (LỊCH SỬ ĐĂNG BÀI THEO TÀI KHOẢN FB) ===');

  const extDir = path.resolve(process.cwd(), 'src/extension_files');
  const storageCode = fs.readFileSync(path.join(extDir, 'storage.js'), 'utf8');
  const accountsCode = fs.readFileSync(path.join(extDir, 'accounts_manager.js'), 'utf8');
  const runnerCode = fs.readFileSync(path.join(extDir, 'fb_runner.js'), 'utf8');
  const dashboardJsCode = fs.readFileSync(path.join(extDir, 'dashboard.js'), 'utf8');
  const popupJsCode = fs.readFileSync(path.join(extDir, 'popup.js'), 'utf8');

  const { chromeMock, localStore } = createChromeMock({
    fbAccounts: [
      {
        id: '1000111222333',
        uid: '1000111222333',
        fbUserId: '1000111222333',
        name: 'Nguyễn Văn A (HR Trưởng)',
        displayName: 'Nguyễn Văn A (HR Trưởng)',
        status: 'ok',
      },
      {
        id: '1000444555666',
        uid: '1000444555666',
        fbUserId: '1000444555666',
        name: 'Trần Thị B (Tuyển Dụng)',
        displayName: 'Trần Thị B (Tuyển Dụng)',
        status: 'ok',
      },
    ],
    activeAccountId: '1000111222333',
    postHistory: [],
  });

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
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.window = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(storageCode, sandbox, { filename: 'storage.js' });
  vm.runInContext(accountsCode, sandbox, { filename: 'accounts_manager.js' });
  vm.runInContext(runnerCode, sandbox, { filename: 'fb_runner.js' });

  const { SharedStorage, FbRunner } = sandbox;
  assert.ok(SharedStorage, 'SharedStorage phải được khởi tạo');
  assert.ok(FbRunner, 'FbRunner phải được khởi tạo');

  // TEST 1: FbRunner.appendHistoryEntry tự động điền thông tin tài khoản FB từ activeAccountId / fbAccounts
  console.log('1. Kiểm tra FbRunner.appendHistoryEntry tự động gắn thông tin tài khoản FB (accountId, accountUid, accountName)...');
  const entry1 = await FbRunner.appendHistoryEntry({
    type: 'manual',
    groupName: 'Hội Việc Làm Hà Nội',
    groupLink: 'https://www.facebook.com/groups/vieclamhanoi',
    postTitle: 'Tuyển Nhân Viên Kinh Doanh',
    status: 'success',
    message: 'Đăng thành công (đã tự tham gia nhóm)',
    autoJoined: true,
    joinStatus: 'joined',
  });

  assert.equal(entry1.accountId, '1000111222333', 'Phải tự lấy activeAccountId khi entry chưa truyền accountId');
  assert.equal(entry1.accountUid, '1000111222333', 'Phải tự điền accountUid từ fbAccounts');
  assert.equal(entry1.accountName, 'Nguyễn Văn A (HR Trưởng)', 'Phải tự điền accountName từ fbAccounts');
  assert.equal(entry1.autoJoined, true, 'Phải lưu cờ autoJoined = true');
  assert.equal(entry1.joinStatus, 'joined', 'Phải lưu joinStatus = joined');

  // Thêm bản ghi thứ 2 với tài khoản thứ 2 (chạy hẹn giờ theo slotId)
  const entry2 = await FbRunner.appendHistoryEntry({
    type: 'scheduled',
    slotId: 'slot_0830',
    accountId: '1000444555666',
    groupName: 'Chợ Tuyển Dụng TP.HCM "VIP"',
    groupLink: 'https://www.facebook.com/groups/tuyendunghcm',
    postTitle: 'Tuyển Kế Toán Nội Bộ',
    status: 'uncertain',
    message: 'Chưa xác nhận được bài mới trên đầu nhóm',
    autoJoined: false,
  });

  assert.equal(entry2.accountId, '1000444555666');
  assert.equal(entry2.accountUid, '1000444555666');
  assert.equal(entry2.accountName, 'Trần Thị B (Tuyển Dụng)');
  assert.equal(entry2.slotId, 'slot_0830');
  assert.equal(entry2.status, 'uncertain');

  // Thêm bản ghi thứ 3 (thất bại)
  const entry3 = await FbRunner.appendHistoryEntry({
    type: 'scheduled',
    slotId: 'slot_1130',
    accountId: '1000111222333',
    groupName: 'Nhóm Cần Câu Hỏi Duyệt',
    groupLink: 'https://www.facebook.com/groups/nhomcauhoi',
    postTitle: 'Tuyển Nhân Viên Kinh Doanh',
    status: 'failed',
    message: 'Nhóm yêu cầu trả lời câu hỏi tham gia',
    autoJoined: false,
    joinStatus: 'questions_required',
  });
  assert.equal(entry3.status, 'failed');

  const currentHistory = localStore.postHistory;
  assert.equal(currentHistory.length, 3, 'Lịch sử phải có đúng 3 bản ghi');
  console.log('   -> OK: Đã lưu đầy đủ thông tin tài khoản FB, trạng thái tự vào nhóm và khung giờ.');

  // TEST 2: Kiểm tra bộ lọc lịch sử SharedStorage.filterHistoryEntries
  console.log('2. Kiểm tra SharedStorage.filterHistoryEntries (lọc theo Tài khoản, Trạng thái, Loại chạy, Từ khoá)...');
  const byAcc1 = SharedStorage.filterHistoryEntries(currentHistory, { accountId: '1000111222333' });
  assert.equal(byAcc1.length, 2, 'Nick Nguyễn Văn A phải có 2 bản ghi');

  const byAcc2 = SharedStorage.filterHistoryEntries(currentHistory, { accountId: '1000444555666' });
  assert.equal(byAcc2.length, 1, 'Nick Trần Thị B phải có 1 bản ghi');
  assert.equal(byAcc2[0].groupName, 'Chợ Tuyển Dụng TP.HCM "VIP"');

  const byStatusUncertain = SharedStorage.filterHistoryEntries(currentHistory, { status: 'uncertain' });
  assert.equal(byStatusUncertain.length, 1, 'Lọc trạng thái uncertain phải trả về 1 bản ghi');

  const byAutoJoined = SharedStorage.filterHistoryEntries(currentHistory, { status: 'autoJoined' });
  assert.equal(byAutoJoined.length, 1, 'Lọc trạng thái autoJoined phải trả về 1 bản ghi');
  assert.equal(byAutoJoined[0].groupName, 'Hội Việc Làm Hà Nội');

  const byTypeScheduled = SharedStorage.filterHistoryEntries(currentHistory, { type: 'scheduled' });
  assert.equal(byTypeScheduled.length, 2, 'Lọc loại scheduled phải trả về 2 bản ghi');

  const byKeyword = SharedStorage.filterHistoryEntries(currentHistory, { keyword: 'Kế Toán Nội Bộ' });
  assert.equal(byKeyword.length, 1, 'Tìm theo từ khoá tiêu đề bài viết phải trả về 1 bản ghi');
  console.log('   -> OK: Bộ lọc lịch sử hoạt động chính xác trên mọi tiêu chí.');

  // TEST 3: Kiểm tra xuất CSV (SharedStorage.formatHistoryToCsv)
  console.log('3. Kiểm tra SharedStorage.formatHistoryToCsv (UTF-8 BOM, 13 cột, escape dấu ngoặc kép)...');
  const csv = SharedStorage.formatHistoryToCsv(currentHistory);
  assert.ok(csv.startsWith('\uFEFFSTT,Thời Gian,Loại Chạy,Khung Giờ,Tên Tài Khoản FB,UID / Mã Nick,Tên Nhóm,Link Nhóm,Tiêu Đề Bài Viết,Trạng Thái,Mã Trạng Thái,Tự Vào Nhóm,Chi Tiết\n'));
  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 4, 'CSV phải gồm 1 dòng tiêu đề + 3 dòng dữ liệu');
  assert.ok(csv.includes('"Nguyễn Văn A (HR Trưởng)"'), 'CSV phải chứa tên tài khoản FB 1');
  assert.ok(csv.includes('"Trần Thị B (Tuyển Dụng)"'), 'CSV phải chứa tên tài khoản FB 2');
  assert.ok(csv.includes('"Chợ Tuyển Dụng TP.HCM ""VIP"""'), 'CSV phải escape đúng dấu ngoặc kép trong tên nhóm');
  assert.ok(csv.includes('"Đã tự vào nhóm"'), 'CSV phải hiển thị cột Tự Vào Nhóm');
  console.log('   -> OK: Xuất CSV chuẩn UTF-8 BOM và đầy đủ cột tài khoản FB.');

  // TEST 4: Kiểm tra giới hạn 1.000 bản ghi & tuần tự hoá mutex
  console.log('4. Kiểm tra giới hạn 1.000 bản ghi lịch sử khi ghi hàng loạt qua hàng đợi tuần tự...');
  const seed1000 = Array.from({ length: 998 }, (_, idx) => ({
    id: `seed_${idx}`,
    timestamp: Date.now() - idx * 1000,
    type: 'manual',
    accountId: '1000111222333',
    accountUid: '1000111222333',
    accountName: 'Nguyễn Văn A (HR Trưởng)',
    groupName: `Nhóm Seed ${idx}`,
    groupLink: `https://www.facebook.com/groups/seed${idx}`,
    postTitle: 'Bài Seed',
    status: 'success',
    message: 'OK',
  }));
  await chromeMock.storage.local.set({ postHistory: seed1000 });

  await Promise.all([
    FbRunner.appendHistoryEntry({ groupName: 'Nhóm Mới 1', status: 'success' }),
    FbRunner.appendHistoryEntry({ groupName: 'Nhóm Mới 2', status: 'success' }),
    FbRunner.appendHistoryEntry({ groupName: 'Nhóm Mới 3', status: 'success' }),
    FbRunner.appendHistoryEntry({ groupName: 'Nhóm Mới 4', status: 'success' }),
  ]);

  assert.equal(localStore.postHistory.length, 1000, 'Lịch sử phải giữ đúng tối đa 1.000 bản ghi (cắt bản cũ nhất)');
  assert.equal(localStore.postHistory[0].groupName, 'Nhóm Mới 4', 'Bản ghi mới nhất phải nằm đầu danh sách');
  console.log('   -> OK: Hàng đợi tuần tự bảo toàn thứ tự và giới hạn đúng 1.000 bản ghi.');

  // TEST 5: Kiểm tra Rule 5 trong dashboard.js & popup.js (không dùng innerHTML khi render lịch sử)
  console.log('5. Kiểm tra Rule 5 (textContent & kiểm tra link nhóm https://www.facebook.com/groups/) trong dashboard.js và popup.js...');
  const dashHistoryBlock = dashboardJsCode.slice(
    dashboardJsCode.indexOf('async function renderHistory()'),
    dashboardJsCode.indexOf('btnClearHistory?.addEventListener')
  );
  assert.ok(dashHistoryBlock.length > 100, 'Phải tìm thấy hàm renderHistory trong dashboard.js');
  assert.equal(dashHistoryBlock.includes('.innerHTML'), false, 'renderHistory trong dashboard.js tuyệt đối không được dùng innerHTML');
  assert.ok(dashHistoryBlock.includes("startsWith('https://www.facebook.com/groups/')"), 'renderHistory phải kiểm tra link nhóm bắt đầu bằng https://www.facebook.com/groups/');

  const popupHistoryBlock = popupJsCode.slice(
    popupJsCode.indexOf('async function renderPopupHistory()'),
    popupJsCode.indexOf('btnPopupClearHistory?.addEventListener')
  );
  assert.ok(popupHistoryBlock.length > 100, 'Phải tìm thấy hàm renderPopupHistory trong popup.js');
  assert.equal(popupHistoryBlock.includes('.innerHTML'), false, 'renderPopupHistory trong popup.js tuyệt đối không được dùng innerHTML');
  assert.ok(popupHistoryBlock.includes("startsWith('https://www.facebook.com/groups/')"), 'renderPopupHistory phải kiểm tra link nhóm bắt đầu bằng https://www.facebook.com/groups/');
  console.log('   -> OK: Cả dashboard.js và popup.js đều tuân thủ tuyệt đối Rule 5.');

  console.log('=== TẤT CẢ 5 BÀI TEST TỰ ĐỘNG GIAI ĐOẠN 5 ĐỀU THÀNH CÔNG (PASS 100%) ===');
}

runPhase5Tests().catch((err) => {
  console.error('Lỗi kiểm thử Giai đoạn 5:', err);
  process.exit(1);
});
