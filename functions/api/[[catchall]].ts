// Cloudflare Pages Function - Xử lý toàn bộ API /api/* trên Edge của Cloudflare
// Đảm bảo hoạt động trơn tru tự động khi triển khai dự án lên Cloudflare Pages & GitHub
// Lưu trữ và đồng bộ hóa tự động qua Google Drive & Edge Memory

interface Env {
  BACKEND_URL?: string;
  ADMIN_PIN?: string;
  SIGNING_SECRET?: string;
  GOOGLE_DRIVE_WEBHOOK_URL?: string;
  DB?: any;
  D1?: any;
  KV?: any;
  GIALONG_KV?: any;
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
  daysLeft?: number;
  isExpired?: boolean;
  revokedDevices?: string[];
}

interface OrderItem {
  id: string;
  pkgName: string;
  price: string;
  clientName?: string;
  phone?: string;
  deviceId?: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'cancelled' | 'revoked';
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

// Bộ nhớ mặc định Edge (Khởi tạo sẵn dữ liệu quản lý người dùng & lịch sử để tránh mất thông tin)
let edgeLicenses: LicenseItem[] = [
  {
    id: 'lic_init_default_1',
    key: 'VIP-GIALONG-0869029310',
    clientName: 'Công Ty CP Hoa Phượng ME (Hoan)',
    phone: '0869029310',
    planType: 'team',
    maxDevices: 1,
    devices: [
      {
        deviceId: 'DEVICE-DEMO-01',
        deviceName: 'Chrome Extension Client',
        activatedAt: new Date(Date.now() - 86400000).toISOString(),
        lastSeenAt: new Date().toISOString(),
      }
    ],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    expiresAt: new Date(Date.now() + 390 * 86400000).toISOString(),
    isSuspended: false,
    isRevoked: false,
    notes: 'Bản quyền VIP 390 ngày - Tự động kích hoạt online',
  }
];

let edgeOrders: OrderItem[] = [
  {
    id: 'ord_init_default_1',
    pkgName: 'Gói VIP 1 Tháng (30 ngày)',
    price: '1.000.000đ',
    clientName: 'Công Ty CP Hoa Phượng ME (Hoan)',
    phone: '0869029310',
    deviceId: 'DEVICE-DEMO-01',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    status: 'approved',
    generatedKey: 'VIP-GIALONG-0869029310',
    note: 'Đơn hàng VIP khởi tạo hệ thống quản trị',
  }
];

let edgeHistory: LicenseHistoryItem[] = [
  {
    id: 'hist_init_1',
    action: 'create',
    actionName: 'Cấp mã mới (Team)',
    clientName: 'Công Ty CP Hoa Phượng ME (Team HCNS)',
    phone: '0869029310',
    deviceId: 'HP-ME-PC01',
    key: 'HCNS-HOAPHUONG-3SLOTS',
    planType: 'team',
    pkgName: '1TH',
    daysAdded: 30,
    newExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    amount: '3.000.000đ',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    notes: 'Khởi tạo cấp phép 3 máy cho phòng tuyển dụng',
  }
];

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

    let primaryLic: LicenseItem;
    if (matchedLics.length === 0) {
      const newKey = ords[0].generatedKey || `GLFB-VIP-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      primaryLic = {
        id: `lic_${ords[0].id}`,
        key: newKey,
        clientName: ords[0].clientName || 'Khách Đặt Mua',
        phone: ords[0].phone || '',
        planType: ords[0].pkgName?.includes('Team') ? 'team' : (ords[0].pkgName?.includes('Dùng Thử') ? 'trial' : 'individual'),
        maxDevices: 1,
        devices: firstValidDev && firstValidDev !== 'chưa gắn' && firstValidDev !== 'chuagan' ? [{
          deviceId: firstValidDev,
          deviceName: ords[0].clientName || 'Thiết bị đặt mua',
          activatedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        }] : [],
        createdAt: new Date(earliestOrderMs).toISOString(),
        expiresAt: new Date(earliestOrderMs + totalDays * 86400000).toISOString(),
        isSuspended: false,
        aliasKeys: ords.map((o) => o.generatedKey).filter((k): k is string => Boolean(k && k !== newKey)),
        notes: `Bản quyền cấp từ duyệt đơn: ${ords[0].pkgName} (+${totalDays} ngày)`,
        daysLeft: Math.max(0, Math.ceil((new Date(earliestOrderMs + totalDays * 86400000).getTime() - Date.now()) / 86400000)),
        isExpired: (earliestOrderMs + totalDays * 86400000) < Date.now(),
      };
      edgeLicenses.push(primaryLic);
      matchedLics.push(primaryLic);
    } else {
      primaryLic = matchedLics[0];
    }
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

    // Bảo lưu tuyệt đối ngày hết hạn do Quản trị viên thiết lập hoặc cấp phép (Không ghi đè bừa bãi)
    if (!primaryLic.expiresAt) {
      primaryLic.expiresAt = new Date(finalExpMs).toISOString();
      const pkgListStr = ords.map((o) => `${o.pkgName} (+${getOrderDurationDays(o.pkgName, o.price)}n)`).join(' + ');
      primaryLic.notes = `Bản quyền VIP cộng dồn ${ords.length} gói: ${pkgListStr} = Tổng ${totalDays} ngày (Hạn dùng đến ${new Date(finalExpMs).toLocaleDateString('vi-VN')})`;
    }
    const currentExpMs = new Date(primaryLic.expiresAt).getTime();
    const nowMs = Date.now();
    primaryLic.daysLeft = Math.max(0, Math.ceil((currentExpMs - nowMs) / 86400000));
    primaryLic.isExpired = currentExpMs < nowMs;
    primaryLic.aliasKeys = Array.from(aliasSet);
    if (primaryLic.planType === 'trial' && ords.some((o) => getOrderDurationDays(o.pkgName, o.price) > 1)) {
      primaryLic.planType = 'individual';
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
  googleDriveSheetWebhookUrl: '',
  googleDriveSyncEnabled: true,
};

async function addHistory(entry: Omit<LicenseHistoryItem, 'id' | 'createdAt'>) {
  const item: LicenseHistoryItem = {
    id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  };
  edgeHistory.unshift(item);
  if (edgeHistory.length > 300) edgeHistory.length = 300;
  return item;
}

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

// ========================================================
// HỆ THỐNG MÃ XÁC NHẬN BẢO MẬT (SIGNED TOKEN) CHO EXTENSION
// Đảm bảo Extension chạy offline/cache 100% không tốn request
// ========================================================
function generateSignedToken(machineId: string, expiresAt: string, secret = 'GiaLongFB_D1_Secret_2026'): string {
  const cleanId = String(machineId || '').trim();
  const cleanExp = String(expiresAt || '').trim();
  const payload = `${cleanId}:::${cleanExp}:::${secret}`;
  let hash1 = 0;
  for (let i = 0; i < payload.length; i++) {
    hash1 = ((hash1 << 5) - hash1) + payload.charCodeAt(i);
    hash1 |= 0;
  }
  const h1 = Math.abs(hash1).toString(36).toUpperCase();
  let hash2 = 5381;
  for (let i = payload.length - 1; i >= 0; i--) {
    hash2 = ((hash2 << 5) + hash2) + payload.charCodeAt(i);
    hash2 |= 0;
  }
  const h2 = Math.abs(hash2).toString(36).toUpperCase();
  const rawToken = `${cleanId}__${cleanExp}__${h1}${h2}`;
  return 'GLFB_SIG_' + (typeof btoa !== 'undefined' ? btoa(rawToken) : Buffer.from(rawToken).toString('base64'));
}

function verifySignedToken(token: string, machineId: string, secret = 'GiaLongFB_D1_Secret_2026'): { valid: boolean; expiresAt?: string } {
  try {
    if (!token || !token.startsWith('GLFB_SIG_')) return { valid: false };
    const raw = typeof atob !== 'undefined' 
      ? atob(token.replace('GLFB_SIG_', '')) 
      : Buffer.from(token.replace('GLFB_SIG_', ''), 'base64').toString('utf8');
    const parts = raw.split('__');
    if (parts.length < 3) return { valid: false };
    const [tMachineId, tExpiresAt] = parts;
    if (tMachineId.toLowerCase() !== machineId.toLowerCase()) return { valid: false };
    const expected = generateSignedToken(tMachineId, tExpiresAt, secret);
    if (expected !== token) return { valid: false };
    if (new Date(tExpiresAt).getTime() < Date.now()) return { valid: false, expiresAt: tExpiresAt };
    return { valid: true, expiresAt: tExpiresAt };
  } catch (e) {
    return { valid: false };
  }
}

// Gửi dữ liệu đơn hàng tự động sang Google Drive / Google Sheets qua Webhook
async function syncToGoogleDrive(order: any, webhookUrl?: string): Promise<boolean> {
  const targetUrl = webhookUrl || edgeSettings.googleDriveSheetWebhookUrl;
  if (!targetUrl || !targetUrl.startsWith('http')) return false;
  try {
    const payload = {
      event: 'ORDER_UPDATE',
      id: order.id,
      timestamp: new Date().toISOString(),
      timeFormatted: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
      clientName: order.clientName || 'Khách Đặt Mua',
      phone: order.phone || '',
      pkgName: order.pkgName || '',
      price: order.price || '',
      deviceId: order.deviceId || '',
      status: order.status || 'pending',
      note: order.note || '',
      source: 'Gia Long FB Web App & Extension',
    };
    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return resp.ok;
  } catch (err) {
    console.warn('[Google Drive Sync] Lỗi gửi Webhook:', err);
    return false;
  }
}

let d1TablesInitialized = false;
async function getD1Db(env: any): Promise<any> {
  const db = env?.DB || env?.D1 || env?.__D1_BETA__DB || null;
  if (!db) return null;
  if (!d1TablesInitialized) {
    try {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          pkg_name TEXT,
          price TEXT,
          client_name TEXT,
          phone TEXT,
          device_id TEXT,
          created_at TEXT,
          status TEXT DEFAULT 'pending',
          note TEXT
        );
        CREATE TABLE IF NOT EXISTS licenses (
          id TEXT PRIMARY KEY,
          machine_id TEXT,
          pkg_name TEXT,
          client_name TEXT,
          phone TEXT,
          price TEXT,
          status TEXT DEFAULT 'pending',
          created_at TEXT,
          expires_at TEXT,
          signed_token TEXT,
          notes TEXT
        );
        CREATE TABLE IF NOT EXISTS history (
          id TEXT PRIMARY KEY,
          action TEXT,
          action_name TEXT,
          client_name TEXT,
          phone TEXT,
          device_id TEXT,
          key TEXT,
          plan_type TEXT,
          pkg_name TEXT,
          days_added INTEGER,
          new_expires_at TEXT,
          amount TEXT,
          created_at TEXT,
          notes TEXT
        );
      `);
      d1TablesInitialized = true;
    } catch (d1InitErr) {
      console.warn('[D1 Init] Table creation notice:', d1InitErr);
    }
  }
  return db;
}
let d1: any = null;

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
      console.warn('[Cloudflare Pages Functions] Proxy failed, falling back to Native Edge processing:', proxyErr);
    }
  }

  // 3. Chế độ Xử lý Natively tại Cloudflare Edge (Memory + Google Drive Sync)
  let adminPin = env.ADMIN_PIN || 'Ha26062018$';
  const reqPin = String(request.headers.get('x-admin-pin') || url.searchParams.get('pin') || '').trim();

  if (env.GOOGLE_DRIVE_WEBHOOK_URL && !edgeSettings.googleDriveSheetWebhookUrl) {
    edgeSettings.googleDriveSheetWebhookUrl = env.GOOGLE_DRIVE_WEBHOOK_URL;
  }

  // Khởi tạo kết nối D1 Database và KV Namespace
  d1 = await getD1Db(env);
  const kv = env.KV || env.GIALONG_KV || null;

  // 1. Tải dữ liệu từ Cloudflare KV (nếu người dùng đã cấu hình binding KV)
  if (kv) {
    try {
      const savedOrders = await kv.get('glfb_orders', 'json');
      if (Array.isArray(savedOrders) && savedOrders.length > 0) {
        const orderMap = new Map<string, OrderItem>();
        edgeOrders.forEach((o) => orderMap.set(o.id, o));
        savedOrders.forEach((o: any) => orderMap.set(o.id, o));
        edgeOrders = Array.from(orderMap.values());
      }
      const savedLic = await kv.get('glfb_licenses', 'json');
      if (Array.isArray(savedLic) && savedLic.length > 0) {
        const licMap = new Map<string, LicenseItem>();
        edgeLicenses.forEach((l) => licMap.set(l.id, l));
        savedLic.forEach((l: any) => licMap.set(l.id, l));
        edgeLicenses = Array.from(licMap.values());
      }
      const savedHist = await kv.get('glfb_history', 'json');
      if (Array.isArray(savedHist) && savedHist.length > 0) {
        const histMap = new Map<string, LicenseHistoryItem>();
        edgeHistory.forEach((h) => histMap.set(h.id, h));
        savedHist.forEach((h: any) => histMap.set(h.id, h));
        edgeHistory = Array.from(histMap.values());
      }
      const savedRevoked = await kv.get('glfb_revoked', 'json');
      if (Array.isArray(savedRevoked) && savedRevoked.length > 0) {
        edgeRevokedKeys = Array.from(new Set([...edgeRevokedKeys, ...savedRevoked]));
      }
    } catch (kvErr) {
      console.warn('[KV Init] Lỗi nạp dữ liệu từ Cloudflare KV:', kvErr);
    }
  }

  // 2. Tải dữ liệu từ Cloudflare D1 Database (nếu đã cấu hình binding DB)
  if (d1) {
    try {
      const rows: any = await d1.prepare(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 300`).all();
      if (rows?.results && rows.results.length > 0) {
        const orderMap = new Map<string, OrderItem>();
        edgeOrders.forEach((o) => orderMap.set(o.id, o));
        rows.results.forEach((r: any) => {
          orderMap.set(r.id, {
            id: r.id,
            pkgName: r.pkg_name,
            price: r.price,
            clientName: r.client_name,
            phone: r.phone,
            deviceId: r.device_id,
            createdAt: r.created_at,
            status: r.status,
            note: r.note,
          });
        });
        edgeOrders = Array.from(orderMap.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
    } catch (d1Err) {
      console.warn('[D1 Orders Init] Lỗi nạp đơn:', d1Err);
    }
  }

  // 3. Tải từ Cloudflare Edge Cache API (Cứu cánh zero-config đồng bộ giữa các Worker Isolates khi chưa tạo D1/KV)
  if (!d1 && !kv) {
    try {
      if (typeof caches !== 'undefined' && (caches as any).default) {
        const cacheUrl = `https://gia-long---tuy-n-d-ng.pages.dev/__edge_cache_orders`;
        const cacheReq = new Request(cacheUrl, { method: 'GET' });
        const matched = await (caches as any).default.match(cacheReq);
        if (matched) {
          const cachedOrders = await matched.json();
          if (Array.isArray(cachedOrders) && cachedOrders.length > 0) {
            const orderMap = new Map<string, OrderItem>();
            edgeOrders.forEach((o) => orderMap.set(o.id, o));
            cachedOrders.forEach((o: any) => orderMap.set(o.id, o));
            edgeOrders = Array.from(orderMap.values()).sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
          }
        }
      }
    } catch (cacheErr) {}
  }

  const syncKV = async () => {
    if (kv) {
      try {
        await kv.put('glfb_orders', JSON.stringify(edgeOrders));
        await kv.put('glfb_licenses', JSON.stringify(edgeLicenses));
        await kv.put('glfb_history', JSON.stringify(edgeHistory));
        if (edgeRevokedKeys.length > 0) {
          await kv.put('glfb_revoked', JSON.stringify(edgeRevokedKeys));
        }
      } catch (e) {
        console.warn('[KV Sync] Lỗi ghi KV:', e);
      }
    }
    // Đồng thời đồng bộ vào Cloudflare Edge Cache API (để các Isolate khác đọc được ngay tức khắc)
    try {
      if (typeof caches !== 'undefined' && (caches as any).default) {
        const cacheUrl = `https://gia-long---tuy-n-d-ng.pages.dev/__edge_cache_orders`;
        const cacheReq = new Request(cacheUrl, { method: 'GET' });
        const cacheResp = new Response(JSON.stringify(edgeOrders), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=604800, s-maxage=604800',
          },
        });
        await (caches as any).default.put(cacheReq, cacheResp);
      }
    } catch (e) {}
  };

  const addHistoryEntry = async (entry: Omit<LicenseHistoryItem, 'id' | 'createdAt'>) => {
    const item: LicenseHistoryItem = {
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    };
    edgeHistory.unshift(item);
    if (edgeHistory.length > 300) edgeHistory.length = 300;
    return item;
  };

  let body: any = {};
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    try {
      const text = await request.text();
      if (text) body = JSON.parse(text);
    } catch (e) {}
  }

  // ========================================================
  // ROUTE 1: ĐĂNG KÝ GÓI BẢN QUYỀN TỪ EXTENSION (/register & /api/register)
  // Nhận yêu cầu mua gói, lưu vào D1 Database trạng thái 'pending'
  // ========================================================
  if ((pathname === '/api/register' || pathname === '/register') && method === 'POST') {
    const machineId = String(body.machine_id || body.deviceId || '').trim();
    const pkgName = String(body.pkg_name || body.pkgName || 'Gói 1 Tháng (30 ngày)').trim();
    const clientName = String(body.client_name || body.clientName || 'Khách Đặt Mua').trim();
    const phone = String(body.phone || '').trim();
    const price = String(body.price || '').trim();
    const notes = String(body.notes || body.note || '').trim();

    if (!machineId) {
      return jsonResponse({ success: false, error: 'Thiếu thông tin machine_id!' }, 400);
    }

    const regId = `lic_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date().toISOString();

    // 1. Lưu vào Cloudflare D1 Database (nếu có D1)
    const d1 = await getD1Db(env);
    if (d1) {
      try {
        await d1.prepare(`
          INSERT INTO licenses (id, machine_id, pkg_name, client_name, phone, price, status, created_at, notes)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `).bind(regId, machineId, pkgName, clientName, phone, price, createdAt, notes).run();
      } catch (d1Err) {
        console.warn('[D1 Register] Error inserting into D1 licenses:', d1Err);
      }
    }

    // 2. Đồng thời tạo Order để hiển thị ngay trên Web Admin và lưu D1 + KV
    const newOrd: OrderItem = {
      id: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      pkgName,
      price: price || '1.000.000đ',
      clientName,
      phone,
      deviceId: machineId,
      createdAt,
      status: 'pending',
      note: notes || `Đăng ký ${pkgName} từ máy ${machineId}`,
    };
    edgeOrders.unshift(newOrd);

    if (d1) {
      try {
        await d1.prepare(`
          INSERT OR REPLACE INTO orders (id, pkg_name, price, client_name, phone, device_id, created_at, status, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `).bind(newOrd.id, newOrd.pkgName, newOrd.price, newOrd.clientName, newOrd.phone, newOrd.deviceId, newOrd.createdAt, newOrd.note).run();
      } catch (d1OrdErr) {
        console.warn('[D1 Register] Error inserting into D1 orders:', d1OrdErr);
      }
    }

    // 3. Tự động đẩy sang Google Drive / Google Sheets (nếu đã cấu hình)
    const gDriveUrl = edgeSettings.googleDriveSheetWebhookUrl || env.GOOGLE_DRIVE_WEBHOOK_URL;
    if (gDriveUrl && edgeSettings.googleDriveSyncEnabled !== false) {
      syncToGoogleDrive(newOrd, gDriveUrl);
    }

    await syncKV();

    return jsonResponse({
      success: true,
      message: 'Đăng ký gói thành công, vui lòng chờ Quản trị viên duyệt!',
      license: {
        id: regId,
        machine_id: machineId,
        pkg_name: pkgName,
        status: 'pending',
        created_at: createdAt,
      },
      order: newOrd,
    });
  }

  // ========================================================
  // ROUTE 2: DUYỆT GÓI & CẤP MÃ XÁC NHẬN BẢO MẬT (/admin/approve & /api/admin/approve)
  // Chuyển trạng thái sang 'active', tính hạn dùng, cấp Signed Token
  // ========================================================
  if ((pathname === '/api/admin/approve' || pathname === '/admin/approve') && method === 'POST') {
    // Xác thực quyền Quản trị viên qua Header hoặc Body
    if (reqPin !== adminPin && body.pin !== adminPin) {
      return jsonResponse({ success: false, error: 'Sai mã PIN hoặc chưa có quyền Quản trị!' }, 401);
    }

    const machineId = String(body.machine_id || body.deviceId || '').trim();
    const pkgName = String(body.pkg_name || body.pkgName || '').trim();
    let days = Number(body.days) || 0;
    if (!days && pkgName) {
      days = getOrderDurationDays(pkgName, body.price);
    }
    if (!days) days = 30;

    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    const token = generateSignedToken(machineId, expiresAt, env.SIGNING_SECRET);

    // 1. Cập nhật Cloudflare D1 Database
    const d1 = await getD1Db(env);
    if (d1) {
      try {
        const existing = await d1.prepare(`
          SELECT * FROM licenses WHERE machine_id = ? ORDER BY created_at DESC LIMIT 1
        `).bind(machineId).first();

        if (existing) {
          await d1.prepare(`
            UPDATE licenses 
            SET status = 'active', expires_at = ?, signed_token = ?, notes = ?
            WHERE machine_id = ?
          `).bind(expiresAt, token, `Admin duyệt gói ${pkgName || existing.pkg_name} (+${days}n)`, machineId).run();
        } else {
          await d1.prepare(`
            INSERT INTO licenses (id, machine_id, pkg_name, client_name, status, created_at, expires_at, signed_token, notes)
            VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)
          `).bind(
            `lic_${Date.now()}`,
            machineId,
            pkgName || 'Gói VIP 1 Tháng',
            body.client_name || 'Khách Kích Hoạt',
            new Date().toISOString(),
            expiresAt,
            token,
            `Admin trực tiếp cấp gói (+${days}n)`
          ).run();
        }
      } catch (d1Err) {
        console.warn('[D1 Approve] Update error:', d1Err);
      }
    }

    // 2. Đồng bộ đơn hàng tương ứng sang 'approved' và cập nhật License
    const ord = edgeOrders.find((o) => (o.deviceId || '').toLowerCase() === machineId.toLowerCase() && o.status === 'pending');
    if (ord) ord.status = 'approved';

    const cleanId = machineId.toLowerCase();
    let edgeLic = edgeLicenses.find((l) => !l.isRevoked && l.devices?.some((d) => d.deviceId.toLowerCase() === cleanId));
    if (!edgeLic) {
      const randomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
      edgeLic = {
        id: `lic_${Date.now()}_${randomCode}`,
        key: `GLFB-VIP-${randomCode}`,
        clientName: body.client_name || ord?.clientName || 'Khách Đặt Mua Gói',
        phone: body.phone || ord?.phone || '',
        planType: days === 1 ? 'trial' : 'individual',
        maxDevices: 1,
        devices: [{
          deviceId: machineId,
          deviceName: 'Thiết bị kích hoạt D1',
          activatedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        }],
        createdAt: new Date().toISOString(),
        expiresAt,
        isSuspended: false,
        aliasKeys: [],
        notes: `Kích hoạt D1: ${pkgName} (+${days} ngày)`,
      };
      edgeLicenses.unshift(edgeLic);
    } else {
      edgeLic.expiresAt = expiresAt;
    }

    await addHistory({
      action: 'approve',
      actionName: 'Duyệt gói D1 Database',
      clientName: body.client_name || ord?.clientName || 'Khách Đặt Mua',
      phone: body.phone || ord?.phone || '',
      deviceId: machineId,
      key: edgeLic?.key || machineId,
      planType: 'individual',
      pkgName: normalizePkgSymbol(pkgName),
      daysAdded: days,
      newExpiresAt: expiresAt,
      amount: body.price || ord?.price || '0đ',
      notes: `Duyệt cấp Token D1 và kích hoạt: ${machineId}`,
    });

    await syncKV();

    return jsonResponse({
      success: true,
      message: `✓ Đã phê duyệt gói và cấp Signed Token cho máy ${machineId}!`,
      machine_id: machineId,
      expires_at: expiresAt,
      token,
      license: edgeLic,
      orders: edgeOrders,
    });
  }

  // ========================================================
  // ROUTE 3: KIỂM TRA TRẠNG THÁI MÁY & CẤP MÃ XÁC NHẬN (/check & /api/check)
  // Extension gọi kiểm tra: Nếu active trả về Signed Token và hạn dùng
  // ========================================================
  if ((pathname === '/api/check' || pathname === '/check') && (method === 'GET' || method === 'POST')) {
    const machineId = String(
      url.searchParams.get('machine_id') || 
      url.searchParams.get('deviceId') || 
      body.machine_id || 
      body.deviceId || 
      ''
    ).trim();

    if (!machineId) {
      return jsonResponse({ success: false, status: 'error', message: 'Thiếu tham số machine_id!' }, 400);
    }

    const cleanId = machineId.toLowerCase();
    const cleanIdUpper = machineId.toUpperCase();

    // Kiểm tra xem thiết bị này hiện tại có đang được gắn vào 1 bản quyền ACTIVE hợp lệ hay không
    const activeBoundLic = edgeLicenses.find(
      (l) => !l.isRevoked && !l.isSuspended && l.devices?.some((d) => d.deviceId.toLowerCase() === cleanId)
    );

    if (!activeBoundLic) {
      const revUpper = edgeRevokedKeys.map((r) => String(r).trim().toUpperCase());
      if (
        revUpper.includes(cleanIdUpper) ||
        revUpper.includes(`DEV:${cleanIdUpper}`) ||
        edgeRevokedKeys.includes(cleanId) ||
        edgeRevokedKeys.includes(`dev:${cleanId}`)
      ) {
        return jsonResponse({
          success: false,
          status: 'revoked',
          isRevoked: true,
          action: 'FORCE_REVOKE',
          machine_id: machineId,
          message: '🚨 Bản quyền của thiết bị này đã bị Quản trị viên thu hồi và ngắt kết nối!',
        });
      }

      // Kiểm tra nếu thiết bị thuộc license đã bị thu hồi trong edgeLicenses
      const revokedLic = edgeLicenses.find((l) =>
        l.isRevoked && (
          (l.devices && l.devices.some((d) => d.deviceId.toLowerCase() === cleanId)) ||
          ((l as any).revokedDevices && (l as any).revokedDevices.some((d: string) => d.toLowerCase() === cleanId))
        )
      );
      if (revokedLic) {
        return jsonResponse({
          success: false,
          status: 'revoked',
          isRevoked: true,
          action: 'FORCE_REVOKE',
          machine_id: machineId,
          message: `🚨 BẢN QUYỀN ĐÃ BỊ THU HỒI (NGẮT MÁY): ${revokedLic.revokeReason || 'Quản trị viên đã ngắt kết nối'}!`,
        });
      }

      // Kiểm tra nếu có đơn hàng của máy này đã bị thu hồi và không có đơn hợp lệ nào khác
      const myOrders = edgeOrders.filter((o) => (o.deviceId || '').toLowerCase() === cleanId);
      if (myOrders.length > 0 && myOrders.every((o) => o.status === 'revoked')) {
        return jsonResponse({
          success: false,
          status: 'revoked',
          isRevoked: true,
          action: 'FORCE_REVOKE',
          machine_id: machineId,
          message: '🚨 Máy tính này đã bị Quản trị viên thu hồi bản quyền và ngắt máy!',
        });
      }
    }

    // 1. Kiểm tra trên Cloudflare D1 Database trước
    const d1 = await getD1Db(env);
    let d1Lic: any = null;
    if (d1) {
      try {
        d1Lic = await d1.prepare(`
          SELECT * FROM licenses WHERE machine_id = ? ORDER BY created_at DESC LIMIT 1
        `).bind(machineId).first();
      } catch (d1Err) {
        console.warn('[D1 Check] Query error:', d1Err);
      }
    }

    if (d1Lic) {
      if (d1Lic.status === 'pending') {
        return jsonResponse({
          success: true,
          status: 'pending',
          machine_id: machineId,
          pkg_name: d1Lic.pkg_name,
          message: 'Đơn đăng ký đang chờ Quản trị viên phê duyệt.',
        });
      }
      if (d1Lic.status === 'revoked' || d1Lic.is_revoked) {
        return jsonResponse({
          success: false,
          status: 'revoked',
          isRevoked: true,
          machine_id: machineId,
          message: '🚨 Bản quyền của thiết bị này đã bị Quản trị viên thu hồi!',
        });
      }
      if (d1Lic.status === 'suspended' || d1Lic.is_suspended) {
        return jsonResponse({
          success: false,
          status: 'suspended',
          isSuspended: true,
          machine_id: machineId,
          message: '⏸️ Bản quyền của thiết bị đang bị Quản trị viên tạm khóa!',
        });
      }
      if (d1Lic.status === 'active') {
        const expMs = new Date(d1Lic.expires_at).getTime();
        const now = Date.now();
        if (!isNaN(expMs) && expMs < now) {
          return jsonResponse({
            success: false,
            status: 'expired',
            machine_id: machineId,
            expires_at: d1Lic.expires_at,
            message: 'Bản quyền của máy đã hết hạn sử dụng. Vui lòng gia hạn thêm!',
          });
        }
        const daysLeft = Math.max(1, Math.ceil((expMs - now) / (24 * 60 * 60 * 1000)));
        const token = d1Lic.signed_token || generateSignedToken(machineId, d1Lic.expires_at, env.SIGNING_SECRET);
        return jsonResponse({
          success: true,
          status: 'active',
          machine_id: machineId,
          pkg_name: d1Lic.pkg_name,
          client_name: d1Lic.client_name,
          expires_at: d1Lic.expires_at,
          days_left: daysLeft,
          token: token,
          message: '✓ Bản quyền hợp lệ và đang hoạt động!',
        });
      }
    }

    // 2. Kiểm tra trên Google Drive / Google Sheets (nếu đã cấu hình Webhook)
    const gDriveUrl = edgeSettings.googleDriveSheetWebhookUrl || env.GOOGLE_DRIVE_WEBHOOK_URL;
    if (gDriveUrl && gDriveUrl.startsWith('http')) {
      try {
        const gRes = await fetch(`${gDriveUrl}?action=check&machine_id=${encodeURIComponent(machineId)}`);
        if (gRes.ok) {
          const gData: any = await gRes.json();
          if (gData && gData.success && gData.status === 'active') {
            const expDate = gData.expires_at || new Date(Date.now() + 30 * 86400000).toISOString();
            const token = generateSignedToken(machineId, expDate, env.SIGNING_SECRET);
            return jsonResponse({
              success: true,
              status: 'active',
              machine_id: machineId,
              pkg_name: gData.pkg_name || 'Gói VIP Google Drive',
              client_name: gData.client_name || 'Khách Google Drive',
              expires_at: expDate,
              days_left: gData.days_left || 30,
              token,
              message: '✓ Bản quyền hợp lệ từ Google Drive!',
            });
          }
          if (gData && gData.status === 'pending') {
            return jsonResponse({
              success: true,
              status: 'pending',
              machine_id: machineId,
              pkg_name: gData.pkg_name || 'Gói Đăng Ký',
              message: 'Đơn đăng ký đang chờ Quản trị viên phê duyệt trên Google Drive.',
            });
          }
        }
      } catch (gErr) {
        console.warn('[Google Drive Check Error]', gErr);
      }
    }

    // 3. Fallback sang Edge Memory / KV (nếu D1 chưa có hoặc dữ liệu cũ)
    const matchedLic = edgeLicenses.find((l) =>
      !l.isRevoked && l.devices?.some((d) => d.deviceId.toLowerCase() === cleanId)
    );

    if (matchedLic) {
      if (matchedLic.isRevoked) {
        return jsonResponse({
          success: false,
          status: 'revoked',
          isRevoked: true,
          machine_id: machineId,
          message: '🚨 Bản quyền máy này đã bị Quản trị viên thu hồi!',
        });
      }
      if (matchedLic.isSuspended) {
        return jsonResponse({
          success: false,
          status: 'suspended',
          isSuspended: true,
          machine_id: machineId,
          message: '⏸️ Bản quyền máy này đang bị Quản trị viên tạm khóa!',
        });
      }
      const expMs = new Date(matchedLic.expiresAt).getTime();
      const now = Date.now();
      if (!isNaN(expMs) && expMs < now) {
        return jsonResponse({
          success: false,
          status: 'expired',
          machine_id: machineId,
          expires_at: matchedLic.expiresAt,
          message: 'Bản quyền đã hết hạn sử dụng!',
        });
      }
      const daysLeft = Math.max(1, Math.ceil((expMs - now) / (24 * 60 * 60 * 1000)));
      const token = generateSignedToken(machineId, matchedLic.expiresAt, env.SIGNING_SECRET);
      return jsonResponse({
        success: true,
        status: 'active',
        machine_id: machineId,
        pkg_name: matchedLic.notes || 'Gói VIP Gia Long',
        client_name: matchedLic.clientName,
        expires_at: matchedLic.expiresAt,
        days_left: daysLeft,
        token: token,
        license_key: matchedLic.key,
        message: '✓ Bản quyền hợp lệ!',
      });
    }

    const pendingOrd = edgeOrders.find((o) =>
      o.status === 'pending' && (o.deviceId || '').toLowerCase() === cleanId
    );
    if (pendingOrd) {
      return jsonResponse({
        success: true,
        status: 'pending',
        machine_id: machineId,
        pkg_name: pendingOrd.pkgName,
        message: 'Đơn mua gói đang chờ Quản trị viên duyệt.',
      });
    }

    return jsonResponse({
      success: false,
      status: 'unregistered',
      isRevoked: false,
      machine_id: machineId,
      message: 'Thiết bị chưa kích hoạt bản quyền. Vui lòng gửi đơn mua gói hoặc kích hoạt mã để sử dụng.',
    });
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

    edgeRevokedKeys = edgeRevokedKeys.filter(
      (r) => {
        const ru = String(r).trim().toUpperCase();
        const du = String(deviceId).trim().toUpperCase();
        return ru !== du && ru !== `DEV:${du}`;
      }
    );

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
      const isDeviceMatch = cleanDeviceId ? sameDev : samePhone;
      return isDeviceMatch && samePkg && o.status === 'pending' && timeDiff < 2 * 60 * 1000;
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

    // 1. Lưu đơn đặt mua vào Cloudflare D1 Database (nếu có D1)
    if (d1) {
      try {
        await d1.prepare(`
          INSERT OR REPLACE INTO orders (id, pkg_name, price, client_name, phone, device_id, created_at, status, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `).bind(newOrder.id, newOrder.pkgName, newOrder.price, newOrder.clientName, newOrder.phone, newOrder.deviceId, newOrder.createdAt, newOrder.note).run();
      } catch (d1Err) {
        console.warn('[D1 Orders Create] Lỗi lưu đơn vào D1:', d1Err);
      }
    }

    // 2. Tự động đồng bộ ngay lập tức sang Google Drive / Google Sheets
    const gDriveUrl = edgeSettings.googleDriveSheetWebhookUrl || env.GOOGLE_DRIVE_WEBHOOK_URL;
    if (gDriveUrl && edgeSettings.googleDriveSyncEnabled !== false) {
      syncToGoogleDrive(newOrder, gDriveUrl);
    }

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
    if (kv) {
      try {
        const kvOrders = await kv.get('glfb_orders');
        if (kvOrders) {
          const parsed = JSON.parse(kvOrders);
          if (Array.isArray(parsed)) {
            edgeOrders = parsed;
          }
        }
        const kvRevoked = await kv.get('glfb_revoked_keys');
        if (kvRevoked) {
          const parsedRev = JSON.parse(kvRevoked);
          if (Array.isArray(parsedRev)) {
            edgeRevokedKeys = parsedRev;
          }
        }
      } catch (e) {}
    }
    if (d1) {
      try {
        const countRes: any = await d1.prepare(`SELECT COUNT(*) as c FROM orders WHERE status = 'pending'`).first();
        const latestPending: any = await d1.prepare(`SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1`).first();
        return jsonResponse({
          success: true,
          pendingCount: countRes?.c ?? 0,
          latestPending: latestPending ? {
            id: latestPending.id,
            pkgName: latestPending.pkg_name,
            clientName: latestPending.client_name,
            price: latestPending.price,
            createdAt: latestPending.created_at,
          } : null,
        });
      } catch (e) {}
    }
    const revokedSet = new Set(edgeRevokedKeys.map((r) => String(r).toUpperCase()));
    const pendingOrders = edgeOrders.filter((o) => o && o.status === 'pending' && !revokedSet.has(o.id.toUpperCase()));
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

    const cleanDevUpper = cleanDevId.toUpperCase();
    const revUpper = edgeRevokedKeys.map((r) => String(r).trim().toUpperCase());
    const isRevokedDev = !activeLic && (
      revUpper.includes(cleanDevUpper) ||
      revUpper.includes(`DEV:${cleanDevUpper}`) ||
      (phone && revUpper.includes(`PHONE:${phone}`)) ||
      (matched.length > 0 && matched.every((o) => o.status === 'revoked'))
    );

    if (isRevokedDev) {
      return jsonResponse({
        success: true,
        isRevoked: true,
        action: 'FORCE_REVOKE',
        orders: matched,
        totalPending: 0,
        approvedCount: 0,
        totalPurchasedDays: 0,
        isCumulative: false,
        activeLicense: null,
        message: '🚨 Bản quyền của thiết bị này đã bị Quản trị viên thu hồi và ngắt kết nối!',
      });
    }

    return jsonResponse({
      success: true,
      isRevoked: false,
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

  // ROUTE: Trạng thái cơ sở dữ liệu Cloudflare Edge (D1, KV, Cache, Drive)
  if (pathname === '/api/admin/system/status' && method === 'GET') {
    return jsonResponse({
      success: true,
      d1Active: Boolean(d1),
      kvActive: Boolean(kv),
      edgeCacheActive: typeof caches !== 'undefined' && Boolean((caches as any).default),
      googleDriveSynced: Boolean(edgeSettings.googleDriveSheetWebhookUrl || env.GOOGLE_DRIVE_WEBHOOK_URL),
      totalOrders: edgeOrders.length,
      totalLicenses: edgeLicenses.length,
      primaryDomain: 'gia-long---tuy-n-d-ng.pages.dev',
    });
  }

  // ROUTE: Xuất toàn bộ cơ sở dữ liệu dạng JSON cho Google Drive & Backup
  if ((pathname === '/api/database/export.json' || pathname === '/database.json') && method === 'GET') {
    const { licenses } = autoConsolidateEdgeLicensesAndOrders();
    const data = {
      app: 'Gia Long - FB',
      version: '1.0.4',
      updatedAt: new Date().toISOString(),
      licenses: licenses || edgeLicenses,
      orders: edgeOrders,
      history: edgeHistory,
      settings: edgeSettings,
    };
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: corsHeaders(),
    });
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
      if (d1) {
        try {
          const rows: any = await d1.prepare(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 300`).all();
          if (rows?.results && rows.results.length > 0) {
            const d1Orders = rows.results.map((r: any) => ({
              id: r.id,
              pkgName: r.pkg_name,
              price: r.price,
              clientName: r.client_name,
              phone: r.phone,
              deviceId: r.device_id,
              createdAt: r.created_at,
              status: r.status,
              note: r.note,
            }));
            const orderMap = new Map<string, OrderItem>();
            edgeOrders.forEach((o) => orderMap.set(o.id, o));
            d1Orders.forEach((o: any) => orderMap.set(o.id, o));
            edgeOrders = Array.from(orderMap.values()).sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
          }
        } catch (e) {}
      } else if (!kv) {
        try {
          if (typeof caches !== 'undefined' && (caches as any).default) {
            const cacheUrl = `https://gia-long---tuy-n-d-ng.pages.dev/__edge_cache_orders`;
            const cacheReq = new Request(cacheUrl, { method: 'GET' });
            const matched = await (caches as any).default.match(cacheReq);
            if (matched) {
              const cachedOrders = await matched.json();
              if (Array.isArray(cachedOrders) && cachedOrders.length > 0) {
                const orderMap = new Map<string, OrderItem>();
                edgeOrders.forEach((o) => orderMap.set(o.id, o));
                cachedOrders.forEach((o: any) => orderMap.set(o.id, o));
                edgeOrders = Array.from(orderMap.values()).sort(
                  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
              }
            }
          }
        } catch (e) {}
      }
      return jsonResponse({ success: true, orders: edgeOrders });
    }

    if (pathname === '/api/admin/history' && method === 'GET') {
      return jsonResponse({ success: true, history: edgeHistory });
    }

    if (pathname === '/api/admin/history/clear' && method === 'POST') {
      edgeHistory = [];
      if (d1) {
        try {
          await d1.exec(`DELETE FROM history`);
        } catch (e) {}
      }
      await syncKV();
      return jsonResponse({ success: true, message: 'Đã xóa toàn bộ lịch sử!', history: [] });
    }

    if (pathname === '/api/admin/orders/approve' && method === 'POST') {
      const { orderId, order: orderPayload } = body;
      let order = edgeOrders.find((o) => o.id === orderId);

      if (!order && orderPayload && (orderPayload.id || orderPayload.deviceId || orderPayload.phone)) {
        order = {
          id: orderPayload.id || orderId || `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          pkgName: orderPayload.pkgName || 'Gói 1 Tháng (30 ngày)',
          price: orderPayload.price || '1.000.000đ',
          clientName: orderPayload.clientName || 'Khách đặt mua',
          phone: orderPayload.phone || '',
          deviceId: orderPayload.deviceId || '',
          createdAt: orderPayload.createdAt || new Date().toISOString(),
          status: 'pending',
          note: orderPayload.note || '',
        };
        edgeOrders.push(order);
      }

      if (!order && orderId) {
        const cleanId = String(orderId).trim().toLowerCase();
        order = edgeOrders.find((o) => (o.deviceId && o.deviceId.toLowerCase() === cleanId) || (o.phone && o.phone.replace(/\D/g, '') === cleanId));
      }

      if (!order) return jsonResponse({ success: false, error: 'Không tìm thấy đơn hàng cần phê duyệt!' }, 404);

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

      if (matchedLic) {
        const nowMs = Date.now();
        const currExpMs = new Date(matchedLic.expiresAt).getTime();
        const baseTime = !isNaN(currExpMs) && currExpMs > nowMs ? currExpMs : nowMs;
        matchedLic.expiresAt = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();
        matchedLic.isSuspended = false;
        matchedLic.isRevoked = false;
        matchedLic.notes = `Bản quyền VIP: ${order.pkgName} (+${days} ngày)`;
        if (cleanDeviceId && cleanDeviceId !== 'chưa gắn' && cleanDeviceId !== 'chuagan') {
          if (!matchedLic.devices.some((d) => d.deviceId.toLowerCase() === cleanDeviceId)) {
            matchedLic.devices.push({
              deviceId: cleanDeviceId,
              deviceName: order.clientName || 'Thiết bị đặt mua',
              activatedAt: new Date().toISOString(),
              lastSeenAt: new Date().toISOString(),
            });
          }
        }
      } else {
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

      // Đồng bộ kích hoạt tức thì vào Cloudflare D1 Database
      if (d1) {
        try {
          await d1.prepare(`UPDATE orders SET status = 'approved' WHERE id = ?`).bind(order.id).run();
          if (cleanDeviceId) {
            const d1Token = generateSignedToken(cleanDeviceId, approvedLicense?.expiresAt || new Date(Date.now() + days * 86400000).toISOString(), env.SIGNING_SECRET);
            await d1.prepare(`
              INSERT OR REPLACE INTO licenses (id, key, machine_id, pkg_name, client_name, phone, price, status, created_at, expires_at, signed_token, notes, is_suspended, is_revoked, devices_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 0, 0, ?)
            `).bind(
              approvedLicense?.id || `lic_${order.id}`,
              approvedLicense?.key || `GLFB-VIP-${cleanDeviceId.slice(-6).toUpperCase()}`,
              cleanDeviceId,
              order.pkgName || 'Gói VIP',
              order.clientName || 'Khách Đặt Mua',
              order.phone || '',
              order.price || '0đ',
              new Date().toISOString(),
              approvedLicense?.expiresAt,
              d1Token,
              `Duyệt từ đơn ${order.id}`,
              JSON.stringify(approvedLicense?.devices || [{ deviceId: cleanDeviceId, activatedAt: new Date().toISOString() }])
            ).run();
          }
        } catch (d1Err) {
          console.warn('[D1 Order Approve Sync]', d1Err);
        }
      }

      // Thông báo cập nhật sang Google Drive / Google Sheets
      const gDriveUrl = edgeSettings.googleDriveSheetWebhookUrl || env.GOOGLE_DRIVE_WEBHOOK_URL;
      if (gDriveUrl && edgeSettings.googleDriveSyncEnabled !== false) {
        syncToGoogleDrive({ ...order, status: 'approved' }, gDriveUrl);
        try {
          fetch(gDriveUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'approve',
              deviceId: cleanDeviceId || order.deviceId,
              clientName: order.clientName,
              phone: order.phone,
              pkgName: order.pkgName,
              days: days || 30,
              expiresAt: approvedLicense?.expiresAt,
            }),
          }).catch(() => {});
        } catch (e) {}
      }

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
      const found = edgeLicenses.find((l) => l.id === id || l.key === id);
      if (!found) return jsonResponse({ success: false, error: 'Không tìm thấy mã!' }, 404);

      const now = Date.now();
      const curExp = new Date(found.expiresAt).getTime();
      const baseTime = curExp > now ? curExp : now;
      const newExp = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();
      found.expiresAt = newExp;
      found.isSuspended = false;

      // Đồng bộ vào Cloudflare D1
      if (d1) {
        try {
          const mainDevId = found.devices?.[0]?.deviceId || found.id;
          const d1Token = generateSignedToken(mainDevId, newExp, env.SIGNING_SECRET);
          await d1.prepare(`
            UPDATE licenses
            SET expires_at = ?, signed_token = ?, status = 'active', is_suspended = 0, is_revoked = 0
            WHERE id = ? OR key = ?
          `).bind(newExp, d1Token, found.id, found.key).run();
        } catch (d1Err) {
          console.warn('[D1 Extend Error]', d1Err);
        }
      }

      // Thông báo sang Google Drive / Google Sheets nếu bật
      const gDriveUrl = edgeSettings.googleDriveSheetWebhookUrl || env.GOOGLE_DRIVE_WEBHOOK_URL;
      if (gDriveUrl && edgeSettings.googleDriveSyncEnabled !== false) {
        try {
          fetch(gDriveUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'extend',
              event: 'LICENSE_EXTEND',
              key: found.key,
              clientName: found.clientName,
              phone: found.phone || '',
              daysAdded: days,
              newExpiresAt: newExp,
              timestamp: new Date().toISOString(),
            }),
          }).catch(() => {});
        } catch (e) {}
      }

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
        notes: `Gia hạn thêm ${days} ngày. Hạn mới: ${new Date(newExp).toLocaleDateString('vi-VN')}`,
      });
      await syncKV();

      return jsonResponse({
        success: true,
        message: `✓ Đã gia hạn thêm ${days} ngày cho khách ${found.clientName}! Hạn mới: ${new Date(newExp).toLocaleDateString('vi-VN')}`,
        license: found,
        licenses: edgeLicenses,
        history: edgeHistory,
      });
    }

    // Cập nhật thông tin bản quyền (Sửa trực tiếp ngày hết hạn, tên, sđt, ghi chú)
    if (pathname === '/api/admin/licenses/update' && method === 'POST') {
      const { id, clientName, phone, expiresAt, maxDevices, notes, planType } = body;
      const found = edgeLicenses.find((l) => l.id === id || l.key === id);
      if (!found) return jsonResponse({ success: false, error: 'Không tìm thấy mã bản quyền!' }, 404);

      const prevExp = found.expiresAt;
      if (clientName !== undefined) found.clientName = String(clientName).trim();
      if (phone !== undefined) found.phone = String(phone).trim();
      if (expiresAt !== undefined && !isNaN(new Date(expiresAt).getTime())) {
        found.expiresAt = new Date(expiresAt).toISOString();
      }
      if (maxDevices !== undefined) {
        const slots = parseInt(maxDevices, 10);
        if (slots >= 1) found.maxDevices = slots;
      }
      if (notes !== undefined) found.notes = String(notes);
      if (planType !== undefined && ['individual', 'team', 'trial'].includes(planType)) {
        found.planType = planType;
      }

      if (d1) {
        try {
          const mainDevId = found.devices?.[0]?.deviceId || found.id;
          const d1Token = generateSignedToken(mainDevId, found.expiresAt, env.SIGNING_SECRET);
          await d1.prepare(`
            UPDATE licenses
            SET client_name = ?, phone = ?, expires_at = ?, signed_token = ?, notes = ?
            WHERE id = ? OR key = ?
          `).bind(found.clientName, found.phone, found.expiresAt, d1Token, found.notes, found.id, found.key).run();
        } catch (d1Err) {
          console.warn('[D1 Update License]', d1Err);
        }
      }

      if (expiresAt && expiresAt !== prevExp) {
        await addHistory({
          action: 'update_date',
          actionName: 'Sửa hạn dùng',
          clientName: found.clientName,
          phone: found.phone || '',
          deviceId: found.devices?.[0]?.deviceId || '',
          key: found.key,
          planType: found.planType,
          newExpiresAt: found.expiresAt,
          notes: `Đổi ngày hết hạn sang ${new Date(found.expiresAt).toLocaleDateString('vi-VN')}`,
        });
      }

      await syncKV();
      return jsonResponse({
        success: true,
        message: `✓ Đã cập nhật thông tin cho khách "${found.clientName}"!`,
        license: found,
        licenses: edgeLicenses,
        history: edgeHistory,
      });
    }

    // Cấp đổi sang một mã Key mới
    if (pathname === '/api/admin/licenses/regenerate-key' && method === 'POST') {
      const { id } = body;
      const found = edgeLicenses.find((l) => l.id === id || l.key === id);
      if (!found) return jsonResponse({ success: false, error: 'Không tìm thấy mã bản quyền!' }, 404);

      const randomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
      let prefix = 'GLFB-VIP';
      if (found.planType === 'team') prefix = 'GLFB-TEAM';
      else if (found.planType === 'trial') prefix = 'GLFB-TRIAL';

      const oldKey = found.key;
      const newKey = `${prefix}-${randomCode}`;
      if (!found.aliasKeys) found.aliasKeys = [];
      if (!found.aliasKeys.includes(oldKey)) found.aliasKeys.push(oldKey);
      found.key = newKey;

      if (d1) {
        try {
          await d1.prepare(`UPDATE licenses SET key = ? WHERE id = ? OR key = ?`).bind(newKey, found.id, oldKey).run();
        } catch (e) {}
      }

      await addHistory({
        action: 'create',
        actionName: 'Đổi mã Key mới',
        clientName: found.clientName,
        phone: found.phone || '',
        deviceId: found.devices?.[0]?.deviceId || '',
        key: newKey,
        planType: found.planType,
        notes: `Đổi mã từ ${oldKey} sang ${newKey}`,
      });

      await syncKV();
      return jsonResponse({
        success: true,
        message: `✓ Đã đổi mã Key mới thành công: ${newKey}`,
        newKey,
        license: found,
        licenses: edgeLicenses,
        history: edgeHistory,
      });
    }

    // Cập nhật thông tin đơn hàng
    if (pathname === '/api/admin/orders/update' && method === 'POST') {
      const { orderId, clientName, phone, pkgName, price, note, deviceId, status } = body;
      if (!orderId) return jsonResponse({ success: false, error: 'Thiếu mã đơn hàng!' }, 400);

      const order = edgeOrders.find((o) => o.id === orderId);
      if (!order) return jsonResponse({ success: false, error: 'Không tìm thấy đơn hàng cần cập nhật!' }, 404);

      if (clientName !== undefined) order.clientName = String(clientName).trim();
      if (phone !== undefined) order.phone = String(phone).trim();
      if (pkgName !== undefined) order.pkgName = String(pkgName).trim();
      if (price !== undefined) order.price = String(price).trim();
      if (note !== undefined) order.note = String(note).trim();
      if (deviceId !== undefined) order.deviceId = String(deviceId).trim();
      if (status !== undefined) order.status = status;

      if (d1) {
        try {
          await d1.prepare(`
            UPDATE orders
            SET client_name = ?, phone = ?, pkg_name = ?, price = ?, note = ?, device_id = ?, status = ?
            WHERE id = ?
          `).bind(order.clientName, order.phone, order.pkgName, order.price, order.note, order.deviceId, order.status, order.id).run();
        } catch (e) {}
      }

      const orderShortId = order.id.slice(-8).toUpperCase();
      await addHistory({
        action: 'update_date',
        actionName: 'Cập nhật đơn mua',
        clientName: order.clientName || 'Khách đặt mua',
        phone: order.phone || '',
        deviceId: order.deviceId || '',
        key: orderShortId,
        planType: 'individual',
        pkgName: normalizePkgSymbol(order.pkgName),
        amount: order.price,
        notes: `Cập nhật đơn ${orderShortId}: ${order.clientName} - ${order.pkgName} (${order.price})`,
      });

      await syncKV();
      return jsonResponse({
        success: true,
        message: '✓ Đã cập nhật đơn đặt mua và đồng bộ lịch sử thành công!',
        order,
        orders: edgeOrders,
        history: edgeHistory,
      });
    }

    if (pathname === '/api/admin/licenses/revoke' && method === 'POST') {
      const { id, key, reason } = body;
      const searchId = String(id || key || '').trim();
      const found = edgeLicenses.find((l) => l.id === searchId || l.key === searchId || (searchId && l.key?.toUpperCase() === searchId.toUpperCase()));
      if (!found) return jsonResponse({ success: false, error: 'Không tìm thấy mã!' }, 404);

      const revokeReason = reason || 'Vi phạm điều khoản sử dụng hoặc Quản trị viên ngắt máy';
      found.isRevoked = true;
      found.isSuspended = true;
      found.revokedAt = new Date().toISOString();
      found.revokeReason = revokeReason;
      const disconnectedDevices = (found.devices || []).map((d) => d.deviceId).filter(Boolean);
      (found as any).revokedDevices = Array.from(new Set([...((found as any).revokedDevices || []), ...disconnectedDevices]));
      found.devices = [];

      // Ghi nhận key, id, aliasKeys, phone và các thiết bị vào edgeRevokedKeys
      const aliasSet = new Set<string>([found.key.toUpperCase(), ...(found.aliasKeys || []).map((k) => k.toUpperCase())]);
      aliasSet.forEach((k) => {
        if (k && !edgeRevokedKeys.includes(k)) edgeRevokedKeys.push(k);
      });
      if (found.id && !edgeRevokedKeys.includes(found.id.toUpperCase())) {
        edgeRevokedKeys.push(found.id.toUpperCase());
      }
      disconnectedDevices.forEach((dev) => {
        if (!edgeRevokedKeys.includes(dev)) edgeRevokedKeys.push(dev);
        if (!edgeRevokedKeys.includes(dev.toUpperCase())) edgeRevokedKeys.push(dev.toUpperCase());
        if (!edgeRevokedKeys.includes(`DEV:${dev}`)) edgeRevokedKeys.push(`DEV:${dev}`);
        if (!edgeRevokedKeys.includes(`DEV:${dev.toUpperCase()}`)) edgeRevokedKeys.push(`DEV:${dev.toUpperCase()}`);
      });
      if (found.phone) {
        const cleanPh = found.phone.replace(/\D/g, '');
        if (cleanPh) {
          if (!edgeRevokedKeys.includes(cleanPh)) edgeRevokedKeys.push(cleanPh);
          if (!edgeRevokedKeys.includes(`PHONE:${cleanPh}`)) edgeRevokedKeys.push(`PHONE:${cleanPh}`);
        }
      }

      // Cập nhật trạng thái các đơn hàng liên quan sang 'revoked'
      edgeOrders = edgeOrders.map((o) => {
        const oKey = (o.generatedKey || '').trim().toUpperCase();
        const oDev = (o.deviceId || '').trim().toLowerCase();
        const oPhone = (o.phone || '').trim().replace(/\D/g, '');
        const cleanPh = (found.phone || '').replace(/\D/g, '');

        const isMatch =
          (oKey && (aliasSet.has(oKey))) ||
          (cleanPh && oPhone && oPhone === cleanPh) ||
          (oDev && disconnectedDevices.some((d) => d.toLowerCase() === oDev)) ||
          (o.id && (o.id === found.id || `lic_${o.id}` === found.id));

        if (isMatch) {
          edgeRevokedKeys.push(o.id.toUpperCase());
          if (o.deviceId) {
            edgeRevokedKeys.push(o.deviceId);
            edgeRevokedKeys.push(`DEV:${o.deviceId.toUpperCase()}`);
          }
          return {
            ...o,
            status: 'revoked' as const,
            note: (o.note ? o.note + ' • ' : '') + 'Đã thu hồi bản quyền và ngắt máy',
          };
        }
        return o;
      });

      if (d1) {
        try {
          await d1.prepare(`
            UPDATE licenses
            SET is_revoked = 1, is_suspended = 1, status = 'revoked', devices_json = '[]'
            WHERE id = ? OR key = ?
          `).bind(found.id, found.key).run();

          await d1.prepare(`
            UPDATE orders
            SET status = 'revoked'
            WHERE generated_key = ? OR phone = ?
          `).bind(found.key, found.phone || '').run();
        } catch (e) {}
      }

      await addHistory({
        action: 'revoke',
        actionName: 'Thu hồi quyền',
        clientName: found.clientName,
        phone: found.phone || '',
        deviceId: disconnectedDevices.join(', '),
        key: found.key,
        planType: found.planType,
        notes: revokeReason,
      });
      await syncKV();

      return jsonResponse({
        success: true,
        message: `🚫 Đã thu hồi bản quyền của "${found.clientName}" và ngắt kết nối toàn bộ máy tính (${disconnectedDevices.length} máy)!`,
        license: found,
        licenses: edgeLicenses,
        orders: edgeOrders,
        history: edgeHistory,
      });
    }

    if (pathname === '/api/admin/licenses/unrevoke' && method === 'POST') {
      const { id } = body;
      const found = edgeLicenses.find((l) => l.id === id || l.key === id);
      if (!found) return jsonResponse({ success: false, error: 'Không tìm thấy mã!' }, 404);

      found.isRevoked = false;
      found.isSuspended = false;
      delete found.revokedAt;
      delete found.revokeReason;

      if (d1) {
        try {
          await d1.prepare(`
            UPDATE licenses
            SET is_revoked = 0, is_suspended = 0, status = 'active'
            WHERE id = ? OR key = ?
          `).bind(found.id, found.key).run();
        } catch (e) {}
      }

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

      return jsonResponse({
        success: true,
        message: `✓ Đã khôi phục hoạt động cho "${found.clientName}"!`,
        license: found,
        licenses: edgeLicenses,
        history: edgeHistory,
      });
    }

    if (pathname === '/api/admin/licenses/toggle' && method === 'POST') {
      const { id } = body;
      const found = edgeLicenses.find((l) => l.id === id || l.key === id);
      if (!found) return jsonResponse({ success: false, error: 'Không tìm thấy mã!' }, 404);

      found.isSuspended = !found.isSuspended;

      if (d1) {
        try {
          await d1.prepare(`
            UPDATE licenses
            SET is_suspended = ?
            WHERE id = ? OR key = ?
          `).bind(found.isSuspended ? 1 : 0, found.id, found.key).run();
        } catch (e) {}
      }

      await syncKV();
      return jsonResponse({
        success: true,
        message: found.isSuspended ? 'Đã tạm khóa mã này!' : 'Đã mở khóa mã hoạt động bình thường!',
        isSuspended: found.isSuspended,
        licenses: edgeLicenses,
        history: edgeHistory,
      });
    }

    if (pathname === '/api/admin/licenses/reset-devices' && method === 'POST') {
      const { id } = body;
      const found = edgeLicenses.find((l) => l.id === id || l.key === id);
      if (!found) return jsonResponse({ success: false, error: 'Không tìm thấy mã!' }, 404);

      const count = found.devices.length;
      found.devices = [];

      if (d1) {
        try {
          await d1.prepare(`UPDATE licenses SET devices_json = '[]' WHERE id = ? OR key = ?`).bind(found.id, found.key).run();
        } catch (e) {}
      }

      await syncKV();
      return jsonResponse({
        success: true,
        message: `✓ Đã xóa ${count} thiết bị liên kết cũ!`,
        licenses: edgeLicenses,
        history: edgeHistory,
      });
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

      // Xóa vĩnh viễn khỏi Cloudflare D1
      if (d1 && targetId) {
        try {
          await d1.prepare(`DELETE FROM licenses WHERE id = ? OR key = ?`).bind(targetId, targetId).run();
        } catch (e) {}
      }

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

      if (d1 && targetId) {
        try {
          await d1.prepare(`DELETE FROM orders WHERE id = ?`).bind(targetId).run();
        } catch (e) {}
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
      if (d1) {
        try {
          for (const [k, v] of Object.entries(edgeSettings)) {
            await d1.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).bind(k, JSON.stringify(v)).run();
          }
        } catch (e) {}
      }
      await syncKV();
      return jsonResponse({ success: true, settings: edgeSettings, message: 'Đã lưu cài đặt và đồng bộ hệ thống thành công!' });
    }

    // ROUTE: Sao lưu toàn bộ dữ liệu ra file JSON
    if (pathname === '/api/admin/backup-json' && method === 'GET') {
      const { licenses } = autoConsolidateEdgeLicensesAndOrders();
      const backupData = {
        version: '1.0.4',
        exportedAt: new Date().toISOString(),
        licenses: licenses || edgeLicenses,
        orders: edgeOrders,
        history: edgeHistory,
        revokedKeys: edgeRevokedKeys,
        settings: edgeSettings,
      };
      return new Response(JSON.stringify(backupData, null, 2), {
        status: 200,
        headers: {
          ...corsHeaders(),
          'Content-Disposition': `attachment; filename="gia_long_fb_backup_${Date.now()}.json"`,
        },
      });
    }

    // ROUTE: Khôi phục và đồng bộ tức thì toàn bộ dữ liệu từ file JSON / LocalStorage / Google Drive
    if (pathname === '/api/admin/restore-json' && method === 'POST') {
      const data = body;
      if (!data || typeof data !== 'object') {
        return jsonResponse({ success: false, error: 'Dữ liệu JSON không hợp lệ!' }, 400);
      }
      if (Array.isArray(data.licenses) && data.licenses.length > 0) {
        const licMap = new Map<string, LicenseItem>();
        edgeLicenses.forEach((l) => { if (l && l.key) licMap.set(l.key.toUpperCase(), l); });
        data.licenses.forEach((l: LicenseItem) => {
          if (l && l.key) {
            const upperKey = l.key.toUpperCase();
            if (licMap.has(upperKey)) {
              licMap.set(upperKey, { ...licMap.get(upperKey)!, ...l });
            } else {
              licMap.set(upperKey, l);
            }
          }
        });
        edgeLicenses = Array.from(licMap.values());
      }
      if (Array.isArray(data.orders) && data.orders.length > 0) {
        const orderMap = new Map<string, OrderItem>();
        edgeOrders.forEach((o) => { if (o && o.id) orderMap.set(o.id, o); });
        data.orders.forEach((o: OrderItem) => {
          if (o && o.id) {
            if (orderMap.has(o.id)) {
              orderMap.set(o.id, { ...orderMap.get(o.id)!, ...o });
            } else {
              orderMap.set(o.id, o);
            }
          }
        });
        edgeOrders = Array.from(orderMap.values()).sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
      }
      if (Array.isArray(data.history) && data.history.length > 0) {
        const histMap = new Map<string, LicenseHistoryItem>();
        edgeHistory.forEach((h) => { if (h && h.id) histMap.set(h.id, h); });
        data.history.forEach((h: LicenseHistoryItem) => {
          if (h && h.id) histMap.set(h.id, h);
        });
        edgeHistory = Array.from(histMap.values()).sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
      }
      if (data.settings && typeof data.settings === 'object') {
        edgeSettings = { ...edgeSettings, ...data.settings };
      }

      autoConsolidateEdgeLicensesAndOrders();
      await syncKV();

      return jsonResponse({
        success: true,
        message: '✓ Khôi phục và đồng bộ dữ liệu từ file JSON thành công!',
        licenses: edgeLicenses,
        orders: edgeOrders,
        history: edgeHistory,
      });
    }

    // ROUTE: Kiểm tra kết nối Google Drive / Google Sheets Webhook
    if (pathname === '/api/admin/google-drive/test' && method === 'POST') {
      const testUrl = body.webhookUrl || edgeSettings.googleDriveSheetWebhookUrl || env.GOOGLE_DRIVE_WEBHOOK_URL;
      if (!testUrl || !testUrl.startsWith('http')) {
        return jsonResponse({ success: false, error: 'Chưa nhập Webhook URL của Google Sheet!' }, 400);
      }
      const testOrder = {
        id: `test_${Date.now()}`,
        pkgName: 'Gói Thử Nghiệm Kết Nối',
        price: '0đ',
        clientName: 'Khách Test Google Drive',
        phone: '0869029310',
        deviceId: 'TEST-PC-DEVICE',
        createdAt: new Date().toISOString(),
        status: 'pending',
        note: 'Đơn hàng kiểm tra kết nối từ Quản trị viên Gia Long FB',
      };
      const ok = await syncToGoogleDrive(testOrder, testUrl);
      if (ok) {
        return jsonResponse({ success: true, message: '✓ Kết nối Google Drive & Google Sheets thành công! Đã gửi đơn mẫu vào trang tính.' });
      } else {
        return jsonResponse({ success: false, error: 'Không thể gửi đến Webhook Google Drive. Vui lòng kiểm tra lại URL triển khai Apps Script (Web App) của bạn.' }, 500);
      }
    }

    // ROUTE: Đồng bộ toàn bộ đơn hàng sang Google Drive
    if (pathname === '/api/admin/google-drive/sync-all' && method === 'POST') {
      const syncUrl = body.webhookUrl || edgeSettings.googleDriveSheetWebhookUrl || env.GOOGLE_DRIVE_WEBHOOK_URL;
      if (!syncUrl || !syncUrl.startsWith('http')) {
        return jsonResponse({ success: false, error: 'Chưa nhập Webhook URL của Google Sheet!' }, 400);
      }
      let sentCount = 0;
      for (const ord of edgeOrders) {
        try {
          await syncToGoogleDrive(ord, syncUrl);
          sentCount++;
        } catch (e) {}
      }
      return jsonResponse({ success: true, message: `✓ Đã đồng bộ thành công ${sentCount} đơn hàng sang Google Sheet trên Google Drive!`, count: sentCount });
    }

// Helper trích xuất File ID từ link Google Drive
function extractGoogleDriveFileId(link: string): string | null {
  if (!link) return null;
  const match = link.match(/\/d\/([a-zA-Z0-9_-]+)/) || link.match(/id=([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{25,}$/.test(link.trim())) return link.trim();
  return null;
}

    // ROUTE: Kéo toàn bộ đơn hàng và bản quyền từ Google Drive về trang Admin (Đáp ứng 2 chiều & File JSON Google Drive)
    if (pathname === '/api/admin/google-drive/pull' && (method === 'GET' || method === 'POST')) {
      const gUrl = body.driveUrlOrId || body.webhookUrl || edgeSettings.googleDriveJsonLink || edgeSettings.googleDriveSheetWebhookUrl || env.GOOGLE_DRIVE_WEBHOOK_URL;
      if (!gUrl || (!gUrl.startsWith('http') && !extractGoogleDriveFileId(gUrl))) {
        return jsonResponse({ success: false, error: 'Chưa cấu hình link file JSON Google Drive hoặc Webhook!' }, 400);
      }

      const fileId = extractGoogleDriveFileId(gUrl);
      if (gUrl.includes('drive.google.com') || gUrl.includes('docs.google.com') || fileId || gUrl.endsWith('.json')) {
        try {
          const downloadUrl = fileId
            ? `https://drive.google.com/uc?export=download&id=${fileId}`
            : gUrl;
          const jsonResp = await fetch(downloadUrl);
          const text = await jsonResp.text();
          if (!jsonResp.ok || text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
            return jsonResponse({
              success: false,
              error: 'Không thể tải file JSON từ Google Drive (File có thể đang ở chế độ Riêng tư). Hãy đảm bảo quyền chia sẻ Google Drive là "Bất kỳ ai có liên kết đều có thể xem"!',
            }, 400);
          }
          let gData: any;
          try {
            gData = JSON.parse(text);
          } catch (e) {
            return jsonResponse({ success: false, error: 'File trên Google Drive không đúng định dạng JSON!' }, 400);
          }

          let pOrders = 0;
          let pLicenses = 0;
          if (Array.isArray(gData.orders)) {
            const existingIds = new Set(edgeOrders.map((o) => o.id));
            for (const po of gData.orders) {
              if (!existingIds.has(po.id)) {
                edgeOrders.unshift(po);
                pOrders++;
              }
            }
          }
          if (Array.isArray(gData.licenses)) {
            const existingLicKeys = new Set(edgeLicenses.map((l) => l.devices?.[0]?.deviceId?.toLowerCase()));
            for (const pl of gData.licenses) {
              const d = pl.devices?.[0]?.deviceId?.toLowerCase();
              if (d && !existingLicKeys.has(d)) {
                edgeLicenses.unshift(pl);
                pLicenses++;
              }
            }
          }
          if (Array.isArray(gData.history)) {
            for (const h of gData.history) {
              edgeHistory.unshift(h);
            }
          }

          edgeSettings.googleDriveJsonLink = gUrl;
          if (d1) {
            try {
              await d1.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).bind('googleDriveJsonLink', JSON.stringify(gUrl)).run();
            } catch (e) {}
          }
          await syncKV();

          return jsonResponse({
            success: true,
            message: `✓ Đã nạp thành công từ Google Drive (Thêm ${pOrders} đơn, ${pLicenses} bản quyền)!`,
            orders: edgeOrders,
            licenses: edgeLicenses,
            history: edgeHistory,
          });
        } catch (err: any) {
          return jsonResponse({ success: false, error: 'Lỗi tải file JSON từ Google Drive: ' + err.message }, 500);
        }
      }

      try {
        const resp = await fetch(`${gUrl}?action=get_all`);
        const text = await resp.text();
        if (!resp.ok || text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
          return jsonResponse({ success: false, error: 'Không thể kết nối đến Google Drive Webhook. Vui lòng kiểm tra lại URL!' }, 500);
        }
        let gData: any;
        try {
          gData = JSON.parse(text);
        } catch (e) {
          return jsonResponse({ success: false, error: 'Phản hồi từ Google Sheet không đúng định dạng JSON!' }, 500);
        }
        const ordersRaw = Array.isArray(gData.orders) ? gData.orders : [];
        const licensesRaw = Array.isArray(gData.licenses) ? gData.licenses : [];

        // Đọc danh sách đơn từ tab Orders
        const pulledOrders: OrderItem[] = [];
        for (let i = 1; i < ordersRaw.length; i++) {
          const row = ordersRaw[i];
          if (!row || !row[1]) continue;
          pulledOrders.push({
            createdAt: row[0] || new Date().toISOString(),
            id: String(row[1]),
            clientName: row[2] || '',
            phone: row[3] || '',
            pkgName: row[4] || 'Gói VIP',
            price: row[5] || '1.000.000đ',
            deviceId: row[6] || '',
            status: String(row[7] || 'pending').toLowerCase() === 'approved' || String(row[7]).includes('ĐÃ DUYỆT') ? 'approved' : 'pending',
            note: row[8] || '',
          });
        }

        if (pulledOrders.length > 0) {
          const existingIds = new Set(edgeOrders.map((o) => o.id));
          for (const po of pulledOrders) {
            if (!existingIds.has(po.id)) {
              edgeOrders.unshift(po);
            }
          }
        }

        // Đọc danh sách bản quyền từ tab Licenses
        const pulledLicenses: LicenseItem[] = [];
        for (let j = 1; j < licensesRaw.length; j++) {
          const lRow = licensesRaw[j];
          if (!lRow || !lRow[0]) continue;
          const devId = String(lRow[0]).trim();
          const expDate = lRow[4] || new Date(Date.now() + 30 * 86400000).toISOString();
          pulledLicenses.push({
            id: `lic_gdrive_${devId}`,
            key: `GLFB-VIP-${devId.slice(-6).toUpperCase()}`,
            clientName: lRow[1] || 'Khách Google Drive',
            phone: lRow[2] || '',
            planType: 'individual',
            maxDevices: 1,
            devices: [{
              deviceId: devId,
              deviceName: lRow[1] || 'Thiết bị Google Drive',
              activatedAt: lRow[6] || new Date().toISOString(),
              lastSeenAt: new Date().toISOString(),
            }],
            createdAt: lRow[6] || new Date().toISOString(),
            expiresAt: expDate,
            isSuspended: false,
            isRevoked: String(lRow[5] || '').toLowerCase() === 'revoked',
            notes: lRow[7] || 'Đồng bộ từ Google Drive',
          });
        }

        if (pulledLicenses.length > 0) {
          const existingLicKeys = new Set(edgeLicenses.map((l) => l.devices?.[0]?.deviceId?.toLowerCase()));
          for (const pl of pulledLicenses) {
            const d = pl.devices?.[0]?.deviceId?.toLowerCase();
            if (d && !existingLicKeys.has(d)) {
              edgeLicenses.unshift(pl);
            }
          }
        }

        return jsonResponse({
          success: true,
          message: `✓ Đã kéo thành công ${pulledOrders.length} đơn và ${pulledLicenses.length} bản quyền từ Google Drive!`,
          orders: edgeOrders,
          licenses: edgeLicenses,
        });
      } catch (pullErr: any) {
        return jsonResponse({ success: false, error: pullErr.message || 'Lỗi đọc dữ liệu từ Google Drive' }, 500);
      }
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
