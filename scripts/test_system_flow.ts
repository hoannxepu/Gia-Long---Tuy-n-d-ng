// scripts/test_system_flow.ts
// Kịch bản kiểm thử toàn diện: Luồng trao đổi thông tin Admin <-> Người dùng qua JSON
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const ADMIN_PIN = '123456';

async function runTests() {
  console.log('================================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ HỆ THỐNG: ADMIN <-> NGƯỜI DÙNG QUA JSON');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, msg: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✓ PASS: ${msg}`);
    } else {
      console.error(`  ✗ FAIL: ${msg}`);
    }
  }

  // 1. Kiểm tra File JSON nội tại trong thư mục data/
  console.log('--- BƯỚC 1: KIỂM TRA CÁC TỆP DỮ LIỆU JSON NỘI TẠI ---');
  const dataDir = path.resolve(process.cwd(), 'data');
  assert(fs.existsSync(dataDir), 'Thư mục data/ tồn tại');
  assert(fs.existsSync(path.join(dataDir, 'licenses.json')), 'Tệp data/licenses.json tồn tại');
  assert(fs.existsSync(path.join(dataDir, 'orders.json')), 'Tệp data/orders.json tồn tại');
  assert(fs.existsSync(path.join(dataDir, 'settings.json')), 'Tệp data/settings.json tồn tại');

  // Đọc thử xem có phải JSON hợp lệ không
  try {
    const lics = JSON.parse(fs.readFileSync(path.join(dataDir, 'licenses.json'), 'utf-8'));
    assert(Array.isArray(lics), `licenses.json là JSON Array hợp lệ (${lics.length} bản quyền)`);
  } catch (e: any) {
    assert(false, 'licenses.json bị lỗi cú pháp: ' + e.message);
  }

  try {
    const ords = JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf-8'));
    assert(Array.isArray(ords), `orders.json là JSON Array hợp lệ (${ords.length} đơn)`);
  } catch (e: any) {
    assert(false, 'orders.json bị lỗi cú pháp: ' + e.message);
  }

  // 2. Kiểm tra Extension gửi đơn đặt mua lên hệ thống (Người dùng ➔ Server JSON)
  console.log('\n--- BƯỚC 2: NGƯỜI DÙNG TRÊN EXTENSION ĐẶT MUA / DÙNG THỬ ---');
  const testMachineId = 'TEST_DEVICE_' + Date.now().toString(36).toUpperCase();
  const testOrderPayload = {
    clientName: 'Nguyễn Văn Test',
    phone: '0988776655',
    pkgName: 'Gói VIP Tháng (Kiểm Thử)',
    price: '300.000đ',
    deviceId: testMachineId,
    note: 'Đơn test tự động kiểm thử hệ thống JSON',
  };

  let createdOrderId = '';
  try {
    const res = await fetch(`${BASE_URL}/api/orders/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testOrderPayload),
    });
    const data = await res.json();
    assert(res.ok && data.success === true, 'Extension gửi đơn đặt mua thành công (/api/orders/create)');
    assert(!!data.order?.id, `Đơn hàng được sinh ID hợp lệ: ${data.order?.id}`);
    createdOrderId = data.order?.id;
  } catch (e: any) {
    assert(false, 'Lỗi khi gửi đơn hàng: ' + e.message);
  }

  // 3. Kiểm tra file orders.json đã ghi nhận đơn mới chưa
  console.log('\n--- BƯỚC 3: XÁC THỰC LƯU VÀO orders.json ---');
  try {
    const ords = JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf-8'));
    const found = ords.find((o: any) => o.deviceId?.toLowerCase() === testMachineId.toLowerCase() || o.id === createdOrderId);
    assert(!!found, `File orders.json đã tự động lưu đơn của máy ${testMachineId}`);
    assert(found?.status === 'pending', 'Trạng thái đơn hàng mới là "pending" (chờ duyệt)');
  } catch (e: any) {
    assert(false, 'Lỗi đọc orders.json: ' + e.message);
  }

  // 4. Kiểm tra Người dùng check bản quyền khi chưa được duyệt (/api/check)
  console.log('\n--- BƯỚC 4: EXTENSION KIỂM TRA BẢN QUYỀN KHI CHƯA DUYỆT ---');
  try {
    const res = await fetch(`${BASE_URL}/api/check?machine_id=${testMachineId}`);
    const data = await res.json();
    assert(res.ok, 'Endpoint /api/check phản hồi HTTP 200');
    assert(data.status === 'pending', 'Thiết bị đang chờ duyệt phản hồi status = "pending" (chính xác)');
  } catch (e: any) {
    assert(false, 'Lỗi check bản quyền: ' + e.message);
  }

  // 5. Kiểm tra Quản trị viên (Admin) xem danh sách đơn hàng (/api/admin/orders)
  console.log('\n--- BƯỚC 5: ADMIN TRUY VẤN DANH SÁCH ĐƠN HÀNG (/api/admin/orders) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/admin/orders`, {
      headers: { 'x-admin-pin': ADMIN_PIN },
    });
    const data = await res.json();
    assert(res.ok && data.success === true, 'Admin xác thực PIN và lấy danh sách đơn thành công');
    const hasOrder = Array.isArray(data.orders) && data.orders.some((o: any) => o.deviceId?.toLowerCase() === testMachineId.toLowerCase());
    assert(hasOrder, 'Admin nhìn thấy đơn hàng vừa tạo trên giao diện Quản trị');
  } catch (e: any) {
    assert(false, 'Lỗi Admin lấy đơn: ' + e.message);
  }

  // 6. Quản trị viên DUYỆT đơn hàng (Admin ➔ Cấp Mã Bản Quyền)
  console.log('\n--- BƯỚC 6: ADMIN DUYỆT ĐƠN & CẤP MÃ BẢN QUYỀN (/api/admin/orders/approve) ---');
  let grantedKey = '';
  try {
    const res = await fetch(`${BASE_URL}/api/admin/orders/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': ADMIN_PIN },
      body: JSON.stringify({
        orderId: createdOrderId,
        days: 30,
        planType: 'individual',
      }),
    });
    const data = await res.json();
    assert(res.ok && data.success === true, 'Admin duyệt đơn thành công');
    grantedKey = data.license?.key || data.order?.generatedKey || '';
    assert(!!grantedKey, `Mã bản quyền mới được tự động sinh: ${grantedKey}`);
  } catch (e: any) {
    assert(false, 'Lỗi Admin duyệt đơn: ' + e.message);
  }

  // 7. Xác thực file licenses.json và orders.json sau khi duyệt
  console.log('\n--- BƯỚC 7: XÁC THỰC LƯU VÀO licenses.json & CẬP NHẬT orders.json ---');
  try {
    const lics = JSON.parse(fs.readFileSync(path.join(dataDir, 'licenses.json'), 'utf-8'));
    const lic = lics.find((l: any) => (l.devices || []).some((d: any) => d.deviceId?.toLowerCase() === testMachineId.toLowerCase()));
    assert(!!lic, `licenses.json đã tự động ghi nhận bản quyền cho thiết bị ${testMachineId}`);

    const ords = JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf-8'));
    const ord = ords.find((o: any) => o.id === createdOrderId);
    assert(ord?.status === 'approved', 'orders.json đã tự động cập nhật trạng thái đơn thành "approved"');
  } catch (e: any) {
    assert(false, 'Lỗi kiểm tra JSON: ' + e.message);
  }

  // 8. Extension Người dùng kiểm tra lại bản quyền sau khi duyệt (Tự động kích hoạt)
  console.log('\n--- BƯỚC 8: EXTENSION TỰ ĐỘNG NHẬN BẢN QUYỀN ĐÃ DUYỆT (/api/check) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/check?machine_id=${testMachineId}`);
    const data = await res.json();
    assert(res.ok && data.status === 'active', 'Extension nhận status = "active" ngay sau khi admin duyệt (Thông suốt 100%)');
    assert(!!data.expires_at, `Có ngày hết hạn cụ thể: ${data.expires_at}`);
    assert(!!data.token, `Có token chữ ký bảo mật xác thực: ${data.token?.slice(0, 20)}...`);
  } catch (e: any) {
    assert(false, 'Lỗi kiểm tra lại bản quyền: ' + e.message);
  }

  // 9. Kiểm tra API xuất Live Database JSON (/api/database/export.json)
  console.log('\n--- BƯỚC 9: KIỂM TRA XUẤT DATABASE JSON TRỰC TIẾP (/api/database/export.json) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/database/export.json`);
    const data = await res.json();
    assert(res.ok && data.app === 'Gia Long - FB', 'Endpoint /api/database/export.json hoạt động tốt');
    assert(Array.isArray(data.orders) && Array.isArray(data.licenses), 'Dữ liệu JSON chứa đầy đủ mảng orders và licenses');
  } catch (e: any) {
    assert(false, 'Lỗi export database JSON: ' + e.message);
  }

  // 10. Kiểm tra API Sao lưu JSON Backup (/api/admin/backup-json)
  console.log('\n--- BƯỚC 10: KIỂM TRA SAO LƯU JSON BACKUP ĐỂ CẤT LÊN GOOGLE DRIVE ---');
  try {
    const res = await fetch(`${BASE_URL}/api/admin/backup-json`, {
      headers: { 'x-admin-pin': ADMIN_PIN },
    });
    const backupData = await res.json();
    assert(res.ok && !!backupData.exportedAt, 'Admin tải file sao lưu JSON thành công');
    assert(Array.isArray(backupData.licenses) && backupData.licenses.length > 0, 'Dữ liệu sao lưu chứa danh sách bản quyền');
    assert(Array.isArray(backupData.orders) && backupData.orders.length > 0, 'Dữ liệu sao lưu chứa danh sách đơn hàng');
  } catch (e: any) {
    assert(false, 'Lỗi tải sao lưu JSON: ' + e.message);
  }

  // Dọn dẹp đơn test
  console.log('\n--- DỌN DẸP DỮ LIỆU KIỂM THỬ ---');
  try {
    const ords = JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf-8'));
    const filteredOrds = ords.filter((o: any) => o.deviceId?.toLowerCase() !== testMachineId.toLowerCase() && o.id !== createdOrderId);
    fs.writeFileSync(path.join(dataDir, 'orders.json'), JSON.stringify(filteredOrds, null, 2));

    const lics = JSON.parse(fs.readFileSync(path.join(dataDir, 'licenses.json'), 'utf-8'));
    const filteredLics = lics.filter((l: any) => !(l.devices || []).some((d: any) => d.deviceId?.toLowerCase() === testMachineId.toLowerCase()));
    fs.writeFileSync(path.join(dataDir, 'licenses.json'), JSON.stringify(filteredLics, null, 2));
    console.log('  ✓ Đã dọn dẹp bản ghi kiểm thử an toàn, không ảnh hưởng dữ liệu thật.');
  } catch (e) {}

  console.log('\n================================================================');
  console.log(`🎉 KẾT QUẢ KIỂM THỬ TOÀN DIỆN: ${passedTests}/${totalTests} BÀI TEST THÀNH CÔNG!`);
  console.log('================================================================\n');
}

runTests();
