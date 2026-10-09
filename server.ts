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
}

// Khởi tạo dữ liệu mẫu nếu chưa có file
function getInitialLicenses(): LicenseItem[] {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  return [
    {
      id: 'lic_team_hoaphuong',
      key: 'HCNS-HOAPHUONG-3SLOTS',
      clientName: 'Công Ty CP Hoa Phượng ME (Team HCNS)',
      phone: 'gialonggiaiphapvanhanh',
      planType: 'team',
      maxDevices: 3,
      devices: [],
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 30 * dayMs).toISOString(),
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
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 30 * dayMs).toISOString(),
      isSuspended: false,
      notes: '1 máy tính (1.000.000đ/tháng)',
    },
  ];
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

  const licenses = loadLicenses();
  const found = licenses.find((l) => l.key.trim().toUpperCase() === String(key).trim().toUpperCase());

  if (!found) {
    return res.json({
      valid: false,
      message: 'Mã bản quyền không tồn tại trên hệ thống!',
    });
  }

  if (found.isRevoked) {
    return res.json({
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

  const licenses = loadLicenses();
  const now = Date.now();
  // Tìm mã bản quyền còn hạn, không bị khóa, gắn với deviceId này
  const found = licenses.find((l) => {
    if (l.isRevoked || l.isSuspended) return false;
    const expMs = new Date(l.expiresAt).getTime();
    if (expMs < now) return false;
    return l.devices && l.devices.some((d) => d.deviceId === deviceId);
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

  const licenses = loadLicenses();
  const found = licenses.find((l) => l.key.trim().toUpperCase() === String(key).trim().toUpperCase());

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
  const licenses = loadLicenses();
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
  found.revokeReason = reason || 'Vi phạm điều khoản sử dụng hoặc phát hiện hành vi gian lận';
  found.devices = []; // Ngắt ngay toàn bộ thiết bị đang kết nối
  saveLicenses(licenses);

  addHistoryEntry({
    action: 'revoke',
    actionName: 'Thu hồi quyền',
    clientName: found.clientName,
    phone: found.phone || '',
    deviceId: '',
    key: found.key,
    planType: found.planType,
    notes: reason || 'Thu hồi giấy phép & ngắt thiết bị',
  });

  res.json({
    success: true,
    message: `🚫 Đã thu hồi bản quyền của "${found.clientName}" và ngắt kết nối toàn bộ máy tính!`,
    license: found,
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

// Xóa mã bản quyền
app.post('/api/admin/licenses/delete', requireAdmin, (req: Request, res: Response) => {
  const targetId = req.body?.id || req.body?.licenseId || req.body?.key;
  if (!targetId) {
    return res.status(400).json({ success: false, error: 'Thiếu định danh mã cần xóa!' });
  }
  let licenses = loadLicenses();
  const before = licenses.length;
  licenses = licenses.filter((l) => l.id !== targetId && l.key !== targetId);
  saveLicenses(licenses);
  res.json({ success: true, message: 'Đã xóa mã bản quyền thành công!', count: before - licenses.length });
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
  } catch (e) {
    console.error('[Orders DB] Lỗi lưu file orders:', e);
  }
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

// Admin xem danh sách đơn hàng
app.get('/api/admin/orders', requireAdmin, (_req: Request, res: Response) => {
  const orders = loadOrders();
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

  // Xác định số ngày tương ứng với gói (kèm ngày tặng theo chính sách mới: 3T +10n = 100n, 6T +15n = 195n, 12T +30n = 390n, Dùng thử = 1n)
  let days = 30;
  const isTrial = order.pkgName.includes('Dùng Thử') || order.pkgName.includes('Trial') || order.price === '0đ' || order.pkgName.includes('1 ngày');
  if (isTrial) days = 1;
  else if (order.pkgName.includes('3 Tháng') || order.pkgName.includes('90 ngày') || order.pkgName.includes('100 ngày') || order.pkgName.includes('105 ngày')) days = 100;
  else if (order.pkgName.includes('6 Tháng') || order.pkgName.includes('180 ngày') || order.pkgName.includes('195 ngày') || order.pkgName.includes('210 ngày')) days = 195;
  else if (order.pkgName.includes('1 Năm') || order.pkgName.includes('12 Tháng') || order.pkgName.includes('360 ngày') || order.pkgName.includes('365 ngày') || order.pkgName.includes('390 ngày') || order.pkgName.includes('420 ngày')) days = 390;

  // Tự động sinh mã Key mới
  const licenses = loadLicenses();
  const randomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
  const prefix = isTrial ? 'GLFB-TRIAL' : 'GLFB-VIP';
  const newKey = `${prefix}-${randomCode}`;
  const now = Date.now();
  const expiresAt = new Date(now + days * 24 * 60 * 60 * 1000).toISOString();

  const newLicense: LicenseItem = {
    id: `lic_${Date.now()}_${randomCode}`,
    key: newKey,
    clientName: order.clientName || (isTrial ? 'Khách Dùng Thử 1 Ngày' : 'Khách Đặt Mua Gói'),
    phone: order.phone || '',
    planType: isTrial ? 'trial' : 'individual',
    maxDevices: 1,
    devices: order.deviceId
      ? [
          {
            deviceId: order.deviceId,
            deviceName: order.clientName || (isTrial ? 'Thiết bị dùng thử' : 'Thiết bị đặt mua tự động'),
            activatedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          },
        ]
      : [],
    createdAt: new Date().toISOString(),
    expiresAt,
    isSuspended: false,
    notes: isTrial
      ? `Cấp tự động Gói Dùng Thử 1 Ngày (20 bài đăng, 0đ)${order.deviceId ? ` - Máy: ${order.deviceId}` : ''}`
      : `Cấp tự động từ đơn đặt mua: ${order.pkgName} (${order.price})${order.deviceId ? ` - Máy: ${order.deviceId}` : ''}`,
  };

  licenses.unshift(newLicense);
  saveLicenses(licenses);

  // Cập nhật trạng thái đơn hàng
  order.status = 'approved';
  order.generatedKey = newKey;
  saveOrders(orders);

  addHistoryEntry({
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
    notes: isTrial
      ? `Duyệt cấp dùng thử 1 ngày (20 bài đăng) cho đơn ${order.id.slice(-6).toUpperCase()}`
      : `Duyệt đơn ${order.id.slice(-6).toUpperCase()} (${order.pkgName})`,
  });

  res.json({
    success: true,
    message: isTrial
      ? `✓ Đã phê duyệt và cấp mã dùng thử: ${newKey} (1 ngày, 20 bài đăng)!`
      : `✓ Đã phê duyệt đơn và cấp mã mới: ${newKey} (Thời hạn ${days} ngày)!`,
    order,
    license: newLicense,
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
