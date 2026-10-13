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
  aliasKeys?: string[];
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

// Bộ nhớ mặc định Edge (Khởi tạo rỗng, không tạo người dùng mẫu để tránh tái xuất hiện sau khi xóa)
let edgeLicenses: LicenseItem[] = [];
let edgeOrders: OrderItem[] = [];
let edgeHistory: LicenseHistoryItem[] = [];
let edgeRevokedKeys: string[] = [];


// Xác định số ngày thời hạn theo tên gói & mức giá (kèm ngày tặng theo chính sách mới)
function getOrderDurationDays(pkgName?: string, price?: string): number {
  const p = (pkgName || '').toLowerCase();
  const pr = (price || '').toLowerCase();
  if (p.includes('dùng thử') || p.includes('trial') || pr === '0đ' || p.includes('1 ngày')) return 1;
  if (p.includes('3 tháng') || p.includes('90 ngày') || p.includes('100 ngày') || p.includes('105 ngày')) return 100;
  if (p.includes('6 tháng') || p.includes('180 ngày') || p.includes('195 ngày') || p.includes('210 ngày')) return 195;
  if (p.includes('1 năm') || p.includes('12 tháng') || p.includes('360 ngày') || p.includes('365 ngày') || p.includes('390 ngày') || p.includes('420 ngày')) return 390;
  if (p.includes('1 tháng') || p.includes('30 ngày')) return 30;
  return 30;
}

// Tự động cộng dồn thời hạn các gói đã duyệt cho cùng 1 máy / số điện thoại
function autoConsolidateEdgeLicensesAndOrders(): { licenses: LicenseItem[]; orders: OrderItem[] } {
  const approvedOrders = edgeOrders.filter((o) => o.status === 'approved');
  const grouped = new Map<string, OrderItem[]>();
  for (const ord of approvedOrders) {
    const devId = (ord.deviceId || '').trim().toLowerCase();
    const phone = (ord.phone || '').trim().replace(/\D/g, '');
    let groupKey = '';
    if (devId && devId !== 'chưa gắn' && devId !== 'chuagan' && !devId.includes('đang lấy') && !devId.includes('dang lay')) {
      groupKey = `dev:${devId}`;
    } else if (phone && phone.length >= 8) {
      groupKey = `phone:${phone}`;
    }
    if (groupKey) {
      if (!grouped.has(groupKey)) grouped.set(groupKey, []);
      grouped.get(groupKey)!.push(ord);
    }
  }

  for (const [groupKey, ords] of grouped.entries()) {
    if (ords.length === 0) continue;
    const devId = groupKey.startsWith('dev:') ? groupKey.replace('dev:', '') : '';
    const phone = groupKey.startsWith('phone:') ? groupKey.replace('phone:', '') : '';

    const isOrderRevoked = ords.some((o) => {
      const ordId = (o.id || '').trim().toUpperCase();
      const gk = (o.generatedKey || '').trim().toUpperCase();
      const dev = (o.deviceId || '').trim().toUpperCase();
      const ph = (o.phone || '').trim().replace(/\D/g, '');
      const revUpper = edgeRevokedKeys.map((r) => String(r).trim().toUpperCase());
      if (ordId && revUpper.includes(ordId)) return true;
      if (gk && revUpper.includes(gk)) return true;
      if (dev && (revUpper.includes(dev) || revUpper.includes(`DEV:${dev}`))) return true;
      if (ph && (revUpper.includes(ph) || revUpper.includes(`PHONE:${ph}`))) return true;
      return false;
    });
    if (isOrderRevoked) continue;

    let totalDays = 0;
    let earliestOrderMs = Date.now();
    for (const o of ords) {
      const d = getOrderDurationDays(o.pkgName, o.price);
      totalDays += d;
      const t = new Date(o.createdAt).getTime();
      if (!isNaN(t) && t < earliestOrderMs) earliestOrderMs = t;
    }

    const matchedLics = edgeLicenses.filter((l) => {
      if (l.isRevoked) return false;
      if (devId && l.devices?.some((d) => d.deviceId.toLowerCase() === devId)) return true;
      if (phone && l.phone && l.phone.replace(/\D/g, '') === phone) return true;
      if (ords.some((o) => o.generatedKey && l.key.toUpperCase() === o.generatedKey.toUpperCase())) return true;
      return false;
    });

    const firstValidDev = ords.find((o) => o.deviceId && o.deviceId !== 'Chưa gắn' && !o.deviceId.includes('đang lấy') && !o.deviceId.includes('dang lay'))?.deviceId || devId;

    if (matchedLics.length === 0) {
      continue;
    }
    const primaryLic = matchedLics[0];
    const aliasSet = new Set<string>(primaryLic.aliasKeys || []);
      if (matchedLics.length > 1) {
        for (const ml of matchedLics.slice(1)) {
          aliasSet.add(ml.key);
          if (ml.aliasKeys) ml.aliasKeys.forEach((k) => aliasSet.add(k));
          if (ml.devices) {
            for (const d of ml.devices) {
              if (!primaryLic.devices.some((pd) => pd.deviceId.toLowerCase() === d.deviceId.toLowerCase())) {
                primaryLic.devices.push(d);
              }
            }
          }
        }
        edgeLicenses = edgeLicenses.filter((l) => !matchedLics.slice(1).some((ml) => ml.id === l.id));
      }
      for (const o of ords) {
        if (o.generatedKey && o.generatedKey !== primaryLic.key) aliasSet.add(o.generatedKey);
        o.generatedKey = primaryLic.key;
      }
      primaryLic.aliasKeys = Array.from(aliasSet);

      if (firstValidDev) {
        if (!primaryLic.devices.some((d) => d.deviceId.toLowerCase() === firstValidDev.toLowerCase())) {
          primaryLic.devices.push({
            deviceId: firstValidDev,
            deviceName: ords[0].clientName || primaryLic.clientName || 'Thiết bị đặt mua',
            activatedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          });
        }
      }

      const licCreatedMs = new Date(primaryLic.createdAt).getTime();
      const baseMs = !isNaN(licCreatedMs) && licCreatedMs < earliestOrderMs ? licCreatedMs : earliestOrderMs;
      const finalExpMs = baseMs + totalDays * 24 * 60 * 60 * 1000;
      primaryLic.expiresAt = new Date(finalExpMs).toISOString();
      const pkgListStr = ords.map((o) => `${o.pkgName} (+${getOrderDurationDays(o.pkgName, o.price)}n)`).join(' + ');
      primaryLic.notes = `Bản quyền VIP cộng dồn ${ords.length} gói: ${pkgListStr} = Tổng ${totalDays} ngày (Hạn dùng đến ${new Date(finalExpMs).toLocaleDateString('vi-VN')})`;
    }
  }
  return { licenses: edgeLicenses, orders: edgeOrders };
}

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

  // 2. Chế độ Proxy (Chỉ kích hoạt khi người dùng cấu hình biến môi trường BACKEND_URL riêng biệt)
  if (env.BACKEND_URL && env.BACKEND_URL.startsWith('http')) {
    try {
      const centralBackend = env.BACKEND_URL.replace(/\/+$/, '');
      const backendTarget = `${centralBackend}${pathname}${url.search}`;
      const proxyReqInit: RequestInit = {
        method: request.method,
        headers: request.headers,
        redirect: 'follow',
      };

      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        proxyReqInit.body = await request.clone().arrayBuffer();
      }

      const proxyResp = await fetch(backendTarget, proxyReqInit);
      // Chỉ chấp nhận nếu phản hồi thành công 2xx (Tránh các lỗi 302 chuyển hướng Cookie hoặc HTML lỗi)
      const contentType = proxyResp.headers.get('content-type') || '';
      if (proxyResp && proxyResp.status >= 200 && proxyResp.status < 300 && !contentType.includes('text/html')) {
        const respHeaders = new Headers(proxyResp.headers);
        respHeaders.set('Access-Control-Allow-Origin', '*');
        respHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        return new Response(proxyResp.body, {
          status: proxyResp.status,
          headers: respHeaders,
        });
      }
    } catch (proxyErr) {
      console.warn('[Cloudflare Pages Functions] Proxy to Central Backend failed, falling back to Native Edge processing:', proxyErr);
    }
  }

  // 3. Chế độ Xử lý Natively tại Cloudflare Edge
  let adminPin = env.ADMIN_PIN || 'Ha26062018$';
  const reqPin = String(request.headers.get('x-admin-pin') || url.searchParams.get('pin') || '').trim();

  // Đọc dữ liệu từ KV hoặc REST Cloud Database
  if (env.GLFB_KV) {
    try {
      const kvPin = await env.GLFB_KV.get('admin_pin', 'text');
      if (kvPin && kvPin.trim()) {
        adminPin = kvPin.trim();
      }
      const kvLic = await env.GLFB_KV.get('licenses', 'json');
      if (kvLic && Array.isArray(kvLic)) edgeLicenses = kvLic;
      const kvOrd = await env.GLFB_KV.get('orders', 'json');
      if (kvOrd && Array.isArray(kvOrd)) edgeOrders = kvOrd;
      const kvHist = await env.GLFB_KV.get('history', 'json');
      if (kvHist && Array.isArray(kvHist)) edgeHistory = kvHist;
      const kvRev = await env.GLFB_KV.get('revokedKeys', 'json');
      if (kvRev && Array.isArray(kvRev)) edgeRevokedKeys = kvRev;
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
        await env.GLFB_KV.put('revokedKeys', JSON.stringify(edgeRevokedKeys));
        await env.GLFB_KV.put('settings', JSON.stringify(edgeSettings));
      } catch (e) {
        console.warn('[Cloudflare KV] Lỗi ghi dữ liệu KV:', e);
      }
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
      return jsonResponse({
        valid: false,
        isRevoked: true,
        isDeleted: true,
        action: 'FORCE_REVOKE',
        message: '🚨 Mã bản quyền không tồn tại hoặc đã bị xóa khỏi hệ thống! Toàn bộ tính năng đã bị chấm dứt ngay lập tức.',
      });
    }

    if (found.isRevoked) {
      return jsonResponse({
        valid: false,
        isRevoked: true,
        action: 'FORCE_REVOKE',
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

  // ROUTE: Kiểm tra tự động theo Device ID & Số điện thoại (Nhận diện thiết bị kép)
  if (pathname === '/api/license/check-by-device' && method === 'GET') {
    const deviceId = url.searchParams.get('deviceId');
    const phone = (url.searchParams.get('phone') || '').replace(/\D/g, '');
    if (!deviceId && !phone) return jsonResponse({ success: false, message: 'Thiếu mã thiết bị hoặc SĐT!' }, 400);

    // Hợp nhất đơn hàng đã duyệt mới nhất vào danh sách bản quyền
    autoConsolidateEdgeLicensesAndOrders();

    const now = Date.now();
    let found = edgeLicenses.find((l) => {
      if (l.isRevoked || l.isSuspended) return false;
      const expMs = new Date(l.expiresAt).getTime();
      if (expMs < now) return false;
      return deviceId && l.devices && l.devices.some((d) => d.deviceId.toLowerCase() === String(deviceId).toLowerCase());
    });

    // Nếu chưa thấy qua deviceId, tìm qua số điện thoại khách hàng đã mua gói
    if (!found && phone && phone.length >= 8) {
      found = edgeLicenses.find((l) => {
        if (l.isRevoked || l.isSuspended) return false;
        const expMs = new Date(l.expiresAt).getTime();
        if (expMs < now) return false;
        const licPhone = (l.phone || '').replace(/\D/g, '');
        return licPhone === phone;
      });

      // Tự động gán chính xác mã máy này vào bản quyền ngay khi nhận diện qua SĐT!
      if (found && deviceId) {
        if (!found.devices) found.devices = [];
        const cleanDev = String(deviceId).trim();
        if (!found.devices.some((d) => d.deviceId.toLowerCase() === cleanDev.toLowerCase())) {
          found.devices.push({
            deviceId: cleanDev,
            deviceName: found.clientName || 'Thiết bị tự động gán',
            activatedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          });
          await syncKV();
        }
      }
    }

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
          activeDevicesCount: found.devices ? found.devices.length : 1,
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
    const { id: clientOrderId, pkgName, price, clientName, phone, deviceId, note } = body;
    const isTrial = (price === '0đ' || String(pkgName || '').toLowerCase().includes('dùng thử') || String(pkgName || '').toLowerCase().includes('trial'));

    let cleanDeviceId = deviceId ? String(deviceId).trim() : '';
    if (!cleanDeviceId || cleanDeviceId.toLowerCase().includes('đang lấy') || cleanDeviceId.toLowerCase().includes('dang lay') || cleanDeviceId === 'Chưa gắn') {
      const cleanPhone = phone ? String(phone).replace(/\D/g, '') : '';
      cleanDeviceId = cleanPhone && cleanPhone.length >= 8
        ? `GLFB-PC-${cleanPhone.slice(-6)}`
        : `GLFB-PC-${Date.now().toString(36).slice(-6).toUpperCase()}`;
    }

    const orderId = clientOrderId || `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Kiểm tra đơn đã bị xóa trước đó
    const revoked = edgeRevokedKeys.map((r) => String(r).trim().toUpperCase());
    if (revoked.includes(orderId.toUpperCase())) {
      return jsonResponse({ success: true, message: 'Đơn hàng đã được ghi nhận trước đó', order: { id: orderId } });
    }

    // Chống tạo đơn trùng lặp (Deduplication): Nếu đã có đơn cùng ID hoặc cùng khách/máy/gói gửi trong 2 phút gần nhất
    const existing = edgeOrders.find((o) => {
      if (o.id === orderId) return true;
      const sameDev = cleanDeviceId && o.deviceId && o.deviceId.toUpperCase() === cleanDeviceId.toUpperCase();
      const samePhone = phone && o.phone && o.phone.replace(/\D/g, '') === String(phone).replace(/\D/g, '');
      const samePkg = o.pkgName === pkgName;
      const timeDiff = Math.abs(Date.now() - new Date(o.createdAt).getTime());
      return (sameDev || samePhone) && samePkg && o.status === 'pending' && timeDiff < 2 * 60 * 1000;
    });

    if (existing) {
      return jsonResponse({
        success: true,
        message: 'Đơn hàng đã được tiếp nhận thành công!',
        order: existing,
      });
    }

    const newOrder: OrderItem = {
      id: orderId,
      pkgName: pkgName || (isTrial ? 'Gói Dùng Thử (1 ngày)' : 'Gói 1 Tháng (30 ngày)'),
      price: price || (isTrial ? '0đ' : '1.000.000đ'),
      clientName: clientName ? String(clientName).trim() : (isTrial ? 'Khách Dùng Thử 1 Ngày' : 'Khách Đặt Mua Tự Động'),
      phone: phone ? String(phone).trim() : 'Chờ liên hệ Zalo',
      deviceId: cleanDeviceId,
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

  // ROUTE: Lấy số lượng đơn hàng chờ duyệt
  if (pathname === '/api/orders/pending-count' && method === 'GET') {
    const pendingOrders = edgeOrders.filter((o) => o.status === 'pending');
    return jsonResponse({
      success: true,
      pendingCount: pendingOrders.length,
      latestPending: pendingOrders.length > 0 ? {
        id: pendingOrders[0].id,
        pkgName: pendingOrders[0].pkgName,
        clientName: pendingOrders[0].clientName,
        price: pendingOrders[0].price,
        createdAt: pendingOrders[0].createdAt,
      } : null,
    });
  }

  // ROUTE: Tra cứu danh sách đơn hàng của khách & đồng bộ Extension
  if (pathname === '/api/orders/my-orders' && method === 'GET') {
    const deviceId = url.searchParams.get('deviceId');
    const phone = url.searchParams.get('phone')?.replace(/\D/g, '');
    const orderIds = (url.searchParams.get('orderIds') || '').split(',').map((s) => s.trim()).filter(Boolean);

    const { licenses } = autoConsolidateEdgeLicensesAndOrders();
    const cleanDevId = (deviceId || '').trim().toLowerCase();

    let matched = edgeOrders.filter((o) => {
      if (cleanDevId && o.deviceId && o.deviceId.toLowerCase() === cleanDevId) return true;
      if (phone && o.phone && o.phone.replace(/\D/g, '') === phone) return true;
      if (orderIds.length > 0 && orderIds.includes(o.id)) return true;
      return false;
    });



    const activeLic = licenses.find(
      (l) => !l.isRevoked && (
        (cleanDevId && l.devices?.some((d) => d.deviceId.toLowerCase() === cleanDevId)) ||
        (phone && l.phone && l.phone.replace(/\D/g, '') === phone)
      )
    );

    matched = matched.map((o) => {
      let key = o.generatedKey;
      if (!key && activeLic) {
        key = activeLic.key;
      }
      return { ...o, generatedKey: key };
    });

    const pendingOrders = edgeOrders.filter((o) => o.status === 'pending');
    const approvedOrders = matched.filter((o) => o.status === 'approved');
    let totalPurchasedDays = 0;
    for (const o of approvedOrders) {
      totalPurchasedDays += getOrderDurationDays(o.pkgName, o.price);
    }

    return jsonResponse({
      success: true,
      orders: matched,
      totalPending: pendingOrders.length,
      approvedCount: approvedOrders.length,
      totalPurchasedDays,
      isCumulative: approvedOrders.length > 1,
      activeLicense: activeLic ? {
        key: activeLic.key,
        expiresAt: activeLic.expiresAt,
        notes: activeLic.notes,
        aliasKeys: activeLic.aliasKeys || [],
      } : null,
    });
  }

  // ROUTE: Xác thực PIN Admin
  if (pathname === '/api/admin/verify-pin' && method === 'POST') {
    const pin = String(body.pin || '').trim();
    if (pin && pin === adminPin) {
      return jsonResponse({ success: true, message: 'Đăng nhập Quản Trị thành công!' });
    }
    return jsonResponse({ success: false, message: 'Khóa Quản Trị không chính xác!' }, 401);
  }

  // ROUTE: Thông tin gói tải về
  if (pathname === '/api/package/info' && method === 'GET') {
    return jsonResponse({
      success: true,
      isReady: true,
      sizeKb: 332,
      updatedAt: new Date().toISOString(),
      fileName: 'Gia_Long_FB_WebStore_latest.zip',
      version: '1.0.3',
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
    if (!reqPin || reqPin !== adminPin) {
      return jsonResponse({ success: false, error: 'Khóa Quản Trị không hợp lệ!' }, 401);
    }

    if (pathname === '/api/admin/licenses' && method === 'GET') {
      const { licenses } = autoConsolidateEdgeLicensesAndOrders();
      const now = Date.now();
      const formatted = licenses.map((l) => {
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

      if (!order.deviceId || order.deviceId.toLowerCase().includes('đang lấy') || order.deviceId.toLowerCase().includes('dang lay') || order.deviceId === 'Chưa gắn') {
        const cleanPhone = (order.phone || '').replace(/\D/g, '');
        order.deviceId = cleanPhone.length >= 8 
          ? `dev_${cleanPhone.slice(-8)}_${Date.now().toString(36).slice(-4)}` 
          : `dev_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36).slice(-4)}`;
      }

      order.status = 'approved';
      const cleanDeviceId = (order.deviceId || '').trim().toLowerCase();
      const cleanPhone = (order.phone || '').trim().replace(/\D/g, '');
      const days = getOrderDurationDays(order.pkgName, order.price);
      const isTrial = days === 1;

      let matchedLic = edgeLicenses.find((l) => {
        if (l.isRevoked) return false;
        if (cleanDeviceId && cleanDeviceId !== 'chưa gắn' && cleanDeviceId !== 'chuagan' && l.devices?.some((d) => d.deviceId.toLowerCase() === cleanDeviceId)) return true;
        if (cleanPhone && l.phone && l.phone.replace(/\D/g, '') === cleanPhone) return true;
        if (order.generatedKey && (l.key.toUpperCase() === order.generatedKey.toUpperCase() || l.aliasKeys?.includes(order.generatedKey.toUpperCase()))) return true;
        return false;
      });

      if (!matchedLic) {
        const randomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        const newKey = `GLFB-VIP-${randomCode}`;
        matchedLic = {
          id: `lic_${Date.now()}_${randomCode}`,
          key: newKey,
          clientName: order.clientName || 'Khách Đặt Mua Gói',
          phone: order.phone || '',
          planType: isTrial ? 'trial' : 'individual',
          maxDevices: 1,
          devices: cleanDeviceId && cleanDeviceId !== 'chưa gắn' && cleanDeviceId !== 'chuagan' ? [{
            deviceId: cleanDeviceId,
            deviceName: order.clientName || 'Thiết bị đặt mua',
            activatedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          }] : [],
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
          isSuspended: false,
          aliasKeys: [],
          notes: `Bản quyền cấp từ duyệt đơn: ${order.pkgName} (+${days} ngày)`,
        };
        edgeLicenses.unshift(matchedLic);
      }

      order.generatedKey = matchedLic.key;
      const { licenses } = autoConsolidateEdgeLicensesAndOrders();
      const approvedLicense = licenses.find((l) => {
        if (cleanDeviceId && cleanDeviceId !== 'chưa gắn' && l.devices?.some((d) => d.deviceId.toLowerCase() === cleanDeviceId)) return true;
        if (cleanPhone && l.phone && l.phone.replace(/\D/g, '') === cleanPhone) return true;
        if (order.generatedKey && l.key === order.generatedKey) return true;
        return false;
      }) || matchedLic || licenses[0];

      await addHistory({
        action: 'approve',
        actionName: order.pkgName?.includes('Dùng Thử') ? 'Duyệt cấp dùng thử 1N' : 'Duyệt đơn 1-Click',
        clientName: order.clientName || 'Khách đặt mua',
        phone: order.phone || '',
        deviceId: order.deviceId || '',
        key: approvedLicense?.key || order.id.slice(-8).toUpperCase(),
        planType: approvedLicense?.planType || 'individual',
        pkgName: normalizePkgSymbol(order.pkgName),
        daysAdded: getOrderDurationDays(order.pkgName, order.price),
        newExpiresAt: approvedLicense?.expiresAt,
        amount: order.price,
        notes: `Duyệt đơn cộng dồn và cấp mã: ${approvedLicense?.key}`,
      });
      await syncKV();

      return jsonResponse({
        success: true,
        message: `✓ Đã phê duyệt đơn và cộng dồn mã: ${approvedLicense?.key}`,
        order,
        license: approvedLicense,
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
      const toDelete = edgeLicenses.find((l) => l.id === targetId || l.key === targetId);
      if (toDelete) {
        const devIds = (toDelete.devices || []).map((d) => (d.deviceId || '').trim().toUpperCase()).filter(Boolean);
        const phone = (toDelete.phone || '').trim().replace(/\D/g, '');
        const aliasSet = new Set<string>([toDelete.key.toUpperCase(), ...(toDelete.aliasKeys || []).map((k) => k.toUpperCase())]);

        // Ghi nhận khóa vĩnh viễn key, aliasKeys, devId và phone để autoConsolidate không bao giờ tạo lại người dùng này
        aliasSet.forEach((k) => {
          if (k && !edgeRevokedKeys.includes(k)) edgeRevokedKeys.push(k);
        });
        if (toDelete.id && !edgeRevokedKeys.includes(toDelete.id.toUpperCase())) {
          edgeRevokedKeys.push(toDelete.id.toUpperCase());
        }
        devIds.forEach((dev) => {
          if (!edgeRevokedKeys.includes(dev)) edgeRevokedKeys.push(dev);
          if (!edgeRevokedKeys.includes(`DEV:${dev}`)) edgeRevokedKeys.push(`DEV:${dev}`);
        });
        if (phone) {
          if (!edgeRevokedKeys.includes(phone)) edgeRevokedKeys.push(phone);
          if (!edgeRevokedKeys.includes(`PHONE:${phone}`)) edgeRevokedKeys.push(`PHONE:${phone}`);
        }

        // Xóa hoặc hủy các đơn liên quan để KHÔNG bao giờ bị tự động tạo lại
        edgeOrders = edgeOrders.filter((o) => {
          const oKey = (o.generatedKey || '').trim().toUpperCase();
          const matchKey = oKey && aliasSet.has(oKey);
          const oDev = (o.deviceId || '').trim().toUpperCase();
          const matchDev = oDev && (devIds.includes(oDev) || devIds.some((d) => oDev.includes(d)));
          const oPhone = (o.phone || '').trim().replace(/\D/g, '');
          const matchPhone = phone && oPhone && oPhone === phone;
          if (matchKey || matchDev || matchPhone) {
            edgeRevokedKeys.push(o.id.toUpperCase());
            return false;
          }
          return true;
        });

        await addHistory({
          action: 'revoke',
          actionName: 'Xóa người dùng',
          clientName: toDelete.clientName,
          phone: toDelete.phone || '',
          deviceId: toDelete.devices?.[0]?.deviceId || '',
          key: toDelete.key,
          planType: toDelete.planType,
          notes: `Quản trị viên xóa người dùng "${toDelete.clientName}" khỏi danh sách`,
        });
      }
      edgeLicenses = edgeLicenses.filter((l) => l.id !== targetId && l.key !== targetId);
      await syncKV();
      return jsonResponse({
        success: true,
        message: 'Đã xóa mã bản quyền và toàn bộ đơn liên quan thành công!',
        licenses: edgeLicenses,
        orders: edgeOrders,
        history: edgeHistory,
      });
    }

    if (pathname === '/api/admin/orders/delete' && method === 'POST') {
      const targetId = body?.orderId || body?.id;
      const target = edgeOrders.find((o) => o.id === targetId);

      if (targetId) {
        edgeRevokedKeys.push(String(targetId).toUpperCase());
      }

      edgeOrders = edgeOrders.filter((o) => {
        if (o.id === targetId) return false;
        if (target && target.status === 'pending' && o.status === 'pending') {
          const sameClient = (o.clientName || '').trim().toLowerCase() === (target.clientName || '').trim().toLowerCase();
          const samePhone = (o.phone || '').trim() === (target.phone || '').trim();
          const samePkg = o.pkgName === target.pkgName;
          const timeDiff = Math.abs(new Date(o.createdAt).getTime() - new Date(target.createdAt).getTime());
          if (sameClient && samePhone && samePkg && timeDiff < 3 * 60 * 1000) {
            edgeRevokedKeys.push(o.id.toUpperCase());
            return false;
          }
        }
        return true;
      });

      if (target) {
        await addHistory({
          action: 'revoke',
          actionName: 'Hủy/Xóa đơn mua',
          clientName: target.clientName || 'Khách đặt mua',
          phone: target.phone || '',
          deviceId: target.deviceId || '',
          key: target.id.slice(-8).toUpperCase(),
          planType: 'individual',
          pkgName: normalizePkgSymbol(target.pkgName),
          amount: target.price,
          notes: `Quản trị viên xóa đơn đặt mua: ${target.clientName} (${target.pkgName})`,
        });
      }

      autoConsolidateEdgeLicensesAndOrders();
      await syncKV();
      return jsonResponse({
        success: true,
        message: 'Đã xóa đơn đặt mua thành công!',
        orders: edgeOrders,
        licenses: edgeLicenses,
        history: edgeHistory,
      });
    }

    if (pathname === '/api/admin/settings' && method === 'POST') {
      edgeSettings = { ...edgeSettings, ...body };
      await syncKV();
      return jsonResponse({ success: true, settings: edgeSettings, message: 'Đã lưu cài đặt!' });
    }

    if (pathname === '/api/admin/change-pin' && method === 'POST') {
      const { currentPin, newPin } = body;
      if (!currentPin || String(currentPin).trim() !== adminPin) {
        return jsonResponse({ success: false, error: 'Mật khẩu hiện tại không chính xác!' }, 400);
      }
      if (!newPin || String(newPin).trim().length < 6) {
        return jsonResponse({ success: false, error: 'Mật khẩu mới phải có tối thiểu 6 ký tự!' }, 400);
      }
      const cleanNewPin = String(newPin).trim();
      if (env.GLFB_KV) {
        await env.GLFB_KV.put('admin_pin', cleanNewPin);
      }
      adminPin = cleanNewPin;
      const histItem: LicenseHistoryItem = {
        id: `h_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        action: 'update_date',
        actionName: 'Đổi Mật Khẩu Quản Trị',
        clientName: 'Hệ Thống Quản Trị',
        key: 'ADMIN-SECURITY',
        createdAt: new Date().toISOString(),
        notes: 'Quản trị viên đã thay đổi khóa quản trị thành công.',
      };
      edgeHistory.unshift(histItem);
      await syncKV();
      return jsonResponse({ success: true, message: 'Đổi mật khẩu Quản trị thành công!', pin: cleanNewPin });
    }
  }

  // Fallback an toàn cho bất kỳ API nào khác: Luôn trả JSON hợp lệ để không bị lỗi cú pháp
  return jsonResponse({ success: true, message: 'Cloudflare Pages Edge API Endpoint OK' });
}
