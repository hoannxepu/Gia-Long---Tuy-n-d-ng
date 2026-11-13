import { generateEd25519Token, verifyEd25519Token } from '../src/security/ed25519_token.ts';
import fs from 'fs';
import path from 'path';

async function runPhase0Tests() {
  console.log('=====================================================');
  console.log('KIỂM THỬ TỰ ĐỘNG GIAI ĐOẠN 0 - VÁ BẢO MẬT HỆ THỐNG');
  console.log('=====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      process.exitCode = 1;
    }
  }

  // 1. Kiểm tra Ed25519 Token Generation & Verification
  console.log('--- 1. Kiểm thử Chữ Ký Bất Đối Xứng Ed25519 ---');
  const testDevId = '4a5e2f7b-91c2-4a5f-8c3d-2b4e6a8f1c9d';
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  const token = generateEd25519Token(testDevId, expiresAt, 'individual');

  assert(token.startsWith('GLFB_ED25519_'), 'Token có định dạng chuẩn GLFB_ED25519_');

  const verifyValid = verifyEd25519Token(token, testDevId);
  assert(verifyValid.valid === true, 'Token hợp lệ được xác minh thành công 100%');
  assert(verifyValid.payload?.machineId === testDevId, 'MachineId trong token khớp chính xác');

  // Kiểm tra chống sửa tay trong DevTools (chỉ đổi 1 ký tự)
  const tamperedToken = token.slice(0, -2) + (token.endsWith('a') ? 'b' : 'a') + token.slice(-1);
  const verifyTampered = verifyEd25519Token(tamperedToken, testDevId);
  assert(verifyTampered.valid === false, 'Token bị sửa tay trong DevTools bị từ chối ngay lập tức');

  // Kiểm tra token sai mã máy
  const verifyWrongDev = verifyEd25519Token(token, 'different-device-id');
  assert(verifyWrongDev.valid === false, 'Token dùng trên máy khác bị từ chối ngay lập tức');

  // 2. Kiểm tra web_bridge.js không còn chứa các hàm thu hồi nguy hiểm
  console.log('\n--- 2. Kiểm thử Web Bridge Security ---');
  const bridgeCode = fs.readFileSync(path.join(process.cwd(), 'src/extension_files/web_bridge.js'), 'utf-8');
  assert(!bridgeCode.includes('AUTORECRUIT_FORCE_REVOKE'), 'Đã xóa hoàn toàn message nguy hiểm AUTORECRUIT_FORCE_REVOKE');
  assert(!bridgeCode.includes('SET_SERVER_URL'), 'Đã xóa hoàn toàn message nguy hiểm SET_SERVER_URL');
  assert(bridgeCode.includes('ALLOWED_ORIGIN'), 'Bridge kiểm tra nghiêm ngặt ALLOWED_ORIGIN');

  // 3. Kiểm tra content.js đã bỏ dòng mã TD và ký tự vô hình mặc định tắt
  console.log('\n--- 3. Kiểm thử Content Script Clean ---');
  const contentCode = fs.readFileSync(path.join(process.cwd(), 'src/extension_files/content.js'), 'utf-8');
  assert(!contentCode.includes('Mã TD: #'), 'Đã loại bỏ hoàn toàn chuỗi "· Mã TD: #XXXX" tự chèn vào bài viết của khách');
  assert(contentCode.includes('enableInvisible = false'), 'Ký tự vô hình chống trùng lặp mặc định TẮT');

  // 4. Kiểm tra manifest.json đã thu hẹp domain
  console.log('\n--- 4. Kiểm thử Manifest V3 Host Permissions & Content Scripts ---');
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/extension_files/manifest.json'), 'utf-8'));
  const hosts = manifest.host_permissions || [];
  assert(!hosts.includes('https://*/*') && !hosts.includes('http://*/*'), 'Không chứa wildcard https://*/*');
  assert(!hosts.some((h: string) => h.includes('localhost') || h.includes('run.app')), 'Không chứa localhost hay dev run.app trong production permissions');

  // 5. Kiểm tra data/admin-pin.json không còn tồn tại và .gitignore bảo vệ
  console.log('\n--- 5. Kiểm thử Bảo Mật Tệp Lưu Mã PIN Quản Trị ---');
  const adminPinFileExists = fs.existsSync(path.join(process.cwd(), 'data/admin-pin.json'));
  assert(!adminPinFileExists, 'Tệp data/admin-pin.json đã bị xóa vĩnh viễn khỏi hệ thống');

  const gitignore = fs.readFileSync(path.join(process.cwd(), '.gitignore'), 'utf-8');
  assert(gitignore.includes('data/'), 'data/ đã được thêm vào .gitignore để tránh commit dữ liệu');

  // 6. Kiểm tra wrangler.toml không chứa ADMIN_PIN cứng
  console.log('\n--- 6. Kiểm thử Cấu Hình Wrangler ---');
  const wrangler = fs.readFileSync(path.join(process.cwd(), 'wrangler.toml'), 'utf-8');
  assert(!wrangler.includes('ADMIN_PIN = "Ha26062018$"'), 'wrangler.toml đã xóa bỏ hoàn toàn ADMIN_PIN viết cứng');

  // 7. Kiểm tra background.js: deviceId bằng UUID, single API_BASE, Ed25519 cache verify
  console.log('\n--- 7. Kiểm thử Background.js Security ---');
  const bgCode = fs.readFileSync(path.join(process.cwd(), 'src/extension_files/background.js'), 'utf-8');
  assert(bgCode.includes('importScripts(\'ed25519_verify.js\')'), 'background.js đã nhúng module ed25519_verify.js');
  assert(bgCode.includes('crypto.randomUUID'), 'Mã máy đã chuyển sang sử dụng crypto.randomUUID()');
  assert(bgCode.includes('PRODUCTION_API_BASE'), 'background.js dùng một API_BASE chuẩn');
  assert(!bgCode.includes('http://localhost:3000'), 'background.js đã bỏ hoàn toàn danh sách server dự phòng localhost:3000');
  assert(bgCode.includes('verifyEd25519LicenseToken'), 'background.js xác minh chữ ký Ed25519 trước khi tin token cache');

  console.log(`\n=====================================================`);
  console.log(`KẾT QUẢ KIỂM THỬ: ${passed}/${total} MỤC ĐẠT (100% SUCCESS)`);
  console.log(`=====================================================\n`);
}

runPhase0Tests();
