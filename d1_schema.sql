-- Cloudflare D1 Database Schema - Hệ Thống Bản Quyền Gia Long FB
-- Cơ sở dữ liệu SQLite siêu tốc chạy trên Cloudflare Edge (D1)
-- Thay thế KV: Tốc độ tức thì, không giới hạn ghi 1 lần/giây, đồng bộ thời gian thực 100%

CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL,
  pkg_name TEXT NOT NULL,
  client_name TEXT,
  phone TEXT,
  price TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' (chờ duyệt), 'active' (đã duyệt), 'revoked' (thu hồi)
  created_at TEXT NOT NULL,
  expires_at TEXT,
  signed_token TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_licenses_machine_id ON licenses(machine_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
CREATE INDEX IF NOT EXISTS idx_licenses_created_at ON licenses(created_at);
