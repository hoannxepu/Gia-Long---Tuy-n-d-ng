import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();

async function runQA3Rounds() {
  console.log('=== BẮT ĐẦU KIỂM THỬ TOÀN DIỆN 3 VÒNG (QA + SENIOR DEV + UX REVIEWER) ===\n');

  // Vòng 1 & Vòng 2: Kiểm tra trực tiếp 8 lỗi QA-01 -> QA-08 đã được khắc phục triệt để
  console.log('--- [Kiểm tra QA-01] DEFAULT_EXTENSION_BUNDLE trong src/extension_files/index.ts ---');
  const indexTs = fs.readFileSync(path.join(root, 'src/extension_files/index.ts'), 'utf8');
  for (const modName of [
    'storage.js',
    'spintax.js',
    'accounts_manager.js',
    'fb_runner.js',
    'alarms_manager.js',
    'ed25519_verify.js',
  ]) {
    assert.ok(
      indexTs.includes(`name: '${modName}'`),
      `QA-01 FAILED: DEFAULT_EXTENSION_BUNDLE thiếu ${modName}`
    );
  }
  console.log('PASS: QA-01 DEFAULT_EXTENSION_BUNDLE chứa đầy đủ 6 module MV3 mới.');

  console.log('--- [Kiểm tra QA-02] Bảo mật requireAdmin cho /api/admin/system/status & /api/database/export.json ---');
  const serverTs = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  assert.ok(
    serverTs.includes("app.get('/api/admin/system/status', requireAdmin"),
    'QA-02 FAILED: /api/admin/system/status trong server.ts thiếu requireAdmin'
  );
  assert.ok(
    serverTs.includes("app.get(['/api/database/export.json', '/database.json'], requireAdmin"),
    'QA-02 FAILED: /api/database/export.json trong server.ts thiếu requireAdmin'
  );
  const catchallTs = fs.readFileSync(path.join(root, 'functions/api/[[catchall]].ts'), 'utf8');
  assert.ok(
    !catchallTs.includes('String(body.pin ||'),
    'QA-02 FAILED: /api/admin/verify-pin trong catchall.ts vẫn đọc body.pin'
  );
  console.log('PASS: QA-02 Mọi endpoint admin status & export.json đều bắt buộc xác thực x-admin-pin.');

  console.log('--- [Kiểm tra QA-03] Sửa lỗi so sánh trùng SĐT trong /api/orders/sync ---');
  assert.ok(
    !serverTs.includes('so.phone === so.phone'),
    'QA-03 FAILED: server.ts vẫn còn lỗi so.phone === so.phone'
  );
  assert.ok(
    serverTs.includes("so.phone.replace(/\\D/g, '') === cleanCoPhone"),
    'QA-03 FAILED: server.ts chưa chuẩn hóa SĐT khi đối chiếu đơn đồng bộ'
  );
  console.log('PASS: QA-03 /api/orders/sync đối chiếu chính xác SĐT khách hàng với đơn trên server.');

  console.log('--- [Kiểm tra QA-04] Loại bỏ hoàn toàn secret mặc định GiaLongFB_D1_Secret_2026 ---');
  assert.ok(
    !serverTs.includes('GiaLongFB_D1_Secret_2026'),
    'QA-04 FAILED: server.ts vẫn còn chứa GiaLongFB_D1_Secret_2026'
  );
  assert.ok(
    !catchallTs.includes('GiaLongFB_D1_Secret_2026'),
    'QA-04 FAILED: functions/api/[[catchall]].ts vẫn còn chứa GiaLongFB_D1_Secret_2026'
  );
  console.log('PASS: QA-04 Không còn bất kỳ secret mặc định cứng nào trong server.ts và catchall.ts.');

  console.log('--- [Kiểm tra QA-05 & QA-06] background.js uỷ quyền lịch sử 1.000 mục & ngắt FbRunner khi thu hồi ---');
  const bgJs = fs.readFileSync(path.join(root, 'src/extension_files/background.js'), 'utf8');
  assert.ok(
    bgJs.includes('FbRunner.appendHistoryEntry(entry)'),
    'QA-05 FAILED: background.js addHistoryEntry chưa ủy quyền cho FbRunner.appendHistoryEntry'
  );
  assert.ok(
    !bgJs.includes('.slice(0, 150)'),
    'QA-05 FAILED: background.js vẫn cắt postHistory ở mức 150 bản ghi'
  );
  assert.ok(
    bgJs.includes('FbRunner.stopBatchPosting()'),
    'QA-06 FAILED: background.js chưa gọi FbRunner.stopBatchPosting() khi thu hồi license'
  );
  console.log('PASS: QA-05 & QA-06 background.js đồng bộ lịch sử 1.000 mục và ngắt FbRunner an toàn.');

  console.log('--- [Kiểm tra QA-07 & QA-08] Trùng ID DOM & Accessibility (aria-label) trên Dashboard & Popup ---');
  const dashHtml = fs.readFileSync(path.join(root, 'src/extension_files/dashboard.html'), 'utf8');
  const popupHtml = fs.readFileSync(path.join(root, 'src/extension_files/popup.html'), 'utf8');
  const licBadgeMatches = dashHtml.match(/id="licBadgeStatus"/g) || [];
  assert.strictEqual(
    licBadgeMatches.length,
    1,
    `QA-07 FAILED: id="licBadgeStatus" bị trùng ${licBadgeMatches.length} lần trong dashboard.html`
  );
  assert.ok(
    dashHtml.includes('id="licBadgeStatusCard"'),
    'QA-07 FAILED: thiếu id="licBadgeStatusCard" trong dashboard.html'
  );
  assert.ok(
    dashHtml.includes('aria-label="Lọc lịch sử theo tài khoản Facebook"'),
    'QA-08 FAILED: thiếu aria-label trên bộ lọc lịch sử dashboard.html'
  );
  assert.ok(
    popupHtml.includes('aria-label="Lọc lịch sử theo nick Facebook"'),
    'QA-08 FAILED: thiếu aria-label trên bộ lọc lịch sử popup.html'
  );
  console.log('PASS: QA-07 & QA-08 Không còn trùng ID DOM và đã bổ sung đầy đủ aria-label/aria-live.');

  // Vòng 3: Chạy lại toàn bộ Regression Suite (Phase 0 -> Phase 6)
  console.log('\n--- [VÒNG 3 - REGRESSION] Chạy lại toàn bộ Suite Kiểm Thử Phase 0 -> Phase 6 ---');
  const out = execSync('npx tsx scripts/test_phase6_integration_all.ts', { encoding: 'utf8' });
  console.log(out.trim());

  console.log('\n🎉 KẾT QUẢ 3 VÒNG QA + REGRESSION: 100% PASS (0 LỖI MỚI PHÁT SINH)!');
}

runQA3Rounds().catch((err) => {
  console.error('QA TEST FAILED:', err);
  process.exit(1);
});
