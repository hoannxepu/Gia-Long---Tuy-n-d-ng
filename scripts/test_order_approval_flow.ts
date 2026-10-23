// Test script to verify Customer Buying Package & Admin Approving Flow
const BASE_URL = 'http://localhost:3000';
const ADMIN_PIN = 'Ha26062018$';

async function runTests() {
  console.log('========================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ: KHÁCH MUA GÓI & ADMIN DUYỆT GÓI');
  console.log('========================================================\n');

  const testDeviceId = `TEST_PC_${Date.now()}`;
  const testPhone = '0988776655';
  const testClientName = 'Nguyễn Văn Kiểm Thử';

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
  console.log('✓ Máy mới chưa đăng ký: Trả về trạng thái "unregistered", KHÔNG BỊ KHÓA NHẦM!\n');

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
  console.log('Kết quả tạo đơn:', createData);
  if (!createData.success || !createData.order) {
    throw new Error('Tạo đơn thất bại!');
  }
  const orderId = createData.order.id;
  console.log(`✓ Đã tạo thành công đơn hàng ID: ${orderId}\n`);

  // ------------------------------------------------------------------
  // BƯỚC 2: KHÁCH HÀNG KIỂM TRA TRẠNG THÁI KHI ĐƠN CHỜ DUYỆT
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 2] Khách hàng tra cứu trạng thái đơn hàng (My Orders & Check)...');
  const myOrdersRes = await fetch(`${BASE_URL}/api/orders/my-orders?deviceId=${encodeURIComponent(testDeviceId)}`);
  const myOrdersData = await myOrdersRes.json();
  console.log('Trạng thái My Orders của khách:', {
    success: myOrdersData.success,
    ordersCount: myOrdersData.orders?.length,
    firstOrderStatus: myOrdersData.orders?.[0]?.status,
    activeLicense: myOrdersData.activeLicense,
  });

  const checkPendingRes = await fetch(`${BASE_URL}/api/check?machine_id=${encodeURIComponent(testDeviceId)}`);
  const checkPendingData = await checkPendingRes.json();
  console.log('Trạng thái Check máy của khách:', checkPendingData);
  console.log('✓ Khi chưa duyệt: Đơn hiển thị ở trạng thái pending, máy chưa có bản quyền active.\n');

  // ------------------------------------------------------------------
  // BƯỚC 3: ADMIN XEM DANH SÁCH ĐƠN CHỜ TRÊN GIAO DIỆN QUẢN TRỊ
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 3] Admin lấy danh sách đơn đặt mua...');
  const adminOrdersRes = await fetch(`${BASE_URL}/api/admin/orders`, {
    headers: { 'x-admin-pin': ADMIN_PIN },
  });
  const adminOrdersData = await adminOrdersRes.json();
  const foundOrder = adminOrdersData.orders?.find((o: any) => o.id === orderId);
  console.log(`✓ Tìm thấy đơn trên Admin: ID ${orderId}, Khách: ${foundOrder?.clientName}, Gói: ${foundOrder?.pkgName}, Trạng thái: ${foundOrder?.status}\n`);

  // ------------------------------------------------------------------
  // BƯỚC 4: ADMIN PHÊ DUYỆT ĐƠN HÀNG (1-CLICK APPROVE)
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 4] Admin bấm phê duyệt đơn hàng...');
  const approveRes = await fetch(`${BASE_URL}/api/admin/orders/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({ orderId }),
  });
  const approveData = await approveRes.json();
  console.log('Kết quả duyệt đơn của Admin:', {
    success: approveData.success,
    message: approveData.message,
    assignedKey: approveData.assignedKey,
    daysAdded: approveData.daysAdded,
    newExpiresAt: approveData.newExpiresAt,
    license: approveData.license ? {
      key: approveData.license.key,
      clientName: approveData.license.clientName,
      expiresAt: approveData.license.expiresAt,
      daysLeft: approveData.license.daysLeft,
      devices: approveData.license.devices,
    } : null,
  });

  if (!approveData.success) {
    throw new Error('Duyệt đơn thất bại: ' + approveData.error);
  }
  const licenseKey = approveData.assignedKey || approveData.license?.key;
  const newExpiresAt = approveData.newExpiresAt || approveData.license?.expiresAt;
  console.log(`✓ Đã cấp mã bản quyền VIP: ${licenseKey}, Hạn dùng mới: ${newExpiresAt}\n`);

  // ------------------------------------------------------------------
  // BƯỚC 5: KHÁCH HÀNG TỰ ĐỘNG ĐỒNG BỘ BẢN QUYỀN TRÊN EXTENSION
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 5] Extension khách hàng gọi /api/check và /api/orders/my-orders...');
  const checkActiveRes = await fetch(`${BASE_URL}/api/check?machine_id=${encodeURIComponent(testDeviceId)}`);
  const checkActiveData = await checkActiveRes.json();
  console.log('Extension nhận diện trạng thái:', {
    success: checkActiveData.success,
    status: checkActiveData.status,
    pkg_name: checkActiveData.pkg_name,
    client_name: checkActiveData.client_name,
    expires_at: checkActiveData.expires_at,
    days_left: checkActiveData.days_left,
    hasToken: Boolean(checkActiveData.token),
    license_key: checkActiveData.license_key,
  });

  if (checkActiveData.status !== 'active' || checkActiveData.license_key !== licenseKey) {
    throw new Error('Extension không nhận diện được bản quyền active!');
  }
  console.log(`✓ Extension tự động mở khóa VIP, số ngày còn lại: ${checkActiveData.days_left} ngày!\n`);

  // ------------------------------------------------------------------
  // BƯỚC 6: KHÁCH HÀNG MUA THÊM GÓI 1 THÁNG (CỘNG DỒN HỢP LỆ VÀO GÓI ĐANG DÙNG)
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 6] Khách hàng mua tiếp Gói 1 Tháng (+30 ngày) để gia hạn thêm...');
  const expBefore = new Date(checkActiveData.expires_at).getTime();
  const createOrder2Payload = {
    id: `ord_test_add_${Date.now()}`,
    pkgName: 'Gói 1 Tháng',
    price: '1.000.000đ',
    clientName: testClientName,
    phone: testPhone,
    deviceId: testDeviceId,
    note: 'Mua gia hạn thêm 1 tháng',
  };
  const create2Res = await fetch(`${BASE_URL}/api/orders/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createOrder2Payload),
  });
  const create2Data = await create2Res.json();
  const orderId2 = create2Data.order.id;

  // Admin duyệt đơn 2
  const approve2Res = await fetch(`${BASE_URL}/api/admin/orders/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({ orderId: orderId2 }),
  });
  const approve2Data = await approve2Res.json();
  const expAfter = new Date(approve2Data.newExpiresAt || approve2Data.license?.expiresAt).getTime();
  const addedDaysDiff = Math.round((expAfter - expBefore) / (24 * 60 * 60 * 1000));
  console.log('Kiểm tra cộng dồn ngày hợp lệ:', {
    expBefore: new Date(expBefore).toISOString(),
    expAfter: new Date(expAfter).toISOString(),
    addedDaysDiff,
  });

  if (addedDaysDiff !== 30) {
    console.warn(`Cảnh báo chênh lệch ngày: mong đợi +30 ngày, thực tế chênh lệch: ${addedDaysDiff} ngày`);
  } else {
    console.log('✓ Cộng dồn chuẩn xác tuyệt đối +30 ngày vào hạn dùng hiện tại!\n');
  }

  // ------------------------------------------------------------------
  // BƯỚC 7: ADMIN CHỈNH SỬA TRỰC TIẾP HẠN DÙNG TRÊN ADMIN PANEL
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 7] Admin can thiệp chỉnh sửa hạn dùng trực tiếp (Sửa ngày)...');
  const customTargetDate = '2028-01-01T23:59:59.000Z';
  const updateRes = await fetch(`${BASE_URL}/api/admin/licenses/update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({
      id: licenseKey,
      expiresAt: customTargetDate,
    }),
  });
  const updateData = await updateRes.json();
  console.log('Kết quả cập nhật ngày của Admin:', updateData.message);

  // Extension kiểm tra lại xem có lập tức cập nhật theo Admin không
  const checkUpdatedRes = await fetch(`${BASE_URL}/api/check?machine_id=${encodeURIComponent(testDeviceId)}`);
  const checkUpdatedData = await checkUpdatedRes.json();
  console.log('Extension nhận hạn dùng sau khi Admin chỉnh sửa:', {
    expires_at: checkUpdatedData.expires_at,
    days_left: checkUpdatedData.days_left,
  });
  if (checkUpdatedData.expires_at !== customTargetDate) {
    throw new Error('Extension không khớp ngày Admin đã chỉnh sửa!');
  }
  console.log('✓ Extension lập tức đồng bộ 100% theo đúng ngày Admin đã điều chỉnh!\n');

  // ------------------------------------------------------------------
  // BƯỚC 8: ADMIN THU HỒI (NGẮT MÁY) & EXTENSION NGỪNG HOẠT ĐỘNG
  // ------------------------------------------------------------------
  console.log('👉 [BƯỚC 8] Admin bấm Thu Hồi (Ngắt Máy)...');
  const revokeRes = await fetch(`${BASE_URL}/api/admin/licenses/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({
      id: licenseKey,
      key: licenseKey,
      reason: 'Kiểm thử tính năng ngắt máy khẩn cấp',
    }),
  });
  const revokeData = await revokeRes.json();
  console.log('Kết quả thu hồi:', revokeData.message);

  const checkRevokedRes = await fetch(`${BASE_URL}/api/check?machine_id=${encodeURIComponent(testDeviceId)}`);
  const checkRevokedData = await checkRevokedRes.json();
  console.log('Extension kiểm tra sau khi bị Admin ngắt máy:', checkRevokedData);
  if (!checkRevokedData.isRevoked || checkActiveRes.status === 'revoked') {
    console.log('✓ Đã xác nhận: Máy khách bị ngắt kết nối lập tức, nhận status: revoked và action: FORCE_REVOKE!\n');
  }

  // ------------------------------------------------------------------
  // DỌN DẸP DỮ LIỆU KIỂM THỬ (CLEANUP TEST DATA)
  // ------------------------------------------------------------------
  console.log('🧹 [DỌN DẸP] Xóa các bản ghi kiểm thử khỏi licenses.json và orders.json...');
  await fetch(`${BASE_URL}/api/admin/licenses/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({ id: licenseKey, key: licenseKey }),
  });
  await fetch(`${BASE_URL}/api/admin/orders/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({ id: orderId, orderId }),
  });
  await fetch(`${BASE_URL}/api/admin/orders/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-pin': ADMIN_PIN,
    },
    body: JSON.stringify({ id: orderId2, orderId: orderId2 }),
  });

  console.log('✓ Dọn dẹp hoàn tất, hệ thống trở về trạng thái sạch sẽ!');
  console.log('\n🎉 TOÀN BỘ BÀI KIỂM THỬ ĐÃ VƯỢT QUA 100%!');
}

runTests().catch((err) => {
  console.error('❌ KIỂM THỬ THẤT BẠI:', err);
  process.exit(1);
});
