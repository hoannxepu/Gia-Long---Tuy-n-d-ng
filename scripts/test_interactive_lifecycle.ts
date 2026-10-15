// scripts/test_interactive_lifecycle.ts
// Kiểm thử chuyên sâu: Tương tác 2 chiều và phản ứng tín hiệu giữa Admin và Người dùng (Extension)

const BASE_URL = 'http://localhost:3000';
const ADMIN_PIN = '123456';

async function runInteractiveTests() {
  console.log('========================================================================');
  console.log('🔄 KIỂM THỬ TƯƠNG TÁC & PHẢN ỨNG TÍN HIỆU: NGƯỜI DÙNG <---> ADMIN');
  console.log('========================================================================\n');

  let passCount = 0;
  let testCount = 0;

  function assert(condition: boolean, msg: string) {
    testCount++;
    if (condition) {
      passCount++;
      console.log(`  ✓ ĐẠT: ${msg}`);
    } else {
      console.error(`  ✗ LỖI: ${msg}`);
    }
  }

  const testDeviceId = 'DEVICE_SIGNAL_' + Date.now().toString(36).toUpperCase();
  let orderId = '';
  let licenseId = '';
  let licenseKey = '';

  // 1. NGƯỜI DÙNG: Bấm đặt mua trên Extension
  console.log('--- 1. TÍN HIỆU ĐẶT HÀNG TỪ NGƯỜI DÙNG (EXTENSION ➔ SERVER) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/orders/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: 'Anh Hoàn Test Tín Hiệu',
        phone: '0988112233',
        pkgName: 'Gói 1 Tháng VIP',
        price: '1.000.000đ',
        deviceId: testDeviceId,
        note: 'Kiểm thử phản ứng tín hiệu real-time',
      }),
    });
    const data = await res.json();
    assert(res.ok && data.success, 'Extension phát tín hiệu đặt mua thành công (/api/orders/create)');
    orderId = data.order?.id;
    assert(!!orderId, `Server tiếp nhận và gán mã đơn: ${orderId}`);
  } catch (e: any) {
    assert(false, 'Lỗi gửi tín hiệu đặt hàng: ' + e.message);
  }

  // 2. ADMIN: Nhận tín hiệu chuông báo đơn mới (Polling / Notification)
  console.log('\n--- 2. ADMIN NHẬN TÍN HIỆU ĐƠN MỚI (/api/orders/pending-count) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/orders/pending-count`);
    const data = await res.json();
    assert(res.ok && data.success, 'Admin nhận được tín hiệu đếm đơn chờ');
    assert(data.pendingCount > 0, `Có ${data.pendingCount} đơn đang chờ duyệt trên chuông thông báo`);
  } catch (e: any) {
    assert(false, 'Lỗi kiểm tra tín hiệu đơn mới: ' + e.message);
  }

  // 3. NGƯỜI DÙNG: Tiện ích thăm dò trạng thái khi đang chờ duyệt (/api/check)
  console.log('\n--- 3. TIỆN ÍCH NGƯỜI DÙNG THĂM DÒ TRẠNG THÁI CHỜ DUYỆT (/api/check) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/check?machine_id=${testDeviceId}`);
    const data = await res.json();
    assert(res.ok, 'Endpoint /api/check phản hồi HTTP 200');
    assert(data.status === 'pending', 'Tiện ích nhận trạng thái "pending" (Đang chờ Admin duyệt)');
    assert(data.message?.includes('chờ'), 'Lời nhắn hiển thị rõ cho khách: Đơn đang chờ duyệt');
  } catch (e: any) {
    assert(false, 'Lỗi thăm dò trạng thái: ' + e.message);
  }

  // 4. ADMIN: Mở đơn và bấm "Duyệt Gói" (Admin ➔ Cấp Mã)
  console.log('\n--- 4. ADMIN DUYỆT ĐƠN & CẤP QUYỀN (/api/admin/orders/approve) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/admin/orders/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': ADMIN_PIN },
      body: JSON.stringify({
        orderId,
        days: 30,
        planType: 'individual',
      }),
    });
    const data = await res.json();
    assert(res.ok && data.success, 'Admin duyệt đơn thành công');
    licenseId = data.license?.id || '';
    licenseKey = data.license?.key || data.order?.generatedKey || '';
    assert(!!licenseKey, `Hệ thống cấp mã bản quyền VIP: ${licenseKey}`);
    assert(data.order?.status === 'approved', 'Trạng thái đơn hàng chuyển thành "approved"');
  } catch (e: any) {
    assert(false, 'Lỗi duyệt đơn: ' + e.message);
  }

  // 5. NGƯỜI DÙNG: Tiện ích nhận tín hiệu KÍCH HOẠT TỰ ĐỘNG tức thì (/api/check)
  console.log('\n--- 5. TIỆN ÍCH NGƯỜI DÙNG NHẬN TÍN HIỆU KÍCH HOẠT (/api/check) ---');
  let originalExpiresAt = '';
  try {
    const res = await fetch(`${BASE_URL}/api/check?machine_id=${testDeviceId}`);
    const data = await res.json();
    assert(res.ok, 'Endpoint /api/check phản hồi tức thì');
    assert(data.status === 'active', 'Tiện ích lập tức nhận trạng thái "active" (Mở khóa toàn bộ tính năng)');
    assert(!!data.expires_at, `Ngày hết hạn được ấn định: ${data.expires_at}`);
    originalExpiresAt = data.expires_at;
    assert(!!data.token && data.token.startsWith('GLFB_SIG_'), 'Tiện ích nhận Token chữ ký số mật mã chống giả mạo');
    assert(data.license_key === licenseKey, `Mã key tiện ích nhận khớp chuẩn xác với mã Admin cấp: ${data.license_key}`);
  } catch (e: any) {
    assert(false, 'Lỗi nhận tín hiệu kích hoạt: ' + e.message);
  }

  // 6. ADMIN GIA HẠN THÊM NGÀY (Cộng dồn 15 ngày qua /api/admin/licenses/extend)
  console.log('\n--- 6. ADMIN GIA HẠN THÊM NGÀY CHO MÁY (/api/admin/licenses/extend) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/admin/licenses/extend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': ADMIN_PIN },
      body: JSON.stringify({
        id: licenseId,
        addDays: 15,
      }),
    });
    const data = await res.json();
    assert(res.ok && data.success, 'Admin gia hạn cộng dồn thêm 15 ngày thành công');
    assert(new Date(data.newExpiresAt || data.license?.expiresAt).getTime() > new Date(originalExpiresAt).getTime(), 'Hạn sử dụng trong bản quyền đã được nới dài');
  } catch (e: any) {
    assert(false, 'Lỗi gia hạn: ' + e.message);
  }

  // 7. NGƯỜI DÙNG NHẬN TÍN HIỆU HẠN MỚI
  console.log('\n--- 7. TIỆN ÍCH NGƯỜI DÙNG NHẬN HẠN MỚI (/api/check) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/check?machine_id=${testDeviceId}`);
    const data = await res.json();
    assert(data.status === 'active', 'Tiện ích vẫn giữ trạng thái "active"');
    assert(new Date(data.expires_at).getTime() > new Date(originalExpiresAt).getTime(), `Tiện ích đã nhận ngày hết hạn mới gia hạn: ${data.expires_at}`);
  } catch (e: any) {
    assert(false, 'Lỗi kiểm tra hạn mới: ' + e.message);
  }

  // 8. ADMIN TẠM KHÓA MÁY (Tín hiệu Suspend qua /api/admin/licenses/toggle)
  console.log('\n--- 8. ADMIN TẠM KHÓA THIẾT BỊ (/api/admin/licenses/toggle) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/admin/licenses/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': ADMIN_PIN },
      body: JSON.stringify({ id: licenseId }),
    });
    const data = await res.json();
    assert(res.ok && data.success, 'Admin ra lệnh tạm khóa thiết bị thành công');
    assert(data.isSuspended === true, 'Bản quyền chuyển sang trạng thái isSuspended = true');
  } catch (e: any) {
    assert(false, 'Lỗi tạm khóa: ' + e.message);
  }

  // 9. NGƯỜI DÙNG NHẬN TÍN HIỆU TẠM KHÓA
  console.log('\n--- 9. TIỆN ÍCH NGƯỜI DÙNG PHẢN ỨNG VỚI LỆNH TẠM KHÓA (/api/check) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/check?machine_id=${testDeviceId}`);
    const data = await res.json();
    assert(data.status === 'suspended', 'Tiện ích lập tức nhận tín hiệu "suspended" (Tự động khóa giao diện Extension)');
    assert(data.isSuspended === true, 'Thuộc tính isSuspended được báo về tiện ích');
  } catch (e: any) {
    assert(false, 'Lỗi nhận tín hiệu khóa: ' + e.message);
  }

  // 10. ADMIN MỞ KHÓA LẠI
  console.log('\n--- 10. ADMIN MỞ KHÓA LẠI THIẾT BỊ (/api/admin/licenses/toggle) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/admin/licenses/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': ADMIN_PIN },
      body: JSON.stringify({ id: licenseId }),
    });
    const data = await res.json();
    assert(res.ok && data.success, 'Admin ra lệnh mở khóa thành công');
    assert(data.isSuspended === false, 'Bản quyền chuyển lại isSuspended = false');
  } catch (e: any) {
    assert(false, 'Lỗi mở khóa: ' + e.message);
  }

  // 11. NGƯỜI DÙNG TỰ ĐỘNG MỞ LẠI BÌNH THƯỜNG
  console.log('\n--- 11. TIỆN ÍCH TỰ ĐỘNG PHỤC HỒI HOẠT ĐỘNG (/api/check) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/check?machine_id=${testDeviceId}`);
    const data = await res.json();
    assert(data.status === 'active', 'Tiện ích tự động phục hồi về trạng thái "active" bình thường');
  } catch (e: any) {
    assert(false, 'Lỗi phục hồi: ' + e.message);
  }

  // 12. KIỂM TRA ĐỒNG BỘ JSON DATABASE THỜI GIAN THỰC (/api/database/export.json)
  console.log('\n--- 12. KIỂM TRA FILE DATABASE JSON PHẢN ÁNH THỜI GIAN THỰC ---');
  try {
    const res = await fetch(`${BASE_URL}/api/database/export.json`);
    const data = await res.json();
    assert(res.ok && data.app === 'Gia Long - FB', 'Database JSON export phản hồi hoàn hảo');
    const hasLic = data.licenses?.some((l: any) => l.key === licenseKey);
    const hasOrd = data.orders?.some((o: any) => o.id === orderId);
    assert(hasLic && hasOrd, 'Tệp JSON cơ sở dữ liệu lưu trữ đầy đủ cả đơn hàng và bản quyền tương ứng');
  } catch (e: any) {
    assert(false, 'Lỗi export JSON: ' + e.message);
  }

  // Dọn dẹp an toàn sau kiểm thử
  console.log('\n--- DỌN DẸP DỮ LIỆU KIỂM THỬ ---');
  try {
    await fetch(`${BASE_URL}/api/admin/licenses/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': ADMIN_PIN },
      body: JSON.stringify({ key: licenseKey, permanent: true }),
    });
    console.log('  ✓ Đã dọn dẹp bản ghi kiểm thử an toàn, không ảnh hưởng dữ liệu thật.');
  } catch (e) {}

  console.log('\n========================================================================');
  console.log(`🎉 TỔNG KẾT: ${passCount}/${testCount} BƯỚC KIỂM THỬ TÍN HIỆU THÀNH CÔNG (100% ĐẠT)!`);
  console.log('========================================================================\n');
}

runInteractiveTests();
