import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const Spintax = require('../src/extension_files/spintax.js');

// 2. Mock chrome.storage.local cho storage.js
const mockStorage: Record<string, any> = {};
(global as any).chrome = {
  storage: {
    local: {
      get: (keys: any, cb: (res: any) => void) => {
        if (!keys) return cb({ ...mockStorage });
        if (typeof keys === 'string') return cb({ [keys]: mockStorage[keys] });
        if (Array.isArray(keys)) {
          const res: Record<string, any> = {};
          for (const k of keys) res[k] = mockStorage[k];
          return cb(res);
        }
        cb({ ...mockStorage });
      },
      set: (data: Record<string, any>, cb: () => void) => {
        Object.assign(mockStorage, data);
        if (cb) cb();
      },
    },
  },
  runtime: {
    lastError: null,
  },
};

const SharedStorage = require('../src/extension_files/storage.js');
const FbRunner = require('../src/extension_files/fb_runner.js');

async function runTests() {
  console.log('=== BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG GIAI ĐOẠN 1 ===\n');

  // Test 1: Spintax Validator - Độ sâu hợp lệ
  console.log('Test 1: Spintax hợp lệ độ sâu 1..3');
  const valid1 = Spintax.validateSpintax('{Xin chào|Hello|Chào bạn}');
  assert.strictEqual(valid1.valid, true);
  assert.strictEqual(valid1.maxDepth, 1);

  const validNested = Spintax.validateSpintax('{Chào {anh|chị}|{Hi|Hello} cả nhà}');
  assert.strictEqual(validNested.valid, true);
  assert.strictEqual(validNested.maxDepth, 2);
  console.log('  ✓ PASS: Spintax hợp lệ kiểm tra thành công');

  // Test 2: Spintax Validator - Lỗi vượt quá 5 tầng
  console.log('Test 2: Từ chối Spintax lồng quá 5 tầng');
  const deepSpintax = '{1|{2|{3|{4|{5|{6|7}}}}}}';
  const deepRes = Spintax.validateSpintax(deepSpintax);
  assert.strictEqual(deepRes.valid, false);
  assert.ok(deepRes.error.includes('quá sâu'));
  console.log('  ✓ PASS: Đã chặn thành công Spintax vượt quá 5 tầng');

  // Test 3: Spintax Validator - Lỗi cú pháp ngoặc và pipe rỗng
  console.log('Test 3: Phát hiện lỗi cú pháp ngoặc và empty pipes');
  const unclosed = Spintax.validateSpintax('{Xin chào|Chào bạn');
  assert.strictEqual(unclosed.valid, false);
  assert.ok(unclosed.error.includes('chưa được đóng'));

  const emptyPipe = Spintax.validateSpintax('{Tuyển dụng||Việc làm}');
  assert.strictEqual(emptyPipe.valid, false);
  assert.ok(emptyPipe.error.includes('||'));

  const pipeStart = Spintax.validateSpintax('{|}');
  assert.strictEqual(pipeStart.valid, false);
  console.log('  ✓ PASS: Đã phát hiện chính xác các lỗi cú pháp Spintax');

  // Test 4: Spintax Sampling - Chống lặp vô hạn và tính ngẫu nhiên
  console.log('Test 4: Đảo Spintax an toàn');
  const sample1 = Spintax.sampleSpintax('{Hà Nội|Đà Nẵng|TP.HCM}');
  assert.ok(['Hà Nội', 'Đà Nẵng', 'TP.HCM'].includes(sample1));
  console.log('  ✓ PASS: Đảo Spintax trả về kết quả thuộc tập lựa chọn:', sample1);

  // Test 5: Chuẩn hóa URL nhóm Facebook
  console.log('Test 5: Chuẩn hóa link nhóm Facebook');
  const testCases = [
    { input: 'https://www.facebook.com/groups/tuyendungtoanquoc/permalink/123456/', expected: 'https://www.facebook.com/groups/tuyendungtoanquoc/' },
    { input: 'https://m.facebook.com/groups/1092837465?ref=share', expected: 'https://www.facebook.com/groups/1092837465/' },
    { input: 'facebook.com/groups/vieclam24h/members/', expected: 'https://www.facebook.com/groups/vieclam24h/' },
    { input: 'groups/it_jobs_vietnam', expected: 'https://www.facebook.com/groups/it_jobs_vietnam/' },
  ];

  for (const tc of testCases) {
    const norm = SharedStorage.normalizeGroupUrl(tc.input);
    assert.strictEqual(norm, tc.expected);
  }
  console.log('  ✓ PASS: Chuẩn hóa toàn bộ các định dạng URL nhóm về link chuẩn');

  // Test 6: Storage Sequential Queue & Revision Counter
  console.log('Test 6: Storage patch có hàng đợi tuần tự và _rev tăng dần');
  mockStorage.savedGroups = [];
  mockStorage._rev_savedGroups = 0;

  // Thực hiện đồng thời 3 bản vá liên tiếp
  const p1 = SharedStorage.patch('savedGroups', (list: any[]) => [...list, { id: 1, name: 'Nhóm 1' }]);
  const p2 = SharedStorage.patch('savedGroups', (list: any[]) => [...list, { id: 2, name: 'Nhóm 2' }]);
  const p3 = SharedStorage.patch('savedGroups', (list: any[]) => [...list, { id: 3, name: 'Nhóm 3' }]);

  await Promise.all([p1, p2, p3]);

  assert.strictEqual(mockStorage.savedGroups.length, 3);
  assert.strictEqual(mockStorage.savedGroups[0].name, 'Nhóm 1');
  assert.strictEqual(mockStorage.savedGroups[1].name, 'Nhóm 2');
  assert.strictEqual(mockStorage.savedGroups[2].name, 'Nhóm 3');
  assert.strictEqual(mockStorage._rev_savedGroups, 3);
  console.log('  ✓ PASS: Hàng đợi tuần tự bảo vệ tính toàn vẹn và rev counter (_rev = 3)');

  // Test 7: Surgical patchItem
  console.log('Test 7: Cập nhật phẫu thuật patchItem theo ID');
  await SharedStorage.patchItem('savedGroups', 'id', 2, (item: any) => ({
    status: 'Đã đăng thành công',
    members: '150,000',
  }));

  assert.strictEqual(mockStorage.savedGroups[1].status, 'Đã đăng thành công');
  assert.strictEqual(mockStorage.savedGroups[1].members, '150,000');
  assert.strictEqual(mockStorage.savedGroups[0].name, 'Nhóm 1');
  assert.strictEqual(mockStorage.savedGroups[2].name, 'Nhóm 3');
  console.log('  ✓ PASS: patchItem cập nhật đúng phần tử mà không gây mất mát dữ liệu');

  // Test 8: Abortable Sleep in FbRunner
  console.log('Test 8: Abortable sleep phản hồi tức thì với AbortController');
  const ac = new AbortController();
  const start = Date.now();
  setTimeout(() => ac.abort(), 100);

  let aborted = false;
  try {
    await FbRunner.abortableSleep(5000, ac.signal);
  } catch (err: any) {
    if (err.message === 'ABORTED') aborted = true;
  }
  const elapsed = Date.now() - start;
  assert.strictEqual(aborted, true);
  assert.ok(elapsed < 1000, `Ngủ bị hủy ngay trong ${elapsed}ms thay vì chờ đủ 5000ms`);
  console.log(`  ✓ PASS: Abortable sleep phản hồi dừng lập tức (${elapsed}ms)`);

  // Test 9: Bảo mật ô nhập mật khẩu Admin trong App.tsx (chống browser save pass / autofill)
  console.log('Test 9: Kiểm tra mã App.tsx chống tự lưu mật khẩu Admin');
  const appSrc = fs.readFileSync(path.join(__dirname, '../src/App.tsx'), 'utf-8');
  assert.ok(appSrc.includes('WebkitTextSecurity'), 'App.tsx phải dùng WebkitTextSecurity để che dấu text thay vì type=password');
  assert.ok(appSrc.includes('autoComplete="off"'), 'App.tsx phải tắt autocomplete');
  assert.ok(appSrc.includes('data-form-type="other"'), 'App.tsx phải ngăn trình duyệt nhận diện form đăng nhập');
  console.log('  ✓ PASS: App.tsx được bảo vệ chống tự lưu khóa quản trị');

  console.log('\n=== TẤT CẢ 9/9 BÀI KIỂM THỬ GIAI ĐOẠN 1 ĐỀU ĐẠT (PASS) ===');
}

runTests().catch((err) => {
  console.error('LỖI TEST GIAI ĐOẠN 1:', err);
  process.exit(1);
});
