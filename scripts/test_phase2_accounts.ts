import assert from 'assert';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Mock chrome.storage.local & session
const mockLocalStore: Record<string, any> = {};
const mockSessionStore: Record<string, any> = {};

(globalThis as any).chrome = {
  storage: {
    local: {
      get: (keys: string | string[] | null, cb?: (res: any) => void) => {
        const res: Record<string, any> = {};
        if (keys === null) {
          Object.assign(res, mockLocalStore);
        } else if (typeof keys === 'string') {
          if (keys in mockLocalStore) res[keys] = mockLocalStore[keys];
        } else if (Array.isArray(keys)) {
          for (const k of keys) {
            if (k in mockLocalStore) res[k] = mockLocalStore[k];
          }
        }
        if (cb) cb(res);
        return Promise.resolve(res);
      },
      set: (items: Record<string, any>, cb?: () => void) => {
        Object.assign(mockLocalStore, items);
        if (cb) cb();
        return Promise.resolve();
      },
      remove: (keys: string | string[], cb?: () => void) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete mockLocalStore[k];
        if (cb) cb();
        return Promise.resolve();
      }
    },
    session: {
      get: (keys: string | string[] | null, cb?: (res: any) => void) => {
        const res: Record<string, any> = {};
        if (typeof keys === 'string') {
          if (keys in mockSessionStore) res[keys] = mockSessionStore[keys];
        } else if (Array.isArray(keys)) {
          for (const k of keys) {
            if (k in mockSessionStore) res[k] = mockSessionStore[k];
          }
        }
        if (cb) cb(res);
        return Promise.resolve(res);
      },
      set: (items: Record<string, any>, cb?: () => void) => {
        Object.assign(mockSessionStore, items);
        if (cb) cb();
        return Promise.resolve();
      },
      remove: (keys: string | string[], cb?: () => void) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete mockSessionStore[k];
        if (cb) cb();
        return Promise.resolve();
      }
    }
  },
  alarms: {
    create: () => Promise.resolve(),
    clear: () => Promise.resolve()
  }
};

const SharedStorage = require('../src/extension_files/storage.js');
(globalThis as any).SharedStorage = SharedStorage;

const SpintaxEngine = require('../src/extension_files/spintax.js');
(globalThis as any).SpintaxEngine = SpintaxEngine;

const AccountsManager = require('../src/extension_files/accounts_manager.js');
(globalThis as any).AccountsManager = AccountsManager;

const FbRunner = require('../src/extension_files/fb_runner.js');

async function runPhase2Tests() {
  console.log('=== BẮT ĐẦU KIỂM THỬ GIAI ĐOẠN 2 (QUẢN LÝ TÀI KHOẢN FACEBOOK) ===');

  // 1. Test Storage Migrations for fbAccounts & activeAccountId
  await SharedStorage.runStorageMigrations();
  const initAccounts = await AccountsManager.getAccounts();
  assert.strictEqual(Array.isArray(initAccounts), true, 'fbAccounts phải là mảng sau migrate');
  console.log('✓ 1. Migrate fbAccounts & activeAccountId thành công');

  // 2. Test Upsert Accounts (Account A & Account B)
  const resA = await AccountsManager.upsertAccount({
    uid: '100011111111111',
    name: 'Nguyễn Văn A',
    avatar: 'https://www.facebook.com/avatarA.jpg'
  });
  const accA = resA.account;
  assert.strictEqual(accA.uid, '100011111111111');
  assert.strictEqual(accA.name, 'Nguyễn Văn A');

  // Active account should automatically be set to first account
  const active1 = await AccountsManager.getActiveAccount();
  assert.strictEqual(active1.id, accA.id, 'Tài khoản đầu tiên tự động thành activeAccount');

  const resB = await AccountsManager.upsertAccount({
    uid: '100022222222222',
    name: 'Trần Thị B',
    avatar: 'https://www.facebook.com/avatarB.jpg'
  });
  const accB = resB.account;
  assert.strictEqual(accB.uid, '100022222222222');

  const listAfterAdd = await AccountsManager.getAccounts();
  assert.strictEqual(listAfterAdd.length, 2, 'Phải có đúng 2 tài khoản');

  // Upsert existing UID updates name without duplicating
  const resAUpdated = await AccountsManager.upsertAccount({
    uid: '100011111111111',
    name: 'Nguyễn Văn A (Đã Đổi Tên)'
  });
  assert.strictEqual(resAUpdated.account.name, 'Nguyễn Văn A (Đã Đổi Tên)');
  const listAfterUpdate = await AccountsManager.getAccounts();
  assert.strictEqual(listAfterUpdate.length, 2, 'Không được tạo trùng tài khoản cùng UID');
  console.log('✓ 2. Thêm mới, cập nhật theo UID và tự chọn tài khoản active thành công');

  // 3. Test Per-Account Cooldown Isolation (Độc lập thời gian nghỉ giữa các tài khoản)
  await AccountsManager.setAccountStatus(accA.id, 'rate_limited', {
    cooldownMs: 4 * 3600 * 1000,
    reason: 'Bị chặn đăng bài tạm thời trên nhóm'
  });

  const allAccs = await AccountsManager.getAccounts();
  const accAAfterLimit = allAccs.find((a: any) => a.id === accA.id);
  const accBAfterLimit = allAccs.find((a: any) => a.id === accB.id);

  assert.strictEqual(AccountsManager.isAccountCoolingDown(accAAfterLimit).isCoolingDown, true, 'Tài khoản A phải đang trong trạng thái nghỉ (cooldown)');
  assert.strictEqual(accAAfterLimit.status, 'rate_limited');
  assert.strictEqual(AccountsManager.isAccountCoolingDown(accBAfterLimit).isCoolingDown, false, 'Tài khoản B phải hoàn toàn độc lập và Sẵn sàng');
  assert.strictEqual(accBAfterLimit.status, 'active');
  console.log('✓ 3. Cooldown theo từng tài khoản độc lập hoàn toàn (A bị hạn chế, B vẫn sẵn sàng)');

  // 4. Test FbRunner blocks starting batch when activeAccount is cooling down
  let blockedError = '';
  try {
    await FbRunner.startBatchPosting({
      accountId: accA.id,
      accountName: accA.name,
      groups: [{ id: 'g1', name: 'Nhóm 1', link: 'https://www.facebook.com/groups/123456' }],
      content: 'Tuyển dụng nhân viên',
      delaySec: 30
    });
  } catch (err: any) {
    blockedError = err.message || '';
  }
  assert.ok(blockedError.includes('đang bị giới hạn tần suất'), 'Runner phải từ chối chạy khi tài khoản A đang nghỉ cooldown');
  console.log('✓ 4. FbRunner chặn chạy khi tài khoản đang chọn bị cooldown');

  // 5. Switch active account to B and verify FbRunner runs & records accountId/accountName in postHistory
  await AccountsManager.setActiveAccount(accB.id);
  const currentActive = await AccountsManager.getActiveAccount();
  assert.strictEqual(currentActive.id, accB.id);

  await FbRunner.startBatchPosting({
    accountId: accB.id,
    accountName: accB.name,
    groups: [{ id: 'g1', name: 'Nhóm Tuyển Dụng HN', link: 'https://www.facebook.com/groups/123456' }],
    content: 'Tuyển gấp nhân sự đi làm ngay',
    delaySec: 30,
  });

  await new Promise((r) => setTimeout(r, 120));

  const historySt = await SharedStorage.getState('postHistory');
  const history = historySt.postHistory || [];
  assert.ok(history.length > 0, 'Phải có bản ghi lịch sử');
  assert.strictEqual(history[0].accountId, accB.id, 'Lịch sử phải lưu đúng accountId của tài khoản B');
  assert.strictEqual(history[0].accountName, 'Trần Thị B', 'Lịch sử phải lưu đúng tên tài khoản B');
  console.log('✓ 5. Chuyển sang tài khoản B chạy thành công và ghi đúng tên tài khoản vào lịch sử');

  // 6. Test clear cooldown & remove account
  await AccountsManager.setAccountStatus(accA.id, 'active', { reason: null });
  const allAfterClear = await AccountsManager.getAccounts();
  const accACleared = allAfterClear.find((a: any) => a.id === accA.id);
  assert.strictEqual(AccountsManager.isAccountCoolingDown(accACleared).isCoolingDown, false, 'Tài khoản A sau khi xóa cooldown phải sẵn sàng');

  await AccountsManager.removeAccount(accB.id);
  const remaining = await AccountsManager.getAccounts();
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(remaining[0].id, accA.id);
  const activeAfterRemove = await AccountsManager.getActiveAccount();
  assert.strictEqual(activeAfterRemove.id, accA.id, 'Sau khi xóa B, activeAccount phải tự chuyển về A');
  console.log('✓ 6. Xóa cooldown và xóa tài khoản tự động cập nhật activeAccount thành công');

  console.log('=== TẤT CẢ TEST GIAI ĐOẠN 2 ĐỀU PASS 100% ===');
}

runPhase2Tests().catch((err) => {
  console.error('TEST GIAI ĐOẠN 2 THẤT BẠI:', err);
  process.exit(1);
});
