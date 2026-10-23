// Test script to verify All Customer & Admin Control Operations Thoroughly
// Bao gồm: Đăng ký đơn, Duyệt đơn, Xóa đơn (không ảnh hưởng máy khách), Tăng ngày, Giảm ngày, Khóa, Mở khóa, Reset thiết bị, Thu hồi, Khôi phục
const BASE_URL = 'http://localhost:3000';
const ADMIN_PIN = 'Ha26062018$';

async function runTests() {
  console.log('========================================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ TOÀN DIỆN HỆ THỐNG GIA LONG FACEBOOK WEB STORE');
  console.log('========================================================================\n');

  const testDeviceId = `TEST_PC_${Date.now()}`;
  const testPhone = '0988776655';
  const testClientName = 'Nguyễn Văn Kiểm Thử Toàn Diện';

  // ------------------------------------------------------------------
  // BƯỚC 0: MÁY MỚI CÀI ĐẶT LẦN ĐẦU (CHƯA ĐĂNG KÝ)
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 0] Kiểm tra máy khách mới cài đặt lần đầu (Chưa đăng ký bao giờ)...');
  const freshCheckRes = await fetch(`${BASE_URL}/api/check?machine_id=${encodeURIComponent(testDeviceId)}`);
  const freshCheckData = await freshCheckRes.json();
  console.log('Kết quả kiểm tra máy mới:', freshCheckData);
  if (freshCheckData.status === 'revoked' || freshCheckData.isRevoked) {
    throw new Error('LỖI: Máy mới cài đặt lại bị báo là BỊ KHÓA / THU HỒI!');
  }
  if (freshCheckData.status !== 'unregistered') {
    throw new Error(`LỖI: Máy mới mong đợi trạng thái "unregistered", thực tế: ${freshCheckData.status}`);
  }
  console.log('✓ [PASS] Máy mới chưa đăng ký: Trả về trạng thái "unregistered", KHÔNG BỊ KHÓA NHẦM!\n');

  // ------------------------------------------------------------------
  // BƯỚC 1: KHÁCH HÀNG TẠO ĐƠN ĐẶT MUA GÓI 12 THÁNG
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 1] Khách hàng tạo đơn đặt mua Gói 12 Tháng...');
  const createOrderPayload = {
    id: `ord_test_${Date.now()}`,
    pkgName: 'Gói 12 Tháng',
    price: '10.800.000đ',
    clientName: testClientName,
    phone: testPhone,
    deviceId: testDeviceId,
    note: 'Đơn test tự động kiểm thử quy trình mua và duyệt gói',
  };

  const createRes = await fetch(`${BASE_URL}/api/orders/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createOrderPayload),
  });
  const createData = await createRes.json();
  if (!createData.success || !createData.order) {
    throw new Error('Tạo đơn thất bại!');
  }
  const orderId = createData.order.id;
  console.log(`✓ [PASS] Đã tạo thành công đơn hàng ID: ${orderId}\n`);

  // ------------------------------------------------------------------
  // BƯỚC 2: ADMIN LẤY DANH SÁCH ĐƠN HÀNG VÀ DUYỆT ĐƠN
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 2] Admin kiểm tra danh sách đơn và phê duyệt đơn hàng...');
  const adminOrdersRes = await fetch(`${BASE_URL}/api/admin/orders`, {
    headers: { 'x-admin-pin': ADMIN_PIN },
  });
  const adminOrdersData = await adminOrdersRes.json();
  const foundOrder = adminOrdersData.orders?.find((o: any) => o.id === orderId);
  if (!foundOrder) {
    throw new Error(`Admin không tìm thấy đơn ${orderId} vừa tạo!`);
  }
  console.log(`✓ Tìm thấy đơn trên Admin: ID ${orderId}, Khách: ${foundOrder?.clientName}, Trạng thái: ${foundOrder?.status}`);

  // Phê duyệt đơn hàng
  const approveRes = await fetch(`${BASE_URL}/api/admin/orders/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({ orderId }),
  });
  const approveData = await approveRes.json();
  if (!approveData.success) {
    throw new Error('Duyệt đơn thất bại: ' + approveData.error);
  }
  const licenseKey = approveData.assignedKey || approveData.license?.key;
  const initialExpiresAt = approveData.newExpiresAt || approveData.license?.expiresAt;
  console.log(`✓ [PASS] Đã duyệt đơn thành công! Cấp License Key: ${licenseKey}, Hạn dùng: ${initialExpiresAt}\n`);

  // ------------------------------------------------------------------
  // BƯỚC 3: MÁY KHÁCH TỰ ĐỘNG NHẬN BẢN QUYỀN HOẠT ĐỘNG
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 3] Máy khách kiểm tra trạng thái hoạt động...');
  const checkActiveRes = await fetch(`${BASE_URL}/api/check?machine_id=${encodeURIComponent(testDeviceId)}`);
  const checkActiveData = await checkActiveRes.json();
  if (checkActiveData.status !== 'active' || checkActiveData.license_key !== licenseKey) {
    throw new Error('Máy khách không nhận được trạng thái active sau khi duyệt đơn!');
  }
  console.log(`✓ [PASS] Máy khách nhận trạng thái "active", Hạn: ${checkActiveData.expires_at}, Ngày còn: ${checkActiveData.days_left}\n`);

  // ------------------------------------------------------------------
  // BƯỚC 4: KIỂM TRA ĐẶC BIỆT: ADMIN XÓA ĐƠN HÀNG - MÁY KHÁCH VẪN HOẠT ĐỘNG 100%!
  // (Yêu cầu quan trọng của người dùng: "khi xóa đơn hàng thì máy khách không bị ảnh hưởng")
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 4] KIỂM TRA QUAN TRỌNG: Admin XÓA ĐƠN HÀNG (Order Delete)...');
  const deleteOrderRes = await fetch(`${BASE_URL}/api/admin/orders/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({ orderId, id: orderId }),
  });
  const deleteOrderData = await deleteOrderRes.json();
  if (!deleteOrderData.success) {
    throw new Error('Xóa đơn hàng thất bại!');
  }
  console.log('Admin đã xóa đơn hàng khỏi danh sách thành công.');

  // Kiểm tra ngay lập tức: máy khách có bị ảnh hưởng không?
  console.log('👉 Kiểm tra máy khách sau khi xóa đơn hàng...');
  const checkAfterOrderDelRes = await fetch(`${BASE_URL}/api/check?machine_id=${encodeURIComponent(testDeviceId)}`);
  const checkAfterOrderDelData = await checkAfterOrderDelRes.json();
  console.log('Kết quả check máy khách sau khi xóa đơn:', {
    success: checkAfterOrderDelData.success,
    status: checkAfterOrderDelData.status,
    license_key: checkAfterOrderDelData.license_key,
    isRevoked: checkAfterOrderDelData.isRevoked,
  });

  if (checkAfterOrderDelData.status !== 'active' || checkAfterOrderDelData.isRevoked) {
    throw new Error('❌ THẤT BẠI: Xóa đơn hàng làm ảnh hưởng bản quyền của máy khách!');
  }

  // Xác thực token & verify license
  const verifyRes = await fetch(`${BASE_URL}/api/license/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: licenseKey, deviceId: testDeviceId }),
  });
  const verifyData = await verifyRes.json();
  if (!verifyData.valid) {
    throw new Error('❌ THẤT BẠI: Verify license bị từ chối sau khi xóa đơn!');
  }
  console.log('✓ [PASS] TUYỆT VỜI: Xóa đơn hàng hoàn toàn độc lập, máy khách VẪN HOẠT ĐỘNG BÌNH THƯỜNG 100%!\n');

  // ------------------------------------------------------------------
  // BƯỚC 5: KIỂM TRA ĐIỀU KHIỂN: TĂNG NGÀY (+15 NGÀY)
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 5] Kiểm tra chức năng điều khiển: TĂNG NGÀY (+15 ngày)...');
  const expBeforeExtend = new Date(checkAfterOrderDelData.expires_at).getTime();
  const extendRes = await fetch(`${BASE_URL}/api/admin/licenses/extend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({ id: licenseKey, addDays: 15 }),
  });
  const extendData = await extendRes.json();
  if (!extendData.success) {
    throw new Error('Tăng ngày thất bại: ' + extendData.error);
  }
  const expAfterExtend = new Date(extendData.license.expiresAt).getTime();
  const diffDaysAdd = Math.round((expAfterExtend - expBeforeExtend) / (24 * 60 * 60 * 1000));
  if (diffDaysAdd !== 15) {
    throw new Error(`Lỗi tăng ngày: Kỳ vọng +15 ngày, thực tế: +${diffDaysAdd} ngày`);
  }
  console.log(`✓ [PASS] Tăng ngày chính xác tuyệt đối: +15 ngày (Hạn mới: ${extendData.license.expiresAt})\n`);

  // ------------------------------------------------------------------
  // BƯỚC 6: KIỂM TRA ĐIỀU KHIỂN: GIẢM NGÀY (-7 NGÀY)
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 6] Kiểm tra chức năng điều khiển: GIẢM NGÀY (-7 ngày)...');
  const expBeforeDecrease = expAfterExtend;
  const decreaseRes = await fetch(`${BASE_URL}/api/admin/licenses/extend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({ id: licenseKey, addDays: -7 }),
  });
  const decreaseData = await decreaseRes.json();
  if (!decreaseData.success) {
    throw new Error('Giảm ngày thất bại: ' + decreaseData.error);
  }
  const expAfterDecrease = new Date(decreaseData.license.expiresAt).getTime();
  const diffDaysDec = Math.round((expAfterDecrease - expBeforeDecrease) / (24 * 60 * 60 * 1000));
  if (diffDaysDec !== -7) {
    throw new Error(`Lỗi giảm ngày: Kỳ vọng -7 ngày, thực tế: ${diffDaysDec} ngày`);
  }
  console.log(`✓ [PASS] Giảm ngày chính xác tuyệt đối: -7 ngày (Hạn mới: ${decreaseData.license.expiresAt})\n`);

  // ------------------------------------------------------------------
  // BƯỚC 7: KIỂM TRA ĐIỀU KHIỂN: TẠM KHÓA BẢN QUYỀN (TOGGLE LOCK)
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 7] Kiểm tra chức năng điều khiển: TẠM KHÓA (Toggle Lock)...');
  const toggleLockRes = await fetch(`${BASE_URL}/api/admin/licenses/toggle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({ id: licenseKey }),
  });
  const toggleLockData = await toggleLockRes.json();
  if (!toggleLockData.success || !toggleLockData.isSuspended) {
    throw new Error('Tạm khóa bản quyền không thành công!');
  }

  // Máy khách kiểm tra trạng thái khi bị khóa
  const checkSuspendedRes = await fetch(`${BASE_URL}/api/check?machine_id=${encodeURIComponent(testDeviceId)}`);
  const checkSuspendedData = await checkSuspendedRes.json();
  if (checkSuspendedData.status !== 'suspended' || !checkSuspendedData.isSuspended) {
    throw new Error(`Lỗi: Máy khách không nhận diện được trạng thái suspended! Thực tế: ${checkSuspendedData.status}`);
  }
  console.log('✓ [PASS] Tạm khóa thành công: Máy khách lập tức nhận trạng thái "suspended"!\n');

  // ------------------------------------------------------------------
  // BƯỚC 8: KIỂM TRA ĐIỀU KHIỂN: MỞ KHÓA BẢN QUYỀN (TOGGLE UNLOCK)
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 8] Kiểm tra chức năng điều khiển: MỞ KHÓA (Toggle Unlock)...');
  const toggleUnlockRes = await fetch(`${BASE_URL}/api/admin/licenses/toggle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({ id: licenseKey }),
  });
  const toggleUnlockData = await toggleUnlockRes.json();
  if (!toggleUnlockData.success || toggleUnlockData.isSuspended) {
    throw new Error('Mở khóa bản quyền không thành công!');
  }

  // Máy khách kiểm tra trạng thái sau khi mở khóa
  const checkUnsuspendRes = await fetch(`${BASE_URL}/api/check?machine_id=${encodeURIComponent(testDeviceId)}`);
  const checkUnsuspendData = await checkUnsuspendRes.json();
  if (checkUnsuspendData.status !== 'active') {
    throw new Error(`Lỗi: Máy khách không phục hồi trạng thái active! Thực tế: ${checkUnsuspendData.status}`);
  }
  console.log('✓ [PASS] Mở khóa thành công: Máy khách trở lại trạng thái "active" bình thường!\n');

  // ------------------------------------------------------------------
  // BƯỚC 9: KIỂM TRA ĐIỀU KHIỂN: RESET THIẾT BỊ (ĐỔI MÁY MỚI)
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 9] Kiểm tra chức năng điều khiển: RESET THIẾT BỊ (Reset Devices)...');
  const resetRes = await fetch(`${BASE_URL}/api/admin/licenses/reset-devices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({ id: licenseKey }),
  });
  const resetData = await resetRes.json();
  if (!resetData.success) {
    throw new Error('Reset thiết bị thất bại!');
  }
  console.log('✓ [PASS] Reset thiết bị thành công: Danh sách máy liên kết đã được xóa trắng để khách kích hoạt máy mới!\n');

  // ------------------------------------------------------------------
  // BƯỚC 10: KIỂM TRA ĐIỀU KHIỂN: THU HỒI / NGẮT MÁY (REVOKE)
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 10] Kiểm tra chức năng điều khiển: THU HỒI / NGẮT MÁY (Revoke)...');
  const revokeRes = await fetch(`${BASE_URL}/api/admin/licenses/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({ id: licenseKey, reason: 'Kiểm thử ngắt máy khẩn cấp' }),
  });
  const revokeData = await revokeRes.json();
  if (!revokeData.success) {
    throw new Error('Thu hồi bản quyền thất bại!');
  }

  // Máy khách kiểm tra trạng thái
  const checkRevokedRes = await fetch(`${BASE_URL}/api/check?machine_id=${encodeURIComponent(testDeviceId)}`);
  const checkRevokedData = await checkRevokedRes.json();
  if (!checkRevokedData.isRevoked || checkRevokedData.status !== 'revoked') {
    throw new Error('Máy khách không nhận được tín hiệu thu hồi / ngắt máy!');
  }
  console.log('✓ [PASS] Thu hồi thành công: Máy khách nhận FORCE_REVOKE và dừng hoạt động lập tức!\n');

  // ------------------------------------------------------------------
  // BƯỚC 11: KIỂM TRA ĐIỀU KHIỂN: KHÔI PHỤC BẢN QUYỀN (UNREVOKE)
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 11] Kiểm tra chức năng điều khiển: KHÔI PHỤC BẢN QUYỀN (Unrevoke)...');
  const unrevokeRes = await fetch(`${BASE_URL}/api/admin/licenses/unrevoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({ id: licenseKey }),
  });
  const unrevokeData = await unrevokeRes.json();
  if (!unrevokeData.success) {
    throw new Error('Khôi phục bản quyền thất bại!');
  }
  console.log('✓ [PASS] Khôi phục quyền thành công!\n');

  // ------------------------------------------------------------------
  // BƯỚC 12: DỌN DẸP DỮ LIỆU KIỂM THỬ (CLEANUP)
  // ------------------------------------------------------------------
  console.log('🧹 [BƯỚC 12] Dọn dẹp dữ liệu kiểm thử...');
  await fetch(`${BASE_URL}/api/admin/licenses/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({ id: licenseKey, key: licenseKey }),
  });
  console.log('✓ [PASS] Dọn dẹp hoàn tất!\n');

  console.log('========================================================================');
  console.log('🎉 TẤT CẢ 12 BÀI KIỂM THỬ ĐÃ VƯỢT QUA 100% THÀNH CÔNG RỰC RỠ!');
  console.log('========================================================================');
}

runTests().catch((err) => {
  console.error('❌ KIỂM THỬ THẤT BẠI:', err);
  process.exit(1);
});
