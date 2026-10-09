import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

// Tạo 2 ảnh chụp màn hình kích thước chuẩn 1280 x 800 px (Bắt buộc cho Microsoft Edge Store)
async function generateStoreScreenshots() {
  console.log('[Store Screenshots] Bắt đầu tạo ảnh chụp màn hình chuẩn 1280x800 cho Edge Add-ons Store...');

  // Screenshot 1: Trung Tâm Tự Động Hóa Đăng Bài & Lên Lịch Tuyển Dụng Facebook
  const svg1 = `
  <svg width="1280" height="800" viewBox="0 0 1280 800" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#090d16" />
        <stop offset="50%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#111827" />
      </linearGradient>
      <linearGradient id="primary" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#059669" />
        <stop offset="100%" stop-color="#10b981" />
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#3b82f6" />
        <stop offset="100%" stop-color="#06b6d4" />
      </linearGradient>
      <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.5"/>
      </filter>
    </defs>

    <!-- Background -->
    <rect width="1280" height="800" fill="url(#bg)" />

    <!-- Top Navigation Header -->
    <rect x="40" y="30" width="1200" height="70" rx="16" fill="#1e293b" fill-opacity="0.7" stroke="#334155" stroke-width="1.5" filter="url(#shadow)" />
    
    <circle cx="80" cy="65" r="22" fill="#10b981" />
    <path d="M78 54 L69 66 L78 66 L76 76 L87 64 L78 64 Z" fill="#ffffff" />
    
    <text x="115" y="62" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" fill="#ffffff">GIA LONG - FB</text>
    <text x="115" y="80" font-family="system-ui, sans-serif" font-size="12" fill="#94a3b8">Bản Quyền Doanh Nghiệp &amp; Tuyển Dụng Tự Động • Edge Add-on</text>

    <rect x="940" y="48" width="130" height="34" rx="8" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1" />
    <text x="960" y="70" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#34d399">● BẢN QUYỀN VIP</text>

    <rect x="1085" y="48" width="135" height="34" rx="8" fill="#3b82f6" />
    <text x="1105" y="70" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#ffffff">⚡ Đang Kích Hoạt</text>

    <!-- Main Content Area: Left Panel (Post Setup) -->
    <rect x="40" y="120" width="760" height="640" rx="18" fill="#0f172a" stroke="#1e293b" stroke-width="1.5" filter="url(#shadow)" />
    
    <text x="70" y="160" font-family="system-ui, sans-serif" font-size="17" font-weight="bold" fill="#ffffff">📝 Quản Lý Bài Viết &amp; Spintax Đảo Nội Dung Chống Khóa</text>
    <text x="70" y="182" font-family="system-ui, sans-serif" font-size="12" fill="#64748b">Tự động xáo trộn tiêu đề, nội dung và chèn chữ ký vô hình bảo vệ tài khoản</text>

    <!-- Post Content Box -->
    <rect x="70" y="205" width="700" height="190" rx="12" fill="#1e293b" stroke="#334155" stroke-width="1" />
    <text x="90" y="235" font-family="monospace" font-size="13" fill="#38bdf8">{THÔNG BÁO TUYỂN DỤNG GẤP|CẦN BỔ SUNG NHÂN SỰ VĂN PHÒNG}! 💼</text>
    <text x="90" y="260" font-family="monospace" font-size="13" fill="#94a3b8">🏢 Vị trí: Nhân viên Hành chính / Chăm sóc khách hàng</text>
    <text x="90" y="285" font-family="monospace" font-size="13" fill="#94a3b8">💰 Thu nhập: 9.000.000đ - 14.000.000đ/tháng (Chế độ BHXH đầy đủ)</text>
    <text x="90" y="310" font-family="monospace" font-size="13" fill="#94a3b8">⏰ Thời gian: Giờ hành chính 08h00 - 17h30 (Thứ 2 đến Thứ 6)</text>
    <text x="90" y="335" font-family="monospace" font-size="13" fill="#34d399">📩 Ứng tuyển: Gửi CV hoặc Inbox trực tiếp trao đổi cụ thể.</text>
    <text x="90" y="365" font-family="monospace" font-size="11" fill="#64748b">#tuyendung #nhanvienvanphong #vieclam #hanhchinh</text>

    <!-- Attached Images Preview -->
    <text x="70" y="425" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="#e2e8f0">🖼️ Đính Kèm Tối Đa 3 Ảnh Tuyển Dụng Sắc Nét (DataTransfer):</text>
    <rect x="70" y="445" width="220" height="120" rx="10" fill="#1e293b" stroke="#10b981" stroke-width="1.5" />
    <text x="90" y="510" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#34d399">✓ Ảnh 1: Banner Tuyển Dụng</text>
    <rect x="310" y="445" width="220" height="120" rx="10" fill="#1e293b" stroke="#334155" stroke-width="1" />
    <text x="330" y="510" font-family="system-ui, sans-serif" font-size="13" fill="#94a3b8">✓ Ảnh 2: Môi Trường Cty</text>
    <rect x="550" y="445" width="220" height="120" rx="10" fill="#1e293b" stroke="#334155" stroke-width="1" />
    <text x="570" y="510" font-family="system-ui, sans-serif" font-size="13" fill="#94a3b8">✓ Ảnh 3: Bảng Quyền Lợi</text>

    <!-- Anti-checkpoint Feature Tags -->
    <rect x="70" y="595" width="220" height="42" rx="8" fill="#10b981" fill-opacity="0.12" stroke="#10b981" stroke-width="1" />
    <text x="85" y="621" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#34d399">🛡️ Chống Trùng Lặp 100%</text>

    <rect x="310" y="595" width="220" height="42" rx="8" fill="#3b82f6" fill-opacity="0.12" stroke="#3b82f6" stroke-width="1" />
    <text x="325" y="621" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#60a5fa">⏱️ Giãn Cách Ngẫu Nhiên +15s</text>

    <rect x="550" y="595" width="220" height="42" rx="8" fill="#f59e0b" fill-opacity="0.12" stroke="#f59e0b" stroke-width="1" />
    <text x="565" y="621" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#fbbf24">🎯 Hẹn Giờ Chuẩn Alarms</text>

    <rect x="70" y="660" width="700" height="65" rx="12" fill="url(#primary)" />
    <text x="250" y="700" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" fill="#ffffff">🚀 BẮT ĐẦU ĐĂNG TỰ ĐỘNG LÊN CÁC NHÓM FACEBOOK</text>

    <!-- Right Panel (Target Groups & Automation Schedule) -->
    <rect x="825" y="120" width="415" height="640" rx="18" fill="#0f172a" stroke="#1e293b" stroke-width="1.5" filter="url(#shadow)" />
    
    <text x="850" y="160" font-family="system-ui, sans-serif" font-size="17" font-weight="bold" fill="#ffffff">👥 Danh Sách Nhóm Mục Tiêu</text>
    <text x="850" y="182" font-family="system-ui, sans-serif" font-size="12" fill="#64748b">Đã quét 42 nhóm Facebook đang tham gia</text>

    <!-- Group 1 -->
    <rect x="850" y="205" width="365" height="60" rx="10" fill="#1e293b" stroke="#10b981" stroke-width="1" />
    <text x="870" y="230" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#ffffff">Tuyển Dụng Việc Làm Hà Nội 24h</text>
    <text x="870" y="250" font-family="system-ui, sans-serif" font-size="11" fill="#34d399">● 185.000 thành viên • Đã sẵn sàng</text>

    <!-- Group 2 -->
    <rect x="850" y="275" width="365" height="60" rx="10" fill="#1e293b" stroke="#10b981" stroke-width="1" />
    <text x="870" y="300" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#ffffff">Tìm Việc Làm &amp; Nhân Sự Văn Phòng</text>
    <text x="870" y="320" font-family="system-ui, sans-serif" font-size="11" fill="#34d399">● 92.400 thành viên • Đã sẵn sàng</text>

    <!-- Group 3 -->
    <rect x="850" y="345" width="365" height="60" rx="10" fill="#1e293b" stroke="#334155" stroke-width="1" />
    <text x="870" y="370" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#ffffff">Cộng Đồng Kế Toán &amp; Hành Chính Nhân Sự</text>
    <text x="870" y="390" font-family="system-ui, sans-serif" font-size="11" fill="#38bdf8">● 140.000 thành viên • Đang chờ lượt</text>

    <!-- Group 4 -->
    <rect x="850" y="415" width="365" height="60" rx="10" fill="#1e293b" stroke="#334155" stroke-width="1" />
    <text x="870" y="440" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#ffffff">Hội Việc Làm Sinh Viên Mới Ra Trường</text>
    <text x="870" y="460" font-family="system-ui, sans-serif" font-size="11" fill="#38bdf8">● 76.500 thành viên • Đang chờ lượt</text>

    <!-- Group 5 -->
    <rect x="850" y="485" width="365" height="60" rx="10" fill="#1e293b" stroke="#334155" stroke-width="1" />
    <text x="870" y="510" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#ffffff">Gia Long Tuyển Dụng &amp; Đào Tạo Nhân Tài</text>
    <text x="870" y="530" font-family="system-ui, sans-serif" font-size="11" fill="#38bdf8">● Nhóm nội bộ ưu tiên</text>

    <!-- Schedule Box -->
    <rect x="850" y="565" width="365" height="160" rx="12" fill="#1e293b" stroke="#f59e0b" stroke-width="1" />
    <text x="870" y="595" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#fbbf24">⏰ Khung Giờ Đăng Tự Động Hàng Ngày:</text>
    
    <rect x="870" y="615" width="70" height="30" rx="6" fill="#0f172a" stroke="#334155" stroke-width="1" />
    <text x="883" y="635" font-family="monospace" font-size="12" fill="#34d399">08:30</text>

    <rect x="955" y="615" width="70" height="30" rx="6" fill="#0f172a" stroke="#334155" stroke-width="1" />
    <text x="968" y="635" font-family="monospace" font-size="12" fill="#34d399">11:30</text>

    <rect x="1040" y="615" width="70" height="30" rx="6" fill="#0f172a" stroke="#334155" stroke-width="1" />
    <text x="1053" y="635" font-family="monospace" font-size="12" fill="#34d399">17:30</text>

    <rect x="1125" y="615" width="70" height="30" rx="6" fill="#0f172a" stroke="#334155" stroke-width="1" />
    <text x="1138" y="635" font-family="monospace" font-size="12" fill="#34d399">20:00</text>

    <text x="870" y="680" font-family="system-ui, sans-serif" font-size="12" fill="#94a3b8">Chế độ Service Worker Alarms chạy nền chính xác ngay cả khi tắt tab!</text>
  </svg>
  `;

  // Screenshot 2: Cổng Quản Lý Bản Quyền VIP, Cấp Phép & Kích Hoạt 1-Click
  const svg2 = `
  <svg width="1280" height="800" viewBox="0 0 1280 800" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#090d16" />
        <stop offset="50%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#111827" />
      </linearGradient>
      <linearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#2563eb" />
        <stop offset="100%" stop-color="#06b6d4" />
      </linearGradient>
      <filter id="shadow2" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.5"/>
      </filter>
    </defs>

    <!-- Background -->
    <rect width="1280" height="800" fill="url(#bg2)" />

    <!-- Top Navigation Header -->
    <rect x="40" y="30" width="1200" height="70" rx="16" fill="#1e293b" fill-opacity="0.7" stroke="#334155" stroke-width="1.5" filter="url(#shadow2)" />
    
    <circle cx="80" cy="65" r="22" fill="#3b82f6" />
    <path d="M78 54 L69 66 L78 66 L76 76 L87 64 L78 64 Z" fill="#ffffff" />
    
    <text x="115" y="62" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" fill="#ffffff">GIA LONG - FB • HỆ THỐNG QUẢN LÝ BẢN QUYỀN VIP</text>
    <text x="115" y="80" font-family="system-ui, sans-serif" font-size="12" fill="#94a3b8">Bảo mật mã hóa đa tầng • Kích hoạt 1-Click tự động sang Microsoft Edge</text>

    <!-- Stats Row -->
    <rect x="40" y="120" width="280" height="90" rx="14" fill="#0f172a" stroke="#10b981" stroke-width="1.5" />
    <text x="65" y="152" font-family="system-ui, sans-serif" font-size="12" fill="#94a3b8">Bản Quyền Đang Hoạt Động</text>
    <text x="65" y="185" font-family="system-ui, sans-serif" font-size="26" font-weight="bold" fill="#34d399">128 Máy Kích Hoạt</text>

    <rect x="345" y="120" width="280" height="90" rx="14" fill="#0f172a" stroke="#3b82f6" stroke-width="1.5" />
    <text x="370" y="152" font-family="system-ui, sans-serif" font-size="12" fill="#94a3b8">Doanh Thu &amp; Gia Hạn</text>
    <text x="370" y="185" font-family="system-ui, sans-serif" font-size="26" font-weight="bold" fill="#60a5fa">98.500.000đ</text>

    <rect x="650" y="120" width="280" height="90" rx="14" fill="#0f172a" stroke="#f59e0b" stroke-width="1.5" />
    <text x="675" y="152" font-family="system-ui, sans-serif" font-size="12" fill="#94a3b8">Gói Dùng Thử Đã Duyệt</text>
    <text x="675" y="185" font-family="system-ui, sans-serif" font-size="26" font-weight="bold" fill="#fbbf24">342 Khách Dùng Thử</text>

    <rect x="955" y="120" width="285" height="90" rx="14" fill="#0f172a" stroke="#8b5cf6" stroke-width="1.5" />
    <text x="980" y="152" font-family="system-ui, sans-serif" font-size="12" fill="#94a3b8">Bảo Vệ &amp; Chống Bẻ Khóa</text>
    <text x="980" y="185" font-family="system-ui, sans-serif" font-size="26" font-weight="bold" fill="#c084fc">An Toàn 100%</text>

    <!-- Main Table Card -->
    <rect x="40" y="235" width="1200" height="525" rx="18" fill="#0f172a" stroke="#1e293b" stroke-width="1.5" filter="url(#shadow2)" />
    
    <text x="70" y="275" font-family="system-ui, sans-serif" font-size="18" font-weight="bold" fill="#ffffff">📋 Danh Sách Mã Bản Quyền Doanh Nghiệp &amp; Cá Nhân</text>
    <text x="70" y="297" font-family="system-ui, sans-serif" font-size="12" fill="#64748b">Quản lý thời hạn, khóa máy, gia hạn và gửi link kích hoạt 1-Click cho khách hàng</text>

    <!-- Table Header -->
    <rect x="70" y="315" width="1140" height="42" rx="8" fill="#1e293b" />
    <text x="90" y="342" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#94a3b8">MÃ KEY BẢN QUYỀN</text>
    <text x="320" y="342" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#94a3b8">KHÁCH HÀNG / DOANH NGHIỆP</text>
    <text x="600" y="342" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#94a3b8">GÓI CƯỚC</text>
    <text x="740" y="342" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#94a3b8">HẠN DÙNG (NGÀY CÒN)</text>
    <text x="930" y="342" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#94a3b8">TRẠNG THÁI</text>
    <text x="1090" y="342" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#94a3b8">THAO TÁC</text>

    <!-- Row 1 -->
    <rect x="70" y="365" width="1140" height="55" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="1" />
    <text x="90" y="398" font-family="monospace" font-size="13" font-weight="bold" fill="#38bdf8">GLFB-VIP-HOAPHUONG-2026</text>
    <text x="320" y="398" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#ffffff">Cty CP Hoa Phượng ME (Phòng HCNS)</text>
    <text x="600" y="398" font-family="system-ui, sans-serif" font-size="12" fill="#fbbf24">Gói 12 Tháng (390N)</text>
    <text x="740" y="398" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#34d399">Còn 364 ngày</text>
    <rect x="930" y="378" width="95" height="28" rx="6" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1" />
    <text x="942" y="397" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" fill="#34d399">● HOẠT ĐỘNG</text>
    <rect x="1080" y="378" width="110" height="28" rx="6" fill="#3b82f6" />
    <text x="1092" y="397" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" fill="#ffffff">⚡ Link 1-Click</text>

    <!-- Row 2 -->
    <rect x="70" y="428" width="1140" height="55" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="1" />
    <text x="90" y="461" font-family="monospace" font-size="13" font-weight="bold" fill="#38bdf8">GLFB-VIP-TUANRECRUITER</text>
    <text x="320" y="461" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#ffffff">Anh Tuấn (Trưởng Phòng Tuyển Dụng)</text>
    <text x="600" y="461" font-family="system-ui, sans-serif" font-size="12" fill="#60a5fa">Gói 6 Tháng (195N)</text>
    <text x="740" y="461" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#34d399">Còn 182 ngày</text>
    <rect x="930" y="441" width="95" height="28" rx="6" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1" />
    <text x="942" y="460" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" fill="#34d399">● HOẠT ĐỘNG</text>
    <rect x="1080" y="441" width="110" height="28" rx="6" fill="#3b82f6" />
    <text x="1092" y="460" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" fill="#ffffff">⚡ Link 1-Click</text>

    <!-- Row 3 -->
    <rect x="70" y="491" width="1140" height="55" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="1" />
    <text x="90" y="524" font-family="monospace" font-size="13" font-weight="bold" fill="#38bdf8">GLFB-VIP-LANANH-HR</text>
    <text x="320" y="524" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#ffffff">Chị Lan Anh (Tuyển Dụng BĐS)</text>
    <text x="600" y="524" font-family="system-ui, sans-serif" font-size="12" fill="#60a5fa">Gói 3 Tháng (100N)</text>
    <text x="740" y="524" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#34d399">Còn 94 ngày</text>
    <rect x="930" y="504" width="95" height="28" rx="6" fill="#10b981" fill-opacity="0.15" stroke="#10b981" stroke-width="1" />
    <text x="942" y="523" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" fill="#34d399">● HOẠT ĐỘNG</text>
    <rect x="1080" y="504" width="110" height="28" rx="6" fill="#3b82f6" />
    <text x="1092" y="523" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" fill="#ffffff">⚡ Link 1-Click</text>

    <!-- Row 4 (Trial) -->
    <rect x="70" y="554" width="1140" height="55" rx="8" fill="#0f172a" stroke="#1e293b" stroke-width="1" />
    <text x="90" y="587" font-family="monospace" font-size="13" font-weight="bold" fill="#a855f7">GLFB-TRIAL-CLIENT-8892</text>
    <text x="320" y="587" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#ffffff">Khách Trải Nghiệm Mới</text>
    <text x="600" y="587" font-family="system-ui, sans-serif" font-size="12" fill="#a855f7">Gói Dùng Thử 1 Ngày</text>
    <text x="740" y="587" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#fbbf24">Còn 23 giờ</text>
    <rect x="930" y="567" width="95" height="28" rx="6" fill="#a855f7" fill-opacity="0.15" stroke="#a855f7" stroke-width="1" />
    <text x="942" y="586" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" fill="#c084fc">● DÙNG THỬ</text>
    <rect x="1080" y="567" width="110" height="28" rx="6" fill="#10b981" />
    <text x="1092" y="586" font-family="system-ui, sans-serif" font-size="11" font-weight="bold" fill="#ffffff">Nâng Cấp VIP</text>

    <!-- Bottom Action Ribbon -->
    <rect x="70" y="635" width="1140" height="95" rx="12" fill="#1e293b" stroke="#334155" stroke-width="1" />
    <text x="100" y="670" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="#ffffff">⚡ Tính Năng Bàn Giao Tự Động Cho Khách Hàng:</text>
    <text x="100" y="695" font-family="system-ui, sans-serif" font-size="12" fill="#94a3b8">Chỉ cần gửi đường link kích hoạt 1-Click: khách mở link trên trình duyệt là tiện ích tự nhận diện và kích hoạt ngay lập tức mà không cần gõ mã rườm rà!</text>
  </svg>
  `;

  const dest1 = path.join(publicDir, 'store_screenshot_1280x800_1.png');
  const dest2 = path.join(publicDir, 'store_screenshot_1280x800_2.png');

  await sharp(Buffer.from(svg1))
    .png({ quality: 100 })
    .toFile(dest1);
  console.log('✓ Đã tạo Screenshot 1 chuẩn Microsoft Edge Store:', dest1);

  await sharp(Buffer.from(svg2))
    .png({ quality: 100 })
    .toFile(dest2);
  console.log('✓ Đã tạo Screenshot 2 chuẩn Microsoft Edge Store:', dest2);
}

generateStoreScreenshots().catch((err) => {
  console.error('Lỗi tạo screenshots:', err);
});
