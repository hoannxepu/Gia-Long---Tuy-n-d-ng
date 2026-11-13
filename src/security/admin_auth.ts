import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

// ============================================================================
// HỆ THỐNG XÁC THỰC QUẢN TRỊ VIÊN BẢO MẬT CAO (ADMIN AUTH & RATE LIMITER)
// ============================================================================

const SCRYPT_SALT = 'GiaLongFB_Admin_Salt_v2_2026';
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 phút
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 phút

interface RateLimitRecord {
  failedCount: number;
  firstFailedAt: number;
  lockedUntil: number;
}

const ipRateLimits = new Map<string, RateLimitRecord>();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown-ip';
}

function hashPin(pin: string): Buffer {
  return crypto.scryptSync(pin, SCRYPT_SALT, 32);
}

export function getAdminPinHash(): Buffer | null {
  const rawPin = process.env.ADMIN_PIN;
  if (!rawPin || typeof rawPin !== 'string' || !rawPin.trim()) {
    return null;
  }
  return hashPin(rawPin.trim());
}

/**
 * Middleware kiểm tra CORS chuyên biệt cho /api/admin/*
 * Chỉ cho phép domain chính thức, tuyệt đối không dùng '*'
 */
export function checkAdminCors(req: Request, res: Response, next: NextFunction) {
  const allowedOrigins = new Set([
    'https://gia-long---tuy-n-d-ng.pages.dev',
    (process.env.APP_URL || '').replace(/\/+$/, ''),
  ].filter(Boolean));

  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Admin-Pin');
    res.header('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    // Cho phép gọi trực tiếp từ same-origin
  } else {
    // Không cho phép Origin lạ truy cập route quản trị
    if (req.method === 'OPTIONS') {
      return res.status(403).end();
    }
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
}

/**
 * Middleware bắt buộc xác thực PIN cho toàn bộ route /api/admin/*
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const expectedHash = getAdminPinHash();
  if (!expectedHash) {
    console.error('[Admin Security] LỖI CẤU HÌNH: Biến môi trường ADMIN_PIN chưa được thiết lập!');
    return res.status(500).json({
      success: false,
      error: 'Máy chủ chưa được cấu hình biến môi trường ADMIN_PIN. Truy cập bị từ chối!',
    });
  }

  const clientIp = getClientIp(req);
  const now = Date.now();
  const record = ipRateLimits.get(clientIp);

  // 1. Kiểm tra khóa IP do thử sai quá nhiều
  if (record && record.lockedUntil > now) {
    const minutesLeft = Math.ceil((record.lockedUntil - now) / 60000);
    return res.status(429).json({
      success: false,
      error: `Quá nhiều lần thử sai. IP của bạn đã bị tạm khóa. Vui lòng thử lại sau ${minutesLeft} phút!`,
    });
  }

  // 2. Chỉ nhận PIN từ Header 'x-admin-pin' (Bỏ hoàn toàn query và body)
  const incomingHeader = req.headers['x-admin-pin'];
  const providedPin = typeof incomingHeader === 'string' ? incomingHeader.trim() : '';

  if (!providedPin) {
    return res.status(401).json({
      success: false,
      error: 'Thiếu header x-admin-pin xác thực quyền quản trị!',
    });
  }

  // 3. So sánh an toàn tránh timing attack bằng crypto.timingSafeEqual
  const incomingHash = hashPin(providedPin);
  const isValid = crypto.timingSafeEqual(incomingHash, expectedHash);

  if (!isValid) {
    // Ghi nhận lần thử sai
    const currentRecord = record || { failedCount: 0, firstFailedAt: now, lockedUntil: 0 };
    if (now - currentRecord.firstFailedAt > ATTEMPT_WINDOW_MS) {
      currentRecord.failedCount = 1;
      currentRecord.firstFailedAt = now;
    } else {
      currentRecord.failedCount += 1;
    }

    if (currentRecord.failedCount >= MAX_FAILED_ATTEMPTS) {
      currentRecord.lockedUntil = now + LOCKOUT_DURATION_MS;
      console.warn(`[Admin Security] CẢNH BÁO: IP ${clientIp} đã bị khóa 15 phút do nhập sai PIN ${MAX_FAILED_ATTEMPTS} lần!`);
    }
    ipRateLimits.set(clientIp, currentRecord);

    const attemptsRemaining = Math.max(0, MAX_FAILED_ATTEMPTS - currentRecord.failedCount);
    return res.status(401).json({
      success: false,
      error: `Khóa Quản Trị không chính xác! Còn ${attemptsRemaining} lần thử trước khi bị khóa.`,
    });
  }

  // Đăng nhập thành công -> Reset bộ đếm thử sai của IP
  if (record) {
    ipRateLimits.delete(clientIp);
  }

  next();
}
