// Test script to verify Multi-Client / Multi-Tab Synchronization
// Đảm bảo mở 2 máy hoặc 2 trình duyệt khác nhau nhận số liệu đồng nhất 100%
const BASE_URL = 'http://localhost:3000';
const ADMIN_PIN = 'Ha26062018$';

async function testMultiClientSync() {
  console.log('========================================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ: ĐỒNG BỘ DỮ LIỆU ĐA MÁY & ĐA TRÌNH DUYỆT (MULTI-CLIENT)');
  console.log('========================================================================\n');

  // Giả lập Client A (Máy 1 / Chrome 1) và Client B (Máy 2 / Chrome 2)
  console.log('👉 [BƯỚC 1] Khởi tạo Client A và Client B cùng đọc số liệu hiện tại từ Server...');
  const resA = await fetch(`${BASE_URL}/api/orders/pending-count`);
  const dataA = await resA.json();

  const resB = await fetch(`${BASE_URL}/api/orders/pending-count`);
  const dataB = await resB.json();

  console.log('Client A Pending Count:', dataA.pendingCount);
  console.log('Client B Pending Count:', dataB.pendingCount);

  if (dataA.pendingCount !== dataB.pendingCount) {
    throw new Error(`Lỗi: Client A (${dataA.pendingCount}) và Client B (${dataB.pendingCount}) nhận số liệu khác nhau!`);
  }
  console.log('✓ [PASS] Client A và Client B đọc ra cùng 1 số lượng đơn chờ duyệt!\n');

  // Kiểm tra danh sách orders và licenses của Client A và B
  const ordersA = await (await fetch(`${BASE_URL}/api/admin/orders`, { headers: { 'x-admin-pin': ADMIN_PIN } })).json();
  const ordersB = await (await fetch(`${BASE_URL}/api/admin/orders`, { headers: { 'x-admin-pin': ADMIN_PIN } })).json();

  if (ordersA.orders.length !== ordersB.orders.length) {
    throw new Error(`Lỗi: Số lượng đơn hàng Client A (${ordersA.orders.length}) != Client B (${ordersB.orders.length})!`);
  }
  console.log(`✓ [PASS] Cả 2 Client cùng nhận chính xác ${ordersA.orders.length} đơn hàng từ Server!\n`);

  // BƯỚC 2: Khách hàng ở ngoài gửi 1 đơn đặt mua mới
  console.log('👉 [BƯỚC 2] Khách hàng đặt mua gói cước mới...');
  const newOrderId = `ord_multi_${Date.now()}`;
  const newDevId = `PC_MULTI_${Date.now()}`;
  await fetch(`${BASE_URL}/api/orders/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: newOrderId,
      pkgName: 'Gói 1 Tháng',
      price: '1.000.000đ',
      clientName: 'Khách Kiểm Thử Đa Trình Duyệt',
      phone: '0977889900',
      deviceId: newDevId,
    }),
  });

  // BƯỚC 3: Cả 2 Client cùng đọc lại pending count
  console.log('👉 [BƯỚC 3] Client A và Client B cùng cập nhật lại số lượng...');
  const countA2 = (await (await fetch(`${BASE_URL}/api/orders/pending-count`)).json()).pendingCount;
  const countB2 = (await (await fetch(`${BASE_URL}/api/orders/pending-count`)).json()).pendingCount;
  console.log('Client A Pending Count sau khi có đơn mới:', countA2);
  console.log('Client B Pending Count sau khi có đơn mới:', countB2);

  if (countA2 !== countB2 || countA2 !== dataA.pendingCount + 1) {
    throw new Error('Lỗi đồng bộ: Client A và B không cùng nhảy lên số đơn mới!');
  }
  console.log('✓ [PASS] Cả 2 Client đều cập nhật lên cùng 1 số đơn mới tức thì!\n');

  // BƯỚC 4: Client A duyệt đơn hàng
  console.log('👉 [BƯỚC 4] Client A bấm Duyệt đơn hàng...');
  const approveRes = await fetch(`${BASE_URL}/api/admin/orders/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-pin': ADMIN_PIN },
    body: JSON.stringify({ orderId: newOrderId }),
  });
  const approveData = await approveRes.json();
  const assignedKey = approveData.assignedKey || approveData.license?.key;

  // BƯỚC 5: Client B kiểm tra danh sách đơn và bản quyền
  console.log('👉 [BƯỚC 5] Client B (Máy 2) kiểm tra trạng thái sau khi Client A duyệt...');
  const ordersB3 = await (await fetch(`${BASE_URL}/api/admin/orders`, { headers: { 'x-admin-pin': ADMIN_PIN } })).json();
  const licensesB3 = await (await fetch(`${BASE_URL}/api/admin/licenses`, { headers: { 'x-admin-pin': ADMIN_PIN } })).json();

  const foundOrdInB = ordersB3.orders.find((o: any) => o.id === newOrderId);
  const foundLicInB = licensesB3.licenses.find((l: any) => l.key === assignedKey);

  if (foundOrdInB?.status !== 'approved') {
    throw new Error('Client B không thấy đơn đã được chuyển sang approved!');
  }
  if (!foundLicInB) {
    throw new Error('Client B không thấy bản quyền VIP mới được cấp!');
  }
  console.log('✓ [PASS] Client B lập tức thấy đơn đã duyệt và bản quyền mới của Client A duyệt!\n');

  // Dọn dẹp
  await fetch(`${BASE_URL}/api/admin/orders/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-pin': ADMIN_PIN },
    body: JSON.stringify({ orderId: newOrderId, id: newOrderId }),
  });
  await fetch(`${BASE_URL}/api/admin/licenses/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-pin': ADMIN_PIN },
    body: JSON.stringify({ id: assignedKey, key: assignedKey }),
  });

  console.log('========================================================================');
  console.log('🎉 KIỂM THỬ ĐỒNG BỘ ĐA MÁY / ĐA TRÌNH DUYỆT THÀNH CÔNG 100%!');
  console.log('========================================================================');
}

testMultiClientSync().catch((err) => {
  console.error('❌ THẤT BẠI:', err);
  process.exit(1);
});
