// Comprehensive End-to-End System Integration & Sync Test (5 Iterations)
import assert from 'assert';

async function runComprehensiveTests() {
  console.log('========================================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ TOÀN DIỆN HỆ THỐNG & ĐỒNG BỘ (5 VÒNG LẶP ITERATIONS)');
  console.log('========================================================================');

  const BASE_URL = 'http://localhost:3000';
  const ADMIN_PIN = 'Ha26062018$';

  for (let cycle = 1; cycle <= 5; cycle++) {
    console.log(`\n--- [VÒNG LẶP / TEST CYCLE ${cycle} / 5] ---`);

    // 1. Test System Status & Health
    const statusRes = await fetch(`${BASE_URL}/api/admin/system/status`, {
      headers: { 'x-admin-pin': ADMIN_PIN },
    });
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.success, true, `Cycle ${cycle}: System status must succeed`);
    console.log(`  ✓ [Vòng ${cycle}] Kiểm tra trạng thái hệ thống thành công (D1: ${statusData.d1Active}, KV: ${statusData.kvActive})`);

    // 2. Test Fetching Licenses & Orders
    const licRes = await fetch(`${BASE_URL}/api/admin/licenses`, {
      headers: { 'x-admin-pin': ADMIN_PIN },
    });
    const licData = await licRes.json();
    assert.strictEqual(licData.success, true, `Cycle ${cycle}: Fetch licenses must succeed`);
    console.log(`  ✓ [Vòng ${cycle}] Tải danh sách bản quyền thành công (${licData.licenses.length} mã)`);

    const ordRes = await fetch(`${BASE_URL}/api/admin/orders`, {
      headers: { 'x-admin-pin': ADMIN_PIN },
    });
    const ordData = await ordRes.json();
    assert.strictEqual(ordData.success, true, `Cycle ${cycle}: Fetch orders must succeed`);
    console.log(`  ✓ [Vòng ${cycle}] Tải danh sách đơn hàng thành công (${ordData.orders.length} đơn)`);

    // 3. Simulate New Order Submission (Client side action)
    const testPhone = `09${Math.floor(10000000 + Math.random() * 90000000)}`;
    const testDevId = `GLFB-TEST-DEV-${cycle}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const testOrderPayload = {
      pkgName: cycle % 2 === 0 ? 'Gói 12 Tháng' : 'Gói Dùng Thử 1 Ngày',
      price: cycle % 2 === 0 ? '10.800.000đ' : '0đ',
      clientName: `Khách Kiểm Thử Vòng ${cycle}`,
      phone: testPhone,
      deviceId: testDevId,
      note: `Đơn test tự động vòng ${cycle}`,
    };

    // We can simulate order approval directly or submit via approval flow
    const approveRes = await fetch(`${BASE_URL}/api/admin/orders/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pin': ADMIN_PIN,
      },
      body: JSON.stringify({
        orderId: `ord_test_${cycle}_${Date.now()}`,
        order: testOrderPayload,
      }),
    });
    const approveData = await approveRes.json();
    assert.strictEqual(approveData.success, true, `Cycle ${cycle}: Order approval must succeed`);
    assert.ok(approveData.license, `Cycle ${cycle}: Approved order must generate or attach license`);
    console.log(`  ✓ [Vòng ${cycle}] Phê duyệt đơn hàng thành công! Key cấp: ${approveData.license.key}`);

    // 4. Test Updating Customer Info
    const updateRes = await fetch(`${BASE_URL}/api/admin/licenses/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-pin': ADMIN_PIN,
      },
      body: JSON.stringify({
        id: approveData.license.id,
        clientName: `Khách Đã Cập Nhật Vòng ${cycle}`,
        phone: testPhone,
        notes: `Ghi chú kiểm thử cập nhật thông tin vòng ${cycle}`,
      }),
    });
    const updateData = await updateRes.json();
    assert.strictEqual(updateData.success, true, `Cycle ${cycle}: Customer info update must succeed`);
    console.log(`  ✓ [Vòng ${cycle}] Cập nhật thông tin khách hàng thành công!`);

    // 5. Test History List
    const histRes = await fetch(`${BASE_URL}/api/admin/history`, {
      headers: { 'x-admin-pin': ADMIN_PIN },
    });
    const histData = await histRes.json();
    assert.strictEqual(histData.success, true, `Cycle ${cycle}: History fetch must succeed`);
    assert.ok(histData.history.length > 0, `Cycle ${cycle}: History must contain records`);
    console.log(`  ✓ [Vòng ${cycle}] Kiểm tra lịch sử hệ thống thành công (${histData.history.length} bản ghi)`);
  }

  console.log('\n========================================================================');
  console.log('🎉 KIỂM THỬ TOÀN DIỆN 5 VÒNG LẶP HOÀN TẤT THÀNH CÔNG 100%! HỆ THỐNG HOẠT ĐỘNG THÔNG SUỐT, ỔN ĐỊNH VÀ ĐỒNG BỘ.');
  console.log('========================================================================');
}

runComprehensiveTests().catch((err) => {
  console.error('❌ Kiểm thử thất bại:', err);
  process.exit(1);
});
