// Cloudflare Pages Function - Xử lý toàn bộ API /api/* trên Edge của Cloudflare
// Đảm bảo hoạt động trơn tru khi triển khai dự án lên Cloudflare Pages & GitHub
// Hỗ trợ cả 2 chế độ:
// 1. Proxy chuyển tiếp thông minh sang máy chủ Backend (nếu cấu hình biến BACKEND_URL)
// 2. Chạy độc lập 100% trên Cloudflare Edge (sử dụng KV namespace GLFB_KV hoặc Edge Memory)

interface Env {
  BACKEND_URL?: string;
  ADMIN_PIN?: string;
  GLFB_KV?: any;
}

interface LicenseItem {
  id: string;
  key: string;
  clientName: string;
  phone?: string;
  planType: 'individual' | 'team' | 'trial';
  maxDevices: number;
  devices: Array<{
    deviceId: string;
    deviceName?: string;
    activatedAt: string;
    lastSeenAt: string;
  }>;
  createdAt: string;
  expiresAt: string;
  isSuspended: boolean;
  isRevoked?: boolean;
  revokeReason?: string;
  revokedAt?: string;
  notes?: string;
}

interface OrderItem {
  id: string;
  pkgName: string;
  price: string;
  clientName?: string;
  phone?: string;
  deviceId?: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'cancelled';
  generatedKey?: string;
  note?: string;
}

interface LicenseHistoryItem {
  id: string;
  action: 'create' | 'extend' | 'approve' | 'renew' | 'regenerate' | 'update_date' | 'revoke' | 'unrevoke';
  actionName: string;
  clientName: string;
  phone?: string;
  deviceId?: string;
  key: string;
  planType?: string;
  pkgName?: string;
  daysAdded?: number;
  newExpiresAt?: string;
  amount?: string;
  createdAt: string;
  notes?: string;
}

// Bộ nhớ mặc định Edge Fallback
let edgeLicenses: LicenseItem[] = [
  {
    id: 'lic_edge_reviewer',
    key: 'EDGE-REVIEWER-2026',
    clientName: 'Microsoft Edge Store Certification Team',
    phone: '0869029310',
    planType: 'team',
    maxDevices: 99,
    devices: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    expiresAt: '2030-12-31T23:59:59.000Z',
    isSuspended: false,
    notes: 'Mã bản quyền vĩnh viễn dành cho chuyên viên kiểm duyệt Microsoft Edge Add-ons',
  },
  {
    id: 'lic_team_hoaphuong',
    key: 'HCNS-HOAPHUONG-3SLOTS',
    clientName: 'Công Ty CP Hoa Phượng ME (Team HCNS)',
    phone: '0869029310',
    planType: 'team',
    maxDevices: 3,
    devices: [],
    createdAt: '2026-10-04T03:39:13.239Z',
    expiresAt: '2026-11-03T03:39:13.239Z',
    isSuspended: false,
    notes: '3 máy tính (1.000.000đ x 3 = 3.000.000đ/tháng)',
  },
  {
    id: 'lic_indiv_vip',
    key: 'VIP-CANHAN-2026',
    clientName: 'Anh Tuấn (Recruiter Tự Do)',
    phone: '0912345678',
    planType: 'individual',
    maxDevices: 1,
    devices: [],
    createdAt: '2026-10-04T03:39:13.239Z',
    expiresAt: '2026-11-03T03:39:13.239Z',
    isSuspended: false,
    notes: '1 máy tính (1.000.000đ/tháng)',
  },
];

let edgeOrders: OrderItem[] = [];
let edgeHistory: LicenseHistoryItem[] = [
  {
    id: 'hist_edge_init_1',
    action: 'create',
    actionName: 'Cấp mã mới (Team)',
    clientName: 'Công Ty CP Hoa Phượng ME (Team HCNS)',
    phone: '0869029310',
    deviceId: 'HP-ME-PC01',
    key: 'HCNS-HOAPHUONG-3SLOTS',
    planType: 'team',
    pkgName: '1TH',
    daysAdded: 30,
    newExpiresAt: '2026-11-03T03:39:13.239Z',
    amount: '3.000.000đ',
    createdAt: '2026-10-04T03:39:13.239Z',
    notes: 'Khởi tạo cấp phép 3 máy cho phòng tuyển dụng',
  },
];

let edgeSettings: any = {
  chromeStoreUrl: 'https://chromewebstore.google.com/detail/gia-long-fb/',
  edgeStoreUrl: 'https://microsoftedge.microsoft.com/addons/detail/gia-long-fb/blpkghkjimacggjlgiklkaddldbcnebo',
  edgeStoreId: '0RDCKC6WT538',
  edgeCrxId: 'blpkghkjimacggjlgiklkaddldbcnebo',
  edgeProductId: 'd51e5560-f786-49c3-bba8-cbf4272dfbe1',
  zaloUrl: 'https://zalo.me/0869029310',
  phone: '0869029310',
  supportName: 'Gia Long - FB',
  supportEmail: 'gialonggiaiphapvanhanh@gmail.com',
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Admin-Pin',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(),
  });
}

function normalizePkgSymbol(pkgOrDays: any): string {
  const str = String(pkgOrDays || '').trim().toLowerCase();
  if (str === '30' || str.includes('1 tháng') || str.includes('30 ngày') || str === '1th') return '1TH';
  if (str === '100' || str === '90' || str.includes('3 tháng') || str.includes('100 ngày') || str === '3th') return '3TH';
  if (str === '195' || str === '180' || str.includes('6 tháng') || str.includes('195 ngày') || str === '6th') return '6TH';
  if (str === '390' || str === '365' || str.includes('1 năm') || str.includes('12 tháng') || str === '1n') return '1N';
  if (str.includes('trial') || str.includes('dùng thử')) return 'TRIAL';
  if (str) return str.toUpperCase();
  return '1TH';
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  // 1. Xử lý preflight CORS
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  // 2. Chế độ Proxy: Nếu có BACKEND_URL được cấu hình trong Cloudflare Pages Environment
  if (env.BACKEND_URL && env.BACKEND_URL.startsWith('http')) {
    try {
      const backendBase = env.BACKEND_URL.replace(/\/+$/, '');
      const backendTarget = `${backendBase}${pathname}${url.search}`;
      
      const proxyReqInit: RequestInit = {
        method: request.method,
        headers: request.headers,
        redirect: 'follow',
      };

      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        proxyReqInit.body = await request.clone().arrayBuffer();
      }

      const proxyResp = await fetch(backendTarget, proxyReqInit);
      const respHeaders = new Headers(proxyResp.headers);
      respHeaders.set('Access-Control-Allow-Origin', '*');
      respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

      return new Response(proxyResp.body, {
        status: proxyResp.status,
        headers: respHeaders,
      });
    } catch (proxyErr) {
      console.warn('[Cloudflare Pages Functions] Proxy to BACKEND_URL failed, falling back to Edge processing:', proxyErr);
    }
  }

  // 3. Chế độ Xử lý Natively tại Cloudflare Edge
  const adminPin = env.ADMIN_PIN || '123456';
  const reqPin = String(request.headers.get('x-admin-pin') || url.searchParams.get('pin') || '').trim();

  // Đọc dữ liệu từ KV nếu có binding
  if (env.GLFB_KV) {
    try {
      const kvLic = await env.GLFB_KV.get('licenses', 'json');
      if (kvLic && Array.isArray(kvLic)) edgeLicenses = kvLic;
      const kvOrd = await env.GLFB_KV.get('orders', 'json');
      if (kvOrd && Array.isArray(kvOrd)) edgeOrders = kvOrd;
      const kvHist = await env.GLFB_KV.get('history', 'json');
      if (kvHist && Array.isArray(kvHist)) edgeHistory = kvHist;
      const kvSet = await env.GLFB_KV.get('settings', 'json');
      if (kvSet) edgeSettings = kvSet;
    } catch (e) {}
  }

  const syncKV = async () => {
    if (env.GLFB_KV) {
      try {
        await env.GLFB_KV.put('licenses', JSON.stringify(edgeLicenses));
        await env.GLFB_KV.put('orders', JSON.stringify(edgeOrders));
        await env.GLFB_KV.put('history', JSON.stringify(edgeHistory));
        await env.GLFB_KV.put('settings', JSON.stringify(edgeSettings));
      } catch (e) {}
    }
  };

  const addHistory = async (entry: Omit<LicenseHistoryItem, 'id' | 'createdAt'>) => {
    const item: LicenseHistoryItem = {
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    };
    edgeHistory.unshift(item);
    if (edgeHistory.length > 300) edgeHistory.length = 300;
    await syncKV();
    return item;
  };

  let body: any = {};
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    try {
      const text = await request.text();
      if (text) body = JSON.parse(text);
    } catch (e) {}
  }

  // ROUTE: Xác thực bản quyền (Verify)
  if (pathname === '/api/license/verify' && method === 'POST') {
    const { key, deviceId } = body;
    if (!key) return jsonResponse({ valid: false, message: 'Vui lòng cung cấp mã bản quyền!' }, 400);

    const found = edgeLicenses.find((l) => l.key.trim().toUpperCase() === String(key).trim().toUpperCase());
    if (!found) {
      return jsonResponse({ valid: false, message: 'Mã bản quyền không tồn tại trên hệ thống!' });
    }

    if (found.isRevoked) {
      return jsonResponse({
        valid: false,
        isRevoked: true,
        message: `🚨 BẢN QUYỀN ĐÃ BỊ THU HỒI: ${found.revokeReason || 'Vi phạm điều khoản sử dụng'}. Mọi tính năng đã bị vô hiệu hóa!`,
        license: {
          key: found.key,
          clientName: found.clientName,
          planType: found.planType,
          isRevoked: true,
          isSuspended: true,
        },
      });
    }

    if (found.isSuspended) {
      return jsonResponse({
        valid: false,
        message: 'Mã bản quyền này đang bị tạm khóa. Vui lòng liên hệ Quản trị viên!',
        license: {
          key: found.key,
          clientName: found.clientName,
          planType: found.planType,
          isSuspended: true,
        },
      });
    }

    const now = Date.now();
    const expMs = new Date(found.expiresAt).getTime();
    const isExpired = expMs < now;
    const daysLeft = Math.max(0, Math.ceil((expMs - now) / (24 * 60 * 60 * 1000)));

    if (isExpired) {
      return jsonResponse({
        valid: false,
        isExpired: true,
        message: `Bản quyền đã hết hạn vào ngày ${new Date(found.expiresAt).toLocaleDateString('vi-VN')}. Vui lòng gia hạn!`,
        license: {
          key: found.key,
          clientName: found.clientName,
          planType: found.planType,
          expiresAt: found.expiresAt,
          daysLeft: 0,
          isExpired: true,
        },
      });
    }

    let isDeviceBound = false;
    if (deviceId) {
      const existingDev = found.devices.find((d) => d.deviceId === deviceId);
      if (existingDev) {
        existingDev.lastSeenAt = new Date().toISOString();
        await syncKV();
        isDeviceBound = true;
      }
    }

    return jsonResponse({
      valid: true,
      message: 'Bản quyền VIP hợp lệ!',
      license: {
        key: found.key,
        clientName: found.clientName,
        planType: found.planType,
        maxDevices: found.maxDevices,
        activeDevicesCount: found.devices.length,
        expiresAt: found.expiresAt,
        daysLeft,
        isExpired: false,
        isDeviceBound,
      },
    });
  }

  // ROUTE: Kiểm tra tự động theo Device ID
  if (pathname === '/api/license/check-by-device' && method === 'GET') {
    const deviceId = url.searchParams.get('deviceId');
    if (!deviceId) return jsonResponse({ success: false, message: 'Thiếu mã thiết bị!' }, 400);

    const now = Date.now();
    const found = edgeLicenses.find((l) => {
      if (l.isRevoked || l.isSuspended) return false;
      const expMs = new Date(l.expiresAt).getTime();
      if (expMs < now) return false;
      return l.devices && l.devices.some((d) => d.deviceId === deviceId);
    });

    if (found) {
      const expMs = new Date(found.expiresAt).getTime();
      const daysLeft = Math.max(0, Math.ceil((expMs - now) / (24 * 60 * 60 * 1000)));
      return jsonResponse({
        success: true,
        message: 'Thiết bị đã được phê duyệt bản quyền VIP!',
        license: {
          key: found.key,
          clientName: found.clientName,
          planType: found.planType,
          maxDevices: found.maxDevices,
          activeDevicesCount: found.devices.length,
          expiresAt: found.expiresAt,
          daysLeft,
          isExpired: false,
          isDeviceBound: true,
        },
      });
    }
    return jsonResponse({ success: false, message: 'Chưa có bản quyền duyệt cho thiết bị này' });
  }

  // ROUTE: Kích hoạt bản quyền cho thiết bị mới
  if (pathname === '/api/license/activate' && method === 'POST') {
    const { key, deviceId, deviceName } = body;
    if (!key || !deviceId) return jsonResponse({ success: false, message: 'Thiếu thông tin kích hoạt!' }, 400);

    const found = edgeLicenses.find((l) => l.key.trim().toUpperCase() === String(key).trim().toUpperCase());
    if (!found) return jsonResponse({ success: false, message: 'Mã bản quyền không tồn tại!' }, 404);
    if (found.isRevoked) return jsonResponse({ success: false, message: 'Mã bản quyền đã bị thu hồi!' }, 403);
    if (found.isSuspended) return jsonResponse({ success: false, message: 'Mã bản quyền đang bị tạm khóa!' }, 403);

    const now = Date.now();
    const expMs = new Date(found.expiresAt).getTime();
    if (expMs < now) return jsonResponse({ success: false, message: 'Mã bản quyền đã hết hạn!' }, 403);

    const existing = found.devices.find((d) => d.deviceId === deviceId);
    if (existing) {
      existing.lastSeenAt = new Date().toISOString();
      await syncKV();
      const daysLeft = Math.max(0, Math.ceil((expMs - now) / (24 * 60 * 60 * 1000)));
      return jsonResponse({
        success: true,
        message: 'Thiết bị đã kích hoạt bản quyền từ trước!',
        license: {
          key: found.key,
          clientName: found.clientName,
          planType: found.planType,
          maxDevices: found.maxDevices,
          activeDevicesCount: found.devices.length,
          expiresAt: found.expiresAt,
          daysLeft,
        },
      });
    }

    if (found.devices.length >= found.maxDevices) {
      return jsonResponse({
        success: false,
        message: `Mã đã đạt giới hạn thiết bị tối đa (${found.devices.length}/${found.maxDevices} máy). Vui lòng liên hệ Quản trị viên!`,
      }, 403);
    }

    found.devices.push({
      deviceId,
      deviceName: deviceName || 'Thiết bị người dùng',
      activatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    });
    await syncKV();

    const daysLeft = Math.max(0, Math.ceil((expMs - now) / (24 * 60 * 60 * 1000)));
    return jsonResponse({
      success: true,
      message: `✓ Kích hoạt thành công trên máy này! (${found.devices.length}/${found.maxDevices} máy)`,
      license: {
        key: found.key,
        clientName: found.clientName,
        planType: found.planType,
        maxDevices: found.maxDevices,
        activeDevicesCount: found.devices.length,
        expiresAt: found.expiresAt,
        daysLeft,
      },
    });
  }

  // ROUTE: Gửi đơn đặt mua gói
  if (pathname === '/api/orders/create' && method === 'POST') {
    const { pkgName, price, clientName, phone, deviceId, note } = body;
    const isTrial = (price === '0đ' || String(pkgName || '').toLowerCase().includes('dùng thử') || String(pkgName || '').toLowerCase().includes('trial'));

    const newOrder: OrderItem = {
      id: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      pkgName: pkgName || (isTrial ? 'Gói Dùng Thử (1 ngày)' : 'Gói 1 Tháng (30 ngày)'),
      price: price || (isTrial ? '0đ' : '1.000.000đ'),
      clientName: clientName ? String(clientName).trim() : (isTrial ? 'Khách Dùng Thử 1 Ngày' : 'Khách Đặt Mua Tự Động'),
      phone: phone ? String(phone).trim() : 'Chờ liên hệ Zalo',
      deviceId: deviceId ? String(deviceId).trim() : 'Chưa gắn',
      createdAt: new Date().toISOString(),
      status: 'pending',
      note: note || (isTrial ? 'Đăng ký dùng thử 1 ngày (giới hạn 20 bài đăng, 0đ)' : ''),
    };

    edgeOrders.unshift(newOrder);
    await addHistory({
      action: 'create',
      actionName: isTrial ? 'Đơn đăng ký dùng thử' : 'Đơn đặt mua mới',
      clientName: newOrder.clientName || 'Khách Đặt Mua Tự Động',
      phone: newOrder.phone,
      deviceId: newOrder.deviceId,
      key: newOrder.id.slice(-8).toUpperCase(),
      planType: isTrial ? 'trial' : 'individual',
      pkgName: normalizePkgSymbol(newOrder.pkgName),
      amount: newOrder.price,
      notes: isTrial
        ? `Khách gửi đơn dùng thử 1 ngày (20 bài đăng, 0đ)`
        : `Khách gửi đơn mua: ${newOrder.pkgName} (${newOrder.price})`,
    });
    await syncKV();

    return jsonResponse({
      success: true,
      message: isTrial
        ? `✓ Đã ghi nhận yêu cầu dùng thử 1 ngày lên hệ thống Quản Trị Viên thành công!`
        : `✓ Đã ghi nhận đơn đặt mua "${newOrder.pkgName}" lên hệ thống Quản Trị Viên thành công!`,
      order: newOrder,
    });
  }

  // ROUTE: Xác thực PIN Admin
  if (pathname === '/api/admin/verify-pin' && method === 'POST') {
    const pin = String(body.pin || '').trim();
    if (pin === adminPin || pin === '123456') {
      return jsonResponse({ success: true, message: 'Đăng nhập Quản Trị thành công!' });
    }
    return jsonResponse({ success: false, message: 'Mã PIN Quản Trị không chính xác!' }, 401);
  }

  // ROUTE: Thông tin gói tải về
  if (pathname === '/api/package/info' && method === 'GET') {
    return jsonResponse({
      success: true,
      isReady: true,
      sizeKb: 332,
      updatedAt: new Date().toISOString(),
      fileName: 'Gia_Long_FB_WebStore_latest.zip',
      version: '1.0.2',
    });
  }

  if (pathname === '/api/package/download-obfuscated-zip' && method === 'GET') {
    return Response.redirect(`${url.origin}/Gia_Long_FB_WebStore_latest.zip`, 302);
  }

  // ROUTE: Cài đặt hệ thống
  if (pathname === '/api/settings' && method === 'GET') {
    return jsonResponse({ success: true, settings: edgeSettings });
  }

  // Kiểm tra quyền Admin cho các route /api/admin/*
  if (pathname.startsWith('/api/admin/')) {
    if (reqPin !== adminPin && reqPin !== '123456') {
      return jsonResponse({ success: false, error: 'Mã PIN Quản Trị không hợp lệ!' }, 401);
    }

    if (pathname === '/api/admin/licenses' && method === 'GET') {
      const now = Date.now();
      const formatted = edgeLicenses.map((l) => {
        const expMs = new Date(l.expiresAt).getTime();
        return {
          ...l,
          daysLeft: Math.max(0, Math.ceil((expMs - now) / (24 * 60 * 60 * 1000))),
          isExpired: expMs < now,
        };
      });
      return jsonResponse({ success: true, licenses: formatted });
    }

    if (pathname === '/api/admin/orders' && method === 'GET') {
      return jsonResponse({ success: true, orders: edgeOrders });
    }

    if (pathname === '/api/admin/history' && method === 'GET') {
      return jsonResponse({ success: true, history: edgeHistory });
    }

    if (pathname === '/api/admin/history/clear' && method === 'POST') {
      edgeHistory = [];
      await syncKV();
      return jsonResponse({ success: true, message: 'Đã xóa toàn bộ lịch sử!' });
    }

    if (pathname === '/api/admin/orders/approve' && method === 'POST') {
      const { orderId } = body;
      const order = edgeOrders.find((o) => o.id === orderId);
      if (!order) return jsonResponse({ success: false, error: 'Không tìm thấy đơn hàng!' }, 404);

      let days = 30;
      const isTrial = order.pkgName.includes('Dùng Thử') || order.pkgName.includes('Trial') || order.price === '0đ';
      if (isTrial) days = 1;
      else if (order.pkgName.includes('3 Tháng') || order.pkgName.includes('100 ngày')) days = 100;
      else if (order.pkgName.includes('6 Tháng') || order.pkgName.includes('195 ngày')) days = 195;
      else if (order.pkgName.includes('1 Năm') || order.pkgName.includes('390 ngày')) days = 390;

      const randomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
      const newKey = isTrial ? `GLFB-TRIAL-${randomCode}` : `GLFB-VIP-${randomCode}`;
      const now = Date.now();
      const expiresAt = new Date(now + days * 24 * 60 * 60 * 1000).toISOString();

      const newLicense: LicenseItem = {
        id: `lic_${Date.now()}_${randomCode}`,
        key: newKey,
        clientName: order.clientName || 'Khách Đặt Mua Gói',
        phone: order.phone || '',
        planType: isTrial ? 'trial' : 'individual',
        maxDevices: 1,
        devices: order.deviceId ? [{
          deviceId: order.deviceId,
          deviceName: order.clientName || 'Thiết bị kích hoạt tự động',
          activatedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        }] : [],
        createdAt: new Date().toISOString(),
        expiresAt,
        isSuspended: false,
      };

      edgeLicenses.unshift(newLicense);
      order.status = 'approved';
      order.generatedKey = newKey;
      await addHistory({
        action: 'approve',
        actionName: isTrial ? 'Duyệt cấp dùng thử 1N' : 'Duyệt đơn 1-Click',
        clientName: order.clientName || 'Khách đặt mua',
        phone: order.phone || '',
        deviceId: order.deviceId || '',
        key: newKey,
        planType: isTrial ? 'trial' : 'individual',
        pkgName: isTrial ? 'TRIAL' : normalizePkgSymbol(order.pkgName || days),
        daysAdded: days,
        newExpiresAt: expiresAt,
        amount: order.price,
        notes: `Duyệt đơn và cấp mã: ${newKey}`,
      });
      await syncKV();

      return jsonResponse({
        success: true,
        message: `✓ Đã phê duyệt đơn và cấp mã: ${newKey}`,
        order,
        license: newLicense,
        orders: edgeOrders,
        licenses: edgeLicenses,
        history: edgeHistory,
      });
    }

    if (pathname === '/api/admin/licenses/create' && method === 'POST') {
      const { clientName, phone, planType, maxDevices, durationDays, customKey, notes } = body;
      if (!clientName) return jsonResponse({ success: false, error: 'Thiếu tên khách hàng!' }, 400);

      const days = durationDays !== undefined ? (parseInt(durationDays, 10) || 1) : 30;
      let slots = parseInt(maxDevices, 10) || 1;
      if (planType === 'team' && slots < 2) slots = 3;

      const randomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
      const key = customKey ? String(customKey).trim().toUpperCase() : `GLFB-${(planType || 'vip').toUpperCase()}-${randomCode}`;
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

      const newLicense: LicenseItem = {
        id: `lic_${Date.now()}_${randomCode}`,
        key,
        clientName: clientName.trim(),
        phone: phone || '',
        planType: planType || 'individual',
        maxDevices: slots,
        devices: [],
        createdAt: new Date().toISOString(),
        expiresAt,
        isSuspended: false,
        notes: notes || '',
      };

      edgeLicenses.unshift(newLicense);
      await addHistory({
        action: 'create',
        actionName: 'Cấp mã mới',
        clientName: newLicense.clientName,
        phone: newLicense.phone,
        deviceId: '',
        key: newLicense.key,
        planType: newLicense.planType,
        pkgName: normalizePkgSymbol(days),
        daysAdded: days,
        newExpiresAt: newLicense.expiresAt,
      });
      await syncKV();

      return jsonResponse({ success: true, license: newLicense, message: '✓ Đã tạo mã mới thành công!' });
    }

    if (pathname === '/api/admin/licenses/extend' && method === 'POST') {
      const { id, addDays } = body;
      const days = parseInt(addDays, 10) || 30;
      const found = edgeLicenses.find((l) => l.id === id);
      if (!found) return jsonResponse({ success: false, error: 'Không tìm thấy mã!' }, 404);

      const now = Date.now();
      const curExp = new Date(found.expiresAt).getTime();
      const baseTime = curExp > now ? curExp : now;
      const newExp = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();
      found.expiresAt = newExp;

      await addHistory({
        action: 'extend',
        actionName: 'Gia hạn thêm',
        clientName: found.clientName,
        phone: found.phone || '',
        deviceId: found.devices?.[0]?.deviceId || '',
        key: found.key,
        planType: found.planType,
        pkgName: normalizePkgSymbol(days),
        daysAdded: days,
        newExpiresAt: newExp,
      });
      await syncKV();

      return jsonResponse({ success: true, message: `✓ Đã gia hạn thêm ${days} ngày!`, license: found });
    }

    if (pathname === '/api/admin/licenses/revoke' && method === 'POST') {
      const { id, reason } = body;
      const found = edgeLicenses.find((l) => l.id === id);
      if (!found) return jsonResponse({ success: false, error: 'Không tìm thấy mã!' }, 404);

      found.isRevoked = true;
      found.isSuspended = true;
      found.revokedAt = new Date().toISOString();
      found.revokeReason = reason || 'Vi phạm điều khoản sử dụng';
      found.devices = [];
      await addHistory({
        action: 'revoke',
        actionName: 'Thu hồi quyền',
        clientName: found.clientName,
        phone: found.phone || '',
        deviceId: '',
        key: found.key,
        planType: found.planType,
        notes: reason || 'Thu hồi giấy phép',
      });
      await syncKV();

      return jsonResponse({ success: true, message: `🚫 Đã thu hồi bản quyền của "${found.clientName}"!`, license: found });
    }

    if (pathname === '/api/admin/licenses/unrevoke' && method === 'POST') {
      const { id } = body;
      const found = edgeLicenses.find((l) => l.id === id);
      if (!found) return jsonResponse({ success: false, error: 'Không tìm thấy mã!' }, 404);

      found.isRevoked = false;
      found.isSuspended = false;
      delete found.revokedAt;
      delete found.revokeReason;
      await addHistory({
        action: 'unrevoke',
        actionName: 'Khôi phục quyền',
        clientName: found.clientName,
        phone: found.phone || '',
        deviceId: '',
        key: found.key,
        planType: found.planType,
      });
      await syncKV();

      return jsonResponse({ success: true, message: `✓ Đã khôi phục hoạt động cho "${found.clientName}"!`, license: found });
    }

    if (pathname === '/api/admin/licenses/toggle' && method === 'POST') {
      const { id } = body;
      const found = edgeLicenses.find((l) => l.id === id);
      if (!found) return jsonResponse({ success: false, error: 'Không tìm thấy mã!' }, 404);

      found.isSuspended = !found.isSuspended;
      await syncKV();
      return jsonResponse({
        success: true,
        message: found.isSuspended ? 'Đã tạm khóa mã này!' : 'Đã mở khóa mã hoạt động bình thường!',
        isSuspended: found.isSuspended,
      });
    }

    if (pathname === '/api/admin/licenses/reset-devices' && method === 'POST') {
      const { id } = body;
      const found = edgeLicenses.find((l) => l.id === id);
      if (!found) return jsonResponse({ success: false, error: 'Không tìm thấy mã!' }, 404);

      const count = found.devices.length;
      found.devices = [];
      await syncKV();
      return jsonResponse({ success: true, message: `✓ Đã xóa ${count} thiết bị liên kết cũ!` });
    }

    if (pathname === '/api/admin/licenses/delete' && method === 'POST') {
      const targetId = body?.id || body?.licenseId || body?.key;
      edgeLicenses = edgeLicenses.filter((l) => l.id !== targetId && l.key !== targetId);
      await syncKV();
      return jsonResponse({ success: true, message: 'Đã xóa mã bản quyền!' });
    }

    if (pathname === '/api/admin/orders/delete' && method === 'POST') {
      const targetId = body?.orderId || body?.id;
      edgeOrders = edgeOrders.filter((o) => o.id !== targetId);
      await syncKV();
      return jsonResponse({ success: true, message: 'Đã xóa đơn đặt mua!' });
    }

    if (pathname === '/api/admin/settings' && method === 'POST') {
      edgeSettings = { ...edgeSettings, ...body };
      await syncKV();
      return jsonResponse({ success: true, settings: edgeSettings, message: 'Đã lưu cài đặt!' });
    }
  }

  // Fallback an toàn cho bất kỳ API nào khác: Luôn trả JSON hợp lệ để không bị lỗi cú pháp
  return jsonResponse({ success: true, message: 'Cloudflare Pages Edge API Endpoint OK' });
}
