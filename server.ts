import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = path.join(__dirname, 'data');
const DIST_EXT_DIR = path.join(__dirname, 'dist-extension');
const LICENSES_FILE = path.join(DATA_DIR, 'licenses.json');
const ADMIN_PIN_FILE = path.join(DATA_DIR, 'admin-pin.json');

function getActiveAdminPin(): string {
  try {
    if (fs.existsSync(ADMIN_PIN_FILE)) {
      const data = JSON.parse(fs.readFileSync(ADMIN_PIN_FILE, 'utf-8'));
      if (data && data.pin) return String(data.pin).trim();
    }
  } catch (e) {}
  return process.env.ADMIN_PIN || 'Ha26062018$';
}

function setActiveAdminPin(pin: string) {
  try {
    fs.writeFileSync(ADMIN_PIN_FILE, JSON.stringify({ pin, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
  } catch (e) {}
}

// Đảm bảo thư mục lưu dữ liệu tồn tại
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface LicenseItem {
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

// Khởi tạo danh sách rỗng nếu chưa có file (không tạo người dùng mẫu để tránh tái xuất hiện sau khi xóa)
function getInitialLicenses(): LicenseItem[] {
  return [];
}

function loadLicenses(): LicenseItem[] {
  try {
    if (!fs.existsSync(LICENSES_FILE)) {
      const initial = getInitialLicenses();
      fs.writeFileSync(LICENSES_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(LICENSES_FILE, 'utf-8');
    return JSON.parse(raw) as LicenseItem[];
  } catch (err) {
    console.error('[License DB] Lỗi đọc file:', err);
    return getInitialLicenses();
  }
}

function saveLicenses(items: LicenseItem[]) {
  try {
    fs.writeFileSync(LICENSES_FILE, JSON.stringify(items, null, 2), 'utf-8');
    syncGlobalStoreServer().catch(() => {});
  } catch (err) {
    console.error('[License DB] Lỗi lưu file:', err);
  }
}

// ============================================================================
// HỆ THỐNG LỊCH SỬ CẤP MÃ & GIA HẠN BẢN QUYỀN (LICENSE ACTION HISTORY)
// ============================================================================
export interface LicenseHistoryItem {
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

const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const REVOKED_KEYS_FILE = path.join(DATA_DIR, 'revoked-keys.json');

export interface RevokedKeyItem {
  key: string;
  reason?: string;
  revokedAt: string;
}

function loadRevokedKeys(): RevokedKeyItem[] {
  try {
    if (fs.existsSync(REVOKED_KEYS_FILE)) {
      return JSON.parse(fs.readFileSync(REVOKED_KEYS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return [];
}

function addRevokedKey(key: string, reason = 'Quản trị viên xóa hoặc thu hồi bản quyền') {
  if (!key) return;
  const list = loadRevokedKeys();
  const cleanKey = key.trim().toUpperCase();
  if (!list.some((r) => r.key === cleanKey)) {
    list.unshift({ key: cleanKey, reason, revokedAt: new Date().toISOString() });
    try {
      fs.writeFileSync(REVOKED_KEYS_FILE, JSON.stringify(list, null, 2), 'utf-8');
      syncGlobalStoreServer().catch(() => {});
    } catch (e) {}
  }
}

function removeRevokedKey(key: string) {
  if (!key) return;
  let list = loadRevokedKeys();
  list = list.filter((r) => r.key !== key.trim().toUpperCase());
  try {
    fs.writeFileSync(REVOKED_KEYS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {}
}

export function normalizePkgSymbol(pkgOrDays: any): string {
  const str = String(pkgOrDays || '').trim().toLowerCase();
  if (str === '30' || str.includes('1 tháng') || str.includes('30 ngày') || str === '1th') return '1TH';
  if (str === '100' || str === '90' || str.includes('3 tháng') || str.includes('100 ngày') || str === '3th') return '3TH';
  if (str === '195' || str === '180' || str.includes('6 tháng') || str.includes('195 ngày') || str === '6th') return '6TH';
  if (str === '390' || str === '365' || str.includes('1 năm') || str.includes('12 tháng') || str === '1n') return '1N';
  if (str.includes('trial') || str.includes('dùng thử')) return 'TRIAL';
  if (str) return str.toUpperCase();
  return '1TH';
}

function getInitialHistory(): LicenseHistoryItem[] {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  return [
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
      newExpiresAt: new Date(now + 30 * dayMs).toISOString(),
      amount: '3.000.000đ',
      createdAt: new Date(now - 2 * dayMs).toISOString(),
      notes: 'Khởi tạo cấp phép 3 máy cho phòng tuyển dụng',
    },
    {
      id: 'hist_init_2',
      action: 'create',
      actionName: 'Cấp mã mới (Cá nhân)',
      clientName: 'Anh Tuấn (Recruiter Tự Do)',
      phone: '0912345678',
      deviceId: 'TUAN-DELL-LAT',
      key: 'VIP-CANHAN-2026',
      planType: 'individual',
      pkgName: '1TH',
      daysAdded: 30,
      newExpiresAt: new Date(now + 30 * dayMs).toISOString(),
      amount: '1.000.000đ',
      createdAt: new Date(now - 1 * dayMs).toISOString(),
      notes: 'Cấp mã bản quyền cá nhân 1 máy',
    },
  ];
}

function loadHistory(): LicenseHistoryItem[] {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      const init = getInitialHistory();
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(init, null, 2), 'utf-8');
      return init;
    }
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    return JSON.parse(raw) as LicenseHistoryItem[];
  } catch (e) {
    return getInitialHistory();
  }
}

function saveHistory(items: LicenseHistoryItem[]) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(items, null, 2), 'utf-8');
    syncGlobalStoreServer().catch(() => {});
  } catch (e) {
    console.error('[History DB] Lỗi lưu history:', e);
  }
}

function addHistoryEntry(entry: Omit<LicenseHistoryItem, 'id' | 'createdAt'> & { createdAt?: string }) {
  try {
    const list = loadHistory();
    const newItem: LicenseHistoryItem = {
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      createdAt: entry.createdAt || new Date().toISOString(),
      ...entry,
    };
    list.unshift(newItem);
    if (list.length > 300) list.length = 300;
    saveHistory(list);
    return newItem;
  } catch (err) {
    console.error('[History DB] Lỗi ghi lịch sử:', err);
  }
}

// Cấu hình Middleware
app.use(express.json({ limit: '10mb' }));

// CORS Header mở rộng cho Chrome Extension
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Admin-Pin');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware kiểm tra quyền Admin
function requireAdmin(req: Request, res: Response, next: () => void) {
  const pin = String(req.headers['x-admin-pin'] || req.body?.adminPin || req.query?.pin || '').trim();
  const currentPin = getActiveAdminPin();
  if (pin && pin === currentPin) {
    return next();
  }
  return res.status(401).json({ success: false, error: 'Khóa Quản Trị không hợp lệ!' });
}

// ============================================================================
// 1. API DÀNH CHO EXTENSION (XÁC THỰC & KÍCH HOẠT BẢN QUYỀN)
// ============================================================================

// Kiểm tra bản quyền (Heartbeat verification)
app.post('/api/license/verify', (req: Request, res: Response) => {
  const { key, deviceId } = req.body;
  if (!key) {
    return res.status(400).json({ valid: false, message: 'Vui lòng cung cấp mã bản quyền!' });
  }

  const cleanKey = String(key).trim().toUpperCase();
  const cleanDevId = deviceId ? String(deviceId).trim() : '';

  // 1. Kiểm tra danh sách mã & thiết bị đã bị xóa / thu hồi vĩnh viễn (Ngắt máy)
  const revokedList = loadRevokedKeys();
  const revokedRecord = revokedList.find((r) => {
    const rk = r.key.trim().toUpperCase();
    if (rk === cleanKey) return true;
    if (cleanDevId && (rk === cleanDevId.toUpperCase() || rk === `DEV:${cleanDevId.toUpperCase()}`)) return true;
    return false;
  });

  if (revokedRecord) {
    return res.json({
      valid: false,
      isRevoked: true,
      isDeleted: true,
      action: 'FORCE_REVOKE',
      message: `🚨 BẢN QUYỀN ĐÃ BỊ THU HỒI / NGẮT MÁY: ${revokedRecord.reason || 'Vi phạm điều khoản hoặc bị Quản trị viên ngắt kết nối'}. Mọi tính năng và tiến trình đã bị chấm dứt ngay lập tức!`,
    });
  }

  // Tự động kiểm tra và cộng dồn các gói mua cho máy khách
  const { licenses } = autoConsolidateLicensesAndOrders();

  let found = licenses.find((l) => {
    if (l.key.trim().toUpperCase() === cleanKey) return true;
    if (l.aliasKeys && l.aliasKeys.some((ak) => ak.trim().toUpperCase() === cleanKey)) return true;
    return false;
  });

  // Nếu không khớp mã nhưng có thiết bị gắn với bản quyền hợp lệ -> Tự động ánh xạ về bản quyền cộng dồn của máy
  if (!found && cleanDevId && cleanDevId !== 'chưa gắn' && cleanDevId !== 'chuagan') {
    found = licenses.find(
      (l) => !l.isRevoked && l.devices?.some((d) => d.deviceId.toLowerCase() === cleanDevId.toLowerCase())
    );
  }

  if (!found) {
    return res.json({
      valid: false,
      isRevoked: true,
      isDeleted: true,
      action: 'FORCE_REVOKE',
      message: '🚨 Mã bản quyền không tồn tại hoặc đã bị xóa khỏi hệ thống! Toàn bộ tính năng đã bị chấm dứt ngay lập tức.',
    });
  }

  if (found.isRevoked) {
    return res.json({
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
    return res.json({
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
  const expiresAtMs = new Date(found.expiresAt).getTime();
  const isExpired = expiresAtMs < now;
  const daysLeft = Math.max(0, Math.ceil((expiresAtMs - now) / (24 * 60 * 60 * 1000)));

  if (isExpired) {
    return res.json({
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

  // Kiểm tra thiết bị
  let isDeviceBound = false;
  if (deviceId) {
    const existingDev = found.devices.find((d) => d.deviceId === deviceId);
    if (existingDev) {
      existingDev.lastSeenAt = new Date().toISOString();
      saveLicenses(licenses);
      isDeviceBound = true;
    }
  }

  res.json({
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
});

// Kiểm tra bản quyền tự động theo mã thiết bị (Dành cho máy khách vừa được duyệt đề xuất mua)
app.get('/api/license/check-by-device', (req: Request, res: Response) => {
  const deviceId = String(req.query.deviceId || '').trim();
  if (!deviceId) {
    return res.status(400).json({ success: false, message: 'Thiếu mã thiết bị!' });
  }

  // 1. Kiểm tra nếu thiết bị này đã bị Quản trị viên Thu Hồi (Ngắt Máy)
  const revokedList = loadRevokedKeys();
  const cleanDevUpper = deviceId.toUpperCase();
  const isRevokedDev = revokedList.find((r) => {
    const k = r.key.trim().toUpperCase();
    return k === cleanDevUpper || k === `DEV:${cleanDevUpper}`;
  });
  if (isRevokedDev) {
    return res.json({
      success: false,
      isRevoked: true,
      action: 'FORCE_REVOKE',
      message: `🚨 THIẾT BỊ ĐÃ BỊ THU HỒI / NGẮT MÁY: ${isRevokedDev.reason || 'Quản trị viên đã ngắt kết nối thiết bị này'}!`,
    });
  }

  const { licenses } = autoConsolidateLicensesAndOrders();
  const now = Date.now();

  // Kiểm tra nếu có mã bản quyền gắn với thiết bị này mà đang bị thu hồi
  const foundRevokedLic = licenses.find((l) => {
    return l.isRevoked && l.devices && l.devices.some((d) => d.deviceId.toLowerCase() === deviceId.toLowerCase());
  });
  if (foundRevokedLic) {
    return res.json({
      success: false,
      isRevoked: true,
      action: 'FORCE_REVOKE',
      message: `🚨 BẢN QUYỀN ĐÃ BỊ THU HỒI (NGẮT MÁY): ${foundRevokedLic.revokeReason || 'Vi phạm điều khoản hoặc bị Quản trị viên ngắt'}!`,
    });
  }

  // Tìm mã bản quyền còn hạn, không bị khóa, gắn với deviceId này
  const found = licenses.find((l) => {
    if (l.isRevoked || l.isSuspended) return false;
    const expMs = new Date(l.expiresAt).getTime();
    if (expMs < now) return false;
    return l.devices && l.devices.some((d) => d.deviceId.toLowerCase() === deviceId.toLowerCase());
  });

  if (found) {
    const expiresAtMs = new Date(found.expiresAt).getTime();
    const daysLeft = Math.max(0, Math.ceil((expiresAtMs - now) / (24 * 60 * 60 * 1000)));
    return res.json({
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

  return res.json({ success: false, message: 'Chưa có bản quyền duyệt cho thiết bị này' });
});

// Kích hoạt bản quyền cho 1 thiết bị mới
app.post('/api/license/activate', (req: Request, res: Response) => {
  const { key, deviceId, deviceName } = req.body;
  if (!key || !deviceId) {
    return res.status(400).json({ success: false, message: 'Thiếu mã bản quyền hoặc mã định danh thiết bị!' });
  }

  const { licenses } = autoConsolidateLicensesAndOrders();
  const cleanKey = String(key).trim().toUpperCase();
  let found = licenses.find((l) => l.key.trim().toUpperCase() === cleanKey || l.aliasKeys?.some((ak) => ak.trim().toUpperCase() === cleanKey));

  if (!found && deviceId) {
    found = licenses.find((l) => !l.isRevoked && l.devices?.some((d) => d.deviceId.toLowerCase() === String(deviceId).toLowerCase()));
  }

  if (!found) {
    return res.status(404).json({ success: false, message: 'Mã bản quyền không tồn tại!' });
  }

  if (found.isRevoked) {
    return res.status(403).json({ success: false, message: `🚨 Mã bản quyền này ĐÃ BỊ THU HỒI VĨNH VIỄN: ${found.revokeReason || 'Vi phạm điều khoản sử dụng'}!` });
  }

  if (found.isSuspended) {
    return res.status(403).json({ success: false, message: 'Mã bản quyền này đang bị tạm khóa!' });
  }

  const now = Date.now();
  const expiresAtMs = new Date(found.expiresAt).getTime();
  if (expiresAtMs < now) {
    return res.status(403).json({ success: false, message: 'Mã bản quyền này đã hết hạn, vui lòng gia hạn gói mới!' });
  }

  // Kiểm tra xem thiết bị đã được kích hoạt chưa
  const existingDev = found.devices.find((d) => d.deviceId === deviceId);
  if (existingDev) {
    existingDev.lastSeenAt = new Date().toISOString();
    if (deviceName) existingDev.deviceName = deviceName;
    saveLicenses(licenses);

    const daysLeft = Math.max(0, Math.ceil((expiresAtMs - now) / (24 * 60 * 60 * 1000)));
    return res.json({
      success: true,
      message: 'Thiết bị này đã kích hoạt bản quyền từ trước!',
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

  // Nếu là thiết bị mới -> kiểm tra giới hạn số lượng thiết bị
  if (found.devices.length >= found.maxDevices) {
    const planDesc = found.planType === 'team' ? `Gói Doanh Nghiệp (Tối đa ${found.maxDevices} máy)` : 'Gói Cá Nhân (Tối đa 1 máy)';
    return res.status(403).json({
      success: false,
      message: `Mã đã đạt giới hạn thiết bị tối đa (${found.devices.length}/${found.maxDevices} máy - ${planDesc}). Hãy liên hệ Quản trị viên để nâng cấp thêm máy hoặc Reset thiết bị cũ!`,
    });
  }

  // Thêm thiết bị mới vào danh sách
  found.devices.push({
    deviceId,
    deviceName: deviceName || (found.planType === 'team' ? `Máy NV ${found.devices.length + 1}` : 'Máy Tính Cá Nhân'),
    activatedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  });

  saveLicenses(licenses);

  const daysLeft = Math.max(0, Math.ceil((expiresAtMs - now) / (24 * 60 * 60 * 1000)));
  res.json({
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
});

// ============================================================================
// 2. API DÀNH CHO ADMIN (QUẢN TRỊ BẢN QUYỀN & THU TIỀN)
// ============================================================================

// Xác thực mã PIN / Khóa Quản trị
app.post('/api/admin/verify-pin', (req: Request, res: Response) => {
  const pin = String(req.body?.pin || '').trim();
  const currentPin = getActiveAdminPin();
  if (pin && pin === currentPin) {
    return res.json({ success: true, message: 'Đăng nhập Quản Trị thành công!' });
  }
  res.status(401).json({ success: false, message: 'Khóa Quản Trị không chính xác!' });
});

// Đổi mã PIN / Mật khẩu Quản trị
app.post('/api/admin/change-pin', requireAdmin, (req: Request, res: Response) => {
  const { currentPin, newPin } = req.body;
  const activePin = getActiveAdminPin();
  if (!currentPin || String(currentPin).trim() !== activePin) {
    return res.status(400).json({ success: false, error: 'Mật khẩu hiện tại không chính xác!' });
  }
  if (!newPin || String(newPin).trim().length < 6) {
    return res.status(400).json({ success: false, error: 'Mật khẩu mới phải có tối thiểu 6 ký tự!' });
  }
  const cleanNewPin = String(newPin).trim();
  setActiveAdminPin(cleanNewPin);

  addHistoryEntry({
    action: 'update_date',
    actionName: 'Đổi Mật Khẩu Quản Trị',
    clientName: 'Hệ Thống Quản Trị',
    key: 'ADMIN-SECURITY',
    notes: 'Quản trị viên đã thay đổi mật khẩu / khóa quản trị thành công.',
  });

  return res.json({
    success: true,
    message: 'Đổi mật khẩu Quản trị thành công!',
    pin: cleanNewPin,
  });
});

// Lấy danh sách tất cả các License
app.get('/api/admin/licenses', requireAdmin, (_req: Request, res: Response) => {
  const { licenses } = autoConsolidateLicensesAndOrders();
  const now = Date.now();

  const formatted = licenses.map((l) => {
    const expMs = new Date(l.expiresAt).getTime();
    const daysLeft = Math.max(0, Math.ceil((expMs - now) / (24 * 60 * 60 * 1000)));
    return {
      ...l,
      daysLeft,
      isExpired: expMs < now,
    };
  });

  res.json({ success: true, licenses: formatted });
});

// Tạo mã bản quyền mới
app.post('/api/admin/licenses/create', requireAdmin, (req: Request, res: Response) => {
  const { clientName, phone, planType, maxDevices, durationDays, customKey, notes } = req.body;

  if (!clientName) {
    return res.status(400).json({ success: false, error: 'Vui lòng nhập tên khách hàng hoặc tên công ty!' });
  }

  const days = durationDays !== undefined ? (parseInt(durationDays, 10) || 1) : (planType === 'trial' ? 1 : 30);
  let slots = parseInt(maxDevices, 10) || 1;
  if (planType === 'team' && slots < 2) slots = 3; // Mặc định gói team là 3 máy

  // Sinh mã Key nếu không tự đặt
  let key = customKey ? String(customKey).trim().toUpperCase() : '';
  if (!key) {
    const randomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    if (planType === 'team') {
      key = `GLFB-TEAM-${randomCode}`;
    } else if (planType === 'trial') {
      key = `GLFB-TRIAL-${randomCode}`;
    } else {
      key = `GLFB-VIP-${randomCode}`;
    }
  }

  const licenses = loadLicenses();
  if (licenses.some((l) => l.key.toUpperCase() === key)) {
    return res.status(400).json({ success: false, error: 'Mã License Key này đã tồn tại, vui lòng chọn mã khác!' });
  }

  const now = Date.now();
  const expiresAt = new Date(now + days * 24 * 60 * 60 * 1000).toISOString();

  const newLicense: LicenseItem = {
    id: `lic_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    key,
    clientName: clientName.trim(),
    phone: phone ? String(phone).trim() : '',
    planType: planType || 'individual',
    maxDevices: slots,
    devices: [],
    createdAt: new Date().toISOString(),
    expiresAt,
    isSuspended: false,
    notes: notes || '',
  };

  licenses.unshift(newLicense);
  saveLicenses(licenses);

  addHistoryEntry({
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
    notes: newLicense.notes || `Tạo mã ${newLicense.key} (${days} ngày)`,
  });

  res.json({ success: true, license: newLicense, message: '✓ Đã tạo mã bản quyền mới thành công!' });
});

// Gia hạn thêm ngày (Ví dụ khi khách đóng tiền 500k hoặc 1.5tr)
app.post('/api/admin/licenses/extend', requireAdmin, (req: Request, res: Response) => {
  const { id, addDays } = req.body;
  const days = parseInt(addDays, 10) || 30;

  const licenses = loadLicenses();
  const found = licenses.find((l) => l.id === id);

  if (!found) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy mã bản quyền!' });
  }

  const now = Date.now();
  const currentExp = new Date(found.expiresAt).getTime();
  // Nếu đã hết hạn thì cộng từ hôm nay, nếu chưa thì cộng dồn thêm vào ngày hết hạn
  const baseTime = currentExp > now ? currentExp : now;
  const newExp = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();

  found.expiresAt = newExp;
  saveLicenses(licenses);

  addHistoryEntry({
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

  res.json({
    success: true,
    message: `✓ Đã gia hạn thêm ${days} ngày cho khách ${found.clientName}! Hạn mới: ${new Date(newExp).toLocaleDateString('vi-VN')}`,
    license: found,
  });
});

// Cập nhật thông tin bản quyền (Sửa trực tiếp ngày hết hạn, tên, sđt, số máy, ghi chú)
app.post('/api/admin/licenses/update', requireAdmin, (req: Request, res: Response) => {
  const { id, clientName, phone, expiresAt, maxDevices, notes, planType } = req.body;
  const licenses = loadLicenses();
  const found = licenses.find((l) => l.id === id);

  if (!found) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy mã bản quyền!' });
  }

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

  saveLicenses(licenses);

  if (expiresAt && expiresAt !== prevExp) {
    addHistoryEntry({
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

  res.json({ success: true, message: `✓ Đã cập nhật thông tin cho khách "${found.clientName}"!`, license: found });
});

// Bật / Tắt tạm khóa mã
app.post('/api/admin/licenses/toggle', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.body;
  const licenses = loadLicenses();
  const found = licenses.find((l) => l.id === id);

  if (!found) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy mã bản quyền!' });
  }

  found.isSuspended = !found.isSuspended;
  saveLicenses(licenses);

  res.json({
    success: true,
    message: found.isSuspended ? 'Đã tạm khóa mã này!' : 'Đã mở khóa mã hoạt động bình thường!',
    isSuspended: found.isSuspended,
  });
});

// Thu hồi bản quyền vĩnh viễn (Revoke) - Ngắt ngay toàn bộ máy khách
app.post('/api/admin/licenses/revoke', requireAdmin, (req: Request, res: Response) => {
  const { id, reason } = req.body;
  const licenses = loadLicenses();
  const found = licenses.find((l) => l.id === id);

  if (!found) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy mã bản quyền!' });
  }

  found.isRevoked = true;
  found.isSuspended = true;
  found.revokedAt = new Date().toISOString();
  found.revokeReason = reason || 'Vi phạm điều khoản sử dụng hoặc Quản trị viên ngắt máy';
  const disconnectedDevices = (found.devices || []).map((d) => d.deviceId);
  found.devices = []; // Ngắt ngay toàn bộ thiết bị đang kết nối
  saveLicenses(licenses);

  // Ghi nhận key và toàn bộ deviceId bị thu hồi để ngắt kết nối lập tức
  addRevokedKey(found.key, found.revokeReason);
  for (const dId of disconnectedDevices) {
    if (dId) {
      addRevokedKey(dId, found.revokeReason);
      addRevokedKey(`DEV:${dId}`, found.revokeReason);
    }
  }

  addHistoryEntry({
    action: 'revoke',
    actionName: 'Thu hồi quyền',
    clientName: found.clientName,
    phone: found.phone || '',
    deviceId: disconnectedDevices.join(', '),
    key: found.key,
    planType: found.planType,
    notes: reason || 'Thu hồi giấy phép & ngắt thiết bị',
  });

  res.json({
    success: true,
    message: `🚫 Đã thu hồi bản quyền của "${found.clientName}" và ngắt kết nối toàn bộ máy tính (${disconnectedDevices.length} máy)!`,
    license: found,
    licenses: loadLicenses(),
    history: loadHistory(),
  });
});

// Khôi phục mã đã bị thu hồi (Unrevoke)
app.post('/api/admin/licenses/unrevoke', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.body;
  const licenses = loadLicenses();
  const found = licenses.find((l) => l.id === id);

  if (!found) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy mã bản quyền!' });
  }

  found.isRevoked = false;
  found.isSuspended = false;
  delete found.revokedAt;
  delete found.revokeReason;
  saveLicenses(licenses);
  removeRevokedKey(found.key);

  addHistoryEntry({
    action: 'unrevoke',
    actionName: 'Khôi phục quyền',
    clientName: found.clientName,
    phone: found.phone || '',
    deviceId: '',
    key: found.key,
    planType: found.planType,
    notes: 'Khôi phục bản quyền hoạt động bình thường',
  });

  res.json({
    success: true,
    message: `✓ Đã khôi phục trạng thái hoạt động bình thường cho khách "${found.clientName}"!`,
    license: found,
    licenses: loadLicenses(),
    history: loadHistory(),
  });
});

// Cấp đổi sang một mã Key hoàn toàn mới (Đổi key mới nhưng giữ nguyên số ngày sử dụng còn lại)
app.post('/api/admin/licenses/regenerate-key', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.body;
  const licenses = loadLicenses();
  const found = licenses.find((l) => l.id === id);

  if (!found) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy mã bản quyền!' });
  }

  const randomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
  let prefix = 'GLFB-VIP';
  if (found.planType === 'team') prefix = 'GLFB-TEAM';
  else if (found.planType === 'trial') prefix = 'GLFB-TRIAL';

  const oldKey = found.key;
  const newKey = `${prefix}-${randomCode}`;

  addRevokedKey(oldKey, `Đã cấp đổi sang mã mới ${newKey}`);
  found.key = newKey;
  found.devices = []; // Reset để khách kích hoạt trên máy với mã mới
  saveLicenses(licenses);

  addHistoryEntry({
    action: 'regenerate',
    actionName: 'Đổi mã mới',
    clientName: found.clientName,
    phone: found.phone || '',
    deviceId: '',
    key: newKey,
    planType: found.planType,
    notes: `Đổi mã từ ${oldKey} sang ${newKey}`,
  });

  res.json({
    success: true,
    oldKey,
    newKey,
    message: `✓ Đã cấp đổi sang mã mới: ${newKey} (Mã cũ ${oldKey} đã bị hủy bỏ)!`,
    license: found,
  });
});

// Reset danh sách thiết bị (khi nhân viên công ty đổi máy tính mới)
app.post('/api/admin/licenses/reset-devices', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.body;
  const licenses = loadLicenses();
  const found = licenses.find((l) => l.id === id);

  if (!found) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy mã bản quyền!' });
  }

  const count = found.devices.length;
  found.devices = [];
  saveLicenses(licenses);

  res.json({
    success: true,
    message: `✓ Đã xóa ${count} thiết bị liên kết cũ. Giờ khách có thể kích hoạt trên máy mới!`,
  });
});

// Xóa mã bản quyền - Ngắt quyền ngay lập tức cho Extension
app.post('/api/admin/licenses/delete', requireAdmin, (req: Request, res: Response) => {
  const targetId = req.body?.id || req.body?.licenseId || req.body?.key;
  if (!targetId) {
    return res.status(400).json({ success: false, error: 'Thiếu định danh mã cần xóa!' });
  }
  let licenses = loadLicenses();
  const before = licenses.length;
  const toDelete = licenses.find((l) => l.id === targetId || l.key === targetId);

  if (toDelete) {
    const devId = toDelete.devices?.[0]?.deviceId?.toLowerCase();
    const phone = toDelete.phone?.replace(/\D/g, '');

    addRevokedKey(toDelete.key, 'Quản trị viên đã xóa người dùng khỏi danh sách');
    if (toDelete.aliasKeys && Array.isArray(toDelete.aliasKeys)) {
      toDelete.aliasKeys.forEach((ak) => addRevokedKey(ak, 'Quản trị viên đã xóa người dùng khỏi danh sách'));
    }
    if (devId) addRevokedKey(`DEV:${devId}`, 'Quản trị viên đã xóa thiết bị này khỏi danh sách');
    if (phone) addRevokedKey(`PHONE:${phone}`, 'Quản trị viên đã xóa SĐT này khỏi danh sách');
    addHistoryEntry({
      action: 'revoke',
      actionName: 'Xóa người dùng',
      clientName: toDelete.clientName,
      phone: toDelete.phone || '',
      deviceId: toDelete.devices?.[0]?.deviceId || '',
      key: toDelete.key,
      planType: toDelete.planType,
      notes: `Quản trị viên xóa người dùng "${toDelete.clientName}" khỏi danh sách`,
    });

    // Xóa hoặc hủy bỏ toàn bộ các đơn hàng của người dùng này để KHÔNG bị tự động tạo lại
    let orders = loadOrders();
    const aliasSet = new Set<string>([toDelete.key, ...(toDelete.aliasKeys || [])]);

    orders = orders.filter((o) => {
      const matchKey = o.generatedKey && aliasSet.has(o.generatedKey);
      const matchDev = devId && o.deviceId && o.deviceId.toLowerCase() === devId;
      const matchPhone = phone && o.phone && o.phone.replace(/\D/g, '') === phone;
      return !(matchKey || matchDev || matchPhone);
    });
    saveOrders(orders);
  }

  licenses = licenses.filter((l) => l.id !== targetId && l.key !== targetId);
  saveLicenses(licenses);
  res.json({
    success: true,
    message: '✓ Đã xóa người dùng khỏi danh sách và khóa quyền vĩnh viễn trên toàn bộ thiết bị!',
    count: before - licenses.length,
    licenses,
    orders: loadOrders(),
  });
});

// ============================================================================
// HỆ THỐNG GHI NHẬN ĐƠN ĐẶT MUA GÓI BẢN QUYỀN TỰ ĐỘNG (ORDER MANAGEMENT)
// ============================================================================
export interface OrderItem {
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

const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

async function syncGlobalStoreServer() {
  // Đã gỡ bỏ restful-api.dev để tránh lỗi giới hạn trần và timeout
}

async function pullGlobalStoreServer() {
  // Đã gỡ bỏ restful-api.dev để tránh lỗi giới hạn trần và timeout
}

function loadOrders(): OrderItem[] {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return [];
}

function saveOrders(items: OrderItem[]) {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(items, null, 2), 'utf-8');
    syncGlobalStoreServer().catch(() => {});
  } catch (e) {
    console.error('[Orders DB] Lỗi lưu file orders:', e);
  }
}

// Xác định số ngày thời hạn theo tên gói & mức giá (kèm ngày tặng theo chính sách mới)
export function getOrderDurationDays(pkgName?: string, price?: string): number {
  const p = (pkgName || '').toLowerCase();
  const pr = (price || '').toLowerCase();
  if (p.includes('dùng thử') || p.includes('trial') || pr === '0đ' || p.includes('1 ngày')) return 1;
  if (p.includes('3 tháng') || p.includes('90 ngày') || p.includes('100 ngày') || p.includes('105 ngày')) return 100;
  if (p.includes('6 tháng') || p.includes('180 ngày') || p.includes('195 ngày') || p.includes('210 ngày')) return 195;
  if (p.includes('1 năm') || p.includes('12 tháng') || p.includes('360 ngày') || p.includes('365 ngày') || p.includes('390 ngày') || p.includes('420 ngày')) return 390;
  if (p.includes('1 tháng') || p.includes('30 ngày')) return 30;
  return 30;
}

// TỰ ĐỘNG CỘNG DỒN VÀ HỢP NHẤT TOÀN BỘ CÁC GÓI ĐÃ MUA CHO CÙNG 1 MÁY / KHÁCH HÀNG
export function autoConsolidateLicensesAndOrders(): { licenses: LicenseItem[]; orders: OrderItem[] } {
  let orders = loadOrders();
  let licenses = loadLicenses();
  let licensesModified = false;
  let ordersModified = false;

  const approvedOrders = orders.filter((o) => o.status === 'approved');

  // Nhóm theo deviceId hoặc theo phone
  const grouped = new Map<string, OrderItem[]>();
  for (const ord of approvedOrders) {
    const devId = (ord.deviceId || '').trim().toLowerCase();
    const phone = (ord.phone || '').trim().replace(/\D/g, '');
    let groupKey = '';
    if (devId && devId !== 'chưa gắn' && devId !== 'chuagan') {
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

    // Tính tổng số ngày được hưởng từ tất cả các gói đã mua
    let totalDays = 0;
    let earliestOrderMs = Date.now();
    for (const o of ords) {
      const d = getOrderDurationDays(o.pkgName, o.price);
      totalDays += d;
      const t = new Date(o.createdAt).getTime();
      if (!isNaN(t) && t < earliestOrderMs) {
        earliestOrderMs = t;
      }
    }

    // Bỏ qua nếu đơn hàng thuộc mã/thiết bị/SĐT đã bị thu hồi hoặc xóa
    const revokedKeys = loadRevokedKeys().map((r) => r.key.toUpperCase());
    const isOrderRevoked = ords.some((o) => {
      const gk = (o.generatedKey || '').trim().toUpperCase();
      const dev = (o.deviceId || '').trim().toLowerCase();
      const ph = (o.phone || '').trim().replace(/\D/g, '');
      if (gk && revokedKeys.includes(gk)) return true;
      if (dev && revokedKeys.includes(`DEV:${dev}`)) return true;
      if (ph && revokedKeys.includes(`PHONE:${ph}`)) return true;
      return false;
    });
    if (isOrderRevoked) continue;

    // Tìm tất cả các license liên quan
    const matchedLics = licenses.filter((l) => {
      if (l.isRevoked || revokedKeys.includes(l.key.toUpperCase())) return false;
      if (devId && l.devices?.some((d) => d.deviceId.toLowerCase() === devId)) return true;
      if (phone && l.phone && l.phone.replace(/\D/g, '') === phone) return true;
      if (ords.some((o) => o.generatedKey && l.key.toUpperCase() === o.generatedKey.toUpperCase())) return true;
      return false;
    });

    let primaryLic: LicenseItem;
    if (matchedLics.length > 0) {
      primaryLic = matchedLics[0];
    } else {
      const randomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
      const newKey = `GLFB-VIP-${randomCode}`;
      primaryLic = {
        id: `lic_${Date.now()}_${randomCode}`,
        key: newKey,
        clientName: ords[0].clientName || 'Khách Đặt Mua Gói',
        phone: ords[0].phone || '',
        planType: 'individual',
        maxDevices: 1,
        devices: devId && devId !== 'chưa gắn' && devId !== 'chuagan' ? [{
          deviceId: ords[0].deviceId || devId,
          deviceName: ords[0].clientName || 'Thiết bị đặt mua',
          activatedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        }] : [],
        createdAt: new Date(earliestOrderMs).toISOString(),
        expiresAt: new Date().toISOString(),
        isSuspended: false,
        aliasKeys: [],
      };
      licenses.unshift(primaryLic);
      licensesModified = true;
    }

    const aliasSet = new Set<string>(primaryLic.aliasKeys || []);

    // Gom các license phụ vào primaryLic và xóa license trùng lặp
    if (matchedLics.length > 1) {
      for (const lic of matchedLics) {
        if (lic.id !== primaryLic.id) {
          aliasSet.add(lic.key);
          if (lic.aliasKeys) lic.aliasKeys.forEach((k) => aliasSet.add(k));
          if (lic.devices) {
            for (const d of lic.devices) {
              if (!primaryLic.devices.some((pd) => pd.deviceId.toLowerCase() === d.deviceId.toLowerCase())) {
                primaryLic.devices.push(d);
              }
            }
          }
        }
      }
      licenses = licenses.filter((l) => !matchedLics.some((ml) => ml.id === l.id && l.id !== primaryLic.id));
      licensesModified = true;
    }

    for (const o of ords) {
      if (o.generatedKey && o.generatedKey !== primaryLic.key) {
        aliasSet.add(o.generatedKey);
      }
    }

    // Đảm bảo thiết bị đã được gắn vào primaryLic
    if (devId && devId !== 'chưa gắn' && devId !== 'chuagan') {
      const hasDev = primaryLic.devices.some((d) => d.deviceId.toLowerCase() === devId);
      if (!hasDev) {
        primaryLic.devices.push({
          deviceId: ords[0].deviceId || devId,
          deviceName: ords[0].clientName || primaryLic.clientName || 'Thiết bị đặt mua',
          activatedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        });
        licensesModified = true;
      }
    }

    // Tính ngày hết hạn chuẩn xác cộng dồn từ ngày đặt đơn đầu tiên
    const licCreatedMs = new Date(primaryLic.createdAt).getTime();
    const baseMs = !isNaN(licCreatedMs) && licCreatedMs < earliestOrderMs ? licCreatedMs : earliestOrderMs;
    const finalExpMs = baseMs + totalDays * 24 * 60 * 60 * 1000;
    const finalExpIso = new Date(finalExpMs).toISOString();

    const pkgListStr = ords.map((o) => `${o.pkgName} (+${getOrderDurationDays(o.pkgName, o.price)}n)`).join(' + ');
    const newNotes = `Bản quyền VIP cộng dồn ${ords.length} gói: ${pkgListStr} = Tổng ${totalDays} ngày (Hạn dùng đến ${new Date(finalExpIso).toLocaleDateString('vi-VN')})`;

    if (primaryLic.expiresAt !== finalExpIso || primaryLic.notes !== newNotes) {
      primaryLic.expiresAt = finalExpIso;
      primaryLic.isSuspended = false;
      primaryLic.aliasKeys = Array.from(aliasSet);
      if (primaryLic.planType === 'trial' && ords.some((o) => getOrderDurationDays(o.pkgName, o.price) > 1)) {
        primaryLic.planType = 'individual';
      }
      primaryLic.notes = newNotes;
      licensesModified = true;
    }

    // Đồng bộ toàn bộ các đơn hàng đã duyệt dùng chung primaryLic.key
    for (const o of ords) {
      if (o.generatedKey !== primaryLic.key) {
        o.generatedKey = primaryLic.key;
        ordersModified = true;
      }
    }
  }

  if (licensesModified) {
    saveLicenses(licenses);
  }
  if (ordersModified) {
    saveOrders(orders);
  }

  return { licenses, orders };
}

// Khách hàng bấm gửi đơn mua (Tự động ghi nhận lên server)
app.post('/api/orders/create', (req: Request, res: Response) => {
  try {
    const { pkgName, price, clientName, phone, deviceId, note } = req.body || {};
    const orders = loadOrders();
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

    orders.unshift(newOrder);
    saveOrders(orders);

    try {
      addHistoryEntry({
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
          ? `Khách gửi đơn dùng thử 1 ngày (20 bài đăng, 0đ)${newOrder.note ? ` - ${newOrder.note}` : ''}`
          : `Khách gửi đơn mua: ${newOrder.pkgName} (${newOrder.price})${newOrder.note ? ` - Ghi chú: ${newOrder.note}` : ''}`,
      });
    } catch (e) {}

    console.log(`[Order API] Nhận đơn mới: ${newOrder.pkgName} từ khách ${newOrder.clientName} (SĐT: ${newOrder.phone})`);

    res.json({
      success: true,
      message: isTrial
        ? `✓ Đã ghi nhận yêu cầu dùng thử 1 ngày (20 bài đăng) lên hệ thống Quản Trị Viên thành công!`
        : `✓ Đã ghi nhận đơn đặt mua "${newOrder.pkgName}" lên hệ thống Quản Trị Viên thành công!`,
      order: newOrder,
    });
  } catch (err: any) {
    console.error('[Order API] Lỗi tạo đơn:', err);
    res.status(500).json({ success: false, error: err.message || 'Lỗi xử lý tạo đơn hàng' });
  }
});

// Đồng bộ danh sách đơn hàng cũ của máy khách lên trang admin khi khởi động hoặc cập nhật phiên bản
app.post('/api/orders/sync', (req: Request, res: Response) => {
  try {
    const { orders: clientOrders } = req.body || {};
    if (!Array.isArray(clientOrders)) {
      return res.status(400).json({ success: false, error: 'Danh sách đơn hàng không hợp lệ!' });
    }
    const serverOrders = loadOrders();
    let addedCount = 0;

    for (const co of clientOrders) {
      if (!co || !co.id) continue;
      const exists = serverOrders.find((so) => so.id === co.id || (so.phone && co.phone && so.phone === so.phone && so.pkgName === co.pkgName));
      if (!exists) {
        serverOrders.unshift({
          id: co.id,
          pkgName: co.pkgName || 'Gói 1 Tháng (30 ngày)',
          price: co.price || '1.000.000đ',
          clientName: co.clientName || 'Khách Đồng Bộ',
          phone: co.phone || '',
          deviceId: co.deviceId || '',
          createdAt: co.createdAt || new Date().toISOString(),
          status: co.status || 'pending',
          note: co.note || 'Đồng bộ tự động từ phiên bản extension',
        });
        addedCount++;
      }
    }

    if (addedCount > 0) {
      saveOrders(serverOrders);
    }
    res.json({ success: true, message: `✓ Đã đồng bộ ${addedCount} đơn hàng cũ vào trang quản trị!`, totalOrders: serverOrders.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Lỗi đồng bộ đơn hàng' });
  }
});

// Lấy số lượng đơn hàng chờ duyệt (Hoạt động ngay từ khi tải trang, phục vụ Quả Chuông thông báo)
app.get('/api/orders/pending-count', async (_req: Request, res: Response) => {
  try {
    await pullGlobalStoreServer();
    const orders = loadOrders();
    const pendingOrders = orders.filter((o) => o.status === 'pending');
    res.json({
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
  } catch (err: any) {
    res.json({ success: false, pendingCount: 0 });
  }
});

// Tra cứu danh sách đơn hàng của khách (phục vụ Bảng lịch sử mua gói & đồng bộ hai chiều Extension)
app.get('/api/orders/my-orders', (req: Request, res: Response) => {
  try {
    const deviceId = String(req.query.deviceId || '').trim();
    const phone = String(req.query.phone || '').trim().replace(/\D/g, '');
    const orderIds = String(req.query.orderIds || '').split(',').map((s) => s.trim()).filter(Boolean);

    // Tự động cộng dồn và hợp nhất toàn bộ dữ liệu trước khi trả về
    const { licenses, orders } = autoConsolidateLicensesAndOrders();

    let matched = orders.filter((o) => {
      if (deviceId && o.deviceId && o.deviceId.toLowerCase() === deviceId.toLowerCase()) return true;
      if (phone && o.phone && o.phone.replace(/\D/g, '') === phone) return true;
      if (orderIds.length > 0 && orderIds.includes(o.id)) return true;
      return false;
    });

    // Nếu không khớp đơn nào theo deviceId / phone, trả về tối đa 5 đơn gần nhất đã tạo từ máy này hoặc đơn mới
    if (matched.length === 0 && (deviceId || orderIds.length > 0)) {
      matched = orders.slice(0, 5);
    }

    // Tìm license đại diện gắn với deviceId hoặc phone
    let activeLic = licenses.find(
      (l) => !l.isRevoked && !l.isSuspended && (
        (deviceId && l.devices?.some((d) => d.deviceId.toLowerCase() === deviceId.toLowerCase())) ||
        (phone && l.phone && l.phone.replace(/\D/g, '') === phone)
      )
    );

    if (activeLic) {
      matched = matched.map((o) => ({
        ...o,
        generatedKey: activeLic!.key,
      }));
    }

    const approvedCount = matched.filter((o) => o.status === 'approved').length;
    let totalPurchasedDays = 0;
    matched.filter((o) => o.status === 'approved').forEach((o) => {
      totalPurchasedDays += getOrderDurationDays(o.pkgName, o.price);
    });

    const pendingCount = orders.filter((o) => o.status === 'pending').length;

    res.json({
      success: true,
      orders: matched,
      totalPending: pendingCount,
      activeLicense: activeLic || null,
      isCumulative: approvedCount > 1,
      totalApprovedCount: approvedCount,
      totalPurchasedDays,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Lỗi tra cứu đơn hàng' });
  }
});

// Admin xem danh sách đơn hàng
app.get('/api/admin/orders', requireAdmin, async (_req: Request, res: Response) => {
  await pullGlobalStoreServer();
  const { orders } = autoConsolidateLicensesAndOrders();
  res.json({ success: true, orders });
});

// Admin cập nhật thông tin đơn hàng (Tên, SĐT, Gói, Giá, Ghi chú, v.v...)
app.post('/api/admin/orders/update', requireAdmin, (req: Request, res: Response) => {
  const { orderId, clientName, phone, pkgName, price, note, status, deviceId } = req.body;
  if (!orderId) {
    return res.status(400).json({ success: false, error: 'Thiếu mã đơn hàng!' });
  }

  const orders = loadOrders();
  const order = orders.find((o) => o.id === orderId);
  if (!order) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy đơn hàng cần cập nhật!' });
  }

  if (clientName !== undefined) order.clientName = String(clientName).trim();
  if (phone !== undefined) order.phone = String(phone).trim();
  if (pkgName !== undefined) order.pkgName = String(pkgName).trim();
  if (price !== undefined) order.price = String(price).trim();
  if (note !== undefined) order.note = String(note).trim();
  if (deviceId !== undefined) order.deviceId = String(deviceId).trim();
  if (status !== undefined) order.status = status;

  saveOrders(orders);

  const orderShortId = order.id.slice(-8).toUpperCase();

  // 1. Đồng bộ cập nhật thông tin trong các bản ghi lịch sử trước đó của đơn này (nếu có)
  const historyList = loadHistory();
  let historyUpdated = false;
  historyList.forEach((h) => {
    if (h.key === orderShortId || (h.notes && h.notes.includes(orderShortId))) {
      if (order.clientName) h.clientName = order.clientName;
      if (order.phone) h.phone = order.phone;
      if (order.deviceId) h.deviceId = order.deviceId;
      if (order.pkgName) h.pkgName = normalizePkgSymbol(order.pkgName);
      if (order.price) h.amount = order.price;
      historyUpdated = true;
    }
  });
  if (historyUpdated) {
    saveHistory(historyList);
  }

  // 2. Ghi nhận thêm 1 bản ghi lịch sử cho hành động cập nhật đơn đặt mua
  addHistoryEntry({
    action: 'update_date',
    actionName: 'Cập nhật đơn mua',
    clientName: order.clientName || 'Khách đặt mua',
    phone: order.phone || '',
    deviceId: order.deviceId || '',
    key: orderShortId,
    planType: 'individual',
    pkgName: normalizePkgSymbol(order.pkgName),
    amount: order.price,
    notes: `Cập nhật thông tin đơn ${orderShortId}: ${order.clientName} - ${order.pkgName} (${order.price})${order.note ? ` - ${order.note}` : ''}`,
  });

  res.json({
    success: true,
    message: '✓ Đã cập nhật đơn đặt mua và đồng bộ lịch sử thành công!',
    order,
    orders: loadOrders(),
    history: loadHistory(),
  });
});

// Admin duyệt đơn & tự động cấp mã Key cho khách (1-Click)
app.post('/api/admin/orders/approve', requireAdmin, (req: Request, res: Response) => {
  const { orderId } = req.body;
  const orders = loadOrders();
  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    return res.status(404).json({ success: false, error: 'Không tìm thấy đơn hàng!' });
  }

  const days = getOrderDurationDays(order.pkgName, order.price);
  const isTrial = days === 1;

  // 1. Đánh dấu đơn là đã phê duyệt
  order.status = 'approved';
  saveOrders(orders);

  // 2. Tự động hợp nhất và cộng dồn tất cả các gói cho máy này
  const { licenses: updatedLicenses, orders: updatedOrders } = autoConsolidateLicensesAndOrders();

  const cleanDeviceId = (order.deviceId || '').trim().toLowerCase();
  const cleanPhone = (order.phone || '').trim().replace(/\D/g, '');

  let returnedLicense = updatedLicenses.find((l) => {
    if (l.isRevoked) return false;
    if (cleanDeviceId && cleanDeviceId !== 'chưa gắn' && cleanDeviceId !== 'chuagan' && l.devices?.some((d) => d.deviceId.toLowerCase() === cleanDeviceId)) return true;
    if (cleanPhone && l.phone && l.phone.replace(/\D/g, '') === cleanPhone) return true;
    if (order.generatedKey && (l.key.toUpperCase() === order.generatedKey.toUpperCase() || l.aliasKeys?.includes(order.generatedKey.toUpperCase()))) return true;
    return false;
  }) || updatedLicenses[0];

  const assignedKey = returnedLicense.key;
  order.generatedKey = assignedKey;
  saveOrders(updatedOrders);

  const finalExpiresAt = returnedLicense.expiresAt;
  const expFormatted = new Date(finalExpiresAt).toLocaleDateString('vi-VN');

  addHistoryEntry({
    action: 'approve',
    actionName: isTrial ? 'Duyệt cấp dùng thử 1N' : `Duyệt cộng dồn (+${days}N)`,
    clientName: order.clientName || 'Khách đặt mua',
    phone: order.phone || '',
    deviceId: order.deviceId || '',
    key: assignedKey,
    planType: returnedLicense.planType,
    pkgName: isTrial ? 'TRIAL' : normalizePkgSymbol(order.pkgName || days),
    daysAdded: days,
    newExpiresAt: finalExpiresAt,
    amount: order.price,
    notes: `Duyệt đơn ${order.pkgName} (+${days} ngày). Hạn mới: ${expFormatted} (Mã: ${assignedKey})`,
  });

  res.json({
    success: true,
    message: `✓ Đã phê duyệt và CỘNG DỒN THÀNH CÔNG ${days} ngày cho máy! Hạn mới: ${expFormatted} (Mã: ${assignedKey})`,
    order,
    license: returnedLicense,
    orders: loadOrders(),
    licenses: loadLicenses(),
    history: loadHistory(),
  });
});

// Admin xem lịch sử cấp mã, gia hạn, duyệt đơn
app.get('/api/admin/history', requireAdmin, (_req: Request, res: Response) => {
  const history = loadHistory();
  res.json({ success: true, history });
});

// Admin xóa lịch sử
app.post('/api/admin/history/clear', requireAdmin, (_req: Request, res: Response) => {
  saveHistory([]);
  res.json({ success: true, message: 'Đã xóa toàn bộ lịch sử theo dõi!' });
});

// Admin xóa hoặc hủy đơn
app.post('/api/admin/orders/delete', requireAdmin, (req: Request, res: Response) => {
  const targetId = req.body?.orderId || req.body?.id;
  if (!targetId) {
    return res.status(400).json({ success: false, error: 'Thiếu mã đơn hàng cần xóa!' });
  }
  let orders = loadOrders();
  const target = orders.find((o) => o.id === targetId);
  const before = orders.length;
  orders = orders.filter((o) => o.id !== targetId);
  saveOrders(orders);

  if (target) {
    addHistoryEntry({
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

  res.json({
    success: true,
    message: 'Đã xóa đơn đặt mua thành công!',
    count: before - orders.length,
    orders: loadOrders(),
    history: loadHistory(),
  });
});

// Cài đặt hệ thống (Lưu link Chrome Web Store Unlisted & Zalo)
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch (e) {}
  return {
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
}

function saveSettings(data: any) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {}
}

app.get('/api/settings', (_req: Request, res: Response) => {
  res.json({ success: true, settings: loadSettings() });
});

app.post('/api/admin/settings', requireAdmin, async (req: Request, res: Response) => {
  const current = loadSettings();
  const updated = { ...current, ...req.body };
  saveSettings(updated);

  // Nếu có cập nhật zaloUrl thì tự động sinh lại card QR Zalo chuẩn xác và đóng gói lại extension
  if (req.body.zaloUrl && req.body.zaloUrl.trim() !== current.zaloUrl) {
    try {
      const { generateExactZaloCard } = await import('./scripts/generate_exact_zalo_card.ts');
      await generateExactZaloCard(req.body.zaloUrl.trim());

      const { generateObfuscatedExtensionZip } = await import('./scripts/build_webstore_zip.ts');
      if (!fs.existsSync(DIST_EXT_DIR)) fs.mkdirSync(DIST_EXT_DIR, { recursive: true });
      const { buffer, fileName } = await generateObfuscatedExtensionZip();
      fs.writeFileSync(path.join(DIST_EXT_DIR, fileName), buffer);
      fs.writeFileSync(path.join(DIST_EXT_DIR, 'Gia_Long_FB_WebStore_latest.zip'), buffer);
      const pubDir = path.join(__dirname, 'public');
      if (fs.existsSync(pubDir)) {
        fs.writeFileSync(path.join(pubDir, fileName), buffer);
        fs.writeFileSync(path.join(pubDir, 'Gia_Long_FB_WebStore_latest.zip'), buffer);
      }
    } catch (e: any) {
      console.warn('Lỗi sinh lại QR hoặc đóng gói:', e?.message);
    }
  }

  res.json({ success: true, settings: updated, message: 'Đã lưu cài đặt thành công!' });
});

// API Tải Lên Ảnh Mã QR Zalo Chuẩn 100% từ thiết bị của Quản trị viên
app.post('/api/admin/upload-qr-image', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ success: false, error: 'Thiếu dữ liệu ảnh base64!' });
    }

    const matches = imageBase64.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
    const base64Data = matches ? matches[2] : imageBase64;
    const buffer = Buffer.from(base64Data, 'base64');

    // 1. Lưu file PNG gốc vào public và extension_files
    const pubPng = path.join(__dirname, 'public', 'zalo_card.png');
    const extPng = path.join(__dirname, 'src', 'extension_files', 'zalo_card.png');
    const distPng = path.join(__dirname, 'dist', 'zalo_card.png');

    fs.writeFileSync(pubPng, buffer);
    fs.writeFileSync(extPng, buffer);
    try { fs.writeFileSync(distPng, buffer); } catch(e) {}

    // 2. Tạo file SVG nhúng trực tiếp dữ liệu ảnh gốc để không bao giờ bị lệch 1 pixel nào
    const embeddedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 640" width="100%" height="100%">
  <image href="${imageBase64.startsWith('data:') ? imageBase64 : 'data:image/png;base64,' + imageBase64}" width="540" height="640" preserveAspectRatio="xMidYMid meet" />
</svg>`;

    fs.writeFileSync(path.join(__dirname, 'public', 'zalo_card.svg'), embeddedSvg);
    fs.writeFileSync(path.join(__dirname, 'src', 'extension_files', 'zalo_card.svg'), embeddedSvg);
    try { fs.writeFileSync(path.join(__dirname, 'dist', 'zalo_card.svg'), embeddedSvg); } catch(e) {}

    // 3. Lưu vào settings
    const settings = loadSettings();
    settings.hasCustomQr = true;
    settings.qrUpdatedAt = Date.now();
    saveSettings(settings);

    // 4. Tự động đóng gói lại extension zip
    try {
      const { generateObfuscatedExtensionZip } = await import('./scripts/build_webstore_zip.ts');
      if (!fs.existsSync(DIST_EXT_DIR)) fs.mkdirSync(DIST_EXT_DIR, { recursive: true });
      const { buffer, fileName } = await generateObfuscatedExtensionZip();
      fs.writeFileSync(path.join(DIST_EXT_DIR, fileName), buffer);
      fs.writeFileSync(path.join(DIST_EXT_DIR, 'Gia_Long_FB_WebStore_latest.zip'), buffer);
      const pubDir = path.join(__dirname, 'public');
      if (fs.existsSync(pubDir)) {
        fs.writeFileSync(path.join(pubDir, fileName), buffer);
        fs.writeFileSync(path.join(pubDir, 'Gia_Long_FB_WebStore_latest.zip'), buffer);
      }
    } catch(e) {}

    res.json({ success: true, message: '✓ Đã cập nhật ảnh mã QR Zalo gốc chuẩn 100% và đóng gói lại tiện ích!' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// TRANG CHÍNH SÁCH QUYỀN RIÊNG TƯ (CHROME WEB STORE PRIVACY POLICY)
// ============================================================================
app.get('/privacy', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chính Sách Quyền Riêng Tư - Gia Long - FB Extension</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background: #f8fafc; padding: 24px; max-width: 800px; margin: 0 auto; }
    .card { background: white; border-radius: 16px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    h1 { color: #0f172a; font-size: 24px; margin-bottom: 8px; }
    h2 { color: #1e293b; font-size: 18px; margin-top: 24px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
    p, li { font-size: 14px; color: #334155; }
    ul { padding-left: 20px; }
    .badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: bold; margin-bottom: 16px; }
    .footer { margin-top: 32px; font-size: 12px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Chrome Web Store Compliance</span>
    <h1>Chính Sách Quyền Riêng Tư (Privacy Policy)</h1>
    <p><em>Cập nhật lần cuối: Tháng 10/2026</em></p>
    <p>Tiện ích mở rộng <strong>Gia Long - FB</strong> cam kết tôn trọng và bảo vệ tối đa quyền riêng tư của người dùng theo đúng nguyên tắc của Google Chrome Web Store.</p>

    <h2>1. Mục Đích Hoạt Động (Single Purpose)</h2>
    <p>Gia Long - FB là tiện ích hỗ trợ tự động hóa việc đăng bài viết và thông báo tuyển dụng lên các nhóm Facebook mà người dùng đã tự nguyện tham gia, giúp tiết kiệm thời gian quản trị.</p>

    <h2>2. Thu Thập Dữ Liệu (Data Collection)</h2>
    <p><strong>Tiện ích hoàn toàn KHÔNG thu thập bất kỳ dữ liệu cá nhân nào ra khỏi máy tính của người dùng:</strong></p>
    <ul>
      <li><strong>Không thu thập thông tin đăng nhập:</strong> Tiện ích KHÔNG đọc, KHÔNG lưu và KHÔNG gửi mật khẩu hoặc thông tin đăng nhập Facebook về bất kỳ máy chủ nào. Tiện ích chỉ hoạt động trên phiên đăng nhập hiện tại của người dùng trong trình duyệt.</li>
      <li><strong>Không thu thập dữ liệu cá nhân:</strong> Không thu thập danh bạ, tin nhắn riêng tư, vị trí GPS hay lịch sử duyệt web ngoài trang Facebook.</li>
      <li><strong>Lưu trữ cục bộ:</strong> Danh sách bài viết, hình ảnh đính kèm và nhóm đã lưu được lưu trữ 100% trên bộ nhớ trình duyệt cục bộ (<code>chrome.storage.local</code>) của máy tính bạn.</li>
    </ul>

    <h2>3. Xác Thực Bản Quyền</h2>
    <p>Khi kích hoạt gói bản quyền, tiện ích chỉ gửi mã bản quyền (License Key) và mã định danh phần cứng ngẫu nhiên (Device ID) về máy chủ để xác nhận thời hạn sử dụng gói. Dữ liệu này không liên kết với danh tính cá nhân hay tài khoản Facebook của bạn.</p>

    <h2>4. Chia Sẻ Với Bên Thứ Ba</h2>
    <p>Chúng tôi cam kết <strong>tuyệt đối không bán, không cho thuê, không chia sẻ</strong> bất kỳ dữ liệu người dùng nào cho bất kỳ bên thứ ba hay mạng quảng cáo nào.</p>

    <h2>5. Thông Tin Liên Hệ</h2>
    <p>Nếu bạn có bất kỳ câu hỏi nào liên quan đến chính sách quyền riêng tư này, vui lòng liên hệ:</p>
    <ul>
      <li>Email hỗ trợ: <strong>gialonggiaiphapvanhanh@gmail.com</strong></li>
      <li>Hotline / Zalo: <strong>0869029310</strong> (0869.029.310)</li>
      <li>Đơn vị phát triển: <strong>Gia Long - FB Team</strong></li>
    </ul>
  </div>
  <div class="footer">
    &copy; 2026 Gia Long - FB. Bảo lưu mọi quyền.
  </div>
</body>
</html>`);
});

// ============================================================================
// 3. TẢI FILE ZIP CHUẨN MICROSOFT EDGE & CHROME WEB STORE COMPLIANCE
// ============================================================================

function getCurrentStoreVersion(): string {
  try {
    const manifestPath = path.join(__dirname, 'src', 'extension_files', 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (m.version) return m.version;
    }
  } catch (e) {}
  return '1.0.4';
}

app.get('/api/package/info', (_req: Request, res: Response) => {
  const version = getCurrentStoreVersion();
  const currentZip = path.join(DIST_EXT_DIR, `Gia_Long_FB_WebStore_v${version}.zip`);
  const fallbackZip = path.join(DIST_EXT_DIR, 'Gia_Long_FB_WebStore_latest.zip');
  const targetFile = fs.existsSync(currentZip) ? currentZip : (fs.existsSync(fallbackZip) ? fallbackZip : path.join(DIST_EXT_DIR, 'Gia_Long_FB_WebStore_v1.0.4.zip'));
  
  const exists = fs.existsSync(targetFile);
  let sizeKb = 0;
  let updatedAt = '';
  if (exists) {
    const stat = fs.statSync(targetFile);
    sizeKb = Math.round(stat.size / 1024);
    updatedAt = stat.mtime.toISOString();
  }
  res.json({
    success: true,
    isReady: exists,
    sizeKb,
    updatedAt,
    fileName: `Gia_Long_FB_WebStore_v${version}.zip`,
    version,
  });
});

app.get('/api/package/download-obfuscated-zip', async (_req: Request, res: Response) => {
  try {
    const version = getCurrentStoreVersion();
    const currentZip = path.join(DIST_EXT_DIR, `Gia_Long_FB_WebStore_v${version}.zip`);

    if (!fs.existsSync(currentZip)) {
      // Tự động build nếu chưa có
      const { generateObfuscatedExtensionZip } = await import('./scripts/build_webstore_zip.ts');
      if (!fs.existsSync(DIST_EXT_DIR)) fs.mkdirSync(DIST_EXT_DIR, { recursive: true });
      const { buffer } = await generateObfuscatedExtensionZip();
      fs.writeFileSync(currentZip, buffer);
      fs.writeFileSync(path.join(DIST_EXT_DIR, 'Gia_Long_FB_WebStore_latest.zip'), buffer);
      const pubDir = path.join(__dirname, 'public');
      if (fs.existsSync(pubDir)) {
        fs.writeFileSync(path.join(pubDir, `Gia_Long_FB_WebStore_v${version}.zip`), buffer);
        fs.writeFileSync(path.join(pubDir, 'Gia_Long_FB_WebStore_latest.zip'), buffer);
      }
    }

    const fileBuffer = fs.readFileSync(currentZip);
    const fileName = `Gia_Long_FB_WebStore_v${version}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Length', String(fileBuffer.length));
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(fileBuffer);
  } catch (err: any) {
    console.error('Lỗi tải file zip:', err);
    res.status(500).json({ success: false, error: 'Lỗi tạo gói zip: ' + err.message });
  }
});

// Đường dẫn tải trực tiếp file zip nhanh (Cho phép khách bấm link là tải ngay)
app.get('/download', (_req: Request, res: Response) => {
  res.redirect('/api/package/download-obfuscated-zip');
});

app.get('/tai-zip', (_req: Request, res: Response) => {
  res.redirect('/api/package/download-obfuscated-zip');
});

// Đường dẫn vào thẳng trang Quản Trị
app.get('/admin', (_req: Request, res: Response) => {
  res.redirect('/?admin=1');
});

app.post('/api/admin/package/rebuild', requireAdmin, async (req: Request, res: Response) => {
  try {
    const shouldBump = req.body?.bumpVersion === true || req.query?.bump === 'true';
    const { generateObfuscatedExtensionZip } = await import('./scripts/build_webstore_zip.ts');
    if (!fs.existsSync(DIST_EXT_DIR)) fs.mkdirSync(DIST_EXT_DIR, { recursive: true });
    
    const { buffer, version, fileName } = await generateObfuscatedExtensionZip({ bumpVersion: shouldBump });
    const currentZip = path.join(DIST_EXT_DIR, fileName);
    fs.writeFileSync(currentZip, buffer);
    fs.writeFileSync(path.join(DIST_EXT_DIR, 'Gia_Long_FB_WebStore_latest.zip'), buffer);
    const pubDir = path.join(__dirname, 'public');
    if (fs.existsSync(pubDir)) {
      fs.writeFileSync(path.join(pubDir, fileName), buffer);
      fs.writeFileSync(path.join(pubDir, 'Gia_Long_FB_WebStore_latest.zip'), buffer);
    }

    res.json({
      success: true,
      version,
      fileName,
      sizeKb: Math.round(buffer.length / 1024),
      message: `✓ Đã tự động tăng phiên bản lên v${version} và đóng gói file ${fileName} thành công!`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 3. TÍCH HỢP VITE DEV SERVER & STATIC PROD
// ============================================================================
async function startServer() {
  try {
    autoConsolidateLicensesAndOrders();
    console.log('[AutoRecruit Server] ✓ Đã tự động kiểm tra và hợp nhất cộng dồn toàn bộ gói mua cho máy khách!');
  } catch (e) {
    console.error('[AutoRecruit Server] Lỗi khởi tạo hợp nhất cộng dồn:', e);
  }

  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.join(__dirname, 'dist');
  const indexHtml = path.join(distPath, 'index.html');

  if (isProd && fs.existsSync(indexHtml)) {
    // Production: Serve thư mục dist đã build
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(indexHtml);
    });
  } else {
    // Development (hoặc fallback nếu dist chưa build): Dùng Vite middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AutoRecruit Server] Server đang chạy tại http://0.0.0.0:${PORT}`);
    console.log(`[AutoRecruit Server] License API sẵn sàng tại /api/license/*`);
  });
}

startServer().catch((err) => {
  console.error('[AutoRecruit Server] Lỗi khởi động:', err);
});
